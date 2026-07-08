// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { ConditionNode, EvalValue, NULL_VALUE, Scope } from "../expression/evaluateExpression";
import { Answers } from "../model/dataModel";

/** v4 input collection: native questions to answers. See collect-inputs spec and ADR-0016. */

const SOURCE = "Scaffold";

/** Identity-only option; computed values flow through provider `derived.*`. */
export interface OptionItem {
  id: string;
  label?: string;
  description?: string;
  detail?: string;
  groupName?: string;
  iconPath?: string;
  condition?: ConditionNode;
  keyPrefix?: string;
}

export interface InputBoxConfig {
  name: string;
  title?: string;
  placeholder?: string;
  prompt?: string;
  default?: string;
  step?: number;
  keyPrefix?: string;
  validation?: string | ValidationSpec;
}

/** Native question kinds the surface-neutral driver renders. */
export type QuestionType =
  | "singleSelect"
  | "multiSelect"
  | "text"
  | "confirm"
  | "singleFile"
  | "folder"
  | "singleFileOrText";

/** A validator reference: the registry name, or `{ use, params }`. */
export interface ValidationSpec {
  use: string;
  params?: Record<string, string>;
}

/** One authored question. Only one option source may be present. */
export interface QuestionSpec {
  name: string;
  type: QuestionType;
  title?: string;
  cliDescription?: string;
  cliShortName?: string;
  placeholder?: string;
  prompt?: string;
  default?: string;
  password?: boolean;
  filters?: Record<string, string[]>;
  inputOptionItem?: OptionItem;
  inputBoxConfig?: InputBoxConfig;
  validation?: string | ValidationSpec;
  staticOptions?: OptionItem[];
  optionsFrom?: string;
  optionsFromParams?: Record<string, ConditionNode>;
  skipSingleOption?: boolean;
  optional?: boolean;
  condition?: ConditionNode;
  keyPrefix?: string;
}

/** The Q2 options JSON Schema; only its identifier domain is read here. */
export interface OptionsSchema {
  properties?: Record<string, unknown>;
}

/** What an `optionsFrom` provider yields. */
export interface ResolvedOptions {
  options: OptionItem[];
  derived?: Record<string, string>;
}

export type OptionsSource = OptionItem[] | (() => Promise<ResolvedOptions>);

/** Engine-registered `optionsFrom` provider. */
export interface OptionsProvider {
  derivedSchema?: string[];
  fetch(params: Record<string, string>): Promise<ResolvedOptions> | ResolvedOptions;
}

/** Engine-registered validator: an error message, or `undefined` when valid. */
export type Validator = (
  value: string,
  answers: Answers
) => string | undefined | Promise<string | undefined>;

export type PromptValidation = (value: string) => string | undefined | Promise<string | undefined>;

/** One prompt's outcome: a chosen value, a surface auto-skip, or the host's `back` request. */
export type Asked<T> = { kind: "value"; value: T } | { kind: "skip"; value: T } | { kind: "back" };

/** One resumable walk's history entry (opaque to cross-phase callers). */
export interface WalkHistoryEntry {
  pos: number;
  answers: Answers;
}

/** The resumable walk's outcome: a completed answer set, or a `back` handed to the caller. */
export type WalkOutcome =
  | { kind: "done"; answers: Answers; history: WalkHistoryEntry[]; promptCount: number }
  | { kind: "back"; history: WalkHistoryEntry[]; promptCount: number };

/** Options for the resumable walk (the cross-phase back primitive; see collect-inputs INV-9). */
export interface WalkOptions {
  /** Added to the 1-based shown step so a later phase continues an earlier phase's numbering. */
  baseStep?: number;
  /** Resume a prior walk by re-entering its last prompted question via `back`. */
  resume?: { history: WalkHistoryEntry[] };
  /** When true, a `back` past the first prompt returns `{ kind: "back" }` instead of cancelling. */
  backable?: boolean;
}

/** Surface-neutral prompt driver. */
export interface PromptUI {
  /** Render one scalar question. */
  ask(
    question: QuestionSpec,
    options: OptionsSource | undefined,
    step?: number,
    validation?: PromptValidation,
    inputBoxValidation?: PromptValidation
  ): Promise<Result<Asked<string>, FxError>>;
  /** Render one multi-pick question without collapsing selected ids to a scalar. */
  askMulti(
    question: QuestionSpec,
    options: OptionsSource | undefined,
    step?: number
  ): Promise<Result<Asked<string[]>, FxError>>;
}

/** Narrow input-collection port: prompt UI, registries, and shared evaluator. */
export interface CollectInputsPort {
  ui: PromptUI;
  optionsProvider(providerId: string): OptionsProvider | undefined;
  validator(name: string): Validator | undefined;
  evaluate(node: ConditionNode, scope: Scope): Result<EvalValue, FxError>;
}

