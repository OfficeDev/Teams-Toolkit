// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import { AxiosInstance } from "axios";
import { getResourceServiceEndpoint, ResourceServiceType } from "../common/constants";
import { ErrorContextMW } from "../common/globalVars";
import { RetryHandler } from "../common/retryHandler";
import { TEAMS_GRAPH_API_NAMES } from "../common/teamsGraphApiNames";
import { WrappedAxiosClient } from "../common/wrappedAxiosClient";
import {
  ApiSecretRegistration,
  ApiSecretRegistrationUpdate,
} from "../component/driver/teamsApp/interfaces/ApiSecretRegistration";
import { DcrRegistration } from "../component/driver/teamsApp/interfaces/DcrRegistration";
import { OauthConfigurationId } from "../component/driver/teamsApp/interfaces/OauthConfigurationId";
import { OauthRegistration } from "../component/driver/teamsApp/interfaces/OauthRegistration";
import { TeamsGraphAPIFailedSystemError } from "../error/teamsGraph";

export { TEAMS_GRAPH_API_NAMES } from "../common/teamsGraphApiNames";

export class TeamsGraphClient {
  getEndpoint(): string {
    return getResourceServiceEndpoint(ResourceServiceType.TeamsGraph);
  }

  createRequesterWithToken(token: string): AxiosInstance {
    const instance = WrappedAxiosClient.create({
      baseURL: this.getEndpoint(),
    });
    instance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    instance.defaults.headers.common["Client-Source"] = "agentstoolkit";
    return instance;
  }

  wrapException(e: any, apiName: string): Error {
    const headers = e.response?.headers;
    const correlationId =
      headers?.["x-correlation-id"] ?? headers?.["request-id"] ?? headers?.["x-ms-request-id"];
    let extraData = e.response?.data ? `data: ${JSON.stringify(e.response.data)}` : "";
    if (!e.message?.toLowerCase().includes("status code") && e.response?.status) {
      extraData = `Status code: ${e.response.status as string}. ${extraData}`;
    }
    return new TeamsGraphAPIFailedSystemError(e, correlationId, apiName, extraData);
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async getOauthRegistrationById(
    token: string,
    oauthRegistrationId: string
  ): Promise<OauthRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/v1.0/oAuthConfigurations/${oauthRegistrationId}`)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.GET_OAUTH);
    }
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async createOauthRegistration(
    token: string,
    oauthRegistration: OauthRegistration
  ): Promise<OauthConfigurationId> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/v1.0/oAuthConfigurations", oauthRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.CREATE_OAUTH);
    }
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async createDcrRegistration(
    token: string,
    dcrRegistration: DcrRegistration
  ): Promise<OauthConfigurationId> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/v1.0/dynamicConfigurations", dcrRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.CREATE_DCR);
    }
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async updateOauthRegistration(
    token: string,
    oauthRegistration: OauthRegistration,
    oauthRegistrationId: string
  ): Promise<OauthRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.patch(`/v1.0/oAuthConfigurations/${oauthRegistrationId}`, oauthRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.UPDATE_OAUTH);
    }
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async getApiKeyRegistrationById(
    token: string,
    apiKeyRegistrationId: string
  ): Promise<ApiSecretRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.get(`/v1.0/apiSecretRegistrations/${apiKeyRegistrationId}`)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.GET_API_KEY);
    }
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async createApiKeyRegistration(
    token: string,
    apiKeyRegistration: ApiSecretRegistration
  ): Promise<ApiSecretRegistration> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.post("/v1.0/apiSecretRegistrations", apiKeyRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.CREATE_API_KEY);
    }
  }

  @hooks([ErrorContextMW({ source: "TeamsGraph", component: "TeamsGraphClient" })])
  async updateApiKeyRegistration(
    token: string,
    apiKeyRegistration: ApiSecretRegistrationUpdate,
    apiKeyRegistrationId: string
  ): Promise<ApiSecretRegistrationUpdate> {
    const requester = this.createRequesterWithToken(token);
    try {
      const response = await RetryHandler.Retry(() =>
        requester.patch(`/v1.0/apiSecretRegistrations/${apiKeyRegistrationId}`, apiKeyRegistration)
      );
      return response?.data;
    } catch (e) {
      throw this.wrapException(e, TEAMS_GRAPH_API_NAMES.UPDATE_API_KEY);
    }
  }
}

export const teamsGraphClient = new TeamsGraphClient();
