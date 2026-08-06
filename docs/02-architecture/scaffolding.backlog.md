# Scaffolding subsystem — open backlog & future work

- **Status:** Open backlog (no engine ADR pending)
- **Date:** 2026-05-28 (relocated 2026-06-08; slimmed 2026-06-08)
- **Scope:** the items ADR-0014 … ADR-0019 deliberately left open — the
  `modify` (in-place edit) flow, create-scope refinements carried over from the
  create design conversation, and the Visual Studio multi-project surface. The
  create/modify **engine** is decided and Accepted; nothing here reopens it.
- **Companion:** [`scaffolding.create.proposal.md`](scaffolding.create.proposal.md)
  (historical decomposition map for ADR-0014 ... ADR-0019) and
  [`scaffolding.current-state.md`](scaffolding.current-state.md) (historical v3
  pain catalog).

> **Why this exists.** Relocated from `scaffolding.create.proposal.md` §13 when
> that proposal was decomposed into ADR-0014 … ADR-0019 (all **Accepted**
> 2026-06-08). The create/modify engine these items build on — one two-phase
> executor (`fixed render phase → post-render pipeline steps`), the loader,
> validator, expression DSL, `optionsFrom` providers, native `QuestionSpec`,
> `ScaffoldRuntime`, and the T1/T2/T3 pyramid — is Accepted and immutable.
> **`modify` introduces no engine-specific ADR** (see §1), so this file hosts
> scenario-level design and the deferred backlog, not a new engine decision.
> Section references of the form **§N** point to the _former_
> `scaffolding.create.proposal.md` sections, now decomposed into the ADRs — use
> that file's **decomposition map** to resolve any §N to its ADR / spec.

---

## 1. The `modify` (in-place edit) flow

**`modify` reuses the create engine wholesale; it introduces no engine-specific
ADR.** A modify template is the same four-file package (`descriptor` /
`questions` / `pipeline` / optional `content`) under `templates/v4/modify/<id>/`,
resolved by the same dispatcher into the same
`BuildTarget = { templateId, engine, answers }` ([ADR-0014](adr/ADR-0014-dispatcher-buildtarget-resolution.md)),
run by the same two-phase executor (`render new files → post-render steps`,
[ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md)). `kind` is only a
routing / telemetry label: it selects which per-kind `selector.json` runs (Q1)
and tags `outcome-kind` — it is **not** a `BuildTarget` axis, and the engine
carries **zero** create-vs-modify branches. The two kinds are namespaced solely
by the `create/` vs `modify/` directory plus their own selectors; there is one
kind-agnostic step / provider registry.

create is not "write into empty" and modify is not "edit only": create renders a
whole skeleton then post-render read-modify-writes `m365agents.yml` / `.env`
through the **same** `mcp-auth/*` steps `add` uses
(`templates/v4/create/da/mcp-server/pipeline.json`); modify renders little
(often one dynamic-named file such as `ai-plugin-{{MCPNamespace}}.json`) and
RMWs more. **Same executor, different data — the difference is degree, not
kind.** The validated scenario design lives in the scenario specs, not here:
[`docs/03-specs/scenarios/da/add-mcp-server.md`](../03-specs/scenarios/da/add-mcp-server.md)
and its create counterpart
[`create-mcp-server.md`](../03-specs/scenarios/da/create-mcp-server.md).

The shipped `modify/add-mcp-server` package is the conformance fixture: a single
`entry: { params: ["mcpServerUrl"] }` for the MCP add-action path. The selector
routes that path directly to the authored v4 modify package; non-DT no longer
falls back to `engine: "v3-core-method"` / `coreMethod: "addPlugin"`.

Two consequences worth stating once:

- **Idempotency is a per-step contract keyed on a step-defined _identity_, not a
  kind-level invariant.** "Add a _new_ action vs _update_ an existing one" has
  no engine answer — each step declares an **identity key** and upserts by it
  (`da-action/register-plugin-manifest` keys `pluginManifestPath`;
  `mcp-auth/inject-yml-action` keys the URL-derived namespace). The no-op is
  keyed on the **desired state**, not the URL alone: re-adding the **same URL
  _and_ same `authType`** → no-op; a **different URL** → a genuinely new action
  (a legitimate diff, not an idempotency violation); the **same URL with a
  _changed_ `authType`** (user first picked `oauth`, then switches to
  `entra-sso` / DCR) → the namespace identity matches but the desired state
  differs, so upsert's _U_ fires — an **update, not a no-op**. _What_ that update
  does (silently rewrite vs **warn-and-change** vs refuse) is step-owned business
  logic, deferred to the open item below. This is an
  [ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md) step contract,
  kind-agnostic. The render phase is out of idempotency scope (it only writes
  non-existent files), so the conflict policy splits by phase: a _render_
  collision with an existing file → skip + warning; a _step_ touching an
  existing file → normal reconciliation input. The auth-type-change case crosses
  that seam: the plugin manifest's `auth` block is a render-phase file, so a
  re-run alone (new-files-only skip) will _not_ update it — which is precisely
  why auth-type reconciliation lands in the deferred step-conflict policy, not in
  render.
