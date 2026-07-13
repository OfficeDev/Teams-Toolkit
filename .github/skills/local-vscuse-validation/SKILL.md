---
name: local-vscuse-validation
description: "Use when: setting up shared local vscuse prerequisites, credentials, runner, local or pinned published Docker images, local VSIX, env variables, and common rules for Microsoft 365 Agents Toolkit vscuse work. Use vscuse-case-diagnosis for running/fixing existing cases; use vscuse-scenario-authoring for docs/mockup-driven recording and plan generation."
argument-hint: "Describe the feature/change and which vscuse plan or scenario to validate"
---

# Local vscuse Validation

## Skill Router

- Use `vscuse-case-diagnosis` when the task is to run an existing vscuse case, reproduce a failure, classify product bug vs test plan drift vs setup failure vs flake, repair the smallest surface, and demonstrate the run through the integrated browser/noVNC.
- Use `vscuse-scenario-authoring` when the task starts from docs, PRDs, scenarios, mockups, or expected user flows and needs vscuse-ui recording, generated steps, replacement of existing coverage, or creation of a new plan.
- Use this skill for shared setup: local credentials, template routing, local VSIX/image build, pinned published image selection, vscuse runner installation, GHCR/wheel access, and common safety rules.

## Goal

Use this skill to prepare and troubleshoot the shared local vscuse environment for this repository: credentials, runner access, local VSIX packaging, local or pinned published Docker image selection, env variables, noVNC/vscuse-ui service expectations, and common safety rules.

For the actual execution workflow, load `vscuse-case-diagnosis`. For docs/mockup-driven recording or plan generation, load `vscuse-scenario-authoring`.

This skill is for the vscuse assets under `packages/tests/vscuse/`. It complements `vibe-coding`: use `vibe-coding` for behavior-change gates and specs, then use this skill when the verification surface is a vscuse UI workflow or when a feature's vscuse plan needs maintenance.

This skill is the AI-first operational entry point for local vscuse validation. Durable vscuse workflow knowledge should live in AI-readable docs as the source of truth; this skill should orchestrate that workflow, preserve agent decision logic, and link to those docs rather than duplicating stable facts. Human review should focus on flow diagrams, mockups, and observable workflow evidence when those artifacts exist.

## When to Use

Use this skill when the task mentions any of these shared setup concerns:

- Build a local ATK vscuse Docker image that contains the current repository's VSIX.
- Run local or dev test-plan JSON against a pinned image produced by a specific `Build VscUse ATK Docker Image` Actions run.
- Install or verify the external `vscuse` and `vscuse-ui` Python runner.
- Set up repo-root `set-azure-env.ps1`, `TEMPLATE_VERSION=local`, or a branch-specific local image such as `VSCUSE_VSCODE_IMAGE=vscuse-atk-6.12:local`.
- Troubleshoot `ghcr.io/microsoft/vscuse-base`, `ghcr.io/officedev/vscuse-atk-vscode`, or `microsoft/vscuse-doc` wheel access.
- Confirm noVNC, Docker API, and vscuse-ui local service URLs.

Use `vscuse-case-diagnosis` instead when the task is to run an existing case, reproduce a failure, classify the failure, and show the run in the integrated browser.

Use `vscuse-scenario-authoring` instead when the task starts from docs, mockups, PRDs, or scenarios and needs vscuse-ui recording, generated steps, replacement of an existing test plan, or creation of a new plan.

Do not use this skill for ordinary unit tests, CLI E2E tests, or non-VS Code validation unless the user explicitly asks to connect them to vscuse coverage.

## Important Local Facts

