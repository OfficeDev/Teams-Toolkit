# Agent Templates Reference

## Contents
- CLI Capabilities (all atk new -c options)
- Declarative Agents (creating, options)
- Custom Engine Agents (creating, languages)
- Teams Agents (creating, languages)
- Other Templates (bot, tab, message extension)
- Best Practices (language matching)
- Template Selection Guide

## CLI Capabilities (atk new -c)

Use `atk new -c <capability>` to create projects. Available capabilities:

| Capability | Description |
|------------|-------------|
| `declarative-agent` | Declarative Agent |
| `declarative-agent-action` | Declarative Agent with Action from Scratch |
| `declarative-agent-action-bearer` | Declarative Agent with Action from Scratch (Bearer Token) |
| `declarative-agent-action-oauth` | Declarative Agent with Action from Scratch (OAuth) |
| `declarative-agent-action-from-existing-api` | Declarative Agent with Action from Existing API |
| `declarative-agent-with-action-from-mcp` | Declarative Agent with Action from MCP Server |
| `declarative-agent-with-graph-connector` | Declarative Agent with Copilot Connector |
| `declarative-agent-meta-os-new-project` | Declarative Agent for MetaOS (New Project) |
| `declarative-agent-meta-os-upgrade-project` | Declarative Agent for MetaOS (Upgrade Project) |
| `declarative-agent-typespec` | Declarative Agent from TypeSpec |
| `basic-custom-engine-agent` | Basic Custom Engine Agent |
| `weather-agent` | Weather Agent |
| `foundry-agent-to-m365` | Foundry Agent to M365 |
| `copilot-connector` | Copilot Connector |
| `teams-agent` | General Teams Agent |
| `teams-agent-rag-customize` | Teams Agent with Data from Customized Source |
| `teams-agent-rag-azure-ai-search` | Teams Agent with Data from Azure AI Search |
| `teams-agent-rag-custom-api` | Teams Agent with Data from Custom API using OpenAPI Spec |
| `teams-collaborator-agent` | Teams Collaborator Agent |
| `tab` | Tab |
| `bot` | Simple Bot |
| `message-extension` | Message Extension |
| `office-addin-outlook-taskpane` | Outlook Task Pane Add-in |
| `office-addin-wxpo-taskpane` | Office Task Pane Add-in |
| `office-addin-excel-cfshortcut` | Excel Custom Functions |
| `office-addin-excel-customfunctions` | Excel Custom Functions (JavaScript-only Runtime) |
| `office-addin-sso-naa` | Single Sign-On with Nested App Auth |
| `office-addin-config` | Office Add-in Common Configuration |

## Declarative Agents (Copilot Extensions)

### Creating a Declarative Agent

```bash
# Basic declarative agent (no backend service needed)
atk new -c declarative-agent -n myagent -i false

# Declarative agent with new API plugin (creates backend)
atk new -c declarative-agent-action -l typescript -n myagent -i false

# Declarative agent with existing OpenAPI spec (requires -a and -o with operation IDs)
# First inspect the OpenAPI spec to find operation IDs, then pass them:
atk new -c declarative-agent-action-from-existing-api -n myagent -a <openapi-spec-url-or-path> -o "GET /repairs" -o "POST /repairs" -i false

# Declarative agent with MCP Server
atk new -c declarative-agent-with-action-from-mcp -n myagent -i false
```

**Important Notes:**
- Basic declarative agents (`declarative-agent`) do NOT require a programming language
- `declarative-agent-action`: Use `-l typescript/javascript/csharp` (creates new backend API)
- `declarative-agent-action-from-existing-api`: Requires `-a` (OpenAPI spec) and `-o` (operation IDs from the spec, e.g., `"GET /repairs"`)

### Declarative Agent Options

| Option | Values | Description |
|--------|--------|-------------|
| `--openapi-spec-location -a` | file path or URL | **Required for existing API**: OpenAPI spec location |
| `--api-operation -o` | operation IDs (e.g., `"GET /path"`) | **Required for existing API**: Actual operation IDs from OpenAPI spec. Use multiple `-o` for multiple operations |
| `--api-auth` | `none`, `api-key`, `bearer-token`, `oauth` | API authentication type |

## Custom Engine Agents (M365 SDK-based)

### Creating a Custom Engine Agent

```bash
# Basic custom engine agent
atk new -c basic-custom-engine-agent -l typescript -n myagent -i false

# Weather agent sample
atk new -c weather-agent -l typescript -n myagent -i false
```

| Capability | Languages | Description |
|------------|-----------|-------------|
| `basic-custom-engine-agent` | typescript, javascript, python | Basic agent with M365 SDK and LLM |
| `weather-agent` | typescript, javascript, csharp | Weather forecast agent with LangChain |