/** `SystemError` names for engine-side input collection breaks. */
export const INPUT_BOTH_OPTION_SOURCES = "InputBothOptionSources";
export const INPUT_UNKNOWN_PROVIDER = "InputUnknownProvider";
export const INPUT_UNKNOWN_VALIDATOR = "InputUnknownValidator";
export const INPUT_FORWARD_DERIVED_REFERENCE = "InputForwardDerivedReference";
export const INPUT_PROVIDER_FAILED = "InputProviderFailed";

/** `UserError` name for input validation failures. */
export const INPUT_VALIDATION_FAILED = "InputValidationFailed";

/** `UserError` name for cancelling the walk from the first prompt. */
export const INPUT_WALK_CANCELLED = "InputWalkCancelled";

/** The walk's cancel signal. */
function walkCancelled(): UserError {
  return new UserError({
    source: SOURCE,
    name: INPUT_WALK_CANCELLED,
    message: "the input walk was cancelled by going back from the first question",
  });
}

function missingNonInteractiveAnswer(questionName: string): UserError {
  return new UserError({
    source: SOURCE,
    name: INPUT_VALIDATION_FAILED,
    message: `${questionName} is required in non-interactive mode.`,
  });
}

/**
 * Walk one phase's questions into a resumable outcome — the shared cross-phase
 * back primitive (collect-inputs INV-9). `baseStep` offsets the shown step so a
 * later phase continues an earlier phase's numbering; `backable` turns a `back`
 * past the first prompt into a `{ kind: "back" }` outcome instead of cancelling;
 * `resume` re-enters a prior walk's history at its last prompted question.
 */
