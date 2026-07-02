// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * The composition-root impl of the flag-on `createProjectFrontDoor` seams
 * (`dispatch-create-by-engine` `CreateFrontDoorDeps`). These live outside the
 * pure orchestrator so it stays injectable and I/O-free: `FxCore` wires these
 * real handlers, the orchestrator's tests wire fakes.
 *
 * - `scaffoldV4`     — the `engine: "v4"` hand-off: build a v3 `GeneratorContext`
 *                      over the create floor and render the authored declarative
 *                      package through the v4 distribution channel.
 */

import {
  CreateProjectResult,
  FuncValidation,
  FxError,
  Inputs,
  Result,
  UserInteraction,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as jsonschema from "jsonschema";
import path from "path";

import { Component, TelemetryEvent, TelemetryProperty } from "../common/telemetry";
import { TOOLS } from "../common/globalVars";
import { coordinator } from "../component/coordinator";
import { templateDefaultOnActionError } from "../component/generator/generator";
import { GeneratorContext } from "../component/generator/generatorAction";
import { convertToLangKey } from "../component/generator/utils";
import {
  ResolvedV4ChannelPackage,
  scaffoldDeclarativeFromV4Channel,
} from "../component/generator/v4TemplateBridge";
import { sendErrorEvent, sendSuccessEvent } from "../component/telemetry";
import { pathUtils } from "../component/utils/pathUtils";
import { InputValidationError, MissingRequiredInputError, assembleError } from "../error/common";
import { AppNamePattern, QuestionNames, appNameQuestion, folderQuestion } from "../question";
import { Answers, BuildTarget, CallerFloor, DeclarativeLocator } from "../v4";

/** The package namespace the create front door opens v4 packages under. */
const CREATE_KIND = "create";

/** The language a single-language (language-neutral) v4 package scaffolds under. */
const COMMON_LANGUAGE = "common";

function scaffoldTelemetryProps(
  inputs: Inputs,
  target: BuildTarget,
  language: string
): Record<string, string> {
  const templateName = inputs[QuestionNames.TemplateName];
  const templateId =
    typeof templateName === "string" && templateName.length > 0 ? templateName : target.templateId;
  return {
    [TelemetryProperty.Component]: Component.core,
    [TelemetryProperty.TemplateName]: `${templateId}-${convertToLangKey(language)}`,
    env: process.env.TEAMSFX_ENV || "",
  };
}

/**
 * The one module function `scaffoldV4` hands the located package to, behind the
 * repo's `*Deps` seam so a test can stub the channel render without I/O (the v4
 * named export is otherwise a read-only binding).
 */
export const scaffoldV4Deps = {
  scaffoldDeclarativeFromV4Channel,
};

/**
 * The `engine: "v4"` hand-off. The orchestrator has already collected the
 * package's own answers (Q2, via `runCreateInputs`); this validates the create
 * floor (`folder` / `app-name`), then renders the located `create/<templateId>`
 * declarative package onto disk via the v4 distribution channel.
 *
 * Mirrors the legacy customized-generator validation and tracking-id tail so a
 * v4 scaffold yields the same `CreateProjectResult` shape as every other create path.
 */
export async function scaffoldV4(
  inputs: Inputs,
  target: BuildTarget,
  answers: Answers,
  flagReader?: (name: string) => boolean,
  resolvedPackage?: ResolvedV4ChannelPackage
): Promise<Result<CreateProjectResult, FxError>> {
  const folderInput = inputs[QuestionNames.Folder];
  if (!folderInput) {
    return err(new MissingRequiredInputError(QuestionNames.Folder));
  }
  const folder = path.resolve(folderInput);
  const appName = inputs[QuestionNames.AppName];
  if (appName === undefined) {
    return err(new MissingRequiredInputError(QuestionNames.AppName));
  }
  const validateResult = jsonschema.validate(appName, { pattern: AppNamePattern });
  if (validateResult.errors && validateResult.errors.length > 0) {
    return err(new InputValidationError(QuestionNames.AppName, validateResult.errors[0].message));
  }
  const projectPath = path.join(folder, appName);

  // The language axis is the downstream `collect-inputs` Q0 answer (ADR-0014
  // Amendment 2 / ADR-0016 decision 5); a single-language (`["common"]`) template
  // never asks it, so an absent answer falls back to the language-neutral floor.
  const languageAnswer = answers["language"];
  const language = typeof languageAnswer === "string" ? languageAnswer : COMMON_LANGUAGE;
  const telemetryProps = scaffoldTelemetryProps(inputs, target, language);
  const generatorContext: GeneratorContext = {
    name: appName,
    language,
    platform: inputs.platform,
    destination: projectPath,
    logProvider: TOOLS.logProvider,
    onActionError: templateDefaultOnActionError,
  };
  const locator: DeclarativeLocator = { kind: CREATE_KIND, templateId: target.templateId };
  const callerFloor: CallerFloor = { appName, language };

  try {
    const source = await scaffoldV4Deps.scaffoldDeclarativeFromV4Channel(
      generatorContext,
      locator,
      answers,
      callerFloor,
      telemetryProps,
      flagReader,
      resolvedPackage
    );
    if (source.warning) {
      TOOLS.logProvider.warning(source.warning);
    }
  } catch (e) {
    const fxError = assembleError(e);
    sendErrorEvent(TelemetryEvent.GenerateTemplate, fxError, telemetryProps);
    return err(fxError);
  }
  sendSuccessEvent(TelemetryEvent.GenerateTemplate, telemetryProps);

  const result: CreateProjectResult = { projectPath };
  const ymlPath = pathUtils.getYmlFilePath(projectPath, "dev");
  if (ymlPath && (await fs.pathExists(ymlPath))) {
    const ensureRes = await coordinator.ensureTrackingId(projectPath, inputs.projectId);
    if (ensureRes.isErr()) {
      return err(ensureRes.error);
    }
    result.projectId = ensureRes.value;
  }
  return ok(result);
}

function getStringValidationFunc(
  validation: FuncValidation<string> | object | undefined
): FuncValidation<string>["validFunc"] | undefined {
  if (validation === undefined || !("validFunc" in validation)) {
    return undefined;
  }
  return validation.validFunc;
}

async function resolveStringValue(
  value:
    | string
    | ((inputs: Inputs) => string | undefined | Promise<string | undefined>)
    | undefined,
  inputs: Inputs
): Promise<string | undefined> {
  return typeof value === "function" ? await value(inputs) : value;
}

async function validateAppNameInput(
  inputs: Inputs,
  appName: string
): Promise<Result<undefined, FxError>> {
  const validation = appNameQuestion().validation;
  const validFunc = getStringValidationFunc(validation);
  if (validFunc !== undefined) {
    const validationMessage = await validFunc(appName, inputs);
    if (validationMessage !== undefined) {
      return err(
        new InputValidationError(QuestionNames.AppName, validationMessage, "createFrontDoor")
      );
    }
  }
  return ok(undefined);
}
/**
 * The `engine: "v4"` create-floor collection. The front door owns Q1/Q2, so the
 * remaining surface floor is collected directly here instead of routing through
 * any legacy question-tree traversal.
 */
export async function collectCreateFloor(
  inputs: Inputs,
  ui: UserInteraction
): Promise<Result<undefined, FxError>> {
  const folder = folderQuestion();
  const appName = appNameQuestion();

  if (inputs[QuestionNames.Folder] === undefined) {
    const defaultFolder = await resolveStringValue(folder.default, inputs);
    if (inputs.nonInteractive) {
      if (defaultFolder !== undefined) {
        inputs[QuestionNames.Folder] = defaultFolder;
      }
    } else {
      const folderResult = await ui.selectFolder({
        name: folder.name,
        title: (await resolveStringValue(folder.title, inputs)) ?? "",
        placeholder: await resolveStringValue(folder.placeholder, inputs),
        prompt: await resolveStringValue(folder.prompt, inputs),
        default: defaultFolder,
        validation: getStringValidationFunc(folder.validation),
      });
      if (folderResult.isErr()) {
        return err(folderResult.error);
      }
      if (typeof folderResult.value.result === "string") {
        inputs[QuestionNames.Folder] = folderResult.value.result;
      }
    }
  }

  const existingAppName = inputs[QuestionNames.AppName];
  if (typeof existingAppName === "string") {
    return validateAppNameInput(inputs, existingAppName);
  }

  const defaultAppName = await resolveStringValue(appName.default, inputs);
  if (inputs.nonInteractive) {
    if (defaultAppName === undefined) {
      return err(new MissingRequiredInputError(QuestionNames.AppName, "createFrontDoor"));
    }
    inputs[QuestionNames.AppName] = defaultAppName;
    return validateAppNameInput(inputs, defaultAppName);
  }

  const appNameResult = await ui.inputText({
    name: appName.name,
    title: (await resolveStringValue(appName.title, inputs)) ?? "",
    placeholder: await resolveStringValue(appName.placeholder, inputs),
    prompt: await resolveStringValue(appName.prompt, inputs),
    default: defaultAppName,
    validation: getStringValidationFunc(appName.validation),
  });
  if (appNameResult.isErr()) {
    return err(appNameResult.error);
  }
  if (typeof appNameResult.value.result === "string") {
    inputs[QuestionNames.AppName] = appNameResult.value.result;
  }
  return ok(undefined);
}
