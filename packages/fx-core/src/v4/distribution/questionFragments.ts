// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import { Result, err, ok } from "neverthrow";
import { QuestionSpec } from "../collectInputs/collectInputs";

/**
 * Resolve shared question fragments. A `questions` array may contain
 * `{ "use": "<name>" }` entries that reference a reusable fragment under
 * `v4/_shared/questions/<name>.json`; the loader splices the fragment's own
 * `questions` in place (recursively) so `collect-inputs` always sees one flat
 * `QuestionSpec[]`. See open-template-package + collect-create-inputs specs.
 */

const SOURCE = "Scaffold";

/** Channel path prefix under which shared question fragments live. */
const FRAGMENT_DIR = "v4/_shared/questions/";

/** A fragment name is a bare identifier — no path separators (Zip-Slip guard). */
const FRAGMENT_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

/** The native question kinds a `questions.json` (or fragment) may declare. */
const QUESTION_TYPES: ReadonlySet<string> = new Set([
  "singleSelect",
  "multiSelect",
  "text",
  "confirm",
  "singleFile",
  "folder",
  "singleFileOrText",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A single native question, narrowed without an unchecked cast. */
function isQuestionSpec(value: unknown): value is QuestionSpec {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    QUESTION_TYPES.has(value.type)
  );
}

/** A `{ "use": "<name>" }` fragment reference (no `name`, which marks a question). */
function isUseRef(value: unknown): value is { use: string } {
  return isRecord(value) && typeof value.use === "string" && !("name" in value);
}

/** Read one fragment's raw JSON by name; the reader owns the source (zip / disk). */
export type FragmentReader = (name: string) => Result<unknown, FxError>;

function invalidQuestionsFile(file: string): FxError {
  return new SystemError({
    source: SOURCE,
    name: "PackageFileInvalid",
    message: `The template package file "${file}" must be an object with a "questions" array.`,
  });
}

/** Resolve one questions array, splicing any `{ "use" }` fragments in place. */
function resolveArray(
  items: unknown[],
  read: FragmentReader,
  file: string,
  seen: ReadonlySet<string>
): Result<QuestionSpec[], FxError> {
  const out: QuestionSpec[] = [];
  for (const item of items) {
    if (isUseRef(item)) {
      const name = item.use;
      if (!FRAGMENT_NAME.test(name)) {
        return err(
          new SystemError({
            source: SOURCE,
            name: "QuestionFragmentInvalidName",
            message: `Question fragment reference "${name}" in "${file}" is not a bare name.`,
          })
        );
      }
      if (seen.has(name)) {
        return err(
          new SystemError({
            source: SOURCE,
            name: "QuestionFragmentCycle",
            message: `Question fragment "${name}" forms a cycle (referenced from "${file}").`,
          })
        );
      }
      const raw = read(name);
      if (raw.isErr()) {
        return err(raw.error);
      }
      const fragFile = `${FRAGMENT_DIR}${name}.json`;
      if (!isRecord(raw.value) || !Array.isArray(raw.value.questions)) {
        return err(invalidQuestionsFile(fragFile));
      }
      const nested = resolveArray(raw.value.questions, read, fragFile, new Set([...seen, name]));
      if (nested.isErr()) {
        return err(nested.error);
      }
      out.push(...nested.value);
    } else if (isQuestionSpec(item)) {
      out.push(item);
    } else {
      return err(invalidQuestionsFile(file));
    }
  }
  return ok(out);
}

/** Resolve a `{ questions: [...] }` object into a flat `QuestionSpec[]`, expanding fragments. */
export function resolveQuestions(
  raw: unknown,
  file: string,
  read: FragmentReader
): Result<QuestionSpec[], FxError> {
  if (!isRecord(raw) || !Array.isArray(raw.questions)) {
    return err(invalidQuestionsFile(file));
  }
  return resolveArray(raw.questions, read, file, new Set());
}

/** A `FragmentReader` over an open channel zip. */
export function zipFragmentReader(zip: AdmZip): FragmentReader {
  return (name) => {
    const target = `${FRAGMENT_DIR}${name}.json`;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) {
        continue;
      }
      if (entry.entryName.replace(/\\/g, "/") === target) {
        try {
          return ok(JSON.parse(entry.getData().toString("utf8")));
        } catch {
          return err(
            new SystemError({
              source: SOURCE,
              name: "PackageFileInvalid",
              message: `The template package file "${target}" is not valid JSON.`,
            })
          );
        }
      }
    }
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileMissing",
        message: `The template package is missing question fragment "${target}".`,
      })
    );
  };
}
