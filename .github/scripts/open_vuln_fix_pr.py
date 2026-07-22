#!/usr/bin/env python3
"""
Maintain a single rolling fix PR for vulnerabilities surfaced by the scan
pipeline.

Reads JSON summaries produced by check_npm_vulnerabilities.py and
check_nuget_vulnerabilities.py, groups every finding by (ecosystem, manifest
file), and attempts a mechanically verified dependency bump per manifest.

Every verified fix from a single scan lands on ONE stable rolling branch
(`auto-fix-vuln/rolling`):

  * If an OPEN PR already targets that branch, the branch is rebased onto the
    latest base branch, the new fixes are appended, and the existing PR body is
    refreshed. No duplicate PR is opened.
  * If no OPEN PR exists, a fresh branch is cut from the base branch and a new
    PR is opened (only when there is a diff to propose).

A closed or merged PR never suppresses a new PR: the open-PR lookup queries
`--state open` only, so history cannot hide a still-vulnerable template.

Fix verification is cumulative per manifest: a candidate is accepted only when
`npm audit` / `dotnet list --vulnerable` shows the targeted advisory removed AND
no new advisory introduced. A single parent-dependency bump therefore records
every advisory it clears.

Operational failures (npm/dotnet unavailable, install/restore timeout, malformed
audit output, merge conflict, push/PR API failure) are surfaced as errors and
make the run exit nonzero. Candidate-specific dependency-resolution failures are
NOT operational errors -- they simply reject that candidate.

Flags:
  --scan-json P       Path to a scan summary JSON (repeatable, order matters).
  --base-branch B     Base branch the rolling PR targets (default: dev).
  --rolling-branch R  Stable rolling branch name (default: auto-fix-vuln/rolling).
  --repo-root D       Repository checkout root (default: .).
  --skip-scan-target T  scan_target values to ignore (repeatable).
  --manifest-out P    Write a structured JSON manifest of the outcome.
  --dry-run           Evaluate candidates in memory only; never touch Git,
                      GitHub, or source files.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import shutil

# Import the PR-body renderer eagerly (at module load) rather than lazily inside
# _render_pr_body(). run_pipeline() checks out the base branch mid-run
# (prepare_rolling_branch -> `git checkout -B <rolling> origin/<base>`), which
# overwrites render_vuln_summary.py in the working tree with the base-branch
# copy. A lazy import performed after that checkout would re-read the (possibly
# older) base-branch file and fail with ImportError if render_pr_body was added
# on the feature branch but not yet merged to base. Importing here caches the
# feature-branch module in sys.modules before the working tree is reset.
from render_vuln_summary import render_pr_body


ROLLING_BRANCH = "auto-fix-vuln/rolling"

# Make sibling scripts (render_vuln_summary) importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parent))


def safe_print(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        print(message.encode("ascii", "replace").decode("ascii"), flush=True)


def run(cmd, *, cwd=None, check=True, capture=False, env=None) -> subprocess.CompletedProcess:
    safe_print(f"$ {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        capture_output=capture,
        env=env,
    )
    if check and result.returncode != 0:
        if capture:
            safe_print(result.stdout)
            safe_print(result.stderr)
        raise SystemExit(f"Command failed: {' '.join(cmd)} (exit {result.returncode})")
    return result


def load_scan(path: Path) -> Optional[dict]:
    if not path.exists():
        safe_print(f"Scan JSON not found, skipping: {path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        safe_print(f"WARNING: Failed to parse {path}: {e}")
        return None


def iter_all_vulns(scan_jsons, skip_targets=None):
    """Yield (ecosystem, finding) tuples in scan-order, then finding-order.

    Skip scans whose `scan_target` is in `skip_targets`.
    """
    skip_targets = set(skip_targets or [])
    for path in scan_jsons:
        scan = load_scan(Path(path))
        if not scan:
            continue
        if (scan.get("scan_target") or "") in skip_targets:
            safe_print(
                f"Skipping scan {path} (scan_target={scan.get('scan_target')!r} excluded)"
            )
            continue
        if not scan.get("has_vulnerabilities"):
            continue
        ecosystem = scan.get("ecosystem") or "unknown"
        for vuln in scan.get("vulnerabilities") or []:
            yield ecosystem, vuln


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "")
    return value.strip("-") or "unknown"


def finding_key(finding: dict) -> tuple:
    """Stable identity of an advisory: (package, advisory identity)."""
    return (
        finding.get("package") or "",
        finding.get("advisory_id") or finding.get("advisory_url") or "",
    )


def group_findings(rows):
    """Group (ecosystem, finding) rows by (ecosystem, file), preserving order."""
    groups = OrderedDict()
    for ecosystem, finding in rows:
        key = (ecosystem, finding.get("file") or "")
        groups.setdefault(key, []).append(finding)
    return groups


@dataclass
class FileFixResult:
    content: str
    fixed: List[dict] = field(default_factory=list)
    already_fixed: List[dict] = field(default_factory=list)
    no_fix: List[dict] = field(default_factory=list)
    errors: List[dict] = field(default_factory=list)


def resolve_repo_file(repo_root, file_name) -> Optional[Path]:
    """Resolve a scan-relative file inside repo_root, rejecting escapes."""
    if not file_name:
        return None
    root = Path(repo_root).resolve()
    candidate = (root / file_name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


# --------------------------------------------------------------------------- #
# npm helpers: render template, audit, bump candidates
# --------------------------------------------------------------------------- #


MUSTACHE_RE = re.compile(r"\{\{[^}]+\}\}")


def _resolve_executable(name: str) -> str:
    """Return a runnable path for `name`, handling Windows `.cmd`/`.exe`."""
    found = shutil.which(name)
    if found:
        return found
    if os.name == "nt":
        for ext in (".cmd", ".exe", ".bat"):
            alt = shutil.which(name + ext)
            if alt:
                return alt
    return name


def render_manifest_for_install(text: str) -> str:
    """Replace mustache placeholders so a .tpl is consumable by tooling."""

    def _sub(match: re.Match) -> str:
        inner = match.group(0).strip("{}").strip()
        return "placeholder-" + slugify(inner).lower()

    return MUSTACHE_RE.sub(_sub, text)


def _npm_install_lock_only(work_dir: Path) -> Tuple[bool, str]:
    proc = subprocess.run(
        [
            _resolve_executable("npm"),
            "install",
            "--package-lock-only",
            "--no-audit",
            "--ignore-scripts",
        ],
        cwd=work_dir,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or "")[:500]
    return True, ""


def audit_npm_manifest(manifest_text: str) -> Tuple[set, str, bool]:
    """Render, install (lock-only), and audit a package.json in a temp dir.

    Returns (advisory_keys, reason, operational_error) where advisory_keys is a
    set of (package, advisory identity) tuples matching finding_key().

    * A dependency-resolution failure on this candidate is a rejected candidate
      (reason set, operational_error=False).
    * A missing executable, timeout, or malformed audit output is an
      operational error (operational_error=True).
    """
    rendered = render_manifest_for_install(manifest_text)
    with tempfile.TemporaryDirectory(prefix="vuln_audit_") as tmp:
        work = Path(tmp)
        (work / "package.json").write_text(rendered, encoding="utf-8")
        try:
            install = subprocess.run(
                [
                    _resolve_executable("npm"),
                    "install",
                    "--package-lock-only",
                    "--no-audit",
                    "--ignore-scripts",
                ],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            return set(), "npm install timed out", True
        except OSError as exc:
            return set(), f"npm is not available: {exc}", True
        if install.returncode != 0:
            reason = (install.stderr or install.stdout or "npm install failed").strip()
            return set(), reason[:500], False
        try:
            audit = subprocess.run(
                [_resolve_executable("npm"), "audit", "--json"],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            return set(), "npm audit timed out", True
        except OSError as exc:
            return set(), f"npm is not available: {exc}", True
        if not audit.stdout:
            return set(), "npm audit produced no output", True
        try:
            data = json.loads(audit.stdout)
        except json.JSONDecodeError:
            return set(), "npm audit produced malformed JSON", True

        keys = set()
        for package, info in (data.get("vulnerabilities") or {}).items():
            advisories = [e for e in (info.get("via") or []) if isinstance(e, dict)]
            if not advisories:
                keys.add((package, ""))
            for advisory in advisories:
                source = advisory.get("source")
                ident = str(source) if source is not None else (advisory.get("url") or "")
                keys.add((package, ident))
        return keys, "", False


def find_top_level_parent(manifest_text: str, package_name: str) -> Optional[str]:
    """Use `npm ls` against the rendered manifest to find the direct dep that
    pulls in `package_name`. Returns the top-level dep name or None."""
    rendered = render_manifest_for_install(manifest_text)
    with tempfile.TemporaryDirectory(prefix="vuln_parent_") as tmp:
        work = Path(tmp)
        (work / "package.json").write_text(rendered, encoding="utf-8")
        ok, _ = _npm_install_lock_only(work)
        if not ok:
            return None
        proc = subprocess.run(
            [
                _resolve_executable("npm"),
                "ls",
                package_name,
                "--all",
                "--json",
                "--package-lock-only",
            ],
            cwd=work,
            capture_output=True,
            text=True,
            timeout=180,
        )
        try:
            data = json.loads(proc.stdout) if proc.stdout else {}
        except json.JSONDecodeError:
            return None

        def walk(node: dict, parent_chain):
            deps = node.get("dependencies") or {}
            for name, child in deps.items():
                chain = parent_chain + [name]
                if name == package_name:
                    return chain[0]
                found = walk(child, chain)
                if found:
                    return found
            return None

        return walk(data, [])


def _replace_direct_dep_version(text: str, package: str, fixed_version: str) -> Tuple[str, int]:
    """Replace `"package": "X"` preserving any leading caret/tilde."""
    pattern = re.compile(
        r'("' + re.escape(package) + r'"\s*:\s*")([~^]?)([^"\s]+)(")'
    )
    return pattern.subn(rf'\g<1>\g<2>{fixed_version}\g<4>', text)


def _latest_npm_version(package: str) -> Optional[str]:
    proc = subprocess.run(
        [_resolve_executable("npm"), "view", package, "version"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        return None
    out = (proc.stdout or "").strip()
    return out or None


def _inject_overrides(text: str, package: str, fixed_version: str) -> Optional[str]:
    """Add or update an `overrides` block in package.json text."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    overrides = data.get("overrides")
    if not isinstance(overrides, dict):
        overrides = {}
    overrides[package] = fixed_version
    data["overrides"] = overrides
    return json.dumps(data, indent=2) + "\n"


