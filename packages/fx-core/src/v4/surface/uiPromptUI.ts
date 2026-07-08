// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  InputTextConfig,
  MultiSelectConfig,
  OptionItem as SurfaceOptionItem,
  SelectFileConfig,
  SelectFolderConfig,
  SingleFileOrInputConfig,
  SingleSelectConfig,
  SystemError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import {
  Asked,
  OptionItem,
  OptionsSource,
  PromptValidation,
  PromptUI,
  QuestionSpec,
} from "../collectInputs/collectInputs";
import { localizePrefixedText } from "./localizePrompt";

/** Create-Q2 prompt bridge from v4 `PromptUI` to host `UserInteraction`. */

const SOURCE = "Scaffold";

function labelWithIcon(label: string, iconPath: string | undefined): string {
  return iconPath === undefined ? label : `$(${iconPath}) ${label}`;
}

/** Map a v4 identity-only option to the surface option shape (label defaults to its id). */
function toSurfaceOption(option: OptionItem): SurfaceOptionItem {
  const label = localizePrefixedText(option.keyPrefix, "label", option.label) ?? option.id;
  return {
    id: option.id,
    label: labelWithIcon(label, option.iconPath),
    description: localizePrefixedText(option.keyPrefix, "description", option.description),
    detail: localizePrefixedText(option.keyPrefix, "detail", option.detail),
    groupName: localizePrefixedText(option.keyPrefix, "groupName", option.groupName),
  };
}

function toSurfaceOptions(options: OptionItem[]): SurfaceOptionItem[] {
  return options.map((option) => toSurfaceOption(option));
}

function toSurfaceOptionsSource(
  options: OptionsSource
): SurfaceOptionItem[] | (() => Promise<SurfaceOptionItem[]>) {
  if (Array.isArray(options)) {
    return toSurfaceOptions(options);
  }
  return async () => toSurfaceOptions((await options()).options);
}

/** Project a single-select surface result back to the selected `id` string. */
function selectedId(result: string | SurfaceOptionItem | undefined): string {
  if (typeof result === "string") {
    return result;
  }
  if (result === undefined) {
    return "";
  }
  return result.id;
}

/** Project a multi-select surface result back to the selected `id` strings. */
function selectedIds(result: string[] | SurfaceOptionItem[] | undefined): string[] {
  if (result === undefined) {
    return [];
  }
  return result.map((item) => (typeof item === "string" ? item : item.id));
}

function unsupportedKind(question: QuestionSpec): FxError {
  return new SystemError({
    source: SOURCE,
    name: "UnsupportedQuestionKind",
    message: `Question '${question.name}' has kind '${question.type}', which the create surface does not render.`,
  });
}

