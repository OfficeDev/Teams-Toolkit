# Specs

Authoritative behavioral contract layer for the Microsoft 365 Agents Toolkit.
Tests are derived 1:1 from spec acceptance-criteria rows; implementation is
written to make those tests green.

## Layer hierarchy

```
PRD (docs/01-product/prd/)
  └─ Scenario (docs/01-product/scenarios/<group>/)         ← user journey, engine-neutral
      ├─ Domain Spec (docs/03-specs/domains/<nn>-<domain>.md)
      │   └─ Operation Spec (docs/03-specs/operations/<domain>/<operation>.md)
      │       └─ Acceptance Criteria table   ← horizontal: one atomic action, template-agnostic
      │           └─ Tests (1:1 with AC rows, name carries AC-ID)
      │               └─ Code (implementation makes failing tests green)
      └─ Scenario Spec (docs/03-specs/scenarios/<group>/<slug>.md)
          └─ Acceptance Criteria table   ← vertical: one feature workflow, composes Operations
              └─ Tests (scenario tier; assert observable workflow outcomes)
```

Architectural decisions that span multiple specs live as ADRs under
[`docs/02-architecture/`](../02-architecture/README.md). Data contracts and
entities are defined inline in the owning operation spec's inputs/outputs tables;
a consumer links to the owner rather than restating the shape (single source of
truth without a separate entity layer).

## Spec kinds

| Kind | Path pattern | Purpose |
|------|--------------|---------|
| Domain Spec | `domains/<nn>-<domain>.md` | Boundary, vocabulary, and rules for one of the capability domains. |
| Operation Spec | `operations/<domain>/<operation>.md` | One atomic engine action: inputs, outputs, AC table, flow, boundary, invariants. **Horizontal** — template-agnostic. |
| Scenario Spec | `scenarios/<group>/<slug>.md` | One user-visible feature workflow end-to-end: the concrete observable outcomes a workflow produces, as AC rows that **compose** Operation Specs (referenced, never restated). **Vertical** — per workflow. Drives scenario-tier (ADR-0018 T3) tests. Scaffold templates are one scenario subtype, not the whole category. |

## Required sections in an Operation Spec

An operation spec is **complete** (eligible for tests/code) only when all of these
sections are filled:

- `## Acceptance Criteria` — ID-based table; one row per testable behavior.
- `## Flow` — Mermaid diagram for stateful or cross-step behavior.
- `## Boundary` — what the operation does NOT do.
- `## Invariants` — constraints that must never be violated.

If a section cannot be completed because of upstream ambiguity, stop and surface
the gap as a question to PM rather than guessing. See the
[`vibe-coding`](../../.github/skills/vibe-coding/SKILL.md) skill for the full
spec → tests → code gate.

## Required sections in a Scenario Spec

A scenario spec is the *vertical* counterpart to an operation spec: it pins what
**one user-visible workflow** produces end-to-end. It is **complete** only when
all of these are filled:

- header metadata — `Status`, `Domain`, the product `Scenario ID` (`SCN-…`) it
  mirrors, and the feature workflow identity it validates (for scaffolding this
  includes the **template id**).
- `## Acceptance Criteria` — one row per concrete, workflow-specific observable
  outcome. Each row carries an AC ID, runtime tier (`L1`/`L2`/`L3`), purpose
  tier, gate, and harness.
- `## Composed operations` — the Operation Specs this scenario flows through,
  **linked, not restated**. This is the anti-duplication boundary: mechanism
  lives in the operation spec; only workflow-specific facts live here.
