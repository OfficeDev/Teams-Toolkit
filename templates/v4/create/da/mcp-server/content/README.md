# Declarative Agent + MCP in VS Code

This template shows how to wrap your existing MCP Server into a Microsoft 365 Copilot Declarative Agent (DA) using the Agents Toolkit (ATK) in VS Code. Instead of hand‑authoring an OpenAPI spec, you point ATK at your MCP discovery URL and let the toolkit generate all manifests, wiring in authentication and function definitions automatically.

## Get started with the template

> **Prerequisites**
>
> To run this app template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: 18, 20, 22
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts).
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
> - [Microsoft 365 Copilot license](https://learn.microsoft.com/microsoft-365-copilot/extensibility/prerequisites#prerequisites)

1. Open ATK in VS Code

    Click the Microsoft 365 Agents Toolkit icon in the Activity Bar.

2. Sign in

    Open the Agents Toolkit by click on the toolkit icon in the VS Code sidebar. Under Account, authenticate with your dev M365 account.

3. Scaffold a new DA

    In the Agents Toolkit menu, click 'Create new Agent/app', select 'Declarative Agent', choose a folder and name (e.g. my-mcp-agent).

4. Add your MCP Server

    In the ATK sidebar click Add Action → Start with an MCP server, then enter your MCP discovery URL (e.g. https://mcp.contoso.com/discover).

5. Start your MCP Server

    After the DA project generated, click the "Start" button in the mcp.json file to start your MCP server, when prompt, enter the user ID and password for authentication.

6. Fetch and select tools

    When prompted, Click ATK:Fetch Action from MCP" in the mcp.json file choose Pre‑fetch tools (for offline IntelliSense) or Dynamic. ATK will list all available MCP actions—check the ones you want in your agent.

    > If you need the complete tool definitions including _meta and annotations properties for enabling OAI Apps SDK or MCP Apps implementation, open [MCP Inspector](https://github.com/modelcontextprotocol/inspector?tab=readme-ov-file#running-the-inspector) and retrieve the full details there. Then replace the corresponding schema section in your `mcp-tools.json` file with the full definitions.

    ![image](https://github.com/user-attachments/assets/9184ddcc-e42c-4fee-bd83-830d199755e6)

7. Configure Auth

    ATK will retrieve the authentication information for your MCP server and store these values are in env/.env.development and a secure reference is injected into appPackage/ai-plugin.json. If the inputted MCP server authentication information is not configure correctly according to the MCP protocol, ATK will prompt errors.

8. Review generated files

    - `appPackage/ai-plugin.json` (function definitions, runtime spec + auth) - This file defines the the action or operations that Copilot can interact with.
    - `appPackage/declarativeAgent.json` (agent configuration & sample prompts) - This file is the definition of your declarative agent
    - `appPackage/manifest.json` (Teams/Outlook integration)

9. Provision & debug

    Use the Provision button in ATK to create resources. ATK will detect if your MCP server requires OAuth2 or API‐Key. Provide your Client ID/Secret or Key when prompted. Then Start Debugging to Preview agent in Copilot in Edge/Chrome. Your DA will appear under Copilot chats.

10. Test your MCP‑powered agent

    Open the Copilot pane, select your agent and invoke any of the MCP tools with natural‑language prompts.

## Project Structure

| Folder       | Description                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------- |
| `.vscode`    | ATK debug & .vscode/mcp.json for MCP server config                                                               |
| `appPackage` | - `appPackage/ai-plugin.json` (function definitions, runtime spec + auth) - This file defines the the action or operations that Copilot can interact with<br>- `appPackage/declarativeAgent.json` (agent configuration & sample prompts) - This file is the definition of your declarative agent<br>- `appPackage/manifest.json` (Teams/Outlook integration)   |
| `env`        | Local environment files (.env.development, .env.local)                                                                         |
| `m365agents.yml` | Defines your DA stages & lifecycle for ATK  |

## MCP‑specific tips

- **Discovery URL**: your MCP server’s /discover endpoint must expose JSON‑Schema for every action.
- **Tool selection**: the run_for_functions array in ai-plugin.json limits which MCP tools your agent can call.

- **Auth flows**: ATK supports both OAuth2.1 and API‑Key; you don’t need to hand‑edit auth blocks.

- **Versioning**: when your MCP server schema changes, simply rerun ATK: Fetch Action from MCP to refresh your plugin file.

- **Error logging**: basic request/response logs appear in the ATK console; errors bubble up in your Copilot chat.

## Evaluating Agents

Install the Microsoft 365 Copilot Agent Evaluations CLI (`@microsoft/m365-copilot-eval`) NPM package to test, measure, and improve the quality of your agent with structured evaluations and rich result reports with AI-based scoring.

> Requires [Admin consent](https://github.com/microsoft/work-iq/blob/main/ADMIN-INSTRUCTIONS.md) at tenant level.

1. Run `npm install -g @microsoft/m365-copilot-eval`
2. Add the following environment variables. See [here](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/evaluations-cli-get-env-values#get-your-azure-openai-endpoint-and-api-key) on how to get them.

    ```
    AZURE_AI_OPENAI_ENDPOINT=
    AZURE_AI_API_KEY=
    AZURE_AI_API_VERSION=
    AZURE_AI_MODEL_NAME=
    ```

3. Provision the project first (select **Provision** in the Microsoft 365 Agents Toolkit) so the agent is available in your tenant before evaluation. Skip this step if you have already provisioned (or started a local debug session) for this project.
4. Run `runevals` or `runevals --env dev`

A sample dataset `evals/prompts.json` is created in this project to help you get started right away. [Read more](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/evaluations-cli-overview).


## Learn More

- [Build Declarative Agents (official docs)](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents)

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

- [Agents Toolkit guide on GitHub](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview)

Happy building!

With MCP + Declarative Agents, you’ll have a turnkey path from your existing APIs to a fully operational Copilot‑powered experience.
