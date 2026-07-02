// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FuncValidation,
  FxError,
  Inputs,
  SystemError,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import {
  ListAPIInfo,
  ParseOptions,
  ProjectType,
  SpecParser,
  Utils,
  ValidationStatus,
} from "@microsoft/m365-spec-parser";
import fs from "fs-extra";
import { Result, err, ok } from "neverthrow";
import { MCPFetchResult, fetchMCPTools } from "../../component/utils/mcpToolFetcher";
import { ODRProvider, type ODRServer } from "../../component/utils/odrProvider";
import { readBooleanFeatureFlag } from "../../common/featureFlags";
import {
  CollectInputsPort,
  OptionsProvider,
  OptionsSchema,
  QuestionSpec,
  Validator,
  collectInputs,
} from "../collectInputs/collectInputs";
import { InputValidationError, MissingRequiredInputError } from "../../error/common";
import { QuestionNames, appNameQuestion, folderQuestion } from "../../question";
import { openDeclarativePackageMetadata } from "../distribution/declarativePackage";
import { evaluateExpression } from "../expression/evaluateExpression";
import { parseMcpStaticToolsJson } from "../mcp/mcpStaticTools";
import { Answers, DeclarativeLocator } from "../model/dataModel";
import { parseDeclaredKeys } from "../runtime/packageParse";
import { createExpressionPort } from "../runtime/whitelist";
import { createUiPromptUI } from "./uiPromptUI";

/** Live create-path surface wiring for `collect-inputs`. See collect-create-inputs spec. */

const remoteMcpServerType = { id: "remote", label: "Remote" };
const localMcpServerType = { id: "local", label: "Local" };
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  csharp: "C#",
  python: "Python",
};

function createLocalServerCache(
  listLocalMcpServers: () => Promise<ODRServer[]>
): () => Promise<ODRServer[]> {
  let cached: Promise<ODRServer[]> | undefined;
  return () => {
    if (cached === undefined) {
      cached = listLocalMcpServers();
    }
    return cached;
  };
}

function createMcpServerTypesProvider(localServers: () => Promise<ODRServer[]>): OptionsProvider {
  return {
    async fetch() {
      const servers = await localServers();
      return {
        options:
          servers.length > 0 ? [remoteMcpServerType, localMcpServerType] : [remoteMcpServerType],
      };
    },
  };
}

function localServerDetail(server: ODRServer): string {
  const toolsDetail = `${server.tools.length} tools available`;
  return server.description ? `${server.description} (${toolsDetail})` : toolsDetail;
}

function createLocalMcpServersProvider(localServers: () => Promise<ODRServer[]>): OptionsProvider {
  return {
    async fetch() {
      const servers = await localServers();
      return {
        options: servers.map((server) => ({
          id: server.name,
          label: server.display_name || server.name,
          detail: localServerDetail(server),
        })),
      };
    },
  };
}

const openApiMethods = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "connect",
  "options",
  "trace",
];

function openApiParseOptions(): ParseOptions {
  return {
    isGptPlugin: true,
    allowAPIKeyAuth: true,
    allowBearerTokenAuth: true,
    allowMultipleParameters: true,
    allowOauth2: true,
    projectType: ProjectType.Copilot,
    allowMissingId: true,
    allowSwagger: true,
    allowMethods: openApiMethods,
    allowResponseSemantics: true,
    allowConversationStarters: false,
    allowConfirmation: false,
  };
}

function operationDetail(operation: ListAPIInfo): string {
  if (!operation.auth) {
    return "No authentication";
  }
  if (Utils.isBearerTokenAuth(operation.auth.authScheme)) {
    return "API key";
  }
  if (Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme)) {
    return "OAuth";
  }
  if (Utils.isAPIKeyAuthButNotInCookie(operation.auth.authScheme)) {
    return "API key with header or query parameter";
  }
  return "Unsupported authentication";
}

function sortOperations(operations: ListAPIInfo[]): ListAPIInfo[] {
  return [...operations].sort((left, right) => {
    const leftParts = left.api.toLowerCase().split(" ");
    const rightParts = right.api.toLowerCase().split(" ");
    if (leftParts[0] < rightParts[0]) {
      return -1;
    }
    if (leftParts[0] > rightParts[0]) {
      return 1;
    }
    return (leftParts[1] ?? "").localeCompare(rightParts[1] ?? "");
  });
}

const openApiOperationsProvider: OptionsProvider = {
  async fetch(params) {
    const apiSpecLocation = params.apiSpecLocation?.trim();
    if (!apiSpecLocation) {
      throw new SystemError({
        source: "Scaffold",
        name: "OpenApiMissingSpecLocation",
        message: "OpenAPI operations cannot be listed without an API spec location.",
      });
    }
    const parser = new SpecParser(apiSpecLocation, openApiParseOptions());
    const validation = await parser.validate();
    if (validation.status === ValidationStatus.Error) {
      throw new SystemError({
        source: "Scaffold",
        name: "OpenApiSpecInvalid",
        message: "The OpenAPI description document is invalid or contains no supported operations.",
      });
    }
    const listed = await parser.list();
    return {
      options: sortOperations(listed.APIs)
        .filter((operation) => operation.isValid)
        .map((operation) => ({
          id: operation.api,
          label: operation.api,
          groupName: operation.api.toUpperCase().split(" ")[0],
          detail: operationDetail(operation),
        })),
    };
  },
};

