# ADR-0020 — MCP server URL validity: when to check, and whether to block

- **Status:** Accepted
- **Date:** 2026-07-27
- **Source:** [`mcp-remote-servers.md` §3](../external-dependencies/mcp-remote-servers.md#3-open-questions)

## Context

Forced by an external fact. When a user supplies a remote MCP server URL, a
common mistake is to paste the host or a parent path instead of the endpoint
— `https://mcp.notion.com/` instead of `https://mcp.notion.com/mcp`. The
toolkit currently accepts such a URL, scaffolds a project around it, and the
mistake surfaces only at provision time or not at all.

[`mcp-remote-servers.md` §1.3–§1.4](../external-dependencies/mcp-remote-servers.md#13-measured-behavior--documented-endpoint-urls)
records what nine real endpoints and twelve truncated forms return. Four
measured facts drive this decision:

- No valid endpoint returned `404`. A `404` from an `initialize` `POST` is
  therefore a zero-false-positive negative signal on the sample measured.
- It is not a complete signal: it caught six of the twelve truncated URLs.
  Widening to the other negative shapes measured — `403`, `405`, and `2xx`
  without a JSON-RPC envelope — raises that to ten of twelve, still without
  misclassifying any of the nine valid endpoints.
- Those wider shapes are weaker evidence. Both measured `403`s came from a WAF
  intercepting ahead of the application, and a WAF fronting a *valid* endpoint
  could reject the probe the same way. `405` came from a valid endpoint too,
  when addressed with the wrong method.
- `5xx` and transport failures mean the server is unreachable, not that the
  URL is wrong, and must be distinguished from both of the above.

A fifth fact constrains how success is recognized: `https://learn.microsoft.com/api/mcp`
requires no authorization at all and answers `initialize` with `200`, while
`https://substrate-sdf.office.com/` answers the same request with `200` and
HTML. The status is not the signal; the JSON-RPC envelope in the body is.
Recognizing it also means a confirmed endpoint stops being indistinguishable
from a probe that learned nothing.

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

- **F — C for the certain signal, A for the weaker ones.** Block at input time
  on `404` alone; let the other negative shapes surface as a post-scaffold
  warning. Two tiers to implement and reason about, but the strength of the
  pushback then matches the strength of the evidence.

## Decision

**F — block at input time on `404`; warn after scaffolding on the weaker
negative shapes.**

The URL question rejects a value if, and only if, an unauthenticated
`initialize` `POST` to it completes and the server answers `404`. Every other
outcome accepts: a `401`, a successful `initialize`, `403`, `405`, any other
status, a `5xx`, a timeout, a DNS or TLS failure. The user must have received a
positive statement from the server that nothing is routed at that path before
they are stopped.

The probe classifies the URL into three states rather than reporting only
whether authorization is required:

| State | Produced by | Effect |
|---|---|---|
| `confirmed` | `401`, or `2xx` carrying a JSON-RPC envelope | none |
| `notEndpoint` | `403`, `404`, `405`, or `2xx` without a JSON-RPC envelope | `404` blocks at input; the rest warn after scaffolding |
| `undetermined` | `5xx`, other statuses, timeouts, transport failures | none |

Blocking on `404` is chosen over the non-blocking hint (B) because the measured
precision is 100% across nine endpoints and the failure it prevents is
expensive: the project is scaffolded around the wrong URL, authorization
discovery then resolves that *host's* authorization server and writes
plausible-but-wrong endpoints, and on the dynamic-tool-discovery path nothing
else in the flow disagrees. A warning the user can click past does not prevent
that, and the remedy after the fact is to recreate the project.

The weaker shapes are not promoted to blocking because both measured `403`s
came from a WAF rather than the application. Wrongly blocking a legitimate URL
is worse than missing a wrong one — the user has no way past a blocking
validator, whereas a warning still leaves a usable project.

It is chosen over pure positive validation (D) for the same reason in stronger
form: D rejects valid endpoints whenever the probe cannot complete, which
breaks offline and restricted-network scaffolding. The rule adopted here fails
open on every ambiguous outcome by construction — `undetermined` never
surfaces at all.

The negative statuses are enumerated (`403`, `404`, `405`) rather than
generalized to "any 4xx", because statuses such as `429` and `408` are
transient and would slander a URL that is in fact correct.

The check is not a substitute for the tool-fetch signal on the paths that have
one, and does not claim completeness — §1.4 of the fact page documents a
truncated URL that answers `401` and therefore passes.

## Consequences

- New constraints §2.8 – §2.12 on
  [`mcp-remote-servers.md`](../external-dependencies/mcp-remote-servers.md#2-constraints-derived-from-these-facts).
- Scaffolding gains a network round-trip in the question walk on every
  platform. Previously the VS Code path performed no probe at this point.
- A valid MCP server that is mid-deploy behind a gateway returning `404` will
  block the create flow with no override. This is the accepted cost of the
  decision; the residual risk is bounded because a deploying gateway more
  commonly returns `5xx`, which accepts.
- The rejection message must name the measured cause and the likely fix, since
  the user has no way past it.
- The post-scaffold warning on the dynamic-tool-discovery path now fires for
  every `notEndpoint` shape, not only `404`. Its wording can no longer name a
  status code.
- The `404` half of that warning becomes unreachable through the interactive
  create flow. It is retained because that path is also reached through entry
  points that do not walk the URL question.
- `confirmed` is recorded but not rendered anywhere. Whether to show positive
  feedback for it is left open on the fact page §3.
