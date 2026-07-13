// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import Ajv, { AnySchema, ValidateFunction } from "ajv";
import { Result, err, ok } from "neverthrow";
import { DeclarativeLocator, TemplateFileEntry } from "../model/dataModel";
import { LoadedPackage } from "../distribution/packageDir";
import {
  ContentFile,
  PackageKind,
  SchemaValidator,
  VALIDATE_SCHEMA,
  ValidateMode,
  validateTemplatePackage,
} from "./validateTemplatePackage";
import { templateCapabilityFloor, templateCapabilityOutputs } from "./capabilityCatalog";

const SOURCE = "Scaffold";
const CALLER_FLOOR = ["appName", "language"];
const VALUE_TOKEN = /\{\{\s*[#^\/]?\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;

interface OpenedArchive {
  zip: AdmZip;
  entries: ReadonlyMap<string, Buffer>;
  packageIds: Record<PackageKind, string[]>;
  presentIds: Record<PackageKind, string[]>;
}

interface CompiledSchemas {
  descriptor: SchemaValidator;
  question: SchemaValidator;
  pipeline: SchemaValidator;
  selector: SchemaValidator;
}

function archiveError(name: string, message: string): FxError {
  return new SystemError({ source: SOURCE, name, message });
}

function packageError(name: string, message: string): FxError {
  return new UserError({ source: SOURCE, name, message });
}

function packageIdFromEntry(kind: PackageKind, name: string): string | undefined {
  const prefix = `v4/${kind}/`;
  if (!name.startsWith(prefix)) {
    return undefined;
  }
  const relative = name.slice(prefix.length);
  for (const suffix of ["/descriptor.json", "/questions.json", "/pipeline.json"]) {
    if (relative.endsWith(suffix)) {
      const id = relative.slice(0, -suffix.length);
      return id.length > 0 ? id : undefined;
    }
  }
  const contentIndex = relative.indexOf("/content/");
  return contentIndex > 0 ? relative.slice(0, contentIndex) : undefined;
}

function openArchive(bytes: Buffer): Result<OpenedArchive, FxError> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    return err(
      archiveError("TemplatePackageCorrupt", "The template package is not a valid archive.")
    );
  }

  const entries = new Map<string, Buffer>();
  const packageIds: Record<PackageKind, Set<string>> = {
    create: new Set<string>(),
    modify: new Set<string>(),
  };
  const presentIds: Record<PackageKind, string[]> = { create: [], modify: [] };
  try {
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) {
        continue;
      }
      const name = entry.entryName.replace(/\\/g, "/");
      entries.set(name, entry.getData());
      for (const kind of ["create", "modify"] as const) {
        const id = packageIdFromEntry(kind, name);
        if (id !== undefined) {
          packageIds[kind].add(id);
          if (name === `v4/${kind}/${id}/descriptor.json`) {
            presentIds[kind].push(id);
          }
        }
      }
    }
  } catch {
    return err(archiveError("TemplatePackageCorrupt", "The template package could not be read."));
  }
  presentIds.create.sort();
  presentIds.modify.sort();
  return ok({
    zip,
    entries,
    packageIds: {
      create: [...packageIds.create].sort(),
      modify: [...packageIds.modify].sort(),
    },
    presentIds,
  });
}

function parseJson(data: Buffer, file: string): Result<unknown, FxError> {
  try {
    const parsed: unknown = JSON.parse(data.toString("utf8"));
    return ok(parsed);
  } catch {
    return err(
      archiveError("PackageFileInvalid", `The template package file "${file}" is not valid JSON.`)
    );
  }
}

function parseOptionalJson(
  archive: OpenedArchive,
  file: string
): Result<unknown | undefined, FxError> {
  const data = archive.entries.get(file);
  return data === undefined ? ok(undefined) : parseJson(data, file);
}

function isAnySchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  );
}

function schemaValidator(ajv: Ajv, validate: ValidateFunction): SchemaValidator {
  return (data) =>
    validate(data) ? undefined : ajv.errorsText(validate.errors, { separator: "; " });
}

