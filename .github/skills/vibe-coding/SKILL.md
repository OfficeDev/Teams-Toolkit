---
name: vibe-coding
description: "End-to-end workflow for agent-driven changes that add or modify behavior in the toolkit packages. Use when: adding or changing a behavior (anything that warrants an Acceptance Criteria row); refactoring toward a structural shape governed by ADRs in `docs/02-architecture/`; changing v4 scaffolding architecture, removing duplicate Q1/Q2/Q3 logic, extracting shared engines, or moving logic into providers/validators/steps; adding a behavior-changing CLI or VS Code action. Codifies the design-first → tests-from-AC → implement → verify → self-review → docs-when-needed cycle that keeps contributions safe to merge."
argument-hint: "Describe the behavior change or structural-shape work"
---

# Vibe Coding

## When to use this skill

Use this skill when the change is **non-trivial AND meets at least one of these conditions** — the workflow is the same whether a human or an AI agent (Copilot, Claude Code, Cursor, etc.) is doing the work:

- It adds, changes, or removes user-observable behavior — anything that warrants an Acceptance Criteria row.
- It touches structural shape governed by ADRs in [`docs/02-architecture/`](../../../docs/02-architecture/README.md) (composition pattern, error model, input validation, registries, context propagation, etc.).

"Vibe coding" in this codebase means **agent-driven implementation with hard safety gates**, never throwaway sandbox work.

Don't use this skill for:

- **Pure maintenance** — a bug fix that keeps the existing shape (changes a value, not a contract), an internal refactor with no behavior or shape change, or a localization tweak. Follow `.github/copilot-instructions.md` and the per-package conventions under `.github/instructions/`.
- **Trivial changes** — typo fixes, dependency bumps, lint cleanup, or doc-only edits. Go straight to PR.

This skill inherits the **Global behavioral principles** in [`.github/copilot-instructions.md`](../../copilot-instructions.md) (think before coding, simplicity first, surgical changes, goal-driven execution). The gates below operationalize them for behavior-changing work; do not repeat the principles, follow them.

## What this skill enforces

Structural rules live in [`docs/02-architecture/`](../../../docs/02-architecture/README.md) (and any ADRs there). Behavioral contracts live in [`docs/03-specs/`](../../../docs/03-specs/README.md). The workflow below ties them to per-PR discipline.

The non-negotiable gates per PR:

1. **Requirements first** — start from a GitHub Issue, ADO Work Item, chat request, or [`prd-ux-design`](../prd-ux-design/SKILL.md) handoff; confirm approved PRD + scenario artifacts exist before specs. If PRD or scenario work is needed, complete `prd-ux-design` first.
2. **Spec first after requirements are clear** — Operation Spec / Domain Spec / ADR / data-model entity in [`docs/03-specs/`](../../../docs/03-specs/README.md) written or located **before** any code is touched.
3. **Tests next** — every required test is derived 1:1 from the spec's `## Acceptance Criteria` table and includes the AC ID in its name (`it("AC-01: ...")`). Each AC row is tagged with its runtime tier (L1 / L2 / L3), purpose tier, gate, and harness; L2 CLI E2E and L3 VS Code UI tests are documented but not hard PR gates yet unless the touched behavior is the surface itself. For the purpose axis (operation-integration / scenario / compatibility / file-unit / surface), see [ADR-0013](../../../docs/02-architecture/adr/ADR-0013-test-tiering-and-coverage-gate.md) and the [test-tiers section](../../../docs/03-specs/README.md).
4. **Architectural and per-package rules followed** — implementation respects the ADRs in [`docs/02-architecture/`](../../../docs/02-architecture/README.md) and the matching files under [`.github/instructions/`](../../instructions/) for every path touched. Specifics (composition pattern, error model, input validation, registries, context propagation) live in those documents, not in this skill.
5. **Changed user-visible workflows have scenario coverage** — a new template, lifecycle flow, migration path, CLI command behavior, VS Code command behavior, or other feature workflow has a Scenario Spec and a scenario-tier test for every required L1 AC row; L2/L3 surface coverage is documented and becomes a required gate when the changed behavior is the surface itself.
6. **Lint clean, format clean, coverage gate green.** "Coverage green" means every Acceptance-Criteria row has its owning AC-derived test (operation-integration, scenario, or compatibility), complex pure logic may add optional file-unit tests, and every thin adapter / glue / barrel is covered by one real integration test **or** carries a justified `/* istanbul ignore next -- <reason> */`. The numeric line floor is a backstop, not the definition of done — see [ADR-0013](../../../docs/02-architecture/adr/ADR-0013-test-tiering-and-coverage-gate.md) and the [test-tiers section](../../../docs/03-specs/README.md). Mock-heavy micro-units added solely to lift a file's line % are a review red flag.
7. **Conventional Commits** (`feat(<scope>):`, `fix(<scope>):` where `<scope>` is the package or domain touched, e.g. `feat(fx-core):`, `fix(cli):`).
8. **Downstream docs that describe shape** (template registry, driver catalogue, CLI surface) updated **in the same PR** when shape changes.

