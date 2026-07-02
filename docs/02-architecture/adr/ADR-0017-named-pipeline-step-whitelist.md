# ADR-0017 — Named pipeline + step whitelist + domain-typed step naming

- **Status:** Accepted
- **Date:** 2026-05-28 (Accepted 2026-06-08)
- **Source:** [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into)
  (decomposes §§3.3, 3.3.1; invariants 5–7). Validated against
  `v4/create/da/mcp-server/pipeline.json` and
  `v4/modify/add-mcp-server/pipeline.json`.

## Context

This is an **internal** decision defining the closed surface through which a
template declares its **side effects**. The proposal's goal #2 (§1) is that "the
set of side effects a template can have is **enumerable from one file**
(`pipeline.json`), without reading any TypeScript." Today side effects live in
generator code and `onDidSelection` handlers — not enumerable, not safe to edit.

The two MCP pipelines are the conformance fixtures. The `create` pipeline is
short — `require-empty-target`, then `mcp-auth/inject-yml-action` (when
`authType != 'none'`), then `mcp-auth/persist-credential-env` (when
`oauth || entra-sso`) — because **render owns the pure parts** (`ai-plugin.json`
in full, `m365agents.yml` as the auth-less skeleton). The `modify` pipeline adds
`da-action/register-plugin-manifest` (deriving the DA manifest path from
`declarativeAgents[0].file`) plus the same two `mcp-auth/*` steps.

## Options considered

- **A — Free-form generator code per template (status quo).** Maximum power,
  zero enumerability, unsafe to edit.
- **B — A generic primitive set (`json-merge`, `text-append`, `yaml-set-key`).**
  Enumerable, but leaks file formats into every template and lets an author
  hand-assemble manifest mutations that bypass schema knowledge.
- **C — A named pipeline + a whitelist of *domain-typed* steps backed by
  `packages/manifest` wrappers, with generic primitives only as fallbacks
  (chosen).** Enumerable *and* schema-safe; step names encode the domain
  operation, not the file format.

## Decision

1. **`pipeline.json` declares a named `pipeline`** from the engine whitelist
   (`default | openapi | typespec | officeAddin | spfx`) plus an ordered `steps`
   list (§3.3). Both MCP scenarios use `"pipeline": "default"`. The pipeline name
   selects the engine's orchestration; `steps` are data.

2. **Engine-owned whitelists, each gated by an fx-core PR + T2 test**
   (invariants 6–7):
   - **`step` names** — adding a step type needs a new `paramsSchema` + T2 test;
     *combining* existing steps is data. `mcp-auth/inject-yml-action` is a single
     domain-typed step that branches internally by `authType` (oauth vs DCR
     well-known auto-discovery vs Entra, including the `v1.12 → v1.13` schema
     bump and the placeholder-fallback-with-warning on the dynamic path) — the
     template selects one step rather than composing primitives.
   - **`actionTemplate` names** — the yml action shapes a `*/inject-yml-action`
     step can write (`oauth/register`, `dcr/register`, Entra variants). Adding
     one needs an fx-core PR; in the validated flow the **domain step** picks
     among them by `authType`, so it is an engine-side detail, not a
     template-author field.
   - **`optionsFrom` providers** ([ADR-0016](ADR-0016-declarative-template-format.md)
     question surface; mechanics in §3.3.2) — adding a dynamic-options source
     needs an fx-core PR + T2 test; templates select by name.
   - **validators** ([ADR-0016](ADR-0016-declarative-template-format.md)
     question surface; mechanics in §6.4) — adding a reusable answer validator
     needs an fx-core PR + T2 test; templates select by name.

   These whitelists should be organized as explicit extension-point registries,
   not hidden inside surface wiring. Pipeline `steps`, `optionsFrom` providers,
   and validators all follow the same shape: templates reference stable ids;
   dedicated implementation files own the domain logic; a small registry maps ids
   to implementations; orchestration code receives the registry through a port.

3. **Step naming is domain-typed over primitive** (§3.3.1, invariant 5). Step
   names encode *what* (`mcp-auth/inject-yml-action`, `da-action/register-plugin-manifest`,
   `manifest-add-action`), not *how* (`json-merge`). Any step that mutates a
   **manifest** file MUST go through the `packages/manifest` wrappers
   (`TeamsManifestWrapper` / `DeclarativeAgentManifestWrapper` /
   `PluginManifestWrapper`) — direct `JSON.parse → mutate → JSON.stringify` is
   prohibited in step implementations (reviewers reject PRs that bypass it).
   `json-write` / `yml-merge` exist only as fallbacks for genuinely non-manifest
   files and require a reviewer-justified exception.

