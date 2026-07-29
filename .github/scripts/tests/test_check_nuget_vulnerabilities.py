import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).parents[1] / "check_nuget_vulnerabilities.py"
SPEC = importlib.util.spec_from_file_location("check_nuget_vulnerabilities", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ExtractNuGetVulnerabilitiesTests(unittest.TestCase):
    def test_VULN_AC_02_extracts_all_direct_and_transitive_advisories(self):
        output = json.dumps({
            "projects": [{
                "frameworks": [{
                    "topLevelPackages": [{
                        "id": "Direct.Package",
                        "resolvedVersion": "1.0.0",
                        "vulnerabilities": [
                            {"severity": "High", "advisoryUrl": "https://example.test/a"},
                            {"severity": "Moderate", "advisoryUrl": "https://example.test/b"},
                        ],
                    }],
                    "transitivePackages": [{
                        "id": "Transitive.Package",
                        "resolvedVersion": "2.0.0",
                        "vulnerabilities": [
                            {"severity": "Critical", "advisoryUrl": "https://example.test/c"},
                        ],
                    }],
                }]
            }]
        })

        records = MODULE.extract_vulnerability_details(
            output,
            Path("templates/vs/app.csproj.tpl"),
        )

        self.assertEqual(3, len(records))
        self.assertEqual(
            [
                ("Direct.Package", True),
                ("Direct.Package", True),
                ("Transitive.Package", False),
            ],
            [(record["package"], record["is_direct"]) for record in records],
        )
        self.assertEqual("https://example.test/c", records[2]["advisory_id"])


class CheckNuGetProjectTests(unittest.TestCase):
    @patch.object(MODULE.subprocess, "run")
    def test_VULN_AC_09_dotnet_list_nonzero_without_confirmed_vuln_is_error(self, run):
        """dotnet list nonzero exit without a confirmed vulnerability result must be ScanResult error."""
        restore = Mock(returncode=0, stdout="", stderr="")
        list_result = Mock(returncode=1, stdout="MSBUILD : error MSB1011", stderr="Network failure")
        run.side_effect = [restore, list_result]

        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "App.csproj"
            source.write_text(
                '<Project Sdk="Microsoft.NET.Sdk"></Project>',
                encoding="utf-8",
            )
            result = MODULE.check_nuget_vulnerabilities(source, Path(temp))

        self.assertEqual("error", result.status)
        self.assertIn("dotnet list package failed", result.message)


class SkipUnresolvableSdkTests(unittest.TestCase):
    def test_custom_teamsfx_sdk_is_skipped_without_restore(self):
        """Projects on the VS-only Microsoft.TeamsFx.Sdk are skipped, not errored,
        and dotnet is never invoked for them."""
        with patch.object(MODULE.subprocess, "run") as run:
            with tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / "App.csproj"
                source.write_text(
                    '<Project ToolsVersion="15.0" Sdk="Microsoft.TeamsFx.Sdk"></Project>',
                    encoding="utf-8",
                )
                result = MODULE.check_nuget_vulnerabilities(source, Path(temp))

        self.assertEqual("skipped", result.status)
        run.assert_not_called()

    def test_standard_sdk_is_not_skipped(self):
        source_content = '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>'
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "App.csproj"
            source.write_text(source_content, encoding="utf-8")
            self.assertFalse(MODULE.project_sdk_is_unresolvable(source))


if __name__ == "__main__":
    unittest.main()
