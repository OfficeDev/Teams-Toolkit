// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
export const CONFIGURATION_PREFIX = "M365AgentsToolkit";
export enum ConfigurationKey {
  BicepEnvCheckerEnable = "prerequisiteCheck.bicep",
  LogLevel = "logLevel",
  EnableCEA = "enableLaunchAgentForTeamsInCopilot",
  EnableCFShortcutMetaOS = "enableCustomFunctionShortcutInOfficeAddIn",
  SovereignCloudEnvironment = "sovereignCloudEnvironment",
}

export const AzurePortalUrl = "https://portal.azure.com";

export enum SyncedState {
  Version = "teamsToolkit:synced:version",
}

export enum UserState {
  IsExisting = "teamsToolkit:user:isExisting",
}

export enum PrereleaseState {
  Version = "teamsToolkit:prerelease:version",
}

export enum ResourceInfo {
  Subscription = "Subscription",
  ResourceGroup = "Resource Group",
}

export enum GlobalKey {
  OpenWalkThrough = "fx-extension.openWalkThrough",
  OpenReadMe = "fx-extension.openReadMe",
  OpenSampleReadMe = "fx-extension.openSampleReadMe",
  ShowLocalDebugMessage = "ShowLocalDebugMessage",
  CreateWarnings = "CreateWarnings",
  SampleGalleryLayout = "teamsToolkit:sampleGallery:layout",
  SampleGalleryInitialSample = "teamsToolkit:sampleGallery:initialSample",
  AutoInstallDependency = "teamsToolkit:autoInstallDependency",
  DoNotRemindInstallTeamsAgent = "teamsToolkit:doNotRemindInstallTeamsAgent",
  TeamsAgentInstalled = "teamsToolkit:teamsAgentInstalled",
}

export enum CommandKey {
  Create = "fx-extension.create",
  OpenWelcome = "fx-extension.openWelcome",
  BuildIntelligentAppsWalkthrough = "fx-extension.buildIntelligentAppsWalkthrough",
  CheckCopilotAccess = "fx-extension.checkCopilotAccess",
  OpenDocument = "fx-extension.openDocument",
  OpenSamples = "fx-extension.openSamples",
  DownloadSample = "fx-extension.downloadSample",
  ValidateGetStartedPrerequisites = "fx-extension.validate-getStarted-prerequisites",
  OpenReadMe = "fx-extension.openReadMe",
  DebugInTestToolFromMessage = "fx-extension.debugInTestToolFromMessage",
  SigninM365 = "fx-extension.signinM365",
  LocalDebug = "fx-extension.localdebug",
  SigninAzure = "fx-extension.signinAzure",
  Provision = "fx-extension.provision",
  Deploy = "fx-extension.deploy",
  Publish = "fx-extension.publish",
  Share = "fx-extension.share",
  Preview = "fx-extension.preview",
  installDependency = "fx-extension.installDependency",
  publishToAppSource = "fx-extension.publishToAppSource",
  openDeployLink = "fx-extension.officeDevDeploy",
  openOfficeDevDocument = "fx-extension.openOfficeDevDocument",
}

export const environmentVariableRegex = /\${{[a-zA-Z-_]+}}/g;

export const PublishAppLearnMoreLink = "https://aka.ms/teamsfx-publish";

export const DeveloperPortalHomeLink = "https://dev.teams.microsoft.com/home";

export const TerminalName = "Microsoft 365 Agents Toolkit";

export const InstallCopilotChatLink = "https://aka.ms/install-github-copilot-chat";

export const MaximumNotificationOutputTroubleshootCount = 3;
