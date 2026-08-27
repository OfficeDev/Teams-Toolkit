// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import fs from "fs-extra";
import { Readable } from "stream";
import { assert, vi } from "vitest";
import {
  buildMCPServerWellKnownCandidates,
  buildProtectedResourceCandidates,
  buildWellKnownCandidates,
  fetchMCPTools,
  probeMCPServerAuth,
  readMCPToolsFromFile,
  resolveMCPOAuthMetadata,
} from "../../../src/component/utils/mcpToolFetcher";

const sdkClient = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    async connect(): Promise<void> {
      return sdkClient.connect();
    }
    async listTools(): Promise<{ tools: any[] }> {
      return sdkClient.listTools();
    }
    async close(): Promise<void> {
      return sdkClient.close();
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
  beforeEach(() => {
    sdkClient.close.mockReset().mockResolvedValue(undefined);
    sdkClient.connect.mockReset().mockRejectedValue(new Error("mock connect failure"));
    sdkClient.listTools.mockReset().mockResolvedValue({ tools: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchMCPTools", () => {
    it("should forward the abort signal to the initial request", async () => {
      const getStub = vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const controller = new AbortController();

      await fetchMCPTools("https://example.com/mcp", controller.signal);

      assert.strictEqual(getStub.mock.calls[0][1]?.signal, controller.signal);
    });

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

    it("should return tools from the streamable HTTP transport", async () => {
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      sdkClient.connect.mockResolvedValue(undefined);
      sdkClient.listTools.mockResolvedValue({
        tools: [{ name: "search", inputSchema: { type: "object" } }],
      });

      const result = await fetchMCPTools("https://example.com/mcp");

      assert.isFalse(result.requiresAuth);
      assert.deepEqual(result.tools, [
        { name: "search", description: "", inputSchema: { type: "object" } },
      ]);
      assert.strictEqual(sdkClient.close.mock.calls.length, 1);
    });

    it("should fall back to SSE when the streamable HTTP transport fails", async () => {
      vi.spyOn(axios, "get").mockRejectedValue(new Error("Connection refused"));
      sdkClient.connect
        .mockRejectedValueOnce(new Error("streamable transport failed"))
        .mockResolvedValueOnce(undefined);
      sdkClient.listTools.mockResolvedValue({
        tools: [{ name: "search", description: "SSE search", inputSchema: {} }],
      });

      const result = await fetchMCPTools("https://example.com/mcp");

      assert.isFalse(result.requiresAuth);
      assert.deepEqual(result.tools, [
        { name: "search", description: "SSE search", inputSchema: {} },
      ]);
      assert.strictEqual(sdkClient.connect.mock.calls.length, 2);
      assert.strictEqual(sdkClient.close.mock.calls.length, 2);
    });

    it("should report auth when both transports fail after an unauthorized response", async () => {
      vi.spyOn(axios, "get").mockRejectedValue(new Error("Connection refused"));
      sdkClient.connect
        .mockRejectedValueOnce(new Error("Unauthorized"))
        .mockRejectedValueOnce(new Error("SSE transport failed"));

      const result = await fetchMCPTools("https://example.com/mcp");

      assert.isTrue(result.requiresAuth);
      assert.isEmpty(result.tools);
    });

    it("should recognize a direct 401 status without response metadata", async () => {
      vi.spyOn(axios, "get").mockRejectedValue({ status: 401 });

      const result = await fetchMCPTools("https://example.com/mcp");

      assert.isTrue(result.requiresAuth);
      assert.isUndefined(result.authMetadataUrl);
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
    it("should forward the abort signal to the initialize request", async () => {
      const postStub = vi.spyOn(axios, "post").mockResolvedValue({
        status: 200,
        data: { jsonrpc: "2.0", id: 1, result: {} },
      });
      const controller = new AbortController();

      await probeMCPServerAuth("https://example.com/mcp", controller.signal);

      assert.strictEqual(postStub.mock.calls[0][2]?.signal, controller.signal);
    });

    it("should confirm the endpoint when a 200 carries a JSON-RPC envelope", async () => {
      vi.spyOn(axios, "post").mockResolvedValue({
        status: 200,
        data: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } },
      });

      const result = await probeMCPServerAuth("https://example.com/mcp");
      assert.isFalse(result.requiresAuth);
      assert.equal(result.endpointStatus, "confirmed");
      assert.isUndefined(result.authMetadataUrl);
    });

    it("should confirm the endpoint when the JSON-RPC envelope arrives SSE-framed", async () => {
      // Streamable-HTTP servers answer `initialize` with `text/event-stream`, which axios hands
      // back as raw text. The envelope is inside the `data:` payload, so the body text carries
      // the proof even though nothing parsed the frames.
      vi.spyOn(axios, "post").mockResolvedValue({
        status: 200,
        data: 'event: message\ndata: {"result":{"protocolVersion":"2025-03-26"},"id":1,"jsonrpc":"2.0"}\n\n',
      });

      const result = await probeMCPServerAuth("https://learn.example.com/api/mcp");
      assert.isFalse(result.requiresAuth);
      assert.equal(result.endpointStatus, "confirmed");
    });

    it("should reject a 200 that carries no JSON-RPC envelope", async () => {
      // A truncated url on a host that serves a landing page answers 200 with HTML, so the
      // status alone proves nothing.
      vi.spyOn(axios, "post").mockResolvedValue({
        status: 200,
        data: "<!DOCTYPE html><html><body>Welcome</body></html>",
      });

      const result = await probeMCPServerAuth("https://example.com/");
      assert.isFalse(result.requiresAuth);
      assert.equal(result.endpointStatus, "notEndpoint");
      assert.equal(result.responseStatus, 200);
    });

    it("should reject a 200 whose body is neither text nor an object", async () => {
      // A 204-style empty body deserializes to undefined; it carries no envelope either.
      vi.spyOn(axios, "post").mockResolvedValue({ status: 200, data: undefined });

      const result = await probeMCPServerAuth("https://example.com/");
      assert.isFalse(result.requiresAuth);
      assert.equal(result.endpointStatus, "notEndpoint");
      assert.equal(result.responseStatus, 200);
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

    it("should leave the endpoint undetermined on a transport failure", async () => {
      // Nothing was learned about the url, so it must not be reported as wrong.
      vi.spyOn(axios, "post").mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await probeMCPServerAuth("https://down.example.com/mcp");
      assert.isFalse(result.requiresAuth);
      assert.equal(result.endpointStatus, "undetermined");
      assert.isUndefined(result.responseStatus);
    });

    it("should leave the endpoint undetermined on a 5xx", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 503 } });

      const result = await probeMCPServerAuth("https://down.example.com/mcp");
      assert.equal(result.endpointStatus, "undetermined");
    });

    it("should leave the endpoint undetermined on a transient 4xx", async () => {
      // 429 says the server is throttling, not that the url is wrong.
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 429 } });

      const result = await probeMCPServerAuth("https://busy.example.com/mcp");
      assert.equal(result.endpointStatus, "undetermined");
      assert.isUndefined(result.responseStatus);
    });

    for (const status of [403, 404, 405]) {
      it(`should flag a ${status} as a url that is not an MCP endpoint`, async () => {
        // The mistyped form of an MCP url often still serves a page on GET, so only the
        // initialize POST reveals that nothing MCP is routed there.
        vi.spyOn(axios, "post").mockRejectedValue({ response: { status } });
        vi.spyOn(axios, "get").mockRejectedValue({ response: { status } });

        const result = await probeMCPServerAuth("https://taskmaster.example.com");
        assert.isFalse(result.requiresAuth);
        assert.equal(result.endpointStatus, "notEndpoint");
        assert.equal(result.responseStatus, status);
      });
    }

    it("should confirm a 4xx that turns out to be the deprecated HTTP+SSE transport", async () => {
      // A 2024-11-05 server has nothing to POST to, so the transport spec has the client fall
      // back to a GET and read the `endpoint` event rather than condemn the url.
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 405 } });
      vi.spyOn(axios, "get").mockResolvedValue({
        headers: { "content-type": "text/event-stream; charset=utf-8" },
        data: Readable.from(["event: endpoint\ndata: /messages?sessionId=abc\n\n"]),
      });

      const result = await probeMCPServerAuth("https://legacy.example.com/sse");
      assert.isFalse(result.requiresAuth);
      assert.equal(result.endpointStatus, "confirmed");
      assert.isUndefined(result.responseStatus);
    });

    it("should keep the notEndpoint verdict when the fallback GET is not an event stream", async () => {
      const stream = Readable.from(["<html>not found</html>"]);
      const destroySpy = vi.spyOn(stream, "destroy");
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 404 } });
      vi.spyOn(axios, "get").mockResolvedValue({
        headers: { "content-type": "text/html" },
        data: stream,
      });

      const result = await probeMCPServerAuth("https://example.com/");
      assert.equal(result.endpointStatus, "notEndpoint");
      assert.equal(result.responseStatus, 404);
      assert.isTrue(destroySpy.mock.calls.length > 0);
    });

    it("should keep the notEndpoint verdict when the event stream names no endpoint", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 405 } });
      vi.spyOn(axios, "get").mockResolvedValue({
        headers: { "content-type": "text/event-stream" },
        data: Readable.from(["event: ping\ndata: {}\n\n"]),
      });

      const result = await probeMCPServerAuth("https://noisy.example.com/sse");
      assert.equal(result.endpointStatus, "notEndpoint");
      assert.equal(result.responseStatus, 405);
    });

    it("should keep the notEndpoint verdict when the event stream errors out", async () => {
      const stream = new Readable({ read: () => undefined });
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 404 } });
      vi.spyOn(axios, "get").mockResolvedValue({
        headers: { "content-type": "text/event-stream" },
        data: stream,
      });
      setTimeout(() => stream.emit("error", new Error("ECONNRESET")), 0);

      const result = await probeMCPServerAuth("https://flaky.example.com/sse");
      assert.equal(result.endpointStatus, "notEndpoint");
      assert.equal(result.responseStatus, 404);
    });

    it("should stop reading an event stream that never names an endpoint", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ response: { status: 404 } });
      vi.spyOn(axios, "get").mockResolvedValue({
        headers: { "content-type": "text/event-stream" },
        data: Readable.from(["data: " + "x".repeat(9000) + "\n\n", "event: endpoint\n\n"]),
      });

      const result = await probeMCPServerAuth("https://chatty.example.com/sse");
      assert.equal(result.endpointStatus, "notEndpoint");
    });

    it("should confirm rather than reject a 401", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ status: 401 });

      const result = await probeMCPServerAuth("https://taskmaster.example.com/mcp");
      assert.isTrue(result.requiresAuth);
      assert.equal(result.endpointStatus, "confirmed");
    });

    it("should handle 401 via error.status (no response object)", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ status: 401 });

      const result = await probeMCPServerAuth("https://secure.example.com/mcp");
      assert.isTrue(result.requiresAuth);
    });

    it("should flag a 404 reported via error.status (no response object)", async () => {
      vi.spyOn(axios, "post").mockRejectedValue({ status: 404 });
      vi.spyOn(axios, "get").mockRejectedValue({ status: 404 });

      const result = await probeMCPServerAuth("https://example.com/");
      assert.equal(result.endpointStatus, "notEndpoint");
      assert.equal(result.responseStatus, 404);
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

    it("should bound every OAuth metadata request with a timeout", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockResolvedValueOnce({
        status: 200,
        data: { authorization_servers: ["https://auth.example.com/oauth"] },
      });
      getStub.mockResolvedValueOnce({
        data: {
          authorization_endpoint: "https://auth.example.com/authorize",
          token_endpoint: "https://auth.example.com/token",
        },
      });

      await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");

      assert.equal(getStub.mock.calls.length, 2);
      for (const call of getStub.mock.calls) {
        assert.deepEqual(call[1], { timeout: 10000 });
      }
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

    it("should fall back to the appended OIDC discovery form when RFC 8414 insertion 404s", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://example.com/.well-known/oauth-protected-resource") {
          return {
            status: 200,
            data: { authorization_servers: ["https://login.microsoftonline.com/common/v2.0"] },
          };
        }
        // Entra serves ONLY the appended OIDC form; every other candidate 404s.
        if (
          url === "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"
        ) {
          return {
            data: {
              authorization_endpoint:
                "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
              token_endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const result = await resolveMCPOAuthMetadata(
        "https://example.com/.well-known/oauth-protected-resource"
      );

      assert.equal(
        result.authorizationUrl,
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
      );
      assert.equal(result.tokenUrl, "https://login.microsoftonline.com/common/oauth2/v2.0/token");
      assert.equal(
        result.wellKnownUrl,
        "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"
      );
    });

    it("should skip a candidate that responds without endpoints and try the next one", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://example.com/.well-known/oauth-protected-resource") {
          return { status: 200, data: { authorization_servers: ["https://auth.example.com/t1"] } };
        }
        if (url === "https://auth.example.com/.well-known/oauth-authorization-server/t1") {
          // Responds 200 but with a protected-resource document — no endpoints.
          return { data: { resource: "https://auth.example.com/", authorization_servers: [] } };
        }
        if (url === "https://auth.example.com/.well-known/openid-configuration/t1") {
          return {
            data: {
              authorization_endpoint: "https://auth.example.com/authorize",
              token_endpoint: "https://auth.example.com/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const result = await resolveMCPOAuthMetadata(
        "https://example.com/.well-known/oauth-protected-resource"
      );

      assert.equal(result.authorizationUrl, "https://auth.example.com/authorize");
      assert.equal(
        result.wellKnownUrl,
        "https://auth.example.com/.well-known/openid-configuration/t1"
      );
    });

    it("should report every attempted candidate when all of them fail", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://example.com/.well-known/oauth-protected-resource") {
          return { status: 200, data: { authorization_servers: ["https://auth.example.com/t1"] } };
        }
        throw new Error("Request failed with status code 404");
      });

      try {
        await resolveMCPOAuthMetadata("https://example.com/.well-known/oauth-protected-resource");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(
          e.message,
          "https://auth.example.com/.well-known/oauth-authorization-server/t1"
        );
        assert.include(e.message, "https://auth.example.com/t1/.well-known/openid-configuration");
      }
    });

    it("should not probe alternative candidates when wellKnownUrl is explicitly configured", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockRejectedValue(new Error("Request failed with status code 404"));

      try {
        await resolveMCPOAuthMetadata(
          undefined,
          "https://auth.example.com/.well-known/oauth-authorization-server"
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isNotEmpty(e.message);
      }
      assert.strictEqual(getStub.mock.calls.length, 1);
    });

    it("should fall back to the MCP server origin when the 401 carries no resource_metadata", async () => {
      // A server on the 2025-03-26 MCP auth spec: it is its own authorization server, publishes
      // RFC 8414 metadata at the origin root, and serves no protected-resource document.
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://mcp.contoso.com/.well-known/oauth-authorization-server") {
          return {
            status: 200,
            data: {
              authorization_endpoint: "https://mcp.contoso.com/oauth/authorize",
              token_endpoint: "https://mcp.contoso.com/oauth/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const metadata = await resolveMCPOAuthMetadata(
        undefined,
        undefined,
        "https://mcp.contoso.com/mcp"
      );

      assert.strictEqual(metadata.authorizationUrl, "https://mcp.contoso.com/oauth/authorize");
      assert.strictEqual(metadata.tokenUrl, "https://mcp.contoso.com/oauth/token");
      assert.strictEqual(
        metadata.wellKnownUrl,
        "https://mcp.contoso.com/.well-known/oauth-authorization-server"
      );
    });

    it("should fall back to the MCP server origin when the advertised metadata is unreachable", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://mcp.contoso.com/.well-known/oauth-authorization-server") {
          return {
            status: 200,
            data: {
              authorization_endpoint: "https://mcp.contoso.com/oauth/authorize",
              token_endpoint: "https://mcp.contoso.com/oauth/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const metadata = await resolveMCPOAuthMetadata(
        "https://mcp.contoso.com/.well-known/oauth-protected-resource",
        undefined,
        "https://mcp.contoso.com/mcp"
      );

      assert.strictEqual(metadata.tokenUrl, "https://mcp.contoso.com/oauth/token");
    });

    it("should prefer the advertised authorization server over the MCP server origin", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://mcp.contoso.com/.well-known/oauth-protected-resource") {
          return { status: 200, data: { authorization_servers: ["https://auth.contoso.com"] } };
        }
        if (url === "https://auth.contoso.com/.well-known/oauth-authorization-server") {
          return {
            status: 200,
            data: {
              authorization_endpoint: "https://auth.contoso.com/authorize",
              token_endpoint: "https://auth.contoso.com/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const metadata = await resolveMCPOAuthMetadata(
        "https://mcp.contoso.com/.well-known/oauth-protected-resource",
        undefined,
        "https://mcp.contoso.com/mcp"
      );

      assert.strictEqual(metadata.authorizationUrl, "https://auth.contoso.com/authorize");
    });

    it("should derive the protected-resource document when the server never advertised one", async () => {
      // Google's MCP servers defer authorization to the tool calls, so an unauthenticated
      // initialize returns 200 with no challenge and there is no resource_metadata to follow.
      // The document still exists at the RFC 9728 §3.1 insertion location.
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://drivemcp.googleapis.com/.well-known/oauth-protected-resource/mcp/v1") {
          return {
            status: 200,
            data: { authorization_servers: ["https://accounts.google.com/"] },
          };
        }
        if (url === "https://accounts.google.com/.well-known/oauth-authorization-server") {
          return {
            status: 200,
            data: {
              authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
              token_endpoint: "https://oauth2.googleapis.com/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const metadata = await resolveMCPOAuthMetadata(
        undefined,
        undefined,
        "https://drivemcp.googleapis.com/mcp/v1"
      );

      assert.strictEqual(metadata.authorizationUrl, "https://accounts.google.com/o/oauth2/v2/auth");
      assert.strictEqual(metadata.tokenUrl, "https://oauth2.googleapis.com/token");
      assert.strictEqual(
        metadata.wellKnownUrl,
        "https://accounts.google.com/.well-known/oauth-authorization-server"
      );
      // The authoritative document answered, so the server was never guessed to be its own
      // authorization server.
      assert.isFalse(
        getStub.mock.calls.some(
          (call) =>
            call[0] === "https://drivemcp.googleapis.com/.well-known/oauth-authorization-server"
        )
      );
    });

    it("should derive the protected-resource document from the origin root as well", async () => {
      const getStub = vi.spyOn(axios, "get");
      getStub.mockImplementation(async (url: string): Promise<any> => {
        if (url === "https://mcp.contoso.com/.well-known/oauth-protected-resource") {
          return { status: 200, data: { authorization_servers: ["https://auth.contoso.com"] } };
        }
        if (url === "https://auth.contoso.com/.well-known/oauth-authorization-server") {
          return {
            status: 200,
            data: {
              authorization_endpoint: "https://auth.contoso.com/authorize",
              token_endpoint: "https://auth.contoso.com/token",
            },
          };
        }
        throw new Error("Request failed with status code 404");
      });

      const metadata = await resolveMCPOAuthMetadata(
        undefined,
        undefined,
        "https://mcp.contoso.com/mcp"
      );

      assert.strictEqual(metadata.tokenUrl, "https://auth.contoso.com/token");
    });

    it("should still throw when neither the metadata url nor the server url resolves", async () => {
      vi.spyOn(axios, "get").mockRejectedValue(new Error("Request failed with status code 404"));

      try {
        await resolveMCPOAuthMetadata(undefined, undefined, "https://mcp.contoso.com/mcp");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "https://mcp.contoso.com/.well-known/oauth-authorization-server");
      }
    });

    it("should surface the fetch failure when there is no server url to fall back to", async () => {
      // Without an MCP server url there is nothing left to try, so the transport error is
      // reported as-is rather than being swallowed into a generic "no candidates" message.
      vi.spyOn(axios, "get").mockRejectedValue(new Error("getaddrinfo ENOTFOUND mcp.contoso.com"));

      try {
        await resolveMCPOAuthMetadata(
          "https://mcp.contoso.com/.well-known/oauth-protected-resource",
          undefined,
          undefined
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "ENOTFOUND");
      }
    });
  });

  describe("buildMCPServerWellKnownCandidates", () => {
    it("should probe the path-derived forms before the origin root", () => {
      assert.deepEqual(buildMCPServerWellKnownCandidates("https://mcp.contoso.com/mcp"), [
        "https://mcp.contoso.com/.well-known/oauth-authorization-server/mcp",
        "https://mcp.contoso.com/.well-known/openid-configuration/mcp",
        "https://mcp.contoso.com/mcp/.well-known/oauth-authorization-server",
        "https://mcp.contoso.com/mcp/.well-known/openid-configuration",
        "https://mcp.contoso.com/.well-known/oauth-authorization-server",
        "https://mcp.contoso.com/.well-known/openid-configuration",
      ]);
    });

    it("should deduplicate when the server url has no path", () => {
      assert.deepEqual(buildMCPServerWellKnownCandidates("https://mcp.contoso.com"), [
        "https://mcp.contoso.com/.well-known/oauth-authorization-server",
        "https://mcp.contoso.com/.well-known/openid-configuration",
      ]);
    });
  });

  describe("buildProtectedResourceCandidates", () => {
    it("should probe the RFC 9728 insertion form before the origin root", () => {
      assert.deepEqual(buildProtectedResourceCandidates("https://drivemcp.googleapis.com/mcp/v1"), [
        "https://drivemcp.googleapis.com/.well-known/oauth-protected-resource/mcp/v1",
        "https://drivemcp.googleapis.com/.well-known/oauth-protected-resource",
      ]);
    });

    it("should deduplicate when the server url has no path", () => {
      assert.deepEqual(buildProtectedResourceCandidates("https://mcp.contoso.com"), [
        "https://mcp.contoso.com/.well-known/oauth-protected-resource",
      ]);
    });

    it("should strip a trailing slash from the resource path", () => {
      assert.deepEqual(buildProtectedResourceCandidates("https://mcp.contoso.com/mcp/"), [
        "https://mcp.contoso.com/.well-known/oauth-protected-resource/mcp",
        "https://mcp.contoso.com/.well-known/oauth-protected-resource",
      ]);
    });
  });

  describe("buildWellKnownCandidates", () => {
    it("should order insertion before append for an issuer with a path", () => {
      assert.deepEqual(buildWellKnownCandidates("https://login.microsoftonline.com/common/v2.0"), [
        "https://login.microsoftonline.com/.well-known/oauth-authorization-server/common/v2.0",
        "https://login.microsoftonline.com/.well-known/openid-configuration/common/v2.0",
        "https://login.microsoftonline.com/common/v2.0/.well-known/oauth-authorization-server",
        "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
      ]);
    });

    it("should deduplicate candidates for a host-only issuer", () => {
      assert.deepEqual(buildWellKnownCandidates("https://mcp.notion.com"), [
        "https://mcp.notion.com/.well-known/oauth-authorization-server",
        "https://mcp.notion.com/.well-known/openid-configuration",
      ]);
    });

    it("should strip a trailing slash from the issuer path", () => {
      assert.deepEqual(buildWellKnownCandidates("https://auth.example.com/tenant/"), [
        "https://auth.example.com/.well-known/oauth-authorization-server/tenant",
        "https://auth.example.com/.well-known/openid-configuration/tenant",
        "https://auth.example.com/tenant/.well-known/oauth-authorization-server",
        "https://auth.example.com/tenant/.well-known/openid-configuration",
      ]);
    });
  });
});
