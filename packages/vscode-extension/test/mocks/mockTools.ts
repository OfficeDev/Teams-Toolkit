import * as vscode from "vscode";
import {
  Tools,
  TokenProvider,
  LogLevel,
  LogProvider,
  AzureAccountProvider,
  FxError,
  LoginStatus,
  M365TokenProvider,
  Result,
  SubscriptionInfo,
  TelemetryReporter,
  TokenRequest,
} from "@microsoft/teamsfx-api";
import { VsCodeUI } from "../../src/qm/vsc_ui";
import { TokenCredential } from "@azure/core-auth";
import { AccessToken, GetTokenOptions } from "@azure/identity";
import { IExperimentationService } from "vscode-tas-client";

export class MockTools implements Tools {
  logProvider = new MockLogProvider();
  tokenProvider: TokenProvider = {
    azureAccountProvider: new MockAzureAccountProvider(),
    m365TokenProvider: new MockM365TokenProvider(),
  };
  telemetryReporter = new MockTelemetryReporter();
  ui = new VsCodeUI(<vscode.ExtensionContext>{});
  expServiceProvider = {} as IExperimentationService;
}

export class MockLogProvider implements LogProvider {
  msg = "";
  verbose(msg: string): void {
    this.log(LogLevel.Verbose, msg);
  }
  debug(msg: string): void {
    this.log(LogLevel.Debug, msg);
  }
  info(msg: string | Array<any>): void {
    this.log(LogLevel.Info, msg as string);
  }
  warning(msg: string): void {
    this.log(LogLevel.Warning, msg);
  }
  error(msg: string): void {
    this.log(LogLevel.Error, msg);
  }
  log(level: LogLevel, msg: string): void {
    this.msg = msg;
  }
  async logInFile(level: LogLevel, msg: string): Promise<void> {
    this.msg = msg;
  }
  getLogFilePath(): string {
    return "";
  }
}

export class MyTokenCredential implements TokenCredential {
  public async getToken(
    scopes: string | string[],
    options?: GetTokenOptions
  ): Promise<AccessToken | null> {
    return {
      token: "a.eyJ1c2VySWQiOiJ0ZXN0QHRlc3QuY29tIn0=.c",
      expiresOnTimestamp: 1234,
    };
  }
}

export class MockAzureAccountProvider implements AzureAccountProvider {
  async getIdentityCredentialAsync(): Promise<TokenCredential | undefined> {
    return new MyTokenCredential();
  }

  signout(): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  setStatusChangeMap(
    name: string,
    statusChange: (
      status: string,
      token?: string,
      accountInfo?: Record<string, unknown>
    ) => Promise<void>
  ): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  removeStatusChangeMap(name: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  async getJsonObject(showDialog?: boolean): Promise<Record<string, unknown>> {
    return {
      unique_name: "test",
    };
  }

  switchTenant(tenantId: string): Promise<Result<TokenCredential, FxError>> {
    throw new Error("Method not implemented.");
  }

  listSubscriptions(): Promise<SubscriptionInfo[]> {
    throw new Error("Method not implemented.");
  }

  setSubscription(subscriptionId: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getAccountInfo(): Record<string, string> {
    throw new Error("Method not implemented.");
  }

  getSelectedSubscription(): Promise<SubscriptionInfo | undefined> {
    throw new Error("Method not implemented.");
  }

  selectSubscription(subscriptionId?: string): Promise<string> {
    throw new Error("Method not implemented.");
  }
}

export class MockM365TokenProvider implements M365TokenProvider {
  /**
   * Get M365 access token
   * @param tokenRequest permission scopes or show user interactive UX
   */
  getAccessToken(tokenRequest: TokenRequest): Promise<Result<string, FxError>> {
    throw new Error("Method not implemented.");
  }

  /**
   * Get M365 token Json object
   * - tid : tenantId
   * - unique_name : user name
   * - ...
   * @param tokenRequest permission scopes or show user interactive UX
   */
  getJsonObject(tokenRequest: TokenRequest): Promise<Result<Record<string, unknown>, FxError>> {
    throw new Error("Method not implemented.");
  }

  /**
   * Get user login status
   * @param tokenRequest permission scopes or show user interactive UX
   */
  getStatus(tokenRequest: TokenRequest): Promise<Result<LoginStatus, FxError>> {
    throw new Error("Method not implemented.");
  }
  /**
   * m365 sign out
   */
  signout(): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  switchTenant(tenantId: string): Promise<Result<string, FxError>> {
    throw new Error("Method not implemented.");
  }

  /**
   * Add update account info callback
   * @param name callback name
   * @param tokenRequest permission scopes
   * @param statusChange callback method
   * @param immediateCall whether callback when register, the default value is true
   */
  setStatusChangeMap(
    name: string,
    tokenRequest: TokenRequest,
    statusChange: (
      status: string,
      token?: string,
      accountInfo?: Record<string, unknown>
    ) => Promise<void>,
    immediateCall?: boolean
  ): Promise<Result<boolean, FxError>> {
    throw new Error("Method not implemented.");
  }

  /**
   * Remove update account info callback
   * @param name callback name
   */
  removeStatusChangeMap(name: string): Promise<Result<boolean, FxError>> {
    throw new Error("Method not implemented.");
  }
}

export class MockTelemetryReporter implements TelemetryReporter {
  sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number },
    errorProps?: string[]
  ): void {
    // do nothing
  }

  sendTelemetryEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    // do nothing
  }

  sendTelemetryException(
    error: Error,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    // do nothing
  }

  async dispose(): Promise<void> {
    // do nothing
  }
}
