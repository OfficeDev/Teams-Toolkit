# Operation — `resolve-build-target`

- **Status:** Accepted (Decision source ADR-0014 Accepted 2026-06-05; amended per ADR-0014 Amendments 1–3, 2026-06-15) — ready for tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Decision source:** [ADR-0014](../../../02-architecture/adr/ADR-0014-dispatcher-buildtarget-resolution.md)
  (Amendment 2 — a single `walk` source; `language` is no longer a route axis,
  it moves to [`collect-create-inputs`](collect-create-inputs.md) as the Q0
  `language` question (ADR-0016 decision 5) against
  [ADR-0016](../../../02-architecture/adr/ADR-0016-declarative-template-format.md)
  `descriptor.languages`)
- **Seam:** [`scaffolding.create.proposal.md` §9](../../../02-architecture/scaffolding.create.proposal.md), §5.1, §5.3
- **PRD/scenario:** none required — internal routing mechanism with no
  user-visible surface change; the user-visible question trees it walks are
  owned by `selector.json` (Q1) and the surface, not by this operation.

## Purpose

Resolve a user/caller create entry into a **`BuildTarget = { templateId,
engine, answers? }`** before any template is opened or rendered, and dispatch
that `templateId` to the world (`v4` or `surface-action`) that handles it.
Legacy v3 generator routes and the v3 core-method exception are no longer part
of the closed engine set (ADR-0014 Amendments 3 and 5).

Route resolution produces a **`templateId` only** (plus the walked dimension
`answers`); `language` is **not** resolved here — it is the Q0 `language`
question (ADR-0016 decision 5) owned by [`collect-create-inputs`](collect-create-inputs.md),
filled *after* a `templateId` (hence a `descriptor`) is in hand. This is the
single front stage that replaces v3's `templateNames.ts` + `question/create.ts`
+ `onDidSelection` + the CLI `actionTemplateMap` short-circuit (proposal §9).

## Inputs

| Input | Type | Origin |
|-------|------|--------|
| `selector` | the per-kind `selector.json` (Q1 routing table + route predicates) | templates package (`templates/v4/<kind>/selector.json`) |
| `prefilled` | `Record<string, string>`, optional | Q1-dimension answers known up front (CLI flags / `atk add` / CodeLens seed); a pre-filled dimension is used as-is, never prompted |
| `interactive` | `boolean` | whether an un-pre-filled dimension may be prompted (`false` ⇒ a missing required dimension is a `UserError`) |
| `port` | narrow resolver port (`{ prompt, featureFlag, v4Registry }`) | injected; `prompt` adapts Q1 into the shared question-walk face, and `v4Registry` is the route-matching face; an in-memory fake in tests |

There is a **single source** — the prefill-aware `walk`. A caller that already
knows a dimension simply pre-fills it (`atk add` / CodeLens / a CLI batch are
fully pre-filled, `interactive=false`); there is no separate `direct`
templateId entry (ADR-0014 Amendment 2).

The operation declares only the narrow faces it actually uses
(interface-segregation). The Q1 answer walk adapts selector dimensions into
normalized `QuestionSpec[]` and invokes the shared [`collect-inputs`](collect-inputs.md)
engine with `appendLanguage=false`; route matching uses the route registries
below. It does **not** depend on the full `ScaffoldRuntime` (ADR-0018), and in
particular it does **not** open the template package (ADR-0015
`open-template-package`) and **never** reads `descriptor.languages` — that read
belongs to the Q0 `language` question in [`collect-create-inputs`](collect-create-inputs.md).

| Port face | Shape | Responsibility |
|-----------|-------|----------------|
| `prompt` | `(question) => Promise<answer>` | the interactive (un-pre-filled) Q1 dimension prompts |
| `featureFlag` | `(name) => boolean` | evaluate `featureFlag(...)` in route predicates (e.g. `TEAMSFX_MCP_FOR_DA_DT`) |
| `v4Registry` | `(templateId) => boolean` | membership test (derived from `templates/v4/<kind>/*` descriptors, §5.3) |

## Outputs

A `BuildTarget` plus the dispatch decision:

| Field | Meaning |
|-------|---------|
| `templateId` | the resolved `<kind>/<id>` (v4), or the `action` id for a `surface-action` route |
| `engine` | `v4 \| surface-action` — the selector's closed engine value |
| `answers` | the dimension answers the walk collected (pre-filled + prompted); consumed downstream by v4 Q2 entry params and the gate for the Q0 `language` question; absent for a `surface-action` route that scaffolds nothing |

## Resolution shape

