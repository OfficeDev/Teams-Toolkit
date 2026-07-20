// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from "os";

export class Extension {
  public static readonly displayName: string = "Microsoft 365 Agents Toolkit";
  public static readonly treeViewSectionName: string = "Development";
  public static readonly activatedItemName: string = "DEVELOPMENT";
  public static readonly sidebarWelcomeSectionName: string =
    "Microsoft 365 Agents Toolkit";
  public static readonly sidebarWelcomeContentName: string =
    "Create a New Agent/App";
  public static readonly sidebarCommandContentName: string =
    "Create New Agent/App";
  public static readonly sidebarCommandContentNameOfficeDev: string =
    "Preview Your Office Add-in (F5)";
  public static readonly settingsCategory: string = "Fx-extension";
  public static readonly settingsInsiderPreview: string = "Insider Preview";
}

export class Project {
  public static readonly namePrefix = "fxui";
}

export class TeamsFxProject {
  public static readonly ExtensionConfigFolderName = "fx";
  public static readonly TelemetryLoggerFileName = "telemetryTest.log";
  public static readonly TelemetryLoggerFilePath =
    os.homedir +
    `/.${TeamsFxProject.ExtensionConfigFolderName}/${TeamsFxProject.TelemetryLoggerFileName}`;
}

export enum TemplateProject {
  HelloWorldTabBackEnd = "Tab App with Azure Backend",
  ContactExporter = "Contact Exporter using Graph Toolkit",
  OneProductivityHub = "One Productivity Hub using Graph Toolkit",
  HelloWorldBotSSO = "Bot App with SSO Enabled",
  TodoListBackend = "Todo List with backend on Azure",
  TodoListSpfx = "Todo List with SPFx",
  ShareNow = "Share Now",
  MyFirstMeeting = "My First Meeting App",
  TodoListM365 = "Todo List (Works in Teams, Outlook and Office)",
  NpmSearch = "NPM Search Connector",
  ProactiveMessaging = "Proactive Messaging",
  AdaptiveCard = "Adaptive Card Notification",
  CopilotConnector = "Copilot Connector App",
  StockUpdate = "Stocks Update",
  QueryOrg = "Org User Search Connector",
  Deeplinking = "Hello World Deeplinking Navigation Tab App",
  Dashboard = "Team Central Dashboard",
  AssistDashboard = "Developer Assist Dashboard",
  DiceRoller = "Dice Roller in meeting",
  OutlookTab = "Hello World Teams Tab and Outlook add-in",
  OutlookSignature = "Set signature using Outlook add-in",
  ChefBot = "Teams Chef Bot",
  CopilotConnectorBot = "Copilot Connector Bot",
  SpfxProductivity = "One Productivity Hub using Graph Toolkit with SPFx",
  RetailDashboard = "Contoso Retail Dashboard",
  TabSSOApimProxy = "SSO Enabled Tab via APIM Proxy",
  LargeScaleBot = "Large Scale Notification Bot",
  BotSSODocker = "Containerized Bot App with SSO Enabled",
  HelloWorldTabDocker = "Containerized Hello World Tab with Backend",
  FoodCatalog = "Ingest Custom API Data into Microsoft 365 with a Microsoft Copilot Connector",
  RedditLink = "Format Reddit Link into Adaptive Card",
}

