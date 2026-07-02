// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  InputTextConfig,
  InputTextResult,
  MultiSelectConfig,
  MultiSelectResult,
  OptionItem as SurfaceOptionItem,
  Platform,
  SelectFolderConfig,
  SelectFolderResult,
  SingleSelectConfig,
  SingleSelectResult,
  SystemError,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs, { removeSync, writeJsonSync } from "fs-extra";
import os from "os";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { INPUT_VALIDATION_FAILED } from "../../../src/v4/collectInputs/collectInputs";
import { openCreateQuestions } from "../../../src/v4/distribution/createQuestions";
import { openDeclarativePackageMetadata } from "../../../src/v4/distribution/declarativePackage";
import { DeclarativeLocator } from "../../../src/v4/model/dataModel";
import { createUiPromptUI } from "../../../src/v4/surface/uiPromptUI";
import { gateLanguagesBySurface, runCreateInputs } from "../../../src/v4/surface/createInputs";
import { assert } from "vitest";

/**
 * Tests for docs/03-specs/operations/scaffolding/collect-create-inputs.md.
 * One `it` per CCI-* acceptance-criteria row. v4-isolated (no v3 import).
 *
 * The floor is built in-memory from the loose `templates/v4` source — the same
 * `addLocalFolder(templates/v4, "v4")` layout `generateV4Zip.js` ships — so the
 * real shipped `da/mcp-server` `questions.json` + `descriptor.json` are exercised
 * with no built `templates.zip` artifact (CI-clean).
 */

const TEMPLATES_V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");
const MCP_DA: DeclarativeLocator = { kind: "create", templateId: "da/mcp-server" };
const STATIC_MCP_DA: DeclarativeLocator = {
  kind: "create",
  templateId: "da/mcp-server-static",
};
const LANGUAGE_DA: DeclarativeLocator = {
  kind: "create",
  templateId: "test/language-axis",
};
const OPENAPI_DA: DeclarativeLocator = {
  kind: "create",
  templateId: "da/api-plugin-from-existing-api",
};
const GRAPH_CONNECTOR: DeclarativeLocator = {
  kind: "create",
  templateId: "graph-connector",
};
const BASIC_CUSTOM_ENGINE_AGENT: DeclarativeLocator = {
  kind: "create",
  templateId: "basic-custom-engine-agent",
};
const WEATHER_AGENT: DeclarativeLocator = {
  kind: "create",
  templateId: "weather-agent",
};
const CUSTOM_COPILOT_BASIC: DeclarativeLocator = {
  kind: "create",
  templateId: "custom-copilot-basic",
};
const RAG_AZURE_AI_SEARCH: DeclarativeLocator = {
  kind: "create",
  templateId: "custom-copilot-rag-azure-ai-search",
};
const RAG_CUSTOM_API: DeclarativeLocator = {
  kind: "create",
  templateId: "custom-copilot-rag-custom-api",
};
const OPENAPI_SPEC = path.resolve(__dirname, "../scenarios/fixtures/repairs-openapi.yaml");

function buildFloor(): Buffer {
  const zip = new AdmZip();
  zip.addLocalFolder(TEMPLATES_V4_DIR, "v4");
  return zip.toBuffer();
}

function buildLanguageFloor(): Buffer {
  const zip = new AdmZip();
  const root = "v4/create/test/language-axis";
  zip.addFile(
    `${root}/descriptor.json`,
    Buffer.from(JSON.stringify({ id: "test/language-axis", languages: ["typescript", "csharp"] }))
  );
  zip.addFile(`${root}/questions.json`, Buffer.from(JSON.stringify({ questions: [] })));
  zip.addFile(`${root}/pipeline.json`, Buffer.from("{}"));
  return zip.toBuffer();
}

const localMcpServers = [
  {
    name: "ghmcp",
    display_name: "GitHub MCP",
    description: "GitHub tools",
    version: "1.0.0",
    identifier: "github",
    tools: [],
    packageFamily: "GitHub.MCP",
    command: "npx",
    args: ["-y", "@github/github-mcp-server"],
  },
  {
    name: "baremcp",
    display_name: "",
    description: "",
    version: "1.0.0",
    identifier: "bare",
    tools: [{ name: "inspect", description: "Inspect", inputSchema: {} }],
    packageFamily: "Bare.MCP",
    command: "baremcp",
    args: [],
  },
];

interface Script {
  select?: Record<string, string>;
  text?: Record<string, string>;
  folder?: Record<string, string>;
  multi?: Record<string, string[]>;
  back?: string[];
}

function noAnswer(name: string): FxError {
  return new UserError({ source: "Test", name: "NoScriptedAnswer", message: name });
}

/**
 * A scripted host `UserInteraction`: answers `selectOption` / `inputText` /
 * `selectOptions` from a per-name script and records every config it saw. Only
 * the three faces the create bridge drives are implemented; the cast in `asUI`
 * is test-only (the src no-`as` rule does not apply to tests).
 */
