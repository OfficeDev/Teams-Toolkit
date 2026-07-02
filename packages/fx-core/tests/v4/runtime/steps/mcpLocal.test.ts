// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import { assert, afterEach, vi } from "vitest";
import { ODRProvider } from "../../../../src/component/utils/odrProvider";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import {
  STEP_MATERIALIZE_LOCAL_SERVERS,
  mcpLocalDeps,
  mcpLocalMaterializeServers,
} from "../../../../src/v4/runtime/steps/mcpLocal";

function makeCtx(): { ctx: StepContext; files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
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

describe(`${STEP_MATERIALIZE_LOCAL_SERVERS} (v4)`, () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mcpLocalDeps.listServers = async () => [];
  });

  it("delegates the default local server catalog lookup to ODR", async () => {
    vi.spyOn(ODRProvider, "listServers").mockResolvedValue([
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
    ]);
    const { ctx, files } = makeCtx();

    const result = await mcpLocalMaterializeServers.apply(
      { target: ".vscode/mcp.json", selected: ["ghmcp"] },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const mcpJson = files.get(".vscode/mcp.json");
    if (mcpJson === undefined) {
      assert.fail("expected .vscode/mcp.json to be written");
    }
    assert.deepStrictEqual(JSON.parse(mcpJson.toString("utf8")), {
      servers: {
        ghmcp: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@github/github-mcp-server"],
        },
      },
    });
  });

  it("validateParams reports missing or invalid parameters", () => {
    assert.strictEqual(
      mcpLocalMaterializeServers.validateParams({ selected: ["ghmcp"] }),
      "missing string parameter 'target'"
    );
    assert.strictEqual(
      mcpLocalMaterializeServers.validateParams({ target: ".vscode/mcp.json" }),
      "missing string[] parameter 'selected'"
    );
    assert.isUndefined(
      mcpLocalMaterializeServers.validateParams({
        target: ".vscode/mcp.json",
        selected: ["ghmcp"],
      })
    );
  });

  it("returns a parameter SystemError when apply receives invalid resolved params", async () => {
    const result = await mcpLocalMaterializeServers.apply(
      { target: ".vscode/mcp.json", selected: "ghmcp" },
      makeCtx().ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpLocalParams");
  });

  it("materializes selected servers from ODR when catalog is not supplied", async () => {
    mcpLocalDeps.listServers = async () => [
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
    ];
    const { ctx, files } = makeCtx();

    const result = await mcpLocalMaterializeServers.apply(
      { target: ".vscode/mcp.json", selected: ["ghmcp"] },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const mcpJson = files.get(".vscode/mcp.json");
    if (mcpJson === undefined) {
      assert.fail("expected .vscode/mcp.json to be written");
    }
    assert.deepStrictEqual(JSON.parse(mcpJson.toString("utf8")), {
      servers: {
        ghmcp: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@github/github-mcp-server"],
        },
      },
    });
  });

  it("reports a missing selected local server when neither catalog nor ODR contains it", async () => {
    const result = await mcpLocalMaterializeServers.apply(
      { target: ".vscode/mcp.json", selected: ["missing"] },
      makeCtx().ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpLocalCatalogEntry");
  });

  it("reports catalog parse and shape errors", async () => {
    const invalidJson = await mcpLocalMaterializeServers.apply(
      { target: ".vscode/mcp.json", selected: ["ghmcp"], catalog: "not json" },
      makeCtx().ctx
    );
    assert.isTrue(invalidJson.isErr());
    assert.strictEqual(invalidJson._unsafeUnwrapErr().name, "McpLocalCatalogParse");

    const invalidShape = await mcpLocalMaterializeServers.apply(
      { target: ".vscode/mcp.json", selected: ["ghmcp"], catalog: "[]" },
      makeCtx().ctx
    );
    assert.isTrue(invalidShape.isErr());
    assert.strictEqual(invalidShape._unsafeUnwrapErr().name, "McpLocalCatalogShape");
  });

  it("reports invalid catalog command and args entries", async () => {
    const missingCommand = await mcpLocalMaterializeServers.apply(
      {
        target: ".vscode/mcp.json",
        selected: ["ghmcp"],
        catalog: JSON.stringify({ ghmcp: { args: [] } }),
      },
      makeCtx().ctx
    );
    assert.isTrue(missingCommand.isErr());
    assert.strictEqual(missingCommand._unsafeUnwrapErr().name, "McpLocalCatalogCommand");

    const invalidArgs = await mcpLocalMaterializeServers.apply(
      {
        target: ".vscode/mcp.json",
        selected: ["ghmcp"],
        catalog: JSON.stringify({ ghmcp: { command: "npx", args: [1] } }),
      },
      makeCtx().ctx
    );
    assert.isTrue(invalidArgs.isErr());
    assert.strictEqual(invalidArgs._unsafeUnwrapErr().name, "McpLocalCatalogArgs");
  });

  it("materializes a catalog entry with omitted args as an empty args array", async () => {
    const { ctx, files } = makeCtx();

    const result = await mcpLocalMaterializeServers.apply(
      {
        target: ".vscode/mcp.json",
        selected: ["ghmcp"],
        catalog: JSON.stringify({ ghmcp: { command: "npx" } }),
      },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const mcpJson = files.get(".vscode/mcp.json");
    if (mcpJson === undefined) {
      assert.fail("expected .vscode/mcp.json to be written");
    }
    assert.deepStrictEqual(JSON.parse(mcpJson.toString("utf8")), {
      servers: { ghmcp: { type: "stdio", command: "npx", args: [] } },
    });
  });
});
