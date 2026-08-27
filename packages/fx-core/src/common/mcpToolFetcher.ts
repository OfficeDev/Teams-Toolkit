// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import fs from "fs-extra";
import { Readable } from "stream";
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
export async function fetchMCPTools(
  serverUrl: string,
  signal?: AbortSignal
): Promise<MCPFetchResult> {
  let authMetadataUrl: string | undefined;
  try {
    await axios.get(serverUrl, { timeout: 10000, signal });
  } catch (error: any) {
    signal?.throwIfAborted();
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
      signal?.throwIfAborted();
      const result = await client.listTools();
      signal?.throwIfAborted();
      const tools: MCPTool[] = result.tools.map((tool: any) => ({
        ...tool,
        description: tool.description ?? "",
      }));
      return { requiresAuth: false, tools };
    } finally {
      await client.close();
    }
  } catch (error: any) {
    signal?.throwIfAborted();
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
        signal?.throwIfAborted();
        const result = await client.listTools();
        signal?.throwIfAborted();
        const tools: MCPTool[] = result.tools.map((tool: any) => ({
          ...tool,
          description: tool.description ?? "",
        }));
        return { requiresAuth: false, tools };
      } finally {
        await client.close();
      }
    } catch {
      signal?.throwIfAborted();
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

/**
 * What a probe learned about the URL itself, independently of whether authorization is needed.
 *
 * - `confirmed`: something MCP-shaped answered — either a successful `initialize` or an OAuth
 *   challenge. The URL is right.
 * - `notEndpoint`: the server answered definitively and the answer was not MCP. The URL is
 *   most likely wrong.
 * - `undetermined`: nothing was learned (server error, timeout, DNS or transport failure).
 *   Says nothing about the URL and must never be reported as a problem with it.
 */
export type MCPEndpointStatus = "confirmed" | "notEndpoint" | "undetermined";

/** HTTP statuses treated as proof that no MCP endpoint is routed at the URL.
 *
 * Deliberately enumerated rather than "any 4xx": measurements across nine live servers only ever
 * produced these three for a wrong URL (404 from routing, 405 from an endpoint that exists but
 * rejects the method, 403 from a WAF in front of the app). Statuses such as 429 or 408 are
 * transient and would slander a URL that is in fact correct. 400 is excluded on purpose: the
 * transport spec requires a server to answer 400 when it rejects the `MCP-Protocol-Version`,
 * so a valid endpoint may well produce one for this probe. */
const NOT_AN_ENDPOINT_STATUSES = [403, 404, 405];

/** How long to wait for a deprecated HTTP+SSE server to name its message endpoint. */
const LEGACY_SSE_TIMEOUT_MS = 5000;

/** Stop buffering an event stream that is not going to name an endpoint. */
const LEGACY_SSE_MAX_BYTES = 8192;

/** Bound each OAuth metadata discovery hop so an unreachable issuer cannot stall scaffolding. */
const MCP_AUTH_METADATA_TIMEOUT_MS = 10000;

/**
 * A 2xx alone proves nothing: a truncated URL on a host that serves a landing page answers 200
 * with HTML. The JSON-RPC envelope in the payload is the actual proof. The body text is searched
 * instead of the frames being parsed because that works for both `application/json` and the
 * `text/event-stream` framing streamable-HTTP servers use — `jsonrpc` sits inside the `data:`
 * payload either way. The quotes keep an HTML page that merely mentions the word from matching.
 */
function carriesJSONRPCEnvelope(body: unknown): boolean {
  if (typeof body === "string") {
    return body.includes('"jsonrpc"');
  }
  if (body && typeof body === "object") {
    return "jsonrpc" in body;
  }
  return false;
}

export interface MCPAuthProbeResult {
  requiresAuth: boolean;
  authMetadataUrl?: string;
  /**
   * Whether the URL was confirmed to be an MCP endpoint. Reported separately from `requiresAuth`
   * because it says whether the URL is right, not whether authorization is missing. A mistyped
   * URL commonly still serves an ordinary page on GET — the host's landing page, say — which
   * makes it look reachable; only the `initialize` POST exposes that nothing MCP is there.
   */
  endpointStatus: MCPEndpointStatus;
  /** The HTTP status behind a `notEndpoint` verdict. Absent for the other two states. */
  responseStatus?: number;
}

/**
 * Read an event stream only as far as the first `endpoint` event, which is how a 2024-11-05
 * server announces where its messages go. Anything else — the stream ending, an error, a
 * stream that just keeps talking, a server that never answers — means no such announcement.
 */
function announcesLegacyMessageEndpoint(stream: Readable, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let buffered = "";
    const settle = (found: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      stream.destroy();
      resolve(found);
    };
    const onAbort = () => settle(false);
    const timer = setTimeout(() => settle(false), LEGACY_SSE_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      settle(false);
      return;
    }
    stream.on("data", (chunk: Buffer | string) => {
      buffered += chunk.toString();
      if (/^event:\s*endpoint\s*$/m.test(buffered)) {
        settle(true);
      } else if (buffered.length > LEGACY_SSE_MAX_BYTES) {
        settle(false);
      }
    });
    stream.on("end", () => settle(false));
    stream.on("error", () => settle(false));
  });
}

