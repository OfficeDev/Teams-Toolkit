// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import { SystemError } from "@microsoft/teamsfx-api";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { getResourceServiceEndpoint, HelpLinks, ResourceServiceType } from "../common/constants";
import { ErrorContextMW, TOOLS } from "../common/globalVars";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import { RetryHandler } from "../common/retryHandler";
import * as telemetry from "../common/telemetry";
import { WrappedAxiosClient } from "../common/wrappedAxiosClient";
import { HttpStatusCode } from "../component/constant/commonConstant";
import { SignInAudienceNotAllowedError } from "../component/driver/aad/error/signInAudienceNotAllowedError";
import { AADApplication } from "../component/driver/aad/interface/AADApplication";
import { SignInAudience } from "../component/driver/aad/interface/signInAudience";
import { aadErrorCode } from "../component/driver/aad/utility/constants";
import {
  APP_STUDIO_API_NAMES,
  Constants,
  ErrorMessages,
} from "../component/driver/teamsApp/constants";
import { AppStudioError } from "../component/driver/teamsApp/errors";
import {
  ApiSecretRegistration,
  ApiSecretRegistrationUpdate,
} from "../component/driver/teamsApp/interfaces/ApiSecretRegistration";
import { AsyncAppValidationDetailsResponse } from "../component/driver/teamsApp/interfaces/AsyncAppValidationDetailsResponse";
import { AsyncAppValidationResponse } from "../component/driver/teamsApp/interfaces/AsyncAppValidationResponse";
import { AsyncAppValidationResultsResponse } from "../component/driver/teamsApp/interfaces/AsyncAppValidationResultsResponse";
import { OauthConfigurationId } from "../component/driver/teamsApp/interfaces/OauthConfigurationId";
import { OauthRegistration } from "../component/driver/teamsApp/interfaces/OauthRegistration";
import { IPublishingAppDenition } from "../component/driver/teamsApp/interfaces/appdefinitions/IPublishingAppDefinition";
import { IValidationResult } from "../component/driver/teamsApp/interfaces/appdefinitions/IValidationResult";
import { AppDefinition } from "../component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { AppUser } from "../component/driver/teamsApp/interfaces/appdefinitions/appUser";
import { manifestUtils } from "../component/driver/teamsApp/utils/ManifestUtils";
import {
  BotChannelType,
  IBotRegistration,
} from "../component/resource/botService/appStudio/interfaces/IBotRegistration";
import { isHappyResponse } from "../component/resource/botService/common";
import { TeamsFxUrlNames } from "../component/resource/botService/constants";
import {
  BotFrameworkConflictResultError,
  BotFrameworkForbiddenResultError,
  BotFrameworkNotAllowedToAcquireTokenError,
  BotRegistrationNotFoundError,
  ConfigUpdatingError,
  ProvisionError,
} from "../component/resource/botService/errors";
import { Messages } from "../component/resource/botService/messages";
import { CommonStrings, ConfigNames } from "../component/resource/botService/strings";
import {
  CheckSideloadingPermissionFailedError,
  DeveloperPortalAPIFailedSystemError,
  DeveloperPortalAPIFailedUserError,
} from "../error/teamsApp";
import { IAADDefinition } from "./interfaces/aad/IAADDefinition";

export class TeamsDevPortalClient {
  regionEndpoint?: string;

  setRegionEndpoint(regionEndpoint: string): void {
    this.regionEndpoint = regionEndpoint;
  }

  async setRegionEndpointByToken(authSvcToken: string): Promise<void> {
    if (
      getResourceServiceEndpoint(ResourceServiceType.TDP) === "https://dev-int.teams.microsoft.com"
    ) {
      // Do not set region for INT env
      return;
    }
    const requester = WrappedAxiosClient.create({
      baseURL: getResourceServiceEndpoint(ResourceServiceType.AuthSvc),
    });
    requester.defaults.headers.common["Authorization"] = `Bearer ${authSvcToken}`;
    requester.defaults.headers.common["Client-Source"] = "teamstoolkit";
    const response = await RetryHandler.Retry(() => requester.post("/v1.0/users/region"));
    this.regionEndpoint = response?.data?.regionGtms?.teamsDevPortal as string;
  }