- `## Flow` — Mermaid for the end-to-end workflow (may reference the product
  scenario's flow rather than redraw it).
- `## Boundary` — what this scenario does NOT assert (every cross-workflow
  mechanism, which belongs to the composed operation specs).

Recommended AC table shape:

| ID | Runtime | Purpose | Gate | Harness | Given | When | Then |
|---|---|---|---|---|---|---|---|
| SCN-EXAMPLE-01 | L1 | scenario | required | InMemoryRuntime | workflow-specific state | workflow runs | observable outcome is produced |
| SCN-EXAMPLE-02 | L2 | CLI-E2E | smoke | cli-matrix | same inputs through CLI | command runs | surface result matches the normalized L1 oracle |
| SCN-EXAMPLE-03 | L3 | UI | deferred | vscode-command | same flow through VS Code | command completes | surface result matches the normalized L1 oracle |

## Operation Spec vs Scenario Spec — orthogonal cuts, not duplication

Two spec kinds carry AC tables, on **perpendicular axes** — keeping them separate
is what stops one from restating the other:

- An **Operation Spec** is *horizontal*: one atomic engine action
  (`resolve-template-source`, `run-scaffold-pipeline`), **template-agnostic**,
  exercised by every template that flows through it. Its AC protect the action's
  contract.
- A **Scenario Spec** is *vertical*: one user-visible workflow **end-to-end**
  (for example, the `da/mcp-server` create scenario), composing those operations
  and pinning the **concrete** outcomes *that* workflow produces (generated
  scaffold artifacts, provisioned env state, publish request shape, migration
  before/after diff, or final surface result). Its AC protect the workflow's
  output.

They never restate each other: a scenario spec **references** the operation specs
it composes and adds only the workflow-specific facts no operation spec knows.
The two axes feed two test tiers — operation AC → operation-integration tests
(per action); scenario AC → scenario-tier tests (per workflow, ADR-0018 T3).

## Test tiers — what each protects

Two independent axes describe a test. Keep them separate
([ADR-0013](../02-architecture/adr/ADR-0013-test-tiering-and-coverage-gate.md)).

**Runtime axis (L1/L2/L3)** — where it runs and how fast. Each AC row is tagged
with one:

- **L1** — in-memory through an injected port (`ScaffoldRuntime`, or an
  operation's port); no real fs / network / process. **Both**
  `operation-integration` **and** `scenario` (ADR-0018 T3) run here.
- **L2** — CLI E2E. Documented now; not yet a hard PR gate.
- **L3** — VS Code UI. Documented now; not yet a hard PR gate.

**Purpose axis — what the test protects.** This is what decides whether an
uncovered line needs a test at all. Two tiers are **AC-derived** but on
**perpendicular cuts** — `operation-integration` is *horizontal* (one atomic
action, from an Operation Spec) and `scenario` is *vertical* (one template
end-to-end, from a Scenario Spec) — so they are named separately and never
collapsed into a single "integration" bucket. The surface tier is **not**
AC-derived from this folder; it sources from a **product** scenario:

| Purpose tier | Cut / source | Protects | Runtime | When to write it |
|---|---|---|---|---|
| **operation-integration** (AC-derived) | *horizontal* — an Operation Spec AC row | one atomic-action behavior, run through the operation's port with in-memory fakes | L1 | **Always** — one per AC row; test name carries the AC ID. The primary protected tier. |
| **scenario** (AC-derived, ADR-0018 T3) | *vertical* — a Scenario Spec AC row | one whole feature workflow end-to-end through the smallest faithful harness; asserts observable workflow outcomes. **Composes** the operations, never restates them | **L1** (engine-through, *not* a real surface) | **Always** — one per scenario AC row. |
| **compatibility** (AC-derived when migration promises exist) | old/new or v3/v4 comparison | migration promises and intentional behavior differences, expressed as a normalized diff | L1/L2 | Required when the spec promises backward compatibility, migration parity, or intentional old/new divergence. |
| **file-unit** (pure) | not AC-derived | an intricate pure module's internal logic (parser, semver/range, digest) | L1 | **Optional** — only when the logic is genuinely complex. Never to chase a line number. |
| **CLI-E2E / UI** (surface) | a **product** scenario ([`01-product/scenarios`](../01-product/scenarios/)) | cross-surface behavior — the CLI flag tree, the VS Code Quick Pick / input / CodeLens | L2 / L3 | Documented now, progressively gated later. Highest project value. Traces to the product scenario, **not** a `03-specs` AC row. |

Common scenario harnesses:

| Harness | Use for |
|---|---|
| `InMemoryRuntime` | Scaffold, manifest mutation, input collection, and pure engine workflows. |
| `TempDirRuntime` | Real filesystem layout, path behavior, generated project shape, and file permissions. |
| `DriverFakeRuntime` | Provision, deploy, publish, and lifecycle flows where only the outermost service APIs are faked. |
| `CliCommandHarness` / `cli-matrix` | CLI parser, non-interactive validation, exit code, help text, and surface compatibility. |
| `VsCodeCommandHarness` | VS Code command handlers, Quick Pick/input adapters, and command-to-engine wiring. |
| `PlaywrightHarness` | Small UI or webview smoke paths where command-level tests cannot observe the behavior. |
| `CompatibilityDiffHarness` | v3/v4, old/new, or migration before/after normalized diffs. |

Use the smallest harness that can falsify the AC. Escalate from L1 to L2/L3
only when the AC explicitly protects a real surface or migration boundary.

**Decision rule for an uncovered line:**

- Uncovered **behavior** → add its AC-derived test: an **operation** AC row
  (atomic action) or a **scenario** AC row (template output), whichever owns it.
- Uncovered **complex pure logic** → optionally add a file-unit test.
- Uncovered **thin adapter / glue / barrel** → cover it with *one* real
  integration test across the real boundary (temp dir; stub only at the network
  edge), **or** exclude it with `/* istanbul ignore next -- <reason> */`
  carrying a one-line reason. Never back-fill with mock-heavy micro-units whose
  only purpose is to lift a file's line %.

The coverage floor is a backstop, not the definition of done. "Done" is: every
AC row has its AC-derived test (operation-integration or scenario), and every
excluded line carries a justified ignore.

## Glossary (authoritative for this repo)

- **Capability** — PM word for a feature area users perceive.
- **Domain** — engineering word for the same area; one domain spec per domain.
- **Operation** — one atomic engine action belonging to a domain.
- **Template** — composes Operations into a shippable starting point.
- **Driver** — implementation primitive used by Operations to interact with
  external systems (clouds, services, files). Its shape is governed by
  [`docs/02-architecture/`](../02-architecture/README.md).

## Status

This folder is being populated. Until per-domain and per-operation specs land, the
spec format above is the contract; treat the
[`vibe-coding`](../../.github/skills/vibe-coding/SKILL.md) skill as the operating
workflow.
