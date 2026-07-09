# Overview of the Chat With Your Data (Using Azure AI Search) template

This app template showcases how to build one of the most powerful applications enabled by LLM - sophisticated question-answering (Q&A) chat bots that can answer questions about specific source information right in the Microsoft Teams.
This app template also demonstrates usage of techniques like: 
- [Retrieval Augmented Generation](https://python.langchain.com/docs/use_cases/question_answering/#what-is-rag), or RAG.
- [Azure AI Search](https://learn.microsoft.com/azure/search/search-what-is-azure-search)
- [Microsoft Teams SDK](https://aka.ms/teams-ai-library-v2)

## Get started with the template

> **Prerequisites**
>
> To run the template in your local dev machine, you will need:
>
> - [Python](https://www.python.org/),  >=3.12,<3.14.
> - [Python extension](https://code.visualstudio.com/docs/languages/python), version v2024.0.1 or higher.
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) latest version or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teams-toolkit-cli).
{{#useAzureOpenAI}}
> - An account with [Azure OpenAI](https://aka.ms/oai/access).
{{/useAzureOpenAI}}
{{#useOpenAI}}
> - An account with [OpenAI](https://platform.openai.com/).
{{/useOpenAI}}
> - An [Azure Search service](https://learn.microsoft.com/en-us/azure/search/search-what-is-azure-search).
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts).

### Configurations
1. Open the command box and enter `Python: Create Environment` to create and activate your desired virtual environment. Remember to select `src/requirements.txt` as dependencies to install when creating the virtual environment.
{{#useAzureOpenAI}}
1. In file *env/.env.local.user*, fill in your Azure OpenAI key `SECRET_AZURE_OPENAI_API_KEY`, deployment name `AZURE_OPENAI_DEPLOYMENT_NAME`, endpoint `AZURE_OPENAI_ENDPOINT` and embedding deployment name `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`.
{{/useAzureOpenAI}}
{{#useOpenAI}}
1. In file *env/.env.local.user*, fill in your OpenAI key `SECRET_OPENAI_API_KEY`. 
1. In this template, default model name is `gpt-3.5-turbo` and default embedding model name is `text-embedding-ada-002`. If you want to use different models from OpenAI, fill in your model names in [src/config.py](./src/config.py).
{{/useOpenAI}}
1. In file *env/.env.local.user*, fill in your Azure Search key `SECRET_AZURE_SEARCH_KEY` and endpoint `AZURE_SEARCH_ENDPOINT`.

### Setting up index and documents
1. Azure Search endpoint `AZURE_SEARCH_ENDPOINT` is loaded from *env/.env.local.user*. Please make sure you have already configured it.
{{#useAzureOpenAI}}
1. Use the following command with your api key to create index and upload documents in `src/indexers/data`.
    ```
    python src/indexers/setup.py --api-key <your-azure-openai-api-key> --ai-search-key <your-azure-ai-search-key>
    ```
{{/useAzureOpenAI}}
{{#useOpenAI}}
1. Use the following command with your api key to create index and upload documents in `src/indexers/data`.
    ```
    python src/indexers/setup.py --api-key <your-openai-api-key> --ai-search-key <your-azure-ai-search-key>
    ```
{{/useOpenAI}}
1. You will see the following information indicated the success of setup:
    ```
    Create index succeeded. If it does not exist, wait for 5 seconds...
    Upload new documents succeeded. If they do not exist, wait for several seconds...
    setup finished
    ```
1. Once you're done using the sample it's good practice to delete the index. You can do so with the command `python src/indexers/delete.py --ai-search-key <your-azure-ai-search-key>`.

### Conversation with agent
1. Select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
1. In the Account section, sign in with your [Microsoft 365 account](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts) if you haven't already.
1. Press F5 to start debugging which launches your app in Teams using a web browser. Select `Debug in Teams (Edge)` or `Debug in Teams (Chrome)`.
1. When Teams launches in the browser, select the Add button in the dialog to install your app to Teams.
1. You will receive a welcome message from the agent, or send any message to get a response.

**Congratulations**! You are running an application that can now interact with users in Teams:

> For local debugging using Microsoft 365 Agents Toolkit CLI, you need to do some extra steps described in [Set up your Microsoft 365 Agents Toolkit CLI for local debugging](https://aka.ms/teamsfx-cli-debugging).

![alt text](https://github.com/OfficeDev/TeamsFx/assets/109947924/2c17e3e8-09c1-42b6-b47a-ac4234343883)

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
|`src/config.py`| Defines the environment variables.|
|`src/app.py`| Main module of the AI Search Bot, hosts a aiohttp api server for the app.|
|`src/azure_ai_search_data_source.py.py`| Handles data search logics.|
|`src/instructions.txt`| Defines the prompt.|

The following files are scripts and raw texts that help you to prepare or clean data source in Azure Search.

| File                                 | Contents                                           |
| - | - |
|`src/indexers/get_data.py`| Fetches data and creates embedding vectors.|
|`src/indexers/data/*.md`| Raw text data source.|
|`src/indexers/setup.py`| A script to create index and upload documents.|
|`src/indexers/delete.py`| A script to delete index and documents.|

The following are Microsoft 365 Agents Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Microsoft 365 Agents Toolkit works.

| File                                 | Contents                                           |
| - | - |
|`m365agents.yml`|This is the main Microsoft 365 Agents Toolkit project file. The project file defines two primary things:  Properties and configuration Stage definitions. |
|`m365agents.local.yml`|This overrides `m365agents.yml` with actions that enable local execution and debugging.|
|`m365agents.playground.yml`|This overrides `m365agents.yml` with actions that enable local execution and debugging in Microsoft 365 Agents Playground.|

## Extend the template

To extend the Basic AI Chatbot template with more AI capabilities, explore [Microsoft Teams SDK documentation](https://aka.ms/m365-agents-toolkit/teams-agent-extend-ai-python).
## Additional information and references

- [Microsoft 365 Agents Toolkit Documentations](https://docs.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
- [Microsoft 365 Agents Toolkit Samples](https://github.com/OfficeDev/TeamsFx-Samples)

## Known issue
- If you use `Debug in Microsoft 365 Agents Playground` to local debug, you might get an error `InternalServiceError: connect ECONNREFUSED 127.0.0.1:3978` in Microsoft 365 Agents Playground console log or error message `Error: Cannot connect to your app,
please make sure your app is running or restart your app` in log panel of Microsoft 365 Agents Playground web page. You can wait for Python launch console ready and then refresh the front end web page.
- When you use `Launch Remote in Teams` to remote debug after deployment, you might loose interaction with your agent. This is because the remote service needs to restart. Please wait for several minutes to retry it.