/** Build a `PromptUI` over the host `UserInteraction`. */
export function createUiPromptUI(ui: UserInteraction): PromptUI {
  return {
    async ask(
      question: QuestionSpec,
      options: OptionsSource | undefined,
      step?: number,
      validation?: PromptValidation,
      inputBoxValidation?: PromptValidation
    ): Promise<Result<Asked<string>, FxError>> {
      if (question.type === "singleSelect") {
        if (options === undefined) {
          return err(unsupportedKind(question));
        }
        const config: SingleSelectConfig = {
          name: question.name,
          title: localizePrefixedText(question.keyPrefix, "title", question.title) ?? question.name,
          placeholder: localizePrefixedText(
            question.keyPrefix,
            "placeholder",
            question.placeholder
          ),
          prompt: localizePrefixedText(question.keyPrefix, "prompt", question.prompt),
          default: question.default,
          options: toSurfaceOptionsSource(options),
          returnObject: false,
          skipSingleOption: question.skipSingleOption,
          step,
          validation,
        };
        const result = await ui.selectOption(config);
        if (result.isErr()) {
          return err(result.error);
        }
        if (result.value.type === "back") {
          return ok({ kind: "back" });
        }
        return ok({ kind: "value", value: selectedId(result.value.result) });
      }
      if (question.type === "text") {
        const config: InputTextConfig = {
          name: question.name,
          title: localizePrefixedText(question.keyPrefix, "title", question.title) ?? question.name,
          placeholder: localizePrefixedText(
            question.keyPrefix,
            "placeholder",
            question.placeholder
          ),
          prompt: localizePrefixedText(question.keyPrefix, "prompt", question.prompt),
          default: question.default,
          password: question.password,
          step,
          validation,
        };
        const result = await ui.inputText(config);
        if (result.isErr()) {
          return err(result.error);
        }
        if (result.value.type === "back") {
          return ok({ kind: "back" });
        }
        return ok({ kind: "value", value: result.value.result ?? "" });
      }
      if (question.type === "singleFile") {
        const config: SelectFileConfig = {
          name: question.name,
          title: localizePrefixedText(question.keyPrefix, "title", question.title) ?? question.name,
          placeholder: localizePrefixedText(
            question.keyPrefix,
            "placeholder",
            question.placeholder
          ),
          prompt: localizePrefixedText(question.keyPrefix, "prompt", question.prompt),
          default: question.default,
          filters: question.filters,
          step,
          validation,
        };
        const result = await ui.selectFile(config);
        if (result.isErr()) {
          return err(result.error);
        }
        if (result.value.type === "back") {
          return ok({ kind: "back" });
        }
        return ok({ kind: "value", value: result.value.result ?? "" });
      }
      if (question.type === "singleFileOrText") {
        if (
          ui.selectFileOrInput === undefined ||
          question.inputOptionItem === undefined ||
          question.inputBoxConfig === undefined
        ) {
          return err(unsupportedKind(question));
        }
        const inputBoxConfig = question.inputBoxConfig;
        const config: SingleFileOrInputConfig = {
          name: question.name,
          title: localizePrefixedText(question.keyPrefix, "title", question.title) ?? question.name,
          placeholder: localizePrefixedText(
            question.keyPrefix,
            "placeholder",
            question.placeholder
          ),
          prompt: localizePrefixedText(question.keyPrefix, "prompt", question.prompt),
          inputOptionItem: toSurfaceOption(question.inputOptionItem),
          inputBoxConfig: {
            name: inputBoxConfig.name,
            title:
              localizePrefixedText(inputBoxConfig.keyPrefix, "title", inputBoxConfig.title) ??
              inputBoxConfig.name,
            placeholder: localizePrefixedText(
              inputBoxConfig.keyPrefix,
              "placeholder",
              inputBoxConfig.placeholder
            ),
            prompt: localizePrefixedText(inputBoxConfig.keyPrefix, "prompt", inputBoxConfig.prompt),
            default: inputBoxConfig.default,
            step: inputBoxConfig.step ?? step,
            validation: inputBoxValidation,
          },
          filters: question.filters,
          step,
          validation,
        };
        const result = await ui.selectFileOrInput(config);
        if (result.isErr()) {
          return err(result.error);
        }
        if (result.value.type === "back") {
          return ok({ kind: "back" });
        }
        return ok({ kind: "value", value: result.value.result ?? "" });
      }
      if (question.type === "folder") {
        const config: SelectFolderConfig = {
          name: question.name,
          title: localizePrefixedText(question.keyPrefix, "title", question.title) ?? question.name,
          placeholder: localizePrefixedText(
            question.keyPrefix,
            "placeholder",
            question.placeholder
          ),
          prompt: localizePrefixedText(question.keyPrefix, "prompt", question.prompt),
          default: question.default,
          step,
          validation,
        };
        const result = await ui.selectFolder(config);
        if (result.isErr()) {
          return err(result.error);
        }
        if (result.value.type === "back") {
          return ok({ kind: "back" });
        }
        return ok({ kind: "value", value: result.value.result ?? "" });
      }
      return err(unsupportedKind(question));
    },

    async askMulti(
      question: QuestionSpec,
      options: OptionsSource | undefined,
      step?: number
    ): Promise<Result<Asked<string[]>, FxError>> {
      if (question.type !== "multiSelect" || options === undefined) {
        return err(unsupportedKind(question));
      }
      const config: MultiSelectConfig = {
        name: question.name,
        title: localizePrefixedText(question.keyPrefix, "title", question.title) ?? question.name,
        placeholder: localizePrefixedText(question.keyPrefix, "placeholder", question.placeholder),
        prompt: localizePrefixedText(question.keyPrefix, "prompt", question.prompt),
        options: toSurfaceOptionsSource(options),
        returnObject: false,
        skipSingleOption: question.skipSingleOption,
        step,
      };
      const result = await ui.selectOptions(config);
      if (result.isErr()) {
        return err(result.error);
      }
      if (result.value.type === "back") {
        return ok({ kind: "back" });
      }
      return ok({ kind: "value", value: selectedIds(result.value.result) });
    },
  };
}
