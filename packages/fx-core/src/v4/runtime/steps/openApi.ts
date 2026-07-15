// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AdaptiveCardGenerator,
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
  DeclarativeAgentManifestWrapper,
  FxError,
  ManifestTemplateFileName,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import axios from "axios";
import * as fs from "fs-extra";
import * as path from "path";
import { Result, err, ok } from "neverthrow";
import { getParserOptions } from "../../../common/openApiParserOptions";
import { isValidHttpUrl } from "../../../common/stringUtils";
import { isJsonSpecFile } from "../../../common/utils";
import { ProgrammingLanguage } from "../../../question/constants";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";
import { withTempDirectory } from "../withTempDirectory";
import { generateTeamsAiCustomApiFiles } from "./openApiCustomApi";

/** Generate API plugin files through spec-parser, then copy artifacts back via `ctx.write`. */

const SOURCE = "Scaffold";

export const STEP_GENERATE_OPENAPI_PLUGIN_FILES = "openapi/generate-plugin-files";
export const STEP_GENERATE_TEAMS_AI_CUSTOM_API_FILES = "openapi/generate-teams-ai-custom-api-files";

const MANIFEST_PATH = `${AppPackageFolderName}/${ManifestTemplateFileName}`;
const AGENT_PATH = `${AppPackageFolderName}/declarativeAgent.json`;
const PLUGIN_PATH = `${AppPackageFolderName}/${DefaultPluginManifestFileName}`;
const API_SPEC_PATH = `${AppPackageFolderName}/${DefaultApiSpecFolderName}/${DefaultApiSpecYamlFileName}`;
const ORIGINAL_API_SPEC_PATH = `${API_SPEC_PATH}.original`;
const DEFAULT_ACTION_ID = "action_1";
const M365_AGENTS_YML = "m365agents.yml";
const M365_AGENTS_LOCAL_YML = "m365agents.local.yml";

interface TeamsAiLanguageFiles {
  appPath: string;
  handlerPath: string;
}

interface AuthRegistration {
  authName: string;
  authType: "apiKey" | "oauth2";
  registrationIdEnvName: string;
}

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

function selectedAuthRegistrations(
  selectedOperations: ListAPIInfo[]
): Result<AuthRegistration[], FxError> {
  const serverUrls = new Set<string>();
  const authNames = new Set<string>();
  const registrations: AuthRegistration[] = [];
  for (const operation of selectedOperations) {
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

function conversationStarterText(operation: ListAPIInfo): string | undefined {
  const text = operation.summary?.trim() || operation.description?.trim();
  return text || undefined;
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

function openApiParseOptions(): ParseOptions {
  // Reuse the v3 Copilot parser options (single source of truth) instead of a v4 copy.
  return getParserOptions(ProjectType.Copilot, true);
}

function teamsAiParseOptions(): ParseOptions {
  return getParserOptions(ProjectType.TeamsAi);
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

async function readOriginalOpenApiSpec(apiSpecLocation: string): Promise<Buffer> {
  if (isValidHttpUrl(apiSpecLocation)) {
    const response = await axios.get<ArrayBuffer>(apiSpecLocation, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
  }
  return await fs.readFile(apiSpecLocation);
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

    return withTempDirectory(
      "m365atk-openapi-",
      (phase, error) =>
        systemError(
          "OpenApiGenerateFailed",
          `Failed to generate OpenAPI plugin files during temporary file ${phase}: ${errorMessage(error)}`
        ),
      async (tempRoot) => {
        const temp = await writeTempBaseFiles(tempRoot, manifest.value, agent.value);
        const parser = new SpecParser(apiSpecLocation, openApiParseOptions());
        const listed = await parser.list();
        const selectedOperations = listed.APIs.filter((operation) =>
          apiOperations.includes(operation.api)
        );

        await parser.generateForCopilot(
          temp.manifestPath,
          apiOperations,
          temp.apiSpecPath,
          temp.pluginPath
        );

        const agentManifestPath = path.join(tempRoot, AGENT_PATH);
        let agentManifest: DeclarativeAgentManifestWrapper;
        try {
          agentManifest = DeclarativeAgentManifestWrapper.fromJSON(
            await fs.readFile(agentManifestPath, "utf8")
          );
        } catch (error) {
          return err(
            systemError(
              "JSONSyntaxError",
              `The declarative agent manifest is not valid JSON: ${errorMessage(error)}`
            )
          );
        }
        agentManifest.upsertAction(DEFAULT_ACTION_ID, DefaultPluginManifestFileName);
        const remainingStarterSlots = Math.max(0, 6 - agentManifest.conversationStarters.length);
        const seenStarterTexts = new Set(
          agentManifest.conversationStarters.map((starter) => starter.text)
        );
        const starterTexts = selectedOperations
          .map(conversationStarterText)
          .filter((text): text is string => text !== undefined)
          .filter((text) => {
            if (seenStarterTexts.has(text)) {
              return false;
            }
            seenStarterTexts.add(text);
            return true;
          })
          .slice(0, remainingStarterSlots);
        for (const text of starterTexts) {
          agentManifest.addConversationStarter(text);
        }
        await fs.writeFile(agentManifestPath, agentManifest.toJSON(), "utf8");

        const registrations = selectedAuthRegistrations(selectedOperations);
        if (registrations.isErr()) {
          return err(registrations.error);
        }

        await writeTempTreeToContext(tempRoot, ctx);
        ctx.write(ORIGINAL_API_SPEC_PATH, await readOriginalOpenApiSpec(apiSpecLocation));
        updateAuthYml(ctx, M365_AGENTS_YML, registrations.value);
        updateAuthYml(ctx, M365_AGENTS_LOCAL_YML, registrations.value);
        return ok(undefined);
      }
    );
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

    return withTempDirectory(
      "m365atk-openapi-teams-ai-",
      (phase, error) =>
        systemError(
          "OpenApiTeamsAiGenerateFailed",
          `Failed to generate Teams AI custom API files during temporary file ${phase}: ${errorMessage(
            error
          )}`
        ),
      async (tempRoot) => {
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
        const warnings = await generateTeamsAiCustomApiFiles(
          filteredSpec,
          language,
          tempRoot,
          openapiSpecFileName
        );
        for (const warning of warnings) {
          ctx.warn?.(warning.content);
        }

        await writeTempTreeToContext(tempRoot, ctx);
        return ok(undefined);
      }
    );
  },
};
