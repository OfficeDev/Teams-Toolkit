# Remote MCP servers

External-dependency fact page. Captures the **non-negotiable** HTTP behavior
the Microsoft 365 Agents Toolkit binds to when it talks to a remote MCP server
the user supplies by URL — tool discovery, authorization discovery, and
deciding whether the URL is an MCP endpoint at all.

Remote MCP servers are third-party services owned entirely outside this
codebase. This page records only observed, reproducible wire behavior. How the
toolkit composes that behavior into scaffold flows is an internal concern and
belongs in an ADR under [`../adr/`](../adr/README.md).

All measurements in §1.3–§1.5 were taken 2026-07-27, those in §1.6 on 2026-07-28,
with an unauthenticated `initialize` request; all are reproducible with the
recipe in §1.7.

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

A challenge is not the only way the first chain starts. A server may publish a
protected-resource document and still never challenge, because it defers
authorization to the individual tool calls rather than to `initialize` (§1.6).
The document's location is not a secret the server has to reveal: RFC 9728 §3.1
derives it from the resource URL by inserting `/.well-known/oauth-protected-resource`
between the host and the resource path. Discovery driven only by
`resource_metadata` loses this class entirely.

### 1.2 Transport and method

- Streamable HTTP is the current transport; SSE (`/sse`) endpoints are still
  deployed and reachable.
- An MCP endpoint answers an unauthenticated `initialize` **POST** with either
  a JSON-RPC result, or a `401` challenge. It does not answer `404`.
- A `2xx` status alone is not proof. `https://substrate-sdf.office.com/` answers
  `200` with HTML to the same `POST` (§1.4). The **JSON-RPC envelope in the body**
  is the proof, and it survives the `text/event-stream` framing a streamable-HTTP
  server replies with, because `jsonrpc` sits inside the `data:` payload:

  ```
  event: message
  data: {"result":{"protocolVersion":"2025-03-26",…},"id":1,"jsonrpc":"2.0"}
  ```

- Authorization is **not** universal. `https://learn.microsoft.com/api/mcp`
  answers `initialize` with `200` and a full result, and serves its three tools,
  with no credentials at all (§1.3).
- `GET` on the same URL is **not** a substitute. Two of the servers measured
  return `200` with an HTML or JSON page on `GET` at a non-endpoint path while
  returning `404` to `POST` at that same path, and one **valid** endpoint
  returns `405` to `GET` (§1.3).

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
| Microsoft Learn | `https://learn.microsoft.com/api/mcp` | **200**, `text/event-stream`, JSON-RPC result | **405** (HTML) | — (no authorization required) |
| Office SDF | `https://substrate-sdf.office.com/exmigd2sapp/mcp` | 503 | 503 | — (Envoy `upstream connect error`; ring was down) |

**No valid MCP endpoint returned `404`.** Nine reachable valid endpoints were
measured (the eight above plus the eval server in §1.5); eight answered `401`
and one answered `200`. The Office SDF ring was unreachable and returned `503`
on every path, valid or not.

The Learn row also shows `405` coming from a **valid** endpoint: the server
exists and rejects the method, answering `GET` with
`"This is an MCP server endpoint and cannot be accessed directly via a browser
or unsupported transports like SSE."` `405` therefore only carries a signal for
the `initialize` `POST`, never for `GET`.

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
| `https://taskmaster-mcp-server.azurewebsites.net/` | **404** | **200** (JSON) | yes |
| `https://learn.microsoft.com/api/` | **405** | 404 (`API not handled`) | **no** |
| `https://learn.microsoft.com/api` | **403** (Akamai) | 404 | **no** |
| `https://learn.microsoft.com/` | **403** (Akamai) | 200 (HTML) | **no** |
| `https://api.moodys.com/genai-ready-data/m1/` | **401** | 401 | **no** |
| `https://substrate-sdf.office.com/exmigd2sapp/` | 503 | 503 | no (ring down) |
| `https://substrate-sdf.office.com/` | 200 (HTML) | 200 (HTML) | **no** |

HubSpot has no truncated form — its endpoint is already the origin root.

A `404`-only rule catches 6 of these 12. Widening the negative signal to the
other shapes the measurements produced — `403`, `405`, and `2xx` without a
JSON-RPC envelope — raises that to 10 of 12 while still misclassifying none of
the nine valid endpoints in §1.3 and §1.5.

