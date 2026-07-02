// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import {
  ExpressionNode,
  ExpressionRuntimePort,
  NULL_VALUE,
  Scope,
  evaluateExpression,
} from "../expression/evaluateExpression";

/** v4 selector resolution. See resolve-build-target spec and ADR-0014. */

const SOURCE = "Scaffold";

/** The four worlds dispatch can hand off to. */
export type DispatchEngine = "v4" | "v3" | "v3-core-method" | "surface-action";

/** One parsed `selector.json` route. */
export interface SelectorRoute {
  when: string;
  engine: DispatchEngine;
  templateId?: string;
  v3Adapter?: string;
  coreMethod?: string;
  action?: string;
  surfaces?: string[];
}

/** Minimal Q1 routing question shape; presentation belongs to the prompt face. */
export interface RouteQuestion {
  name: string;
  condition?: ExpressionNode;
}

/** The parsed per-kind `selector.json`. */
export interface SelectorSpec {
  questions: RouteQuestion[];
  routes: SelectorRoute[];
}

/** Build a v4 membership test from the selector's own v4 routes. */
export function v4RouteRegistryFromSelector(spec: SelectorSpec): (templateId: string) => boolean {
  const templateIds = new Set<string>();
  for (const route of spec.routes) {
    if (route.engine === "v4" && route.templateId !== undefined) {
      templateIds.add(route.templateId);
    }
  }
  return (templateId: string) => templateIds.has(templateId);
}

/** One interactive Q1 prompt outcome. */
export type PromptResult = { kind: "value"; value: string } | { kind: "back" };

/** Narrow selector-resolution port; package opening and language selection stay downstream. */
export interface RouteResolverPort {
  /** Interactive Q1 prompt for dimensions not supplied by prefill. */
  prompt(question: RouteQuestion, step: number): Promise<PromptResult>;
  /** Evaluate `featureFlag('…')` inside a route predicate / question condition. */
  featureFlag(name: string): boolean;
  /** Membership test for the v4 world. */
  v4Registry(templateId: string): boolean;
  /** Membership test for the frozen v3 generator allow-list. */
  v3Registry(templateId: string): boolean;
  /** Membership test for the frozen v3 core-method allow-list. */
  v3CoreMethodRegistry(coreMethod: string): boolean;
}

/** The resolved dispatch outcome. */
export interface BuildTarget {
  /** The v4/v3 template id, core method, or surface action id. */
  templateId: string;
  /** Which world dispatch hands off to. */
  engine: DispatchEngine;
  /** The Q1 dimension picks that produced this target. */
  answers?: Record<string, string>;
}

/** `UserError` name: a resolved/supplied `templateId` belongs to no world. */
export const BUILD_TARGET_UNKNOWN_TEMPLATE = "BuildTargetUnknownTemplate";
/** `UserError` name: a route carries the wrong engine-specific key set. */
export const BUILD_TARGET_MALFORMED_ROUTE = "BuildTargetMalformedRoute";
/** `UserError` name: a `v4` route's `templateId` has no descriptor. */
export const BUILD_TARGET_DANGLING_V4_ROUTE = "BuildTargetDanglingV4Route";
/** `UserError` name: no route predicate matched the resolved answers. */
export const BUILD_TARGET_NO_MATCHING_ROUTE = "BuildTargetNoMatchingRoute";
/** `UserError` name: a non-interactive walk lacks a required dimension. */
export const BUILD_TARGET_MISSING_DIMENSION = "BuildTargetMissingDimension";
/** `UserError` name: the user backed out of the first Q1 prompt. */
export const BUILD_TARGET_WALK_CANCELLED = "BuildTargetWalkCancelled";

function userError(name: string, message: string): UserError {
  return new UserError({ source: SOURCE, name, message });
}

/** Compose the evaluator's port from this operation's narrow port. */
function exprPort(port: RouteResolverPort): ExpressionRuntimePort {
  return {
    functions: () => undefined,
    flags: (name) => port.featureFlag(name),
  };
}

/** Seed declared but unanswered Q1 names with `NULL_VALUE`. */
function buildScope(declared: string[], answers: Record<string, string>): Scope {
  const scope: Scope = {};
  for (const name of declared) {
    scope[name] = NULL_VALUE;
  }
  for (const [k, v] of Object.entries(answers)) {
    scope[k] = v;
  }
  return scope;
}

/** Return why a route's engine-specific key set is malformed, if it is. */
function malformedRouteReason(r: SelectorRoute): string | undefined {
  const has = {
    templateId: r.templateId !== undefined,
    v3Adapter: r.v3Adapter !== undefined,
    coreMethod: r.coreMethod !== undefined,
    action: r.action !== undefined,
  };
  switch (r.engine) {
    case "v4":
      if (!has.templateId) {
        return "engine 'v4' requires 'templateId'";
      }
      if (has.v3Adapter || has.coreMethod || has.action) {
        return "engine 'v4' must not carry 'v3Adapter' / 'coreMethod' / 'action'";
      }
      return undefined;
    case "v3":
      if (!has.v3Adapter) {
        return "engine 'v3' requires 'v3Adapter'";
      }
      if (has.coreMethod || has.action) {
        return "engine 'v3' must not carry 'coreMethod' / 'action'";
      }
      return undefined;
    case "v3-core-method":
      if (!has.coreMethod) {
        return "engine 'v3-core-method' requires 'coreMethod'";
      }
      if (has.templateId || has.v3Adapter || has.action) {
        return "engine 'v3-core-method' must not carry 'templateId' / 'v3Adapter' / 'action'";
      }
      return undefined;
    case "surface-action":
      if (!has.action) {
        return "engine 'surface-action' requires 'action'";
      }
      if (has.templateId || has.v3Adapter || has.coreMethod) {
        return "engine 'surface-action' must not carry 'templateId' / 'v3Adapter' / 'coreMethod'";
      }
      return undefined;
  }
}

