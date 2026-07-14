import importlib.util
import json
import sys
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
