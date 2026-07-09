// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author KennethBWSong, Ning Tang
 */

import { ProjectType, SpecParserError } from "@microsoft/m365-spec-parser";
import { Context, err, FxError, GeneratorResult, Inputs, Result } from "@microsoft/teamsfx-api";
import { assembleError } from "../../../error";
import { QuestionNames } from "../../../question";
import { ActionContext } from "../../middleware/actionExecutionMW";
import { DefaultTemplateGenerator } from "../defaultGenerator";
import { TemplateInfo } from "../templates/templateInfo";
import { TemplateNames } from "../templates/templateNames";
import { generateFilesFromApiSpec, getTemplateInfosFromApiSpec } from "./common";
import { convertSpecParserErrorToFxError } from "./helper";

export const customEngineAgentGeneratorDeps = {
  generateFilesFromApiSpec,
  convertSpecParserErrorToFxError,
  assembleError,
};

export class CustomEngineAgentWithExistingApiSpecGenerator extends DefaultTemplateGenerator {
  componentName = "cea-with-existing-api-generator";

  public override activate(context: Context, inputs: Inputs): boolean {
    return TemplateNames.CustomCopilotRagCustomApi == inputs[QuestionNames.TemplateName];
  }

  public override async getTemplateInfos(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<TemplateInfo[], FxError>> {
    return getTemplateInfosFromApiSpec(context, inputs, ProjectType.TeamsAi, actionContext);
  }

  public override async post(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<GeneratorResult, FxError>> {
    try {
      return await customEngineAgentGeneratorDeps.generateFilesFromApiSpec(
        context,
        inputs,
        destinationPath,
        ProjectType.TeamsAi,
        this.componentName
      );
    } catch (e) {
      let error: FxError;
      if (e instanceof SpecParserError) {
        error = customEngineAgentGeneratorDeps.convertSpecParserErrorToFxError(e);
      } else {
        error = customEngineAgentGeneratorDeps.assembleError(e);
      }
      return err(error);
    }
  }
}
