# Scenario — Create Declarative Agent with API Plugin from Scratch, API Key auth (`da/api-plugin-from-scratch-bearer`)

- **Status:** Accepted (Decision source [ADR-0016 §5](../../../02-architecture/adr/ADR-0016-declarative-template-format.md) + [ADR-0018](../../../02-architecture/adr/ADR-0018-scaffold-runtime-test-pyramid.md)) — ready for scenario-tier (T3) tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Scenario ID:** `SCN-DA-CREATE-API-PLUGIN-FROM-SCRATCH-BEARER` (the declarative
  agent with a brand-new, **API-key-protected** API plugin action — the
  `new API` / `apiAuth == 'api-key'` action source)
- **Template id:** `da/api-plugin-from-scratch-bearer` (create)
- **Languages:** `typescript`, `javascript` (`csharp` is deferred — its v3
  template needs the VS multi-project surface identifiers the v4 caller floor
  does not yet carry)

This is the **vertical** contract for one template: what scaffolding the
`da/api-plugin-from-scratch-bearer` create package produces **end-to-end**, for
each declared language. It is the **API-key sibling** of the no-auth
[`da/api-plugin-from-scratch`](./create-api-plugin-from-scratch.md) scenario —
same shape, same `default` pipeline (a single `require-empty-target` guard, **no**
post-render injection), differing only in the **auth wiring** of the pre-baked
action: the bundled `ai-plugin.json` declares an `ApiKeyPluginVault` runtime
keyed on `${{APIKEY_REGISTRATION_ID}}`, and the backend adds a `src/keyGen.ts`
key generator. Like the no-auth source it is a **pure render** — the action is
**pre-baked** into the template's `repairDeclarativeAgent.json`, not injected
(this is the *new API from scratch* path, not the spec-parser *existing API*
path). It is **language-partitioned**: the package ships
`content/{typescript,javascript}/` and the
[`select-language-content`](../../operations/scaffolding/select-language-content.md)
operation narrows it to the Q0 language before render. Per the
[specs README](../../README.md#operation-spec-vs-scenario-spec--orthogonal-cuts-not-duplication),
these AC rows are the source of the ADR-0018 **T3** assertions, run with the
whole template scaffolded under `InMemoryRuntime` (every row is **L1**).

## Acceptance Criteria

| ID | Tier | Given | When | Then |
|----|------|-------|------|------|
| SCN-CREATE-APIPLUGIN-BEARER-01 | L1 | empty target, language `typescript` | scaffold completes | the render phase writes exactly the TypeScript backend file set (`.tpl` stripped, `typescript/` prefix stripped) — incl. `appPackage/repairDeclarativeAgent.json`, `appPackage/ai-plugin.json`, `appPackage/manifest.json`, `appPackage/apiSpecificationFile/repair.yml`, `src/functions/repairs.ts`, `src/keyGen.ts` (the API-key generator), `src/repairsData.json`, `package.json`, `tsconfig.json` — and nothing is skipped |
| SCN-CREATE-APIPLUGIN-BEARER-02 | L1 | rendered `appPackage/repairDeclarativeAgent.json` (typescript) | render | `name == "{{appName}}${{APP_NAME_SUFFIX}}"` (the `appName` floor token rendered, the env ref preserved verbatim), `instructions == "$[file('instruction.txt')]"`, and `actions` is the single pre-baked entry `{ id: "repairPlugin", file: "ai-plugin.json" }`; **no** `sensitivity_label` block (`TEAMSFX_SENSITIVITY_LABEL` defaults off ⇒ the `{{#SensitivityLabelEnabled}}` section is omitted) |
| SCN-CREATE-APIPLUGIN-BEARER-03 | L1 | rendered `appPackage/ai-plugin.json` (typescript) | render | `namespace == "repairs"` and `runtimes[0]` is the `OpenApi` runtime over the bundled spec (`spec.url == "apiSpecificationFile/repair.yml"`) with **`auth.type == "ApiKeyPluginVault"`** and `auth.reference_id == "${{APIKEY_REGISTRATION_ID}}"` (the env ref preserved for provision) |
| SCN-CREATE-APIPLUGIN-BEARER-04 | L1 | rendered `appPackage/manifest.json` (typescript) | render | `manifestVersion == "1.28"`; the env refs survive render — `id == "${{TEAMS_APP_ID}}"`, `name.short == "{{appName}}${{APP_NAME_SUFFIX}}"`; `copilotAgents.declarativeAgents` is the single entry `{ id: "repairDeclarativeAgent", file: "repairDeclarativeAgent.json" }` |
| SCN-CREATE-APIPLUGIN-BEARER-05 | L1 | empty target, language `typescript` | scaffold | the **language axis** narrows correctly — every written path is project-root-relative (no path begins with `typescript/` or `javascript/`); `src/functions/repairs.ts`, `src/keyGen.ts` and `tsconfig.json` are present, and **no** `src/functions/repair.js` is written |
| SCN-CREATE-APIPLUGIN-BEARER-06 | L1 | empty target, language `javascript` | scaffold | the JavaScript subtree is written instead — `src/functions/repair.js` (the v3 **singular** file name, preserved verbatim) and `src/keyGen.js` are present, **no** `tsconfig.json` and **no** `src/functions/repairs.ts`; the rendered `ai-plugin.json` `ApiKeyPluginVault` shape (BEARER-03) holds identically for the JS package |
| SCN-CREATE-APIPLUGIN-BEARER-07 | L1 | empty target | scaffold | the **only** pipeline step run is `require-empty-target` (`stepsSkipped` empty); **no** post-render injection runs — the API plugin action is pre-baked, so nothing is added after render |
| SCN-CREATE-APIPLUGIN-BEARER-08 | L1 | non-empty target | scaffold | `require-empty-target` fails first with **`UserError`** and writes nothing (the create contract; ordering mechanism owned by `run-scaffold-pipeline`) |
| SCN-CREATE-APIPLUGIN-BEARER-09 | L1 | identical inputs re-run (typescript) | scaffold | deterministic — identical `written` set and identical rendered agent `name` |

## Composed operations

This scenario **flows through** these operation specs; their mechanics are
**referenced, never restated**:

- [`resolve-build-target`](../../operations/scaffolding/resolve-build-target.md)
  — selects the create build target (ADR-0014); the create selector routes the
  `new API` / API-key pick
  (`daTemplate == 'add-action' && actionSource == 'new-api' && apiAuth == 'api-key'`)
  to the `da/api-plugin-from-scratch-bearer` v4 package.
- [`resolve-template-source`](../../operations/scaffolding/resolve-template-source.md)
  — picks the `da/api-plugin-from-scratch-bearer` package and pins its
  `{version, digest}` (ADR-0006 / ADR-0015).
- [`open-template-package`](../../operations/scaffolding/open-template-package.md)
  + [`validate-template-package`](../../operations/scaffolding/validate-template-package.md)
  — opens and well-formed-checks the package (ADR-0015); content is returned
  flat, both language subtrees present.
- [`select-language-content`](../../operations/scaffolding/select-language-content.md)
  — narrows the flat `content/**` to the Q0 language subtree
  (`content/typescript/` or `content/javascript/`), stripping the prefix
  (SCN-CREATE-APIPLUGIN-BEARER-05/06).
- [`build-render-context`](../../operations/scaffolding/build-render-context.md)
  — derives the render-var map; for this template it is the caller floor
  (`appName`, the `language` axis) plus the descriptor's one `expr` producer
  `SafeProjectNameLowerCase = safeProjectNameLowerCase(appName)`. The env refs
  (`${{APP_NAME_SUFFIX}}`, `${{TEAMS_APP_ID}}`, `${{APIKEY_REGISTRATION_ID}}`, …)
  have **no** producer, so the render surface's empty-variable escape preserves
  them for provision to resolve later.
- [`run-scaffold-pipeline`](../../operations/scaffolding/run-scaffold-pipeline.md)
  — the two-phase executor: its **render phase** writes the new files in
  SCN-CREATE-APIPLUGIN-BEARER-01; its **`default` pipeline** runs the single
  `require-empty-target` guard and nothing else (ADR-0017). The render-var floor
  is owned by
  [ADR-0016](../../../02-architecture/adr/ADR-0016-declarative-template-format.md).

## Flow

```mermaid
flowchart TD
  Sel[resolve-build-target + resolve-template-source: da/api-plugin-from-scratch-bearer] --> Open[open + validate-template-package]
  Open --> Lang[select-language-content: narrow to Q0 language subtree]
  Lang --> Guard{require-empty-target}
  Guard -- non-empty --> Err[UserError — nothing written]
  Guard -- empty --> Render[render phase: write new files]
  Render --> Done([scaffold output ready])
```

## Boundary

This scenario does **not** assert:

- **The `csharp` language** — deferred, for the same VS multi-project surface
  reason as the no-auth scenario
  ([scaffolding backlog §3](../../../02-architecture/scaffolding.backlog.md)).
- **The other auth sources** — the no-auth source is
  [`da/api-plugin-from-scratch`](./create-api-plugin-from-scratch.md); the
  `microsoft-entra` / `oauth` sources are
  [`da/api-plugin-from-scratch-oauth`](./create-api-plugin-from-scratch-oauth.md).
  Each is its own scenario.
- **The spec-parser / existing-API path** — this is the *new API from scratch*
  template (a bundled sample spec, pre-baked action); the *existing API spec*
  path is covered by
  [`da/api-plugin-from-existing-api`](./create-api-plugin-from-existing-api.md).
- **Provision-time API-key registration** — the `${{APIKEY_REGISTRATION_ID}}`
  env ref is preserved verbatim by render; the key registration it later
  resolves to is a provision concern, not a scaffold-output one.
- **Surface mechanics** — the VS Code Quick Pick / CLI prompt-and-flag tree that
  leads to the new-API pick, the API-key auth pick and the language choice.
  Those trace to the product create flow via CLI-E2E / UI smoke, not this
  scaffold-output contract.
- **How** a single file renders or **how** the empty-variable escape preserves an
  env ref — that mechanism is owned by the composed operation specs above.