/** Validate the routing table before matching any route. */
function validateRoutes(routes: SelectorRoute[], port: RouteResolverPort): Result<void, FxError> {
  for (const r of routes) {
    const reason = malformedRouteReason(r);
    if (reason !== undefined) {
      return err(userError(BUILD_TARGET_MALFORMED_ROUTE, `route '${r.when}': ${reason}`));
    }
    if (r.engine === "v4" && r.templateId !== undefined && !port.v4Registry(r.templateId)) {
      return err(
        userError(
          BUILD_TARGET_DANGLING_V4_ROUTE,
          `route '${r.when}' targets v4 templateId '${r.templateId}', but no descriptor for it is present`
        )
      );
    }
  }
  return ok(undefined);
}

/** Walk Q1 with prefill support and back history for prompted dimensions. */
async function walkWithPrefill(
  selector: SelectorSpec,
  prefilled: Record<string, string>,
  interactive: boolean,
  port: RouteResolverPort
): Promise<Result<Record<string, string>, FxError>> {
  const declared = selector.questions.map((q) => q.name);
  let answers: Record<string, string> = {};
  const history: { index: number; snapshot: Record<string, string> }[] = [];
  let index = 0;
  while (index < selector.questions.length) {
    const q = selector.questions[index];
    if (q.condition !== undefined) {
      const gate = evaluateExpression(q.condition, buildScope(declared, answers), exprPort(port));
      if (gate.isErr()) {
        return err(gate.error);
      }
      if (gate.value !== true) {
        index++;
        continue;
      }
    }
    if (prefilled[q.name] !== undefined) {
      answers[q.name] = prefilled[q.name];
      index++;
      continue;
    }
    if (!interactive) {
      return err(
        userError(
          BUILD_TARGET_MISSING_DIMENSION,
          `required dimension '${q.name}' was not provided (non-interactive)`
        )
      );
    }
    const outcome = await port.prompt(q, history.length + 1);
    if (outcome.kind === "back") {
      const restore = history.pop();
      if (restore === undefined) {
        return err(userError(BUILD_TARGET_WALK_CANCELLED, "the create selector was cancelled"));
      }
      answers = restore.snapshot;
      index = restore.index;
      continue;
    }
    history.push({ index, snapshot: { ...answers } });
    answers[q.name] = outcome.value;
    index++;
  }
  return ok(answers);
}

/** Match the first route whose `when` predicate is true against the collected answers. */
function matchRoute(
  selector: SelectorSpec,
  answers: Record<string, string>,
  port: RouteResolverPort
): Result<SelectorRoute, FxError> {
  const scope = buildScope(
    selector.questions.map((q) => q.name),
    answers
  );
  for (const r of selector.routes) {
    const hit = evaluateExpression({ expr: r.when }, scope, exprPort(port));
    if (hit.isErr()) {
      return err(hit.error);
    }
    if (hit.value === true) {
      return ok(r);
    }
  }
  return err(
    userError(
      BUILD_TARGET_NO_MATCHING_ROUTE,
      "no selector route matched the resolved answers (no silent fallback)"
    )
  );
}

/** Dispatch a matched route to its engine-specific id. */
function dispatchRoute(
  r: SelectorRoute,
  port: RouteResolverPort
): Result<{ templateId: string; engine: DispatchEngine }, FxError> {
  switch (r.engine) {
    case "v4":
    case "v3":
      if (r.templateId === undefined) {
        return err(
          userError(BUILD_TARGET_MALFORMED_ROUTE, `route '${r.when}': missing 'templateId'`)
        );
      }
      return ok({ templateId: r.templateId, engine: r.engine });
    case "v3-core-method":
      if (r.coreMethod === undefined) {
        return err(
          userError(BUILD_TARGET_MALFORMED_ROUTE, `route '${r.when}': missing 'coreMethod'`)
        );
      }
      if (!port.v3CoreMethodRegistry(r.coreMethod)) {
        return err(
          userError(
            BUILD_TARGET_UNKNOWN_TEMPLATE,
            `core method '${r.coreMethod}' is not in the v3 core-method allow-list`
          )
        );
      }
      return ok({ templateId: r.coreMethod, engine: r.engine });
    case "surface-action":
      if (r.action === undefined) {
        return err(userError(BUILD_TARGET_MALFORMED_ROUTE, `route '${r.when}': missing 'action'`));
      }
      return ok({ templateId: r.action, engine: r.engine });
  }
}

/** Resolve a create/modify selector walk into a dispatched `BuildTarget`. */
export async function resolveBuildTarget(
  selector: SelectorSpec,
  prefilled: Record<string, string>,
  interactive: boolean,
  port: RouteResolverPort
): Promise<Result<BuildTarget, FxError>> {
  // Validate the whole routing table before any route match.
  const routesOk = validateRoutes(selector.routes, port);
  if (routesOk.isErr()) {
    return err(routesOk.error);
  }

  // One prefill-aware walk covers interactive and non-interactive resolution.
  const walked = await walkWithPrefill(selector, prefilled, interactive, port);
  if (walked.isErr()) {
    return err(walked.error);
  }
  const answers = walked.value;

  const matched = matchRoute(selector, answers, port);
  if (matched.isErr()) {
    return err(matched.error);
  }
  const dispatched = dispatchRoute(matched.value, port);
  if (dispatched.isErr()) {
    return err(dispatched.error);
  }

  return ok({ ...dispatched.value, answers });
}
