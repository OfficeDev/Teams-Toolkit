// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import axios, { AxiosInstance, AxiosRequestConfig, Method } from "axios";
import { ResourceGroupManager } from "./resourceGroupManager";
import * as msal from "@azure/msal-node";
import * as qs from "querystring";
import * as fs from "fs-extra";
import * as path from "path";
import { Env } from "./env";
import { dotenvUtil } from "./envUtil";
import { TestFilePath } from "./constants";
import {
  TunnelManagementHttpClient,
  ManagementApiVersions,
} from "@microsoft/dev-tunnels-management";

class CleanHelper {
  protected readonly axios: AxiosInstance;
  private readonly maxRetries = 6;

  constructor(url: string, token: string) {
    this.axios = axios.create({
      baseURL: url,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });
  }

  protected async execute(method: Method, url: string, data?: any) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.axios.request({
          method: method,
          url: url,
          data: data,
        });
      } catch (e: unknown) {
        if (!this.shouldRetry(e) || attempt >= this.maxRetries) {
          throw e;
        }

        const waitMs = this.getRetryDelayMs(e, attempt);
        const message = e instanceof Error ? e.message : "Unknown error";
        console.log(
          `[Retry ${attempt}] ${message}. Wait ${waitMs}ms before retrying ${method.toUpperCase()} ${url}`,
        );
        await delay(waitMs);
      }
    }

    throw new Error(`Failed to execute request ${method.toUpperCase()} ${url}`);
  }

  private shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    return (
      status === 429 ||
      status === 408 ||
      (status !== undefined && status >= 500)
    );
  }

  private getRetryDelayMs(error: unknown, attempt: number): number {
    // Exponential backoff with a cap, plus small jitter to avoid synchronized bursts.
    const backoffMs = Math.min(60_000, 2_000 * Math.pow(2, attempt));
    const retryAfterMs = this.getServerSuggestedDelayMs(error);
    const baseDelayMs = Math.max(backoffMs, retryAfterMs ?? 0);
    const jitterMs = Math.floor(Math.random() * 500);
    return baseDelayMs + jitterMs;
  }

  private getServerSuggestedDelayMs(error: unknown): number | undefined {
    if (!axios.isAxiosError(error)) {
      return undefined;
    }

    const headers = error.response?.headers;
    if (!this.isRecord(headers)) {
      return undefined;
    }

    const retryAfterMs = this.toPositiveNumber(headers["x-ms-retry-after-ms"]);
    if (retryAfterMs !== undefined) {
      return retryAfterMs;
    }

    const retryAfterSeconds = this.toPositiveNumber(headers["retry-after"]);
    if (retryAfterSeconds !== undefined) {
      return retryAfterSeconds * 1000;
    }

    return undefined;
  }

  private toPositiveNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
      return value > 0 ? value : undefined;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    if (Array.isArray(value) && value.length > 0) {
      return this.toPositiveNumber(value[0]);
    }

    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

export class GraphApiCleanHelper extends CleanHelper {
  constructor(graphToken: string) {
    super("https://graph.microsoft.com/v1.0", graphToken);
  }