- **Existing-project introspection is just `optionsFrom`.** When a question's
  options come from the project itself (current wired operations, the DA
  manifest path from `declarativeAgents[0].file`), that is the existing
  `optionsFrom` provider reading the `fs` face
  ([ADR-0016](adr/ADR-0016-declarative-template-format.md) /
  [ADR-0018](adr/ADR-0018-scaffold-runtime-test-pyramid.md)) — identical to
  create, which reads an empty / absent project. No new port, no modify-only
  mechanism.

The one genuinely open item — **step conflict policy beyond a silent upsert** —
has two motivating cases, **both deferred to this backlog** (uncommon, and not a
first-version-refactor blocker), and both **kind-agnostic
[ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md) step-contract
refinements**, not modify ADRs:

1. **Auth-type change on an already-wired MCP server** (same URL, `authType`
   moves `oauth` → `entra-sso` / DCR). The correct outcome is neither a no-op
   nor a silent overwrite: business logic should **warn-and-change** — update the
   plugin manifest's `auth` block (which render's new-files-only skip will _not_
   touch on its own), replace the previous `mcp-auth/inject-yml-action` action,
   and reconcile / clean up the now-orphaned `MCP_DA_AUTH_ID_<NS>` env + vault
   reference from the old auth type. Which artifacts to clean and whether to
   prompt is step-owned; the engine has no kind-level answer.
2. **A user hand-edited a region upsert cannot reconcile** (fail /
   warn-and-skip / three-way merge).

Both are deferred until a real step needs them. The same
applies to sharing one yml-injection library between the scaffold
`mcp-auth/inject-yml-action` step and the v3 provision-time `typeSpec/compile`
self-mutation (`injectAuthAction` → `NeedRedoError`): that is an ADR-0017
wrapper-reuse detail and provision-time behavior is out of scaffolding scope.

## 2. Carry-overs from the create design conversation

Smaller open points within the create scope itself, deferred rather than
decided by ADR-0014 … ADR-0019:

- **`pipeline.json` file granularity.** Single file vs split per phase
  (scaffold / post-scaffold / yml-inject). Single file is the default.
  Worth revisiting only if real templates routinely have > 15 steps.
- **`staticOptions: string[]` shortcut migration window.** Current code
  has many `staticOptions: ["yes", "no"]` forms; these cannot carry
  `keyPrefix`. CI in production templates eventually disallows the
  shortcut; transition period length and warning vs error semantics are
  open.
- **`routes[]` residual ambiguity policy.** ADR-0014 commits to one
  rule: overlap on _enumerable_ selector dimensions is a build failure
  (exhaustive sampling), and free-input dimensions do not route. What
  stays open is the _residual_ tie-breaker: when two routes can still
  both match (e.g. overlapping `expr` predicates the enumerable sampling
  cannot fully rule out), is first-match-wins an acceptable silent
  resolution, or must such cases be a hard load-time rejection? The
  former is the default; the latter catches more authoring errors but
  costs CI time and gets harder as the option space grows.
- **CLI `--help` rendering before a templateId is resolved.** Once
  Q2 lives per-template, `atk new --help` cannot show a single flat option
  set the way the v3 `CreateProjectOptions.ts` did. Two candidate
  renderings: (a) the Q1 (selector) options plus the _union_ of all
  CLI-reachable templates' Q2 options, each Q2 option annotated with its
  owning templateId(s); or (b) a two-pass help where `atk new --help`
  shows only Q1 + `--template-id`, and `atk new --template-id <id> --help`
  shows that template's Q2 options. (a) is discoverable but noisy and can
  surface conflicting choice lists for same-named flags across templates;
  (b) is clean but needs two invocations. The ADR-0014 dispatcher
  _resolution_ contract does not depend on which is chosen; only the help
  UX does.
