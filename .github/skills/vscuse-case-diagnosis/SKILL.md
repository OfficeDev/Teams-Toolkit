---
name: vscuse-case-diagnosis
description: "Use when: running an existing vscuse test case, reproducing a failing vscuse plan, deciding product bug vs test plan drift vs setup failure vs flake, repairing a failing case with vscuse-ui/noVNC when useful, and finishing with vscuse CLI validation."
argument-hint: "Plan/case name, failing step, or feature workflow to diagnose"
---

# vscuse Case Diagnosis

## Goal

Run an existing vscuse test case against the current local repository, show the real execution through the integrated browser, and classify any failure as one of:

- `product bug`: the extension or generated app behavior is wrong.
- `test plan drift`: the product behavior is correct but the vscuse plan/group/assertion/precondition is stale.
- `setup failure`: credentials, Docker, GHCR, vscuse runner, env vars, or local image setup blocked execution.
- `flake`: timing, tooltip, transient service state, or visual instability made an otherwise-correct flow unreliable.

Do not make a case green by hiding the classification. The final answer must say what failed, why it failed, what was changed, and what passed afterward.

## Required Inputs

- Plan name, case title, failing step id, report path, or feature workflow.
- Whether the user expects local repository bits. For local validation, use `VSCUSE_VSCODE_IMAGE=vscuse-atk-local:latest` and `TEMPLATE_VERSION=local`.
- Any case-specific feature flags declared in `plan_metadata.tags` as `feature_flag:<NAME>=<VALUE>`, or in the docs scenario that owns the case.

If local setup, image build, runner install, or credentials are missing, use the shared setup guidance in `local-vscuse-validation` first.

## Core Rules

- Use a real `vscuse execute` run. Do not mock the UI flow.
- Prefer `vscuse-ui` for interactive repair after the first failure is classified. It is the default workbench for live inspection, recording changed steps, refreshing visual checks, and demonstrating the repaired flow.
- Still finish with `vscuse execute`. A plan is not validated until it passes a clean CLI run or the remaining failure is explicitly classified.
- Show the live execution through the integrated browser at `http://localhost:6080/vnc.html` when the user asks to demonstrate the process.
- noVNC is a live view of the running container, not a replay. Open it while execution is still running.
- Do not screenshot or print secrets, passwords, tokens, tenant secrets, or generated API keys.
- `--start` and `--end` only work when the required UI state already exists. They do not recreate prior setup.
- Plan/group JSON is read from disk at execution time; edits apply on the next run without rebuilding the image.
- A feature-flagged plan is not self-contained if the flags only live in a previous shell command. The plan should declare them with `feature_flag:*` tags, and the run must apply them before vscuse starts the container and VS Code extension host.
- When the user identifies a docs scenario as the source of truth, compare the case to that doc before preserving old steps. If the doc removes a shipped sub-flow, classify the old steps as test plan drift and do not keep executing them merely because they appear in the existing plan.
- Prefer `key_press` and `type_text` over `click` when a command palette, quick pick, focused button, or default selection can be driven by keyboard. Coordinate clicks with screenshot preconditions are more brittle under layout, zoom, focus, and tooltip changes.
- For semantically equivalent UI states, such as a Teams app button showing either `Add` or `Open`, do not preserve a single-label visual precondition. Accept both states in the assertion, use a semantic/OCR-backed action when keyboard is not available, and validate the shared outcome.
- For optional UI prompts, do not use `force_run:true`. Use prompt-specific preconditions, `key_press` where possible, a short `precondition_wait_timeout:X` tag, and `continue_on_error` only after confirming the runner treats it as a non-failing skip.
- After plan or runner edits, do not trust stale failure rows in an already-open vscuse-ui tab. Reload the tab or click `Restart`/`Clear`, then confirm the UI has reloaded the edited plan before classifying a new failure.

## Procedure

### 1. Locate the Owning Case

Find the plan and any shared groups it expands. Prefer the smallest owning surface:

- Edit the plan when only that case is affected.
- Edit a shared group when the drift belongs to a reused flow and should affect all consumers.
- Edit product code when noVNC/report evidence shows the product behavior is wrong.

### 2. Prepare the Local Runtime

From the repository root:

```powershell
.\set-azure-env.ps1 -Env atk06
$env:TEMPLATE_VERSION = "local"
$env:VSCUSE_VSCODE_IMAGE = "vscuse-atk-local:latest"

$dockerCliDir = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path (Join-Path $dockerCliDir "docker.exe")) {
   $env:PATH = "$dockerCliDir;$env:PATH"
}
```

If the plan declares feature flags, apply them before running `vscuse execute`:

```powershell
$planPath = "packages/tests/vscuse/vscode-test-cases/plans/<plan-name>.json"
$plan = Get-Content $planPath -Raw | ConvertFrom-Json
@($plan.plan_metadata.tags) | Where-Object { $_ -like "feature_flag:*" } | ForEach-Object {
   $pair = $_ -replace "^feature_flag:", ""
   $name, $value = $pair.Split("=", 2)
   Set-Item -Path "Env:$name" -Value $value
}
```

