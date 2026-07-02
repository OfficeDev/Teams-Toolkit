// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  ConstantString,
  ListAPIInfo,
  ParseOptions,
  ProjectType,
  SpecParser,
  Utils,
  ValidationStatus,
} from "@microsoft/m365-spec-parser";
import {
  AppPackageFolderName,
  DefaultApiSpecJsonFileName,
  DefaultApiSpecFolderName,
  DefaultApiSpecYamlFileName,
  DefaultPluginManifestFileName,
  FxError,
  ManifestTemplateFileName,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Result, err, ok } from "neverthrow";
import { isJsonSpecFile } from "../../../common/utils";
import { ProgrammingLanguage } from "../../../question/constants";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

/** Generate API plugin files through spec-parser, then copy artifacts back via `ctx.write`. */

const SOURCE = "Scaffold";

export const STEP_GENERATE_OPENAPI_PLUGIN_FILES = "openapi/generate-plugin-files";
export const STEP_GENERATE_TEAMS_AI_CUSTOM_API_FILES = "openapi/generate-teams-ai-custom-api-files";

const MANIFEST_PATH = `${AppPackageFolderName}/${ManifestTemplateFileName}`;
const AGENT_PATH = `${AppPackageFolderName}/declarativeAgent.json`;
const PLUGIN_PATH = `${AppPackageFolderName}/${DefaultPluginManifestFileName}`;
const API_SPEC_PATH = `${AppPackageFolderName}/${DefaultApiSpecFolderName}/${DefaultApiSpecYamlFileName}`;
const DEFAULT_ACTION_ID = "action_1";
const M365_AGENTS_YML = "m365agents.yml";
const M365_AGENTS_LOCAL_YML = "m365agents.local.yml";

interface TeamsAiLanguageFiles {
  appPath: string;
  handlerPath: string;
}

interface TeamsAiSpecOperation {
  pathUrl: string;
  method: string;
  operationId: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  auth: boolean;
}

interface AuthRegistration {
  authName: string;
  authType: "apiKey" | "oauth2";
  registrationIdEnvName: string;
}

interface ConversationStarter {
  text: string;
}

const TEAMS_AI_OPERATION_METHODS = [
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

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function stringArrayParam(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequired(ctx: StepContext, filePath: string): Result<Buffer, FxError> {
  const current = ctx.read(filePath);
  if (current === undefined) {
    return err(
      systemError(
        "OpenApiGeneratedBaseFileMissing",
        `Cannot generate OpenAPI plugin files because '${filePath}' was not produced by the render phase.`
      )
    );
  }
  return ok(current);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseJsonObject(
  json: string,
  filePath: string,
  errorName: string
): Result<Record<string, unknown>, FxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return err(
      systemError(`${errorName}Parse`, `Cannot parse '${filePath}' as JSON: ${errorMessage(error)}`)
    );
  }
  if (!isRecord(parsed)) {
    return err(systemError(`${errorName}Shape`, `'${filePath}' is not a JSON object`));
  }
  return ok(parsed);
}

function isConversationStarter(value: unknown): value is ConversationStarter {
  return isRecord(value) && typeof value.text === "string";
}

function conversationStartersFromUnknown(value: unknown): ConversationStarter[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isConversationStarter).map((starter) => ({ text: starter.text }));
}

function pluginConversationStarters(plugin: Record<string, unknown>): ConversationStarter[] {
  const capabilities = plugin.capabilities;
  if (!isRecord(capabilities)) {
    return [];
  }
  return conversationStartersFromUnknown(capabilities.conversation_starters);
}

function pluginOperationIds(plugin: Record<string, unknown>): Set<string> {
  const operationIds = new Set<string>();
  if (!Array.isArray(plugin.functions)) {
    return operationIds;
  }
  for (const func of plugin.functions) {
    if (!isRecord(func) || typeof func.name !== "string") {
      continue;
    }
    operationIds.add(func.name);
  }
  return operationIds;
}

async function specConversationStarters(
  apiSpecPath: string,
  operationIds: Set<string>
): Promise<ConversationStarter[]> {
  if (operationIds.size === 0) {
    return [];
  }
  const parser = new SpecParser(apiSpecPath, openApiParseOptions());
  const listed = await parser.list();
  const starters: ConversationStarter[] = [];
  for (const operation of listed.APIs) {
    if (!operation.isValid || !operation.operationId || !operationIds.has(operation.operationId)) {
      continue;
    }
    const text = operation.summary || operation.description;
    if (text) {
      starters.push({ text });
    }
  }
  return starters;
}

