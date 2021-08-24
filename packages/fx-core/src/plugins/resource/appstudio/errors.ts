// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Constants } from "./constants";

export class AppStudioError {
  public static readonly FileNotFoundError = {
    name: "FileNotFoundError",
    message: (filePath: string) => `File ${filePath} not found.`,
  };

  public static readonly NotADirectoryError = {
    name: "NotADirectory",
    message: (directoryPath: string) => `${directoryPath} is not a directory.`,
  };

  public static readonly ParamUndefinedError = {
    name: "ParamUndefined",
    message: (param: string) => `${param} is undefined.`,
  };

  public static readonly RemoteAppIdCreateFailedError = {
    name: "RemoteAppIdCreateFailed",
    message: (error?: any) =>
      `Failed to create teams app id in app studio, due to ${error?.name}, ${error?.message}`,
  };

  public static readonly RemoteAppIdUpdateFailedError = {
    name: "RemoteAppIdUpdateFailed",
    message: (error?: any) =>
      `Failed to update app id in app studio due to ${error?.name}: ${error?.message}.`,
  };

  public static readonly LocalAppIdCreateFailedError = {
    name: "LocalAppIdCreateFailed",
    message: (error?: any) =>
      `Failed to create localDebug teams app id in app studio, due to ${error?.name}, ${error?.message}`,
  };

  public static readonly LocalAppIdUpdateFailedError = {
    name: "LocalAppIdUpdateFailed",
    message: (error?: any) =>
      `Failed to update local app id in app studio due to ${error?.name}: ${error?.message}.`,
  };

  public static readonly AppStudioTokenGetFailedError = {
    name: "AppStudioTokenGetFailed",
    message: "Failed to get app studio token.",
  };

  public static readonly ManifestLoadFailedError = {
    name: "ManifestLoadFailed",
    message: (error: string) => `Failed to read manifest file. Error: ${error}.`,
  };

  public static readonly ValidationFailedError = {
    name: "ManifestValidationFailed",
    message: (errors: string[]) => `Validation error: \n ${errors.join("\n")}`,
  };

  public static readonly GetLocalDebugConfigFailedError = {
    name: "GetLocalDebugConfigFailed",
    message: (domain: string, doProvision: boolean) =>
      `Missing configuration data for manifest. ${
        doProvision ? "Run 'provision' first." : ""
      } Data required: ${domain}.`,
  };

  public static readonly GetRemoteConfigFailedError = {
    name: "GetRemoteConfigFailed",
    message: (domain: string, doProvision: boolean) =>
      `Missing configuration data for manifest. ${
        doProvision ? "Run 'provision' first." : ""
      } Data required: ${domain}.`,
  };

  public static readonly InvalidLocalDebugConfigurationDataError = {
    name: "InvalidLocalDebugConfigurationData",
    message: (endpoint: string, tabEndpoint: string, domain: string, tabDomain: string) =>
      `Invalid configuration data for manifest: ${endpoint}=${tabEndpoint}, ${domain}=${tabDomain}.`,
  };

  public static readonly InvalidRemoteConfigurationDataError = {
    name: "InvalidRemoteConfigurationData",
    message: (endpoint: string, tabEndpoint: string, domain: string, tabDomain: string) =>
      `Invalid configuration data for manifest: ${endpoint}=${tabEndpoint}, ${domain}=${tabDomain}.`,
  };

  public static readonly InternalError = {
    name: "InternalError",
    message: "Select either Bot or Messaging Extension.",
  };

  public static readonly TeamsAppUpdateFailedError = {
    name: "TeamsAppUpdateFailed",
    message: (teamsAppId: string) => `Failed to update Teams app with ID ${teamsAppId}.`,
  };

  public static readonly TeamsAppUpdateIDNotMatchError = {
    name: "TeamsAppUpdateIDNotMatch",
    message: (oldTeamsAppId: string, newTeamsAppId?: string) =>
      `Teams App ID mismatch. Input: ${oldTeamsAppId}. Got: ${newTeamsAppId}.`,
  };

  public static readonly TeamsAppPublishFailedError = {
    name: "TeamsAppPublishFailed",
    message: (teamsAppId: string) => `Failed to publish Teams app with ID ${teamsAppId}.`,
  };

  public static readonly TeamsAppPublishCancelError = {
    name: "TeamsAppPublishCancelled",
    message: (name: string) => `Publish Teams app with ID ${name} has been cancelled.`,
  };

  public static readonly TeamsPackageBuildError = {
    name: "TeamsPackageBuildError",
    message: (error: any) => (error.message ? error.message : "Teams Package built failed!"),
  };

  public static readonly GetRemoteConfigError = {
    name: "GetRemoteConfigError",
    message: (error: string) =>
      `${error}. You must run 'Provision in the Cloud' first to fill out certain fields in manifest.`,
  };

  public static readonly UnhandledError = {
    name: "UnhandledError",
    message: "UnhandledError",
  };

  public static readonly PluginNotFound = {
    name: "PluginNotFound",
    message: (name: string) => `Plugin name ${name} is not valid`,
  };

  public static readonly ScaffoldFailedError = {
    name: "ScaffoldFailed",
    message: (error: any) => (error.message ? error.message : "Teams app scaffold failed!"),
  };

  public static readonly MigrateV1ProjectFailedError = {
    name: "MigrateV1ProjectFailed",
    message: (error: any) =>
      error.message ? error.message : "Migrate Teams Toolkit V1 project failed!",
  };
  
  public static readonly CheckPermissionFailedError = {
    name: "CheckPermissionFailed",
    message: (error: any) => `Check permission failed. Reason: ${error.message}`,
  };

  public static readonly GrantPermissionFailedError = {
    name: "GrantPermissionFailed",
    message: (errorMessage: string, id?: string) =>
      `${Constants.PERMISSIONS.name}: ${id}. Grant permission failed. Reason: ${errorMessage}`,
  };
}