def iter_npm_candidates(content: str, finding: dict):
    """Yield (candidate_text, strategy) pairs to try for one finding.

    Order: direct dependency bump, top-level parent bump, then an `overrides`
    pin as a last resort only when no targeted (direct/parent) bump applies.
    """
    package = finding.get("package") or ""
    fixed_version = finding.get("fixed_version")
    yielded_targeted = False

    if fixed_version:
        direct, count = _replace_direct_dep_version(content, package, fixed_version)
        if count:
            yielded_targeted = True
            yield direct, f"direct dependency bump to {fixed_version}"

    parent = find_top_level_parent(content, package)
    if parent and parent != package:
        latest = _latest_npm_version(parent)
        if latest:
            parent_candidate, count = _replace_direct_dep_version(content, parent, latest)
            if count:
                yielded_targeted = True
                yield parent_candidate, f"parent {parent} bump to {latest}"

    if fixed_version and not yielded_targeted:
        override = _inject_overrides(content, package, fixed_version)
        if override is not None:
            yield override, f"override {package} to {fixed_version}"


def apply_npm_fixes(path: Path, findings: List[dict]) -> FileFixResult:
    """Cumulatively verify fixes for every npm finding in one manifest."""
    original = path.read_text(encoding="utf-8")
    current = original
    before, reason, operational_error = audit_npm_manifest(current)
    if operational_error or reason:
        return FileFixResult(
            content=original,
            errors=[{"file": str(path), "reason": reason or "npm audit failed"}],
        )

    requested = {finding_key(item): item for item in findings}
    already_fixed = [item for key, item in requested.items() if key not in before]
    unresolved = [item for key, item in requested.items() if key in before]
    fixed: List[dict] = []
    no_fix: List[dict] = []

    for finding in unresolved:
        target = finding_key(finding)
        if target not in before:
            continue
        accepted = False
        last_reason = "no candidate version"
        for candidate, strategy in iter_npm_candidates(current, finding):
            after, reason, operational_error = audit_npm_manifest(candidate)
            if operational_error:
                return FileFixResult(
                    content=original,
                    errors=[{"file": str(path), "reason": reason or "npm audit failed"}],
                )
            if reason:
                last_reason = reason
                continue
            if target in after:
                last_reason = "candidate did not remove the vulnerability"
                continue
            if after - before:
                last_reason = "candidate introduced a new vulnerability"
                continue

            removed = before - after
            current = candidate
            before = after
            accepted = True
            for key in removed:
                matched = requested.get(key)
                if matched and matched not in fixed:
                    fixed.append({**matched, "strategy": strategy})
            break

        if not accepted:
            no_fix.append({**finding, "reason": last_reason})

    return FileFixResult(
        content=current,
        fixed=fixed,
        already_fixed=already_fixed,
        no_fix=no_fix,
    )