function appendConversationStarters(
  agent: Record<string, unknown>,
  starters: ConversationStarter[]
): void {
  if (starters.length === 0) {
    return;
  }

  const nextStarters = Array.isArray(agent.conversation_starters)
    ? [...agent.conversation_starters]
    : [];
  for (const starter of starters) {
    if (nextStarters.length >= 6) {
      break;
    }
    const alreadyExists = nextStarters.some(
      (existingStarter) =>
        isConversationStarter(existingStarter) && existingStarter.text === starter.text
    );
    if (!alreadyExists) {
      nextStarters.push(starter);
    }
  }
  agent.conversation_starters = nextStarters;
}

async function addActionAndConversationStarters(
  agentJson: string,
  pluginJson: string,
  apiSpecPath: string
): Promise<Result<string, FxError>> {
  const agent = parseJsonObject(agentJson, AGENT_PATH, "OpenApiDeclarativeAgent");
  if (agent.isErr()) {
    return err(agent.error);
  }
  const plugin = parseJsonObject(pluginJson, PLUGIN_PATH, "OpenApiPluginManifest");
  if (plugin.isErr()) {
    return err(plugin.error);
  }

  const actions = agent.value.actions;
  if (actions !== undefined && !Array.isArray(actions)) {
    return err(
      systemError("OpenApiDeclarativeAgentActions", `'${AGENT_PATH}' actions is not an array`)
    );
  }

  const nextActions = Array.isArray(actions) ? [...actions] : [];
  nextActions.push({ id: DEFAULT_ACTION_ID, file: DefaultPluginManifestFileName });
  agent.value.actions = nextActions;

  let starters = pluginConversationStarters(plugin.value);
  if (starters.length === 0) {
    starters = await specConversationStarters(apiSpecPath, pluginOperationIds(plugin.value));
  }
  appendConversationStarters(agent.value, starters);

  return ok(JSON.stringify(agent.value, null, 4) + "\n");
}

function registrationIdEnvName(authName: string): string {
  return Utils.getSafeRegistrationIdEnvName(`${authName}_${ConstantString.RegistrationIdPostfix}`);
}

function authType(operation: ListAPIInfo): "apiKey" | "oauth2" | undefined {
  if (!operation.auth) {
    return undefined;
  }
  if (
    Utils.isBearerTokenAuth(operation.auth.authScheme) ||
    Utils.isAPIKeyAuthButNotInCookie(operation.auth.authScheme)
  ) {
    return "apiKey";
  }
  if (Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme)) {
    return "oauth2";
  }
  return undefined;
}

async function selectedAuthRegistrations(
  apiSpecLocation: string,
  apiOperations: string[]
): Promise<Result<AuthRegistration[], FxError>> {
  const parser = new SpecParser(apiSpecLocation, openApiParseOptions());
  const listed = await parser.list();
  const selected = listed.APIs.filter((operation) => apiOperations.includes(operation.api));
  const serverUrls = new Set<string>();
  const authNames = new Set<string>();
  const registrations: AuthRegistration[] = [];
  for (const operation of selected) {
    const type = authType(operation);
    const authName = operation.auth?.name;
    if (type === undefined || !authName) {
      continue;
    }
    if (operation.server) {
      serverUrls.add(operation.server);
    }
    if (authNames.has(authName)) {
      continue;
    }
    authNames.add(authName);
    registrations.push({
      authName,
      authType: type,
      registrationIdEnvName: registrationIdEnvName(authName),
    });
  }
  if (serverUrls.size > 1) {
    return err(
      new UserError({
        source: SOURCE,
        name: "OpenApiMultipleAuthServers",
        message: `Selected authenticated operations span multiple servers: ${Array.from(serverUrls).join(", ")}.`,
      })
    );
  }
  return ok(registrations);
}

