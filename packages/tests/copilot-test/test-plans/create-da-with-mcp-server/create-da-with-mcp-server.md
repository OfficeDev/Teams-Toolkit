# Test Plan: Create Declarative Agent With MCP Server

## Metadata

- **feature-slug**: `create-da-with-mcp-server`
- **owner**: atk-qa
- **created**: 2026-05-28
- **updated**: 2026-05-28
- **triggers**: issue-label `atk-copilot-test`, manual
- **scenario-id**: SCN-DA-CREATE-WITH-MCP-SERVER
- **related-scenario**: docs/01-product/scenarios/da/create-da-with-mcp-server.md

## Scope

**Covers:**
- TC-001: VS Code happy path — create a DA project with a remote MCP server action (no `odr.exe`)
- TC-002: VS Code happy path — create a DA project with a remote MCP server action (`odr.exe` present, user chooses Remote)
- TC-003: CLI non-interactive happy path — create DA project with `--api-plugin-type mcp` and `--mcp-da-server-url`
- TC-004: CLI non-interactive error path — missing `--mcp-da-server-url` when `--api-plugin-type mcp`
- TC-005: CLI non-interactive error path — missing `--mcp-da-auth-type` when tools file provided and auth is required
- TC-006: VS Code cancellation path — cancel before project generation leaves no partial project

**Does NOT cover:**
- Local MCP server path via `odr.exe` (covered separately when odr integration is stable)
- `SCN-DA-ADD-MCP-ACTION-TO-DA` (post-create CodeLens flow)
- `SCN-DA-FETCH-MCP-TOOLS` (tool discovery follow-up)
- Visual Studio and chat surfaces
- CLI interactive create flow (separate plan)
- OAuth / Entra SSO authentication type selection in detail (covered by auth-specific plans)

---

## Test Cases

### TC-001 – VS Code: Create DA with remote MCP server (no odr.exe, happy path)

**Preconditions:**
- VS Code is open with no project loaded
- ATK extension v6.8.0+ is installed and activated
- `odr.exe` is **not** present on the machine (MCP Server Type prompt is skipped)
- Network allows connection to a test remote MCP server URL

**Wizard flow (verified against ATK create flow for DA + MCP):**

| Step | QuickPick / InputBox                        | Value to select / type                  |
|------|---------------------------------------------|-----------------------------------------|
| 1    | App category                                | Teams Agents and Apps                   |
| 2    | App type                                    | Agent                                   |
| 3    | Agent variant                               | Declarative Agent                       |
| 4    | DA template path                            | Add an Action                           |
| 5    | Action source                               | Start with a MCP server                 |
| 6    | MCP server URL (InputBox)                   | `https://mcptest.example.com/sse`       |
| 7    | Workspace folder                            | Default folder                          |
| 8    | Application Name (InputBox)                 | `test-da-mcp-001` (type + Enter)        |

> **Note:** When `odr.exe` is absent, the "MCP Server Type" QuickPick is skipped; step 6 (MCP URL) follows directly after step 5 (action source).

**Steps:**
1. ATK extension activates; VS Code shows no project.
2. Fire `fx-extension.create` command directly (not via Command Palette). Observe the first QuickPick panel appears.
3. Take screenshot of the initial QuickPick panel.
4. Click "Teams Agents and Apps". Observe the QuickPick updates to show app type options.
5. Take screenshot showing "Agent" option in the list.
6. Click "Agent". Observe QuickPick updates to show agent variant options.
7. Take screenshot showing "Declarative Agent" option highlighted.
8. Click "Declarative Agent". Observe QuickPick updates to show DA template path options.
9. Take screenshot showing "Add an Action" option in the list.
10. Click "Add an Action". Observe QuickPick updates to show action source options.
11. Take screenshot showing "Start with a MCP server" option in the list.
12. Click "Start with a MCP server". Observe an InputBox appears asking for the MCP server URL (no MCP Server Type prompt because `odr.exe` is absent).
13. Take screenshot showing the MCP server URL InputBox (empty, before typing).
14. Type `https://mcptest.example.com/sse` and press Enter. Observe the workspace folder picker appears.
15. Take screenshot showing the workspace folder selection.
16. Click "Default folder". Observe the Application Name InputBox appears.
17. Take screenshot showing the Application Name InputBox (empty, before typing).
18. Type `test-da-mcp-001` and press Enter. Observe the scaffold process begins.
19. Wait up to 120 s for project generation and VS Code to open the new project folder.
20. Take final state screenshot showing the file tree.
21. Assert required project files exist under `~/AgentsToolkitProjects/test-da-mcp-001/`.

