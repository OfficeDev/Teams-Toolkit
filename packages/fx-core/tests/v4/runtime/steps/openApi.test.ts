// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { STEP_REGISTRY } from "../../../../src/v4/runtime/runtimeRegistry";
import {
  STEP_GENERATE_OPENAPI_PLUGIN_FILES,
  STEP_GENERATE_TEAMS_AI_CUSTOM_API_FILES,
  openApiGeneratePluginFiles,
  openApiGenerateTeamsAiCustomApiFiles,
} from "../../../../src/v4/runtime/steps/openApi";
import { ProgrammingLanguage } from "../../../../src/question/constants";
import { assert, beforeEach, vi } from "vitest";

interface MockParserOperation {
  api: string;
  isValid: boolean;
  operationId?: string;
  summary?: string;
  description?: string;
  server?: string;
  auth?: {
    name?: string;
    authScheme?: Record<string, unknown>;
  };
}

interface MockSpecParserState {
  filteredSpec: unknown;
  listOperations: MockParserOperation[];
  pluginManifest: unknown;
  pluginConversationStarters: Record<string, unknown>[];
  validationStatus: string;
}

const mockSpecParserState = vi.hoisted<MockSpecParserState>(() => ({
  filteredSpec: undefined,
  listOperations: [],
  pluginManifest: undefined,
  pluginConversationStarters: [{ text: "Find pets" }],
  validationStatus: "Ok",
}));

vi.mock("@microsoft/m365-spec-parser", () => {
  class SpecParser {
    async list(): Promise<{ APIs: MockParserOperation[] }> {
      return { APIs: mockSpecParserState.listOperations };
    }

    async validate(): Promise<{ status: string }> {
      return { status: mockSpecParserState.validationStatus };
    }

    async generate(): Promise<void> {
      return undefined;
    }

    async getFilteredSpecs(): Promise<unknown[]> {
      return [undefined, mockSpecParserState.filteredSpec];
    }

    async generateForCopilot(
      _manifestPath: string,
      _apiOperations: string[],
      apiSpecPath: string,
      pluginPath: string
    ): Promise<void> {
      const fs = await import("fs-extra");
      await fs.writeFile(apiSpecPath, "openapi: 3.0.0\n");
      const pluginManifest = mockSpecParserState.pluginManifest ?? {
        functions: [{ name: "getPets", description: "Get pets" }],
        capabilities: { conversation_starters: mockSpecParserState.pluginConversationStarters },
      };
      if (typeof pluginManifest === "string") {
        await fs.writeFile(pluginPath, pluginManifest);
      } else {
        await fs.writeJson(pluginPath, pluginManifest);
      }
    }
  }

  return {
    ConstantString: { RegistrationIdPostfix: "REGISTRATION_ID" },
    ProjectType: { Copilot: "copilot", TeamsAi: "teams-ai" },
    SpecParser,
    Utils: {
      getSafeRegistrationIdEnvName(value: string): string {
        return value.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
      },
      isAPIKeyAuthButNotInCookie(authScheme: Record<string, unknown> | undefined): boolean {
        return authScheme?.type === "apiKey" && authScheme.in !== "cookie";
      },
      isBearerTokenAuth(authScheme: Record<string, unknown> | undefined): boolean {
        return authScheme?.type === "http" && authScheme.scheme === "bearer";
      },
      isOAuthWithAuthCodeFlow(authScheme: Record<string, unknown> | undefined): boolean {
        return authScheme?.type === "oauth2";
      },
    },
    ValidationStatus: { Error: "Error" },
  };
});

function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  for (const [filePath, body] of Object.entries(initial)) {
    files.set(filePath, Buffer.from(body, "utf8"));
  }
  return {
    files,
    ctx: {
      read: (filePath) => files.get(filePath),
      write: (filePath, data) => {
        files.set(filePath, data);
      },
      manifestWrapper: () => ({ addAction: () => undefined }),
    },
  };
}

function text(files: Map<string, Buffer>, filePath: string): string {
  return files.get(filePath)?.toString("utf8") ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function readJsonObject(files: Map<string, Buffer>, filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text(files, filePath));
  if (!isRecord(parsed)) {
    assert.fail(`${filePath} should contain a JSON object`);
  }
  return parsed;
}