function authActionBlock(registration: AuthRegistration): string {
  if (registration.authType === "apiKey") {
    return [
      "  # Register API KEY",
      "  - uses: apiKey/register",
      "    with:",
      "      # Name of the API Key",
      `      name: ${registration.authName}`,
      "      # app ID",
      "      appId: ${{TEAMS_APP_ID}}",
      "      # Path to OpenAPI description document",
      `      apiSpecPath: ./${API_SPEC_PATH}`,
      "    # Write the registration information of API Key into environment file for",
      "    # the specified environment variable(s).",
      "    writeToEnvironmentFile:",
      `      registrationId: ${registration.registrationIdEnvName}`,
    ].join("\n");
  }
  return [
    "  - uses: oauth/register",
    "    with:",
    `      name: ${registration.authName}`,
    "      flow: authorizationCode",
    "      # app ID",
    "      appId: ${{TEAMS_APP_ID}}",
    "      # Path to OpenAPI description document",
    `      apiSpecPath: ./${API_SPEC_PATH}`,
    "      # Use below property to change token exchange behaviour, BasicAuthorizationHeader: token exchange is done via HTTP headers. PostRequestBody: token exchange is done via request body",
    "      # tokenExchangeMethodType: BasicAuthorizationHeader",
    "      # Uncomment below property to use proof key for code exchange (PKCE)",
    "      # isPKCEEnabled: true",
    "    writeToEnvironmentFile:",
    `      configurationId: ${registration.registrationIdEnvName}`,
  ].join("\n");
}

function injectAuthActions(yml: string, registrations: AuthRegistration[]): string {
  if (registrations.length === 0) {
    return yml;
  }
  const marker = "  # Build app package with latest env value";
  const block = registrations.map(authActionBlock).join("\n\n") + "\n\n";
  const index = yml.indexOf(marker);
  if (index === -1) {
    return yml + (yml.endsWith("\n") ? "" : "\n") + block;
  }
  return yml.slice(0, index) + block + yml.slice(index);
}

function updateAuthYml(
  ctx: StepContext,
  filePath: string,
  registrations: AuthRegistration[]
): void {
  const current = ctx.read(filePath);
  if (current === undefined) {
    return;
  }
  const updated = injectAuthActions(current.toString("utf8"), registrations);
  ctx.write(filePath, Buffer.from(updated, "utf8"));
}

function openApiParseOptions() {
  return {
    isGptPlugin: true,
    allowAPIKeyAuth: true,
    allowBearerTokenAuth: true,
    allowMultipleParameters: true,
    allowOauth2: true,
    projectType: ProjectType.Copilot,
    allowMissingId: true,
    allowSwagger: true,
    allowMethods: ["get", "post", "put", "delete", "patch", "head", "connect", "options", "trace"],
    allowResponseSemantics: true,
    allowConversationStarters: false,
    allowConfirmation: false,
  };
}

function teamsAiParseOptions(): ParseOptions {
  return {
    allowAPIKeyAuth: true,
    allowBearerTokenAuth: true,
    allowMultipleParameters: true,
    allowOauth2: true,
    projectType: ProjectType.TeamsAi,
    allowMethods: ["get", "post", "put", "delete", "patch", "head", "connect", "options", "trace"],
  };
}

function languageParam(params: StepParams): ProgrammingLanguage | undefined {
  const language = stringParam(params, "language");
  switch (language) {
    case ProgrammingLanguage.TS:
      return ProgrammingLanguage.TS;
    case ProgrammingLanguage.JS:
      return ProgrammingLanguage.JS;
    case ProgrammingLanguage.PY:
      return ProgrammingLanguage.PY;
    default:
      return undefined;
  }
}

function teamsAiLanguageFiles(language: ProgrammingLanguage): TeamsAiLanguageFiles {
  if (language === ProgrammingLanguage.TS) {
    return { appPath: "src/app/app.ts", handlerPath: "src/app/handlers.ts" };
  }
  if (language === ProgrammingLanguage.JS) {
    return { appPath: "src/app/app.js", handlerPath: "src/app/handlers.js" };
  }
  return { appPath: "src/app.py", handlerPath: "src/handlers.py" };
}

function recordProperty(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function stringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function stringArrayProperty(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function teamsAiOperationDescription(
  operation: Record<string, unknown>,
  method: string,
  pathUrl: string
): string {
  return (
    stringProperty(operation, "description") ??
    stringProperty(operation, "summary") ??
    `${method.toUpperCase()} ${pathUrl}`
  );
}

function filterJsonSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) {
    return { type: "object" };
  }
  const filtered: Record<string, unknown> = {};
  const type = stringProperty(schema, "type");
  if (type !== undefined) {
    filtered.type = type;
  }
  const description = stringProperty(schema, "description");
  if (description !== undefined) {
    filtered.description = description;
  }
  const required = stringArrayProperty(schema, "required");
  if (required !== undefined) {
    filtered.required = required;
  }
  const properties = recordProperty(schema, "properties");
  if (properties !== undefined) {
    const filteredProperties: Record<string, unknown> = {};
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      filteredProperties[propertyName] = filterJsonSchema(propertySchema);
    }
    filtered.properties = filteredProperties;
  }
  if (schema.items !== undefined) {
    filtered.items = filterJsonSchema(schema.items);
  }
  return Object.keys(filtered).length === 0 ? { type: "object" } : filtered;
}

