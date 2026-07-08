# ADR-0016 — Declarative descriptor + questions + replaceMap format

- **Status:** Accepted
- **Date:** 2026-05-28 (Accepted 2026-06-08)
- **Source:** [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into)
  (decomposes §§3, 3.1, 3.1.0, 3.1.2, 3.2, 3.5, 4, 4.2, 4.3, 6; invariants 1–4,
  8–11). Validated against `v4/create/da/mcp-server/{descriptor,questions}.json`,
  `v4/modify/add-mcp-server/{descriptor,questions}.json`, and
  `v4/schema/{descriptor,question}.schema.json`.

## Context

This is an **internal** decision: it defines the *authored surface* an AI agent
or human edits to add a starter, and the closed grammar that keeps that surface
from reaching the engine. The v3 surface is `IQTreeNode` trees rehydrated in
code, free-form `dynamicOptions` closures, and `templateReplaceMap.ts` string
assembly — none statically checkable, all engine-reachable
(`scaffolding.current-state.md`).

The proposal replaces this with three authored files under one set of JSON
Schemas. The two MCP scenarios are the conformance fixtures: identical
`authType` enums, `allOf` conditional-required blocks, `replaceMap` with
`{const}/{from}/{when,value}/{expr}` entries, and `questions.json` using
`staticOptions` / `optionsFrom` / `condition` / `keyPrefix` / `skipSingleOption`.

## Options considered

- **A — Keep `IQTreeNode` + `dynamicOptions` + `templateReplaceMap` (status
  quo).** Familiar, but unsafe-to-edit and untestable.
- **B — A general expression/templating language (e.g. embedded JS or
  JSONLogic-everything).** Flexible, but reintroduces the engine-reachable
  escape hatch and an unbounded validation surface.
- **C — Three authored files under JSON Schema with one *closed* expression
  grammar and an identity-only `OptionItem` (chosen).** Everything an author
  writes is data validatable at build time; the engine is unreachable by
  construction.

## Decision

1. **`descriptor.json` is authored, not generated** (§3.1). Its fields are a
   closed set under `descriptor.schema.json` (`additionalProperties:false`):
   `id`, `name`, `kind`, `languages`, `minEngineVersion`, `spec`,
   `requiresNetwork`, `entry`, `optionsSchema`, `replaceMap`. There is **no**
   `category` field and **no** top-level `pipeline` field (the pipeline is the
   sibling `pipeline.json`, ADR-0017) — both MCP descriptors confirm this.

2. **`optionsSchema` is JSON Schema** (`required` / `properties` / `allOf` /
   `additionalProperties:false`), so conditional-required logic (`oauth` →
   `oauthClientId` + `oauthClientSecret`; `entra-sso` → `entraClientId`) is
   expressed declaratively, exactly as both scenarios do.

3. **`replaceMap` is a closed DSL** (§3.1, invariants 1–4): each entry is one of
   `{const}`, `{from}`, `{when, value}`, `{expr}`. `expr` resolves identifiers
   **only** from `optionsSchema.properties` and calls a **fixed function
   whitelist** (`safeUpper/safeLower/safeServer/safeAlphanumeric/featureFlag(name)/
   surface/mcpNamespace(url)/mcpAuthRef(url)`). No JS escape hatch. The validated
   `da/mcp-server` replaceMap (`DeclarativeCopilot`/`IsLocalMCP`/`MCPForDAServerUrl`/
   `IsNoAuth`/`MicrosoftEntra`/`MCPNamespace = mcpNamespace(mcpServerUrl)`/
   `MCPAuthRefId = mcpAuthRef(mcpServerUrl)`) is the reference shape; `mcpNamespace`/
   `mcpAuthRef` delegate to fx-core's URL-derivation helpers so that rule lives
   in one place shared with the modify auth injector.

4. **The caller-injected identifier floor is a closed `camelCase` set**
   (§3.1.2) — including the `language` axis — and `replaceMap[].var` MUST NOT
   shadow it (invariant 4); template-derived vars are `PascalCase`. Templates
   never transform `appName` in place; they derive a new var via `{expr}`.

5. **`descriptor.languages` is an engine-owned enum**
   (`typescript/javascript/python/csharp/common`, §3.1.0). `["common"]` (both
   MCP scenarios) means one language-agnostic `content/` tree; a multi-language
   template uses `content/{language}/`. The Q0 `language` question is bounded by
   this list and skipped when it is a singleton.

6. **`questions.json` is a native `QuestionSpec` list** (§4, §4.2) — no
   `IQTreeNode` rehydration. The field whitelist is closed (`name/type/title/
   placeholder/prompt/default/validation/staticOptions/optionsFrom/
   optionsFromParams/skipSingleOption/optional/cli*/condition/fallbackValue/
   keyPrefix`). `OptionItem` is **identity-only**: `id` + presentational fields
   (`label`/`description`/`detail`/`groupName`) + an optional visibility
   `condition` that is the **shared Decision-7 grammar**, not option-bound logic.
   **No configuration payload** hangs off an option — the v3 `option.data` /
   `JSON.parse(option.data)` overload does **not** exist (it is absent from
   `questions.schema.json`); configuration lives in `descriptor.optionsSchema` and
   computed fields in the provider `derived.<id>.<key>` namespace (§5). Exactly
  one of `staticOptions` / `optionsFrom`
  per option-bearing question. `optionsFrom` names an engine-owned provider
  registry entry, and `validation` names an engine-owned validator registry
  entry as either a **shorthand string** (e.g. `"uri"` on `mcpServerUrl`) or
  `{ use, params }`. Both registries are first-class v4 scaffolding extension
  points: implementations live in dedicated provider/validator files and are
  composed into the collect-inputs port by the caller, the same way pipeline
  steps are registered outside template data. The validator registry is shared
  by every normalized question-walk caller, including Q1 selector adapters and
  Q2+common-floor create-input adapters; no stage owns a private validator set.
  `skipSingleOption:true` auto-selects a sole option (used on `mcpServerType`).

