# Overview of Message Extensions template

A Teams app that show cases three message extensions features:

- action commands: allows users to interact with your app through buttons and forms in the compose message area in Microsoft Teams.
- search commands: allows users to search for information or perform actions within the context of the message.
- link unfurling: unfurls a link into an adaptive card when URLs with a particular domain are pasted into the compose message area in Microsoft Teams.

## Get Started

> **Prerequisites**
>
> - [Node.js](https://nodejs.org/), supported versions: 22
> - [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher or [Microsoft 365 Agents Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)

> For local debugging using Microsoft 365 Agents Toolkit CLI, you need to do some extra steps described in [Set up your Microsoft 365 Agents Toolkit CLI for local debugging](https://aka.ms/teamsfx-cli-debugging).

1. First, select the Microsoft 365 Agents Toolkit icon on the left in the VS Code toolbar.
2. Press F5 to start debugging which launches your app in Microsoft 365 Agents Playground using a web browser.
3. The browser will pop up to open Microsoft 365 Agents Playground.
4. Click the "+" button in the input box, select "Action Command" and input "createCard" into "Command Id" field. Select "Static list of parameters" and then click "Create". Fill out the form and click `Submit` to send an adaptive card to the current chat or channel.
5. Click the "+" button in the input box, select "Search Command" and input "searchQuery" into "Command Id" field. Input a search query. Select one of the search results to send an adaptive card to the current chat or channel.
6. Click the "+" button in the input box, select "Link Unfurling" and paste a link ending with `.botframework.com`. You should see an adaptive card unfurled. Click `Send to Conversation` to send it to the current chat or channel.

## What's included in the template

| Folder / File               | Contents                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `m365agents.yml`            | Main project file describes your application configuration and defines the set of actions to run in each lifecycle stages  |
| `m365agents.local.yml`      | This overrides `m365agents.yml` with actions that enable local execution and debugging                                     |
| `m365agents.playground.yml` | This overrides `m365agents.yml` with actions that enable local execution and debugging in Microsoft 365 Agents Playground. |
| `.vscode/`                  | VSCode files for local debug                                                                                               |
| `src/`                      | The source code for the link unfurling application                                                                         |
| `appPackage/`               | Templates for the application manifest                                                                                     |
| `infra/`                    | Templates for provisioning Azure resources                                                                                 |

The following files can be customized and demonstrate an example implementation to get you started.

| File           | Contents                              |
| -------------- | ------------------------------------- |
| `src/index.ts` | Application entry point               |
| `src/card.ts`  | Adaptive card creation and management |