function mcpToolsJsonFromFetchResult(
  serverUrl: string | undefined,
  result: MCPFetchResult
): string {
  if (result.requiresAuth) {
    throw new UserError({
      source: "Scaffold",
      name: "McpAuthRequired",
      message: `The MCP server${serverUrl ? ` at ${serverUrl}` : ""} requires authentication.`,
    });
  }
  if (result.tools.length === 0) {
    throw new UserError({
      source: "Scaffold",
      name: "McpToolsNotFound",
      message: `No tools were discovered from the MCP server${serverUrl ? ` at ${serverUrl}` : ""}.`,
    });
  }
  return JSON.stringify({ tools: result.tools });
}

function createMcpToolsProvider(
  fetchTools: (serverUrl: string) => Promise<MCPFetchResult>
): OptionsProvider {
  return {
    async fetch(params) {
      let toolsJson = params.toolsJson?.trim();
      const toolsFilePath = params.toolsFilePath?.trim();
      if (!toolsJson && toolsFilePath) {
        try {
          toolsJson = fs.readFileSync(toolsFilePath, "utf8");
        } catch {
          throw new UserError({
            source: "Scaffold",
            name: "McpToolsFileReadFailed",
            message: "Failed to read the MCP tools file.",
          });
        }
      }
      const serverUrl = params.serverUrl?.trim();
      if (!toolsJson && serverUrl) {
        try {
          toolsJson = mcpToolsJsonFromFetchResult(serverUrl, await fetchTools(serverUrl));
        } catch (error) {
          if (error instanceof UserError) {
            throw error;
          }
          throw new UserError({
            source: "Scaffold",
            name: "McpToolsFetchFailed",
            message: `Failed to fetch tools from the MCP server at ${serverUrl}.`,
          });
        }
      }
      if (!toolsJson) {
        throw new UserError({
          source: "Scaffold",
          name: "McpToolsJsonMissing",
          message: "MCP tools JSON is required before listing tools.",
        });
      }
      const parsed = parseMcpStaticToolsJson(toolsJson);
      if (!parsed.ok) {
        throw new UserError({ source: "Scaffold", name: parsed.code, message: parsed.message });
      }
      return {
        options: parsed.tools.map((tool) => ({
          id: tool.name,
          label: tool.name,
          detail: tool.description,
        })),
        derived: { toolsJson },
      };
    },
  };
}

/** Default `optionsFrom` provider registry. */
function createDefaultProviders(
  fetchTools: (serverUrl: string) => Promise<MCPFetchResult>,
  listLocalMcpServers: () => Promise<ODRServer[]>
): Record<string, OptionsProvider> {
  const localServers = createLocalServerCache(listLocalMcpServers);
  return {
    "mcp.serverTypes": createMcpServerTypesProvider(localServers),
    "mcp.localServers": createLocalMcpServersProvider(localServers),
    "mcp.tools": createMcpToolsProvider(fetchTools),
    "openapi.operations": openApiOperationsProvider,
  };
}

/** The `"uri"` validator: a value that does not parse as a URL is user-fixable. */
const uriValidator: Validator = (value: string): string | undefined => {
  try {
    new URL(value);
    return undefined;
  } catch {
    return "must be a valid URI";
  }
};

/** The graph connector display name cannot be empty. */
const graphConnectorNameValidator: Validator = (value: string): string | undefined => {
  return value.trim().length > 0 ? undefined : "must not be empty";
};

/** The Microsoft Graph external connection id rules mirrored from the v3 question. */
const graphConnectorConnectionIdValidator: Validator = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return "must be at least 3 characters";
  }
  if (trimmed.length > 32) {
    return "must be at most 32 characters";
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return "must contain only alphanumeric characters";
  }
  const reservedPrefixes = [
    "Microsoft",
    "None",
    "Directory",
    "Exchange",
    "ExchangeArchive",
    "LinkedIn",
    "Mailbox",
    "OneDriveBusiness",
    "SharePoint",
    "Teams",
    "Yammer",
    "Connectors",
    "TaskFabric",
    "PowerBI",
    "Assistant",
    "TopicEngine",
    "MSFT_All_Connectors",
  ];
  const matchedPrefix = reservedPrefixes.find((prefix) =>
    trimmed.toLowerCase().startsWith(prefix.toLowerCase())
  );
  return matchedPrefix === undefined ? undefined : `must not begin with '${matchedPrefix}'`;
};

/** Engine-registered validator registry. */
const validators: Record<string, Validator> = {
  uri: uriValidator,
  graphConnectorName: graphConnectorNameValidator,
  graphConnectorConnectionId: graphConnectorConnectionIdValidator,
};