# --------------------------------------------------------------------------- #
# NuGet helpers: audit, direct-only candidate, cumulative verify
# --------------------------------------------------------------------------- #


def _csproj_has_direct_reference(text: str, package: str) -> bool:
    return re.search(
        r'<PackageReference\s+[^>]*Include="' + re.escape(package) + r'"',
        text,
        re.IGNORECASE,
    ) is not None


def _read_csproj_package_version(text: str, package: str) -> Optional[str]:
    attr = re.search(
        r'<PackageReference\s+[^>]*Include="' + re.escape(package) + r'"[^>]*Version="([^"]+)"',
        text,
        re.IGNORECASE,
    )
    if attr:
        return attr.group(1)
    nested = re.search(
        r'<PackageReference\s+[^>]*Include="' + re.escape(package) + r'"[^>]*>\s*<Version>([^<]+)</Version>',
        text,
        re.IGNORECASE,
    )
    if nested:
        return nested.group(1)
    return None


def _replace_csproj_package_version(text: str, package: str, version: str) -> Tuple[str, int]:
    pattern = re.compile(
        r'(<PackageReference\s+[^>]*Include="' + re.escape(package) + r'"[^>]*Version=")([^"]+)(")',
        re.IGNORECASE,
    )
    return pattern.subn(rf'\g<1>{version}\g<3>', text)


