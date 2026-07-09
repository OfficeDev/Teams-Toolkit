// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";

/** Pure v4 template-package validation gate. See validate-template-package spec and ADR-0015. */

const SOURCE = "Scaffold";

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

/** Narrow validation port; schema, package, and engine-context data stay injected. */
export interface TemplatePackagePort {
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
  schemas: { descriptor: SchemaValidator; question: SchemaValidator; selector: SchemaValidator };
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

function userError(name: string, message: string): UserError {
  return new UserError({ source: SOURCE, name, message });
}

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

/** Compare `major.minor.patch` numerically: <0 / 0 / >0. */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

function parseSemver(v: string): number[] {
  const parts = v.split(".");
  const nums: number[] = [];
  for (let i = 0; i < 3; i++) {
    const n = Number.parseInt(parts[i] ?? "0", 10);
    nums.push(Number.isNaN(n) ? 0 : n);
  }
  return nums;
}

/** Validate one `<kind>/<id>` package before any content is rendered. */
export function validateTemplatePackage(
  kind: PackageKind,
  id: string,
  mode: ValidateMode,
  port: TemplatePackagePort
): Result<ValidatedPackage, FxError> {
  const pkg = `${kind}/${id}`;

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
  const sSchemaErr = port.schemas.selector(selectorData);
  if (sSchemaErr !== undefined) {
    return err(
      userError(VALIDATE_SCHEMA, `${pkg}: selector.json failed schema validation: ${sSchemaErr}`)
    );
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

  const mayReference = new Set<string>([...replaceMapVars, ...answerVars, ...port.callerFloor()]);

  const contentFiles = port.content() ?? [];
  const contentTokens = new Set<string>();
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
          `${pkg}: emits required render var '${v}' that no content file consumes`
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
  const minEngineVersion = getString(descriptor, "minEngineVersion");
  if (minEngineVersion === undefined) {
    return err(
      userError(
        VALIDATE_MIN_ENGINE_MISSING,
        `${pkg}: descriptor.json must declare minEngineVersion (the reverse compatibility signal)`
      )
    );
  }

  if (mode === "load" && compareSemver(port.engineVersion(), minEngineVersion) < 0) {
    return err(
      userError(
        VALIDATE_ENGINE_TOO_OLD,
        `${pkg}: requires engine ${minEngineVersion}, but this engine is ${port.engineVersion()}; upgrade the engine (no silent fallback)`
      )
    );
  }

  return ok({ descriptor, minEngineVersion, contentFiles });
}
