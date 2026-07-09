// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yuqzho@microsoft.com
 */

import {
  AppPackageFolderName,
  Context,
  err,
  FxError,
  GeneratorResult,
  Inputs,
  ManifestTemplateFileName,
  ok,
  OptionItem,
  Platform,
  Result,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import { merge } from "lodash";
import path from "path";
import { featureFlagManager, FeatureFlags } from "../../../common/featureFlags";
import { convertToAlphanumericOnly } from "../../../common/stringUtils";
import {
  ActionStartOptions,
  ApiAuthOptions,
  ProgrammingLanguage,
  QuestionNames,
} from "../../../question";
import { developerPortalScaffoldUtils } from "../../developerPortalScaffoldUtils";
import { copilotGptManifestUtils } from "../../driver/teamsApp/utils/CopilotGptManifestUtils";
import { ActionContext } from "../../middleware/actionExecutionMW";
import { outputScaffoldingWarningMessage } from "../../utils/common";
import { DefaultTemplateGenerator } from "../defaultGenerator";
import { Generator } from "../generator";
import { TemplateInfo } from "../templates/templateInfo";
import { TemplateNames } from "../templates/templateNames";
import * as declarativeAgentHelper from "./helper";

export const declarativeAgentGeneratorDeps = {
  deriveMCPServerNameFromUrl: declarativeAgentHelper.deriveMCPServerNameFromUrl,
  setGeneralSensitivityLabel: declarativeAgentHelper.setGeneralSensitivityLabel,
  generateForMCPForDA: declarativeAgentHelper.generateForMCPForDA,
  addExistingPlugin: declarativeAgentHelper.addExistingPlugin,
};

const enum telemetryProperties {
  templateName = "template-name",
  isDeclarativeCopilot = "is-declarative-copilot",
  isMicrosoftEntra = "is-microsoft-entra",
  needAddPluginFromExisting = "need-add-plugin-from-existing",
}

/**
 * Generator for copilot extensions including declarative copilot with no plugin,
 * declarative copilot with API plugin from scratch, declarative copilot with existing plugin,
 * and API plugin from scratch.
 */
export class DeclarativeAgentGenerator extends DefaultTemplateGenerator {
  componentName = "declarative-agent-from-scratch-generator";
  public override activate(context: Context, inputs: Inputs): boolean {
    return [
      TemplateNames.DeclarativeAgentBasic,
      TemplateNames.DeclarativeAgentWithActionFromScratch,
      TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
      TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
      TemplateNames.DeclarativeAgentWithExistingAction,
      TemplateNames.DeclarativeAgentWithTypeSpec,
      TemplateNames.DeclarativeAgentWithActionFromMCP,
      TemplateNames.DeclarativeAgentWithSkill,
    ].includes(inputs[QuestionNames.TemplateName]);
  }

  public override async getTemplateInfos(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<TemplateInfo[], FxError>> {
    const auth = inputs[QuestionNames.ApiAuth];
    const appName = inputs[QuestionNames.AppName];
    const language = inputs[QuestionNames.ProgrammingLanguage] as ProgrammingLanguage;
    const safeProjectNameFromVS =
      language === "csharp" ? inputs[QuestionNames.SafeProjectName] : undefined;
    const solutionNameFromVS =
      language === "csharp" ? inputs[QuestionNames.SolutionName] : undefined;

    const MCPServerType = inputs[QuestionNames.MCPServerType];
    const isLocalMCP = MCPServerType === "local";
    const MCPForDAServerUrl = inputs[QuestionNames.MCPForDAServerUrl];

    try {
      const replaceMap = {
        ...Generator.getDefaultVariables(
          inputs[QuestionNames.TemplateName] === TemplateNames.DeclarativeAgentWithTypeSpec
            ? convertToAlphanumericOnly(appName)
            : appName,
          safeProjectNameFromVS,
          solutionNameFromVS,
          inputs.targetFramework,
          inputs.placeProjectFileInSolutionDir === "true"
        ),
        DeclarativeCopilot: "true",
        MicrosoftEntra: auth === ApiAuthOptions.microsoftEntra().id ? "true" : "",
        IsLocalMCP: isLocalMCP ? "true" : "",
        ...(isLocalMCP
          ? this.processMCPLocalServers(inputs)
          : MCPForDAServerUrl
            ? {
                MCPForDAServerUrl,
                ServerName:
                  declarativeAgentGeneratorDeps.deriveMCPServerNameFromUrl(MCPForDAServerUrl),
              }
            : {}),
      };
      const templateName = inputs[QuestionNames.TemplateName];

      merge(actionContext?.telemetryProps, {
        [telemetryProperties.templateName]: templateName,
        [telemetryProperties.isMicrosoftEntra]:
          auth === ApiAuthOptions.microsoftEntra().id ? "true" : "",
        [telemetryProperties.needAddPluginFromExisting]:
          inputs[QuestionNames.ActionType] === ActionStartOptions.existingPlugin().id.toString(),
      });

      return Promise.resolve(
        ok([
          {
            templateName,
            language: language,
            replaceMap,
          },
        ])
      );
    } catch (error) {
      return err(error);
    }
  }

  public override async post(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<GeneratorResult, FxError>> {
    const teamsManifestPath = path.join(
      destinationPath,
      AppPackageFolderName,
      ManifestTemplateFileName
    );
    const declarativeCopilotManifestPathRes =
      await copilotGptManifestUtils.getManifestPath(teamsManifestPath);
    if (declarativeCopilotManifestPathRes.isErr()) {
      // only return error in da existing action case
      if (TemplateNames.DeclarativeAgentWithExistingAction === inputs[QuestionNames.TemplateName]) {
        return err(declarativeCopilotManifestPathRes.error);
      }
      return ok({});
    }

    if (featureFlagManager.getBooleanValue(FeatureFlags.SensitivityLabelEnabled)) {
      // best-effort
      await declarativeAgentGeneratorDeps.setGeneralSensitivityLabel(
        context,
        declarativeCopilotManifestPathRes.value
      );
    }

    if (TemplateNames.DeclarativeAgentWithActionFromMCP === inputs[QuestionNames.TemplateName]) {
      const result = await declarativeAgentGeneratorDeps.generateForMCPForDA(
        destinationPath,
        inputs
      );
      return result;
    }

    if (TemplateNames.DeclarativeAgentWithExistingAction === inputs[QuestionNames.TemplateName]) {
      const addPluginRes = await declarativeAgentGeneratorDeps.addExistingPlugin(
        declarativeCopilotManifestPathRes.value,
        inputs[QuestionNames.PluginManifestFilePath],
        inputs[QuestionNames.PluginOpenApiSpecFilePath],
        "action_1",
        context,
        this.componentName
      );

      if (addPluginRes.isErr()) {
        return err(addPluginRes.error);
      } else {
        if (inputs.platform === Platform.CLI || inputs.platform === Platform.VS) {
          const warningMessage = outputScaffoldingWarningMessage(addPluginRes.value.warnings);
          if (warningMessage) {
            context.logProvider.info(warningMessage);
          }
        }
        return ok({ warnings: addPluginRes.value.warnings });
      }
    } else {
      if (inputs.teamsAppFromTdp) {
        const res = await developerPortalScaffoldUtils.updateFilesForTdp(
          context,
          inputs.teamsAppFromTdp,
          inputs
        );
        if (res.isErr()) {
          return err(res.error);
        }
      }
      return ok({});
    }
  }

  /**
   * Process selected MCP local servers from inputs and format for template
   * Handles both single and multiple server selection for backward compatibility
   */
  private processMCPLocalServers(inputs: Inputs): {
    MCPLocalServers: Array<{
      name: string;
      identifier: string;
      command: string;
      args: string;
      notLast: boolean;
    }>;
  } {
    const selectedOptions = inputs[QuestionNames.MCPLocalServer] as OptionItem[] | undefined;

    if (selectedOptions && !Array.isArray(selectedOptions)) {
      throw new SystemError(
        this.componentName,
        "processMCPLocalServers",
        "Expected MCPLocalServer input to be an array"
      );
    }

    // Handle empty/invalid selection
    if (!selectedOptions || selectedOptions.length === 0) {
      return {
        MCPLocalServers: [],
      };
    }

    // Map selected options to server configs
    const servers = selectedOptions.map((option, index) => {
      // Validate option structure
      if (!option.data || typeof option.data !== "string") {
        throw new SystemError(
          this.componentName,
          "processMCPLocalServers",
          "Invalid option data structure"
        );
      }

      const serverData = JSON.parse(option.data);

      // Validate parsed data
      if (!serverData.identifier || !Array.isArray(serverData.args)) {
        throw new SystemError(
          this.componentName,
          "processMCPLocalServers",
          "Invalid server data format"
        );
      }

      if (!serverData.command || typeof serverData.command !== "string") {
        throw new UserError(
          this.componentName,
          "processMCPLocalServers",
          "Invalid or missing command in server data"
        );
      }

      return {
        name: option.id,
        identifier: serverData.identifier,
        command: serverData.command,
        args: serverData.args.map((arg: string) => `"${arg}"`).join(", "),
        notLast: index < selectedOptions.length - 1,
      };
    });

    return {
      MCPLocalServers: servers,
    };
  }
}
