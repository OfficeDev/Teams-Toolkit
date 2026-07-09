// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Colors,
  err,
  FxError,
  ok,
  Platform,
  Result,
  TeamsManifestConverter,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { merge } from "lodash";
import { EOL } from "os";
import * as path from "path";
import { Service } from "typedi";
import { teamsDevPortalClient } from "../../../client/teamsDevPortalClient";
import {
  AppStudioScopes,
  getResourceServiceEndpoint,
  ResourceServiceType,
} from "../../../common/constants";
import { getLocalizedString } from "../../../common/localizeUtils";
import { waitSeconds } from "../../../common/utils";
import { FileNotFoundError, InvalidActionInputError } from "../../../error/common";
import { SummaryConstant } from "../../configManager/constant";
import { metadataUtil } from "../../utils/metadataUtil";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { WrapDriverContext } from "../util/wrapUtil";
import { CEHCK_VALIDATION_RESULTS_INTERVAL_SECONDS, Constants } from "./constants";
import {
  AsyncAppValidationResponse,
  AsyncAppValidationStatus,
} from "./interfaces/AsyncAppValidationResponse";
import { AsyncAppValidationResultsResponse } from "./interfaces/AsyncAppValidationResultsResponse";
import { ValidateWithTestCasesArgs } from "./interfaces/ValidateWithTestCasesArgs";
import { manifestUtils } from "./utils/ManifestUtils";

const actionName = "teamsApp/validateWithTestCases";

@Service(actionName)
export class ValidateWithTestCasesDriver implements StepDriver {
  description = getLocalizedString(
    "core.selectValidateMethodQuestion.validate.testCasesOptionDescription"
  );
  readonly progressTitle = getLocalizedString("driver.teamsApp.progressBar.validateWithTestCases");

  public async execute(
    args: ValidateWithTestCasesArgs,
    context: DriverContext
  ): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.validate(args, wrapContext);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async validate(
    args: ValidateWithTestCasesArgs,
    context: WrapDriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    const result = this.validateArgs(args);
    if (result.isErr()) {
      return err(result.error);
    }

    let appPackagePath = args.appPackagePath;
    if (!path.isAbsolute(appPackagePath)) {
      appPackagePath = path.join(context.projectPath, appPackagePath);
    }
    if (!(await fs.pathExists(appPackagePath))) {
      return err(new FileNotFoundError(actionName, appPackagePath));
    }

    const archivedFile = await fs.readFile(appPackagePath);

    const zipEntries = new AdmZip(archivedFile).getEntries();
    const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
    if (manifestFile) {
      const manifestContent = manifestFile.getData().toString();
      const manifest = TeamsManifestConverter.jsonToManifest(manifestContent);
      metadataUtil.parseManifest(manifest);

      // Add common properties like isCopilotPlugin: boolean
      const manifestTelemetries = manifestUtils.parseCommonTelemetryProperties(manifest as any);
      merge(context.telemetryProperties, manifestTelemetries);

      const appStudioTokenRes = await context.m365TokenProvider.getAccessToken({
        scopes: AppStudioScopes(),
      });
      if (appStudioTokenRes.isErr()) {
        return err(appStudioTokenRes.error);
      }
      const appStudioToken = appStudioTokenRes.value;
      // Check if the app has ongoing validation
      const existingValidationResponse = await teamsDevPortalClient.getAppValidationRequestList(
        appStudioToken,
        manifest.id
      );
      if (existingValidationResponse.appValidations) {
        for (const validation of existingValidationResponse.appValidations) {
          if (
            validation.status === AsyncAppValidationStatus.InProgress ||
            validation.status === AsyncAppValidationStatus.Created
          ) {
            if (context.platform === Platform.CLI) {
              const message: Array<{ content: string; color: Colors }> = [
                {
                  content: `A validation is currently in progress, please submit later. You can find this existing validation from `,
                  color: Colors.BRIGHT_YELLOW,
                },
                {
                  content: `${getResourceServiceEndpoint(ResourceServiceType.TDP)}/apps/${
                    manifest.id
                  }/app-validation/${validation.id}`,
                  color: Colors.BRIGHT_CYAN,
                },
              ];
              context.ui?.showMessage("warn", message, false);
            } else {
              const message = getLocalizedString(
                "driver.teamsApp.progressBar.validateWithTestCases.conflict",
                `${getResourceServiceEndpoint(ResourceServiceType.TDP)}/apps/${
                  manifest.id
                }/app-validation/${validation.id}`
              );
              context.logProvider.warning(message);
            }
            return ok(new Map());
          }
        }
      }
      const response: AsyncAppValidationResponse =
        await teamsDevPortalClient.submitAppValidationRequest(appStudioToken, manifest.id);

      if (context.platform === Platform.CLI) {
        const message: Array<{ content: string; color: Colors }> = [
          {
            content: `Validation request submitted, status: ${response.status}. View the validation result from `,
            color: Colors.BRIGHT_WHITE,
          },
          {
            content: `${getResourceServiceEndpoint(ResourceServiceType.TDP)}/apps/${
              manifest.id
            }/app-validation/${response.appValidationId}`,
            color: Colors.BRIGHT_CYAN,
          },
        ];
        context.ui?.showMessage("info", message, false);
      } else {
        const message = getLocalizedString(
          "driver.teamsApp.progressBar.validateWithTestCases.step",
          response.status,
          `${getResourceServiceEndpoint(ResourceServiceType.TDP)}/apps/${
            manifest.id
          }/app-validation`
        );
        context.logProvider.info(message);

        // Do not await the final validation result, return immediately
        void this.runningBackgroundJob(args, context, appStudioToken, response, manifest.id);
      }
      return ok(new Map());
    } else {
      return err(new FileNotFoundError(actionName, "manifest.json"));
    }
  }

