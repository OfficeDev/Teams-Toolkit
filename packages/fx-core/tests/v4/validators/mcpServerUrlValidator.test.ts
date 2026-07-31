// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { afterEach, assert, vi } from "vitest";
import { mcpServerUrlValidator } from "../../../src/v4/validators/mcpServerUrlValidator";
import { teamsProjectTypeDeps } from "../../../src/question/scaffold/vsc/teamsProjectTypeNode";

/**
 * ADR-0020 decision F, applied at the v4 extension point: a 404 blocks, the weaker negative
 * shapes and an undetermined probe do not.
 */
describe("mcp.serverUrl validator (ADR-0020)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a value that cannot be an absolute http(s) URL without probing", async () => {
    const probe = vi.spyOn(teamsProjectTypeDeps, "probeMCPServerAuth");

    assert.include((await mcpServerUrlValidator("not a uri", {})) ?? "", "absolute URL");
    assert.include(
      (await mcpServerUrlValidator("ftp://example.com/mcp", {})) ?? "",
      "absolute URL"
    );
    assert.strictEqual(probe.mock.calls.length, 0);
  });

  it("rejects a 404 — the one answer no valid MCP endpoint was measured giving", async () => {
    vi.spyOn(teamsProjectTypeDeps, "probeMCPServerAuth").mockResolvedValue({
      requiresAuth: false,
      endpointStatus: "notEndpoint",
      responseStatus: 404,
    });

    assert.include(
      (await mcpServerUrlValidator("https://example.com/mcp", {})) ?? "",
      "Couldn't reach an MCP server at this URL"
    );
  });

  it("accepts the weaker negative shapes and an undetermined probe", async () => {
    const probe = vi.spyOn(teamsProjectTypeDeps, "probeMCPServerAuth");

    probe.mockResolvedValue({
      requiresAuth: false,
      endpointStatus: "notEndpoint",
      responseStatus: 403,
    });
    assert.isUndefined(await mcpServerUrlValidator("https://example.com/mcp", {}));

    probe.mockResolvedValue({ requiresAuth: false, endpointStatus: "undetermined" });
    assert.isUndefined(await mcpServerUrlValidator("https://example.com/mcp", {}));

    probe.mockResolvedValue({ requiresAuth: true, endpointStatus: "confirmed" });
    assert.isUndefined(await mcpServerUrlValidator("https://example.com/mcp", {}));
  });
});
