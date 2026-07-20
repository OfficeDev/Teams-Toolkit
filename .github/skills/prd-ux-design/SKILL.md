---
name: prd-ux-design
description: "Use when adding or changing product requirements, scenarios, user flows, surface behavior, or design artifacts before specs or implementation."
argument-hint: "Describe the issue, product request, scenario change, or design question"
---

# PRD + Scenario Design

## When to use this skill

Use this skill when the task is to clarify or change product intent before engineering work begins:

- A PM or designer wants to add or update a PRD.
- A GitHub Issue, ADO Work Item, or chat request changes user-facing behavior.
- A VS Code, CLI, or cross-surface scenario needs design before specs.
- An engineering workflow finds missing, ambiguous, or unapproved PRD/scenario input.

Do not use this skill for specs, tests, code, or implementation. Handoff to engineering only after PRD + scenario artifacts are approved or explicitly confirmed as unchanged.

## Source locations

| Artifact                         | Location                                                                                                                            | Role                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD pages and requirement deltas | `docs/01-product/prd/`                                                                                                              | Markdown-only product intent: problem, users, scope, success criteria, constraints                                                                                                    |
| Scenario directory guide         | [`docs/01-product/scenarios/README.md`](../../../docs/01-product/scenarios/README.md)                                               | Format rules for AI-readable scenario Markdown and human-readable scenario HTML                                                                                                       |
| Scenario HTML components         | [`docs/01-product/_assets/scenario-components/`](../../../docs/01-product/_assets/scenario-components/README.md)                    | Reusable VS Code-style static flow components and icon assets for scenario HTML                                                                                                       |
| Scenario Markdown                | `docs/01-product/scenarios/<group>/<scenario-slug>.md`                                                                              | Concrete user flow: steps, states, edge cases, per-surface notes, inline Mermaid flow, and CLI E2E / VS Code UI test intent                                                           |
| Owner registry                   | [`docs/01-product/owner.md`](../../../docs/01-product/owner.md)                                                                     | PM and Engineer owner lookup for PRD metadata                                                                                                                                         |
| Mermaid flows                    | Inline Mermaid inside the owning scenario Markdown                                                                                  | AI-primary flow source embedded in the scenario contract                                                                                                                              |
| HTML artifacts                   | `docs/01-product/scenarios/<group>/<scenario-slug>.html` with the same basename as the owning Markdown when needed                  | Visual/state reference for humans, AI agents, and engineering; should concretize the Markdown flow and render the Mermaid reference from the owning Markdown; not the behavior source |
| Scenario proposals               | `docs/01-product/scenarios/<group>/<scenario-slug>--<proposal-key>.md`                                                              | Metadata-declared in-review redesign; same Scenario ID as its canonical contract                                                                                                      |
| Generated scenario HTML          | Same-basename `.html` produced by `scenario:render`                                                                                 | Deterministic review projection; never a behavior source or hand-authored artifact                                                                                                    |
| Product review stylesheet        | [`docs/01-product/_assets/product-review/product-review.css`](../../../docs/01-product/_assets/product-review/product-review.css)   | Shared page-level styles for product index and scenario HTML; not a behavior source                                                                                                   |
| Product review index             | [`docs/01-product/scenarios/index.html`](../../../docs/01-product/scenarios/index.html)                                             | Human-facing locator for scenario HTML pages under `docs/01-product/scenarios/`; do not list README or Markdown source files                                                          |
| Product artifact renderer        | [`docs/01-product/_assets/product-artifact-viewer/index.html`](../../../docs/01-product/_assets/product-artifact-viewer/index.html) | Tooling-only renderer for Markdown artifacts; not a product artifact                                                                                                                  |
| Backups                          | `docs/01-product/_backups_/`                                                                                                        | Pre-reorganization source material; not active PRD/scenario contract                                                                                                                  |

