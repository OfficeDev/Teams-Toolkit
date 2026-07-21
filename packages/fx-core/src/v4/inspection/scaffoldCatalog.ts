// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { PresentationQuestion } from "../buildTarget/parseSelector";
import { SelectorRoute, validateSelectorRouteShape } from "../buildTarget/resolveBuildTarget";
import { QuestionSpec } from "../collectInputs/collectInputs";
import {
  openSelector,
  openSelectorPresentation,
  SelectorKind,
} from "../distribution/createSelector";
import { openDeclarativePackageMetadata } from "../distribution/declarativePackage";

/** Metadata input boundary shared by authored and staged catalog consumers. */
export interface ScaffoldMetadataSource {
  load(): Result<Buffer, FxError>;
}

/** One declarative template and every selector route that targets it. */
export interface ScaffoldCatalogTemplate {
  templateId: string;
  routes: SelectorRoute[];
  descriptor: unknown;
  questions: QuestionSpec[];
  pipeline: unknown;
}

/** Deterministic projection of one v4 selector and its routed package metadata. */
export interface ScaffoldCatalog {
  kind: SelectorKind;
  questions: PresentationQuestion[];
  templates: ScaffoldCatalogTemplate[];
  externalRoutes: SelectorRoute[];
}

function compareTemplateIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Inspect one metadata source without executing any declared scaffold behavior. */
export function inspectScaffoldCatalog(
  source: ScaffoldMetadataSource,
  kind: SelectorKind
): Result<ScaffoldCatalog, FxError> {
  const loaded = source.load();
  if (loaded.isErr()) {
    return err(loaded.error);
  }

  const selector = openSelector(loaded.value, kind);
  if (selector.isErr()) {
    return err(selector.error);
  }
  const presentation = openSelectorPresentation(loaded.value, kind);
  if (presentation.isErr()) {
    return err(presentation.error);
  }

  const routesByTemplate = new Map<string, SelectorRoute[]>();
  const externalRoutes: SelectorRoute[] = [];
  for (const route of selector.value.routes) {
    const routeShape = validateSelectorRouteShape(route);
    if (routeShape.isErr()) {
      return err(routeShape.error);
    }
    if (route.engine !== "v4") {
      externalRoutes.push(route);
      continue;
    }
    if (route.templateId !== undefined) {
      const routes = routesByTemplate.get(route.templateId) ?? [];
      routes.push(route);
      routesByTemplate.set(route.templateId, routes);
    }
  }

  const templates: ScaffoldCatalogTemplate[] = [];
  const templateIds = [...routesByTemplate.keys()].sort(compareTemplateIds);
  for (const templateId of templateIds) {
    const metadata = openDeclarativePackageMetadata(loaded.value, { kind, templateId });
    if (metadata.isErr()) {
      return err(metadata.error);
    }
    templates.push({
      templateId,
      routes: routesByTemplate.get(templateId) ?? [],
      descriptor: metadata.value.descriptor,
      questions: metadata.value.questions,
      pipeline: metadata.value.pipeline,
    });
  }

  return ok({
    kind,
    questions: presentation.value.questions,
    templates,
    externalRoutes,
  });
}
