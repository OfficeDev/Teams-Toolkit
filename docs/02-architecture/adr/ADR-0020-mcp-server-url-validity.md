# ADR-0020 — MCP server URL validity: when to check, and whether to block

- **Status:** Proposed
- **Date:** 2026-07-27
- **Source:** [`mcp-remote-servers.md` §3](../external-dependencies/mcp-remote-servers.md#3-open-questions)

## Context

Forced by an external fact. When a user supplies a remote MCP server URL, a
common mistake is to paste the host or a parent path instead of the endpoint
— `https://mcp.notion.com/` instead of `https://mcp.notion.com/mcp`. The
toolkit currently accepts such a URL, scaffolds a project around it, and the
mistake surfaces only at provision time or not at all.

[`mcp-remote-servers.md` §1.3–§1.4](../external-dependencies/mcp-remote-servers.md#13-measured-behavior--documented-endpoint-urls)
records what nine real endpoints and their truncated forms return. Three
measured facts drive this decision:

- No valid endpoint returned `404`; all eight reachable ones returned `401`.
  A `404` from an `initialize` `POST` is therefore a zero-false-positive
  negative signal on the sample measured.
- It is not a complete signal: it caught six of nine truncated URLs. A gateway
  that mounts authorization on a path prefix answers a parent path with a
  well-formed `401` *and* a `resource_metadata` document, so discovery
  succeeds and yields plausible-but-wrong endpoints.
- `5xx` and transport failures mean the server is unreachable, not that the
  URL is wrong, and must be distinguished.

The scaffold flows also differ in what backstop they already have. The paths
that fetch tools detect a wrong URL independently, because a wrong URL yields
zero tools. The dynamic-tool-discovery path performs no tool fetch by design
and has no such backstop, which is why the `404` signal currently surfaces
there as a post-scaffold warning.

The question this ADR settles is *where* the check belongs and *how hard* it
should push back — not whether `404` is meaningful, which §1 establishes.

## Options considered

- **A — Post-scaffold warning only (current behavior).** The probe already
  runs during scaffolding; a `404` becomes a warning in the scaffolding
  summary. Cheapest, and cannot break input flows. But it tells the user after
  the project exists, and the remedy is to recreate it.

- **B — Non-blocking hint at input time.** Move the signal to the MCP server
  URL question so the user sees it while the field is still editable, but
  allow them to proceed. Requires the URL question to probe on accept, which
  it does not currently do on the VS Code path. Costs a network round-trip in
  the question walk and must degrade silently when offline.

- **C — Blocking validation at input time.** Same probe, but reject the URL.
  The measured precision supports it, but the sample is nine endpoints, a
  gateway mid-deploy can legitimately `404`, and a hard block on a network
  probe makes the create flow fail closed when the network does.

- **D — Positive validation instead of negative.** Require evidence the URL
  *is* an MCP endpoint — a successful `initialize`, or a `401` challenge —
  rather than looking for evidence it is not. Strictly stronger: it would also
  catch the `200`-returning wrong URLs that `404` misses. But it inverts the
  failure mode, rejecting valid endpoints whenever the probe cannot complete,
  and the path-prefix `401` case (§1.4) would still pass.

- **E — B plus telemetry, then reconsider C.** Ship the hint, measure how
  often it fires and how often users correct the URL afterwards, and use that
  to decide whether blocking is justified. Defers the precision question to
  data instead of a nine-endpoint sample.

## Decision

(Pending. Filled in when status moves to `Accepted`.)

## Consequences

(Pending. Filled in when status moves to `Accepted`. List any new constraints
this decision introduces; add them to the relevant fact page or architecture
page in the same PR.)