- Plans live in `packages/tests/vscuse/vscode-test-cases/plans`.
- Groups live in `packages/tests/vscuse/vscode-test-cases/groups`.
- vscuse config lives at `packages/tests/vscuse/vscode-test-cases/config.yaml`.
- Local vscuse credentials should live in `set-azure-env.ps1` at the repository root. This path is gitignored because it contains secrets and should stay easy to find during local validation.
- The ATK-specific Dockerfile is `packages/tests/vscuse/docker/vscuse-atk/Dockerfile`.
- Local VSIX files must be copied into `packages/tests/vscuse/docker/vscuse-atk/build-extensions/` before building the local image.
- Local images used for branch validation must be branch-specific. Do not use `latest` for current-branch proof, because stale images can silently validate the wrong VSIX. Use tags such as `vscuse-atk-dev:local` for `dev` and `vscuse-atk-6.12:local` for `release/6.12`.
- Published images may be used to run local or dev plan JSON when the product version under test is intentionally a CI-built version. Pin the exact tag from the requested Actions run and verify its OCI revision before interpreting failures; never substitute `latest`.
- Plan JSON is read from the local filesystem at execution time and is independent of the selected product image. Plan edits apply on the next `vscuse execute` run and do not require rebuilding or republishing the Docker image.
- When validating with the local repository, set `TEMPLATE_VERSION=local` explicitly and verify it is present inside the vscuse VS Code container. A host PowerShell env var is not enough unless the config used to launch vscuse passes it under `docker.environment`; otherwise the run may exercise released/v3 template behavior while the investigation assumes local/v4 content.
- When validating a pinned published image, match the originating CI run's template routing. Do not set `TEMPLATE_VERSION=local` merely because the plan file comes from the local dev checkout. Leave it unset unless the originating test run or requested scenario explicitly supplied a template version.
- Scenario-specific feature flags must not rely on ambient shell history. vscuse plans should declare required flags in `plan_metadata.tags` using `feature_flag:<NAME>=<VALUE>`, and the execution workflow must apply those flags before vscuse starts the container and VS Code extension host.
- Direct `vscuse execute` has no verified native case-level feature-flag field. Treat `feature_flag:*` tags as the AI-readable source of truth, not as runner-enforced behavior by themselves.
- The Docker environment is controlled by `config.yaml` at container start. Do not add blank global pass-through entries for feature flags because unset and explicit `false` can differ in product code. Only inject the flags declared by the current plan, preferably through a temporary run config or an explicit pre-run step.
- A host-level npm registry in `.npmrc` is not inherited by the vscuse container. Set `NPM_CONFIG_REGISTRY` before starting `vscuse` or `vscuse-ui`; `config.yaml` passes it into the container and defaults to `https://registry.npmjs.org/` when unset.
- Some npm-compatible proxies, including `https://packagefeedproxy.microsoft.io/npm/`, do not implement `/-/ping`. Validate them with `npm view` and `npm pack`; a 404 from `npm ping` alone is not a connectivity failure.
- Rebuild the Docker image only when the VSIX, image tooling, base image, installed extensions, or Dockerfile content changes.
- vscuse itself is an external Python wheel obtained by CI from the `microsoft/vscuse-doc` release assets. The runner implementation is not in this repository.
- `vscuse` is the execute-only CLI. `vscuse-ui` starts the authoring/debug UI and the recording APIs.
- Use `vscuse-ui` as the default authoring and repair workbench for vscuse cases. Use `vscuse execute` as the clean final verifier for CI parity.
- Verified locally with vscuse `0.2.67`: start from `packages/tests/vscuse/vscode-test-cases` and run `vscuse-ui --config-file .\config.yaml --project-path .` to serve the Web UI/API on `http://127.0.0.1:6082`, noVNC on `http://127.0.0.1:6080`, and Docker API on `http://127.0.0.1:6081`.
- For plans that reference shared groups, `vscuse-ui` must scan the `vscode-test-cases` root, not only `plans`. The UI has no `--groups-dir` option; using `--project-path .\plans` can load the plan but fail Run with `Plan <group-id> not found`.
- Recording-to-plan generation is implemented by the `vscuse-ui` backend: start recording, stop recording, then generate an executable plan from the recording. Generated files are written under the configured `--project-path` and must be reviewed before committing.
- Non-empty preconditions in the current vscuse plans are visual `dhash` screenshot-region checks. Treat screenshot and hash updates as behavioral evidence, not cosmetic churn.
- Prefer keyboard-driven interactions over coordinate clicks whenever the product UI supports them. For command palettes and quick picks, use `key_press` (`f1`, `enter`, arrows, `escape`) plus `type_text` filtering instead of clicking recorded coordinates. Use clicks only for controls without a reliable keyboard path.
- Keyboard actions still need the same state guard as clicks. Do not send `enter` to a VS Code quick pick until the intended row is visible and highlighted; keep or refresh a prompt-specific precondition and `precondition_wait_timeout:X` so the key press waits for the correct selection, such as `+ New resource group`.
- When two UI labels are equivalent states for the same action, such as Teams `Add` and `Open`, model the assertion with `A or B` and avoid a label-specific `dhash` precondition on the action. Prefer one semantic/OCR-backed action followed by the converged outcome assertion instead of branching through single-label intermediate checks.
- `force_run:true` skips precondition and postcondition checks. Do not use it for optional prompts, because it can click or type into the wrong UI when the prompt is absent.
- For optional prompts, model the branch explicitly: keep the prompt-specific visual preconditions, use a keyboard action when possible, add a short `precondition_wait_timeout:X` tag, and set `continue_on_error` only after confirming the local/CI vscuse executor honors it.
- Step `timeout` is not the visual precondition wait timeout. To reduce wait time for optional visual prompts, use `precondition_wait_timeout:X` in `tags` or the step's `precondition_wait_timeout` field.
- vscuse-ui tabs can keep old in-memory execution results after plan or runner edits. Before interpreting a failure after edits, reload the tab or use `Restart`/`Clear`, and verify the loaded plan through `http://127.0.0.1:6082/api/executable_plans/<plan_id>`.
- In vscuse `0.2.67`, verify `continue_on_error` behavior before relying on optional-step skips. The expected behavior is a failed optional step becomes `skipped_continue_on_error`, increments success rather than error count, and allows the next step to run under `stop_on_error=true`.

