# ADR-0014 — Dispatcher + BuildTarget resolution as the scaffolding front stage

- **Status:** Accepted (Amended 2026-07-08 — see Amendments 1–4)
- **Date:** 2026-05-28 (Accepted 2026-06-05; Amended 2026-06-15;
  Amended 2026-07-02; Amended 2026-07-08)
- **Source:** [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into)
  (decomposes §§5, 5.1, 5.3, 9, 9.1, 10; invariants 12, 17). Validated against
  the on-disk `templates/v4/create/selector.json` and
  `templates/v4/modify/selector.json` plus `templates/v4/schema/selector.schema.json`.

## Context

This is an **internal** decision (composition pattern + module boundary), not
one forced by an external tool. The v3 create flow resolves "which starter,
which language, which generator" through `templateNames.ts` +
`question/create.ts` + per-capability `generator/*.ts` + `onDidSelection`
branches — routing is code, scattered, and an AI agent editing it can reach the
engine by accident (`scaffolding.current-state.md`).

The proposal's §§5/9 replace that with a single **front stage** that resolves a
**BuildTarget** (`{ templateId, language? }`) before any generator runs, fed by
a per-kind declarative `selector.json`. The two shipped selectors
(`create/selector.json`, `modify/selector.json`) are the ground truth this ADR
ratifies: routing is data under [`selector.schema.json`](../../../templates/v4/schema/selector.schema.json),
and now routes to v4 or surface actions. Both the v3 generator coexistence
branch and the retained `v3-core-method` exception have ended (Amendments 3
and 5).

## Options considered

- **A — Keep code-based routing (`templateNames` + `onDidSelection`).** Zero
  migration, but the current-state pain (engine-reachable-by-accident,
  untestable routing) persists and AI edits stay unsafe.
- **B — One global selector tree for both create and modify.** Fewer files, but
  conflates two disjoint `templateId` namespaces and breaks the per-kind
  overlap check; modify's increment tree and create's project-type tree have no
  shared root.
- **C — Per-kind declarative `selector.json` resolving a BuildTarget, v4 route
  engines plus the retained core-method exception (chosen).** Routing is data;
  each kind owns its tree; the engine carries no per-option side-effect `if`.

## Decision

1. **The dispatcher front stage resolves a `templateId` — and only a
   `templateId`** — from three sources (§9): (A) an interactive `selector.json`
   route, (B) an external direct `templateId` (`atk add action
   --api-plugin-type mcp`, CodeLens), (C) a non-interactive batch-flag route
   fed to the same §5.3 route predicate. **(Amended 2026-06-15 — Amendment 1:
   sources A and C are unified into one prefill-aware `walk` source. Amendment 2:
   source B (`direct`) is also withdrawn — `atk add` / CodeLens / modify are
   pre-filled walks over the kind's `selector.json` — leaving a single `walk`
   source; the route predicate and the `templateId`-only output are unchanged.)**
  **`dispatch` keys off `templateId` only** — it never reads `descriptor.languages` and never branches on
  language (the engine choice is a function of `templateId` alone).

  `language` is **not** part of route resolution or `BuildTarget`. It is
  resolved after the template is chosen, as the Q0 `language` question
  (ADR-0016 decision 5) in the collect-inputs walk; `resolveBuildTarget` no
  longer reads `descriptor.languages` and binds no language axis. The resulting
  `BuildTarget = { templateId, engine, answers }` feeds the rest of the v4 flow
  (Q2 → pipeline), which is identical regardless of source.

2. **Each `selector.json` route declares its `engine`** — the closed set is
   `{ v4, surface-action }` (invariant 12, `selector.schema.json`):
   - `v4` → load `templates/v4/<kind>/<templateId>/{descriptor,questions,pipeline}`
     and run the v4 path (e.g. `da/mcp-server`).
   - `surface-action` → scaffolds nothing; names an `action` the surface maps to
     a command (the declarative form of today's `start-with-github-copilot`
     special case).

3. **v4 routing is descriptor-derived** (§5.1, §10). Neither the v3 generator
  registry nor a v3 core-method allow-list is part of selector dispatch; v4
  routing is **descriptor-derived** (§5.3) — the create selector's routable
  v4 ids are exactly the `templates/v4/create/*` descriptors, not a
  hand-maintained index. New or migrated behavior lands as v4 template data,
  providers, validators, or pipeline steps, not as a v3 route.

