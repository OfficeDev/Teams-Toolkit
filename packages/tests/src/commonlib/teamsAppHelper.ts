// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { M365TokenProvider } from "@microsoft/teamsfx-api";
import { AppStudioScopes } from "@microsoft/teamsfx-core";
import axios, { AxiosInstance } from "axios";
import MockM365TokenProvider from "@microsoft/m365agentstoolkit-cli/src/commonlib/m365LoginUserPassword";

function delay(ms: number) {
  // tslint:disable-next-line no-string-based-set-timeout
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TeamsAppHelper {
  private static instance: TeamsAppHelper;

  private axios: AxiosInstance;

  private constructor(access: string) {
    this.axios = axios.create({
      baseURL: "https://dev.teams.microsoft.com/v1.0/",
      headers: {
        authorization: `Bearer ${access}`,
        ConsistencyLevel: "eventual",
        "content-type": "application/json",
      },
    });
  }

  public static async init(
    provider: M365TokenProvider = MockM365TokenProvider,
  ): Promise<TeamsAppHelper> {
    if (!TeamsAppHelper.instance) {
      const res = await provider.getAccessToken({
        scopes: AppStudioScopes(),
      });
      if (res.isErr()) {
        throw res.error;
      }
      this.instance = new TeamsAppHelper(res.value);
    }
    return this.instance;
  }

  public async deleteTeamsAppById(id: string, retryTimes = 5) {
    if (!id) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>(async (resolve) => {
      for (let i = 0; i < retryTimes; ++i) {
        try {
          await this.axios.delete(`apps/${id}`);
          console.info(`[Success] delete the Teams app with id: ${id}`);
          return resolve(true);
        } catch {
          await delay(2000);
        }
      }
      console.error(`[Failed] delete the Teams app with id: ${id}`);
      return resolve(false);
    });
  }

  public async cancelStagedTeamsAppById(id: string, retryTimes = 5) {
    if (!id) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>(async (resolve) => {
      for (let i = 0; i < retryTimes; ++i) {
        try {
          const response = await this.axios.get(`/publishing/${id}`);
          const results = response?.data?.value as any[];
          if (results && results.length > 0) {
            const publishedAppId = results[0].id;
            const appDefinitionId = results[0].appDefinitions[0]?.id;
            if (publishedAppId && appDefinitionId) {
              await this.axios.delete(
                `/publishing/${publishedAppId}/appdefinitions/${appDefinitionId}`,
              );
              console.info(`[Success] stagged app ${id} has been cacelled.`);
              return resolve(true);
            }
          }
        } catch (e) {
          await delay(2000);
        }
        console.error(`[Failed] cancel the stagged Teams app with id: ${id}`);
        return resolve(false);
      }
    });
  }

  public async deleteBotById(id: string, retryTimes = 5) {
    if (!id) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>(async (resolve) => {
      for (let i = 0; i < retryTimes; ++i) {
        try {
          await this.axios.delete(`botregistrations/${id}`);
          console.info(
            `[Success] delete the Bot on bot framework with id: ${id}`,
          );
          return resolve(true);
        } catch {
          await delay(2000);
        }
      }
      console.error(`[Failed] delete the Bot on bot framework with id: ${id}`);
      return resolve(false);
    });
  }
}
