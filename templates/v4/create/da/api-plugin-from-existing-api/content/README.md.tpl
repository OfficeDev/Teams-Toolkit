# Overview of the basic declarative agent with API plugin template

## Build a basic declarative agent with API plugin

With the declarative agent, you can build a custom version of Copilot that can be used for specific scenarios, such as for specialized knowledge, implementing specific processes, or simply to save time by reusing a set of AI prompts. For example, a grocery shopping Copilot declarative agent can be used to create a grocery list based on a meal plan that you send to Copilot.

You can extend declarative agents using plugins to retrieve data and execute tasks on external systems. A declarative agent can utilize multiple plugins at the same time.

![image](https://github.com/user-attachments/assets/9939972e-0449-410c-b237-d9d748cd6628)


## Get started with the template

> **Prerequisites**
>
> To run this app template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: 22
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts).
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)
> - [Microsoft 365 Copilot license](https://learn.microsoft.com/microsoft-365-copilot/extensibility/prerequisites#prerequisites)

1. First, select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
2. In the Account section, sign in with your [Microsoft 365 account](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts) if you haven't already.
3. Select `Preview Local in Copilot (Edge)` or `Preview Local in Copilot (Chrome)` from the launch configuration dropdown.
4. Select your declarative agent from the `Copilot` app.
5. Send a prompt.

{{#ApiKey}}
> [!NOTE]
> Microsoft 365 Agents Toolkit will ask you for your API key during provision. The API key will be securely stored with [Developer Portal](https://dev.teams.microsoft.com/home) and used by Teams client to access your API in runtime. Microsoft 365 Agents Toolkit will not store your API key.
{{/ApiKey}}

{{#OAuth}}
> [!NOTE]
> If your identity server needs Proof of Key Code Exchange (PKCE) for token exchange, uncomment the `isPKCEEnabled` property in the` oauth/register` section of the `m365agents.yml` file shown as below:
```yaml
  - uses: oauth/register
    with:
      name: {{ApiSpecAuthName}}
      flow: authorizationCode
      # app ID
      appId: ${{TEAMS_APP_ID}}
      # Path to OpenAPI description document
      apiSpecPath: {{{ApiSpecPath}}}
      # Uncomment below property to use proof key for code exchange (PKCE)
      isPKCEEnabled: true
    writeToEnvironmentFile:
      configurationId: {{ApiSpecAuthRegistrationIdEnvName}}
```
> Microsoft 365 Agents Toolkit will ask you for your Client ID and Client Secret for Oauth2 during provision. These information will be securely stored with [Developer Portal](https://dev.teams.microsoft.com/home) and used by Teams client to access your API in runtime. Microsoft 365 Agents Toolkit will not store your Client ID and Client Secret.
{{/OAuth}}

## What's included in the template

| Folder       | Contents                                     |
| ------------ | -------------------------------------------- |
| `.vscode`    | VSCode files for debugging                   |
| `appPackage` | Templates for the application manifest, the plugin manifest and the API specification |
| `env`        | Environment files                            |

The following files can be customized and demonstrate an example implementation to get you started.

| File                                 | Contents                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `appPackage/declarativeCopilot.json` | Define the behaviour and configurations of the declarative agent.            |
| `appPackage/manifest.json`           | application manifest that defines metadata for your declarative agent. |

The following are Microsoft 365 Agents Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Microsoft 365 Agents Toolkit works.

| File                 | Contents                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `m365agents.yml`       | This is the main Microsoft 365 Agents Toolkit project file. The project file defines two primary things: Properties and configuration Stage definitions. |

## Evaluating Agents

Install the Microsoft 365 Copilot Agent Evaluations CLI (`@microsoft/m365-copilot-eval`) NPM package to test, measure, and improve the quality of your agent with structured evaluations and rich result reports with AI-based scoring.

> Requires [Admin consent](https://github.com/microsoft/work-iq/blob/main/ADMIN-INSTRUCTIONS.md) at tenant level.

1. Run `npm install -g @microsoft/m365-copilot-eval`
2. Add the following environment variables. See [here](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/evaluations-cli-get-env-values) on how to get them.

    ```
    AZURE_AI_OPENAI_ENDPOINT=
    AZURE_AI_API_KEY=
    AZURE_AI_API_VERSION=
    AZURE_AI_MODEL_NAME=
    ```

3. Run `runevals` or `runevals --env dev`

A sample dataset `evals/prompts.json` is created in this project to help you get started right away. [Read more](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/evaluations-cli-overview).

## Addition information and references

- [Declarative agents for Microsoft 365](https://aka.ms/teams-toolkit-declarative-agent)
- [Extend Microsoft 365 Copilot](https://aka.ms/teamsfx-copilot-plugin)
- [Message extensions for Microsoft 365 Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-message-extension-bot)
- [Microsoft Copilot connectors for Microsoft 365 Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-graph-connector)
- [Microsoft 365 Copilot extensibility samples](https://learn.microsoft.com/microsoft-365-copilot/extensibility/samples)