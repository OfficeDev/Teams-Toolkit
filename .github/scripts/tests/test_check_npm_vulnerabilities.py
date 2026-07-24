import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).parents[1] / "check_npm_vulnerabilities.py"
SPEC = importlib.util.spec_from_file_location("check_npm_vulnerabilities", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ExtractNpmVulnerabilitiesTests(unittest.TestCase):
    def test_VULN_AC_01_extracts_every_advisory_for_every_package(self):
        audit = {
            "vulnerabilities": {
                "alpha": {
                    "severity": "high",
                    "isDirect": False,
                    "fixAvailable": {"name": "parent", "version": "2.0.0"},
                    "via": [
                        {
                            "source": 1001,
                            "url": "https://example.test/1001",
                            "title": "Alpha one",
                            "severity": "high",
                        },
                        {
                            "source": 1002,
                            "url": "https://example.test/1002",
                            "title": "Alpha two",
                            "severity": "moderate",
                        },
                    ],
                },
                "beta": {
                    "severity": "moderate",
                    "isDirect": True,
                    "fixAvailable": True,
                    "via": ["gamma"],
                },
            }
        }

        with tempfile.TemporaryDirectory() as temp:
            manifest = Path(temp) / "package.json"
            manifest.write_text(
                json.dumps({"dependencies": {"beta": "^1.0.0"}}),
                encoding="utf-8",
            )
            records = MODULE.extract_vulnerability_details(audit, manifest)

        self.assertEqual(3, len(records))
        self.assertEqual(
            [
                ("alpha", "1001"),
                ("alpha", "1002"),
                ("beta", None),
            ],
            [(record["package"], record["advisory_id"]) for record in records],
        )
        self.assertEqual("^1.0.0", records[2]["current_version"])
        self.assertTrue(records[2]["is_direct"])
        self.assertEqual(True, records[2]["fix_available"])

    def test_VULN_AC_01_uses_package_record_without_advisory_object(self):
        audit = {
            "vulnerabilities": {
                "alpha": {
                    "severity": "moderate",
                    "isDirect": False,
                    "fixAvailable": False,
                    "via": ["beta"],
                }
            }
        }

        with tempfile.TemporaryDirectory() as temp:
            manifest = Path(temp) / "package.json"
            manifest.write_text("{}", encoding="utf-8")
            records = MODULE.extract_vulnerability_details(audit, manifest)

        self.assertEqual(1, len(records))
        self.assertIsNone(records[0]["advisory_id"])
        self.assertEqual("alpha", records[0]["package"])


class CheckNpmManifestTests(unittest.TestCase):
    @patch.object(MODULE.subprocess, "run")
    def test_VULN_AC_09_install_failure_is_an_operational_error(self, run):
        run.return_value.returncode = 1
        run.return_value.stderr = "ERESOLVE"
        run.return_value.stdout = ""

        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.json"
            source.write_text("{}", encoding="utf-8")
            result = MODULE.check_package_vulnerabilities(
                source,
                Path(temp),
            )

        self.assertEqual("error", result.status)
        self.assertIn("ERESOLVE", result.message)

    @patch.object(MODULE.subprocess, "run")
    def test_VULN_AC_01_low_severity_findings_are_emitted(self, run):
        """Low-severity-only audit must still produce a vulnerable ScanResult."""
        low_only_audit = {
            "metadata": {
                "vulnerabilities": {
                    "info": 0, "low": 1, "moderate": 0, "high": 0, "critical": 0, "total": 1,
                }
            },
            "vulnerabilities": {
                "example-pkg": {
                    "severity": "low",
                    "isDirect": True,
                    "fixAvailable": False,
                    "via": [
                        {
                            "source": 9001,
                            "url": "https://example.test/9001",
                            "title": "Low-severity issue",
                            "severity": "low",
                        }
                    ],
                }
            },
        }
        install = Mock(returncode=0, stdout="", stderr="")
        audit = Mock(returncode=1, stdout=json.dumps(low_only_audit), stderr="")
        run.side_effect = [install, audit]

        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "package.json"
            source.write_text(
                json.dumps({"dependencies": {"example-pkg": "^1.0.0"}}),
                encoding="utf-8",
            )
            result = MODULE.check_package_vulnerabilities(source, Path(temp))

        self.assertEqual("vulnerable", result.status)
        self.assertEqual(1, len(result.vulnerabilities))
        self.assertEqual("9001", result.vulnerabilities[0]["advisory_id"])
        self.assertEqual("low", result.vulnerabilities[0]["severity"])

    @patch.object(MODULE.subprocess, "run")
    def test_VULN_AC_09_audit_nonzero_without_vulnerabilities_is_error(self, run):
        """npm audit nonzero with a valid error payload but no vulnerabilities must be ScanResult error."""
        install = Mock(returncode=0, stdout="", stderr="")
        audit = Mock(
            returncode=1,
            stdout=json.dumps({"error": {"code": "ENOLOCK", "summary": "missing lock-file"}, "vulnerabilities": {}}),
            stderr="",
        )
        run.side_effect = [install, audit]

        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "package.json"
            source.write_text("{}", encoding="utf-8")
            result = MODULE.check_package_vulnerabilities(source, Path(temp))

        self.assertEqual("error", result.status)


        install = Mock(returncode=0, stdout="", stderr="")
        audit = Mock(returncode=1, stdout="{invalid", stderr="")
        run.side_effect = [install, audit]

        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.json"
            source.write_text("{}", encoding="utf-8")
            result = MODULE.check_package_vulnerabilities(
                source,
                Path(temp),
            )

        self.assertEqual("error", result.status)
        self.assertIn("valid JSON", result.message)


if __name__ == "__main__":
    unittest.main()