export enum TemplateProjectFolder {
  HelloWorldTabBackEnd = "hello-world-tab-with-backend",
  ContactExporter = "graph-toolkit-contact-exporter",
  HelloWorldBotSSO = "bot-sso",
  BotSSODocker = "bot-sso-docker",
  TabDocker = "hello-world-tab-docker",
  TodoListSpfx = "todo-list-SPFx",
  MyFirstMeeting = "hello-world-in-meeting",
  TodoListM365 = "todo-list-with-Azure-backend-M365",
  NpmSearch = "NPM-search-connector-M365",
  ProactiveMessaging = "bot-proactive-messaging-teamsfx",
  AdaptiveCard = "adaptive-card-notification",
  StockUpdate = "stocks-update-notification-bot",
  QueryOrg = "query-org-user-with-message-extension-sso",
  CopilotConnector = "copilot-connector-app",
  OneProductivityHub = "graph-toolkit-one-productivity-hub",
  TodoListBackend = "todo-list-with-Azure-backend",
  ShareNow = "share-now",
  // v3 only
  Dashboard = "team-central-dashboard",
  OutlookSignature = "outlook-set-signature",
  OutlookTab = "hello-world-teams-tab-and-outlook-add-in",
  AssistDashboard = "developer-assist-dashboard",
  DiceRoller = "live-share-dice-roller",
  ChefBot = "a.teamsChefBot",
  CopilotConnectorBot = "copilot-connector-bot",
  SpfxProductivity = "spfx-productivity-dashboard",
  RetailDashboard = "react-retail-dashboard",
  TabSSOApimProxy = "sso-enabled-tab-via-apim-proxy",
  LargeScaleBot = "large-scale-notification",
  HelloWorldTabDocker = "hello-world-tab-docker",
  FoodCatalog = "nodejs-typescript-food-catalog",
  RedditLink = "nodejs",
  IntelligentDataChart = "intelligent-data-chart-generator",
  // new samples
  CoffeeAgent = "coffee-agent",
  DataAnalystAgentV2 = "data-analyst-agent-v2",
  ProxyAgentNodeJS = "ProxyAgent-NodeJS",
  HelloWorldOfficeAddin = "hello-world-office-addin",
  // v2 only
  Deeplinking = "deep-linking-hello-world-tab-without-sso-M365",
}

export const sampleProjectMap: Record<TemplateProject, TemplateProjectFolder> =
  {
    [TemplateProject.HelloWorldTabBackEnd]:
      TemplateProjectFolder.HelloWorldTabBackEnd,
    [TemplateProject.ContactExporter]: TemplateProjectFolder.ContactExporter,
    [TemplateProject.OneProductivityHub]:
      TemplateProjectFolder.OneProductivityHub,
    [TemplateProject.HelloWorldBotSSO]: TemplateProjectFolder.HelloWorldBotSSO,
    [TemplateProject.TodoListBackend]: TemplateProjectFolder.TodoListBackend,
    [TemplateProject.TodoListSpfx]: TemplateProjectFolder.TodoListSpfx,
    [TemplateProject.ShareNow]: TemplateProjectFolder.ShareNow,
    [TemplateProject.MyFirstMeeting]: TemplateProjectFolder.MyFirstMeeting,
    [TemplateProject.TodoListM365]: TemplateProjectFolder.TodoListM365,
    [TemplateProject.NpmSearch]: TemplateProjectFolder.NpmSearch,
    [TemplateProject.ProactiveMessaging]:
      TemplateProjectFolder.ProactiveMessaging,
    [TemplateProject.AdaptiveCard]: TemplateProjectFolder.AdaptiveCard,
    [TemplateProject.CopilotConnector]: TemplateProjectFolder.CopilotConnector,
    [TemplateProject.StockUpdate]: TemplateProjectFolder.StockUpdate,
    [TemplateProject.QueryOrg]: TemplateProjectFolder.QueryOrg,
    [TemplateProject.Deeplinking]: TemplateProjectFolder.Deeplinking,
    [TemplateProject.Dashboard]: TemplateProjectFolder.Dashboard,
    [TemplateProject.OutlookSignature]: TemplateProjectFolder.OutlookSignature,
    [TemplateProject.OutlookTab]: TemplateProjectFolder.OutlookTab,
    [TemplateProject.AssistDashboard]: TemplateProjectFolder.AssistDashboard,
    [TemplateProject.DiceRoller]: TemplateProjectFolder.DiceRoller,
    [TemplateProject.ChefBot]: TemplateProjectFolder.ChefBot,
    [TemplateProject.CopilotConnectorBot]:
      TemplateProjectFolder.CopilotConnectorBot,
    [TemplateProject.SpfxProductivity]: TemplateProjectFolder.SpfxProductivity,
    [TemplateProject.RetailDashboard]: TemplateProjectFolder.RetailDashboard,
    [TemplateProject.TabSSOApimProxy]: TemplateProjectFolder.TabSSOApimProxy,
    [TemplateProject.LargeScaleBot]: TemplateProjectFolder.LargeScaleBot,
    [TemplateProject.BotSSODocker]: TemplateProjectFolder.BotSSODocker,
    [TemplateProject.HelloWorldTabDocker]:
      TemplateProjectFolder.HelloWorldTabDocker,
    [TemplateProject.FoodCatalog]: TemplateProjectFolder.FoodCatalog,
    [TemplateProject.RedditLink]: TemplateProjectFolder.RedditLink,
  };

