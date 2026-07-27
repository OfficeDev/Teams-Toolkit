# Remote MCP servers

External-dependency fact page. Captures the **non-negotiable** HTTP behavior
the Microsoft 365 Agents Toolkit binds to when it talks to a remote MCP server
the user supplies by URL — tool discovery, authorization discovery, and
deciding whether the URL is an MCP endpoint at all.

Remote MCP servers are third-party services owned entirely outside this
codebase. This page records only observed, reproducible wire behavior. How the
toolkit composes that behavior into scaffold flows is an internal concern and
belongs in an ADR under [`../adr/`](../adr/README.md).

All measurements in §1.3–§1.5 were taken 2026-07-27 with an unauthenticated
`initialize` request and are reproducible with the recipe in §1.6.

## 1. Facts the toolkit is bound to

### 1.1 Authorization spec generations

Two generations are in the wild and a client must handle both.

| Generation | Discovery chain | 401 challenge |
|---|---|---|
| 2025-06-18 (RFC 9728) | `WWW-Authenticate` carries `resource_metadata="…"` → fetch that document → `authorization_servers[0]` → RFC 8414 / OIDC well-known on the **issuer** | includes `resource_metadata` |
| 2025-03-26 | The MCP server **is** its own authorization server; RFC 8414 metadata sits at the **origin root**. No protected-resource document exists | carries only `realm` / `error` |

Every production server measured in §1.3 implements 2025-06-18. The only
2025-03-26 server observed is an internal eval server. A client that
implements only the 2025-06-18 chain dead-ends on the latter.

### 1.2 Transport and method

- Streamable HTTP is the current transport; SSE (`/sse`) endpoints are still
  deployed and reachable.
- An MCP endpoint answers an unauthenticated `initialize` **POST** with either
  a JSON-RPC result, or a `401` challenge. It does not answer `404`.
- `GET` on the same URL is **not** a substitute. Two of the servers measured
  return `200` with an HTML or JSON page on `GET` at a non-endpoint path while
  returning `404` to `POST` at that same path.

### 1.3 Measured behavior — documented endpoint URLs

| Server | URL | POST | GET | Challenge |
|---|---|---|---|---|
| GitHub Copilot | `https://api.githubcopilot.com/mcp/` | 401 | 401 | `resource_metadata=".../oauth-protected-resource/mcp/"` |
| Monday | `https://mcp.monday.com/sse` | 401 | 401 | `realm="OAuth"`, `resource_metadata=".../oauth-protected-resource/sse"` |
| HubSpot | `https://mcp.hubspot.com/` | 401 | 401 | `resource_metadata=".../oauth-protected-resource"` |
| Notion | `https://mcp.notion.com/mcp` | 401 | 401 | `realm="OAuth"`, `resource_metadata=".../oauth-protected-resource/mcp"` |
| Canva | `https://mcp.canva.com/mcp` | 401 | 401 | `realm="OAuth"`, `resource_metadata=".../oauth-protected-resource/mcp"` |
| Moody's | `https://api.moodys.com/genai-ready-data/m1/mcp` | 401 | 401 | `resource_metadata="https://api.moodys.com/genai-ready-data/.well-known/oauth-protected-resource/m1/mcp"` |
| LSEG | `https://api.analytics.lseg.com/lfa/mcp` | 401 | 401 | `realm="MCP Server"`, `resource_metadata=".../oauth-protected-resource/lfa/mcp"` |
| Office SDF | `https://substrate-sdf.office.com/exmigd2sapp/mcp` | 503 | 503 | — (Envoy `upstream connect error`; ring was down) |

**No valid MCP endpoint returned `404`.** Eight reachable valid endpoints were
measured (the seven above plus the eval server in §1.5); all eight answered
`401`. The Office SDF ring was unreachable and returned `503` on every path,
valid or not.

Note that HubSpot's endpoint **is** the origin root. A bare origin is a
legitimate MCP endpoint URL, so URL *shape* carries no signal.

### 1.4 Measured behavior — the same URLs with the final segment removed

This is the mistake being detected: the user pastes the host or a parent path
instead of the endpoint.