function ensureObjectSection(
  sections: Record<string, unknown>,
  sectionName: string
): Record<string, unknown> {
  const existing = recordProperty(sections, sectionName);
  if (existing !== undefined) {
    return existing;
  }
  const section: Record<string, unknown> = { type: "object", properties: {}, required: [] };
  sections[sectionName] = section;
  return section;
}

function addRequiredValue(record: Record<string, unknown>, key: string, value: string): void {
  const required = stringArrayProperty(record, key) ?? [];
  if (!required.includes(value)) {
    required.push(value);
  }
  record[key] = required;
}

function teamsAiParametersSchema(operation: Record<string, unknown>): Record<string, unknown> {
  const parameterProperties: Record<string, unknown> = {};
  const parameters = operation.parameters;
  if (Array.isArray(parameters)) {
    for (const parameter of parameters) {
      if (!isRecord(parameter)) {
        continue;
      }
      const name = stringProperty(parameter, "name");
      const location = stringProperty(parameter, "in");
      if (name === undefined || location === undefined) {
        continue;
      }
      const section = ensureObjectSection(parameterProperties, location);
      const sectionProperties = recordProperty(section, "properties") ?? {};
      const schema = filterJsonSchema(parameter.schema);
      const description = stringProperty(parameter, "description");
      if (description !== undefined) {
        schema.description = description;
      }
      sectionProperties[name] = schema;
      section.properties = sectionProperties;
      if (parameter.required === true) {
        addRequiredValue(section, "required", name);
      }
    }
  }

  const requestBody = recordProperty(operation, "requestBody");
  const content = requestBody === undefined ? undefined : recordProperty(requestBody, "content");
  const jsonMedia = content === undefined ? undefined : recordProperty(content, "application/json");
  if (jsonMedia?.schema !== undefined) {
    const bodySchema = filterJsonSchema(jsonMedia.schema);
    const description =
      requestBody === undefined ? undefined : stringProperty(requestBody, "description");
    if (description !== undefined) {
      bodySchema.description = description;
    }
    parameterProperties.body = bodySchema;
  }

  const root: Record<string, unknown> = {
    type: "object",
    properties: parameterProperties,
    required: [],
  };
  for (const [sectionName, section] of Object.entries(parameterProperties)) {
    if (isRecord(section) && stringArrayProperty(section, "required")?.length) {
      addRequiredValue(root, "required", sectionName);
    }
  }
  if (requestBody?.required === true) {
    addRequiredValue(root, "required", "body");
  }
  return root;
}

function teamsAiSpecOperations(spec: unknown): TeamsAiSpecOperation[] {
  if (!isRecord(spec) || !isRecord(spec.paths)) {
    return [];
  }
  const operations: TeamsAiSpecOperation[] = [];
  for (const [pathUrl, pathItem] of Object.entries(spec.paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }
    for (const method of TEAMS_AI_OPERATION_METHODS) {
      const operation = pathItem[method];
      if (!isRecord(operation)) {
        continue;
      }
      const operationId = stringProperty(operation, "operationId");
      if (operationId === undefined) {
        continue;
      }
      operations.push({
        pathUrl,
        method,
        operationId,
        description: teamsAiOperationDescription(operation, method, pathUrl),
        parametersSchema: teamsAiParametersSchema(operation),
        auth: Array.isArray(operation.security) && operation.security.length > 0,
      });
    }
  }
  return operations;
}

function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "_");
}

function teamsAiPromptText(spec: unknown): string {
  const description = isRecord(spec) ? recordProperty(spec, "info")?.description : undefined;
  return `The following is a conversation with an AI assistant.\nThe assistant can help to call APIs for the open api spec file${
    typeof description === "string" ? ". " + description : "."
  }\nIf the API doesn't require parameters, invoke it with default JSON object { "path": null, "body": null, "query": null }.\n\n`;
}