interface CreateFloorTail {
  questions: QuestionSpec[];
  answers: Answers;
  validators: Record<string, Validator>;
}

function isFuncValidation(value: unknown): value is FuncValidation<string> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "validFunc") === "function"
  );
}

function getStringValidationFunc(
  validation: FuncValidation<string> | object | undefined
): FuncValidation<string>["validFunc"] | undefined {
  return isFuncValidation(validation) ? validation.validFunc : undefined;
}

async function resolveStringValue(
  value:
    | string
    | ((inputs: Inputs) => string | undefined | Promise<string | undefined>)
    | undefined,
  inputs: Inputs
): Promise<string | undefined> {
  return typeof value === "function" ? await value(inputs) : value;
}

async function createFloorTail(
  inputs: Inputs | undefined,
  languages: string[]
): Promise<Result<CreateFloorTail, FxError>> {
  const questions: QuestionSpec[] = [];
  const answers: Answers = {};

  if (languages.length > 1) {
    questions.push({
      name: "language",
      type: "singleSelect",
      title: "Programming Language",
      staticOptions: languages.map((language) => ({
        id: language,
        label: LANGUAGE_LABELS[language] ?? language,
      })),
    });
  } else if (languages.length === 1 && languages[0] !== "common") {
    answers.language = languages[0];
  }

  if (inputs === undefined) {
    return ok({ questions, answers, validators: {} });
  }

  const folder = folderQuestion();
  const appName = appNameQuestion();

  const existingFolder = inputs[QuestionNames.Folder];
  if (typeof existingFolder === "string") {
    answers[QuestionNames.Folder] = existingFolder;
  } else {
    const defaultFolder = await resolveStringValue(folder.default, inputs);
    if (inputs.nonInteractive) {
      if (defaultFolder !== undefined) {
        answers[QuestionNames.Folder] = defaultFolder;
      }
    } else {
      questions.push({
        name: folder.name,
        type: "folder",
        title: (await resolveStringValue(folder.title, inputs)) ?? folder.name,
        placeholder: await resolveStringValue(folder.placeholder, inputs),
        prompt: await resolveStringValue(folder.prompt, inputs),
        default: defaultFolder,
      });
    }
  }

  const existingAppName = inputs[QuestionNames.AppName];
  if (typeof existingAppName === "string") {
    answers[QuestionNames.AppName] = existingAppName;
  } else {
    const defaultAppName = await resolveStringValue(appName.default, inputs);
    if (inputs.nonInteractive) {
      if (defaultAppName === undefined) {
        return err(new MissingRequiredInputError(QuestionNames.AppName, "createFrontDoor"));
      }
      answers[QuestionNames.AppName] = defaultAppName;
    } else {
      questions.push({
        name: appName.name,
        type: "text",
        title: (await resolveStringValue(appName.title, inputs)) ?? appName.name,
        placeholder: await resolveStringValue(appName.placeholder, inputs),
        prompt: await resolveStringValue(appName.prompt, inputs),
        default: defaultAppName,
        validation: "appName",
      });
    }
  }

  const validateAppName = getStringValidationFunc(appName.validation);
  const floorValidators: Record<string, Validator> = {};
  if (validateAppName !== undefined) {
    floorValidators.appName = async (value, currentAnswers) => {
      const validationInputs: Inputs = { ...inputs };
      const folderAnswer = currentAnswers[QuestionNames.Folder];
      if (typeof folderAnswer === "string") {
        validationInputs[QuestionNames.Folder] = folderAnswer;
      }
      return validateAppName(value, validationInputs);
    };
  }

  return ok({ questions, answers, validators: floorValidators });
}

async function validateCreateFloorAnswers(
  inputs: Inputs,
  answers: Answers
): Promise<Result<undefined, FxError>> {
  const appName = answers[QuestionNames.AppName];
  if (typeof appName !== "string") {
    return err(new MissingRequiredInputError(QuestionNames.AppName, "createFrontDoor"));
  }
  const validateAppName = getStringValidationFunc(appNameQuestion().validation);
  if (validateAppName === undefined) {
    return ok(undefined);
  }
  const validationInputs: Inputs = { ...inputs };
  const folderAnswer = answers[QuestionNames.Folder];
  if (typeof folderAnswer === "string") {
    validationInputs[QuestionNames.Folder] = folderAnswer;
  }
  const message = await validateAppName(appName, validationInputs);
  if (message !== undefined) {
    return err(new InputValidationError(QuestionNames.AppName, message, "createFrontDoor"));
  }
  return ok(undefined);
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
    ...createDefaultProviders(
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
  const validatorRegistry = { ...validators, ...floorTail.value.validators };
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

  const answers = await collectInputs(
    [...opened.value.questions, ...floorTail.value.questions],
    declaredOptionsSchema(descriptor),
    initialAnswers,
    languages,
    port,
    { appendLanguage: false }
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
