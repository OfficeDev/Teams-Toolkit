#!/usr/bin/env python3
"""
Check npm package.json files for security vulnerabilities.
This script scans package.json and package.json.tpl files and runs npm audit
in a temp directory to avoid modifying the original repository.
"""

import os
import sys
import argparse
import subprocess
import tempfile
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from typing import List
import json


def safe_print(message: str) -> None:
    """Safely print message, handling encoding issues"""
    try:
        print(message)
    except UnicodeEncodeError:
        safe_message = message.encode('ascii', 'replace').decode('ascii')
        print(safe_message)
    except Exception as e:
        print(f"[Print error: {type(e).__name__}]")


def find_package_files(scan_dirs: List[str]) -> Tuple[List[Path], List[Path]]:
    """Find all package.json and package.json.tpl files in the given directories"""
    package_files = []
    template_files = []
    
    for scan_dir in scan_dirs:
        base_path = Path(scan_dir)
        if not base_path.exists():
            safe_print(f"WARNING: Directory does not exist: {scan_dir}")
            continue
        
        # Find package.json files
        for pkg_file in base_path.rglob("package.json"):
            package_files.append(pkg_file)
        
        # Find package.json.tpl template files
        for tpl_file in base_path.rglob("package.json.tpl"):
            template_files.append(tpl_file)
    
    return package_files, template_files


@dataclass
class ScanResult:
    status: str  # "clean", "vulnerable", or "error"
    message: str
    vulnerabilities: List[dict] = field(default_factory=list)


