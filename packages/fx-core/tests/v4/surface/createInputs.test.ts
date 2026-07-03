// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  InputTextConfig,
  InputTextResult,
  InputResult,
  MultiSelectConfig,
  MultiSelectResult,
  OptionItem as SurfaceOptionItem,
  Platform,
  SelectFileConfig,
  SelectFileResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleFileOrInputConfig,
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

function buildLanguageFloor(languages = ["typescript", "csharp"]): Buffer {
  const zip = new AdmZip();
  const root = "v4/create/test/language-axis";
  zip.addFile(
    `${root}/descriptor.json`,
    Buffer.from(JSON.stringify({ id: "test/language-axis", languages }))
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
  fileOrInput?: Record<string, string>;
  file?: Record<string, string>;
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
  fileNames: string[] = [];
  fileOrInputNames: string[] = [];
  multiNames: string[] = [];
  dynamicOptionNames: string[] = [];
  lastSelectConfig?: SingleSelectConfig;
  lastInputConfig?: InputTextConfig;
  lastFileOrInputConfig?: SingleFileOrInputConfig;
  lastFileConfig?: SelectFileConfig;
  lastFolderConfig?: SelectFolderConfig;
  lastMultiConfig?: MultiSelectConfig;
  constructor(private readonly script: Script) {}

  async selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    this.promptNames.push(config.name);
    this.selectNames.push(config.name);
    let loadedOptions = config.options;
    if (typeof config.options === "function") {
      this.dynamicOptionNames.push(config.name);
      try {
        loadedOptions = await config.options();
        config = { ...config, options: loadedOptions };
      } catch (error) {
        if (error instanceof UserError || error instanceof SystemError) {
          return err(error);
        }
        return err(noAnswer(config.name));
      }
    }
    this.lastSelectConfig = config;
    if (
      Array.isArray(loadedOptions) &&
      config.skipSingleOption === true &&
      loadedOptions.length === 1
    ) {
      return ok({ type: "skip", result: optionId(loadedOptions[0]) });
    }
    if (this.script.back?.includes(config.name) === true) {
      return ok({ type: "back" });
    }
    const answer = this.script.select?.[config.name];
    if (answer === undefined) {
      return err(noAnswer(config.name));
    }
    const result: SingleSelectResult = { type: "success", result: answer };
    return ok(result);
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
    const validation = config.validation;
    if (validation !== undefined) {
      return Promise.resolve(validation(answer)).then((message) => {
        if (message !== undefined) {
          return err(
            new UserError({
              source: "Test",
              name: INPUT_VALIDATION_FAILED,
              message: `'${config.name}': ${message}`,
            })
          );
        }
        const result: InputTextResult = { type: "success", result: answer };
        return ok(result);
      });
    }
    const result: InputTextResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }

  selectFileOrInput(
    config: SingleFileOrInputConfig
  ): Promise<Result<InputResult<string>, FxError>> {
    this.promptNames.push(config.name);
    this.fileOrInputNames.push(config.name);
    this.lastFileOrInputConfig = config;
    if (this.script.back?.includes(config.name) === true) {
      return Promise.resolve(ok({ type: "back" }));
    }
    const answer = this.script.fileOrInput?.[config.name];
    if (answer === undefined) {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    const validation = config.validation;
    if (validation !== undefined) {
      return Promise.resolve(validation(answer)).then((message) => {
        if (message !== undefined) {
          return err(
            new UserError({
              source: "Test",
              name: INPUT_VALIDATION_FAILED,
              message: `'${config.name}': ${message}`,
            })
          );
        }
        return ok({ type: "success", result: answer });
      });
    }
    return Promise.resolve(ok({ type: "success", result: answer }));
  }

  selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    this.promptNames.push(config.name);
    this.fileNames.push(config.name);
    this.lastFileConfig = config;
    if (this.script.back?.includes(config.name) === true) {
      return Promise.resolve(ok({ type: "back" }));
    }
    const answer = this.script.file?.[config.name];
    if (answer === undefined) {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    const validation = config.validation;
    if (validation !== undefined) {
      return Promise.resolve(validation(answer)).then((message) => {
        if (message !== undefined) {
          return err(
            new UserError({
              source: "Test",
              name: INPUT_VALIDATION_FAILED,
              message: `'${config.name}': ${message}`,
            })
          );
        }
        const result: SelectFileResult = { type: "success", result: answer };
        return ok(result);
      });
    }
    const result: SelectFileResult = { type: "success", result: answer };
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
    const validation = config.validation;
    if (validation !== undefined) {
      return Promise.resolve(validation(answer)).then((message) => {
        if (message !== undefined) {
          return err(
            new UserError({
              source: "Test",
              name: INPUT_VALIDATION_FAILED,
              message: `'${config.name}': ${message}`,
            })
          );
        }
        const result: SelectFolderResult = { type: "success", result: answer };
        return ok(result);
      });
    }
    const result: SelectFolderResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }

  async selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    this.promptNames.push(config.name);
    this.multiNames.push(config.name);
    let loadedOptions = config.options;
    if (typeof config.options === "function") {
      this.dynamicOptionNames.push(config.name);
      try {
        loadedOptions = await config.options();
        config = { ...config, options: loadedOptions };
      } catch (error) {
        if (error instanceof UserError || error instanceof SystemError) {
          return err(error);
        }
        return err(noAnswer(config.name));
      }
    }
    this.lastMultiConfig = config;
    if (
      Array.isArray(loadedOptions) &&
      config.skipSingleOption === true &&
      loadedOptions.length === 1
    ) {
      return ok({ type: "skip", result: [optionId(loadedOptions[0])] });
    }
    if (this.script.back?.includes(config.name) === true) {
      return ok({ type: "back" });
    }
    const answer = this.script.multi?.[config.name];
    if (answer === undefined) {
      return err(noAnswer(config.name));
    }
    const result: MultiSelectResult = { type: "success", result: answer };
    return ok(result);
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

function selectOptionAt(config: SingleSelectConfig | undefined, index: number): SurfaceOptionItem {
  if (config === undefined) {
    assert.fail("expected a single-select config");
  }
  if (!Array.isArray(config.options)) {
    assert.fail("expected static single-select options");
  }
  const option = config.options[index];
  if (option === undefined) {
    assert.fail(`expected single-select option at index ${index}`);
  }
  if (typeof option === "string") {
    assert.fail(`expected single-select option item at index ${index}`);
  }
  return option;
}

function optionId(option: string | SurfaceOptionItem): string {
  return typeof option === "string" ? option : option.id;
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

  it("CCI-17: VS Code Python language option carries the v3 Preview description", async () => {
    const ui = new ScriptedUserInteraction({ select: { language: "python" } });

    const res = await runCreateInputs(
      buildLanguageFloor(["typescript", "javascript", "python"]),
      LANGUAGE_DA,
      {},
      asUI(ui),
      {
        flagReader: () => false,
        surface: "vscode",
      }
    );

    assert.isTrue(res.isOk(), res.isErr() ? `${res.error.name}: ${res.error.message}` : "ok");
    assert.strictEqual(res._unsafeUnwrap().language, "python");
    const pythonOption = selectOptionAt(ui.lastSelectConfig, 2);
    assert.strictEqual(pythonOption.id, "python");
    assert.strictEqual(pythonOption.label, "Python");
    assert.strictEqual(pythonOption.description, "Preview");
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
    // mcpServerType has a single dynamic option (remote-only) + skipSingleOption -> auto-skipped.
    assert.deepEqual(ui.selectNames, ["mcpServerType", "authType"]);
    assert.deepEqual(ui.dynamicOptionNames, ["mcpServerType"]);
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
    assert.deepEqual(ui.dynamicOptionNames, ["apiOperations"]);
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).id, "GET /repairs");
  });

  it("asks for the OpenAPI spec source before collecting DA OpenAPI operations", async () => {
    const ui = new ScriptedUserInteraction({
      select: { openApiSpecType: "enter-url" },
      text: { apiSpecLocation: "https://example.com/openapi.yaml" },
      multi: { apiOperations: ["GET /repairs"] },
    });

    const res = await runCreateInputs(buildFloor(), OPENAPI_DA, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isErr(), "expected the fake remote URL to fail when operations load");
    assert.equal(res._unsafeUnwrapErr().name, "OpenApiSpecInvalid");
    assert.deepEqual(ui.promptNames, ["openApiSpecType", "apiSpecLocation", "apiOperations"]);
    assert.deepEqual(ui.textNames, ["apiSpecLocation"]);
    assert.deepEqual(ui.fileNames, []);
    assert.deepEqual(ui.fileOrInputNames, []);
    assert.equal(ui.lastInputConfig?.placeholder, "https://example.com/openapi.yaml");
    assert.equal(ui.lastInputConfig?.prompt, "Enter an OpenAPI description document URL.");
    assert.isFunction(ui.lastInputConfig?.validation);
    assert.equal(
      await ui.lastInputConfig?.validation?.("./openapi.yaml"),
      "Enter a valid HTTP URL without authentication to access your OpenAPI description document."
    );
    assert.deepEqual(ui.dynamicOptionNames, ["apiOperations"]);
  });

  it("browses a local DA OpenAPI document only from the local file branch", async () => {
    const ui = new ScriptedUserInteraction({
      select: { openApiSpecType: "open-file" },
      file: { apiSpecLocation: OPENAPI_SPEC },
      multi: { apiOperations: ["GET /repairs"] },
    });

    const res = await runCreateInputs(buildFloor(), OPENAPI_DA, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.openApiSpecType, "open-file");
      assert.equal(res.value.apiSpecLocation, OPENAPI_SPEC);
      assert.deepEqual(res.value.apiOperations, ["GET /repairs"]);
    }
    assert.deepEqual(ui.promptNames, ["openApiSpecType", "apiSpecLocation", "apiOperations"]);
    assert.deepEqual(ui.fileNames, ["apiSpecLocation"]);
    assert.deepEqual(ui.textNames, []);
    assert.deepEqual(ui.fileOrInputNames, []);
    assert.equal(ui.lastFileConfig?.placeholder, "Select an OpenAPI description document.");
    assert.deepEqual(ui.lastFileConfig?.filters, {
      "OpenAPI Description Document": ["json", "yml", "yaml"],
    });
  });

  it("collects DA OpenAPI operations from a searched OpenAPI document", async () => {
    const ui = new ScriptedUserInteraction({
      select: { openApiSpecType: "search-api", selectOpenApiSpec: OPENAPI_SPEC },
      text: { searchOpenApiSpecQuery: "repairs" },
      multi: { apiOperations: ["GET /repairs"] },
    });

    const res = await runCreateInputs(buildFloor(), OPENAPI_DA, {}, asUI(ui), {
      flagReader: () => false,
      searchOpenAPISpec: async (query) => {
        assert.equal(query, "repairs");
        return [
          {
            key: "Repairs API",
            url: OPENAPI_SPEC,
            description: "Manage repairs",
          },
        ];
      },
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    if (res.isOk()) {
      assert.equal(res.value.openApiSpecType, "search-api");
      assert.equal(res.value.searchOpenApiSpecQuery, "repairs");
      assert.equal(res.value.selectOpenApiSpec, OPENAPI_SPEC);
      assert.equal(res.value.apiSpecLocation, OPENAPI_SPEC);
      assert.deepEqual(res.value.apiOperations, ["GET /repairs"]);
    }
    assert.deepEqual(ui.promptNames, [
      "openApiSpecType",
      "searchOpenApiSpecQuery",
      "selectOpenApiSpec",
      "apiOperations",
    ]);
    assert.deepEqual(ui.dynamicOptionNames, ["selectOpenApiSpec", "apiOperations"]);
    const options = (ui.lastSelectConfig?.options ?? []) as SurfaceOptionItem[];
    assert.equal(options[0].id, OPENAPI_SPEC);
    assert.equal(options[0].label, "Repairs API");
    assert.equal(options[0].detail, "Manage repairs");
  });

  it("surfaces empty OpenAPI search results as a user-fixable error", async () => {
    const ui = new ScriptedUserInteraction({
      select: { openApiSpecType: "search-api" },
      text: { searchOpenApiSpecQuery: "missing" },
    });

    const res = await runCreateInputs(buildFloor(), OPENAPI_DA, {}, asUI(ui), {
      flagReader: () => false,
      searchOpenAPISpec: async () => [],
    });

    assert.isTrue(res.isErr(), "expected empty search results to fail");
    assert.equal(res._unsafeUnwrapErr().name, "OpenApi" + "SearchResult" + "NotFound");
    assert.deepEqual(ui.promptNames, [
      "openApiSpecType",
      "searchOpenApiSpecQuery",
      "selectOpenApiSpec",
    ]);
    assert.deepEqual(ui.dynamicOptionNames, ["selectOpenApiSpec"]);
  });

  it("surfaces blank OpenAPI search query as a user-fixable error", async () => {
    const ui = new ScriptedUserInteraction({
      select: { openApiSpecType: "search-api" },
      text: { searchOpenApiSpecQuery: "   " },
    });

    const res = await runCreateInputs(buildFloor(), OPENAPI_DA, {}, asUI(ui), {
      flagReader: () => false,
    });

    assert.isTrue(res.isErr(), "expected blank search query to fail");
    assert.equal(res._unsafeUnwrapErr().name, "OpenApiSearchQueryMissing");
    assert.deepEqual(ui.dynamicOptionNames, ["selectOpenApiSpec"]);
  });

  it("surfaces OpenAPI documents with no supported operations as a user-fixable error", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-openapi-empty-"));
    const openApiPath = path.join(tempDir, "openapi.yaml");
    fs.writeFileSync(
      openApiPath,
      ["openapi: 3.0.0", "info:", "  title: Empty API", "  version: 1.0.0", "paths: {}"].join("\n"),
      "utf8"
    );
    const ui = new ScriptedUserInteraction({ multi: { apiOperations: [] } });

    try {
      const res = await runCreateInputs(
        buildFloor(),
        OPENAPI_DA,
        { apiSpecLocation: openApiPath },
        asUI(ui),
        { flagReader: () => false }
      );

      assert.isTrue(res.isErr(), "expected empty OpenAPI operations to fail");
      assert.equal(res._unsafeUnwrapErr().name, "OpenApiSpecInvalid");
      assert.deepEqual(ui.dynamicOptionNames, ["apiOperations"]);
    } finally {
      removeSync(tempDir);
    }
  });

  it("surfaces invalid OpenAPI operation loading as a user-fixable error", async () => {
    const ui = new ScriptedUserInteraction({
      multi: { apiOperations: ["GET /repairs"] },
    });

    const res = await runCreateInputs(
      buildFloor(),
      OPENAPI_DA,
      { apiSpecLocation: __filename },
      asUI(ui),
      { flagReader: () => false }
    );

    assert.isTrue(res.isErr(), "expected invalid OpenAPI spec to fail");
    if (res.isErr()) {
      assert.equal(res.error.name, "OpenApiSpecInvalid");
      assert.isTrue(res.error instanceof UserError);
    }
    assert.deepEqual(ui.promptNames, ["apiOperations"]);
    assert.deepEqual(ui.dynamicOptionNames, ["apiOperations"]);
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
    assert.isFunction(ui.lastInputConfig?.validation);
    assert.isString(await ui.lastInputConfig?.validation?.("!"));
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
      fileOrInput: { apiSpecLocation: OPENAPI_SPEC },
      text: {
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
    assert.deepEqual(ui.fileOrInputNames, ["apiSpecLocation"]);
    assert.equal(ui.lastFileOrInputConfig?.title, "OpenAPI Document");
    assert.equal(ui.lastFileOrInputConfig?.placeholder, "Enter OpenAPI Document URL");
    assert.equal(ui.lastFileOrInputConfig?.inputOptionItem.id, "input");
    assert.equal(
      ui.lastFileOrInputConfig?.inputOptionItem.label,
      "$(cloud) Enter OpenAPI Document URL"
    );
    assert.isUndefined(ui.lastFileOrInputConfig?.validation);
    assert.isFunction(ui.lastFileOrInputConfig?.inputBoxConfig.validation);
    assert.equal(
      await ui.lastFileOrInputConfig?.inputBoxConfig.validation?.("not-a-url"),
      "Enter a valid HTTP URL without authentication to access your OpenAPI description document."
    );
    assert.deepEqual(ui.lastFileOrInputConfig?.filters, { files: ["json", "yml", "yaml"] });
  });

  it("browses a local OpenAPI document for custom API through the combined picker", async () => {
    const ui = new ScriptedUserInteraction({
      select: { llmService: "llm-service-azure-openai" },
      fileOrInput: { apiSpecLocation: OPENAPI_SPEC },
      multi: { apiOperations: ["GET /repairs"] },
      text: {
        azureOpenAIKey: "",
        azureOpenAIEndpoint: "",
        azureOpenAIDeploymentName: "",
      },
    });
    const res = await runCreateInputs(
      buildFloor(),
      RAG_CUSTOM_API,
      { language: "typescript", platform: Platform.VSCode },
      asUI(ui),
      { flagReader: () => false }
    );

    if (res.isErr()) {
      assert.fail(res.error.message);
    }
    assert.equal(res.value.apiSpecLocation, OPENAPI_SPEC);
    assert.deepEqual(ui.textNames, [
      "azureOpenAIKey",
      "azureOpenAIEndpoint",
      "azureOpenAIDeploymentName",
    ]);
    assert.deepEqual(ui.fileNames, []);
    assert.deepEqual(ui.fileOrInputNames, ["apiSpecLocation"]);
    assert.equal(ui.lastFileOrInputConfig?.inputBoxConfig.name, "input-api-spec-url");
    assert.equal(ui.lastFileOrInputConfig?.inputBoxConfig.title, "OpenAPI Document");
    assert.equal(
      ui.lastFileOrInputConfig?.inputBoxConfig.placeholder,
      "Enter OpenAPI Document URL"
    );
    assert.isUndefined(ui.lastFileOrInputConfig?.validation);
    assert.isFunction(ui.lastFileOrInputConfig?.inputBoxConfig.validation);
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
        inputs: {
          platform: Platform.CLI,
          nonInteractive: true,
          folder: "C:/src",
          "app-name": "MyAgent",
        },
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

  it("fails before static MCP materialization when non-interactive CLI create omits the server URL", async () => {
    const ui = new ScriptedUserInteraction({});
    let fetchCalled = false;

    const res = await runCreateInputs(buildFloor(), STATIC_MCP_DA, {}, asUI(ui), {
      surface: "cli",
      inputs: {
        platform: Platform.CLI,
        nonInteractive: true,
        folder: "C:/src",
        "app-name": "MyAgent",
      },
      flagReader: () => false,
      fetchMcpTools: async () => {
        fetchCalled = true;
        return { requiresAuth: false, tools: [] };
      },
    });

    assert.isTrue(res.isErr(), "expected missing MCP server URL to fail");
    assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_VALIDATION_FAILED);
    assert.include(res._unsafeUnwrapErr().message, "mcpServerUrl");
    assert.isFalse(fetchCalled);
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

  it("resolves keyPrefix localization before rendering authored v4 LLM questions", async () => {
    const ui = new ScriptedUserInteraction({ select: { llmService: "llm-service-openai" } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      {
        name: "llmService",
        type: "singleSelect",
        title: "Service for Large Language Model (LLM)",
        placeholder: "Select a service to access LLMs",
        keyPrefix: "core.createProjectQuestion.llmService",
      },
      [
        {
          id: "llm-service-azure-openai",
          label: "Azure OpenAI",
          detail: "Access powerful LLMs in OpenAI with Azure security and reliability",
          keyPrefix: "core.createProjectQuestion.llmServiceAzureOpenAIOption",
        },
        {
          id: "llm-service-openai",
          label: "OpenAI",
          detail: "Access LLMs developed by OpenAI",
          keyPrefix: "core.createProjectQuestion.llmServiceOpenAIOption",
        },
      ]
    );

    assert.isTrue(res.isOk());
    assert.equal(ui.lastSelectConfig?.title, "Service for Large Language Model (LLM)");
    assert.equal(ui.lastSelectConfig?.placeholder, "Select a service to access LLMs");
    const options = (ui.lastSelectConfig?.options ?? []) as SurfaceOptionItem[];
    assert.equal(options[0].label, "Azure OpenAI");
    assert.equal(
      options[0].detail,
      "Access powerful LLMs in OpenAI with Azure security and reliability"
    );
    assert.equal(options[1].label, "OpenAI");
    assert.equal(options[1].detail, "Access LLMs developed by OpenAI");
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

  it("maps a singleFileOrText question to selectFileOrInput and returns the path or text", async () => {
    const ui = new ScriptedUserInteraction({ fileOrInput: { apiSpecLocation: OPENAPI_SPEC } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      {
        name: "apiSpecLocation",
        type: "singleFileOrText",
        title: "OpenAPI Document",
        placeholder: "Enter OpenAPI Document URL",
        inputOptionItem: { id: "input", label: "$(cloud) Enter OpenAPI Document URL" },
        inputBoxConfig: {
          name: "input-api-spec-url",
          title: "OpenAPI Document",
          placeholder: "Enter OpenAPI Document URL",
        },
        filters: { files: ["json", "yml", "yaml"] },
      },
      undefined,
      2
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "value", value: OPENAPI_SPEC });
    }
    assert.deepEqual(ui.fileOrInputNames, ["apiSpecLocation"]);
    assert.equal(ui.lastFileOrInputConfig?.step, 2);
  });

  it("maps a singleFile question to selectFile and returns the path", async () => {
    const ui = new ScriptedUserInteraction({ file: { apiSpecLocation: OPENAPI_SPEC } });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      {
        name: "apiSpecLocation",
        type: "singleFile",
        title: "OpenAPI Document",
        filters: { files: ["json", "yml", "yaml"] },
      },
      undefined,
      2
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "value", value: OPENAPI_SPEC });
    }
    assert.deepEqual(ui.fileNames, ["apiSpecLocation"]);
    assert.equal(ui.lastFileConfig?.step, 2);
  });

  it("returns host errors from singleFile prompts", async () => {
    const ui = new ScriptedUserInteraction({});
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      { name: "apiSpecLocation", type: "singleFile", title: "OpenAPI Document" },
      undefined
    );

    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, "NoScriptedAnswer");
  });

  it("projects a host back on a singleFile question to { kind: 'back' }", async () => {
    const ui = new ScriptedUserInteraction({ back: ["apiSpecLocation"] });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      { name: "apiSpecLocation", type: "singleFile", title: "OpenAPI Document" },
      undefined
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "back" });
    }
  });

  it("returns host errors from singleFileOrText prompts", async () => {
    const ui = new ScriptedUserInteraction({});
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      {
        name: "apiSpecLocation",
        type: "singleFileOrText",
        title: "OpenAPI Document",
        inputOptionItem: { id: "input" },
        inputBoxConfig: { name: "input-api-spec-url" },
      },
      undefined
    );

    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, "NoScriptedAnswer");
  });

  it("projects a host back on a singleFileOrText question to { kind: 'back' }", async () => {
    const ui = new ScriptedUserInteraction({ back: ["apiSpecLocation"] });
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      {
        name: "apiSpecLocation",
        type: "singleFileOrText",
        title: "OpenAPI Document",
        inputOptionItem: { id: "input" },
        inputBoxConfig: { name: "input-api-spec-url" },
      },
      undefined
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, { kind: "back" });
    }
  });

  it("rejects malformed singleFileOrText question configs", async () => {
    const ui = new ScriptedUserInteraction({});
    const prompt = createUiPromptUI(asUI(ui));

    const res = await prompt.ask(
      { name: "apiSpecLocation", type: "singleFileOrText", title: "OpenAPI Document" },
      undefined
    );

    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, "UnsupportedQuestionKind");
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
