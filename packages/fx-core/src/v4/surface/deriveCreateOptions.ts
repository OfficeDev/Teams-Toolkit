// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandOption, FxError, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { Result, err, ok } from "neverthrow";
import { PresentationQuestion } from "../buildTarget/parseSelector";
import { QuestionSpec } from "../collectInputs/collectInputs";
import { loadBundledFloor } from "../distribution/bundledFloor";
import { openCreateQuestions } from "../distribution/createQuestions";
import { openCreateSelectorPresentation } from "../distribution/createSelector";
import { DeclarativeLocator } from "../model/dataModel";

/** Derive the CLI `atk new` option model from the v4 create selector and packages. */

const SOURCE = "Scaffold";
const CREATE_QUESTIONS_PREFIX = "v4/create/";
const CREATE_QUESTIONS_SUFFIX = "/questions.json";

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function q1Option(question: PresentationQuestion): CLICommandOption {
  const choices = question.staticOptions.map((option) => option.id);
  const option: CLICommandOption = {
    name: kebabCase(question.name),
    questionName: question.name,
    type: "string",
    description: question.title ?? question.name,
    required: false,
  };
  if (choices.length > 0) {
    option.choices = choices;
  }
  return option;
}

function questionType(question: QuestionSpec): Result<"boolean" | "string" | "array", FxError> {
  switch (question.type) {
    case "confirm":
      return ok("boolean");
    case "multiSelect":
      return ok("array");
    case "folder":
    case "singleFile":
    case "singleFileOrText":
    case "singleSelect":
    case "text":
      return ok("string");
  }
}

function q2Option(question: QuestionSpec): Result<CLICommandOption, FxError> {
  const type = questionType(question);
  if (type.isErr()) {
    return err(type.error);
  }
  const base = {
    name: kebabCase(question.name),
    questionName: question.name,
    shortName: question.cliShortName,
    description: question.cliDescription ?? question.title ?? question.prompt ?? question.name,
    required: false,
  };

  if (type.value === "boolean") {
    const option: CLICommandOption = { ...base, type: "boolean" };
    if (question.default === "true" || question.default === "false") {
      option.default = question.default === "true";
    }
    return ok(option);
  }

  const choices = question.staticOptions?.map((item) => item.id) ?? [];
  if (type.value === "array") {
    const option: CLICommandOption = { ...base, type: "array" };
    if (choices.length > 0) {
      option.choices = choices;
    }
    if (question.optionsFrom !== undefined) {
      option.skipValidation = true;
    }
    return ok(option);
  }

  const option: CLICommandOption = { ...base, type: "string" };
  if (question.default !== undefined) {
    option.default = question.default;
  }
  if (choices.length > 0) {
    option.choices = choices;
  }
  if (question.optionsFrom !== undefined) {
    option.skipValidation = true;
  }
  return ok(option);
}

function choiceSet(option: CLICommandOption): Set<string> {
  const choices = option.type === "boolean" ? [] : option.choices ?? [];
  return new Set(choices);
}

function mergeOption(existing: CLICommandOption, next: CLICommandOption): Result<void, FxError> {
  if (existing.type !== next.type) {
    return err(
      systemError(
        "CreateCliOptionTypeConflict",
        `Derived CLI option '${existing.name}' has conflicting types '${existing.type}' and '${next.type}'.`
      )
    );
  }
  if (existing.questionName !== next.questionName) {
    return err(
      systemError(
        "CreateCliOptionQuestionConflict",
        `Derived CLI option '${existing.name}' maps to both '${existing.questionName}' and '${next.questionName}'.`
      )
    );
  }
  if (existing.shortName === undefined && next.shortName !== undefined) {
    existing.shortName = next.shortName;
  }
  if (existing.type !== "boolean" && next.type !== "boolean") {
    const choices = choiceSet(existing);
    for (const choice of next.choices ?? []) {
      choices.add(choice);
    }
    if (choices.size > 0) {
      existing.choices = [...choices];
    }
    if (next.skipValidation === true) {
      existing.skipValidation = true;
    }
  }
  return ok(undefined);
}

function addOrMerge(
  options: CLICommandOption[],
  byName: Map<string, CLICommandOption>,
  next: CLICommandOption
): Result<void, FxError> {
  const existing = byName.get(next.name);
  if (existing === undefined) {
    options.push(next);
    byName.set(next.name, next);
    return ok(undefined);
  }
  return mergeOption(existing, next);
}

function questionLocators(floorBytes: Buffer): Result<DeclarativeLocator[], FxError> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(floorBytes);
  } catch {
    return err(
      systemError("TemplatePackageCorrupt", "The resolved template package is not a valid archive.")
    );
  }
  const templateIds = new Set<string>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const name = entry.entryName.replace(/\\/g, "/");
    if (name.startsWith(CREATE_QUESTIONS_PREFIX) && name.endsWith(CREATE_QUESTIONS_SUFFIX)) {
      templateIds.add(
        name.slice(CREATE_QUESTIONS_PREFIX.length, name.length - CREATE_QUESTIONS_SUFFIX.length)
      );
    }
  }
  return ok([...templateIds].sort().map((templateId) => ({ kind: "create", templateId })));
}

export function deriveCreateOptions(
  floorBytes: Buffer,
  genericOptions: CLICommandOption[]
): Result<CLICommandOption[], FxError> {
  const presentation = openCreateSelectorPresentation(floorBytes);
  if (presentation.isErr()) {
    return err(presentation.error);
  }

  const locators = questionLocators(floorBytes);
  if (locators.isErr()) {
    return err(locators.error);
  }

  const options: CLICommandOption[] = [];
  const byName = new Map<string, CLICommandOption>();
  for (const question of presentation.value.questions) {
    const added = addOrMerge(options, byName, q1Option(question));
    if (added.isErr()) {
      return err(added.error);
    }
  }

  for (const locator of locators.value) {
    const questions = openCreateQuestions(floorBytes, locator);
    if (questions.isErr()) {
      return err(questions.error);
    }
    for (const question of questions.value) {
      const option = q2Option(question);
      if (option.isErr()) {
        return err(option.error);
      }
      const added = addOrMerge(options, byName, option.value);
      if (added.isErr()) {
        return err(added.error);
      }
    }
  }

  for (const genericOption of genericOptions) {
    const added = addOrMerge(options, byName, { ...genericOption });
    if (added.isErr()) {
      return err(added.error);
    }
  }

  return ok(options);
}

export function deriveCreateOptionsFromBundledFloor(
  genericOptions: CLICommandOption[]
): Result<CLICommandOption[], FxError> {
  try {
    const floor = loadBundledFloor();
    return deriveCreateOptions(fs.readFileSync(floor.location), genericOptions);
  } catch (e) {
    if (e instanceof SystemError) {
      return err(e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return err(systemError("CreateCliOptionDerivationFailed", message));
  }
}
