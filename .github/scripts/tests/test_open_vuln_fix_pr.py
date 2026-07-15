import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).parents[1] / "open_vuln_fix_pr.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("open_vuln_fix_pr", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def finding(file, package, advisory):
    return {
        "file": file,
        "package": package,
        "advisory_id": advisory,
        "severity": "high",
        "fixed_version": "2.0.0",
        "is_direct": False,
    }


class GroupFindingsTests(unittest.TestCase):
    def test_VULN_AC_03_groups_advisories_by_ecosystem_and_file(self):
        rows = [
            ("npm", finding("a/package.json.tpl", "alpha", "one")),
            ("npm", finding("a/package.json.tpl", "alpha", "two")),
            ("npm", finding("b/package.json.tpl", "alpha", "one")),
        ]

        groups = MODULE.group_findings(rows)

        self.assertEqual(
            [("npm", "a/package.json.tpl"), ("npm", "b/package.json.tpl")],
            list(groups),
        )
        self.assertEqual(2, len(groups[("npm", "a/package.json.tpl")]))


class ApplyNpmFixesTests(unittest.TestCase):
    @patch.object(MODULE, "audit_npm_manifest")
    def test_VULN_AC_04_absent_finding_is_already_fixed_on_rolling_branch(
        self,
        audit,
    ):
        audit.return_value = ({("unrelated", "keep")}, "", False)

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "package.json.tpl"
            original = '{"dependencies":{"parent":"^3.0.0"}}'
            path.write_text(original, encoding="utf-8")
            result = MODULE.apply_npm_fixes(
                path,
                [finding(str(path), "alpha", "one")],
            )

        self.assertEqual(1, len(result.already_fixed))
        self.assertEqual([], result.fixed)
        self.assertEqual(original, result.content)

    @patch.object(MODULE, "find_top_level_parent", return_value="parent")
    @patch.object(MODULE, "_latest_npm_version", return_value="3.0.0")
    @patch.object(MODULE, "audit_npm_manifest")
    def test_VULN_AC_03_one_parent_bump_records_every_removed_advisory(
        self,
        audit,
        _latest,
        _parent,
    ):
        before = {
            ("alpha", "one"),
            ("alpha", "two"),
            ("unrelated", "keep"),
        }
        after = {("unrelated", "keep")}
        audit.side_effect = [
            (before, "", False),
            (after, "", False),
        ]

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "package.json.tpl"
            path.write_text(
                '{"dependencies":{"parent":"^1.0.0"}}',
                encoding="utf-8",
            )
            result = MODULE.apply_npm_fixes(
                path,
                [
                    finding(str(path), "alpha", "one"),
                    finding(str(path), "alpha", "two"),
                ],
            )

        self.assertEqual(2, len(result.fixed))
        self.assertEqual([], result.errors)
        self.assertIn('"parent":"^3.0.0"', result.content)

    @patch.object(MODULE, "find_top_level_parent", return_value="parent")
    @patch.object(MODULE, "_latest_npm_version", return_value="3.0.0")
    @patch.object(MODULE, "audit_npm_manifest")
    def test_VULN_AC_03_rejects_candidate_that_introduces_new_advisory(
        self,
        audit,
        _latest,
        _parent,
    ):
        audit.side_effect = [
            ({("alpha", "one")}, "", False),
            ({("new-risk", "new")}, "", False),
        ]

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "package.json.tpl"
            original = '{"dependencies":{"parent":"^1.0.0"}}'
            path.write_text(original, encoding="utf-8")
            result = MODULE.apply_npm_fixes(
                path,
                [finding(str(path), "alpha", "one")],
            )

        self.assertEqual(original, result.content)
        self.assertEqual(1, len(result.no_fix))

    @patch.object(MODULE, "audit_npm_manifest")
    def test_VULN_AC_09_manifest_audit_error_is_operational(self, audit):
        audit.return_value = (set(), "npm install failed", True)

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "package.json.tpl"
            original = '{"dependencies":{"parent":"^1.0.0"}}'
            path.write_text(original, encoding="utf-8")
            result = MODULE.apply_npm_fixes(
                path,
                [finding(str(path), "alpha", "one")],
            )

        self.assertEqual(original, result.content)
        self.assertEqual(1, len(result.errors))
        self.assertEqual([], result.fixed)


