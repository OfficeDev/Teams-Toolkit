// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import type { TokenCredential } from "@azure/core-auth";
import {
  AzureAccountProvider,
  UserError,
  SubscriptionInfo,
  SingleSelectConfig,
  OptionItem,
  FxError,
  Result,
  ok,
  err,
  signedIn,
  signedOut,
} from "@microsoft/teamsfx-api";
import { ExtensionErrors } from "../error/error";
import { ConvertTokenToJson, LoginFailureError } from "./codeFlowLogin";
import * as vscode from "vscode";
import { azureCacheName, loggedIn, loggedOut, loggingIn, signingIn } from "./common/constant";
import { login, LoginStatus } from "./common/login";
import * as util from "util";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import VsCodeLogInstance, { VsCodeLogProvider } from "./log";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
  AccountType,
  TelemetryErrorType,
} from "../telemetry/extTelemetryEvents";
import { VS_CODE_UI } from "../qm/vsc_ui";
import {
  AzureScopes,
  featureFlagManager,
  FeatureFlags,
  globalStateGet,
  globalStateUpdate,
} from "@microsoft/teamsfx-core";
import { getDefaultString, localize } from "../utils/localizeUtils";
import {
  Microsoft,
  MicrosoftSovereignCloud,
  VSCodeAzureSubscriptionProvider,
  getSessionFromVSCode,
} from "./vscodeAzureSubscriptionProvider";
import { loadTenantId, saveTenantId } from "./cacheAccess";
import { getUsernameFromClaims } from "./accountInfoUtils";

const showAzureSignOutHelp = "ShowAzureSignOutHelp";

export class AzureAccountManager extends login implements AzureAccountProvider {
  private static instance: AzureAccountManager;
  private static subscriptionId: string | undefined;
  private static subscriptionName: string | undefined;
  private static tenantId: string | undefined;
  private static currentStatus: string | undefined;
  private vscodeAzureSubscriptionProvider: VSCodeAzureSubscriptionProvider;

  private constructor() {
    super();
    this.vscodeAzureSubscriptionProvider = new VSCodeAzureSubscriptionProvider();
    void this.addStatusChangeEvent();
  }

  /**
   * Gets instance
   * @returns instance
   */
  public static getInstance(): AzureAccountManager {
    if (!AzureAccountManager.instance) {
      AzureAccountManager.instance = new AzureAccountManager();
    }

    return AzureAccountManager.instance;
  }

  /**
   * Async get identity [crendential](https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/core/core-auth/src/tokenCredential.ts)
   */
  async getIdentityCredentialAsync(
    showDialog = true,
    authenticationSessionRequest?: vscode.AuthenticationWwwAuthenticateRequest
  ): Promise<TokenCredential | undefined> {
    const tenantId = await loadTenantId(azureCacheName);
    if (await this.isUserLogin(tenantId)) {
      const res = await this.getIdentityCredentialSilently(tenantId, authenticationSessionRequest);
      if (res.isOk()) {
        return res.value;
      } else {
        return undefined;
      }
    } else {
      return await this.login(showDialog, tenantId);
    }
  }

  private async isUserLogin(tenantId?: string): Promise<boolean> {
    if (!tenantId) {
      tenantId = await loadTenantId(azureCacheName);
    }
    const session = await getSessionFromVSCode(AzureScopes(), tenantId, {
      createIfNone: false,
      silent: true,
    });
    return session !== undefined;
  }

  private async login(showDialog: boolean, tenantId?: string): Promise<TokenCredential> {
    if (showDialog) {
      const userConfirmation: boolean = await this.doesUserConfirmLogin();
      if (!userConfirmation) {
        // throw user cancel error
        throw new UserError(
          "Login",
          ExtensionErrors.UserCancel,
          getDefaultString("teamstoolkit.common.userCancel"),
          localize("teamstoolkit.common.userCancel")
        );
      }
    }

    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.LoginStart, {
      [TelemetryProperty.AccountType]: AccountType.Azure,
      [TelemetryProperty.SovereignCloudType]: featureFlagManager.getStringValue(
        FeatureFlags.SovereignCloudEnvironment
      ),
    });
    try {
      AzureAccountManager.currentStatus = loggingIn;
      void this.notifyStatus();
      const session = await getSessionFromVSCode(AzureScopes(), tenantId, { createIfNone: true });
      if (session === undefined) {
        throw new UserError(
          getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
          getDefaultString("teamstoolkit.codeFlowLogin.loginTimeoutTitle"),
          getDefaultString("teamstoolkit.codeFlowLogin.loginTimeoutDescription"),
          localize("teamstoolkit.codeFlowLogin.loginTimeoutDescription")
        );
      }
      if (await globalStateGet(showAzureSignOutHelp, true)) {
        void vscode.window
          .showInformationMessage(
            localize("teamstoolkit.commands.azureAccount.signOutHelp"),
            "Got it"
          )
          .then(async (userClicked) => {
            if (userClicked === "Got it") {
              await globalStateUpdate(showAzureSignOutHelp, false);
            }
          });
      }
      await saveTenantId(azureCacheName, (ConvertTokenToJson(session.accessToken) as any).tid);

      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Login, {
        [TelemetryProperty.AccountType]: AccountType.Azure,
        [TelemetryProperty.SovereignCloudType]: featureFlagManager.getStringValue(
          FeatureFlags.SovereignCloudEnvironment
        ),
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      });

