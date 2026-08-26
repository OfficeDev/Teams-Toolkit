// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import {
  PublicClientApplication,
  AccountInfo,
  Configuration,
  TokenCache,
  AuthorizationUrlRequest,
  SilentFlowRequest,
} from "@azure/msal-node";
import * as http from "http";
import path from "path";
import { Mutex } from "async-mutex";
import { FxError, ok, Result, UserError, err } from "@microsoft/teamsfx-api";
import VsCodeLogInstance from "./log";
import * as crypto from "crypto";
import express from "express";
import * as fs from "fs-extra";
import { AddressInfo } from "net";
import {
  clearCache,
  loadAccountId,
  loadTenantId,
  saveAccountId,
  saveTenantId,
  UTF8,
} from "./cacheAccess";
import * as stringUtil from "util";
import {
  codeSpacesAuthComplete,
  extensionID,
  loggedIn,
  loggedOut,
  loggingIn,
  vscodeRedirect,
} from "./common/constant";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryErrorType,
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
} from "../telemetry/extTelemetryEvents";
import { getDefaultString, localize } from "../utils/localizeUtils";
import { ExtensionErrors } from "../error/error";
import { randomBytes } from "crypto";
import { getExchangeCode } from "./exchangeCode";
import * as os from "os";
import {
  ErrorCategory,
  featureFlagManager,
  FeatureFlags,
  getTenantedAuthorityUrl,
} from "@microsoft/teamsfx-core";
import { getAccountByHomeId } from "./common/tokenCacheUtils";
import { getInternalFlagFromTokenClaims } from "./accountInfoUtils";

interface Deferred<T> {
  resolve: (result: T | Promise<T>) => void;
  reject: (reason: any) => void;
}

export class CodeFlowLogin {
  pca: PublicClientApplication;
  account: AccountInfo | undefined;
  isBrokerAvailable: boolean;
  /**
   * @deprecated will be removed after unify m365 login
   */
  scopes: string[];
  config: Configuration;
  port: number;
  mutex: Mutex;
  msalTokenCache: TokenCache;
  accountName: string;
  status: string | undefined;

  constructor(scopes: string[], config: Configuration, port: number, accountName: string) {
    this.scopes = scopes;
    this.config = config;
    this.port = port;
    this.mutex = new Mutex();
    this.pca = new PublicClientApplication(this.config);
    this.msalTokenCache = this.pca.getTokenCache();
    this.accountName = accountName;
    this.status = loggedOut;
    this.isBrokerAvailable = config.broker?.nativeBrokerPlugin?.isBrokerAvailable || false;
  }

  async reloadCache() {
    const accountCache = await loadAccountId(this.accountName);
    if (accountCache) {
      const dataCache = getAccountByHomeId(accountCache, await this.pca.getAllAccounts());
      if (dataCache) {
        this.account = dataCache;
        this.status = loggedIn;
      }

      const tenantCache = await loadTenantId(this.accountName);
      if (tenantCache) {
        const allAccounts = await this.pca.getAllAccounts();
        this.account = allAccounts.find((account) => account.tenantId == tenantCache);
      }
    } else if (this.status !== loggingIn) {
      this.account = undefined;
      this.status = loggedOut;
    }
  }

  async login(scopes: Array<string>, loginHint?: string, tenantId?: string): Promise<string> {
    if (featureFlagManager.getBooleanValue(FeatureFlags.BrokerAuth)) {
      return await this.loginWithBroker(scopes, loginHint, tenantId);
    } else {
      return await this.loginWithBrowser(scopes, loginHint, tenantId);
    }
  }

  async loginWithBrowser(
    scopes: Array<string>,
    loginHint?: string,
    tenantId?: string
  ): Promise<string> {
    if (process.env.CODESPACES == "true") {
      return await this.loginInCodeSpace(scopes, tenantId);
    }
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.LoginStart, {
      [TelemetryProperty.AccountType]: this.accountName,
      [TelemetryProperty.SovereignCloudType]: featureFlagManager.getStringValue(
        FeatureFlags.SovereignCloudEnvironment
      ),
    });
    const codeVerifier = CodeFlowLogin.toBase64UrlEncoding(
      crypto.randomBytes(32).toString("base64")
    );
    const codeChallenge = CodeFlowLogin.toBase64UrlEncoding(
      await CodeFlowLogin.sha256(codeVerifier)
    );
    let serverPort = this.port;

