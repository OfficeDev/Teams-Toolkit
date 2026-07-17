# Build Office add-ins using Microsoft 365 Agents Toolkit
Office add-ins are integrations built by third parties into Office by using our web-based platform. This add-in template supports: Word, Excel, PowerPoint.
This template uses [nested app authentication (NAA)](https://learn.microsoft.com/office/dev/add-ins/develop/enable-nested-app-authentication-in-your-add-in) to sign the user in and call Microsoft Graph on their behalf.
Now you have the ability to create a single unit of distribution for all your Microsoft 365 extensions by using the same manifest format and schema, based on the current JSON-formatted Teams manifest.

> Note:
> The unified app manifest for Word, Excel, and PowerPoint is in preview. Visit [this link](https://aka.ms/officeversions) to check the required Office Versions. Also, publishing a unified add-in for Word, Excel, PowerPoint is not supported currently.

## Prerequisites

- [Node.js](https://nodejs.org/), supported versions: 22.
- Word/Excel/PowerPoint for Windows: Beta Channel, Build 18514 or higher. Follow [this link](https://github.com/OfficeDev/TeamsFx/wiki/How-to-switch-Outlook-client-update-channel-and-verify-Outlook-client-build-version) for switching update channels and check your Office client build version.
- Edge installed for debugging Office add-in.
- A M365 account. If you do not have M365 account, apply one from [M365 developer program](https://developer.microsoft.com/en-us/microsoft-365/dev-program)
- [Microsoft 365 Agents Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher.

## Set up single sign-on

This add-in uses nested app authentication (NAA). Before you debug or run it, you must register an application in Microsoft Entra ID and configure the add-in with its client ID. **Single sign-on will not work until you complete these steps.**

> Note: Nested app authentication is currently in preview and requires a Beta Channel build of Office. To try it, join the [Microsoft 365 Insider Program](https://insider.microsoft365.com/join) and choose the **Beta Channel**.

### Create an application registration

1. Go to the [Azure portal - App registrations](https://go.microsoft.com/fwlink/?linkid=2083908) page to register your app.
1. Sign in with the credentials of your Microsoft 365 tenancy.
1. Select **New registration**. On the **Register an application** page, set the values as follows.
    - Set **Name** to a name for your add-in, for example `Office-Add-in-SSO-NAA`.
    - Set **Supported account types** to **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**.
    - In the **Redirect URI** section, select **Single-page application (SPA)** in the dropdown and set the URI to `brk-multihub://localhost:3000`.
    - Select **Register**.
1. On the app's overview page, copy and save the **Application (client) ID**. You'll use it in the next step.

For more information, see [Register an application with the Microsoft Identity Platform](https://learn.microsoft.com/graph/auth-register-app-v2).

### Configure the add-in

1. Open the `src/taskpane/authConfig.ts` file.
1. Replace the placeholder `Enter_the_Application_Id_Here` with the **Application (client) ID** that you copied.
1. Save the file.

## Debug Office add-in
- Please note that the same M365 account should be used both in Microsoft 365 Agents Toolkit and Office.
- From Visual Studio Code: Start debugging the project by choosing launch profile (default value is Word) in `Run and Debug` pane and hitting the `F5` key in Visual Studio Code. Please run VSCode as administrator if localhost loopback for Microsoft Edge Webview hasn't been enabled. Once enbaled, administrator priviledge is no longer required.
- Once the add-in loads, choose **Show task pane**. The task pane has two buttons: **Get user data** displays the signed-in user's name and email, and **Get user files** inserts the first 10 file names from the user's OneDrive into the document. You'll be prompted to consent to the requested scopes the first time.

## Edit the manifest

You can find the app manifest in `./appPackage` folder. The folder contains one manifest file:
* `manifest.json`: Manifest file for Office add-in running locally or running remotely (After deployed to Azure).
You may add any extra properties or permissions you require to this file. See the [schema reference](https://raw.githubusercontent.com/OfficeDev/microsoft-teams-app-schema/preview/op/extensions/MicrosoftTeams.schema.json) for more information.

## Deploy to Azure

Deploy your project to Azure by following these steps:

| From Visual Studio Code                                                                                                                                                                                                                                                                                                                                                  | From Microsoft 365 Agents Toolkit CLI                                                                                                                                                                                                                    |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <ul><li>Open Microsoft 365 Agents Toolkit, and sign into Azure by clicking the `Sign in to Azure` under the `ACCOUNTS` section from sidebar.</li> <li>After you signed in, select a subscription under your account.</li><li>Open the Microsoft 365 Agents Toolkit and click `Provision` from LIFECYCLE section or open the command palette and select: `Microsoft 365 Agents: Provision`.</li><li>Open the Microsoft 365 Agents Toolkit and click `Deploy` or open the command palette and select: `Microsoft 365 Agents: Deploy`.</li></ul> | <ul> <li>Run command `atk auth login azure`.</li> <li>(Optional)Set environment variable AZURE_SUBSCRIPTION_ID to your subscription id in env/.env.dev or in your current shell envrionment if you are using non-interactive mode of `teamsfx` CLI.</li> <li> Run command `atk provision`.</li> <li>Run command: `atk deploy`. </li></ul> |
> Note: Provisioning and deployment may incur charges to your Azure Subscription.

### Update the app registration for the deployed add-in

After deployment, you must add the deployed domain as an NAA redirect URI in your Microsoft Entra app registration. Otherwise, single sign-on fails because the remote host isn't registered as a trusted broker.

1. Copy the production URL from `ADDIN_ENDPOINT` in the `env/.env.dev` file and note its domain without `https://`, a path, or a trailing slash. For example, if the URL is `https://contoso.azurestaticapps.net`, the domain is `contoso.azurestaticapps.net`.
1. In the [Azure portal - App registrations](https://go.microsoft.com/fwlink/?linkid=2083908), open the app registration that you created for the add-in.
1. Select **Authentication**.
1. Under the **Single-page application (SPA)** platform, add `brk-multihub://<deployed-domain>` as a redirect URI. For example, `brk-multihub://contoso.azurestaticapps.net`.
1. Keep the existing `brk-multihub://localhost:3000` redirect URI so that local debugging continues to work, and then select **Save**.

To sideload the deployed add-in:

- Copy the production URL from the `ADDIN_ENDPOINT` in env/.env.dev file.
- Edit webpack.config.js file and change `urlProd` to the value you just copied. Please note to add a '/' at the end of the URL.
- Run `npm run build`.
- Run `npx office-addin-dev-settings sideload ./dist/manifest.json`.

## Validate manifest file

To check that your manifest file is valid:

- From Visual Studio Code: open the command palette and select: `Microsoft 365 Agents: Validate Application` and select `Validate using manifest schema`.
- From Microsoft 365 Agents Toolkit CLI: run command `atk validate` in your project directory.

## Known Issues
- Publish is not supported for an Office add-in project now.