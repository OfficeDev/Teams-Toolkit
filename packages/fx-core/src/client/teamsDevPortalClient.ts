// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import { SystemError } from "@microsoft/teamsfx-api";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import FormData from "form-data";
import { getResourceServiceEndpoint, ResourceServiceType } from "../common/constants";
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

interface AppUserPayload {
  aadId: string;
  tenantId: string;
  role: "Owner" | "Member" | string;
}

interface AppResponse {
  appId: string;
  appProfile: {
    appAccessControl?: { appUsers?: AppUserPayload[]; users?: AppUserPayload[] } | AppUserPayload[];
    appMetadata?: Record<string, any>;
    appDetails?: {
      applicationManifest?: Record<string, any>;
      firstPartySettings?: Record<string, any>;
    };
  };
}

interface PagedResponse<T> {
  items: T[];
  continuationToken?: string;
}

const DEFAULT_MANIFEST_VERSION = "1.15";
const DEFAULT_COLOR_ICON = "default-app-icons/images/color.png";
const DEFAULT_OUTLINE_ICON = "default-app-icons/images/outline.png";

const newDeveloperPortalEndpoints: Record<string, string> = {
  apac: "https://dev.teams.microsoft.com/cosmicprodapac",
  amer: "https://dev.teams.microsoft.com/cosmicprodamer",
  emea: "https://dev.teams.microsoft.com/cosmicprodemea",
};

