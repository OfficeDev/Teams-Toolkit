#!/usr/bin/env python3
"""
Render the output of the vulnerability scan pipeline in three flavors:

  --output-markdown   GitHub Actions step summary (markdown tables)
  --output-email      HTML body suitable for send-email-report action
  --output-subject    one-line email subject

Inputs are the per-scanner JSON files produced by check_npm_vulnerabilities.py
and check_nuget_vulnerabilities.py plus the manifest produced by
open_vuln_fix_pr.py. All three are optional in the sense that missing files
are tolerated (rendered as empty sections).
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
    """Return today's date in Asia/Shanghai (UTC+8) as YYYY-MM-DD.

    Pipeline runs on UTC so we shift manually rather than relying on tzdata.
    """
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
    m = manifest or {}
    return {
        "new": len(m.get("new_prs") or []),
        "existing": len(m.get("skipped_existing") or []),
        "no_fix": len(m.get("skipped_no_fix") or []),
        "over_limit": len(m.get("skipped_over_limit") or []),
        "max_prs": m.get("max_prs", 0),
    }


def merge_manifests(manifests: List[dict]) -> Optional[dict]:
    """Combine several fix manifests (e.g. template npm/NuGet + pnpm lockfiles)
    into one so a single render pass covers every flow.

    ``max_prs`` collapses to ``0`` (unlimited) if any input is unlimited,
    otherwise it is the sum of the per-flow caps.
    """
    manifests = [m for m in manifests if m]
    if not manifests:
        return None
    if len(manifests) == 1:
        return manifests[0]

    merged: dict = {
        "scans": [],
        "new_prs": [],
        "skipped_existing": [],
        "skipped_no_fix": [],
        "skipped_over_limit": [],
    }
    unlimited = False
    max_total = 0
    for m in manifests:
        for key in ("scans", "new_prs", "skipped_existing",
                    "skipped_no_fix", "skipped_over_limit"):
            merged[key].extend(m.get(key) or [])
        cap = m.get("max_prs", 0)
        if cap in (0, None):
            unlimited = True
        else:
            max_total += cap
    merged["max_prs"] = 0 if unlimited else max_total
    return merged


# --------------------------------------------------------------------------- #
# Markdown
# --------------------------------------------------------------------------- #


def render_markdown(scan_jsons: List[Path], manifest: Optional[dict]) -> str:
    counts = _counts(manifest)
    scans = _scan_rows(scan_jsons, manifest)
    total_vulns = sum(s.get("vuln_count", 0) for s in scans)
    run_url = _workflow_run_url()
    max_label = "unlimited" if counts["max_prs"] in (0, None) else str(counts["max_prs"])

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

    new_prs = (manifest or {}).get("new_prs") or []
    out.append(f"### Newly opened fix PRs ({counts['new']} / max {max_label})")
    if not new_prs:
        out.append("_None._")
    else:
        out.append("| Package | Severity | Fixed version | PR | Strategy |")
        out.append("|---|---|---|---|---|")
        for r in new_prs:
            out.append(
                f"| `{r.get('package') or ''}` "
                f"| {r.get('severity') or ''} "
                f"| {r.get('fixed_version') or '—'} "
                f"| {_short_pr(r.get('pr_url') or '')} "
                f"| {r.get('strategy') or ''} |"
            )
    out.append("")

    existing = (manifest or {}).get("skipped_existing") or []
    out.append(f"### Skipped - PR already created ({counts['existing']})")
    if not existing:
        out.append("_None._")
    else:
        out.append("| Package | Severity | Existing branch |")
        out.append("|---|---|---|")
        for r in existing:
            out.append(
                f"| `{r.get('package') or ''}` "
                f"| {r.get('severity') or ''} "
                f"| `{r.get('branch') or ''}` |"
            )
    out.append("")

    no_fix = (manifest or {}).get("skipped_no_fix") or []
    out.append(f"### Skipped - no automatic fix ({counts['no_fix']})")
    if not no_fix:
        out.append("_None._")
    else:
        out.append("| Package | Severity | Reason |")
        out.append("|---|---|---|")
        for r in no_fix:
            out.append(
                f"| `{r.get('package') or ''}` "
                f"| {r.get('severity') or ''} "
                f"| {r.get('reason') or ''} |"
            )
    out.append("")

    over = (manifest or {}).get("skipped_over_limit") or []
    out.append(f"### Skipped - over PR limit ({counts['over_limit']})")
    if not over:
        out.append("_None._")
    else:
        out.append("| Package | Severity | Branch |")
        out.append("|---|---|---|")
        for r in over:
            out.append(
                f"| `{r.get('package') or ''}` "
                f"| {r.get('severity') or ''} "
                f"| `{r.get('branch') or ''}` |"
            )
    out.append("")

    if run_url:
        out.append(f"[View workflow run]({run_url})")
        out.append("")

    return "\n".join(out)


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
    max_label = "unlimited" if counts["max_prs"] in (0, None) else str(counts["max_prs"])

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

    # New PRs
    new_prs = (manifest or {}).get("new_prs") or []
    parts.append(f"<h3>Newly opened fix PRs ({_h(counts['new'])} / max {_h(max_label)})</h3>")
    if not new_prs:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["Package", "Severity", "Fixed version", "PR", "Strategy"]))
        for r in new_prs:
            pr_url = r.get("pr_url") or ""
            pr_cell = (
                f'<a href="{_h(pr_url)}">{_h(_short_pr(pr_url) or pr_url)}</a>'
                if pr_url else ""
            )
            parts.append(row([
                f"<code>{_h(r.get('package'))}</code>",
                _h(r.get("severity")),
                _h(r.get("fixed_version") or "—"),
                pr_cell,
                _h(r.get("strategy")),
            ]))
        parts.append("</tbody></table>")

    # Skipped: existing
    existing = (manifest or {}).get("skipped_existing") or []
    parts.append(f"<h3>Skipped &ndash; PR already created ({_h(counts['existing'])})</h3>")
    if not existing:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["Package", "Severity", "Existing branch"]))
        for r in existing:
            parts.append(row([
                f"<code>{_h(r.get('package'))}</code>",
                _h(r.get("severity")),
                f"<code>{_h(r.get('branch'))}</code>",
            ]))
        parts.append("</tbody></table>")

    # Skipped: no fix
    no_fix = (manifest or {}).get("skipped_no_fix") or []
    parts.append(f"<h3>Skipped &ndash; no automatic fix ({_h(counts['no_fix'])})</h3>")
    if not no_fix:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["Package", "Severity", "Reason"]))
        for r in no_fix:
            parts.append(row([
                f"<code>{_h(r.get('package'))}</code>",
                _h(r.get("severity")),
                _h(r.get("reason")),
            ]))
        parts.append("</tbody></table>")

    # Skipped: over limit
    over = (manifest or {}).get("skipped_over_limit") or []
    parts.append(f"<h3>Skipped &ndash; over PR limit ({_h(counts['over_limit'])})</h3>")
    if not over:
        parts.append("<p><i>None.</i></p>")
    else:
        parts.append(open_table(["Package", "Severity", "Branch"]))
        for r in over:
            parts.append(row([
                f"<code>{_h(r.get('package'))}</code>",
                _h(r.get("severity")),
                f"<code>{_h(r.get('branch'))}</code>",
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

    if total_vulns == 0:
        return f"[Vuln Scan] No vulnerabilities found - {date}"

    return (
        f"[Vuln Scan] {counts['new']} new PR(s), "
        f"{counts['existing']} skipped (already exists), "
        f"{counts['no_fix']} no-fix, "
        f"{counts['over_limit']} over-limit - {date}"
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
