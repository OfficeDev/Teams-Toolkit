# Fetch Tools From MCP Server

## Metadata

- Created: 2026-05-20T00:00:00Z
- Last updated: 2026-07-17T00:00:00Z
- Status: implemented
- PM owner: summzhan
- Engineer owner: HuihuiWu-Microsoft, Alive-Fish
- Scenario group: da
- Scenario ID: SCN-DA-FETCH-MCP-TOOLS
- Primary goal: extend
- Start state: `TEAMSFX_MCP_FOR_DA_DT=false`, and `.vscode/mcp.json` is open with at least one complete MCP server entry and the built-in and ATK CodeLens actions visible; the configured server can be started and reached.
- Success state: The selected MCP operations and conditional authentication reference are written to the chosen action manifest, a new action is referenced by the declarative agent manifest when needed, and the `MCP action added` notification offers `Provision`.
- Lifecycle phases: [extend]
- Visual/state reference: fetch-mcp-tools.html

## Scenario

With `TEAMSFX_MCP_FOR_DA_DT=false`, a developer has a Declarative Agent project with `.vscode/mcp.json` containing at least one MCP server entry produced by the compatibility branch of `SCN-DA-CREATE-WITH-MCP-SERVER` or `SCN-DA-ADD-MCP-ACTION-TO-DA`. They start the MCP server with the built-in VS Code MCP `Start` CodeLens, then click `⚡ ATK: Fetch action from MCP`. That single CodeLens click runs the entire fallback flow end-to-end: ATK discovers tools from the running server, prompts the user to pick (or create) an action manifest, optionally asks for a new file name, lets the user pick which operations Copilot can interact with, asks for an authentication type when the server requires it, and finally writes the operations into the chosen `ai-plugin.json` and wires it into `declarativeAgent.json`. The toolkit then shows the success notification with a `Provision` action.

Success means: a single MCP server is resolved from `.vscode/mcp.json`; a non-empty tool list is materialized; the user's manifest, operation and auth choices are captured; and `ai-plugin.json` + `declarativeAgent.json` are updated. This scenario owns every interactive step that the DT-off CodeLens click triggers, including the success state. It is not part of the default DT-on create or add-action path, where the agent host discovers tools dynamically at runtime.

## Dependencies

- Requires: `TEAMSFX_MCP_FOR_DA_DT=false` and an existing DA project with `appPackage/manifest.json`, a declarative agent manifest, and `.vscode/mcp.json` containing at least one MCP server entry. The DT-off branches of `SCN-DA-CREATE-WITH-MCP-SERVER` and `SCN-DA-ADD-MCP-ACTION-TO-DA` produce this state.
- The MCP server entry must be reachable: for a remote (`http`) server, VS Code must be able to start and contact it; for a local (`stdio`) server, the command and any required runtime (for example `odr.exe`) must be installed on the user's machine. The toolkit cannot run this scenario before the server is reported as running by the built-in CodeLens.
- Produces: an updated action manifest (existing `ai-plugin.json` or a newly created one) and an updated `declarativeAgent.json` with the new action wired in. When the chosen server requires authentication, the toolkit also writes the OAuth registration follow-up actions so provisioning can complete.

## Feature flags

- `TEAMSFX_MCP_FOR_DA_DT` defaults to `true`. This scenario is the compatibility path reached only when DT is explicitly `false`; with DT true, create and add action write dynamic-discovery runtimes directly and this follow-up is unnecessary.
- `TEAMSFX_MCP_FOR_DA_DCR` defaults to `true` and gates `OAuth (with dynamic registration)` inside this DT-off flow. Unlike the default create/add auth picker, the fetch-tools picker checks DCR alone because entry into the scenario has already established DT=false.
- The current VS Code `WorkspaceMCPConfigCodeLensProvider` is registered for every `.vscode/mcp.json` and does not hide `⚡ ATK: Fetch action from MCP` when DT is true. Invoking it manually in a DT-on project can still materialize static tools, but that redundant conversion is not part of the default create/add journey or the supported fallback contract captured here.
- Keep this scenario and its tests while the DT-off route exists. Archive it only after `TEAMSFX_MCP_FOR_DA_DT` and the corresponding CodeLens implementation are removed.

