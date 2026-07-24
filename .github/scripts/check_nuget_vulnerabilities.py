#!/usr/bin/env python3
"""
Check NuGet packages in C# projects for security vulnerabilities.
This script scans .csproj and .csproj.tpl files and runs dotnet list package --vulnerable
in a temp directory to avoid modifying the original repository.
"""

import os
import sys
import argparse
import subprocess
import tempfile
import shutil
import re
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Tuple


@dataclass
class ScanResult:
    status: str  # "clean", "vulnerable", "skipped", or "error"
    message: str
    vulnerabilities: List[dict] = field(default_factory=list)


# VS-only MSBuild project SDKs that are not restorable from NuGet. Projects that
# target one of these are Teams Toolkit project shells with no NuGet packages to
# audit, so ``dotnet restore`` can never resolve them. They are skipped rather
# than reported as scan errors (which would otherwise fail the whole job).
UNRESOLVABLE_PROJECT_SDKS = ("Microsoft.TeamsFx.Sdk",)


def project_sdk_is_unresolvable(csproj_file: Path) -> bool:
    """Return True when the project targets a custom SDK that cannot be restored."""
    try:
        content = csproj_file.read_text(encoding="utf-8")
    except OSError:
        return False
    return any(
        re.search(rf'Sdk\s*=\s*"{re.escape(sdk)}"', content)
        for sdk in UNRESOLVABLE_PROJECT_SDKS
    )


def extract_vulnerability_details(json_output: str, source_file: Path) -> List[dict]:
    data = json.loads(json_output)
    records = []
    for project in data.get("projects", []) or []:
        for framework in project.get("frameworks", []) or []:
            for collection, is_direct in (
                ("topLevelPackages", True),
                ("transitivePackages", False),
            ):
                for package in framework.get(collection, []) or []:
                    for vulnerability in package.get("vulnerabilities", []) or []:
                        advisory_url = (
                            vulnerability.get("advisoryurl")
                            or vulnerability.get("advisoryUrl")
                        )
                        records.append({
                            "file": str(source_file).replace("\\", "/"),
                            "package": package.get("id"),
                            "current_version": (
                                package.get("resolvedVersion")
                                or package.get("requestedVersion")
                            ),
                            "fixed_version": None,
                            "severity": (
                                vulnerability.get("severity") or ""
                            ).lower() or None,
                            "advisory_id": advisory_url,
                            "advisory_url": advisory_url,
                            "title": None,
                            "is_direct": is_direct,
                            "fix_available": False,
                        })
    return records


def safe_print(message: str) -> None:
    """Safely print message, handling encoding issues"""
    try:
        print(message)
    except UnicodeEncodeError:
        safe_message = message.encode('ascii', 'replace').decode('ascii')
        print(safe_message)
    except Exception as e:
        print(f"[Print error: {type(e).__name__}]")


def find_csproj_files(scan_dirs: List[str]) -> Tuple[List[Path], List[Path]]:
    """Find all .csproj and .csproj.tpl files in the given directories"""
    csproj_files = []
    template_files = []
    
    for scan_dir in scan_dirs:
        base_path = Path(scan_dir)
        if not base_path.exists():
            safe_print(f"WARNING: Directory does not exist: {scan_dir}")
            continue
        
        # Find .csproj files (excluding .tpl files)
        for csproj_file in base_path.rglob("*.csproj"):
            if not str(csproj_file).endswith(".tpl"):
                csproj_files.append(csproj_file)
        
        # Find .csproj.tpl template files
        for tpl_file in base_path.rglob("*.csproj.tpl"):
            template_files.append(tpl_file)
    
    return csproj_files, template_files


def process_template_file(tpl_file: Path, dest_dir: Path) -> Path:
    """
    Process a .csproj.tpl template file by replacing template variables.
    
    Args:
        tpl_file: Path to the .csproj.tpl file
        dest_dir: Destination directory for the processed file
        
    Returns:
        Path to the processed .csproj file
    """
    content = tpl_file.read_text(encoding='utf-8')
    
    # Replace common template variables
    replacements = {
        "{{TargetFramework}}": "net8.0",
        "{{ProjectName}}": "TempProject",
        "{{SafeProjectName}}": "TempProject",
        "{{RootNamespace}}": "TempProject",
        "{{AssemblyName}}": "TempProject",
        # Add more template variables as needed
    }
    
    for placeholder, value in replacements.items():
        content = content.replace(placeholder, value)
    
    # Also handle variations with spaces and different casing
    content = re.sub(r'\{\{\s*TargetFramework\s*\}\}', 'net8.0', content, flags=re.IGNORECASE)
    content = re.sub(r'\{\{\s*ProjectName\s*\}\}', 'TempProject', content, flags=re.IGNORECASE)
    
    dest_file = dest_dir / "TempProject.csproj"
    dest_file.write_text(content, encoding='utf-8')
    
    return dest_file


