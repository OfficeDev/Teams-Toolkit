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
> Section references of the form **§N** point to the *former*
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

- **Idempotency is a per-step contract keyed on a step-defined *identity*, not a
  kind-level invariant.** "Add a *new* action vs *update* an existing one" has
  no engine answer — each step declares an **identity key** and upserts by it
  (`da-action/register-plugin-manifest` keys `pluginManifestPath`;
  `mcp-auth/inject-yml-action` keys the URL-derived namespace). The no-op is
  keyed on the **desired state**, not the URL alone: re-adding the **same URL
  *and* same `authType`** → no-op; a **different URL** → a genuinely new action
  (a legitimate diff, not an idempotency violation); the **same URL with a
  *changed* `authType`** (user first picked `oauth`, then switches to
  `entra-sso` / DCR) → the namespace identity matches but the desired state
  differs, so upsert's *U* fires — an **update, not a no-op**. *What* that update
  does (silently rewrite vs **warn-and-change** vs refuse) is step-owned business
  logic, deferred to the open item below. This is an
  [ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md) step contract,
  kind-agnostic. The render phase is out of idempotency scope (it only writes
  non-existent files), so the conflict policy splits by phase: a *render*
  collision with an existing file → skip + warning; a *step* touching an
  existing file → normal reconciliation input. The auth-type-change case crosses
  that seam: the plugin manifest's `auth` block is a render-phase file, so a
  re-run alone (new-files-only skip) will *not* update it — which is precisely
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
   plugin manifest's `auth` block (which render's new-files-only skip will *not*
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
  rule: overlap on *enumerable* selector dimensions is a build failure
  (exhaustive sampling), and free-input dimensions do not route. What
  stays open is the *residual* tie-breaker: when two routes can still
  both match (e.g. overlapping `expr` predicates the enumerable sampling
  cannot fully rule out), is first-match-wins an acceptable silent
  resolution, or must such cases be a hard load-time rejection? The
  former is the default; the latter catches more authoring errors but
  costs CI time and gets harder as the option space grows.
- **CLI `--help` rendering before a templateId is resolved.** Once
  Q2 lives per-template, `atk new --help` cannot show a single flat option
  set the way the v3 `CreateProjectOptions.ts` did. Two candidate
  renderings: (a) the Q1 (selector) options plus the *union* of all
  CLI-reachable templates' Q2 options, each Q2 option annotated with its
  owning templateId(s); or (b) a two-pass help where `atk new --help`
  shows only Q1 + `--template-id`, and `atk new --template-id <id> --help`
  shows that template's Q2 options. (a) is discoverable but noisy and can
  surface conflicting choice lists for same-named flags across templates;
  (b) is clean but needs two invocations. The ADR-0014 dispatcher
  *resolution* contract does not depend on which is chosen; only the help
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

## 3. Visual Studio multi-project surface

The C# / Visual Studio surface scaffolds into an IDE-managed *solution*
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
  *composition* concept above templateId that the create design deliberately
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