## Surfaces

- VS Code built-in CodeLens: VS Code's MCP runtime owns the `Start`, `tools`, `prompts`, and `More...` actions on each server entry in `.vscode/mcp.json`. Pressing `Start` brings the server up and populates the tools/prompts counts shown next to the server.
- VS Code ATK CodeLens: ATK contributes `⚡ ATK: Fetch action from MCP` on each server key. The provider is currently visible regardless of DT, while this scenario uses it as the primary entry point for the DT-off compatibility flow. Because it is per-server, the click already binds the action to that specific server and no server picker is shown.
- VS Code Command Palette (edge case): `Microsoft 365 Agents: Fetch action from MCP` is also available without a click target; in that case the toolkit reads `.vscode/mcp.json` and, only if more than one server is configured, prompts the user to pick one in a Quick Pick titled `Select MCP Server`. This Command Palette path is not part of the primary visualized flow.
- CLI: not covered by this scenario. The CLI uses an end-to-end `atk add action --api-plugin-type mcp` path described in `SCN-DA-ADD-MCP-ACTION-TO-DA` which combines URL collection with tool fetch and action manifest update; it does not have a separate fetch surface.
- Visual Studio and chat: not covered.

## States

- Entry: DT is disabled and `.vscode/mcp.json` is open in VS Code; the built-in MCP CodeLens row is visible. The server entry was placed there earlier by a DT-off create or add-action branch. The same ATK CodeLens may also be visible in DT-on projects, but that is not the originating state for this fallback scenario.
- Built-in CodeLens row: `Start | tools | prompts | More...`. Before the server starts, the tools and prompts counts are not shown. After start, the counts reflect what VS Code's MCP runtime discovered.
- ATK CodeLens row: `⚡ ATK: Fetch action from MCP`. Also reachable from the Command Palette as `Microsoft 365 Agents: Fetch action from MCP`.
- Server resolution: each ATK CodeLens is rendered per server entry, so a CodeLens click already binds the action to that server and no server picker is shown. The multi-server `Select MCP Server` Quick Pick is reached only from the Command Palette when `.vscode/mcp.json` contains more than one server; each row shows either the server URL (for `http` servers) or `command args` (for `stdio` servers) as its description.
- Tool discovery: after the click, the toolkit reads the tools from the running MCP server. The user does not see a separate prompt for this step; the flow either advances to manifest selection or surfaces the empty-tools error described below.
- Manifest selection: ATK shows a Quick Pick titled `Select the action manifest you want to update`. The list contains the action manifest files already wired into the declarative agent, a `Create a new ai-plugin.json` row, and the `Browse…` row.
- Name new manifest: when the user picks `Create a new ai-plugin.json`, ATK shows the text input `Name the new action manifest file` with default `ai-plugin.json`. Validation rejects empty input, names without the `.json` extension, absolute or nested paths, and names that already exist in `appPackage/`.
- Operation selection: the Quick Pick titled `Select Operation(s) Copilot can interact with` lists the operations the toolkit fetched from the server. When the user is updating a manifest that already references this MCP server, the operations already wired in are pre-selected.
- Auth type selection: when the MCP server requires authentication, the Quick Pick titled `Select Authentication Type` is shown with `OAuth (with static registration)` and `Entra SSO` options. When `TEAMSFX_MCP_FOR_DA_DCR` is enabled, `OAuth (with dynamic registration)` is inserted as the first option. The option details match the code-backed picker strings: `OAuth (with dynamic registration)` says `MCP server registers a client at runtime; no extra details needed.`, `OAuth (with static registration)` says `Use a pre-registered OAuth client. The toolkit will ask for client id, client secret, and optional scopes.`, and `Entra SSO` says `Use a Microsoft Entra app for single sign-on. The toolkit will ask for the Entra app client id.` Unauthenticated servers skip this step.
- Success: ATK shows `The operations selected from your MCP server are successfully added for Copilot to interact with. You can go to the 'ai-plugin.json' to check on details. Now you are able to provision your declarative agent to continue.` with `Provision` as the action.
- Recoverable: tools not found. When the server returns no tools, ATK shows the error notification `No tools found for the MCP server. Please run the server first.` (source: Microsoft 365 Agents Toolkit) and the flow stops before the manifest picker appears. The user starts the server (or fixes the tools file) and re-clicks `⚡ ATK: Fetch action from MCP`.
- Recoverable: prerequisites missing. When `.vscode/mcp.json` is missing, malformed, has no servers, or the selected server entry is incomplete (no URL for an `http` server, no command for a `stdio` server), ATK shows an error notification describing the missing piece and stops before any picker opens. The user fixes the file and retries.
- Cancellation: the user can cancel at any picker (manifest selection, name new manifest input, operation multi-select, auth single-select, or the rare Command Palette multi-server picker) before the manifest is updated; cancellation must not leave behind a partial selection or write to disk.

