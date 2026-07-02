// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  InputTextConfig,
  MultiSelectConfig,
  OptionItem as SurfaceOptionItem,
  SelectFolderConfig,
  SingleSelectConfig,
  SystemError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { getLocalizedString } from "../../common/localizeUtils";
import { Asked, OptionItem, PromptUI, QuestionSpec } from "../collectInputs/collectInputs";

/** Create-Q2 prompt bridge from v4 `PromptUI` to host `UserInteraction`. */

const SOURCE = "Scaffold";

function localizeText(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  const localized = getLocalizedString(text);
  return localized.length > 0 ? localized : text;
}

function localizePrefixedText(
  keyPrefix: string | undefined,
  suffix: string,
  fallback: string | undefined
): string | undefined {
  if (keyPrefix !== undefined) {
    const localized = getLocalizedString(`${keyPrefix}.${suffix}`);
    if (localized.length > 0) {
      return localized;
    }
  }
  return localizeText(fallback);
}

/** Map a v4 identity-only option to the surface option shape (label defaults to its id). */
function toSurfaceOptions(options: OptionItem[]): SurfaceOptionItem[] {
  return options.map((option) => ({
    id: option.id,
    label: localizePrefixedText(option.keyPrefix, "label", option.label) ?? option.id,
    description: localizePrefixedText(option.keyPrefix, "description", option.description),
    detail: localizePrefixedText(option.keyPrefix, "detail", option.detail),
    groupName: localizePrefixedText(option.keyPrefix, "groupName", option.groupName),
  }));
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
      options: OptionItem[] | undefined,
      step?: number
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
          options: toSurfaceOptions(options),
          returnObject: false,
          step,
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
          step,
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
      options: OptionItem[] | undefined,
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
        options: toSurfaceOptions(options),
        returnObject: false,
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
