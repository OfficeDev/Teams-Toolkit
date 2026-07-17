# Create Declarative Agent With MCP Server

## Metadata

- Created: 2026-05-20T00:00:00Z
- Last updated: 2026-07-13T08:52:39Z
- PM owner: summzhan
- Engineer owner: HuihuiWu-Microsoft, Alive-Fish
- Scenario group: da
- Scenario ID: SCN-DA-CREATE-WITH-MCP-SERVER
- Primary goal: create
- Start state: No project choice has been made; the developer can start the new project flow and choose `Declarative Agent`.
- Success state: VS Code has opened a generated DA project with `.vscode/mcp.json` ready for the follow-up MCP action flow; CLI has created the project with MCP action wiring when tools are available, or with the documented warning and add-action hint when they are not.
- Lifecycle phases: [create]
- Visual/state reference: create-da-with-mcp-server.html

## Scenario

A developer creates a Declarative Agent project that is connected to an MCP server. In VS Code, this scenario stops at a generated DA project with `.vscode/mcp.json`; adding MCP tools to the action manifest is handled by the dependent scenario `SCN-DA-ADD-MCP-ACTION-TO-DA`. In CLI, the current implementation has no CodeLens follow-up UX, so the create command also tries to fetch or load MCP tool definitions and may generate the MCP-backed action during project creation.

Success means the developer can choose the Declarative Agent path, choose `Add an Action`, choose `Start with a MCP server`, provide a remote MCP server URL, choose the authentication type, choose the project location, enter the application name, and generate a DA project. Static OAuth and Entra credentials are not collected or persisted during create; the existing `oauth/register` provision action asks for them when it first runs. For VS Code, the project contains `.vscode/mcp.json` and is ready for `SCN-DA-ADD-MCP-ACTION-TO-DA`. For CLI, success may additionally include generated MCP action files when tools are available during `atk new`.

This scenario is grounded in the current create question tree and CLI options:

- `capability=declarative-agent`
- `with-plugin=yes`
- `api-plugin-type=mcp`
- `mcp-server-type=remote`
- `mcp-da-server-url=<remote MCP server URL>`
- required `app-name`
- required `folder`
- optional `mcp-tools-file-path` for authenticated or offline MCP tool definitions
- optional `mcp-da-auth-type`, with valid values `oauth` for `OAuth (with static registration)` and `entraSSO` for `Entra SSO`

Client ids, client secrets, and OAuth scopes are provision inputs, not create inputs. The provision prompt marks the client secret as a password and keeps it out of generated project files and ordinary environment files.

## Dependencies

- Produces: a DA project folder with `appPackage/manifest.json`, a declarative agent manifest, and `.vscode/mcp.json` configured with the MCP server URL in the VS Code flow. When authentication is selected, the generated lifecycle contains the corresponding registration action but no credential values.
- Enables: `SCN-DA-FETCH-MCP-TOOLS` (VS Code discovery step that runs implicitly before action manifest selection) and `SCN-DA-ADD-MCP-ACTION-TO-DA`, which requires an existing DA project and, for VS Code, a configured `.vscode/mcp.json` entry.
- Does not include: the post-create VS Code CodeLens flow for selecting or creating an action manifest and choosing MCP operations. That belongs to `add-mcp-action-to-da.md`.

## Feature flags

- The shipped MCP create route is controlled by an MCP-for-DA gate, and other action-source options may have their own gates. Their exact identifiers and default values are not established by this scenario.

## Surfaces

- VS Code: primary guided creation experience using Quick Pick and input box states. It writes `.vscode/mcp.json` and prompts the user to start the MCP server and use the later fetch action flow.
- CLI interactive: current prompt-driven `atk new` behavior. It asks for the DA capability, action source, remote MCP server URL, optional tools file when tools are not auto-fetched, operation selection when tools are available, auth type when the MCP server requires authentication, app name, and folder.
- CLI non-interactive: current flag-driven `atk new` behavior. It requires `--capability declarative-agent`, `--with-plugin yes`, `--api-plugin-type mcp`, `--mcp-da-server-url`, `--app-name`, and `--folder`; it may use `--mcp-tools-file-path` and `--mcp-da-auth-type` for authenticated MCP servers.
- Visual Studio and chat: not covered by this scenario.