def check_nuget_vulnerabilities(csproj_file: Path, temp_dir: Path, is_template: bool = False) -> ScanResult:
    """
    Check a .csproj file for NuGet vulnerabilities using dotnet list package --vulnerable.

    Returns a ScanResult with status "clean", "vulnerable", "skipped", or "error".
    """
    if project_sdk_is_unresolvable(csproj_file):
        return ScanResult(
            "skipped",
            "Skipped: uses VS-only SDK Microsoft.TeamsFx.Sdk (no NuGet packages to audit)",
        )

    work_dir = temp_dir / f"check_{csproj_file.stem}_{hash(str(csproj_file)) % 10000}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        if is_template:
            processed_file = process_template_file(csproj_file, work_dir)
            csproj_name = processed_file.name
        else:
            dest_file = work_dir / csproj_file.name
            shutil.copy(csproj_file, dest_file)
            csproj_name = dest_file.name

        restore_result = subprocess.run(
            ["dotnet", "restore", csproj_name],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=180
        )

        if restore_result.returncode != 0:
            detail = (restore_result.stderr or restore_result.stdout or "")[:200]
            return ScanResult("error", f"dotnet restore failed: {detail}")

        vuln_result = subprocess.run(
            ["dotnet", "list", csproj_name, "package", "--vulnerable", "--include-transitive"],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=180
        )

        output = vuln_result.stdout + vuln_result.stderr

        if "has the following vulnerable packages" in output:
            json_result = subprocess.run(
                ["dotnet", "list", csproj_name, "package", "--vulnerable", "--include-transitive", "--format", "json"],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=180,
            )
            try:
                records = extract_vulnerability_details(json_result.stdout, csproj_file)
            except json.JSONDecodeError:
                return ScanResult("error", "dotnet audit did not return valid JSON")

            vuln_lines = [
                line.strip()
                for line in output.split('\n')
                if '>' in line and any(
                    s in line for s in ('Critical', 'High', 'Moderate', 'Low')
                )
            ]
            summary = (
                f"Vulnerabilities found: {len(vuln_lines)} package(s)"
                if vuln_lines
                else "Vulnerabilities found"
            )
            return ScanResult("vulnerable", summary, records)

        if vuln_result.returncode != 0:
            detail = (vuln_result.stderr or vuln_result.stdout or "")[:200]
            return ScanResult("error", f"dotnet list package failed: {detail}")

        return ScanResult("clean", "OK")

    except subprocess.TimeoutExpired:
        return ScanResult("error", "dotnet command timed out")
    except OSError as exc:
        return ScanResult("error", str(exc))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(
        description="Check NuGet packages in C# projects for security vulnerabilities"
    )
    parser.add_argument(
        "--scan-directory",
        nargs="+",
        default=["templates/vs"],
        help="Directories to scan for .csproj files"
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
    safe_print("NuGet Security Vulnerability Check")
    safe_print("=" * 60)
    safe_print(f"Scanning directories: {', '.join(args.scan_directory)}")
    safe_print("")
    
    # Find all csproj files
    csproj_files, template_files = find_csproj_files(args.scan_directory)
    
    total_files = len(csproj_files) + len(template_files)
    safe_print(f"Found {len(csproj_files)} .csproj files")
    safe_print(f"Found {len(template_files)} .csproj.tpl template files")
    safe_print(f"Total files to check: {total_files}")
    safe_print("")
    
    if total_files == 0:
        safe_print("No .csproj files found to check.")
        sys.exit(0)
    
    # Create a temporary directory for all checks
    with tempfile.TemporaryDirectory(prefix="nuget_security_check_") as temp_dir:
        temp_path = Path(temp_dir)
        safe_print(f"Using temp directory: {temp_dir}")
        safe_print("")
        
        failed_files = []
        scan_errors = []
        skipped_files = []
        vuln_records = []
        checked_count = 0

        # Check regular .csproj files
        for csproj_file in csproj_files:
            checked_count += 1
            safe_print(f"[{checked_count}/{total_files}] Checking: {csproj_file}")

            result = check_nuget_vulnerabilities(csproj_file, temp_path, is_template=False)

            if result.status == "error":
                safe_print(f"  ⚠️ SCAN ERROR: {result.message}")
                scan_errors.append({"file": str(csproj_file).replace("\\", "/"), "message": result.message})
            elif result.status == "skipped":
                safe_print(f"  ⏭️ {result.message}")
                skipped_files.append(str(csproj_file).replace("\\", "/"))
            elif result.status == "vulnerable":
                safe_print(f"  ❌ {result.message}")
                failed_files.append((csproj_file, result.message))
                vuln_records.extend(result.vulnerabilities)
            else:
                safe_print(f"  ✅ {result.message}")

        # Check template files
        for tpl_file in template_files:
            checked_count += 1
            safe_print(f"[{checked_count}/{total_files}] Checking: {tpl_file}")

            result = check_nuget_vulnerabilities(tpl_file, temp_path, is_template=True)

            if result.status == "error":
                safe_print(f"  ⚠️ SCAN ERROR: {result.message}")
                scan_errors.append({"file": str(tpl_file).replace("\\", "/"), "message": result.message})
            elif result.status == "skipped":
                safe_print(f"  ⏭️ {result.message}")
                skipped_files.append(str(tpl_file).replace("\\", "/"))
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
    safe_print(f"Files skipped: {len(skipped_files)}")

    if args.output_json:
        scan_target = args.scan_directory[0] if args.scan_directory else ""
        payload = {
            "scan_target": scan_target,
            "ecosystem": "nuget",
            "has_vulnerabilities": bool(vuln_records),
            "vulnerabilities": vuln_records,
            "errors": scan_errors,
            "skipped": skipped_files,
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
        for csproj_file, message in failed_files:
            safe_print(f"  - {csproj_file}: {message}")
        safe_print("")
        safe_print("⚠️ Vulnerabilities found (see output JSON for details)")
        sys.exit(0)
    else:
        safe_print("")
        safe_print("✅ SUCCESS: All C# projects passed NuGet security check")
        sys.exit(0)


if __name__ == "__main__":
    main()
