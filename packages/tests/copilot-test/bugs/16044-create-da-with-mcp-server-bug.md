# Bug Report: Issue #16044 — Create Declarative Agent with MCP Server

## Issue
[#16044](https://github.com/OfficeDev/microsoft-365-agents-toolkit/issues/16044)

## Test Script
`packages/tests/copilot-test/src/create-da-with-mcp-server.test.ts`

## Summary

The "Create Declarative Agent with MCP Server" feature is not implemented in either
the VS Code extension wizard or the ATK CLI. All five test cases that exercise the
feature fail because the underlying product capability does not exist.

---

## TC-001 / TC-002: VS Code wizard — create DA with remote MCP server

### Expected behaviour (from test plan)
After invoking `fx-extension.create`, the wizard must present:
1. A **"Teams Agents and Apps"** category selector.
2. An **"Agent"** type selector.
3. A **"Declarative Agent"** variant selector.
4. An **"Add an Action"** option for the DA template path.
5. A **"Start with a MCP server"** action-source option.
6. An MCP URL InputBox (prompt contains "MCP").
7. A workspace folder picker and an application-name InputBox.

After completion the scaffolded project must contain:
- `m365agents.yml`
- `appPackage/manifest.json`
- `appPackage/declarativeAgent.json`
- `.vscode/mcp.json` (containing the supplied MCP URL)

### Actual behaviour
Steps 4 and 5 of the wizard do not exist. The CI log shows:

```
waitForTextThenScreenshot: "Add an Action" not found
Signal timeout: clickText:Add an Action
waitForTextThenScreenshot: "Start with a MCP server" not found
Signal timeout: clickText:Start with a MCP server
waitForTextThenScreenshot: "MCP" not found
```

The wizard never progresses past "Declarative Agent". No project is scaffolded;
`waitForProjectDir` returns an empty string for both TC-001 and TC-002.

---

## TC-003: CLI non-interactive — create DA with remote MCP server (happy path)

### Expected behaviour
```
atk new -c declarative-agent --with-plugin yes --api-plugin-type mcp \
        --mcp-server-type remote --mcp-da-server-url <url> \
        -n <name> -f <outDir> --interactive false
```
must exit with code 0 and scaffold the same four required files.

### Actual behaviour
The CLI exits with code **-1** (spawn failure or unrecognised command/flags).
Both stdout and stderr are empty, indicating the `--api-plugin-type mcp`,
`--mcp-server-type`, and `--mcp-da-server-url` flags are not supported.
No project files are created in the output directory.

---

## TC-004: CLI non-interactive error — missing `--mcp-da-server-url`

### Expected behaviour
When `--mcp-da-server-url` is omitted and `--interactive false` is set, the CLI
must exit non-zero **and** include the token `mcp-da-server-url` (or equivalent)
in its error output so callers can identify the missing parameter.

### Actual behaviour
The CLI exits non-zero (exit=-1, same as TC-003), but stdout and stderr are both
**empty**. The error output contains no reference to `mcp-da-server-url`.

---

## TC-005: CLI non-interactive error — missing `--mcp-da-auth-type`

### Expected behaviour
When a tools-file is provided but `--mcp-da-auth-type` is omitted and
`--interactive false` is set, the CLI must exit non-zero **and** include
`mcp-da-auth-type` (or equivalent) in its error output.

### Actual behaviour
The CLI exits non-zero (exit=-1), but stdout and stderr are both **empty**.
The error output contains no reference to `mcp-da-auth-type`.

---

## Root cause assessment

The "DA with MCP Server" scaffold capability is not yet implemented in:
- **VS Code extension**: the `fx-extension.create` wizard does not offer an
  "Add an Action → Start with a MCP server" path for Declarative Agents.
- **CLI (`atk new`)**: the flags `--api-plugin-type mcp`, `--mcp-server-type`,
  `--mcp-da-server-url`, and `--mcp-da-auth-type` are unrecognised; the command
  produces no output and exits with code -1.

## Affected test cases
| TC | Title | Failure mode |
|----|-------|--------------|
| TC-001 | VS Code wizard (no odr.exe) | Wizard steps "Add an Action" / "Start with a MCP server" not found; no project scaffolded |
| TC-002 | VS Code wizard (odr.exe path) | Same as TC-001 |
| TC-003 | CLI happy path | CLI exits -1; flags unrecognised; no files created |
| TC-004 | CLI error — missing URL | CLI exits -1 with empty output; no `mcp-da-server-url` in error message |
| TC-005 | CLI error — missing auth type | CLI exits -1 with empty output; no `mcp-da-auth-type` in error message |
