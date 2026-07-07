// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { ConditionalExpression } from "../expression/evaluateExpression";
import { ReplaceMapEntry } from "../renderContext/buildRenderContext";
import {
  Pipeline,
  PipelineRender,
  PipelineStep,
  RenderFilter,
  StepParams,
} from "../pipeline/runScaffoldPipeline";

/** Typed boundary parsers for descriptor and pipeline JSON. */

const SOURCE = "Scaffold";

/** `SystemError` name: a package file's shape is not the discriminated form (a build gate gap). */
export const PACKAGE_PARSE_ERROR = "TemplatePackageParseError";

function systemError(message: string): SystemError {
  return new SystemError({ source: SOURCE, name: PACKAGE_PARSE_ERROR, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a record field as a string, or `undefined` when absent / non-string. */
function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

/** Discriminate one `replaceMap` entry by its present producer key (`const`/`from`/`expr`/`when`). */
function toReplaceMapEntry(item: unknown): ReplaceMapEntry | undefined {
  if (!isRecord(item)) {
    return undefined;
  }
  const varName = stringField(item, "var");
  if (varName === undefined) {
    return undefined;
  }
  const constVal = stringField(item, "const");
  if (constVal !== undefined) {
    return { var: varName, const: constVal };
  }
  const fromVal = stringField(item, "from");
  if (fromVal !== undefined) {
    return { var: varName, from: fromVal };
  }
  const exprVal = stringField(item, "expr");
  if (exprVal !== undefined) {
    return { var: varName, expr: exprVal };
  }
  const whenVal = stringField(item, "when");
  const valueVal = stringField(item, "value");
  if (whenVal !== undefined && valueVal !== undefined) {
    return { var: varName, when: whenVal, value: valueVal };
  }
  return undefined;
}

/** Extract `descriptor.replaceMap` as a typed entry list (absent ⇒ empty). */
export function parseReplaceMap(descriptor: unknown): Result<ReplaceMapEntry[], FxError> {
  if (!isRecord(descriptor)) {
    return err(systemError("descriptor.json must be a JSON object"));
  }
  const raw = descriptor.replaceMap;
  if (raw === undefined) {
    return ok([]);
  }
  if (!Array.isArray(raw)) {
    return err(systemError("descriptor.replaceMap must be an array"));
  }
  const entries: ReplaceMapEntry[] = [];
  for (const item of raw) {
    const entry = toReplaceMapEntry(item);
    if (entry === undefined) {
      return err(systemError(`invalid replaceMap entry: ${JSON.stringify(item)}`));
    }
    entries.push(entry);
  }
  return ok(entries);
}

/** Extract declared option ids used to seed the render-context identifier domain. */
export function parseDeclaredKeys(descriptor: unknown): string[] {
  if (!isRecord(descriptor)) {
    return [];
  }
  const optionsSchema = descriptor.optionsSchema;
  if (!isRecord(optionsSchema)) {
    return [];
  }
  const properties = optionsSchema.properties;
  if (!isRecord(properties)) {
    return [];
  }
  return Object.keys(properties);
}

function toStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      return undefined;
    }
    out.push(value);
  }
  return out;
}

/** Coerce a `with` block to `StepParams` (string | boolean | string[] values only). */
function toStepParams(raw: unknown): StepParams | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const params: StepParams = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || typeof value === "boolean") {
      params[key] = value;
      continue;
    }
    const stringArray = toStringArray(value);
    if (stringArray === undefined) {
      return undefined;
    }
    params[key] = stringArray;
  }
  return params;
}

function applyConditionalMetadata(
  item: Record<string, unknown>,
  target: ConditionalExpression,
  rejectMalformedWhen: boolean
): boolean {
  const comment = stringField(item, "comment");
  if (comment !== undefined) {
    target.comment = comment;
  }
  const when = stringField(item, "when");
  if (when !== undefined) {
    target.when = when;
  } else if (rejectMalformedWhen && item.when !== undefined) {
    return false;
  }
  return true;
}

function toPipelineStep(item: unknown): PipelineStep | undefined {
  if (!isRecord(item)) {
    return undefined;
  }
  const stepName = stringField(item, "step");
  if (stepName === undefined) {
    return undefined;
  }
  const result: PipelineStep = { step: stepName };
  if (!applyConditionalMetadata(item, result, false)) {
    return undefined;
  }
  if (item.with !== undefined) {
    const params = toStepParams(item.with);
    if (params === undefined) {
      return undefined;
    }
    result.with = params;
  }
  if (item.produces !== undefined) {
    const produces = toStringArray(item.produces);
    if (produces === undefined) {
      return undefined;
    }
    result.produces = produces;
  }
  return result;
}

function toRenderFilter(item: unknown): RenderFilter | undefined {
  if (!isRecord(item)) {
    return undefined;
  }
  const exclude = toStringArray(item.exclude);
  if (exclude === undefined) {
    return undefined;
  }
  const result: RenderFilter = { exclude };
  if (!applyConditionalMetadata(item, result, true)) {
    return undefined;
  }
  return result;
}

function toPipelineRender(raw: unknown): PipelineRender | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const result: PipelineRender = {};
  if (raw.filters !== undefined) {
    if (!Array.isArray(raw.filters)) {
      return undefined;
    }
    const filters: RenderFilter[] = [];
    for (const item of raw.filters) {
      const filter = toRenderFilter(item);
      if (filter === undefined) {
        return undefined;
      }
      filters.push(filter);
    }
    result.filters = filters;
  }
  return result;
}

/** Extract a parsed `pipeline.json` as a typed `Pipeline`. */
export function parsePipeline(raw: unknown): Result<Pipeline, FxError> {
  if (!isRecord(raw)) {
    return err(systemError("pipeline.json must be a JSON object"));
  }
  const name = stringField(raw, "pipeline");
  if (name === undefined) {
    return err(systemError("pipeline.pipeline (the orchestration name) is required"));
  }
  if (!Array.isArray(raw.steps)) {
    return err(systemError("pipeline.steps must be an array"));
  }
  const steps: PipelineStep[] = [];
  for (const item of raw.steps) {
    const step = toPipelineStep(item);
    if (step === undefined) {
      return err(systemError(`invalid pipeline step: ${JSON.stringify(item)}`));
    }
    steps.push(step);
  }
  const comment = stringField(raw, "comment");
  let render: PipelineRender | undefined;
  if (raw.render !== undefined) {
    render = toPipelineRender(raw.render);
    if (render === undefined) {
      return err(systemError(`invalid pipeline render: ${JSON.stringify(raw.render)}`));
    }
  }
  return ok({
    pipeline: name,
    ...(comment !== undefined ? { comment } : {}),
    ...(render !== undefined ? { render } : {}),
    steps,
  });
}
