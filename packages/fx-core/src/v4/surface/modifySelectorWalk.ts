// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError, UserInteraction } from "@microsoft/teamsfx-api";
import { Result, err } from "neverthrow";
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
  openModifySelector,
  openModifySelectorPresentation,
  openSelectorFromJsonBytes,
  openSelectorPresentationFromJsonBytes,
} from "../distribution/createSelector";
import { openDeclarativePackage } from "../distribution/declarativePackage";
import { ExpressionRuntimePort, Scope, evaluateExpression } from "../expression/evaluateExpression";
import { readBooleanFeatureFlag } from "../../common/featureFlags";

const SOURCE = "Scaffold";

export interface ModifySelectorDeps {
  flagReader?: (name: string) => boolean;
  selectorBytesKind?: "zip" | "json";
  v4Registry?: (templateId: string) => boolean;
  prefilled?: Record<string, string>;
  interactive?: boolean;
}

function envFlagReader(name: string): boolean {
  return readBooleanFeatureFlag(name);
}

function toFxError(e: unknown): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({ source: SOURCE, name: "ModifySelectorWalkFailed", message });
}

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
    presentation.questions.map((question) => [question.name, question])
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
      return openDeclarativePackage(floorBytes, { kind: "modify", templateId }).isOk();
    },
    v3Registry(): boolean {
      return false;
    },
    v3CoreMethodRegistry(coreMethod: string): boolean {
      return coreMethod === "addPlugin";
    },
  };
}

export async function runModifySelector(
  floorBytes: Buffer,
  ui: UserInteraction,
  surface: string,
  deps: ModifySelectorDeps = {}
): Promise<Result<BuildTarget, FxError>> {
  const flagReader = deps.flagReader ?? envFlagReader;
  const selectorBytesKind = deps.selectorBytesKind ?? "zip";
  const prefilled = deps.prefilled ?? {};
  const interactive = deps.interactive ?? true;
  const spec =
    selectorBytesKind === "json"
      ? openSelectorFromJsonBytes(floorBytes, "modify")
      : openModifySelector(floorBytes);
  if (spec.isErr()) {
    return err(spec.error);
  }
  const presentation =
    selectorBytesKind === "json"
      ? openSelectorPresentationFromJsonBytes(floorBytes, "modify")
      : openModifySelectorPresentation(floorBytes);
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
