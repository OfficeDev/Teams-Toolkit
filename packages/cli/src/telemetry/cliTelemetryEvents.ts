// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

export enum TelemetryEvent {
  //TODO: define CLI telemetry event

  RootCommand = "root",

  AccountShowStart = "account-show-start",
  AccountShow = "account-show",

  AccountLoginStart = "login-start",
  AccountLogin = "login",
  AccountLoginAzure = "login-azure",
  AccountLoginM365 = "login-m",

  AccountLogout = "logout",

  CreateProjectStart = "create-project-start",
  CreateProject = "create-project",

  InitInfraStart = "init-infra-start",
  InitInfra = "init-infra",

  InitDebugStart = "init-debug-start",
  InitDebug = "init-debug",

  InitProjectStart = "init-project-start",
  InitProject = "init-project",

  DownloadSampleStart = "download-sample-start",
  DownloadSample = "download-sample",

  ListSample = "list-sample",

  UpdateProjectStart = "add-resource-start",
  UpdateProject = "add-resource",

  AddCapStart = "add-knowledge-start",
  AddCap = "add-knowledge",

  ValidateManifestStart = "validate-manifest-start",
  ValidateManifest = "validate-manifest",

  UpdateManifestStart = "update-manifest-start",
  UpdateManifest = "update-manifest",

  UpdateTeamsAppStart = "update-teams-app-start",
  UpdateTeamsApp = "update-teams-app",

  UpdateAadAppStart = "update-aad-app-start",
  UpdateAadApp = "update-aad-app",

  BuildStart = "build-start",
  Build = "build",

  AddCICDStart = "add-cicd-start",
  AddCICD = "add-cicd",

  ConnectExistingApiStart = "connect-existing-api-start",
  ConnectExistingApi = "connect-existing-api",

  ProvisionStart = "provision-start",
  Provision = "provision",

  ProvisionManifestStart = "provision-manifest-start",
  ProvisionManifest = "provision-manifest",

  DeployStart = "deploy-start",
  Deploy = "deploy",
  DeployAad = "deployAad",

  PublishStart = "publish-start",
  Publish = "publish",

  ShareStart = "share-start",
  Share = "share",

  ShareRemoveStart = "share-remove-start",
  ShareRemove = "share-remove",

  Preview = "preview",
  PreviewNpmInstallStart = "preview-npm-install-start",
  PreviewNpmInstall = "preview-npm-install",
  PreviewGulpCert = "preview-gulp-cert",
  PreviewGulpCertStart = "preview-gulp-cert-start",
  PreviewServiceStart = "preview-service-start",
  PreviewService = "preview-service",
  PreviewSideloading = "preview-sideloading",
  PreviewSideloadingStart = "preview-sideloading-start",
  PreviewPrereqsCheckM365Account = "preview-prereqs-check-m365-account",
  PreviewStartServices = "preview-start-services",
  PreviewTeamsDesktopClient = "preview-teams-desktop-client",

  ConfigGet = "config-get",
  ConfigSet = "config-set",

  CheckPermissionStart = "check-permission-start",
  CheckPermission = "check-permission",

  GrantPermissionStart = "grant-permission-start",
  GrantPermission = "grant-permission",

  EnvListStart = "env-list-start",
  EnvList = "env-list",
  CreateNewEnvironmentStart = "create-new-environment-start",
  CreateNewEnvironment = "create-new-environment",
  ResetEnvironment = "reset-environment",

  AddSsoStart = "add-sso-start",
  AddSso = "add-sso",

  AddWebpartStart = "add-webpart-start",
  AddWebpart = "add-webpart",

  Command = "command", // this event is used to track the usage of each command, including --help command

  Install = "install",
  Uninstall = "uninstall",
  M365LaunchInfo = "mos-launch-info",

  Doctor = "doctor",

  AddCopilotPlugin = "add-copilot-plugin",
  RegneratePlugin = "regenerate-copilot-plugin",
  AddAuthAction = "add-auth-action",
  AddSkill = "add-skill",
  ImportOpenPlugin = "import-open-plugin",
  ExportOpenPlugin = "export-open-plugin",

  SetSensitivityLabel = "set-sensitivity-label",
}

export enum TelemetryProperty {
  Component = "component",
  ProjectId = "project-id",
  CorrelationId = "correlation-id",
  AppId = "appid",
  TenantId = "tenant-id",
  UserId = "hashed-userid",
  AccountType = "account-type",
  Success = "success",
  Duration = "duration",
  ErrorType = "error-type",
  ErrorCode = "error-code",
  ErrorMessage = "err-message",
  SampleName = "sample-app-name",
  Capabilities = "capabilities",
  Resources = "resources",
  Internal = "internal",
  InternalAlias = "internal-alias",
  Skill = "skill",
  PreviewType = "preview-type",
  PreviewBrowser = "preview-browser",
  PreviewHub = "preview-hub",
  PreviewNpmInstallName = "preview-npm-install-name",
  PreviewGulpCertName = "preview-gulp-cert-name",
  PreviewNpmInstallExitCode = "preview-npm-install-exit-code",
  PreviewNpmInstallNodeVersion = "preview-npm-install-node-version",
  PreviewNpmInstallNpmVersion = "preview-npm-install-npm-version",
  PreviewNpmInstallErrorMessage = "preview-npm-install-error-message",
  PreviewServiceName = "preview-service-name",
  ListAllCollaborators = "list-all-collaborators",
  FeatureFlags = "feature-flags",
  Env = "env",
  SettingsVersion = "settings-version",
  NewProjectId = "new-project-id",
  ProgrammingLanguage = "programming-language",
  HostType = "host-type",

  RunFrom = "run-from",
  IsCreatingM365 = "is-creating-office",
  // command related property
  CommandFull = "command-full",
  CommandName = "command-name",
  CommandHelp = "command-help",
  CommandVersion = "command-version",
  CommandDebug = "command-debug",
  CommandVerbose = "command-verbose",
  CommandInteractive = "command-interactive",
  BinName = "bin-name", // the input binary name: atk
  CallerSource = "caller-source", // invoking tool/surface (e.g. "wiqd"), from ATK_CALLER
}

export enum TelemetrySuccess {
  Yes = "yes",
  No = "no",
}
export enum CliConfigRunFrom {
  GitHub = "GitHub",
  AzDo = "AzDo",
  Jenkins = "Jenkins",
  Other = "Other",
}
export enum TelemetryErrorType {
  UserError = "user",
  SystemError = "system",
}

export const TelemetryComponentType = "cli";