## Flow

### VS Code fetch tools flow

```mermaid
flowchart TD
  Start([Open .vscode/mcp.json and start the MCP server using the built-in CodeLens]) --> Click[Click ⚡ ATK: Fetch action from MCP on the server row]
  Click --> Discover[ATK reads the server entry and fetches its available tools]
  Discover --> ToolsResolved{Tools available?}
  ToolsResolved -- No --> NoTools["Show error 'No tools found for the MCP server. Please run the server first.' and stop"]
  ToolsResolved -- Yes --> SelectManifest[Quick Pick: Select the action manifest you want to update]
  SelectManifest -- Create a new ai-plugin.json --> NameNewManifest[Input: Name the new action manifest file]
  SelectManifest -- Existing or Browse --> SelectOps
  NameNewManifest --> SelectOps["Multi-select: Select Operation(s) Copilot can interact with"]
  SelectOps --> AuthRequired{Server requires authentication?}
  AuthRequired -- Yes --> SelectAuth[Single-select: Select Authentication Type]
  AuthRequired -- No --> Apply
  SelectAuth --> Apply[Write the chosen operations into the selected ai-plugin.json and wire it into declarativeAgent.json]
  Apply --> Complete([Show success notification with Provision action])
  SelectManifest --> Cancel([Cancel without staging changes])
  NameNewManifest --> Cancel
  SelectOps --> Cancel
  SelectAuth --> Cancel
```

## User-visible outputs

This scenario updates an existing DA project; there is no template boilerplate to summarize. Every output listed below is driven by the user's answers in the picker flow (manifest pick, optional new-manifest name, operation multi-select, optional auth type pick).

### File changes

- `appPackage/<chosen action manifest>.json` (default `ai-plugin.json`) — created when the user picks `Create a new ai-plugin.json` (file name from the `Name the new action manifest file` input), modified otherwise. The operations selected in `Select Operation(s) Copilot can interact with` are written under `functions` and referenced from the MCP server runtime's `run_for_functions`. When the server requires authentication, the runtime's `auth` block is written to point at the OAuth configuration injected into `m365agents.yml`. When the user is updating a manifest that already references this MCP server, existing operations remain in place; only added/removed operations from the multi-select change the file.
- `appPackage/declarativeAgent.json` — modified only when a new action manifest was created in step 3. A new entry is appended to `actions` with an `id` that does not collide with existing actions (`action`, `action_2`, ...) and `file` set to the new manifest's basename. When an existing action manifest is reused, this file is not touched.
- `m365agents.yml` — modified only when the user selected an authentication type for this MCP server runtime and the matching registration step is not already present. The toolkit injects `oauth/register` for `OAuth (with static registration)` and `Entra SSO`, or `dcr/register` for `OAuth (with dynamic registration)`, at the same shape and ordering used by `SCN-DA-CREATE-WITH-MCP-SERVER` and `SCN-DA-ADD-MCP-ACTION-TO-DA`, so the manifest's `auth.reference_id` resolves at provision time.

### Notifications and prompts