function teamsAiSpec(): Record<string, unknown> {
  return {
    info: { description: "Pet store APIs" },
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPets",
          summary: "Get pets by id",
          parameters: [
            {
              name: "petId",
              in: "path",
              required: true,
              description: "Pet id",
              schema: { type: "string" },
            },
            { name: "includeDetails", in: "query", schema: { type: "boolean" } },
          ],
          requestBody: {
            required: true,
            description: "Filter body",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["kind"],
                  properties: { kind: { type: "string", description: "Pet kind" } },
                },
              },
            },
          },
          security: [{ apiKey: [] }],
        },
      },
    },
  };
}

beforeEach(() => {
  mockSpecParserState.filteredSpec = teamsAiSpec();
  mockSpecParserState.listOperations = [
    {
      api: "GET /pets",
      isValid: true,
      operationId: "getPets",
      summary: "Find pets",
      server: "https://api.example.com",
      auth: { name: "petKey", authScheme: { type: "apiKey", in: "header" } },
    },
  ];
  mockSpecParserState.pluginManifest = undefined;
  mockSpecParserState.pluginConversationStarters = [{ text: "Find pets" }];
  mockSpecParserState.validationStatus = "Ok";
});

describe("OpenAPI runtime steps (v4)", () => {
  it("registers both OpenAPI steps", () => {
    assert.strictEqual(
      STEP_REGISTRY.get(STEP_GENERATE_OPENAPI_PLUGIN_FILES),
      openApiGeneratePluginFiles
    );
    assert.strictEqual(
      STEP_REGISTRY.get(STEP_GENERATE_TEAMS_AI_CUSTOM_API_FILES),
      openApiGenerateTeamsAiCustomApiFiles
    );
  });

  it("validateParams reports missing or unsupported OpenAPI step parameters", () => {
    assert.strictEqual(
      openApiGeneratePluginFiles.validateParams({ apiOperations: ["GET /pets"] }),
      "missing string parameter 'apiSpecLocation'"
    );
    assert.strictEqual(
      openApiGeneratePluginFiles.validateParams({ apiSpecLocation: "openapi.yml" }),
      "missing string[] parameter 'apiOperations'"
    );
    assert.strictEqual(
      openApiGenerateTeamsAiCustomApiFiles.validateParams({
        apiSpecLocation: "openapi.yml",
        apiOperations: ["GET /pets"],
        language: "csharp",
      }),
      "missing supported language parameter 'language'"
    );
  });

  it("returns SystemError results for invalid resolved params and missing render output", async () => {
    const invalidParams = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: "GET /pets" },
      makeCtx().ctx
    );
    assert.isTrue(invalidParams.isErr());
    assert.instanceOf(invalidParams._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(invalidParams._unsafeUnwrapErr().name, "OpenApiGenerateParams");

    const missingBaseFile = await openApiGenerateTeamsAiCustomApiFiles.apply(
      {
        apiSpecLocation: "openapi.yml",
        apiOperations: ["GET /pets"],
        language: ProgrammingLanguage.TS,
      },
      makeCtx().ctx
    );
    assert.isTrue(missingBaseFile.isErr());
    assert.strictEqual(missingBaseFile._unsafeUnwrapErr().name, "OpenApiGeneratedBaseFileMissing");
  });

  it("generates plugin files, registers the action, and injects API key registration yaml", async () => {
    const { ctx, files } = makeCtx({
      "appPackage/manifest.json": JSON.stringify({ name: "manifest" }),
      "appPackage/declarativeAgent.json": JSON.stringify({ name: "Agent" }),
      "m365agents.yml": "provision:\n  # Build app package with latest env value\n",
      "m365agents.local.yml": "provision:\n",
    });

    const result = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: ["GET /pets"] },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    if (!isRecordArray(agent.actions) || !isRecordArray(agent.conversation_starters)) {
      assert.fail("declarative agent should contain action and conversation starter arrays");
    }
    assert.deepInclude(agent.actions, { id: "action_1", file: "ai-plugin.json" });
    assert.deepInclude(agent.conversation_starters, { text: "Find pets" });
    assert.include(text(files, "m365agents.yml"), "uses: apiKey/register");
    assert.include(text(files, "m365agents.yml"), "registrationId: PETKEY_REGISTRATION_ID");
    assert.include(text(files, "m365agents.local.yml"), "uses: apiKey/register");
  });

  it("returns parse and shape errors for invalid generated OpenAPI JSON artifacts", async () => {
    const malformedAgent = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: ["GET /pets"] },
      makeCtx({
        "appPackage/manifest.json": JSON.stringify({ name: "manifest" }),
        "appPackage/declarativeAgent.json": "{",
      }).ctx
    );
    assert.isTrue(malformedAgent.isErr());
    assert.strictEqual(malformedAgent._unsafeUnwrapErr().name, "OpenApiDeclarativeAgentParse");

    mockSpecParserState.pluginManifest = [];
    const nonObjectPlugin = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: ["GET /pets"] },
      makeCtx({
        "appPackage/manifest.json": JSON.stringify({ name: "manifest" }),
        "appPackage/declarativeAgent.json": JSON.stringify({ name: "Agent" }),
      }).ctx
    );
    assert.isTrue(nonObjectPlugin.isErr());
    assert.strictEqual(nonObjectPlugin._unsafeUnwrapErr().name, "OpenApiPluginManifestShape");
  });

  it("falls back to operation summaries when plugin conversation starters are absent", async () => {
    mockSpecParserState.pluginManifest = {
      functions: [{}, { name: 1 }, { name: "getPets" }],
      capabilities: { conversation_starters: "none" },
    };
    mockSpecParserState.listOperations = [
      { api: "GET /ignored", isValid: false, operationId: "ignored", summary: "Ignored" },
      { api: "GET /missing", isValid: true, summary: "Missing id" },
      {
        api: "GET /pets",
        isValid: true,
        operationId: "getPets",
        description: "Fallback pets",
      },
    ];
    const { ctx, files } = makeCtx({
      "appPackage/manifest.json": JSON.stringify({ name: "manifest" }),
      "appPackage/declarativeAgent.json": JSON.stringify({ name: "Agent" }),
    });

    const result = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: ["GET /pets"] },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    if (!isRecordArray(agent.conversation_starters)) {
      assert.fail("declarative agent should contain conversation starters");
    }
    assert.deepInclude(agent.conversation_starters, { text: "Fallback pets" });
  });

  it("injects OAuth registration yaml for OAuth-protected OpenAPI operations", async () => {
    mockSpecParserState.listOperations = [
      {
        api: "GET /pets",
        isValid: true,
        server: "https://api.example.com",
        auth: { name: "petOAuth", authScheme: { type: "oauth2" } },
      },
    ];
    const { ctx, files } = makeCtx({
      "appPackage/manifest.json": JSON.stringify({ name: "manifest" }),
      "appPackage/declarativeAgent.json": JSON.stringify({ name: "Agent" }),
      "m365agents.yml": "provision:",
    });

    const result = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: ["GET /pets"] },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.include(text(files, "m365agents.yml"), "uses: oauth/register");
    assert.include(text(files, "m365agents.yml"), "configurationId: PETOAUTH_REGISTRATION_ID");
  });

  it("returns UserError when selected authenticated OpenAPI operations span servers", async () => {
    mockSpecParserState.listOperations = [
      {
        api: "GET /pets",
        isValid: true,
        server: "https://api.one.example.com",
        auth: { name: "petKey", authScheme: { type: "apiKey", in: "header" } },
      },
      {
        api: "POST /pets",
        isValid: true,
        server: "https://api.two.example.com",
        auth: { name: "otherKey", authScheme: { type: "http", scheme: "bearer" } },
      },
    ];
    const { ctx } = makeCtx({
      "appPackage/manifest.json": JSON.stringify({ name: "manifest" }),
      "appPackage/declarativeAgent.json": JSON.stringify({ name: "Agent" }),
    });

    const result = await openApiGeneratePluginFiles.apply(
      { apiSpecLocation: "openapi.yml", apiOperations: ["GET /pets", "POST /pets"] },
      ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), UserError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "OpenApiMultipleAuthServers");
  });

  it("updates TypeScript Teams AI custom API files from generated operations", async () => {
    const { ctx, files } = makeCtx({
      "appPackage/manifest.json": JSON.stringify({ bots: [{}] }),
      "src/app/app.ts": "// Replace with function definition code\n",
      "src/app/handlers.ts": "{{OPENAPI_SPEC_PATH}}\n// Replace with function handler code\n",
    });

    const result = await openApiGenerateTeamsAiCustomApiFiles.apply(
      {
        apiSpecLocation: "openapi.yaml",
        apiOperations: ["GET /pets"],
        language: ProgrammingLanguage.TS,
      },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const functions = readJsonObject(files, "src/app/functions.json");
    assert.containsAllKeys(functions, ["getPets"]);
    assert.include(text(files, "src/app/app.ts"), "functionDefs.getPets.name");
    assert.include(text(files, "src/app/handlers.ts"), "addAuthConfig(client)");
    assert.include(text(files, "src/app/handlers.ts"), "openapi.yaml");
    assert.include(text(files, "src/app/instructions.txt"), "Pet store APIs");
    assert.isTrue(files.has("src/adaptiveCards/getPets.json"));
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    if (!isRecordArray(manifest.bots)) {
      assert.fail("manifest should contain bot records");
    }
    assert.isArray(manifest.bots[0].commandLists);
  });

  it("updates Python Teams AI custom API files from generated operations", async () => {
    const { ctx, files } = makeCtx({
      "appPackage/manifest.json": JSON.stringify({ bots: [{}] }),
      "src/app.py":
        "// Replace with function definition code\n//Replace with functions to be imported\n",
      "src/handlers.py": "{{OPENAPI_SPEC_PATH}}\n// Replace with function handler code\n",
    });

    const result = await openApiGenerateTeamsAiCustomApiFiles.apply(
      {
        apiSpecLocation: "openapi.json",
        apiOperations: ["GET /pets"],
        language: ProgrammingLanguage.PY,
      },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.include(text(files, "src/app.py"), 'function_defs["getPets"]["name"]');
    assert.include(text(files, "src/app.py"), "getPets");
    assert.include(text(files, "src/handlers.py"), "openapi.json");
    assert.include(text(files, "src/handlers.py"), "async def getPets");
    assert.isTrue(files.has("src/adaptiveCards/getPets.json"));
  });

  it("returns Teams AI validation and filtered-spec errors", async () => {
    mockSpecParserState.validationStatus = "Error";
    const validation = await openApiGenerateTeamsAiCustomApiFiles.apply(
      {
        apiSpecLocation: "openapi.yaml",
        apiOperations: ["GET /pets"],
        language: ProgrammingLanguage.JS,
      },
      makeCtx({
        "appPackage/manifest.json": JSON.stringify({ bots: [{}] }),
        "src/app/app.js": "// Replace with function definition code\n",
        "src/app/handlers.js": "{{OPENAPI_SPEC_PATH}}\n// Replace with function handler code\n",
      }).ctx
    );
    assert.isTrue(validation.isErr());
    assert.strictEqual(validation._unsafeUnwrapErr().name, "OpenApiSpecInvalid");

    mockSpecParserState.validationStatus = "Ok";
    mockSpecParserState.filteredSpec = undefined;
    const missingSpec = await openApiGenerateTeamsAiCustomApiFiles.apply(
      {
        apiSpecLocation: "openapi.yaml",
        apiOperations: ["GET /pets"],
        language: ProgrammingLanguage.JS,
      },
      makeCtx({
        "appPackage/manifest.json": JSON.stringify({ bots: [{}] }),
        "src/app/app.js": "// Replace with function definition code\n",
        "src/app/handlers.js": "{{OPENAPI_SPEC_PATH}}\n// Replace with function handler code\n",
      }).ctx
    );
    assert.isTrue(missingSpec.isErr());
    assert.strictEqual(missingSpec._unsafeUnwrapErr().name, "OpenApiTeamsAiFilteredSpecMissing");
  });

  it("returns a Teams AI error when the filtered spec has no operation ids", async () => {
    mockSpecParserState.filteredSpec = { paths: { "/pets": { get: { summary: "No id" } } } };
    const result = await openApiGenerateTeamsAiCustomApiFiles.apply(
      {
        apiSpecLocation: "openapi.yaml",
        apiOperations: ["GET /pets"],
        language: ProgrammingLanguage.JS,
      },
      makeCtx({
        "appPackage/manifest.json": JSON.stringify({ bots: [{}] }),
        "src/app/app.js": "// Replace with function definition code\n",
        "src/app/handlers.js": "{{OPENAPI_SPEC_PATH}}\n// Replace with function handler code\n",
      }).ctx
    );

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "OpenApiTeamsAiOperationsMissing");
  });
});
