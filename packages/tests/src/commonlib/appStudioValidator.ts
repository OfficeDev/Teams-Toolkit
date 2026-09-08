// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { AxiosInstance } from "axios";
import * as chai from "chai";

import MockM365TokenProvider from "@microsoft/m365agentstoolkit-cli/src/commonlib/m365LoginUserPassword";
import { M365TokenProvider } from "@microsoft/teamsfx-api";
import { AppStudioScopes } from "@microsoft/teamsfx-core";
import { IAppStudioObject } from "./interfaces/IAADDefinition";

const appStudioPluginName = "fx-resource-appstudio";

export class AppStudioValidator {
  public static provider: M365TokenProvider;

  public static setE2ETestProvider(): void {
    this.provider = MockM365TokenProvider;
  }

  public static init(ctx: any, provider?: M365TokenProvider) {
    AppStudioValidator.provider = provider || MockM365TokenProvider;

    const appStudioObject: IAppStudioObject | undefined =
      ctx[appStudioPluginName];
    chai.assert.exists(appStudioObject);

    console.log("Successfully init validator for App Studio.");
    return appStudioObject!;
  }

  public static async validatePublish(appId: string): Promise<void> {
    const appStudioTokenRes = await this.provider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    const appStudioToken = appStudioTokenRes.isOk()
      ? appStudioTokenRes.value
      : undefined;
    chai.assert.isNotEmpty(appStudioToken);

    const requester = this.createRequesterWithToken(appStudioToken!);
    const response = await requester.get(`/api/publishing/${appId}`);
    if (response.data.error) {
      chai.assert.fail(
        `Publish failed, code: ${response.data.error.code}, message: ${response.data.error.message}`,
      );
    }
  }

  public static async validateTeamsAppExist(
    appStudioObject: IAppStudioObject,
  ): Promise<void> {
    chai.assert.exists(appStudioObject.teamsAppId);
    await this.getApp(appStudioObject.teamsAppId!);
  }

  public static async deleteApp(teamsAppId: string): Promise<void> {
    const appStudioTokenRes = await this.provider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    const appStudioToken = appStudioTokenRes.isOk()
      ? appStudioTokenRes.value
      : undefined;
    chai.assert.isNotEmpty(appStudioToken);
    const requester = AppStudioValidator.createRequesterWithToken(
      appStudioToken!,
    );
    try {
      const response = await requester.delete(`/v1.0/apps/${teamsAppId}`);
      chai.assert.isTrue(response.status >= 200 && response.status < 300);
      return;
    } catch (e) {
      chai.assert.fail(`Failed to delete Teams App, error: ${e}`);
    }
  }

  /**
   * Cancel stagged app from Teams app catalog
   * The approved Teams app cannot be deleted by this API
   * @param teamsAppId Teams app id defined in manifest.json file
   */
  public static async cancelStagedAppInTeamsAppCatalog(
    teamsAppId?: string,
  ): Promise<void> {
    if (!teamsAppId) {
      console.warn("teamsAppId is undefined, no need to cancel staged app.");
      return;
    }
    const appStudioTokenRes = await this.provider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    const appStudioToken = appStudioTokenRes.isOk()
      ? appStudioTokenRes.value
      : undefined;
    chai.assert.isNotEmpty(appStudioToken);

    const requester = AppStudioValidator.createRequesterWithToken(
      appStudioToken!,
    );
    try {
      const response = await requester.get(`/api/publishing/${teamsAppId}`);
      const results = response?.data?.value as any[];
      if (results && results.length > 0) {
        const publishedAppId = results[0].id;
        const appDefinitionId = results[0].appDefinitions[0]?.id;
        if (publishedAppId && appDefinitionId) {
          const response = await requester.delete(
            `/api/publishing/${publishedAppId}/appdefinitions/${appDefinitionId}`,
          );
          chai.assert.isTrue(response.status >= 200 && response.status < 300);
          console.log(`Stagged app ${teamsAppId} has been cacelled.`);
        } else {
          console.warn(
            `Cannot cancel stagged app, published app id: ${publishedAppId} or app definition id: ${appDefinitionId} is undefined.`,
          );
        }
      } else {
        console.warn(
          `Cannot find stagged app ${teamsAppId} from Teams app catalog`,
        );
      }
    } catch (e) {
      chai.assert.fail(
        `Failed to cancel stagged app from Teams app catalog, error: ${e}`,
      );
    }
  }

  private static createRequesterWithToken(
    appStudioToken: string,
  ): AxiosInstance {
    const instance = axios.create({
      baseURL: "https://dev.teams.microsoft.com",
    });
    instance.defaults.headers.common["Authorization"] =
      `Bearer ${appStudioToken}`;
    return instance;
  }

  public static async checkWetherAppExists(
    teamsAppId: string,
  ): Promise<boolean> {
    const appStudioTokenRes = await this.provider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    const appStudioToken = appStudioTokenRes.isOk()
      ? appStudioTokenRes.value
      : undefined;
    if (!appStudioToken) {
      throw new Error("Failed to get token");
    }
    const requester =
      AppStudioValidator.createRequesterWithToken(appStudioToken);
    try {
      const response = await requester.get(`/v1.0/apps/${teamsAppId}`);
      const app = response.data;
      return app?.appId === teamsAppId;
    } catch (e) {
      return false;
    }
  }

  public static async getApp(teamsAppId: string): Promise<JSON> {
    const appStudioTokenRes = await this.provider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    const appStudioToken = appStudioTokenRes.isOk()
      ? appStudioTokenRes.value
      : undefined;
    chai.assert.isNotEmpty(appStudioToken);
    const requester = AppStudioValidator.createRequesterWithToken(
      appStudioToken!,
    );
    try {
      const response = await requester.get(`/v1.0/apps/${teamsAppId}`);
      chai.assert.isTrue(response && response.data);
      const app = response.data;
      chai.assert.equal(app?.appId, teamsAppId);
      return app;
    } catch (e) {
      chai.assert.fail(`Failed to get Teams App, error: ${e}`);
    }
  }
}
