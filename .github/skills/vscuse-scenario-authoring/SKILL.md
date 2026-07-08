---
name: vscuse-scenario-authoring
description: "Use when: reading a docs scenario, PRD, mockup, or user flow and using vscuse-ui/noVNC as the primary authoring surface to record, generate, replace, or update vscuse test plans; decide existing coverage vs new case; validate product behavior against docs, then finish with vscuse CLI validation."
argument-hint: "Docs/mockup path and scenario to record or map to vscuse coverage"
---

# vscuse Scenario Authoring

## Goal

Use docs, PRDs, scenarios, or mockups as the source of truth for vscuse coverage. Use `vscuse-ui` and noVNC as the primary authoring surface: execute the scenario in a real vscuse desktop, decide whether product behavior matches the docs, and then update existing test coverage or generate a new plan. Use `vscuse execute` afterward as the final CI-parity validation.

This workflow is for authoring or refreshing vscuse coverage. For diagnosing an already-failing case, use `vscuse-case-diagnosis`.

## Required Inputs

- Docs/mockup/scenario path or quoted scenario text.
- The feature area or expected user workflow.
- Whether the expected UI already exists in product code. vscuse-ui cannot execute future UI that has not been implemented.
- Feature flags from the docs scenario, especially any `## Feature flags` section or acceptance criteria that depends on `featureFlag(...)`.

## Core Rules

- Docs/mockups define expected behavior, but `vscuse-ui` does not automatically understand or execute docs. The agent or human must perform the scenario in the live noVNC desktop.
- Prefer `vscuse-ui` for creating or repairing case steps. It is the fastest way to inspect live UI state, record changed interactions, refresh screenshots, and edit steps. Treat the CLI as the final verifier, not the primary authoring surface.
- Use the integrated browser at `http://localhost:6080/vnc.html` as the live evidence surface.
- Treat `vscuse-ui` generated plans as drafts until cleaned, parsed, and rerun with `vscuse execute`.
- If product behavior does not match the docs, classify it as a product gap or bug before changing coverage.
- When a draft scenario explicitly replaces shipped behavior, treat the draft doc as the source of truth for the covered case. Existing vscuse steps that encode the old behavior are test plan drift, even if they used to pass.
- Do not commit empty `r_*.json` recordings or exploratory generated plans.
- Do not hardcode app names, paths, tenant data, API keys, or secrets captured during recording.
- Scenario feature flags must enter the target plan as `plan_metadata.tags` entries such as `feature_flag:TEAMSFX_MCP_FOR_DA_DT=true`. Do not leave them only in a local shell command or narrative notes.
- Prefer keyboard-driven steps over pointer-driven steps when authoring or cleaning recordings. Quick picks, command palette commands, focused default buttons, and simple selections should usually become `key_press`/`type_text` steps instead of coordinate `click` steps.
- When converting quick-pick clicks to `key_press enter`, preserve or create the wait condition that proves the intended row is loaded and highlighted. A keyboard action without a prompt-specific precondition can run before the list appears and type subsequent input into the wrong quick pick.
- When recording captures equivalent labels for the same action, such as Teams `Add` versus `Open`, author the case around the shared user intent: assertion accepts either label, the action is semantic/OCR-backed when keyboard is unavailable, and the next assertion verifies the converged outcome.
- When a prompt is conditional, record the observed UI first, then convert it into an optional guarded step: prompt-specific preconditions, short `precondition_wait_timeout:X`, no `force_run:true`, and `continue_on_error` only if the runner is known to honor it.

## Procedure

### 1. Extract the Scenario From Docs

Read the docs/mockup and write down the testable contract:

- Source path and scenario title.
- Start state and required prerequisites.
- User actions in order.
- Expected visible UI at each important state.
- Expected generated files, env files, debug target, command labels, or Teams/browser behavior.
- Required feature flags and expected values.
- Negative/error states if they are part of the scenario.