class ScriptedUserInteraction {
  promptNames: string[] = [];
  selectNames: string[] = [];
  textNames: string[] = [];
  folderNames: string[] = [];
  multiNames: string[] = [];
  lastSelectConfig?: SingleSelectConfig;
  lastInputConfig?: InputTextConfig;
  lastFolderConfig?: SelectFolderConfig;
  lastMultiConfig?: MultiSelectConfig;
  constructor(private readonly script: Script) {}

  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    this.promptNames.push(config.name);
    this.selectNames.push(config.name);
    this.lastSelectConfig = config;
    if (this.script.back?.includes(config.name) === true) {
      return Promise.resolve(ok({ type: "back" }));
    }
    const answer = this.script.select?.[config.name];
    if (answer === undefined) {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    const result: SingleSelectResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }

  inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    this.promptNames.push(config.name);
    this.textNames.push(config.name);
    this.lastInputConfig = config;
    if (this.script.back?.includes(config.name) === true) {
      return Promise.resolve(ok({ type: "back" }));
    }
    const answer = this.script.text?.[config.name];
    if (answer === undefined) {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    const result: InputTextResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }

  selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    this.promptNames.push(config.name);
    this.folderNames.push(config.name);
    this.lastFolderConfig = config;
    if (this.script.back?.includes(config.name) === true) {
      return Promise.resolve(ok({ type: "back" }));
    }
    const answer = this.script.folder?.[config.name];
    if (answer === undefined) {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    const result: SelectFolderResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }

  selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    this.promptNames.push(config.name);
    this.multiNames.push(config.name);
    this.lastMultiConfig = config;
    if (this.script.back?.includes(config.name) === true) {
      return Promise.resolve(ok({ type: "back" }));
    }
    const answer = this.script.multi?.[config.name];
    if (answer === undefined) {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    const result: MultiSelectResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }
}

function asUI(scripted: ScriptedUserInteraction): UserInteraction {
  return scripted as unknown as UserInteraction;
}

function multiOptionAt(config: MultiSelectConfig | undefined, index: number): SurfaceOptionItem {
  if (config === undefined) {
    assert.fail("expected a multi-select config");
  }
  if (!Array.isArray(config.options)) {
    assert.fail("expected static multi-select options");
  }
  const option = config.options[index];
  if (option === undefined) {
    assert.fail(`expected multi-select option at index ${index}`);
  }
  if (typeof option === "string") {
    assert.fail(`expected multi-select option item at index ${index}`);
  }
  return option;
}

