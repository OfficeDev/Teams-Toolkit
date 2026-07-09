// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import {
  EvalValue,
  ExpressionRuntimePort,
  NULL_VALUE,
  Scope,
  evaluateExpression,
} from "../expression/evaluateExpression";
import { Answers, CallerFloor, RenderVars } from "../model/dataModel";

/** v4 render-context build: answers to render variables. See spec and ADR-0016. */

const SOURCE = "Scaffold";

/** One closed-DSL `replaceMap` entry. */
export type ReplaceMapEntry =
  | { var: string; const: string }
  | { var: string; from: string }
  | { var: string; when: string; value: string }
  | { var: string; expr: string };

/** `SystemError` name for a `replaceMap[].var` that shadows the caller floor. */
export const RCTX_SHADOWS_CALLER_FLOOR = "RenderVarShadowsCallerFloor";

/** Build one template's render variable map. */
export function buildRenderContext(
  replaceMap: ReplaceMapEntry[],
  answers: Answers,
  callerFloor: CallerFloor,
  port: ExpressionRuntimePort,
  declaredKeys: string[] = []
): Result<RenderVars, FxError> {
  // Seed declared keys with NULL_VALUE; omit string[] answers from the scalar evaluator scope.
  const scope: Scope = {};
  for (const key of declaredKeys) {
    scope[key] = NULL_VALUE;
  }
  Object.assign(scope, callerFloor);
  for (const [key, value] of Object.entries(answers)) {
    if (!Array.isArray(value)) {
      scope[key] = value;
    }
  }
  // Seed = raw answers plus derived values; the caller floor is overlaid downstream.
  const renderVars: RenderVars = { ...answers };

  for (const entry of replaceMap) {
    if (entry.var in callerFloor) {
      return err(
        new SystemError({
          source: SOURCE,
          name: RCTX_SHADOWS_CALLER_FLOOR,
          message: `replaceMap var '${entry.var}' shadows the caller-injected identifier '${entry.var}'; derive a new PascalCase var instead.`,
        })
      );
    }

    if ("const" in entry) {
      renderVars[entry.var] = entry.const;
    } else if ("from" in entry) {
      // A `{from}` of a multiSelect answer preserves the typed string[].
      const direct = answers[entry.from];
      if (Array.isArray(direct)) {
        renderVars[entry.var] = direct;
      } else {
        const r = evaluateExpression({ from: entry.from }, scope, port);
        if (r.isErr()) {
          return err(r.error);
        }
        renderVars[entry.var] = asString(r.value);
      }
    } else if ("when" in entry) {
      const r = evaluateExpression({ expr: entry.when }, scope, port);
      if (r.isErr()) {
        return err(r.error);
      }
      if (r.value === true) {
        renderVars[entry.var] = entry.value;
      }
    } else {
      const r = evaluateExpression({ expr: entry.expr }, scope, port);
      if (r.isErr()) {
        return err(r.error);
      }
      renderVars[entry.var] = asString(r.value);
    }
  }

  return ok(renderVars);
}

/** A value-context result is a string; a stray boolean renders as its literal. */
function asString(v: EvalValue): string {
  return typeof v === "string" ? v : String(v);
}
