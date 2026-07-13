// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import {
  ListAPIInfo,
  ParseOptions,
  ProjectType,
  SpecParser,
  Utils,
  ValidationStatus,
} from "@microsoft/m365-spec-parser";
import fs from "fs-extra";
import { OptionsProvider } from "../collectInputs/collectInputs";
import { MCPFetchResult } from "../../common/mcpToolFetcher";
import { type ODRServer } from "../../common/odrProvider";
import { SearchOpenAPISpecResult } from "../../common/kiotaClient";
import { getParserOptions } from "../../common/openApiParserOptions";
import { parseMcpStaticToolsJson } from "../mcp/mcpStaticTools";

const remoteMcpServerType = {
  id: "remote",
  label: "Remote MCP Server",
  keyPrefix: "core.createProjectQuestion.mcpServerType.remote",
};
const localMcpServerType = {
  id: "local",
  label: "Local MCP Server",
  keyPrefix: "core.createProjectQuestion.mcpServerType.local",
};

function createLocalServerCache(
  listLocalMcpServers: () => Promise<ODRServer[]>
): () => Promise<ODRServer[]> {
  let cached: Promise<ODRServer[]> | undefined;
  return () => {
    if (cached === undefined) {
      cached = listLocalMcpServers();
    }
    return cached;
  };
}

export function createMcpServerTypesProvider(
  localServers: () => Promise<ODRServer[]>
): OptionsProvider {
  return {
    derivedSchema: ["catalog"],
    async fetch(params) {
      if (params.selected === remoteMcpServerType.id) {
        return { options: [remoteMcpServerType], derived: { catalog: "{}" } };
      }
      const servers = await localServers();
      return {
        options:
          servers.length > 0 ? [remoteMcpServerType, localMcpServerType] : [remoteMcpServerType],
        derived: { catalog: localServerCatalog(servers) },
      };
    },
  };
}

function localServerDetail(server: ODRServer): string {
  const toolsDetail = `${server.tools.length} tools available`;
  return server.description ? `${server.description} (${toolsDetail})` : toolsDetail;
}

function localServerCatalog(servers: ODRServer[]): string {
  const catalog: Record<string, { command: string; args: string[] }> = {};
  for (const server of servers) {
    catalog[server.name] = { command: server.command, args: server.args };
  }
  return JSON.stringify(catalog);
}

export function createLocalMcpServersProvider(
  localServers: () => Promise<ODRServer[]>
): OptionsProvider {
  return {
    async fetch() {
      const servers = await localServers();
      return {
        options: servers.map((server) => ({
          id: server.name,
          label: server.display_name || server.name,
          detail: localServerDetail(server),
        })),
      };
    },
  };
}

function openApiParseOptions(): ParseOptions {
  // Reuse the v3 Copilot parser options (single source of truth) instead of a v4 copy.
  return getParserOptions(ProjectType.Copilot, true);
}

function operationDetail(operation: ListAPIInfo): string {
  if (!operation.auth) {
    return "No authentication";
  }
  if (Utils.isBearerTokenAuth(operation.auth.authScheme)) {
    return "API key";
  }
  if (Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme)) {
    return "OAuth";
  }
  if (Utils.isAPIKeyAuthButNotInCookie(operation.auth.authScheme)) {
    return "API key with header or query parameter";
  }
  return "Unsupported authentication";
}

function sortOperations(operations: ListAPIInfo[]): ListAPIInfo[] {
  return [...operations].sort((left, right) => {
    const leftParts = left.api.toLowerCase().split(" ");
    const rightParts = right.api.toLowerCase().split(" ");
    if (leftParts[0] < rightParts[0]) {
      return -1;
    }
    if (leftParts[0] > rightParts[0]) {
      return 1;
    }
    return (leftParts[1] ?? "").localeCompare(rightParts[1] ?? "");
  });
}

export const openApiOperationsProvider: OptionsProvider = {
  async fetch(params) {
    const apiSpecLocation = params.apiSpecLocation?.trim();
    if (!apiSpecLocation) {
      throw new SystemError({
        source: "Scaffold",
        name: "OpenApiMissingSpecLocation",
        message: "OpenAPI operations cannot be listed without an API spec location.",
      });
    }
    const parser = new SpecParser(apiSpecLocation, openApiParseOptions());
    const validation = await parser.validate();
    if (validation.status === ValidationStatus.Error) {
      throw new UserError({
        source: "Scaffold",
        name: "OpenApiSpecInvalid",
        message: "The OpenAPI description document is invalid or contains no supported operations.",
      });
    }
    let listed: Awaited<ReturnType<SpecParser["list"]>>;
    try {
      listed = await parser.list();
    } catch {
      throw new UserError({
        source: "Scaffold",
        name: "OpenApiSpecInvalid",
        message: "The OpenAPI description document is invalid or contains no supported operations.",
      });
    }
    const operations = sortOperations(listed.APIs).filter((operation) => operation.isValid);
    if (operations.length === 0) {
      throw new UserError({
        source: "Scaffold",
        name: "OpenApiSpecInvalid",
        message: "The OpenAPI description document is invalid or contains no supported operations.",
      });
    }
    return {
      options: operations.map((operation) => ({
        id: operation.api,
        label: operation.api,
        groupName: operation.api.toUpperCase().split(" ")[0],
        detail: operationDetail(operation),
      })),
    };
  },
};