The two `403`s are **not** the application answering: Akamai intercepts ahead
of it and rejects the probe outright. A WAF fronting a *valid* endpoint could
do the same to a request carrying no ordinary browser `User-Agent`, so `403` is
weaker evidence than `404` — it can mean "wrong URL" or "the edge disliked the
request".

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

### 1.6 Reference: servers that publish metadata but never challenge

Google's MCP servers authorize the individual tool calls, not `initialize`.
An unauthenticated `initialize` `POST` is answered `200` with a complete
JSON-RPC result and **no** `WWW-Authenticate` header:

```
{"id":1,"jsonrpc":"2.0","result":{"capabilities":{…},
 "protocolVersion":"2025-03-26",
 "serverInfo":{"name":"StatelessServer","version":"ESF"}}}
```

Each nevertheless publishes an RFC 9728 document, reachable only at the §3.1
insertion location:

| URL | Status |
|---|---|
| `https://drivemcp.googleapis.com/.well-known/oauth-protected-resource/mcp/v1` | **200** |
| `https://gmailmcp.googleapis.com/.well-known/oauth-protected-resource/mcp/v1` | **200** |
| `https://calendarmcp.googleapis.com/.well-known/oauth-protected-resource/mcp/v1` | **200** |
| `https://drivemcp.googleapis.com/.well-known/oauth-protected-resource` | 404 |
| `https://drivemcp.googleapis.com/mcp/v1/.well-known/oauth-protected-resource` | 404 |
| every `oauth-authorization-server` / `openid-configuration` form on the server host | 404 |

All three documents name the same issuer:

```
{"authorization_servers":["https://accounts.google.com/"],
 "resource":"https://drivemcp.googleapis.com/mcp/v1",
 "bearer_methods_supported":["header"],"scopes_supported":[…]}
```

and `https://accounts.google.com/.well-known/oauth-authorization-server`
returns the endpoints.

The insertion form is the one that generalizes. Where both were measured, only
it was always present:

| URL | Status |
|---|---|
| `https://mcp.notion.com/.well-known/oauth-protected-resource/mcp` | 200 |
| `https://mcp.notion.com/.well-known/oauth-protected-resource` | 200 |
| `https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp` | 200 |
| `https://api.githubcopilot.com/.well-known/oauth-protected-resource` | **404** |

These three servers also add to the valid-endpoint sample of §1.3 as the only
measured production endpoints that answer `initialize` with neither a challenge
nor a requirement for credentials at that stage.

### 1.7 Reproducing these measurements

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

1. Authorization discovery must attempt **both** spec generations, and must not
   depend on being challenged: the advertised `resource_metadata` chain, then
   the RFC 9728 protected-resource document **derived** from the MCP server URL,
   and — when no such document exists — RFC 8414 / OIDC well-known candidates
   derived from the MCP server URL including its origin root (§1.1, §1.6).
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
8. A successful `initialize` must be recognized by the **JSON-RPC envelope in
   the body**, not by the `2xx` status, and the check must tolerate
   `text/event-stream` framing (§1.2).
9. Confirmation that a URL is an MCP endpoint must be tracked separately from
   the absence of an authorization challenge: a server needing no
   authorization at all is legitimate (§1.2), so "no auth" cannot stand in for
   "could not tell" (§1.2, §1.3).
10. A user-supplied MCP server URL must be rejected at input time when an
    `initialize` `POST` returns `404`, and only then
    ([ADR-0020](../adr/ADR-0020-mcp-server-url-validity.md)).
11. The weaker negative signals — `403`, `405`, and `2xx` without a JSON-RPC
    envelope — must warn rather than block, because a `403` can come from a WAF
    in front of a valid endpoint (§1.4)
    ([ADR-0020](../adr/ADR-0020-mcp-server-url-validity.md)).
12. Accepting a URL must never be presented as confirmation that it serves
    tools — §1.4 documents a wrong URL that answers `401`
    ([ADR-0020](../adr/ADR-0020-mcp-server-url-validity.md)).

## 3. Open questions

- The dynamic-tool-discovery scaffold path performs no tool fetch by design,
  so it has no independent check that the URL serves tools. §2.10 and §2.11
  cover the status-code cases; the §1.4 Moody's case remains uncovered, as does
  a URL whose host was unreachable at scaffold time.
- Whether a confirmed endpoint should be surfaced to the user as positive
  feedback at input time, and through which affordance, is undecided. The
  probe now distinguishes the state; nothing renders it.
- When a URL is known-wrong, should dynamic client registration still be
  allowed to register an OAuth client against that host during provision?
