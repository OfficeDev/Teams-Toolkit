// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import fs from "fs-extra";
import { assert, vi } from "vitest";
import {
  fetchMCPTools,
  probeMCPServerAuth,
  readMCPToolsFromFile,
  resolveMCPOAuthMetadata,
} from "../../../src/component/utils/mcpToolFetcher";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    async connect(): Promise<void> {
      throw new Error("mock connect failure");
    }
    async listTools(): Promise<{ tools: any[] }> {
      return { tools: [] };
    }
    async close(): Promise<void> {
      return;
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(_url: URL) {}
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class {
    constructor(_url: URL) {}
  },
}));

describe("mcpToolFetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchMCPTools", () => {
    it("should return requiresAuth=true when server returns 401", async () => {
      vi.spyOn(axios, "get").mockRejectedValue({
        response: {
          status: 401,
          headers: {},
        },
      });

      const result = await fetchMCPTools("https://example.com/mcp");
      assert.isTrue(result.requiresAuth);
      assert.isEmpty(result.tools);
    });

    it("should extract authMetadataUrl from WWW-Authenticate header on 401", async () => {
      vi.spyOn(axios, "get").mockRejectedValue({
        response: {
          status: 401,
          headers: {
            "www-authenticate": 'Bearer resource_metadata= "https://example.com/.well-known/oauth"',
          },
        },
      });

      const result = await fetchMCPTools("https://example.com/mcp");
      assert.isTrue(result.requiresAuth);
      assert.equal(result.authMetadataUrl, "https://example.com/.well-known/oauth");
    });

    it("should return empty tools when MCP SDK import fails", async () => {
      // Simulate non-401 error from initial GET
      vi.spyOn(axios, "get").mockRejectedValue(new Error("Connection refused"));

      const result = await fetchMCPTools("invalid-url");
      // When SDK imports fail, should return empty tools
      assert.isFalse(result.requiresAuth);
      assert.isEmpty(result.tools);
    });
  });

  describe("readMCPToolsFromFile", () => {
    it("should throw when file does not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      try {
        await readMCPToolsFromFile("/nonexistent/tools.json");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "/nonexistent/tools.json");
      }
    });

    it("should parse tools from { tools: [...] } format", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue({
        tools: [
          {
            name: "tool1",
            description: "First tool",
            inputSchema: { type: "object", properties: { a: { type: "string" } } },
          },
          {
            name: "tool2",
            description: "Second tool",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });

      const tools = await readMCPToolsFromFile("/some/tools.json");
      assert.equal(tools.length, 2);
      assert.equal(tools[0].name, "tool1");
      assert.equal(tools[0].description, "First tool");
      assert.deepEqual(tools[0].inputSchema, {
        type: "object",
        properties: { a: { type: "string" } },
      });
      assert.equal(tools[1].name, "tool2");
    });

    it("should parse tools from raw array format", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue([
        {
          name: "myTool",
          description: "A tool",
          inputSchema: { type: "object" },
        },
      ]);

      const tools = await readMCPToolsFromFile("/some/tools.json");
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "myTool");
    });

    it("should throw on invalid format (not array and no tools property)", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue({ name: "not-tools" });

      try {
        await readMCPToolsFromFile("/some/bad.json");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "/some/bad.json");
      }
    });

    it("should throw when a tool is missing name property", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue({
        tools: [{ description: "no name", inputSchema: {} }],
      });

      try {
        await readMCPToolsFromFile("/some/tools.json");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "/some/tools.json");
      }
    });

    it("should default description to empty string when not provided", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue({
        tools: [{ name: "tool1" }],
      });

      const tools = await readMCPToolsFromFile("/some/tools.json");
      assert.equal(tools[0].description, "");
    });

    it("should default inputSchema when not provided", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue({
        tools: [{ name: "tool1" }],
      });

      const tools = await readMCPToolsFromFile("/some/tools.json");
      assert.deepEqual(tools[0].inputSchema, { type: "object", properties: {} });
    });

    it("should accept input_schema as alternative to inputSchema", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue({
        tools: [
          {
            name: "tool1",
            input_schema: { type: "object", properties: { x: { type: "number" } } },
          },
        ],
      });

      const tools = await readMCPToolsFromFile("/some/tools.json");
      assert.deepEqual(tools[0].inputSchema, {
        type: "object",
        properties: { x: { type: "number" } },
      });
    });
  });

  describe("probeMCPServerAuth", () => {
    it("should return requiresAuth=false when server responds 200", async () => {
      vi.spyOn(axios, "post").mockResolvedValue({ status: 200 });

      const result = await probeMCPServerAuth("https://example.com/mcp");
      assert.isFalse(result.requiresAuth);
      assert.isUndefined(result.authMetadataUrl);
    });

    it("should return requiresAuth=true when server responds 401", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({
        response: {
          status: 401,
          headers: {},
        },
      });

      const result = await probeMCPServerAuth("https://secure.example.com/mcp");
      assert.isTrue(result.requiresAuth);
      assert.isUndefined(result.authMetadataUrl);
    });

    it("should extract authMetadataUrl from WWW-Authenticate header", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({
        response: {
          status: 401,
          headers: {
            "www-authenticate":
              'Bearer resource_metadata= "https://secure.example.com/.well-known/oauth"',
          },
        },
      });

      const result = await probeMCPServerAuth("https://secure.example.com/mcp");
      assert.isTrue(result.requiresAuth);
      assert.equal(result.authMetadataUrl, "https://secure.example.com/.well-known/oauth");
    });

    it("should return requiresAuth=false on non-401 errors", async () => {
      vi.spyOn(axios, "post").mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await probeMCPServerAuth("https://down.example.com/mcp");
      assert.isFalse(result.requiresAuth);
    });

    it("should handle 401 via error.status (no response object)", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ status: 401 });

      const result = await probeMCPServerAuth("https://secure.example.com/mcp");
      assert.isTrue(result.requiresAuth);
    });
  });

  describe("resolveMCPOAuthMetadata", () => {
    it("should resolve metadata via authMetadataUrl", async () => {
      const getStub = vi.spyOn(axios, "get");
      // First call: resource metadata
      getStub.mockResolvedValueOnce({
        status: 200,
        data: {
          authorization_servers: ["https://auth.example.com/oauth"],
        },
      });
      // Second call: well-known endpoint
      getStub.mockResolvedValueOnce({
        data: {
          authorization_endpoint: "https://auth.example.com/authorize",
          token_endpoint: "https://auth.example.com/token",
          refresh_endpoint: "https://auth.example.com/refresh",
        },
      });

      const result = await resolveMCPOAuthMetadata(
        "https://example.com/.well-known/oauth-protected-resource"
      );
      assert.equal(result.authorizationUrl, "https://auth.example.com/authorize");
      assert.equal(result.tokenUrl, "https://auth.example.com/token");
      assert.equal(result.refreshUrl, "https://auth.example.com/refresh");
    });

    it("should use wellKnownUrl directly when provided", async () => {
      const getStub = vi.spyOn(axios, "get");
      // Only one call: the well-known endpoint directly
      getStub.mockResolvedValue({
        data: {
          authorization_endpoint: "https://auth.example.com/authorize",
          token_endpoint: "https://auth.example.com/token",
        },
      });

      const result = await resolveMCPOAuthMetadata(
        undefined,
        "https://auth.example.com/.well-known/oauth-authorization-server"
      );
      assert.equal(result.authorizationUrl, "https://auth.example.com/authorize");
      assert.equal(result.tokenUrl, "https://auth.example.com/token");
      assert.isUndefined(result.refreshUrl);
      // Should only call once — skip resource metadata
      assert.isTrue(getStub.mock.calls.length === 1);
    });

    it("should throw when both authMetadataUrl and wellKnownUrl are undefined", async () => {
      try {
        await resolveMCPOAuthMetadata(undefined, undefined);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });

    it("should throw when authorization_servers is missing in resource metadata", async () => {
      vi.spyOn(axios, "get").mockResolvedValue({
        status: 200,
        data: {},
      });

      try {
        await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });

    it("should throw when authorization_servers is empty array", async () => {
      vi.spyOn(axios, "get").mockResolvedValue({
        status: 200,
        data: { authorization_servers: [] },
      });

      try {
        await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });

    it("should throw when authorization_endpoint is missing from well-known", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockResolvedValueOnce({
        status: 200,
        data: { authorization_servers: ["https://auth.example.com/oauth"] },
      });
      getStub.mockResolvedValueOnce({
        data: {
          token_endpoint: "https://auth.example.com/token",
          // Missing authorization_endpoint
        },
      });

      try {
        await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });

    it("should throw when token_endpoint is missing from well-known", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockResolvedValueOnce({
        status: 200,
        data: { authorization_servers: ["https://auth.example.com/oauth"] },
      });
      getStub.mockResolvedValueOnce({
        data: {
          authorization_endpoint: "https://auth.example.com/authorize",
          // Missing token_endpoint
        },
      });

      try {
        await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });

    it("should construct correct well-known URL from authorization_servers[0]", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockResolvedValueOnce({
        status: 200,
        data: {
          authorization_servers: ["https://auth.example.com/tenant/v2"],
        },
      });
      getStub.mockResolvedValueOnce({
        data: {
          authorization_endpoint: "https://auth.example.com/authorize",
          token_endpoint: "https://auth.example.com/token",
        },
      });

      await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");

      // Verify well-known URL follows RFC 8414 format
      const wellKnownCallUrl = getStub.mock.calls[1][0];
      assert.equal(
        wellKnownCallUrl,
        "https://auth.example.com/.well-known/oauth-authorization-server/tenant/v2"
      );
    });

    it("should not append a trailing slash for a host-only issuer (e.g. Notion)", async () => {
      const getStub = vi.spyOn(axios, "get");
      // Resource metadata returns a host-only issuer (no path); new URL().pathname is "/".
      getStub.mockResolvedValueOnce({
        status: 200,
        data: {
          authorization_servers: ["https://mcp.notion.com"],
        },
      });
      getStub.mockResolvedValueOnce({
        data: {
          authorization_endpoint: "https://mcp.notion.com/authorize",
          token_endpoint: "https://mcp.notion.com/token",
        },
      });

      const result = await resolveMCPOAuthMetadata(
        "https://mcp.notion.com/.well-known/oauth-protected-resource/mcp"
      );

      // Must NOT have a trailing slash — Notion returns 404 for ".../oauth-authorization-server/".
      const wellKnownCallUrl = getStub.mock.calls[1][0];
      assert.equal(
        wellKnownCallUrl,
        "https://mcp.notion.com/.well-known/oauth-authorization-server"
      );
      assert.equal(
        result.wellKnownUrl,
        "https://mcp.notion.com/.well-known/oauth-authorization-server"
      );
    });

    it("should throw when only token_endpoint is present (missing authorization_endpoint)", async () => {
      vi.spyOn(axios, "get").mockResolvedValue({
        data: {
          token_endpoint: "https://auth.example.com/token",
          // Missing authorization_endpoint intentionally
        },
      });

      try {
        await resolveMCPOAuthMetadata(
          undefined,
          "https://auth.example.com/.well-known/oauth-authorization-server"
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });

    it("should throw when only authorization_endpoint is present (missing token_endpoint)", async () => {
      vi.spyOn(axios, "get").mockResolvedValue({
        data: {
          authorization_endpoint: "https://auth.example.com/authorize",
          // Missing token_endpoint intentionally
        },
      });

      try {
        await resolveMCPOAuthMetadata(
          undefined,
          "https://auth.example.com/.well-known/oauth-authorization-server"
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
    });
  });
});