A PR that bypasses any of these is rejected — by CI or by review.

## Workflow

### Phase -1 — Intake and requirement confirmation

Start from a GitHub Issue, ADO Work Item, or chat request.

1. **Classify**: `feature` / `bug` / `chore`.
2. **Identify owner and domain**: find the human owner and which capability domain this touches (see [`docs/03-specs/`](../../../docs/03-specs/README.md) for the domain layer).
3. **Read product context**: PRD pages in `docs/01-product/prd/`, scenario flows in [`docs/01-product/scenarios/`](../../../docs/01-product/scenarios/README.md), and architecture constraints under [`docs/02-architecture/`](../../../docs/02-architecture/README.md) (including external-dependency fact pages under [`docs/02-architecture/external-dependencies/`](../../../docs/02-architecture/external-dependencies/README.md)).
4. **Check approval state**: if PRD or scenario artifacts are missing, ambiguous, or materially changing, stop and use [`prd-ux-design`](../prd-ux-design/SKILL.md). Continue here only with approved PRD + scenario artifacts or an explicit note that no PRD/scenario change is needed.
5. **Summarize requirement input**: cite the approved PRD + scenario artifacts or the no-change decision before moving to specs.

### Phase 0 — PRD + scenario handoff validation

For product or interaction changes, validate the approved PRD under `docs/01-product/prd/` and the scenario under `docs/01-product/scenarios/<group>/<scenario>.md` before writing specs. Do not perform full PRD/scenario design in this skill; use [`prd-ux-design`](../prd-ux-design/SKILL.md) for that work.

| Surface | Scenario artifact format | Current test gate |
|---|---|---|
| VS Code UX | Markdown scenario + inline Mermaid flow as the AI-primary behavior source; companion HTML mock/state artifact as visual/state reference for humans, AI agents, and engineering | L3 UI tests are documented but not required yet |
| CLI | Markdown scenario + inline Mermaid flow | CLI E2E tests are documented as L2 but not required yet |

For AI agents and engineering implementation, Markdown and Mermaid are the authoritative behavior inputs. Companion scenario HTML should also be reviewed for visual structure and UI states, but do not derive specs, AC rows, or tests from HTML alone.

If the PRD or scenario change is material and not already approved, stop and hand off to `prd-ux-design`. The output of this phase is either:

- Approved PRD + scenario artifacts under `docs/01-product/prd/` and `docs/01-product/scenarios/`.
- A short note that existing PRD + scenario design already covers the request.

### Phase 1 — Design first (spec)

For any non-trivial change, locate or write the spec **after requirements are clear and before writing tests or code**. Specs are the authoritative behavioral contracts that tests are derived from.

**Start here:** [`docs/03-specs/README.md`](../../../docs/03-specs/README.md) — defines the layer hierarchy (PRD → Scenario → Domain Spec → Operation Spec → Tests → Code) and spec formats.

#### Spec location

