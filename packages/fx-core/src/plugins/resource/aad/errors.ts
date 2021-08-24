// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigKeys, Plugins } from "./constants";

const referHelpLink = "Please refer to the help link for further steps.";
const aadHelpLink = "https://aka.ms/teamsfx-aad-help";

export interface AadError {
  name: string;
  message: (...args: string[]) => string;
  helpLink?: string;
}

export const GetAppError: AadError = {
  name: "AadGetAppError",
  message: () =>
    `Failed to get app info with current Object Id in env.default.json. ` +
    "Please make sure object id is valid, " +
    `or delete 'objectId' under ${Plugins.pluginNameComplex} in env.default.json and try again.`,
};

export const GetAppConfigError: AadError = {
  name: "AadGetAppConfigError",
  message: (config: string) =>
    `Failed to get ${config} from Azure AD app settings.` +
    "Please make sure Azure AD app is correctly configured, " +
    `or delete 'objectId' under ${Plugins.pluginNameComplex} in env.default.json and try again.`,
};

export const GetSkipAppConfigError: AadError = {
  name: "AadGetSkipAppConfigError",
  message: () =>
    `Failed to get all necessary info. You need to set ${ConfigKeys.objectId}, ${ConfigKeys.clientId}, ${ConfigKeys.clientSecret}, ` +
    `${ConfigKeys.oauth2PermissionScopeId} under ${Plugins.pluginNameComplex} in env.default.json.`,
  helpLink: aadHelpLink,
};

export const CreateAppError: AadError = {
  name: "AadCreateAppError",
  message: () => `Failed to create an app in Azure Active Directory.`,
};

export const CreateSecretError: AadError = {
  name: "AadCreateSecretError",
  message: () => `Failed to create an application secret in Azure Active Directory.`,
};

export const UpdateRedirectUriError: AadError = {
  name: "UpdateRedirectUriError",
  message: () => `Failed to update application redirect URI in Azure Active Directory.`,
};

export const UpdateAppIdUriError: AadError = {
  name: "UpdateAppIdUriError",
  message: () => `Failed to update Application ID URI in Azure Active Directory. ${referHelpLink}`,
  helpLink: aadHelpLink,
};

export const UpdatePermissionError: AadError = {
  name: "AadUpdatePermissionError",
  message: () => `Failed to update application permission in Azure Active Directory.`,
};

export const AppIdUriInvalidError: AadError = {
  name: "AadAppIdUriInvalid",
  message: () => "Invalid Application ID URI. Provision your application before continuing.",
};

export const InvalidSelectedPluginsError: AadError = {
  name: "InvalidSelectedPlugins",
  message: (message) => `Invalid selected plugins. ${message}`,
};

export const ParsePermissionError: AadError = {
  name: "ParsePermissionError",
  message: () => "Failed to parse permission request.",
  helpLink: aadHelpLink,
};

export const UnhandledError: AadError = {
  name: "UnhandledError",
  message: () => "Unhandled Error. ",
};

export const UnknownPermissionName: AadError = {
  name: "UnknownPermissionName",
  message: (name: string) => `Failed to find resource: ${name}. ${referHelpLink}`,
  helpLink: aadHelpLink,
};

export const UnknownPermissionRole: AadError = {
  name: "UnknownPermissionRole",
  message: (roleName: string, resourceName: string) =>
    `Failed to find role "${roleName}" for resource "${resourceName}". ${referHelpLink}`,
  helpLink: aadHelpLink,
};

export const UnknownPermissionScope: AadError = {
  name: "UnknownPermissionScope",
  message: (scopeName: string, resourceName: string) =>
    `Failed to find scope "${scopeName}" for resource "${resourceName}". ${referHelpLink}`,
  helpLink: aadHelpLink,
};

export const GetTokenError: AadError = {
  name: "GetTokenError",
  message: (audience: string) => `Failed to get user login information for ${audience}.`,
};

export const TenantNotExistError: AadError = {
  name: "TenantNotExistError",
  message: () => "Failed to get tenant information from user login.",
};

export const GetConfigError: AadError = {
  name: "GetConfigError",
  message: (message: string) => message,
};

export const MissingPermissionsRequestProvider: AadError = {
  name: "MissingPermissionsRequestProvider",
  message: () => "permissionRequestProvider is missing in plugin context",
};

export const CheckPermissionError: AadError = {
  name: "CheckPermissionError",
  message: () => "Failed to check permission.",
};

export const GrantPermissionError: AadError = {
  name: "CheckPermissionError",
  message: (resource: string, id: string) => `${resource}: ${id}. Failed to grant permission.`,
};

export class ConfigErrorMessages {
  static readonly GetDisplayNameError = "Failed to get display name.";
  static readonly GetConfigError = (configName: string, plugin: string) =>
    `Failed to get configuration value "${configName}" for ${plugin}.`;
  static readonly FormatError = (type: string, value: string) =>
    `Invalid format for ${type}. Value: ${value}.`;
}

export class AppStudioErrorMessage {
  static readonly CreateFailed =
    "Failed to create an application registration in Azure Active Directory.";
  static readonly UpdateFailed =
    "Failed to update application registration in Azure Active Directory.";
  static readonly CreateSecretFailed =
    "Failed to create an application secret in Azure Active Directory.";
  static readonly GetFailed = "Failed to retrieve Azure Active Directory application registration.";

  static readonly AppDefinitionIsNull = "Missing application definition.";
  static readonly AppObjectIdIsNull = "Missing Object ID.";
  static readonly EmptyResponse = "Missing response.";
  static readonly ReachRetryLimit = "Exceeded retry limit.";
}

export class GraphClientErrorMessage {
  static readonly CreateFailed =
    "Failed to create an application registration in Azure Active Directory.";
  static readonly UpdateFailed =
    "Failed to update application registration in Azure Active Directory.";
  static readonly CreateSecretFailed =
    "Failed to create an application secret in Azure Active Directory.";
  static readonly GetFailed = "Failed to retrieve Azure Active Directory application registration.";
  static readonly CheckPermissionFailed = "Failed to check permission in Azure Active Directory.";
  static readonly GrantPermissionFailed = "Failed to grant permission in Azure Active Directory.";

  static readonly AppDefinitionIsNull = "Missing application definition.";
  static readonly AppObjectIdIsNull = "Missing Object ID.";
  static readonly EmptyResponse = "Missing response.";
  static readonly UserObjectIdIsNull = "Missing User's Object ID.";
}
