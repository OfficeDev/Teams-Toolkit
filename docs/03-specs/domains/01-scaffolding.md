# Domain 01 — Scaffolding

- **Status:** Accepted — every operation + scenario spec below is Accepted,
  decomposed from [ADR-0014 … ADR-0019](../../02-architecture/adr/README.md)
  (Accepted 2026-06-08).
- **Capability (PM word):** Project scaffolding — turn a user's intent into a
  ready-to-build starting project.
- **Architecture source:** [`../../02-architecture/scaffolding.md`](../../02-architecture/scaffolding.md)
  (capabilities + cross-cutting properties) and
  [ADR-0014 … ADR-0019](../../02-architecture/adr/README.md) (the v4
  create/modify shape); [`../../02-architecture/scaffolding.create.proposal.md`](../../02-architecture/scaffolding.create.proposal.md)
  is now the decomposition map into those ADRs.

## Boundary

The scaffolding domain owns everything between "the user has chosen what to
create or modify" and "files exist on disk ready to build". It does **not** own
provisioning, deployment, or publish (those are separate lifecycle phases).
In-place modification (the `modify` kind) **is in scope**: it reuses the create
engine wholesale and introduces no engine-specific ADR
([ADR-0014](../../02-architecture/adr/ADR-0014-dispatcher-buildtarget-resolution.md)).
The one residual open item — step conflict policy beyond upsert — is a deferred
[ADR-0017](../../02-architecture/adr/ADR-0017-named-pipeline-step-whitelist.md)
step-contract refinement tracked in
[`scaffolding.backlog.md`](../../02-architecture/scaffolding.backlog.md) §1.

This domain is the **v4 world** decomposed into
[ADR-0014 … ADR-0019](../../02-architecture/adr/README.md). All operation specs
here describe v4 behavior. The frozen v3 generator registry is not re-specified;
it is retired template-by-template per the migration ratchet
([ADR-0014](../../02-architecture/adr/ADR-0014-dispatcher-buildtarget-resolution.md)).

## Vocabulary

- **Template** — a versioned, declarative starting point (descriptor +
  questions + pipeline + content) that the engine renders into a project.
- **Template package** — the `templates-v4@<version>` release unit. It publishes
  selector, metadata, and full-template assets derived from the same
  `templates/v4` source.
- **Bundled floor** — the copy of the template package shipped inside the
  engine binary; the offline / deterministic baseline.
- **Release channel** — the GitHub-release-hosted template packages that let
  templates ship independently of the engine.
- **Template source** — a resolved `(origin, version, digest, location)` for one
  artifact, or a staged artifact snapshot that pins one version and digest set
  across selector, metadata, and full-template bytes.
- **Range** — the SemVer range a build is permitted to resolve within.
- **Lane** — `stable` vs `beta`, expressed purely through SemVer prerelease
  semantics (a `-beta` segment), not a separate field.
- **Digest** — content hash of a resolved template package; the cache key and
  the reproducibility anchor.

## Operations

| Operation | Spec | Summary |
|-----------|------|---------|
| `resolve-build-target` | [`operations/scaffolding/resolve-build-target.md`](../operations/scaffolding/resolve-build-target.md) | Resolve a create entry (interactive / pre-filled / batch) to a `BuildTarget = { templateId, engine, answers }` and dispatch the `templateId` to its world (v4 / v3 / v3-core-method / surface-action). |
| `resolve-template-source` | [`operations/scaffolding/resolve-template-source.md`](../operations/scaffolding/resolve-template-source.md) | Resolve `(range, bundled, runtime)` to one `(origin, version, digest, location)` before any rendering. |
| `open-template-package` | [`operations/scaffolding/open-template-package.md`](../operations/scaffolding/open-template-package.md) | Open the resolved package bytes and return one template's file entries, locator prefix stripped, unrendered. |
| `validate-template-package` | [`operations/scaffolding/validate-template-package.md`](../operations/scaffolding/validate-template-package.md) | Validate one package's four-file shape + schema + placeholder accounting + selector/descriptor consistency (build CI **and** engine load), and the reverse `minEngineVersion` compatibility gate (explicit upgrade error, never silent fallback). |
| `collect-inputs` | [`operations/scaffolding/collect-inputs.md`](../operations/scaffolding/collect-inputs.md) | Walk the native `questions.json` (`condition`, `staticOptions`/`optionsFrom` providers, `skipSingleOption`, `entry.params`, validation) into the resolved answer object (incl. provider `derived.*`); no `IQTreeNode` rehydration. |
| `build-render-context` | [`operations/scaffolding/build-render-context.md`](../operations/scaffolding/build-render-context.md) | Resolve the closed `replaceMap` DSL (`{const}/{from}/{when,value}/{expr}`) against answers + the caller-injected floor into the render-var map `content/**` and step `with` interpolate against. |
| `evaluate-expression` | [`operations/scaffolding/evaluate-expression.md`](../operations/scaffolding/evaluate-expression.md) | The one shared closed-grammar evaluator (function whitelist + `optionsSchema.properties` identifier domain + sugar desugaring + no-JS-escape closure) that every `when`/`condition`/`{expr}` call site references. |
| `run-scaffold-pipeline` | [`operations/scaffolding/run-scaffold-pipeline.md`](../operations/scaffolding/run-scaffold-pipeline.md) | Execute one validated package's pipeline: the fixed render phase (new-files-only, skip-with-warning on collision) then the ordered post-render steps, enforcing the closed step whitelist, the `with`/`when` contract, and `packages/manifest`-wrapper routing for manifest mutations. |
| `emit-scaffold-telemetry` | [`operations/scaffolding/emit-scaffold-telemetry.md`](../operations/scaffolding/emit-scaffold-telemetry.md) | Planned telemetry operation: emit the v3 events verbatim plus the parallel `scaffold-v4-template` / `-step` / `-outcome` family, paired by `correlation-id`; no emitter exists yet. |