## Local Prerequisites

Before running local vscuse, verify:

```powershell
node --version
pnpm --version
npm --version
docker --version
docker info --format '{{.ServerVersion}} {{.OSType}} {{.Architecture}}'
```

Expected local baseline for this repo is Node `>=22` and pnpm `>=8`. Docker Desktop must be running with a Linux backend.

If Docker works, this should succeed:

```powershell
docker run --rm hello-world
```

## Credential Setup and Access Checks

The local flow may require access to private GitHub Container Registry images and a private vscuse wheel release. Prefer GitHub CLI browser authentication, then pass the resulting token to Docker through stdin. Do not ask the user to paste tokens into chat, and do not use the VS Code integrated browser for GitHub authentication or SSO. Let `gh` open the system browser or device-flow page and have the user complete authentication there.

First, make sure GitHub CLI is authenticated and has package-read scope:

```powershell
gh --version
gh auth status -h github.com

# If not logged in, this opens the browser/device flow with the required scopes.
gh auth login -h github.com -w --git-protocol https --scopes "repo,read:org,read:packages,workflow,gist"

# If already logged in but scope is missing, refresh with the same required scopes.
gh auth refresh -h github.com --scopes "repo,read:org,read:packages,workflow,gist"
```

Then authorize Docker to pull GHCR images using the GitHub CLI token:

```powershell
$githubUser = gh api user --jq .login
gh auth token | docker login ghcr.io -u $githubUser --password-stdin
```

If `gh --version` fails with Node.js stack traces or plugin errors, the PATH may be resolving an npm package named `gh` instead of the official GitHub CLI. Install or locate the official GitHub CLI and use that `gh.exe` path for the remaining commands. If a relogin is needed to correct the account or SSO context, run `gh auth logout -h github.com` first, then run the scoped `gh auth login` command above.

After Docker is logged in, verify image and wheel access before spending time debugging the local repo:

```powershell
docker pull ghcr.io/microsoft/vscuse-base:latest
docker pull ghcr.io/officedev/vscuse-atk-vscode:latest

try {
  $release = Invoke-RestMethod -Headers @{ "User-Agent" = "vscuse-local-check" } -Uri "https://api.github.com/repos/microsoft/vscuse-doc/releases/latest"
  $release.tag_name
  $release.assets | Select-Object name,browser_download_url
} catch {
  $_.Exception.Response.StatusCode.value__
  $_.Exception.Message
}
```

If the Docker pulls still return `401 Unauthorized` or `unauthorized`, the GitHub identity used by `gh` does not have package access or the token scope is insufficient. If they return `403 Forbidden` after `docker login` succeeds, the token is valid but the GitHub identity still lacks package access or required organization SSO authorization.

If the release query returns `404 Not Found`, the GitHub identity does not have access to the private vscuse wheel release. If authenticated `gh api` calls return `Resource protected by organization SAML enforcement`, open the `X-GitHub-SSO` URL from `gh api -i ...` and authorize the GitHub CLI token for the required enterprise or organization. If that SSO URL itself returns a GitHub 404, the current GitHub identity likely is not a member of the required enterprise/organization; switch to an identity with access or complete the required internal access flow. Then rerun the same checks. Do not invent a replacement runner.

## Build the Current Repository VSIX

From the repository root:

```powershell
pnpm install
pnpm run setup:vsc
Push-Location packages/vscode-extension
pnpm run pack-local
Pop-Location
```

Confirm the VSIX exists:

```powershell
Get-ChildItem packages/vscode-extension -Filter *.vsix | Select-Object Name,Length,LastWriteTime
```

## Build a Local vscuse Image from This Repository

Stage the local VSIX into the Docker build context:

```powershell
$vsix = Get-ChildItem packages/vscode-extension -Filter *.vsix | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $vsix.FullName packages/tests/vscuse/docker/vscuse-atk/build-extensions/ -Force
Get-ChildItem packages/tests/vscuse/docker/vscuse-atk/build-extensions -Filter *.vsix | Select-Object Name,Length,LastWriteTime
```

