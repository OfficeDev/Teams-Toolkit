// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import { getLocalizedString } from "../../common/localizeUtils";
import fs from "fs-extra";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  tags?: string[];
}

export interface MCPFetchResult {
  requiresAuth: boolean;
  tools: MCPTool[];
  authMetadataUrl?: string;
}

/**
 * Fetch MCP tool definitions from a remote MCP server using the MCP JSON-RPC protocol.
 * Uses StreamableHTTP transport via the @modelcontextprotocol/sdk.
 *
 * @param serverUrl - The URL of the remote MCP server
 * @returns MCPFetchResult with tools if no auth, or requiresAuth flag if auth needed
 */
export async function fetchMCPTools(serverUrl: string): Promise<MCPFetchResult> {
  // First, attempt auth detection by sending a HEAD/GET request
  let authMetadataUrl: string | undefined;
  try {
    await axios.get(serverUrl, { timeout: 10000 });
  } catch (error: any) {
    if (error?.response?.status === 401 || error?.status === 401) {
      // Auth required — try to extract OAuth metadata
      const wwwAuth = error?.response?.headers?.["www-authenticate"];
      if (wwwAuth) {
        const match = wwwAuth.match(/resource_metadata=\s*"([^"]+)"/);
        if (match) {
          authMetadataUrl = match[1];
        }
      }
      return { requiresAuth: true, tools: [], authMetadataUrl };
    }
    // For non-401 errors, try fetching tools anyway via MCP protocol
  }

  // Try to fetch tools using MCP JSON-RPC protocol over StreamableHTTP.
  // Uses @modelcontextprotocol/sdk as a library dependency (not the ATK CLI itself).
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - dynamic import of MCP SDK subpath
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - dynamic import of MCP SDK subpath
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: "atk-cli", version: "1.0.0" });

    try {
      await client.connect(transport);
      const result = await client.listTools();
      const tools: MCPTool[] = result.tools.map((tool: any) => ({
        ...tool,
        description: tool.description ?? "",
      }));
      return { requiresAuth: false, tools };
    } finally {
      await client.close();
    }
  } catch (error: any) {
    // If MCP SDK connection fails, fall back to SSE transport
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - dynamic import of MCP SDK subpath
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - dynamic import of MCP SDK subpath
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");

      const transport = new SSEClientTransport(new URL(serverUrl));
      const client = new Client({ name: "atk-cli", version: "1.0.0" });

      try {
        await client.connect(transport);
        const result = await client.listTools();
        const tools: MCPTool[] = result.tools.map((tool: any) => ({
          ...tool,
          description: tool.description ?? "",
        }));
        return { requiresAuth: false, tools };
      } finally {
        await client.close();
      }
    } catch {
      // Both transports failed
      // Check if the original error was auth-related
      if (
        error?.message?.includes("401") ||
        error?.message?.includes("Unauthorized") ||
        error?.message?.includes("auth")
      ) {
        return { requiresAuth: true, tools: [] };
      }
      // Return empty tools — caller should fall back to file input
      return { requiresAuth: false, tools: [] };
    }
  }
}

/**
 * Read and parse MCP tool definitions from a JSON file.
 * Accepts two formats:
 * - `{ tools: [{ name, description, inputSchema }] }` (mcp-tools.json format)
 * - `[{ name, description, inputSchema }]` (raw array of tools)
 *
 * @param filePath - Path to the JSON file containing tool definitions
 * @returns Array of MCPTool objects
 */
export async function readMCPToolsFromFile(filePath: string): Promise<MCPTool[]> {
  if (!(await fs.pathExists(filePath))) {
    throw new Error(getLocalizedString("core.MCPForDA.toolsFileNotFound", filePath));
  }

  const content = await fs.readJSON(filePath);

  let rawTools: any[];
  if (Array.isArray(content)) {
    rawTools = content;
  } else if (content && Array.isArray(content.tools)) {
    rawTools = content.tools;
  } else {
    throw new Error(
      getLocalizedString("core.MCPForDA.toolsFileInvalidFormat", '{ "tools": [...] }', filePath)
    );
  }

  return rawTools.map((tool: any) => {
    if (!tool.name) {
      throw new Error(getLocalizedString("core.MCPForDA.toolsFileMissingName", '"name"', filePath));
    }
    return {
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? tool.input_schema ?? { type: "object", properties: {} },
      outputSchema: tool.outputSchema ?? tool.output_schema,
      tags: tool.tags,
    };
  });
}

export interface MCPAuthProbeResult {
  requiresAuth: boolean;
  authMetadataUrl?: string;
}