| Truncated URL | POST | GET | Detected by POST 404? |
|---|---|---|---|
| `https://api.githubcopilot.com/` | 404 | 404 | yes |
| `https://mcp.monday.com/` | 404 | 404 | yes |
| `https://mcp.notion.com/` | 404 | 404 | yes |
| `https://mcp.canva.com/` | **404** | **200** (HTML) | yes — `GET` would have cleared it |
| `https://api.analytics.lseg.com/lfa/` | 404 | 404 | yes (Kong `no Route matched`) |
| `https://api.moodys.com/genai-ready-data/m1/` | **401** | 401 | **no** |
| `https://substrate-sdf.office.com/exmigd2sapp/` | 503 | 503 | no (ring down) |
| `https://substrate-sdf.office.com/` | 200 (HTML) | 200 (HTML) | no |

HubSpot has no truncated form — its endpoint is already the origin root.

The Moody's row is the significant miss: the truncated URL is answered by the
API gateway's auth layer, which is mounted on the **path prefix**, so it
returns a well-formed `401` carrying a `resource_metadata` pointing at
`.../oauth-protected-resource/m1/`. Authorization discovery therefore
**succeeds** and yields plausible-but-wrong endpoints. No status-code rule can
catch this.

### 1.5 Reference: a 2025-03-26 server

`taskmaster-mcp-server.azurewebsites.net` (internal eval server):

| Path | POST | GET |
|---|---|---|
| `/mcp` | 401, `realm="taskmaster-mcp"`, **no** `resource_metadata` | 401 |
| `/` | 404 | **200** (JSON self-description) |
| `/.well-known/oauth-authorization-server` | — | 200 (RFC 8414 document) |
| `/.well-known/oauth-protected-resource` | — | 404 |

Its auth middleware is mounted on `/mcp*`, so `/mcp/.well-known/…` returns
`401` rather than `404`.

### 1.6 Reproducing these measurements

```
POST <url>
Content-Type: application/json
Accept: application/json, text/event-stream

{"jsonrpc":"2.0","id":1,"method":"initialize",
 "params":{"protocolVersion":"2025-06-18","capabilities":{},
           "clientInfo":{"name":"atk-probe","version":"1.0.0"}}}
```

Record the status, the full `WWW-Authenticate` header, and the body. Repeat
with `GET` and with the final path segment removed.

## 2. Constraints derived from these facts

1. Authorization discovery must attempt **both** spec generations: the
   `resource_metadata` chain, and — when no protected-resource document is
   advertised — RFC 8414 / OIDC well-known candidates derived from the MCP
   server URL including its origin root (§1.1).
2. Well-known candidates derived from an **issuer** must not include
   origin-root forms: for a tenant-scoped issuer the root form can return a
   valid-but-wrong-tenant document, which is worse than failing (§1.1).
3. Reachability and endpoint-validity probes must use `POST`; a `GET` result
   must not be treated as evidence that a URL is an MCP endpoint (§1.2, §1.4).
4. `404` from an `initialize` `POST` means no MCP endpoint is routed at that
   URL. No valid endpoint produced it in any measurement (§1.3).
5. A non-`404` response must not be treated as proof the URL is correct — a
   path-prefix auth gateway answers `401` for parent paths (§1.4).
6. `5xx` and transport failures indicate an unreachable server, not a wrong
   URL, and must not be reported as one (§1.3, §1.4).
7. URL shape carries no signal: a bare origin is a legitimate endpoint, and
   `/sse` endpoints are still deployed (§1.2, §1.3).

## 3. Open questions

- Should the `404` signal move from a post-scaffold warning to input-time
  validation on the MCP server URL question, and should it block or only
  hint? Precision was 100% across eight valid endpoints, but the sample is
  small and a gateway mid-deploy can legitimately `404`. Recall was 6/9, so it
  cannot be the only gate. Needs an ADR.
- The dynamic-tool-discovery scaffold path performs no tool fetch by design,
  so it has no independent check that the URL serves tools. The `404` warning
  covers part of this; the §1.4 Moody's case remains uncovered.
- `405` was not observed on any server, including the SSE endpoint. Whether
  `405` should join `404` as a negative signal is unresolved and currently
  decided against on precautionary grounds only.
- When a URL is known-wrong, should dynamic client registration still be
  allowed to register an OAuth client against that host during provision?