Build the image:

```powershell
$branchName = (git branch --show-current).Trim()
$imageBranch = $branchName -replace '^release/', '' -replace '[^A-Za-z0-9_.-]', '-'
$localImage = "vscuse-atk-${imageBranch}:local"
Push-Location packages/tests/vscuse/docker/vscuse-atk
docker build --build-arg NODE_VERSION=22 -t $localImage .
Pop-Location
```

If the build fails while loading metadata for `ghcr.io/microsoft/vscuse-base:latest`, run the credential checks above. A `401 Unauthorized` at that step means the base image is not accessible to the current Docker login.

## Use a Published Image from a Specific Actions Run

Use this mode when the plan should come from the current local or dev checkout but the extension and image tooling should come from a particular successful `Build VscUse ATK Docker Image` run.

Treat these as independent inputs:

- **Plan source:** local files under `packages/tests/vscuse/vscode-test-cases`.
- **Product image:** one pinned `ghcr.io/officedev/vscuse-atk-vscode:<tag>` created by the requested Actions run.
- **Template routing:** the value used by the originating CI scenario; usually unset for a published release image unless explicitly provided.

Resolve the tag from the workflow dispatch input or authenticated job log. The workflow also publishes a `teamsfx-<run_id>` tag when its `run_id` input is present. Do not infer the tag from the Docker-build run ID or branch name. If the build was triggered by `cd.yml`, its `series` input is passed as the raw image tag and appears at the end of the CD run name: `CD-<run-id>-<branch>-<preid>-<series>`.

Read the public build metadata and record its `head_sha`:

```powershell
$repository = "OfficeDev/microsoft-365-agents-toolkit"
$dockerBuildRunId = "<docker-build-run-id>"
$headers = @{
   "User-Agent" = "vscuse-local-validation"
   "Accept" = "application/vnd.github+json"
   "X-GitHub-Api-Version" = "2022-11-28"
}
$buildRun = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repository/actions/runs/$dockerBuildRunId"
$buildRun | Select-Object id,head_branch,head_sha,status,conclusion,created_at,html_url
```

Pull the resolved tag and verify that the image revision matches the Actions run before using it:

```powershell
$imageTag = "<exact-tag-from-workflow-input-or-summary>"
$publishedImage = "ghcr.io/officedev/vscuse-atk-vscode:$imageTag"
docker pull $publishedImage

$imageInspect = (docker image inspect $publishedImage | ConvertFrom-Json)[0]
$imageRevision = $imageInspect.Config.Labels.'org.opencontainers.image.revision'
if ($imageRevision -ne $buildRun.head_sha) {
   throw "Image revision $imageRevision does not match Actions run head SHA $($buildRun.head_sha)."
}

[PSCustomObject]@{
   Image = $publishedImage
   Id = $imageInspect.Id
   Created = $imageInspect.Created
   Revision = $imageRevision
   Version = $imageInspect.Config.Labels.'org.opencontainers.image.version'
   RepoDigests = $imageInspect.RepoDigests -join ","
}
$env:VSCUSE_VSCODE_IMAGE = $publishedImage
Remove-Item Env:TEMPLATE_VERSION -ErrorAction SilentlyContinue
```

If the image tag is mutable, record the pulled repo digest from `docker image inspect` in the final report. A provenance mismatch is a setup failure; do not run the plan against a nearby tag and claim it represents the requested Actions run.

## Install or Verify the vscuse Runner

Check whether `vscuse` is already installed or whether a wheel is available locally. The vscuse wheel requires Python `>=3.12`; `py -3` may point to an older Python and fail the install.

```powershell
Get-Command vscuse -ErrorAction SilentlyContinue | Select-Object Source,Version
Get-ChildItem packages/tests/vscuse -Recurse -Filter *.whl | Select-Object FullName,Length
py -0p
```

If the wheel is not local but GitHub access is available, download it from the authenticated `microsoft/vscuse-doc` release:

```powershell
$toolsDir = Join-Path $env:USERPROFILE ".local\vscuse"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
gh release download v0.2.67 --repo microsoft/vscuse-doc --pattern "vscuse-*.whl" --dir $toolsDir --clobber
```

Install the wheel with Python 3.12 or newer. If `vscuse.exe` is installed outside PATH, call it by full path:

