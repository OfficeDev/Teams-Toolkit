// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { ConditionalExpression, evaluateConditionalWhen } from "../expression/evaluateExpression";
import { RenderVars, TemplateFileEntry } from "../model/dataModel";
import { getLocalizedString } from "../../common/localizeUtils";

/** v4 scaffold pipeline executor. See the run-scaffold-pipeline spec and ADR-0017. */

const SOURCE = "Scaffold";

/** Built-in guard that must run before rendering so a violation writes nothing. */
const STEP_REQUIRE_EMPTY_TARGET = "require-empty-target";

const TPL_SUFFIX = ".tpl";

function skipWarning(path: string): string {
  return getLocalizedString("core.v4.scaffold.existingFileSkipped", path);
}

/** A resolved step parameter value. */
export type ParamValue = string | boolean | string[];

/** A step's author-supplied `with` block, or its resolved form. */
export type StepParams = Record<string, ParamValue>;

/** One `pipeline.steps` entry. `produces` is reserved for future cross-step data flow. */
export interface PipelineStep extends ConditionalExpression {
  step: string;
  with?: StepParams;
  produces?: string[];
}

/** One render-phase file filter. Paths are target-relative output paths after `.tpl` suffix stripping. */
export interface RenderFilter extends ConditionalExpression {
  exclude: string[];
}

/** Render-phase controls declared by `pipeline.json`. */
export interface PipelineRender {
  filters?: RenderFilter[];
}

/** A parsed, schema-valid `pipeline.json`. */
export interface Pipeline {
  pipeline: string;
  comment?: string;
  render?: PipelineRender;
  steps: PipelineStep[];
}

/** The output directory plus its pre-run file snapshot. */
export interface TargetDir {
  path: string;
  existing: string[];
}

/** A render-phase path skipped because it already existed. */
export interface SkippedFile {
  path: string;
  warning: string;
}

/** The result of a scaffold run. */
export interface ScaffoldOutcome {
  written: string[];
  filtered: string[];
  skipped: SkippedFile[];
  stepsRun: string[];
  stepsSkipped: string[];
}

/** A resolved named orchestration. */
export interface Orchestration {
  name: string;
}

/** Minimal manifest wrapper face needed by registered steps. */
export interface ManifestWrapper {
  registerDeclarativeAgentAction(
    teamsManifestPath: string,
    pluginManifestPath: string
  ): Result<void, FxError>;
  setSensitivityLabel?(path: string, id: string): Result<void, FxError>;
}

/** The capabilities the executor hands each registered step's `apply`. */
export interface StepContext {
  write(path: string, data: Buffer): void;
  manifestWrapper(kind: string): ManifestWrapper;
  /** Read current bytes at a target path, or `undefined` when absent. */
  read(path: string): Buffer | undefined;
  /** Emit a localized, user-visible warning without failing the pipeline. */
  warn?(message: string): void;
}

/** An engine-registered, whitelist-dispatched post-render step. */
export interface RegisteredStep {
  validateParams(resolved: StepParams): string | undefined;
  apply(
    resolved: StepParams,
    ctx: StepContext
  ): Result<void, FxError> | Promise<Result<void, FxError>>;
}

/** Narrow pipeline port; `render` is the single Mustache surface for paths and values. */
export interface PipelineRuntimePort {
  pipelineRegistry(pipelineName: string): Orchestration | undefined;
  stepRegistry(stepName: string): RegisteredStep | undefined;
  evalWhen(expr: string, renderVars: RenderVars): Result<boolean, FxError>;
  render(mustache: string, renderVars: RenderVars): Result<string, FxError>;
  manifestWrapper(kind: string): ManifestWrapper;
  warn?(message: string): void;
  write(path: string, data: Buffer): void;
  /** Current bytes at a path, or `undefined` when absent. */
  read(path: string): Buffer | undefined;
}

