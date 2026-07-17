// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, Inputs, UserError, UserInteraction } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { MCPFetchResult, fetchMCPTools } from "../../common/mcpToolFetcher";
import { ODRProvider, type ODRServer } from "../../common/odrProvider";
import { readBooleanFeatureFlag } from "../../common/featureFlags";
import { SearchOpenAPISpecResult, searchOpenAPISpec } from "../../common/kiotaClient";
import {
  CollectInputsPort,
  OptionsProvider,
  OptionsSchema,
  walkInputs,
} from "../collectInputs/collectInputs";
import { openDeclarativePackageMetadata } from "../distribution/declarativePackage";
import { evaluateExpression } from "../expression/evaluateExpression";
import { Answers, DeclarativeLocator } from "../model/dataModel";
import { createDefaultCreateOptionsProviders } from "../providers/createOptionsProviders";
import { parseDeclaredKeys } from "../runtime/packageParse";
import { createExpressionPort } from "../runtime/whitelist";
import { createDefaultCreateInputValidators } from "../validators/createInputValidators";
import { createFloorTail, validateCreateFloorAnswers } from "./createFloorTail";
import { createUiPromptUI } from "./uiPromptUI";

/** Live create-path surface wiring for `collect-inputs`. See collect-create-inputs spec. */

const TEAMS_AGENTS_AND_APPS_TEMPLATE_IDS = new Set([
  "custom-copilot-basic",
  "custom-copilot-rag-azure-ai-search",
  "custom-copilot-rag-custom-api",
  "custom-copilot-rag-customize",
  "default-bot",
  "default-message-extension",
  "non-sso-tab",
  "teams-collaborator-agent",
]);