| Change kind | Where the spec lives |
|-------------|---------------------|
| New / changed Operation, driver, or lifecycle stage | `docs/03-specs/operations/<domain>/<operation>.md` (see [`docs/03-specs/`](../../../docs/03-specs/README.md)) |
| New / changed user-visible workflow | `docs/03-specs/scenarios/<group>/<slug>.md` (feature workflow; scaffold template is one subtype) |
| New Domain or domain boundary change | `docs/03-specs/domains/<nn>-<domain>.md` (see [`docs/03-specs/`](../../../docs/03-specs/README.md)) |
| Architectural decision | New ADR under [`docs/02-architecture/`](../../../docs/02-architecture/README.md) (see that folder for the ADR convention) |
| New / changed data contract or entity | `docs/03-specs/data-model/entities/` (see [`docs/03-specs/`](../../../docs/03-specs/README.md)) |
| New CLI surface, command group, flow | Scenario under [`docs/01-product/scenarios/`](../../../docs/01-product/scenarios/README.md); confirm via [`prd-ux-design`](../prd-ux-design/SKILL.md) |
| New Template (any kind) | `.dev/templates.json` (machine registry, when present) |

> Terminology: **Capability** (PM word) and **Domain** (engineering word) refer to the same concept; **Operation** is an atomic engine action belonging to a Domain; **Template** composes Operations into a shippable starting point. See [`docs/03-specs/README.md`](../../../docs/03-specs/README.md) for the full glossary.

#### What a spec must contain before any test or code is written

For an operation spec, all of these sections must be complete:
- `## Acceptance Criteria` — ID-based table, each row maps to one test case (no rows = blocked).
- `## Flow` — Mermaid flow or sequence diagram for stateful, cross-step, or user-visible behavior changes.
- `## Boundary` — explicit list of what this operation does NOT do.
- `## Invariants` — constraints that must never be violated.

**AI gap discovery:** Attempt to complete the spec. Where sections cannot be filled,
output specific questions rather than guessing:
> "Cannot complete AC table because:
>  1. Should an unreachable MCP server fail immediately or retry? How many times?
>  2. Is adding the same action URL twice an error or idempotent?"

Blocked spec = upstream ambiguity. Do not proceed to tests or code. Surface to PM → update PRD first.

**Two human gates before any test or code is written:**
1. **Gate 1 — Answer AI questions**: resolve all ambiguities surfaced during spec drafting.
2. **Gate 2 — Approve AC table**: review each row; scenario clear? expected result correct?

Only after Gate 2 approval does AI generate tests and implement.

For an agent: treat `## Acceptance Criteria` rows as the test plan, `## Boundary` + `## Invariants` as hard constraints on implementation scope.

### Phase 2 — Confirm design inputs

Design from approved PRD + scenarios + existing ADRs. Do **not** copy structural
shape from existing implementation code as the basis for new design — re-derive
shape from requirements and ADRs. Reading existing code in `packages/fx-core/`,
`packages/cli/`, etc. for context is fine; mirroring its structure into a new
module is a code-review red flag. Ask: *"What product requirement justifies
this shape, independent of how the current code happens to do it?"*

If no ADR yet exists for the structural question at hand, stop and open one
under [`docs/02-architecture/`](../../../docs/02-architecture/README.md) rather
than inventing a per-feature answer. ADRs are the place to commit a structural
decision; this skill only enforces that decisions get made there.

### Phase 3 — Tests from AC and Flow (before any implementation)

Tests are derived **directly** from the approved AC table and any approved `## Flow` diagram. They are written **before** implementation and fail first. Test names must include the AC ID so reviewers can trace test ↔ spec:

```typescript
// AC-01: valid inputs → success
it("AC-01: returns clientId and objectId on success", ...)

// AC-03: name > 120 chars → UserError
it("AC-03: returns UserError(AadAppNameTooLong) when name exceeds limit", ...)
```

**Each AC row in the spec carries a Runtime, Purpose, Gate, and Harness**:

- **L1 — Engine** (unit + integration; per-PR, fast). Within L1, integration is weighted over unit for lifecycle code.
- **L2 — E2E** (real CLI against real M365 + Azure). **Documented but not a hard PR gate yet.**
- **L3 — UI** (VS Code wizard / command palette / webview flows). **Documented but not a hard PR gate yet.**