  /**
   * Periodically check the result until it's completed or aborted
   * @param args
   * @param context
   * @param appStudioToken
   * @param response
   * @param teamsAppId
   */
  public async runningBackgroundJob(
    args: ValidateWithTestCasesArgs,
    context: WrapDriverContext,
    appStudioToken: string,
    response: AsyncAppValidationResponse,
    teamsAppId: string
  ): Promise<void> {
    const validationRequestListUrl = `${getResourceServiceEndpoint(
      ResourceServiceType.TDP
    )}/apps/${teamsAppId}/app-validation`;

    try {
      if (args.showProgressBar && context.ui) {
        context.progressBar = context.ui.createProgressBar(this.progressTitle, 1);
        await context.progressBar.start();

        const message = getLocalizedString(
          "driver.teamsApp.progressBar.validateWithTestCases.step",
          response.status,
          validationRequestListUrl
        );
        await context.progressBar.next(message);
      }
      let resultResp = response as AsyncAppValidationResultsResponse;
      while (
        resultResp.status !== AsyncAppValidationStatus.Completed &&
        resultResp.status !== AsyncAppValidationStatus.Aborted
      ) {
        await waitSeconds(CEHCK_VALIDATION_RESULTS_INTERVAL_SECONDS);
        const message = getLocalizedString(
          "driver.teamsApp.progressBar.validateWithTestCases.step",
          resultResp.status,
          validationRequestListUrl
        );
        context.logProvider.info(message);
        resultResp = await teamsDevPortalClient.getAppValidationById(
          appStudioToken,
          resultResp.appValidationId
        );
      }
      this.evaluateValidationResults(args, context, resultResp, teamsAppId);
    } finally {
      if (args.showProgressBar && context.progressBar) {
        await context.progressBar.end(true);
      }
    }
  }

  /**
   * Evaluate the validation results and log the summary
   * @param args
   * @param context
   * @param resultResp
   * @param teamsAppId
   */
  private evaluateValidationResults(
    args: ValidateWithTestCasesArgs,
    context: WrapDriverContext,
    resultResp: AsyncAppValidationResultsResponse,
    teamsAppId: string
  ): void {
    const validationStatusUrl = `${getResourceServiceEndpoint(
      ResourceServiceType.TDP
    )}/apps/${teamsAppId}/app-validation/${resultResp.appValidationId}`;
    const failed = resultResp.validationResults?.failures?.length ?? 0;
    const warns = resultResp.validationResults?.warnings?.length ?? 0;
    const skipped = resultResp.validationResults?.skipped?.length ?? 0;
    const passed = resultResp.validationResults?.successes?.length ?? 0;
    const summaryStrArr = [];
    const detailStrArr = [];
    if (failed > 0) {
      summaryStrArr.push(getLocalizedString("driver.teamsApp.summary.validate.failed", failed));
      for (const failure of resultResp.validationResults.failures) {
        detailStrArr.push(
          getLocalizedString(
            "driver.teamsApp.summary.validateWithTestCases.result.detail",
            SummaryConstant.Failed,
            failure.title,
            failure.message
          )
        );
      }
    }
    if (warns > 0) {
      summaryStrArr.push(getLocalizedString("driver.teamsApp.summary.validate.warning", warns));
      for (const warning of resultResp.validationResults.warnings) {
        detailStrArr.push(
          getLocalizedString(
            "driver.teamsApp.summary.validateWithTestCases.result.detail",
            SummaryConstant.Warning,
            warning.title,
            warning.message
          )
        );
      }
    }
    if (skipped > 0) {
      summaryStrArr.push(getLocalizedString("driver.teamsApp.summary.validate.skipped", skipped));
    }
    if (passed > 0) {
      summaryStrArr.push(getLocalizedString("driver.teamsApp.summary.validate.succeed", passed));
    }
    const summaryStr = summaryStrArr.join(", ");
    let detailStr = detailStrArr.join(EOL);
    // start a new line if the detail is not empty.
    if (detailStr.length > 0) {
      detailStr = EOL + detailStr;
    }
    if (resultResp.status === AsyncAppValidationStatus.Completed) {
      if (args.showMessage && context.ui) {
        void context.ui.showMessage(
          "info",
          getLocalizedString(
            "driver.teamsApp.summary.validateWithTestCases.result",
            resultResp.status,
            summaryStr
          ),
          false
        );
      }
      context.logProvider.info(
        getLocalizedString(
          "driver.teamsApp.summary.validateWithTestCases",
          resultResp.status,
          summaryStr,
          validationStatusUrl,
          detailStr
        )
      );
    } else {
      if (args.showMessage && context.ui) {
        void context.ui.showMessage(
          "error",
          getLocalizedString(
            "driver.teamsApp.summary.validateWithTestCases.result",
            resultResp.status,
            ""
          ),
          false
        );
      }
      context.logProvider.error(
        getLocalizedString(
          "driver.teamsApp.summary.validateWithTestCases",
          resultResp.status,
          "",
          validationStatusUrl,
          ""
        )
      );
    }
  }

  private validateArgs(args: ValidateWithTestCasesArgs): Result<any, FxError> {
    if (!args || !args.appPackagePath) {
      return err(
        new InvalidActionInputError(
          actionName,
          ["appPackagePath"],
          "https://aka.ms/teamsfx-actions/teamsapp-validate-test-cases"
        )
      );
    }
    return ok(undefined);
  }
}
