// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import { Result, err, ok } from "neverthrow";
import { QuestionSpec } from "../collectInputs/collectInputs";
import { DeclarativeLocator, TemplateFileEntry } from "../model/dataModel";
import { LoadedPackage } from "./packageDir";

/** Open one declarative package subtree from channel zip bytes. See open-template-package spec. */

const SOURCE = "Scaffold";

/** The `v4/<kind>/<templateId>/` prefix this locator resolves to (trailing slash = boundary). */
function packageRoot(locator: DeclarativeLocator): string {
  return `v4/${locator.kind}/${locator.templateId}/`;
}

/** Zip-Slip guard for stripped content paths. */
function isSafeRelativePath(rel: string): boolean {
  return rel.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

/** Parse one raw JSON entry, mapping a parse failure to `PackageFileInvalid`. */
function parseEntryJson(raw: string, file: string): Result<unknown, FxError> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return ok(parsed);
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileInvalid",
        message: `The template package file "${file}" is not valid JSON.`,
      })
    );
  }
}

/** A package shape file that the package set is required to carry. */
function missingFile(file: string): FxError {
  return new SystemError({
    source: SOURCE,
    name: "PackageFileMissing",
    message: `The template package is missing "${file}".`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const QUESTION_TYPES: ReadonlySet<string> = new Set([
  "singleSelect",
  "multiSelect",
  "text",
  "confirm",
  "singleFile",
  "folder",
  "singleFileOrText",
]);

function isQuestionSpecArray(value: unknown): value is QuestionSpec[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === "string" &&
        typeof item.type === "string" &&
        QUESTION_TYPES.has(item.type)
    )
  );
}

function parseQuestions(raw: unknown, file: string): Result<QuestionSpec[], FxError> {
  if (!isRecord(raw) || !isQuestionSpecArray(raw.questions)) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileInvalid",
        message: `The template package file "${file}" must be an object with a "questions" array.`,
      })
    );
  }
  return ok(raw.questions);
}

interface PackageMetadataEntries {
  descriptorRaw?: string;
  questionsRaw?: string;
  pipelineRaw?: string;
  content: TemplateFileEntry[];
}

function openZip(bytes: Buffer): Result<AdmZip, FxError> {
  try {
    return ok(new AdmZip(bytes));
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplatePackageCorrupt",
        message: "The resolved template package is not a valid archive.",
      })
    );
  }
}

function readPackageEntries(
  zip: AdmZip,
  locator: DeclarativeLocator,
  includeContent: boolean
): Result<PackageMetadataEntries, FxError> {
  const root = packageRoot(locator);
  const contentPrefix = `${root}content/`;
  const entries: PackageMetadataEntries = { content: [] };

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const name = entry.entryName.replace(/\\/g, "/");
    if (!name.startsWith(root)) {
      continue;
    }
    if (name.startsWith(contentPrefix)) {
      if (!includeContent) {
        continue;
      }
      const rel = name.slice(contentPrefix.length);
      if (!isSafeRelativePath(rel)) {
        return err(
          new SystemError({
            source: SOURCE,
            name: "TemplatePackageUnsafePath",
            message: `The resolved template package contains an unsafe entry path: "${entry.entryName}".`,
          })
        );
      }
      entries.content.push({ path: rel, data: entry.getData() });
      continue;
    }
    const rel = name.slice(root.length);
    if (rel === "descriptor.json") {
      entries.descriptorRaw = entry.getData().toString("utf8");
    } else if (rel === "questions.json") {
      entries.questionsRaw = entry.getData().toString("utf8");
    } else if (rel === "pipeline.json") {
      entries.pipelineRaw = entry.getData().toString("utf8");
    }
  }

  entries.content.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return ok(entries);
}

export interface LoadedPackageMetadata {
  descriptor: unknown;
  questions: QuestionSpec[];
  pipeline: unknown;
}

/** Open the channel package and return the located declarative package. */
export function openDeclarativePackage(
  bytes: Buffer,
  locator: DeclarativeLocator
): Result<LoadedPackage, FxError> {
  const zip = openZip(bytes);
  if (zip.isErr()) {
    return err(zip.error);
  }
  const root = packageRoot(locator);
  const entries = readPackageEntries(zip.value, locator, true);
  if (entries.isErr()) {
    return err(entries.error);
  }

  if (entries.value.descriptorRaw === undefined) {
    return err(missingFile(`${root}descriptor.json`));
  }
  if (entries.value.pipelineRaw === undefined) {
    return err(missingFile(`${root}pipeline.json`));
  }
  const descriptor = parseEntryJson(entries.value.descriptorRaw, `${root}descriptor.json`);
  if (descriptor.isErr()) {
    return err(descriptor.error);
  }
  const pipeline = parseEntryJson(entries.value.pipelineRaw, `${root}pipeline.json`);
  if (pipeline.isErr()) {
    return err(pipeline.error);
  }

  return ok({
    descriptor: descriptor.value,
    pipeline: pipeline.value,
    content: entries.value.content,
  });
}

export function openDeclarativePackageMetadata(
  bytes: Buffer,
  locator: DeclarativeLocator
): Result<LoadedPackageMetadata, FxError> {
  const zip = openZip(bytes);
  if (zip.isErr()) {
    return err(zip.error);
  }
  const root = packageRoot(locator);
  const entries = readPackageEntries(zip.value, locator, false);
  if (entries.isErr()) {
    return err(entries.error);
  }
  if (entries.value.descriptorRaw === undefined) {
    return err(missingFile(`${root}descriptor.json`));
  }
  if (entries.value.questionsRaw === undefined) {
    return err(missingFile(`${root}questions.json`));
  }
  if (entries.value.pipelineRaw === undefined) {
    return err(missingFile(`${root}pipeline.json`));
  }

  const descriptor = parseEntryJson(entries.value.descriptorRaw, `${root}descriptor.json`);
  if (descriptor.isErr()) {
    return err(descriptor.error);
  }
  const questionsRaw = parseEntryJson(entries.value.questionsRaw, `${root}questions.json`);
  if (questionsRaw.isErr()) {
    return err(questionsRaw.error);
  }
  const questions = parseQuestions(questionsRaw.value, `${root}questions.json`);
  if (questions.isErr()) {
    return err(questions.error);
  }
  const pipeline = parseEntryJson(entries.value.pipelineRaw, `${root}pipeline.json`);
  if (pipeline.isErr()) {
    return err(pipeline.error);
  }

  return ok({ descriptor: descriptor.value, questions: questions.value, pipeline: pipeline.value });
}