Purpose and harness decide what the test protects and how it runs. Use the
smallest harness that can falsify the AC: operation port, in-memory workflow,
temp dir, driver fake, CLI command harness, VS Code command harness, Playwright,
or compatibility diff harness. Compatibility AC rows are required whenever the
spec promises v3/v4, old/new, or migration parity.

The ADRs that formalize the tiering and the inverted lifecycle test pyramid live under [`docs/02-architecture/`](../../../docs/02-architecture/README.md) as they land.

Map from what you'll implement to what test it needs:

| What you'll implement | Required test(s) | Tier |
|---|---|---|
| Pure function (no I/O) | Unit test (`tests/unit/<area>/`) | L1 (unit) |
| Engine action with side effects (operation, driver, lifecycle stage) | Integration test exercising full pipeline (`tests/integration/`) — mock only outermost HTTP | L1 (integration) |
| New or changed feature workflow | Scenario-tier integration test asserting observable workflow outcomes | L1 (scenario) |
| New Template added to the template registry | Scenario-tier scaffold test; document L2 CLI matrix case if applicable | L1 (scenario); L2 documented |
| Compatibility or migration promise | Normalized old/new or v3/v4 diff test | L1/L2 (compatibility) |
| New CLI action | CLI integration test; document L2 E2E scenario if it writes resources | L1/L2, depending on boundary |
| New VS Code command / wizard | Handler or command-level test; document L3 UI scenario if user-visible | L1 command; L3 documented |

A unit test that only re-mocks what an integration test already covers is a delete signal.

**At end of this phase**, every L1 AC row maps to a unit or integration test, every required test is failing for the expected reason, and no implementation file has been touched yet. L2 CLI E2E and L3 VS Code UI cases may be documented without being implemented in this PR.

### Phase 4 — Implement to pass tests

Write the minimal code that turns the failing tests green. Follow:

- The ADRs in [`docs/02-architecture/`](../../../docs/02-architecture/README.md)
  for structural rules (composition pattern, error model, input validation,
  registries, context propagation, file size, etc.).
- The matching file under [`.github/instructions/`](../../instructions/) when one
  applies to a path you touch (the toolkit auto-loads these by `applyTo`
  pattern).
- The cross-cutting rules in
  [`.github/copilot-instructions.md`](../../copilot-instructions.md).

When a design contradicts an accepted ADR, the design changes, not the ADR. If
an ADR is wrong, supersede it first via a new ADR; don't quietly diverge in
code. If no ADR exists for the question at hand, escalate per Phase 2 rather
than inventing a per-feature answer.

### Phase 5 — Verify gates (mechanical)

Before claiming done, run the full local gate:

```bash
# In the package you touched, e.g. packages/fx-core or packages/cli:
npm run build              # tsc + postbuild (eslint --fix + prettier --write)
npm run test:unit          # unit tests with NYC coverage
npm run test:integration   # integration tests
npm run lint               # 0 errors required
npm run format:check       # CI gate
```

For a change that registers a new template, run the relevant CLI E2E when the environment and credentials are available:

```bash
cd packages/cli
npm run test:e2e -- --grep "<your-template-id>"
```

Unit and integration gates must be green; do not proceed to Phase 6 with a red L1 gate. L2 CLI E2E and L3 VS Code UI failures are tracked but do not block the PR while those gates are still deferred.

For local E2E runs, M365 + Azure credentials must be configured in the developer's environment; see the test setup notes in the touched package's README.

### Phase 6 — Self-review (judgement)

Mechanical gates do not catch quality. Before claiming done, audit the diff against:

1. **ADRs in [`docs/02-architecture/`](../../../docs/02-architecture/README.md)** — every new file/function must respect them. Common slips show up in file size, in module-scoped runtime state, and in error-handling shape.
2. **Matching `.github/instructions/*`** — for each touched file path, the instruction file whose `applyTo` matches should be re-checked. Common slips: copyright header missing, `as` cast snuck in, raw user-facing string instead of `getLocalizedString`, secret not masked.
3. **The Anti-patterns list at the bottom of this skill** — flag any match and fix before PR.
4. **Single source of truth / no transient-doc rot** — if the diff added or touched a doc: (a) it must not restate a fact that already has an owner elsewhere — link to the owner instead; (b) any time-bound page it added (a `*.current-state.md`, an ADR-decomposition proposal) must carry an `Expires-when:` header naming the ADRs whose all-`Accepted` state retires it. See the conventions in [`docs/02-architecture/`](../../../docs/02-architecture/README.md).