PRDs are high-level product documents. Scenarios split PRD intent into concrete flows such as creating, testing, or provisioning a DA. Scenario Markdown, including inline Mermaid, is the AI-primary source for experience behavior and later CLI E2E / VS Code UI test intent. HTML helps humans, AI agents, and engineering review layout, navigation, and visual states, but they must not derive specs, AC rows, tests, or behavior contracts from HTML alone.

Scenario HTML format, region structure, shared flow components, collapsible-section contract, and card-kind vocabulary are defined in [`docs/01-product/scenarios/README.md`](../../../docs/01-product/scenarios/README.md). Follow it as the source of truth — do not duplicate the rules here, and do not invent per-page CSS, scripts, or markup that re-implement behavior the shared scenario components already provide. If a new shared behavior is needed, extend `docs/01-product/_assets/scenario-components/` so every scenario benefits, rather than forking it inline in one page.

The active `docs/01-product/prd/` tree is intentionally Markdown-only. Do not put scenario flow blocks, HTML visual aids, or PRD-local navigation HTML under `prd/`; place scenario artifacts under `docs/01-product/scenarios/` and link them back to PRD requirement IDs.

The product root [`docs/01-product/README.md`](../../../docs/01-product/README.md) is the AI-facing source/context for this workspace. The scenario directory guide [`docs/01-product/scenarios/README.md`](../../../docs/01-product/scenarios/README.md) is the only README under `docs/01-product/scenarios/` and defines the required group classification, Markdown format, and HTML format for scenario artifacts. The only active index-named HTML under this workspace is [`docs/01-product/scenarios/index.html`](../../../docs/01-product/scenarios/index.html), and it links only to human-readable scenario HTML pages.

Documents under `docs/01-product/_backups_/` are not active product contracts. Use them only as source material, and rewrite content into the current PRD or scenario schema before handoff.

## Workflow

### Phase 1 — Intake

Start from the concrete request: PM chat, GitHub Issue, ADO Work Item, or existing PRD/scenario page.

