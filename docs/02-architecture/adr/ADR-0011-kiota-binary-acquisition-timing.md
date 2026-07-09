# ADR-0011 — Kiota binary acquisition timing

- **Status:** Proposed
- **Date:** 2026-05-28
- **Source:** [`../external-dependencies/kiota.md` §3](../external-dependencies/kiota.md#3-open-questions-candidates-for-adrs)

## Context

Kiota requires a native binary per
[`../external-dependencies/kiota.md`](../external-dependencies/kiota.md)
§1.2; binary discovery follows the priority order in §1.3 of the same
page. The `@microsoft/kiota` npm package ships the binary inside its
own package payload and extracts it lazily on first invocation.

Today the first invocation happens **during scaffolding** (for the
OpenAPI plugin flow) or **during compile** (for the TypeSpec flow). The
extraction step has variable latency and a non-trivial failure surface
(file-system permissions, antivirus interference on Windows, the
`pkg`-bundle special case in §1.3). This makes scaffolding's failure
profile depend on a step that is not logically part of scaffolding.

The binary itself is required (constraint §2.1 on the fact page); what
is negotiable is when extraction happens.

## Options considered

- **A — Extract on toolkit install / activation.** First-run extraction
  happens during VS Code extension activation or `cli` first launch,
  not at scaffold time. Scaffold-time `setKiotaConfig` becomes a
  pure path-set without I/O.
- **B — Extract at "open project that may need Kiota" time.** When the
  toolkit detects (during scaffold flow selection) that the chosen
  template requires Kiota, extraction runs as an explicit gating step
  with its own progress UI, before scaffold begins.
- **C — Bundle binary separately.** Ship the Kiota binary as part of
  the toolkit's own install payload (next to the engine) rather than
  relying on the npm package's bundled extraction. Removes the lazy
  step entirely; couples toolkit installer logic to Kiota's binary
  layout.
- **D — Status quo.** Lazy extraction on first call.

Scope of this ADR is limited by ADR-0010: if the TypeSpec path drops
Kiota per ADR-0010 options A/B, then only the raw-OpenAPI scaffold
flows are affected by this decision.

## Decision

(Pending.)

## Consequences

(Pending.)