If those flags are not propagated into the VS Code container by the config used for the run, classify the result as a setup failure or precondition miss, not a product bug. Use a temporary run config that injects only the plan-declared flags under `docker.environment`, or update the shared config deliberately when the pass-through is meant to be stable for this repository.

Check only whether required secrets are set, never their values:

```powershell
"M365_ACCOUNT_NAME","M365_ACCOUNT_PASSWORD" | ForEach-Object {
   [PSCustomObject]@{ Name = $_; IsSet = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
}
```

### 3. Execute the Focused Plan

```powershell
Push-Location packages/tests/vscuse/vscode-test-cases
vscuse execute --config-file .\config.yaml --groups-dir groups .\plans\<plan-name>.json
Pop-Location
```

When the user needs to see the process, open the integrated browser to `http://localhost:6080/vnc.html`, click `Connect`, and keep it visible near the failing area.

### 4. Gather Failure Evidence

Use the report and terminal logs to capture:

- Plan id and execution id.
- Failing expanded step id and nearby previous step.
- Report path, usually `packages/tests/vscuse/vscode-test-cases/test_report/test_report.html`.
- Before/after screenshots and assertion reasoning.
- Whether the local image and `TEMPLATE_VERSION=local` were used.
- Declared and applied feature flags, by name and non-secret value only.

### 5. Classify Before Editing

Use this decision table:

| Evidence | Classification | Next Action |
|---|---|---|
| Missing env vars, Docker, GHCR, vscuse wheel, noVNC, or image access | setup failure | Fix setup and rerun the same plan |
| Plan declares feature flags but they were not applied before container/VS Code startup | setup failure | Apply plan-declared flags through the run config and rerun |
| noVNC shows product does not match expected behavior | product bug | Fix product code, rebuild VSIX/image if needed, rerun |
| Product behavior is correct but step text, click target, assertion, wait, or visual hash is stale | test plan drift | Repair plan/group and rerun |
| Same behavior eventually passes; screenshot shows tooltip/toast/loading variance | flake | Stabilize hover/wait/precondition/assertion and rerun |

### 6. Repair the Smallest Surface with vscuse-ui First

- Product bug: fix code, rebuild VSIX, rebuild the local vscuse image, then rerun.
- Plan drift: prefer `vscuse-ui` to inspect/re-record the affected steps, refresh screenshots, and validate the visual state interactively. Use direct JSON edits for metadata, variables, or small textual cleanups after the UI change is understood.
- Flake: prefer stable precondition regions, tolerant assertions, and neutralizing hover/focus steps over delay-only fixes.
- Setup failure: fix only the environment blocker before interpreting product behavior.

Interaction repair preferences:

- Replace recorded coordinate clicks with keyboard sequences when the UI has a stable keyboard path: `f1` -> type command -> `enter`; type quick-pick filter -> `enter`; `escape` to dismiss; arrows only when the list order is stable.
- Keep coordinate clicks for true pointer-only controls, but make their preconditions local and stable rather than full-screen.
- Remember that step `timeout` does not shorten precondition waiting; use `precondition_wait_timeout:X` for optional visual states.
- If a step is a branch guard such as "select dev only if Select an environment appears", make it optional and short, then let the next deterministic assertion prove the final state.

When editing generated or recorded plan content, preserve variables such as `${{var:app_name}}`, keep secrets as secret/env references, and remove recorded tenant-specific or one-off values.

Recommended UI-first repair loop:

1. Start `vscuse-ui` with the same config, image, template version, and feature flags used for the failing run.
2. Verify non-secret container env such as `TEMPLATE_VERSION` and `feature_flag:*` names before interpreting UI behavior.
3. Load the failing plan, then use `Run`, `Continue`, or `Next` to reach the failed area.
4. Inspect the live noVNC state. If the product is correct and the plan is stale, record or edit the changed segment in the UI.
5. Clean generated content in JSON only after the UI-produced behavior is understood.
6. Rerun the focused plan with `vscuse execute` as the final validation.

For `SCN-DA-CREATE-WITH-MCP-SERVER` with `TEAMSFX_MCP_FOR_DA_DT=true`, the new dynamic-tool-discovery create flow must not execute legacy fetch-tools steps (`Fetch action from MCP`, `Fetch from MCP`, or static operation selection). Repair the plan in `vscuse-ui` so the full saved case reaches project generation and validates the generated dynamic MCP files first; only then run the clean CLI validation.

### 7. Validate and Report

Run the same focused plan again. Final report should include:

- Plan name/path and result.
- Integrated browser evidence: whether noVNC showed the real live container and which step area was observed.
- Failure classification.
- Feature flags declared by the plan and whether they were applied.
- Files changed and why.
- Final execution summary: successful count, errors count, and report path.
