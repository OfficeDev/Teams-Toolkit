// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import { SystemError, UserError, err, ok } from "@microsoft/teamsfx-api";
import { Service } from "typedi";
import { teamsGraphClient } from "../../../client/teamsGraphClient";
import { TeamsGraphScopes } from "../../../common/constants";
import { getLocalizedString } from "../../../common/localizeUtils";
import { InvalidActionInputError, assembleError } from "../../../error/common";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import {
  OauthRegistration,
  OauthRegistrationAppType,
  OauthRegistrationTargetAudience,
  TokenExchangeMethodType,
} from "../teamsApp/interfaces/OauthRegistration";
import { OauthDisablePKCEError } from "./error/oauthDisablePKCEError";
import { OauthNameTooLongError } from "./error/oauthNameTooLong";
import { UpdateOauthArgs } from "./interface/updateOauthArgs";
import { logMessageKeys } from "./utility/constants";
import { OauthInfo, getAuthInfo, validateSecret, validateUrl } from "./utility/utility";

const actionName = "oauth/update"; // DO NOT MODIFY the name
const helpLink = "https://aka.ms/teamsfx-actions/oauth-update";

@Service(actionName)
export class UpdateOauthDriver implements StepDriver {
  description = getLocalizedString("driver.oauth.description.create");
  readonly progressTitle = getLocalizedString("driver.oauth.title.create");

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async execute(
    args: UpdateOauthArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    const summaries: string[] = [];
    const outputs: Map<string, string> = new Map<string, string>();

    try {
      context.logProvider?.info(getLocalizedString(logMessageKeys.startExecuteDriver, actionName));

      const invalidParameters = this.validateArgs(args);

      if (invalidParameters.length > 0) {
        throw new InvalidActionInputError(actionName, invalidParameters, helpLink);
      }

      const authInfo = await getAuthInfo(args, context, actionName);

      const appStudioTokenRes = await context.m365TokenProvider.getAccessToken({
        scopes: TeamsGraphScopes(),
      });
      if (appStudioTokenRes.isErr()) {
        throw appStudioTokenRes.error;
      }
      const appStudioToken = appStudioTokenRes.value;
      const getOauthRes = await teamsGraphClient.getOauthRegistrationById(
        appStudioToken,
        args.configurationId
      );

      const isCustomIdentityProvider =
        !getOauthRes.identityProvider || getOauthRes.identityProvider === "Custom";

      if (!getOauthRes.m365AppId && args.applicableToApps === "SpecificApp" && !args.appId) {
        invalidParameters.push("appId");
      }

      if (isCustomIdentityProvider) {
        if (args.isPKCEEnabled && typeof args.isPKCEEnabled !== "boolean") {
          invalidParameters.push("isPKCEEnabled");
        }

        if (!args.isPKCEEnabled) {
          if (args.clientSecret && !validateSecret(args.clientSecret)) {
            invalidParameters.push("clientSecret");
          }
        }

        if (invalidParameters.length > 0) {
          throw new InvalidActionInputError(actionName, invalidParameters, helpLink);
        }
      }

      if (getOauthRes.isPKCEEnabled && !args.isPKCEEnabled) {
        throw new OauthDisablePKCEError(actionName);
      }

      const diffMsgs = this.compareOauthRegistration(getOauthRes, args, authInfo);
      // If there is no difference, skip the update
      if (!diffMsgs || diffMsgs.length === 0) {
        const summary = getLocalizedString(logMessageKeys.skipUpdateOauth);
        context.logProvider?.info(summary);
        summaries.push(summary);

        return {
          result: ok(outputs),
          summaries: summaries,
        };
      }

      // If there is difference, ask user to confirm the update
      // Skip confirm if only targetUrlsShouldStartWith is different when the url contains devtunnel
      if (
        !this.shouldSkipConfirm(
          diffMsgs,
          getOauthRes.targetUrlsShouldStartWith,
          authInfo.domain,
          isCustomIdentityProvider
        )
      ) {
        const userConfirm = await context.ui!.confirm!({
          name: "confirm-update-oauth",
          title: getLocalizedString("driver.oauth.confirm.update", diffMsgs.join(",\n")),
          default: true,
        });
        if (userConfirm.isErr()) {
          throw userConfirm.error;
        }
      }

      const oauth = this.mapArgsToOauthRegistration(args, authInfo, isCustomIdentityProvider);
      await teamsGraphClient.updateOauthRegistration(appStudioToken, oauth, args.configurationId);

      void context.ui!.showMessage(
        "info",
        getLocalizedString("driver.oauth.info.update", diffMsgs.join(",\n")),
        false
      );
      const summary = getLocalizedString(logMessageKeys.successUpdateOauth);
      context.logProvider?.info(summary);
      summaries.push(summary);

      return {
        result: ok(outputs),
        summaries: summaries,
      };
    } catch (error) {
      if (error instanceof UserError || error instanceof SystemError) {
        context.logProvider?.error(
          getLocalizedString(logMessageKeys.failedExecuteDriver, actionName, error.displayMessage)
        );
        return {
          result: err(error),
          summaries: summaries,
        };
      }

      const message = JSON.stringify(error);
      context.logProvider?.error(
        getLocalizedString(logMessageKeys.failedExecuteDriver, actionName, message)
      );
      return {
        result: err(assembleError(error as Error, actionName)),
        summaries: summaries,
      };
    }
  }

