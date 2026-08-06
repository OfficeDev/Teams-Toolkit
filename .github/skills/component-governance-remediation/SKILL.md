---
name: component-governance-remediation
description: "Use when: retrieving, exporting, triaging, or remediating Azure DevOps Component Governance alerts for this repository, including CG report URLs, vulnerable pnpm dependencies, package feed availability, snapshot filtering, lockfile updates, and alert dismissals."
argument-hint: "Provide the Component Governance report URL and whether to retrieve, triage, or remediate alerts"
---

# Component Governance Remediation

## Goal

Retrieve the exact active alert set represented by an Azure DevOps Component Governance page, map each alert to this repository's PNPM dependency graphs, remediate actionable versions, and leave auditable validation evidence without committing generated reports.

This is a maintenance workflow. Do not use `vibe-coding` unless the remediation also changes product behavior or architecture.

## Inputs

Start from the complete Component Governance report URL. It carries two identifiers that must remain paired:

- The path ID after `_componentGovernance/` is the governed repository ID.
- The `typeId` query parameter is the snapshot type ID shown by that report view.

Also record the organization, project, and branch. Do not substitute Azure DevOps Advanced Security alerts for Component Governance alerts; they are different data sources.

## Retrieve Active Alerts

Prerequisites:

```powershell
az account show --output none
```

Use the existing Azure CLI identity. Do not request or print a PAT when `az rest` can authenticate the request.

From the repository root, run the bundled script with the full report URL:

```powershell
& .\.github\skills\component-governance-remediation\scripts\get-active-alerts.ps1 `
  -ReportUrl "<component-governance-report-url>" `
  -Branch "<branch>"
```

Omit `-Branch` only when governed-repository metadata exposes a default branch. The default output is:

```text
results/component-governance-<governed-repository-id>-active-alerts-full.json
```

The script refuses to write reports to a non-ignored path inside this repository. Confirm generated evidence remains local:

```powershell
git check-ignore -v results/component-governance-*.json
git status --short
```

The branch Alerts API returns historical records, including fixed alerts. Treat an alert as in scope only when all three conditions hold:

1. Top-level `alertState` is `active`.
2. A `stateDetails` entry has `alertState == active`.
3. The same state entry has the report's `snapshotTypeId`.

Read [the API reference](./references/ado-component-governance-api.md) when authentication, routing, response shape, or preview-version behavior needs diagnosis.

## Triage

For each active alert, record:

- Alert ID, severity, vulnerability title, component, and vulnerable version.
- `actionItems` and any package-specific guidance.
- Every lockfile containing the exact resolved package entry.
- Whether the dependency is direct, transitive through an upgradeable parent, or transitive without a suitable parent release.
- Runtime reachability and the package test surface for cross-major remediation.

Search all PNPM lockfiles, not only the root lockfile. This repository has independently owned lockfiles. Inspect exact package entries rather than override selector text, which can contain a vulnerable version while intentionally resolving it to a fixed version.

Use `https://packagefeedproxy.microsoft.io/npm/` for package metadata and dependency resolution. Before editing a manifest, verify every advisory-approved target version is available from that registry:

```powershell
$registry = "https://packagefeedproxy.microsoft.io/npm/"
npm view <package>@<fixed-version> version --registry $registry
```

If the proxy does not expose a fixed version, do not substitute an unavailable version or the highest still-vulnerable version. Leave that advisory unresolved and record the registry response as the blocker.

Evaluate alerts independently when several advisories target the same component version. Apply an available compatible release that fixes one advisory even if a newer unavailable release is required for another; record exactly which alert IDs the partial remediation fixes and which remain blocked.

Use the owning workspace when tracing dependencies:

```powershell
npx --yes pnpm@8.6.12 --dir <workspace-root> why <package>
npx --yes pnpm@8.6.12 --dir <standalone-package> --ignore-workspace why <package>
```

Shared workspaces own their child importers. A child package's `pnpm.overrides` is ignored when a parent workspace owns the lockfile; place an override at the workspace root that generates that lockfile.

Do not infer that an alert is direct, transitive, or owned by a similarly named package. Prove the resolved entry and parent chain in every lockfile before choosing the manifest to edit.

## Remediate

Use the smallest compatible option in this order:

1. Upgrade a direct dependency to the fixed release.
2. Upgrade the nearest parent dependency that removes the vulnerable transitive version.
3. Add the narrowest exact PNPM override when no suitable parent release exists.
4. Leave the version only when Component Governance guidance explicitly permits dismissal and the repository satisfies every condition.

Edit the dependency or override in the manifest that owns the affected lockfile. Do not use `pnpm add` merely to force a transitive version, and do not add broad overrides when an exact vulnerable selector is sufficient. Do not use `pnpm update` to apply an override-only remediation because it can refresh unrelated dependency ranges. Do not manually edit any lockfile.

Regenerate the shared root lockfile with the repository's PNPM version and required registry:

```powershell
$registry = "https://packagefeedproxy.microsoft.io/npm/"
npx --yes --registry $registry pnpm@8.6.12 install --lockfile-only --registry $registry
```

