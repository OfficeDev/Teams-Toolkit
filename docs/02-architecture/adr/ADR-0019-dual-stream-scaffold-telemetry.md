# ADR-0019 — Dual-stream scaffold telemetry

- **Status:** Accepted
- **Date:** 2026-05-28 (Accepted 2026-06-08)
- **Source:** [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into)
  (decomposes §8.2; invariant 15). Validated against the `scaffold-v4-template`
  event field set in §8.2, whose `template-id` / `descriptor-spec` /
  `requires-network` columns are populated directly from the two MCP descriptors.

## Context

This is an **internal** decision about observability during v3↔v4 coexistence.
The v4 create path runs templates the v3 dashboards were built around
(`create-project`, `generate-template`). If v4 silently replaced those events,
existing funnels and alerts would break the moment a route flips to `engine:v4`;
if v4 emitted *only* v3 events, the new structure (template-id, package version,
engine, requires-network, descriptor-spec presence) would be invisible.

## Options considered

- **A — Replace v3 events with a new v4 family.** Clean long-term, but breaks
  every existing dashboard at the first v4 route flip.
- **B — Emit only v3 events from the v4 path.** Zero dashboard breakage, but the
  v4-only structure is unobservable and migration can't be measured.
- **C — Dual-stream: v3 events verbatim + a parallel `scaffold-v4-*` family,
  joined by `correlation-id` (chosen).** Existing dashboards keep working; v4
  structure is measurable; no v3-event deprecation needed now.

## Decision

1. **Rule 1 — v3 events are emitted verbatim from the v4 path** (parity). When a
   route resolves to `engine:v4`, the composition root still emits the same
   `create-project` / `generate-template` events with the same fields the v3 path
   would have, so existing funnels and alerts are unaffected by a route flipping
   to v4.

2. **Rule 2 — a parallel `scaffold-v4-*` event family carries v4-only
   structure.** The anchor event `scaffold-v4-template` fires once per resolved
   template, parallel to `generate-template`, with fields including `template-id`
   (e.g. `da/mcp-server`), `templates-package-id`, `templates-package-version`,
   `package-source` (`bundled | online`), `descriptor-spec` (path under
   `docs/03-specs/scenarios/`, empty if missing), `requires-network`
   (bool), `engine` (`v3 | v4`), `surface`, `q1-route` (concatenated selector
   route), and `q2-count`.

3. **The two streams are joined by `correlation-id`** (invariant 15): every v3
   event and its parallel `scaffold-v4-*` event for the same scaffold run carry
   the same correlation id, so analysis can reconcile the legacy funnel with the
   v4 structure without double-counting.

4. **No v3-event deprecation is in scope.** Removing or renaming v3 events is a
   later, separately-decided step once v4 coverage and dashboard migration are
   complete; this ADR only adds the parallel stream.

## Consequences

- **New constraint (invariant 15):** every v4 scaffold run emits *both* streams
  under one `correlation-id`; a `scaffold-v4-*` event without its v3 parallel (or
  vice-versa) is a telemetry bug.
- **Dashboards keep working** across the entire v3→v4 migration window — the
  primary reason this is dual-stream rather than a clean replacement.
- **Migration is measurable:** the `engine` + `template-id` + `package-version`
  fields let analysis track which routes have flipped to v4 and how each template
  version performs, including whether `requires-network` correlates with failures.
- **Field source is the descriptor:** `descriptor-spec` and `requires-network`
  come straight from the resolved `descriptor.json`, so [ADR-0016](ADR-0016-declarative-template-format.md)
  changes to those fields flow into telemetry automatically.
- **Revisit via a superseding ADR:** now Accepted, the two-rule model (v3 verbatim +
  the parallel `scaffold-v4-*` family) and the `scaffold-v4-template` field set are
  immutable; the §8.2 field table is the reference shape, and the
  `emit-scaffold-telemetry` spec below is the derived contract.

## Derived specs

This ADR derives one operation spec — the single dual-stream emit point every v4
scaffold run routes its telemetry through:

- [`operations/scaffolding/emit-scaffold-telemetry.md`](../../03-specs/operations/scaffolding/emit-scaffold-telemetry.md)
  — Rule 1 v3-parity (verbatim, additive-only) plus the three `scaffold-v4-*`
  events (`-template` / `-step` / `-outcome`), paired to their v3 parallels by
  `correlation-id` (invariant 15) over the closed enum sets, with no v3-event
  deprecation in scope.