4. **CLI keeps back-compat aliases** (§9.1): **Amended 2026-06-15 — Amendment 2.**
  With the `direct` source gone, the `--template-id` primitive is withdrawn;
  the CLI's primary v4 flag vocabulary is the neutral dimension flags derived
  from `selector.json` (`derive-cli-options`), and `--capability` / `--language`
  remain as aliases onto those dimensions so existing scripts keep working.

## Consequences

- **New constraint (invariant 12):** every `routes[].engine` must be one of the
  two values, with the engine-specific required key present (`templateId` /
  `action`) and the other branch's key forbidden. Enforced by
  `selector.schema.json` + a loader check. `engine:"v3"`, `engine:"v3-core-method"`,
  and `v3Adapter` are no longer valid selector authoring surface.
- **New constraint (invariant 17):** v4 routing ids must resolve to an existing
  `templates/v4/<kind>/<id>/descriptor.json`; a route to a missing descriptor is
  a build failure (routing is derived, not hand-listed).
- **Per-kind overlap check:** `create/` and `modify/` each own a
  `selector.json`; the §5 enumerable-route overlap check runs per-kind over
  disjoint `templateId` namespaces.
- **Shares one hand-off with [ADR-0006](ADR-0006-template-distribution-channel.md)**
  (`(package-source, package-version)` + `descriptor.minEngineVersion`) and one
  with [ADR-0015](ADR-0015-templates-version-artifact-shape.md) (the
  `templateId → on-disk package` locator). It does **not** decide the
  distribution channel.
- **Conformance fixtures:** the shipped create and modify selectors lock the
  route-engine set and source model; future changes should update the derived
  specs and selector fixtures together.

## Derived specs

- [`resolve-build-target`](../../03-specs/operations/scaffolding/resolve-build-target.md)
  — the operation spec that turns this decision into an AC-tabled behavioral
  contract (route resolution → `templateId`, dispatch; **per Amendment 2 the
  `language` axis moved to
  [`collect-create-inputs`](../../03-specs/operations/scaffolding/collect-create-inputs.md)**,
  the Q0 `language` question bound against
  [ADR-0016](ADR-0016-declarative-template-format.md) decision 5).

## Amendment 1 — Unify the interactive + non-interactive sources (2026-06-15)

- **Status:** Accepted (in-place amendment; the Decision above is otherwise
  unchanged).
- **Scope:** Decision 1's *source model* only. `dispatch` keying off
  `templateId` (Decision 1), the closed `engine` set (Decision 2), v3/v4
  coexistence (Decision 3), the CLI back-compat aliases (Decision 4), and the
  descriptor-bound `language` axis are all untouched.

### Why

The original three sources split the *interactive* walk (A) and the
*non-interactive* batch (C) into two code paths even though both end in the
identical §5.3 route predicate. The "a pre-filled answer is used as-is, never
prompted" rule already governs Q2 ([`collect-create-inputs`](../../03-specs/operations/scaffolding/collect-create-inputs.md)
INPUT-12) and the v3 question visitor; modeling A and C as two sources just
duplicated that rule at Q1.

### Decision

`resolveBuildTarget` takes **one** source:

- **`walk`** — the prefill-aware Q1 walk. For each gated question (its
  `condition` evaluated over the answers collected so far): a **pre-filled**
  answer is used as-is and the prompt is skipped; otherwise, when
  **interactive**, the answer is prompted; otherwise (**non-interactive**, no
  pre-fill) it is an explicit `UserError` naming the missing required dimension
  (never a silent `no-matching-route`). The old interactive source is `walk`
  with no pre-fill; the old batch source is `walk` with the dimension flags
  pre-filled and `interactive=false`.
There is no `direct` resolver source after Amendment 2. A caller-supplied preset
`templateId` is a create/modify front-door short-circuit: the front door resolves
that id to a `BuildTarget` without walking Q1, but this does not add another
route source inside `resolveBuildTarget`.

The `language` axis is not part of route resolution. It is resolved after the
template is chosen, as the Q0 `language` question in `collect-create-inputs`,
with the same prompt / non-interactive error behavior owned by `collect-inputs`.

### CLI vocabulary

The pre-fill keys are the selector's own neutral dimension names (`projectType`
/ `daTemplate` / `actionSource` / …). The CLI's primary flags are derived from
`selector.json` (the new
[`derive-cli-options`](../../03-specs/operations/scaffolding/derive-cli-options.md)
spec), and the Decision 4 `--capability` / `--language` aliases resolve onto
those neutral dimensions. There is still no second (CLI-side) routing table.

### Derived-spec impact

