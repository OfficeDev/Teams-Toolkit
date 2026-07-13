// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import type { FxError } from "@microsoft/teamsfx-api";
import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";
import semver from "semver";

/** Pure v4 template-package validation gate. See validate-template-package spec and ADR-0015. */

const MUSTACHE_VALUE = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;

/** Create one caller-owned, author-fixable validation failure. */
export type TemplatePackageErrorFactory = (name: string, message: string) => FxError;

/** Package namespace. */
export type PackageKind = "create" | "modify";

/** Validation mode; only `load` compares this engine against `minEngineVersion`. */
export type ValidateMode = "build" | "load";

/** One content file's path plus extracted `{{token}}` names. */
export interface ContentFile {
  path: string;
  placeholders: string[];
}

/** JSON-schema validator face; `undefined` means valid. */
export type SchemaValidator = (data: unknown) => string | undefined;

/** Template-visible extension-point categories with source-owned introduction versions. */
export type CapabilityKind = "step" | "provider" | "validator";

/** Narrow validation port; schema, package, and engine-context data stay injected. */
export interface TemplatePackagePort {
  /** Adapt an author-fixable diagnosis to the caller's concrete error type. */
  userError: TemplatePackageErrorFactory;
  /** The package's parsed `descriptor.json`, or `undefined` when absent. */
  descriptor(): unknown | undefined;
  /** The package's parsed `questions.json`, or `undefined` when absent. */
  questions(): unknown | undefined;
  /** The package's parsed `pipeline.json`, or `undefined` when absent. */
  pipeline(): unknown | undefined;
  /** Each content file's path + `{{token}}` set, or `undefined` when `content/` is absent. */
  content(): ContentFile[] | undefined;
  /** The per-kind `selector.json` (parsed). */
  selector(kind: PackageKind): unknown;
  /** The JSON-schema validators under `templates/v4/schema/`. */
  schemas: {
    descriptor: SchemaValidator;
    question: SchemaValidator;
    pipeline: SchemaValidator;
    selector: SchemaValidator;
  };
  /** The engine introduction version for a named capability; `undefined` means unknown. */
  capabilityFloor(kind: CapabilityKind, id: string): string | undefined;
  /** Output names a capability may add to the render context. */
  capabilityOutputs(kind: CapabilityKind, id: string): string[];
  /** The consuming engine's SemVer (the `load`-mode reverse gate). */
  engineVersion(): string;
  /** The closed caller-injected identifier names (`appName`, the `language` axis, …). */
  callerFloor(): string[];
  /** The `templateId`s whose `descriptor.json` is present in the artifact, per kind. */
  presentTemplateIds(kind: PackageKind): string[];
}

/** The validated package outcome. */
export interface ValidatedPackage {
  /** The parsed, schema-valid descriptor. */
  descriptor: Record<string, unknown>;
  /** The resolved reverse-gate floor (recorded on outcome / telemetry). */
  minEngineVersion: string;
  /** The validated content-file list (empty when `content/` is absent). */
  contentFiles: ContentFile[];
}

/** `UserError` name: a required package file (`descriptor`/`questions`/`pipeline`) is absent. */
export const VALIDATE_REQUIRED_FILE = "TemplatePackageRequiredFile";
/** `UserError` name: a package file failed its JSON schema. */
export const VALIDATE_SCHEMA = "TemplatePackageSchema";
/** `UserError` name: a content token has no producer, or a required var has no consumer. */
export const VALIDATE_PLACEHOLDER_DRIFT = "TemplatePackagePlaceholderDrift";
/** `UserError` name: a v4 selector route names a `templateId` with no present descriptor. */
export const VALIDATE_DANGLING_ROUTE = "TemplatePackageDanglingRoute";
/** `UserError` name: the same `templateId` is routed in both the create and modify selectors. */
export const VALIDATE_KIND_OVERLAP = "TemplatePackageKindOverlap";
/** `UserError` name: `descriptor.minEngineVersion` is missing (it is mandatory). */
export const VALIDATE_MIN_ENGINE_MISSING = "TemplatePackageMinEngineVersionMissing";
/** `UserError` name: `engineVersion < minEngineVersion` — the engine is too old. */
export const VALIDATE_ENGINE_TOO_OLD = "TemplatePackageEngineTooOld";
/** `UserError` name: a package or consuming engine version is not valid SemVer. */
export const VALIDATE_ENGINE_VERSION_INVALID = "TemplatePackageEngineVersionInvalid";
/** `UserError` name: package data references a capability absent from the engine catalogue. */
export const VALIDATE_UNKNOWN_CAPABILITY = "TemplatePackageUnknownCapability";
/** `UserError` name: `minEngineVersion` predates a referenced capability. */
export const VALIDATE_CAPABILITY_FLOOR = "TemplatePackageCapabilityFloor";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === "string" ? v : undefined;
}