  private validateArgs(args: UpdateOauthArgs): string[] {
    const invalidParameters: string[] = [];
    if (typeof args.configurationId !== "string" || !args.configurationId) {
      invalidParameters.push("registrationId");
    }

    if (typeof args.name !== "string" || !args.name) {
      invalidParameters.push("name");
    }

    if (args.name.length > 128) {
      throw new OauthNameTooLongError(actionName);
    }

    if (args.appId && typeof args.appId !== "string") {
      invalidParameters.push("appId");
    }

    if (args.apiSpecPath && typeof args.apiSpecPath !== "string") {
      invalidParameters.push("apiSpecPath");
    }

    if (args.baseUrl && (typeof args.baseUrl !== "string" || !validateUrl(args.baseUrl))) {
      invalidParameters.push("baseUrl");
    }

    if (
      args.authorizationUrl &&
      (typeof args.authorizationUrl !== "string" || !validateUrl(args.authorizationUrl))
    ) {
      invalidParameters.push("authorizationUrl");
    }

    if (args.tokenUrl && (typeof args.tokenUrl !== "string" || !validateUrl(args.tokenUrl))) {
      invalidParameters.push("tokenUrl");
    }

    if (args.scope && typeof args.scope !== "string") {
      invalidParameters.push("scope");
    }

    if (
      args.applicableToApps &&
      args.applicableToApps !== OauthRegistrationAppType.AnyApp &&
      args.applicableToApps !== OauthRegistrationAppType.SpecificApp
    ) {
      invalidParameters.push("applicableToApps");
    }

    if (
      args.tokenExchangeMethodType &&
      args.tokenExchangeMethodType !== TokenExchangeMethodType.BasicAuthorizationHeader &&
      args.tokenExchangeMethodType !== TokenExchangeMethodType.PostRequestBody
    ) {
      invalidParameters.push("tokenExchangeMethodType");
    }

    if (
      args.targetAudience &&
      args.targetAudience !== OauthRegistrationTargetAudience.AnyTenant &&
      args.targetAudience !== OauthRegistrationTargetAudience.HomeTenant
    ) {
      invalidParameters.push("targetAudience");
    }

    return invalidParameters;
  }

  private compareOauthRegistration(
    current: OauthRegistration,
    input: UpdateOauthArgs,
    authInfo: OauthInfo
  ): string[] {
    const diffMsgs: string[] = [];
    const isMicrosoftEntra = current.identityProvider === "MicrosoftEntra";
    if (current.description !== input.name) {
      diffMsgs.push(`description: ${current.description as string} => ${input.name}`);
    }

    if (input.applicableToApps && current.applicableToApps !== input.applicableToApps) {
      let msg = `applicableToApps: ${current.applicableToApps} => ${input.applicableToApps}`;
      if (input.applicableToApps === "SpecificApp") {
        msg += `, m365AppId: ${input.appId!}`;
      }
      diffMsgs.push(msg);
    }

    if (input.targetAudience && current.targetAudience !== input.targetAudience) {
      diffMsgs.push(
        `targetAudience: ${current.targetAudience as string} => ${input.targetAudience}`
      );
    }

    if (
      input.tokenExchangeMethodType &&
      current.tokenExchangeMethodType !== input.tokenExchangeMethodType
    ) {
      diffMsgs.push(
        `tokenExchangeMethodType: ${current.tokenExchangeMethodType as string} => ${
          input.tokenExchangeMethodType
        }`
      );
    }

    // Compare domain
    const domain = authInfo.domain;
    if (
      domain &&
      (current.targetUrlsShouldStartWith.length !== domain.length ||
        !current.targetUrlsShouldStartWith.every((value) => domain.includes(value)) ||
        !domain.every((value) => current.targetUrlsShouldStartWith.includes(value)))
    ) {
      diffMsgs.push(
        `targetUrlsShouldStartWith: ${current.targetUrlsShouldStartWith.join(",")} => ${domain.join(
          ","
        )}`
      );
    }

    if (input.clientId && current.clientId !== input.clientId) {
      diffMsgs.push(`clientId: ${current.clientId} => ${input.clientId}`);
    }

    // TODO: Need to separate the logic for different flows
    // Compare authorizationEndpoint
    if (
      !isMicrosoftEntra &&
      authInfo.authorizationEndpoint &&
      current.authorizationEndpoint !== authInfo.authorizationEndpoint
    ) {
      diffMsgs.push(
        `authorizationEndpoint: ${current.authorizationEndpoint ?? ""} => ${
          authInfo.authorizationEndpoint
        }`
      );
    }

    // Compare tokenExchangeEndpoint
    if (
      !isMicrosoftEntra &&
      authInfo.tokenExchangeEndpoint &&
      current.tokenExchangeEndpoint !== authInfo.tokenExchangeEndpoint
    ) {
      diffMsgs.push(
        `tokenExchangeEndpoint: ${current.tokenExchangeEndpoint!} => ${
          authInfo.tokenExchangeEndpoint
        }`
      );
    }

    // Compare tokenRefreshEndpoint
    if (
      !isMicrosoftEntra &&
      authInfo.tokenRefreshEndpoint &&
      current.tokenRefreshEndpoint !== authInfo.tokenRefreshEndpoint
    ) {
      diffMsgs.push(
        `tokenRefreshEndpoint: ${current.tokenRefreshEndpoint!} => ${
          authInfo.tokenRefreshEndpoint ?? "Undefined"
        }`
      );
    }

    // Compare scopes
    if (
      !isMicrosoftEntra &&
      authInfo.scopes &&
      !this.compareScopes(current.scopes, authInfo.scopes)
    ) {
      diffMsgs.push(`scopes: ${current.scopes.join(",")} => ${authInfo.scopes.join(",")}`);
    }

    if (!!current.isPKCEEnabled !== !!input.isPKCEEnabled) {
      diffMsgs.push(
        `isPKCEEnabled: ${(!!current.isPKCEEnabled).toString()} => ${(!!input.isPKCEEnabled).toString()}`
      );
    }

    return diffMsgs;
  }