If the docs are ambiguous, ask for the intended scenario rather than inventing hidden product behavior.

### 2. Map Existing Coverage

Search existing vscuse assets under `packages/tests/vscuse/vscode-test-cases` for:

- Plan names and descriptions.
- Shared group names.
- Command labels and visible UI strings.
- Template names, generated file names, debug configuration names, and provider names.

Decision rules:

- Same workflow with changed UI/assertions/waits: update the existing plan or group.
- Shared flow changed: update the shared group, then rerun one focused consumer plan.
- New workflow, language, provider, debug target, or major branch: create a new plan.
- Existing workflow but different feature-flag preconditions: update the plan metadata with `feature_flag:*` tags, and split into a separate plan when flag-on and flag-off behavior both need coverage.
- Future UI not implemented: report product gap; do not create a passing case that hides the gap.

### Source-of-Truth Override: DA Create With MCP Server

For `SCN-DA-CREATE-WITH-MCP-SERVER`, use `docs/01-product/scenarios/da/draft/create-da-with-mcp-server.md` as the source of truth when the user points at that draft. With `TEAMSFX_MCP_FOR_DA_DT=true`, the create-flow case must not continue the legacy fetch-tools/static operation selection path:

- Do not click `Fetch action from MCP`, `Fetch from MCP`, or `Select Operation(s) Copilot can interact with` as part of the create scenario.
- Validate the generated dynamic project shape instead: no `appPackage/mcp-tools-1.json`; `appPackage/ai-plugin.json` has an MCP server runtime for the entered URL, empty `functions`, no `mcp_tool_description`, and `run_for_functions: ["*"]`; `appPackage/declarativeAgent.json` references `action_1`; `.vscode/mcp.json` points at the MCP server URL.
- For `None` auth, `m365agents.yml` must not inject `oauth/register` or `dcr/register`.
- Run the edited plan end-to-end in `vscuse-ui`/noVNC first. Use CLI only after the UI flow has demonstrated that the saved case reaches the expected generated-project state.

### 3. Start vscuse-ui

From the repository root:

```powershell
.\set-azure-env.ps1 -Env atk06
$env:TEMPLATE_VERSION = "local"
$env:VSCUSE_VSCODE_IMAGE = "vscuse-atk-local:latest"

$dockerCliDir = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path (Join-Path $dockerCliDir "docker.exe")) {
   $env:PATH = "$dockerCliDir;$env:PATH"
}

# Apply scenario-specific flags from the docs before starting vscuse-ui.
$env:TEAMSFX_MCP_FOR_DA_DT = "true"
$env:TEAMSFX_MCP_FOR_DA_DCR = "true"

Push-Location packages/tests/vscuse/vscode-test-cases
$vscuseUi = Join-Path $env:APPDATA "Python\Python312\Scripts\vscuse-ui.exe"
& $vscuseUi --config-file .\config.yaml --project-path .\plans
Pop-Location
```

Replace the sample flag names with the docs scenario's actual flags. If a generated or updated plan depends on these flags, add matching metadata tags to the plan before review:

```json
"tags": [
   "feature_flag:TEAMSFX_MCP_FOR_DA_DT=true",
   "feature_flag:TEAMSFX_MCP_FOR_DA_DCR=true"
]
```

If the flags or `TEMPLATE_VERSION=local` do not reach the VS Code container with the config used for recording, use a temporary vscuse config that injects only those scenario flags and local template routing under `docker.environment` before starting `vscuse-ui`. Do not classify docs/product behavior until the container env confirms the expected template version and flags.

Expected services:

```text
Web UI / API:  http://127.0.0.1:6082
noVNC Viewer:  http://127.0.0.1:6080
Docker API:    http://127.0.0.1:6081
```

### 4. Execute the Docs Scenario in the Integrated Browser

Open `http://localhost:6080/vnc.html` in the integrated browser, connect, and perform the docs scenario in the real container desktop.