```powershell
$python = Join-Path $env:USERPROFILE ".local\python312\python.exe"
$wheelPath = (Get-ChildItem (Join-Path $env:USERPROFILE ".local\vscuse") -Filter "vscuse-*.whl" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
& $python -m pip install --user --upgrade $wheelPath

$vscuse = Join-Path $env:APPDATA "Python\Python312\Scripts\vscuse.exe"
& $vscuse --help
```

If neither the command nor the wheel exists, local execution is blocked until the external vscuse runner is available.

## UI-First Authoring and Repair Loop

For creating or repairing vscuse coverage, prefer this order:

1. Start `vscuse-ui` with the local image, required local template routing, and scenario feature flags.
2. Confirm the non-secret container env before interpreting UI behavior.
3. Load the plan or create a new one in the UI.
4. Use noVNC plus the UI controls (`Run`, `Continue`, `Next`, `Add Step`, recording) to reach and repair the behavior.
5. Clean generated JSON only after the UI change is understood.
6. Run `vscuse execute` from a clean container as final validation.

This is intentionally UI-first, not UI-only. `vscuse-ui` is better for observing and editing interactive workflows; `vscuse execute` is better for proving the saved plan can run from zero.

## Execute a Local Test Plan

Local execution requires a secret-bearing environment setup script. Keep it local and gitignored at root `set-azure-env.ps1`; do not commit it, paste its values into chat, or copy its values into tracked docs. The expected parameters are:

```powershell
param(
   [ValidateSet("atk05", "atk06")]
   [string]$Env = "atk06",

   [switch]$PersistUser
)
```

From the repository root, load the `atk06` profile into the current PowerShell session before running a plan:

```powershell
$vscuseEnvScript = ".\set-azure-env.ps1"
. $vscuseEnvScript -Env atk06
$env:TEMPLATE_VERSION = "local"
```

Prefer current-session variables for local validation. Use `-PersistUser` only when the user explicitly wants the secrets persisted to the Windows user environment. Keep `TEMPLATE_VERSION` as `local` for local-repo validation runs.

Ensure the Docker CLI is visible to the Python process that runs vscuse. Interaction steps use the vscuse HTTP endpoint, but `agent: code` steps invoke host-side Docker CLI commands such as `docker inspect` and `docker cp`. If Python cannot find `docker.exe`, those steps may log `Container 'vscuse-container' is not running or not accessible` and then be reported as successful even though no script ran.

```powershell
$dockerCliDir = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path (Join-Path $dockerCliDir "docker.exe")) {
   $env:PATH = "$dockerCliDir;$env:PATH"
}
```

From the repository root, run a plan from `packages/tests/vscuse/vscode-test-cases` and point config at the locally built image:

```powershell
$vscuseEnvScript = ".\set-azure-env.ps1"
. $vscuseEnvScript -Env atk06

Push-Location packages/tests/vscuse/vscode-test-cases
$dockerCliDir = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path (Join-Path $dockerCliDir "docker.exe")) {
   $env:PATH = "$dockerCliDir;$env:PATH"
}
$env:NPM_CONFIG_REGISTRY = (npm config get registry).Trim()
$env:TEMPLATE_VERSION = "local"
$branchName = (git branch --show-current).Trim()
$imageBranch = $branchName -replace '^release/', '' -replace '[^A-Za-z0-9_.-]', '-'
$env:VSCUSE_VSCODE_IMAGE = "vscuse-atk-${imageBranch}:local"
vscuse execute --config-file .\config.yaml --groups-dir groups .\plans\<plan-name>.json
Pop-Location
```

If the config used for the run does not pass `TEMPLATE_VERSION` into `docker.environment`, create an ignored temporary config for the run and add only the required local validation env values:

```yaml
docker:
   environment:
      TEMPLATE_VERSION: "local"
```

After the container starts, verify the non-secret routing env before interpreting UI behavior:

```powershell
docker exec vscuse-container env | Select-String -Pattern '^(TEMPLATE_VERSION|TEAMSFX_.*)='
docker exec --user vscode vscuse-container npm config get registry
docker exec --user vscode vscuse-container npm view lodash version
```

Before interpreting a plan failure, distinguish setup success from runtime credential readiness. A local smoke run can successfully load config, expand groups, start `vscuse-atk-local:latest`, and expose noVNC at `http://localhost:6080`, then stop before executing steps if required scenario credentials are missing. For M365 scenarios, `M365_ACCOUNT_NAME` and `M365_ACCOUNT_PASSWORD` are required by the executor even when `m365.enabled` is false in `config.yaml`; check only whether variables are set, never print their values.

```powershell
"M365_ACCOUNT_NAME","M365_ACCOUNT_PASSWORD" | ForEach-Object {
   [PSCustomObject]@{ Name = $_; IsSet = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
}
```

