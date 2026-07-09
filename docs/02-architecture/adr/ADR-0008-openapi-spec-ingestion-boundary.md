# ADR-0008 — Boundary of user-supplied OpenAPI spec ingestion

- **Status:** Proposed
- **Date:** 2026-05-28
- **Source:** [`../external-dependencies/openapi-spec-parser.md` §3](../external-dependencies/openapi-spec-parser.md#3-open-questions-candidates-for-adrs)

## Context

API-plugin scaffold capability §2.4 in
[`../scaffolding.md`](../scaffolding.md) requires ingesting a
user-supplied OpenAPI document. Today the call sites pass the
user-provided URL string directly to `new SpecParser(input, options)`
(per
[`../external-dependencies/openapi-spec-parser.md`](../external-dependencies/openapi-spec-parser.md)
§1.2), which causes the parser's own HTTP client to fetch the URL from
inside the toolkit process.

This creates two issues:

- **Cross-cutting:** breaks `../scaffolding.md` §3.2 (offline-capable)
  for this project type.
- **Security:** a user-controlled URL becomes an outbound HTTP request
  with no host allowlist, no size cap visible to the toolkit, and no
  redirect policy — an SSRF surface (constraint §2.1 on the fact page).

`@microsoft/m365-spec-parser` also accepts a local file path as input,
so URL fetch is not the only mode available.

## Options considered

- **A — File-path only inside scaffold.** Scaffold accepts only a
  local file path. A separate, explicit "import OpenAPI from URL"
  step exists earlier in the flow (or before launching scaffold) that
  fetches the URL into a local file with its own progress / error
  surface, host allowlist, and size cap.
- **B — URL allowed, hardened.** Scaffold continues to accept URLs but
  the toolkit pre-resolves the URL itself (so the parser sees only a
  local file) with an allowlist of hosts, a fixed maximum size, a
  fixed redirect cap, and refusal of link-local / metadata-service
  addresses.
- **C — URL passed straight to parser, accept the SSRF surface.**
  Document the constraint as a known limitation; rely on user awareness
  not to paste internal URLs.
- **D — Status quo.** Today's behavior; equivalent to C without
  documentation.

## Consequences expected per option

- A removes the SSRF surface entirely from scaffold; requires UX
  work for the new import step.
- B keeps the URL UX but moves the network boundary into toolkit code.
- C / D leave the SSRF surface exposed.

## Decision

(Pending.)

## Consequences

(Pending.)