At each important state, compare the live UI against the docs/mockup:

- If the product does not match, stop and report the product gap or bug.
- If the product matches, continue to record or update coverage.

### 5. Record, Edit, or Update Coverage in vscuse-ui

Use the UI workflow first when available. Do not hand-edit JSON first when the change is visual, order-dependent, or easier to observe in the live desktop.

1. Load the existing plan or create a new recording.
2. Use `Run`, `Continue`, or `Next` to reach the relevant state when an existing plan is close.
3. Start recording before the scenario segment that changed, or add/edit a step manually in the UI when that is clearer.
4. Perform the real interaction in noVNC.
5. Stop recording.
6. Generate executable steps or a draft plan.
7. Merge only the useful steps into the target plan/group.
8. Preserve or add the `feature_flag:*` plan tags that make the recording reproducible.

Use direct JSON edits only for changes that are easier to review as text, such as variable names, metadata tags, descriptions, or removing clearly exploratory generated files. After direct edits, reload the plan in `vscuse-ui` before relying on the UI state.

When cleaning recorded interactions:

- Convert command palette and quick-pick clicks to keyboard flows whenever possible: `key_press f1`, `type_text`, `key_press enter`.
- Convert selected/default quick-pick choices to `key_press enter` with the quick-pick precondition instead of clicking the row, unless the row order or selected state is ambiguous. If the selected row loads after the prompt opens, use a precondition wait on that row rather than an immediate Enter.
- Use `click` only when the target is not keyboard-reachable or when the scenario specifically validates pointer behavior.
- Do not assume `timeout` makes a visual precondition optional; use `precondition_wait_timeout:X` and verify the loaded plan in vscuse-ui after editing.
- Reload the vscuse-ui tab or use `Restart`/`Clear` after direct JSON edits, because old execution results can remain visible and look like current failures.

For API-driven recording, the verified endpoints are:

```text
POST /api/recording/start
POST /api/recording/stop/{recording_id}
POST /api/recording/{recording_id}/executable_plan
POST /api/recording/{recording_id}/extract_steps
```

### 6. Clean Generated Content

Before considering any generated plan reviewable:

- Delete empty or exploratory `r_*.json` files.
- Replace recorded app names with `${{var:app_name}}`.
- Replace hardcoded project paths with variable-driven paths.
- Preserve secret references; never paste secret values into JSON.
- Replace tenant-specific data and generated IDs with runtime variables when possible.
- Preserve scenario feature flags as plan metadata tags; do not bury them in prose-only notes.
- Keep assertions about stable product behavior, not exact screenshot coincidence.
- Update `dhash` preconditions only for intentional visual states and stable regions.
- Avoid full-image preconditions on screens with cursor, tooltip, toast, or loading variance.

### 7. Validate the Authored Plan

Parse changed JSON:

```powershell
Get-Content packages/tests/vscuse/vscode-test-cases/plans/<plan-name>.json -Raw | ConvertFrom-Json | Out-Null
```

Then run the focused case with `vscuse execute`. This final run is required even if the flow looked correct in `vscuse-ui`, because the CLI starts from a clean container and matches CI behavior:

```powershell
Push-Location packages/tests/vscuse/vscode-test-cases
vscuse execute --config-file .\config.yaml --groups-dir groups .\plans\<plan-name>.json
Pop-Location
```

Final coverage is valid only after this executable run passes or after any failure is classified and reported.

## Final Report

Report:

- Docs/mockup source and scenario title.
- Existing plan/group mapping, or why a new plan was needed.
- Scenario feature flags and whether they were written into plan metadata.
- Integrated browser evidence: whether the live noVNC execution matched the docs.
- Product behavior verdict: matches docs, product bug, product gap, setup failure, or flake.
- Plan maintenance decision: updated existing plan/group, replaced steps, or generated a new plan.
- Cleanup performed on generated content.
- Final `vscuse execute` result and report path.
