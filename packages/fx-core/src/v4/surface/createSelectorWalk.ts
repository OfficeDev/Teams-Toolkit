// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError, UserInteraction } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import {
  PresentationOption,
  PresentationQuestion,
  SelectorPresentation,
} from "../buildTarget/parseSelector";
import {
  BuildTarget,
  PromptResult,
  RouteQuestion,
  RouteResolverPort,
  resolveBuildTarget,
  v4RouteRegistryFromSelector,
} from "../buildTarget/resolveBuildTarget";
import {
  openCreateSelector,
  openCreateSelectorPresentation,
  openSelectorFromJsonBytes,
  openSelectorPresentationFromJsonBytes,
} from "../distribution/createSelector";
import { openDeclarativePackage } from "../distribution/declarativePackage";
import { ExpressionRuntimePort, Scope, evaluateExpression } from "../expression/evaluateExpression";
import { readBooleanFeatureFlag } from "../../common/featureFlags";

/** Live Q1 create-selector prompt face. See walk-create-selector spec. */

const SOURCE = "Scaffold";

/** Create-selector options; all are defaulted. */
export interface CreateSelectorDeps {
  /** The feature-flag reader (default: env-backed); v4 imports no `featureFlagManager`. */
  flagReader?: (name: string) => boolean;
  /** Selector bytes shape. Defaults to the full package zip for current callers. */
  selectorBytesKind?: "zip" | "json";
  /** Membership test supplied by a staged artifact snapshot or metadata index. */
  v4Registry?: (templateId: string) => boolean;
  /** Q1 answers known up front. */
  prefilled?: Record<string, string>;
  /** Whether unfilled required dimensions may be prompted. */
  interactive?: boolean;
}

/** The default env-backed feature-flag reader (a flag is on iff its env var is exactly `"true"`). */
function envFlagReader(name: string): boolean {
  return readBooleanFeatureFlag(name);
}

/** Convert a thrown prompt failure back to an `FxError` for the `Result` boundary. */
function toFxError(e: unknown): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({ source: SOURCE, name: "CreateSelectorWalkFailed", message });
}

/** Build the live interactive route resolver over the floor and host UI. */
function buildPort(
  floorBytes: Buffer,
  presentation: SelectorPresentation,
  ui: UserInteraction,
  surface: string,
  flagReader: (name: string) => boolean,
  v4Registry: ((templateId: string) => boolean) | undefined
): RouteResolverPort {
  const exprPort: ExpressionRuntimePort = { functions: () => undefined, flags: flagReader };
  const byName = new Map<string, PresentationQuestion>(
    presentation.questions.map((q) => [q.name, q])
  );

  async function prompt(question: RouteQuestion, step: number): Promise<PromptResult> {
    const pq = byName.get(question.name);
    if (pq === undefined) {
      throw new SystemError({
        source: SOURCE,
        name: "MissingSelectorPresentation",
        message: `The selector has no presentation for question '${question.name}'.`,
      });
    }
    const scope: Scope = { surface };
    const visible: PresentationOption[] = [];
    for (const option of pq.staticOptions) {
      if (option.condition !== undefined) {
        const gate = evaluateExpression(option.condition, scope, exprPort);
        if (gate.isErr()) {
          throw gate.error;
        }
        if (gate.value !== true) {
          continue;
        }
      }
      visible.push(option);
    }
    const selected = await ui.selectOption({
      name: pq.name,
      title: pq.title ?? pq.name,
      placeholder: pq.placeholder,
      step,
      options: visible.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail,
        groupName: option.groupName,
      })),
      returnObject: false,
    });
    if (selected.isErr()) {
      throw selected.error;
    }
    if (selected.value.type === "back") {
      return { kind: "back" };
    }
    const result = selected.value.result;
    if (typeof result === "string") {
      return { kind: "value", value: result };
    }
    return { kind: "value", value: result === undefined ? "" : result.id };
  }

  return {
    prompt,
    featureFlag: flagReader,
    v4Registry(templateId: string): boolean {
      if (v4Registry !== undefined) {
        return v4Registry(templateId);
      }
      return openDeclarativePackage(floorBytes, { kind: "create", templateId }).isOk();
    },
    v3Registry(): boolean {
      return false;
    },
    v3CoreMethodRegistry(): boolean {
      return false;
    },
  };
}

/** Run create Q1 over `ui`, resolving the dispatched `BuildTarget`. */
export async function runCreateSelector(
  floorBytes: Buffer,
  ui: UserInteraction,
  surface: string,
  deps: CreateSelectorDeps = {}
): Promise<Result<BuildTarget, FxError>> {
  const flagReader = deps.flagReader ?? envFlagReader;
  const selectorBytesKind = deps.selectorBytesKind ?? "zip";
  const prefilled = deps.prefilled ?? {};
  const interactive = deps.interactive ?? true;
  const spec =
    selectorBytesKind === "json"
      ? openSelectorFromJsonBytes(floorBytes, "create")
      : openCreateSelector(floorBytes);
  if (spec.isErr()) {
    return err(spec.error);
  }
  const presentation =
    selectorBytesKind === "json"
      ? openSelectorPresentationFromJsonBytes(floorBytes, "create")
      : openCreateSelectorPresentation(floorBytes);
  if (presentation.isErr()) {
    return err(presentation.error);
  }
  const port = buildPort(
    floorBytes,
    presentation.value,
    ui,
    surface,
    flagReader,
    deps.v4Registry ??
      (selectorBytesKind === "json" ? v4RouteRegistryFromSelector(spec.value) : undefined)
  );
  try {
    return await resolveBuildTarget(spec.value, prefilled, interactive, port);
  } catch (e) {
    return err(toFxError(e));
  }
}

/** Resolve a pinned template id without re-walking Q1; unknown routes default to v3. */
export function resolveCreateTargetByTemplateId(
  floorBytes: Buffer,
  templateId: string
): Result<BuildTarget, FxError> {
  const spec = openCreateSelector(floorBytes);
  if (spec.isErr()) {
    return err(spec.error);
  }
  const route = spec.value.routes.find((r) => r.templateId === templateId);
  return ok({ templateId, engine: route?.engine ?? "v3", answers: {} });
}