function getArray(rec: Record<string, unknown>, key: string): unknown[] | undefined {
  const v = rec[key];
  return Array.isArray(v) ? v : undefined;
}

function getRecord(rec: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = rec[key];
  return isRecord(v) ? v : undefined;
}

/** The v4 `templateId`s routed by a selector. */
function v4RouteIds(selectorData: unknown): string[] {
  const ids: string[] = [];
  if (!isRecord(selectorData)) {
    return ids;
  }
  const routes = getArray(selectorData, "routes") ?? [];
  for (const routeRaw of routes) {
    if (!isRecord(routeRaw) || getString(routeRaw, "engine") !== "v4") {
      continue;
    }
    const tid = getString(routeRaw, "templateId");
    if (tid !== undefined) {
      ids.push(tid);
    }
  }
  return ids;
}

function validateEngineVersion(
  pkg: string,
  field: string,
  version: string,
  userError: TemplatePackageErrorFactory
): Result<string, FxError> {
  if (semver.valid(version) !== version) {
    return err(
      userError(
        VALIDATE_ENGINE_VERSION_INVALID,
        `${pkg}: ${field} '${version}' is not valid SemVer`
      )
    );
  }
  return ok(version);
}

interface CapabilityReference {
  kind: CapabilityKind;
  id: string;
}

function validatorReference(validation: unknown): CapabilityReference | undefined {
  const id =
    typeof validation === "string"
      ? validation
      : isRecord(validation)
        ? getString(validation, "use")
        : undefined;
  return id === undefined ? undefined : { kind: "validator", id };
}

function capabilityReferences(questions: unknown, pipeline: unknown): CapabilityReference[] {
  const references: CapabilityReference[] = [];
  if (isRecord(questions)) {
    for (const question of getArray(questions, "questions") ?? []) {
      if (!isRecord(question)) {
        continue;
      }
      const provider = getString(question, "optionsFrom");
      if (provider !== undefined) {
        references.push({ kind: "provider", id: provider });
      }
      const validator = validatorReference(question.validation);
      if (validator !== undefined) {
        references.push(validator);
      }
      const inputBoxValidator = validatorReference(
        getRecord(question, "inputBoxConfig")?.validation
      );
      if (inputBoxValidator !== undefined) {
        references.push(inputBoxValidator);
      }
    }
  }
  if (isRecord(pipeline)) {
    for (const step of getArray(pipeline, "steps") ?? []) {
      if (!isRecord(step)) {
        continue;
      }
      const id = getString(step, "step");
      if (id !== undefined) {
        references.push({ kind: "step", id });
      }
    }
  }
  return references;
}

function pipelinePlaceholderReferences(pipeline: unknown): string[] {
  const references = new Set<string>();
  if (!isRecord(pipeline)) {
    return [];
  }
  for (const step of getArray(pipeline, "steps") ?? []) {
    if (!isRecord(step)) {
      continue;
    }
    const withParams = getRecord(step, "with");
    if (withParams === undefined) {
      continue;
    }
    for (const value of Object.values(withParams)) {
      const strings = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
      for (const item of strings) {
        if (typeof item !== "string") {
          continue;
        }
        for (const match of item.matchAll(MUSTACHE_VALUE)) {
          if (match.index !== undefined && match.index > 0 && item[match.index - 1] === "$") {
            continue;
          }
          references.add(match[1]);
        }
      }
    }
  }
  return [...references];
}