export enum Resource {
  AzureKeyVault = "azure-keyvault",
  AzureFunction = "azure-function",
  AzureApim = "azure-apim",
  AzureSql = "azure-sql",
}

export enum ResourceToDeploy {
  Spfx = "spfx",
  FrontendHosting = "frontend-hosting",
  Bot = "bot",
  Function = "azure-function",
  Apim = "apim",
  AadManifest = "aad-manifest",
}

export enum Capability {
  Bot = "default-bot",
  Notification = "notification",
  CommandBot = "command-bot",
  WorkflowBot = "workflow-bot",
  TabNonSso = "non-sso-tab",
  M365SsoLaunchPage = "sso-launch-page",
  DashboardTab = "dashboard-tab",
  Spfx = "tab-spfx",
  M365SearchApp = "search-app",
  MessageExtension = "default-message-extension",
  LinkUnfurling = "link-unfurling",
  // v2 only
  Tab = "tab",
  // v3 only
  AiBot = "custom-copilot-basic",
  RAG = "custom-copilot-rag",
  Agent = "custom-copilot-agent",
  TaskPane = "taskpane",
  ApiPlugin = "api-plugin",
  DeclarativeAgent = "copilot-gpt-basic",
  DeclarativeAgentWithActionFromScratchBearer = "api-plugin-from-scratch-bearer",
  DeclarativeAgentWithActionFromScratchOAuth = "api-plugin-from-scratch-oauth",
  DeclarativeAgentWithActionFromScratch = "api-plugin-from-scratch",
  DeclarativeAgentWithTypeSpec = "declarative-agent-typespec",
  TeamsCollaboratorAgent = "teams-collaborator-agent",
  FoundryProxyAgent = "foundry-proxy-agent",
}

export enum Trigger {
  Http = "http-functions",
  Express = "http-express",
  Timmer = "timer-functions",
}

export enum Framework {
  React = "react",
  Minimal = "minimal",
  None = "none",
}

export class Timeout {
  /**
   * Wait a while to ensure the input is ready
   */
  public static readonly input: number = 500;

  /**
   * Wait until the command takes effect
   */
  public static readonly command: number = 4 * 60 * 1000;

  /**
   * Wait until the webView takes effect
   */
  public static readonly webView: number = 20 * 1000;

  /**
   * Wait for some time to take effect
   */
  public static readonly shortTimeWait: number = 5 * 1000;
  public static readonly shortTimeLoading: number = 30 * 1000;
  public static readonly longTimeWait: number = 60 * 1000;
  public static readonly stopdebugging: number = 30 * 1000;
  public static readonly startdebugging: number = 30 * 1000;

  /**
   * Wait until extension is activated
   */
  public static readonly activatingExtension: number = 3 * 60 * 1000;

  /**
   * Wait until terminal exist and contains target message
   */
  public static readonly terminal: number = 12 * 60 * 1000;

  public static readonly reloadWindow: number = 60 * 1000;

  public static readonly closeDebugWindow: number = 30 * 1000;

  public static readonly copyBotTerminal: number = 30 * 1000;

  public static readonly installWait: number = 5 * 60 * 1000;
  /**
   * playwright
   */
  public static readonly chromiumLaunchTimeout: number = 1 * 60 * 1000;
  public static readonly playwrightDefaultTimeout: number = 2 * 60 * 1000;
  public static readonly playwrightConsentPageReload: number = 3000;
  public static readonly playwrightBotConsentContinueButton: number =
    2 * 60 * 1000;
  public static readonly playwrightConsentPopupPage: number = 30 * 1000;
  public static readonly playwrightAddAppButton: number = 180 * 1000;

  // mocha
  public static readonly prepareTestCase: number = 10 * 60 * 1000;
  public static readonly finishTestCase: number = 10 * 60 * 1000;
  public static readonly testCase: number = 60 * 60 * 1000;
  public static readonly localAndRemoteTestCase: number = 60 * 60 * 1000;
  public static readonly finishAzureTestCase: number = 15 * 60 * 1000;
  public static readonly testAzureCaseTotal: number = 90 * 60 * 1000;
  public static readonly testAzureCase: number = 45 * 60 * 1000;
  public static readonly migrationTestCase: number = 40 * 60 * 1000;

  // SPFx
  public static readonly spfxProvision: number = 10 * 1000;
  public static readonly spfxDeploy: number = 4 * 60 * 1000;

