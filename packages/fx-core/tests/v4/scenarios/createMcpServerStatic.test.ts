// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import {
  FxError,
  InputTextConfig,
  InputTextResult,
  MultiSelectConfig,
  MultiSelectResult,
  OptionItem as SurfaceOptionItem,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { ScaffoldRequest, scaffold } from "../../../src/v4/runtime/scaffold";
import { runCreateInputs } from "../../../src/v4/surface/createInputs";
import {
  loadV4Package,
  readJsonObject,
  recordArrayProperty,
  recordProperty,
  runV4Package,
  V4ScenarioOutcome,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier for the DT-off v4 static MCP create package.
 *
 * Spec: docs/03-specs/scenarios/da/create-mcp-server-static.md
 * (SCN-CREATE-MCP-STATIC-01..07)
 */

const MCP_SERVER_URL = "https://api.github.com/mcp";
const TEMPLATES_V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");
const MCP_TOOLS_JSON = JSON.stringify({
  tools: [
    {
      name: "search",
      description: "Search issues",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    },
    {
      name: "calendar",
      description: "Read calendar",
      inputSchema: { type: "object", properties: { date: { type: "string" } } },
    },
  ],
});

const templatePackage = loadV4Package("create", "da/mcp-server-static");

function buildFloor(): Buffer {
  const zip = new AdmZip();
  zip.addLocalFolder(TEMPLATES_V4_DIR, "v4");
  return zip.toBuffer();
}

function noAnswer(name: string): FxError {
  return new UserError({ source: "Test", name: "NoScriptedAnswer", message: name });
}

class StaticMcpQ2UI {
  textNames: string[] = [];
  multiNames: string[] = [];
  lastMultiConfig?: MultiSelectConfig;

  inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    this.textNames.push(config.name);
    if (config.name !== "mcpToolsFilePath") {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    return Promise.resolve(ok({ type: "success", result: "" }));
  }

  selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    this.multiNames.push(config.name);
    this.lastMultiConfig = config;
    if (config.name !== "selectedMcpTools") {
      return Promise.resolve(err(noAnswer(config.name)));
    }
    return Promise.resolve(ok({ type: "success", result: ["search"] }));
  }
}

function asUI(scripted: StaticMcpQ2UI): UserInteraction {
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
  if (option === undefined || typeof option === "string") {
    assert.fail(`expected multi-select option item at index ${index}`);
  }
  return option;
}

async function run(
  selectedMcpTools: string[] = ["search"]
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  return runV4Package(templatePackage, {
    answers: {
      surface: "cli",
      mcpServerUrl: MCP_SERVER_URL,
      mcpToolsJson: MCP_TOOLS_JSON,
      selectedMcpTools,
    },
    callerFloor: { appName: "MyStaticMcpAgent", language: "common" },
  });
}