export class TeamsDevPortalClient {
  regionEndpoint?: string;
  private readonly appEtags = new Map<string, string>();

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
    const regionGtms = response?.data?.regionGtms;
    this.regionEndpoint = this.resolveRegionEndpoint(
      regionGtms?.teamsDeveloperPortal,
      regionGtms?.teamsDevPortal
    );
  }

  private resolveRegionEndpoint(teamsDeveloperPortal?: string, teamsDevPortal?: string): string {
    if (teamsDeveloperPortal?.startsWith("https://")) {
      return teamsDeveloperPortal;
    }

    // Remove this fallback once AuthSvc returns teamsDeveloperPortal for every region.
    const oldEndpointRegion = Object.keys(newDeveloperPortalEndpoints).find((region) =>
      teamsDevPortal?.match(new RegExp(`/${region}(?:/api)?/?$`, "i"))
    );
    return newDeveloperPortalEndpoints[oldEndpointRegion ?? "amer"];
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

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async createApp(token: string, name: string): Promise<AppDefinition> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post(`/v1.0/apps`, {
          appDetails: {
            applicationManifest: {
              manifestVersion: DEFAULT_MANIFEST_VERSION,
              name: { short: name },
              icons: {
                color: DEFAULT_COLOR_ICON,
                outline: DEFAULT_OUTLINE_ICON,
              },
            },
          },
        })
      );
      if (!response?.data) {
        throw new Error("Cannot create Teams app");
      }
      return this.toAppDefinition(response.data as AppResponse);
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.CREATE_APP);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async updateApp(token: string, appId: string, file: Buffer): Promise<AppDefinition> {
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() => {
        const content = this.createAppPackageForm(file);
        return requester.put(`/v1.0/apps/${appId}/apppackage`, content, {
          headers: content.getHeaders(),
        });
      });

      if (!response?.data) {
        throw new Error(`Cannot update the app with app ID ${appId}`);
      }
      return this.toAppDefinition(response.data as AppResponse);
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.UPDATE_APP);
    }
  }

  private createAppPackageForm(file: Buffer): FormData {
    const content = new FormData();
    content.append("AppPackageZip", file, {
      filename: "appPackage.zip",
      contentType: "application/zip",
    });
    return content;
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async listApps(token: string): Promise<AppDefinition[]> {
    let requester: AxiosInstance;
    try {
      requester = this.createRequesterWithToken(token);
      TOOLS.logProvider.debug(`Sent API Request: GET ${this.getEndpoint()}/v1.0/apps`);
      const apps: AppDefinition[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await RetryHandler.Retry(() =>
          requester.get(`/v1.0/apps`, {
            params: { pageSize: 100 },
            headers: continuationToken ? { "x-ms-continuation": continuationToken } : undefined,
          })
        );
        const page = response?.data as PagedResponse<Record<string, any>> | undefined;
        if (!page?.items) {
          throw new Error("Cannot get the app definitions");
        }
        apps.push(
          ...page.items.map((app) => {
            const externalId = app.appExternalId ?? app.appId;
            return {
              teamsAppId: externalId,
              appId: app.appId,
              appName: app.appName,
              version: app.appVersion,
              updatedAt: app.updatedAt,
            };
          })
        );
        continuationToken = page.continuationToken;
      } while (continuationToken);
      return apps;
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.LIST_APPS);
    }
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async deleteApp(appStudioToken: string, appId: string): Promise<boolean> {
    if (!this.regionEndpoint) throw new Error("Failed to get region");
    let requester: AxiosInstance;
    try {
      requester = this.createRequesterWithToken(appStudioToken);
      TOOLS.logProvider.debug(`Sent API Request: DELETE ${this.getEndpoint()}/v1.0/apps/${appId}`);
      const response = await RetryHandler.Retry(() => requester.delete(`/v1.0/apps/${appId}`));
      if (response?.status === 204) {
        return true;
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.DELETE_APP);
    }
    throw this.wrapException(
      new Error("cannot delete the app: " + appId),
      APP_STUDIO_API_NAMES.DELETE_APP
    );
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getApp(token: string, appId: string): Promise<AppDefinition> {
    try {
      let response: AxiosResponse<AppResponse>;
      try {
        response = await this.getAppResponse(token, appId);
      } catch (error) {
        if (error?.response?.status !== HttpStatusCode.NOTFOUND) {
          throw error;
        }
        const resolvedAppId = await this.resolveLegacyAppId(token, appId);
        if (resolvedAppId === appId) {
          throw error;
        }
        response = await this.getAppResponse(token, resolvedAppId);
      }
      if (response.data) {
        const etag = response.headers?.etag as string | undefined;
        if (etag) {
          this.appEtags.set(appId, etag);
        }
        const app = this.toAppDefinition(response.data);
        if (app && (app.appId === appId || app.teamsAppId === appId)) {
          return app;
        } else {
          TOOLS.logProvider?.error(`appId mismatch. Input: ${appId}. Got: ${app.appId as string}`);
        }
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_APP);
    }
    throw this.wrapException(
      new Error(`cannot get the app definition with app ID ${appId}`),
      APP_STUDIO_API_NAMES.GET_APP
    );
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getBotId(token: string, appId: string): Promise<string | undefined> {
    const app = await this.getApp(token, appId);
    if (app?.bots?.length && app.bots.length > 0) {
      return app.bots[0].botId;
    }
    TOOLS.logProvider?.error(`botId not found. Input: ${appId}`);
    return undefined;
  }
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async getAppPackage(token: string, appId: string): Promise<any> {
    TOOLS.logProvider?.info("Downloading app package for app " + appId);
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/v1.0/apps/${appId}/appPackage`, { responseType: "arraybuffer" })
      );

      if (response && response.data) {
        TOOLS.logProvider?.info("Download app package successfully");
        return response.data;
      } else {
        throw this.wrapException(
          new Error(getLocalizedString("plugins.appstudio.emptyAppPackage", appId)),
          APP_STUDIO_API_NAMES.GET_APP_PACKAGE
        );
      }
    } catch (e) {
      throw this.wrapException(e, APP_STUDIO_API_NAMES.GET_APP_PACKAGE);
    }
  }

  /**
   * Check if app exists in the user's organization by the Teams app id
   * @param appId
   * @param token
   * @param logProvider
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async checkExistsInTenant(token: string, appId: string): Promise<boolean> {
    try {
      const response = await this.getAppResponse(token, appId);
      return (response.data as unknown) !== false;
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
  async getUserList(token: string, appId: string): Promise<AppUser[] | undefined> {
    const app = await this.getApp(token, appId);
    return app.userList;
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async checkPermission(token: string, appId: string, userObjectId: string): Promise<string> {
    let userList;
    try {
      userList = await this.getUserList(token, appId);
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
  async removePermission(token: string, appId: string, userToRemove: AppUser): Promise<void> {
    const app = await this.getApp(token, appId);
    const resolvedAppId = app.appId ?? appId;
    if (!this.checkUser(app, userToRemove)) {
      return;
    }
    const appUsers = (app.userList ?? []).map((user) => this.toAppUserPayload(user));
    const updatedUsers = appUsers.filter((user) => user.aadId !== userToRemove.aadId);
    let requester: AxiosInstance;
    try {
      TOOLS.logProvider.debug(
        getLocalizedString(
          "core.common.SendingApiRequest",
          `${this.getEndpoint()}/v1.0/apps/{appId}/owners`,
          JSON.stringify({ appUsers: updatedUsers })
        )
      );
      requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post(
          `/v1.0/apps/${resolvedAppId}/owners`,
          { appUsers: updatedUsers },
          { headers: { "If-Match": this.appEtags.get(appId) ?? "*" } }
        )
      );
      TOOLS.logProvider.debug(
        getLocalizedString("core.common.ReceiveApiResponse", JSON.stringify(response?.data))
      );
      if (!response) {
        throw new Error("Response is empty.");
      }
    } catch (err) {
      throw this.wrapException(err, APP_STUDIO_API_NAMES.UPDATE_OWNER);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async grantPermission(token: string, appId: string, newUser: AppUser): Promise<void> {
    const app = await this.getApp(token, appId);
    const resolvedAppId = app.appId ?? appId;
    if (this.checkUser(app, newUser)) {
      return;
    }
    const appUsers = (app.userList ?? []).map((user) => this.toAppUserPayload(user));
    const updatedUsers = [...appUsers, this.toAppUserPayload(newUser)];
    let requester: AxiosInstance;
    try {
      TOOLS.logProvider.debug(
        getLocalizedString(
          "core.common.SendingApiRequest",
          `${this.getEndpoint()}/v1.0/apps/{appId}/owners`,
          JSON.stringify({ appUsers: updatedUsers })
        )
      );
      requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post(
          `/v1.0/apps/${resolvedAppId}/owners`,
          { appUsers: updatedUsers },
          { headers: { "If-Match": this.appEtags.get(appId) ?? "*" } }
        )
      );
      TOOLS.logProvider.debug(
        getLocalizedString("core.common.ReceiveApiResponse", JSON.stringify(response?.data))
      );
      if (!response) {
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
  async partnerCenterAppPackageValidation(
    token: string,
    file: Buffer,
    signal?: AbortSignal
  ): Promise<IValidationResult> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() => {
        const content = new FormData();
        content.append("appPackage", file, {
          filename: "appPackage.zip",
          contentType: "application/zip",
        });
        return requester.post("/v1.0/appvalidation/apppackage/validate", content, {
          headers: content.getHeaders(),
          signal,
        });
      });
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
   * @param appId
   * @param token
   * @param timeoutSeconds
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async submitAppValidationRequest(
    token: string,
    appId: string
  ): Promise<AsyncAppValidationResponse> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post(`/v1.0/appvalidation/validate`, {
          appId,
          appEnvironmentId: null,
          testSuites: null,
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
    appId: string
  ): Promise<AsyncAppValidationDetailsResponse> {
    const requester = this.createRequesterWithToken(token);
    try {
      const items: Record<string, any>[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await RetryHandler.Retry(() =>
          requester.get(`/v1.0/appValidations/apps/${appId}`, {
            params: { pageSize: 100 },
            headers: continuationToken ? { "x-ms-continuation": continuationToken } : undefined,
          })
        );
        const page = response?.data as PagedResponse<Record<string, any>> | undefined;
        if (!page?.items) {
          throw new Error("Cannot get app validation requests");
        }
        items.push(...page.items);
        continuationToken =
          page.continuationToken ??
          (response?.headers?.["x-continuation-token"] as string | undefined);
      } while (continuationToken);
      return {
        appValidations: items.map((item) => ({
          id: item.appValidationId,
          appId: item.appId,
          appVersion: item.appVersion,
          manifestVersion: item.manifestVersion,
          status: item.status,
          createdAt: item.submittedDate,
          updatedAt: item.completedDate,
        })),
      };
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
        requester.get(`/v1.0/appValidations/${appValidationId}`)
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
      const response = await RetryHandler.Retry(() =>
        requester.get(`/v1.0/botregistrations/${botId}`)
      );
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
      const response = await RetryHandler.Retry(() => requester.get("/v1.0/botregistrations"));
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
      await RetryHandler.Retry(() => requester.delete(`/v1.0/botregistrations/${botId}`));
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
        requester.post(`/v1.0/botregistrations`, registration)
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
        requester.put(`/v1.0/botregistrations/${botReg.botId!}`, botReg)
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

  private async getAppResponse(token: string, appId: string): Promise<AxiosResponse<AppResponse>> {
    const requester = this.createRequesterWithToken(token);
    TOOLS.logProvider.debug(`Sent API Request: GET ${this.getEndpoint()}/v1.0/apps/${appId}`);
    const response = await RetryHandler.Retry(() => requester.get(`/v1.0/apps/${appId}`));
    if (!response) {
      throw new Error(`Cannot get the app with app ID ${appId}`);
    }
    return response;
  }

  private async resolveLegacyAppId(token: string, appId: string): Promise<string> {
    const app = (await this.listApps(token)).find((item) => item.teamsAppId === appId);
    return app?.appId ?? appId;
  }

  private getAppUsers(app: AppResponse): AppUserPayload[] {
    const accessControl = app.appProfile?.appAccessControl;
    if (Array.isArray(accessControl)) {
      return accessControl;
    }
    return accessControl?.appUsers ?? accessControl?.users ?? [];
  }

  private toAppUserPayload(user: AppUser): AppUserPayload {
    return {
      aadId: user.aadId,
      tenantId: user.tenantId,
      role: user.isAdministrator ? "Owner" : "Member",
    };
  }

  private toAppUser(user: AppUserPayload): AppUser {
    return {
      aadId: user.aadId,
      tenantId: user.tenantId,
      role: user.role,
      displayName: "",
      userPrincipalName: "",
      isAdministrator: user.role === "Owner",
    };
  }

  private toAppDefinition(app: AppResponse): AppDefinition {
    if ((app as unknown as AppDefinition).teamsAppId) {
      return app as unknown as AppDefinition;
    }
    const metadata = app.appProfile?.appMetadata ?? {};
    const manifest = app.appProfile?.appDetails?.applicationManifest ?? {};
    const teamsAppId = manifest.id ?? app.appId;
    const appUsers = this.getAppUsers(app);
    const owner = appUsers.find((user) => user.aadId === metadata.ownerAadId) ?? appUsers[0];
    return {
      teamsAppId,
      appId: app.appId,
      tenantId: owner?.tenantId,
      ownerAadId: metadata.ownerAadId,
      userList: appUsers.map((user) => this.toAppUser(user)),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      appName: manifest.name?.short,
      version: manifest.version,
      manifestVersion: manifest.manifestVersion,
      packageName: manifest.packageName,
      shortName: manifest.name?.short,
      longName: manifest.name?.full,
      developerName: manifest.developer?.name,
      websiteUrl: manifest.developer?.websiteUrl,
      privacyUrl: manifest.developer?.privacyUrl,
      termsOfUseUrl: manifest.developer?.termsOfUseUrl,
      mpnId: manifest.developer?.mpnId,
      shortDescription: manifest.description?.short,
      longDescription: manifest.description?.full,
      colorIcon: manifest.icons?.color,
      outlineIcon: manifest.icons?.outline,
      accentColor: manifest.accentColor,
      configurableTabs: manifest.configurableTabs,
      staticTabs: manifest.staticTabs,
      bots: manifest.bots,
      connectors: manifest.connectors,
      messagingExtensions: manifest.composeExtensions,
      validDomains: manifest.validDomains,
      webApplicationInfoId: manifest.webApplicationInfo?.id,
      webApplicationInfoResource: manifest.webApplicationInfo?.resource,
      devicePermissions: manifest.devicePermissions,
      showLoadingIndicator: manifest.showLoadingIndicator,
      isFullScreen: manifest.isFullScreen,
      defaultInstallScope: manifest.defaultInstallScope,
      defaultGroupCapability: manifest.defaultGroupCapability,
      configurableProperties: manifest.configurableProperties,
      meetingExtensionDefinition: manifest.meetingExtensionDefinition,
      activities: manifest.activities,
      authorization: manifest.authorization,
      localizationInfo: manifest.localizationInfo,
      supportsChannelFeatures: manifest.supportsChannelFeatures,
    };
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