function showsPythonPreview(templateId: string): boolean {
  return TEAMS_AGENTS_AND_APPS_TEMPLATE_IDS.has(templateId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Descriptor language axis, falling back to `["common"]`. */
function descriptorLanguages(descriptor: unknown): string[] {
  if (isRecord(descriptor) && Array.isArray(descriptor.languages)) {
    const languages = descriptor.languages.filter(
      (language): language is string => typeof language === "string"
    );
    if (languages.length > 0) {
      return languages;
    }
  }
  return ["common"];
}

/** v4-local copy of the CLI-only .NET feature flag name. */
const CLI_DOTNET_FLAG = "TEAMSFX_CLI_DOTNET";

/** The C# language id, surface-gated below. */
const CSHARP_LANGUAGE = "csharp";

/** The default env-backed feature-flag reader (a flag is on iff its env var is exactly `"true"`). */
function envFlagReader(name: string): boolean {
  return readBooleanFeatureFlag(name);
}

/** Gate `csharp` by surface and the .NET flag; other languages pass through. */
export function gateLanguagesBySurface(
  languages: string[],
  surface: string,
  flagReader: (name: string) => boolean
): string[] {
  const allowCsharp = surface !== "vscode" && flagReader(CLI_DOTNET_FLAG);
  return allowCsharp ? languages : languages.filter((language) => language !== CSHARP_LANGUAGE);
}

/** The Q2 options schema: the declared identifier domain (`optionsSchema.properties` ids). */
function declaredOptionsSchema(descriptor: unknown): OptionsSchema {
  const properties: Record<string, unknown> = {};
  for (const key of parseDeclaredKeys(descriptor)) {
    properties[key] = {};
  }
  return { properties };
}

/** Injected provider and feature-flag overrides. */
export interface CreateInputsDeps {
  /** Override `optionsFrom` providers (e.g. a live `mcp.serverTypes`); merged over the defaults. */
  optionsProvider?: Record<string, OptionsProvider>;
  /** The feature-flag reader behind `featureFlag('…')` (default: env-backed). */
  flagReader?: (name: string) => boolean;
  /** The host surface (`vscode` / `cli` / `vs`) — gates the `csharp` language axis (default `vscode`). */
  surface?: string;
  /** Full create inputs when the create floor (`folder` / `app-name`) should be appended after Q2. */
  inputs?: Inputs;
  /** Fetch static MCP tools when CLI did not provide a tools file path. */
  fetchMcpTools?: (serverUrl: string) => Promise<MCPFetchResult>;
  /** List available local MCP servers for the dynamic MCP create flow. */
  listLocalMcpServers?: () => Promise<ODRServer[]>;
  /** Search public OpenAPI descriptions for the v3-compatible OpenAPI source picker. */
  searchOpenAPISpec?: (query: string) => Promise<SearchOpenAPISpecResult[]>;
  /** Continue Q1's step numbering (its `promptCount`) so Q2's first prompt shows a Back button. */
  baseStep?: number;
  /** When true, a back past Q2's first prompt returns `{ kind: "back" }` (the front door re-enters Q1). */
  backable?: boolean;
}

/** The create-input walk's outcome: completed answers, or a `back` for the front door's re-entry loop. */
export type CreateInputsOutcome = { kind: "done"; answers: Answers } | { kind: "back" };

/**
 * Run one create template's Q2 + common floor over the host surface, returning a
 * resumable outcome. `deps.baseStep` continues Q1's step numbering and
 * `deps.backable` turns a back past the first prompt into a `{ kind: "back" }`
 * outcome (the front door then re-enters Q1). See collect-create-inputs CCI-25/26.
 */
export async function runCreateInputsWalk(
  floorBytes: Buffer,
  locator: DeclarativeLocator,
  entryParams: Answers,
  ui: UserInteraction,
  deps: CreateInputsDeps = {}
): Promise<Result<CreateInputsOutcome, FxError>> {
  const opened = openDeclarativePackageMetadata(floorBytes, locator);
  if (opened.isErr()) {
    return err(opened.error);
  }
  const descriptor = opened.value.descriptor;
  const languages = gateLanguagesBySurface(
    descriptorLanguages(descriptor),
    deps.surface ?? "vscode",
    deps.flagReader ?? envFlagReader
  );

  const providers = {
    ...createDefaultCreateOptionsProviders(
      deps.fetchMcpTools ?? fetchMCPTools,
      deps.listLocalMcpServers ?? ODRProvider.listServers,
      deps.searchOpenAPISpec ?? searchOpenAPISpec
    ),
    ...(deps.optionsProvider ?? {}),
  };
  const expressionPort = createExpressionPort(deps.flagReader);
  const surface = deps.surface ?? "vscode";
  const floorTail = await createFloorTail(
    deps.inputs,
    languages,
    showsPythonPreview(locator.templateId)
  );
  if (floorTail.isErr()) {
    return err(floorTail.error);
  }
  const validatorRegistry = {
    ...createDefaultCreateInputValidators(),
    ...floorTail.value.validators,
  };
  const port: CollectInputsPort = {
    ui: createUiPromptUI(ui),
    optionsProvider: (providerId) => providers[providerId],
    validator: (name) => validatorRegistry[name],
    evaluate: (node, scope) => evaluateExpression(node, scope, expressionPort),
  };
  const initialAnswers = {
    ...entryParams,
    ...floorTail.value.answers,
    surface,
    nonInteractive: deps.inputs?.nonInteractive === true ? "true" : "false",
  };

  const walked = await walkInputs(
    [...opened.value.questions, ...floorTail.value.questions],
    declaredOptionsSchema(descriptor),
    initialAnswers,
    port,
    { baseStep: deps.baseStep, backable: deps.backable }
  );
  if (walked.isErr()) {
    return err(walked.error);
  }
  if (walked.value.kind === "back") {
    return ok({ kind: "back" });
  }
  const answers = walked.value.answers;
  delete answers.nonInteractive;
  const selectedOpenApiSpec = answers.selectOpenApiSpec;
  if (answers.apiSpecLocation === undefined && typeof selectedOpenApiSpec === "string") {
    answers.apiSpecLocation = selectedOpenApiSpec;
  }
  if (deps.inputs !== undefined) {
    const validation = await validateCreateFloorAnswers(deps.inputs, answers);
    if (validation.isErr()) {
      return err(validation.error);
    }
  }
  return ok({ kind: "done", answers });
}

/**
 * Run one create template's Q2 over the host surface — the stable non-resumable
 * entry over {@link runCreateInputsWalk} (`backable` off), so a back past the
 * first prompt cancels and the result is the plain `Answers`.
 */
export async function runCreateInputs(
  floorBytes: Buffer,
  locator: DeclarativeLocator,
  entryParams: Answers,
  ui: UserInteraction,
  deps: CreateInputsDeps = {}
): Promise<Result<Answers, FxError>> {
  const outcome = await runCreateInputsWalk(floorBytes, locator, entryParams, ui, {
    ...deps,
    backable: false,
  });
  if (outcome.isErr()) {
    return err(outcome.error);
  }
  // `backable` is forced off here, so the walk cancels rather than returning a top-level back.
  return outcome.value.kind === "back"
    ? err(
        new UserError({
          source: "Scaffold",
          name: "InputWalkCancelled",
          message: "the input walk was cancelled by going back from the first question",
        })
      )
    : ok(outcome.value.answers);
}