  // Should skip confirm box if only targetUrlsShouldStartWith/client id is different and the url contains devtunnel
  private shouldSkipConfirm(
    diffMsgs: string[],
    getDomain: string[],
    domain: string[] | undefined,
    isCustomIdentityProvider: boolean
  ): boolean {
    if (!domain) {
      return diffMsgs.length === 1 && diffMsgs[0].includes("clientId");
    }

    const targetUrlChangesWithDevTunnel =
      getDomain.length === domain.length &&
      getDomain.every((value) => value.includes("devtunnel")) &&
      domain.every((value) => value.includes("devtunnel")) &&
      diffMsgs[0].includes("targetUrlsShouldStartWith");

    if (isCustomIdentityProvider) {
      return diffMsgs.length === 1 && targetUrlChangesWithDevTunnel;
    } else {
      return (
        diffMsgs.length === 2 && targetUrlChangesWithDevTunnel && diffMsgs[1].includes("clientId")
      );
    }
  }

  private mapArgsToOauthRegistration(
    args: UpdateOauthArgs,
    authInfo: OauthInfo,
    isCustomIdentityProvider: boolean
  ): OauthRegistration {
    const targetAudience = args.targetAudience
      ? (args.targetAudience as OauthRegistrationTargetAudience)
      : undefined;
    const applicableToApps = args.applicableToApps
      ? (args.applicableToApps as OauthRegistrationAppType)
      : undefined;

    const tokenExchangeMethodType = args.tokenExchangeMethodType
      ? (args.tokenExchangeMethodType as TokenExchangeMethodType)
      : TokenExchangeMethodType.BasicAuthorizationHeader;

    const result = {
      description: args.name,
      targetUrlsShouldStartWith: authInfo.domain,
      applicableToApps: applicableToApps,
      m365AppId: applicableToApps === OauthRegistrationAppType.SpecificApp ? args.appId : "",
      targetAudience: targetAudience,
      isPKCEEnabled: !!args.isPKCEEnabled,
      tokenExchangeMethodType: tokenExchangeMethodType,
      scopes: authInfo.scopes ?? [],
    } as OauthRegistration;

    if (isCustomIdentityProvider) {
      result.authorizationEndpoint = authInfo.authorizationEndpoint;
      result.tokenExchangeEndpoint = authInfo.tokenExchangeEndpoint;
      result.tokenRefreshEndpoint = authInfo.tokenRefreshEndpoint;
      if (args.clientSecret && !result.isPKCEEnabled) {
        result.clientSecret = args.clientSecret;
      }
    }

    if (args.clientId) {
      result.clientId = args.clientId;
    }

    return result;
  }

  private compareScopes(current: string[], input: string[] | undefined): boolean {
    return (
      !!input &&
      current.length === input.length &&
      current.every((value) => input.includes(value)) &&
      input.every((value) => current.includes(value))
    );
  }
}
