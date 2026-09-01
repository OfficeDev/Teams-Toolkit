// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import {
  err,
  FxError,
  LogProvider,
  M365TokenProvider,
  ok,
  Result,
  SensitivityLabel,
  signedIn,
  SystemError,
} from "@microsoft/teamsfx-api";
import { AxiosInstance } from "axios";
import {
  getResourceServiceEndpoint,
  GraphScopes,
  GraphTeamsAppSettingsReadScopes,
  GraphTeamsChannelCreateScopes,
  GraphTeamsChannelReadScopes,
  GraphTeamsInstallAppScopes,
  GraphTeamsTeamCreateScopes,
  GraphTeamsTeamReadScopes,
  GroupSearchScopes,
  ListSensitivityLabelScope,
  ResourceServiceType,
} from "../common/constants";
import { globalStateGet, globalStateUpdate } from "../common/globalState";
import { ErrorContextMW } from "../common/globalVars";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import { waitSeconds } from "../common/utils";
import { WrappedAxiosClient } from "../common/wrappedAxiosClient";
import { RetryHandler } from "../common/retryHandler";
import { CreateChannelResponse } from "./interfaces/CreateChannelResponse";
import { CreateTeamAndChannelResponse } from "./interfaces/CreateTeamAndChannelResponse";
import { GetAppInstallationResponse } from "./interfaces/GetAppInstallationResponse";
import { GetChannelResponse } from "./interfaces/GetChannelResponse";
import { Group } from "./interfaces/GetGroupResponse";
import { GetJoinedTeamsResponse } from "./interfaces/GetJoinedTeamsResponse";
import { GetTeamsAppSettingsResponse } from "./interfaces/GetTeamsAppSettingsResponse";
import { User } from "./interfaces/GetUserResponse";
import { ListSensitivityCacheValue } from "./interfaces/ListSensitivityCacheValue";
import {
  IPublishingAppDenition,
  PublishingState,
} from "../component/driver/teamsApp/interfaces/appdefinitions/IPublishingAppDefinition";

const listSensitivityLabelAPIPath = "/me/informationProtection/sensitivityLabels";
const errorSourceName = "GraphAPI";
const GeneralLabelDisplayName = "General";
const listSensitivityLabelCacheKeyPrefix = "listSensitivityLabelCacheKey";
const teamsAppsPath = `/appCatalogs/teamsApps`;

export class GraphClient {
  private readonly baseUrl: string =
    process.env.GRAPH_ENDPOINT ?? `${getResourceServiceEndpoint(ResourceServiceType.Graph)}/beta`;
  private readonly tokenProvider: M365TokenProvider;
  private readonly logProvider: LogProvider | undefined;

  constructor(tokenProvider: M365TokenProvider, logProvider?: LogProvider) {
    this.tokenProvider = tokenProvider;
    this.logProvider = logProvider;
  }

  private createRequesterWithToken(token: string): AxiosInstance {
    const instance = WrappedAxiosClient.create({
      baseURL: this.baseUrl,
    });
    instance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    return instance;
  }

  @hooks([ErrorContextMW({ source: "Graph", component: "GraphAPIClient" })])
  async listSensitivityLabels(
    token: string,
    useCache = false
  ): Promise<Result<SensitivityLabel[], FxError>> {
    try {
      const userInfo = await this.getCurrentUserInfo();
      const accountUniqueName = userInfo[0];
      const tenantId = userInfo[1];

      if (useCache && accountUniqueName && tenantId) {
        // TTK supports switching tenant, so we need to add tenantId in the cache key.
        const cacheKey = this.buildCacheKey(accountUniqueName, tenantId);
        const cacheValueRes = await globalStateGet(cacheKey);
        if (cacheValueRes) {
          const timeStamp = cacheValueRes.unixTimestamp;
          // if cache data is within 1 day, use the cache.
          if (Date.now() - timeStamp < 1000 * 60 * 60 * 24) {
            return ok(cacheValueRes.labels);
          }
        }
      }
      const requester = WrappedAxiosClient.create({
        baseURL: this.baseUrl,
      });
      requester.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      requester.defaults.headers.common["Content-Type"] = "application/json";

      const response = await RetryHandler.Retry(() => requester.get(listSensitivityLabelAPIPath));

      if (response && response.data && response.data.value) {
        if (accountUniqueName && tenantId) {
          // always update the cache if the user is signed in.
          const cacheKey = this.buildCacheKey(accountUniqueName, tenantId);
          // only retrieve the necessary properties from the response.data.value
          const labels = response.data.value.map(
            (label: any) =>
              ({
                id: label?.id,
                name: label?.name,
                description: label?.description,
                displayName: label?.displayName,
              }) as SensitivityLabel
          );
          const cacheValue: ListSensitivityCacheValue = {
            labels: labels,
            unixTimestamp: Date.now(),
          };
          await globalStateUpdate(cacheKey, cacheValue);
        }
        return ok(response.data.value);
      } else {
        return err(
          new SystemError({
            name: "listSensitivityLabelsError",
            message: getDefaultString(
              "error.graphAPI.apiFailed.message",
              "listSensitivityLabels",
              "empty data"
            ),
            source: errorSourceName,
          })
        );
      }
    } catch (error: any) {
      return err(
        new SystemError({
          name: "listSensitivityLabelsError",
          message: getDefaultString(
            "error.graphAPI.apiFailed.message",
            "listSensitivityLabels",
            error.message
          ),
          source: errorSourceName,
        })
      );
    }
  }