function teamsAiFunctionDefinitionCode(operationId: string): string {
  return `.function(
      functionDefs.${operationId}.name,
      functionDefs.${operationId}.description,
      functionDefs.${operationId}.parameters,
      async (parameter) => {
        const result = await functionHandlers.${operationId}Handler(parameter);
        if(result) {
          await send(result);
          return "result showed";
        } else {
          return "no result";
        }
      }
  )`;
}

function teamsAiFunctionHandlerCode(
  operation: TeamsAiSpecOperation,
  language: ProgrammingLanguage
): string {
  const exportPrefix = language === ProgrammingLanguage.TS ? "export " : "";
  const parameterName = language === ProgrammingLanguage.TS ? "parameter: any" : "parameters";
  const parameterVariable = language === ProgrammingLanguage.TS ? "parameter" : "parameters";
  const authConfig = operation.auth ? "addAuthConfig(client);" : "";
  const exportSuffix =
    language === ProgrammingLanguage.JS
      ? `\nmodule.exports = { ${operation.operationId}Handler };`
      : "";
  return `${exportPrefix}const ${operation.operationId}Handler = async (
  ${parameterName}
) => {
  const client = await api.getClient();
  ${authConfig}
  const apiPath = client.paths["${operation.pathUrl}"];
  if (apiPath && apiPath.${operation.method}) {
    const result = await apiPath.${operation.method}(${parameterVariable}.path, ${parameterVariable}.body, {
      params: ${parameterVariable}.query,
    });
    if (!result || !result.data) {
      throw new Error("Get empty result from api call.");
    }
    const cardName = "${operation.operationId}".replace(/[^a-zA-Z0-9]/g, "_");
    const cardTemplatePath = path.join(__dirname, "../adaptiveCards", cardName + ".json");
    if (await fs.exists(cardTemplatePath)){
      const card = generateAdaptiveCard(cardTemplatePath, result);
      return card;
    } else {
      return JSON.stringify(result.data);
    }
  } else {
    return "";
  }

};${exportSuffix}`;
}

function pythonTeamsAiFunctionDefinitionCode(operationId: string): string {
  return `.with_function(
      Function(
            name=function_defs["${operationId}"]["name"],
            description=function_defs["${operationId}"]["description"],
            parameter_schema=function_defs["${operationId}"]["parameters"],
            handler=make_handler(${operationId}, ctx)
      )
    )`;
}

function pythonTeamsAiFunctionHandlerCode(operation: TeamsAiSpecOperation): string {
  return `async def ${operation.operationId}(
  parameters,
):
  path = getattr(parameters, "path", {})
  body = getattr(parameters, "body", None)
  query = getattr(parameters, "query", {}) or {}
  resp = client.${operation.operationId}(**path, json=body, _headers={}, _params=query, _cookies={})

  if resp.status_code != 200:
    return resp.reason
  else:
    card_template_path = os.path.join(current_dir, 'adaptiveCards/${operation.operationId}.json')
    if not os.path.exists(card_template_path):
      json_resoponse_str = resp.text
      return json_resoponse_str
    else:
      with open(card_template_path) as card_template_file:
        adaptive_card_template = card_template_file.read()

      renderer = AdaptiveCardRenderer(adaptive_card_template)

      json_resoponse_str = resp.text
      rendered_card_str = renderer.render(json_resoponse_str)
      rendered_card_json = json.loads(rendered_card_str)
      return AdaptiveCard.model_validate(rendered_card_json)
  `;
}

function teamsAiAdaptiveCard(operation: TeamsAiSpecOperation): Record<string, unknown> {
  return {
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      { type: "TextBlock", text: operation.description, wrap: true },
      { type: "TextBlock", text: "${JSON.stringify($root)}", wrap: true },
    ],
  };
}

async function updatePromptSuggestions(
  destinationPath: string,
  operations: TeamsAiSpecOperation[]
): Promise<void> {
  const manifestPath = path.join(destinationPath, AppPackageFolderName, ManifestTemplateFileName);
  let manifest: Record<string, unknown>;
  try {
    const parsed = parseJsonObject(
      await fs.readFile(manifestPath, "utf8"),
      MANIFEST_PATH,
      "TeamsAiManifest"
    );
    if (parsed.isErr()) {
      return;
    }
    manifest = parsed.value;
  } catch {
    return;
  }

  const bots = manifest.bots;
  if (!Array.isArray(bots) || !isRecord(bots[0])) {
    return;
  }
  bots[0].commandLists = [
    {
      scopes: ["personal"],
      commands: operations.slice(0, 10).map((operation) => ({
        title: operation.description.slice(0, 32),
        description: operation.description.slice(0, 128),
      })),
    },
  ];
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 4) + "\n");
}

