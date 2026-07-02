// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  CreateAxiosDefaults,
  InternalAxiosRequestConfig,
} from "axios";
import { HttpMethod } from "../component/constant/commonConstant";
import {
  APP_STUDIO_API_NAMES,
  Constants,
  GRAPH_API_NAMES,
} from "../component/driver/teamsApp/constants";
import {
  TelemetryPropertyKey,
  TelemetryPropertyValue,
} from "../component/driver/teamsApp/utils/telemetry";
import { MOS3Api, MOS3ApiDefinitions } from "../component/m365/serviceConstant";
import { DeveloperPortalAPIFailedSystemError } from "../error/teamsApp";
import { TOOLS } from "./globalVars";
import { getDefaultString } from "./localizeUtils";
import { TEAMS_GRAPH_API_NAMES } from "./teamsGraphApiNames";
import { TelemetryEvent, TelemetryProperty, TelemetrySuccess } from "./telemetry";

/**
 * This client will send telemetries to record API request trace
 */
export class WrappedAxiosClient {
  public static create(config?: CreateAxiosDefaults): AxiosInstance {
    const instance = axios.create(config);

    instance.interceptors.request.use((request) => this.onRequest(request));

    instance.interceptors.response.use(
      (response) => this.onResponse(response),
      (error) => this.onRejected(error)
    );

    return instance;
  }

  /**
   * Send API start telemetry
   * @param request
   */
  public static onRequest(request: InternalAxiosRequestConfig) {
    const method = request.method!;
    const fullPath = `${request.baseURL ?? ""}${request.url ?? ""}`;
    const apiName = this.convertUrlToApiName(fullPath, method);

    const properties: { [key: string]: string } = {
      url: `<${apiName}-url>`,
      method: method,
      params: this.generateParameters(request.params),
      ...this.generateExtraProperties(fullPath, request.data),
    };
    const eventName = this.getEventName(fullPath);
    TOOLS?.telemetryReporter?.sendTelemetryEvent(`${eventName}-start`, properties);
    return request;
  }