## States

- Entry: no project choice has been made; the user can choose `Declarative Agent` from the new project flow.
- Template decision: the user picks one of `No Action`, `Add an Action`, `Add a Copilot connector`, or `Start with TypeSpec for Microsoft 365 Copilot`.
- Action source decision: when adding an action, the user chooses `Start with a New API`, `Start with an OpenAPI Description Document`, `Start with an Office Add-in Action`, or `Start with a MCP server` when MCP for DA is enabled. Some options are gated by feature flags.
- MCP source: after `Start with a MCP server`, the toolkit checks whether `odr.exe` is installed on the user's machine. If `odr.exe` is present, the user is asked `MCP Server Type` and chooses `Local MCP server` or `Remote MCP server`. If `odr.exe` is not present, the prompt is skipped and the flow proceeds as if `Remote MCP server` was selected.
- Project input: the user enters the MCP server URL, picks the project location, then enters the app name before project generation.
- CLI tool discovery: the CLI attempts to fetch tools from the MCP server. If the server requires authentication or tools are not fetched, it can ask for `MCP Tools Definition File`.
- CLI tool selection: when tool definitions are available in the interactive create flow, the user can choose `Select Operation(s) Copilot can interact with`.
- CLI auth: when the MCP server requires authentication, the user is asked `Select Authentication Type` and chooses either `OAuth (with static registration)` or `Entra SSO`. Create asks no credential follow-up questions.
- First provision: `OAuth (with static registration)` asks for client id, password-masked client secret, and scopes; `Entra SSO` asks for its client id; dynamic registration asks for none. These values are consumed by the registration action for that provision invocation and are not written into scaffold output.
- VS Code success: the generated project is opened with `.vscode/mcp.json`; follow-up action manifest update belongs to `SCN-DA-ADD-MCP-ACTION-TO-DA`.
- CLI success with tools: project files, the action manifest (`ai-plugin.json`), the captured MCP tool definitions as JSON, and the MCP runtime wiring are generated during creation.
- CLI warning without tools: the project is created, but MCP action files may remain incomplete; the CLI prints a warning with the current hint command `atk add action --api-plugin-type mcp --mcp-da-server-url <server-url> --mcp-tools-file-path <path-to-tools-json> --interactive false`.
- Recoverable error: invalid app name, invalid or unavailable location, invalid MCP server URL, missing tools file, unreadable tools file, missing auth type when required, or missing required non-interactive option is shown with a same-flow recovery path.
- Cancellation: the user can cancel before project generation; cancellation must not create a partially accepted project.

## Flow

### VS Code create flow

```mermaid
flowchart TD
  Start([Developer starts Create a New Agent/App]) --> ChooseDA[Choose Declarative Agent]
  ChooseDA --> ChooseDATemplate{Choose DA template path}
  ChooseDATemplate -- No Action --> SelectLocation[Select project location]
  ChooseDATemplate -- Add an Action --> ChooseActionSource{Choose action source}
  ChooseDATemplate -- Add a Copilot connector or TypeSpec --> OtherDATemplate[Follow selected DA template prompts]
  ChooseActionSource -- Start with a New API --> NewApiAuth[Choose API authentication]
  ChooseActionSource -- Start with an OpenAPI Description Document --> SelectOpenApi[Select OpenAPI document]
  ChooseActionSource -- Start with an Office Add-in Action --> OfficeAddinAction[Follow Office add-in action prompts]
  ChooseActionSource -- Start with a MCP server --> OdrCheck{odr.exe installed?}
  NewApiAuth --> SelectLocation
  SelectOpenApi --> SelectOpenApiOps[Select operations Copilot can interact with]
  SelectOpenApiOps --> SelectLocation
  OfficeAddinAction --> SelectLocation
  OdrCheck -- Yes --> ServerType{Choose MCP Server Type}
  OdrCheck -- No --> EnterMcpUrl[Enter MCP server URL]
  ServerType -- Local MCP server --> LocalMcp[Use local MCP server via odr.exe]
  ServerType -- Remote MCP server --> EnterMcpUrl
  LocalMcp --> SelectLocation
  EnterMcpUrl --> SelectLocation
  SelectLocation --> EnterAppName[Enter application name]
  EnterAppName --> Validate{App name, location, and inputs valid?}
  Validate -- No --> ShowInputRecovery[Show validation error and keep user in the prompt]
  ShowInputRecovery --> EnterAppName
  Validate -- Yes --> Generate[Generate DA project and write .vscode/mcp.json]
  Generate --> ProjectReady([Project ready for SCN-DA-ADD-MCP-ACTION-TO-DA])
  ChooseDA --> Cancel([Cancel without creating project])
  ChooseDATemplate --> Cancel
  ChooseActionSource --> Cancel
  SelectLocation --> Cancel
  EnterAppName --> Cancel
```

