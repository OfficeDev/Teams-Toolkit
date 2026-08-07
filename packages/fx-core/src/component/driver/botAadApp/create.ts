// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import { FxError, Result, SystemError, UserError } from "@microsoft/teamsfx-api";
import axios from "axios";
import { performance } from "perf_hooks";
import { Service } from "typedi";
import { getLocalizedString } from "../../../common/localizeUtils";
import {
  HttpClientError,
  HttpServerError,
  InvalidActionInputError,
  assembleError,
} from "../../../error/common";
import { wrapRun } from "../../utils/common";
import { AadAppNameTooLongError } from "../aad/error/aadAppNameTooLongError";
import { SignInAudience } from "../aad/interface/signInAudience";
import { AadAppClient } from "../../../client/aadAppClient";
import { OutputEnvironmentVariableUndefinedError } from "../error/outputEnvironmentVariableUndefinedError";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { loadStateFromEnv, mapStateToEnv } from "../util/utils";
import { UnexpectedEmptyBotPasswordError } from "./error/unexpectedEmptyBotPasswordError";
import { CreateBotAadAppArgs } from "./interface/createBotAadAppArgs";
import { CreateBotAadAppOutput } from "./interface/createBotAadAppOutput";
import { logMessageKeys, progressBarKeys } from "./utility/constants";
import { GraphScopes } from "../../../common/constants";
import { AadSet } from "../../../common/globalVars";

const actionName = "botAadApp/create"; // DO NOT MODIFY the name
const helpLink = "https://aka.ms/teamsfx-actions/botaadapp-create";

const successRegisterBotAad = `${actionName}/success`;
const propertyKeys = {
  reusingExistingBotAad: "reuse-existing-bot-aad",
  registerBotAadTime: "register-bot-aad-time",
};

@Service(actionName) // DO NOT MODIFY the service name
export class CreateBotAadAppDriver implements StepDriver {
  readonly description?: string | undefined = getLocalizedString(
    "driver.botAadApp.create.description"
  );
  readonly progressTitle = getLocalizedString(progressBarKeys.creatingBotAadApp);

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async run(
    args: CreateBotAadAppArgs,
    context: DriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    return wrapRun(async () => {
      const result = await this.handler(args, context);
      return result.output;
    }, actionName);
  }

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async execute(
    args: CreateBotAadAppArgs,
    ctx: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    let summaries: string[] = [];
    const outputResult = await wrapRun(async () => {
      const result = await this.handler(args, ctx, outputEnvVarNames);
      summaries = result.summaries;
      return result.output;
    }, actionName);
    return {
      result: outputResult,
      summaries,
    };
  }

  public async handler(
    args: CreateBotAadAppArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<{
    output: Map<string, string>;
    summaries: string[];
  }> {
    try {
      context.logProvider?.info(getLocalizedString(logMessageKeys.startExecuteDriver, actionName));

      this.validateArgs(args);
      if (!outputEnvVarNames) {
        throw new OutputEnvironmentVariableUndefinedError(actionName);
      }
      const aadAppClient = new AadAppClient(context.m365TokenProvider, context.logProvider);
      const botAadAppState: CreateBotAadAppOutput = loadStateFromEnv(outputEnvVarNames);
      const isReusingExisting = !(!botAadAppState.botId || !botAadAppState.botPassword);

      // If it's the case of a valid bot id with an empty bot password, then throw an error
      if (botAadAppState.botId && !botAadAppState.botPassword) {
        throw new UnexpectedEmptyBotPasswordError(actionName, helpLink);
      }

      const tokenJson = await context.m365TokenProvider.getJsonObject({ scopes: GraphScopes });
      const isMsftAccount =
        tokenJson.isOk() &&
        typeof tokenJson.value.unique_name == "string" &&
        tokenJson.value.unique_name.endsWith("@microsoft.com");

      const startTime = performance.now();
      if (!botAadAppState.botId) {
        context.logProvider?.info(getLocalizedString(logMessageKeys.startCreateBotAadApp));

        // This hidden environment variable is for internal use only.
        const serviceManagementReference = process.env.TTK_DEFAULT_SERVICE_MANAGEMENT_REFERENCE;

        const aadApp = await aadAppClient.createAadApp(
          args.name,
          SignInAudience.AzureADMultipleOrgs,
          serviceManagementReference,
          isMsftAccount
        );
        botAadAppState.botId = aadApp.appId!;
        AadSet.add(aadApp.appId!);
        botAadAppState.botPassword = await aadAppClient.generateClientSecret(
          aadApp.id!,
          undefined,
          undefined,
          isMsftAccount
        );
        context.logProvider?.info(getLocalizedString(logMessageKeys.successCreateBotAadApp));
      } else {
        context.logProvider?.info(getLocalizedString(logMessageKeys.skipCreateBotAadApp));
      }
      const durationMilliSeconds = performance.now() - startTime;

      const outputs = mapStateToEnv(botAadAppState, outputEnvVarNames);

      let successCreateBotAadLog = getLocalizedString(
        logMessageKeys.successCreateBotAad,
        botAadAppState.botId
      );
      if (isMsftAccount) {
        successCreateBotAadLog += getLocalizedString(logMessageKeys.deleteAadAfterDebugging);
      }
      const useExistingBotAadLog = getLocalizedString(
        logMessageKeys.useExistingBotAad,
        botAadAppState.botId
      );
      const summary = isReusingExisting ? useExistingBotAadLog : successCreateBotAadLog;
      context.logProvider?.info(summary);
      context.logProvider?.info(
        getLocalizedString(logMessageKeys.successExecuteDriver, actionName)
      );
      context.telemetryReporter?.sendTelemetryEvent(successRegisterBotAad, {
        [propertyKeys.reusingExistingBotAad]: isReusingExisting.toString(),
        [propertyKeys.registerBotAadTime]: durationMilliSeconds.toString(),
      });
      return {
        output: outputs,
        summaries: [summary],
      };
    } catch (error: any) {
      if (error instanceof UserError || error instanceof SystemError) {
        context.logProvider?.error(
          getLocalizedString(logMessageKeys.failExecuteDriver, actionName, error.displayMessage)
        );
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const message = JSON.stringify(error.response?.data);
        context.logProvider?.error(
          getLocalizedString(logMessageKeys.failExecuteDriver, actionName, message)
        );
        if (error.response!.status >= 400 && error.response!.status < 500) {
          throw new HttpClientError(error, actionName, message, helpLink);
        } else {
          throw new HttpServerError(error, actionName, message);
        }
      }

      if (error.name === "AadCreateAppError") {
        throw assembleError(error, actionName);
      }

      const message = JSON.stringify(error);
      context.logProvider?.error(
        getLocalizedString(logMessageKeys.failExecuteDriver, actionName, message)
      );
      throw assembleError(error as Error, actionName);
    }
  }

  public validateArgs(args: CreateBotAadAppArgs): void {
    const invalidParameters: string[] = [];
    if (typeof args.name !== "string" || !args.name) {
      invalidParameters.push("name");
    }

    if (invalidParameters.length > 0) {
      throw new InvalidActionInputError(actionName, invalidParameters, helpLink);
    }

    if (args.name.length > 120) {
      throw new AadAppNameTooLongError(actionName);
    }
  }
}