- **v3 parity gap — DA api-spec route not `KiotaNPMIntegration`-gated
  (recorded, not fixed).** v3 `daProjectTypeNode` chooses `apiSpecWithSearchNode()`
  (url/file/search split) vs `apiSpecNode()` (single `singleFileOrText`) on
  `FeatureFlags.KiotaNPMIntegration` (default `"true"`). The v4 `openapi`
  selector route always targets the split-form `da/api-plugin-from-existing-api`.
  Default-consistent (flag on → both split); diverges only when the flag is off.
  Full parity would add a flag-gated route + a `singleFileOrText` DA api-plugin
  variant (mirrors the mcp DT split `da/mcp-server` vs `da/mcp-server-static`).
  (Found 2026-07-07.)
- **DA action-id collision hardening (recorded, not fixed).**
  `DeclarativeAgentManifestWrapper.upsertAction` uses the plugin file as its
  desired-state identity but does not reject or disambiguate an `id` already
  owned by another action. The v4 `da-action/register-plugin-manifest` step
  derives that id from the plugin filename, so a hand-edited project or two
  colliding filenames can produce duplicate action ids even though same-file
  re-runs remain idempotent. This does not regress a v3 path. Close the item by
  defining the product collision policy (fail, preserve, or suffix), enforcing
  it in the wrapper, and covering both same-file re-runs and cross-file id
  collisions.
- **MetaOS command-runtime selection hardening (recorded, not fixed).**
  `TeamsManifestWrapper.addExtensionRuntimeActions` currently selects the first
  runtime whose `code.script` contains `commands.js`; a preceding
  `customcommands.js` runtime is therefore a false match. Shipped templates use
  an exact `.../commands.js` URL, so this is not a current v3 parity blocker.
  Close the item by matching the URL/path basename exactly and adding a
  multiple-runtime regression test.
- **Mixed Teams-manifest DA path precedence (recorded, not fixed).**
  `TeamsManifestWrapper.getDeclarativeAgentPaths` reads legacy
  `copilotExtensions.declarativeCopilots`, current
  `copilotAgents.declarativeAgents`, and the top-level `declarativeAgents`
  compatibility shape in that order; callers that take the first path therefore
  choose the legacy reference when a hand-edited manifest contains multiple
  generations. This preserves v3's legacy-first behavior and standard templates
  emit only one shape, so it is not a replacement regression. Close the item by
  either rejecting mixed shapes as ambiguous or documenting and testing an
  explicit migration-aware precedence contract.

## 3. Visual Studio multi-project surface

The C# / Visual Studio surface scaffolds into an IDE-managed _solution_
(`.sln` + one or more `.csproj`), not a bare folder. v3 handles this with
surface-supplied identifiers (`solutionName`, `safeProjectName`,
`PlaceProjectFileInSolutionDir`) and a VS-specific generator path. This
proposal does **not** yet design that path; the create design already leaves
the hooks so adding it later does not reshape the model:

- **The `surface` discriminator already exists** (ADR-0016): `surface == "vs"`
  is a first-class caller-injected value, so VS-only descriptors, Q1
  visibility rules, and `{expr}` branches are expressible without a new
  axis.
- **VS identifiers are already in the caller-injected floor** as
  surface-only, csharp-gated variables (`solutionName`, `safeProjectName`,
  ADR-0016). They are read-only to templates and validated to render only on
  csharp-declared templates — the same loader rule that protects the
  language axis protects these.
- **`language: "csharp"` is already an enum member** (ADR-0016), so a VS
  template is just a single-language (or csharp-only multi-target) template
  in the existing BuildTarget model; nothing about `{ templateId, language }`
  changes.

What stays genuinely open for the Visual Studio surface:

- **Solution-vs-project granularity.** Whether one `templateId` emits a
  whole solution (multi-`.csproj`) or whether a solution is composed from
  several single-project templates. The former fits the current
  one-templateId-one-pipeline shape directly; the latter would need a
  _composition_ concept above templateId that the create design deliberately
  does not introduce. The expectation is the former (a VS template owns its
  whole solution layout via `content/`), keeping the model intact.
- **Where `.sln` placement / nesting rules live.** Almost certainly
  ordinary `pipeline.json` file-write steps plus the existing
  `PlaceProjectFileInSolutionDir`-style flag, not a new step family.
