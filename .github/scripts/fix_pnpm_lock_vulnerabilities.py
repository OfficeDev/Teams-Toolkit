#!/usr/bin/env python3
"""
Scan every tracked ``pnpm-lock.yaml`` for known vulnerabilities and apply
*compatible-range* security bumps in place.

This is the pnpm counterpart to ``check_npm_vulnerabilities.py`` /
``open_vuln_fix_pr.py``. Unlike the template npm/NuGet flow (one PR per vuln),
the pnpm flow maintains a single rolling PR, so this module only mutates the
lockfiles in the current working tree and writes a JSON manifest describing what
was fixed / skipped. Publishing the rolling PR is handled by
``open_pnpm_lock_fix_pr.py``.

Detection uses ``pnpm audit --json``. Fixing uses
``pnpm update <pkg> --depth Infinity --lockfile-only --no-save`` which only moves
a dependency to the newest version still allowed by the existing semver ranges —
pnpm itself enforces "compatible range only", so a bump that would require a
major upgrade or a forced ``override`` simply leaves the advisory in place and is
reported under ``skipped_no_fix``. Every applied bump is re-audited before it is
kept; anything that cannot be verified is reverted and never pushed.

Lockfile classes:
  * workspace-root -- the repo-root ``pnpm-lock.yaml`` (has ``importers:``).
    Operated on at the repo root in normal workspace mode.
  * standalone -- a nested single-project lockfile whose ``workspace:*`` deps are
    recorded as ``link:../sibling``. Operated on in the package directory with
    ``--ignore-workspace``; the ``workspace:*`` package.json specifiers are
    temporarily rewritten to their ``link:`` targets so pnpm can resolve them
    without a workspace, and the ``specifier: workspace:*`` lines are restored in
    the regenerated lockfile before it is kept.

The manifest reuses the schema consumed by ``render_vuln_summary.py`` so the
existing step-summary / email rendering works unchanged.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SEVERITY_ORDER = {"info": 4, "low": 3, "moderate": 2, "high": 1, "critical": 0}
DEFAULT_FIX_SEVERITIES = ("moderate", "high", "critical")
ROLLING_BRANCH = "auto-fix-vuln/pnpm-lockfiles"


def safe_print(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        print(message.encode("ascii", "replace").decode("ascii"), flush=True)


# --------------------------------------------------------------------------- #
# pnpm process wrappers (kept tiny so tests can monkeypatch them)
# --------------------------------------------------------------------------- #


def _resolve_pnpm() -> str:
    found = shutil.which("pnpm")
    if found:
        return found
    if os.name == "nt":
        for ext in (".cmd", ".exe", ".bat"):
            alt = shutil.which("pnpm" + ext)
            if alt:
                return alt
    return "pnpm"


def run_pnpm(
    args: List[str], *, cwd: Path, timeout: int = 900
) -> subprocess.CompletedProcess:
    cmd = [_resolve_pnpm(), *args]
    safe_print(f"$ (cd {cwd}) pnpm {' '.join(args)}")
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def pnpm_audit(cwd: Path, *, standalone: bool, audit_level: str) -> dict:
    """Return the parsed ``pnpm audit --json`` document (``{}`` on hard failure)."""
    args = ["audit", "--json", "--audit-level", audit_level]
    if standalone:
        args.append("--ignore-workspace")
    proc = run_pnpm(args, cwd=cwd)
    # pnpm exits non-zero when advisories are found; that is expected. Only a
    # missing / unparseable body is a real failure.
    if not proc.stdout:
        raise RuntimeError(
            f"pnpm audit produced no output (exit {proc.returncode}): "
            f"{(proc.stderr or '').strip()[:400]}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"pnpm audit returned invalid JSON: {exc}") from exc


def pnpm_update(
    cwd: Path, packages: List[str], *, standalone: bool
) -> Tuple[bool, str]:
    args = ["update", *packages, "--depth", "Infinity", "--lockfile-only", "--no-save"]
    if standalone:
        args.append("--ignore-workspace")
    proc = run_pnpm(args, cwd=cwd)
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or "").strip()[:500]
    return True, ""


# --------------------------------------------------------------------------- #
# audit parsing
# --------------------------------------------------------------------------- #


def parse_advisories(audit_doc: dict, fix_severities: Tuple[str, ...]) -> List[dict]:
    """Normalize ``pnpm audit --json`` advisories to a flat, filtered list.

    pnpm 8 mirrors the npm v6 audit schema: ``{"advisories": {id: {...}}}`` with
    ``module_name`` / ``severity`` / ``url`` / ``title`` / ``patched_versions`` /
    ``findings: [{version, paths}]``.
    """
    wanted = {s.lower() for s in fix_severities}
    out: List[dict] = []
    advisories = audit_doc.get("advisories") or {}
    for adv_id, adv in advisories.items():
        severity = (adv.get("severity") or "").lower()
        if severity not in wanted:
            continue
        module = adv.get("module_name")
        if not module:
            continue
        findings = adv.get("findings") or []
        current_versions = sorted(
            {f.get("version") for f in findings if f.get("version")}
        )
        out.append(
            {
                "id": str(adv_id),
                "package": module,
                "severity": severity,
                "title": adv.get("title"),
                "advisory_url": adv.get("url"),
                "patched_versions": adv.get("patched_versions"),
                "current_versions": current_versions,
            }
        )
    # Highest severity first, then package name, for stable, sensible ordering.
    out.sort(key=lambda a: (SEVERITY_ORDER.get(a["severity"], 99), a["package"]))
    return out


def advisory_ids(audit_doc: dict) -> set:
    return set((audit_doc.get("advisories") or {}).keys())


# --------------------------------------------------------------------------- #
# lockfile helpers
# --------------------------------------------------------------------------- #

WORKSPACE_SPEC_RE = re.compile(r"^workspace:")


def is_workspace_root_lock(lock_path: Path) -> bool:
    """A workspace-root lockfile lists ``importers:``; a standalone one lists
    top-level ``dependencies:`` / ``devDependencies:``."""
    try:
        with lock_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("importers:"):
                    return True
                if line.startswith(("dependencies:", "devDependencies:", "packages:")):
                    return False
    except OSError:
        pass
    return False


def package_versions(lock_text: str, package: str) -> List[str]:
    """All resolved versions of ``package`` recorded in a lockfile body."""
    pattern = re.compile(
        r"^\s*/" + re.escape(package) + r"@([^:\s()]+)", re.MULTILINE
    )
    return sorted(set(pattern.findall(lock_text)))


def collect_workspace_links(pkg_json: dict) -> Dict[str, str]:
    """Map dep name -> ``link:`` target for every ``workspace:*`` specifier.

    The target is not encoded in package.json, so callers resolve it from the
    lockfile; here we only detect which deps use the workspace protocol.
    """
    links: Dict[str, str] = {}
    for section in ("dependencies", "devDependencies", "optionalDependencies"):
        for name, spec in (pkg_json.get(section) or {}).items():
            if isinstance(spec, str) and WORKSPACE_SPEC_RE.match(spec):
                links[name] = spec
    return links


def lockfile_link_target(lock_text: str, package: str) -> Optional[str]:
    """Resolve ``version: link:../x`` for a workspace dep from the lockfile."""
    pattern = re.compile(
        r"'?" + re.escape(package) + r"'?:\s*\n"
        r"\s*specifier:\s*workspace:[^\n]*\n"
        r"\s*version:\s*(link:[^\n]+)"
    )
    m = pattern.search(lock_text)
    return m.group(1).strip() if m else None


# --------------------------------------------------------------------------- #
# standalone prep / restore (workspace:* <-> link:)
# --------------------------------------------------------------------------- #


class StandalonePrep:
    """Temporarily rewrite ``workspace:*`` package.json specifiers to ``link:``
    targets so pnpm can operate on a nested lockfile with ``--ignore-workspace``.

    Only used as a fallback when a plain update rejects the workspace protocol.
    """

    def __init__(self, pkg_dir: Path):
        self.pkg_dir = pkg_dir
        self.pkg_json_path = pkg_dir / "package.json"
        self._original_pkg_json: Optional[str] = None
        # dep name -> original specifier (e.g. "workspace:*")
        self.rewritten: Dict[str, str] = {}

    def apply(self, lock_text: str) -> bool:
        original = self.pkg_json_path.read_text(encoding="utf-8")
        data = json.loads(original)
        links = collect_workspace_links(data)
        if not links:
            return False
        changed = False
        for section in ("dependencies", "devDependencies", "optionalDependencies"):
            deps = data.get(section)
            if not isinstance(deps, dict):
                continue
            for name, spec in list(deps.items()):
                if name in links:
                    target = lockfile_link_target(lock_text, name)
                    if not target:
                        continue
                    deps[name] = target  # e.g. "link:../api"
                    self.rewritten[name] = spec
                    changed = True
        if not changed:
            return False
        self._original_pkg_json = original
        self.pkg_json_path.write_text(
            json.dumps(data, indent=2) + "\n", encoding="utf-8"
        )
        return True

    def restore_package_json(self) -> None:
        if self._original_pkg_json is not None:
            self.pkg_json_path.write_text(self._original_pkg_json, encoding="utf-8")
            self._original_pkg_json = None

    def restore_lock_specifiers(self, lock_text: str) -> str:
        """Put ``specifier: workspace:*`` back where we swapped in ``link:``."""
        for name, original_spec in self.rewritten.items():
            lock_text = re.sub(
                r"(('?" + re.escape(name) + r"'?:\s*\n\s*specifier:\s*)link:[^\n]+)",
                lambda m, spec=original_spec: m.group(2) + spec,
                lock_text,
            )
        return lock_text


# --------------------------------------------------------------------------- #
# per-lockfile processing
# --------------------------------------------------------------------------- #


def _rel(path: Path, repo_root: Path) -> str:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def process_lockfile(
    lock_path: Path,
    repo_root: Path,
    *,
    audit_level: str,
    fix_severities: Tuple[str, ...],
) -> dict:
    """Audit and best-effort fix a single lockfile.

    Returns a per-lockfile result dict with ``scan``, ``fixed`` and ``skipped``
    entries. Mutates ``lock_path`` on disk only for verified fixes.
    """
    rel = _rel(lock_path, repo_root)
    standalone = not is_workspace_root_lock(lock_path)
    work_dir = lock_path.parent
    result = {
        "lockfile": rel,
        "standalone": standalone,
        "fixed": [],
        "skipped": [],
        "vuln_count": 0,
        "error": None,
    }

    try:
        audit_doc = pnpm_audit(work_dir, standalone=standalone, audit_level=audit_level)
    except (RuntimeError, subprocess.SubprocessError, OSError) as exc:
        result["error"] = f"audit failed: {exc}"
        safe_print(f"[{rel}] {result['error']}")
        return result

    advisories = parse_advisories(audit_doc, fix_severities)
    result["vuln_count"] = len(advisories)
    if not advisories:
        safe_print(f"[{rel}] clean (>= {audit_level})")
        return result

    original_ids = advisory_ids(audit_doc)
    original_lock = lock_path.read_text(encoding="utf-8")

    # Deduplicate by package; a package may carry several advisories.
    packages: List[str] = []
    per_package: Dict[str, List[dict]] = {}
    for adv in advisories:
        per_package.setdefault(adv["package"], []).append(adv)
        if adv["package"] not in packages:
            packages.append(adv["package"])

    safe_print(f"[{rel}] {len(advisories)} advisory(ies) across {len(packages)} package(s)")

    prep: Optional[StandalonePrep] = None
    try:
        for package in packages:
            advs = per_package[package]
            before_lock = lock_path.read_text(encoding="utf-8")
            before_versions = package_versions(before_lock, package)

            ok, err = pnpm_update(work_dir, [package], standalone=standalone)
            if not ok and standalone and _looks_like_workspace_error(err):
                # Fall back to the link: rewrite and retry once.
                prep = prep or StandalonePrep(work_dir)
                if prep.apply(before_lock):
                    ok, err = pnpm_update(work_dir, [package], standalone=standalone)

            if not ok:
                _restore_lock(lock_path, before_lock)
                _record_skip(result, package, advs, f"pnpm update failed: {err}")
                continue

            # Re-audit to confirm this package's advisories are gone.
            try:
                after_doc = pnpm_audit(
                    work_dir, standalone=standalone, audit_level=audit_level
                )
            except (RuntimeError, subprocess.SubprocessError, OSError) as exc:
                _restore_lock(lock_path, before_lock)
                _record_skip(result, package, advs, f"re-audit failed: {exc}")
                continue

            after_ids = advisory_ids(after_doc)
            unresolved = {a["id"] for a in advs} & after_ids
            introduced = after_ids - original_ids
            if unresolved or introduced:
                _restore_lock(lock_path, before_lock)
                reason = (
                    "no compatible fix (needs major upgrade or override)"
                    if unresolved
                    else "fix introduced new advisories"
                )
                _record_skip(result, package, advs, reason)
                continue

            after_versions = package_versions(
                lock_path.read_text(encoding="utf-8"), package
            )
            for adv in advs:
                result["fixed"].append(
                    {
                        "package": package,
                        "severity": adv["severity"],
                        "current_version": ", ".join(before_versions) or None,
                        "fixed_version": ", ".join(after_versions) or None,
                        "advisory_url": adv["advisory_url"],
                        "title": adv["title"],
                    }
                )
            safe_print(
                f"[{rel}] fixed {package}: "
                f"{before_versions} -> {after_versions}"
            )
    finally:
        if prep is not None:
            prep.restore_package_json()

    # Restore workspace specifiers in the (possibly rewritten) lockfile.
    if prep is not None and result["fixed"]:
        text = lock_path.read_text(encoding="utf-8")
        lock_path.write_text(prep.restore_lock_specifiers(text), encoding="utf-8")

    if not result["fixed"] and lock_path.read_text(encoding="utf-8") != original_lock:
        # Safety net: never leave partial churn if nothing was actually fixed.
        _restore_lock(lock_path, original_lock)

    return result


def _looks_like_workspace_error(err: str) -> bool:
    lowered = (err or "").lower()
    return "workspace" in lowered and (
        "not found" in lowered or "workspace_pkg_not_found" in lowered
    )


def _restore_lock(lock_path: Path, text: str) -> None:
    lock_path.write_text(text, encoding="utf-8")


def _record_skip(result: dict, package: str, advs: List[dict], reason: str) -> None:
    for adv in advs:
        result["skipped"].append(
            {
                "package": package,
                "severity": adv["severity"],
                "advisory_url": adv["advisory_url"],
                "title": adv["title"],
                "reason": reason,
            }
        )
    safe_print(f"  skip {package}: {reason}")


# --------------------------------------------------------------------------- #
# discovery + manifest
# --------------------------------------------------------------------------- #


def discover_lockfiles(repo_root: Path) -> List[Path]:
    proc = subprocess.run(
        ["git", "ls-files", "*pnpm-lock.yaml"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git ls-files failed: {proc.stderr.strip()}")
    files = [
        repo_root / line.strip()
        for line in proc.stdout.splitlines()
        if line.strip()
    ]
    return sorted(files, key=lambda p: p.as_posix())


def build_manifest(results: List[dict], *, branch: str) -> dict:
    """Assemble the shared-schema manifest consumed by render_vuln_summary.py."""
    scans = []
    new_prs = []
    skipped_no_fix = []
    changed_lockfiles = []

    for res in results:
        scans.append(
            {
                "scan_target": res["lockfile"],
                "ecosystem": "pnpm",
                "vuln_count": res.get("vuln_count", 0),
            }
        )
        if res.get("error"):
            skipped_no_fix.append(
                {
                    "package": "(lockfile)",
                    "severity": "",
                    "reason": res["error"],
                    "branch": branch,
                    "scan_target": res["lockfile"],
                }
            )
        if res.get("fixed"):
            changed_lockfiles.append(res["lockfile"])
        for fix in res.get("fixed", []):
            new_prs.append(
                {
                    "scan_target": res["lockfile"],
                    "file": res["lockfile"],
                    "package": fix["package"],
                    "current_version": fix.get("current_version"),
                    "fixed_version": fix.get("fixed_version"),
                    "severity": fix.get("severity"),
                    "advisory_url": fix.get("advisory_url"),
                    "title": fix.get("title"),
                    "branch": branch,
                    "strategy": "pnpm compatible bump",
                    "pr_url": "",
                }
            )
        for skip in res.get("skipped", []):
            skipped_no_fix.append(
                {
                    "scan_target": res["lockfile"],
                    "package": skip["package"],
                    "severity": skip.get("severity"),
                    "advisory_url": skip.get("advisory_url"),
                    "title": skip.get("title"),
                    "reason": skip.get("reason"),
                    "branch": branch,
                }
            )

    return {
        "ecosystem": "pnpm",
        "max_prs": 1,
        "branch": branch,
        "scans": scans,
        "new_prs": new_prs,
        "skipped_existing": [],
        "skipped_no_fix": skipped_no_fix,
        "skipped_over_limit": [],
        "has_changes": bool(changed_lockfiles),
        "changed_lockfiles": changed_lockfiles,
    }


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fix pnpm lockfile vulnerabilities (compatible-range bumps)"
    )
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--audit-level", default="moderate",
                        choices=["low", "moderate", "high", "critical"])
    parser.add_argument("--manifest-out", default=None,
                        help="Write the outcome manifest JSON to this path.")
    parser.add_argument("--branch", default=ROLLING_BRANCH)
    parser.add_argument("--only", action="append", default=[],
                        help="Limit to lockfiles whose posix path contains this "
                             "substring (repeatable). Mainly for testing.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Discover and classify lockfiles but do not run pnpm.")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    fix_severities = DEFAULT_FIX_SEVERITIES

    lockfiles = discover_lockfiles(repo_root)
    if args.only:
        lockfiles = [
            p for p in lockfiles
            if any(sub in _rel(p, repo_root) for sub in args.only)
        ]
    safe_print(f"Discovered {len(lockfiles)} tracked lockfile(s).")

    results: List[dict] = []
    for lock_path in lockfiles:
        rel = _rel(lock_path, repo_root)
        if args.dry_run:
            standalone = not is_workspace_root_lock(lock_path)
            safe_print(f"[dry-run] {rel} ({'standalone' if standalone else 'workspace-root'})")
            results.append({"lockfile": rel, "standalone": standalone,
                            "fixed": [], "skipped": [], "vuln_count": 0, "error": None})
            continue
        results.append(
            process_lockfile(
                lock_path, repo_root,
                audit_level=args.audit_level,
                fix_severities=fix_severities,
            )
        )

    manifest = build_manifest(results, branch=args.branch)

    total_fixed = len(manifest["new_prs"])
    total_skipped = len(manifest["skipped_no_fix"])
    safe_print(
        f"Summary: fixed={total_fixed} skipped={total_skipped} "
        f"changed_lockfiles={len(manifest['changed_lockfiles'])}"
    )

    if args.manifest_out:
        out = Path(args.manifest_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        safe_print(f"Wrote manifest to {out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