export function createOpenApiSearchProvider(
  searchApiSpec: (query: string) => Promise<SearchOpenAPISpecResult[]>
): OptionsProvider {
  return {
    async fetch(params) {
      const query = params.query?.trim();
      if (!query) {
        throw new UserError({
          source: "Scaffold",
          name: "OpenApiSearchQueryMissing",
          message: "Please enter a search query.",
        });
      }
      const results = await searchApiSpec(query);
      if (results.length === 0) {
        throw new UserError({
          source: "Scaffold",
          name: "OpenApiSearchResultNotFound",
          message: "No search result found.",
        });
      }
      return {
        options: results.map((api) => ({
          id: api.url,
          label: api.key,
          detail: api.description,
        })),
      };
    },
  };
}

function mcpToolsJsonFromFetchResult(
  serverUrl: string | undefined,
  result: MCPFetchResult
): string {
  if (result.requiresAuth) {
    throw new UserError({
      source: "Scaffold",
      name: "McpAuthRequired",
      message: `The MCP server${serverUrl ? ` at ${serverUrl}` : ""} requires authentication.`,
    });
  }
  if (result.tools.length === 0) {
    throw new UserError({
      source: "Scaffold",
      name: "McpToolsNotFound",
      message: `No tools were discovered from the MCP server${
        serverUrl ? ` at ${serverUrl}` : ""
      }.`,
    });
  }
  return JSON.stringify({ tools: result.tools });
}

export function createMcpToolsProvider(
  fetchTools: (serverUrl: string) => Promise<MCPFetchResult>
): OptionsProvider {
  return {
    derivedSchema: ["toolsJson"],
    async fetch(params) {
      let toolsJson = params.toolsJson?.trim();
      const toolsFilePath = params.toolsFilePath?.trim();
      if (!toolsJson && toolsFilePath) {
        try {
          toolsJson = fs.readFileSync(toolsFilePath, "utf8");
        } catch {
          throw new UserError({
            source: "Scaffold",
            name: "McpToolsFileReadFailed",
            message: "Failed to read the MCP tools file.",
          });
        }
      }
      const serverUrl = params.serverUrl?.trim();
      if (!toolsJson && serverUrl) {
        try {
          toolsJson = mcpToolsJsonFromFetchResult(serverUrl, await fetchTools(serverUrl));
        } catch (error) {
          if (error instanceof UserError) {
            throw error;
          }
          throw new UserError({
            source: "Scaffold",
            name: "McpToolsFetchFailed",
            message: `Failed to fetch tools from the MCP server at ${serverUrl}.`,
          });
        }
      }
      if (!toolsJson) {
        throw new UserError({
          source: "Scaffold",
          name: "McpToolsJsonMissing",
          message: "MCP tools JSON is required before listing tools.",
        });
      }
      const parsed = parseMcpStaticToolsJson(toolsJson);
      if (!parsed.ok) {
        throw new UserError({ source: "Scaffold", name: parsed.code, message: parsed.message });
      }
      return {
        options: parsed.tools.map((tool) => ({
          id: tool.name,
          label: tool.name,
          detail: tool.description,
        })),
        derived: { toolsJson },
      };
    },
  };
}

export function createDefaultCreateOptionsProviders(
  fetchTools: (serverUrl: string) => Promise<MCPFetchResult>,
  listLocalMcpServers: () => Promise<ODRServer[]>,
  searchApiSpec: (query: string) => Promise<SearchOpenAPISpecResult[]> = () => Promise.resolve([])
): Record<string, OptionsProvider> {
  const localServers = createLocalServerCache(listLocalMcpServers);
  return {
    "mcp.serverTypes": createMcpServerTypesProvider(localServers),
    "mcp.localServers": createLocalMcpServersProvider(localServers),
    "mcp.tools": createMcpToolsProvider(fetchTools),
    "openapi.search": createOpenApiSearchProvider(searchApiSpec),
    "openapi.operations": openApiOperationsProvider,
  };
}
