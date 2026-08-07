// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author yuqzho@microsoft.com, Ning Tang
 */

import { ProjectType, SpecParser, WarningResult } from "@microsoft/m365-spec-parser";
import {
  AppPackageFolderName,
  Context,
  DefaultApiSpecFolderName,
  DefaultApiSpecJsonFileName,
  DefaultApiSpecYamlFileName,
  DefaultPluginManifestFileName,
  FxError,
  GeneratorResult,
  Inputs,
  ManifestTemplateFileName,
  Platform,
  ResponseTemplatesFolderName,
  SystemError,
  TeamsAppManifest,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { merge } from "lodash";
import { err, ok, Result } from "neverthrow";
import path from "path";
import { isValidHttpUrl } from "../../../common/stringUtils";
import { isJsonSpecFile } from "../../../common/utils";
import { QuestionNames } from "../../../question";
import { ProgrammingLanguage } from "../../../question/constants";
import { copilotGptManifestUtils } from "../../driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../driver/teamsApp/utils/ManifestUtils";
import { ActionContext } from "../../middleware/actionExecutionMW";
import { Generator } from "../generator";
import { TemplateInfo } from "../templates/templateInfo";
import {
  declarativeAgentExistingApiSpecUrlTelemetryEvent,
  defaultDeclarativeAgentActionId,
  defaultDeclarativeAgentManifestFileName,
  failedToUpdateCustomApiTemplateErrorName,
} from "./const";
import {
  generateFromApiSpec,
  generateScaffoldingSummary,
  getEnvName,
  getParserOptions,
  updateForCustomApi,
} from "./helper";
import { telemetryProperties, TemplateState } from "./interface";

function normalizePath(path: string): string {
  return "./" + path.replace(/\\/g, "/");
}

async function handleWarnings(
  context: Context,
  inputs: Inputs,
  warnings: WarningResult[],
  teamsManifest: TeamsAppManifest,
  destinationPath: string,
  openapiSpecPath: string,
  pluginManifestPath?: string
): Promise<Result<GeneratorResult, FxError>> {
  // log warnings
  if (inputs.platform === Platform.CLI || inputs.platform === Platform.VS) {
    const warnSummary = await generateScaffoldingSummary(
      warnings,
      teamsManifest,
      path.relative(destinationPath, openapiSpecPath),
      pluginManifestPath === undefined
        ? undefined
        : path.relative(destinationPath, pluginManifestPath),
      destinationPath
    );

    if (warnSummary) {
      context.logProvider.info(warnSummary);
    }
  }

  if (inputs.platform === Platform.VSCode) {
    return ok({
      warnings: warnings.map((warning) => {
        return {
          type: warning.type,
          content: warning.content,
          data: warning.data,
        };
      }),
    });
  } else {
    return ok({ warnings: undefined });
  }
}

export async function getTemplateInfosFromApiSpec(
  context: Context,
  inputs: Inputs,
  projectType: ProjectType,
  actionContext?: ActionContext
): Promise<Result<TemplateInfo[], FxError>> {
  const templateName = inputs[QuestionNames.TemplateName];

  merge(actionContext?.telemetryProps, {
    [telemetryProperties.templateName]: templateName,
    [telemetryProperties.isDeclarativeAgent]:
      projectType === ProjectType.Copilot ? "true" : "false",
  });

  let language = inputs[QuestionNames.ProgrammingLanguage] as ProgrammingLanguage;
  if (projectType !== ProjectType.TeamsAi) {
    language =
      language === ProgrammingLanguage.CSharp
        ? ProgrammingLanguage.CSharp
        : ProgrammingLanguage.None;
  }
  const safeProjectNameFromVS =
    language === ProgrammingLanguage.CSharp ? inputs[QuestionNames.SafeProjectName] : undefined;
  const solutionNameFromVS =
    language === ProgrammingLanguage.CSharp ? inputs[QuestionNames.SolutionName] : undefined;
  const url = inputs[QuestionNames.ApiSpecLocation].trim();
  const isYaml = !(await isJsonSpecFile(url));
  const openapiSpecFileName = isYaml ? DefaultApiSpecYamlFileName : DefaultApiSpecJsonFileName;

  const llmServiceData = {
    llmService: inputs[QuestionNames.LLMService],
    openAIKey: inputs[QuestionNames.OpenAIKey],
    azureOpenAIKey: inputs[QuestionNames.AzureOpenAIKey],
    azureOpenAIEndpoint: inputs[QuestionNames.AzureOpenAIEndpoint],
    azureOpenAIDeploymentName: inputs[QuestionNames.AzureOpenAIDeploymentName],
  };

  const openapiSpecPath = normalizePath(
    path.join(AppPackageFolderName, DefaultApiSpecFolderName, openapiSpecFileName)
  );

  const authData = inputs.apiAuthData;
  const convertedAuthData = [];
  if (authData && authData.length > 0) {
    for (const auth of authData) {
      const envName = (auth as any).registrationId ?? getEnvName(auth.authName ?? "");
      convertedAuthData.push({
        authName: auth.authName ?? "",
        openapiSpecPath: openapiSpecPath,
        registrationIdEnvName: envName,
        authType: auth.authType,
      });
    }
  }
  context.templateVariables = Generator.getDefaultVariables(
    inputs[QuestionNames.AppName],
    safeProjectNameFromVS,
    solutionNameFromVS,
    inputs.targetFramework,
    inputs.placeProjectFileInSolutionDir === "true",
    convertedAuthData ?? [],
    llmServiceData
  );
  context.telemetryReporter?.sendTelemetryEvent(declarativeAgentExistingApiSpecUrlTelemetryEvent, {
    [telemetryProperties.isRemoteUrlTelemetryProperty]: isValidHttpUrl(url).toString(),
    [telemetryProperties.generateType]: projectType.toString(),
    [telemetryProperties.authType]: authData?.map((item: any) => item.authType).join(",") ?? "None",
  });
  inputs.templateState = {
    isYaml: isYaml,
    templateName: templateName,
    url: url,
    isPlugin: projectType === ProjectType.Copilot,
    type: projectType,
  };
  return ok([
    {
      templateName: templateName,
      language: language,
      replaceMap: {
        ...context.templateVariables,
        DeclarativeCopilot: projectType === ProjectType.Copilot ? "true" : "",
      },
    },
  ]);
}

export async function generateFilesFromApiSpec(
  context: Context,
  inputs: Inputs,
  destinationPath: string,
  projectType: ProjectType,
  componentName: string
): Promise<Result<GeneratorResult, FxError>> {
  const templateState = inputs.templateState as TemplateState;
  const isDeclarativeAgent = projectType === ProjectType.Copilot;
  const manifestPath = path.join(destinationPath, AppPackageFolderName, ManifestTemplateFileName);
  const apiSpecFolderPath = path.join(
    destinationPath,
    AppPackageFolderName,
    DefaultApiSpecFolderName
  );
  const openapiSpecFileName = templateState.isYaml
    ? DefaultApiSpecYamlFileName
    : DefaultApiSpecJsonFileName;

  let openapiSpecPath = path.join(apiSpecFolderPath, openapiSpecFileName);

  if (projectType === ProjectType.TeamsAi) {
    const language = inputs[QuestionNames.ProgrammingLanguage] as ProgrammingLanguage;
    if (language === ProgrammingLanguage.CSharp) {
      openapiSpecPath = path.join(destinationPath, DefaultApiSpecFolderName, openapiSpecFileName);
    }
  }

  await fs.ensureDir(apiSpecFolderPath);

  const pluginManifestPath =
    templateState.type === ProjectType.Copilot
      ? path.join(destinationPath, AppPackageFolderName, DefaultPluginManifestFileName)
      : undefined;
  const responseTemplateFolder =
    templateState.type === ProjectType.SME
      ? path.join(destinationPath, AppPackageFolderName, ResponseTemplatesFolderName)
      : undefined;

  const specParser = new SpecParser(
    templateState.url,
    getParserOptions(templateState.type, isDeclarativeAgent)
  );
  const generateResult = await generateFromApiSpec(
    specParser,
    manifestPath,
    inputs,
    context,
    componentName,
    templateState.type,
    {
      destinationApiSpecFilePath: openapiSpecPath,
      pluginManifestFilePath: pluginManifestPath,
      responseTemplateFolder,
    },
    templateState.url
  );
  let warnings: WarningResult[];
  if (generateResult.isErr()) {
    return err(generateResult.error);
  } else {
    warnings = generateResult.value.warnings;
  }
  if (isDeclarativeAgent) {
    const addActionResult = await copilotGptManifestUtils.updateDeclarativeAgentManifest(
      manifestPath,
      defaultDeclarativeAgentManifestFileName,
      defaultDeclarativeAgentActionId,
      pluginManifestPath || ""
    );
    if (addActionResult.isErr()) {
      return err(addActionResult.error);
    }
  }
  if (projectType === ProjectType.TeamsAi) {
    const specs = await specParser.getFilteredSpecs(inputs[QuestionNames.ApiOperation]);
    const spec = specs[1];
    try {
      const language = inputs[QuestionNames.ProgrammingLanguage] as ProgrammingLanguage;
      const updateWarnings = await updateForCustomApi(
        spec,
        language,
        destinationPath,
        openapiSpecFileName
      );
      warnings.push(...updateWarnings);
    } catch (error: unknown) {
      throw new SystemError(
        componentName,
        failedToUpdateCustomApiTemplateErrorName,
        (error as Error).message,
        (error as Error).message
      );
    }
  }

  const manifestRes = await manifestUtils._readAppManifest(manifestPath);

  if (manifestRes.isErr()) {
    return err(manifestRes.error);
  }

  const teamsManifest = manifestRes.value;
  return handleWarnings(
    context,
    inputs,
    warnings,
    teamsManifest,
    destinationPath,
    openapiSpecPath,
    pluginManifestPath
  );
}