1. Clarify the user's need, trigger, affected persona, expected outcome, and requested review owner.
2. Inspect current PRDs and scenario groups to decide whether the request is already covered, needs a PRD update, needs a scenario update, or needs both.
3. Classify the change: `new PRD`, `PRD update`, `new scenario`, `scenario update`, or `no product design change needed`.
4. Identify PM owner, Engineer owner, affected persona, capability/domain, the workload group defined by the [scenario guide](../../../docs/01-product/scenarios/README.md#directory-groups), and user surface (`VS Code`, `CLI`, both, or neither). Use [`docs/01-product/owner.md`](../../../docs/01-product/owner.md) as the owner lookup, and cross-check package-level engineering owners with [`.github/CODEOWNERS`](../../CODEOWNERS) when useful.
5. Read nearby product context: PRD pages, personas, capabilities, relevant scenarios, architecture constraints, and infrastructure constraints.

### Phase 2 — Ask before guessing

This mirrors **Global behavioral principle #1** in [`.github/copilot-instructions.md`](../../copilot-instructions.md): if the requirement, owner, success criteria, or user flow is unclear, stop and ask specific questions.

- GitHub Issue / ADO: comment with concrete questions and `@owner`.
- Chat: ask the user directly.
- Do not write specs, tests, or code while product or scenario ambiguity remains.

Good questions are answerable and scoped:

- "Is this flow required in VS Code, CLI, or both?"
- "What is the success state the user must see?"
- "Is this error recoverable in the same flow or does the user restart?"
- "Which persona owns the decision: developer, IT admin, or both?"
- "Who is the PM owner and who is the Engineer owner for this PRD?"

### Phase 3 — Draft PRD changes

Create or update Markdown under `docs/01-product/prd/`. Keep the PRD high-level, concise, and traceable:

```markdown
# <Capability or scenario name>

## Metadata

- Status: draft | review | approved | implemented | superseded | archived
- Created: YYYY-MM-DDTHH:mm:ssZ
- Last updated: YYYY-MM-DDTHH:mm:ssZ
- PM owner: <owner-id or @handle from ../owner.md>
- Engineer owner: <owner-id or @handle from ../owner.md>
- Owner source: ../owner.md
- Related request: <GitHub issue, ADO work item, or chat summary>

## Problem

Who has the problem and why it matters.

## Goals

Measurable outcomes the change must enable.

## Non-goals

What this change intentionally does not solve.

## Users and scenario map

Personas, entry points, and links to concrete scenario flows under `../scenarios/<group>/`.

## Requirements

ID-based product requirements (`REQ-01`, `REQ-02`, ...).

## Success metrics

How PM/humans judge the change after release.

## Constraints and risks

Architecture, infrastructure, compliance, platform, or rollout limits.

## Open questions

Unresolved items that block scenario design, specs, or implementation.
```

Metadata rules:

- `Created` and `Last updated` use ISO 8601 UTC timestamps. If exact time is unavailable, use the current date with `T00:00:00Z`.
- Update `Last updated` whenever the PRD content or status changes.
- `PM owner` and `Engineer owner` must resolve to a human or team in `../owner.md`, or to a GitHub handle. Do not approve a PRD with `TBD` owners.
- `Status` tracks the PRD document lifecycle, not test or code state.
- `implemented` means the approved PRD has been delivered by the applicable engineering workflow; use `superseded` or `archived` when the product direction is no longer current.

### Phase 4 — Draft scenario changes

Create or update canonical Markdown under `docs/01-product/scenarios/<group>/<scenario-slug>.md`, or use `scenario:init --proposal <proposal-key>` for a sibling redesign. Keep scenario narrative, flow Mermaid, surface notes, state notes, and validation intent in that one Markdown file.

Before drafting, apply the [Scenario model](../../../docs/01-product/scenarios/README.md#scenario-model) and [legality gates](../../../docs/01-product/scenarios/README.md#scenario-legality-and-approval):

1. Classify the requested artifact as a journey map, a product scenario, or validation intent using the product-owned definitions.
2. Complete the required scenario content and collect the evidence named by the product-owned legality gate.
3. Leave missing evidence as an open question and stop before approval or engineering handoff.

Complete the product-owned [Markdown format](../../../docs/01-product/scenarios/README.md#markdown-format), including its required metadata, user-visible outputs, flow, and validation notes. Do not maintain a second scenario-format checklist in this skill.

Generated visual/state reference:

- Run `npm run scenario:render` from `packages/fx-core`; do not author or patch same-basename HTML manually.
- Review the HTML projection for flow, shared components, current v4 prompt metadata, and Mermaid output, but resolve behavior errors in Markdown or v4 declarations.
- Run `npm run scenario:check` before handoff so generated HTML and index bytes are current.

### Phase 4a — Scenario lifecycle (redesign of a live scenario)

When a shipped scenario needs to change because of a new feature, do not edit the current contract in place. Create a metadata-declared sibling proposal so reviewers can compare it against shipped behavior.

Lifecycle comes only from `Status`: `approved` and `implemented` are Current; `draft` and `review` are In review; `archived` and `superseded` are hidden. Directories do not assign state. Existing `draft/` files are migration inputs only and produce a tooling warning.

The stable `SCN-<ID>` is preserved across draft, live, and archive. The same flow keeps the same scenario ID across redesigns.

Lifecycle metadata fields used in addition to the standard scenario metadata:

| Field               | Appears in                      | Purpose                                                            |
| ------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `Proposal key:`     | Sibling proposal                | Stable suffix used in `<slug>--<proposal-key>.md`.                 |
| `Supersedes:`       | Proposal or historical contract | Path to the contract this version proposes to replace or replaced. |
| `Redesign trigger:` | Sibling proposal                | One-line reason: GitHub issue, ADO work item, or feature name.     |

#### Open a proposal

Trigger: a shipped scenario needs to change because of a new feature.

1. Run `npm run scenario:init -- --group <group> --slug <slug> ... --timestamp <ISO-8601-UTC> --proposal <proposal-key> --redesign-trigger <reason>` from `packages/fx-core`.
2. Preserve the canonical Scenario ID, set `Status: draft`, and link `Supersedes` to the current contract.
3. Leave the current Markdown unchanged; it remains authoritative for shipped code.
4. Run `scenario:render`; metadata adds the proposal to **In review** automatically.

#### Iterate in the proposal

- Treat the current live `<group>/<slug>.{md,html}` as the design baseline. Before editing the draft, re-read the live Markdown and HTML in full and reuse its scenario narrative, shared components, card layout, naming conventions, and state structure. The draft should read as a delta on top of live, not a parallel rewrite.
- Carry over anything that is not being explicitly redesigned: card titles, ordering, copy, asset choices, Mermaid node names, and engine-faithful snippets. Only diverge where the redesign actually requires it, and call out each divergence in the draft narrative or `Redesign trigger:` note so reviewers can diff against live.
- Cross-check sibling drafts in the same group for consistency (for example, a `create-*` draft and an `add-*` draft should share naming, env var, and file-shape conventions). When the redesign changes a convention, apply it to every affected draft in the same PR.
- All authored redesign changes happen inside `<slug>--<proposal-key>.md`; HTML and index changes come only from `scenario:render`.
- Set `Status: review` when ready for review. Standard Phase 5 approval applies, and `scenario:accept` records only reviewed implementation fingerprints.
- The proposal is not the shipped behavior contract. UI and E2E tests for shipped behavior still derive from the current contract until promotion.

#### Promote a proposal

Trigger: the proposal is approved and the implementing change is ready to ship.

1. Rename the old canonical Markdown to a unique historical name without a `--` proposal suffix, for example `<slug>-superseded-<YYYYMMDD>.md`. Set `Status: superseded`, set its same-basename `Visual/state reference`, and set `Supersedes: <slug>.md` to identify the new canonical successor.
2. Move the accepted proposal Markdown to `<group>/<slug>.md`, remove `Proposal key`, `Supersedes`, and `Redesign trigger`, set its `Visual/state reference: <slug>.html`, set `Status: approved` or `implemented`, and refresh `Last updated`.
3. Run `scenario:render` and `scenario:check`. Render creates the renamed historical projection and removes obsolete proposal HTML only when it carries the generated-file marker; do not move or edit HTML manually.

#### Discard a proposal

If the redesign is abandoned, delete its sibling Markdown and rerun `scenario:render`. Render removes the corresponding generated-marker HTML; the current contract and any manual HTML remain untouched.

### Phase 4.5 — Update the human-facing product index

When scenario Markdown or scaffold presentation metadata changes, run `scenario:render` to update [`docs/01-product/scenarios/index.html`](../../../docs/01-product/scenarios/index.html) and same-basename HTML.

The index is for human navigation and review. It should:

- Split entries from metadata into **Current** (`approved`, `implemented`) and **In review** (`draft`, `review`).
- Do not list `archived` or `superseded` artifacts.
- Do not link README files, PRD Markdown, scenario Markdown, backups, or renderer/tooling HTML.
- Label artifact type (`HTML`) clearly.
- Preserve the source distinction: Markdown is the AI-primary behavior source; linked HTML is visual/state reference.
- Exclude renderer/tooling HTML from product artifact navigation.
- Avoid becoming the source of product behavior; behavior remains in Markdown.

### Phase 5 — Human approval gate

Before handoff, summarize the product design delta:

- PRD files changed or confirmed unchanged.
- Scenario files changed or confirmed unchanged, including group path.
- PRD metadata includes status, timestamps, PM owner, and Engineer owner.
- Product root index changed or confirmed unchanged.
- Product artifact renderer changed or confirmed unchanged when preview behavior changes.
- Open questions resolved or still blocking.
- Whether specs and implementation should proceed.

Ask for approval from the human owner. If approval is not available, stop with the open questions and do not hand off to implementation.

#### Rendered review links in the PR body

When opening (or updating) a PR that touches scenario HTML under `docs/01-product/scenarios/`, include side-by-side rendered diff links in the PR body so reviewers can read the design without cloning. Follow [`docs/01-product/_assets/scenario-diff-viewer/README.md`](../../../docs/01-product/_assets/scenario-diff-viewer/README.md) for the URL template — do not duplicate it here.

- One link per scenario HTML changed in the PR (or per draft pair, when a draft is in flight).
- Pick the case from the viewer README: `Evolving draft` (base ref vs PR HEAD) when the file already existed on the base branch; `Brand-new draft` (live sibling vs draft) when the draft file is new in this PR.
- **Pin both sides to immutable refs.** Use the PR HEAD commit SHA for the new side, and either the base commit SHA or a tag for the baseline side. Never pin a review link to `dev`, `main`, or the PR branch name — those move and silently change the diff later.
- Both the viewer page itself and any side that lives only on the PR branch must be served from the PR HEAD SHA (the viewer is committed under `_assets/`).
- Note in the PR body that raw.githack shows an _External Content Notice_ on first visit per browser, and the reviewer must click _Open the page_ once.
- If a scenario HTML is brand-new and has no live sibling and no draft pair to diff against, link the standalone raw.githack preview pinned to the PR HEAD SHA instead of forcing a diff link.

### Phase 6 — Handoff to engineering

When approved, produce a short handoff packet:

```markdown
## PRD/scenario handoff

- Source request: <issue/chat/ADO link or summary>
- PRD artifacts: <links>
- Scenario artifacts: <links including scenario group>
- Scenario IDs: SCN-...
- Human review index: docs/01-product/scenarios/index.html
- PM owner: <owner-id or @handle>
- Engineer owner: <owner-id or @handle>
- PRD status: draft / review / approved / implemented / superseded / archived
- Requirement IDs: REQ-...
- Surfaces: VS Code / CLI / both
- Deferred validation: L2 CLI E2E scenarios, L3 VS Code UI scenarios
- Open questions: none / listed blockers
- Next step: engineering implementation workflow, or listed blocker if not ready
```

Only after this handoff should the engineering workflow generate or update specs, AC tables, tests, and code.

## Quality bar

- PRD states why, who, scope, non-goals, measurable success, constraints, and open questions.
- PRD metadata includes ISO 8601 `Created` and `Last updated` timestamps, PM owner, Engineer owner, owner source, related request, and status.
- PRD owners are resolvable through `docs/01-product/owner.md`, `.github/CODEOWNERS`, or explicit human handles; `TBD` owners block approval.
- Scenario Markdown records behavior and state transitions, not just visuals.
- New or materially changed scenarios satisfy the linked product-owned Scenario model, classification, and legality rules.
- Markdown with inline Mermaid must be sufficient for an AI agent to understand behavior; HTML supplements visual structure and states when present.
- HTML, when present, is concise visual/state reference and cannot be the only source of behavior.
- The product root index links to newly added or renamed human-readable scenario HTML pages only.
- Every unresolved ambiguity is either answered by a human or listed as a blocker.
- No specs, tests, or implementation are changed by this skill unless the user explicitly pivots to the applicable engineering workflow.

## Common mistakes

| Mistake                                                                                                                                   | Fix                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writing implementation details into PRD                                                                                                   | Keep PRD at problem, scope, requirements, and success criteria; defer mechanics to specs.                                                                                                                                                                |
| Treating an HTML mock as the scenario contract                                                                                            | Move behavior into scenario Markdown with inline Mermaid; keep HTML as concise visual/state reference.                                                                                                                                                   |
| Re-implementing scenario HTML presentation per page (inline styles, ad-hoc `<details>` wrappers, hand-written badges, custom card markup) | Author scenario HTML per [`docs/01-product/scenarios/README.md`](../../../docs/01-product/scenarios/README.md) using the shared scenario components and the documented region/card structure. Extend the shared components if something is missing.      |
| Forgetting the product index                                                                                                              | Run `scenario:render`; never hand-maintain artifact arrays.                                                                                                                                                                                              |
| Leaving PRD owners as TBD                                                                                                                 | Resolve PM and Engineer owners through `owner.md`, CODEOWNERS, or a direct human answer before approval.                                                                                                                                                 |
| Forgetting metadata timestamps                                                                                                            | Update `Last updated` and status whenever the PRD changes.                                                                                                                                                                                               |
| Treating `_backups_` as active source                                                                                                     | Rewrite backup content into the current PRD or scenario schema before using it for handoff.                                                                                                                                                              |
| Skipping owner questions because the flow seems obvious                                                                                   | Ask the owner; ambiguous scenario design creates bad AC rows later.                                                                                                                                                                                      |
| Letting PRD/scenario work drift into code                                                                                                 | Stop after approval and hand off to the applicable engineering workflow.                                                                                                                                                                                 |
| Creating AC rows in PRD                                                                                                                   | Use PRD requirement IDs; AC rows belong in operation specs.                                                                                                                                                                                              |
| Editing a current scenario in place when a new feature redesigns its flow                                                                 | Create a `<slug>--<proposal-key>.md` sibling with `Status: draft` (Phase 4a).                                                                                                                                                                            |
| Drafting a redesign without re-reading the current live scenario                                                                          | Read live `<group>/<slug>.{md,html}` first and reuse its narrative, components, copy, and conventions; the draft should be a diff on top of live, not a parallel rewrite.                                                                                |
| Letting sibling drafts in the same group drift from each other                                                                            | Cross-check related drafts (for example `create-*` vs `add-*`) and apply convention changes consistently in the same PR.                                                                                                                                 |
| Describing UI flow without listing user-visible outputs                                                                                   | Add a `## User-visible outputs` section that enumerates every file change, notification, error/recovery message, env/secret write, and external side effect the scenario produces. Without it, reviewers can't tell what the user actually ends up with. |
| Enumerating every template boilerplate file in a scaffolding scenario                                                                     | List only runtime-modified outputs (driven by user answers, drivers, or conditional logic) in detail; collapse stock template boilerplate into a single "plus the standard template files" line.                                                         |
| Naming a file in an earlier step but not saying where later steps write into it                                                           | In the User-visible outputs section, link each file entry back to the step that picks/names it, and identify the specific keys/blocks that get written there.                                                                                            |
| Promoting a proposal without preserving the previous current contract                                                                     | Keep the previous Markdown as a uniquely named `archived` or `superseded` sibling, then render generated artifacts.                                                                                                                                      |
| Editing generated HTML or index arrays                                                                                                    | Change Markdown/status or v4 declarations, then run `scenario:render`.                                                                                                                                                                                   |
| Listing historical HTML in `docs/01-product/scenarios/index.html`                                                                         | Let generated metadata classification hide `archived` and `superseded` artifacts.                                                                                                                                                                        |
| Opening a scenario-touching PR without rendered review links                                                                              | Add side-by-side diff links to the PR body per [`docs/01-product/_assets/scenario-diff-viewer/README.md`](../../../docs/01-product/_assets/scenario-diff-viewer/README.md), one per changed scenario HTML or draft pair.                                 |
| Pinning the rendered review link to a branch name (`dev`, `main`, the PR branch)                                                          | Pin both sides to immutable refs — the PR HEAD commit SHA for the new side, and a commit SHA or tag for the baseline — so the diff stays stable as branches advance.                                                                                     |

## Last todo of every PRD/scenario turn

For every scenario Markdown or bound v4 declaration changed in this turn, `scenario:render` has regenerated HTML and index data, and `scenario:check` has passed without errors.
