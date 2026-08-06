// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import { SpecParser, Utils, ValidationStatus } from "@microsoft/m365-spec-parser";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { assert, afterEach, vi } from "vitest";
import {
  createDefaultCreateOptionsProviders,
  createLocalMcpServersProvider,
  createMcpServerTypesProvider,
  createMcpToolsProvider,
  createOpenApiSearchProvider,
  openApiOperationsProvider,
} from "../../../src/v4/providers/createOptionsProviders";

describe("create options providers (collect-create-inputs INV-9)", () => {
  const toolsJson = JSON.stringify({
    tools: [
      { name: "searchFlights", description: "Search flights", inputSchema: { type: "object" } },
      { name: "bookFlight", inputSchema: { type: "object" } },
    ],
  });

  async function captureError(action: () => Promise<unknown>): Promise<unknown> {
    try {
      await action();
      return undefined;
    } catch (error) {
      return error;
    }
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("CCI-INV-9: default create provider registry exposes stable provider ids", () => {
    const providers = createDefaultCreateOptionsProviders(
      async () => ({ requiresAuth: false, tools: [] }),
      async () => []
    );

    assert.sameMembers(Object.keys(providers), [
      "mcp.serverTypes",
      "mcp.localServers",
      "mcp.tools",
      "openapi.search",
      "openapi.operations",
    ]);
  });

  it("CCI-17: openapi.search provider maps search results and reports user-fixable misses", async () => {
    const provider = createOpenApiSearchProvider(async (query) => [
      {
        key: "Repairs API",
        url: `https://example.com/${query}.yaml`,
        description: "Manage repairs",
      },
    ]);

    const result = await provider.fetch({ query: "repairs" });

    assert.deepEqual(result.options, [
      {
        id: "https://example.com/repairs.yaml",
        label: "Repairs API",
        detail: "Manage repairs",
      },
    ]);

    const blank = await captureError(() => provider.fetch({ query: "   " }));
    assert.instanceOf(blank, UserError);
    assert.equal((blank as UserError).name, "OpenApiSearchQueryMissing");

    const empty = await captureError(() =>
      createOpenApiSearchProvider(async () => []).fetch({ query: "missing" })
    );
    assert.instanceOf(empty, UserError);
    assert.equal((empty as UserError).name, "OpenApiSearchResultNotFound");
  });

  it("CCI-01/02: mcp.serverTypes provider gates local by discovered local servers", async () => {
    const remoteOnly = createMcpServerTypesProvider(async () => []);
    const withLocal = createMcpServerTypesProvider(async () => [
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

    assert.deepEqual(
      (await remoteOnly.fetch({})).options.map((option) => option.id),
      ["remote"]
    );
    assert.deepEqual(remoteOnly.derivedSchema, ["catalog"]);
    assert.deepEqual((await remoteOnly.fetch({})).derived, { catalog: "{}" });
    const localResult = await withLocal.fetch({});
    assert.deepEqual(
      localResult.options.map((option) => option.id),
      ["remote", "local"]
    );
    assert.deepEqual(localResult.derived, {
      catalog: JSON.stringify({
        ghmcp: { command: "npx", args: ["-y", "@github/github-mcp-server"] },
      }),
    });
  });

  it("CCI-02: a prefilled remote server type does not probe local server state", async () => {
    const listLocalServers = vi.fn(async () => []);
    const provider = createMcpServerTypesProvider(listLocalServers);

    const result = await provider.fetch({ selected: "remote" });

    assert.deepEqual(
      result.options.map((option) => option.id),
      ["remote"]
    );
    assert.deepEqual(result.derived, { catalog: "{}" });
    assert.equal(listLocalServers.mock.calls.length, 0);
  });

  it("CCI-01/02: default registry shares one local MCP server discovery call", async () => {
    let calls = 0;
    const providers = createDefaultCreateOptionsProviders(
      async () => ({ requiresAuth: false, tools: [] }),
      async () => {
        calls += 1;
        return [
          {
            name: "ghmcp",
            display_name: "GitHub MCP",
            description: "GitHub tools",
            version: "1.0.0",
            identifier: "github",
            tools: [{ name: "search", description: "Search", inputSchema: {} }],
            packageFamily: "GitHub.MCP",
            command: "npx",
            args: ["-y", "@github/github-mcp-server"],
          },
        ];
      }
    );

    assert.deepEqual(
      (await providers["mcp.serverTypes"].fetch({})).options.map((option) => option.id),
      ["remote", "local"]
    );
    assert.deepEqual(
      (await providers["mcp.localServers"].fetch({})).options.map((option) => option.id),
      ["ghmcp"]
    );
    assert.equal(calls, 1);
  });

  it("CCI-02: local MCP server options include display fallback and tool-count detail", async () => {
    const provider = createLocalMcpServersProvider(async () => [
      {
        name: "ghmcp",
        display_name: "GitHub MCP",
        description: "GitHub tools",
        version: "1.0.0",
        identifier: "github",
        tools: [{ name: "search", description: "Search", inputSchema: {} }],
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
        tools: [
          { name: "inspect", description: "Inspect", inputSchema: {} },
          { name: "list", description: "List", inputSchema: {} },
        ],
        packageFamily: "Bare.MCP",
        command: "baremcp",
        args: [],
      },
    ]);

    const options = (await provider.fetch({})).options;

    assert.deepInclude(options, {
      id: "ghmcp",
      label: "GitHub MCP",
      detail: "GitHub tools (1 tools available)",
    });
    assert.deepInclude(options, {
      id: "baremcp",
      label: "baremcp",
      detail: "2 tools available",
    });
  });

  it("CCI-05: mcp.tools provider lists inline tools and returns normalized JSON", async () => {
    const provider = createMcpToolsProvider(async () => ({ requiresAuth: false, tools: [] }));

    const result = await provider.fetch({ toolsJson });

    assert.deepEqual(
      result.options.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail,
      })),
      [
        { id: "searchFlights", label: "searchFlights", detail: "Search flights" },
        { id: "bookFlight", label: "bookFlight", detail: "" },
      ]
    );
    assert.deepEqual(result.derived, { toolsJson });
  });

  it("CCI-05: mcp.tools provider reads tools JSON from file", async () => {
    const toolsFilePath = path.join(os.tmpdir(), `mcp-tools-${Date.now()}.json`);
    fs.writeFileSync(toolsFilePath, toolsJson);
    try {
      const provider = createMcpToolsProvider(async () => ({ requiresAuth: false, tools: [] }));

      const result = await provider.fetch({ toolsFilePath });

      assert.deepEqual(
        result.options.map((option) => option.id),
        ["searchFlights", "bookFlight"]
      );
      assert.deepEqual(result.derived, { toolsJson });
    } finally {
      fs.removeSync(toolsFilePath);
    }
  });

  it("CCI-06: mcp.tools provider fetches tools from remote server", async () => {
    const provider = createMcpToolsProvider(async (serverUrl) => ({
      requiresAuth: false,
      tools: [{ name: "remoteSearch", description: `From ${serverUrl}`, inputSchema: {} }],
    }));

    const result = await provider.fetch({ serverUrl: " https://example.com/mcp " });

    assert.deepEqual(
      result.options.map((option) => ({ id: option.id, detail: option.detail })),
      [{ id: "remoteSearch", detail: "From https://example.com/mcp" }]
    );
    assert.deepEqual(result.derived, {
      toolsJson: JSON.stringify({
        tools: [
          { name: "remoteSearch", description: "From https://example.com/mcp", inputSchema: {} },
        ],
      }),
    });
  });

  it("CCI-06: mcp.tools provider reports remote auth and empty-tool failures", async () => {
    const authRequired = await captureError(() =>
      createMcpToolsProvider(async () => ({ requiresAuth: true, tools: [] })).fetch({
        serverUrl: "https://example.com/mcp",
      })
    );
    assert.instanceOf(authRequired, UserError);
    assert.equal((authRequired as UserError).name, "McpAuthRequired");

    const emptyTools = await captureError(() =>
      createMcpToolsProvider(async () => ({ requiresAuth: false, tools: [] })).fetch({
        serverUrl: "https://example.com/mcp",
      })
    );
    assert.instanceOf(emptyTools, UserError);
    assert.equal((emptyTools as UserError).name, "McpToolsNotFound");
  });

  it("CCI-05/06: mcp.tools provider reports missing, unreadable, invalid, and failed-fetch input", async () => {
    const provider = createMcpToolsProvider(async () => {
      throw new Error("network failed");
    });

    const missing = await captureError(() => provider.fetch({}));
    assert.instanceOf(missing, UserError);
    assert.equal((missing as UserError).name, "McpToolsJsonMissing");

    const unreadable = await captureError(() =>
      provider.fetch({ toolsFilePath: "Z:/missing.json" })
    );
    assert.instanceOf(unreadable, UserError);
    assert.equal((unreadable as UserError).name, "McpToolsFileReadFailed");

    const invalid = await captureError(() => provider.fetch({ toolsJson: "not json" }));
    assert.instanceOf(invalid, UserError);
    assert.equal((invalid as UserError).name, "McpStaticToolsParse");

    const fetchFailed = await captureError(() =>
      provider.fetch({ serverUrl: "https://example.com/mcp" })
    );
    assert.instanceOf(fetchFailed, UserError);
    assert.equal((fetchFailed as UserError).name, "McpToolsFetchFailed");
  });

  it("CCI-17: openapi.operations provider requires a spec location and rejects invalid specs", async () => {
    const missing = await captureError(() => openApiOperationsProvider.fetch({}));
    assert.instanceOf(missing, SystemError);
    assert.equal((missing as SystemError).name, "OpenApiMissingSpecLocation");

    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Error,
    } as any);
    const invalid = await captureError(() =>
      openApiOperationsProvider.fetch({ apiSpecLocation: " ./openapi.yaml " })
    );
    assert.instanceOf(invalid, UserError);
    assert.equal((invalid as UserError).name, "OpenApiSpecInvalid");

    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Warning,
    } as any);
    vi.spyOn(SpecParser.prototype, "list").mockRejectedValue(new Error("parse failed"));
    const failedList = await captureError(() =>
      openApiOperationsProvider.fetch({ apiSpecLocation: " ./openapi.yaml " })
    );
    assert.instanceOf(failedList, UserError);
    assert.equal((failedList as UserError).name, "OpenApiSpecInvalid");
  });

  it("CCI-17: openapi.operations provider sorts valid operations and labels auth details", async () => {
    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Warning,
    } as any);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        { api: "POST /repairs", isValid: true, auth: { authScheme: "oauth" } },
        { api: "GET /repairs", isValid: true, auth: undefined },
        { api: "DELETE /repairs/{id}", isValid: false, auth: undefined },
        { api: "PATCH /repairs/{id}", isValid: true, auth: { authScheme: "apiKey" } },
        { api: "GET /inventory", isValid: true, auth: { authScheme: "bearer" } },
        { api: "TRACE /diagnostics", isValid: true, auth: { authScheme: "unsupported" } },
      ],
    } as any);
    vi.spyOn(Utils, "isBearerTokenAuth").mockImplementation((scheme) => scheme === "bearer");
    vi.spyOn(Utils, "isOAuthWithAuthCodeFlow").mockImplementation((scheme) => scheme === "oauth");
    vi.spyOn(Utils, "isAPIKeyAuthButNotInCookie").mockImplementation(
      (scheme) => scheme === "apiKey"
    );

    const result = await openApiOperationsProvider.fetch({ apiSpecLocation: " ./openapi.yaml " });

    assert.deepEqual(
      result.options.map((option) => ({
        id: option.id,
        groupName: option.groupName,
        detail: option.detail,
      })),
      [
        { id: "GET /inventory", groupName: "GET", detail: "API key" },
        { id: "GET /repairs", groupName: "GET", detail: "No authentication" },
        {
          id: "PATCH /repairs/{id}",
          groupName: "PATCH",
          detail: "API key with header or query parameter",
        },
        { id: "POST /repairs", groupName: "POST", detail: "OAuth" },
        { id: "TRACE /diagnostics", groupName: "TRACE", detail: "Unsupported authentication" },
      ]
    );
  });
});