/** Apply the package's reverse engine-version gate before any content is rendered. */
export function validateMinEngineVersion(
  kind: PackageKind,
  id: string,
  descriptor: unknown,
  engineVersion: string,
  userError: TemplatePackageErrorFactory
): Result<string, FxError> {
  const pkg = `${kind}/${id}`;
  if (!isRecord(descriptor)) {
    return err(userError(VALIDATE_SCHEMA, `${pkg}: descriptor.json must be a JSON object`));
  }
  const minEngineVersion = getString(descriptor, "minEngineVersion");
  if (minEngineVersion === undefined) {
    return err(
      userError(
        VALIDATE_MIN_ENGINE_MISSING,
        `${pkg}: descriptor.json must declare minEngineVersion (the reverse compatibility signal)`
      )
    );
  }
  const validMinimum = validateEngineVersion(pkg, "minEngineVersion", minEngineVersion, userError);
  if (validMinimum.isErr()) {
    return err(validMinimum.error);
  }
  const validEngine = validateEngineVersion(pkg, "engineVersion", engineVersion, userError);
  if (validEngine.isErr()) {
    return err(validEngine.error);
  }
  if (semver.lt(engineVersion, minEngineVersion)) {
    return err(
      userError(
        VALIDATE_ENGINE_TOO_OLD,
        `${pkg}: requires engine ${minEngineVersion}, but this engine is ${engineVersion}; upgrade the engine (no silent fallback)`
      )
    );
  }
  return ok(minEngineVersion);
}