export async function walkInputs(
  questions: QuestionSpec[],
  optionsSchema: OptionsSchema,
  entryParams: Answers,
  port: CollectInputsPort,
  walkOptions: WalkOptions = {}
): Promise<Result<WalkOutcome, FxError>> {
  const baseStep = walkOptions.baseStep ?? 0;
  const declared = Object.keys(optionsSchema.properties ?? {});
  // Cache providers by normalized params for a single run.
  const providerCache = new Map<string, Promise<ResolvedOptions>>();
  // Providers resolve in declaration order; forward `derived.*` refs are rejected.
  const resolvedProviders = new Set<string>();

  // Back history snapshots only prompted steps; skipped and pre-filled steps are crossed over.
  const history: WalkHistoryEntry[] =
    walkOptions.resume !== undefined ? [...walkOptions.resume.history] : [];

  let answers: Answers;
  let pos: number;
  if (walkOptions.resume !== undefined) {
    // Re-enter the resumed walk at its last prompted question (one `back`).
    const restore = history.pop();
    if (restore === undefined) {
      return walkOptions.backable === true
        ? ok({ kind: "back", history: [], promptCount: 0 })
        : err(walkCancelled());
    }
    answers = { ...restore.answers };
    pos = restore.pos;
  } else {
    // Pre-filled entry params must be visible to question conditions.
    answers = { ...entryParams };
    pos = 0;
  }

  while (pos < questions.length) {
    const q = questions[pos];

    // Keep the schema invariant guarded at runtime too.
    if (q.staticOptions !== undefined && q.optionsFrom !== undefined) {
      return err(
        systemError(
          INPUT_BOTH_OPTION_SOURCES,
          `question '${q.name}' declares both staticOptions and optionsFrom; exactly one option source is allowed`
        )
      );
    }

    // Unanswered declared ids become NULL_VALUE so `x == null` remains meaningful.
    const scope = buildScope(declared, answers);

    if (q.condition !== undefined) {
      const r = port.evaluate(q.condition, scope);
      if (r.isErr()) {
        return err(r.error);
      }
      if (r.value !== true) {
        pos++;
        continue;
      }
    }

    // Pre-filled answers are trusted and never prompted.
    if (q.name in answers) {
      pos++;
      continue;
    }

    if (answers.nonInteractive === "true") {
      if (typeof q.default === "string") {
        answers[q.name] = q.default;
        pos++;
        continue;
      }
      if (q.optional === true) {
        pos++;
        continue;
      }
      return err(missingNonInteractiveAnswer(q.name));
    }

    // Resolve static or provider-backed options.
    let options: OptionsSource | undefined;
    let resolvedOptions: (() => Promise<ResolvedOptions>) | undefined;
    let resolvedProviderId: string | undefined;
    if (q.staticOptions !== undefined) {
      const filtered: OptionItem[] = [];
      for (const opt of q.staticOptions) {
        if (opt.condition !== undefined) {
          const r = port.evaluate(opt.condition, scope);
          if (r.isErr()) {
            return err(r.error);
          }
          if (r.value !== true) {
            continue;
          }
        }
        filtered.push(opt);
      }
      options = filtered;
    } else if (q.optionsFrom !== undefined) {
      // Dynamic option lists are provider-backed, not condition predicates.
      const provider = port.optionsProvider(q.optionsFrom);
      if (provider === undefined) {
        return err(
          systemError(
            INPUT_UNKNOWN_PROVIDER,
            `optionsFrom '${q.optionsFrom}' on question '${q.name}' is not a registered provider`
          )
        );
      }
      const paramsResult = resolveParams(q.optionsFromParams, scope, resolvedProviders, port);
      if (paramsResult.isErr()) {
        return err(paramsResult.error);
      }
      const params = paramsResult.value;
      const cacheKey = `${q.optionsFrom}|${stableStringify(params)}`;
      const providerId = q.optionsFrom;
      resolvedProviderId = providerId;
      resolvedOptions = () => {
        let resolved = providerCache.get(cacheKey);
        if (resolved === undefined) {
          resolved = fetchProviderOptions(provider, params, providerId, q.name);
          providerCache.set(cacheKey, resolved);
        }
        return resolved;
      };
      options = resolvedOptions;
    }

    if (Array.isArray(options) && q.skipSingleOption === true && options.length === 1) {
      answers[q.name] = options[0].id;
      pos++;
      continue;
    }

    // multiSelect must preserve its typed string[] answer.
    if (q.type === "multiSelect") {
      const picked = await port.ui.askMulti(q, options, baseStep + history.length + 1);
      if (picked.isErr()) {
        return err(picked.error);
      }
      if (picked.value.kind === "back") {
        const restore = history.pop();
        if (restore === undefined) {
          if (walkOptions.backable === true) {
            return ok({ kind: "back", history: [], promptCount: 0 });
          }
          return err(walkCancelled());
        }
        answers = restore.answers;
        pos = restore.pos;
        continue;
      }
      if (resolvedOptions !== undefined && resolvedProviderId !== undefined) {
        const mergeResult = await mergeResolvedProviderDerived(
          answers,
          resolvedProviders,
          resolvedProviderId,
          resolvedOptions
        );
        if (mergeResult.isErr()) {
          return err(mergeResult.error);
        }
      }
      // A surface auto-skip (skipSingleOption) records the answer but is not a back-stop.
      if (picked.value.kind === "value") {
        history.push({ pos, answers: { ...answers } });
      }
      answers[q.name] = picked.value.value;
      pos++;
      continue;
    }

    const validationResult = resolveQuestionValidation(q, answers, port);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }
    const validation = validationResult.value;
    const inputBoxValidationResult = resolveValidation(
      q.inputBoxConfig?.validation,
      answers,
      port,
      q.name
    );
    if (inputBoxValidationResult.isErr()) {
      return err(inputBoxValidationResult.error);
    }
    const inputBoxValidation = inputBoxValidationResult.value;
    const asked = await port.ui.ask(
      q,
      options,
      baseStep + history.length + 1,
      validation,
      inputBoxValidation
    );
    if (asked.isErr()) {
      return err(asked.error);
    }
    if (asked.value.kind === "back") {
      const restore = history.pop();
      if (restore === undefined) {
        if (walkOptions.backable === true) {
          return ok({ kind: "back", history: [], promptCount: 0 });
        }
        return err(walkCancelled());
      }
      answers = restore.answers;
      pos = restore.pos;
      continue;
    }
    const value = asked.value.value;

    if (resolvedOptions !== undefined && resolvedProviderId !== undefined) {
      const mergeResult = await mergeResolvedProviderDerived(
        answers,
        resolvedProviders,
        resolvedProviderId,
        resolvedOptions
      );
      if (mergeResult.isErr()) {
        return err(mergeResult.error);
      }
    }

    // A surface auto-skip (skipSingleOption) records the answer but is not a back-stop,
    // so `back` at a later prompt crosses over it (matching a static skipSingleOption skip).
    if (asked.value.kind === "value") {
      history.push({ pos, answers: { ...answers } });
    }
    answers[q.name] = value;
    pos++;
  }

  return ok({ kind: "done", answers, history, promptCount: history.length });
}

/**
 * Walk one template's questions into the resolved answer object — the stable
 * non-resumable entry over {@link walkInputs} (no step offset, no resume,
 * `backable` off), so a `back` past the first prompt cancels (INPUT-18) and the
 * result is the plain answer object. Preserves the pre-cross-phase contract.
 */