  public static async create(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<GraphApiCleanHelper> {
    const token = await this.getUserToken(
      tenantId,
      clientId,
      username,
      password,
    );
    return new GraphApiCleanHelper(token);
  }

  private static async getUserToken(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<string> {
    const config = {
      auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    };

    const usernamePasswordRequest = {
      scopes: ["https://graph.microsoft.com/.default"],
      username: username,
      // Need to encode password for special characters to workaround the MSAL bug:
      // https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/4326#issuecomment-995109619
      password: encodeURIComponent(password),
    };

    const pca = new msal.PublicClientApplication(config);
    const credential = await pca.acquireTokenByUsernamePassword(
      usernamePasswordRequest,
    );
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error("Failed to get token.");
    }
    return accessToken;
  }

  public async getUserIdByName(userName: string): Promise<string> {
    let accounts: any;
    const response = await this.execute("get", `/users`, undefined);
    if (response?.data?.value) {
      accounts = response?.data?.value;
    }
    for (const user of accounts) {
      if (user?.userPrincipalName === userName) {
        console.log(user?.id);
        return user?.id;
      }
    }
    return "";
  }

  public async listAad(): Promise<any[]> {
    const result: any[] = [];
    const response = await this.execute("get", `/applications`, undefined);
    if (response?.data?.value) {
      result.push(...(response?.data?.value as any[]));
    }

    let next = response?.data["@odata.nextLink"] as string;
    while (next) {
      const responseNext = await this.execute("get", next, undefined);
      next = responseNext?.data["@odata.nextLink"] as string;
      result.push(...(responseNext?.data?.value as any[]));
    }

    return result;
  }

  public async getAadObjectId(
    applicationId: string,
  ): Promise<string | undefined> {
    const result: any[] = [];
    const response = await this.execute("get", `/applications`, undefined);
    if (response?.data?.value) {
      result.push(...(response?.data?.value as any[]));
    }

    let next = response?.data["@odata.nextLink"] as string;
    while (next) {
      const responseNext = await this.execute("get", next, undefined);
      next = responseNext?.data["@odata.nextLink"] as string;
      result.push(...(responseNext?.data?.value as any[]));
    }

    for (const app of result) {
      if (app?.appId === applicationId) {
        return app?.id;
      }
    }
    return;
  }

  public async getAad(applicationObjectId: string): Promise<any | undefined> {
    const response = await this.execute(
      "get",
      `/applications/${applicationObjectId}`,
      undefined,
    );
    return response?.data;
  }

  public async deleteAad(objectId: string): Promise<void> {
    await this.execute("delete", `/applications/${objectId}`, undefined);
    await this.execute(
      "delete",
      `/directory/deletedItems/${objectId}`,
      undefined,
    );
  }

  public async listDeletedAad(): Promise<any[]> {
    const result: any[] = [];
    const response = await this.execute(
      "get",
      `/directory/deletedItems/microsoft.graph.application`,
      undefined,
    );
    if (response?.data?.value) {
      result.push(...(response?.data?.value as any[]));
    }

    let next = response?.data["@odata.nextLink"] as string;
    while (next) {
      const responseNext = await this.execute("get", next, undefined);
      next = responseNext?.data["@odata.nextLink"] as string;
      result.push(...(responseNext?.data?.value as any[]));
    }

    return result;
  }

  public async listEnterpriseApplications(): Promise<any[]> {
    const result: any[] = [];
    const response = await this.execute("get", `/servicePrincipals`, undefined);
    if (response?.data?.value) {
      result.push(...(response?.data?.value as any[]));
    }

    let next = response?.data["@odata.nextLink"] as string;
    while (next) {
      const responseNext = await this.execute("get", next, undefined);
      next = responseNext?.data["@odata.nextLink"] as string;
      result.push(...(responseNext?.data?.value as any[]));
    }

    return result;
  }

  public async deleteEnterpriseApplication(id: string): Promise<void> {
    await this.execute("delete", `/servicePrincipals/${id}`, undefined);
    await this.execute("delete", `/directory/deletedItems/${id}`, undefined);
  }

  public async listDeletedEnterpriseApplications(): Promise<any[]> {
    const result: any[] = [];
    const response = await this.execute(
      "get",
      `/directory/deletedItems/microsoft.graph.servicePrincipal?$top=999`,
      undefined,
    );
    if (response?.data?.value) {
      result.push(...(response?.data?.value as any[]));
    }

    let next = response?.data["@odata.nextLink"] as string;
    while (next) {
      const responseNext = await this.execute("get", next, undefined);
      next = responseNext?.data["@odata.nextLink"] as string;
      result.push(...(responseNext?.data?.value as any[]));
    }

    return result;
  }

  public async deleteDeletedItem(id: string): Promise<void> {
    await this.execute("delete", `/directory/deletedItems/${id}`, undefined);
  }

  public async listTeamsApp(userId: string): Promise<any | undefined> {
    const response = await this.execute(
      "get",
      `/users/${userId}/teamwork/installedApps?$expand=teamsAppDefinition`,
    );
    return response?.data?.value;
  }

  public async getInstalledTeamsAppId(
    userId: string,
    displayName: string,
  ): Promise<string> {
    const response = await this.execute(
      "get",
      `/users/${userId}/teamwork/installedApps?$expand=teamsAppDefinition&$filter=teamsAppDefinition/displayName eq '${displayName}'`,
    );
    const results = response?.data?.value as any[];
    if (!results || results.length < 1) {
      throw new Error("Could not found user installed this App.");
    }

    return results[0].id;
  }

  public async uninstallTeamsApp(
    userId: string,
    installationId: string,
  ): Promise<void> {
    await this.execute(
      "delete",
      `/users/${userId}/teamwork/installedApps/${installationId}`,
      undefined,
    );
  }
}

export class SharePointApiCleanHelper extends CleanHelper {
  constructor(token: string) {
    const domainName = Env.username.match(/(?<=@)\w+?(?=\.)/i);
    const sharePointSite = domainName + ".sharepoint.com";
    const url = "https://" + sharePointSite + "/sites/appcatalog";
    super(url, token);
  }