```
resolveBuildTarget(selector, prefilled, interactive) → { templateId, engine, answers }
  walk — prefill-aware Q1: per gated question, a pre-filled answer is used as-is,
         else (interactive) prompted, else a missing-dimension UserError; the
         collected answers → §5.3 route predicate → templateId
         (fully pre-filled + interactive=false = the non-interactive batch)
         — never reads descriptor.languages; never resolves a language

dispatch(templateId) → engine                     // keys off templateId ONLY
  v4 registry → v4 world | surface-action → surface command
  else → explicit UserError (no silent fallback)
```

`language` is **not** resolved here. After a `templateId` (and its `descriptor`)
is in hand, [`collect-create-inputs`](collect-create-inputs.md) runs the Q0
`language` question (ADR-0016 decision 5 — options `descriptor.languages`,
`skipSingleOption`) through the **same** prefill-aware walk primitive.

## Acceptance Criteria

| ID | Tier | Given | When | Then |
|----|------|-------|------|------|
| AC-01 | L1 | the prefill-aware walk (interactive, no pre-fill); the selector Q1 walk + §5.3 predicate select `da/mcp-server` | resolve | `templateId="da/mcp-server"`, `engine="v4"`; route resolution reads **no** `descriptor.languages` and resolves **no** language |
| AC-03 | L1 | the walk, `interactive=false`, `prefilled` carrying the MCP dimensions (`projectType=copilot-agent-type`, `daTemplate=add-action`, `actionSource=mcp`) | resolve | the **same** §5.3 predicate the interactive walk ends in derives the templateId; **no** prompt is issued |
| AC-03a | L1 | the `walk` source, `interactive=true`, `prefilled` carrying `projectType=copilot-agent-type` only | resolve | `projectType` is **not** prompted (used from pre-fill); the remaining gated dimensions (`daTemplate`, …) **are** prompted |
| AC-03b | L1 | the `walk` source, `interactive=false`, `prefilled` missing a required gated dimension (e.g. no `daTemplate` for `projectType=copilot-agent-type`) | resolve | an explicit `UserError` naming the missing dimension; **no** prompt, **no** `no-matching-route` coercion |
| AC-04 | L1 | a route whose predicate is `featureFlag('TEAMSFX_MCP_FOR_DA_DT')` and the flag is **on** | resolve | resolves the v4 route `da/mcp-server` (`engine=v4`) |
| AC-05 | L1 | the same create MCP routing context with `TEAMSFX_MCP_FOR_DA_DT` **off** | resolve | resolves the non-DT static route (`engine=v4`, `templateId="da/mcp-server-static"`), **not** the dynamic MCP id |
| AC-06 | L1 | a matched route with `engine=v4` | dispatch | hands off to the v4 world (`engine=v4`); the dispatch decision does **not** branch on language — language is `collect-create-inputs`' Q0 (ADR-0014 Amendment 2) |
| AC-07 | L1 | legacy `engine=v3` generator route | parse / dispatch | **withdrawn** — v3 generator routes are no longer in the closed selector engine set; `parseSelectorSpec` rejects them as malformed selector JSON (AC-20) |
| AC-08 | L1 | a modify route naming `coreMethod="addPlugin"` | dispatch | **withdrawn** — `v3-core-method` is no longer in the closed engine set; such a route is rejected at parse (AC-23) |
| AC-09 | L1 | a route with `engine=surface-action` naming an `action` | dispatch | `engine=surface-action`; **nothing** is scaffolded; the action id is returned for the surface to run |
| AC-09a | L1 | a route with `engine=surface-action`, plus pre-filled answers for a downstream selector dimension whose `condition` is false | resolve | the skipped dimension is not carried in `answers`; Q1 answer output contains only dimensions reached by the walk |
| AC-10 | L1 | a matched route naming an unknown `coreMethod` | dispatch | **withdrawn** with AC-08; "no silent fallback" for an unmatched route is INV-6, locked by the no-matching-route error |
| AC-11 | L1 | a `selector.json` route missing the engine-specific required key (`engine=v4` with no `templateId`, or `engine=surface-action` with no `action`) | load | the loader rejects it (invariant 12); the other branch's key present on the same route is also rejected |
| AC-12 | L1 | a v4 route whose `templateId` has **no** `templates/v4/<kind>/<id>/descriptor.json` | build | build failure (invariant 17 — routing is descriptor-derived, not hand-listed) |
| AC-17 | L1 | identical `selector`, `prefilled`, registries, and feature-flag state | resolve twice | both return the identical `{ templateId, engine, answers }` |
| AC-18 | L1 | `atk new` (walk, no pre-fill) and `atk add` (walk, the dimensions pre-filled) reaching the **same** `templateId` | resolve | the dispatch hand-off (`templateId`, `engine`) is identical; both carry the same dimension `answers` (one prompted, one pre-filled) — there is no separate `direct` path |
| AC-19 | L1 | a raw `selector.json` whose `questions` carry presentation fields (`type` / `title` / `staticOptions` / `keyPrefix`) and `routes` carry `engine` + its key | parse (`parseSelectorSpec`) | a `SelectorSpec` keeping **only** `{ name, condition? }` per question (the `condition` kept verbatim as the `ExpressionNode`) and `{ when, engine, templateId? / action? / surfaces? }` per route; the result drives `resolveBuildTarget` unchanged — presentation is the surface's concern, not this operation's (INV-3) |
| AC-20 | L1 | a malformed raw `selector.json` — not an object, `questions` / `routes` not arrays, a question without a string `name`, or a route without a string `when` / a non-closed-set `engine` | parse | an explicit `UserError` (no crash, no `as` coercion); engine-key **completeness** (e.g. `engine=v4` with no `templateId`) is left to the load gate AC-11, not the parser |
| AC-21 | L1 | the **real shipped** `templates/v4/create/selector.json`, parsed, the `walk` source (`interactive=false`) with the MCP dimension answers (`projectType=copilot-agent-type`, `daTemplate=add-action`, `actionSource=mcp`) | parse + resolve | with `TEAMSFX_MCP_FOR_DA_DT` **on** → `{ engine=v4, templateId="da/mcp-server" }`; **off** → `{ engine=v4, templateId="da/mcp-server-static" }`; a sibling dimension (`projectType=graph-connector-type`) → its `{ engine=v4, templateId="graph-connector" }` route — a regression lock on the shipped routing table (the template id is selected by the v4 selector, not a hand-coded check) |
| AC-22 | L1 | the bundled-floor channel `templates.zip` bytes, where the create selector lives at the `v4/create/selector.json` zip entry | open (`openCreateSelector`) | the parsed `SelectorSpec` (structure delegated to `parseSelectorSpec`, AC-19); bytes that are not a valid archive → `SystemError`; a floor missing the `v4/create/selector.json` entry → `SystemError`; an entry that is not valid JSON → `SystemError` (packaging faults, not user-fixable) |
| AC-23 | L1 | a raw `selector.json` route with `engine="v3-core-method"` | parse | an explicit `UserError` — the closed engine set is `{ v4, surface-action }`, so a v4→v3 dispatch hand-off is not authorable (ADR-0014 Amendment 5). A leftover `coreMethod` key is no longer a route key: it is dropped like any other non-routing field (AC-19), and `selector.schema.json`'s `additionalProperties: false` rejects it at authoring time |

