// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FuncValidation, FxError, Inputs } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { getLocalizedString } from "../../common/localizeUtils";
import { InputValidationError, MissingRequiredInputError } from "../../error/common";
import { QuestionNames, appNameQuestion, folderQuestion } from "../../question";
import { QuestionSpec, Validator } from "../collectInputs/collectInputs";
import { Answers } from "../model/dataModel";

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  csharp: "C#",
  python: "Python",
};
const PYTHON_LANGUAGE = "python";

function languageOption(language: string, showPythonPreview: boolean) {
  return {
    id: language,
    label: LANGUAGE_LABELS[language] ?? language,
    description:
      showPythonPreview && language === PYTHON_LANGUAGE
        ? getLocalizedString("core.createProjectQuestion.option.description.preview")
        : undefined,
  };
}

export interface CreateFloorTail {
  questions: QuestionSpec[];
  answers: Answers;
  validators: Record<string, Validator>;
}

function isFuncValidation(value: unknown): value is FuncValidation<string> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "validFunc") === "function"
  );
}

function getStringValidationFunc(
  validation: FuncValidation<string> | object | undefined
): FuncValidation<string>["validFunc"] | undefined {
  return isFuncValidation(validation) ? validation.validFunc : undefined;
}

async function resolveStringValue(
  value:
    string | ((inputs: Inputs) => string | undefined | Promise<string | undefined>) | undefined,
  inputs: Inputs
): Promise<string | undefined> {
  return typeof value === "function" ? await value(inputs) : value;
}

export async function createFloorTail(
  inputs: Inputs | undefined,
  languages: string[],
  showPythonPreview = false
): Promise<Result<CreateFloorTail, FxError>> {
  const questions: QuestionSpec[] = [];
  const answers: Answers = {};

  if (languages.length > 1) {
    questions.push({
      name: "language",
      type: "singleSelect",
      title: "Programming Language",
      default: languages[0],
      staticOptions: languages.map((language) => languageOption(language, showPythonPreview)),
    });
  } else if (languages.length === 1 && languages[0] !== "common") {
    answers.language = languages[0];
  }

  if (inputs === undefined) {
    return ok({ questions, answers, validators: {} });
  }

  const folder = folderQuestion();
  const appName = appNameQuestion();

  const existingFolder = inputs[QuestionNames.Folder];
  if (typeof existingFolder === "string") {
    answers[QuestionNames.Folder] = existingFolder;
  } else {
    const defaultFolder = await resolveStringValue(folder.default, inputs);
    if (inputs.nonInteractive) {
      if (defaultFolder !== undefined) {
        answers[QuestionNames.Folder] = defaultFolder;
      }
    } else {
      questions.push({
        name: folder.name,
        type: "folder",
        title: (await resolveStringValue(folder.title, inputs)) ?? folder.name,
        placeholder: await resolveStringValue(folder.placeholder, inputs),
        prompt: await resolveStringValue(folder.prompt, inputs),
        default: defaultFolder,
      });
    }
  }

  const existingAppName = inputs[QuestionNames.AppName];
  if (typeof existingAppName === "string") {
    answers[QuestionNames.AppName] = existingAppName;
  } else {
    const defaultAppName = await resolveStringValue(appName.default, inputs);
    if (inputs.nonInteractive) {
      if (defaultAppName === undefined) {
        return err(new MissingRequiredInputError(QuestionNames.AppName, "createFrontDoor"));
      }
      answers[QuestionNames.AppName] = defaultAppName;
    } else {
      questions.push({
        name: appName.name,
        type: "text",
        title: (await resolveStringValue(appName.title, inputs)) ?? appName.name,
        placeholder: await resolveStringValue(appName.placeholder, inputs),
        prompt: await resolveStringValue(appName.prompt, inputs),
        default: defaultAppName,
        validation: "appName",
      });
    }
  }

  const validateAppName = getStringValidationFunc(appName.validation);
  const floorValidators: Record<string, Validator> = {};
  if (validateAppName !== undefined) {
    floorValidators.appName = async (value, currentAnswers) => {
      const validationInputs: Inputs = { ...inputs };
      const folderAnswer = currentAnswers[QuestionNames.Folder];
      if (typeof folderAnswer === "string") {
        validationInputs[QuestionNames.Folder] = folderAnswer;
      }
      return validateAppName(value, validationInputs);
    };
  }

  return ok({ questions, answers, validators: floorValidators });
}

export async function validateCreateFloorAnswers(
  inputs: Inputs,
  answers: Answers
): Promise<Result<undefined, FxError>> {
  const appName = answers[QuestionNames.AppName];
  if (typeof appName !== "string") {
    return err(new MissingRequiredInputError(QuestionNames.AppName, "createFrontDoor"));
  }
  const validateAppName = getStringValidationFunc(appNameQuestion().validation);
  if (validateAppName === undefined) {
    return ok(undefined);
  }
  const validationInputs: Inputs = { ...inputs };
  const folderAnswer = answers[QuestionNames.Folder];
  if (typeof folderAnswer === "string") {
    validationInputs[QuestionNames.Folder] = folderAnswer;
  }
  const message = await validateAppName(appName, validationInputs);
  if (message !== undefined) {
    return err(new InputValidationError(QuestionNames.AppName, message, "createFrontDoor"));
  }
  return ok(undefined);
}