For CI parity, the command shape is:

```powershell
vscuse execute --config-file .\config.yaml --groups-dir groups .\plans\<plan-name>.json
```

`config.yaml` defaults `docker.image_name` to `${VSCUSE_VSCODE_IMAGE:ghcr.io/officedev/vscuse-atk-vscode:latest}`. Always set `VSCUSE_VSCODE_IMAGE` explicitly: use a branch-specific local image for the current local VSIX, or a provenance-checked published tag for a requested CI-built product version.

## Scenario Feature Flags

Feature flags are part of a scenario's test preconditions, not part of the shared secret setup. A feature-flagged case should carry its flag contract in the plan metadata:

```json
"plan_metadata": {
   "tags": [
      "feature_flag:TEAMSFX_MCP_FOR_DA_DT=true",
      "feature_flag:TEAMSFX_MCP_FOR_DA_DCR=true"
   ]
}
```

Before running or recording that case, read and apply the declared tags in the current process:

```powershell
$planPath = "packages/tests/vscuse/vscode-test-cases/plans/<plan-name>.json"
$plan = Get-Content $planPath -Raw | ConvertFrom-Json
@($plan.plan_metadata.tags) | Where-Object { $_ -like "feature_flag:*" } | ForEach-Object {
    $pair = $_ -replace "^feature_flag:", ""
    $name, $value = $pair.Split("=", 2)
    Set-Item -Path "Env:$name" -Value $value
}
```

Those environment values, plus `TEMPLATE_VERSION=local` for local-repo validation, must be available inside the vscuse VS Code container before the extension host starts. If a direct `vscuse execute --config-file .\config.yaml ...` run does not propagate a declared flag or `TEMPLATE_VERSION`, use a temporary config for that run that adds only the declared flags and local template routing under `docker.environment`, then rerun the same plan. Do not persist scenario-only flags in `set-azure-env.ps1`, and do not treat a run as valid when the plan declares flags that were not applied.

## Demonstrate a Failing Case in the Integrated Browser

Use the VS Code integrated browser and noVNC as the live visual proof surface when the user needs to see how a failing vscuse case is reproduced and repaired. This must be a real vscuse container session, not a mock, screenshot slideshow, or replay of an already-finished run.

Important constraints:

- `http://localhost:6080/vnc.html` is a live view of the running vscuse desktop. It does not replay past executions.
- The `vscuse execute` CLI always cleans up the Docker container in its `finally` path when execution ends. After cleanup, noVNC will return to the connect screen or fail to show the previous desktop.
- `--start` and `--end` use expanded step indexes after group resolution. They do not recreate prior state. Use `--start` only when the required UI/app state already exists in a deliberately preserved running container.
- For a real near-failure demonstration after a clean run, start the plan from the beginning and open noVNC before the failure window. If the full setup is long, use terminal logs and the previous failed report to time the observation near the prior failing step.

Recommended live repair loop:

1. Reproduce once with `vscuse execute` and record the evidence.
   Capture the failing expanded step id, nearby previous step id, plan id, report path, and failure classification. Use the report screenshots and logs to form a local hypothesis.

2. Start a real live rerun with the same local image and plan.
   Use the normal execute command, not a mock driver. Keep the terminal running so the vscuse container stays alive.

3. Open the integrated browser to noVNC when the CLI prints the service URL.
   Use `http://localhost:6080/vnc.html`, click `Connect`, and keep the browser visible while the terminal advances toward the failed area.

4. Demonstrate from the step before the failure when feasible.
   Watch the terminal step ids and switch attention to noVNC shortly before the prior failing step. If `--start` would skip required setup state, do not use it; that would produce a misleading demonstration.

5. Repair the smallest owning surface.
   If noVNC shows product behavior is wrong, fix product code and rebuild the image. If noVNC shows the product is correct but the step/precondition/assertion is stale, fix the plan or shared group. Prefer `vscuse-ui` recording or direct JSON edits that preserve dynamic variables and secrets.

6. Rerun and demonstrate the repaired step in the integrated browser.
   The final proof should combine live noVNC observation with the executable result summary. For a passing fix, report the final counts, for example `Successful: 99`, `Errors: 0`, and the report path.

For long plans, do not pretend a finished report is a live demo. It is acceptable to summarize the first successful reproduction from logs, then run a second real execution with noVNC open and focus the browser observation on the previously failing segment.

## Interpret Failures Before Editing

The first goal is not to make the case green at any cost. The first goal is to classify the failure correctly.

1. Confirm the run actually exercised the local change.
   Check the image tag, VSIX build time, plan path, and whether the command used `VSCUSE_VSCODE_IMAGE="vscuse-atk-local:latest"`.

