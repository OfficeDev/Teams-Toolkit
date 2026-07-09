# Overview of the Chat With Your Data (Custom Data Source) template

This app template showcases how to build one of the most powerful applications enabled by LLM - sophisticated question-answering (Q&A) chat bots that can answer questions about specific source information right in the Microsoft Teams.
This app template also demonstrates usage of techniques like: 
- [Retrieval Augmented Generation](https://python.langchain.com/docs/use_cases/question_answering/#what-is-rag), or RAG.
- [Microsoft Teams SDK](https://aka.ms/teams-ai-library-v2)

## Get started with the template

> **Prerequisites**
>
> To run the template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: 22
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
{{#useOpenAI}}
> - An account with [OpenAI](https://platform.openai.com/).
{{/useOpenAI}}
{{#useAzureOpenAI}}
> - Prepare your own [Azure OpenAI](https://aka.ms/oai/access) resource.
{{/useAzureOpenAI}}

> For local debugging using Microsoft 365 Agents Toolkit CLI, you need to do some extra steps described in [Set up your Microsoft 365 Agents Toolkit CLI for local debugging](https://aka.ms/teamsfx-cli-debugging).

1. First, select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
{{#useOpenAI}}
1. In file *env/.env.playground.user*, fill in your OpenAI key `SECRET_OPENAI_API_KEY=<your-key>`.
{{/useOpenAI}}
{{#useAzureOpenAI}}
1. In file *env/.env.playground.user*, fill in your Azure OpenAI key `SECRET_AZURE_OPENAI_API_KEY=<your-key>`, endpoint `AZURE_OPENAI_ENDPOINT=<your-endpoint>` and deployment name `AZURE_OPENAI_DEPLOYMENT_NAME=<your-deployment>`.
{{/useAzureOpenAI}}
1. Press F5 to start debugging which launches your app in Microsoft 365 Agents Playground using a web browser. Select `Debug in Microsoft 365 Agents Playground`.
1. You can send any message to get a response from the agent.

**Congratulations**! You are running an application that can now interact with users in Microsoft 365 Agents Playground:

![RAG Bot](https://github.com/user-attachments/assets/464fe1b0-d8c6-4ecf-a410-8dde7d9ca9b3)

## What's included in the template

| Folder       | Contents                                            |
| - | - |
| `.vscode`    | VSCode files for debugging                          |
| `appPackage` | Templates for the application manifest        |
| `env`        | Environment files                                   |
| `infra`      | Templates for provisioning Azure resources          |
| `src`        | The source code for the application                 |

The following files can be customized and demonstrate an example implementation to get you started.

| File                                 | Contents                                           |
| - | - |
|`src/index.ts`| Application entry point.|
|`src/config.ts`| Defines the environment variables.|
|`src/app/app.ts`| Main application code.|
|`src/app/myDataSource.ts`| Defines the data source.|
|`src/data/*.md`| Raw text data sources.|

The following are Microsoft 365 Agents Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Microsoft 365 Agents Toolkit works.

| File                                 | Contents                                           |
| - | - |
|`m365agents.yml`|This is the main Microsoft 365 Agents Toolkit project file. The project file defines two primary things:  Properties and configuration Stage definitions. |
|`m365agents.local.yml`|This overrides `m365agents.yml` with actions that enable local execution and debugging.|
|`m365agents.playground.yml`| This overrides `m365agents.yml` with actions that enable local execution and debugging in Microsoft 365 Agents Playground.|

## Extend the template

To extend the Basic AI Chatbot template with more AI capabilities, explore [Microsoft Teams SDK documentation](https://aka.ms/m365-agents-toolkit/teams-agent-extend-ai).

## Additional information and references

- [Microsoft 365 Agents Toolkit Documentations](https://docs.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Microsoft 365 Agents Toolkit Samples](https://github.com/OfficeDev/TeamsFx-Samples)