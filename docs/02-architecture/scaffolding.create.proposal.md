# Scaffolding subsystem — v4 ADR decomposition map

- **Status:** Historical — superseded by **ADR-0014 ... ADR-0019** (all
  `Accepted` 2026-06-08). This file is now a navigation pointer for old section
  references.
- **Date:** 2026-05-28 (decomposed 2026-06-08)
- **Scope:** the `create` lifecycle — from a user-confirmed "new project" intent
  to a generated project folder on disk.
- **Companion:** [`scaffolding.current-state.md`](scaffolding.current-state.md)
  (historical pain catalog this addressed) and
  [`scaffolding.backlog.md`](scaffolding.backlog.md) (the open
  in-place-modification / VS backlog, relocated from the former §13).

> **What happened to the body.** This proposal carried the full v4 create-flow
> design (former §§1–15) through 2026-06-08, validated against the two on-disk
> worked examples under `v4/{create,modify}/`. It has now been
> **decomposed** into six focused, `Accepted`, immutable ADRs and their derived
> specs under [`docs/03-specs/`](../03-specs/README.md). The full prose is in
> git history; the **binding contract** is the ADRs and specs. This file remains
> only as the **decomposition map** so inbound `proposal §N` references still
> resolve. Revisiting any decision requires a **superseding ADR**, not an edit
> here.

## Decomposition map

Each former section cluster, the decision it became, and the spec(s) derived
from that decision. Inbound "`scaffolding.create.proposal.md` §N" links (from
ADR `Source` lines and spec `Seam` lines) resolve here.

| Former §§ | Decision — now **`Accepted`** | Derived spec(s) under [`docs/03-specs/`](../03-specs/README.md) |
|---|---|---|
| §§5, 5.1, 5.3, 9, 9.1, 10 | [ADR-0014](adr/ADR-0014-dispatcher-buildtarget-resolution.md) — Dispatcher + `BuildTarget` resolution (front stage, descriptor-derived v4 routing, retained core-method exception) | [`resolve-build-target`](../03-specs/operations/scaffolding/resolve-build-target.md) |
| §§3, 5 | [ADR-0015](adr/ADR-0015-templates-version-artifact-shape.md) — `templates-v4@version` release artifact shape | [`validate-template-package`](../03-specs/operations/scaffolding/validate-template-package.md) |
| §§2, 3.1, 3.1.0, 3.1.2, 3.2, 3.5, 4, 4.1, 4.2, 4.3, 6 | [ADR-0016](adr/ADR-0016-declarative-template-format.md) — Declarative descriptor + questions + replaceMap + one closed expression grammar | [`evaluate-expression`](../03-specs/operations/scaffolding/evaluate-expression.md) · [`build-render-context`](../03-specs/operations/scaffolding/build-render-context.md) · [`collect-inputs`](../03-specs/operations/scaffolding/collect-inputs.md) |
| §§3.3, 3.3.1 | [ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md) — Named pipeline + step / actionTemplate whitelist | [`run-scaffold-pipeline`](../03-specs/operations/scaffolding/run-scaffold-pipeline.md) |
| §§8, 8.1 | [ADR-0018](adr/ADR-0018-scaffold-runtime-test-pyramid.md) — `ScaffoldRuntime` + T1/T2/T3 pyramid + design-first `descriptor.spec` gate | [`scenarios/da/create-mcp-server`](../03-specs/scenarios/da/create-mcp-server.md) · [`scenarios/da/add-mcp-server`](../03-specs/scenarios/da/add-mcp-server.md) |
| §8.2 | [ADR-0019](adr/ADR-0019-dual-stream-scaffold-telemetry.md) — Dual-stream telemetry (v3 verbatim + parallel `scaffold-v4-*`) | [`emit-scaffold-telemetry`](../03-specs/operations/scaffolding/emit-scaffold-telemetry.md) |
| §5.2 | [ADR-0006](adr/ADR-0006-template-distribution-channel.md) — Template distribution channel. **Not** decomposed from this proposal; the two share only the `(package-source, package-version)` hand-off and the `descriptor.minEngineVersion` compatibility check | [`resolve-template-source`](../03-specs/operations/scaffolding/resolve-template-source.md) · [`open-template-package`](../03-specs/operations/scaffolding/open-template-package.md) |
| §13 | Deferred scenario refinements / Visual-Studio backlog | → [`scaffolding.backlog.md`](scaffolding.backlog.md) |
| §§11, 12 | Worked example (`da/mcp-server`) + rationale — advisory | folded into the ADR-0018 scenario specs above |

The full domain index (every operation + scenario spec) lives in
[`docs/03-specs/domains/01-scaffolding.md`](../03-specs/domains/01-scaffolding.md).

<a id="14-adrs-this-proposal-will-be-decomposed-into"></a>

## 14. Accepted ADR decomposition

This proposal became the Context for six focused ADRs, **all now `Accepted`
(2026-06-08)** — see the decomposition map above for each one's sections and
derived specs:

- [ADR-0014](adr/ADR-0014-dispatcher-buildtarget-resolution.md) — Dispatcher with `BuildTarget` (`{ templateId, language? }`) resolution as the front stage.
- [ADR-0015](adr/ADR-0015-templates-version-artifact-shape.md) — `templates-v4@version` release artifact shape.
- [ADR-0016](adr/ADR-0016-declarative-template-format.md) — Declarative descriptor + questions + replaceMap, with the single closed expression grammar.
- [ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md) — Named pipeline + step / actionTemplate whitelist + domain-typed step naming.
- [ADR-0018](adr/ADR-0018-scaffold-runtime-test-pyramid.md) — `ScaffoldRuntime` + T1/T2/T3 pyramid + design-first `descriptor.spec` gate (the v4-scaffolding *application* of the Accepted [ADR-0013](adr/ADR-0013-test-tiering-and-coverage-gate.md), not a competing tiering).
- [ADR-0019](adr/ADR-0019-dual-stream-scaffold-telemetry.md) — Dual-stream telemetry, joined by `correlation-id`; no v3-event deprecation in scope.

Two boundary facts the six-ADR set deliberately does **not** turn into new
decisions:

- **Invariant 14 (network-use parity)** is not owned by any of the six. It binds
  the offline-by-default property in [`scaffolding.md`](scaffolding.md) §3.2 to
  the per-template `descriptor.requiresNetwork` flag — a prose policy turned into
  a discoverable, statically-checkable flag, not an ADR-level decision. The set
  covers invariants 1–13, 15, 16, 17.
- **[ADR-0006](adr/ADR-0006-template-distribution-channel.md)** (distribution
  channel) is separate: v4's single-package shape settles the content / metadata
  half of that cluster by construction (an ADR-0015 consequence), while channel /
  source / version resolution remains ADR-0006's.

## 15. Former rollout note

The rollout sequencing that used to live here is no longer active guidance: v4 is
the formal scaffolding path. Remaining work belongs either to the derived specs'
acceptance criteria, to [`scaffolding.backlog.md`](scaffolding.backlog.md), or to
a new superseding ADR if it changes an accepted decision.