def audit_nuget_project(content: str) -> Tuple[set, str, bool]:
    """Render, restore, and list vulnerable packages for a csproj in a temp dir.

    Returns (advisory_keys, reason, operational_error) with keys of
    (package, advisory URL) matching finding_key() for NuGet findings.
    """
    rendered = render_manifest_for_install(content)
    with tempfile.TemporaryDirectory(prefix="vuln_nuget_") as tmp:
        work = Path(tmp)
        proj = work / "TempProject.csproj"
        proj.write_text(rendered, encoding="utf-8")
        try:
            restore = subprocess.run(
                [_resolve_executable("dotnet"), "restore", str(proj)],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except subprocess.TimeoutExpired:
            return set(), "dotnet restore timed out", True
        except OSError as exc:
            return set(), f"dotnet is not available: {exc}", True
        if restore.returncode != 0:
            reason = (restore.stderr or restore.stdout or "dotnet restore failed").strip()
            return set(), reason[:500], False
        try:
            listing = subprocess.run(
                [
                    _resolve_executable("dotnet"),
                    "list",
                    str(proj),
                    "package",
                    "--vulnerable",
                    "--include-transitive",
                    "--format",
                    "json",
                ],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except subprocess.TimeoutExpired:
            return set(), "dotnet list timed out", True
        except OSError as exc:
            return set(), f"dotnet is not available: {exc}", True
        if not listing.stdout:
            return set(), "dotnet list produced no output", True
        try:
            data = json.loads(listing.stdout)
        except json.JSONDecodeError:
            return set(), "dotnet list produced malformed JSON", True

        keys = set()
        for project in data.get("projects") or []:
            for framework in project.get("frameworks") or []:
                for section in ("topLevelPackages", "transitivePackages"):
                    for pkg in framework.get(section) or []:
                        pid = pkg.get("id") or ""
                        for vuln in pkg.get("vulnerabilities") or []:
                            url = vuln.get("advisoryurl") or vuln.get("advisoryUrl") or ""
                            keys.add((pid, url))
        return keys, "", False


def build_nuget_candidate(content: str, finding: dict) -> Tuple[Optional[str], str]:
    """Build a direct-only PackageReference bump candidate for one finding.

    Returns (candidate_text, strategy) or (None, reason) when the package is
    transitive, is not a direct PackageReference, or a version cannot be chosen.
    """
    package = finding.get("package") or ""
    if not finding.get("is_direct"):
        return None, "transitive dependency; cannot fix by editing the project file"
    if not _csproj_has_direct_reference(content, package):
        return None, "not a direct PackageReference"

    rendered = render_manifest_for_install(content)
    with tempfile.TemporaryDirectory(prefix="vuln_nuget_add_") as tmp:
        work = Path(tmp)
        proj = work / "TempProject.csproj"
        proj.write_text(rendered, encoding="utf-8")
        try:
            add = subprocess.run(
                [_resolve_executable("dotnet"), "add", str(proj), "package", package],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except (subprocess.TimeoutExpired, OSError) as exc:
            return None, f"dotnet add failed: {exc}"
        if add.returncode != 0:
            reason = (add.stderr or add.stdout or "dotnet add failed").strip()
            return None, reason[:300]
        version = _read_csproj_package_version(proj.read_text(encoding="utf-8"), package)
        if not version:
            return None, "could not determine the selected version"
        candidate, count = _replace_csproj_package_version(content, package, version)
        if count == 0:
            return None, "could not apply the version to the template"
        return candidate, f"direct package bump to {version}"


def apply_nuget_fixes(path: Path, findings: List[dict]) -> FileFixResult:
    """Cumulatively verify direct-only fixes for NuGet findings in one project."""
    original = path.read_text(encoding="utf-8")

    transitive = [item for item in findings if not item.get("is_direct")]
    direct = [item for item in findings if item.get("is_direct")]
    no_fix = [
        {**item, "reason": "transitive dependency; cannot fix by editing the project file"}
        for item in transitive
    ]
    fixed: List[dict] = []
    already_fixed: List[dict] = []

    if not direct:
        return FileFixResult(content=original, no_fix=no_fix)

    current = original
    before, reason, operational_error = audit_nuget_project(current)
    if operational_error or reason:
        return FileFixResult(
            content=original,
            no_fix=no_fix,
            errors=[{"file": str(path), "reason": reason or "dotnet audit failed"}],
        )

    requested = {finding_key(item): item for item in direct}
    already_fixed = [item for key, item in requested.items() if key not in before]
    unresolved = [item for key, item in requested.items() if key in before]

    for finding in unresolved:
        target = finding_key(finding)
        if target not in before:
            continue
        candidate, strategy = build_nuget_candidate(current, finding)
        if candidate is None:
            no_fix.append({**finding, "reason": strategy})
            continue
        after, reason, operational_error = audit_nuget_project(candidate)
        if operational_error:
            return FileFixResult(
                content=original,
                no_fix=no_fix,
                errors=[{"file": str(path), "reason": reason or "dotnet audit failed"}],
            )
        if reason:
            no_fix.append({**finding, "reason": reason})
            continue
        if target in after:
            no_fix.append({**finding, "reason": "candidate did not remove the vulnerability"})
            continue
        if after - before:
            no_fix.append({**finding, "reason": "candidate introduced a new vulnerability"})
            continue

        removed = before - after
        current = candidate
        before = after
        for key in removed:
            matched = requested.get(key)
            if matched and matched not in fixed:
                fixed.append({**matched, "strategy": strategy})

    return FileFixResult(
        content=current,
        fixed=fixed,
        already_fixed=already_fixed,
        no_fix=no_fix,
    )


# --------------------------------------------------------------------------- #
# Rolling PR lifecycle
# --------------------------------------------------------------------------- #


@dataclass
class RollingPrState:
    pr_number: Optional[int]
    pr_url: str


@dataclass
class PublishResult:
    action: str
    pr_number: Optional[int]
    pr_url: str


class RollingPrError(RuntimeError):
    pass


def _query_open_rolling_pr(repo: str, branch: str, repo_root) -> RollingPrState:
    result = run(
        [
            "gh", "pr", "list",
            "--repo", repo,
            "--head", branch,
            "--state", "open",
            "--json", "number,url",
        ],
        cwd=repo_root,
        check=False,
        capture=True,
    )
    if result.returncode != 0:
        raise RollingPrError(
            f"failed to query open PRs for {branch}: {(result.stderr or '').strip()}"
        )
    try:
        data = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise RollingPrError(f"malformed PR list for {branch}: {exc}") from exc
    if data:
        entry = data[0]
        return RollingPrState(pr_number=entry.get("number"), pr_url=entry.get("url") or "")
    return RollingPrState(pr_number=None, pr_url="")


def prepare_rolling_branch(*, repo: str, repo_root, base_branch: str, branch: str) -> RollingPrState:
    """Check out the rolling branch, reusing an open PR's branch or cutting a
    fresh one from the base branch. Merge conflicts are operational failures."""
    state = _query_open_rolling_pr(repo, branch, repo_root)

    if state.pr_number is not None:
        run(["git", "fetch", "origin", base_branch, branch], cwd=repo_root)
        run(["git", "checkout", "-B", branch, f"origin/{branch}"], cwd=repo_root)
        merge = run(
            ["git", "merge", "--no-edit", f"origin/{base_branch}"],
            cwd=repo_root,
            check=False,
            capture=True,
        )
        if merge.returncode != 0:
            try:
                run(["git", "merge", "--abort"], cwd=repo_root, check=False)
            except Exception:
                pass
            raise RollingPrError(
                f"failed to merge origin/{base_branch} into {branch}: "
                f"{(merge.stderr or '').strip()}"
            )
        return state

    # No open PR: start a fresh rolling branch from the base branch.
    run(["git", "fetch", "origin", base_branch], cwd=repo_root)
    run(["git", "push", "origin", "--delete", branch], cwd=repo_root, check=False)
    run(["git", "checkout", "-B", branch, f"origin/{base_branch}"], cwd=repo_root)
    return state


def _parse_pr_url(stdout: str) -> str:
    for line in (stdout or "").splitlines()[::-1]:
        line = line.strip()
        if line.startswith("https://"):
            return line
    return ""


def publish_rolling_pr(
    *,
    state: RollingPrState,
    repo: str,
    repo_root,
    base_branch: str,
    branch: str,
    body_file: Path,
    branch_advanced: bool,
) -> PublishResult:
    """Push the rolling branch and create or update its PR.

    Every Git/GitHub command result is checked; failures raise RollingPrError.
    Does nothing when there is no open PR and the branch did not advance.
    """
    has_open_pr = state.pr_number is not None
    if not has_open_pr and not branch_advanced:
        return PublishResult("none", None, "")

    push = run(
        ["git", "push", "origin", branch],
        cwd=repo_root,
        check=False,
        capture=True,
    )
    if push.returncode != 0:
        raise RollingPrError(
            f"failed to push {branch}: {(push.stderr or '').strip()}"
        )

    if has_open_pr:
        edit = run(
            [
                "gh", "pr", "edit", str(state.pr_number),
                "--repo", repo,
                "--body-file", str(body_file),
            ],
            cwd=repo_root,
            check=False,
            capture=True,
        )
        if edit.returncode != 0:
            raise RollingPrError(
                f"failed to update PR #{state.pr_number}: {(edit.stderr or '').strip()}"
            )
        return PublishResult("updated", state.pr_number, state.pr_url)

    create = run(
        [
            "gh", "pr", "create",
            "--repo", repo,
            "--base", base_branch,
            "--head", branch,
            "--title", "chore(security): rolling vulnerability fixes",
            "--body-file", str(body_file),
        ],
        cwd=repo_root,
        check=False,
        capture=True,
    )
    if create.returncode != 0:
        raise RollingPrError(
            f"failed to create rolling PR: {(create.stderr or '').strip()}"
        )
    return PublishResult("created", None, _parse_pr_url(create.stdout))


# --------------------------------------------------------------------------- #
# Pipeline orchestration
# --------------------------------------------------------------------------- #


def _build_scans_summary(scan_paths, skip_targets) -> List[dict]:
    skip = set(skip_targets or [])
    summary = []
    for path in scan_paths:
        scan = load_scan(Path(path))
        if not scan:
            continue
        if (scan.get("scan_target") or "") in skip:
            continue
        summary.append({
            "scan_target": scan.get("scan_target"),
            "ecosystem": scan.get("ecosystem"),
            "vuln_count": len(scan.get("vulnerabilities") or []),
        })
    return summary


def _render_pr_body(manifest: dict) -> str:
    return render_pr_body(manifest)


def run_pipeline(
    *,
    scan_paths,
    repo_root,
    repo: str,
    base_branch: str,
    rolling_branch: str,
    skip_targets=None,
    dry_run: bool = False,
) -> dict:
    repo_root = Path(repo_root)
    scans_summary = _build_scans_summary(scan_paths, skip_targets)
    rows = list(iter_all_vulns(scan_paths, skip_targets=skip_targets))

    manifest = {
        "branch": rolling_branch,
        "pr_action": "none",
        "pr_number": None,
        "pr_url": "",
        "scans": scans_summary,
        "fixed": [],
        "already_fixed": [],
        "no_fix": [],
        "errors": [],
    }

    # Real runs check out the rolling branch first, so fixes are computed against
    # the branch we will publish. Templates already fixed by a prior open PR are
    # then detected as already_fixed instead of being re-fixed.
    state = RollingPrState(pr_number=None, pr_url="")
    if not dry_run:
        try:
            state = prepare_rolling_branch(
                repo=repo,
                repo_root=repo_root,
                base_branch=base_branch,
                branch=rolling_branch,
            )
        except RollingPrError as exc:
            manifest["errors"].append({"reason": str(exc)})
            safe_print(f"Failed to prepare rolling branch: {exc}")
            return manifest

    fixed: List[dict] = []
    already_fixed: List[dict] = []
    no_fix: List[dict] = []
    errors: List[dict] = []
    pending_contents = {}

    for (ecosystem, file_name), findings in group_findings(rows).items():
        path = resolve_repo_file(repo_root, file_name)
        if path is None:
            errors.append({"file": file_name, "reason": "path outside repository root"})
            continue
        try:
            on_disk = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append({"file": file_name, "reason": f"cannot read manifest: {exc}"})
            continue

        result = (
            apply_npm_fixes(path, findings)
            if ecosystem == "npm"
            else apply_nuget_fixes(path, findings)
        )
        if result.content != on_disk:
            pending_contents[path] = result.content
        fixed.extend(result.fixed)
        already_fixed.extend(result.already_fixed)
        no_fix.extend(result.no_fix)
        errors.extend(result.errors)

    manifest["fixed"] = fixed
    manifest["already_fixed"] = already_fixed
    manifest["no_fix"] = no_fix
    manifest["errors"] = errors

    if dry_run:
        safe_print(
            f"[dry-run] fixed={len(fixed)} already_fixed={len(already_fixed)} "
            f"no_fix={len(no_fix)} errors={len(errors)}"
        )
        return manifest

    if errors:
        safe_print(
            f"Operational errors ({len(errors)}); not touching Git. "
            "See manifest for details."
        )
        return manifest

    for path, content in pending_contents.items():
        path.write_text(content, encoding="utf-8")

    run(
        ["git", "add", "-A", "--", ":!samples-repo", ":!samples-repo/**"],
        cwd=repo_root,
    )
    diff_cached = run(["git", "diff", "--cached", "--quiet"], cwd=repo_root, check=False)
    if diff_cached.returncode != 0:
        run(
            ["git", "commit", "-m", "fix(deps): update vulnerable template dependencies"],
            cwd=repo_root,
        )

    rev = run(
        ["git", "rev-list", "--count", f"origin/{base_branch}..HEAD"],
        cwd=repo_root,
        check=False,
        capture=True,
    )
    try:
        branch_advanced = int((rev.stdout or "0").strip() or "0") > 0
    except ValueError:
        branch_advanced = diff_cached.returncode != 0

    body = _render_pr_body(manifest)
    body_file = Path(
        tempfile.NamedTemporaryFile(
            "w", suffix=".md", delete=False, encoding="utf-8"
        ).name
    )
    body_file.write_text(body, encoding="utf-8")
    try:
        published = publish_rolling_pr(
            state=state,
            repo=repo,
            repo_root=repo_root,
            base_branch=base_branch,
            branch=rolling_branch,
            body_file=body_file,
            branch_advanced=branch_advanced,
        )
    except RollingPrError as exc:
        manifest["errors"].append({"reason": str(exc)})
        safe_print(f"Failed to publish rolling PR: {exc}")
        return manifest
    finally:
        try:
            body_file.unlink()
        except OSError:
            pass

    manifest["pr_action"] = published.action
    manifest["pr_number"] = (
        published.pr_number if published.pr_number is not None else state.pr_number
    )
    manifest["pr_url"] = published.pr_url or state.pr_url
    return manifest


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Maintain one rolling fix PR for scanned vulnerabilities"
    )
    parser.add_argument(
        "--scan-json",
        action="append",
        default=[],
        help="Path to a scan summary JSON (repeatable, order matters)",
    )
    parser.add_argument("--base-branch", default="dev")
    parser.add_argument("--rolling-branch", default=ROLLING_BRANCH)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument(
        "--skip-scan-target",
        action="append",
        default=[],
        help="scan_target values to ignore entirely (e.g. samples-repo). Repeatable.",
    )
    parser.add_argument(
        "--manifest-out",
        default=None,
        help="If set, write a structured JSON manifest of the outcome to this path.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate candidates in memory only; never touch Git, GitHub, or files.",
    )
    args = parser.parse_args()

    if not args.scan_json:
        safe_print("No --scan-json provided; nothing to do.")
        return 0

    repo_root = Path(args.repo_root).resolve()
    scan_paths = [Path(p) for p in args.scan_json]

    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not repo and not args.dry_run:
        safe_print("GITHUB_REPOSITORY env var is not set; cannot manage the rolling PR.")
        return 1

    personal_pat = (os.environ.get("GH_TOKEN_PERSONAL") or "").strip()
    fallback_pr_token = (os.environ.get("GH_TOKEN_FOR_PR") or "").strip()
    pr_token = personal_pat or fallback_pr_token
    if pr_token:
        os.environ["GH_TOKEN"] = pr_token
        source = "GH_TOKEN_PERSONAL" if personal_pat else "GH_TOKEN_FOR_PR"
        safe_print(f"Using {source} for gh operations")
    else:
        safe_print("Using top-level GH_TOKEN for gh operations")

    manifest = run_pipeline(
        scan_paths=scan_paths,
        repo_root=repo_root,
        repo=repo,
        base_branch=args.base_branch,
        rolling_branch=args.rolling_branch,
        skip_targets=args.skip_scan_target,
        dry_run=args.dry_run,
    )

    if args.manifest_out:
        out_path = Path(args.manifest_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        safe_print(f"Wrote PR manifest to {out_path}")

    safe_print(
        "Summary: "
        f"fixed={len(manifest['fixed'])} "
        f"already_fixed={len(manifest['already_fixed'])} "
        f"no_fix={len(manifest['no_fix'])} "
        f"errors={len(manifest['errors'])} "
        f"pr_action={manifest['pr_action']}"
    )
    return 1 if manifest["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
