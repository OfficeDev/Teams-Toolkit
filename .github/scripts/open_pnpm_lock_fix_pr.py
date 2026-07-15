#!/usr/bin/env python3
"""
Publish the pnpm lockfile fixes produced by ``fix_pnpm_lock_vulnerabilities.py``
as a single **rolling** pull request.

Unlike ``open_vuln_fix_pr.py`` (one fresh PR per vuln), this keeps exactly one PR
alive on a fixed branch (``auto-fix-vuln/pnpm-lockfiles``):

  * If there are verified lockfile changes in the working tree, the branch is
    rebuilt from the base branch, all lockfile changes are committed in one
    commit, force-pushed with lease, and a PR is created or its existing PR is
    left in place (the force-push updates it in place).
  * If there are no changes, any stale open rolling PR is closed and its branch
    deleted, so the PR list never lingers with an empty/obsolete fix.

Only the lockfiles listed in the manifest's ``changed_lockfiles`` are committed;
nothing else in the working tree is touched. The manifest is re-emitted with the
resulting PR URL backfilled into every ``new_prs`` row so downstream rendering
links each fixed package to the one rolling PR.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import List, Optional


def safe_print(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        print(message.encode("ascii", "replace").decode("ascii"), flush=True)


def run(cmd, *, cwd=None, check=True, capture=False, env=None) -> subprocess.CompletedProcess:
    safe_print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=capture, env=env)
    if check and result.returncode != 0:
        if capture:
            safe_print(result.stdout or "")
            safe_print(result.stderr or "")
        raise SystemExit(f"Command failed: {' '.join(cmd)} (exit {result.returncode})")
    return result


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def existing_rolling_pr(branch: str, repo: str) -> Optional[dict]:
    result = run(
        ["gh", "pr", "list", "--repo", repo, "--head", branch,
         "--state", "open", "--json", "number,url"],
        check=False, capture=True,
    )
    if result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return None
    return data[0] if data else None


def close_stale_pr(branch: str, repo: str, repo_root: Path) -> None:
    pr = existing_rolling_pr(branch, repo)
    if pr:
        safe_print(f"Closing stale rolling PR #{pr.get('number')} (no fixes this run).")
        run(
            ["gh", "pr", "close", str(pr["number"]), "--repo", repo,
             "--delete-branch",
             "--comment", "Superseded: no compatible pnpm lockfile fixes remain."],
            cwd=repo_root, check=False, capture=True,
        )
    else:
        safe_print("No changes and no open rolling PR; nothing to do.")


def build_pr_body(manifest: dict) -> str:
    fixed = manifest.get("new_prs") or []
    skipped = manifest.get("skipped_no_fix") or []
    lines = [
        "This PR is maintained automatically by the pnpm lockfile vulnerability "
        "scan (daily). It bumps vulnerable dependencies to the newest versions "
        "still allowed by the existing semver ranges (compatible-range only).",
        "",
        "Each applied bump was re-audited with `pnpm audit` before being kept. "
        "Advisories that would require a major upgrade or a forced `override` are "
        "listed under *Not auto-fixed* and left untouched.",
        "",
        f"### Fixed ({len(fixed)})",
    ]
    if fixed:
        lines.append("| Lockfile | Package | Severity | From | To |")
        lines.append("|---|---|---|---|---|")
        for r in fixed:
            lines.append(
                f"| `{r.get('scan_target') or ''}` "
                f"| `{r.get('package') or ''}` "
                f"| {r.get('severity') or ''} "
                f"| {r.get('current_version') or '—'} "
                f"| {r.get('fixed_version') or '—'} |"
            )
    else:
        lines.append("_None._")
    lines.append("")
    lines.append(f"### Not auto-fixed ({len(skipped)})")
    if skipped:
        lines.append("| Lockfile | Package | Severity | Reason |")
        lines.append("|---|---|---|---|")
        for r in skipped:
            lines.append(
                f"| `{r.get('scan_target') or ''}` "
                f"| `{r.get('package') or ''}` "
                f"| {r.get('severity') or ''} "
                f"| {r.get('reason') or ''} |"
            )
    else:
        lines.append("_None._")
    return "\n".join(lines)


def backfill_pr_url(manifest: dict, pr_url: str) -> None:
    for row in manifest.get("new_prs") or []:
        row["pr_url"] = pr_url


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Publish the rolling pnpm fix PR")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--manifest-out", default=None,
                        help="Where to re-write the manifest with pr_url backfilled "
                             "(defaults to overwriting --manifest).")
    parser.add_argument("--base-branch", default="dev")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--branch", default="auto-fix-vuln/pnpm-lockfiles")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    manifest_out = Path(args.manifest_out) if args.manifest_out else manifest_path

    branch = args.branch
    changed = manifest.get("changed_lockfiles") or []

    repo = os.environ.get("GITHUB_REPOSITORY")
    if not repo and not args.dry_run:
        safe_print("GITHUB_REPOSITORY not set; cannot manage the rolling PR.")
        return 1

    if args.dry_run:
        safe_print(f"[dry-run] changed_lockfiles={changed}")
        safe_print(f"[dry-run] would {'update/create' if changed else 'close'} PR on {branch}")
        return 0

    if not changed:
        close_stale_pr(branch, repo, repo_root)
        manifest_out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return 0

    run(["git", "fetch", "origin", args.base_branch], cwd=repo_root)

    # Preserve the verified lockfile edits across the branch reset.
    run(["git", "stash", "push", "--include-untracked", "-m", "pnpm-vuln-fix", "--",
         *changed], cwd=repo_root, check=False)
    run(["git", "checkout", "-B", branch, f"origin/{args.base_branch}"], cwd=repo_root)
    pop = run(["git", "stash", "pop"], cwd=repo_root, check=False, capture=True)
    if pop.returncode != 0:
        # Conflicts against a moved base: fall back to checking the files out from
        # the stash so the newest base wins on everything except our lockfiles.
        run(["git", "checkout", "stash@{0}", "--", *changed], cwd=repo_root, check=False)
        run(["git", "stash", "drop"], cwd=repo_root, check=False)

    run(["git", "add", "--", *changed], cwd=repo_root)
    diff = run(["git", "diff", "--cached", "--quiet"], cwd=repo_root, check=False)
    if diff.returncode == 0:
        safe_print("Lockfile changes vanished after rebase; closing stale PR instead.")
        close_stale_pr(branch, repo, repo_root)
        manifest_out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return 0

    run(["git", "config", "user.name", "github-actions[bot]"], cwd=repo_root, check=False)
    run(["git", "config", "user.email",
         "41898282+github-actions[bot]@users.noreply.github.com"], cwd=repo_root, check=False)
    commit_subject = f"fix(deps): bump vulnerable pnpm lockfile dependencies ({len(changed)} lockfile(s))"
    run(["git", "commit", "-m", commit_subject], cwd=repo_root)
    run(["git", "push", "--force-with-lease", "origin", branch], cwd=repo_root)

    pr = existing_rolling_pr(branch, repo)
    body = build_pr_body(manifest)
    if pr:
        pr_url = pr["url"]
        safe_print(f"Updating existing rolling PR #{pr['number']} ({pr_url}).")
        run(["gh", "pr", "edit", str(pr["number"]), "--repo", repo,
             "--title", commit_subject, "--body", body],
            cwd=repo_root, check=False, capture=True)
    else:
        create = run(
            ["gh", "pr", "create", "--repo", repo, "--base", args.base_branch,
             "--head", branch, "--title", commit_subject, "--body", body],
            cwd=repo_root, capture=True,
        )
        pr_url = ""
        for line in (create.stdout or "").splitlines()[::-1]:
            line = line.strip()
            if line.startswith("https://"):
                pr_url = line
                break
        safe_print(f"Opened rolling PR: {pr_url}")

    backfill_pr_url(manifest, pr_url)
    manifest_out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    safe_print(f"Wrote manifest with pr_url to {manifest_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
