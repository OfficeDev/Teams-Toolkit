// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import { AxiosInstance, AxiosResponse } from "axios";
import FormData from "form-data";
import { getResourceServiceEndpoint, ResourceServiceType } from "../common/constants";
import { ErrorContextMW, TOOLS } from "../common/globalVars";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import { RetryHandler } from "../common/retryHandler";
import { WrappedAxiosClient } from "../common/wrappedAxiosClient";
import { HttpStatusCode } from "../component/constant/commonConstant";
import { APP_STUDIO_API_NAMES, ErrorMessages } from "../component/driver/teamsApp/constants";
import { AsyncAppValidationDetailsResponse } from "../component/driver/teamsApp/interfaces/AsyncAppValidationDetailsResponse";
import { AsyncAppValidationResponse } from "../component/driver/teamsApp/interfaces/AsyncAppValidationResponse";
import { AsyncAppValidationResultsResponse } from "../component/driver/teamsApp/interfaces/AsyncAppValidationResultsResponse";
import { IValidationResult } from "../component/driver/teamsApp/interfaces/appdefinitions/IValidationResult";
import { AppDefinition } from "../component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { AppUser } from "../component/driver/teamsApp/interfaces/appdefinitions/appUser";
import { IBotRegistration } from "../component/resource/botService/appStudio/interfaces/IBotRegistration";
import { isHappyResponse } from "../component/resource/botService/common";
import { ConfigUpdatingError, ProvisionError } from "../component/resource/botService/errors";
import { Messages } from "../component/resource/botService/messages";
import { CommonStrings, ConfigNames } from "../component/resource/botService/strings";
import { TeamsDevPortalClient } from "./teamsDevPortalClient";

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
    appDetails?: { applicationManifest?: Record<string, any> };
  };
}

interface PagedResponse<T> {
  items: T[];
  continuationToken?: string;
}

const newDeveloperPortalEndpoints: Record<string, string> = {
  apac: "https://dev.teams.microsoft.com/cosmicprodapac",
  amer: "https://dev.teams.microsoft.com/cosmicprodamer",
  emea: "https://dev.teams.microsoft.com/cosmicprodemea",
};

export class DevPortalClient extends TeamsDevPortalClient {
  private readonly appEtags = new Map<string, string>();