  /**
   * Send API success telemetry
   * @param response
   * @returns
   */
  public static onResponse(response: AxiosResponse) {
    const method = response.request.method;
    const fullPath = `${response.config.baseURL ?? ""}${response.config.url ?? ""}`;
    const apiName = this.convertUrlToApiName(fullPath, method);

    const properties: { [key: string]: string } = {
      url: `<${apiName}-url>`,
      method: method.toLowerCase(),
      params: this.generateParameters(response.config.params),
      [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      "status-code": response.status.toString(),
      ...this.generateExtraProperties(fullPath, response.data),
    };

    const eventName = this.getEventName(fullPath);
    TOOLS?.telemetryReporter?.sendTelemetryEvent(eventName, properties);
    return response;
  }

  /**
   * Send API failure telemetry
   * @param error
   * @returns
   */
  public static onRejected(error: AxiosError) {
    // Telemetry must never throw, otherwise the synthetic error will mask the
    // real transport-level failure (TLS handshake, ECONNRESET on a kept-alive
    // socket, etc.) returned to the caller. See AB#37640864.
    try {
      const method = ((error.request?.method as string) ?? error.config?.method ?? "").toString();
      const fullPath = `${error.config?.baseURL ?? ""}${error.config?.url ?? ""}`;
      const apiName = this.convertUrlToApiName(fullPath, method);

      let requestData: any;
      if (error.config?.data && typeof error.config.data === "string") {
        try {
          requestData = JSON.parse(error.config.data);
        } catch (error) {
          requestData = undefined;
        }
      }
      const properties: { [key: string]: string } = {
        url: `<${apiName}-url>`,
        method: method,
        params: this.generateParameters(error.config?.params),
        [TelemetryProperty.Success]: TelemetrySuccess.No,
        [TelemetryProperty.ErrorMessage]: error.response
          ? JSON.stringify(error.response.data)
          : error.message ?? "undefined",
        "status-code": error.response?.status.toString() ?? "undefined",
        ...this.generateExtraProperties(fullPath, requestData),
      };

      const eventName = this.getEventName(fullPath);
      if (eventName === TelemetryEvent.AppStudioApi) {
        const correlationId =
          (error.response?.headers
            ? error.response.headers[Constants.CORRELATION_ID]
            : undefined) ?? "undefined";

        const extraData = getDefaultString(
          "error.appstudio.apiFailed.reason.common",
          error.response?.data ? `data: ${JSON.stringify(error.response.data)}` : ""
        );
        const TDPApiFailedError = new DeveloperPortalAPIFailedSystemError(
          error,
          correlationId as string,
          apiName,
          extraData
        );
        properties[TelemetryProperty.ErrorCode] =
          `${TDPApiFailedError.source}.${TDPApiFailedError.name}`;
        properties[TelemetryProperty.ErrorMessage] = TDPApiFailedError.message;
        properties[TelemetryProperty.TDPTraceId] = correlationId as string;
      } else if (eventName === TelemetryEvent.MOSApi) {
        const tracingId = (error.response?.headers?.traceresponse ?? "undefined") as string;
        const originalMessage = error.message;
        const responseData = error.response?.data;
        const innerError =
          responseData && typeof responseData === "object"
            ? (responseData as any).error ?? { code: "", message: "" }
            : { code: "", message: "" };
        const finalMessage = `${originalMessage} (tracingId: ${tracingId}) ${
          (innerError.code as string) ?? ""
        }: ${(innerError.message as string) ?? ""} `;
        properties[TelemetryProperty.ErrorMessage] = finalMessage;
        properties[TelemetryProperty.MOSTraceId] = tracingId;
      } else if (eventName === TelemetryEvent.TeamsGraphApi) {
        const correlationId =
          error.response?.headers?.["x-correlation-id"] ??
          error.response?.headers?.["request-id"] ??
          error.response?.headers?.["x-ms-request-id"] ??
          "undefined";
        properties[TelemetryProperty.TeamsGraphTraceId] = correlationId;
      }

      TOOLS?.telemetryReporter?.sendTelemetryErrorEvent(eventName, properties);
    } catch {
      // Swallow telemetry errors so we always reject with the original error.
    }
    return Promise.reject(error);
  }

  static convertMethodUrlToApiDefForMOS(method: string, url: string): MOS3Api | undefined {
    const upperMethod = (method ?? "").toUpperCase();
    for (const key of Object.keys(MOS3ApiDefinitions)) {
      const api = MOS3ApiDefinitions[key];
      if (api.method === upperMethod && url.match(api.path)) {
        return api;
      }
    }
    return undefined;
  }

  /**
   * Convert request URL to API name, otherwise it will be redacted in telemetry
   * This function should be extended when new API is added
   * @param baseUrl
   * @param path
   * @param method
   * @returns
   */
  public static convertUrlToApiName(fullPath: string, method: string): string {
    const upperMethod = (method ?? "").toUpperCase();

    if (this.isTDPApi(fullPath)) {
      if (fullPath.match(new RegExp("/api/aadapp/v2"))) {
        return APP_STUDIO_API_NAMES.CREATE_AAD_APP;
      }
      if (fullPath.match(new RegExp("/api/appdefinitions/partnerCenterAppPackageValidation"))) {
        return APP_STUDIO_API_NAMES.VALIDATE_APP_PACKAGE;
      }
      if (fullPath.match(new RegExp("/api/appdefinitions/v2/import"))) {
        return APP_STUDIO_API_NAMES.CREATE_APP;
      }
      if (fullPath.match(new RegExp("/api/appdefinitions/manifest"))) {
        return APP_STUDIO_API_NAMES.EXISTS_IN_TENANTS;
      }
      if (fullPath.match(new RegExp("/api/appdefinitions/.*/manifest"))) {
        return APP_STUDIO_API_NAMES.GET_APP_PACKAGE;
      }
      if (fullPath.match(new RegExp("/api/appdefinitions/.*/owner"))) {
        return APP_STUDIO_API_NAMES.UPDATE_OWNER;
      }
      if (
        fullPath.match(
          new RegExp(
            /\/api\/appdefinitions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
          )
        )
      ) {
        if (upperMethod === HttpMethod.GET) {
          return APP_STUDIO_API_NAMES.GET_APP;
        }
        if (upperMethod === HttpMethod.DELETE) {
          return APP_STUDIO_API_NAMES.DELETE_APP;
        }
      }
      if (fullPath.match(new RegExp("/api/appdefinitions"))) {
        return APP_STUDIO_API_NAMES.LIST_APPS;
      }
      if (fullPath.match(new RegExp("/api/publishing/.*/appdefinitions"))) {
        return APP_STUDIO_API_NAMES.UPDATE_PUBLISHED_APP;
      }
      if (fullPath.match(new RegExp("/api/publishing/.*"))) {
        return APP_STUDIO_API_NAMES.GET_PUBLISHED_APP;
      }
      if (fullPath.match(new RegExp("/api/publishing"))) {
        return APP_STUDIO_API_NAMES.PUBLISH_APP;
      }
      if (fullPath.match(new RegExp("/api/usersettings/mtUserAppPolicy"))) {
        return APP_STUDIO_API_NAMES.CHECK_SIDELOADING_STATUS;
      }
      if (fullPath.match(new RegExp("/api/v1.0/apiSecretRegistrations/.*"))) {
        if (upperMethod === HttpMethod.GET) {
          return APP_STUDIO_API_NAMES.GET_API_KEY;
        }
        if (upperMethod === HttpMethod.PATCH) {
          return APP_STUDIO_API_NAMES.UPDATE_API_KEY;
        }
      }
      if (fullPath.match(new RegExp("/api/v1.0/apiSecretRegistrations"))) {
        return APP_STUDIO_API_NAMES.CREATE_API_KEY;
      }
      if (
        fullPath.match(
          new RegExp(
            /\/api\/botframework\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
          )
        )
      ) {
        if (upperMethod === HttpMethod.GET) {
          return APP_STUDIO_API_NAMES.GET_BOT;
        }
        if (upperMethod === HttpMethod.POST) {
          return APP_STUDIO_API_NAMES.UPDATE_BOT;
        }
        if (upperMethod === HttpMethod.DELETE) {
          return APP_STUDIO_API_NAMES.DELETE_BOT;
        }
      }
      if (fullPath.match(new RegExp("/api/botframework"))) {
        if (upperMethod === HttpMethod.GET) {
          return APP_STUDIO_API_NAMES.LIST_BOT;
        }
        if (upperMethod === HttpMethod.POST) {
          return APP_STUDIO_API_NAMES.CREATE_BOT;
        }
      }
      if (fullPath.match(new RegExp("/api/v1.0/appvalidations/appdefinition/validate"))) {
        return APP_STUDIO_API_NAMES.SUBMIT_APP_VALIDATION;
      }
      if (
        fullPath.match(
          new RegExp(
            "/api/v1.0/appvalidations/appdefinitions/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          )
        )
      ) {
        return APP_STUDIO_API_NAMES.GET_APP_VALIDATION_REQUESTS;
      }
      if (
        fullPath.match(
          new RegExp(
            "/api/v1.0/appvalidations/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
          )
        )
      ) {
        return APP_STUDIO_API_NAMES.GET_APP_VALIDATION_RESULT;
      }
      if (fullPath.match(new RegExp("/api/v1.0/oAuthConfigurations/.*"))) {
        if (upperMethod === HttpMethod.GET) {
          return APP_STUDIO_API_NAMES.GET_OAUTH;
        }
        if (upperMethod === HttpMethod.PATCH) {
          return APP_STUDIO_API_NAMES.UPDATE_OAUTH;
        }
      }
      if (fullPath.match(new RegExp("/api/v1.0/oAuthConfigurations"))) {
        return APP_STUDIO_API_NAMES.CREATE_OAUTH;
      }
    } else if (this.isGraphApi(fullPath)) {
      if (
        fullPath.match(new RegExp(/\/appCatalogs\/teamsApps\/[^/?]+\/appDefinitions/i)) &&
        upperMethod === HttpMethod.POST
      ) {
        return GRAPH_API_NAMES.UPDATE_PUBLISHED_APP;
      }
      if (
        fullPath.match(new RegExp(/\/appCatalogs\/teamsApps(\?.*)?$/i)) &&
        upperMethod === HttpMethod.POST
      ) {
        return GRAPH_API_NAMES.PUBLISH_APP;
      }
      if (
        (fullPath.match(new RegExp(/\/appCatalogs\/teamsApps(\?.*)?$/i)) ||
          fullPath.match(new RegExp(/\/appCatalogs\/teamsApps\/[^/?]+(\?.*)?$/i))) &&
        upperMethod === HttpMethod.GET
      ) {
        return GRAPH_API_NAMES.GET_PUBLISHED_APP;
      }
    } else if (this.isMOSApi(fullPath)) {
      // MOS API
      const relativePath = this.extractMOSPath(fullPath);
      const mosApiDef = this.convertMethodUrlToApiDefForMOS(method, relativePath);
      if (mosApiDef) {
        return `mos_${mosApiDef.key}`;
      } else {
        return `mos_unclassified_${relativePath.replace(/\//g, "_")}`;
      }
    } else if (this.isTeamsGraphApi(fullPath)) {
      if (fullPath.match(new RegExp("/v1\\.0/apiSecretRegistrations/.*"))) {
        if (method.toUpperCase() === HttpMethod.GET) {
          return TEAMS_GRAPH_API_NAMES.GET_API_KEY;
        }
        if (method.toUpperCase() === HttpMethod.PATCH) {
          return TEAMS_GRAPH_API_NAMES.UPDATE_API_KEY;
        }
      }
      if (fullPath.match(new RegExp("/v1\\.0/apiSecretRegistrations"))) {
        return TEAMS_GRAPH_API_NAMES.CREATE_API_KEY;
      }
      if (fullPath.match(new RegExp("/v1\\.0/oAuthConfigurations/.*"))) {
        if (method.toUpperCase() === HttpMethod.GET) {
          return TEAMS_GRAPH_API_NAMES.GET_OAUTH;
        }
        if (method.toUpperCase() === HttpMethod.PATCH) {
          return TEAMS_GRAPH_API_NAMES.UPDATE_OAUTH;
        }
      }
      if (fullPath.match(new RegExp("/v1\\.0/oAuthConfigurations"))) {
        return TEAMS_GRAPH_API_NAMES.CREATE_OAUTH;
      }
    }
    if (
      fullPath.match(
        new RegExp(/(^https:\/\/)?authsvc\.teams\.microsoft\.com\/v1\.0\/users\/region/)
      )
    ) {
      return "get-region";
    }
    return fullPath.replace(/\//g, `-`);
  }

  /**
   * Generate extra properties for specific requirements
   * @param baseUrl
   * @param path
   * @param method
   */
  private static generateExtraProperties(fullPath: string, data?: any): { [key: string]: string } {
    const properties: { [key: string]: string } = {};
    if (this.isTDPApi(fullPath)) {
      // Add region property
      properties[TelemetryPropertyKey.region] = String(this.extractRegion(fullPath));

      // Add bot id property
      if (fullPath.match(new RegExp("/api/botframework"))) {
        const regex = new RegExp(/\/api\/botframework\/([0-9a-fA-F-]+)/);
        const matches = regex.exec(fullPath);
        if (matches != null && matches.length > 1) {
          properties[TelemetryProperty.BotId] = matches[1];
        } else if (data?.botId) {
          properties[TelemetryProperty.BotId] = data.botId;
        }
      }
    }
    return properties;
  }

  /**
   * Extract region from baseUrl, E.g. https://dev.teams.microsoft.com/amer => amer
   * @param url
   * @returns
   */
  private static extractRegion(fullPath: string): string | undefined {
    const regex = /dev(-int)?\.teams\.microsoft\.com\/([a-zA-Z-_]+)\/api/;
    const matches = regex.exec(fullPath);
    if (matches != null && matches.length > 1) {
      return matches[2];
    }

    return TelemetryPropertyValue.Global;
  }

  /**
   * Check if it's TDP Api
   * @param baseUrl
   * @returns
   */
  private static isTDPApi(baseUrl: string): boolean {
    const regex = /(^https:\/\/)?dev(-int)?\.teams\.microsoft\.com/;
    const matches = regex.exec(baseUrl);
    return matches != null && matches.length > 0;
  }

  /**
   * Check if it's Graph Api
   * @param baseUrl
   * @returns
   */
  private static isGraphApi(baseUrl: string): boolean {
    const regex = /(^https:\/\/)?([\w.-]+\.)?graph\.microsoft\.(com|us)(:\d+)?(\/|$)/i;
    const matches = regex.exec(baseUrl);
    return matches != null && matches.length > 0;
  }

  private static isMOSApi(baseUrl: string): boolean {
    const mosRegex =
      /(^https:\/\/)?titles\.(prod|gccm)\.mos\.microsoft\.com|(^https:\/\/)?titles\.(gcch|dod)\.mos\.svc\.usgovcloud\.microsoft/;
    const matches = mosRegex.exec(baseUrl);
    return matches != null && matches.length > 0;
  }

  private static isTeamsGraphApi(baseUrl: string): boolean {
    const regex =
      /(^https:\/\/)?(teams\.microsoft\.com\/(gcc\/)?api\/platform|gov\.teams\.microsoft\.us\/api\/platform|dod\.teams\.microsoft\.us\/api\/platform)/;
    const matches = regex.exec(baseUrl);
    return matches != null && matches.length > 0;
  }

  private static extractMOSPath(fullPath: string): string {
    const mosRegex =
      /(^https:\/\/)?titles\.(prod|gccm)\.mos\.microsoft\.com|(^https:\/\/)?titles\.(gcch|dod)\.mos\.svc\.usgovcloud\.microsoft/;
    return fullPath.replace(mosRegex, "");
  }

  private static getEventName(
    baseUrl: string
  ):
    | TelemetryEvent.MOSApi
    | TelemetryEvent.AppStudioApi
    | TelemetryEvent.TeamsGraphApi
    | TelemetryEvent.DependencyApi {
    if (this.isTDPApi(baseUrl)) {
      return TelemetryEvent.AppStudioApi;
    } else if (this.isMOSApi(baseUrl)) {
      return TelemetryEvent.MOSApi;
    } else if (this.isTeamsGraphApi(baseUrl)) {
      return TelemetryEvent.TeamsGraphApi;
    } else {
      return TelemetryEvent.DependencyApi;
    }
  }

  /**
   * Flattern query parameters to string, e.g. {a: 1, b: 2} => a:1;b:2
   * @param params
   * @returns
   */
  private static generateParameters(params?: Record<string, unknown>): string {
    if (!params) {
      return "";
    }
    const parameters: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      parameters.push(`${key}:${value as string}`);
    }
    return parameters.join(";");
  }
}
