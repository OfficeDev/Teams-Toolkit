// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import { FxError, Platform, Result, TeamsAppManifest, err, ok } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { merge } from "lodash";
import { Service } from "typedi";
import { GraphClient } from "../../../client/graphClient";
import { SovereignCloudEnvironment } from "../../../common/accountUtils";
import { GraphTeamsAppCatalogReadWriteScopes } from "../../../common/constants";
import { FeatureFlagName } from "../../../common/featureFlags";
import { getLocalizedString } from "../../../common/localizeUtils";
import { FileNotFoundError, InvalidActionInputError, UserCancelError } from "../../../error/common";
import { getAbsolutePath } from "../../utils/common";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { WrapDriverContext } from "../util/wrapUtil";
import { Constants } from "./constants";
import { AppStudioError } from "./errors";
import { PublishAppPackageArgs } from "./interfaces/PublishAppPackageArgs";
import { AppStudioResultFactory } from "./results";
import { verifyLocalMCPPluginCerts } from "./utils/McpCertVerification";
import { TelemetryPropertyKey } from "./utils/telemetry";

export const actionName = "teamsApp/publishAppPackage";

const defaultOutputNames = {
  publishedAppId: "TEAMS_APP_PUBLISHED_APP_ID",
};

@Service(actionName)
export class PublishAppPackageDriver implements StepDriver {
  description = getLocalizedString("driver.teamsApp.description.publishDriver");
  readonly progressTitle = getLocalizedString("driver.teamsApp.progressBar.publishTeamsAppStep2.2");