      const credential: TokenCredential = {
        // eslint-disable-next-line @typescript-eslint/require-await
        getToken: async () => {
          return {
            token: session.accessToken,
            expiresOnTimestamp: 0,
          };
        },
      };
      AzureAccountManager.currentStatus = loggedIn;
      void this.notifyStatus();

      return credential;
    } catch (e) {
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.Login, e, {
        [TelemetryProperty.AccountType]: AccountType.Azure,
        [TelemetryProperty.SovereignCloudType]: featureFlagManager.getStringValue(
          FeatureFlags.SovereignCloudEnvironment
        ),
        [TelemetryProperty.Success]: TelemetrySuccess.No,
        [TelemetryProperty.ErrorType]:
          e instanceof UserError ? TelemetryErrorType.UserError : TelemetryErrorType.SystemError,
        [TelemetryProperty.ErrorCode]: `${e.source as string}.${e.name as string}`,
        [TelemetryProperty.ErrorMessage]: `${e.message as string}`,
      });
      AzureAccountManager.currentStatus = loggedOut;
      void this.notifyStatus();
      if (e?.message.includes("User did not consent ")) {
        // throw user cancel error
        throw new UserError(
          "Login",
          ExtensionErrors.UserCancel,
          getDefaultString("teamstoolkit.common.userCancel"),
          localize("teamstoolkit.common.userCancel")
        );
      } else {
        throw e;
      }
    }
  }

  private async doGetIdentityCredentialAsync(
    showDialog?: boolean
  ): Promise<TokenCredential | undefined> {
    const tokenCredential = await this.doGetAccountCredentialAsync();
    if (tokenCredential) {
      return tokenCredential;
    } else {
      return Promise.reject(LoginFailureError());
    }
  }

  private async doGetAccountCredentialAsync(): Promise<TokenCredential | undefined> {
    if (await this.isUserLogin()) {
      const subs = await this.vscodeAzureSubscriptionProvider.getSubscriptions();
      if (subs.length > 0) {
        if (AzureAccountManager.tenantId) {
          for (let i = 0; i < subs.length; ++i) {
            const item = subs[i];
            if (item.tenantId == AzureAccountManager.tenantId) {
              return item.credential;
            }
          }
        }
        return subs[0].credential;
      } else {
        const session = await getSessionFromVSCode(AzureScopes(), undefined, {
          createIfNone: false,
          silent: true,
        });
        const credential: TokenCredential = {
          // eslint-disable-next-line @typescript-eslint/require-await
          getToken: async () => {
            return {
              token: session!.accessToken,
              expiresOnTimestamp: 0,
            };
          },
        };
        return credential;
      }
    }
    return Promise.reject(LoginFailureError());
  }

  private async getIdentityCredentialSilently(
    tenantId?: string,
    authenticationSessionRequest?: vscode.AuthenticationWwwAuthenticateRequest
  ): Promise<Result<TokenCredential, FxError>> {
    const session = await getSessionFromVSCode(
      authenticationSessionRequest ?? AzureScopes(),
      tenantId,
      authenticationSessionRequest
        ? { createIfNone: true, silent: false }
        : {
            createIfNone: false,
            silent: true,
          }
    );
    if (!session) {
      return err(LoginFailureError());
    }

    const credential: TokenCredential = {
      // eslint-disable-next-line @typescript-eslint/require-await
      getToken: async () => {
        return {
          token: session.accessToken,
          expiresOnTimestamp: 0,
        };
      },
    };
    return ok(credential);
  }

  private async doesUserConfirmLogin(): Promise<boolean> {
    const message = localize("teamstoolkit.azureLogin.message");
    const signin = localize("teamstoolkit.common.signin");
    const readMore = localize("teamstoolkit.common.readMore");
    let userSelected: string | undefined;
    do {
      userSelected = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        signin,
        readMore
      );
      if (userSelected === readMore) {
        void vscode.env.openExternal(
          vscode.Uri.parse(
            "https://docs.microsoft.com/en-us/azure/cost-management-billing/manage/create-subscription"
          )
        );
      }
    } while (userSelected === readMore);

    return Promise.resolve(userSelected === signin);
  }

  private async doesUserConfirmSignout(): Promise<boolean> {
    const accountInfo = (await this.getStatus()).accountInfo;
    const email = getUsernameFromClaims(accountInfo as Record<string, unknown>);
    const confirm = localize("teamstoolkit.common.signout");
    const userSelected: string | undefined = await vscode.window.showInformationMessage(
      util.format(localize("teamstoolkit.common.signOutOf"), email),
      { modal: true },
      confirm
    );
    return Promise.resolve(userSelected === confirm);
  }

  async getJsonObject(showDialog = true): Promise<Record<string, unknown> | undefined> {
    const credential = await this.getIdentityCredentialAsync(showDialog);
    const token = await credential?.getToken(AzureScopes());
    if (token) {
      const array = token.token.split(".");
      const buff = Buffer.from(array[1], "base64");
      return new Promise((resolve) => {
        resolve(JSON.parse(buff.toString("utf-8")));
      });
    } else {
      return new Promise((resolve) => {
        resolve(undefined);
      });
    }
  }

  /**
   * signout from Azure
   */
  async signout(): Promise<boolean> {
    const userConfirmation: boolean = await this.doesUserConfirmSignout();
    if (!userConfirmation) {
      // throw user cancel error
      throw new UserError(
        "SignOut",
        ExtensionErrors.UserCancel,
        getDefaultString("teamstoolkit.common.userCancel"),
        localize("teamstoolkit.common.userCancel")
      );
    }
    try {
      // todo
      // await vscode.commands.executeCommand("azure-account.logout");
      AzureAccountManager.tenantId = undefined;
      AzureAccountManager.subscriptionId = undefined;
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SignOut, {
        [TelemetryProperty.AccountType]: AccountType.Azure,
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      });
      return new Promise((resolve) => {
        resolve(true);
      });
    } catch (e) {
      VsCodeLogInstance.error("[Logout Azure] " + (e.message as string));
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.SignOut, e, {
        [TelemetryProperty.AccountType]: AccountType.Azure,
        [TelemetryProperty.Success]: TelemetrySuccess.No,
        [TelemetryProperty.ErrorType]:
          e instanceof UserError ? TelemetryErrorType.UserError : TelemetryErrorType.SystemError,
        [TelemetryProperty.ErrorCode]: `${e.source as string}.${e.name as string}`,
        [TelemetryProperty.ErrorMessage]: `${e.message as string}`,
      });
      return Promise.resolve(false);
    }
  }

  async switchTenant(tenantId: string): Promise<Result<TokenCredential, FxError>> {
    let result: TokenCredential;

    const res = await this.getIdentityCredentialSilently(tenantId);
    if (res.isErr()) {
      try {
        result = await this.login(false, tenantId);
      } catch (e) {
        return err(LoginFailureError(e));
      }
    } else {
      result = res.value;
    }

    await saveTenantId(azureCacheName, tenantId);
    await this.notifyStatus();
    return ok(result);
  }
  /**
   * list all subscriptions
   */
  async listAllSubscriptions(): Promise<SubscriptionInfo[]> {
    const arr: SubscriptionInfo[] = [];
    if (await this.isUserLogin()) {
      const subs = await this.vscodeAzureSubscriptionProvider.getSubscriptions();
      for (let i = 0; i < subs.length; ++i) {
        const item = subs[i];
        arr.push({
          subscriptionId: item.subscriptionId,
          tenantId: item.tenantId,
          subscriptionName: item.name,
        });
      }
    }

    return arr;
  }

  /**
   * List subscriptions under current tenant
   */
  async listSubscriptions(): Promise<SubscriptionInfo[]> {
    const arr: SubscriptionInfo[] = [];
    if (await this.isUserLogin()) {
      const tenantId = await loadTenantId(azureCacheName);
      const subs = await this.vscodeAzureSubscriptionProvider.getSubscriptions(tenantId);
      for (let i = 0; i < subs.length; ++i) {
        const item = subs[i];
        arr.push({
          subscriptionId: item.subscriptionId,
          tenantId: item.tenantId,
          subscriptionName: item.name,
        });
      }
    }

    return arr;
  }

  /**
   * set tenantId and subscriptionId
   */
  async setSubscription(subscriptionId: string): Promise<void> {
    if (subscriptionId === "") {
      AzureAccountManager.tenantId = undefined;
      AzureAccountManager.subscriptionId = undefined;
      AzureAccountManager.subscriptionName = undefined;
      return;
    }
    if (await this.isUserLogin()) {
      const subs = await this.vscodeAzureSubscriptionProvider.getSubscriptions();
      for (let i = 0; i < subs.length; ++i) {
        const item = subs[i];
        if (item.subscriptionId === subscriptionId) {
          AzureAccountManager.tenantId = item.tenantId;
          AzureAccountManager.subscriptionId = subscriptionId;
          AzureAccountManager.subscriptionName = item.name;
          return;
        }
      }
    }
    return Promise.reject(
      new UserError(
        "Login",
        ExtensionErrors.UnknownSubscription,
        getDefaultString("teamstoolkit.azureLogin.unknownSubscription"),
        localize("teamstoolkit.azureLogin.unknownSubscription")
      )
    );
  }

  async getStatus(): Promise<LoginStatus> {
    try {
      if (AzureAccountManager.currentStatus === loggingIn) {
        return Promise.resolve({ status: signingIn, token: undefined, accountInfo: undefined });
      }
      if (AzureAccountManager.currentStatus === loggedIn || (await this.isUserLogin())) {
        const credential = await this.doGetIdentityCredentialAsync();
        const token = await credential?.getToken(AzureScopes());
        const accountJson = await this.getJsonObject();
        return Promise.resolve({
          status: signedIn,
          token: token?.token,
          accountInfo: accountJson,
        });
      } else {
        return Promise.resolve({ status: signedOut, token: undefined, accountInfo: undefined });
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async addStatusChangeEvent() {
    if (await this.isUserLogin()) {
      AzureAccountManager.currentStatus = loggedIn;
    }
    vscode.authentication.onDidChangeSessions(async (e) => {
      if (e.provider.id != Microsoft && e.provider.id != MicrosoftSovereignCloud) {
        return;
      }
      if (await this.isUserLogin()) {
        AzureAccountManager.currentStatus = loggedIn;
        await this.notifyStatus();
      } else {
        AzureAccountManager.currentStatus = loggedOut;
        await saveTenantId(azureCacheName, "");
        await this.notifyStatus();
      }
    });
  }

  public async clearSub() {
    await this.setSubscription("");
  }

  getAccountInfo(): Record<string, string> | undefined {
    if (AzureAccountManager.currentStatus === loggedIn) {
      return this.getJsonObject() as unknown as Record<string, string>;
    } else {
      return undefined;
    }
  }

  async getSelectedSubscription(triggerUI = false): Promise<SubscriptionInfo | undefined> {
    if (triggerUI) {
      if (AzureAccountManager.currentStatus !== loggedIn) {
        await this.login(true);
      }
      if (AzureAccountManager.currentStatus === loggedIn && !AzureAccountManager.subscriptionId) {
        await this.selectSubscription();
      }
    } else {
      if (AzureAccountManager.currentStatus === loggedIn && !AzureAccountManager.subscriptionId) {
        const subscriptionList = await this.listSubscriptions();
        if (subscriptionList && subscriptionList.length == 1) {
          await this.setSubscription(subscriptionList[0].subscriptionId);
        }
      }
    }
    if (AzureAccountManager.currentStatus === loggedIn && AzureAccountManager.subscriptionId) {
      const selectedSub: SubscriptionInfo = {
        subscriptionId: AzureAccountManager.subscriptionId,
        tenantId: AzureAccountManager.tenantId!,
        subscriptionName: AzureAccountManager.subscriptionName ?? "",
      };
      return selectedSub;
    } else {
      return undefined;
    }
  }

  async selectSubscription(): Promise<void> {
    const subscriptionList = await this.listSubscriptions();
    if (!subscriptionList || subscriptionList.length == 0) {
      VsCodeLogProvider.getInstance().error(
        "No subscription found with this tenant. Hover over your Azure account and click 'Switch' to change tenants."
      );
      throw new UserError(
        getDefaultString("teamstoolkit.codeFlowLogin.loginComponent"),
        getDefaultString("teamstoolkit.azureLogin.noSubscriptionFound"),
        getDefaultString("teamstoolkit.azureLogin.failToFindSubscription"),
        localize("teamstoolkit.azureLogin.failToFindSubscription")
      );
    }
    if (subscriptionList && subscriptionList.length == 1) {
      await this.setSubscription(subscriptionList[0].subscriptionId);
    } else if (subscriptionList.length > 1) {
      const options: OptionItem[] = subscriptionList.map((sub) => {
        return {
          id: sub.subscriptionId,
          label: sub.subscriptionName,
          data: sub.tenantId,
        } as OptionItem;
      });
      const config: SingleSelectConfig = {
        name: localize("teamstoolkit.azureLogin.subscription"),
        title: localize("teamstoolkit.azureLogin.selectSubscription"),
        placeholder: localize("teamstoolkit.azurelogin.selectSubscription.placeholder"),
        options: options,
      };
      const result = await VS_CODE_UI.selectOption(config);
      if (result.isErr()) {
        throw result.error;
      } else {
        const subId = result.value.result as string;
        await this.setSubscription(subId);
      }
    }
  }
}

export default AzureAccountManager.getInstance();