describe("runCreateInputs (collect-create-inputs)", () => {
  it("CCI-00: metadata-only bytes drive Q2 language gating without content", async () => {
    const ui = new ScriptedUserInteraction({});

    const res = await runCreateInputs(buildLanguageFloor(), LANGUAGE_DA, {}, asUI(ui), {
      flagReader: () => true,
      surface: "vscode",
    });

    assert.isTrue(res.isOk(), res.isErr() ? `${res.error.name}: ${res.error.message}` : "ok");
    if (res.isOk()) {
      assert.deepEqual(res.value, { language: "typescript", surface: "vscode" });
    }
    assert.deepEqual(ui.selectNames, []);
  });

  it("CCI-01: remote-only provider auto-skips mcpServerType, asks url + authType=none", async () => {
    const ui = new ScriptedUserInteraction({
      text: { mcpServerUrl: "https://api.example.com/mcp" },
      select: { authType: "none" },
    });

    const res = await runCreateInputs(buildFloor(), MCP_DA, {}, asUI(ui), {
      listLocalMcpServers: async () => [],
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, {
        surface: "vscode",
        mcpServerType: "remote",
        mcpServerUrl: "https://api.example.com/mcp",
        authType: "none",
      });
    }
    // mcpServerType has a single option (remote-only) + skipSingleOption -> never prompted.
    assert.notInclude(ui.selectNames, "mcpServerType");
    assert.deepEqual(ui.selectNames, ["authType"]);
    assert.deepEqual(ui.textNames, ["mcpServerUrl"]);
  });

  it("CCI-17: openapi.operations provider lists operations from the selected OpenAPI document", async () => {
    const ui = new ScriptedUserInteraction({
      multi: { apiOperations: ["GET /repairs"] },
    });

    const res = await runCreateInputs(
      buildFloor(),
      OPENAPI_DA,
      { apiSpecLocation: OPENAPI_SPEC },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, {
        surface: "vscode",
        apiSpecLocation: OPENAPI_SPEC,
        apiOperations: ["GET /repairs"],
      });
    }
    assert.deepEqual(ui.textNames, []);
    assert.deepEqual(ui.multiNames, ["apiOperations"]);
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).id, "GET /repairs");
  });

  it("validates Graph connector display name", async () => {
    const ui = new ScriptedUserInteraction({
      text: { graphConnectorName: "   " },
    });

    const res = await runCreateInputs(buildFloor(), GRAPH_CONNECTOR, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isErr(), "expected empty graph connector name to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_VALIDATION_FAILED);
    assert.include(res._unsafeUnwrapErr().message, "must not be empty");
  });

  const invalidGraphConnectorConnectionIds = [
    { value: "gh", message: "must be at least 3 characters" },
    { value: "github-issues", message: "must contain only alphanumeric characters" },
    { value: "githubissuesgithubissuesgithubissues1", message: "must be at most 32 characters" },
    { value: "MicrosoftGraph", message: "must not begin with 'Microsoft'" },
  ];

  for (const invalid of invalidGraphConnectorConnectionIds) {
    it(`validates Graph connector connection id '${invalid.value}'`, async () => {
      const ui = new ScriptedUserInteraction({
        text: {
          graphConnectorName: "GitHub Issues",
          graphConnectorConnectionId: invalid.value,
        },
      });

      const res = await runCreateInputs(buildFloor(), GRAPH_CONNECTOR, {}, asUI(ui), {
        flagReader: () => false,
      });

      assert.isTrue(res.isErr(), `expected '${invalid.value}' to fail`);
      assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_VALIDATION_FAILED);
      assert.include(res._unsafeUnwrapErr().message, invalid.message);
    });
  }

  it("collects valid Graph connector inputs", async () => {
    const ui = new ScriptedUserInteraction({
      text: {
        graphConnectorName: "GitHub Issues",
        graphConnectorConnectionId: "githubissues",
      },
    });

    const res = await runCreateInputs(buildFloor(), GRAPH_CONNECTOR, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.deepEqual(res.value, {
        surface: "vscode",
        language: "typescript",
        graphConnectorName: "GitHub Issues",
        graphConnectorConnectionId: "githubissues",
      });
    }
    assert.deepEqual(ui.textNames, ["graphConnectorName", "graphConnectorConnectionId"]);
  });

  it("collects the General Teams Agent OpenAI service answers", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai" },
      text: { openAIKey: "faked_openapi_key" },
    });

    const res = await runCreateInputs(
      buildFloor(),
      CUSTOM_COPILOT_BASIC,
      { language: "typescript" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.llmService, "llm-service-openai");
      assert.equal(res.value.openAIKey, "faked_openapi_key");
      assert.notProperty(res.value, "azureOpenAIKey");
    }
    assert.deepEqual(ui.selectNames, ["llmService"]);
    assert.deepEqual(ui.textNames, ["openAIKey"]);
  });

  it("collects Basic Custom Engine Agent OpenAI service answers", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai" },
      text: { openAIKey: "fake-openai-key" },
    });

    const res = await runCreateInputs(
      buildFloor(),
      BASIC_CUSTOM_ENGINE_AGENT,
      { language: "typescript" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.llmService, "llm-service-openai");
      assert.equal(res.value.openAIKey, "fake-openai-key");
      assert.notProperty(res.value, "azureOpenAIKey");
    }
    assert.deepEqual(ui.selectNames, ["llmService"]);
    assert.deepEqual(ui.textNames, ["openAIKey"]);
  });

  it("collects Basic Custom Engine Agent Q2 and create floor in one walk", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai", language: "typescript" },
      text: { openAIKey: "fake-openai-key", "app-name": "MyAgent" },
      folder: { folder: "C:/src" },
    });

    const res = await runCreateInputs(buildFloor(), BASIC_CUSTOM_ENGINE_AGENT, {}, asUI(ui), {
      flagReader: () => false,
      inputs: { platform: Platform.VSCode },
      surface: "vscode",
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.llmService, "llm-service-openai");
      assert.equal(res.value.openAIKey, "fake-openai-key");
      assert.equal(res.value.folder, "C:/src");
      assert.equal(res.value["app-name"], "MyAgent");
      assert.equal(res.value.language, "typescript");
    }
    assert.deepEqual(ui.promptNames, ["llmService", "openAIKey", "language", "folder", "app-name"]);
  });

  it("uses create floor defaults without prompts in non-interactive mode", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai", language: "typescript" },
      text: { openAIKey: "fake-openai-key" },
    });

    const res = await runCreateInputs(buildFloor(), BASIC_CUSTOM_ENGINE_AGENT, {}, asUI(ui), {
      surface: "cli",
      flagReader: () => false,
      inputs: {
        platform: Platform.CLI,
        nonInteractive: true,
        teamsAppFromTdp: { appName: "My Agent" },
      },
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.folder, "./");
      assert.equal(res.value["app-name"], "MyAgent");
    }
    assert.notInclude(ui.promptNames, "folder");
    assert.notInclude(ui.promptNames, "app-name");
  });

  it("fails non-interactive create floor when app name has no default", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai", language: "typescript" },
      text: { openAIKey: "fake-openai-key" },
    });

    const res = await runCreateInputs(buildFloor(), BASIC_CUSTOM_ENGINE_AGENT, {}, asUI(ui), {
      surface: "cli",
      flagReader: () => false,
      inputs: { platform: Platform.CLI, nonInteractive: true },
    });

    assert.isTrue(res.isErr(), "expected missing app-name default to fail");
    assert.equal(res._unsafeUnwrapErr().name, "MissingRequiredInputError");
  });

  it("surfaces create floor folder prompt errors", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai", language: "typescript" },
      text: { openAIKey: "fake-openai-key", "app-name": "MyAgent" },
    });

    const res = await runCreateInputs(buildFloor(), BASIC_CUSTOM_ENGINE_AGENT, {}, asUI(ui), {
      flagReader: () => false,
      inputs: { platform: Platform.VSCode },
      surface: "vscode",
    });

    assert.isTrue(res.isErr(), "expected missing scripted folder answer to fail");
    assert.equal(res._unsafeUnwrapErr().name, "NoScriptedAnswer");
    assert.deepEqual(ui.folderNames, ["folder"]);
  });

  it("validates preset create floor app name after collecting Q2", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-openai" },
      text: { openAIKey: "fake-openai-key" },
    });

    const res = await runCreateInputs(
      buildFloor(),
      BASIC_CUSTOM_ENGINE_AGENT,
      { language: "typescript" },
      asUI(ui),
      {
        flagReader: () => false,
        inputs: { platform: Platform.CLI, folder: "C:/src", "app-name": "!" },
        surface: "cli",
      }
    );

    assert.isTrue(res.isErr(), "expected invalid preset app name to fail");
    assert.equal(res._unsafeUnwrapErr().name, "InputValidationError");
  });

  it("collects Weather Agent Azure OpenAI service answers", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-azure-openai" },
      text: {
        azureOpenAIKey: "fake-azure-openai-key",
        azureOpenAIEndpoint: "https://fake.openai.azure.com/",
        azureOpenAIDeploymentName: "fake-deployment",
      },
    });

    const res = await runCreateInputs(
      buildFloor(),
      WEATHER_AGENT,
      { language: "typescript" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.llmService, "llm-service-azure-openai");
      assert.equal(res.value.azureOpenAIKey, "fake-azure-openai-key");
      assert.equal(res.value.azureOpenAIEndpoint, "https://fake.openai.azure.com/");
      assert.equal(res.value.azureOpenAIDeploymentName, "fake-deployment");
      assert.notProperty(res.value, "openAIKey");
    }
    assert.deepEqual(ui.selectNames, ["llmService"]);
    assert.deepEqual(ui.textNames, [
      "azureOpenAIKey",
      "azureOpenAIEndpoint",
      "azureOpenAIDeploymentName",
    ]);
  });

  it("collects Azure OpenAI service answers for the Azure AI Search RAG template", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-azure-openai" },
      text: {
        azureOpenAIKey: "fake-azure-openai-key",
        azureOpenAIEndpoint: "https://fake.openai.azure.com/",
        azureOpenAIDeploymentName: "fake-deployment",
      },
    });

    const res = await runCreateInputs(
      buildFloor(),
      RAG_AZURE_AI_SEARCH,
      { language: "typescript" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.llmService, "llm-service-azure-openai");
      assert.equal(res.value.azureOpenAIKey, "fake-azure-openai-key");
      assert.equal(res.value.azureOpenAIEndpoint, "https://fake.openai.azure.com/");
      assert.equal(res.value.azureOpenAIDeploymentName, "fake-deployment");
      assert.notProperty(res.value, "openAIKey");
    }
    assert.deepEqual(ui.selectNames, ["llmService"]);
    assert.deepEqual(ui.textNames, [
      "azureOpenAIKey",
      "azureOpenAIEndpoint",
      "azureOpenAIDeploymentName",
    ]);
  });

  it("collects custom API OpenAPI inputs before LLM inputs", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-azure-openai" },
      text: {
        apiSpecLocation: OPENAPI_SPEC,
        azureOpenAIKey: "fake-azure-openai-key",
        azureOpenAIEndpoint: "https://fake.openai.azure.com/",
        azureOpenAIDeploymentName: "fake-deployment",
      },
      multi: { apiOperations: ["GET /repairs"] },
    });

    const res = await runCreateInputs(
      buildFloor(),
      RAG_CUSTOM_API,
      { language: "typescript" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.apiSpecLocation, OPENAPI_SPEC);
      assert.deepEqual(res.value.apiOperations, ["GET /repairs"]);
      assert.equal(res.value.llmService, "llm-service-azure-openai");
      assert.equal(res.value.azureOpenAIKey, "fake-azure-openai-key");
      assert.equal(res.value.azureOpenAIEndpoint, "https://fake.openai.azure.com/");
      assert.equal(res.value.azureOpenAIDeploymentName, "fake-deployment");
    }
    assert.deepEqual(ui.promptNames, [
      "apiSpecLocation",
      "apiOperations",
      "llmService",
      "azureOpenAIKey",
      "azureOpenAIEndpoint",
      "azureOpenAIDeploymentName",
    ]);
  });

  it("lists static MCP tools from the provided tools JSON", async () => {
    const toolsJson = JSON.stringify({
      tools: [
        { name: "searchFlights", description: "Search available flights" },
        { name: "bookFlight" },
      ],
    });
    const ui = new ScriptedUserInteraction({
      multi: { selectedMcpTools: ["searchFlights"] },
    });

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp", mcpToolsJson: toolsJson },
      asUI(ui),
      { surface: "cli", flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepEqual(res._unsafeUnwrap().selectedMcpTools, ["searchFlights"]);
    assert.deepEqual(ui.multiNames, ["selectedMcpTools"]);
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).id, "searchFlights");
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).detail, "Search available flights");
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 1).id, "bookFlight");
  });

  it("lists static MCP tools from the provided tools file path", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-mcp-tools-"));
    const toolsPath = path.join(tempDir, "mcp-tools.json");
    writeJsonSync(toolsPath, {
      tools: [
        { name: "searchFlights", description: "Search available flights" },
        { name: "bookFlight" },
      ],
    });
    const ui = new ScriptedUserInteraction({
      multi: { selectedMcpTools: ["searchFlights"] },
    });

    try {
      const res = await runCreateInputs(
        buildFloor(),
        STATIC_MCP_DA,
        { mcpServerUrl: "https://api.example.com/mcp", mcpToolsFilePath: toolsPath },
        asUI(ui),
        { surface: "cli", flagReader: () => false }
      );

      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      assert.deepEqual(res._unsafeUnwrap().selectedMcpTools, ["searchFlights"]);
      assert.deepEqual(ui.textNames, []);
      assert.deepEqual(ui.multiNames, ["selectedMcpTools"]);
      assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).id, "searchFlights");
      assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 1).id, "bookFlight");
    } finally {
      removeSync(tempDir);
    }
  });

  it("fetches static MCP tools from the server URL when the CLI tools path is blank", async () => {
    const ui = new ScriptedUserInteraction({
      text: { mcpToolsFilePath: "" },
      multi: { selectedMcpTools: ["searchFlights"] },
    });

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp" },
      asUI(ui),
      {
        surface: "cli",
        flagReader: () => false,
        fetchMcpTools: async () => ({
          requiresAuth: false,
          tools: [
            { name: "searchFlights", description: "Search flights", inputSchema: {} },
            { name: "bookFlight", description: "Book flights", inputSchema: {} },
          ],
        }),
      }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepEqual(ui.textNames, ["mcpToolsFilePath"]);
    assert.deepEqual(ui.multiNames, ["selectedMcpTools"]);
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).id, "searchFlights");
    assert.deepEqual(res._unsafeUnwrap().selectedMcpTools, ["searchFlights"]);
  });

  it("skips static MCP tool prompts in non-interactive CLI create", async () => {
    const ui = new ScriptedUserInteraction({});
    let fetchCalled = false;

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp" },
      asUI(ui),
      {
        surface: "cli",
        inputs: { nonInteractive: true, folder: "C:/src", "app-name": "MyAgent" },
        flagReader: () => false,
        fetchMcpTools: async () => {
          fetchCalled = true;
          return {
            requiresAuth: false,
            tools: [
              { name: "searchFlights", description: "Search flights", inputSchema: {} },
              { name: "bookFlight", description: "Book flights", inputSchema: {} },
            ],
          };
        },
      }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepEqual(ui.textNames, []);
    assert.deepEqual(ui.multiNames, []);
    assert.isFalse(fetchCalled);
    assert.notProperty(res._unsafeUnwrap(), "selectedMcpTools");
    assert.notProperty(res._unsafeUnwrap(), "mcpToolsJson");
  });

  it("fails when static MCP tool auto-fetch requires auth", async () => {
    const ui = new ScriptedUserInteraction({ text: { mcpToolsFilePath: "" } });

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp" },
      asUI(ui),
      {
        surface: "cli",
        flagReader: () => false,
        fetchMcpTools: async () => ({ requiresAuth: true, tools: [] }),
      }
    );

    assert.isTrue(res.isErr(), "expected auth-required fetch to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, "McpAuthRequired");
  });

  it("fails when static MCP tool auto-fetch returns no tools", async () => {
    const ui = new ScriptedUserInteraction({ text: { mcpToolsFilePath: "" } });

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp" },
      asUI(ui),
      {
        surface: "cli",
        flagReader: () => false,
        fetchMcpTools: async () => ({ requiresAuth: false, tools: [] }),
      }
    );

    assert.isTrue(res.isErr(), "expected empty tool fetch to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, "McpToolsNotFound");
  });

  it("surfaces a UserError when the static MCP tools file cannot be read", async () => {
    const ui = new ScriptedUserInteraction({});

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      {
        mcpServerUrl: "https://api.example.com/mcp",
        mcpToolsFilePath: path.join(os.tmpdir(), "missing-mcp-tools.json"),
      },
      asUI(ui),
      { surface: "cli", flagReader: () => false }
    );

    assert.isTrue(res.isErr(), "expected missing tools file to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, "McpToolsFileReadFailed");
  });

  it("surfaces parser errors from the static MCP tools file", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-mcp-tools-"));
    const toolsPath = path.join(tempDir, "mcp-tools.json");
    fs.writeFileSync(toolsPath, "not json", "utf8");
    const ui = new ScriptedUserInteraction({});

    try {
      const res = await runCreateInputs(
        buildFloor(),
        STATIC_MCP_DA,
        { mcpServerUrl: "https://api.example.com/mcp", mcpToolsFilePath: toolsPath },
        asUI(ui),
        { surface: "cli", flagReader: () => false }
      );

      assert.isTrue(res.isErr(), "expected invalid tools file to fail");
      assert.strictEqual(res._unsafeUnwrapErr().name, "McpStaticToolsParse");
    } finally {
      removeSync(tempDir);
    }
  });

  it("skips static MCP tools collection on VS Code", async () => {
    const ui = new ScriptedUserInteraction({});

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp" },
      asUI(ui),
      { surface: "vscode", flagReader: () => false }
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.surface, "vscode");
      assert.notProperty(res.value, "mcpToolsJson");
      assert.notProperty(res.value, "selectedMcpTools");
    }
    assert.deepEqual(ui.textNames, []);
    assert.deepEqual(ui.multiNames, []);
  });

  it("surfaces fetch errors when static MCP tools JSON and file path are missing", async () => {
    const ui = new ScriptedUserInteraction({ text: { mcpToolsFilePath: "" } });

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp" },
      asUI(ui),
      {
        surface: "cli",
        flagReader: () => false,
        fetchMcpTools: async () => {
          throw new Error("network down");
        },
      }
    );

    assert.isTrue(res.isErr(), "expected tools fetch to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, "McpToolsFetchFailed");
  });

  it("surfaces parser errors from static MCP tools JSON", async () => {
    const ui = new ScriptedUserInteraction({});

    const res = await runCreateInputs(
      buildFloor(),
      STATIC_MCP_DA,
      { mcpServerUrl: "https://api.example.com/mcp", mcpToolsJson: "not json" },
      asUI(ui),
      { surface: "cli", flagReader: () => false }
    );

    assert.isTrue(res.isErr(), "expected invalid tools JSON to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, "McpStaticToolsParse");
  });

  it("CCI-02: local MCP pick skips remote URL/auth and asks selected local servers", async () => {
    let listCalls = 0;
    const ui = new ScriptedUserInteraction({
      select: { mcpServerType: "local" },
      multi: { selectedLocalServers: ["baremcp"] },
    });

    const res = await runCreateInputs(buildFloor(), MCP_DA, {}, asUI(ui), {
      listLocalMcpServers: async () => {
        listCalls += 1;
        return localMcpServers;
      },
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.mcpServerType, "local");
      assert.notProperty(res.value, "mcpServerUrl");
      assert.notProperty(res.value, "authType");
      assert.deepEqual(res.value.selectedLocalServers, ["baremcp"]);
    }
    // mcpServerType prompted (local is available); remote URL/auth questions are skipped.
    assert.deepEqual(ui.selectNames, ["mcpServerType"]);
    assert.deepEqual(ui.textNames, []);
    assert.deepEqual(ui.multiNames, ["selectedLocalServers"]);
    assert.strictEqual(listCalls, 1);
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).label, "GitHub MCP");
    assert.strictEqual(
      multiOptionAt(ui.lastMultiConfig, 0).detail,
      "GitHub tools (0 tools available)"
    );
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 1).label, "baremcp");
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 1).detail, "1 tools available");
  });

  it("CCI-03: an entryParams mcpServerUrl is used as-is (not prompted); authType=oauth", async () => {
    const ui = new ScriptedUserInteraction({
      select: { authType: "oauth" },
      text: {
        oauthClientId: "client-id",
        oauthClientSecret: "client-secret",
        oauthScopes: "scope.read",
      },
    });

    const res = await runCreateInputs(
      buildFloor(),
      MCP_DA,
      { mcpServerUrl: "https://seed.example.com/mcp" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.mcpServerUrl, "https://seed.example.com/mcp");
      assert.equal(res.value.mcpServerType, "remote");
      assert.equal(res.value.authType, "oauth");
      assert.equal(res.value.oauthClientId, "client-id");
      assert.equal(res.value.oauthClientSecret, "client-secret");
      assert.equal(res.value.oauthScopes, "scope.read");
    }
    // The pre-filled url is used as-is (INPUT-12); only OAuth credential prompts run.
    assert.deepEqual(ui.textNames, ["oauthClientId", "oauthClientSecret", "oauthScopes"]);
  });

  it("CCI-03b: authType=entra-sso asks only Entra client id", async () => {
    const ui = new ScriptedUserInteraction({
      select: { authType: "entra-sso" },
      text: { entraClientId: "entra-client-id" },
    });

    const res = await runCreateInputs(
      buildFloor(),
      MCP_DA,
      { mcpServerUrl: "https://seed.example.com/mcp" },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.authType, "entra-sso");
      assert.equal(res.value.entraClientId, "entra-client-id");
      assert.notProperty(res.value, "oauthClientSecret");
      assert.notProperty(res.value, "oauthScopes");
    }
    assert.deepEqual(ui.textNames, ["entraClientId"]);
  });

  it("CCI-04: an invalid uri for mcpServerUrl -> UserError INPUT_VALIDATION_FAILED", async () => {
    const ui = new ScriptedUserInteraction({ text: { mcpServerUrl: "not a uri" } });

    const res = await runCreateInputs(buildFloor(), MCP_DA, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.instanceOf(res.error, UserError);
      assert.equal(res.error.name, INPUT_VALIDATION_FAILED);
    }
  });

  it("CCI-05: da/mcp-server languages=['common'] -> no language axis asked", async () => {
    const ui = new ScriptedUserInteraction({
      text: { mcpServerUrl: "https://api.example.com/mcp" },
      select: { authType: "none" },
    });

    const res = await runCreateInputs(buildFloor(), MCP_DA, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.notProperty(res.value, "language");
    }
    assert.notInclude(ui.selectNames, "language");
  });

  it("uses the default env flag reader to keep csharp on CLI when .NET is enabled", async () => {
    const saved = process.env.TEAMSFX_CLI_DOTNET;
    process.env.TEAMSFX_CLI_DOTNET = "true";
    const ui = new ScriptedUserInteraction({ select: { language: "csharp" } });

    try {
      const res = await runCreateInputs(buildLanguageFloor(), LANGUAGE_DA, {}, asUI(ui), {
        surface: "cli",
      });

      assert.isTrue(res.isOk(), res.isErr() ? `${res.error.name}: ${res.error.message}` : "ok");
      if (res.isOk()) {
        assert.equal(res.value.language, "csharp");
      }
      assert.deepEqual(ui.selectNames, ["language"]);
    } finally {
      if (saved === undefined) {
        delete process.env.TEAMSFX_CLI_DOTNET;
      } else {
        process.env.TEAMSFX_CLI_DOTNET = saved;
      }
    }
  });
});