function compileSchemas(archive: OpenedArchive): Result<CompiledSchemas, FxError> {
  const schemaFiles: [keyof CompiledSchemas, string][] = [
    ["descriptor", "v4/schema/descriptor.schema.json"],
    ["question", "v4/schema/questions.schema.json"],
    ["pipeline", "v4/schema/pipeline.schema.json"],
    ["selector", "v4/schema/selector.schema.json"],
  ];
  const schemas: Partial<Record<keyof CompiledSchemas, AnySchema>> = {};
  for (const [name, file] of schemaFiles) {
    const data = archive.entries.get(file);
    if (data === undefined) {
      return err(archiveError("PackageFileMissing", `The template package is missing "${file}".`));
    }
    const parsed = parseJson(data, file);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    if (!isAnySchema(parsed.value)) {
      return err(
        archiveError("TemplateSchemaInvalid", `The template schema "${file}" is invalid.`)
      );
    }
    schemas[name] = parsed.value;
  }

  const descriptor = schemas.descriptor;
  const question = schemas.question;
  const pipeline = schemas.pipeline;
  const selector = schemas.selector;
  if (
    descriptor === undefined ||
    question === undefined ||
    pipeline === undefined ||
    selector === undefined
  ) {
    return err(
      archiveError("TemplateSchemaInvalid", "The template package schema set is incomplete.")
    );
  }

  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addSchema(question);
    return ok({
      descriptor: schemaValidator(ajv, ajv.compile(descriptor)),
      question: schemaValidator(
        ajv,
        ajv.getSchema("https://aka.ms/m365atk/v4/questions.schema.json") ?? ajv.compile(question)
      ),
      pipeline: schemaValidator(ajv, ajv.compile(pipeline)),
      selector: schemaValidator(ajv, ajv.compile(selector)),
    });
  } catch {
    return err(
      archiveError("TemplateSchemaInvalid", "The template package schemas could not be compiled.")
    );
  }
}

function isSafeRelativePath(relativePath: string): boolean {
  if (
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\") ||
    /^[A-Za-z]:/.test(relativePath)
  ) {
    return false;
  }
  return relativePath
    .replace(/\\/g, "/")
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validateSelectors(
  archive: OpenedArchive,
  schemas: CompiledSchemas
): Result<void, FxError> {
  for (const kind of ["create", "modify"] as const) {
    const file = `v4/${kind}/selector.json`;
    const selector = parseOptionalJson(archive, file);
    if (selector.isErr()) {
      return err(selector.error);
    }
    const schemaError = schemas.selector(selector.value);
    if (schemaError !== undefined) {
      return err(
        packageError(
          VALIDATE_SCHEMA,
          `${file}: selector.json failed schema validation: ${schemaError}`
        )
      );
    }
  }
  return ok(undefined);
}

function extractPlaceholders(value: string, output: Set<string>): void {
  for (const match of value.matchAll(VALUE_TOKEN)) {
    if (match.index !== undefined && match.index > 0 && value[match.index - 1] === "$") {
      continue;
    }
    output.add(match[1]);
  }
}

function loadContent(
  archive: OpenedArchive,
  locator: DeclarativeLocator
): Result<{ raw: TemplateFileEntry[]; validation: ContentFile[] | undefined }, FxError> {
  const prefix = `v4/${locator.kind}/${locator.templateId}/content/`;
  const raw: TemplateFileEntry[] = [];
  const validation: ContentFile[] = [];
  for (const [name, data] of archive.entries) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    const relativePath = name.slice(prefix.length);
    if (!isSafeRelativePath(relativePath)) {
      return err(
        archiveError(
          "TemplatePackageUnsafePath",
          `The resolved template package contains an unsafe entry path: "${name}".`
        )
      );
    }
    const placeholders = new Set<string>();
    if (relativePath.endsWith(".tpl")) {
      extractPlaceholders(relativePath, placeholders);
      extractPlaceholders(data.toString("utf8"), placeholders);
    }
    raw.push({ path: relativePath, data });
    validation.push({ path: relativePath, placeholders: [...placeholders].sort() });
  }
  raw.sort((left, right) => left.path.localeCompare(right.path));
  validation.sort((left, right) => left.path.localeCompare(right.path));
  return ok({ raw, validation: validation.length === 0 ? undefined : validation });
}

