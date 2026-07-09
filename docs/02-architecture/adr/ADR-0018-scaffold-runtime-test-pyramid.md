# ADR-0018 — `ScaffoldRuntime` + T1/T2/T3 test pyramid + design-first spec gate

- **Status:** Accepted
- **Date:** 2026-05-28 (Accepted 2026-06-08)
- **Source:** [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into)
  (decomposes §§8, 8.1; invariants 13, 16). This is the **v4-scaffolding
  application** of the Accepted [ADR-0013](ADR-0013-test-tiering-and-coverage-gate.md),
  not a competing tiering. Validated against the `descriptor.spec` field present
  in both MCP descriptors and the `docs/03-specs/scenarios/` layout.

## Context

This is an **internal** decision. The proposal's goal #4 (§1) is that "a test for
a template behavior runs **without** real filesystem, network, or `npm install`."
v3 scaffolding tests need a real FS and often network, so they are slow,
flaky, and skipped — leaving generator behavior unverified
(`scaffolding.current-state.md`).

ADR-0013 (Accepted) already owns the toolkit-wide *test-purpose* axis
(operation-integration / file-unit / scenario-e2e) and the AC-derived
coverage-gate unit-of-measure. This ADR **binds that axis to concrete v4 harness
layers** by injecting the engine's outside-world contact points behind one
seam, so the layers ADR-0013 names become runnable in-memory.

## Options considered

- **A — Keep real-FS/real-network scaffolding tests (status quo).** No new
  abstraction, but tests stay slow/flaky/skipped.
- **B — Mock `fs`/`http` ad hoc per test.** Works locally, but every test
  re-invents the mock and the engine can still reach an un-mocked global.
- **C — A single injected `ScaffoldRuntime` (five faces) + a three-tier pyramid
  mapped onto ADR-0013, plus a design-first `descriptor.spec` gate (chosen).**
  One seam, one in-memory implementation, AC rows drive the top tier.

## Decision

1. **`ScaffoldRuntime` is the single injected seam** for the engine's five
   outside-world faces (§8): `fs`, `http`, `clock`, `env`/feature-flags, and the
   UI. The engine never touches a global `fs`/`fetch`/`Date`/`process.env`
   directly; everything routes through `runtime.*`. An `InMemoryRuntime`
   implements all five for tests; providers and steps consume `runtime.http` /
   `runtime.fs` only (ADR-0017 §3.3.2 rule 3).

2. **Three tiers, mapped onto ADR-0013** (§8.1, invariant 16):
   - **T1 = invariant/schema checks** — pure, no runtime; the JSON-Schema +
     §3.5 typed-placeholder + selector-overlap + rendered-path-safety checks.
     Part of ADR-0013 *file-unit*.
   - **T2 = file-unit** — a single step / provider / question run under
     `InMemoryRuntime`; no real FS/network/`npm install`. ADR-0013 *file-unit*.
   - **T3 = scenario** — a whole template scaffolded under `InMemoryRuntime`
     with a `ScriptedUI`, asserting outputs against the **scenario spec's**
     **Acceptance Criteria rows** (the per-template, end-to-end contract under
     `docs/03-specs/scenarios/`). ADR-0013 *scenario / CLI-E2E / UI*.

3. **Design-first `descriptor.spec` gate** (§3.1, invariant 13). Every template
   *may* declare `descriptor.spec` pointing at a **scenario spec** under
   `docs/03-specs/scenarios/<group>/` — the *vertical* (per-template, end-to-end)
   counterpart to the *horizontal* (per-action) operation specs, composing them
   and pinning the concrete artifacts *that* template produces. The create
   `da/mcp-server` package points at `…/scenarios/da/create-mcp-server.md`; the modify
   `add-mcp-server` package at `…/scenarios/da/add-mcp-server.md`. CI **warns**
   (soft, tightened to hard once the spec backlog clears) when `spec` is missing
   or its file lacks an `## Acceptance Criteria` table. Those AC rows are the
   **source of T3 assertions** — this is ADR-0013's "behavior → AC" gate applied
   to scaffolding, making "spec before tests, tests before code" (the
   vibe-coding skill) mechanically checkable.

## Consequences

- **New constraints (invariants 13, 16):** the engine's outside-world access is
  confined to `ScaffoldRuntime`; a step/provider reaching a global instead of
  `runtime.*` is a review/lint reject. `descriptor.spec` resolution + an AC table
  are CI-warned.
- **Tests run hermetically:** every T1/T2 and most T3 cases run with no real FS,
  network, or `npm install`, satisfying goal #4 and making scaffolding tests
  cheap enough to keep green (the repo-wide "affected tests green" gate).
- **Subordinate to [ADR-0013](ADR-0013-test-tiering-and-coverage-gate.md):** if
  ADR-0013's axis or coverage unit-of-measure changes, this ADR's T1/T2/T3
  binding follows; it introduces **no** competing tiering vocabulary.
- **The concrete `ScaffoldRuntime` TS surface lands with the first real v4 step /
  provider** (§§ referenced at proposal L1043/L1427); until then the prose here is
  the contract.
- **Revisit via a superseding ADR:** now Accepted, the five-face seam and the
  tier→ADR-0013 mapping are immutable; the `descriptor.spec` fields in the two
  MCP packages are the conformance fixtures, and the two scenario specs below are
  the derived T3 contract.

## Derived specs

This ADR derives the **scenario-spec kind** and its `descriptor.spec` gate; the
first two conformance fixtures are:

- [`scenarios/da/create-mcp-server.md`](../../03-specs/scenarios/da/create-mcp-server.md)
  — the create `da/mcp-server` template, end-to-end (10 AC, all T3/L1).
- [`scenarios/da/add-mcp-server.md`](../../03-specs/scenarios/da/add-mcp-server.md)
  — the modify `add-mcp-server` template, end-to-end (9 AC, all T3/L1).

The scenario-spec format itself is defined in the
[specs README](../../03-specs/README.md#required-sections-in-a-scenario-spec).