describe("gateLanguagesBySurface (csharp surface/flag gate)", () => {
  // The .NET gate reads v3's `FeatureFlags.CLIDotNet` name ("TEAMSFX_CLI_DOTNET").
  const dotnetOn = (name: string): boolean => name === "TEAMSFX_CLI_DOTNET";
  const dotnetOff = (): boolean => false;

  it("CCI-14: drops csharp on the VS Code surface regardless of the .NET flag", () => {
    assert.deepEqual(
      gateLanguagesBySurface(["typescript", "csharp", "javascript"], "vscode", dotnetOn),
      ["typescript", "javascript"]
    );
    assert.deepEqual(gateLanguagesBySurface(["typescript", "csharp"], "vscode", dotnetOff), [
      "typescript",
    ]);
  });

  it("CCI-15: keeps csharp on the CLI / VS surfaces only when TEAMSFX_CLI_DOTNET is on", () => {
    assert.deepEqual(gateLanguagesBySurface(["typescript", "csharp"], "cli", dotnetOn), [
      "typescript",
      "csharp",
    ]);
    assert.deepEqual(gateLanguagesBySurface(["typescript", "csharp"], "vs", dotnetOn), [
      "typescript",
      "csharp",
    ]);
    assert.deepEqual(gateLanguagesBySurface(["typescript", "csharp"], "cli", dotnetOff), [
      "typescript",
    ]);
  });

  it("CCI-16: leaves non-csharp language lists untouched, order preserved", () => {
    assert.deepEqual(gateLanguagesBySurface(["typescript", "javascript"], "vscode", dotnetOff), [
      "typescript",
      "javascript",
    ]);
    assert.deepEqual(gateLanguagesBySurface(["common"], "vscode", dotnetOff), ["common"]);
  });
});