  // Tab
  public static readonly tabProvision: number = 5 * 60 * 1000;
  public static readonly tabDeploy: number = 6 * 60 * 1000;

  // Bot
  public static readonly botDeploy: number = 10 * 60 * 1000;

  // Add Collaborator
  public static readonly addCollaborator: number = 60 * 1000;

  // open API
  public static readonly openAPIProvision: number = 30 * 1000;

  public static readonly loadOpenAPI: number = 10 * 1000;
}

export class TreeViewCommands {
  public static readonly CreateProjectCommand: string = "Create New Agent/App";
  public static readonly SamplesCommand: string = "View Samples";
  public static readonly QuickStartCommand: string = "Get Started";
  public static readonly BuildTeamsPackageCommand: string =
    "Zip Teams App Package";
  public static readonly DevelopmentSectionName: string = "DEVELOPMENT";
  public static readonly DevelopmentSectionItems: string[] = [
    "Create New App",
    "View Samples",
    "View How-to Guides",
    "Preview Your Teams App (F5)",
  ];
  public static readonly EnvSectionName: string = "ENVIRONMENT";

  public static readonly OfficeDevDevelopmentSectionName: string =
    "DEVELOPMENT";
  public static readonly OfficeDevDevelopmentSectionItems: string[] = [
    "Create a New App",
    "View Samples",
    "Check and Install Dependencies",
    "Preview Your Office Add-in (F5)",
    "Stop Previewing Your Office Add-in",
  ];

  public static readonly OfficeDevLifeCycleSectionName: string = "LIFECYCLE";
  public static readonly OfficeDevLifeCycleSectionItems: string[] = [
    "Deploy",
    "Publish",
  ];

  public static readonly OfficeDevUtilitySectionName: string = "UTILITY";
  public static readonly OfficeDevUtilitySectionItems: string[] = [
    "Validate Manifest File",
    "Script Lab",
    "View Prompts for GitHub Copilot",
  ];

  public static readonly OfficeDevHelpAndFeedBackSectionName: string =
    "HELP AND FEEDBACK";
  public static readonly OfficeDevHelpAndFeedBackSectionItems: string[] = [
    "Documentation",
    "Get Started",
    "Open Partner Center",
    "Report Issues on GitHub",
  ];
}

export class CommandPaletteCommands {
  public static readonly QuickStartCommand: string =
    "Microsoft 365 Agents: Get Started";
  public static readonly AccountsCommand: string =
    "Microsoft 365 Agents: Accounts";
  public static readonly SamplesCommand: string =
    "Microsoft 365 Agents: View Samples";
  public static readonly CreateProjectCommand: string =
    "Microsoft 365 Agents: Create New Agent/App";
  public static readonly ManifestValidateCommand: string =
    "Microsoft 365 Agents: Validate Application";
  public static readonly BuildTeamsPackageCommand: string =
    "Microsoft 365 Agents: Zip App Package";
  public static readonly ProvisionCommand: string =
    "Microsoft 365 Agents: Provision";
  public static readonly DeployCommand: string = "Microsoft 365 Agents: Deploy";
  public static readonly PublishCommand: string =
    "Microsoft 365 Agents: Publish";
  public static readonly CreateEnvironmentCommand: string =
    "Microsoft 365 Agents: Create New Environment";
  public static readonly DeployAadAppManifestCommand: string =
    "Microsoft 365 Agents: Update Microsoft Entra App";
  public static readonly InstallTTK: string =
    "Extensions: Install Specific Version of Extension";
  public static readonly AddSpfxWebPart: string =
    "Microsoft 365 Agents: Add SPFx web part";
}

export enum Lang {
  JS = "JavaScript",
  TS = "TypeScript",
  PY = "Python",
  CS = "C#",
}

export type AppType =
  | "tab"
  | "tabnsso"
  | "tabbot"
  | "bot"
  | "crbot" // command and response bot (name cannot be too long or it will exceed teams app name limit)
  | "funcnoti" // functions notification bot
  | "expressnoti" // express notification bot
  | "msg"
  | "msgsa"
  | "m365lp"
  | "spfx"
  | "gspfx"
  | "dashboard"
  | "workflow"
  | "timenoti"
  | "functimernoti"
  | "addin"
  | "importaddin"
  | "linkunfurl"
  | "aichat"
  | "aiagentassist"
  | "aiagentnew"
  | "chatdata"
  | "cdcustomapi" //chatadata customApi
  | "msgnewapi"
  | "msgopenapi"
  | "msgapikey"
  | "msgmicroentra"
  | "importspfx"
  | "msgmulparams"
  | "msgapikeyspec"
  | "daAction"
  | "weather"
  | "daOpenAPI";