7. **One closed expression grammar is shared** across `replaceMap.when`,
   `condition` (`{equals}/{enum}/{expr}/{anyOf}/{featureFlag}/{capability}`), and
   `optionsFromParams.*.{from|expr}` (§4.3) — one evaluator, one validation
   surface, no per-site dialect.

8. **Localization composes via a single `keyPrefix`** per localizable object
   (§6), resolved against fx-core's `package.nls.*.json` with the literal value
   as fallback. The real namespace is camelCase dotted (`template.daMcpServer.*`),
   and `keyPrefix` must not end in a field name (invariant 11).

9. **A schema-derived typed render context is generated at package-build time**
   (§3.5): codegen reads `optionsSchema` → emits `<Template>Options`, and the
   statically-analyzable `replaceMap` yields the emitted-var set
   (`<Template>RenderVars`). Props assembly is `tsc`-checked and `content/**`
   placeholders are checked against `keyof <Template>RenderVars` — the §3.4
   accounting expressed as a generated-type comparison.

## Consequences

- **New constraints (invariants 1–4, 8–11):** authored-not-generated descriptor;
  `OptionItem` identity-only; `replaceMap.var` cannot shadow a caller-injected
  id; localization fallback + `keyPrefix` well-formedness. All enforced by the
  three JSON Schemas + loader/CI checks.
- **Build-time guarantee:** placeholder drift, undeclared identifiers, and wrong
  enum literals fail the package build (via the §3.5 typed checks), not a
  user scaffold.
- **Boundary with [ADR-0017](ADR-0017-named-pipeline-step-whitelist.md):** this
  ADR owns the *question/identity/replaceMap* surface; the *side-effect* surface
  (`pipeline.json`, steps) is ADR-0017. They share the one closed expression
  grammar and the `optionsSchema.properties` identifier space.
- **Extension-point placement:** `optionsFrom` providers and validators are not
  surface wiring. They are named, engine-owned extension points parallel to
  pipeline steps: templates reference ids, registry files bind ids to typed
  implementations, and the surface/create-input adapter only composes those
  registries into the port.
- **No hidden business logic in the v4 engine:** capability-specific behavior
  must decompose into template data plus named extension points. Question-time
  business logic belongs in `questions.json` / `descriptor.json` / `replaceMap`
  or in an `optionsFrom` provider / validator; post-answer side effects belong in
  `pipeline.steps`. The generic v4 engine may hardcode the schema, parser,
  registry lookup, closed evaluator, and orchestration contracts, but it MUST NOT
  add MCP/OpenAPI/Graph/Office/template-specific branches in the walk, render, or
  front-door code.
- **Revisit via a superseding ADR:** now Accepted, the closed field/grammar sets
  are immutable; the two MCP packages are the conformance fixtures, and the
  derived specs below are the behavioral contract.

## Spec derivation shape (guidance, when ratified)

When this ADR is ratified and decomposed into operation specs, the specs are cut
by **observable behavior contract** (inputs / outputs / AC / seam), **not** by
field or file. The single closed expression grammar (decision 7) is the reason
this *reduces* rather than multiplies the spec count:

- **One shared evaluator spec** owns the grammar — the whitelist functions, the
  `optionsSchema.properties` identifier domain, and the no-JS-escape-hatch
  closure. Its AC table is the single place grammar behavior is asserted.
- **Each consuming operation references that evaluator; none re-defines it.**
  The three use-sites (`replaceMap.when` / `{expr}`, `condition` on questions and
  options, `optionsFromParams.{from|expr}`) are *call sites*, so a per-site
  parser would reintroduce exactly the per-site dialect decision 7 forbids.
- **Distinct behaviors stay distinct operations even though both call the
  evaluator.** Turning `replaceMap` into render variables is one behavior;
  walking `questions.json` + `condition` + providers into resolved answers is
  another. They share the evaluator but have different outputs, AC, and seams —
  so they are separate specs that *reference* the evaluator spec, not copies of
  the grammar. The build-time typed-context check (decision 9) and
  [`validate-template-package`](../../03-specs/operations/scaffolding/validate-template-package.md)
  likewise consume the grammar's *static-analyzability* property rather than
  restating it.

## Derived specs

Decomposed by **observable behavior contract** (decision 7's "Spec derivation
shape"), the closed grammar **reduces** the spec count to one evaluator plus the
distinct behaviors that consume it:

- [`evaluate-expression`](../../03-specs/operations/scaffolding/evaluate-expression.md)
  — the **one** shared closed-grammar evaluator (decision 7): the function
  whitelist, the `optionsSchema.properties` identifier domain, the sugar
  desugaring, and the no-JS-escape-hatch closure. The single place grammar
  behavior is asserted (14 AC, all L1).
- [`build-render-context`](../../03-specs/operations/scaffolding/build-render-context.md)
  — `replaceMap` (`{const}/{from}/{when,value}/{expr}`) → the render-var map
  (decisions 3, 4, 9). *References* the evaluator (10 AC, all L1).
- [`collect-inputs`](../../03-specs/operations/scaffolding/collect-inputs.md)
  — native `questions.json` + `condition` + `optionsFrom` providers → resolved
  answers (decisions 2, 5, 6; §3.3.2 providers + `derived.*`). *References* the
  evaluator (14 AC, all L1).

The two consumers share the evaluator but have different outputs, AC, and seams,
so they *reference* the evaluator spec rather than copy the grammar — exactly the
anti-duplication the single grammar buys.