> **Withdrawn by ADR-0014 Amendment 2:** AC-02 (the `direct` source) and
> AC-13 – AC-16a (the in-resolver `language` / `bindLanguage` axis). The
> `direct` source is gone (every entry is a pre-filled walk) and `language`
> moved to [`collect-create-inputs`](collect-create-inputs.md); their behavior
> is re-specified there. IDs are kept stable (the gaps are intentional) so
> surviving AC→test links stay unbroken.

## Flow

```mermaid
flowchart TD
  start([resolve-build-target]) --> q1["prefill-aware Q1 walk\n(pre-filled ⇒ skip · interactive ⇒ prompt · else ⇒ missing-dimension error)"]
  q1 --> pred["§5.3 route predicate"]
  pred --> tid["templateId + answers"]

  tid --> disp{dispatch — templateId only}
  disp -->|v4 registry| v4[engine = v4]
  disp -->|surface-action route| sa[engine = surface-action]
  disp -->|unknown| errU([UserError: unknown templateId])

  v4 --> bt["BuildTarget { templateId, engine, answers }"]
  sa --> done([dispatch result])
  bt --> done
```

## Boundary

This operation does **not**:

- Open, parse, or render template content. It resolves *which template* runs,
  not *what is inside the package* — that is ADR-0015 `open-template-package` and
  the render/pipeline operations.
- Ask Q2 (template-local) questions, **or resolve `language`**. By the time this
  operation returns, the template is chosen; Q2 and the descriptor-bound
  `programming-language` question run in [`collect-create-inputs`](collect-create-inputs.md),
  in the world dispatch handed off to.
- Read `descriptor.languages` at all. Route resolution and dispatch are
  language-free; the Q0 `language` question (options
  `descriptor.languages`, `skipSingleOption`) belongs to
  [`collect-create-inputs`](collect-create-inputs.md), after a
  `templateId`/`descriptor` is in hand (ADR-0014 Amendment 2).
