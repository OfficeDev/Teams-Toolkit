// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { PluginContext } from "@microsoft/teamsfx-api";
import { AppStudio } from "./appStudio";
import { ConfigKeys, Constants, Messages, Telemetry } from "./constants";
import { GraphErrorCodes } from "./errorCodes";
import {
  AppStudioErrorMessage,
  CreateSecretError,
  CreateAppError,
  UpdateAppIdUriError,
  UpdatePermissionError,
  UpdateRedirectUriError,
  GetAppError,
  GetAppConfigError,
  AadError,
  CheckPermissionError,
  GrantPermissionError,
} from "./errors";
import { GraphClient } from "./graph";
import { IAADPassword } from "./interfaces/IAADApplication";
import { IAADDefinition, RequiredResourceAccess } from "./interfaces/IAADDefinition";
import { ResultFactory } from "./results";
import { ProvisionConfig } from "./utils/configs";
import { TelemetryUtils } from "./utils/telemetry";
import { TokenAudience, TokenProvider } from "./utils/tokenProvider";

function delay(ms: number) {
  // tslint:disable-next-line no-string-based-set-timeout
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AadAppClient {
  public static async createAadApp(
    ctx: PluginContext,
    stage: string,
    config: ProvisionConfig
  ): Promise<void> {
    try {
      const provisionObject = AadAppClient.getAadAppProvisionObject(
        config.displayName as string,
        config.oauth2PermissionScopeId as string
      );
      let provisionAadResponse: IAADDefinition;
      if (TokenProvider.audience === TokenAudience.AppStudio) {
        provisionAadResponse = (await this.retryHanlder(ctx, stage, () =>
          AppStudio.createAADAppV2(TokenProvider.token as string, provisionObject)
        )) as IAADDefinition;
      } else {
        provisionAadResponse = (await this.retryHanlder(ctx, stage, () =>
          GraphClient.createAADApp(TokenProvider.token as string, provisionObject)
        )) as IAADDefinition;
      }

      config.clientId = provisionAadResponse.appId;
      config.objectId = provisionAadResponse.id;
    } catch (error) {
      throw AadAppClient.handleError(error, CreateAppError);
    }
  }

  public static async createAadAppSecret(
    ctx: PluginContext,
    stage: string,
    config: ProvisionConfig
  ): Promise<void> {
    try {
      let createSecretObject: IAADPassword;
      if (TokenProvider.audience === TokenAudience.AppStudio) {
        createSecretObject = (await AadAppClient.retryHanlder(ctx, stage, () =>
          AppStudio.createAADAppPassword(TokenProvider.token as string, config.objectId as string)
        )) as IAADPassword;
      } else {
        createSecretObject = (await AadAppClient.retryHanlder(ctx, stage, () =>
          GraphClient.createAadAppSecret(TokenProvider.token as string, config.objectId as string)
        )) as IAADPassword;
      }
      config.password = createSecretObject.value;
    } catch (error) {
      throw AadAppClient.handleError(error, CreateSecretError);
    }
  }

  public static async updateAadAppRedirectUri(
    ctx: PluginContext,
    stage: string,
    objectId: string,
    redirectUris: string[]
  ): Promise<void> {
    try {
      const updateRedirectUriObject = AadAppClient.getAadUrlObject(redirectUris);
      if (TokenProvider.audience === TokenAudience.AppStudio) {
        await AadAppClient.retryHanlder(ctx, stage, () =>
          AppStudio.updateAADApp(
            TokenProvider.token as string,
            objectId as string,
            updateRedirectUriObject
          )
        );
      } else {
        await AadAppClient.retryHanlder(ctx, stage, () =>
          GraphClient.updateAADApp(
            TokenProvider.token as string,
            objectId as string,
            updateRedirectUriObject
          )
        );
      }
    } catch (error) {
      throw AadAppClient.handleError(error, UpdateRedirectUriError);
    }
  }

  public static async updateAadAppIdUri(
    ctx: PluginContext,
    stage: string,
    objectId: string,
    applicationIdUri: string
  ): Promise<void> {
    try {
      const updateAppIdObject = AadAppClient.getAadApplicationIdObject(applicationIdUri);
      if (TokenProvider.audience === TokenAudience.AppStudio) {
        await AadAppClient.retryHanlder(ctx, stage, () =>
          AppStudio.updateAADApp(
            TokenProvider.token as string,
            objectId as string,
            updateAppIdObject
          )
        );
      } else {
        await AadAppClient.retryHanlder(ctx, stage, () =>
          GraphClient.updateAADApp(
            TokenProvider.token as string,
            objectId as string,
            updateAppIdObject
          )
        );
      }
    } catch (error) {
      throw AadAppClient.handleError(error, UpdateAppIdUriError);
    }
  }

  public static async updateAadAppPermission(
    ctx: PluginContext,
    stage: string,
    objectId: string,
    permissions: RequiredResourceAccess[]
  ): Promise<void> {
    try {
      const updatePermissionObject = AadAppClient.getAadPermissionObject(permissions);
      if (TokenProvider.audience === TokenAudience.AppStudio) {
        await AadAppClient.retryHanlder(ctx, stage, () =>
          AppStudio.updateAADApp(
            TokenProvider.token as string,
            objectId as string,
            updatePermissionObject
          )
        );
      } else {
        await AadAppClient.retryHanlder(ctx, stage, () =>
          GraphClient.updateAADApp(
            TokenProvider.token as string,
            objectId as string,
            updatePermissionObject
          )
        );
      }
    } catch (error) {
      throw AadAppClient.handleError(error, UpdatePermissionError);
    }
  }

  public static async getAadApp(
    ctx: PluginContext,
    stage: string,
    objectId: string,
    islocalDebug: boolean,
    clientSecret: string | undefined
  ): Promise<ProvisionConfig> {
    let getAppObject: IAADDefinition;
    try {
      if (TokenProvider.audience === TokenAudience.AppStudio) {
        getAppObject = (await this.retryHanlder(ctx, stage, () =>
          AppStudio.getAadApp(TokenProvider.token as string, objectId)
        )) as IAADDefinition;
      } else {
        getAppObject = (await this.retryHanlder(ctx, stage, () =>
          GraphClient.getAadApp(TokenProvider.token as string, objectId)
        )) as IAADDefinition;
      }
    } catch (error) {
      throw AadAppClient.handleError(error, GetAppError);
    }

    const config = new ProvisionConfig(islocalDebug);
    if (
      getAppObject.api?.oauth2PermissionScopes &&
      getAppObject.api?.oauth2PermissionScopes[0].id
    ) {
      config.oauth2PermissionScopeId = getAppObject.api?.oauth2PermissionScopes[0].id;
    } else {
      throw ResultFactory.UserError(
        GetAppConfigError.name,
        GetAppConfigError.message(ConfigKeys.oauth2PermissionScopeId)
      );
    }
    config.objectId = objectId;
    config.clientId = getAppObject.appId;
    config.password = clientSecret;
    return config;
  }

  public static async checkPermission(
    ctx: PluginContext,
    stage: string,
    objectId: string,
    userObjectId: string
  ): Promise<boolean> {
    try {
      return (await this.retryHanlder(ctx, stage, () =>
        GraphClient.checkPermission(TokenProvider.token as string, objectId, userObjectId)
      )) as boolean;
    } catch (error) {
      // TODO: Give out detailed help message for different errors.
      throw AadAppClient.handleError(error, CheckPermissionError);
    }
  }

  public static async grantPermission(
    ctx: PluginContext,
    stage: string,
    objectId: string,
    userObjectId: string
  ): Promise<void> {
    try {
      await GraphClient.grantPermission(TokenProvider.token as string, objectId, userObjectId);
    } catch (error) {
      if (error?.response?.data?.error.message == Constants.createOwnerDuplicatedMessage) {
        ctx.logProvider?.info(Messages.OwnerAlreadyAdded(userObjectId, objectId));
        return;
      }

      // TODO: Give out detailed help message for different errors.
      throw AadAppClient.handleError(
        error,
        GrantPermissionError,
        Constants.permissions.name,
        objectId
      );
    }
  }

  public static async retryHanlder(
    ctx: PluginContext,
    stage: string,
    fn: () => Promise<IAADDefinition | IAADPassword | void | boolean>
  ): Promise<IAADDefinition | IAADPassword | undefined | void | boolean> {
    let retries = Constants.maxRetryTimes;
    let response;
    TelemetryUtils.init(ctx);
    while (retries > 0) {
      retries = retries - 1;

      try {
        response = await fn();
        TelemetryUtils.sendEvent(stage, {
          [Telemetry.methodName]: fn.toString(),
          [Telemetry.retryTimes]: (Constants.maxRetryTimes - retries - 1).toString(),
        });
        return response;
      } catch (error) {
        if (retries === 0) {
          throw error;
        } else {
          await delay(5000);
        }
      }
    }

    throw new Error(AppStudioErrorMessage.ReachRetryLimit);
  }

  private static getAadAppProvisionObject(
    displayName: string,
    oauth2PermissionScopeId: string
  ): IAADDefinition {
    return {
      displayName: displayName,
      signInAudience: "AzureADMyOrg",
      api: {
        requestedAccessTokenVersion: 2,
        oauth2PermissionScopes: [
          {
            adminConsentDescription: "Allows Teams to call the app’s web APIs as the current user.",
            adminConsentDisplayName: "Teams can access app’s web APIs",
            id: oauth2PermissionScopeId,
            isEnabled: true,
            type: "User",
            userConsentDescription:
              "Enable Teams to call this app’s web APIs with the same rights that you have",
            userConsentDisplayName:
              "Teams can access app’s web APIs and make requests on your behalf",
            value: "access_as_user",
          },
        ],
        preAuthorizedApplications: [
          {
            appId: Constants.teamsWebAppId,
            delegatedPermissionIds: [oauth2PermissionScopeId],
          },
          {
            appId: Constants.teamsMobileDesktopAppId,
            delegatedPermissionIds: [oauth2PermissionScopeId],
          },
        ],
      },
      optionalClaims: {
        accessToken: [
          {
            name: "idtyp",
            essential: false,
            additionalProperties: [],
          },
        ],
      },
    };
  }

  private static handleError(error: any, errorDetail: AadError, ...args: string[]): FxError {
    if (
      error?.response?.status >= Constants.statusCodeUserError &&
      error?.response?.status < Constants.statusCodeServerError
    ) {
      // User Error
      // If known error code, will update help link.
      const errorCode = error?.response?.data?.error?.code;
      const helpLink = GraphErrorCodes.get(errorCode);
      return ResultFactory.UserError(
        errorDetail.name,
        errorDetail.message(...args),
        error,
        undefined,
        helpLink ?? errorDetail.helpLink
      );
    } else {
      // System Error
      return ResultFactory.SystemError(errorDetail.name, errorDetail.message(...args), error);
    }
  }

  private static getAadUrlObject(redirectUris: string[]): IAADDefinition {
    return {
      web: {
        redirectUris: redirectUris,
      },
    };
  }

  private static getAadApplicationIdObject(applicationIdUri: string): IAADDefinition {
    return {
      identifierUris: [applicationIdUri],
    };
  }

  private static getAadPermissionObject(permissions: RequiredResourceAccess[]): IAADDefinition {
    return {
      requiredResourceAccess: permissions,
    };
  }
}