- **Who computes `safeProjectName`.** Today the IDE supplies it; the
  derivable `safeAlphanumeric(appName)` path (ADR-0016) may make the
  surface-supplied value redundant. Resolving this is a VS-surface detail, not a
  model change.

The load-bearing claim is only this: **none of the above requires changing
the question layers, the language axis, or BuildTarget resolution
(ADR-0014 / ADR-0016).** VS support lands as descriptors plus, at most, one
fx-core PR for a VS-specific step.

## 4. v3 post-render replacement ledger

This is a migration ledger, not a behavior contract. Scenario behavior remains
owned by [`docs/03-specs`](../03-specs/README.md), and engine shape remains
owned by ADR-0014 ... ADR-0019. A row is **complete** only when the v4 package,
its named steps (if any), and an executable package or entry-path test all
exist. Source presence or a matching template filename alone is not parity.

Priority means:

- **P0** — the v4 create/modify engine cannot safely replace the corresponding
  v3 route without it.
- **P1** — an active user-visible v3 route or compliance behavior is missing.
- **P2** — a narrower import/scaffold variant is still v3-owned.
- **P3** — a separate surface expansion is required, but the accepted v4
  engine shape does not change.
- **P4** — delete v3 routing and generator code only after every retained row
  above it is complete or explicitly removed from product scope.

### Completed P0 mappings