class ApplyNuGetFixesTests(unittest.TestCase):
    def test_VULN_AC_08_transitive_finding_is_no_fix_without_project_change(self):
        vulnerable = finding(
            "templates/vs/app.csproj.tpl",
            "Transitive.Package",
            "https://example.test/advisory",
        )
        vulnerable["is_direct"] = False
        original = '<Project Sdk="Microsoft.NET.Sdk"></Project>'

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "app.csproj.tpl"
            path.write_text(original, encoding="utf-8")
            result = MODULE.apply_nuget_fixes(path, [vulnerable])

        self.assertEqual(original, result.content)
        self.assertEqual(1, len(result.no_fix))
        self.assertIn("transitive", result.no_fix[0]["reason"])

    @patch.object(MODULE, "build_nuget_candidate")
    @patch.object(MODULE, "audit_nuget_project")
    def test_VULN_AC_03_direct_candidate_is_kept_only_after_clean_audit(
        self,
        audit,
        build_candidate,
    ):
        vulnerable = finding(
            "templates/vs/app.csproj.tpl",
            "Direct.Package",
            "https://example.test/advisory",
        )
        vulnerable["is_direct"] = True
        original = (
            '<Project><ItemGroup><PackageReference Include="Direct.Package" '
            'Version="1.0.0" /></ItemGroup></Project>'
        )
        candidate = original.replace("1.0.0", "2.0.0")
        audit.side_effect = [
            (
                {("Direct.Package", "https://example.test/advisory")},
                "",
                False,
            ),
            (set(), "", False),
        ]
        build_candidate.return_value = (candidate, "direct package bump to 2.0.0")

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "app.csproj.tpl"
            path.write_text(original, encoding="utf-8")
            result = MODULE.apply_nuget_fixes(path, [vulnerable])

        self.assertEqual(candidate, result.content)
        self.assertEqual(1, len(result.fixed))


class RollingPullRequestTests(unittest.TestCase):
    @patch.object(MODULE, "run")
    def test_VULN_AC_04_open_pr_branch_merges_dev_and_is_reused(self, run):
        run.side_effect = [
            Mock(
                returncode=0,
                stdout='[{"number":42,"url":"https://example.test/42"}]',
            ),
            Mock(returncode=0),
            Mock(returncode=0),
            Mock(returncode=0),
        ]

        state = MODULE.prepare_rolling_branch(
            repo="owner/repo",
            repo_root=Path("."),
            base_branch="dev",
            branch="auto-fix-vuln/rolling",
        )

        self.assertEqual(42, state.pr_number)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertIn(
            ["git", "checkout", "-B", "auto-fix-vuln/rolling",
             "origin/auto-fix-vuln/rolling"],
            commands,
        )
        self.assertIn(["git", "merge", "--no-edit", "origin/dev"], commands)

    @patch.object(MODULE, "run")
    def test_VULN_AC_06_closed_pr_does_not_suppress_new_branch(self, run):
        run.side_effect = [
            Mock(returncode=0, stdout="[]"),
            Mock(returncode=0),
            Mock(returncode=0),
            Mock(returncode=0),
        ]

        state = MODULE.prepare_rolling_branch(
            repo="owner/repo",
            repo_root=Path("."),
            base_branch="dev",
            branch="auto-fix-vuln/rolling",
        )

        self.assertIsNone(state.pr_number)

    @patch.object(MODULE, "run")
    def test_VULN_AC_09_merge_conflict_is_an_operational_failure(self, run):
        run.side_effect = [
            Mock(
                returncode=0,
                stdout='[{"number":42,"url":"https://example.test/42"}]',
            ),
            Mock(returncode=0),
            Mock(returncode=0),
            Mock(returncode=1, stderr="CONFLICT"),
        ]

        with self.assertRaises(MODULE.RollingPrError):
            MODULE.prepare_rolling_branch(
                repo="owner/repo",
                repo_root=Path("."),
                base_branch="dev",
                branch="auto-fix-vuln/rolling",
            )


