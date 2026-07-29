#!/usr/bin/env python3
"""
Render the output of the vulnerability scan pipeline in several flavors:

  --output-markdown   GitHub Actions step summary (markdown tables)
  --output-email      HTML body suitable for send-email-report action
  --output-subject    one-line email subject

`render_pr_body(manifest)` produces the same aggregate markdown used for the
rolling fix PR body (without the workflow-run footer). open_vuln_fix_pr.py
imports it for `gh pr create --body-file` / `gh pr edit --body-file`.

Inputs are the per-scanner JSON files produced by check_npm_vulnerabilities.py
and check_nuget_vulnerabilities.py plus the manifest produced by
open_vuln_fix_pr.py. Missing files are tolerated (rendered as empty sections).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import html
import json
import os
import sys
from pathlib import Path
from typing import List, Optional


def _read_json(path: Optional[Path]) -> Optional[dict]:
    if not path:
        return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _beijing_today() -> str:
    """Return today's date in Asia/Shanghai (UTC+8) as YYYY-MM-DD."""
    now_utc = _dt.datetime.now(_dt.timezone.utc)
    return (now_utc + _dt.timedelta(hours=8)).strftime("%Y-%m-%d")


def _short_pr(pr_url: str) -> str:
    """Turn a full PR URL into a `#1234` style label for compact tables."""
    if not pr_url:
        return ""
    tail = pr_url.rsplit("/", 1)[-1]
    return f"#{tail}" if tail.isdigit() else pr_url


def _workflow_run_url() -> str:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    if repo and run_id:
        return f"https://github.com/{repo}/actions/runs/{run_id}"
    return ""


# --------------------------------------------------------------------------- #
# Aggregation
# --------------------------------------------------------------------------- #


def _scan_rows(scan_jsons: List[Path], manifest: Optional[dict]) -> List[dict]:
    """Prefer manifest.scans (already filtered for skip targets); fall back to
    re-reading the raw scan files."""
    if manifest and manifest.get("scans"):
        return manifest["scans"]
    rows = []
    for path in scan_jsons:
        scan = _read_json(path)
        if not scan:
            continue
        rows.append({
            "scan_target": scan.get("scan_target"),
            "ecosystem": scan.get("ecosystem"),
            "vuln_count": len(scan.get("vulnerabilities") or []),
        })
    return rows


def _counts(manifest: Optional[dict]) -> dict:
    value = manifest or {}
    return {
        "fixed": len(value.get("fixed") or []),
        "already_fixed": len(value.get("already_fixed") or []),
        "no_fix": len(value.get("no_fix") or []),
        "errors": len(value.get("errors") or []),
    }


def _advisory(record: dict) -> str:
    return record.get("advisory_id") or record.get("advisory_url") or ""


def _rolling_pr_line(manifest: Optional[dict]) -> str:
    value = manifest or {}
    action = value.get("pr_action") or "none"
    number = value.get("pr_number")
    url = value.get("pr_url") or ""
    label = f"#{number}" if number else (_short_pr(url) or "")
    link = f"[{label}]({url})" if (url and label) else label
    if action == "created":
        return f"**Opened rolling fix PR {link}**".rstrip()
    if action == "updated":
        return f"**Updated rolling fix PR {link}**".rstrip()
    return "**No rolling fix PR change this run.**"