    // try get an unused port
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    const server = app.listen(serverPort);
    serverPort = (server.address() as AddressInfo).port;
    const authority = tenantId ? getTenantedAuthorityUrl(tenantId) : undefined;

    const authCodeUrlParameters: AuthorizationUrlRequest = {
      scopes: scopes,
      codeChallenge: codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: `http://localhost:${serverPort}`,
      responseMode: "form_post",
      prompt: !loginHint ? "select_account" : "login",
      loginHint,
      authority: authority,
    };

    let deferredRedirect: Deferred<string>;
    const redirectPromise: Promise<string> = new Promise<string>(
      (resolve, reject) => (deferredRedirect = { resolve, reject })
    );

    app.post("/", (req: express.Request, res: express.Response) => {
      this.status = loggingIn;
      const tokenRequest = {
        code: req.body.code as string,
        scopes: scopes,
        redirectUri: `http://localhost:${serverPort}`,
        codeVerifier: codeVerifier,
      };

      this.pca
        .acquireTokenByCode(tokenRequest)
        .then(async (response) => {
          if (response) {
            if (response.account) {
              await this.mutex?.runExclusive(async () => {
                this.account = response.account!;
                this.status = loggedIn;
                await saveAccountId(this.accountName, this.account.homeAccountId);
              });
              deferredRedirect.resolve(response.accessToken);

              const resultFilePath = path.join(__dirname, "./codeFlowResult/index.html");
              if (fs.existsSync(resultFilePath)) {
                sendFile(res, resultFilePath, "text/html; charset=utf-8");
              } else {
                // do not break if result file has issue
                void VsCodeLogInstance.error(
                  "[Login] " + localize("teamstoolkit.codeFlowLogin.resultFileNotFound")
                );
                res.sendStatus(200);
              }
            }
          } else {
            throw new Error("get no response");
          }
        })
        .catch((error) => {
          this.status = loggedOut;
          void VsCodeLogInstance.error("[Login] " + (error.message as string));
          deferredRedirect.reject(
            new UserError({
              error,
              source: getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
            })
          );
          res.status(500).send(error);
        });
    });

    const codeTimer = setTimeout(
      () => {
        if (this.account) {
          this.status = loggedIn;
        } else {
          this.status = loggedOut;
        }
        const err = new UserError(
          getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
          getDefaultString("teamstoolkit.codeFlowLogin.loginTimeoutTitle"),
          getDefaultString("teamstoolkit.codeFlowLogin.loginTimeoutDescription"),
          localize("teamstoolkit.codeFlowLogin.loginTimeoutDescription")
        );
        err.categories = [ErrorCategory.Internal];
        deferredRedirect.reject(err);
      },
      5 * 60 * 1000
    ); // keep the same as azure login

    function cancelCodeTimer() {
      clearTimeout(codeTimer);
    }