/** `SystemError` names for engine-side pipeline breaks. */
export const PIPELINE_UNKNOWN_PIPELINE = "PipelineUnknownPipeline";
export const PIPELINE_UNKNOWN_STEP = "PipelineUnknownStep";
export const PIPELINE_PARAMS_VIOLATION = "PipelineParamsViolation";
export const PIPELINE_CROSS_STEP_REFERENCE = "PipelineCrossStepReference";

/** `UserError` name for a non-empty create target. */
export const REQUIRE_EMPTY_TARGET = "RequireEmptyTarget";

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

/** Evaluate a step's `when` (absent guard ⇒ active). */
function whenActive(
  step: PipelineStep,
  renderVars: RenderVars,
  port: PipelineRuntimePort
): Result<boolean, FxError> {
  return evaluateConditionalWhen(step, (expr) => port.evalWhen(expr, renderVars));
}

function filterActive(
  filter: RenderFilter,
  renderVars: RenderVars,
  port: PipelineRuntimePort
): Result<boolean, FxError> {
  return evaluateConditionalWhen(filter, (expr) => port.evalWhen(expr, renderVars));
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function matchesActiveFilter(
  path: string,
  filters: RenderFilter[] | undefined,
  renderVars: RenderVars,
  port: PipelineRuntimePort
): Result<boolean, FxError> {
  if (filters === undefined) {
    return ok(false);
  }
  for (const filter of filters) {
    if (!filter.exclude.includes(path)) {
      continue;
    }
    const active = filterActive(filter, renderVars, port);
    if (active.isErr()) {
      return err(active.error);
    }
    if (active.value) {
      return ok(true);
    }
  }
  return ok(false);
}

/** Resolve a step's `with`: strings render through Mustache; literals pass through. */
function resolveParams(
  params: StepParams,
  renderVars: RenderVars,
  port: PipelineRuntimePort
): Result<StepParams, FxError> {
  const resolved: StepParams = {};
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (typeof value === "string") {
      // Preserve a sole multiSelect token as a typed list for step params.
      const soleToken = value.match(/^\{\{(\w+)\}\}$/);
      if (soleToken) {
        const listValue = renderVars[soleToken[1]];
        if (Array.isArray(listValue)) {
          resolved[key] = listValue;
          continue;
        }
      }
      const rendered = port.render(value, renderVars);
      if (rendered.isErr()) {
        return err(rendered.error);
      }
      resolved[key] = rendered.value;
    } else {
      // JSON literals pass through unrendered.
      resolved[key] = value;
    }
  }
  return ok(resolved);
}

