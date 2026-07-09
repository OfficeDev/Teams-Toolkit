# Declarative Agent with Static MCP Tools

This project wraps a remote MCP server as a Microsoft 365 Copilot Declarative Agent. The selected MCP tools are materialized into `appPackage/mcp-tools-1.json`, and `appPackage/ai-plugin.json` references that file through a `RemoteMCPServer` runtime.

## Prerequisites

- Node.js 18, 20, or 22
- A Microsoft 365 developer account
- Microsoft 365 Agents Toolkit for VS Code or CLI
- A Microsoft 365 Copilot license

## Project Structure

| Folder | Description |
| ------ | ----------- |
| `.vscode` | Debug configuration and MCP server configuration |
| `appPackage` | Declarative Agent, plugin manifest, Teams app manifest, and static MCP tools file |
| `env` | Environment files used by Agents Toolkit |
| `m365agents.yml` | Provision and publish lifecycle definitions |

## Important Files

- `appPackage/ai-plugin.json` defines the action surface Copilot can call.
- `appPackage/mcp-tools-1.json` contains the selected MCP tool definitions.
- `appPackage/declarativeAgent.json` defines the Declarative Agent instructions and actions.
- `appPackage/manifest.json` defines the Microsoft 365 app package.

## Next Steps

1. Review `appPackage/mcp-tools-1.json` and keep only the tools your agent should expose.
2. Update `appPackage/declarativeAgent.json` instructions for your scenario.
3. Run provision from Agents Toolkit to create or update the Microsoft 365 app.
4. Preview the agent in Copilot and test each selected MCP tool with natural-language prompts.

## Evaluating Agents

Install the Microsoft 365 Copilot Agent Evaluations CLI (`@microsoft/m365-copilot-eval`) to test and improve the quality of your agent with structured evaluations.

1. Run `npm install -g @microsoft/m365-copilot-eval`.
2. Add `AZURE_AI_OPENAI_ENDPOINT`, `AZURE_AI_API_KEY`, `AZURE_AI_API_VERSION`, and `AZURE_AI_MODEL_NAME` to your environment file.
3. Provision the project so the agent is available in your tenant.
4. Run `runevals` or `runevals --env dev`.

A sample dataset is available at `evals/prompts.json`.