    let accessToken = undefined;
    try {
      await this.startServer(server, serverPort);
      void this.pca.getAuthCodeUrl(authCodeUrlParameters).then((response: string) => {
        void vscode.env.openExternal(vscode.Uri.parse(response));
      });

      redirectPromise.then(cancelCodeTimer, cancelCodeTimer);
      accessToken = await redirectPromise;
    } catch (e) {
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.Login, e, {
        [TelemetryProperty.AccountType]: this.accountName,
        [TelemetryProperty.SovereignCloudType]: featureFlagManager.getStringValue(
          FeatureFlags.SovereignCloudEnvironment
        ),
        [TelemetryProperty.Success]: TelemetrySuccess.No,
        [TelemetryProperty.UserId]: "",
        [TelemetryProperty.Internal]: "false",
        [TelemetryProperty.ErrorType]:
          e instanceof UserError ? TelemetryErrorType.UserError : TelemetryErrorType.SystemError,
        [TelemetryProperty.ErrorCode]: `${e.source as string}.${e.name as string}`,
        [TelemetryProperty.ErrorMessage]: `${e.message as string}`,
      });
      throw e;
    } finally {
      if (accessToken) {
        const tokenJson = ConvertTokenToJson(accessToken);
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Login, {
          [TelemetryProperty.AccountType]: this.accountName,
          [TelemetryProperty.SovereignCloudType]: featureFlagManager.getStringValue(
            FeatureFlags.SovereignCloudEnvironment
          ),
          [TelemetryProperty.Success]: TelemetrySuccess.Yes,
          [TelemetryProperty.UserId]: (tokenJson as any).oid ? (tokenJson as any).oid : "",
          [TelemetryProperty.Internal]: getInternalFlagFromTokenClaims(tokenJson),
        });
      }
      server.close();
    }

    return accessToken;
  }

  async loginWithBroker(
    scopes: Array<string>,
    loginHint?: string,
    tenantId?: string
  ): Promise<string> {
    if (process.env.CODESPACES == "true") {
      return await this.loginInCodeSpace(scopes, tenantId);
    }
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.LoginStart, {
      [TelemetryProperty.AccountType]: this.accountName,
    });

    this.status = loggingIn;
    const authority = tenantId ? getTenantedAuthorityUrl(tenantId) : undefined;

    const loopbackTemplatePath = path.join(__dirname, "codeFlowResult", "index.html");
    let loopbackTemplate = undefined;
    if (fs.pathExistsSync(loopbackTemplatePath)) {
      loopbackTemplate = await fs.readFile(loopbackTemplatePath, "utf-8");
    }

    const interactiveRequest = {
      scopes: scopes,
      openBrowser: async (url: string) => {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      },
      authority: authority,
      prompt: !loginHint ? "select_account" : "login",
      loginHint: loginHint,
      windowHandle: vscode.window.nativeHandle
        ? Buffer.from(vscode.window.nativeHandle)
        : undefined,
      successTemplate: loopbackTemplate,
      errorTemplate: loopbackTemplate,
    };

    let accessToken = undefined;
    try {
      const response = await this.pca.acquireTokenInteractive(interactiveRequest);

      if (response && response.account) {
        await this.mutex?.runExclusive(async () => {
          this.account = response.account!;
          this.status = loggedIn;
          await saveAccountId(this.accountName, this.account.homeAccountId);
        });
        accessToken = response.accessToken;
      } else {
        throw new Error("No response or account from interactive login");
      }
    } catch (e) {
      this.status = loggedOut;
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.Login, e, {
        [TelemetryProperty.AccountType]: this.accountName,
        [TelemetryProperty.Success]: TelemetrySuccess.No,
        [TelemetryProperty.UserId]: "",
        [TelemetryProperty.Internal]: "false",
        [TelemetryProperty.ErrorType]:
          e instanceof UserError ? TelemetryErrorType.UserError : TelemetryErrorType.SystemError,
        [TelemetryProperty.ErrorCode]: `${e.source as string}.${e.name as string}`,
        [TelemetryProperty.ErrorMessage]: `${e.message as string}`,
      });
      throw e;
    } finally {
      if (accessToken) {
        const tokenJson = ConvertTokenToJson(accessToken);
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Login, {
          [TelemetryProperty.AccountType]: this.accountName,
          [TelemetryProperty.Success]: TelemetrySuccess.Yes,
          [TelemetryProperty.UserId]: (tokenJson as any).oid ? (tokenJson as any).oid : "",
          [TelemetryProperty.Internal]: getInternalFlagFromTokenClaims(tokenJson),
        });
      }
    }

    return accessToken;
  }

  async loginInCodeSpace(scopes: Array<string>, tenantId?: string): Promise<string> {
    let callbackUri: vscode.Uri = await vscode.env.asExternalUri(
      vscode.Uri.parse(`${vscode.env.uriScheme}://${extensionID}/${codeSpacesAuthComplete}`)
    );
    const nonce: string = randomBytes(16).toString("base64");
    const callbackQuery = new URLSearchParams(callbackUri.query);
    callbackQuery.set("nonce", nonce);
    callbackUri = callbackUri.with({
      query: callbackQuery.toString(),
    });
    const state = encodeURIComponent(callbackUri.toString(true));
    const codeVerifier = CodeFlowLogin.toBase64UrlEncoding(
      crypto.randomBytes(32).toString("base64")
    );
    const codeChallenge = CodeFlowLogin.toBase64UrlEncoding(
      await CodeFlowLogin.sha256(codeVerifier)
    );
    const authority = tenantId ? getTenantedAuthorityUrl(tenantId) : undefined;
    const authCodeUrlParameters: AuthorizationUrlRequest = {
      scopes: scopes,
      codeChallenge: codeChallenge,
      codeChallengeMethod: "S256",
      redirectUri: vscodeRedirect,
      prompt: "select_account",
      state: state,
      authority: authority,
    };
    const signInUrl: string = await this.pca.getAuthCodeUrl(authCodeUrlParameters);
    const uri: vscode.Uri = vscode.Uri.parse(signInUrl);
    void vscode.env.openExternal(uri);

    const timeoutPromise = new Promise((_resolve: (value: string) => void, reject) => {
      const wait = setTimeout(
        () => {
          clearTimeout(wait);
          reject("Login timed out.");
        },
        1000 * 60 * 5
      );
    });

    const accessCode = await Promise.race([getExchangeCode(), timeoutPromise]);

    const tokenRequest = {
      code: accessCode,
      scopes: scopes,
      redirectUri: vscodeRedirect,
      codeVerifier: codeVerifier,
    };

    const res = await this.pca.acquireTokenByCode(tokenRequest);
    if (res.account) {
      this.account = res.account;
      await saveAccountId(this.accountName, this.account.homeAccountId);
    }
    return Promise.resolve(res.accessToken);
  }

  async logout(): Promise<boolean> {
    try {
      await saveAccountId(this.accountName, undefined);
      await saveTenantId(this.accountName, undefined);
      const accounts = await this.pca.getAllAccounts();
      for (const account of accounts) {
        await this.pca.signOut({ account: account });
      }
      await clearCache(this.accountName);
      this.account = undefined;
      this.status = loggedOut;
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SignOut, {
        [TelemetryProperty.AccountType]: this.accountName,
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      });
      return true;
    } catch (e) {
      VsCodeLogInstance.error("[Logout " + this.accountName + "] " + (e.message as string));
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.SignOut, e, {
        [TelemetryProperty.AccountType]: this.accountName,
        [TelemetryProperty.Success]: TelemetrySuccess.No,
        [TelemetryProperty.ErrorType]:
          e instanceof UserError ? TelemetryErrorType.UserError : TelemetryErrorType.SystemError,
        [TelemetryProperty.ErrorCode]: `${e.source as string}.${e.name as string}`,
        [TelemetryProperty.ErrorMessage]: `${e.message as string}`,
      });
      return false;
    }
  }

  async getTokenByScopes(
    scopes: Array<string>,
    refresh = true,
    loginHint?: string,
    tenantId?: string
  ): Promise<Result<string, FxError>> {
    if (!tenantId) {
      tenantId = await loadTenantId(this.accountName);
    }
    return await this.getToken(scopes, refresh, tenantId, loginHint);
  }

  async getToken(
    scopes: Array<string>,
    refresh = true,
    tenantId?: string,
    loginHint?: string
  ): Promise<Result<string, FxError>> {
    if (!this.account) {
      const accessToken = await this.login(scopes, loginHint, tenantId);
      return ok(accessToken);
    } else {
      let tenantedAccount: AccountInfo | undefined = undefined;
      if (tenantId) {
        const allAccounts = await this.pca.getAllAccounts();
        tenantedAccount = allAccounts.find((account) => account.tenantId == tenantId);
        this.account = tenantedAccount ?? this.account;
      }

      let tokenRequest: SilentFlowRequest = {
        account: this.account,
        scopes: scopes,
        authority: tenantId ? getTenantedAuthorityUrl(tenantId) : this.config.auth.authority,
      };
      tokenRequest = this.isBrokerAvailable
        ? // HACK: Broker doesn't support forceRefresh so we need to pass in claims which will force a refresh
          tenantedAccount
          ? tokenRequest
          : { ...tokenRequest, claims: '{ "id_token": {}}' }
        : { ...tokenRequest, forceRefresh: tenantedAccount ? false : true };
      try {
        const res = await this.pca.acquireTokenSilent(tokenRequest);
        if (res) {
          return ok(res.accessToken);
        } else {
          return err(LoginCodeFlowError(new Error("No token response.")));
        }
      } catch (error) {
        VsCodeLogInstance.debug(
          "[Login] " +
            stringUtil.format(
              localize("teamstoolkit.codeFlowLogin.silentAcquireToken"),
              path.join(os.homedir(), ".fx", "account"),
              error.message
            )
        );
        if (!(await checkIsOnline())) {
          return err(CheckOnlineError());
        }
        await this.logout();
        if (refresh) {
          const accessToken = await this.login(scopes, loginHint, tenantId);
          return ok(accessToken);
        }
        return err(LoginCodeFlowError(error));
      }
    }
  }

  async switchAccount(scopes: Array<string>, loginHint?: string): Promise<Result<string, FxError>> {
    await this.logout();
    try {
      if (loginHint) {
        const allAccounts = await this.msalTokenCache.getAllAccounts();
        const accountMatchedInCache = !allAccounts
          ? undefined
          : allAccounts.find((o) => o.username === loginHint);
        if (!!accountMatchedInCache) {
          // If there is an account in msal cache with the same login hint, we will use that account to sign in.
          this.account = accountMatchedInCache;
          await saveAccountId(this.accountName, accountMatchedInCache.homeAccountId);
        }
      }
      const accessTokenRes = await this.getTokenByScopes(scopes, true, loginHint);
      if (accessTokenRes.isErr()) {
        return err(accessTokenRes.error);
      }

      return ok(accessTokenRes.value);
    } catch (e) {
      return err(LoginCodeFlowError(e));
    }
  }

  async switchTenant(tenantId: string): Promise<void> {
    return await saveTenantId(this.accountName, tenantId);
  }

  async startServer(server: http.Server, port: number): Promise<string> {
    // handle port timeout
    let defferedPort: Deferred<string>;
    const portPromise: Promise<string> = new Promise<string>(
      (resolve, reject) => (defferedPort = { resolve, reject })
    );
    const portTimer = setTimeout(() => {
      defferedPort.reject(
        new UserError(
          getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
          getDefaultString("teamstoolkit.codeFlowLogin.loginPortConflictTitle"),
          getDefaultString("teamstoolkit.codeFlowLogin.loginPortConflictDescription"),
          localize("teamstoolkit.codeFlowLogin.loginPortConflictDescription")
        )
      );
    }, 5000);

    function cancelPortTimer() {
      clearTimeout(portTimer);
    }

    server.on("listening", () => {
      defferedPort.resolve(`Code login server listening on port ${port}`);
    });
    portPromise.then(cancelPortTimer, cancelPortTimer);
    return portPromise;
  }

  static toBase64UrlEncoding(base64string: string) {
    return base64string.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  static sha256(s: string | Uint8Array): Promise<string> {
    return require("crypto").createHash("sha256").update(s).digest("base64");
  }
}

