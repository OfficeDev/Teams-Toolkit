/* eslint-disable @typescript-eslint/ban-types */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";

/**
 * Void is used to construct Result<Void, FxError>.
 * e.g. return ok(Void);
 * It exists because ok(void) does not compile.
 */
export type Void = {};
export const Void = {};

/**
 * The key of global config visible to all resource plugins.
 */
export const GLOBAL_CONFIG = "solution";
// export const SELECTED_PLUGINS = "selectedPlugins";

/**
 * Used to track whether provision succeeded
 * Set to true when provison succeeds, to false when a new resource is added.
 */
export const SOLUTION_PROVISION_SUCCEEDED = "provisionSucceeded";

/**
 * Config key whose value is either javascript, typescript or csharp.
 */
export const PROGRAMMING_LANGUAGE = "programmingLanguage";

/**
 * Config key whose value is the default function name for adding a new function.
 */
export const DEFAULT_FUNC_NAME = "defaultFunctionName";

/**
 * Config key whose value is output of ARM templates deployment.
 */
export const ARM_TEMPLATE_OUTPUT = "armTemplateOutput";

/**
 * Config key whose value is the resource group name of project.
 */
export const RESOURCE_GROUP_NAME = "resourceGroupName";

/**
 * Config key whose value is the user info of collaborator
 */
export const USER_INFO = "userInfo";

export const DEFAULT_PERMISSION_REQUEST = [
  {
    resource: "Microsoft Graph",
    delegated: ["User.Read"],
    application: [],
  },
];

export enum PluginNames {
  SQL = "fx-resource-azure-sql",
  MSID = "fx-resource-identity",
  FE = "fx-resource-frontend-hosting",
  SPFX = "fx-resource-spfx",
  BOT = "fx-resource-bot",
  AAD = "fx-resource-aad-app-for-teams",
  FUNC = "fx-resource-function",
  SA = "fx-resource-simple-auth",
  LDEBUG = "fx-resource-local-debug",
  APIM = "fx-resource-apim",
  APPST = "fx-resource-appstudio",
  SOLUTION = "solution",
}

export enum SolutionError {
  InvalidSelectedPluginNames = "InvalidSelectedPluginNames",
  PluginNotFound = "PluginNotFound",
  AADPluginNotEnabled = "AADPluginNotEnabled",
  MissingPermissionsJson = "MissingPermissionsJson",
  DialogIsNotPresent = "DialogIsNotPresent",
  NoResourcePluginSelected = "NoResourcePluginSelected",
  NoAppStudioToken = "NoAppStudioToken",
  NoTeamsAppTenantId = "NoTeamsAppTenantId",
  FailedToCreateResourceGroup = "FailedToCreateResourceGroup",
  FailedToListResourceGroup = "FailedToListResourceGrouop",
  FailedToGetResourceGroupInfoInputs = "FailedToGetResourceGroupInfoInputs",
  NotLoginToAzure = "NotLoginToAzure",
  AzureAccountExtensionNotInitialized = "AzureAccountExtensionNotInitialized",
  LocalTabEndpointMissing = "LocalTabEndpointMissing",
  LocalTabDomainMissing = "LocalTabDomainMissing",
  LocalClientIDMissing = "LocalDebugClientIDMissing",
  LocalApplicationIdUrisMissing = "LocalApplicationIdUrisMissing",
  LocalClientSecretMissing = "LocalClientSecretMissing",
  CannotUpdatePermissionForSPFx = "CannotUpdatePermissionForSPFx",
  CannotAddResourceForSPFx = "CannotAddResourceForSPFx",
  FailedToParseAzureTenantId = "FailedToParseAzureTenantId",
  CannotRunProvisionInSPFxProject = "CannotRunProvisionInSPFxProject",
  CannotRunThisTaskInSPFxProject = "CannotRunThisTaskInSPFxProject",
  FrontendEndpointAndDomainNotFound = "FrontendEndpointAndDomainNotFound",
  RemoteClientIdNotFound = "RemoteClientIdNotFound",
  AddResourceNotSupport = "AddResourceNotSupport",
  FailedToAddCapability = "FailedToAddCapability",
  NoResourceToDeploy = "NoResourceToDeploy",
  ProvisionInProgress = "ProvisionInProgress",
  DeploymentInProgress = "DeploymentInProgress",
  PublishInProgress = "PublishInProgress",
  UnknownSolutionRunningState = "UnknownSolutionRunningState",
  CannotDeployBeforeProvision = "CannotDeployBeforeProvision",
  CannotPublishBeforeProvision = "CannotPublishBeforeProvision",
  NoSubscriptionFound = "NoSubscriptionFound",
  NoSubscriptionSelected = "NoSubscriptionSelected",
  FailedToGetParamForRegisterTeamsAppAndAad = "FailedToGetParamForRegisterTeamsAppAndAad",
  BotInternalError = "BotInternalError",
  InternelError = "InternelError",
  RegisterTeamsAppAndAadError = "RegisterTeamsAppAndAadError",
  GetLocalDebugConfigError = "GetLocalDebugConfigError",
  GetRemoteConfigError = "GetRemoteConfigError",
  UnsupportedPlatform = "UnsupportedPlatform",
  InvalidInput = "InvalidInput",
  FailedToCompileBicepFiles = "FailedToCompileBicepFiles",
  FailedToGetAzureCredential = "FailedToGetAzureCredential",
  FailedToDeployArmTemplatesToAzure = "FailedToDeployArmTemplatesToAzure",
  V1ProjectNotSupported = "V1ProjectNotSupported",
  FailedToRetrieveUserInfo = "FailedToRetrieveUserInfo",
  M365AccountNotMatch = "M365AccountNotMatch",
  FeatureNotSupported = "FeatureNotSupported",
  CannotProcessBeforeProvision = "CannotProcessBeforeProvision",
  CannotFindUserInCurrentTenant = "CannotFindUserInCurrentTenant",
  FailedToGrantPermission = "FailedToGrantPermission",
  FailedToCheckPermission = "FailedToCheckPermission",
  FailedToListCollaborator = "FailedToListCollaborator",
}