def extract_vulnerability_details(audit_data: dict, source_file: Path) -> List[dict]:
    vulnerabilities = audit_data.get("vulnerabilities", {}) or {}
    try:
        manifest = json.loads(source_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        manifest = {}

    records = []
    for package, info in sorted(vulnerabilities.items()):
        current_version = ""
        for section in ("dependencies", "devDependencies", "optionalDependencies"):
            dependency = manifest.get(section) or {}
            if package in dependency:
                current_version = dependency[package]
                break

        fix_available = info.get("fixAvailable", False)
        fixed_version = (
            fix_available.get("version")
            if isinstance(fix_available, dict)
            else None
        )
        base = {
            "file": str(source_file).replace("\\", "/"),
            "package": package,
            "current_version": current_version,
            "fixed_version": fixed_version,
            "severity": (info.get("severity") or "").lower() or None,
            "is_direct": bool(info.get("isDirect")) or bool(current_version),
            "fix_available": fix_available,
        }
        advisories = [entry for entry in info.get("via") or [] if isinstance(entry, dict)]
        if not advisories:
            records.append({
                **base,
                "advisory_id": None,
                "advisory_url": None,
                "title": None,
            })
            continue
        for advisory in advisories:
            source = advisory.get("source")
            records.append({
                **base,
                "advisory_id": str(source) if source is not None else advisory.get("url"),
                "advisory_url": advisory.get("url"),
                "title": advisory.get("title"),
                "severity": (
                    advisory.get("severity")
                    or base["severity"]
                    or ""
                ).lower() or None,
            })
    return records


def check_package_vulnerabilities(pkg_file: Path, temp_dir: Path, is_template: bool = False) -> ScanResult:
    """
    Check a package.json file for vulnerabilities using npm audit.

    Returns a ScanResult with status "clean", "vulnerable", or "error".
    """
    work_dir = temp_dir / f"check_{pkg_file.name}_{hash(str(pkg_file)) % 10000}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        dest_file = work_dir / "package.json"
        shutil.copy(pkg_file, dest_file)

        install_result = subprocess.run(
            ["npm", "install", "--package-lock-only"],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=120
        )

        if install_result.returncode != 0:
            detail = (install_result.stderr or install_result.stdout or "")[:200]
            return ScanResult("error", f"npm install failed: {detail}")

        audit_result = subprocess.run(
            ["npm", "audit", "--json"],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=120
        )

        try:
            audit_data = json.loads(audit_result.stdout) if audit_result.stdout else {}
        except json.JSONDecodeError:
            return ScanResult("error", "npm audit did not return valid JSON")

        metadata = audit_data.get("metadata", {}).get("vulnerabilities", {})
        critical = metadata.get("critical", 0)
        high = metadata.get("high", 0)
        moderate = metadata.get("moderate", 0)

        if critical > 0 or high > 0 or moderate > 0:
            vuln_summary = []
            if critical > 0:
                vuln_summary.append(f"{critical} critical")
            if high > 0:
                vuln_summary.append(f"{high} high")
            if moderate > 0:
                vuln_summary.append(f"{moderate} moderate")
            return ScanResult(
                "vulnerable",
                f"Vulnerabilities found: {', '.join(vuln_summary)}",
                extract_vulnerability_details(audit_data, pkg_file),
            )

        return ScanResult("clean", "OK")

    except subprocess.TimeoutExpired:
        return ScanResult("error", "npm command timed out")
    except OSError as exc:
        return ScanResult("error", str(exc))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(
        description="Check npm package.json files for security vulnerabilities"
    )
    parser.add_argument(
        "--scan-directory",
        nargs="+",
        default=["templates/vsc"],
        help="Directories to scan for package.json files"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output"
    )
    parser.add_argument(
        "--output-json",
        default=None,
        help="If set, write a structured summary of findings to this path"
    )

    args = parser.parse_args()
    
    safe_print("=" * 60)
    safe_print("NPM Security Vulnerability Check")
    safe_print("=" * 60)
    safe_print(f"Scanning directories: {', '.join(args.scan_directory)}")
    safe_print("")
    
    # Find all package files
    package_files, template_files = find_package_files(args.scan_directory)
    
    total_files = len(package_files) + len(template_files)
    safe_print(f"Found {len(package_files)} package.json files")
    safe_print(f"Found {len(template_files)} package.json.tpl template files")
    safe_print(f"Total files to check: {total_files}")
    safe_print("")
    
    if total_files == 0:
        safe_print("No package.json files found to check.")
        sys.exit(0)
    
    # Create a temporary directory for all checks
    with tempfile.TemporaryDirectory(prefix="npm_security_check_") as temp_dir:
        temp_path = Path(temp_dir)
        safe_print(f"Using temp directory: {temp_dir}")
        safe_print("")
        
        failed_files = []
        scan_errors = []
        vuln_records = []
        checked_count = 0

        # Check regular package.json files
        for pkg_file in package_files:
            checked_count += 1
            safe_print(f"[{checked_count}/{total_files}] Checking: {pkg_file}")

            result = check_package_vulnerabilities(pkg_file, temp_path, is_template=False)

            if result.status == "error":
                safe_print(f"  ⚠️ SCAN ERROR: {result.message}")
                scan_errors.append({"file": str(pkg_file).replace("\\", "/"), "message": result.message})
            elif result.status == "vulnerable":
                safe_print(f"  ❌ {result.message}")
                failed_files.append((pkg_file, result.message))
                vuln_records.extend(result.vulnerabilities)
            else:
                safe_print(f"  ✅ {result.message}")

        # Check template files
        for tpl_file in template_files:
            checked_count += 1
            safe_print(f"[{checked_count}/{total_files}] Checking: {tpl_file}")

            result = check_package_vulnerabilities(tpl_file, temp_path, is_template=True)

            if result.status == "error":
                safe_print(f"  ⚠️ SCAN ERROR: {result.message}")
                scan_errors.append({"file": str(tpl_file).replace("\\", "/"), "message": result.message})
            elif result.status == "vulnerable":
                safe_print(f"  ❌ {result.message}")
                failed_files.append((tpl_file, result.message))
                vuln_records.extend(result.vulnerabilities)
            else:
                safe_print(f"  ✅ {result.message}")
    
    # Summary
    safe_print("")
    safe_print("=" * 60)
    safe_print("Summary")
    safe_print("=" * 60)
    safe_print(f"Total files checked: {checked_count}")
    safe_print(f"Files with vulnerabilities: {len(failed_files)}")

    if args.output_json:
        scan_target = args.scan_directory[0] if args.scan_directory else ""
        payload = {
            "scan_target": scan_target,
            "ecosystem": "npm",
            "has_vulnerabilities": bool(vuln_records),
            "vulnerabilities": vuln_records,
            "errors": scan_errors,
        }
        try:
            Path(args.output_json).parent.mkdir(parents=True, exist_ok=True)
            Path(args.output_json).write_text(json.dumps(payload, indent=2), encoding="utf-8")
            safe_print(f"Wrote scan summary to {args.output_json}")
        except OSError as exc:
            safe_print(f"WARNING: Failed to write output JSON: {exc}")

    if scan_errors:
        safe_print("")
        safe_print("Scan errors:")
        for err in scan_errors:
            safe_print(f"  - {err['file']}: {err['message']}")
        safe_print("")
        safe_print("❌ FAILED: Scanner errors encountered")
        sys.exit(2)
    elif failed_files:
        safe_print("")
        safe_print("Files with vulnerabilities:")
        for pkg_file, message in failed_files:
            safe_print(f"  - {pkg_file}: {message}")
        safe_print("")
        safe_print("⚠️ Vulnerabilities found (see output JSON for details)")
        sys.exit(0)
    else:
        safe_print("")
        safe_print("✅ SUCCESS: All package.json files passed security check")
        sys.exit(0)


if __name__ == "__main__":
    main()