| v3 post-render responsibility                                                              | v4 owner and executable evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status                                                                                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Render downloaded template bytes, apply replacements, then run post work                   | The fixed render phase plus named pipeline steps; covered by [`runScaffoldPipeline.test.ts`](../../packages/fx-core/tests/v4/pipeline/runScaffoldPipeline.test.ts), [`scaffoldFromPackageDir.test.ts`](../../packages/fx-core/tests/v4/runtime/scaffoldFromPackageDir.test.ts), and package validation tests                                                                                                                                                                                                                                                                     | Complete                                                                                                                  |
| DA + Graph connector temporary-tree merge in `CombinedProjectGenerator.post`               | One flattened `da/graph-connector` package; covered by [`createDaGraphConnector.test.ts`](../../packages/fx-core/tests/v4/scenarios/createDaGraphConnector.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                              | Complete; no merge or copy step is needed                                                                                 |
| DA from an existing OpenAPI document in `openApiSpec/DeclarativeAgentGenerator.post`       | `openapi/generate-plugin-files`; covered by [`createApiPluginFromExistingApi.test.ts`](../../packages/fx-core/tests/v4/scenarios/createApiPluginFromExistingApi.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                         | Complete                                                                                                                  |
| Teams AI custom API generation in `CustomEngineAgentGeneratorWithOpenApi.post`             | `openapi/generate-teams-ai-custom-api-files`; covered by [`createCustomCopilotRagCustomApi.test.ts`](../../packages/fx-core/tests/v4/scenarios/createCustomCopilotRagCustomApi.test.ts)                                                                                                                                                                                                                                                                                                                                                                                          | Complete; prompt, adaptive-card, function, code, and manifest updates are v4-owned                                        |
| Existing Office Add-in import and environment reset in `OfficeAddinGenerator.post`         | `officeaddin/import-existing-project`; covered by [`createOfficeAddinConfig.test.ts`](../../packages/fx-core/tests/v4/scenarios/createOfficeAddinConfig.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                 | Complete                                                                                                                  |
| DT-off static MCP tool selection and materialization                                       | `da/mcp-server-static` plus `mcp-static/materialize-tools`; covered by [`createMcpServerStatic.test.ts`](../../packages/fx-core/tests/v4/scenarios/createMcpServerStatic.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                | Complete                                                                                                                  |
| DT-on remote/local MCP materialization and auth wiring                                     | `da/mcp-server`, `mcp-local/materialize-servers`, and shared `mcp-auth/*`; covered by [`createMcpServer.test.ts`](../../packages/fx-core/tests/v4/scenarios/createMcpServer.test.ts)                                                                                                                                                                                                                                                                                                                                                                                             | Complete; MCP discovery is shared core and YAML auth action mutation is v4-owned                                          |
| MCP static OAuth / Entra credential collection                                             | Create/add descriptors collect only `authType`; generated `oauth/register` actions defer missing credentials to provision. The real middleware-to-driver handoff is covered by [`create.test.ts`](../../packages/fx-core/tests/component/driver/oauth/create.test.ts).                                                                                                                                                                                                                                                                                                           | Complete intentional redesign; no plaintext credential values or refs are scaffolded                                      |
| Add MCP action to an existing DA                                                           | `modify/add-mcp-server`, reached by the DT-on `core.addPlugin` entry path; covered by [`addMcpServer.test.ts`](../../packages/fx-core/tests/v4/scenarios/addMcpServer.test.ts) and [`FxCore.declarativeAgent.test.ts`](../../packages/fx-core/tests/core/FxCore.declarativeAgent.test.ts)                                                                                                                                                                                                                                                                                        | Complete for the accepted same-desired-state contract; auth-type conflict reconciliation remains in §1                    |
| General sensitivity label in `DeclarativeAgentGenerator.post` and the OpenAPI DA generator | Feature-gated `da/set-sensitivity-label` backed by the non-interactive, best-effort `GeneralSensitivityLabelService`; all retained DA create packages that emit a manifest declare the step and require engine `6.11.0`. Covered by [`daSensitivity.test.ts`](../../packages/fx-core/tests/v4/runtime/steps/daSensitivity.test.ts), [`generalSensitivityLabel.test.ts`](../../packages/fx-core/tests/v4/services/generalSensitivityLabel.test.ts), and [`applyGeneralSensitivityLabel.test.ts`](../../packages/fx-core/tests/v4/scenarios/applyGeneralSensitivityLabel.test.ts). | Complete; manifest mutation routes through `DeclarativeAgentManifestWrapper`, and stale render-time sections were removed |

The completed mappings have an implementation-ownership gate in addition to
their scenario evidence: production files under `packages/fx-core/src/v4/` do
not import `packages/fx-core/src/component/`. Reusable MCP discovery, ODR, and
OpenAPI parser policy live under `src/common/`; v4-only post-render behavior
stays with its named pipeline-step implementation.

### Remaining replacement work

| Priority | v3 owner / behavior                                                                                                                              | Verified v4 state                                                                                                              | Replacement exit criterion                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P1**   | `DeclarativeAgentGenerator.post`, `CombinedProjectGenerator.post`, and `TdpGenerator.post` call `updateFilesForTdp` for Developer Portal imports | No v4 selector input, provider, or step consumes `teamsAppFromTdp`.                                                            | Specify the import route, represent the selected app as declared input, add a named TDP file-update step, and prove the VS Code create-from-Developer-Portal entry path. |
| **P1**   | `DeclarativeAgentGenerator.post` imports an existing plugin manifest through `addExistingPlugin`                                                 | The create selector offers new API, OpenAPI document, and MCP sources, but no existing-plugin-manifest package/route.          | Decide whether this remains create or becomes modify, author the package and manifest-registration step, and add an entry-path test for the existing UI capability.      |
| **P2**   | `MessageExtensionWithExistingApiSpecGenerator.post` generates message-extension files from selected OpenAPI operations                           | `default-message-extension` covers the starter template only; there is no v4 existing-OpenAPI message-extension route/package. | Add a scenario spec, package, OpenAPI step coverage, and selector/entry-path test, or explicitly remove the v3 option from product scope.                                |
| **P2**   | `SPFxGeneratorImport.post` updates imported SPFx manifests, tabs, environment ids, icons, and logs                                               | No SPFx import package or named step exists under `templates/v4`.                                                              | Resolve SPFx product scope, then either author the package/step and import tests or retain an explicit non-v4 route with an owner and removal condition.                 |
| **P3**   | Visual Studio/C# generators produce IDE-managed solutions and projects                                                                           | §3 remains the owning open design; this is broader than post-render parity.                                                    | Add C# descriptors/packages and VS entry tests without changing `BuildTarget` or the shared executor.                                                                    |
| **P4**   | v3 generator selection, `post()` implementations, and feature-flag fallbacks remain callable                                                     | Required while any retained P1-P3 row is open.                                                                                 | Add a route-coverage gate showing every retained product route resolves to v4, remove v3 fallbacks and dead generators, then run cross-surface scaffold smoke tests.     |

### Documentation drift to keep visible

[`add-mcp-action-to-da.md`](../01-product/scenarios/da/add-mcp-action-to-da.md)
still describes the legacy VS Code two-stage/static-tools behavior and the
legacy CLI output as current product behavior. The accepted DT-on v4 contract is
[`add-mcp-server.md`](../03-specs/scenarios/da/add-mcp-server.md), and the real
DT-on entry path already reaches the v4 modify package. Reconcile the product
scenario when the feature-flag rollout policy is decided; do not use that prose
as evidence that the v4 modify surface is unwired.