/**
 * Ask the URL, the way the MCP transport spec's backwards-compatibility rule prescribes,
 * whether a deprecated HTTP+SSE server is listening there.
 *
 * A 2024-11-05 server has no streamable-HTTP endpoint to POST to, so it answers the
 * `initialize` POST with a 4xx — the spec names 405 and 404 explicitly. Reading that 4xx as
 * proof of a wrong URL would therefore condemn a whole generation of valid servers. The spec's
 * own disambiguation is to open an SSE stream with GET: an HTTP+SSE server replies
 * `text/event-stream` and names its message endpoint in the first event.
 */
async function servesLegacySSETransport(serverUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await axios.get(serverUrl, {
      timeout: LEGACY_SSE_TIMEOUT_MS,
      responseType: "stream",
      headers: { Accept: "text/event-stream" },
      signal,
    });
    const contentType = String(response.headers?.["content-type"] ?? "");
    if (!contentType.includes("text/event-stream")) {
      response.data?.destroy?.();
      return false;
    }
    const announcesEndpoint = await announcesLegacyMessageEndpoint(response.data, signal);
    signal?.throwIfAborted();
    return announcesEndpoint;
  } catch {
    signal?.throwIfAborted();
    // A GET that fails says only that the old transport is not there either.
    return false;
  }
}

/** Probe an MCP streamable-HTTP endpoint for an OAuth challenge and for the URL's validity. */
export async function probeMCPServerAuth(
  serverUrl: string,
  signal?: AbortSignal
): Promise<MCPAuthProbeResult> {
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
    const response = await axios.post(serverUrl, initializeBody, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      signal,
    });
    return carriesJSONRPCEnvelope(response.data)
      ? { requiresAuth: false, endpointStatus: "confirmed" }
      : { requiresAuth: false, endpointStatus: "notEndpoint", responseStatus: response.status };
  } catch (error: any) {
    signal?.throwIfAborted();
    const status: unknown = error?.response?.status ?? error?.status;
    if (status === 401) {
      // Only something that means to be a protected resource issues an OAuth challenge, so a
      // 401 confirms the endpoint just as firmly as a successful initialize does.
      const wwwAuth = error?.response?.headers?.["www-authenticate"];
      let authMetadataUrl: string | undefined;
      if (wwwAuth) {
        const match = wwwAuth.match(/resource_metadata=\s*"([^"]+)"/);
        if (match) {
          authMetadataUrl = match[1];
        }
      }
      return { requiresAuth: true, authMetadataUrl, endpointStatus: "confirmed" };
    }
    if (typeof status === "number" && NOT_AN_ENDPOINT_STATUSES.includes(status)) {
      // The spec reads a 4xx here as "this may be the old transport", not as "wrong URL", so
      // the verdict is not settled until HTTP+SSE has been ruled out.
      return (await servesLegacySSETransport(serverUrl, signal))
        ? { requiresAuth: false, endpointStatus: "confirmed" }
        : { requiresAuth: false, endpointStatus: "notEndpoint", responseStatus: status };
    }
    return { requiresAuth: false, endpointStatus: "undetermined" };
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

/**
 * Build the ordered list of authorization-server metadata URLs to probe for an MCP server that
 * never pointed at an authorization server.
 *
 * MCP servers written against the 2025-03-26 authorization spec are their own authorization
 * server: they publish RFC 8414 metadata at the origin root and ship no RFC 9728
 * protected-resource document at all. Such a server answers the 401 challenge with `realm`
 * alone, so `resource_metadata` discovery dead-ends and the endpoints have to be derived from
 * the server URL instead. Path-derived forms are probed first, because a host exposing several
 * MCP endpoints may serve per-endpoint metadata; the origin root is the last resort.
 */