  public async execute(
    args: PublishAppPackageArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.publish(args, wrapContext, outputEnvVarNames);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async publish(
    args: PublishAppPackageArgs,
    context: WrapDriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<Result<Map<string, string>, FxError>> {
    if (
      process.env[FeatureFlagName.SovereignCloudEnvironment] === SovereignCloudEnvironment.GCCH ||
      process.env[FeatureFlagName.SovereignCloudEnvironment] === SovereignCloudEnvironment.DOD
    ) {
      context.logProvider.warning(
        getLocalizedString("driver.teamsApp.warning.publishUnsupportedCloud", actionName)
      );
      return ok(new Map<string, string>());
    }

    const argsValidationResult = this.validateArgs(args);
    if (argsValidationResult.isErr()) {
      return err(argsValidationResult.error);
    }

    if (!outputEnvVarNames) {
      outputEnvVarNames = new Map(Object.entries(defaultOutputNames));
    }

    const appPackagePath = getAbsolutePath(args.appPackagePath, context.projectPath);
    if (!(await fs.pathExists(appPackagePath))) {
      return err(
        new FileNotFoundError(
          actionName,
          appPackagePath,
          "https://aka.ms/teamsfx-actions/teamsapp-publish"
        )
      );
    }
    const archivedFile = await fs.readFile(appPackagePath);

    const zipEntries = new AdmZip(archivedFile).getEntries();

    const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
    if (!manifestFile) {
      return err(
        new FileNotFoundError(
          actionName,
          Constants.MANIFEST_FILE,
          "https://aka.ms/teamsfx-actions/teamsapp-publish"
        )
      );
    }
    const manifestString = manifestFile.getData().toString();
    const manifest = JSON.parse(manifestString) as TeamsAppManifest;

    const declarativeAgents =
      manifest.copilotExtensions?.declarativeCopilots || manifest.copilotAgents?.declarativeAgents;

    if (declarativeAgents && declarativeAgents.length > 0) {
      const declarativeAgentFile = zipEntries.find(
        (x) => x.entryName === declarativeAgents[0].file
      );

      if (declarativeAgentFile) {
        const declarativeAgentContent = declarativeAgentFile.getData().toString();
        const declarativeAgentManifest = JSON.parse(declarativeAgentContent);

        if (declarativeAgentManifest.actions) {
          for (const action of declarativeAgentManifest.actions) {
            const actionFile = zipEntries.find((x) => x.entryName === action.file);
            if (actionFile) {
              const isValid = await verifyLocalMCPPluginCerts(actionFile);
              if (!isValid) {
                const message = getLocalizedString(
                  "driver.teamsApp.error.localMcpCertVerificationFailed"
                );
                return err(
                  AppStudioResultFactory.UserError(AppStudioError.ValidationFailedError.name, [
                    message,
                    message,
                  ])
                );
              }
            }
          }
        }
      }
    }

    // manifest.id === externalID
    const graphTokenRes = await context.m365TokenProvider.getAccessToken({
      scopes: GraphTeamsAppCatalogReadWriteScopes,
    });
    if (graphTokenRes.isErr()) {
      return err(graphTokenRes.error);
    }
    const graphClient = new GraphClient(context.m365TokenProvider, context.logProvider);

    let result;

    const message = getLocalizedString("driver.teamsApp.progressBar.publishTeamsAppStep1");
    context.addSummary(message);

    try {
      const existApp = await graphClient.getStagedApp(graphTokenRes.value, manifest.id);
      if (existApp) {
        context.addSummary(
          getLocalizedString("driver.teamsApp.summary.publishTeamsAppExists", manifest.id)
        );
        let executePublishUpdate = false;
        let description = getLocalizedString(
          "plugins.appstudio.pubWarn",
          existApp.displayName,
          existApp.publishingState
        );
        if (existApp.lastModifiedDateTime) {
          description =
            description +
            getLocalizedString(
              "plugins.appstudio.lastModified",
              existApp.lastModifiedDateTime?.toLocaleString()
            );
        }
        description =
          description + getLocalizedString("plugins.appstudio.updatePublihsedAppConfirm");
        const confirm = getLocalizedString("core.option.confirm");
        const res = await context.ui?.showMessage("warn", description, true, confirm);
        if (res?.isOk() && res.value === confirm) executePublishUpdate = true;

        if (executePublishUpdate) {
          const message = getLocalizedString("driver.teamsApp.progressBar.publishTeamsAppStep2.1");
          context.addSummary(message);
          context.logProvider.debug(message);
          const appId = await graphClient.publishTeamsAppUpdate(
            graphTokenRes.value,
            manifest.id,
            archivedFile
          );
          result = new Map([[outputEnvVarNames.get("publishedAppId") as string, appId]]);
          merge(context.telemetryProperties, {
            [TelemetryPropertyKey.updateExistingApp]: "true",
            [TelemetryPropertyKey.publishedAppId]: appId,
          });
        } else {
          return err(new UserCancelError(actionName));
        }
      } else {
        context.addSummary(
          getLocalizedString("driver.teamsApp.summary.publishTeamsAppNotExists", manifest.id)
        );
        const message = getLocalizedString("driver.teamsApp.progressBar.publishTeamsAppStep2.2");
        context.addSummary(message);
        context.logProvider.debug(message);
        const appId = await graphClient.publishTeamsApp(
          graphTokenRes.value,
          manifest.id,
          archivedFile
        );
        result = new Map([[outputEnvVarNames.get("publishedAppId") as string, appId]]);
        merge(context.telemetryProperties, {
          [TelemetryPropertyKey.updateExistingApp]: "false",
        });
      }
    } catch (e: any) {
      return err(e);
    }

    context.logProvider.info(`Publish success!`);
    context.addSummary(
      getLocalizedString("driver.teamsApp.summary.publishTeamsAppSuccess", manifest.id)
    );
    if (context.platform === Platform.CLI) {
      const msg = getLocalizedString(
        "plugins.appstudio.publishSucceedNotice.cli",
        manifest.name.short,
        Constants.TEAMS_ADMIN_PORTAL,
        Constants.TEAMS_MANAGE_APP_DOC
      );
      context.ui?.showMessage("info", msg, false);
    }
    return ok(result);
  }

  private validateArgs(args: PublishAppPackageArgs): Result<any, FxError> {
    const invalidParams: string[] = [];
    if (!args || !args.appPackagePath) {
      invalidParams.push("appPackagePath");
    }
    if (invalidParams.length > 0) {
      return err(
        new InvalidActionInputError(
          actionName,
          invalidParams,
          "https://aka.ms/teamsfx-actions/teamsapp-publish"
        )
      );
    } else {
      return ok(undefined);
    }
  }
}