export class FeatureFlagName {
  static readonly InsiderPreview = "__TEAMSFX_INSIDER_PREVIEW";
}

export enum LocalDebugTaskLabel {
  StartLocalTunnel = "Start local tunnel",
  StartBot = "Start bot",
  StartBotApp = "Start application",
  StartFrontend = "Start frontend",
  StartApplication = "Start application",
  StartApplicationPlayground = "Start application (Microsoft 365 Agents Playground)",
  StartAgentsPlayground = "Start Microsoft 365 Agents Playground",
  StartBackend = "Start backend",
  StartWebhook = "Start Incoming Webhook",
  WatchBackend = "Watch backend",
  InstallNpmPackages = "Install npm packages",
  ApiNpmInstall = "api npm install",
  BotNpmInstall = "bot npm install",
  TabsNpmInstall = "tabs npm install",
  SpfxNpmInstall = "SPFx npm install",
  GulpServe = "gulp serve",
  Azurite = "Start Azurite emulator",
  Compile = "Compile typescript",
  StartWebServer = "Start web server",
  DockerRun = "docker-run: debug",
  DockerTask = "docker",
  EnsureDevTunnnel = "Ensure DevTunnel",
  RunWatch = "Run watch",
  FuncStart = "func: host start",
}

export class LocalDebugTaskResult {
  static readonly FrontendSuccess = "Compiled successfully";
  static readonly FrontendReady = "ready";
  static readonly FrontendNoIssue = "webpack compiled";
  static readonly FrontendStarted = "listening on";
  static readonly StartSuccess = "started successfully";
  static readonly AzuriteSuccess = "Azurite Table service is successfully";
  static readonly CompiledSuccess = "Found 0 errors";
  static readonly BotAppSuccess = "Functions:";
  static readonly AppSuccess = "Bot Started";
  static readonly AgentStartedSuccessfully = "Agent started";
  static readonly GulpServeSuccess = "Running server";
  static readonly Failed = "failed";
  static readonly Error = "error";
  static readonly DebuggerAttached = "Debugger attached";
  static readonly WebServerSuccess = "press h to show help";
  static readonly DockerFinish = "press any key to close it";
  static readonly DevtunnelSuccess = "Ready to accept connections for tunnel:";
  static readonly FunctionStarted = "Worker process started and initialized";
}

export class LocalDebugTaskLabel2 {
  static readonly StartBot2 = "Start Bot";
  static readonly PythonDebugConsole = "Python Debug Console";
  static readonly StartAgentsPlayground =
    "Start Microsoft 365 Agents Playground";
  static readonly CompileTypescript = "Compile typescript";
}

export enum LocalDebugError {
  ElementNotInteractableError = "ElementNotInteractableError",
  TimeoutError = "TimeoutError",
  WarningError = "Warning",
  WarningError2 = "npm warn",
  WarningCapError = "WARNING",
  DeprecatedError = "npm warn deprecated",
  CompiledWithWarningError = "Compiled with warnings",
}

export class LocalDebugTaskInfo {
  static readonly StartBotAppInfo = "App Started";
  static readonly StartBotInfo = "Bot Started";
  static readonly StartBotInfo2 = "Bot started";
  static readonly AppListening = "app listening";
  static readonly PlaygroundStart = "agentsplayground start";
  static readonly ListeningOn = "listening on";
  static readonly ServerListening = "Server listening";
  static readonly BackendStartedInfo = "Worker process started and initialized";
  static readonly NoError = "Found 0 errors";
  static readonly PythonTaskStarted = "running on http://";
}

export class DebugItemSelect {
  static readonly DebugInTeamsUsingChrome = "Debug in Teams (Chrome)";
  static readonly DebugInCopilotUsingChrome = "Debug in Copilot (Chrome)";
  static readonly DebugInAgentsPlayground =
    "Debug in Microsoft 365 Agents Playground";
}

export class TestFilePath {
  static readonly configurationFolder = "env";
}