class PublishRollingPullRequestTests(unittest.TestCase):
    @patch.object(MODULE, "run")
    def test_VULN_AC_05_diff_without_open_pr_creates_one_pr(self, run):
        run.side_effect = [
            Mock(returncode=0),
            Mock(
                returncode=0,
                stdout="https://github.com/owner/repo/pull/43\n",
            ),
        ]

        result = MODULE.publish_rolling_pr(
            state=MODULE.RollingPrState(pr_number=None, pr_url=""),
            repo="owner/repo",
            repo_root=Path("."),
            base_branch="dev",
            branch="auto-fix-vuln/rolling",
            body_file=Path("body.md"),
            branch_advanced=True,
        )

        self.assertEqual("created", result.action)
        self.assertEqual("https://github.com/owner/repo/pull/43", result.pr_url)

    @patch.object(MODULE, "run")
    def test_VULN_AC_07_no_diff_and_no_open_pr_does_nothing(self, run):
        result = MODULE.publish_rolling_pr(
            state=MODULE.RollingPrState(pr_number=None, pr_url=""),
            repo="owner/repo",
            repo_root=Path("."),
            base_branch="dev",
            branch="auto-fix-vuln/rolling",
            body_file=Path("body.md"),
            branch_advanced=False,
        )

        self.assertEqual("none", result.action)
        run.assert_not_called()

    @patch.object(MODULE, "run")
    def test_VULN_AC_09_push_failure_is_an_operational_failure(self, run):
        run.return_value = Mock(returncode=1, stderr="rejected")

        with self.assertRaises(MODULE.RollingPrError):
            MODULE.publish_rolling_pr(
                state=MODULE.RollingPrState(pr_number=42, pr_url="url"),
                repo="owner/repo",
                repo_root=Path("."),
                base_branch="dev",
                branch="auto-fix-vuln/rolling",
                body_file=Path("body.md"),
                branch_advanced=True,
            )

    @patch.object(MODULE, "run")
    def test_VULN_AC_09_pr_create_failure_is_an_operational_failure(self, run):
        run.side_effect = [
            Mock(returncode=0),
            Mock(returncode=1, stderr="API failure"),
        ]

        with self.assertRaises(MODULE.RollingPrError):
            MODULE.publish_rolling_pr(
                state=MODULE.RollingPrState(pr_number=None, pr_url=""),
                repo="owner/repo",
                repo_root=Path("."),
                base_branch="dev",
                branch="auto-fix-vuln/rolling",
                body_file=Path("body.md"),
                branch_advanced=True,
            )

    @patch.object(MODULE, "run")
    def test_VULN_AC_09_pr_edit_failure_is_an_operational_failure(self, run):
        run.side_effect = [
            Mock(returncode=0),
            Mock(returncode=1, stderr="edit failed"),
        ]

        with self.assertRaises(MODULE.RollingPrError):
            MODULE.publish_rolling_pr(
                state=MODULE.RollingPrState(pr_number=42, pr_url="url"),
                repo="owner/repo",
                repo_root=Path("."),
                base_branch="dev",
                branch="auto-fix-vuln/rolling",
                body_file=Path("body.md"),
                branch_advanced=True,
            )


class DryRunTests(unittest.TestCase):
    @patch.object(MODULE, "publish_rolling_pr")
    @patch.object(MODULE, "prepare_rolling_branch")
    @patch.object(MODULE, "apply_npm_fixes")
    def test_VULN_AC_11_dry_run_reports_fix_without_mutation(
        self,
        apply_fixes,
        prepare_branch,
        publish_pr,
    ):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest_path = root / "package.json.tpl"
            original = '{"dependencies":{"alpha":"1.0.0"}}'
            manifest_path.write_text(original, encoding="utf-8")
            scan_path = root / "scan.json"
            scan_path.write_text(
                json.dumps({
                    "scan_target": "templates/vsc",
                    "ecosystem": "npm",
                    "has_vulnerabilities": True,
                    "vulnerabilities": [
                        finding("package.json.tpl", "alpha", "one")
                    ],
                    "errors": [],
                }),
                encoding="utf-8",
            )
            apply_fixes.return_value = MODULE.FileFixResult(
                content='{"dependencies":{"alpha":"2.0.0"}}',
                fixed=[finding("package.json.tpl", "alpha", "one")],
            )

            result = MODULE.run_pipeline(
                scan_paths=[scan_path],
                repo_root=root,
                repo="",
                base_branch="dev",
                rolling_branch="auto-fix-vuln/rolling",
                dry_run=True,
            )

            self.assertEqual(original, manifest_path.read_text(encoding="utf-8"))

        self.assertEqual(1, len(result["fixed"]))
        prepare_branch.assert_not_called()
        publish_pr.assert_not_called()


class July14ReplayTests(unittest.TestCase):
    def test_VULN_AC_05_three_serialize_findings_share_one_rolling_change_set(self):
        fixture = (
            Path(__file__).parent
            / "fixtures"
            / "vuln-vsc-2026-07-14.json"
        )
        scan = json.loads(fixture.read_text(encoding="utf-8"))
        serialize = [
            finding
            for finding in scan["vulnerabilities"]
            if finding["package"] == "serialize-javascript"
        ]

        groups = MODULE.group_findings(
            [("npm", finding) for finding in serialize]
        )

        self.assertEqual(3, len(groups))
        self.assertEqual(
            {
                "templates/vsc/ts/office-addin-excel-cfshortcut/package.json.tpl",
                "templates/vsc/ts/office-addin-outlook-taskpane/package.json.tpl",
                "templates/vsc/ts/office-addin-wxpo-taskpane/package.json.tpl",
            },
            {file_name for _, file_name in groups},
        )
        self.assertEqual(MODULE.ROLLING_BRANCH, "auto-fix-vuln/rolling")


if __name__ == "__main__":
    unittest.main()