async function updateTypescriptJavascriptTeamsAiCustomApi(
  spec: unknown,
  language: ProgrammingLanguage,
  destinationPath: string,
  openapiSpecFileName: string
): Promise<Result<void, FxError>> {
  const operations = teamsAiSpecOperations(spec);
  if (operations.length === 0) {
    return err(
      systemError(
        "OpenApiTeamsAiOperationsMissing",
        "Failed to find generated OpenAPI operations for the Teams AI custom API template."
      )
    );
  }

  const appFolder = path.join(destinationPath, "src", "app");
  const adaptiveCardsFolder = path.join(destinationPath, "src", "adaptiveCards");
  await fs.ensureDir(appFolder);
  await fs.ensureDir(adaptiveCardsFolder);
  await fs.writeFile(path.join(appFolder, "instructions.txt"), teamsAiPromptText(spec));

  const actions: Record<string, unknown> = {};
  for (const operation of operations) {
    actions[operation.operationId] = {
      name: operation.operationId,
      description: operation.description,
      parameters: operation.parametersSchema,
    };
    const cardName = safeFileStem(operation.operationId);
    await fs.writeFile(
      path.join(adaptiveCardsFolder, `${cardName}.json`),
      JSON.stringify(teamsAiAdaptiveCard(operation), null, 2)
    );
    await fs.writeFile(path.join(adaptiveCardsFolder, `${cardName}.data.json`), "{}\n");
  }
  await fs.writeFile(path.join(appFolder, "functions.json"), JSON.stringify(actions, null, 2));

  const appFilePath = path.join(
    appFolder,
    language === ProgrammingLanguage.JS ? "app.js" : "app.ts"
  );
  const handlerFilePath = path.join(
    appFolder,
    language === ProgrammingLanguage.JS ? "handlers.js" : "handlers.ts"
  );
  const appFileContent = await fs.readFile(appFilePath, "utf8");
  await fs.writeFile(
    appFilePath,
    appFileContent.replace(
      "// Replace with function definition code",
      `${operations.map((operation) => teamsAiFunctionDefinitionCode(operation.operationId)).join("\n")};`
    )
  );

  const handlerFileContent = await fs.readFile(handlerFilePath, "utf8");
  await fs.writeFile(
    handlerFilePath,
    handlerFileContent
      .replace("{{OPENAPI_SPEC_PATH}}", openapiSpecFileName)
      .replace(
        "// Replace with function handler code",
        operations.map((operation) => teamsAiFunctionHandlerCode(operation, language)).join("\n\n")
      )
  );
  await updatePromptSuggestions(destinationPath, operations);
  return ok(undefined);
}

async function updatePythonTeamsAiCustomApi(
  spec: unknown,
  destinationPath: string,
  openapiSpecFileName: string
): Promise<Result<void, FxError>> {
  const operations = teamsAiSpecOperations(spec);
  if (operations.length === 0) {
    return err(
      systemError(
        "OpenApiTeamsAiPythonOperationsMissing",
        "Failed to find generated OpenAPI operations for the Python custom API template."
      )
    );
  }

  const srcFolder = path.join(destinationPath, "src");
  const adaptiveCardsFolder = path.join(srcFolder, "adaptiveCards");
  await fs.ensureDir(adaptiveCardsFolder);
  await fs.writeFile(path.join(srcFolder, "instructions.txt"), teamsAiPromptText(spec));

  const functions: Record<string, unknown> = {};
  const functionDefinitions: string[] = [];
  const functionHandlers: string[] = [];
  const operationIds: string[] = [];
  for (const operation of operations) {
    functions[operation.operationId] = {
      name: operation.operationId,
      description: operation.description,
      parameters: operation.parametersSchema,
    };
    functionDefinitions.push(pythonTeamsAiFunctionDefinitionCode(operation.operationId));
    functionHandlers.push(pythonTeamsAiFunctionHandlerCode(operation));
    operationIds.push(operation.operationId);

    const cardName = safeFileStem(operation.operationId);
    await fs.writeFile(
      path.join(adaptiveCardsFolder, `${cardName}.json`),
      JSON.stringify(teamsAiAdaptiveCard(operation), null, 2)
    );
    await fs.writeFile(path.join(adaptiveCardsFolder, `${cardName}.data.json`), "{}\n");
  }
  await fs.writeFile(path.join(srcFolder, "functions.json"), JSON.stringify(functions, null, 2));

  const appPath = path.join(srcFolder, "app.py");
  const appContent = await fs.readFile(appPath, "utf8");
  await fs.writeFile(
    appPath,
    appContent
      .replace("// Replace with function definition code", `prompt${functionDefinitions.join("")}`)
      .replace("//Replace with functions to be imported", operationIds.join(", "))
  );

  const handlerPath = path.join(srcFolder, "handlers.py");
  const handlerContent = await fs.readFile(handlerPath, "utf8");
  await fs.writeFile(
    handlerPath,
    handlerContent
      .replace("{{OPENAPI_SPEC_PATH}}", openapiSpecFileName)
      .replace("// Replace with function handler code", functionHandlers.join("\n\n"))
  );
  return ok(undefined);
}

