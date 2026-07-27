// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import fs from "fs-extra";
import { getLocalizedString } from "./localizeUtils";

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

/** Fetch MCP tool definitions from a remote MCP server. */
export async function fetchMCPTools(serverUrl: string): Promise<MCPFetchResult> {
  let authMetadataUrl: string | undefined;
  try {
    await axios.get(serverUrl, { timeout: 10000 });
  } catch (error: any) {
    if (error?.response?.status === 401 || error?.status === 401) {
      const wwwAuth = error?.response?.headers?.["www-authenticate"];
      if (wwwAuth) {
        const match = wwwAuth.match(/resource_metadata=\s*"([^"]+)"/);
        if (match) {
          authMetadataUrl = match[1];
        }
      }
      return { requiresAuth: true, tools: [], authMetadataUrl };
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - dynamic import of MCP SDK subpath
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - dynamic import of MCP SDK subpath
    const { StreamableHTTPClientTransport } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

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
      if (
        error?.message?.includes("401") ||
        error?.message?.includes("Unauthorized") ||
        error?.message?.includes("auth")
      ) {
        return { requiresAuth: true, tools: [] };
      }
      return { requiresAuth: false, tools: [] };
    }
  }
}

/** Read MCP tool definitions from a wrapped or raw JSON array. */
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

/** Probe an MCP streamable-HTTP endpoint for an OAuth challenge. */
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
  wellKnownUrl: string;
}

/**
 * Build the ordered list of authorization-server metadata URLs to probe for an issuer.
 *
 * Providers disagree on which discovery form they serve: RFC 8414 §3.1 mandates inserting
 * `/.well-known/oauth-authorization-server` between the host and the issuer path, while
 * OpenID Connect Discovery §4 appends `/.well-known/openid-configuration` to the issuer.
 * Microsoft Entra, for example, serves ONLY the appended OIDC form — the RFC 8414 insertion
 * form returns 404 — so probing a single form silently loses the endpoints for whole classes
 * of identity providers. Candidates are deduplicated (a host-only issuer collapses the
 * insertion and append forms) and returned in RFC-preference order.
 */
export function buildWellKnownCandidates(issuer: string): string[] {
  const issuerUrl = new URL(issuer);
  const origin = `${issuerUrl.protocol}//${issuerUrl.host}`;
  // A trailing slash makes providers such as Notion return 404 for the insertion form.
  const issuerPath = issuerUrl.pathname === "/" ? "" : issuerUrl.pathname.replace(/\/+$/, "");
  return [
    ...new Set([
      `${origin}/.well-known/oauth-authorization-server${issuerPath}`,
      `${origin}/.well-known/openid-configuration${issuerPath}`,
      `${origin}${issuerPath}/.well-known/oauth-authorization-server`,
      `${origin}${issuerPath}/.well-known/openid-configuration`,
    ]),
  ];
}

/** Resolve OAuth endpoints from MCP resource or authorization-server metadata. */
export async function resolveMCPOAuthMetadata(
  authMetadataUrl?: string,
  wellKnownUrl?: string
): Promise<MCPOAuthMetadata> {
  let candidates: string[];

  if (wellKnownUrl) {
    // An explicitly configured URL is authoritative — never substitute a guess for it.
    candidates = [wellKnownUrl];
  } else {
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
      candidates = buildWellKnownCandidates(response.data.authorization_servers[0]);
    } else {
      throw new Error(getLocalizedString("core.MCPForDA.mcpServerMetadataUrlNotFound"));
    }
  }

  for (const candidate of candidates) {
    try {
      const metadataResponse = await axios.get(candidate);
      const authorizationUrl = metadataResponse.data?.authorization_endpoint;
      const tokenUrl = metadataResponse.data?.token_endpoint;
      const refreshUrl = metadataResponse.data?.refresh_endpoint;
      if (authorizationUrl && tokenUrl) {
        return { authorizationUrl, tokenUrl, refreshUrl, wellKnownUrl: candidate };
      }
    } catch {
      // A 404 / unreachable candidate just means this provider uses a different
      // discovery form; keep probing and report every attempt if all of them fail.
    }
  }

  throw new Error(getLocalizedString("core.MCPForDA.authUrlNotFound", candidates.join(", ")));
}
