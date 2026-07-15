#!/usr/bin/env python3
"""Unit tests for the pnpm lockfile vulnerability automation.

Run: ``python -m unittest discover -s .github/scripts/tests`` (no third-party
dependencies; pnpm/git/gh are never invoked — the process wrappers are stubbed).
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]


def _load(module_name: str):
    spec = importlib.util.spec_from_file_location(
        module_name, SCRIPTS_DIR / f"{module_name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


fix = _load("fix_pnpm_lock_vulnerabilities")
render = _load("render_vuln_summary")


STANDALONE_LOCK = """lockfileVersion: '6.0'

settings:
  autoInstallPeers: true

dependencies:
  '@microsoft/teamsfx-api':
    specifier: workspace:*
    version: link:../api
  validator:
    specifier: ^13.7.0
    version: 13.7.0

packages:
  /validator@13.7.0:
    resolution: {integrity: sha512-fake}
    dev: false
"""

WORKSPACE_ROOT_LOCK = """lockfileVersion: '6.0'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      validator:
        specifier: ^13.7.0
        version: 13.7.0
"""


def _audit_doc(*advisories):
    return {
        "advisories": {
            adv["id"]: {
                "module_name": adv["package"],
                "severity": adv["severity"],
                "url": adv.get("url"),
                "title": adv.get("title"),
                "patched_versions": adv.get("patched", ">=1.0.0"),
                "findings": [{"version": v} for v in adv.get("versions", [])],
            }
            for adv in advisories
        },
        "metadata": {"vulnerabilities": {}},
    }


class ParseAdvisoriesTest(unittest.TestCase):
    def test_filters_below_threshold_and_normalizes(self):
        doc = _audit_doc(
            {"id": "1", "package": "validator", "severity": "high",
             "versions": ["13.7.0"], "url": "u", "title": "t"},
            {"id": "2", "package": "chalk", "severity": "low", "versions": ["1.0.0"]},
        )
        advs = fix.parse_advisories(doc, ("moderate", "high", "critical"))
        self.assertEqual(len(advs), 1)
        self.assertEqual(advs[0]["package"], "validator")
        self.assertEqual(advs[0]["current_versions"], ["13.7.0"])

    def test_sorted_by_severity(self):
        doc = _audit_doc(
            {"id": "1", "package": "b", "severity": "moderate", "versions": ["1"]},
            {"id": "2", "package": "a", "severity": "critical", "versions": ["1"]},
        )
        advs = fix.parse_advisories(doc, ("moderate", "high", "critical"))
        self.assertEqual([a["package"] for a in advs], ["a", "b"])


class LockClassificationTest(unittest.TestCase):
    def _write(self, text):
        tmp = Path(tempfile.mkdtemp()) / "pnpm-lock.yaml"
        tmp.write_text(text, encoding="utf-8")
        return tmp

    def test_standalone(self):
        self.assertFalse(fix.is_workspace_root_lock(self._write(STANDALONE_LOCK)))

    def test_workspace_root(self):
        self.assertTrue(fix.is_workspace_root_lock(self._write(WORKSPACE_ROOT_LOCK)))

    def test_package_versions(self):
        self.assertEqual(fix.package_versions(STANDALONE_LOCK, "validator"), ["13.7.0"])
        self.assertEqual(fix.package_versions(STANDALONE_LOCK, "missing"), [])


class StandalonePrepTest(unittest.TestCase):
    def test_link_target_lookup(self):
        target = fix.lockfile_link_target(STANDALONE_LOCK, "@microsoft/teamsfx-api")
        self.assertEqual(target, "link:../api")

    def test_apply_and_restore(self):
        pkg_dir = Path(tempfile.mkdtemp())
        (pkg_dir / "package.json").write_text(json.dumps({
            "name": "x",
            "dependencies": {
                "@microsoft/teamsfx-api": "workspace:*",
                "validator": "^13.7.0",
            },
        }), encoding="utf-8")
        prep = fix.StandalonePrep(pkg_dir)
        self.assertTrue(prep.apply(STANDALONE_LOCK))
        data = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(data["dependencies"]["@microsoft/teamsfx-api"], "link:../api")
        # lockfile specifier restoration turns link: back to workspace:*
        rewritten = STANDALONE_LOCK.replace(
            "specifier: workspace:*", "specifier: link:../api"
        )
        restored = prep.restore_lock_specifiers(rewritten)
        self.assertIn("specifier: workspace:*", restored)
        self.assertNotIn("specifier: link:../api", restored)
        prep.restore_package_json()
        data = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(data["dependencies"]["@microsoft/teamsfx-api"], "workspace:*")


class _FakePnpm:
    """Scriptable stand-in for the module-level pnpm wrappers."""

    def __init__(self, audit_sequence, update_result=(True, ""), update_writes=None):
        self._audits = list(audit_sequence)
        self._update_result = update_result
        self._update_writes = update_writes  # (lock_path, new_text) applied on update

    def audit(self, cwd, *, standalone, audit_level):
        return self._audits.pop(0) if self._audits else _audit_doc()

    def update(self, cwd, packages, *, standalone):
        if self._update_writes:
            path, new_text = self._update_writes
            path.write_text(new_text, encoding="utf-8")
        return self._update_result


class ProcessLockfileTest(unittest.TestCase):
    def setUp(self):
        self._orig_audit = fix.pnpm_audit
        self._orig_update = fix.pnpm_update
        self.repo = Path(tempfile.mkdtemp())
        self.lock = self.repo / "pnpm-lock.yaml"
        self.lock.write_text(STANDALONE_LOCK, encoding="utf-8")

    def tearDown(self):
        fix.pnpm_audit = self._orig_audit
        fix.pnpm_update = self._orig_update

    def _install(self, fake):
        fix.pnpm_audit = fake.audit
        fix.pnpm_update = fake.update

    def test_happy_path_records_fix_and_bumps_lockfile(self):
        fixed_text = STANDALONE_LOCK.replace("13.7.0", "13.15.22")
        fake = _FakePnpm(
            audit_sequence=[
                _audit_doc({"id": "1", "package": "validator", "severity": "high",
                            "versions": ["13.7.0"], "url": "u", "title": "t"}),
                _audit_doc(),  # re-audit clean
            ],
            update_writes=(self.lock, fixed_text),
        )
        self._install(fake)
        res = fix.process_lockfile(self.lock, self.repo,
                                   audit_level="moderate",
                                   fix_severities=("moderate", "high", "critical"))
        self.assertEqual(len(res["fixed"]), 1)
        self.assertEqual(res["fixed"][0]["package"], "validator")
        self.assertEqual(res["fixed"][0]["current_version"], "13.7.0")
        self.assertEqual(res["fixed"][0]["fixed_version"], "13.15.22")
        self.assertIn("13.15.22", self.lock.read_text(encoding="utf-8"))

    def test_unresolved_reverts_and_skips(self):
        fake = _FakePnpm(
            audit_sequence=[
                _audit_doc({"id": "1", "package": "validator", "severity": "high",
                            "versions": ["13.7.0"]}),
                _audit_doc({"id": "1", "package": "validator", "severity": "high",
                            "versions": ["13.7.0"]}),  # still present after update
            ],
            update_writes=(self.lock, STANDALONE_LOCK.replace("13.7.0", "13.8.0")),
        )
        self._install(fake)
        res = fix.process_lockfile(self.lock, self.repo,
                                   audit_level="moderate",
                                   fix_severities=("moderate", "high", "critical"))
        self.assertEqual(res["fixed"], [])
        self.assertEqual(len(res["skipped"]), 1)
        self.assertIn("no compatible fix", res["skipped"][0]["reason"])
        # lockfile reverted to original
        self.assertEqual(self.lock.read_text(encoding="utf-8"), STANDALONE_LOCK)

    def test_update_failure_skips_without_touching_lockfile(self):
        fake = _FakePnpm(
            audit_sequence=[
                _audit_doc({"id": "1", "package": "validator", "severity": "high",
                            "versions": ["13.7.0"]}),
            ],
            update_result=(False, "ERR boom"),
        )
        self._install(fake)
        res = fix.process_lockfile(self.lock, self.repo,
                                   audit_level="moderate",
                                   fix_severities=("moderate", "high", "critical"))
        self.assertEqual(res["fixed"], [])
        self.assertIn("pnpm update failed", res["skipped"][0]["reason"])
        self.assertEqual(self.lock.read_text(encoding="utf-8"), STANDALONE_LOCK)

    def test_clean_lockfile_no_work(self):
        fake = _FakePnpm(audit_sequence=[_audit_doc()])
        self._install(fake)
        res = fix.process_lockfile(self.lock, self.repo,
                                   audit_level="moderate",
                                   fix_severities=("moderate", "high", "critical"))
        self.assertEqual(res["fixed"], [])
        self.assertEqual(res["skipped"], [])
        self.assertEqual(res["vuln_count"], 0)

    def test_audit_failure_records_error(self):
        def boom(*a, **k):
            raise RuntimeError("network down")
        fix.pnpm_audit = boom
        res = fix.process_lockfile(self.lock, self.repo,
                                   audit_level="moderate",
                                   fix_severities=("moderate", "high", "critical"))
        self.assertIsNotNone(res["error"])
        self.assertIn("audit failed", res["error"])


class BuildManifestTest(unittest.TestCase):
    def test_aggregates_multiple_lockfiles_into_single_pr_shape(self):
        results = [
            {"lockfile": "pnpm-lock.yaml", "standalone": False, "vuln_count": 2,
             "error": None,
             "fixed": [{"package": "validator", "severity": "high",
                        "current_version": "13.7.0", "fixed_version": "13.15.22",
                        "advisory_url": "u", "title": "t"}],
             "skipped": []},
            {"lockfile": "packages/server/pnpm-lock.yaml", "standalone": True,
             "vuln_count": 1, "error": None,
             "fixed": [{"package": "tar-fs", "severity": "high",
                        "current_version": "2.1.1", "fixed_version": "2.1.3",
                        "advisory_url": "u2", "title": "t2"}],
             "skipped": [{"package": "left-pad", "severity": "moderate",
                          "advisory_url": None, "title": None,
                          "reason": "no compatible fix (needs major upgrade or override)"}]},
        ]
        manifest = fix.build_manifest(results, branch="auto-fix-vuln/pnpm-lockfiles")
        self.assertTrue(manifest["has_changes"])
        self.assertEqual(len(manifest["new_prs"]), 2)
        self.assertEqual(len(manifest["skipped_no_fix"]), 1)
        self.assertEqual(
            set(manifest["changed_lockfiles"]),
            {"pnpm-lock.yaml", "packages/server/pnpm-lock.yaml"},
        )
        self.assertEqual(manifest["max_prs"], 1)

    def test_error_lockfile_surfaces_as_skip(self):
        results = [{"lockfile": "x/pnpm-lock.yaml", "standalone": True,
                    "vuln_count": 0, "error": "audit failed: boom",
                    "fixed": [], "skipped": []}]
        manifest = fix.build_manifest(results, branch="b")
        self.assertFalse(manifest["has_changes"])
        self.assertEqual(len(manifest["skipped_no_fix"]), 1)
        self.assertIn("audit failed", manifest["skipped_no_fix"][0]["reason"])


class RenderMergeTest(unittest.TestCase):
    def _template_manifest(self):
        return {
            "max_prs": 1,
            "scans": [{"scan_target": "templates/vsc", "ecosystem": "npm", "vuln_count": 1}],
            "new_prs": [{"package": "lodash", "severity": "high",
                         "fixed_version": "4.17.21", "pr_url": "https://x/1",
                         "strategy": "direct"}],
            "skipped_existing": [],
            "skipped_no_fix": [],
            "skipped_over_limit": [],
        }

    def _pnpm_manifest(self):
        return {
            "max_prs": 1,
            "scans": [{"scan_target": "pnpm-lock.yaml", "ecosystem": "pnpm", "vuln_count": 1}],
            "new_prs": [{"package": "validator", "severity": "high",
                         "fixed_version": "13.15.22", "pr_url": "https://x/2",
                         "strategy": "pnpm compatible bump"}],
            "skipped_existing": [],
            "skipped_no_fix": [{"package": "tar-fs", "severity": "high",
                                "reason": "needs major"}],
            "skipped_over_limit": [],
        }

    def test_merge_combines_rows_and_caps(self):
        merged = render.merge_manifests([self._template_manifest(), self._pnpm_manifest()])
        self.assertEqual(len(merged["scans"]), 2)
        self.assertEqual(len(merged["new_prs"]), 2)
        self.assertEqual(len(merged["skipped_no_fix"]), 1)
        self.assertEqual(merged["max_prs"], 2)

    def test_merge_single_is_identity(self):
        m = self._pnpm_manifest()
        self.assertIs(render.merge_manifests([m]), m)

    def test_markdown_and_subject_reflect_merge(self):
        merged = render.merge_manifests([self._template_manifest(), self._pnpm_manifest()])
        md = render.render_markdown([], merged)
        self.assertIn("validator", md)
        self.assertIn("lodash", md)
        self.assertIn("Total vulnerabilities:** 2", md)
        subject = render.render_subject([], merged)
        self.assertIn("2 new PR(s)", subject)


if __name__ == "__main__":
    unittest.main()