async function writeTempFile(root: string, relativePath: string, data: Buffer): Promise<void> {
  const destination = path.join(root, relativePath);
  await fs.ensureDir(path.dirname(destination));
  await fs.writeFile(destination, data);
}

async function writeTeamsAiBaseFiles(
  ctx: StepContext,
  root: string,
  languageFiles: TeamsAiLanguageFiles
): Promise<Result<void, FxError>> {
  for (const filePath of [MANIFEST_PATH, languageFiles.appPath, languageFiles.handlerPath]) {
    const current = readRequired(ctx, filePath);
    if (current.isErr()) {
      return err(current.error);
    }
    await writeTempFile(root, filePath, current.value);
  }
  return ok(undefined);
}

async function writeTempTreeToContext(root: string, ctx: StepContext): Promise<void> {
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
      ctx.write(relativePath, await fs.readFile(fullPath));
    }
  };
  await walk(root);
}

async function writeTempBaseFiles(
  root: string,
  manifest: Buffer,
  agent: Buffer
): Promise<{ manifestPath: string; pluginPath: string; apiSpecPath: string }> {
  const manifestPath = path.join(root, MANIFEST_PATH);
  const agentPath = path.join(root, AGENT_PATH);
  const pluginPath = path.join(root, PLUGIN_PATH);
  const apiSpecPath = path.join(root, API_SPEC_PATH);
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.ensureDir(path.dirname(apiSpecPath));
  await fs.writeFile(manifestPath, manifest);
  await fs.writeFile(agentPath, agent);
  return { manifestPath, pluginPath, apiSpecPath };
}

export const openApiGeneratePluginFiles: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "apiSpecLocation") === undefined) {
      return "missing string parameter 'apiSpecLocation'";
    }
    if (stringArrayParam(resolved, "apiOperations") === undefined) {
      return "missing string[] parameter 'apiOperations'";
    }
    return undefined;
  },

  async apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const apiSpecLocation = stringParam(resolved, "apiSpecLocation");
    const apiOperations = stringArrayParam(resolved, "apiOperations");
    if (apiSpecLocation === undefined || apiOperations === undefined) {
      return err(systemError("OpenApiGenerateParams", "resolved parameters are not all valid"));
    }

    const manifest = readRequired(ctx, MANIFEST_PATH);
    if (manifest.isErr()) {
      return err(manifest.error);
    }
    const agent = readRequired(ctx, AGENT_PATH);
    if (agent.isErr()) {
      return err(agent.error);
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m365atk-openapi-"));
    try {
      const temp = await writeTempBaseFiles(tempRoot, manifest.value, agent.value);
      const parser = new SpecParser(apiSpecLocation, openApiParseOptions());

      await parser.generateForCopilot(
        temp.manifestPath,
        apiOperations,
        temp.apiSpecPath,
        temp.pluginPath
      );

      const updatedAgent = await addActionAndConversationStarters(
        (await fs.readFile(path.join(tempRoot, AGENT_PATH))).toString("utf8"),
        (await fs.readFile(temp.pluginPath)).toString("utf8"),
        temp.apiSpecPath
      );
      if (updatedAgent.isErr()) {
        return err(updatedAgent.error);
      }

      ctx.write(MANIFEST_PATH, await fs.readFile(temp.manifestPath));
      ctx.write(AGENT_PATH, Buffer.from(updatedAgent.value, "utf8"));
      ctx.write(PLUGIN_PATH, await fs.readFile(temp.pluginPath));
      ctx.write(API_SPEC_PATH, await fs.readFile(temp.apiSpecPath));
      const registrations = await selectedAuthRegistrations(apiSpecLocation, apiOperations);
      if (registrations.isErr()) {
        return err(registrations.error);
      }
      updateAuthYml(ctx, M365_AGENTS_YML, registrations.value);
      updateAuthYml(ctx, M365_AGENTS_LOCAL_YML, registrations.value);
      return ok(undefined);
    } catch (error) {
      return err(
        systemError(
          "OpenApiGenerateFailed",
          `Failed to generate OpenAPI plugin files: ${errorMessage(error)}`
        )
      );
    } finally {
      await fs.remove(tempRoot);
    }
  },
};