  async getGeneralSentivityLabel(token: string): Promise<Result<SensitivityLabel, FxError>> {
    const result = await this.listSensitivityLabels(token);
    if (result.isErr()) {
      return err(result.error);
    }
    const labels = result.value;
    const generalLabel = labels.find((label) => label.displayName === GeneralLabelDisplayName);
    if (generalLabel && generalLabel.id) {
      return ok(generalLabel);
    } else {
      return err(
        new SystemError({
          name: "getGeneralSentivityLabelError",
          message: getDefaultString(
            "error.graphAPI.apiFailed.message",
            "getGeneralSentivityLabelId",
            "General label not found"
          ),
          source: errorSourceName,
        })
      );
    }
  }

  private buildCacheKey(accountUniqueName: string, tenantId: string): string {
    return `${listSensitivityLabelCacheKeyPrefix}:${tenantId}:${accountUniqueName}`;
  }

  /**
   * Get sandboxing configuration of team app settings.
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async GetTeamsAppSettingsAsync(): Promise<GetTeamsAppSettingsResponse> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsAppSettingsReadScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const response = await requester.get(
      `/teamwork/teamsAppSettings?$select=sandboxingConfiguration`
    );
    return <GetTeamsAppSettingsResponse>response.data;
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async GetJoinedSandboxedTeamsAsync(): Promise<GetJoinedTeamsResponse> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsTeamReadScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const response = await requester.get(`/me/joinedTeams?isSandboxedTeam=true`);
    return <GetJoinedTeamsResponse>response.data.value;
  }

  /**
   * Get weburl of a channel.
   * @param teamId
   * @param channelId
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async GetChannelDeeplinkAsync(teamId: string, channelId: string): Promise<string> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsChannelReadScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const response = await requester.get(`/teams/${teamId}/channels/${channelId}`);
    const data = <GetChannelResponse>response.data;
    return data.webUrl;
  }

  /**
   * Install Teams app package into a channel.
   * @param teamId
   * @param channelId
   * @param file Teams app package zip file
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async InstallAppToChannelAsync(
    teamId: string,
    channelId: string,
    file: Buffer
  ): Promise<void> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsInstallAppScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    await requester.post(`/teams/${teamId}/installedApps?targetChannelId=${channelId}`, file, {
      headers: { "Content-Type": "application/zip" },
    });
  }

  /**
   * Get installed apps in a team.
   * @param teamId
   * @returns An array of installed apps, the externalId is the Teams app id.
   */
  public async GetAppInstallationForTeam(teamId: string): Promise<GetAppInstallationResponse[]> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsInstallAppScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const response = await requester.get(`/teams/${teamId}/installedApps?$expand=teamsapp`);
    return <GetAppInstallationResponse[]>response.data.value;
  }

  public async DeleteInstalledApp(teamId: string, installationId: string): Promise<void> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsInstallAppScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    await requester.delete(`/teams/${teamId}/installedApps/${installationId}`);
  }

  public async getStagedApp(
    token: string,
    teamsAppExternalId: string
  ): Promise<IPublishingAppDenition | undefined> {
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.get(
          `${teamsAppsPath}?$filter=externalId eq '${teamsAppExternalId}'&$expand=appDefinitions`
        )
      );
      if (!response?.data?.value || response.data.value.length === 0) {
        return undefined;
      }

      const appDefinitions = response.data.value[0].appDefinitions;
      if (!Array.isArray(appDefinitions) || appDefinitions.length === 0) {
        return undefined;
      }

      const latest = appDefinitions[appDefinitions.length - 1];
      return {
        lastModifiedDateTime: latest.lastModifiedDateTime
          ? new Date(latest.lastModifiedDateTime)
          : null,
        publishingState: latest.publishingState as PublishingState,
        teamsAppId: response.data.value[0].id,
        displayName: response.data.value[0].displayName,
      };
    } catch {
      return undefined;
    }
  }

  public async publishTeamsApp(
    token: string,
    teamsAppExternalId: string,
    file: Buffer
  ): Promise<string> {
    try {
      const requester = this.createRequesterWithToken(token);
      const response = await RetryHandler.Retry(() =>
        requester.post(`${teamsAppsPath}?requiresReview=true`, file, {
          headers: { "Content-Type": "application/zip" },
        })
      );

      if (response?.data?.error) {
        if (response.data.error.code === "BadGateway") {
          const appDefinition = await this.getStagedApp(token, teamsAppExternalId);
          if (appDefinition) {
            return appDefinition.teamsAppId;
          }
        }

        if (
          response.data.error.code === "Conflict" &&
          response.data.error.innerError?.code === "AppDefinitionAlreadyExists"
        ) {
          return await this.publishTeamsAppUpdate(token, teamsAppExternalId, file);
        }

        const errorMessage =
          response.data.error?.message || JSON.stringify(response.data.error) || "unknown error";
        throw new Error(
          getDefaultString("error.graphAPI.apiFailed.message", "publishTeamsApp", errorMessage)
        );
      }

      if (response?.data?.id) {
        return response.data.id;
      }

      const staged = await this.getStagedApp(token, teamsAppExternalId);
      if (staged?.teamsAppId) {
        return staged.teamsAppId;
      }

      throw new Error(
        getDefaultString(
          "error.graphAPI.apiFailed.message",
          "publishTeamsApp",
          "Graph publish teams app failed with empty response."
        )
      );
    } catch (error: any) {
      if (error?.response?.status === 409) {
        return await this.publishTeamsAppUpdate(token, teamsAppExternalId, file);
      }
      throw new Error(
        getDefaultString(
          "error.graphAPI.apiFailed.message",
          "publishTeamsApp",
          this.getGraphErrorMessage(error)
        )
      );
    }
  }

  public async publishTeamsAppUpdate(
    token: string,
    teamsAppExternalId: string,
    file: Buffer
  ): Promise<string> {
    try {
      const requester = this.createRequesterWithToken(token);
      const appDefinition = await this.getStagedApp(token, teamsAppExternalId);
      if (!appDefinition) {
        throw new Error(
          getDefaultString(
            "error.graphAPI.apiFailed.message",
            "publishTeamsAppUpdate",
            `Published app does not exist for externalId: ${teamsAppExternalId}`
          )
        );
      }

      const response = await RetryHandler.Retry(() =>
        requester.post(
          `${teamsAppsPath}/${appDefinition.teamsAppId}/appDefinitions?requiresReview=true`,
          file,
          {
            headers: { "Content-Type": "application/zip" },
          }
        )
      );

      if (response?.data?.error || response?.data?.errorMessage) {
        const errorMessage =
          response.data.error?.message || response.data.errorMessage || "unknown error";
        throw new Error(
          getDefaultString(
            "error.graphAPI.apiFailed.message",
            "publishTeamsAppUpdate",
            errorMessage
          )
        );
      }
      if (response?.data?.teamsAppId) {
        return response.data.teamsAppId;
      }
      if (response?.data?.id) {
        return response.data.id;
      }
      return appDefinition.teamsAppId;
    } catch (error: any) {
      throw new Error(
        getDefaultString(
          "error.graphAPI.apiFailed.message",
          "publishTeamsAppUpdate",
          this.getGraphErrorMessage(error)
        )
      );
    }
  }

  private getGraphErrorMessage(error: any): string {
    const responseError = error?.response?.data?.error;
    const details = responseError?.innerError?.details;
    const detailMessage = Array.isArray(details)
      ? details
          .map((detail: any) => detail?.message)
          .filter(Boolean)
          .join("; ")
      : undefined;
    return (
      detailMessage ||
      responseError?.message ||
      error?.response?.data?.errorMessage ||
      error?.message ||
      "unknown error"
    );
  }

  /**
   * Create a sandboxed team and a channel.
   * @param teamName Team name
   * @param description Team description
   * @param defaultChannelName Channel name
   * @returns
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async CreateTeamAndChannelAsync(
    teamName: string,
    description: string,
    defaultChannelName: string
  ): Promise<CreateTeamAndChannelResponse> {
    const LocationRegex = /teams\('([0-9a-fA-F-]{36})'\)\/operations\('([0-9a-fA-F-]{36})'/;
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: [
        ...GraphTeamsTeamCreateScopes,
        ...GraphTeamsTeamReadScopes,
        ...GraphTeamsChannelReadScopes,
      ],
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const teamData = {
      "template@odata.bind": `${getResourceServiceEndpoint(
        ResourceServiceType.Graph
      )}/beta/teamsTemplates('standard')`,
      displayName: teamName,
      description: description,
      firstChannelName: defaultChannelName,
    };

    const response = await requester.post(`/teams?isSandboxedTeam=true`, teamData);
    const location = response.headers.location;

    if (location) {
      // this.logProvider?.info(`Location header: ${location}`);
      const match = location.match(LocationRegex);
      if (match) {
        const teamId = match[1];
        let status = await requester.get(location);

        // Query team creation status, until it's succeeded
        while (status.data.status !== "succeeded") {
          await waitSeconds(5);
          const message = getLocalizedString("driver.devChannel.status", status.data.status);
          this.logProvider?.info(message);
          status = await requester.get(location);
        }

        // Get Channel ID
        const channels = await this.GetChannelsInTeamAsync(teamId);
        const channel = channels.find((channel) => channel.displayName === defaultChannelName);
        if (channel) {
          const channelId = channel.id;
          return {
            teamId: teamId,
            channelId: channelId,
          };
        } else {
          throw new Error(`Failed to find channel with name: ${defaultChannelName}`);
        }
      } else {
        throw new Error("Failed to parse location header.");
      }
    } else {
      throw new Error("Failed to create team and channel.");
    }
  }

  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async CreateChannelAsync(
    teamId: string,
    channelName: string,
    description: string
  ): Promise<CreateChannelResponse> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsChannelCreateScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const channelData = {
      displayName: channelName,
      description: description,
      membershipType: "standard",
    };

    const response = await requester.post(`/teams/${teamId}/channels`, channelData);
    return <CreateChannelResponse>response.data;
  }

  /**
   * List channels in a team
   * @param teamId Team ID
   * @returns A list of channels, with id and webUrl
   */
  @hooks([ErrorContextMW({ source: "Teams", component: "GraphClient" })])
  public async GetChannelsInTeamAsync(teamId: string): Promise<GetChannelResponse[]> {
    const tokenResponse = await this.tokenProvider.getAccessToken({
      scopes: GraphTeamsChannelReadScopes,
    });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);

    const response = await requester.get(`/teams/${teamId}/channels`);
    return <GetChannelResponse[]>response.data.value;
  }

  /**
   * Get current user info
   * @returns unique name and tenant id in string array
   */
  public async getCurrentUserInfo(): Promise<string[]> {
    // check if user has already logged in to the sensitivity label scope
    const loginStatusRes = await this.tokenProvider.getStatus({
      scopes: [ListSensitivityLabelScope],
    });
    if (
      !loginStatusRes ||
      loginStatusRes.isErr() ||
      loginStatusRes.value.status != signedIn ||
      !loginStatusRes.value.token
    ) {
      return ["", ""];
    }
    let accountUniqueName = "";
    let tenantId = "";
    const accountInfo = loginStatusRes.value.accountInfo;
    if (typeof accountInfo?.["unique_name"] === "string") {
      accountUniqueName = accountInfo?.["unique_name"];
    }
    if (typeof accountInfo?.["tid"] === "string") {
      tenantId = accountInfo?.["tid"];
    }
    return [accountUniqueName, tenantId];
  }

  public async getUserInfoFromId(id: string): Promise<User | undefined> {
    const tokenResponse = await this.tokenProvider.getAccessToken({ scopes: GraphScopes });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);
    const response = await requester.get(`/users/${id}`);
    if (!response || !response.data) {
      return undefined;
    }

    return <User>response.data;
  }

  public async getGroupInfo(email: string): Promise<Group | undefined> {
    const tokenResponse = await this.tokenProvider.getAccessToken({ scopes: GroupSearchScopes });
    if (tokenResponse.isErr()) {
      throw tokenResponse.error;
    }
    const requester = this.createRequesterWithToken(tokenResponse.value);
    const res = await requester.get(`/groups?$filter=startsWith(mail,'${email}')`);
    if (!res || !res.data || !res.data.value) {
      return undefined;
    }

    const group = res.data.value.find(
      (group: any) => group.mail?.toLowerCase() === email.toLowerCase()
    );

    if (!group) {
      return undefined;
    }

    return <Group>group;
  }
}