**Expected result:**
- Wizard completes without error.
- The following files exist at the project root:
  - `m365agents.yml`
  - `appPackage/manifest.json`
  - `appPackage/declarativeAgent.json`
  - `.vscode/mcp.json`
- `.vscode/mcp.json` contains the MCP server URL `https://mcptest.example.com/sse`.
- VS Code opens the new project folder automatically.

**Pass criteria:**
- All 4 asserted files are present.
- `.vscode/mcp.json` file exists and contains `mcptest.example.com/sse`.
- No error notification is shown in VS Code.

**Test script:**
`packages/tests/src/create-da-with-mcp-server-vscode-happy.test.ts`

**Screenshots produced by test:**

| ID  | Filename                             | What is visible                                          | Pass condition                                               | Why                                                                   |
|-----|--------------------------------------|----------------------------------------------------------|--------------------------------------------------------------|-----------------------------------------------------------------------|
| 01  | `01-wizard-open.png`                 | First QuickPick open after command fires                 | QuickPick visible with "Teams Agents and Apps" option        | Proves create wizard launched correctly                               |
| 02  | `02-agent-option.png`                | QuickPick showing app type options including "Agent"     | "Agent" option is visible                                    | Confirms correct wizard step reached                                  |
| 03  | `03-declarative-agent.png`           | QuickPick showing "Declarative Agent" highlighted        | "Declarative Agent" is visible and selectable                | Confirms DA path is reachable from Agent selection                    |
| 04  | `04-add-an-action.png`               | QuickPick showing "Add an Action" option                 | "Add an Action" is visible                                   | Confirms template path choices appear correctly                       |
| 05  | `05-mcp-server-option.png`           | QuickPick showing "Start with a MCP server" option       | "Start with a MCP server" is visible                         | Confirms MCP action source is available when feature is enabled       |
| 06  | `06-mcp-url-input.png`               | InputBox for MCP server URL (empty)                      | InputBox label references "MCP server URL"                   | Confirms URL input appears directly (no Server Type prompt)           |
| 07  | `07-workspace-folder.png`            | Workspace folder picker with "Default folder" option     | "Default folder" and "Browse" options visible                | Confirms folder step reached after URL entry                          |
| 08  | `08-app-name-input.png`              | Application Name InputBox (empty, before typing)         | InputBox is open and empty                                   | Captures pre-entry state to distinguish from post-entry state         |
| 09  | `09-project-created.png`             | State immediately after scaffold completes               | No error notification visible                                | Proves project generation succeeded without error                     |
| 10  | `10-final-state.png`                 | File tree showing generated project files                | `.vscode/mcp.json` and `appPackage/` folder visible in tree  | Proves DA project with MCP config was generated correctly             |

---

### TC-002 – VS Code: Create DA with remote MCP server (odr.exe present, user chooses Remote)

**Preconditions:**
- VS Code is open with no project loaded
- ATK extension v6.8.0+ is installed and activated
- `odr.exe` **is present** on the machine (MCP Server Type prompt is shown)

**Wizard flow:**