2. Separate harness/setup failures from product failures.
   Missing credentials, GHCR access, Docker CLI not on PATH, noVNC startup failure, or absent scenario env vars are setup problems. Fix those before interpreting UI behavior.

3. Use the report and screenshots to inspect the failing step.
   The default report is `packages/tests/vscuse/vscode-test-cases/test_report/test_report.html`. Look at before/after screenshots, failed preconditions, retry history, assertion reasoning, and the exact expanded step id.

4. Classify the failure.
   A product bug means the local extension produced the wrong behavior. Fix product code and rerun the focused plan. Test-plan drift means the product behavior intentionally changed but the recorded step, assertion, hash, wait, or generated data assumption is stale. Repair the plan with `vscuse-ui` or a direct JSON edit, then rerun. A flake means the behavior eventually matches but timing, service response, or visual stability is unreliable; improve waits/preconditions only when the evidence supports it.

## Handle Tooltip-Induced Drift

Tooltips are a common vscuse flake source. Long hover or idle time can leave the cursor over a VS Code, browser, Teams, or command-palette target, causing a tooltip overlay that changes `dhash` preconditions or confuses assertion screenshots.

Recognize this pattern when the failed screenshot shows a small tooltip near the cursor, the expected UI is otherwise correct, and the same step passes after the pointer moves or after a retry. Treat this as test-plan drift or flake, not a product bug, unless the tooltip itself is incorrect product behavior.

Preferred repair order:

1. Remove the hover state before the sensitive precondition or assertion.
   Prefer a harmless `key_press` such as `Esc` when it only dismisses hover UI and does not close the required dialog. Otherwise, add or record a small neutralizing interaction that focuses a stable, non-destructive area such as editor whitespace, page background, or dialog body. Do not click buttons, tree items, links, tabs, or rows just to park the cursor.

2. Do not fix tooltip flakes by adding only longer delays.
   Extra idle time can make tooltip failures more likely. Use `delay` or `step_retry_timeout` only when the evidence is true async loading or a transient overlay that disappears by itself. If the cursor remains parked on a hover target, move focus or change the preceding action instead.

3. Keep precondition regions away from tooltip-prone surfaces.
   For `dhash` checks, prefer stable text, dialog body, or content regions over toolbar icons, command-palette rows, tree items, titlebar controls, notification buttons, Teams nav icons, or any area that can show hover UI. Avoid full-image hashes on screens where cursor, tooltip, toast, or loading overlay state is expected to vary.

4. Make assertions tolerant of harmless overlays.
   Assert the stable product state that matters, not exact absence of transient hover UI. If an assertion uses natural language, phrase it around durable content, for example `the expected dialog title and primary button exist`, rather than `the screen exactly matches the recorded dialog`.

5. Split intentional hover interactions from later visual checks.
   If a step must hover or click a hover-sensitive target, follow it with a neutralizing step before the next screenshot-sensitive assertion or precondition. Record this with `vscuse-ui` when possible so the coordinates and screenshots match the real viewport.

6. Validate the repair visually.
   Rerun the focused case with noVNC open near the failing step and confirm the tooltip is gone from the precondition/assertion screenshot, or that the assertion passes while ignoring a harmless transient tooltip.

## Use vscuse-ui to Repair or Re-record

Use `vscuse-ui` when a failing case needs visual inspection, step editing, new recorded steps, screenshot/precondition refresh, or a new plan scaffold. Do not use it as a substitute for fixing product bugs.

Start the UI from the repository root so the env script path is stable:

```powershell
$vscuseEnvScript = ".\set-azure-env.ps1"
. $vscuseEnvScript -Env atk06 *> $null
$env:TEMPLATE_VERSION = "local"

Push-Location packages/tests/vscuse/vscode-test-cases

$dockerCliDir = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path (Join-Path $dockerCliDir "docker.exe")) {
   $env:PATH = "$dockerCliDir;$env:PATH"
}

$branchName = (git branch --show-current).Trim()
$imageBranch = $branchName -replace '^release/', '' -replace '[^A-Za-z0-9_.-]', '-'
$env:VSCUSE_VSCODE_IMAGE = "vscuse-atk-${imageBranch}:local"
$vscuseUi = Join-Path $env:APPDATA "Python\Python312\Scripts\vscuse-ui.exe"
& $vscuseUi --config-file .\config.yaml --project-path .

Pop-Location
```

Expected service URLs:

```text
Web UI / API:  http://127.0.0.1:6082
noVNC Viewer:  http://127.0.0.1:6080
Docker API:    http://127.0.0.1:6081
```