/** Execute one template package's pipeline against a resolved render context. */
export async function runScaffoldPipeline(
  pipeline: Pipeline,
  content: TemplateFileEntry[],
  renderVars: RenderVars,
  targetDir: TargetDir,
  port: PipelineRuntimePort
): Promise<Result<ScaffoldOutcome, FxError>> {
  // Unknown pipeline names are engine breaks, never silent no-ops.
  if (!port.pipelineRegistry(pipeline.pipeline)) {
    return err(
      systemError(
        PIPELINE_UNKNOWN_PIPELINE,
        `Unknown pipeline '${pipeline.pipeline}'. The name is a closed engine whitelist; reaching execution with an unknown one is an engine inconsistency.`
      )
    );
  }

  // Cross-step data flow is reserved until render vars can be updated by steps.
  for (const step of pipeline.steps) {
    if (step.produces !== undefined) {
      return err(
        systemError(
          PIPELINE_CROSS_STEP_REFERENCE,
          `Step '${step.step}' declares a forward-looking cross-step reference ('produces'); render vars are frozen before steps run, so this form is not yet supported.`
        )
      );
    }
  }

  // Enforce the create guard before render; record it later in declared order.
  for (const step of pipeline.steps) {
    if (step.step !== STEP_REQUIRE_EMPTY_TARGET) {
      continue;
    }
    const active = whenActive(step, renderVars, port);
    if (active.isErr()) {
      return err(active.error);
    }
    if (active.value && targetDir.existing.length > 0) {
      return err(
        new UserError({
          source: SOURCE,
          name: REQUIRE_EMPTY_TARGET,
          message: `The target folder '${targetDir.path}' is not empty. Scaffolding a new project requires an empty folder; remove the existing files or choose another folder, then try again.`,
        })
      );
    }
  }

  // Phase 1: render `.tpl` path/body pairs; copy non-template files verbatim.
  const written: string[] = [];
  const filtered: string[] = [];
  const skipped: SkippedFile[] = [];
  for (const entry of content) {
    if (entry.path.endsWith(TPL_SUFFIX)) {
      const renderedPath = port.render(entry.path.slice(0, -TPL_SUFFIX.length), renderVars);
      if (renderedPath.isErr()) {
        return err(renderedPath.error);
      }
      const writePath = normalizedPath(renderedPath.value);
      const omitted = matchesActiveFilter(writePath, pipeline.render?.filters, renderVars, port);
      if (omitted.isErr()) {
        return err(omitted.error);
      }
      if (omitted.value) {
        filtered.push(writePath);
        continue;
      }
      if (targetDir.existing.includes(writePath)) {
        const warning = skipWarning(writePath);
        skipped.push({ path: writePath, warning });
        port.warn?.(warning);
        continue;
      }
      const renderedBody = port.render(entry.data.toString("utf8"), renderVars); // AC-18
      if (renderedBody.isErr()) {
        return err(renderedBody.error);
      }
      port.write(writePath, Buffer.from(renderedBody.value, "utf8"));
      written.push(writePath);
    } else {
      const writePath = normalizedPath(entry.path);
      const omitted = matchesActiveFilter(writePath, pipeline.render?.filters, renderVars, port);
      if (omitted.isErr()) {
        return err(omitted.error);
      }
      if (omitted.value) {
        filtered.push(writePath);
        continue;
      }
      if (targetDir.existing.includes(writePath)) {
        const warning = skipWarning(writePath);
        skipped.push({ path: writePath, warning });
        port.warn?.(warning);
        continue;
      }
      port.write(writePath, entry.data);
      written.push(writePath);
    }
  }

  // Phase 2 — post-render steps, in declared order.
  const ctx: StepContext = {
    write: (path, data) => port.write(path, data),
    manifestWrapper: (kind) => port.manifestWrapper(kind),
    read: (path) => port.read(path),
    warn: port.warn,
  };
  const stepsRun: string[] = [];
  const stepsSkipped: string[] = [];
  for (const step of pipeline.steps) {
    const active = whenActive(step, renderVars, port);
    if (active.isErr()) {
      return err(active.error);
    }

    if (step.step === STEP_REQUIRE_EMPTY_TARGET) {
      // Already enforced before render; only record its declared-order status.
      (active.value ? stepsRun : stepsSkipped).push(step.step);
      continue;
    }

    const registered = port.stepRegistry(step.step);
    if (!registered) {
      return err(
        systemError(
          PIPELINE_UNKNOWN_STEP,
          `Unknown step '${step.step}'. The reverse minEngineVersion gate (ADR-0015) guarantees every referenced step is present; an absent one is an engine inconsistency.`
        )
      );
    }

    if (!active.value) {
      stepsSkipped.push(step.step);
      continue;
    }

    const resolved = resolveParams(step.with ?? {}, renderVars, port);
    if (resolved.isErr()) {
      return err(resolved.error);
    }

    const violation = registered.validateParams(resolved.value);
    if (violation !== undefined) {
      return err(
        systemError(
          PIPELINE_PARAMS_VIOLATION,
          `Step '${step.step}' resolved parameters violate its schema: ${violation}. The build-time typed-context check (ADR-0016) should have caught this.`
        )
      );
    }

    const applied = await registered.apply(resolved.value, ctx);
    if (applied.isErr()) {
      return err(applied.error);
    }
    stepsRun.push(step.step);
  }

  return ok({ written, filtered, skipped, stepsRun, stepsSkipped });
}