| Step | QuickPick / InputBox                        | Value to select / type                  |
|------|---------------------------------------------|-----------------------------------------|
| 1    | App category                                | Teams Agents and Apps                   |
| 2    | App type                                    | Agent                                   |
| 3    | Agent variant                               | Declarative Agent                       |
| 4    | DA template path                            | Add an Action                           |
| 5    | Action source                               | Start with a MCP server                 |
| 6    | MCP Server Type                             | Remote MCP server                       |
| 7    | MCP server URL (InputBox)                   | `https://mcptest.example.com/sse`       |
| 8    | Workspace folder                            | Default folder                          |
| 9    | Application Name (InputBox)                 | `test-da-mcp-odr-001` (type + Enter)    |

**Steps:**
1. ATK extension activates; VS Code shows no project.
2. Fire `fx-extension.create` command. Observe the first QuickPick panel appears.
3. Take screenshot of the initial QuickPick panel.
4. Click "Teams Agents and Apps" → "Agent" → "Declarative Agent" → "Add an Action" → "Start with a MCP server". Observe the MCP Server Type QuickPick appears (because `odr.exe` is present).
5. Take screenshot showing the MCP Server Type QuickPick with "Local MCP server" and "Remote MCP server" options.
6. Click "Remote MCP server". Observe the MCP server URL InputBox appears.
7. Take screenshot showing the MCP server URL InputBox (empty).
8. Type `https://mcptest.example.com/sse` and press Enter. Observe workspace folder picker appears.
9. Click "Default folder". Observe the Application Name InputBox.
10. Type `test-da-mcp-odr-001` and press Enter. Observe scaffold begins.
11. Wait up to 120 s for project generation.
12. Take final state screenshot showing the file tree.
13. Assert required project files exist under `~/AgentsToolkitProjects/test-da-mcp-odr-001/`.

**Expected result:**
- Wizard completes without error.
- Files present: `m365agents.yml`, `appPackage/manifest.json`, `appPackage/declarativeAgent.json`, `.vscode/mcp.json`.
- `.vscode/mcp.json` contains `https://mcptest.example.com/sse`.

**Pass criteria:**
- All 4 asserted files are present.
- `.vscode/mcp.json` exists and contains the MCP server URL.
- No error notification shown.

**Test script:**
`packages/tests/src/create-da-with-mcp-server-vscode-odr.test.ts`

**Screenshots produced by test:**

| ID  | Filename                              | What is visible                                               | Pass condition                                             | Why                                                                       |
|-----|---------------------------------------|---------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------------|
| 01  | `01-wizard-open.png`                  | First QuickPick open                                          | QuickPick visible with "Teams Agents and Apps"             | Proves create wizard launched                                             |
| 02  | `02-mcp-server-type.png`              | MCP Server Type QuickPick with Local and Remote options       | Both "Local MCP server" and "Remote MCP server" visible    | Proves odr.exe presence triggers the server-type choice step              |
| 03  | `03-mcp-url-input.png`                | InputBox for MCP server URL after choosing Remote             | InputBox open and labeled for MCP URL                      | Confirms Remote choice leads to URL input                                 |
| 04  | `04-final-state.png`                  | File tree with `.vscode/mcp.json` visible                     | `.vscode/mcp.json` and `appPackage/` visible in tree       | Proves DA + MCP project generated with Remote server type                 |

---

### TC-003 – CLI non-interactive: Create DA with remote MCP server (happy path)

**Preconditions:**
- ATK CLI is installed and available on `PATH` as `atk`
- A valid target folder exists or can be created
- No project exists at `~/atk-test-out/test-da-mcp-cli-001`

**Steps:**
1. Open an integrated terminal in VS Code (or use a system terminal).
2. Run the following command and observe it exits with status `0`:
   ```
   atk new -c declarative-agent --with-plugin yes --api-plugin-type mcp --mcp-server-type remote --mcp-da-server-url https://mcptest.example.com/sse -n test-da-mcp-cli-001 -f ~/atk-test-out --interactive false
   ```