  getEndpoint(): string {
    return this.regionEndpoint || getResourceServiceEndpoint(ResourceServiceType.TDP);
  }

  /**
   * Creates a new axios instance to call app studio to prevent setting the accessToken on global instance.
   * @param {string}  token
   * @returns {AxiosInstance}
   */
  createRequesterWithToken(token: string): AxiosInstance {
    const instance = WrappedAxiosClient.create({
      baseURL: this.getEndpoint(),
    });
    instance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    instance.defaults.headers.common["Client-Source"] = "teamstoolkit";
    return instance;
  }

  /**
   * Import an app registration in app studio with the given archived file and returns the app definition.
   * @param {string}  token - access token
   * @param {Buffer}  file - Zip file with manifest.json and two icons
   * @param {boolean} overwrite - whether to overrite the app if it already exists
   * @returns {Promise<AppDefinition>}
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async importApp(token: string, file: Buffer, overwrite = false): Promise<AppDefinition> {
    try {
      const requester = this.createRequesterWithToken(token);
      TOOLS.logProvider.debug(
        `Sent API Request: ${this.getEndpoint()}/api/appdefinitions/v2/import`
      );
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/appdefinitions/v2/import`, file, {
          headers: { "Content-Type": "application/zip" },
          params: {
            overwriteIfAppAlreadyExists: overwrite,
          },
        })
      );

      if (response && response.data) {
        const app = <AppDefinition>response.data;
        TOOLS.logProvider.debug(`Received data from Developer Portal: ${JSON.stringify(app)}`);
        return app;
      } else {
        throw this.wrapException(
          new Error("cannot create teams app"),
          APP_STUDIO_API_NAMES.CREATE_APP
        );
      }
    } catch (e: any) {
      if (e.response?.status === 409) {
        throw this.wrapException(
          e,
          APP_STUDIO_API_NAMES.CREATE_APP,
          AppStudioError.TeamsAppCreateConflictError.name,
          AppStudioError.TeamsAppCreateConflictError.message()[0],
          AppStudioError.TeamsAppCreateConflictError.message()[1],
          true,
          HelpLinks.SwitchTenant
        );
      }
      // Corner case: The provided app ID conflict with an existing published app
      // See Developer Portal PR: 507264
      if (
        e.response?.status == 422 &&
        e.response?.data.includes("App already exists and published")
      ) {
        throw this.wrapException(
          e,
          APP_STUDIO_API_NAMES.CREATE_APP,
          AppStudioError.TeamsAppCreateConflictWithPublishedAppError.name,
          AppStudioError.TeamsAppCreateConflictWithPublishedAppError.message()[0],
          AppStudioError.TeamsAppCreateConflictWithPublishedAppError.message()[1],
          true
        );
      }
      // Corner case: App Id must be a GUID
      if (
        e.response?.status === HttpStatusCode.BAD_REQUEST &&
        e.response?.data.includes("App Id must be a GUID")
      ) {
        const manifest = manifestUtils.extractManifestFromArchivedFile(file);
        if (manifest.isErr()) {
          throw manifest.error;
        } else {
          const teamsAppId = manifest.value.id;
          throw this.wrapException(
            e,
            APP_STUDIO_API_NAMES.CREATE_APP,
            AppStudioError.InvalidTeamsAppIdError.name,
            AppStudioError.InvalidTeamsAppIdError.message(teamsAppId)[0],
            AppStudioError.InvalidTeamsAppIdError.message(teamsAppId)[1],
            true
          );
        }
      }
      throw this.wrapException(e, APP_STUDIO_API_NAMES.CREATE_APP);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async listApps(token: string): Promise<AppDefinition[]> {
    if (!this.regionEndpoint) throw new Error("Failed to get region");
    let requester: AxiosInstance;
    try {
      requester = this.createRequesterWithToken(token);
      TOOLS.logProvider.debug(`Sent API Request: GET ${this.regionEndpoint}/api/appdefinitions`);
      const response = await RetryHandler.Retry(() => requester.get(`/api/appdefinitions`));
      const apps = <AppDefinition[]>response?.data;
      if (apps) {
        return apps;
      } else {
        TOOLS.logProvider.error("Cannot get the app definitions");
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.LIST_APPS);
    }
    throw this.wrapException(
      new Error("cannot get the app definitions"),
      APP_STUDIO_API_NAMES.LIST_APPS
    );
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async deleteApp(appStudioToken: string, teamsAppId: string): Promise<boolean> {
    if (!this.regionEndpoint) throw new Error("Failed to get region");
    let requester: AxiosInstance;
    try {
      requester = this.createRequesterWithToken(appStudioToken);
      TOOLS.logProvider.debug(
        `Sent API Request: DELETE ${this.getEndpoint()}/api/appdefinitions/${teamsAppId}`
      );
      const response = await RetryHandler.Retry(() =>
        requester.delete(`/api/appdefinitions/${teamsAppId}`)
      );
      if (response && response.data) {
        const success = <boolean>response.data;
        if (success) {
          return success;
        } else {
          TOOLS.logProvider?.error("Cannot get the app definitions");
        }
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.DELETE_APP);
    }
    throw this.wrapException(
      new Error("cannot delete the app: " + teamsAppId),
      APP_STUDIO_API_NAMES.DELETE_APP
    );
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getApp(token: string, teamsAppId: string): Promise<AppDefinition> {
    let requester: AxiosInstance;
    try {
      requester = this.createRequesterWithToken(token);
      TOOLS.logProvider.debug(
        `Sent API Request: GET ${this.getEndpoint()}/api/appdefinitions/${teamsAppId}`
      );
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/appdefinitions/${teamsAppId}`)
      );
      if (response && response.data) {
        const app = <AppDefinition>response.data;
        if (app && app.teamsAppId && app.teamsAppId === teamsAppId) {
          return app;
        } else {
          TOOLS.logProvider?.error(
            `teamsAppId mismatch. Input: ${teamsAppId}. Got: ${app.teamsAppId as string}`
          );
        }
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_APP);
    }
    throw this.wrapException(
      new Error(`cannot get the app definition with app ID ${teamsAppId}`),
      APP_STUDIO_API_NAMES.GET_APP
    );
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getBotId(token: string, teamsAppId: string): Promise<string | undefined> {
    const app = await this.getApp(token, teamsAppId);
    if (app?.bots?.length && app.bots.length > 0) {
      return app.bots[0].botId;
    }
    TOOLS.logProvider?.error(`botId not found. Input: ${teamsAppId}`);
    return undefined;
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getAppPackage(token: string, teamsAppId: string): Promise<any> {
    TOOLS.logProvider?.info("Downloading app package for app " + teamsAppId);
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/appdefinitions/${teamsAppId}/manifest`)
      );

      if (response && response.data) {
        TOOLS.logProvider?.info("Download app package successfully");
        return response.data;
      } else {
        throw this.wrapException(
          new Error(getLocalizedString("plugins.appstudio.emptyAppPackage", teamsAppId)),
          APP_STUDIO_API_NAMES.GET_APP_PACKAGE
        );
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_APP_PACKAGE);
    }
  }

  /**
   * Check if app exists in the user's organization by the Teams app id
   * @param teamsAppId
   * @param token
   * @param logProvider
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async checkExistsInTenant(token: string, teamsAppId: string): Promise<boolean> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/appdefinitions/manifest/${teamsAppId}`)
      );
      if (response && response.data) {
        return <boolean>response.data;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  }

  /**
   * Publish Teams app to Teams App Catalog
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async publishTeamsApp(token: string, teamsAppId: string, file: Buffer): Promise<string> {
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post("/api/publishing", file, {
          headers: { "Content-Type": "application/zip" },
        })
      );
      if (response && response.data) {
        if (response.data.error) {
          // To avoid App Studio BadGateway error
          // The app is actually published to app catalog.
          if (response.data.error.code === "BadGateway") {
            const appDefinition = await this.getStaggedApp(token, teamsAppId);
            if (appDefinition) {
              return appDefinition.teamsAppId;
            }
          }

          // Corner case
          // Fail if an app with the same external.id exists in the staged app entitlements
          // App with same id already exists in the staged apps, Invoke UpdateAPI instead.
          if (
            response.data.error.code == "Conflict" &&
            response.data.error.innerError?.code == "AppDefinitionAlreadyExists"
          ) {
            try {
              return await this.publishTeamsAppUpdate(token, teamsAppId, file);
            } catch (e: any) {
              if (e instanceof DeveloperPortalAPIFailedSystemError) {
                throw this.wrapException(
                  this.wrapResponse(undefined, response),
                  APP_STUDIO_API_NAMES.PUBLISH_APP,
                  AppStudioError.TeamsAppPublishConflictError.name,
                  AppStudioError.TeamsAppPublishConflictError.message(teamsAppId)[0],
                  AppStudioError.TeamsAppPublishConflictError.message(teamsAppId)[1]
                );
              } else {
                throw e;
              }
            }
          }
          throw this.wrapException(
            this.wrapResponse(undefined, response),
            APP_STUDIO_API_NAMES.PUBLISH_APP
          );
        } else {
          return response.data.id;
        }
      } else {
        throw this.wrapException(
          this.wrapResponse(new Error("empty response"), response),
          APP_STUDIO_API_NAMES.PUBLISH_APP,
          AppStudioError.TeamsAppPublishFailedError.name,
          AppStudioError.TeamsAppPublishFailedError.message(teamsAppId, "POST /api/publishing")[0],
          AppStudioError.TeamsAppPublishFailedError.message(teamsAppId, "POST /api/publishing")[1]
        );
      }
    } catch (e: any) {
      if (e instanceof SystemError) {
        throw e;
      } else {
        throw this.wrapException(e, APP_STUDIO_API_NAMES.PUBLISH_APP);
      }
    }
  }
  /**
   * Update existed publish request
   * @param teamsAppId
   * @param file
   * @param token
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async publishTeamsAppUpdate(token: string, teamsAppId: string, file: Buffer): Promise<string> {
    try {
      // Get App Definition from Teams App Catalog
      const appDefinition = await this.getStaggedApp(token, teamsAppId);

      const requester = this.createRequesterWithToken(token);
      let response = null;
      if (appDefinition) {
        // update the existing app
        response = await RetryHandler.Retry(() =>
          requester.post(`/api/publishing/${appDefinition.teamsAppId}/appdefinitions`, file, {
            headers: { "Content-Type": "application/zip" },
          })
        );
      } else {
        throw this.wrapException(
          new Error("API failed"),
          APP_STUDIO_API_NAMES.GET_PUBLISHED_APP,
          AppStudioError.TeamsAppPublishFailedError.name,
          AppStudioError.TeamsAppPublishFailedError.message(
            teamsAppId,
            `GET /api/publishing/${teamsAppId}`
          )[0],
          AppStudioError.TeamsAppPublishFailedError.message(
            teamsAppId,
            `GET /api/publishing/${teamsAppId}`
          )[1]
        );
      }

      const requestPath = `${response?.request?.method} ${response?.request?.path}`;
      if (response && response.data) {
        if (response.data.error || response.data.errorMessage) {
          throw this.wrapException(
            this.wrapResponse(undefined, response),
            APP_STUDIO_API_NAMES.UPDATE_PUBLISHED_APP
          );
        } else {
          return response.data.teamsAppId;
        }
      } else {
        throw this.wrapException(
          new Error("empty response"),
          APP_STUDIO_API_NAMES.UPDATE_PUBLISHED_APP,
          AppStudioError.TeamsAppPublishFailedError.name,
          AppStudioError.TeamsAppPublishFailedError.message(teamsAppId, requestPath)[0],
          AppStudioError.TeamsAppPublishFailedError.message(teamsAppId, requestPath)[1]
        );
      }
    } catch (error: any) {
      if (error instanceof DeveloperPortalAPIFailedSystemError) {
        throw error;
      } else {
        throw this.wrapException(error, APP_STUDIO_API_NAMES.UPDATE_PUBLISHED_APP);
      }
    }
  }
  /**
   * Get Stagged Teams app from tenant app catalog
   * @param teamsAppId manifest.id, which is externalId in app catalog.
   * @param token
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getStaggedApp(
    token: string,
    teamsAppId: string
  ): Promise<IPublishingAppDenition | undefined> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/publishing/${teamsAppId}`)
      );
      if (response && response.data && response.data.value && response.data.value.length > 0) {
        const appdefinitions: IPublishingAppDenition[] = response.data.value[0].appDefinitions.map(
          (item: any) => {
            return {
              lastModifiedDateTime: item.lastModifiedDateTime
                ? new Date(item.lastModifiedDateTime)
                : null,
              publishingState: item.publishingState,
              teamsAppId: item.teamsAppId,
              displayName: item.displayName,
            };
          }
        );
        return appdefinitions[appdefinitions.length - 1];
      } else {
        return undefined;
      }
    } catch (e: any) {
      return undefined;
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getUserList(token: string, teamsAppId: string): Promise<AppUser[] | undefined> {
    const app = await this.getApp(token, teamsAppId);
    return app.userList;
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async checkPermission(token: string, teamsAppId: string, userObjectId: string): Promise<string> {
    let userList;
    try {
      userList = await this.getUserList(token, teamsAppId);
    } catch (error) {
      return Constants.PERMISSIONS.noPermission;
    }

    const findUser = userList?.find((user: AppUser) => user.aadId === userObjectId);
    if (!findUser) {
      return Constants.PERMISSIONS.noPermission;
    }

    if (findUser.isAdministrator) {
      return Constants.PERMISSIONS.admin;
    } else {
      return Constants.PERMISSIONS.operative;
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async removePermission(token: string, teamsAppId: string, userToRemove: AppUser): Promise<void> {
    const app = await this.getApp(token, teamsAppId);
    if (!this.checkUser(app, userToRemove)) {
      return;
    }
    app.userList = app.userList?.filter((user: AppUser) => user["aadId"] !== userToRemove.aadId);
    let requester: AxiosInstance;
    try {
      TOOLS.logProvider.debug(
        getLocalizedString(
          "core.common.SendingApiRequest",
          `${this.getEndpoint()}/api/appdefinitions/{teamsAppId}/owner`,
          JSON.stringify(app)
        )
      );
      requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/appdefinitions/${teamsAppId}/owner`, app)
      );
      TOOLS.logProvider.debug(
        getLocalizedString("core.common.ReceiveApiResponse", JSON.stringify(response?.data))
      );
      if (
        !response ||
        !response.data ||
        this.checkUser(response.data as AppDefinition, userToRemove)
      ) {
        throw new Error("Response is empty or user is not removed.");
      }
    } catch (err) {
      throw this.wrapException(err, APP_STUDIO_API_NAMES.UPDATE_OWNER);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async grantPermission(token: string, teamsAppId: string, newUser: AppUser): Promise<void> {
    const app = await this.getApp(token, teamsAppId);
    if (this.checkUser(app, newUser)) {
      return;
    }
    app.userList?.push(newUser);
    let requester: AxiosInstance;
    try {
      TOOLS.logProvider.debug(
        getLocalizedString(
          "core.common.SendingApiRequest",
          `${this.getEndpoint()}/api/appdefinitions/{teamsAppId}/owner`,
          JSON.stringify(app)
        )
      );
      requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/appdefinitions/${teamsAppId}/owner`, app)
      );
      TOOLS.logProvider.debug(
        getLocalizedString("core.common.ReceiveApiResponse", JSON.stringify(response?.data))
      );
      if (!response || !response.data || !this.checkUser(response.data as AppDefinition, newUser)) {
        throw new Error(ErrorMessages.GrantPermissionFailed);
      }
    } catch (err) {
      throw this.wrapException(err, APP_STUDIO_API_NAMES.UPDATE_OWNER);
    }
  }
  /**
   * Send the app package for partner center validation
   * @param file
   * @param token
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async partnerCenterAppPackageValidation(token: string, file: Buffer): Promise<IValidationResult> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/api/appdefinitions/partnerCenterAppPackageValidation", file, {
          headers: { "Content-Type": "application/zip" },
        })
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.VALIDATE_APP_PACKAGE);
    }
  }

  checkUser(app: AppDefinition, newUser: AppUser): boolean {
    const findUser = app.userList?.findIndex((user: AppUser) => user["aadId"] === newUser.aadId);
    if (findUser != undefined && findUser >= 0) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Submit App Validation Request (In-App) for which App Definitions are stored at TDP.
   * @param teamsAppId
   * @param token
   * @param timeoutSeconds
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async submitAppValidationRequest(
    token: string,
    teamsAppId: string
  ): Promise<AsyncAppValidationResponse> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/v1.0/appvalidations/appdefinition/validate`, {
          AppEnvironmentId: null,
          appDefinitionId: teamsAppId,
        })
      );
      return <AsyncAppValidationResponse>response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.SUBMIT_APP_VALIDATION);
    }
  }

  /**
   * Get App validation requests sumitted by the user
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getAppValidationRequestList(
    token: string,
    teamsAppId: string
  ): Promise<AsyncAppValidationDetailsResponse> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/v1.0/appvalidations/appdefinitions/${teamsAppId}`)
      );
      return <AsyncAppValidationDetailsResponse>response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_APP_VALIDATION_REQUESTS);
    }
  }
  /**
   * Get App validation results by provided app validation id
   * @param appValidationId
   * @param token
   * @param timeoutSeconds
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getAppValidationById(
    token: string,
    appValidationId: string
  ): Promise<AsyncAppValidationResultsResponse> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/v1.0/appvalidations/${appValidationId}`)
      );
      return <AsyncAppValidationResultsResponse>response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_APP_VALIDATION_RESULT);
    }
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getSideloadingStatus(token: string): Promise<boolean | undefined> {
    const apiName = "<check-sideloading-status>";
    const apiPath = "/api/usersettings/mtUserAppPolicy";
    const requester = this.createRequesterWithToken(token);

    let response = undefined;
    try {
      response = (await RetryHandler.Retry(() => requester.get(apiPath))) as any;
      let result: boolean | undefined;
      if (response.status >= 400) {
        result = undefined;
      } else {
        result = response.data?.value?.isSideloadingAllowed as boolean;
      }

      if (result !== undefined) {
        telemetry.sendTelemetryEvent(
          "TeamsDevPortalClient",
          telemetry.TelemetryEvent.CheckSideloading,
          {
            [telemetry.TelemetryProperty.IsSideloadingAllowed]: result.toString() + "",
          }
        );
      } else {
        telemetry.sendTelemetryErrorEvent(
          "TeamsDevPortalClient",
          telemetry.TelemetryEvent.CheckSideloading,
          new SystemError(
            "M365Account",
            "UnknownValue",

            `AppStudio response code: ${response.status}, body: ${response.data}`
          ),
          {
            [telemetry.TelemetryProperty.CheckSideloadingStatusCode]: `${
              response.status as string
            }`,
            [telemetry.TelemetryProperty.CheckSideloadingMethod]: "get",
            [telemetry.TelemetryProperty.CheckSideloadingUrl]: apiName,
          }
        );
      }

      return result;
    } catch (error: any) {
      telemetry.sendTelemetryErrorEvent(
        "TeamsDevPortalClient",
        telemetry.TelemetryEvent.CheckSideloading,
        new CheckSideloadingPermissionFailedError(
          error,
          error.response?.headers?.[Constants.CORRELATION_ID] ?? "",
          apiName,
          getDefaultString(
            "error.appstudio.apiFailed.reason.common",
            error.response?.data ? `data: ${JSON.stringify(error.response.data)}` : ""
          )
        ),
        {
          [telemetry.TelemetryProperty.CheckSideloadingStatusCode]: `${error?.response?.status}`,
          [telemetry.TelemetryProperty.CheckSideloadingMethod]: "get",
          [telemetry.TelemetryProperty.CheckSideloadingUrl]: apiName,
        }
      );
    }
    return undefined;
  }

  /**
   * Create the Api Key registration.
   * @param token
   * @param apiKeyRegistration
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async createApiKeyRegistration(
    token: string,
    apiKeyRegistration: ApiSecretRegistration
  ): Promise<ApiSecretRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/api/v1.0/apiSecretRegistrations", apiKeyRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.CREATE_API_KEY);
    }
  }

  /**
   * Get the Api Key registration by Id.
   * @param token
   * @param apiSecretRegistrationId
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getApiKeyRegistrationById(
    token: string,
    apiSecretRegistrationId: string
  ): Promise<ApiSecretRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/v1.0/apiSecretRegistrations/${apiSecretRegistrationId}`)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_API_KEY);
    }
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async updateApiKeyRegistration(
    token: string,
    apiKeyRegistration: ApiSecretRegistrationUpdate,
    apiKeyRegistrationId: string
  ): Promise<ApiSecretRegistrationUpdate> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.patch(
          `/api/v1.0/apiSecretRegistrations/${apiKeyRegistrationId}`,
          apiKeyRegistration
        )
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.UPDATE_API_KEY);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getOauthRegistrationById(
    token: string,
    oauthRegistrationId: string
  ): Promise<OauthRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/api/v1.0/oAuthConfigurations/${oauthRegistrationId}`)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_OAUTH);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async createOauthRegistration(
    token: string,
    oauthRegistration: OauthRegistration
  ): Promise<OauthConfigurationId> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/api/v1.0/oAuthConfigurations", oauthRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.CREATE_OAUTH);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async updateOauthRegistration(
    token: string,
    oauthRegistration: OauthRegistration,
    oauthRegistrationId: string
  ): Promise<OauthRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.patch(`/api/v1.0/oAuthConfigurations/${oauthRegistrationId}`, oauthRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.UPDATE_OAUTH);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getBotRegistration(token: string, botId: string): Promise<IBotRegistration | undefined> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() => requester.get(`/api/botframework/${botId}`));
      if (isHappyResponse(response)) {
        return <IBotRegistration>response!.data; // response cannot be undefined as it's checked in isHappyResponse.
      } else {
        // Defensive code and it should never reach here.
        throw this.wrapException(
          this.wrapResponse(undefined, response),
          APP_STUDIO_API_NAMES.GET_BOT,
          getDefaultString("error.appstudio.apiFailed.name.common"),
          "Failed to get data"
        );
      }
    } catch (e) {
      this.handleBotFrameworkError(e, APP_STUDIO_API_NAMES.GET_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async listBots(token: string): Promise<IBotRegistration[] | undefined> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() => requester.get("/api/botframework"));
      if (isHappyResponse(response)) {
        return <IBotRegistration[]>response!.data; // response cannot be undefined as it's checked in isHappyResponse.
      } else {
        // Defensive code and it should never reach here.
        throw this.wrapException(
          this.wrapResponse(undefined, response),
          APP_STUDIO_API_NAMES.LIST_BOT,
          getDefaultString("error.appstudio.apiFailed.name.common"),
          "Failed to get data"
        );
      }
    } catch (e) {
      this.handleBotFrameworkError(e, APP_STUDIO_API_NAMES.LIST_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async deleteBot(token: string, botId: string): Promise<void> {
    const requester = this.createRequesterWithToken(token);
    try {
      await RetryHandler.Retry(() => requester.delete(`/api/botframework/${botId}`));
    } catch (e) {
      this.handleBotFrameworkError(e, APP_STUDIO_API_NAMES.DELETE_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async createBotRegistration(
    token: string,
    registration: IBotRegistration,
    checkExistence = true
  ): Promise<void> {
    if (registration.botId && checkExistence) {
      const botReg = await this.getBotRegistration(token, registration.botId);
      if (botReg) {
        TOOLS.logProvider.info(Messages.BotResourceExist("Appstudio"));
        return;
      }
    }
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/botframework`, registration)
      );
      if (!isHappyResponse(response)) {
        throw new ProvisionError(CommonStrings.APP_STUDIO_BOT_REGISTRATION);
      }
    } catch (e) {
      this.handleBotFrameworkError(e, APP_STUDIO_API_NAMES.CREATE_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async updateMessageEndpoint(token: string, botId: string, endpoint: string): Promise<void> {
    const botReg = await this.getBotRegistration(token, botId);
    if (!botReg) {
      throw new BotRegistrationNotFoundError(botId);
    }

    botReg.messagingEndpoint = endpoint;
    if (botReg.configuredChannels === undefined || botReg.configuredChannels.length === 0) {
      botReg.configuredChannels = [BotChannelType.MicrosoftTeams];
    }
    await this.updateBotRegistration(token, botReg);
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async updateBotRegistration(token: string, botReg: IBotRegistration): Promise<void> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/botframework/${botReg.botId!}`, botReg)
      );
      if (!isHappyResponse(response)) {
        throw new ConfigUpdatingError(ConfigNames.MESSAGE_ENDPOINT);
      }
    } catch (e) {
      this.handleBotFrameworkError(e, APP_STUDIO_API_NAMES.UPDATE_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async createAADApp(
    token: string,
    displayName: string,
    signInAudience: SignInAudience = SignInAudience.AzureADMyOrg,
    serviceManagementReference?: string,
    isMicrosoftUser = false
  ): Promise<AADApplication> {
    const requester = this.createRequesterWithToken(token);
    const requestBody: IAADDefinition = {
      displayName: displayName,
      signInAudience: signInAudience,
      serviceManagementReference: serviceManagementReference,
    }; // Create a Microsoft Entra app and optionally set service tree id

    try {
      const response = await RetryHandler.Retry(() =>
        requester.post(`/api/aadapp/v2`, requestBody)
      );

      if (response && response.data) {
        return <AADApplication>response.data;
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        if (
          err.response.data?.error?.code === aadErrorCode.signInAudienceNotAllowedAsPerAppPolicy
        ) {
          throw new SignInAudienceNotAllowedError(
            "TeamsDevPortalClient",
            err.response.data.error?.message,
            isMicrosoftUser
          );
        }
      }
      throw this.wrapException(err, APP_STUDIO_API_NAMES.CREATE_AAD_APP);
    }
    throw this.wrapException(
      new Error(`Failed to create AAD app: ${displayName}`),
      APP_STUDIO_API_NAMES.CREATE_AAD_APP
    );
  }

  handleBotFrameworkError(e: any, apiName: string): void | undefined {
    if (e.response?.status === HttpStatusCode.NOTFOUND) {
      return undefined; // Stands for NotFound.
    } else if (e.response?.status === HttpStatusCode.UNAUTHORIZED) {
      throw new BotFrameworkNotAllowedToAcquireTokenError();
    } else if (e.response?.status === HttpStatusCode.FORBIDDEN) {
      throw new BotFrameworkForbiddenResultError(e);
    } else if (e.response?.status === HttpStatusCode.TOOMANYREQS) {
      throw new BotFrameworkConflictResultError();
    } else {
      e.teamsfxUrlName = TeamsFxUrlNames[apiName];
      throw this.wrapException(e, apiName) as SystemError;
    }
  }
  wrapResponse(e?: Error, response?: AxiosResponse<any, any>): any {
    const error = new Error(
      e?.message || response?.data.error?.message || response?.data.errorMessage
    );
    (error as any).response = response;
    (error as any).request = response?.request;
    return error;
  }
  wrapException(
    e: any,
    apiName: string,
    name = getDefaultString("error.appstudio.apiFailed.name.common"),
    potentialReason = getDefaultString("error.appstudio.apiFailed.reason.common"),
    disPlayMessage?: string,
    isUserError = false,
    helpLink?: string
  ): Error {
    e.name = name;
    const correlationId = e.response?.headers?.[Constants.CORRELATION_ID];

    let extraData = `${potentialReason} ${
      e.response?.data ? `data: ${JSON.stringify(e.response.data)}` : ""
    }`;
    // add status code in extra data if the message does not have it.
    if (!e.message?.toLowerCase().includes("status code") && e.response?.status) {
      extraData = `Status code: ${e.response.status as string}. ${extraData}`;
    }
    let error;
    if (isUserError) {
      error = new DeveloperPortalAPIFailedUserError(
        e,
        correlationId,
        apiName,
        extraData,
        disPlayMessage,
        helpLink
      );
    } else {
      error = new DeveloperPortalAPIFailedSystemError(
        e,
        correlationId,
        apiName,
        extraData,
        disPlayMessage
      );
    }
    return error;
  }
}

export const teamsDevPortalClient = new TeamsDevPortalClient();