- Entry points are the built-in `Start | tools | prompts | More...` CodeLens, the per-server `⚡ ATK: Fetch action from MCP` CodeLens, and the `Microsoft 365 Agents: Fetch action from MCP` Command Palette command.
- The Command Palette path conditionally shows `Select MCP Server`. The main flow then shows `Select the action manifest you want to update`, conditionally shows `Name the new action manifest file`, shows `Select Operation(s) Copilot can interact with`, and conditionally shows `Select Authentication Type`.
- Success (info, source `Microsoft 365 Agents Toolkit`): title `MCP action added`, message `The operations selected from your MCP server are successfully added for Copilot to interact with.`, detail `You can go to the 'ai-plugin.json' to check on details. Now you are able to provision your declarative agent to continue.`, action button `Provision` (runs the standard provision lifecycle).

### Error and recovery messages

- `No tools found for the MCP server. Please run the server first.` — error toast (source `Microsoft 365 Agents Toolkit`). Surfaced when the MCP server returns no tools at discovery time. Recovery: start the server using the built-in VS Code MCP `Start` CodeLens (or fix its configuration) and re-click `⚡ ATK: Fetch action from MCP`. No files are written before this fires.
- Prerequisite errors — error toasts surfaced when `.vscode/mcp.json` is missing, malformed, has no server entries, or the resolved server entry is incomplete (no `url` for an `http` server, no `command` for a `stdio` server). Each toast names the missing piece. Recovery: edit `.vscode/mcp.json` and retry the CodeLens. No files are written before these fire.
- Cancellation at any picker (manifest selection, name new manifest input, operation multi-select, auth single-select, or the rare Command Palette `Select MCP Server` multi-server picker) leaves no notification and writes nothing to disk.

### Environment and secret writes

- The injected `oauth/register` or `dcr/register` step in `m365agents.yml` reserves a configuration ID that is written into the project's environment files when the provision lifecycle runs. This scenario does not write to `env/.env.*` or collect secrets during the picker flow; provision owns any required credential collection.

### External side effects

- The toolkit contacts the selected local or remote MCP server and reads its tool definitions. It does not create cloud-side resources during this scenario. Any OAuth client registration happens later during provision, when the injected `oauth/register` or `dcr/register` step runs.

## Validation notes

- VS Code extension unit tests cover the CodeLens provider and `updateActionWithMCP` handler, but no current independently executable vscuse plan is tagged with `SCN-DA-FETCH-MCP-TOOLS`. The older `Feature_DA_Add_MCP_Server` plan exercises this flow as part of a larger, stale multi-behavior recording and remains a refresh source rather than current scenario evidence.
- VS Code UI test intent should trace to `SCN-DA-FETCH-MCP-TOOLS` and cover both entry points (`⚡ ATK: Fetch action from MCP` CodeLens and `Microsoft 365 Agents: Fetch action from MCP` Command Palette), single-server vs multi-server resolution, both remote (`http`) and local (`stdio`) MCP servers, manifest selection (existing vs `Create a new ai-plugin.json` vs `Browse…`), the `Name the new action manifest file` input and its validation rules, operation pre-selection when updating an existing manifest, the conditional `Select Authentication Type` step, and the `Provision` success notification.
- Recovery validation should exercise the empty-tools error notification `No tools found for the MCP server. Please run the server first.` and the prerequisite errors raised when `.vscode/mcp.json` is missing, malformed, has no server entries, or the resolved entry is missing its URL (for `http`) or command (for `stdio`). The flow should not write to `ai-plugin.json` or `declarativeAgent.json` when any of these errors fire.
- This scenario is the VS Code post-step only for the DT-off branches of `SCN-DA-CREATE-WITH-MCP-SERVER` and `SCN-DA-ADD-MCP-ACTION-TO-DA`. Default DT-on tests must not depend on the CodeLens flow.
- DCR coverage for this picker uses `DT=false, DCR=true`; this deliberately differs from the default dynamic create/add picker, where the DCR option requires both flags.
- Provision coverage owns credential collection, administrator handoff, and account or tenant prerequisites for injected registration actions. This picker writes no credential values.
- Keep this scenario's UI coverage until the DT flag and CodeLens fallback implementation are removed. Coverage should also assert the current unconditional CodeLens visibility so a future decision to gate it is an explicit product change rather than an accidental side effect.
