#!/usr/bin/env python3
"""
Migrate existing plan/group JSON files to OCR-based preconditions.

For every step that has a resolvable *expected* screenshot (a real base64 data URI
in the file's ``screenshots`` map or embedded inline), this OCRs that screenshot and
replaces the step's ``preconditions`` with a single ``ocr:v1:`` entry. Steps whose
screenshot was stripped/missing keep their existing (legacy hash) preconditions so
they stay protected — the executor reads both formats.

Requires Azure Vision to be configured (see config.yaml / AZURE_VISION_* env vars).

Usage:
    python scripts/migrate_preconditions_to_ocr.py <path> [<path> ...] [--dry-run]

Each <path> may be a plan/group JSON file or a directory of them.

Examples:
    python scripts/migrate_preconditions_to_ocr.py plans groups
    python scripts/migrate_preconditions_to_ocr.py plans/My_Plan.json groups
    python scripts/migrate_preconditions_to_ocr.py plans --dry-run
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Ensure the package is importable when run from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from vscuse_v2.core.ocr_text import (  # noqa: E402
    OcrConfigError,
    encode_ocr_precondition,
    extract_ocr_text,
    get_image_viewport,
    is_ocr_precondition,
)


def _resolve_expected_screenshot(step: Dict, screenshots: Dict[str, str]) -> str:
    """Return a usable data URI for the step's expected screenshot, or ''."""
    ss = step.get("screenshot")
    if not ss or not isinstance(ss, str):
        return ""
    if ss.startswith("data:") and len(ss) > 150:
        return ss
    # Reference into the screenshots map
    val = screenshots.get(ss)
    if isinstance(val, str) and val.startswith("data:") and len(val) > 150:
        return val
    return ""


def migrate_file(path: Path, dry_run: bool, stats: Dict[str, int]) -> Tuple[bool, List[str]]:
    """Migrate a single plan file. Returns (changed, warnings)."""
    warnings: List[str] = []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, dict) or "steps" not in data:
        return False, warnings

    screenshots = data.get("screenshots", {}) or {}
    changed = False

    # Build previous-step description lookup using execution order (falls back to
    # file order). Used to give the runtime OCR judge context on what just happened.
    steps_by_id = {s.get("step_id"): s for s in data.get("steps", []) if s.get("step_id")}
    exec_order = (data.get("plan_metadata", {}) or {}).get("execution_order") or [
        s.get("step_id") for s in data.get("steps", [])
    ]
    prev_desc_by_id: Dict[str, Optional[str]] = {}
    prev_desc: Optional[str] = None
    for sid in exec_order:
        prev_desc_by_id[sid] = prev_desc
        st = steps_by_id.get(sid)
        if st is not None:
            prev_desc = st.get("description") or prev_desc

    for step in data.get("steps", []):
        pre = step.get("preconditions") or []
        if not pre:
            continue
        stats["steps_with_pre"] += 1

        if any(is_ocr_precondition(c) for c in pre):
            stats["already_ocr"] += 1
            continue

        data_uri = _resolve_expected_screenshot(step, screenshots)
        if not data_uri:
            stats["skipped_no_image"] += 1
            continue

        try:
            full_text = extract_ocr_text(data_uri)
        except OcrConfigError:
            raise  # unrecoverable: surfaced to caller to stop the run
        except Exception as e:  # noqa: BLE001
            stats["vision_failed"] += 1
            warnings.append(f"{path.name} :: {step.get('step_id')} OCR failed: {e}")
            continue

        if not full_text.strip():
            stats["skipped_no_text"] += 1
            warnings.append(f"{path.name} :: {step.get('step_id')} no text on screen; kept hash")
            continue

        viewport = get_image_viewport(data_uri)
        x, y = step.get("parameters", {}).get("x"), step.get("parameters", {}).get("y")
        target = {"x": int(x), "y": int(y)} if x is not None and y is not None else None
        prev_description = prev_desc_by_id.get(step.get("step_id"))
        step["preconditions"] = [
            encode_ocr_precondition(
                full_text, viewport=viewport, target=target, prev_description=prev_description
            )
        ]
        stats["converted"] += 1
        changed = True

    if changed and not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    return changed, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate plans to OCR-based preconditions.")
    parser.add_argument(
        "paths", nargs="+",
        help="Plan/group JSON files and/or directories containing them.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Analyze without writing changes.")
    args = parser.parse_args()

    stats = {
        "files": 0,
        "files_changed": 0,
        "steps_with_pre": 0,
        "converted": 0,
        "already_ocr": 0,
        "skipped_no_image": 0,
        "skipped_no_text": 0,
        "vision_failed": 0,
    }
    all_warnings: List[str] = []

    try:
        for p in args.paths:
            base = Path(p)
            if not base.exists():
                print(f"! path not found: {p}", file=sys.stderr)
                continue
            targets = [base] if base.is_file() else sorted(base.glob("*.json"))
            for path in targets:
                stats["files"] += 1
                changed, warnings = migrate_file(path, args.dry_run, stats)
                all_warnings.extend(warnings)
                if changed:
                    stats["files_changed"] += 1
                    print(f"{'[dry-run] ' if args.dry_run else ''}migrated {path}")
    except OcrConfigError as e:
        print(f"\nERROR: Azure Vision is not configured: {e}", file=sys.stderr)
        return 2

    print("\n=== migration summary ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    if all_warnings:
        print(f"\n{len(all_warnings)} warning(s):")
        for w in all_warnings[:50]:
            print(f"  - {w}")
        if len(all_warnings) > 50:
            print(f"  ... and {len(all_warnings) - 50} more")
    print(
        "\nSteps kept on legacy hash preconditions (no usable expected screenshot): "
        f"{stats['skipped_no_image']}. These remain protected via the hash fallback."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
