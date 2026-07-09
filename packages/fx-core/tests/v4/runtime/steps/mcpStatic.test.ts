// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import {
  STEP_MATERIALIZE_STATIC_MCP_TOOLS,
  mcpStaticDeps,
  mcpStaticMaterializeTools,
} from "../../../../src/v4/runtime/steps/mcpStatic";
import { StepContext, StepParams } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import fs, { removeSync, writeJsonSync } from "fs-extra";
import os from "os";
import path from "path";
import { assert, afterEach } from "vitest";

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

function validParams(overrides: Partial<StepParams> = {}, omitted: string[] = []): StepParams {
  const params: StepParams = {
    pluginPath: "appPackage/ai-plugin.json",
    toolsPath: "appPackage/mcp-tools-1.json",
    mcpServerUrl: "https://api.example.com/mcp",
    toolsJson: JSON.stringify({
      tools: [
        { name: "searchFlights", description: "Search flights" },
        { name: "bookFlight", description: "Book flights" },
      ],
    }),
    selected: ["searchFlights"],
    ...overrides,
  };
  for (const key of omitted) {
    delete params[key];
  }
  return params;
}

describe(`${STEP_MATERIALIZE_STATIC_MCP_TOOLS} (v4)`, () => {
  afterEach(() => {
    mcpStaticDeps.fetchTools = async () => {
      throw new Error("unexpected fetch");
    };
  });

  it("validateParams reports missing or invalid parameters", () => {
    assert.strictEqual(
      mcpStaticMaterializeTools.validateParams(validParams({}, ["pluginPath"])),
      "missing string parameter 'pluginPath'"
    );
    assert.strictEqual(
      mcpStaticMaterializeTools.validateParams(validParams({}, ["toolsPath"])),
      "missing string parameter 'toolsPath'"
    );
    assert.strictEqual(
      mcpStaticMaterializeTools.validateParams(validParams({}, ["mcpServerUrl"])),
      "missing string parameter 'mcpServerUrl'"
    );
    assert.isUndefined(mcpStaticMaterializeTools.validateParams(validParams({}, ["toolsJson"])));
    assert.isUndefined(
      mcpStaticMaterializeTools.validateParams(validParams({ selected: "{{selectedMcpTools}}" }))
    );
    assert.strictEqual(
      mcpStaticMaterializeTools.validateParams(validParams({ selected: true })),
      "missing string[] parameter 'selected'"
    );
  });

  it("returns a parameter SystemError when apply receives invalid resolved params", async () => {
    const { ctx } = makeCtx();
    const result = await mcpStaticMaterializeTools.apply(
      validParams({ selected: "searchFlights" }),
      ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpStaticParams");
  });

  it("returns tool parser and selection errors as SystemError results", async () => {
    const { ctx } = makeCtx({ "appPackage/ai-plugin.json": "{}" });

    const parseResult = await mcpStaticMaterializeTools.apply(
      validParams({ toolsJson: "not json" }),
      ctx
    );
    assert.isTrue(parseResult.isErr());
    assert.strictEqual(parseResult._unsafeUnwrapErr().name, "McpStaticToolsParse");

    const missingSelection = await mcpStaticMaterializeTools.apply(
      validParams({ selected: ["missingTool"] }),
      ctx
    );
    assert.isTrue(missingSelection.isErr());
    assert.strictEqual(missingSelection._unsafeUnwrapErr().name, "McpStaticToolMissing");
  });

  it("returns plugin read and parse errors as SystemError results", async () => {
    const missing = await mcpStaticMaterializeTools.apply(validParams(), makeCtx().ctx);
    assert.isTrue(missing.isErr());
    assert.strictEqual(missing._unsafeUnwrapErr().name, "McpStaticPluginMissing");

    const invalidJson = await mcpStaticMaterializeTools.apply(
      validParams(),
      makeCtx({ "appPackage/ai-plugin.json": "not json" }).ctx
    );
    assert.isTrue(invalidJson.isErr());
    assert.strictEqual(invalidJson._unsafeUnwrapErr().name, "McpStaticPluginParse");

    const invalidShape = await mcpStaticMaterializeTools.apply(
      validParams(),
      makeCtx({ "appPackage/ai-plugin.json": "[]" }).ctx
    );
    assert.isTrue(invalidShape.isErr());
    assert.strictEqual(invalidShape._unsafeUnwrapErr().name, "McpStaticPluginShape");
  });

  it("writes selected tools and RemoteMCPServer runtime metadata", async () => {
    const { ctx, files } = makeCtx({ "appPackage/ai-plugin.json": "{}" });

    const result = await mcpStaticMaterializeTools.apply(
      validParams({ toolsPath: "nested/appPackage/mcp-tools-1.json" }),
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const plugin = JSON.parse(files.get("appPackage/ai-plugin.json")?.toString("utf8") ?? "{}");
    assert.deepEqual(plugin.functions, [{ name: "searchFlights", description: "Search flights" }]);
    assert.deepEqual(plugin.runtimes, [
      {
        type: "RemoteMCPServer",
        spec: {
          url: "https://api.example.com/mcp",
          mcp_tool_description: { file: "mcp-tools-1.json" },
        },
        run_for_functions: ["searchFlights"],
      },
    ]);
    const tools = JSON.parse(
      files.get("nested/appPackage/mcp-tools-1.json")?.toString("utf8") ?? "{}"
    );
    assert.deepEqual(tools.tools, [{ name: "searchFlights", description: "Search flights" }]);
  });

  it("writes selected tools from a tools file path", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-mcp-tools-"));
    const toolsFilePath = path.join(tempDir, "mcp-tools.json");
    writeJsonSync(toolsFilePath, {
      tools: [
        { name: "searchFlights", description: "Search flights" },
        { name: "bookFlight", description: "Book flights" },
      ],
    });
    const { ctx, files } = makeCtx({ "appPackage/ai-plugin.json": "{}" });

    try {
      const result = await mcpStaticMaterializeTools.apply(
        validParams({ toolsJson: "", toolsFilePath }),
        ctx
      );

      assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
      const tools = JSON.parse(files.get("appPackage/mcp-tools-1.json")?.toString("utf8") ?? "{}");
      assert.deepEqual(tools.tools, [{ name: "searchFlights", description: "Search flights" }]);
    } finally {
      removeSync(tempDir);
    }
  });

  it("writes all fetched tools when no selection is provided", async () => {
    const { ctx, files } = makeCtx({ "appPackage/ai-plugin.json": "{}" });
    mcpStaticDeps.fetchTools = async () => ({
      requiresAuth: false,
      tools: [
        { name: "searchFlights", description: "Search flights", inputSchema: {} },
        { name: "bookFlight", description: "Book flights", inputSchema: {} },
      ],
    });

    const result = await mcpStaticMaterializeTools.apply(
      validParams({ toolsJson: "", selected: "" }),
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const plugin = JSON.parse(files.get("appPackage/ai-plugin.json")?.toString("utf8") ?? "{}");
    assert.deepEqual(plugin.functions, [
      { name: "searchFlights", description: "Search flights" },
      { name: "bookFlight", description: "Book flights" },
    ]);
    assert.deepEqual(plugin.runtimes[0].run_for_functions, ["searchFlights", "bookFlight"]);
  });

  it("writes all fetched tools when optional params resolve to unresolved tokens", async () => {
    const { ctx, files } = makeCtx({ "appPackage/ai-plugin.json": "{}" });
    mcpStaticDeps.fetchTools = async () => ({
      requiresAuth: false,
      tools: [
        { name: "searchFlights", description: "Search flights", inputSchema: {} },
        { name: "bookFlight", description: "Book flights", inputSchema: {} },
      ],
    });

    const result = await mcpStaticMaterializeTools.apply(
      validParams({
        toolsJson: "{{mcpToolsJson}}",
        toolsFilePath: "{{mcpToolsFilePath}}",
        selected: "{{selectedMcpTools}}",
      }),
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const plugin = JSON.parse(files.get("appPackage/ai-plugin.json")?.toString("utf8") ?? "{}");
    assert.deepEqual(plugin.functions, [
      { name: "searchFlights", description: "Search flights" },
      { name: "bookFlight", description: "Book flights" },
    ]);
    assert.deepEqual(plugin.runtimes[0].run_for_functions, ["searchFlights", "bookFlight"]);
  });

  it("returns a UserError when the tools file path cannot be read", async () => {
    const { ctx } = makeCtx({ "appPackage/ai-plugin.json": "{}" });

    const result = await mcpStaticMaterializeTools.apply(
      validParams({
        toolsJson: "",
        toolsFilePath: path.join(os.tmpdir(), "missing-mcp-tools.json"),
      }),
      ctx
    );

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpToolsFileReadFailed");
  });

  it("returns a UserError when fetched tools require auth or are empty", async () => {
    const { ctx } = makeCtx({ "appPackage/ai-plugin.json": "{}" });
    mcpStaticDeps.fetchTools = async () => ({ requiresAuth: true, tools: [] });

    const authRequired = await mcpStaticMaterializeTools.apply(validParams({ toolsJson: "" }), ctx);
    assert.isTrue(authRequired.isErr());
    assert.strictEqual(authRequired._unsafeUnwrapErr().name, "McpAuthRequired");

    mcpStaticDeps.fetchTools = async () => ({ requiresAuth: false, tools: [] });
    const emptyTools = await mcpStaticMaterializeTools.apply(validParams({ toolsJson: "" }), ctx);
    assert.isTrue(emptyTools.isErr());
    assert.strictEqual(emptyTools._unsafeUnwrapErr().name, "McpToolsNotFound");
  });

  it("returns a UserError when fetching tools fails unexpectedly", async () => {
    const { ctx } = makeCtx({ "appPackage/ai-plugin.json": "{}" });
    mcpStaticDeps.fetchTools = async () => {
      throw new Error("network down");
    };

    const result = await mcpStaticMaterializeTools.apply(validParams({ toolsJson: "" }), ctx);

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpToolsFetchFailed");
  });

  it("returns FxError thrown while fetching tools", async () => {
    const { ctx } = makeCtx({ "appPackage/ai-plugin.json": "{}" });
    mcpStaticDeps.fetchTools = async () => {
      throw new UserError({ source: "Test", name: "McpFetchUserError", message: "failed" });
    };

    const result = await mcpStaticMaterializeTools.apply(validParams({ toolsJson: "" }), ctx);

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpFetchUserError");
  });
});