def _normalize_manifest(manifest: dict) -> dict:
    """Normalize legacy per-vulnerability manifests to rolling aggregate shape.

    New rolling shape:
      scans, fixed, already_fixed, no_fix, errors, pr_action, pr_number, pr_url

    Legacy shape (used by pnpm lockfile flow):
      scans, new_prs, skipped_existing, skipped_no_fix, skipped_over_limit
    """
    if any(
        key in manifest
        for key in ("fixed", "already_fixed", "no_fix", "errors", "pr_action")
    ):
        return {
            "branch": manifest.get("branch"),
            "pr_action": manifest.get("pr_action", "none"),
            "pr_number": manifest.get("pr_number"),
            "pr_url": manifest.get("pr_url", ""),
            "scans": list(manifest.get("scans") or []),
            "fixed": list(manifest.get("fixed") or []),
            "already_fixed": list(manifest.get("already_fixed") or []),
            "no_fix": list(manifest.get("no_fix") or []),
            "errors": list(manifest.get("errors") or []),
        }

    fixed = list(manifest.get("new_prs") or [])
    already_fixed = list(manifest.get("skipped_existing") or [])
    no_fix = list(manifest.get("skipped_no_fix") or [])
    no_fix.extend(
        {
            **row,
            "reason": row.get("reason") or "skipped by PR limit",
        }
        for row in (manifest.get("skipped_over_limit") or [])
    )
    return {
        "branch": manifest.get("branch"),
        "pr_action": "none",
        "pr_number": None,
        "pr_url": "",
        "scans": list(manifest.get("scans") or []),
        "fixed": fixed,
        "already_fixed": already_fixed,
        "no_fix": no_fix,
        "errors": list(manifest.get("errors") or []),
    }


def merge_manifests(manifests: List[dict]) -> Optional[dict]:
    manifests = [m for m in manifests if m]
    if not manifests:
        return None

    normalized = [_normalize_manifest(m) for m in manifests]
    merged: dict = {
        "branch": None,
        "pr_action": "none",
        "pr_number": None,
        "pr_url": "",
        "scans": [],
        "fixed": [],
        "already_fixed": [],
        "no_fix": [],
        "errors": [],
    }
    for value in normalized:
        if not merged["branch"] and value.get("branch"):
            merged["branch"] = value.get("branch")
        action = value.get("pr_action") or "none"
        if action in ("created", "updated"):
            merged["pr_action"] = action
            merged["pr_number"] = value.get("pr_number")
            merged["pr_url"] = value.get("pr_url") or ""
        merged["scans"].extend(value.get("scans") or [])
        merged["fixed"].extend(value.get("fixed") or [])
        merged["already_fixed"].extend(value.get("already_fixed") or [])
        merged["no_fix"].extend(value.get("no_fix") or [])
        merged["errors"].extend(value.get("errors") or [])
    return merged


# --------------------------------------------------------------------------- #
# Markdown
# --------------------------------------------------------------------------- #


def _markdown_body(manifest: Optional[dict], scan_jsons: List[Path]) -> List[str]:
    counts = _counts(manifest)
    scans = _scan_rows(scan_jsons, manifest)
    total_vulns = sum(s.get("vuln_count", 0) for s in scans)
    value = manifest or {}

    out: List[str] = []
    out.append(f"## Vulnerability Scan - {_beijing_today()}")
    out.append("")

    out.append("### Scan overview")
    out.append("| Target | Ecosystem | Vulnerabilities found |")
    out.append("|---|---|---|")
    if not scans:
        out.append("| _no scan results_ | | |")
    else:
        for s in scans:
            out.append(
                f"| `{s.get('scan_target') or ''}` "
                f"| {s.get('ecosystem') or ''} "
                f"| {s.get('vuln_count', 0)} |"
            )
    out.append("")
    out.append(f"**Total vulnerabilities:** {total_vulns}")
    out.append("")
    out.append(_rolling_pr_line(manifest))
    out.append("")

    fixed = value.get("fixed") or []
    out.append(f"### Verified fixes ({counts['fixed']})")
    if not fixed:
        out.append("_None._")
    else:
        out.append("| File | Package | Advisory | Strategy |")
        out.append("|---|---|---|---|")
        for r in fixed:
            out.append(
                f"| `{r.get('file') or ''}` "
                f"| `{r.get('package') or ''}` "
                f"| {_advisory(r)} "
                f"| {r.get('strategy') or ''} |"
            )
    out.append("")

    already = value.get("already_fixed") or []
    out.append(f"### Already fixed on rolling branch ({counts['already_fixed']})")
    if not already:
        out.append("_None._")
    else:
        out.append("| File | Package | Advisory |")
        out.append("|---|---|---|")
        for r in already:
            out.append(
                f"| `{r.get('file') or ''}` "
                f"| `{r.get('package') or ''}` "
                f"| {_advisory(r)} |"
            )
    out.append("")

    no_fix = value.get("no_fix") or []
    out.append(f"### No verified automatic fix ({counts['no_fix']})")
    if not no_fix:
        out.append("_None._")
    else:
        out.append("| File | Package | Reason |")
        out.append("|---|---|---|")
        for r in no_fix:
            out.append(
                f"| `{r.get('file') or ''}` "
                f"| `{r.get('package') or ''}` "
                f"| {r.get('reason') or ''} |"
            )
    out.append("")

    errors = value.get("errors") or []
    out.append(f"### Operational errors ({counts['errors']})")
    if not errors:
        out.append("_None._")
    else:
        out.append("| File | Reason |")
        out.append("|---|---|")
        for r in errors:
            out.append(
                f"| `{r.get('file') or ''}` "
                f"| {r.get('reason') or ''} |"
            )
    out.append("")

    return out


