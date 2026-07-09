// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import { Service } from "typedi";

import { hooks } from "@feathersjs/hooks/lib";
import { FxError, Result, SystemError, UserError } from "@microsoft/teamsfx-api";

import {
  getResourceServiceEndpoint,
  MosServiceScope,
  ResourceServiceType,
} from "../../../common/constants";
import { getLocalizedString } from "../../../common/localizeUtils";
import { assembleError, FileNotFoundError, InvalidActionInputError } from "../../../error/common";
import { AppScope, PackageService } from "../../m365/packageService";
import { getAbsolutePath, wrapRun } from "../../utils/common";
import { logMessageKeys } from "../aad/utility/constants";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";

interface AcquireArgs {
  appPackagePath?: string; // The path of the app package
  scope?: AppScope;
}

const createPackageService = (
  serviceEndpoint: string,
  logProvider?: DriverContext["logProvider"]
) => new PackageService(serviceEndpoint, logProvider);

export const actionName = "teamsApp/extendToM365";
const helpLink = "https://aka.ms/teamsfx-actions/teamsapp-extendToM365";

const outputKeys = {
  titleId: "titleId",
  appId: "appId",
  shareLink: "shareLink",
};

@Service(actionName) // DO NOT MODIFY the service name
export class M365TitleAcquireDriver implements StepDriver {
  description = getLocalizedString("driver.m365.acquire.description");
  readonly progressTitle = getLocalizedString("driver.m365.acquire.progress.message");

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async run(
    args: AcquireArgs,
    context: DriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    return wrapRun(async () => {
      const result = await this.handler(args, context);
      return result.output;
    }, actionName);
  }

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async execute(
    args: AcquireArgs,
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

  private async handler(
    args: AcquireArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<{
    output: Map<string, string>;
    summaries: string[];
  }> {
    try {
      this.validateArgs(args);
      this.validateOutputEnvVarNames(outputEnvVarNames);
      const appPackagePath = getAbsolutePath(args.appPackagePath!, context.projectPath);
      if (!(await fs.pathExists(appPackagePath))) {
        throw new FileNotFoundError(actionName, appPackagePath, helpLink);
      }

      // get sideloading service settings
      const sideloadingServiceEndpoint = getResourceServiceEndpoint(ResourceServiceType.MOS3);

      const packageService = createPackageService(sideloadingServiceEndpoint, context.logProvider);
      const sideloadingTokenRes = await context.m365TokenProvider.getAccessToken({
        scopes: MosServiceScope(),
      });
      if (sideloadingTokenRes.isErr()) {
        throw sideloadingTokenRes.error;
      }
      const sideloadingToken = sideloadingTokenRes.value;
      const sideloadingRes = await packageService.sideLoading(
        sideloadingToken,
        appPackagePath,
        args.scope
      );

      const mapping = new Map<string, string>();
      mapping.set(outputEnvVarNames!.get(outputKeys.titleId)!, sideloadingRes[0]);
      mapping.set(outputEnvVarNames!.get(outputKeys.appId)!, sideloadingRes[1]);
      if (outputEnvVarNames?.get(outputKeys.shareLink)) {
        mapping.set(outputEnvVarNames.get(outputKeys.shareLink)!, sideloadingRes[2]);
      }
      return {
        output: mapping,
        summaries: [getLocalizedString("driver.m365.acquire.summary", sideloadingRes[0])],
      };
    } catch (error) {
      if (error instanceof UserError || error instanceof SystemError) {
        context.logProvider?.error(
          getLocalizedString(
            logMessageKeys.failExecuteDriver,
            actionName,
            error.displayMessage || error.message
          )
        );
        throw error;
      }

      const message = JSON.stringify(error);
      context.logProvider?.error(
        getLocalizedString(logMessageKeys.failExecuteDriver, actionName, message)
      );
      throw assembleError(error as Error, actionName);
    }
  }

  private validateArgs(args: AcquireArgs): void {
    const invalidParameters: string[] = [];

    if (!args.appPackagePath || typeof args.appPackagePath !== "string") {
      invalidParameters.push("appPackagePath");
    }

    if (
      args.scope &&
      !Object.values(AppScope)
        .map((v) => v.toLowerCase())
        .includes(args.scope)
    ) {
      invalidParameters.push("scope");
    }

    if (invalidParameters.length > 0) {
      throw new InvalidActionInputError(actionName, invalidParameters, helpLink);
    }
  }

  private validateOutputEnvVarNames(outputEnvVarNames?: Map<string, string>): void {
    if (!outputEnvVarNames?.get(outputKeys.titleId) || !outputEnvVarNames.get(outputKeys.appId)) {
      throw new InvalidActionInputError(actionName, ["writeToEnvironmentFile"], helpLink);
    }
  }
}