- Decide the v4/surface-action **registries' contents**. v4 is
  descriptor-derived (§5.3); this operation only tests membership.
- Run the v4 pipeline or the surface action. It returns the dispatch value;
  execution or rejection is the caller's concern.

## Invariants

- **INV-1 — Route resolution yields `templateId` only.** `resolveBuildTarget`
  never reads `descriptor.languages` and never returns a language; `dispatch`
  keys off `templateId` alone and never branches on language (ADR-0014
  Decision 1).
- **INV-2 — Language is not a route axis.** `resolveBuildTarget` resolves no
  `language`; the Q0 `language` question (options
  `descriptor.languages`, `skipSingleOption`, ADR-0016 decision 5) lives in
  [`collect-create-inputs`](collect-create-inputs.md), after a `descriptor` is
  in hand (ADR-0014 Amendment 2).
- **INV-3 — One route evaluator, one walk, one source.** The walk ends in the
  §5.3 route predicate whether each dimension was pre-filled or prompted
  (interactive, partial pre-fill, and the non-interactive batch are one code
  path); there is a **single** source — no `direct` entry — and no second
  (CLI-side) routing table (proposal §9, deletes `actionTemplateMap`).
- **INV-4 — Closed engine set, exclusive keys.** Every route's `engine ∈
  { v4, surface-action }` carries exactly its own required key and not the
  other's (invariant 12). `engine="v3"` and `engine="v3-core-method"` are not
  valid after the v4 migration (ADR-0014 Amendments 3 and 5).
- **INV-5 — v4 routing is descriptor-derived.** Every v4 route id resolves to an
  existing `templates/v4/<kind>/<id>/descriptor.json`, checked at build
  (invariant 17).
- **INV-6 — No silent fallback.** An unknown `templateId` is an explicit
  `UserError`, never a coerced best-effort.
- **INV-7 — Determinism.** Given identical `selector`, `prefilled`, registries,
  and feature-flag state, the resolved `{ templateId, engine, answers }` is a
  pure function of them.
- **INV-8 — v4-owned seam.** This operation lives in the v4 world; it can
  dispatch only to a v4 package or a surface action, and adds no v3 hand-off
  path of any kind.

## Notes

- The `language` axis is no longer resolved here (ADR-0014 Amendment 2). It is
  the Q0 `language` question in
  [`collect-create-inputs`](collect-create-inputs.md) — options
  `descriptor.languages`, `skipSingleOption`, the same missing-dimension rule —
  bound against
  [ADR-0016](../../../02-architecture/adr/ADR-0016-declarative-template-format.md)
  decision 5.
- The dispatch half (AC-06 – AC-12) and the route-resolution half (AC-01 –
  AC-05) are specified in one operation because they share the `templateId`
  hand-off; an implementation may still split them into two functions behind the
  one port.
- The `selector` input arrives as raw `selector.json`; the load face
  `parseSelectorSpec` (AC-19, AC-20) projects it onto the `SelectorSpec` this
  operation consumes — dropping the questions' presentation fields and keeping
  each route's `when` + closed-set `engine` + that engine's own key. Engine-key
  *completeness* (invariant 12) stays with the load gate AC-11 inside
  `resolveBuildTarget`, so the parser and the resolver compose without
  duplicating that check.
- A Q1 selector question is **single-select**: it presents a closed
  `staticOptions` set and routes to exactly one template, so `selector.schema.json`
  pins `type` to `singleSelect` at authoring time. The other input kinds (`text` /
  `confirm` / `singleFile` / `folder` / `singleFileOrText` / `multiSelect`) are Q2
  (template) or general-input concerns, not routing dimensions — and the Q1 walk
  (`parseSelectorPresentation`) only renders `staticOptions` picks. The runtime
  parser needs no guard for this: `parseSelectorSpec` already drops `type`
  (AC-19, presentation is the surface's concern).
- `openCreateSelector` (AC-22) is the full-package sibling of
  `parseSelectorSpec`: it reads the `v4/create/selector.json` entry from a
  channel `templates.zip` and hands the parsed JSON to `parseSelectorSpec`.
  Production staged-snapshot callers may instead pass the standalone
  `create-selector.json` artifact to `openSelectorFromJsonBytes`. Zip-read faults
  (corrupt archive, missing entry, non-JSON) are `SystemError`s (packaging
  faults), while structural validity stays `parseSelectorSpec`'s contract
  (AC-20). It is v4-owned (INV-7) — the selector read lets the create front door
  route through the shipped selector with no hand-coded template-id table.