## Scenarios

Scenario specs are the **vertical** (per-template, end-to-end) counterpart to the
operation specs above — each composes those operations and pins the concrete
artifacts *one* template produces. They drive the ADR-0018 **T3** scenario tier.
See [`../README.md`](../README.md#required-sections-in-a-scenario-spec) for the
format and the orthogonal-cuts rationale.

| Scenario | Spec | Template | Summary |
|----------|------|----------|---------|
| Create DA (No Action) | [`scenarios/da/create-no-action.md`](../scenarios/da/create-no-action.md) | `da/no-action` (create) | Render the basic DA project (`declarativeAgent.json`, `manifest.json`, `m365agents.yml`) with no action or auth wiring. Pure render: the `default` pipeline carries only a `require-empty-target` guard and no post-render steps. |
| Create DA with MCP Server | [`scenarios/da/create-mcp-server.md`](../scenarios/da/create-mcp-server.md) | `da/mcp-server` (create) | Render the full DA project (`ai-plugin.json` URL-derived namespace, `m365agents.yml`, `.vscode/mcp.json`, …) then wire MCP auth via the `default` pipeline's `mcp-auth/*` steps. |
| Add MCP Server Action | [`scenarios/da/add-mcp-server.md`](../scenarios/da/add-mcp-server.md) | `add-mcp-server` (modify) | Render only `ai-plugin-<NS>.json` into an existing DA project, register it in the existing `declarativeAgent.json`, and reuse the same shared `mcp-auth/*` auth steps (no drift with create). |
| Create DA with API Plugin from Scratch | [`scenarios/da/create-api-plugin-from-scratch.md`](../scenarios/da/create-api-plugin-from-scratch.md) | `da/api-plugin-from-scratch` (create) | Render the no-auth `new API` sample backend and pre-baked API plugin action for TypeScript / JavaScript. |
| Create DA with API Plugin from Scratch, API Key auth | [`scenarios/da/create-api-plugin-from-scratch-bearer.md`](../scenarios/da/create-api-plugin-from-scratch-bearer.md) | `da/api-plugin-from-scratch-bearer` (create) | Render the API-key `new API` sample backend, key generator, and pre-baked API plugin auth wiring for TypeScript / JavaScript. |
| Create DA with API Plugin from Scratch, OAuth / Microsoft Entra auth | [`scenarios/da/create-api-plugin-from-scratch-oauth.md`](../scenarios/da/create-api-plugin-from-scratch-oauth.md) | `da/api-plugin-from-scratch-oauth` (create) | Render the OAuth / Microsoft Entra `new API` sample backend and conditional auth-code plugin wiring for TypeScript / JavaScript. |
| Create DA with API Plugin from Existing OpenAPI | [`scenarios/da/create-api-plugin-from-existing-api.md`](../scenarios/da/create-api-plugin-from-existing-api.md) | `da/api-plugin-from-existing-api` (create) | Render the common DA shell, then generate the API plugin, filtered OpenAPI spec, DA action, conversation starters, and auth registration actions from selected OpenAPI operations. |

## Domain invariants

These hold across every operation in the domain:

- **Offline-by-default.** A scaffold run completes without network when the
  bundled floor satisfies the request
  ([`../../02-architecture/scaffolding.md`](../../02-architecture/scaffolding.md) §3.2).
- **Deterministic + reproducible.** Identical `(engine, inputs, channel state)`
  yields identical output; a recorded digest always re-fetches the same bytes
  ([`../../02-architecture/scaffolding.md`](../../02-architecture/scaffolding.md) §3.1, §3.4).
- **No silent substitution.** Any divergence from the intended source (network
  fallback, cache use) is observable on the outcome and telemetry, never
  silent ([ADR-0006](../../02-architecture/adr/ADR-0006-template-distribution-channel.md)).