export async function collectInputs(
  questions: QuestionSpec[],
  optionsSchema: OptionsSchema,
  entryParams: Answers,
  port: CollectInputsPort
): Promise<Result<Answers, FxError>> {
  const outcome = await walkInputs(questions, optionsSchema, entryParams, port);
  if (outcome.isErr()) {
    return err(outcome.error);
  }
  /* istanbul ignore next -- backable is off here, so the walk cancels before returning a top-level back */
  if (outcome.value.kind === "back") {
    return err(walkCancelled());
  }
  return ok(outcome.value.answers);
}

function resolveQuestionValidation(
  question: QuestionSpec,
  answers: Answers,
  port: CollectInputsPort
): Result<PromptValidation | undefined, FxError> {
  return resolveValidation(question.validation, answers, port, question.name);
}

function resolveValidation(
  validation: string | ValidationSpec | undefined,
  answers: Answers,
  port: CollectInputsPort,
  questionName: string
): Result<PromptValidation | undefined, FxError> {
  if (validation === undefined) {
    return ok(undefined);
  }
  const validatorName = typeof validation === "string" ? validation : validation.use;
  const validator = port.validator(validatorName);
  if (validator === undefined) {
    return err(
      systemError(
        INPUT_UNKNOWN_VALIDATOR,
        `validation '${validatorName}' on question '${questionName}' is not a registered validator`
      )
    );
  }
  return ok((value) => validator(value, answers));
}

/** Build evaluator scope with declared-but-unanswered ids seeded as `NULL_VALUE`. */
function buildScope(declared: string[], answers: Answers): Scope {
  const scope: Scope = {};
  for (const id of declared) {
    scope[id] = NULL_VALUE;
  }
  for (const [key, value] of Object.entries(answers)) {
    // INV-7: a multiSelect answer (string[]) is off the scalar grammar — it
    // reaches render vars and step `with`, but never the expression scope, so an
    // unanswered scalar discriminator stays NULL_VALUE rather than an array.
    if (Array.isArray(value)) {
      continue;
    }
    scope[key] = value;
  }
  return scope;
}

/** Resolve `optionsFromParams` via the shared evaluator. */
function resolveParams(
  optionsFromParams: Record<string, ConditionNode> | undefined,
  scope: Scope,
  resolvedProviders: Set<string>,
  port: CollectInputsPort
): Result<Record<string, string>, FxError> {
  const params: Record<string, string> = {};
  if (optionsFromParams === undefined) {
    return ok(params);
  }
  for (const [key, node] of Object.entries(optionsFromParams)) {
    if ("from" in node && node.from.startsWith("derived.")) {
      const producer = node.from.split(".")[1];
      if (!resolvedProviders.has(producer)) {
        return err(
          systemError(
            INPUT_FORWARD_DERIVED_REFERENCE,
            `param '${key}' references '${node.from}' before provider '${producer}' resolves`
          )
        );
      }
    }
    const r = port.evaluate(node, scope);
    if (r.isErr()) {
      return err(r.error);
    }
    params[key] = typeof r.value === "string" ? r.value : String(r.value);
  }
  return ok(params);
}

/** A stable provider-cache key: params serialized with sorted keys (INV-5 normalize). */
function stableStringify(params: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(params).sort()) {
    sorted[key] = params[key];
  }
  return JSON.stringify(sorted);
}

async function fetchProviderOptions(
  provider: OptionsProvider,
  params: Record<string, string>,
  providerId: string,
  questionName: string
): Promise<ResolvedOptions> {
  try {
    return await provider.fetch(params);
  } catch (error) {
    if (error instanceof UserError || error instanceof SystemError) {
      throw error;
    }
    throw systemError(
      INPUT_PROVIDER_FAILED,
      `optionsFrom '${providerId}' on question '${questionName}' failed: ${errorMessage(error)}`
    );
  }
}

function mergeProviderDerived(
  answers: Answers,
  providerId: string,
  resolved: ResolvedOptions
): void {
  if (resolved.derived === undefined) {
    return;
  }
  for (const [key, value] of Object.entries(resolved.derived)) {
    answers[`derived.${providerId}.${key}`] = value;
  }
}

async function mergeResolvedProviderDerived(
  answers: Answers,
  resolvedProviders: Set<string>,
  providerId: string,
  resolvedOptions: () => Promise<ResolvedOptions>
): Promise<Result<void, FxError>> {
  try {
    const resolved = await resolvedOptions();
    mergeProviderDerived(answers, providerId, resolved);
    resolvedProviders.add(providerId);
    return ok(undefined);
  } catch (error) {
    if (error instanceof UserError || error instanceof SystemError) {
      return err(error);
    }
    return err(systemError(INPUT_PROVIDER_FAILED, errorMessage(error)));
  }
}

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