  override async setRegionEndpointByToken(authSvcToken: string): Promise<void> {
    if (
      getResourceServiceEndpoint(ResourceServiceType.TDP) === "https://dev-int.teams.microsoft.com"
    ) {
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

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  async createApp(token: string, name: string): Promise<AppDefinition> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/v1.0/apps", {
          appDetails: {
            applicationManifest: {
              manifestVersion: "1.15",
              name: { short: name },
              icons: {
                color: "default-app-icons/images/color.png",
                outline: "default-app-icons/images/outline.png",
              },
            },
          },
        })
      );
      if (!response?.data) {
        throw new Error("Cannot create Teams app");
      }
      return this.toAppDefinition(response.data as AppResponse);
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.CREATE_APP);
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
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.UPDATE_APP);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async listApps(token: string): Promise<AppDefinition[]> {
    try {
      const requester = this.createRequesterWithToken(token);
      TOOLS.logProvider.debug(`Sent API Request: GET ${this.getEndpoint()}/v1.0/apps`);
      const apps: AppDefinition[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await RetryHandler.Retry(() =>
          requester.get("/v1.0/apps", {
            params: { pageSize: 100 },
            headers: continuationToken ? { "x-ms-continuation": continuationToken } : undefined,
          })
        );
        const page = response?.data as PagedResponse<Record<string, any>> | undefined;
        if (!page?.items) {
          throw new Error("Cannot get the app definitions");
        }
        apps.push(
          ...page.items.map((app) => ({
            teamsAppId: app.appExternalId ?? app.appId,
            appId: app.appId,
            appName: app.appName,
            version: app.appVersion,
            updatedAt: app.updatedAt,
          }))
        );
        continuationToken = page.continuationToken;
      } while (continuationToken);
      return apps;
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.LIST_APPS);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async deleteApp(token: string, appId: string): Promise<boolean> {
    try {
      const requester = this.createRequesterWithToken(token);
      TOOLS.logProvider.debug(`Sent API Request: DELETE ${this.getEndpoint()}/v1.0/apps/${appId}`);
      let response;
      try {
        response = await RetryHandler.Retry(() => requester.delete(`/v1.0/apps/${appId}`));
      } catch (error) {
        if (error?.response?.status !== HttpStatusCode.NOTFOUND) throw error;
        const resolvedAppId = await this.resolveLegacyAppId(token, appId);
        if (resolvedAppId === appId) throw error;
        response = await RetryHandler.Retry(() => requester.delete(`/v1.0/apps/${resolvedAppId}`));
      }
      if (response?.status === 204) {
        return true;
      }
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.DELETE_APP);
    }
    throw this.wrapException(
      new Error("cannot delete the app: " + appId),
      APP_STUDIO_API_NAMES.DELETE_APP
    );
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async getApp(token: string, appId: string): Promise<AppDefinition> {
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
        if (app.appId === appId || app.teamsAppId === appId) {
          return app;
        }
        TOOLS.logProvider?.error(`appId mismatch. Input: ${appId}. Got: ${app.appId as string}`);
      }
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.GET_APP);
    }
    throw this.wrapException(
      new Error(`cannot get the app definition with app ID ${appId}`),
      APP_STUDIO_API_NAMES.GET_APP
    );
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async getAppPackage(token: string, appId: string): Promise<any> {
    TOOLS.logProvider?.info("Downloading app package for app " + appId);
    const requester = this.createRequesterWithToken(token);
    try {
      let response;
      try {
        response = await RetryHandler.Retry(() =>
          requester.get(`/v1.0/apps/${appId}/appPackage`, { responseType: "arraybuffer" })
        );
      } catch (error) {
        if (error?.response?.status !== HttpStatusCode.NOTFOUND) throw error;
        const resolvedAppId = await this.resolveLegacyAppId(token, appId);
        if (resolvedAppId === appId) throw error;
        response = await RetryHandler.Retry(() =>
          requester.get(`/v1.0/apps/${resolvedAppId}/appPackage`, {
            responseType: "arraybuffer",
          })
        );
      }
      if (response?.data) {
        TOOLS.logProvider?.info("Download app package successfully");
        return response.data;
      }
      throw this.wrapException(
        new Error(getLocalizedString("plugins.appstudio.emptyAppPackage", appId)),
        APP_STUDIO_API_NAMES.GET_APP_PACKAGE
      );
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.GET_APP_PACKAGE);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async checkExistsInTenant(token: string, appId: string): Promise<boolean> {
    try {
      const response = await this.getAppResponse(token, appId);
      return (response.data as unknown) !== false;
    } catch (error) {
      return false;
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async removePermission(
    token: string,
    appId: string,
    userToRemove: AppUser
  ): Promise<void> {
    const app = await this.getApp(token, appId);
    if (!this.checkUser(app, userToRemove)) return;
    const updatedUsers = (app.userList ?? [])
      .map((user) => this.toAppUserPayload(user))
      .filter((user) => user.aadId !== userToRemove.aadId);
    await this.updateOwners(token, app.appId ?? appId, appId, updatedUsers);
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async grantPermission(token: string, appId: string, newUser: AppUser): Promise<void> {
    const app = await this.getApp(token, appId);
    if (this.checkUser(app, newUser)) return;
    const updatedUsers = [
      ...(app.userList ?? []).map((user) => this.toAppUserPayload(user)),
      this.toAppUserPayload(newUser),
    ];
    await this.updateOwners(token, app.appId ?? appId, appId, updatedUsers);
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async partnerCenterAppPackageValidation(
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
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.VALIDATE_APP_PACKAGE);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async submitAppValidationRequest(
    token: string,
    appId: string
  ): Promise<AsyncAppValidationResponse> {
    try {
      const requester = this.createRequesterWithToken(token);
      let response;
      try {
        response = await this.submitAppValidation(requester, appId);
      } catch (error) {
        if (error?.response?.status !== HttpStatusCode.NOTFOUND) throw error;
        const resolvedAppId = await this.resolveLegacyAppId(token, appId);
        if (resolvedAppId === appId) throw error;
        response = await this.submitAppValidation(requester, resolvedAppId);
      }
      return response.data;
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.SUBMIT_APP_VALIDATION);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async getAppValidationRequestList(
    token: string,
    appId: string
  ): Promise<AsyncAppValidationDetailsResponse> {
    try {
      const requester = this.createRequesterWithToken(token);
      try {
        return await this.getAppValidationRequests(requester, appId);
      } catch (error) {
        if (error?.response?.status !== HttpStatusCode.NOTFOUND) throw error;
        const resolvedAppId = await this.resolveLegacyAppId(token, appId);
        if (resolvedAppId === appId) throw error;
        return await this.getAppValidationRequests(requester, resolvedAppId);
      }
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.GET_APP_VALIDATION_REQUESTS);
    }
  }

  private async getAppValidationRequests(
    requester: AxiosInstance,
    appId: string
  ): Promise<AsyncAppValidationDetailsResponse> {
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
      if (!page?.items) throw new Error("Cannot get app validation requests");
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
  }

  private async submitAppValidation(
    requester: AxiosInstance,
    appId: string
  ): Promise<AxiosResponse<AsyncAppValidationResponse>> {
    const response = await RetryHandler.Retry(() =>
      requester.post("/v1.0/appvalidation/validate", {
        appId,
        appEnvironmentId: null,
        testSuites: null,
      })
    );
    if (!response) {
      throw new Error("App validation request returned no response.");
    }
    return response;
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async getAppValidationById(
    token: string,
    appValidationId: string
  ): Promise<AsyncAppValidationResultsResponse> {
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.get(`/v1.0/appValidations/${appValidationId}`)
      );
      return response?.data as AsyncAppValidationResultsResponse;
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.GET_APP_VALIDATION_RESULT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async getBotRegistration(
    token: string,
    botId: string
  ): Promise<IBotRegistration | undefined> {
    return this.getBotRegistrationAtPath(token, `/v1.0/botregistrations/${botId}`);
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async listBots(token: string): Promise<IBotRegistration[] | undefined> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() => requester.get("/v1.0/botregistrations"));
      if (isHappyResponse(response)) return response!.data as IBotRegistration[];
      throw this.wrapException(
        this.wrapResponse(undefined, response),
        APP_STUDIO_API_NAMES.LIST_BOT,
        getDefaultString("error.appstudio.apiFailed.name.common"),
        "Failed to get data"
      );
    } catch (error) {
      this.handleBotFrameworkError(error, APP_STUDIO_API_NAMES.LIST_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async deleteBot(token: string, botId: string): Promise<void> {
    try {
      const requester = this.createRequesterWithToken(token);
      await RetryHandler.Retry(() => requester.delete(`/v1.0/botregistrations/${botId}`));
    } catch (error) {
      this.handleBotFrameworkError(error, APP_STUDIO_API_NAMES.DELETE_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async createBotRegistration(
    token: string,
    registration: IBotRegistration,
    checkExistence = true
  ): Promise<void> {
    if (registration.botId && checkExistence) {
      const botRegistration = await this.getBotRegistration(token, registration.botId);
      if (botRegistration) {
        TOOLS.logProvider.info(Messages.BotResourceExist("Appstudio"));
        return;
      }
    }
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post("/v1.0/botregistrations", registration)
      );
      if (!isHappyResponse(response)) {
        throw new ProvisionError(CommonStrings.APP_STUDIO_BOT_REGISTRATION);
      }
    } catch (error) {
      this.handleBotFrameworkError(error, APP_STUDIO_API_NAMES.CREATE_BOT);
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "TeamsDevPortalClient" })])
  override async updateBotRegistration(token: string, botReg: IBotRegistration): Promise<void> {
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.put(`/v1.0/botregistrations/${botReg.botId!}`, botReg)
      );
      if (!isHappyResponse(response)) {
        throw new ConfigUpdatingError(ConfigNames.MESSAGE_ENDPOINT);
      }
    } catch (error) {
      this.handleBotFrameworkError(error, APP_STUDIO_API_NAMES.UPDATE_BOT);
    }
  }

  private resolveRegionEndpoint(teamsDeveloperPortal?: string, teamsDevPortal?: string): string {
    if (teamsDeveloperPortal?.startsWith("https://")) return teamsDeveloperPortal;
    const oldEndpointRegion = Object.keys(newDeveloperPortalEndpoints).find((region) =>
      teamsDevPortal?.match(new RegExp(`/${region}(?:/api)?/?$`, "i"))
    );
    return newDeveloperPortalEndpoints[oldEndpointRegion ?? "amer"];
  }

  private createAppPackageForm(file: Buffer): FormData {
    const content = new FormData();
    content.append("AppPackageZip", file, {
      filename: "appPackage.zip",
      contentType: "application/zip",
    });
    return content;
  }

  private async getAppResponse(token: string, appId: string): Promise<AxiosResponse<AppResponse>> {
    const requester = this.createRequesterWithToken(token);
    TOOLS.logProvider.debug(`Sent API Request: GET ${this.getEndpoint()}/v1.0/apps/${appId}`);
    const response = await RetryHandler.Retry(() => requester.get(`/v1.0/apps/${appId}`));
    if (!response) throw new Error(`Cannot get the app with app ID ${appId}`);
    return response;
  }

  private async resolveLegacyAppId(token: string, appId: string): Promise<string> {
    const app = (await this.listApps(token)).find((item) => item.teamsAppId === appId);
    return app?.appId ?? appId;
  }

  private async updateOwners(
    token: string,
    resolvedAppId: string,
    requestedAppId: string,
    appUsers: AppUserPayload[]
  ): Promise<void> {
    try {
      TOOLS.logProvider.debug(
        getLocalizedString(
          "core.common.SendingApiRequest",
          `${this.getEndpoint()}/v1.0/apps/{appId}/owners`,
          JSON.stringify({ appUsers })
        )
      );
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post(
          `/v1.0/apps/${resolvedAppId}/owners`,
          { appUsers },
          { headers: { "If-Match": this.appEtags.get(requestedAppId) ?? "*" } }
        )
      );
      TOOLS.logProvider.debug(
        getLocalizedString("core.common.ReceiveApiResponse", JSON.stringify(response?.data))
      );
      if (!response) throw new Error(ErrorMessages.GrantPermissionFailed);
    } catch (error) {
      throw this.wrapException(error, APP_STUDIO_API_NAMES.UPDATE_OWNER);
    }
  }

  private async getBotRegistrationAtPath(
    token: string,
    path: string
  ): Promise<IBotRegistration | undefined> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() => requester.get(path));
      if (isHappyResponse(response)) return response!.data as IBotRegistration;
      throw this.wrapException(
        this.wrapResponse(undefined, response),
        APP_STUDIO_API_NAMES.GET_BOT,
        getDefaultString("error.appstudio.apiFailed.name.common"),
        "Failed to get data"
      );
    } catch (error) {
      this.handleBotFrameworkError(error, APP_STUDIO_API_NAMES.GET_BOT);
    }
  }

  private getAppUsers(app: AppResponse): AppUserPayload[] {
    const accessControl = app.appProfile?.appAccessControl;
    if (Array.isArray(accessControl)) return accessControl;
    return accessControl?.appUsers ?? accessControl?.users ?? [];
  }

  private toAppUserPayload(user: AppUser): AppUserPayload {
    return {
      aadId: user.aadId,
      tenantId: user.tenantId,
      role: user.isAdministrator ? "Owner" : "Member",
    };
  }

  private toAppDefinition(app: AppResponse): AppDefinition {
    if ((app as unknown as AppDefinition).teamsAppId) return app as unknown as AppDefinition;
    const metadata = app.appProfile?.appMetadata ?? {};
    const manifest = app.appProfile?.appDetails?.applicationManifest ?? {};
    const appUsers = this.getAppUsers(app);
    const owner = appUsers.find((user) => user.aadId === metadata.ownerAadId) ?? appUsers[0];
    return {
      teamsAppId: manifest.id ?? app.appId,
      appId: app.appId,
      tenantId: owner?.tenantId,
      ownerAadId: metadata.ownerAadId,
      userList: appUsers.map((user) => ({
        aadId: user.aadId,
        tenantId: user.tenantId,
        role: user.role,
        displayName: "",
        userPrincipalName: "",
        isAdministrator: user.role === "Owner",
      })),
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
}

export const devPortalClient = new DevPortalClient();