function sendFile(res: http.ServerResponse, filepath: string, contentType: string) {
  fs.readFile(filepath, (err, body) => {
    if (err) {
      void VsCodeLogInstance.error(err.message);
    } else {
      res.writeHead(200, {
        "Content-Length": body.length,
        "Content-Type": contentType,
      });
      res.end(body);
    }
  });
}

export function LoginFailureError(innerError?: any): UserError {
  return new UserError({
    name: getDefaultString("teamstoolkit.codeFlowLogin.loginFailureTitle"),
    message: getDefaultString("teamstoolkit.codeFlowLogin.loginFailureDescription"),
    displayMessage: localize("teamstoolkit.codeFlowLogin.loginFailureDescription"),
    source: "Login",
    error: innerError,
  });
}

export function LoginCodeFlowError(innerError?: any): UserError {
  return new UserError({
    name: getDefaultString("teamstoolkit.codeFlowLogin.loginCodeFlowFailureTitle"),
    message: getDefaultString("teamstoolkit.codeFlowLogin.loginCodeFlowFailureDescription"),
    displayMessage: localize("teamstoolkit.codeFlowLogin.loginCodeFlowFailureDescription"),
    source: getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
    error: innerError,
  });
}

export function CheckOnlineError(): UserError {
  return new UserError({
    name: getDefaultString("teamstoolkit.codeFlowLogin.checkOnlineFailTitle"),
    message: getDefaultString("teamstoolkit.codeFlowLogin.checkOnlineFailDetail"),
    displayMessage: localize("teamstoolkit.codeFlowLogin.checkOnlineFailDetail"),
    source: getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
  });
}

export function UserCancelError(source: string): UserError {
  return new UserError({
    name: ExtensionErrors.UserCancel,
    message: getDefaultString("teamstoolkit.appStudioLogin.loginCancel"),
    displayMessage: localize("teamstoolkit.appStudioLogin.loginCancel"),
    source: source,
  });
}

// if connot convert token via base64, return empty object
export function ConvertTokenToJson(token: string): object {
  try {
    const array = token.split(".");
    const buff = Buffer.from(array[1], "base64");
    return JSON.parse(buff.toString(UTF8));
  } catch (e) {
    return {};
  }
}

export async function checkIsOnline(): Promise<boolean> {
  const options = {
    hostname: "login.microsoftonline.com",
    path: "/",
    method: "head",
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", () => {
        resolve(true);
      });
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}
