// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  err,
  FxError,
  Inputs,
  ok,
  PluginConfig,
  ProjectSettings,
  QTreeNode,
  Result,
  SolutionContext,
  Tools,
  traverse,
} from "@microsoft/teamsfx-api";
import { CoreHookContext, FxCore } from "../..";
import { NoProjectOpenedError } from "../error";
import { Middleware, NextFunction } from "@feathersjs/hooks/lib";
import * as uuid from "uuid";
import { LocalCrypto } from "../crypto";
import { environmentManager } from "../environment";
import { QuestionNewTargetEnvironmentName, QuestionSelectTargetEnvironment } from "../question";
import { desensitize } from "./questionModel";

export const EnvLoaderMW: Middleware = async (ctx: CoreHookContext, next: NextFunction) => {
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  const core = ctx.self as FxCore;

  if (ctx.projectSettings) {
    const result = await loadSolutionContext(ctx, core.tools, inputs);
    if (result.isErr()) {
      ctx.result = err(result.error);
      return;
    }

    ctx.solutionContext = result.value;
  }

  await next();
};

async function loadSolutionContext(
  ctx: CoreHookContext,
  tools: Tools,
  inputs: Inputs
): Promise<Result<SolutionContext, FxError>> {
  if (!inputs.projectPath || !ctx.projectSettings) {
    return err(NoProjectOpenedError());
  }

  const projectSettings = ctx.projectSettings;

  await askTargetEnvironment(ctx, inputs);
  let targetEnvName = inputs.targetEnvName ?? environmentManager.defaultEnvName;
  if (targetEnvName === "+ new env") {
    if (!inputs.newTargetEnvName) {
      return err(NoProjectOpenedError());
    }

    targetEnvName = inputs.newTargetEnvName as string;
  }

  const cryptoProvider = new LocalCrypto(projectSettings.projectId);
  // ensure backwards compatibility:
  // no need to decrypt the secrets in *.userdata for previous TeamsFx project, which has no project id.
  const envDataResult = await environmentManager.loadEnvProfile(
    inputs.projectPath,
    targetEnvName,
    ctx.projectIdMissing ? undefined : cryptoProvider
  );

  if (envDataResult.isErr()) {
    return err(envDataResult.error);
  }
  const envInfo = envDataResult.value;

  const solutionContext: SolutionContext = {
    projectSettings: projectSettings,
    targetEnvName: envInfo.envName,
    config: envInfo.data,
    root: inputs.projectPath || "",
    ...tools,
    ...tools.tokenProvider,
    answers: inputs,
    cryptoProvider: cryptoProvider,
  };

  return ok(solutionContext);
}

export async function newSolutionContext(tools: Tools, inputs: Inputs): Promise<SolutionContext> {
  const projectSettings: ProjectSettings = {
    appName: "",
    projectId: uuid.v4(),
    solutionSettings: {
      name: "fx-solution-azure",
      version: "1.0.0",
    },
  };
  const solutionContext: SolutionContext = {
    projectSettings: projectSettings,
    config: new Map<string, PluginConfig>(),
    root: inputs.projectPath || "",
    ...tools,
    ...tools.tokenProvider,
    answers: inputs,
    cryptoProvider: new LocalCrypto(projectSettings.projectId),
  };
  return solutionContext;
}

async function askTargetEnvironment(ctx: CoreHookContext, inputs: Inputs): Promise<void> {
  const getQuestionRes = await _getQuestionsForProvision(inputs);
  const core = ctx.self as FxCore;
  if (getQuestionRes.isErr()) {
    core.tools.logProvider.error(
      `[core] failed to get questions for target environment: ${getQuestionRes.error.message}`
    );
    ctx.result = err(getQuestionRes.error);
    return;
  }

  core.tools.logProvider.debug(`[core] success to get questions for target environment.`);

  if (getQuestionRes.isErr()) {
    core.tools.logProvider.error(
      `[core] failed to get questions for target environment: ${getQuestionRes.error.message}`
    );
    ctx.result = err(getQuestionRes.error);
    return;
  }

  core.tools.logProvider.debug(`[core] success to get questions for target environment`);

  const node = getQuestionRes.value;
  if (node) {
    const res = await traverse(node, inputs, core.tools.ui);
    if (res.isErr()) {
      core.tools.logProvider.debug(`[core] failed to run question model for target environment`);
      ctx.result = err(res.error);
      return;
    }
    const desensitized = desensitize(node, inputs);
    core.tools.logProvider.info(
      `[core] success to run question model for target environment, answers:${JSON.stringify(
        desensitized
      )}`
    );
  }
}

async function _getQuestionsForProvision(
  inputs: Inputs
): Promise<Result<QTreeNode | undefined, FxError>> {
  if (!inputs.projectPath) {
    return err(NoProjectOpenedError());
  }

  const envProfilesResult = await environmentManager.listEnvProfiles(inputs.projectPath);
  if (envProfilesResult.isErr()) {
    return err(envProfilesResult.error);
  }

  const selectEnv = QuestionSelectTargetEnvironment;
  selectEnv.staticOptions = ["+ new env"].concat(envProfilesResult.value);
  const node = new QTreeNode(selectEnv);

  const childNode = new QTreeNode(QuestionNewTargetEnvironmentName);
  childNode.condition = { equals: "+ new env" };

  node.addChild(childNode);

  return ok(node.trim());
}