describe("SCN-DA-CREATE-WITH-MCP-SERVER-STATIC (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-MCP-STATIC-01: static MCP scaffold writes mcp-tools-1.json", async () => {
    const { files, outcome } = await run(["search", "calendar"]);
    assert.include(outcome.written, "appPackage/ai-plugin.json");
    assert.include(outcome.written, "appPackage/declarativeAgent.json");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.stepsRun, "mcp-static/materialize-tools");
    assert.isTrue(files.has("appPackage/mcp-tools-1.json"));
  });

  it("SCN-CREATE-MCP-STATIC-02: selected tools filter functions and full tool definitions", async () => {
    const { files } = await run(["search"]);
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const functions = recordArrayProperty(plugin, "functions");
    assert.deepStrictEqual(functions, [{ name: "search", description: "Search issues" }]);

    const toolsFile = readJsonObject(files, "appPackage/mcp-tools-1.json");
    const tools = recordArrayProperty(toolsFile, "tools");
    assert.lengthOf(tools, 1);
    assert.strictEqual(tools[0].name, "search");
    assert.deepStrictEqual(recordProperty(tools[0], "inputSchema"), {
      type: "object",
      properties: { query: { type: "string" } },
    });
  });

  it("SCN-CREATE-MCP-STATIC-03: static runtime references mcp-tools and omits dynamic discovery", async () => {
    const { files } = await run(["search"]);
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtime = recordArrayProperty(plugin, "runtimes")[0];
    const spec = recordProperty(runtime, "spec");
    const description = recordProperty(spec, "mcp_tool_description");
    assert.strictEqual(runtime.type, "RemoteMCPServer");
    assert.strictEqual(spec.url, MCP_SERVER_URL);
    assert.strictEqual(description.file, "mcp-tools-1.json");
    assert.deepStrictEqual(runtime.run_for_functions, ["search"]);
    assert.notProperty(spec, "enable_dynamic_discovery");
  });

  it("SCN-CREATE-MCP-STATIC-04: non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const request: ScaffoldRequest = {
      descriptor: templatePackage.descriptor,
      pipeline: templatePackage.pipeline,
      content: templatePackage.content,
      answers: {
        surface: "cli",
        mcpServerUrl: MCP_SERVER_URL,
        mcpToolsJson: MCP_TOOLS_JSON,
        selectedMcpTools: ["search"],
      },
      callerFloor: { appName: "MyStaticMcpAgent", language: "common" },
      targetDir: { path: "/out", existing: ["appPackage/manifest.json"] },
    };
    const result = await scaffold(request, runtime);
    assert.isTrue(result.isErr());
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(runtime.files.size, 0);
  });

  it("SCN-CREATE-MCP-STATIC-05: VS Code create skips static MCP tool materialization", async () => {
    const { files, outcome } = await runV4Package(templatePackage, {
      answers: {
        surface: "vscode",
        mcpServerUrl: MCP_SERVER_URL,
      },
      callerFloor: { appName: "MyStaticMcpAgent", language: "common" },
    });

    assert.include(outcome.written, "appPackage/ai-plugin.json");
    assert.notInclude(outcome.stepsRun, "mcp-static/materialize-tools");
    assert.isFalse(files.has("appPackage/mcp-tools-1.json"));
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    assert.deepStrictEqual(recordArrayProperty(plugin, "functions"), []);
    assert.deepStrictEqual(recordArrayProperty(plugin, "runtimes"), []);
  });

  it("SCN-CREATE-MCP-STATIC-06: CLI without tools path fetches tools from server URL for selection", async () => {
    const ui = new StaticMcpQ2UI();
    let fetchedUrl: string | undefined;

    const result = await runCreateInputs(
      buildFloor(),
      { kind: "create", templateId: "da/mcp-server-static" },
      { mcpServerUrl: MCP_SERVER_URL },
      asUI(ui),
      {
        surface: "cli",
        flagReader: () => false,
        fetchMcpTools: async (serverUrl) => {
          fetchedUrl = serverUrl;
          return {
            requiresAuth: false,
            tools: [
              { name: "search", description: "Search issues", inputSchema: {} },
              { name: "calendar", description: "Read calendar", inputSchema: {} },
            ],
          };
        },
      }
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.strictEqual(fetchedUrl, MCP_SERVER_URL);
    assert.deepStrictEqual(ui.textNames, ["mcpToolsFilePath"]);
    assert.deepStrictEqual(ui.multiNames, ["selectedMcpTools"]);
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 0).id, "search");
    assert.strictEqual(multiOptionAt(ui.lastMultiConfig, 1).id, "calendar");
    assert.deepStrictEqual(result._unsafeUnwrap().selectedMcpTools, ["search"]);
  });

  it("SCN-CREATE-MCP-STATIC-07: CLI auto-fetch requiring auth fails before scaffold", async () => {
    const ui = new StaticMcpQ2UI();

    const result = await runCreateInputs(
      buildFloor(),
      { kind: "create", templateId: "da/mcp-server-static" },
      { mcpServerUrl: MCP_SERVER_URL },
      asUI(ui),
      {
        surface: "cli",
        flagReader: () => false,
        fetchMcpTools: async () => ({ requiresAuth: true, tools: [] }),
      }
    );

    assert.isTrue(result.isErr(), "expected auth-required fetch to fail");
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, "McpAuthRequired");
    assert.deepStrictEqual(ui.textNames, ["mcpToolsFilePath"]);
    assert.deepStrictEqual(ui.multiNames, []);
  });
});