export const openApiGenerateTeamsAiCustomApiFiles: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "apiSpecLocation") === undefined) {
      return "missing string parameter 'apiSpecLocation'";
    }
    if (stringArrayParam(resolved, "apiOperations") === undefined) {
      return "missing string[] parameter 'apiOperations'";
    }
    if (languageParam(resolved) === undefined) {
      return "missing supported language parameter 'language'";
    }
    return undefined;
  },

  async apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const apiSpecLocation = stringParam(resolved, "apiSpecLocation");
    const apiOperations = stringArrayParam(resolved, "apiOperations");
    const language = languageParam(resolved);
    if (apiSpecLocation === undefined || apiOperations === undefined || language === undefined) {
      return err(systemError("OpenApiTeamsAiParams", "resolved parameters are not all valid"));
    }

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m365atk-openapi-teams-ai-"));
    try {
      const languageFiles = teamsAiLanguageFiles(language);
      const baseFiles = await writeTeamsAiBaseFiles(ctx, tempRoot, languageFiles);
      if (baseFiles.isErr()) {
        return err(baseFiles.error);
      }

      const openapiSpecFileName = (await isJsonSpecFile(apiSpecLocation))
        ? DefaultApiSpecJsonFileName
        : DefaultApiSpecYamlFileName;
      const apiSpecPath = `${AppPackageFolderName}/${DefaultApiSpecFolderName}/${openapiSpecFileName}`;
      const tempApiSpecPath = path.join(tempRoot, apiSpecPath);
      await fs.ensureDir(path.dirname(tempApiSpecPath));

      const parser = new SpecParser(apiSpecLocation, teamsAiParseOptions());
      const validation = await parser.validate();
      if (validation.status === ValidationStatus.Error) {
        return err(
          new UserError({
            source: SOURCE,
            name: "OpenApiSpecInvalid",
            message:
              "The OpenAPI description document is invalid or contains no supported operations.",
          })
        );
      }

      await parser.generate(
        path.join(tempRoot, MANIFEST_PATH),
        apiOperations,
        tempApiSpecPath,
        undefined
      );
      const specs = await parser.getFilteredSpecs(apiOperations);
      const filteredSpec = specs[1];
      if (filteredSpec === undefined) {
        return err(
          systemError(
            "OpenApiTeamsAiFilteredSpecMissing",
            "Failed to generate the filtered OpenAPI document for the selected operations."
          )
        );
      }
      if (language === ProgrammingLanguage.PY) {
        const updatePythonResult = await updatePythonTeamsAiCustomApi(
          filteredSpec,
          tempRoot,
          openapiSpecFileName
        );
        if (updatePythonResult.isErr()) {
          return err(updatePythonResult.error);
        }
      } else {
        const updateResult = await updateTypescriptJavascriptTeamsAiCustomApi(
          filteredSpec,
          language,
          tempRoot,
          openapiSpecFileName
        );
        if (updateResult.isErr()) {
          return err(updateResult.error);
        }
      }

      await writeTempTreeToContext(tempRoot, ctx);
      return ok(undefined);
    } catch (error) {
      return err(
        systemError(
          "OpenApiTeamsAiGenerateFailed",
          `Failed to generate Teams AI custom API files: ${errorMessage(error)}`
        )
      );
    } finally {
      await fs.remove(tempRoot);
    }
  },
};
