# Overview of the Basic Custom Engine Agent template

This app template is built on top of [Microsoft 365 Agents SDK](https://aka.ms/m365sdkdocs).
This template showcases a custom engine agent app that connects to your own LLM and responds to user questions like an AI assistant. This enables your users to talk with the AI assistant in Teams to find information.

## Get started with the template

> **Prerequisites**
>
> To run the template in your local dev machine, you will need:
>
> - [Python](https://www.python.org/), version 3.8 to 3.11.
> - [Python extension](https://code.visualstudio.com/docs/languages/python), version v2024.0.1 or higher.
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) latest version or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teams-toolkit-cli).
{{#useAzureOpenAI}}
> - An account with [Azure OpenAI](https://aka.ms/oai/access).
{{/useAzureOpenAI}}
{{#useOpenAI}}
> - An account with [OpenAI](https://platform.openai.com/).
{{/useOpenAI}}
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts).

### Configurations
1. Open the command box and enter `Python: Create Environment` to create and activate your desired virtual environment. Remember to select `src/requirements.txt` as dependencies to install when creating the virtual environment.
{{#useAzureOpenAI}}
1. In file *env/.env.local.user*, fill in your Azure OpenAI key `SECRET_AZURE_OPENAI_API_KEY`, deployment name `AZURE_OPENAI_DEPLOYMENT_NAME` and endpoint `AZURE_OPENAI_ENDPOINT`.
{{/useAzureOpenAI}}
{{#useOpenAI}}
1. In file *env/.env.local.user*, fill in your OpenAI key `SECRET_OPENAI_API_KEY`. 
1. In this template, default model name is `gpt-4o`. If you want to use a different model from OpenAI, fill in your model name in [src/config.py](./src/config.py).
{{/useOpenAI}}

### Conversation with agent
1. Select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
1. In the Account section, sign in with your [Microsoft 365 account](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts) if you haven't already.
1. Press F5 to start debugging which launches your app in Teams using a web browser. Select `Debug in Teams (Edge)` or `Debug in Teams (Chrome)`.
1. When Teams launches in the browser, select the Add button in the dialog to install your app to Teams.
1. You will receive a welcome message from the agent, or send any message to get a response.

**Congratulations**! You are running an application that can now interact with users in Teams:

> For local debugging using Microsoft 365 Agents Toolkit CLI, you need to do some extra steps described in [Set up your Microsoft 365 Agents Toolkit CLI for local debugging](https://aka.ms/teamsfx-cli-debugging).

![ai chat agent](https://user-images.githubusercontent.com/7642967/258726187-8306610b-579e-4301-872b-1b5e85141eff.png)

## What's included in the template

| Folder       | Contents                                            |
| - | - |
| `.vscode/`   | VS Code files for debugging                         |
| `appPackage/` | Templates for the Teams application manifest        |
| `env/`       | Environment files                                   |
| `infra/`     | Templates for provisioning Azure resources          |
| `src/`       | The source code for the application                 |

The following files can be customized and demonstrate an example implementation to get you started.

| File                                 | Contents                                           |
| - | - |
|`src/agent.py`| Handles the agent app logic, built with Microsoft 365 Agents SDK.|
|`src/config.py`| Defines the environment variables.|
|`src/app.py`| Hosts the agent using aiohttp|


## Additional information and references

- [Microsoft 365 Agents Toolkit Documentations](https://docs.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Microsoft 365 Agents Toolkit Samples](https://github.com/OfficeDev/TeamsFx-Samples)
- [Microsoft 365 Agents SDK](https://github.com/microsoft/Agents)
- [Microsoft 365 Agents for Python](https://github.com/microsoft/Agents-for-python)
- [Microsoft 365 Agents SDK QuickStart](https://github.com/microsoft/Agents/tree/main/samples/python/quickstart)
