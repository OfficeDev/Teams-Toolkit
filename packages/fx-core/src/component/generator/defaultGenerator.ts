// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Context,
  err,
  FxError,
  GeneratorResult,
  IGenerator,
  Inputs,
  ok,
  Platform,
  Result,
} from "@microsoft/teamsfx-api";
import { merge } from "lodash";
import * as path from "path";
import { featureFlagManager, FeatureFlags } from "../../common/featureFlags";
import { TelemetryEvent, TelemetryProperty } from "../../common/telemetry";
import { MetadataV3, MetadataV4 } from "../../common/versionMetadata";
import { ProgrammingLanguage, QuestionNames } from "../../question/constants";
import { ProgressMessages, ProgressTitles } from "../messages";
import { ActionContext, ActionExecutionMW } from "../middleware/actionExecutionMW";
import { commonTemplateName, componentName } from "./constant";
import { Generator, templateDefaultOnActionError } from "./generator";
import { GeneratorContext, TemplateActionSeq } from "./generatorAction";
import { getAllTemplatesOnPlatform, getDefaultTemplatesOnPlatform } from "./templates/metadata";
import { TemplateInfo } from "./templates/templateInfo";
import { getTemplateReplaceMap } from "./templates/templateReplaceMap";
import { convertToLangKey, renderTemplateFileData, renderTemplateFileName } from "./utils";
import * as v4TemplateBridge from "./v4TemplateBridge";

export class DefaultTemplateGenerator implements IGenerator {
  // override this property to send telemetry event with different component name
  componentName = componentName;

  // override this method to determine whether to run this generator
  public activate(context: Context, inputs: Inputs): boolean {
    const templateName = inputs[QuestionNames.TemplateName];
    const platform = inputs.platform;
    const templates = getDefaultTemplatesOnPlatform(platform);
    return templates.some((t) => t.name === templateName);
  }

  // The main entry of the generator. Do not override this method.
  @hooks([
    ActionExecutionMW({
      enableProgressBar: true,
      progressTitle: ProgressTitles.create,
      progressSteps: 1,
      enableTelemetry: true,
      telemetryEventName: TelemetryEvent.GenerateTemplate,
    }),
  ])
  public async run(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<GeneratorResult, FxError>> {
    const preResult = await this.getTemplateInfos(context, inputs, destinationPath, actionContext);
    if (preResult.isErr()) return err(preResult.error);

    const templateInfos = preResult.value;
    for (const templateInfo of templateInfos) {
      templateInfo.replaceMap = { ...getTemplateReplaceMap(inputs), ...templateInfo.replaceMap };
      const templatePath = templateInfo.subFolder
        ? path.join(destinationPath, templateInfo.subFolder)
        : destinationPath;
      await this.scaffolding(context, inputs, templateInfo, templatePath, actionContext);
    }

    const postRes = await this.post(context, inputs, destinationPath, actionContext);
    return postRes;
  }

  // override this method to 1) do pre-step before template download and 2) provide information of templates to be downloaded
  protected getTemplateInfos(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<TemplateInfo[], FxError>> {
    const templateName = inputs[QuestionNames.TemplateName];
    const language = inputs[QuestionNames.ProgrammingLanguage] as ProgrammingLanguage;
    return Promise.resolve(ok([{ templateName, language }]));
  }

  // override this method to do post-step after template download
  protected post(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<GeneratorResult, FxError>> {
    return Promise.resolve(ok({}));
  }

  private async scaffolding(
    context: Context,
    inputs: Inputs,
    templateInfo: TemplateInfo,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<void> {
    const name = templateInfo.templateName;
    const language = convertToLangKey(templateInfo.language) ?? commonTemplateName;
    const replaceMap = templateInfo.replaceMap;
    const sandboxFilterFn = (fileName: string) => {
      if (featureFlagManager.getBooleanValue(FeatureFlags.SandBoxedTeam)) {
        return true;
      }
      const sandboxFileList = [
        `${MetadataV3.sandboxConfigFile}.tpl`,
        `${MetadataV4.sandboxConfigFile}.tpl`,
        ".env.sandbox",
        ".env.sandbox.user.tpl",
      ];
      const parts = fileName.split("/");
      const extractedFileName = parts[parts.length - 1];
      return !sandboxFileList.includes(extractedFileName);
    };
    const filterFn = templateInfo.filterFn
      ? (fileName: string) => templateInfo.filterFn!(fileName) && sandboxFilterFn(fileName)
      : sandboxFilterFn;
    const templateName = `${name}-${language}`;
    merge(actionContext?.telemetryProps, {
      [TelemetryProperty.TemplateName]: templateName,
    });

    const templateMetadata = getAllTemplatesOnPlatform(inputs.platform).find(
      (t) => t.name === name && t.language === templateInfo.language
    );
    const folderName =
      templateMetadata?.language === "common" || templateMetadata?.language === "none"
        ? templateMetadata.id
        : templateMetadata?.id.substring(0, templateMetadata.id.lastIndexOf("-")) ?? "";

    const generatorContext: GeneratorContext = {
      name: folderName,
      language: language,
      destination: destinationPath,
      logProvider: context.logProvider,
      platform: inputs.platform,
      fileNameReplaceFn: (fileName, fileData) =>
        renderTemplateFileName(fileName, fileData, replaceMap)
          .replace(/\\/g, "/")
          .replace(`${folderName}/`, ""),
      fileDataReplaceFn: (fileName, fileData) =>
        renderTemplateFileData(fileName, fileData, replaceMap),
      filterFn: (fileName) =>
        fileName.replace(/\\/g, "/").startsWith(`${folderName}/`) && filterFn(fileName),
      onActionError: templateDefaultOnActionError,
    };

    await actionContext?.progressBar?.next(ProgressMessages.generateTemplate);
    context.logProvider.debug(`Downloading app template "${templateName}" to ${destinationPath}`);
    // VS keeps its own v3 `templates-vs@` channel: the v4 floor is built from
    // templates/vsc only (no `csharp/`), so a V4Enabled flip must never route a
    // VS scaffold through it. Mirrors the metadata guard (`platform !== Platform.VS`).
    const useV4Channel =
      featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled) && inputs.platform !== Platform.VS;
    merge(actionContext?.telemetryProps, {
      [TelemetryProperty.TemplateChannel]: useV4Channel ? "v4" : "v3",
    });
    if (useV4Channel) {
      const source = await v4TemplateBridge.scaffoldFromV4Channel(
        generatorContext,
        { language: language, scenario: folderName },
        actionContext?.telemetryProps
      );
      if (source.warning) {
        context.logProvider.warning(source.warning);
      }
    } else {
      await Generator.generate(generatorContext, TemplateActionSeq);
    }

    merge(actionContext?.telemetryProps, {
      [TelemetryProperty.Fallback]: generatorContext.fallback ? "true" : "false", // Track fallback cases.
    });
  }
}

export const defaultGenerator = new DefaultTemplateGenerator();