[`resolve-build-target`](../../03-specs/operations/scaffolding/resolve-build-target.md)
(the `ResolveEntry` shape, the `walk` AC rows, INV-3),
[`walk-create-selector`](../../03-specs/operations/scaffolding/walk-create-selector.md)
(the `prefilled` + `interactive` inputs and the missing-dimension AC), and the
new `derive-cli-options` realize this amendment. No other ADR-0014 consequence
changes.

## Amendment 2 — Collapse to a single `walk` source; `language` moves to collect-inputs (2026-06-15)

- **Status:** Accepted (in-place amendment; supersedes the `direct` source
  retained in Amendment 1 and the dispatcher-bound `language` axis in Decision 1).
- **Scope:** Decision 1's *source model* and *`language` placement* only.
  Dispatch keying off `templateId` (Decision 1), the closed `engine` set
  (Decision 2), and the then-current coexistence model (Decision 3) are
  superseded by Amendment 3. Decision 4's `--template-id` primitive is withdrawn
  (it was the CLI face of the removed `direct` source); its `--capability` /
  `--language` aliases and the neutral dimension flags (`derive-cli-options`)
  remain.

### Why

Amendment 1 reduced three sources to two (`walk` + `direct`). The remaining
`direct` source — a caller handing a bare `templateId` — has **no live
producer**: every realistic entry (create, `atk add`, CodeLens, modify) holds
**dimensions**, not a `templateId`, and the per-kind `selector.json` routes
those dimensions to the `templateId`. The two shipped selectors prove it —
`create/selector.json` and `modify/selector.json` each carry the kind's
dimension tree (e.g. modify's `addCapability` → `actionSource` → `add-mcp-server`).
`atk add action --api-plugin-type mcp` is therefore a **pre-filled walk over the
modify selector**, not a `direct` `templateId`. The only literal-`templateId`
entry was CLI `--template-id`, which `derive-cli-options` removes in favour of
neutral dimension flags.

Symmetrically, `language` was resolved **inside** `resolveBuildTarget` (the
post-dispatch language bind) even though Decision 1 already declared it
descriptor-bound and free to resolve "anywhere in the window … past Q2." Its
legal values are exactly `descriptor.languages` — i.e. it is the **options
source for the Q0 `language` question** collect-inputs already owns (ADR-0016
decision 5, INPUT-13; auto-skipped when that lists a single language — both MCP
scenarios are `["common"]`). Resolving it at Q1 forced `resolveBuildTarget` to
read `descriptorLanguages` and own a prompt that is really collect-inputs' job.

### Decision

`resolveBuildTarget` takes **one** source, not two:

- **`walk`** (the only source) — the prefill-aware Q1 walk over the kind's
  `selector.json` (create / modify), exactly as Amendment 1 defines it. It
  outputs `{ templateId, engine }` plus the walked dimension `answers`; a caller
  that already knows the answer simply pre-fills the dimensions (used-as-is,
  never prompted) — the one mechanism for `atk add` / CodeLens / a CLI batch.
  There is no `direct` entry and no registry-only dispatch path; the route
  declares the `engine`. (A future API that truly holds a bare `templateId` can
  dispatch by registry in a thin helper *outside* `resolveBuildTarget`, never as
  a second entry into it.)

- **`language` moves to collect-inputs.** It is no longer a `BuildTarget` field.
  After routing yields a `templateId`, the chosen package's
  `descriptor.languages` is the option range of the Q0 `language` question
  (ADR-0016 decision 5) in the collect-inputs walk — pre-filled
  (`--language` / caller) ⇒ used as-is and bounds-checked, single-language ⇒
  auto-skipped, multi-language interactive ⇒ prompted, multi-language
  non-interactive without a value ⇒ the same missing-dimension `UserError` the
  walk raises for any required dimension. `BuildTarget` is now
  `{ templateId, engine, answers? }`; the scaffolder reads `language` from the
  collected answers.

The resolver is now a pure router, and exactly **one** prefill-aware question-walk
engine is shared by Q1 (selector) and Q2+common-floor create inputs. Q1 adapts
selector dimensions into the shared walk, then evaluates route predicates to
produce `BuildTarget`. Create inputs adapt the resolved template's
`questions.json`, descriptor-bound `language`, and common floor (`folder` /
`app-name`) into one shared walk. The walk engine owns prompting, prefilled
answers, back/cancel, non-interactive missing values, option filtering,
`skipSingleOption`, validation, and answer merge. The validator registry is the
same registry for Q1 and Q2+common-floor callers; Q1 currently uses closed
single-select selector dimensions, but it does not get a Q1-only validation
path. The walk engine owns no `BuildTarget`, scaffold, template render, or v3/v4
routing decision.

### Derived-spec impact

[`resolve-build-target`](../../03-specs/operations/scaffolding/resolve-build-target.md)
(drop the `direct` half of `ResolveEntry` → a single walk input; remove the
`language` / language-bind AC rows and the `descriptorLanguages` port face),
[`collect-create-inputs`](../../03-specs/operations/scaffolding/collect-create-inputs.md)
(owns the template-local Q2 + common create floor walk, including the Q0
`language` question — ADR-0016 decision 5 — that now binds the whole language
axis: options from `descriptor.languages`, `skipSingleOption`, the
missing-dimension rule),
[`walk-create-selector`](../../03-specs/operations/scaffolding/walk-create-selector.md)
(the same walk now also drives `modify`), and
[`derive-cli-options`](../../03-specs/operations/scaffolding/derive-cli-options.md)
(the `--template-id` primitive is gone; the language flag stays the generic
`programming-language` option, DCO-03). No other ADR-0014 consequence changes.

## Amendment 3 — Remove legacy v3 generator dispatch (2026-07-02)

- **Status:** Accepted (in-place amendment; supersedes the v3 generator branch
  in Decision 2 and the migration-era coexistence wording in Decision 3).
- **Scope:** Closed engine set and selector route key shape. The single `walk`
  source and descriptor-bound `language` placement from Amendment 2 are
  unchanged.

### Why

V4 scaffolding has formally migrated. Keeping `engine:"v3"` in the selector
closed set made the v4 front door carry a dead rejection path and encouraged new
logic to be modeled as a v3 fallback instead of v4 template data, providers,
validators, or pipeline steps.

### Decision

The selector engine set is now `{ v4, v3-core-method, surface-action }`.
`engine:"v3"` and `v3Adapter` are removed from `selector.schema.json`,
`DispatchEngine`, `SelectorRoute`, and the build-target resolver port. The
retained `v3-core-method` branch remains the explicit modify exception and is
still resolved through a frozen allow-list.

### Derived-spec impact

[`resolve-build-target`](../../03-specs/operations/scaffolding/resolve-build-target.md)
removes the v3 generator registry and withdraws AC-07. The parse/load contract
rejects legacy `engine:"v3"` routes as malformed selector JSON. Create dispatch
withdraws the v3-generator rejection AC rows because such `BuildTarget`s are no
longer representable; `engine:"v3-core-method"` remains an unsupported create
target.

## Amendment 4 — Cross-phase back navigation as a front-door re-entry loop (2026-07-08)

- **Status:** Accepted (in-place amendment; additive — no prior decision is
  superseded).
- **Scope:** How back navigation composes across the Q1 → dispatch → Q2 phase
  boundary. The single `walk` source, the closed `engine` set, descriptor-bound
  `language`, and `templateId`-only dispatch are all unchanged.

### Why

Q1 (`walk-create-selector`) and Q2+common-floor (`collect-create-inputs`) are
two separate runs of the one shared question-walk engine, glued by this
dispatcher: Q1 resolves a `BuildTarget`, then dispatch runs Q2 for the resolved
template. Each phase already has *internal* back (collect-inputs INV-8), but a
`back` at Q2's **first** prompt had nowhere to go — the first prompt showed no
Back button (step 1) and a forced back cancelled the whole create. Users expect
one continuous wizard: from Q2's first question, `back` should return to Q1's
last dimension and let them re-pick, potentially selecting a **different**
template whose Q2+Q3 differ.

The original deferral cited the shared v3 `traverse`; that reason is now moot —
the create selector routes are all `engine:"v4"` (Amendment 3), so every create
Q2 is the v4 engine this project owns. The only real question is how a changed
Q1 pick loads a different template's Q2+Q3 without a stale-state hazard.

### Decision

1. **A front-door re-entry loop.** With `TEAMSFX_V4_ENABLED` on, the
   `engine:"v4"` path is a loop: run Q1 (retaining its `history` +
   `promptCount`), dispatch, run Q2+floor with `baseStep = promptCount` (so Q2's
   first prompt continues Q1's numbering and shows a Back button) and
   `backable`, and on a Q2-first `back` re-enter Q1 at its last dimension via its
   retained history. `back` past Q1's first dimension cancels the whole create
   (`BuildTargetWalkCancelled`).

2. **Q1 history is retained; Q2+Q3 are stateless-rebuilt per forward crossing.**
   The loop retains only the **Q1** walk history (so Q1 back is multi-level and
   continuous across re-entry). Q2+Q3 are re-derived from the resolved
   `BuildTarget` on every forward crossing — a different `templateId` re-opens
   that template's `questions.json` + `descriptor` (its `optionsSchema`,
   `languages`) and rebuilds the question set from scratch. The loop keeps **no**
   Q2 answer cache, so "different Q1 pick → different Q2+Q3" needs no
   invalidation logic: the stale template's answers are simply not carried.

3. **All back logic stays in the one shared engine.** The engine
   (`collect-inputs`) gains a `baseStep` offset, a `backable` typed
   `{ kind:"back" }` outcome, and a resumable `history` (in/out) — no surface or
   this dispatcher owns a parallel back-stack. The front door only ferries the
   opaque Q1 `history` between phases (v4-scaffolding "one walk engine").

### Consequences

- **New constraint:** the re-entry loop is scoped **below** the
  preset-`template-name` short-circuit (Amendment 1 / INV-8), so a prior
  iteration's `inputs["template-name"]` never re-triggers the preset path and
  skips Q1. Preset resolution stays a one-shot, non-looping front-door entry.
- The legacy `collectInputs(...)` entry stays a thin wrapper over the resumable
  engine, so the existing collect-inputs contract (INPUT-01..19, INV-8) is
  byte-for-byte unchanged; only new callers opt into `baseStep` / `backable` /
  `resume`.
- Whole behavior is behind `TEAMSFX_V4_ENABLED` (default off); flag-off is the
  unchanged v3 pass-through.

### Derived-spec impact

[`collect-inputs`](../../03-specs/operations/scaffolding/collect-inputs.md)
(INPUT-20..22, INV-9 — the resumable walk primitive),
[`collect-create-inputs`](../../03-specs/operations/scaffolding/collect-create-inputs.md)
(CCI-25/26, INV-11 — threading + stateless Q2+Q3 rebuild),
[`walk-create-selector`](../../03-specs/operations/scaffolding/walk-create-selector.md)
(WCS-24/25, INV-6 — Q1 resume + `history`/`promptCount` output), and
[`dispatch-create-by-engine`](../../03-specs/operations/scaffolding/dispatch-create-by-engine.md)
(DCE-22..25, INV-10 — the re-entry loop) realize this amendment. No other
ADR-0014 consequence changes.

## Amendment 5 — Remove the retained `v3-core-method` dispatch exception (2026-07-30)

- **Status:** Accepted (in-place amendment; supersedes the retained
  `v3-core-method` branch in Decision 2 and Decision 3, and the closed-set
  wording in Amendment 3).
- **Scope:** Closed engine set and selector route key shape. The single `walk`
  source, descriptor-bound `language`, `templateId`-only dispatch, and the
  cross-phase back loop are unchanged.

### Why

`v3-core-method` was kept as the modify exception for `core.addPlugin`. The
shipped `modify/selector.json` now routes the MCP add-action path straight to
the authored `modify/add-mcp-server` v4 package, so neither shipped selector
carries a `v3-core-method` route, and both front doors already answer that
engine with an unsupported-engine error. Keeping the value in the closed set
left a dead branch in the resolver, the parser, the schema, and two front doors,
and — the reason this matters — kept "route it back to a v3 core method"
*representable*, which is exactly the escape hatch new behavior should not have.

The v4→v3 dispatch fallback is removed at the type level rather than at the
route level: what cannot be expressed cannot be reintroduced by authoring.

### Decision

The selector engine set is now `{ v4, surface-action }`. `coreMethod`,
`engine:"v3-core-method"`, and the `v3CoreMethodRegistry` port face are removed
from `selector.schema.json`, `DispatchEngine`, `SelectorRoute`,
`RouteResolverPort`, and both front doors' dispatch switches.

This narrows the closed set only. It does **not** remove the flag-off
`TEAMSFX_V4_ENABLED` pass-through to `createProject`, which is the rollout
opt-out (dispatch-create-by-engine INV-1), nor the separate v3 entries that
never reach a selector (`createProjectFromTdp`, sample creation).

### Derived-spec impact

[`resolve-build-target`](../../03-specs/operations/scaffolding/resolve-build-target.md)
drops the core-method registry from its port, withdraws AC-08 and AC-10, and
adds AC-23 locking that a `v3-core-method` engine is rejected at parse, and that
a leftover `coreMethod` key is no longer a route key.
[`dispatch-create-by-engine`](../../03-specs/operations/scaffolding/dispatch-create-by-engine.md)
and [`walk-create-selector`](../../03-specs/operations/scaffolding/walk-create-selector.md)
drop the create-side rejection wording, since such a `BuildTarget` is no longer
representable.
