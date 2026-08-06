# Architecture Decision Records (ADRs)

Numbered, dated, immutable records of architectural decisions for the
Microsoft 365 Agents Toolkit engine.

See [`../README.md`](../README.md) for what counts as an architectural
decision. The format for a new ADR is defined inline below under
[Adding a new ADR](#adding-a-new-adr).

## Status legend

- **Proposed** — open backlog item. Problem stated, options listed, decision
  pending. Safe to edit until status changes.
- **Accepted** — decided. **Immutable**. To revisit, write a new ADR and mark
  the old one `Superseded by ADR-NNNN`.
- **Superseded** — replaced by a newer ADR. Kept for history.

## Index

| ID | Title | Status | Triggered by |
|---|---|---|---|
| ADR-0001 | [Engine ↔ surface token-provider contract](ADR-0001-engine-surface-token-boundary.md) | Proposed | [`identity-and-login.md`](../external-dependencies/identity-and-login.md) (removed §1.8) |
| ADR-0002 | [M365 login plumbing: share vs duplicate across surfaces](ADR-0002-m365-login-plumbing-sharing.md) | Proposed | [`identity-and-login.md` §3](../external-dependencies/identity-and-login.md#3-open-questions-candidates-for-adrs) |
| ADR-0003 | [Native broker (WAM) gating policy](ADR-0003-broker-gating.md) | Proposed | [`identity-and-login.md` §3](../external-dependencies/identity-and-login.md#3-open-questions-candidates-for-adrs) |
| ADR-0004 | [TDP region state: singleton vs request-scoped](ADR-0004-tdp-region-state.md) | Proposed | [`identity-and-login.md` §3](../external-dependencies/identity-and-login.md#3-open-questions-candidates-for-adrs) |
| ADR-0005 | [Env-override configuration model](ADR-0005-env-override-config-model.md) | Proposed | [`identity-and-login.md` §3](../external-dependencies/identity-and-login.md#3-open-questions-candidates-for-adrs) |
| ADR-0006 | [Template distribution channel for project skeletons](ADR-0006-template-distribution-channel.md) | Accepted | [`scaffolding.md` §2.1](../scaffolding.md#2-essential-capabilities) |
| ADR-0007 | [When to resolve OneDrive / SharePoint URLs to stable IDs](ADR-0007-driveitem-resolution-timing.md) | Proposed | [`graph-driveitem-resolution.md` §3](../external-dependencies/graph-driveitem-resolution.md#3-open-questions-candidates-for-adrs) |
| ADR-0008 | [Boundary of user-supplied OpenAPI spec ingestion](ADR-0008-openapi-spec-ingestion-boundary.md) | Proposed | [`openapi-spec-parser.md` §3](../external-dependencies/openapi-spec-parser.md#3-open-questions-candidates-for-adrs) |
| ADR-0009 | [SPFx scaffolding tooling path](ADR-0009-spfx-scaffolding-tooling-path.md) | Proposed | [`spfx-tooling.md` §3](../external-dependencies/spfx-tooling.md#3-open-questions-candidates-for-adrs) |
| ADR-0010 | [TypeSpec → agent-artifact compile chain shape](ADR-0010-typespec-compile-chain-shape.md) | Proposed | [`typespec-compiler.md` §3](../external-dependencies/typespec-compiler.md#3-open-questions-candidates-for-adrs) |
| ADR-0011 | [Kiota binary acquisition timing](ADR-0011-kiota-binary-acquisition-timing.md) | Proposed | [`kiota.md` §3](../external-dependencies/kiota.md#3-open-questions-candidates-for-adrs) |
| ADR-0012 | [Office Add-in import flow placement](ADR-0012-office-addin-import-flow-placement.md) | Proposed | [`office-addin-tooling.md` §3](../external-dependencies/office-addin-tooling.md#3-open-questions-candidates-for-adrs) |
| ADR-0013 | [Test tiering and the coverage gate's unit-of-measure](ADR-0013-test-tiering-and-coverage-gate.md) | Accepted | Internal concern — coverage-gate friction in PR #16082 |
| ADR-0014 | [Dispatcher + BuildTarget resolution (front stage, descriptor-derived v4 routing, retained core-method exception)](ADR-0014-dispatcher-buildtarget-resolution.md) | Accepted | [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into) |
| ADR-0015 | [`templates-v4@version` release artifact shape](ADR-0015-templates-version-artifact-shape.md) | Accepted | [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into) |
| ADR-0016 | [Declarative descriptor + questions + replaceMap format](ADR-0016-declarative-template-format.md) | Accepted | [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into) |
| ADR-0017 | [Named pipeline + step / actionTemplate whitelist](ADR-0017-named-pipeline-step-whitelist.md) | Accepted | [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into) |
| ADR-0018 | [`ScaffoldRuntime` + T1/T2/T3 test pyramid + design-first `descriptor.spec` gate (application of ADR-0013, not a competing tiering)](ADR-0018-scaffold-runtime-test-pyramid.md) | Accepted | [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into) |
| ADR-0019 | [Dual-stream scaffold telemetry (v3 verbatim + parallel `scaffold-v4-*` family)](ADR-0019-dual-stream-scaffold-telemetry.md) | Accepted | [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into) |
| ADR-0020 | [MCP server URL validity: when to check, and whether to block](ADR-0020-mcp-server-url-validity.md) | Accepted | [`mcp-remote-servers.md` §3](../external-dependencies/mcp-remote-servers.md#3-open-questions) |
| ADR-0021 | [Parent window for the WAM broker sign-in dialog](ADR-0021-wam-broker-dialog-parent-window.md) | Proposed | [gim-home/wiqd#1884](https://github.com/gim-home/wiqd/issues/1884) |
| ADR-0022 | [Ownership of host-agnostic manifest-template resolution](ADR-0022-manifest-template-resolution-ownership.md) | Accepted | Internal concern — cross-host `file()`/`${{ENV}}` resolver reuse in PR #16525 |

> **Reading order vs. numeric order.** The Index is in **numeric order** —
> the immutable, reservation-ordered ADR id is the anchor for every forward
> reference, so rows are never re-sorted by topic or activity. Use the two
> notes below to read it by *activity* instead: ADR-0014 – ADR-0019 are the
> **active decision set**; ADR-0007 – ADR-0012 are **passive backlog**.

> **Active decision set (ADR-0014 – ADR-0019).** These six are the v4
> create-flow *shape*, decomposed from
> [`scaffolding.create.proposal.md`](../scaffolding.create.proposal.md) and
> validated against the two on-disk worked examples under
> `templates/v4/{create,modify}/`. They are drafted **with full Decision +
> Consequences** — depend-able, and are **all six now `Accepted`** — ADR-0014,
> ADR-0015, ADR-0016, ADR-0017, ADR-0018, ADR-0019 — each having derived its specs
> under [`docs/03-specs/`](../../03-specs/README.md): ADR-0016 the one shared
> `evaluate-expression` evaluator + the `build-render-context` / `collect-inputs`
> consumers; ADR-0018 the **scenario-spec kind** plus the two `da/` create +
> modify scenario fixtures; ADR-0019 the `emit-scaffold-telemetry` dual-stream
> contract. **No `Accepted`→`Proposed` lean remains** — the whole v4 create-flow
> shape now rests on Accepted, immutable decisions (ADR-0017's `with`/`when` and
> the scenario specs' render-var facts on ADR-0016's grammar; the telemetry field
> set on ADR-0016's descriptor). Revisiting any one requires a superseding ADR.
> The cluster is **fully decided**; what remains is implementation against the
> derived specs — and collapsing
> [`scaffolding.create.proposal.md`](../scaffolding.create.proposal.md) into a
> short pointer (the owner's call).

> **External-dependency backlog (ADR-0007 – ADR-0012).** These six record
> decisions forced by external tools (DriveItem resolution, OpenAPI ingestion,
> SPFx, TypeSpec, Kiota, Office Add-in import). They are **decoupled from the v4
> scaffolding selector / routing *shape*** — the in-progress
> [`scaffolding.create.proposal.md`](../scaffolding.create.proposal.md) does not
> depend on any of them, treating each as an opaque named pipeline. They bind
> only when those specific templates' pipelines actually execute, so they stay
> `Proposed` backlog and do not block the v4 create-flow design.

> **`Planned` rows.** None currently — ADR-0014 – ADR-0019 were `Planned`
> placeholders and are now written (`Proposed`). The convention still applies
> for future ADRs: a proposal that names a not-yet-written ADR adds a `Planned`
> row to reserve the number (preventing two branches grabbing the same id) and
> refers to it by **bare id** (e.g. `ADR-0020`), never a markdown link, until
> the body lands via *Adding a new ADR*.

## Adding a new ADR

0. **Reserve the number first.** If a proposal or fact page names a future ADR
   before its body exists, add a `Planned` row to the Index now (taking the
   next free number) and reference it by **bare id** in prose — never a
   markdown link — until the file is committed. This makes the number
   unspendable by another branch and avoids dangling links.
1. Create `ADR-NNNN-<slug>.md` (the reserved or next free number) using the
   template below.
2. Fill in **Status** (`Proposed`), **Date**, **Source**, **Context**, and
   **Options considered**. Leave **Decision** and **Consequences** as
   `(Pending.)` until the decision is made.
3. Flip the Index row from `Planned` to `Proposed` (or add a new row).
4. In the **same PR**, convert every bare-id forward reference to a markdown
   link and link the ADR from the fact page / open question that triggered it.

## Template

Copy everything inside the fenced block into a new `ADR-NNNN-<slug>.md`:

````markdown
# ADR-NNNN — <title>

- **Status:** Proposed
- **Date:** YYYY-MM-DD
- **Source:** <link to the fact page / open question that triggered this ADR>

## Context

What is the problem? Cite the relevant fact page under
[`../external-dependencies/`](../external-dependencies/README.md) — or the
architecture page — that triggered this decision, rather than restating its
content. Some ADRs are forced by external facts; others arise from purely
internal concerns (composition pattern, error model, module boundaries). Both
are valid; name which kind this is. Keep this to the *why* of the decision —
do not describe the current code.

## Options considered

- **A —** …
- **B —** …
- **C —** …

## Decision

(Pending. Filled in when status moves to `Accepted`.)

## Consequences

(Pending. Filled in when status moves to `Accepted`. List any new constraints
this decision introduces; add them to the relevant fact page or architecture
page in the same PR.)
````