def render_markdown(scan_jsons: List[Path], manifest: Optional[dict]) -> str:
    out = _markdown_body(manifest, scan_jsons)
    run_url = _workflow_run_url()
    if run_url:
        out.append(f"[View workflow run]({run_url})")
        out.append("")
    return "\n".join(out)


def render_pr_body(manifest: Optional[dict]) -> str:
    """Aggregate markdown for the rolling PR body (no workflow-run footer)."""
    return "\n".join(_markdown_body(manifest, []))


# --------------------------------------------------------------------------- #
# HTML (email body)
# --------------------------------------------------------------------------- #


def _h(value) -> str:
    return html.escape("" if value is None else str(value))


def render_email_html(scan_jsons: List[Path], manifest: Optional[dict]) -> str:
    counts = _counts(manifest)
    scans = _scan_rows(scan_jsons, manifest)
    total_vulns = sum(s.get("vuln_count", 0) for s in scans)
    run_url = _workflow_run_url()
    value = manifest or {}

    style_table = (
        'border-collapse:collapse;border:1px solid #ccc;'
        'font-family:Segoe UI,Arial,sans-serif;font-size:13px;'
    )
    style_th = 'border:1px solid #ccc;padding:4px 8px;background:#f3f3f3;text-align:left;'
    style_td = 'border:1px solid #ccc;padding:4px 8px;'

    def open_table(headers):
        cells = "".join(f"<th style=\"{style_th}\">{_h(h_)}</th>" for h_ in headers)
        return f'<table style="{style_table}"><thead><tr>{cells}</tr></thead><tbody>'

    def row(values):
        cells = "".join(f"<td style=\"{style_td}\">{v}</td>" for v in values)
        return f"<tr>{cells}</tr>"

    parts: List[str] = []
    parts.append(f"<h2>Vulnerability Scan &ndash; {_h(_beijing_today())}</h2>")

    # Overview
    parts.append("<h3>Scan overview</h3>")
    parts.append(open_table(["Target", "Ecosystem", "Vulnerabilities found"]))
    if not scans:
        parts.append(row(["<i>no scan results</i>", "", ""]))
    else:
        for s in scans:
            parts.append(row([
                f"<code>{_h(s.get('scan_target'))}</code>",
                _h(s.get("ecosystem")),
                _h(s.get("vuln_count", 0)),
            ]))
    parts.append("</tbody></table>")
    parts.append(f"<p><b>Total vulnerabilities:</b> {_h(total_vulns)}</p>")

    # Rolling PR
    pr_url = value.get("pr_url") or ""
    number = value.get("pr_number")
    label = f"#{number}" if number else (_short_pr(pr_url) or "")
    action = value.get("pr_action") or "none"
    verb = {"created": "Opened", "updated": "Updated"}.get(action)
    if verb:
        link = f'<a href="{_h(pr_url)}">{_h(label)}</a>' if pr_url else _h(label)
        parts.append(f"<p><b>{verb} rolling fix PR {link}</b></p>")
    else:
        parts.append("<p><b>No rolling fix PR change this run.</b></p>")

    # Verified fixes
    fixed = value.get("fixed") or []
    parts.append(f"<h3>Verified fixes ({_h(counts['fixed'])})</h3>")
    if not fixed:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["File", "Package", "Advisory", "Strategy"]))
        for r in fixed:
            parts.append(row([
                f"<code>{_h(r.get('file'))}</code>",
                f"<code>{_h(r.get('package'))}</code>",
                _h(_advisory(r)),
                _h(r.get("strategy")),
            ]))
        parts.append("</tbody></table>")

    # Already fixed
    already = value.get("already_fixed") or []
    parts.append(f"<h3>Already fixed on rolling branch ({_h(counts['already_fixed'])})</h3>")
    if not already:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["File", "Package", "Advisory"]))
        for r in already:
            parts.append(row([
                f"<code>{_h(r.get('file'))}</code>",
                f"<code>{_h(r.get('package'))}</code>",
                _h(_advisory(r)),
            ]))
        parts.append("</tbody></table>")

    # No fix
    no_fix = value.get("no_fix") or []
    parts.append(f"<h3>No verified automatic fix ({_h(counts['no_fix'])})</h3>")
    if not no_fix:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["File", "Package", "Reason"]))
        for r in no_fix:
            parts.append(row([
                f"<code>{_h(r.get('file'))}</code>",
                f"<code>{_h(r.get('package'))}</code>",
                _h(r.get("reason")),
            ]))
        parts.append("</tbody></table>")

    # Operational errors
    errors = value.get("errors") or []
    parts.append(f"<h3>Operational errors ({_h(counts['errors'])})</h3>")
    if not errors:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["File", "Reason"]))
        for r in errors:
            parts.append(row([
                f"<code>{_h(r.get('file'))}</code>",
                _h(r.get("reason")),
            ]))
        parts.append("</tbody></table>")

    if run_url:
        parts.append(f'<p><a href="{_h(run_url)}">View workflow run</a></p>')

    return "".join(parts)


