// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * The composition-root impl of the two flag-on `createProjectFrontDoor` seams
 * (`dispatch-create-by-engine` `CreateFrontDoorDeps`). These live outside the
 * pure orchestrator so it stays injectable and I/O-free: `FxCore` wires these
 * real handlers, the orchestrator's tests wire fakes.
 *
 * - `scaffoldV4`     — the `engine: "v4"` hand-off: build a v3 `GeneratorContext`
 *                      over the create floor and render the authored declarative
 *                      package through the v4 distribution channel.
 * - `applyV3PreFill` — the `engine: "v3"` adapter: translate the Q1 dimension
 *                      picks the v4 selector collected onto the v3
 *                      `QuestionNames.*` so `createProject`'s `QuestionMW` skips
 *                      Q1 and asks only Q2 (dispatch-create-by-engine INV-5).
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

const COPILOT_AGENT_PROJECT_TYPE = "copilot-agent-type";
const CUSTOM_ENGINE_AGENT_PROJECT_TYPE = "custom-engine-agent-type";
const TEAMS_PROJECT_TYPE = "teams-agent-and-app-type";
const OFFICE_PROJECT_TYPE = "office-meta-os-type";
const DECLARATIVE_AGENT_CAPABILITY = "declarative-agent";
const ADD_ACTION_DA_TEMPLATE = "add-action";
const NEW_API_ACTION_SOURCE = "new-api";
const TEAMS_RAG_APP = "rag";
const TEAMS_OTHER_APP = "other";
const OFFICE_DA_META_OS_CAPABILITY = "office-da-meta-os";

/**
 * The v3 `teams-other-app-type` question has no `QuestionNames` member (the
 * wizard JSON names it inline), so the pre-fill keys it by its literal name.
 */
const TEAMS_OTHER_APP_TYPE_QUESTION = "teams-other-app-type";

/** Copilot-agent selector `daTemplate` → the v3 `with-plugin` answer. */
const WITH_PLUGIN_BY_DA_TEMPLATE: Record<string, string> = {
  "no-action": "no",
  "add-action": "yes",
  "graph-connector": "gc",
  skill: "skill",
  typespec: "type-spec",
};

/** Copilot-agent selector `actionSource` → the v3 `api-plugin-type` answer. */
const ACTION_TYPE_BY_ACTION_SOURCE: Record<string, string> = {
  "new-api": "new-api",
  openapi: "api-spec",
  mcp: "mcp",
};

/** Teams selector `teamsApp` → the v3 `teams-app-type` answer (ids are renamed). */
const TEAMS_APP_TYPE_BY_TEAMS_APP: Record<string, string> = {
  "custom-copilot-basic": "custom-copilot-basic",
  rag: "custom-copilot-rag",
  "teams-collaborator-agent": "teams-collaborator-agent",
  other: "teams-other-app-type",
};

/** Office-addin selector `officeAddinCapability` → the v3 `capabilities` answer. */
const OFFICE_CAPABILITY_BY_ADDIN_CAPABILITY: Record<string, string> = {
  "office-addin-wxpo-taskpane": "wxp-json-taskpane",
  "office-addin-excel-cfshortcut": "wxp-json-cf-shortcut",
  "office-da-meta-os": "office-da-meta-os",
  "office-addin-config": "office-addin-import",
};

/** Office-addin selector `daMetaOsCapability` → the v3 `da-meta-os-capability` answer. */
const DA_META_OS_CAPABILITY_BY_SELECTOR: Record<string, string> = {
  "declarative-agent-meta-os-upgrade-project": "da-meta-os-upgrade-existing-project",
};

/**
 * The `engine: "v3"` adapter (dispatch-create-by-engine INV-5). Translate the Q1
 * dimension picks the v4 selector collected (`target.answers`) onto the v3
 * `QuestionNames.*` so `createProject`'s `QuestionMW` skips Q1 and asks only Q2.
 *
 * It does **not** set `QuestionNames.TemplateName`: a preset single-select answer
 * still fires its `onDidSelection` during the v3 walk (`questionVisitor`), and
 * the deepest preset dimension's callback sets `TemplateName` to the route's
 * `templateId` — while `traverse`'s `TemplateName` short-circuit (checked only at
 * entry) does not fire, so the non-preset Q2 (app name / language / folder) is
 * still asked.
 *
 * Each `projectType` family translates its selector dimension ids onto the v3
 * `QuestionNames.*` (the ids diverge per family; the maps above own each rename).
 * `graph-connector-type` carries no capability dimension (its v3 node is a group),
 * so it pre-fills `ProjectType` only and the v3 walk asks its Q2 group. Setting
 * only `ProjectType` for any not-yet-expanded dimension is safe: the v3 walk
 * re-asks the un-preset dimensions rather than mis-scaffolding.
 */