Output of this phase is either "all checks pass" or a list of concrete fixes → loop back to Phase 3.

### Phase 7 — Downstream docs (conditional)

If the change altered something a downstream doc describes — template registry, driver catalogue, CLI surface, package layout, error catalogue, feature flag, conventions — update those docs in the same PR. The Phase 0 spec is upstream; it precedes code and was already correct.

If the spec from Phase 0 turned out to need clarification mid-implementation, fix it now and explain why in the PR description. The PR must contain both the code change and the doc change. PRs that ship code without doc updates are rejected at review.

### Phase 8 — PR

Conventional Commits format (commitlint enforces):

```
feat(fx-core): add <thing> operation
fix(cli): handle <case> in provision action
docs(architecture): add ADR-NNNN for <decision>
```

PR description must reference the design page or ADR.

CODEOWNERS will auto-assign reviewers. Reviewers will check:

- ✅ Spec exists in `docs/03-specs/` and is referenced in the PR.
- ✅ Tests carry AC IDs and trace 1:1 to AC rows.
- ✅ Integration test exists for any new engine action with side effects (operation, driver, lifecycle stage).
- ✅ Scenario-tier test exists for every changed user-visible workflow AC; scaffold templates are covered as workflow scenarios, not a special exception.
- ✅ Compatibility diff test exists for any migration, v3/v4, or old/new parity promise.
- ✅ Surface smoke is documented for changed CLI / VS Code behavior and required when the surface behavior itself changed.
- ✅ ADRs in [`docs/02-architecture/`](../../../docs/02-architecture/README.md) and matching `.github/instructions/*` followed for every path touched.
- ✅ Lint / format / coverage gates green.
- ✅ Downstream docs updated where the drift checklist required.

## Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| "I copied this shape from `fx-core/...`" | Used existing code as design input | Stop. Re-derive shape from PRD + spec + ADRs. |
| Wrote implementation in Phase 4 before any test was failing | Skipped Phase 3 ordering | Revert; write the failing AC tests first, then re-implement. |
| Test passes locally, fails in CI | Probably a `process.env` race or async cleanup gap | Run `tests/integration/` locally; check for missing `await`. |
| Reviewer says "no docs change" | Skipped Phase 7 | Add the doc update to this PR; don't open a follow-up. |
| File is much larger than peers in the same folder | Per-file readability rule (in `docs/02-architecture/`) violated | Refactor — split per-feature concerns. Reviewer will request this. |

## Anti-patterns to flag in self-review

- A new engine action with side effects but no integration test — required.
- A changed user-visible workflow without a Scenario Spec and scenario-tier test.
- A new template in the template registry without a scenario-tier scaffold test.
- A migration promise without a normalized compatibility diff test.
- A test name without an AC ID prefix — required if the test maps to a spec.
- A "TODO: add tests later" comment — not allowed; tests are written in Phase 3.
- A "TODO: add docs later" comment — not allowed; this is the doc-PR.
- Use of `console.log` — use the package's logger.
- Throwing for an expected failure — return a `Result`-typed error per the package convention.
- Catching `unknown` and silently swallowing — preserve via `innerError` or equivalent.
- A vague error name like `Error` or `Failed` — name it for the failure mode (telemetry partition key).
- Anything that contradicts an accepted ADR under [`docs/02-architecture/`](../../../docs/02-architecture/README.md) without first superseding that ADR.

## See also

- [`prd-ux-design` skill](../prd-ux-design/SKILL.md) — PRD and scenario design that precedes this workflow
- [`docs/02-architecture/`](../../../docs/02-architecture/README.md) — architecture scope and ADRs
- [`docs/03-specs/`](../../../docs/03-specs/README.md) — spec layer hierarchy, glossary, required sections