describe("createUiPromptUI (collect-create-inputs)", () => {
  it("CCI-06: ask maps a singleSelect to selectOption and returns the chosen id", async () => {
    const ui = new ScriptedUserInteraction({ select: { picker: "b" } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask({ name: "picker", type: "singleSelect", title: "Pick" }, [
      { id: "a", label: "A" },
      { id: "b" },
    ]);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "value", value: "b" });
    }
    assert.equal(ui.lastSelectConfig?.returnObject, false);
    const options = (ui.lastSelectConfig?.options ?? []) as SurfaceOptionItem[];
    assert.equal(options.length, 2);
    assert.equal(options[0].id, "a");
    assert.equal(options[0].label, "A");
    // a v4 option with no label defaults its surface label to its id.
    assert.equal(options[1].id, "b");
    assert.equal(options[1].label, "b");
  });

  it("CCI-07: ask maps a text question to inputText and returns the string", async () => {
    const ui = new ScriptedUserInteraction({ text: { freeText: "hello world" } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask({ name: "freeText", type: "text", title: "Enter" }, undefined);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "value", value: "hello world" });
    }
    assert.deepEqual(ui.textNames, ["freeText"]);
  });

  it("maps a folder question to selectFolder and returns the path", async () => {
    const ui = new ScriptedUserInteraction({ folder: { folder: "C:/src" } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      {
        name: "folder",
        type: "folder",
        title: "Workspace Folder",
        placeholder: "Pick a folder",
        prompt: "Choose where to create the project.",
        default: "C:/default",
      },
      undefined,
      3
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "value", value: "C:/src" });
    }
    assert.deepEqual(ui.folderNames, ["folder"]);
    assert.equal(ui.lastFolderConfig?.default, "C:/default");
    assert.equal(ui.lastFolderConfig?.step, 3);
  });

  it("CCI-08: askMulti maps a multiSelect to selectOptions and returns the ids", async () => {
    const ui = new ScriptedUserInteraction({ multi: { servers: ["alpha", "beta"] } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.askMulti({ name: "servers", type: "multiSelect", title: "Servers" }, [
      { id: "alpha" },
      { id: "beta" },
      { id: "gamma" },
    ]);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "value", value: ["alpha", "beta"] });
    }
    assert.deepEqual(ui.multiNames, ["servers"]);
  });

  it("CCI-10: ask projects a host back on a singleSelect to { kind: 'back' }", async () => {
    const ui = new ScriptedUserInteraction({ back: ["picker"] });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask({ name: "picker", type: "singleSelect", title: "Pick" }, [
      { id: "a" },
      { id: "b" },
    ]);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "back" });
    }
  });

  it("CCI-11: ask projects a host back on a text question to { kind: 'back' }", async () => {
    const ui = new ScriptedUserInteraction({ back: ["freeText"] });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask({ name: "freeText", type: "text", title: "Enter" }, undefined);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "back" });
    }
  });

  it("ask projects a host back on a folder question to { kind: 'back' }", async () => {
    const ui = new ScriptedUserInteraction({ back: ["folder"] });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask({ name: "folder", type: "folder", title: "Folder" }, undefined);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "back" });
    }
  });

  it("CCI-12: askMulti projects a host back on a multiSelect to { kind: 'back' }", async () => {
    const ui = new ScriptedUserInteraction({ back: ["servers"] });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.askMulti({ name: "servers", type: "multiSelect", title: "Servers" }, [
      { id: "alpha" },
      { id: "beta" },
    ]);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "back" });
    }
  });

  it("CCI-13: ask threads the caller's step onto the host config (the Back-button gate)", async () => {
    const ui = new ScriptedUserInteraction({ select: { picker: "a" } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      { name: "picker", type: "singleSelect", title: "Pick" },
      [{ id: "a" }, { id: "b" }],
      2
    );

    assert.isTrue(res.isOk());
    assert.equal(ui.lastSelectConfig?.step, 2);
  });
});

describe("openCreateQuestions (collect-create-inputs)", () => {
  it("CCI-09b: metadata-only package reader returns descriptor/questions/pipeline and no content", () => {
    const res = openDeclarativePackageMetadata(buildLanguageFloor(), LANGUAGE_DA);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(
        res.value.questions.map((question) => question.name),
        []
      );
      assert.notProperty(res.value, "content");
    }
  });

  it("CCI-09: reads the authored da/mcp-server questions from the floor", () => {
    const res = openCreateQuestions(buildFloor(), MCP_DA);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(
        res.value.map((q) => q.name),
        [
          "mcpServerType",
          "mcpServerUrl",
          "selectedLocalServers",
          "authType",
          "oauthClientId",
          "oauthClientSecret",
          "oauthScopes",
          "entraClientId",
        ]
      );
    }
  });

  it("CCI-09: an unknown templateId -> SystemError PackageFileMissing", () => {
    const res = openCreateQuestions(buildFloor(), {
      kind: "create",
      templateId: "da/does-not-exist",
    });

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.instanceOf(res.error, SystemError);
      assert.equal(res.error.name, "PackageFileMissing");
    }
  });
});
