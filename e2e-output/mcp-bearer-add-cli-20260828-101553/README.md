# MCP bearer add-action CLI E2E

Date: 2026-08-28
Executable: `node packages/cli/cli.js`
Server: `https://example.com/mcp`
Auth type: `bearer-token`

## Setup

1. Regenerated and distributed the local v4 template bundle:
   `pnpm --dir templates build:vsc`
2. Rebuilt current product code:
   `pnpm --dir packages/fx-core build`
   `pnpm --dir packages/cli build`
3. Copied the retained existing declarative-agent baselines into `v4-off-final` and `v4-on-final`.
   Each baseline already had one MCP bearer action. This run added a second, distinct server to verify coexistence and a clear file delta.
4. Used absolute project and manifest paths because the add-action adapter supports and normalizes that form consistently across legacy and v4.

Common environment:

```text
TEAMSFX_MCP_FOR_DA_DT=true
TEAMSFX_GENERATE_CONFIG_FILES=true
TEMPLATE_VERSION=local
```

## Add action: v4 off

Environment: `TEAMSFX_V4_ENABLED=false`

```powershell
node packages/cli/cli.js add action `
  --api-plugin-type mcp `
  --mcp-da-server-url https://example.com/mcp `
  --mcp-da-auth-type bearer-token `
  --manifest-file <absolute-path>/v4-off-final/appPackage/manifest.json `
  --folder <absolute-path>/v4-off-final `
  --interactive false
```

Result: PASS, exit code 0.
Retained project: `v4-off-final`
Generated plugin: `v4-off-final/appPackage/ai-plugin_1.json`

## Add action: v4 on

Environment: `TEAMSFX_V4_ENABLED=true`

```powershell
node packages/cli/cli.js add action `
  --api-plugin-type mcp `
  --mcp-da-server-url https://example.com/mcp `
  --mcp-da-auth-type bearer-token `
  --manifest-file <absolute-path>/v4-on-final/appPackage/manifest.json `
  --folder <absolute-path>/v4-on-final `
  --interactive false
```

Result: PASS, exit code 0.
Retained project: `v4-on-final`
Generated plugin: `v4-on-final/appPackage/ai-plugin-examplecom.json`

## Verification criteria

| Criterion                                                     | V4 off | V4 on |
| ------------------------------------------------------------- | -----: | ----: |
| Real `node packages/cli/cli.js add action` exits 0            |   PASS |  PASS |
| Plugin manifest is created                                    |   PASS |  PASS |
| Runtime URL is `https://example.com/mcp`                      |   PASS |  PASS |
| Runtime auth type is `ApiKeyPluginVault`                      |   PASS |  PASS |
| Auth reference is `${{MCP_DA_AUTH_ID_EXAMPLECOM}}`            |   PASS |  PASS |
| OAuth-only fields are absent                                  |   PASS |  PASS |
| Declarative-agent manifest references the plugin              |   PASS |  PASS |
| Main YAML contains exactly one registration for this server   |   PASS |  PASS |
| Local YAML contains exactly one registration for this server  |   PASS |  PASS |
| Registration uses name `examplecom` and the expected base URL |   PASS |  PASS |
| Registration output is `MCP_DA_AUTH_ID_EXAMPLECOM`            |   PASS |  PASS |
| Main registration actions are equivalent across flags         |   PASS |  PASS |
| Local registration actions are equivalent across flags        |   PASS |  PASS |

The structured verifier exited 0.

Observed non-blocking difference: v4 adds `MCP_DA_AUTH_ID_EXAMPLECOM=` to `env/.env.dev`; legacy does not. Both flows emit equivalent lifecycle actions whose `writeToEnvironmentFile.registrationId` creates the value during provisioning. No API-key secret is written to the project.

## Create command rejection

The following command was run with `TEAMSFX_V4_ENABLED=false` and `true`:

```powershell
node packages/cli/cli.js new `
  -c declarative-agent `
  --with-plugin yes `
  --api-plugin-type mcp `
  --mcp-server-type remote `
  --mcp-da-server-url https://example.com/mcp `
  --mcp-da-auth-type bearer-token `
  --app-name <unique-name> `
  --folder <unique-output-path> `
  --interactive false
```

| Criterion                                       | V4 off | V4 on |
| ----------------------------------------------- | -----: | ----: |
| Returns `InvalidChoiceError` for `bearer-token` |   PASS |  PASS |
| Exit code is 1                                  |   PASS |  PASS |
| Requested project directory is not created      |   PASS |  PASS |

## Diagnostic attempts retained

Earlier attempts are retained alongside the final projects. They record corrections for relative manifest-path handling, stale compiled fx-core output, and the stale bundled v4 template floor. Only `v4-off-final` and `v4-on-final` are the authoritative final add-action results.