### CLI interactive create flow

```mermaid
flowchart TD
  Start([Run atk new in interactive mode]) --> ChooseCapability[Choose capability: declarative-agent]
  ChooseCapability --> AddAction[Choose Create Declarative Agent: add action]
  AddAction --> ChooseMcp[Choose action type: mcp]
  ChooseMcp --> OdrCheck{odr.exe installed?}
  OdrCheck -- Yes --> ServerType{Choose MCP Server Type}
  OdrCheck -- No --> EnterUrl[Enter MCP Server URL]
  ServerType -- Local MCP server --> LocalMcp[Use local MCP server via odr.exe]
  ServerType -- Remote MCP server --> EnterUrl
  LocalMcp --> EnterAppName
  EnterUrl --> FetchTools{CLI auto-fetches tools from URL?}
  FetchTools -- Tools available --> SelectOps[Select Operations Copilot can interact with]
  FetchTools -- Auth required or no tools --> EnterToolsFile[Enter optional MCP Tools Definition File]
  EnterToolsFile --> ToolsFromFile{Tools loaded from file?}
  ToolsFromFile -- Yes --> SelectOps
  ToolsFromFile -- No --> ContinueWithoutTools[Continue with warning and dynamic-discovery hint]
  SelectOps --> AuthRequired{MCP server requires authentication?}
  AuthRequired -- Yes --> SelectAuth[Select Authentication Type: OAuth with static registration or Entra SSO]
  AuthRequired -- No --> EnterAppName[Enter Application Name]
  SelectAuth --> EnterAppName
  ContinueWithoutTools --> EnterAppName
  EnterAppName --> SelectFolder[Choose Workspace Folder]
  SelectFolder --> Generate[Generate project]
  Generate --> Complete([Project created; MCP action generated when tools were available])
  ChooseCapability --> Cancel([Cancel without creating project])
  EnterUrl --> Cancel
  SelectFolder --> Cancel
```

### CLI non-interactive create flow

```mermaid
flowchart TD
  Start([Run atk new --interactive false]) --> ValidateFlags{Required flags present?}
  ValidateFlags -- No --> MissingOption[Return validation error for missing capability, app name, folder, or MCP URL]
  ValidateFlags -- Yes --> ResolveTemplate[Pick the declarative agent + MCP action template]
  ResolveTemplate --> ToolsInput{mcp-tools-file-path provided?}
  ToolsInput -- Yes --> LoadTools[Load tools from JSON file]
  ToolsInput -- No --> FetchTools[Try to fetch tools from MCP server URL]
  LoadTools --> AuthProbe[Probe MCP server auth when needed]
  FetchTools --> ToolsReady{Tools available?}
  AuthProbe --> ToolsReady
  ToolsReady -- Yes --> AuthNeeded{Auth required?}
  AuthNeeded -- Yes --> AuthFlag{mcp-da-auth-type provided?}
  AuthFlag -- No --> MissingAuth[Return missing auth type error]
  AuthFlag -- Yes --> GenerateWithAction[Generate project and MCP-backed action files]
  AuthNeeded -- No --> GenerateWithAction
  ToolsReady -- No --> GenerateWithWarning[Generate project and print add-action hint warning]
  GenerateWithAction --> Complete([Project created with MCP action wiring])
  GenerateWithWarning --> CompleteDeferred([Project created; add tools later with SCN-DA-ADD-MCP-ACTION-TO-DA])
```

Example current non-interactive command:

