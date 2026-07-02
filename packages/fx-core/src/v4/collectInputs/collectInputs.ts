// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { EvalValue, ExpressionNode, NULL_VALUE, Scope } from "../expression/evaluateExpression";
import { Answers } from "../model/dataModel";

/** v4 input collection: native questions to answers. See collect-inputs spec and ADR-0016. */

const SOURCE = "Scaffold";

/** v4-local language labels; importing the v3 label map would break isolation. */
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  csharp: "C#",
  python: "Python",
};

/** An authored visibility / value guard — the same closed form the evaluator parses. */
export type ConditionNode = ExpressionNode;

/** Identity-only option; computed values flow through provider `derived.*`. */
export interface OptionItem {
  id: string;
  label?: string;
  description?: string;
  detail?: string;
  groupName?: string;
  condition?: ConditionNode;
  keyPrefix?: string;
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

/** One prompt's outcome: a chosen value or the host's `back` request. */
export type Asked<T> = { kind: "value"; value: T } | { kind: "back" };

/** Surface-neutral prompt driver. */
export interface PromptUI {
  /** Render one scalar question. */
  ask(
    question: QuestionSpec,
    options: OptionItem[] | undefined,
    step?: number
  ): Promise<Result<Asked<string>, FxError>>;
  /** Render one multi-pick question without collapsing selected ids to a scalar. */
  askMulti(
    question: QuestionSpec,
    options: OptionItem[] | undefined,
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

export interface CollectInputsOptions {
  appendLanguage?: boolean;
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

/** Walk one template's questions into the resolved answer object. */
export async function collectInputs(
  questions: QuestionSpec[],
  optionsSchema: OptionsSchema,
  entryParams: Answers,
  languages: string[],
  port: CollectInputsPort,
  options: CollectInputsOptions = {}
): Promise<Result<Answers, FxError>> {
  // Pre-filled entry params must be visible to question conditions.
  let answers: Answers = { ...entryParams };
  const declared = Object.keys(optionsSchema.properties ?? {});
  // Cache providers by normalized params for a single run.
  const providerCache = new Map<string, ResolvedOptions>();
  // Providers resolve in declaration order; forward `derived.*` refs are rejected.
  const resolvedProviders = new Set<string>();

  // Back history snapshots only prompted steps; skipped and pre-filled steps are crossed over.
  const history: { pos: number; answers: Answers }[] = [];

  // Authored questions are asked first; the language axis is appended after Q2 by default.
  const appendLanguage = options.appendLanguage ?? true;
  let pos = 0;
  while (pos < questions.length || (appendLanguage && pos === questions.length)) {
    if (pos === questions.length) {
      // A non-singleton language list prompts; `["common"]` has no axis.
      if (languages.length > 1) {
        if (typeof answers.language === "string") {
          pos++;
          continue;
        }
        const langQuestion: QuestionSpec = {
          name: "language",
          type: "singleSelect",
          title: "Programming Language",
        };
        const asked = await port.ui.ask(
          langQuestion,
          languages.map((l) => ({ id: l, label: LANGUAGE_LABELS[l] ?? l })),
          history.length + 1
        );
        if (asked.isErr()) {
          return err(asked.error);
        }
        if (asked.value.kind === "back") {
          const restore = history.pop();
          if (restore === undefined) {
            return err(walkCancelled());
          }
          answers = restore.answers;
          pos = restore.pos;
          continue;
        }
        history.push({ pos: 0, answers: { ...answers } });
        answers.language = asked.value.value;
      } else if (languages.length === 1 && languages[0] !== "common") {
        answers.language = languages[0];
      }
      pos++;
      continue;
    }

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

    // Resolve static or provider-backed options.
    let options: OptionItem[] | undefined;
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
      let resolved = providerCache.get(cacheKey);
      if (resolved === undefined) {
        try {
          resolved = await provider.fetch(params);
        } catch (error) {
          if (error instanceof UserError || error instanceof SystemError) {
            return err(error);
          }
          return err(
            systemError(
              INPUT_PROVIDER_FAILED,
              `optionsFrom '${q.optionsFrom}' on question '${q.name}' failed: ${errorMessage(error)}`
            )
          );
        }
        providerCache.set(cacheKey, resolved);
      }
      options = resolved.options;
      // Provider-derived values live under the reserved derived.<provider-id>.<key> namespace.
      if (resolved.derived !== undefined) {
        for (const [key, value] of Object.entries(resolved.derived)) {
          answers[`derived.${q.optionsFrom}.${key}`] = value;
        }
      }
      resolvedProviders.add(q.optionsFrom);
    }

    if (options !== undefined && q.skipSingleOption === true && options.length === 1) {
      answers[q.name] = options[0].id;
      pos++;
      continue;
    }

    // multiSelect must preserve its typed string[] answer.
    if (q.type === "multiSelect") {
      const picked = await port.ui.askMulti(q, options, history.length + 1);
      if (picked.isErr()) {
        return err(picked.error);
      }
      if (picked.value.kind === "back") {
        const restore = history.pop();
        if (restore === undefined) {
          return err(walkCancelled());
        }
        answers = restore.answers;
        pos = restore.pos;
        continue;
      }
      history.push({ pos, answers: { ...answers } });
      answers[q.name] = picked.value.value;
      pos++;
      continue;
    }

    const asked = await port.ui.ask(q, options, history.length + 1);
    if (asked.isErr()) {
      return err(asked.error);
    }
    if (asked.value.kind === "back") {
      const restore = history.pop();
      if (restore === undefined) {
        return err(walkCancelled());
      }
      answers = restore.answers;
      pos = restore.pos;
      continue;
    }
    const value = asked.value.value;

    // Validator failures are user-fixable and name the question.
    if (q.validation !== undefined) {
      const validatorName = typeof q.validation === "string" ? q.validation : q.validation.use;
      const validator = port.validator(validatorName);
      if (validator === undefined) {
        return err(
          systemError(
            INPUT_UNKNOWN_VALIDATOR,
            `validation '${validatorName}' on question '${q.name}' is not a registered validator`
          )
        );
      }
      const message = await validator(value, answers);
      if (message !== undefined) {
        return err(
          new UserError({
            source: SOURCE,
            name: INPUT_VALIDATION_FAILED,
            message: `'${q.name}': ${message}`,
          })
        );
      }
    }

    history.push({ pos, answers: { ...answers } });
    answers[q.name] = value;
    pos++;
  }

  return ok(answers);
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

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