# --------------------------------------------------------------------------- #
# Subject
# --------------------------------------------------------------------------- #


def render_subject(scan_jsons: List[Path], manifest: Optional[dict]) -> str:
    counts = _counts(manifest)
    scans = _scan_rows(scan_jsons, manifest)
    total_vulns = sum(s.get("vuln_count", 0) for s in scans)
    date = _beijing_today()

    if total_vulns == 0 and counts["errors"] == 0:
        return f"[Vuln Scan] No vulnerabilities found - {date}"

    return (
        f"[Vuln Scan] {total_vulns} finding(s), "
        f"{counts['fixed']} fixed, "
        f"{counts['no_fix']} no-fix, "
        f"{counts['errors']} error(s) - {date}"
    )


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #


def main() -> int:
    parser = argparse.ArgumentParser(description="Render vulnerability scan output")
    parser.add_argument("--scan-json", action="append", default=[])
    parser.add_argument("--manifest", action="append", default=[])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--output-markdown", action="store_true")
    group.add_argument("--output-email", action="store_true")
    group.add_argument("--output-subject", action="store_true")
    args = parser.parse_args()

    scan_paths = [Path(p) for p in args.scan_json]
    manifests = [m for m in (_read_json(Path(p)) for p in args.manifest) if m]
    manifest = merge_manifests(manifests)

    if args.output_markdown:
        sys.stdout.write(render_markdown(scan_paths, manifest))
    elif args.output_email:
        sys.stdout.write(render_email_html(scan_paths, manifest))
    elif args.output_subject:
        sys.stdout.write(render_subject(scan_paths, manifest))

    return 0


if __name__ == "__main__":
    sys.exit(main())
