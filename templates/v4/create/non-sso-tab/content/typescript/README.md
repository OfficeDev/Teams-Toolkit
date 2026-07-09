# Overview of the Basic Tab template

This template showcases how Microsoft Teams supports the ability to run web-based UI inside "custom tabs" that users can install either for just themselves (personal tabs) or within a team or group chat context.

## Get started with the Basic Tab template

> **Prerequisites**
>
> To run the basic tab template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: >=22.
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts)
>   Please note that after you enrolled your developer tenant in Office 365 Target Release, it may take couple days for the enrollment to take effect.
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 6.0.0 and higher or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)

1. First, select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
2. In the Account section, sign in with your [Microsoft 365 account](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts) if you haven't already.
3. Press F5 to start debugging which launches your app in Teams using a web browser. Select `Debug in Teams (Edge)` or `Debug in Teams (Chrome)`.
4. When Teams launches in the browser, select the Add button in the dialog to install your app to Teams.

**Congratulations**! You are running an application that can now show a basic web page in Teams, Outlook and the Microsoft 365 app.

![Basic Tab](https://github.com/user-attachments/assets/e8121c82-ddbc-493f-9afb-34db2a4b8e73)

## What's included in the template

| Folder       | Contents                                     |
| ------------ | -------------------------------------------- |
| `.vscode`    | VSCode files for debugging                   |
| `appPackage` | Templates for the application manifest |
| `env`        | Environment files                            |
| `infra`      | Templates for provisioning Azure resources   |
| `src`        | The source code for the application    |

The following files can be customized and demonstrate an example implementation to get you started.

| File                             | Contents                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `index.html`                     | HTML file.                                                                                                      |
| `src/Tab/App.css`                | CSS file for the app.                                                                                           |
| `src/Tab/App.tsx`                | Tab source file. It calls `teamsjs` SDK to get the context of on which Microsoft 365 application your app is running.      |
| `src/index.ts`                   | Starting the app using [Microsoft Teams SDK](https://aka.ms/teams-ai-library-v2).                                                                     |
| `vite.config.js`                 | Configuration for Vite build tool.                                                                              |  
| `nodemon.json`                   | Configuration for Nodemon to watch and restart the server.                                                      |

The following are Microsoft 365 Agents Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Microsoft 365 Agents Toolkit works.

| File                 | Contents                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `m365agents.yml`       | This is the main Microsoft 365 Agents Toolkit project file. The project file defines two primary things: Properties and configuration Stage definitions. |
| `m365agents.local.yml` | This overrides `m365agents.yml` with actions that enable local execution and debugging.                                                     |

## Extend the Basic Tab template

Following documentation will help you to extend the Basic Tab template.

- [Add or manage the environment](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-multi-env)
- [Create multi-capability app](https://learn.microsoft.com/microsoftteams/platform/toolkit/add-capability)
- [Access data in Microsoft Graph](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-sdk#microsoft-graph-scenarios)
- [Use an existing Microsoft Entra application](https://learn.microsoft.com/microsoftteams/platform/toolkit/use-existing-aad-app)
- [Customize the app manifest](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-preview-and-customize-app-manifest)
- Host your app in Azure by [provision cloud resources](https://learn.microsoft.com/microsoftteams/platform/toolkit/provision) and [deploy the code to cloud](https://learn.microsoft.com/microsoftteams/platform/toolkit/deploy)
- [Collaborate on app development](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-collaboration)
- [Set up the CI/CD pipeline](https://learn.microsoft.com/microsoftteams/platform/toolkit/use-cicd-template)
- [Publish the app to your organization or the Microsoft app store](https://learn.microsoft.com/microsoftteams/platform/toolkit/publish)
- [Enable the app for multi-tenant](https://aka.ms/m365-agent-multi-tenancy-entra-app)
- [Preview the app on mobile clients](https://aka.ms/teamsfx-mobile)