  public static async create(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<SharePointApiCleanHelper> {
    const token = await this.getSharePointUserToken(
      tenantId,
      clientId,
      username,
      password,
    );
    return new SharePointApiCleanHelper(token);
  }

  private static async getSharePointUserToken(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<string> {
    const config = {
      auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    };
    const domainName = username.match(/(?<=@)\w+?(?=\.)/i);
    const sharePointSite = domainName + ".sharepoint.com";
    const usernamePasswordRequest = {
      scopes: [`https://${sharePointSite}/AllSites.FullControl`],
      username: username,
      // Need to encode password for special characters to workaround the MSAL bug:
      // https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/4326#issuecomment-995109619
      password: encodeURIComponent(password),
    };

    const pca = new msal.PublicClientApplication(config);
    const credential = await pca.acquireTokenByUsernamePassword(
      usernamePasswordRequest,
    );
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error("Failed to get token.");
    }
    return accessToken;
  }

  public async listApp(): Promise<any[]> {
    const result: any[] = [];
    const response = await this.execute(
      "get",
      `/_api/web/tenantappcatalog/AvailableApps`,
      undefined,
    );
    if (response?.data?.value) {
      result.push(...(response?.data?.value as any[]));
    }

    let next = response?.data["@odata.nextLink"] as string;
    while (next) {
      const responseNext = await this.execute("get", next, undefined);
      next = responseNext?.data["@odata.nextLink"] as string;
      result.push(...(responseNext?.data?.value as any[]));
    }

    return result;
  }

  public async deleteApp(appId: string): Promise<void> {
    await this.execute(
      "post",
      `/_api/web/tenantappcatalog/AvailableApps/GetById('${appId}')/Remove`,
      undefined,
    );
  }
}

export class AppStudioCleanHelper extends CleanHelper {
  constructor(token: string) {
    super("https://dev.teams.microsoft.com", token);
  }

  public static async create(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<AppStudioCleanHelper> {
    const token = await this.getAppStudioUserToken(
      tenantId,
      clientId,
      username,
      password,
    );
    return new AppStudioCleanHelper(token);
  }

  private static async getAppStudioUserToken(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ) {
    const data = qs.stringify({
      client_id: "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0",
      scope: "https://dev.teams.microsoft.com/AppDefinitions.ReadWrite",
      username: username,
      password: password,
      grant_type: "password",
    });

    const config: AxiosRequestConfig = {
      method: "post",
      url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie:
          "fpc=AmzaQu9yHbpLtMD2LmHazdRCGxwGAQAAAIW47NcOAAAA; x-ms-gateway-slice=estsfd; stsservicecookie=estsfd",
      },
      data: data,
    };

    const response = await axios(config);
    return response?.data?.access_token;
  }