export const LOCAL_DEBUG_TAB_ENDPOINT = "localTabEndpoint";
export const LOCAL_DEBUG_TAB_DOMAIN = "localTabDomain";
export const LOCAL_DEBUG_BOT_DOMAIN = "localBotDomain";
export const BOT_DOMAIN = "validDomain";
export const BOT_SECTION = "bots";
export const COMPOSE_EXTENSIONS_SECTION = "composeExtensions";
export const LOCAL_WEB_APPLICATION_INFO_SOURCE = "local_applicationIdUris";
export const WEB_APPLICATION_INFO_SOURCE = "applicationIdUris";
export const LOCAL_DEBUG_AAD_ID = "local_clientId";
export const REMOTE_AAD_ID = "clientId";
export const LOCAL_APPLICATION_ID_URIS = "local_applicationIdUris";
export const REMOTE_APPLICATION_ID_URIS = "applicationIdUris";
export const LOCAL_CLIENT_SECRET = "local_clientSecret";
export const REMOTE_CLIENT_SECRET = "clientSecret";
export const REMOTE_TENANT_ID = "tenantId";
// Teams App Id for local debug
export const LOCAL_DEBUG_TEAMS_APP_ID = "localDebugTeamsAppId";
// Teams App Id for remote
export const REMOTE_TEAMS_APP_ID = "remoteTeamsAppId";

export const DoProvisionFirstError = new UserError(
  "DoProvisionFirst",
  "DoProvisionFirst",
  "Solution"
);
export const CancelError = new UserError("UserCancel", "UserCancel", "Solution");
// This is the max length specified in
// https://developer.microsoft.com/en-us/json-schemas/teams/v1.7/MicrosoftTeams.schema.json

export enum SolutionTelemetryEvent {
  CreateStart = "create-start",
  Create = "create",

  MigrateStart = "migrate-start",
  Migrate = "migrate",

  AddResourceStart = "add-resource-start",
  AddResource = "add-resource",

  AddCapabilityStart = "add-capability-start",
  AddCapability = "add-capability",

  GrantPermissionStart = "grant-permission-start",
  GrantPermission = "grant-permission",

  CheckPermissionStart = "check-permission-start",
  CheckPermission = "check-permission",

  ListCollaboratorStart = "list-collaborator-start",
  ListCollaborator = "list-collaborator",
}

export enum SolutionTelemetryProperty {
  Component = "component",
  Resources = "resources",
  Capabilities = "capabilities",
  Success = "success",
}

export enum SolutionTelemetrySuccess {
  Yes = "yes",
  No = "no",
}

export const SolutionTelemetryComponentName = "solution";