3. Observe terminal output shows project creation succeeded (no error lines, no missing-option warnings).
4. Take screenshot of the terminal output.
5. Verify the following files exist under `~/atk-test-out/test-da-mcp-cli-001/`:
   - `m365agents.yml`
   - `appPackage/manifest.json`
   - `appPackage/declarativeAgent.json`
   - `.vscode/mcp.json`
6. Take screenshot of the file tree showing the generated project.

**Expected result:**
- CLI exits with status `0`.
- All 4 files are present.
- `.vscode/mcp.json` contains the URL `https://mcptest.example.com/sse`.
- Terminal output contains no error or missing-option messages.
- If MCP tools were auto-fetched, `ai-plugin.json` is also present; if not, a hint warning containing `atk add action` is printed to stdout.

**Pass criteria:**
- CLI exit code is `0`.
- `m365agents.yml`, `appPackage/manifest.json`, `appPackage/declarativeAgent.json`, `.vscode/mcp.json` are present.
- `.vscode/mcp.json` contains `mcptest.example.com/sse`.

**Test script:**
`packages/tests/src/create-da-with-mcp-server-cli-noninteractive.test.ts`

**Screenshots produced by test:**

| ID  | Filename                              | What is visible                                             | Pass condition                                              | Why                                                                    |
|-----|---------------------------------------|-------------------------------------------------------------|-------------------------------------------------------------|------------------------------------------------------------------------|
| 01  | `01-cli-output.png`                   | Terminal showing CLI command and its output                 | No error lines; "created" or "success" in output            | Proves CLI completed without error                                     |
| 02  | `02-project-files.png`                | File tree with generated project files                      | `.vscode/mcp.json` and `appPackage/` folder visible         | Proves project files were scaffolded correctly                         |

---

### TC-004 – CLI non-interactive error: missing `--mcp-da-server-url`

**Preconditions:**
- ATK CLI is installed and available as `atk`

**Steps:**
1. Open a terminal.
2. Run the following command (intentionally omitting `--mcp-da-server-url`):
   ```
   atk new -c declarative-agent --with-plugin yes --api-plugin-type mcp --mcp-server-type remote -n test-da-mcp-err-001 -f ~/atk-test-out --interactive false
   ```
3. Observe the command exits with a non-zero status code.
4. Take screenshot of the terminal showing the error message.
5. Verify that the error message in stdout/stderr references the missing `--mcp-da-server-url` option (or `mcp-da-server-url` parameter).
6. Verify that no project folder was created at `~/atk-test-out/test-da-mcp-err-001`.

**Expected result:**
- CLI exits with a non-zero status code.
- Error output references the missing MCP server URL parameter.
- No partial project folder is created.

**Pass criteria:**
- CLI exit code is non-zero (e.g., `1`).
- stderr or stdout contains `mcp-da-server-url` or equivalent missing-option message.
- `~/atk-test-out/test-da-mcp-err-001` does not exist.

**Test script:**
`packages/tests/src/create-da-with-mcp-server-cli-missing-url.test.ts`

**Screenshots produced by test:**

| ID  | Filename                              | What is visible                                               | Pass condition                                                 | Why                                                                         |
|-----|---------------------------------------|---------------------------------------------------------------|----------------------------------------------------------------|-----------------------------------------------------------------------------|
| 01  | `01-cli-error-output.png`             | Terminal showing error output for missing MCP URL             | Error message mentioning missing URL parameter is visible      | Proves CLI validates required MCP URL flag and surfaces a useful error      |

---

### TC-005 – CLI non-interactive error: missing `--mcp-da-auth-type` when tools file is provided

**Preconditions:**
- ATK CLI is installed and available as `atk`
- A valid MCP tools JSON file exists at `~/atk-test-out/tools.json` (can be a minimal valid JSON: `{"tools": [{"name": "search", "description": "Search the web"}]}`)

**Steps:**
1. Open a terminal.
2. Create a minimal tools JSON file:
   ```
   echo '{"tools":[{"name":"search","description":"Search the web"}]}' > ~/atk-test-out/tools.json
   ```
