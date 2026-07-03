// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import AdmZip from "adm-zip";
import * as fs from "fs-extra";
import { Service } from "typedi";

import { hooks } from "@feathersjs/hooks/lib";
import { FxError, Result, SystemError, TeamsAppManifest, UserError } from "@microsoft/teamsfx-api";

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
import { Constants } from "../teamsApp/constants";
import { AppStudioError } from "../teamsApp/errors";
import { AppStudioResultFactory } from "../teamsApp/results";
import { verifyLocalMCPPluginCerts } from "../teamsApp/utils/McpCertVerification";
import { CopilotAgentPublishArgs } from "./interfaces/PublishArgs";

export const actionName = "copilotAgent/publish";
const helpLink = "https://aka.ms/teamsfx-actions/copilotagent-publish";

const outputKeys = {
  titleId: "titleId",
  appId: "appId",
  shareLink: "shareLink",
};

@Service(actionName) // DO NOT MODIFY the service name
export class CopilotAgentPublishDriver implements StepDriver {
  description = getLocalizedString("driver.m365.acquire.description");
  readonly progressTitle = getLocalizedString("driver.m365.acquire.progress.message");

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async run(
    args: CopilotAgentPublishArgs,
    context: DriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    return wrapRun(async () => {
      const result = await this.handler(args, context);
      return result.output;
    }, actionName);
  }

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async execute(
    args: CopilotAgentPublishArgs,
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
    args: CopilotAgentPublishArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<{
    output: Map<string, string>;
    summaries: string[];
  }> {
    try {
      this.validateArgs(args);
      this.validateOutputEnvVarNames(outputEnvVarNames);

      const appPackagePath = getAbsolutePath(args.appPackagePath, context.projectPath);
      if (!(await fs.pathExists(appPackagePath))) {
        throw new FileNotFoundError(actionName, appPackagePath, helpLink);
      }

      // Verify MCP certs for declarative agents
      const archivedFile = await fs.readFile(appPackagePath);
      const zipEntries = new AdmZip(archivedFile).getEntries();

      const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
      if (!manifestFile) {
        throw new FileNotFoundError(actionName, Constants.MANIFEST_FILE, helpLink);
      }
      const manifestString = manifestFile.getData().toString();
      const manifest = JSON.parse(manifestString) as TeamsAppManifest;

      const declarativeAgents = manifest.copilotAgents?.declarativeAgents;

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
                  throw AppStudioResultFactory.UserError(
                    AppStudioError.ValidationFailedError.name,
                    [message, message]
                  );
                }
              }
            }
          }
        }
      }

      // Get scope, default to Personal
      const scope = this.parseScope(args.scope);

      // Get MOS service settings
      const sideloadingServiceEndpoint = getResourceServiceEndpoint(ResourceServiceType.MOS3);

      const packageService = new PackageService(sideloadingServiceEndpoint, context.logProvider);
      const sideloadingTokenRes = await context.m365TokenProvider.getAccessToken({
        scopes: MosServiceScope(),
      });
      if (sideloadingTokenRes.isErr()) {
        throw sideloadingTokenRes.error;
      }
      const sideloadingToken = sideloadingTokenRes.value;

      // Use Builder API via publishAgent
      const publishRes = await packageService.publishAgent(sideloadingToken, appPackagePath, scope);

      const mapping = new Map<string, string>();
      mapping.set(outputEnvVarNames!.get(outputKeys.titleId)!, publishRes[0]);
      mapping.set(outputEnvVarNames!.get(outputKeys.appId)!, publishRes[1]);
      const shareLinkKey = outputEnvVarNames?.get(outputKeys.shareLink);
      if (shareLinkKey && publishRes[2]) {
        mapping.set(shareLinkKey, publishRes[2]);
      }

      return {
        output: mapping,
        summaries: [getLocalizedString("driver.m365.acquire.summary", publishRes[0])],
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

  private validateArgs(args: CopilotAgentPublishArgs): void {
    const invalidParameters: string[] = [];

    if (!args.appPackagePath || typeof args.appPackagePath !== "string") {
      invalidParameters.push("appPackagePath");
    }

    if (
      args.scope &&
      !Object.values(AppScope)
        .map((v) => v.toLowerCase())
        .includes(args.scope.toLowerCase())
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

  private parseScope(scope?: string): AppScope {
    if (!scope) {
      return AppScope.Personal;
    }
    const lowerScope = scope.toLowerCase();
    if (lowerScope === "tenant") {
      return AppScope.Tenant;
    } else if (lowerScope === "shared") {
      return AppScope.Shared;
    }
    return AppScope.Personal;
  }
}