export function buildMCPServerWellKnownCandidates(mcpServerUrl: string): string[] {
  const serverUrl = new URL(mcpServerUrl);
  const origin = `${serverUrl.protocol}//${serverUrl.host}`;
  return [
    ...new Set([
      ...buildWellKnownCandidates(mcpServerUrl),
      `${origin}/.well-known/oauth-authorization-server`,
      `${origin}/.well-known/openid-configuration`,
    ]),
  ];
}

/**
 * Build the RFC 9728 protected-resource metadata URLs to probe for an MCP server that never
 * advertised one.
 *
 * A server only hands out its `resource_metadata` location inside a `WWW-Authenticate`
 * challenge, and a server that defers authorization to the individual tool calls answers an
 * unauthenticated `initialize` with a plain 200 and no challenge at all — Google's Gmail,
 * Calendar and Drive servers do exactly that, yet each publishes a protected-resource document
 * naming `https://accounts.google.com/`. Waiting to be told therefore loses the metadata for a
 * whole class of servers, so the document is derived from the resource URL instead, as MCP's
 * authorization spec requires of clients. RFC 9728 §3.1 inserts the well-known segment between
 * the host and the resource path; the path-less form follows for servers that publish at the
 * origin root only.
 */
export function buildProtectedResourceCandidates(mcpServerUrl: string): string[] {
  const serverUrl = new URL(mcpServerUrl);
  const origin = `${serverUrl.protocol}//${serverUrl.host}`;
  const resourcePath = serverUrl.pathname === "/" ? "" : serverUrl.pathname.replace(/\/+$/, "");
  return [
    ...new Set([
      `${origin}/.well-known/oauth-protected-resource${resourcePath}`,
      `${origin}/.well-known/oauth-protected-resource`,
    ]),
  ];
}

/**
 * Read the RFC 9728 protected-resource document the server advertised and turn its first
 * authorization server into discovery candidates. Returns an empty list when the document
 * names no authorization server.
 */
async function candidatesFromProtectedResourceMetadata(
  authMetadataUrl: string,
  canFallBack: boolean
): Promise<string[]> {
  let response;
  try {
    response = await axios.get(authMetadataUrl, { timeout: MCP_AUTH_METADATA_TIMEOUT_MS });
  } catch (error) {
    // A server advertising a document it cannot serve is broken, but the MCP server URL may
    // still lead to the authorization server, so let the caller try that before failing.
    if (canFallBack) {
      return [];
    }
    throw error;
  }
  const issuers = response.data?.authorization_servers;
  if (response.status === 200 && Array.isArray(issuers) && issuers.length > 0) {
    return buildWellKnownCandidates(issuers[0]);
  }
  return [];
}

/**
 * Look for a protected-resource document at the locations RFC 9728 derives from the MCP server
 * URL. The first document naming an authorization server wins; a location that is absent only
 * means this server publishes at the other one.
 */
async function candidatesFromDerivedProtectedResource(mcpServerUrl: string): Promise<string[]> {
  for (const candidate of buildProtectedResourceCandidates(mcpServerUrl)) {
    const candidates = await candidatesFromProtectedResourceMetadata(candidate, true);
    if (candidates.length > 0) {
      return candidates;
    }
  }
  return [];
}

/** Resolve OAuth endpoints from MCP resource or authorization-server metadata. */
export async function resolveMCPOAuthMetadata(
  authMetadataUrl?: string,
  wellKnownUrl?: string,
  mcpServerUrl?: string
): Promise<MCPOAuthMetadata> {
  let candidates: string[];

  if (wellKnownUrl) {
    // An explicitly configured URL is authoritative — never substitute a guess for it.
    candidates = [wellKnownUrl];
  } else {
    candidates = authMetadataUrl
      ? await candidatesFromProtectedResourceMetadata(authMetadataUrl, !!mcpServerUrl)
      : [];

    if (candidates.length === 0 && mcpServerUrl) {
      // The authoritative answer, when the server publishes one, is its protected-resource
      // document — so try that before assuming the server is its own authorization server.
      candidates = await candidatesFromDerivedProtectedResource(mcpServerUrl);
    }

    if (candidates.length === 0 && mcpServerUrl) {
      candidates = buildMCPServerWellKnownCandidates(mcpServerUrl);
    }

    if (candidates.length === 0) {
      throw new Error(
        getLocalizedString(
          authMetadataUrl
            ? "core.MCPForDA.mcpServerMetadataUrlNotFound"
            : "core.MCPForDA.mcpAuthMetadataUrlNotFound"
        )
      );
    }
  }

  for (const candidate of candidates) {
    try {
      const metadataResponse = await axios.get(candidate, {
        timeout: MCP_AUTH_METADATA_TIMEOUT_MS,
      });
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