/** Validate one `<kind>/<id>` package before any content is rendered. */
export function validateTemplatePackage(
  kind: PackageKind,
  id: string,
  mode: ValidateMode,
  port: TemplatePackagePort
): Result<ValidatedPackage, FxError> {
  const pkg = `${kind}/${id}`;
  const userError: TemplatePackageErrorFactory = (name, message) => port.userError(name, message);

  // descriptor / questions / pipeline are required; `content/` is optional.
  const descriptor = port.descriptor();
  const questions = port.questions();
  const pipeline = port.pipeline();
  if (descriptor === undefined) {
    return err(userError(VALIDATE_REQUIRED_FILE, `${pkg}: descriptor.json is required`));
  }
  if (questions === undefined) {
    return err(userError(VALIDATE_REQUIRED_FILE, `${pkg}: questions.json is required`));
  }
  if (pipeline === undefined) {
    return err(userError(VALIDATE_REQUIRED_FILE, `${pkg}: pipeline.json is required`));
  }
  if (!isRecord(descriptor)) {
    return err(userError(VALIDATE_SCHEMA, `${pkg}: descriptor.json must be a JSON object`));
  }

  // Validate descriptor, questions, and selector against their schemas.
  const selectorData = port.selector(kind);
  const dSchemaErr = port.schemas.descriptor(descriptor);
  if (dSchemaErr !== undefined) {
    return err(
      userError(VALIDATE_SCHEMA, `${pkg}: descriptor.json failed schema validation: ${dSchemaErr}`)
    );
  }
  const qSchemaErr = port.schemas.question(questions);
  if (qSchemaErr !== undefined) {
    return err(
      userError(VALIDATE_SCHEMA, `${pkg}: questions.json failed schema validation: ${qSchemaErr}`)
    );
  }
  const pSchemaErr = port.schemas.pipeline(pipeline);
  if (pSchemaErr !== undefined) {
    return err(
      userError(VALIDATE_SCHEMA, `${pkg}: pipeline.json failed schema validation: ${pSchemaErr}`)
    );
  }
  const sSchemaErr = port.schemas.selector(selectorData);
  if (sSchemaErr !== undefined) {
    return err(
      userError(VALIDATE_SCHEMA, `${pkg}: selector.json failed schema validation: ${sSchemaErr}`)
    );
  }

  const minEngineVersion = getString(descriptor, "minEngineVersion");
  if (minEngineVersion === undefined) {
    return err(
      userError(
        VALIDATE_MIN_ENGINE_MISSING,
        `${pkg}: descriptor.json must declare minEngineVersion (the reverse compatibility signal)`
      )
    );
  }
  const validMinimum = validateEngineVersion(pkg, "minEngineVersion", minEngineVersion, userError);
  if (validMinimum.isErr()) {
    return err(validMinimum.error);
  }
  const derivedVars: string[] = [];
  for (const reference of capabilityReferences(questions, pipeline)) {
    const floor = port.capabilityFloor(reference.kind, reference.id);
    if (floor === undefined) {
      return err(
        userError(
          VALIDATE_UNKNOWN_CAPABILITY,
          `${pkg}: ${reference.kind} '${reference.id}' is not a registered template capability`
        )
      );
    }
    if (semver.lt(minEngineVersion, floor)) {
      return err(
        userError(
          VALIDATE_CAPABILITY_FLOOR,
          `${pkg}: ${reference.kind} '${reference.id}' requires minEngineVersion ${floor}, but descriptor.json declares ${minEngineVersion}`
        )
      );
    }
    if (reference.kind === "provider") {
      for (const output of port.capabilityOutputs(reference.kind, reference.id)) {
        derivedVars.push(`derived.${reference.id}.${output}`);
      }
    }
  }

  // Placeholder closure: every token has a producer, and every required var is consumed.
  const replaceMapVars: string[] = [];
  const requiredVars: string[] = [];
  for (const entryRaw of getArray(descriptor, "replaceMap") ?? []) {
    if (!isRecord(entryRaw)) {
      continue;
    }
    const v = getString(entryRaw, "var");
    if (v === undefined) {
      continue;
    }
    replaceMapVars.push(v);
    if (!("when" in entryRaw)) {
      requiredVars.push(v);
    }
  }

  const answerVars = new Set<string>();
  const optionsSchema = getRecord(descriptor, "optionsSchema");
  const props = optionsSchema === undefined ? undefined : getRecord(optionsSchema, "properties");
  if (props !== undefined) {
    for (const k of Object.keys(props)) {
      answerVars.add(k);
    }
  }
  if (isRecord(questions)) {
    for (const qRaw of getArray(questions, "questions") ?? []) {
      if (isRecord(qRaw)) {
        const n = getString(qRaw, "name");
        if (n !== undefined) {
          answerVars.add(n);
        }
      }
    }
  }

  const mayReference = new Set<string>([
    ...replaceMapVars,
    ...answerVars,
    ...derivedVars,
    ...port.callerFloor(),
  ]);

  const contentFiles = port.content() ?? [];
  const contentTokens = new Set<string>();
  for (const token of pipelinePlaceholderReferences(pipeline)) {
    contentTokens.add(token);
    if (!mayReference.has(token)) {
      return err(
        userError(
          VALIDATE_PLACEHOLDER_DRIFT,
          `${pkg}: pipeline.json references '{{${token}}}', which no replaceMap entry, question, or caller-injected identifier produces`
        )
      );
    }
  }
  for (const file of contentFiles) {
    for (const token of file.placeholders) {
      contentTokens.add(token);
      if (!mayReference.has(token)) {
        return err(
          userError(
            VALIDATE_PLACEHOLDER_DRIFT,
            `${pkg}: content file '${file.path}' references '{{${token}}}', which no replaceMap entry, question, or caller-injected identifier produces`
          )
        );
      }
    }
  }
  for (const v of requiredVars) {
    if (!contentTokens.has(v)) {
      return err(
        userError(
          VALIDATE_PLACEHOLDER_DRIFT,
          `${pkg}: emits required render var '${v}' that no render surface consumes`
        )
      );
    }
  }

  // Every v4 route must resolve to a present descriptor; kinds stay disjoint.
  const thisV4Ids = v4RouteIds(selectorData);
  const present = new Set(port.presentTemplateIds(kind));
  for (const tid of thisV4Ids) {
    if (!present.has(tid)) {
      return err(
        userError(
          VALIDATE_DANGLING_ROUTE,
          `${pkg}: selector.json routes v4 templateId '${tid}', but no descriptor for it is present in the artifact`
        )
      );
    }
  }
  const otherKind: PackageKind = kind === "create" ? "modify" : "create";
  const otherV4Ids = new Set(v4RouteIds(port.selector(otherKind)));
  for (const tid of thisV4Ids) {
    if (otherV4Ids.has(tid)) {
      return err(
        userError(
          VALIDATE_KIND_OVERLAP,
          `templateId '${tid}' is routed in both the create and modify selectors; the two kinds own disjoint templateId namespaces`
        )
      );
    }
  }

  // The reverse gate is explicit.
  const minEngineResult =
    mode === "load"
      ? validateMinEngineVersion(kind, id, descriptor, port.engineVersion(), userError)
      : ok(minEngineVersion);
  if (minEngineResult.isErr()) {
    return err(minEngineResult.error);
  }
  return ok({ descriptor, minEngineVersion: minEngineResult.value, contentFiles });
}