/**
 * Lightweight probe to check if an MCP server requires authentication.
 * Sends a POST `initialize` JSON-RPC request (matching the MCP streamable-http
 * transport) and checks for a 401 response + WWW-Authenticate header. GET is
 * not reliable: spec-compliant MCP servers (Figma, etc.) return 405 to GET and
 * only emit the WWW-Authenticate challenge on POST.
 *
 * Does NOT attempt to fetch tools via MCP protocol.
 *
 * @param serverUrl - The URL of the remote MCP server
 * @returns Whether auth is required and the resource_metadata URL if available
 */
export async function probeMCPServerAuth(serverUrl: string): Promise<MCPAuthProbeResult> {
  const initializeBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "atk-probe", version: "1.0.0" },
    },
  };
  try {
    await axios.post(serverUrl, initializeBody, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
    });
    return { requiresAuth: false };
  } catch (error: any) {
    if (error?.response?.status === 401 || error?.status === 401) {
      const wwwAuth = error?.response?.headers?.["www-authenticate"];
      let authMetadataUrl: string | undefined;
      if (wwwAuth) {
        const match = wwwAuth.match(/resource_metadata=\s*"([^"]+)"/);
        if (match) {
          authMetadataUrl = match[1];
        }
      }
      return { requiresAuth: true, authMetadataUrl };
    }
    return { requiresAuth: false };
  }
}

export interface MCPOAuthMetadata {
  authorizationUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  /**
   * Resolved RFC 8414 well-known URL (the URL `authorization_endpoint` /
   * `token_endpoint` were fetched from). Returned so callers that need the
   * authorization-server metadata location — e.g. `dcr/register`'s
   * `wellKnownAuthorizationServer` — do not have to repeat the probe.
   */
  wellKnownUrl: string;
}

/**
 * Resolve OAuth metadata (authorization_endpoint, token_endpoint, refresh_endpoint) from an MCP server's
 * resource metadata URL. Follows the MCP auth flow:
 *   1. Fetch the resource metadata URL (from WWW-Authenticate header's resource_metadata)
 *   2. Extract authorization_servers[0]
 *   3. Construct the RFC 8414 well-known URL
 *   4. Fetch authorization_endpoint / token_endpoint from that well-known URL
 *
 * @param authMetadataUrl - The resource_metadata URL from the 401 WWW-Authenticate header
 * @param wellKnownUrl - Optional: if already known, skip discovery and use this URL directly
 * @returns MCPOAuthMetadata with authorization and token URLs
 */
export async function resolveMCPOAuthMetadata(
  authMetadataUrl?: string,
  wellKnownUrl?: string
): Promise<MCPOAuthMetadata> {
  let resolvedWellKnownUrl = wellKnownUrl;

  if (!resolvedWellKnownUrl) {
    if (!authMetadataUrl) {
      throw new Error(getLocalizedString("core.MCPForDA.mcpAuthMetadataUrlNotFound"));
    }

    const response = await axios.get(authMetadataUrl);
    if (
      response.status === 200 &&
      response.data &&
      response.data.authorization_servers &&
      response.data.authorization_servers.length > 0
    ) {
      const mcpServerMetadataUrl = response.data.authorization_servers[0];
      // Transform to RFC 8414 well-known endpoint:
      // https://{domain}/.well-known/oauth-authorization-server{path}
      // The WHATWG URL parser normalizes a path-less issuer (e.g. "https://mcp.notion.com")
      // to pathname "/". Appending that "/" would produce a trailing-slash URL
      // (".../oauth-authorization-server/") that servers like Notion reject with 404, so treat
      // the root path as empty per RFC 8414.
      const serverUrl = new URL(mcpServerMetadataUrl);
      const serverPath = serverUrl.pathname === "/" ? "" : serverUrl.pathname;
      resolvedWellKnownUrl = `${serverUrl.protocol}//${serverUrl.host}/.well-known/oauth-authorization-server${serverPath}`;
    } else {
      throw new Error(getLocalizedString("core.MCPForDA.mcpServerMetadataUrlNotFound"));
    }
  }

  const metadataResponse = await axios.get(resolvedWellKnownUrl);
  const authorizationUrl = metadataResponse.data?.authorization_endpoint;
  const tokenUrl = metadataResponse.data?.token_endpoint;
  const refreshUrl = metadataResponse.data?.refresh_endpoint;

  if (!authorizationUrl || !tokenUrl) {
    throw new Error(getLocalizedString("core.MCPForDA.authUrlNotFound"));
  }

  return { authorizationUrl, tokenUrl, refreshUrl, wellKnownUrl: resolvedWellKnownUrl };
}