Check server readiness without exposing secrets:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:6082/health" | ConvertTo-Json -Compress
```

Recording APIs verified locally in vscuse `0.2.67`:

```text
POST /api/recording/start
POST /api/recording/stop/{recording_id}
POST /api/recording/{recording_id}/executable_plan
POST /api/recording/{recording_id}/extract_steps
```

Use the UI workflow first when available: open the Web UI, load or create the relevant plan, show the noVNC session, start recording, perform the missing or changed interaction, stop recording, then generate steps or a plan. If you use the APIs directly, remember that a probe recording can create a JSON file under `plans`; delete empty or exploratory files before finishing.

Treat generated content as a starting point, not final reviewable coverage. Before committing a generated or repaired plan, remove recorded one-off values, convert paths and names to variables, preserve secret references, update only intentional screenshot/precondition regions, parse the JSON, and rerun the focused plan with `vscuse execute`.

## Keep Feature Plans Up-to-Date

When a feature changes, maintain the vscuse plan as part of the same validation loop.

1. Identify impacted scenarios.
   Search plan names, group names, feature strings, command labels, sample/template names, generated file names, and visible UI text under `packages/tests/vscuse/vscode-test-cases`.

2. Decide whether an existing plan should be updated or a new plan is needed.
   Update an existing plan when the feature flow is the same and only expected UI, command output, generated files, timing, screenshots, or environment setup changed. Add or generate a new plan when the user workflow, template, language, provider, debug target, or major branch of behavior is new.

3. Keep plan data dynamic.
   Do not hardcode app names, API keys, generated IDs, tenant-specific values, paths, or secrets from a recorded run. Prefer plan variables such as `${{var:app_name}}`, runtime-generated values, and scripts that read the generated project path.

4. Preserve secret safety.
   Do not print secrets into logs unless the existing harness already requires a masked or non-secret value. For API keys generated during a test, generate them during the run and write them into the dynamic env file for that generated project.

5. Avoid brittle shell replacements.
   If replacing env values that may contain `/`, `&`, quotes, or other shell-sensitive characters, avoid `sed` delimiter tricks. Use a structured or delimiter-safe method such as Python text replacement that extracts the generated value and rewrites only the target env assignment.

6. Update preconditions intentionally.
   Preconditions are `dhash` visual checks. When UI changes intentionally, update the screenshot/hash region to match the new stable state. Do not refresh hashes casually to hide a regression.

7. Keep selectors and waits aligned with product behavior.
   Prefer stable UI commands, labels, and deterministic preconditions over arbitrary waits. If a feature introduces a new async state, update the precondition or wait strategy to observe that state.

8. Validate JSON and a focused plan.
   After editing plans, parse the changed JSON files and run the smallest relevant vscuse plan when the runner and image are available.

PowerShell JSON validation example:

```powershell
Get-ChildItem packages/tests/vscuse/vscode-test-cases/plans -Filter *.json |
  Where-Object { $_.Name -like "*<feature-or-plan-fragment>*" } |
  ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null; $_.Name }
```

## Feature Plan Review Checklist

Before considering vscuse coverage current, confirm:

- The changed feature has at least one mapped vscuse plan or an explicit reason vscuse is not the right harness.
- The plan uses the current local workflow text, command labels, generated files, and debug targets.
- Dynamic project names and env file paths are still correct for the selected language and local/remote mode.
- Secrets and API keys are generated or injected at runtime, not copied from a previous recording.
- Preconditions still point to stable UI regions and expected visual states.
- Tooltip overlays, cursor hover state, toasts, and transient loading UI are either outside precondition regions or explicitly handled by a neutralizing step, retry, or tolerant assertion.
- Local plan edits were parsed successfully.
- The focused plan was run locally, or the final answer clearly states that execution was blocked by missing GHCR or vscuse wheel access.
- Any failing run was classified as product bug, plan drift, environment/setup failure, or flake before changing coverage.
- Any `vscuse-ui` generated recording or repaired plan was cleaned of recorded one-off values and rerun with `vscuse execute`.

## Final Report Template

When reporting back, include only the useful facts:

- VSIX build result and path.
- Docker image build result and image tag, or the exact access blocker.
- vscuse runner availability: installed command, local wheel path, or missing external wheel.
- Plan executed and result, or why execution could not start.
- Failure classification: product bug, plan drift, setup failure, or flake.
- Plan maintenance summary: which plan files changed and how they stay dynamic.
- Integrated browser evidence when requested: whether noVNC showed a live running container, which failure-near step was observed, and whether the repaired rerun reached the expected passing state.
