// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, Inputs, UserInteraction } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { MCPFetchResult, fetchMCPTools } from "../../component/utils/mcpToolFetcher";
import { ODRProvider, type ODRServer } from "../../component/utils/odrProvider";
import { readBooleanFeatureFlag } from "../../common/featureFlags";
import {
  CollectInputsPort,
  OptionsProvider,
  OptionsSchema,
  collectInputs,
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
}

/** Run one create template's Q2 over the host surface. */
export async function runCreateInputs(
  floorBytes: Buffer,
  locator: DeclarativeLocator,
  entryParams: Answers,
  ui: UserInteraction,
  deps: CreateInputsDeps = {}
): Promise<Result<Answers, FxError>> {
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
      deps.listLocalMcpServers ?? ODRProvider.listServers
    ),
    ...(deps.optionsProvider ?? {}),
  };
  const expressionPort = createExpressionPort(deps.flagReader);
  const surface = deps.surface ?? "vscode";
  const floorTail = await createFloorTail(deps.inputs, languages);
  if (floorTail.isErr()) {
    return err(floorTail.error);
  }
  const validatorRegistry = {
    ...createDefaultCreateInputValidators(),
    ...floorTail.value.validators,
  };
  const port: CollectInputsPort = {
    ui: createUiPromptUI(ui, (name) => validatorRegistry[name]),
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

  const answers = await collectInputs(
    [...opened.value.questions, ...floorTail.value.questions],
    declaredOptionsSchema(descriptor),
    initialAnswers,
    port
  );
  if (answers.isErr()) {
    return err(answers.error);
  }
  delete answers.value.nonInteractive;
  if (deps.inputs !== undefined) {
    const validation = await validateCreateFloorAnswers(deps.inputs, answers.value);
    if (validation.isErr()) {
      return err(validation.error);
    }
  }
  return answers;
}