  public async getApiKeyRegistration() {
    const response = await this.execute(
      "get",
      `/api/v1.0/apiSecretRegistrations`,
    );
    const results = response?.data?.value as any[];
    // if (!results || results.length < 1) {
    //   throw new Error("Could not found apps in AppStudio.");
    // }
    return results;
  }

  public async deleteApiKeyRegistration(apiKeyId: string) {
    await this.execute(
      "delete",
      `/api/v1.0/apiSecretRegistrations/${apiKeyId}`,
      undefined,
    );
  }

  public async getAppsInAppStudio() {
    const response = await this.execute("get", `/api/identityapps`);
    const results = response?.data?.apps as any[];
    // if (!results || results.length < 1) {
    //   throw new Error("Could not found apps in AppStudio.");
    // }
    return results;
  }

  public async deleteAppInAppStudio(appId: string) {
    await this.execute("delete", `/api/appdefinitions/${appId}`, undefined);
  }

  public async getAppInAdminPortal(appId: string) {
    const response = await this.execute("get", `/api/publishing/${appId}`);
    const results = response?.data?.value as any[];
    if (!results || results.length < 1) {
      throw new Error("Could not found apps in App Admin Portal.");
    }
    return results;
  }

  public async cancelStagedAppInAdminPortal(app: any) {
    const appId = app[0]?.id;
    const appDefinitions = app[0]?.appDefinitions;
    const appDefinistionId = appDefinitions[0]?.id;
    await this.execute(
      "delete",
      `/api/publishing/${appId}/appdefinitions/${appDefinistionId}`,
      undefined,
    );
  }
}

export class M365TitleCleanHelper extends CleanHelper {
  constructor(token: string) {
    super("https://titles.prod.mos.microsoft.com", token);
  }

  public static async create(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<M365TitleCleanHelper> {
    const token = await this.getUserToken(
      tenantId,
      clientId,
      username,
      password,
    );
    return new M365TitleCleanHelper(token);
  }

  private static async getUserToken(
    tenantId: string,
    clientId: string,
    username: string,
    password: string,
  ): Promise<string> {
    const config = {
      auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    };

    const usernamePasswordRequest = {
      scopes: ["https://titles.prod.mos.microsoft.com/.default"],
      username: username,
      // Need to encode password for special characters to workaround the MSAL bug:
      // https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/4326#issuecomment-995109619
      password: encodeURIComponent(password),
    };

    const pca = new msal.PublicClientApplication(config);
    const credential = await pca.acquireTokenByUsernamePassword(
      usernamePasswordRequest,
    );
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error("Failed to get token.");
    }
    return accessToken;
  }

  public async unacquire(id: string, retryTimes = 5) {
    if (!id) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>(async (resolve) => {
      for (let i = 0; i < retryTimes; i++) {
        try {
          await this.axios!.delete(`/catalog/v1/users/acquisitions/${id}`);
          console.info(`[Success] delete the M365 Title id: ${id}`);
          return resolve(true);
        } catch {
          console.log(`Retry to delete: ${id}`);
          // await delay(2000);
        }
      }
      console.error(`[Failed] delete the M365 Title with id: ${id}`);
      return resolve(false);
    });
  }

  public async listAcquisitions(): Promise<any[]> {
    const result: any[] = [];
    const response = await this.execute(
      "post",
      `/catalog/v1/users/acquisitions/get`,
      {
        Filter: {
          SupportedElementTypes: [
            "OfficeAddIns",
            "ExchangeAddIns",
            "FirstPartyPages",
            "Dynamics",
            "AAD",
            "LineOfBusiness",
            "StaticTabs",
            "ComposeExtensions",
            "Bots",
            "GraphConnector",
            "ConfigurableTabs",
            "Activities",
            "MeetingExtensionDefinition",
            "OpenAIPlugins",
            "Gpts",
            "DeclarativeCopilots",
            "Plugins",
          ],
        },
      },
    );

    if (response?.data?.acquisitions) {
      result.push(...(response?.data?.acquisitions as any[]));
    }
    return result;
  }
}

export class DevTunnelCleanHelper {
  private readonly tunnelManagementClientImpl: TunnelManagementHttpClient;
  constructor(token: string) {
    this.tunnelManagementClientImpl = new TunnelManagementHttpClient(
      "Teams-Toolkit-UI-TEST",
      ManagementApiVersions.Version20230927preview,
      () => Promise.resolve(`Bearer ${token}`),
    );
  }

