# Overview of the Declarative Agent with API Plugin template

## Build a Declarative Agent with API Plugin from a new API with Azure Functions

With the declarative agent, you can build a custom version of Copilot that can be used for specific scenarios, such as for specialized knowledge, implementing specific processes, or simply to save time by reusing a set of AI prompts. For example, a grocery shopping Copilot declarative agent can be used to create a grocery list based on a meal plan that you send to Copilot.

You can extend declarative agents using plugins to retrieve data and execute tasks on external systems. A declarative agent can utilize multiple plugins at the same time.
![image](https://github.com/user-attachments/assets/9939972e-0449-410c-b237-d9d748cd6628)

## Get started with the template

> **Prerequisites**
>
> To run this app template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: 22
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts)
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teams-toolkit-cli)
> - [Microsoft 365 Copilot license](https://learn.microsoft.com/microsoft-365-copilot/extensibility/prerequisites#prerequisites)

1. First, select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
2. In the Account section, sign in with your [Microsoft 365 account](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts) if you haven't already.
3. Select `Debug in Copilot (Edge)` or `Debug in Copilot (Chrome)` from the launch configuration dropdown.
4. Select your declarative agent from the `Copilot` app.
5. Send a message to Copilot to find a repair record.

### How to add your own API Key

1. Open terminal and run command `npm install` to install all dependency packages

   ```
   > npm install
   ```

2. After `npm install` completed, run command `npm run keygen`
   ```
   > npm run keygen
   ```
3. The above command will output something like "Generated a new API Key: xxx..."
4. Fill in API Key into `env/.env.*.user`
   ```
   SECRET_API_KEY=<your-api-key>
   ```

## What's included in the template

| Folder       | Contents                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- |
| `.vscode`    | VSCode files for debugging                                                                  |
| `appPackage` | Templates for the application manifest, the plugin manifest and the API specification |
| `env`        | Environment files                                                                           |
| `infra`      | Templates for provisioning Azure resources                                                  |
| `src`        | The source code for the repair API                                                          |

The following files can be customized and demonstrate an example implementation to get you started.

| File                                            | Contents                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/functions/repairs.js`                      | The main file of a function in Azure Functions.                                                   |
| `src/repairsData.json`                          | The data source for the repair API.                                                               |
| `appPackage/apiSpecificationFile/repair.yml`    | A file that describes the structure and behavior of the repair API.                               |
| `appPackage/manifest.json`                      | application manifest that defines metadata for your plugin inside Microsoft Teams.          |
| `appPackage/ai-plugin.json`                     | The manifest file for your API Plugin that contains information for your API and used by LLM.     |
| `appPackage/repairDeclarativeAgent.json`        | Define the behaviour and configurations of the declarative agent.                                 |
| `appPackage/adaptiveCards/listRepairs.json`     | Adaptive Card file used to render a result from the plugin response.                              |
| `appPackage/adaptiveCards/listRepairs.data.json`| Sample mock data file for adaptive card.                                                          |

The following are Microsoft 365 Agents Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Microsoft 365 Agents Toolkit works.

| File                 | Contents                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `m365agents.yml`       | This is the main Microsoft 365 Agents Toolkit project file. The project file defines two primary things: Properties and configuration Stage definitions. |
| `m365agents.local.yml` | This overrides `m365agents.yml` with actions that enable local execution and debugging.                                                     |

## Extend the template

- [Add conversation starters](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents?tabs=ttk&tutorial-step=3): Conversation starters are hints that are displayed to the user to demonstrate how they can get started using the declarative agent.
- [Add web content](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents?tabs=ttk&tutorial-step=4) for the ability to search web information.
- [Add OneDrive and SharePoint content](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents?tabs=ttk&tutorial-step=5) as grounding knowledge for the agent.
- [Add Microsoft Copilot connectors content](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents?tabs=ttk&tutorial-step=6) to ground agent with enterprise knowledge.
- [Add API plugins](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents?tabs=ttk&tutorial-step=7) for agent to interact with REST APIs.

## Addition information and references

- [Declarative agents for Microsoft 365](https://aka.ms/teams-toolkit-declarative-agent)
- [Extend Microsoft 365 Copilot](https://aka.ms/teamsfx-copilot-plugin)
- [Message extensions for Microsoft 365 Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-message-extension-bot)
- [Microsoft Copilot connectors for Microsoft 365 Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-graph-connector)
- [Microsoft 365 Copilot extensibility samples](https://learn.microsoft.com/microsoft-365-copilot/extensibility/samples)