4. **Render vs step is decided by `(file-novelty, value-purity)`** (§3.3 prose,
   detailed in §13.1): a *new* file with *pure* content is emitted by render
   (`content/**/*.tpl`); an *impure* mutation (probe-driven, read-modify-write,
   warning/fallback) or a mutation of an *existing/shared* file is a step. This
   is why the create pipeline is only auth wiring + the empty-target guard, and
   why the modify pipeline carries `register-plugin-manifest`.

5. **Step inputs reuse the two surfaces [ADR-0016](ADR-0016-declarative-template-format.md)
   already defines — no third dialect** (§3.3, invariant 7). A step's
   author-supplied inputs live in **`with`**, whose values are **Mustache over
   the same render-var space as `content/**`** (raw answers ∪ `replaceMap`-derived
   vars ∪ provider `derived.*`): both MCP pipelines pass `"authType":
   "{{authType}}"` / `"mcpServerUrl": "{{MCPForDAServerUrl}}"` through the exact
   interpolation surface the content templates use. A step's `when` guard uses
   the **closed expression grammar** — the same shared evaluator as ADR-0016
   `condition` (`authType != 'none'`), not a per-site dialect. The engine then
   validates the **resolved** `with` object against the step's engine-owned
   `paramsSchema` (decision 2). There is deliberately **no** author-facing
   `params.*.{from|expr}` sub-object form: it would be a third way to express
   what Mustache-over-render-vars already expresses — the exact duplication this
   architecture refuses.

   *Forward-looking (no current fixture).* Cross-step data flow — a step
   publishing outputs via `produces:[…]` and a later step referencing
   `<stepId>.<field>` — is reserved for the deferred `modify`-flow step library
   (§13.1). Render vars are frozen before any step runs, so Mustache cannot reach
   a value another step produces at execution time; the reference form for that
   case lands **with** that library, not here. The loader-safety rule already
   holds in advance: forward and undeclared cross-step references are rejected.

## Consequences

- **New constraints (invariants 5–7):** domain-typed step naming + mandatory
  manifest-wrapper routing; `pipeline.pipeline ∈ whitelist`; `steps[].step ∈
  whitelist`, each step's `when` using the shared closed-expression grammar and
  its **resolved** `with` (Mustache over render vars) validated against the
  step's `paramsSchema`.
- **Adding a side-effect type is an fx-core release event** (§10), but adding a
  *template that composes existing steps* is a `templates-v4@version` data change —
  the safe-to-edit property of goal #2/#3.
- **No hidden side-effect business logic in the v4 engine.** Any
  capability-specific mutation, external probe, generated file that cannot be
  expressed as pure template content, credential wiring, manifest registration,
  or post-render fixup must be represented as a named pipeline step selected by
  `pipeline.json`. The pipeline executor may hardcode only the generic render →
  step orchestration, registry lookup, guard handling, and schema validation; it
  MUST NOT contain MCP/OpenAPI/Graph/Office/template-specific branches outside
  registered step implementations.
- **The complete manifest-step library is deferred** to the `modify` flow design
  (§13.1), where it co-designs conflict-detection/merge-strategy. This ADR fixes
  the *naming + wrapper* principle so the few steps `create` needs land
  already-shaped for that library.
- **Boundary with [ADR-0016](ADR-0016-declarative-template-format.md):** that ADR
  owns the question/replaceMap surface; this owns the side-effect surface. Shared:
  the one closed expression grammar and the `optionsSchema.properties` space.
- **Reversible while `Proposed`:** the whitelist model + domain-naming principle
  are the ratifiable decision; the two MCP pipelines are the conformance fixtures.

## Derived specs

- [`run-scaffold-pipeline`](../../03-specs/operations/scaffolding/run-scaffold-pipeline.md)
  — the operation spec that turns this decision into an AC-tabled behavioral
  contract: the two-phase executor (fixed render phase, new-files-only; then the
  ordered post-render steps), the closed pipeline/step whitelist enforced at
  execution, the step `with` (Mustache over render vars) + `when` (shared closed
  grammar) contract with the **resolved** `with` validated against the step's
  `paramsSchema`, and mandatory `packages/manifest`-wrapper routing for manifest
  mutations. The `when` grammar is shared with
  [ADR-0016](ADR-0016-declarative-template-format.md) §4.3; the reverse
  `minEngineVersion` gate that guarantees every referenced step is present is
  [ADR-0015](ADR-0015-templates-version-artifact-shape.md) AC-16 – AC-18,
  upstream of this operation. The two MCP pipelines are the conformance fixtures
  (AC-13 – AC-15); the `produces` / `<stepId>.<field>` cross-step form is marked
  forward-looking (AC-16), landing with the §13.1 modify-flow step library.