  public static async create(
    tenantId: string,
    username: string,
    password: string,
  ): Promise<DevTunnelCleanHelper> {
    const token = await this.getToken(tenantId, username, password);
    return new DevTunnelCleanHelper(token);
  }

  private static async getToken(
    tenantId: string,
    username: string,
    password: string,
  ): Promise<string> {
    const config = {
      auth: {
        clientId: "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0",
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    };

    const usernamePasswordRequest = {
      scopes: ["46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2/.default"],
      username: username,
      password: encodeURIComponent(password),
    };

    const pca = new msal.PublicClientApplication(config);
    const credential = await pca.acquireTokenByUsernamePassword(
      usernamePasswordRequest,
    );
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error("Failed to get token.");
    }
    return accessToken;
  }

  public async delete(tunnelId: string, clusterId: string): Promise<void> {
    await this.tunnelManagementClientImpl.deleteTunnel({
      tunnelId: tunnelId,
      clusterId: clusterId,
    });
  }

  public async deleteAll(tag = "TeamsToolkitCreatedTag"): Promise<void> {
    const tunnels = await this.tunnelManagementClientImpl.listTunnels();
    for (const tunnel of tunnels) {
      if (tunnel?.labels?.includes(tag)) {
        console.log(`clean dev tunnel ${tunnel.tunnelId}`);
        await this.tunnelManagementClientImpl.deleteTunnel(tunnel);
      }
    }
  }
}

export async function cleanUpLocalProject(
  projectPath: string,
  necessary?: Promise<any>,
) {
  return new Promise<boolean>(async (resolve) => {
    try {
      await necessary;
      await fs.remove(projectPath);
      console.log(`[Successfully] clean up the local folder: ${projectPath}.`);
      return resolve(true);
    } catch (error) {
      console.log(`[Failed] clean up the local folder: ${projectPath}.`);
      return resolve(false);
    }
  });
}

export async function cleanUpResourceGroup(
  appName: string,
  envName?: string,
): Promise<boolean> {
  if (!appName) {
    return false;
  }
  const name = `${appName}-${envName}-rg`;
  return await deleteResourceGroupByName(name);
}

export async function createResourceGroup(
  appName: string,
  envName?: string,
  location?: string,
): Promise<boolean> {
  if (!appName) {
    return false;
  }
  const name = `${appName}-${envName}-rg`;
  return await createResourceGroupByName(name, location);
}

export async function createResourceGroupByName(
  name: string,
  location = "eastus",
): Promise<boolean> {
  const manager = await ResourceGroupManager.init();
  const result = await manager.createResourceGroup(name, location);
  if (result) {
    console.log(
      `[Successfully] create the Azure resource group with name: ${name}.`,
    );
  } else {
    console.error(
      `[Failed] create the Azure resource group with name: ${name}.`,
    );
  }
  return result;
}

export async function deleteResourceGroupByName(
  name: string,
): Promise<boolean> {
  const manager = await ResourceGroupManager.init();
  if (await manager.hasResourceGroup(name)) {
    const result = await manager.deleteResourceGroup(name);
    if (result) {
      console.log(
        `[Successfully] clean up the Azure resource group with name: ${name}.`,
      );
    } else {
      console.error(
        `[Failed] clean up the Azure resource group with name: ${name}.`,
      );
    }
    return result;
  }
  return false;
}

export async function filterResourceGroupByName(contains: string) {
  const manager = await ResourceGroupManager.init();
  const groups = await manager.searchResourceGroups(contains);
  return groups;
}

export async function cleanUpAadApp(
  projectPath: string,
  hasAadPlugin?: boolean,
  hasBotPlugin?: boolean,
  hasApimPlugin?: boolean,
  envName = "dev",
) {
  try {
    const userDataFile = path.join(
      TestFilePath.configurationFolder,
      `.env.${envName}`,
    );
    const configFilePath = path.resolve(projectPath, userDataFile);
    if (!fs.existsSync(configFilePath)) {
      return;
    }
    const context = dotenvUtil.deserialize(
      await fs.readFile(configFilePath, { encoding: "utf8" }),
    );
    const cleanService = await GraphApiCleanHelper.create(
      Env.cleanTenantId,
      Env.cleanClientId,
      Env.username,
      Env.password,
    );
    const promises: Promise<boolean>[] = [];

    const clean = async (objectId?: string) => {
      return new Promise<boolean>(async (resolve) => {
        if (objectId) {
          console.log(`delete AAD ${objectId}`);
          await cleanService.deleteAad(objectId);
          return resolve(true);
        }
        return resolve(false);
      });
    };

    if (hasAadPlugin) {
      const objectId = context.obj.AAD_APP_OBJECT_ID;
      promises.push(clean(objectId));
    }

    if (hasBotPlugin) {
      const botAppId = context.obj.BOT_ID;
      const objectId = await cleanService.getAadObjectId(botAppId);
      promises.push(clean(objectId));
    }

    if (hasApimPlugin) {
      // const objectId = context[apimPluginName].apimClientAADObjectId;
      // promises.push(clean(objectId));
    }

    return Promise.all(promises);
  } catch (e) {
    console.log(`Failed to clean up aad, error message: ${e.message}`);
    return;
  }
}

export async function cleanTeamsApp(appName: string) {
  try {
    const cleanService = await GraphApiCleanHelper.create(
      Env.cleanTenantId,
      Env.cleanClientId,
      Env.username,
      Env.password,
    );
    console.log(`uninstall teams app ${appName}`);
    const teamsUserId = await cleanService.getUserIdByName(Env.username);
    const installationId = await cleanService.getInstalledTeamsAppId(
      teamsUserId,
      appName,
    );
    await cleanService.uninstallTeamsApp(teamsUserId, installationId);
  } catch (e: any) {
    console.log(`Failed to uninstall teams app, error message: ${e.message}`);
  }
}

export async function cleanAppStudio(appName: string) {
  try {
    const addStudioCleanService = await AppStudioCleanHelper.create(
      Env.cleanTenantId,
      Env.cleanClientId,
      Env.username,
      Env.password,
    );
    const appStudioAppList = await addStudioCleanService.getAppsInAppStudio();
    console.log(`clean app ${appName} in app studio`);
    if (appStudioAppList) {
      for (const app of appStudioAppList) {
        if (app?.displayName?.startsWith(appName)) {
          console.log(app?.displayName);
          try {
            await addStudioCleanService.deleteAppInAppStudio(
              app?.appDefinitionId,
            );
          } catch {
            console.log(
              `Failed to delete Teams App ${app?.displayName} in App Studio`,
            );
          }
          break;
        }
      }
    }
  } catch (e: any) {
    console.log(
      `Failed to get apps in app studio, error message: ${e.message}`,
    );
  }
}

export async function cleanUpStagedPublishApp(appId: string) {
  try {
    const addStudioCleanService = await AppStudioCleanHelper.create(
      Env.cleanTenantId,
      Env.cleanClientId,
      Env.username,
      Env.password,
    );
    const app = await addStudioCleanService.getAppInAdminPortal(appId);
    console.log(`App name for ${appId}: ${app[0]?.displayName}`);
    console.log(`Cancel staged app ${appId} in admin portal`);
    if (app) {
      try {
        await addStudioCleanService.cancelStagedAppInAdminPortal(app);
      } catch {
        console.log(`Failed to cancel staged app ${appId} in admin portal`);
      }
    }
  } catch (e: any) {
    console.log(
      `Failed to get apps in admin portal, error message: ${e.message}`,
    );
  }
}

function delay(ms: number) {
  // tslint:disable-next-line no-string-based-set-timeout
  return new Promise((resolve) => setTimeout(resolve, ms));
}