```bash
atk new -c declarative-agent --with-plugin yes --api-plugin-type mcp --mcp-server-type remote --mcp-da-server-url <server-url> -n <app-name> -f <folder> --interactive false
```

Authenticated or offline tool definitions can be supplied with:

```bash
atk new -c declarative-agent --with-plugin yes --api-plugin-type mcp --mcp-server-type remote --mcp-da-server-url <server-url> --mcp-tools-file-path <tools.json> --mcp-da-auth-type oauth -n <app-name> -f <folder> --interactive false
```

## User-visible outputs

### File changes

- Both surfaces generate the standard DA project scaffold, summarized here as `appPackage/manifest.json`, the declarative agent manifest, lifecycle files, and the stock project files shared by DA templates.
- VS Code creates `.vscode/mcp.json` with the selected remote MCP server URL and opens the generated project. It does not create the MCP action manifest or persist authentication credentials during this scenario.
- When CLI resolves tools, it additionally creates `appPackage/ai-plugin.json`, writes the captured MCP tool definitions as JSON, updates the declarative agent manifest, and adds the matching MCP runtime and conditional authentication registration wiring.
- When CLI cannot resolve tools, it still creates the project but may leave the MCP action files incomplete. Cancellation before generation must not leave a partially accepted project.

### Notifications and prompts

- The guided flow includes the Declarative Agent/template/action-source picks, the conditional `MCP Server Type` pick, `MCP Server URL`, project location, and application name. CLI may also prompt for a tools file, operations, and authentication type.
- CLI reports project creation with either generated action wiring or a warning plus the `atk add action --api-plugin-type mcp ...` follow-up hint. Exact VS Code and CLI success copy is not specified in this Markdown contract.

### Error and recovery messages

- Invalid application name, unavailable location, invalid MCP server URL, missing or unreadable tools file, missing authentication type when required, and missing required non-interactive options keep the user in the flow or return a correctable validation error. Exact message text is not specified.
- Cancelling before generation exits without creating a partially accepted project.

### Environment and secret writes

- Create writes no client ID, client secret, scope, or other credential value to the generated project. Static OAuth and Entra inputs are collected by `oauth/register` during first provision; the client secret is password-masked and is not written to ordinary environment files by this scenario.

### External side effects

- VS Code checks for `odr.exe` locally and records the selected MCP server configuration; it does not register external OAuth resources during create.
- CLI may contact the remote MCP server to discover tools. OAuth registration is deferred to provision.

## Open questions

- What are the exact identifiers and defaults of the gates that expose the MCP and other conditional action-source options?
- The narrative mentions choosing authentication during success, but the shipped VS Code flow has no authentication prompt. Should success be described only by the current surface-specific states?
- Should the VS Code handoff go directly to `SCN-DA-FETCH-MCP-TOOLS`, or first to `SCN-DA-ADD-MCP-ACTION-TO-DA`? The current text uses both relationships.
- What `.vscode/mcp.json` shape represents the local `stdio` branch, and what exact success/error messages belong to the contract?
- The current create notification refers to `ATK: Update Action with MCP`, while the contributed Command Palette label is `Microsoft 365 Agents: Fetch action from MCP`. Should the notification copy be corrected?

## Validation notes

- VS Code UI test intent should trace to `SCN-DA-CREATE-WITH-MCP-SERVER` and stop after project generation, `.vscode/mcp.json` creation, and the handoff into `SCN-DA-ADD-MCP-ACTION-TO-DA`.
- CLI E2E test intent should trace to `SCN-DA-CREATE-WITH-MCP-SERVER` for interactive and non-interactive `atk new` paths.
- CLI non-interactive validation should cover missing `--mcp-da-server-url` when `--api-plugin-type mcp` is used, unreadable `--mcp-tools-file-path`, missing `--mcp-da-auth-type` when auth is required and tools are provided, invalid app name, and invalid or unavailable target folder.
- Because current CLI creation may generate action files when tools are available, validation should assert both possible outcomes: generated MCP action wiring with tools, or a created project plus warning/hint when tools cannot be fetched.
- Future spec acceptance criteria should trace to the related PRD requirement IDs once the dedicated PRD exists.