3. Run the following command (tools file provided but `--mcp-da-auth-type` omitted, simulating a server that requires auth):
   ```
   atk new -c declarative-agent --with-plugin yes --api-plugin-type mcp --mcp-server-type remote --mcp-da-server-url https://mcpauth.example.com/sse --mcp-tools-file-path ~/atk-test-out/tools.json -n test-da-mcp-auth-001 -f ~/atk-test-out --interactive false
   ```
4. Observe the terminal output. If the server at `mcpauth.example.com` is unreachable and auth detection is skipped, note that this path may generate the project with a warning. Otherwise, observe the CLI exits with a non-zero status.
5. Take screenshot of the terminal output.
6. If the CLI exits non-zero, verify the error message references the missing `--mcp-da-auth-type` or authentication type option.

**Expected result:**
- When the CLI detects the server requires authentication and `--mcp-da-auth-type` is not supplied, it exits with a non-zero status and an error message referencing the missing auth type.
- Alternatively (if auth detection is skipped because server is unreachable), the CLI generates the project with a warning hint.

**Pass criteria:**
- If auth is probed and required: CLI exit code is non-zero; stderr/stdout contains `mcp-da-auth-type` or equivalent.
- If auth detection is skipped: CLI exit code is `0` and a warning is printed containing `atk add action`.

**Test script:**
`packages/tests/src/create-da-with-mcp-server-cli-missing-auth.test.ts`

**Screenshots produced by test:**

| ID  | Filename                              | What is visible                                               | Pass condition                                                  | Why                                                                           |
|-----|---------------------------------------|---------------------------------------------------------------|-----------------------------------------------------------------|-------------------------------------------------------------------------------|
| 01  | `01-cli-auth-error-output.png`        | Terminal showing CLI output when auth type is missing         | Error or warning message visible referencing auth configuration | Proves CLI handles missing auth type gracefully                               |

---

### TC-006 – VS Code: Cancel before project generation leaves no partial project

**Preconditions:**
- VS Code is open with no project loaded
- ATK extension v6.8.0+ is installed and activated
- No folder named `test-da-mcp-cancel-001` exists under `~/AgentsToolkitProjects/`

**Steps:**
1. Fire `fx-extension.create` command. Observe the first QuickPick panel appears.
2. Click "Teams Agents and Apps" → "Agent" → "Declarative Agent" → "Add an Action" → "Start with a MCP server".
3. When the MCP server URL InputBox appears, take screenshot showing the InputBox open.
4. Press `Escape` to cancel the wizard. Observe the InputBox closes and no project generation starts.
5. Take screenshot of VS Code after cancellation (no new folder should have opened).
6. Verify that `~/AgentsToolkitProjects/test-da-mcp-cancel-001` does not exist.

**Expected result:**
- Pressing Escape during the URL input step cancels the wizard.
- No partial project folder is created.
- VS Code returns to its pre-creation state (no new window or folder opened).

**Pass criteria:**
- `~/AgentsToolkitProjects/test-da-mcp-cancel-001` does not exist after cancellation.
- No error notification is shown in VS Code after cancellation.

**Test script:**
`packages/tests/src/create-da-with-mcp-server-vscode-cancel.test.ts`

**Screenshots produced by test:**

| ID  | Filename                              | What is visible                                               | Pass condition                                               | Why                                                                    |
|-----|---------------------------------------|---------------------------------------------------------------|--------------------------------------------------------------|------------------------------------------------------------------------|
| 01  | `01-mcp-url-input-before-cancel.png`  | InputBox for MCP server URL open, awaiting input              | InputBox is open and empty                                   | Captures state just before cancellation is triggered                   |
| 02  | `02-after-cancel.png`                 | VS Code after Escape is pressed, no QuickPick or InputBox     | No wizard panel open; VS Code in pre-creation idle state     | Proves cancellation cleanly dismisses the wizard with no side effects  |