export function applyV3PreFill(inputs: Inputs, target: BuildTarget): void {
  const answers = target.answers;
  if (!answers) {
    return;
  }
  const projectType = answers.projectType;
  if (!projectType) {
    return;
  }
  // The selector `projectType` ids are the v3 `ProjectTypeOptions` ids (1:1).
  inputs[QuestionNames.ProjectType] = projectType;

  if (projectType === COPILOT_AGENT_PROJECT_TYPE) {
    preFillCopilotAgent(inputs, answers);
  } else if (projectType === CUSTOM_ENGINE_AGENT_PROJECT_TYPE) {
    preFillCustomEngineAgent(inputs, answers);
  } else if (projectType === TEAMS_PROJECT_TYPE) {
    preFillTeamsApp(inputs, answers);
  } else if (projectType === OFFICE_PROJECT_TYPE) {
    preFillOfficeAddin(inputs, answers);
  }
}

/** Expand the copilot-agent Q1 picks onto the v3 declarative-agent question path. */
function preFillCopilotAgent(inputs: Inputs, answers: Record<string, string>): void {
  inputs[QuestionNames.Capabilities] = DECLARATIVE_AGENT_CAPABILITY;

  const withPlugin = WITH_PLUGIN_BY_DA_TEMPLATE[answers.daTemplate];
  if (withPlugin) {
    inputs[QuestionNames.WithPlugin] = withPlugin;
  }
  if (answers.daTemplate !== ADD_ACTION_DA_TEMPLATE) {
    return;
  }

  const actionType = ACTION_TYPE_BY_ACTION_SOURCE[answers.actionSource];
  if (actionType) {
    inputs[QuestionNames.ActionType] = actionType;
    inputs["action-type"] = actionType; // v3 walk's `questionVisitor` looks for this alias when it visits the action-type question
  }
  // The api-auth dimension only applies to the new-api action source; its ids are
  // shared verbatim between the selector and the v3 `api-auth` question.
  if (answers.actionSource === NEW_API_ACTION_SOURCE && answers.apiAuth) {
    inputs[QuestionNames.ApiAuth] = answers.apiAuth;
  }
}

/** Expand the custom-engine-agent Q1 pick onto the v3 capabilities question. */
function preFillCustomEngineAgent(inputs: Inputs, answers: Record<string, string>): void {
  // The selector `customEngineAgent` ids are the v3 `capabilities` ids (1:1).
  if (answers.customEngineAgent) {
    inputs[QuestionNames.Capabilities] = answers.customEngineAgent;
  }
}

/** Expand the teams Q1 picks onto the v3 teams-app-type question path. */
function preFillTeamsApp(inputs: Inputs, answers: Record<string, string>): void {
  const teamsAppType = TEAMS_APP_TYPE_BY_TEAMS_APP[answers.teamsApp];
  if (!teamsAppType) {
    return;
  }
  inputs[QuestionNames.TeamsAppType] = teamsAppType;

  // The rag-source / other-capability dimension ids are shared verbatim with the
  // v3 questions; only the parent `teamsApp` id is renamed (the map above).
  if (answers.teamsApp === TEAMS_RAG_APP && answers.customCopilotRagType) {
    inputs[QuestionNames.CustomCopilotRag] = answers.customCopilotRagType;
  } else if (answers.teamsApp === TEAMS_OTHER_APP && answers.teamsOtherAppType) {
    inputs[TEAMS_OTHER_APP_TYPE_QUESTION] = answers.teamsOtherAppType;
  }
}

/** Expand the office-addin Q1 picks onto the v3 capabilities question path. */
function preFillOfficeAddin(inputs: Inputs, answers: Record<string, string>): void {
  const capability = OFFICE_CAPABILITY_BY_ADDIN_CAPABILITY[answers.officeAddinCapability];
  if (!capability) {
    return;
  }
  inputs[QuestionNames.Capabilities] = capability;

  if (answers.officeAddinCapability === OFFICE_DA_META_OS_CAPABILITY) {
    const daMetaOsCapability = DA_META_OS_CAPABILITY_BY_SELECTOR[answers.daMetaOsCapability];
    if (daMetaOsCapability) {
      inputs[QuestionNames.DAMetaOSCapability] = daMetaOsCapability;
    }
  }
}