## Teams Agents (Teams AI Library)

### Creating a Teams Agent

```bash
# Basic Teams chatbot
atk new -c teams-agent -l typescript -n mybot -i false

# Teams Agent with RAG (custom data source)
atk new -c teams-agent-rag-customize -l typescript -n mybot -i false

# Teams Agent with Azure AI Search
atk new -c teams-agent-rag-azure-ai-search -l typescript -n mybot -i false
```

| Capability | Languages | Description |
|------------|-----------|-------------|
| `teams-agent` | typescript, javascript, csharp, python | General Teams Agent |
| `teams-agent-rag-customize` | typescript, javascript, csharp, python | Teams Agent with Customized Data Source |
| `teams-agent-rag-azure-ai-search` | typescript, javascript, csharp, python | Teams Agent with Azure AI Search |
| `teams-agent-rag-custom-api` | typescript, javascript, csharp, python | Teams Agent with Custom API |
| `teams-collaborator-agent` | typescript, csharp | Teams Collaborator Agent |

## Other Templates

```bash
# Simple Bot
atk new -c bot -l typescript -n mybot -i false

# Tab
atk new -c tab -l typescript -n mytab -i false

# Message Extension
atk new -c message-extension -l typescript -n myme -i false
```

| Capability | Languages | Description |
|------------|-----------|-------------|
| `bot` | typescript, javascript, python, csharp | Simple Bot |
| `tab` | typescript, csharp | Tab |
| `message-extension` | typescript, python, csharp | Message Extension |
| `copilot-connector` | typescript, csharp | Copilot Connector |

## Office Add-ins

Office add-ins extend Office applications (Word, Excel, PowerPoint, Outlook) with custom task panes and functions. All office add-in capabilities are TypeScript only.

```bash
# Task pane add-in for Word, Excel, PowerPoint, and Outlook (all hosts by default)
atk new -c office-addin-wxpo-taskpane -l typescript -n myaddin -i false

# Task pane supporting only specific Office apps (comma-separated, no spaces)
atk new -c office-addin-wxpo-taskpane -l typescript -n myaddin --office-addin-hosts word,excel -i false

# Excel custom functions with keyboard shortcuts
atk new -c office-addin-excel-cfshortcut -l typescript -n myaddin -i false

# Excel custom functions with a JavaScript-only runtime
atk new -c office-addin-excel-customfunctions -l typescript -n myaddin -i false

# Task pane add-in with single sign-on via Nested App Auth
atk new -c office-addin-sso-naa -l typescript -n myaddin -i false
```

| Capability | Languages | Description |
|------------|-----------|-------------|
| `office-addin-wxpo-taskpane` | typescript | Task pane add-in for Word, Excel, PowerPoint, and/or Outlook |
| `office-addin-excel-cfshortcut` | typescript | Excel custom functions with keyboard shortcuts (shared runtime) |
| `office-addin-excel-customfunctions` | typescript | Excel custom functions using a JavaScript-only runtime |
| `office-addin-sso-naa` | typescript | Task pane add-in with single sign-on via Nested App Auth |
| `office-addin-config` | typescript | Common configuration for Office add-ins |

### Office Add-in Options

| Option | Values | Description |
|--------|--------|-------------|
| `--office-addin-hosts` | `word`, `powerpoint`, `outlook`, `excel` (comma-separated) | Office apps the task pane supports. Only applies to `office-addin-wxpo-taskpane`. Optional; defaults to all four hosts. Source files and debug configs for unselected hosts are pruned. |

## Best Practices

### Before Creating a Project

1. **Use non-interactive mode** - Always use `-i false` for scripted creation

2. **Match language to capability**:
   - Basic declarative agents (`declarative-agent`): NO language flag needed
   - API plugin agents (`declarative-agent-action`): `-l typescript/javascript/csharp`
   - Custom Engine agents: `-l typescript/javascript/python`
   - Teams agents: `-l typescript/javascript/csharp/python`

## Template Selection Guide

**Choose Declarative Agents when:**
- Extending Microsoft 365 Copilot with custom instructions
- Integrating APIs as actions without running custom code
- Need zero-infrastructure deployment

**Choose Custom Engine Agents when:**
- Need custom LLM integration (Azure OpenAI, OpenAI, etc.)
- Require complex multi-turn conversations
- Building with LangChain or other AI frameworks

**Choose Teams Agents when:**
- Building chat bots specifically for Microsoft Teams
- Need RAG (Retrieval Augmented Generation) capabilities
- Require Teams-specific features (channels, meetings, etc.)
