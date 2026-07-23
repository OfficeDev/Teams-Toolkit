import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "render_vuln_summary.py"
SPEC = importlib.util.spec_from_file_location("render_vuln_summary", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


MANIFEST = {
    "branch": "auto-fix-vuln/rolling",
    "pr_action": "updated",
    "pr_number": 42,
    "pr_url": "https://github.com/owner/repo/pull/42",
    "scans": [{"scan_target": "templates/vsc", "ecosystem": "npm", "vuln_count": 4}],
    "fixed": [{"file": "a/package.json.tpl", "package": "alpha", "advisory_id": "one"}],
    "already_fixed": [{"file": "b/package.json.tpl", "package": "beta", "advisory_id": "two"}],
    "no_fix": [{"file": "c/package.json.tpl", "package": "gamma", "reason": "no candidate"}],
    "errors": [],
}


class RenderAggregateSummaryTests(unittest.TestCase):
    def test_VULN_AC_10_markdown_reports_every_bucket_and_rolling_pr(self):
        output = MODULE.render_markdown([], MANIFEST)
        self.assertIn("Updated rolling fix PR", output)
        self.assertIn("#42", output)
        self.assertIn("Verified fixes (1)", output)
        self.assertIn("Already fixed on rolling branch (1)", output)
        self.assertIn("No verified automatic fix (1)", output)

    def test_VULN_AC_10_subject_reports_findings_and_fix_count(self):
        output = MODULE.render_subject([], MANIFEST)
        self.assertIn("4 finding(s)", output)
        self.assertIn("1 fixed", output)
        self.assertIn("1 no-fix", output)

    def test_VULN_AC_10_errors_are_prominent(self):
        manifest = {**MANIFEST, "errors": [{"reason": "merge conflict"}]}
        output = MODULE.render_markdown([], manifest)
        self.assertIn("Operational errors (1)", output)
        self.assertIn("merge conflict", output)

    def test_VULN_AC_10_pr_body_omits_workflow_footer(self):
        body = MODULE.render_pr_body(MANIFEST)
        self.assertIn("Verified fixes (1)", body)
        self.assertNotIn("View workflow run", body)


if __name__ == "__main__":
    unittest.main()