Packages excluded from `pnpm-workspace.yaml` can still discover the parent workspace. Use `--ignore-workspace` when regenerating an independently owned lockfile; `--dir` alone is not isolation:

```powershell
npx --yes --registry $registry pnpm@8.6.12 `
  --dir <standalone-package> install --ignore-workspace --lockfile-only --registry $registry
```

Generated lockfiles need a stricter conflict workflow than source files. When the target branch and remediation branch contain independent dependency fixes, do not accept `ours` or `theirs` wholesale. Keep the target branch lockfile as the text baseline, retain the remediation manifests, and regenerate through the required proxy first.

If regeneration is blocked by an unrelated optional package or produces only enterprise feed alias churn, a minimal semantic lockfile merge is permitted as a conflict-resolution exception to the normal no-manual-edit rule. Every replacement edge and package node must come from PNPM output generated for the same manifest or from the remediation branch's previously frozen-install-validated lockfile; never invent integrity, tarball, dependency, or feed metadata. Parse the result as YAML, prove the normalized graph delta contains only the intended closure, confirm importer maps are unchanged after feed normalization, and run a frozen install. Treat the native exit code as authoritative because optional package fetch warnings can coexist with a successful install.

Preserve importer structure and PNPM-generated enterprise feed metadata. The proxy can route unchanged packages through different `ms-feed-N.pkgs.visualstudio.com` backends, producing a large text diff without changing the dependency graph. Use an available structured YAML parser rather than assuming a shell-specific YAML cmdlet. Parse the before and after lockfiles, normalize package identities by removing a leading slash and the `ms-feed-N.pkgs.visualstudio.com/` prefix (using `name` and `version` when present), then compare package identity sets and importer dependency maps. Confirm that only intended package versions changed and that importer dependencies did not drift. Text grep or diff size alone is not sufficient evidence.

For a cross-major override, inspect the package's actual runtime use. Use the parent chains to identify every runtime importer, then build and test those importers and add a behavior probe where appropriate; do not try to build a transitive package as though it were a workspace project. If the new graph raises a public package's Node.js floor, declare that floor in its `engines` field.

## Dismissals

Never invent a dismissal endpoint or reason. Use the alert's Component Governance guidance and verify all stated runtime or reachability conditions. Record the alert ID and technical rationale in the PR description or review discussion, but do not commit generated report files or ad hoc dismissal logs.

A fixed version being absent from the required registry is a remediation blocker, not a dismissal justification. Leave the alert active unless its own Component Governance guidance permits dismissal for conditions the repository satisfies.

If dismissal must be submitted and no verified API route is available, use the authenticated Component Governance UI. A dismissal is not a substitute for an available compatible fix.

If the UI is blocked by sign-in, MFA, or device-compliance policy, do not request or handle credentials. Record the alert ID and rationale, and have the user complete the dismissal in a compliant browser.

## Validate

Before opening or updating a PR:

1. Scan every owned lockfile for exact vulnerable resolved entries.
2. Structurally compare normalized package identities and importers in every changed lockfile.
3. Run frozen lockfile installs for the shared workspace and each changed standalone package:

   ```powershell
   npx --yes --registry $registry pnpm@8.6.12 install --frozen-lockfile --registry $registry
   npx --yes --registry $registry pnpm@8.6.12 `
     --dir <standalone-package> install --ignore-workspace --frozen-lockfile --registry $registry
   ```

4. Build every package whose manifest or lockfile changed.
5. Run focused unit tests for each affected package; broaden testing for shared or cross-major changes.
6. Run `git diff --check`.
7. Re-run the retrieval script because active alerts can change during remediation.
8. Compare alert IDs and severity totals with the earlier local snapshot.
9. Confirm `git status --short` does not include generated CG reports.

Component Governance reflects service scans, so a source fix may not disappear immediately. Distinguish a clean local lock scan from a completed server rescan rather than claiming the dashboard is already clear.

## Common Mistakes

- Guessing a public `_apis/componentgovernance` route instead of discovering the resource-area host.
- Filtering only top-level `alertState` and accidentally including another snapshot.
- Treating the full historical response as the current report.
- Using Advanced Security dependency alerts as a replacement for CG data.
- Adding overrides to a child package whose lockfile is owned by a parent workspace.
- Assuming a package excluded from `pnpm-workspace.yaml` cannot discover the parent workspace.
- Running `pnpm update` and unintentionally refreshing unrelated dependency ranges.
- Choosing one side of a generated lockfile conflict and dropping independent security fixes from the other side.
- Treating an optional fetch warning as a failed install without checking the command exit code.
- Choosing a still-vulnerable release because the required fixed version is absent from the package feed.
- Searching lockfile text without distinguishing package entries from override selectors.
- Treating enterprise feed alias churn as dependency graph churn without parsing the lockfile.
- Dismissing an alert only because its fixed version is unavailable from the required registry.
- Committing files under `results/component-governance-*.json`.
- Calling a guessed dismissal API or claiming a server alert is closed before CG rescans.