// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { parseMcpStaticToolsJson, selectMcpStaticTools } from "../../../src/v4/mcp/mcpStaticTools";
import { assert } from "vitest";

describe("mcpStaticTools (v4)", () => {
  it("parses tools and defaults a missing description to empty string", () => {
    const result = parseMcpStaticToolsJson(
      JSON.stringify({ tools: [{ name: "searchFlights", inputSchema: { type: "object" } }] })
    );

    assert.isTrue(result.ok);
    if (result.ok) {
      assert.deepEqual(result.tools, [
        {
          name: "searchFlights",
          description: "",
          raw: { name: "searchFlights", inputSchema: { type: "object" } },
        },
      ]);
    }
  });

  it("returns parse and shape errors for invalid tool JSON", () => {
    const invalidJson = parseMcpStaticToolsJson("not json");
    assert.isFalse(invalidJson.ok);
    if (!invalidJson.ok) {
      assert.strictEqual(invalidJson.code, "McpStaticToolsParse");
      assert.include(invalidJson.message, "not valid JSON");
    }

    const notObject = parseMcpStaticToolsJson("[]");
    assert.isFalse(notObject.ok);
    if (!notObject.ok) {
      assert.strictEqual(notObject.code, "McpStaticToolsShape");
    }
  });

  it("requires a tools array and non-empty string tool names", () => {
    const missingTools = parseMcpStaticToolsJson(JSON.stringify({ tools: "searchFlights" }));
    assert.isFalse(missingTools.ok);
    if (!missingTools.ok) {
      assert.strictEqual(missingTools.code, "McpStaticToolsArray");
    }

    const missingName = parseMcpStaticToolsJson(JSON.stringify({ tools: [{ description: "x" }] }));
    assert.isFalse(missingName.ok);
    if (!missingName.ok) {
      assert.strictEqual(missingName.code, "McpStaticToolName");
    }
  });

  it("selects tools by name and reports missing selections", () => {
    const parsed = parseMcpStaticToolsJson(
      JSON.stringify({
        tools: [
          { name: "searchFlights", description: "Search" },
          { name: "bookFlight", description: "Book" },
        ],
      })
    );
    assert.isTrue(parsed.ok);
    if (!parsed.ok) {
      return;
    }

    const selected = selectMcpStaticTools(parsed.tools, ["bookFlight"]);
    assert.isTrue(selected.ok);
    if (selected.ok) {
      assert.deepEqual(
        selected.tools.map((tool) => tool.name),
        ["bookFlight"]
      );
    }

    const missing = selectMcpStaticTools(parsed.tools, ["missingTool"]);
    assert.isFalse(missing.ok);
    if (!missing.ok) {
      assert.strictEqual(missing.code, "McpStaticToolMissing");
    }
  });
});
