// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import dotenv from "dotenv";

import * as msal from "@azure/msal-node";
import {
  BasicLogin,
  err,
  FxError,
  LoginStatus,
  LogLevel,
  M365TokenProvider,
  ok,
  Result,
  TokenRequest,
  UserError,
  signedIn,
  signedOut,
} from "@microsoft/teamsfx-api";

import { AppStudioScopes, AuthSvcScopes, teamsDevPortalClient } from "@microsoft/teamsfx-core";
import { ConvertTokenToJson, ErrorMessage } from "./codeFlowLogin";
import * as cfg from "./common/userPasswordConfig";
import CLILogProvider from "./log";

dotenv.config();

const user = cfg.M365_ACCOUNT_NAME;
const password = cfg.M365_ACCOUNT_PASSWORD;

const msalConfig = {
  auth: {
    clientId: cfg.client_id,
    authority: `https://login.microsoftonline.com/${cfg.M365_TENANT_ID || "organizations"}`,
  },
};

export class M365ProviderUserPassword extends BasicLogin implements M365TokenProvider {
  private static instance: M365ProviderUserPassword;

  private static accessToken: string | undefined;

  public static getInstance(): M365ProviderUserPassword {
    if (!M365ProviderUserPassword.instance) {
      M365ProviderUserPassword.instance = new M365ProviderUserPassword();
    }
    return M365ProviderUserPassword.instance;
  }

  /**
   * Get team access token
   */
  async getAccessToken(tokenRequest: TokenRequest): Promise<Result<string, FxError>> {
    const pca = new msal.PublicClientApplication(msalConfig);

    const usernamePasswordRequest = {
      scopes: tokenRequest.scopes,
      username: user!,
      password: password!,
    };
    await pca
      .acquireTokenByUsernamePassword(usernamePasswordRequest)
      .then((response) => {
        M365ProviderUserPassword.accessToken = response!.accessToken;
      })
      .catch((e: any) => {
        CLILogProvider.necessaryLog(LogLevel.Error, JSON.stringify(e, undefined, 4));
      });

    if (M365ProviderUserPassword.accessToken) {
      const m365Token = M365ProviderUserPassword.accessToken;

      if (hasSameScopes(tokenRequest.scopes, AppStudioScopes())) {
        const authSvcRequest = {
          scopes: AuthSvcScopes(),
          username: user!,
          password: password!,
        };
        let authSvcToken;
        await pca
          .acquireTokenByUsernamePassword(authSvcRequest)
          .then((response) => {
            authSvcToken = response!.accessToken;
          })
          .catch((e: any) => {
            CLILogProvider.necessaryLog(LogLevel.Error, JSON.stringify(e, undefined, 4));
          });
        if (authSvcToken) {
          await teamsDevPortalClient.setRegionEndpointByToken(authSvcToken);
        }
      }

      return ok(m365Token);
    } else {
      return err(
        new UserError({
          name: ErrorMessage.loginUsernamePasswordFailTitle,
          message: ErrorMessage.loginUsernamePasswordFailDetail,
          source: ErrorMessage.loginComponent,
        })
      );
    }
  }

  async getJsonObject(
    tokenRequest: TokenRequest
  ): Promise<Result<Record<string, unknown>, FxError>> {
    const tokenRes = await this.getAccessToken(tokenRequest);

    if (tokenRes.isOk()) {
      const tokenJson = ConvertTokenToJson(tokenRes.value);
      return ok(tokenJson);
    } else {
      return err(tokenRes.error);
    }
  }

  public async getStatus(tokenRequest: TokenRequest): Promise<Result<LoginStatus, FxError>> {
    const tokenRes = await this.getAccessToken(tokenRequest);
    if (tokenRes.isOk()) {
      const tokenJson = ConvertTokenToJson(tokenRes.value);
      return ok({ status: signedIn, token: tokenRes.value, accountInfo: tokenJson });
    } else {
      return ok({ status: signedOut, token: undefined, accountInfo: undefined });
    }
  }

  removeStatusChangeMap(name: string): Promise<Result<boolean, FxError>> {
    throw new Error("Method not implemented.");
  }

  signout(): Promise<boolean> {
    return Promise.resolve(true);
  }

  switchTenant(tenantId: string): Promise<Result<string, FxError>> {
    throw new Error("Method not implemented.");
  }

  async getTenant(): Promise<string | undefined> {
    return Promise.resolve(cfg.M365_TENANT_ID);
  }
}

export default M365ProviderUserPassword.getInstance();

function hasSameScopes(first: string[], second: string[]): boolean {
  const firstScopes = new Set(first);
  const secondScopes = new Set(second);
  return (
    firstScopes.size === secondScopes.size &&
    [...firstScopes].every((scope) => secondScopes.has(scope))
  );
}