function validateOpenedPackage(
  archive: OpenedArchive,
  schemas: CompiledSchemas,
  locator: DeclarativeLocator,
  mode: ValidateMode,
  engineVersion: string
): Result<LoadedPackage, FxError> {
  const root = `v4/${locator.kind}/${locator.templateId}/`;
  const descriptor = parseOptionalJson(archive, `${root}descriptor.json`);
  if (descriptor.isErr()) {
    return err(descriptor.error);
  }
  const questions = parseOptionalJson(archive, `${root}questions.json`);
  if (questions.isErr()) {
    return err(questions.error);
  }
  const pipeline = parseOptionalJson(archive, `${root}pipeline.json`);
  if (pipeline.isErr()) {
    return err(pipeline.error);
  }
  const createSelector = parseOptionalJson(archive, "v4/create/selector.json");
  if (createSelector.isErr()) {
    return err(createSelector.error);
  }
  const modifySelector = parseOptionalJson(archive, "v4/modify/selector.json");
  if (modifySelector.isErr()) {
    return err(modifySelector.error);
  }
  const content = loadContent(archive, locator);
  if (content.isErr()) {
    return err(content.error);
  }

  const validation = validateTemplatePackage(locator.kind, locator.templateId, mode, {
    descriptor: () => descriptor.value,
    questions: () => questions.value,
    pipeline: () => pipeline.value,
    content: () => content.value.validation,
    selector: (kind) => (kind === "create" ? createSelector.value : modifySelector.value),
    schemas,
    capabilityFloor: templateCapabilityFloor,
    capabilityOutputs: templateCapabilityOutputs,
    engineVersion: () => engineVersion,
    callerFloor: () => CALLER_FLOOR,
    presentTemplateIds: (kind) => archive.presentIds[kind],
  });
  if (validation.isErr()) {
    return err(validation.error);
  }

  return ok({
    descriptor: validation.value.descriptor,
    pipeline: pipeline.value,
    content: content.value.raw,
  });
}

/** Validate and open one declarative package from final channel archive bytes. */
export function validateDeclarativePackageArchive(
  bytes: Buffer,
  locator: DeclarativeLocator,
  mode: ValidateMode,
  engineVersion: string
): Result<LoadedPackage, FxError> {
  const archive = openArchive(bytes);
  if (archive.isErr()) {
    return err(archive.error);
  }
  const schemas = compileSchemas(archive.value);
  if (schemas.isErr()) {
    return err(schemas.error);
  }
  const selectors = validateSelectors(archive.value, schemas.value);
  if (selectors.isErr()) {
    return err(selectors.error);
  }
  return validateOpenedPackage(archive.value, schemas.value, locator, mode, engineVersion);
}

/** Validate every authored create/modify package in final channel archive bytes. */
export function validateDeclarativeTemplateArchive(
  bytes: Buffer,
  mode: ValidateMode,
  engineVersion: string
): Result<string[], FxError> {
  const archive = openArchive(bytes);
  if (archive.isErr()) {
    return err(archive.error);
  }
  const schemas = compileSchemas(archive.value);
  if (schemas.isErr()) {
    return err(schemas.error);
  }
  const selectors = validateSelectors(archive.value, schemas.value);
  if (selectors.isErr()) {
    return err(selectors.error);
  }
  const validated: string[] = [];
  for (const kind of ["create", "modify"] as const) {
    for (const templateId of archive.value.packageIds[kind]) {
      const result = validateOpenedPackage(
        archive.value,
        schemas.value,
        { kind, templateId },
        mode,
        engineVersion
      );
      if (result.isErr()) {
        return err(result.error);
      }
      validated.push(`${kind}/${templateId}`);
    }
  }
  return ok(validated);
}