export class Notification {
  static readonly Incompatible =
    "The current project is incompatible with the installed version of Teams Toolkit.";
  static readonly TaskError =
    "There are task errors. See the output for details.";
  static readonly Upgrade =
    "Upgrade your Teams Toolkit project to stay compatible with the latest version. A backup directory will be created along with an Upgrade Summary.";
  static readonly Upgrade_dicarded =
    "Please upgrade your project to stay compatible with the latest version, your current project contains configurations from an older Teams Toolkit. The auto-upgrade process will generate backups in case an error occurs.";
  static readonly ProvisionSucceeded = "successfully";
  static readonly DeploySucceeded = "successfully";
  static readonly PublishSucceeded = "successfully";
  static readonly UnresolvedPlaceholderError =
    "MissingEnvironmentVariablesError";
  static readonly ZipAppPackageSucceeded = "successfully built";
  static readonly appManifestSchemaSucceeded = "passed";
}

export class CreateProjectQuestion {
  static readonly CustomCopilot = "Custom Engine Agent";
  static readonly TeamsApp = "Teams App";
  static readonly TeamsAgentsAndApps = "Teams Agents and Apps";
  static readonly Bot = "Bot";
  static readonly Tab = "Tab";
  static readonly MessageExtension = "Message Extension";
  static readonly OfficeAddin = "Office Add-in";
  static readonly NewTeamsApp = "Start with a Teams capability";
  static readonly SpfxSharepointFrameworkInTtk = "Install the latest SPFx";
  static readonly SpfxSharepointFrameworkGlobalEnvInTtk =
    "Use globally installed SPFx";
  static readonly NewAddinApp = "Start with an Outlook add-in";
  static readonly CreateNewSpfxSolution = "Create New SPFx Solution";
  static readonly ImportExistingSpfxSolution = "Import Existing SPFx Solution";
  static readonly BuildNotificationBot = "Build a Notification Bot";
  static readonly BuildDeclarativeAgent = "Build a Declarative Agent";
  static readonly StartWithNewApi = "Start with a New API";
  static readonly AgentWithApi = "Agent with API";
  static readonly DeclarativeAgent = "Declarative Agent";
  static readonly BasicCustomEngineAgent = "Basic Custom Engine Agent";
  static readonly BasicAgentForTeams = "General Teams Agent";
  static readonly WeatherAgent = "Weather Agent";
  static readonly TeamsAgentWithData = "Teams Agent with Data";
  static readonly OtherTeamsCapabilities = "Other Teams Capabilities";
  static readonly SimpleBot = "Simple Bot";
}

export class ValidationContent {
  static readonly Tab = "Welcome";
  static readonly Teams = "Teams";
  static readonly Bot = "Your Hello World Bot is Running";
  static readonly BotWelcomeInstruction = "Hi there! I'm an echo bot";
  static readonly GraphBot = "Your Copilot connector Bot is Running";
  static readonly AiChatBotWelcomeInstruction = "How can I help you today?";
  static readonly AiAssistantBotWelcomeInstruction =
    "I'm an assistant bot. How can I help you today?";
  static readonly AiBotErrorMessage = "encountered an error";
  static readonly AiBotErrorMessage3 = "The bot encountered an error or bug";
  static readonly AiBotErrorMessage2 = "An AI request failed";
  static readonly AiBotMeetingMessage = "Team Meeting";
  static readonly WeatherBotMessageWelcomeInstruction =
    "Hello and Welcome! I'm here to help with all your weather forecast needs!";
  static readonly WeatherBotMessage = "Weather Forecast for San Francisco";
}

export class CliVersion {
  static readonly V2TeamsToolkitStable425 = "1.2.6";
  static readonly V2TeamsToolkit400 = "1.0.0";
}

export const ResourceGroupEnvName = "AZURE_RESOURCE_GROUP_NAME";
export const BotIdEnvName = "BOT_ID";
export const AADAppIdEnvNames = ["AAD_APP_CLIENT_ID", BotIdEnvName];
export const TeamsAppIdEnvName = "TEAMS_APP_ID";
export const M365TitleIdEnvName = "M365_TITLE_ID";

export const strings = {
  deleteResourceGroup: {
    success: `[Success] Resource group %s is deleted.`,
    failed: `[Failed] Resource group %s is not deleted.`,
    skipped: `[Skipped] Resource group %s does not exist.`,
  },
};
