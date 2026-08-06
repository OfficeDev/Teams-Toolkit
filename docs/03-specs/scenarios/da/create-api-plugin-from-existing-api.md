# Scenario — Create Declarative Agent with API Plugin from Existing OpenAPI (`da/api-plugin-from-existing-api`)

- **Status:** Accepted (Decision source [ADR-0016 §5](../../../02-architecture/adr/ADR-0016-declarative-template-format.md) + [ADR-0018](../../../02-architecture/adr/ADR-0018-scaffold-runtime-test-pyramid.md)) — ready for scenario-tier (T3) tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Scenario ID:** `SCN-DA-CREATE-API-PLUGIN-FROM-EXISTING-API` (the declarative
  agent with an API plugin action generated from a user-supplied OpenAPI
  description document - the `Start with an OpenAPI Description Document` action
  source)
- **Template id:** `da/api-plugin-from-existing-api` (create)
- **Languages:** `common` (`csharp` is deferred; this scenario covers the
  non-C# OpenAPI path)

This is the **vertical** contract for one template: what scaffolding the
`da/api-plugin-from-existing-api` create package produces **end-to-end**. Unlike
the `new API from scratch` scenarios, this package is not pure render. It first
renders the common declarative-agent shell, then runs the v4-owned
`openapi/generate-plugin-files` post-render step, which validates the
description document through the shared `validateOpenAPISpec` gate and then
delegates the plugin generation itself to the shared declarative-agent plugin
generator (`src/common/daSpecParser`) so the `TEAMSFX_KIOTA_NPM_INTEGRATION`
flag selects the same generator branch the legacy path uses. That step emits the
filtered OpenAPI document, generates the API plugin manifest, injects the
generated action into the declarative agent manifest, propagates OpenAPI
summaries/descriptions into conversation starters, and adds auth registration
actions to `m365agents*.yml` when selected operations require plugin auth. A
final feature-gated `da/set-sensitivity-label` step owns the optional
sensitivity mutation. Per the
[specs README](../../README.md#operation-spec-vs-scenario-spec--orthogonal-cuts-not-duplication),
these AC rows are the source of the ADR-0018 **T3** assertions, run with the
whole template scaffolded under `InMemoryRuntime` (every row is **L1**).

## Acceptance Criteria

| ID                              | Tier | Given                                                                                       | When                                          | Then                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ---- | ------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SCN-CREATE-APIPLUGIN-OPENAPI-01 | L1   | empty target, language `common`, valid OpenAPI spec, selected operation `GET /repairs`      | scaffold completes                            | the render phase writes exactly the common shell file set - `.gitignore`, the four `.vscode/*.json`, `README.md`, `appPackage/declarativeAgent.json`, `appPackage/instruction.txt`, `appPackage/manifest.json`, `appPackage/color.png`, `appPackage/outline.png`, `env/.env.dev`, `env/.env.local`, `evals/prompts.json`, `m365agents.yml`, `m365agents.local.yml` |
| SCN-CREATE-APIPLUGIN-OPENAPI-02 | L1   | same inputs                                                                                 | the `openapi/generate-plugin-files` step runs | `appPackage/ai-plugin.json`, the filtered `appPackage/apiSpecificationFile/openapi.yaml`, and the original `appPackage/apiSpecificationFile/openapi.yaml.original` are generated; the plugin has one `OpenApi` runtime, `auth.type == "None"`, and `spec.url == "apiSpecificationFile/openapi.yaml"`                                                               |
| SCN-CREATE-APIPLUGIN-OPENAPI-03 | L1   | generated plugin manifest exists                                                            | scaffold completes                            | `appPackage/declarativeAgent.json` keeps `name == "{{appName}}"` rendered to the caller floor value and appends exactly one generated action `{ id: "action_1", file: "ai-plugin.json" }`                                                                                                                                                                          |
| SCN-CREATE-APIPLUGIN-OPENAPI-04 | L1   | scaffold completes                                                                          | inspect `appPackage/manifest.json`            | `manifestVersion == "1.29"`; the env ref `id == "${{TEAMS_APP_ID}}"` survives render; `copilotAgents.declarativeAgents[0] == { id: "declarativeAgent", file: "declarativeAgent.json" }`                                                                                                                                                                            |
| SCN-CREATE-APIPLUGIN-OPENAPI-05 | L1   | empty target with `TEAMSFX_SENSITIVITY_LABEL` disabled                                      | scaffold completes                            | the pipeline runs `require-empty-target` before `openapi/generate-plugin-files`; `da/set-sensitivity-label` is skipped and no other post-render steps run                                                                                                                                                                                                          |
| SCN-CREATE-APIPLUGIN-OPENAPI-06 | L1   | non-empty target                                                                            | scaffold starts                               | `require-empty-target` fails first with **`UserError`** and writes nothing                                                                                                                                                                                                                                                                                         |
| SCN-CREATE-APIPLUGIN-OPENAPI-07 | L1   | identical inputs re-run                                                                     | scaffold completes twice                      | deterministic - identical `written` sets and identical generated `appPackage/ai-plugin.json` bytes                                                                                                                                                                                                                                                                 |
| SCN-CREATE-APIPLUGIN-OPENAPI-08 | L1   | selected OpenAPI operation uses API-key auth                                                | scaffold completes                            | both `m365agents.yml` and `m365agents.local.yml` include an `apiKey/register` action for the auth scheme, `apiSpecPath: ./appPackage/apiSpecificationFile/openapi.yaml`, and a `registrationId` environment-file output                                                                                                                                            |
| SCN-CREATE-APIPLUGIN-OPENAPI-09 | L1   | selected OpenAPI operation has a `summary` or `description`                                 | scaffold completes                            | `appPackage/declarativeAgent.json` includes a `conversation_starters` entry whose `text` comes from the selected operation summary, falling back to description; duplicates are not added and the DA manifest keeps at most six starters                                                                                                                           |
| SCN-CREATE-APIPLUGIN-OPENAPI-10 | L1   | generated plugin response semantics reference a static template file                        | scaffold completes                            | the referenced adaptive card template is written under `appPackage/adaptiveCards/`                                                                                                                                                                                                                                                                                 |
| SCN-CREATE-APIPLUGIN-OPENAPI-11 | L1   | `TEAMSFX_KIOTA_NPM_INTEGRATION` enabled (product default)                                   | scaffold completes                            | the plugin artifacts come from the shared declarative-agent plugin generator, so the Kiota branch owns `appPackage/ai-plugin.json`, the filtered spec, and `appPackage/apiSpecificationFile/openapi.yaml.original`; the step does not re-fetch the description document to produce `.original`                                                                     |
| SCN-CREATE-APIPLUGIN-OPENAPI-12 | L1   | the shared generator rejects the description document with a spec-parser failure            | scaffold fails                                | a **`SystemError`** whose source is `SpecParser` and whose name is the spec-parser error type, not the generic temporary-directory failure                                                                                                                                                                                                                         |
| SCN-CREATE-APIPLUGIN-OPENAPI-13 | L1   | the shared generator reports non-fatal warnings (for example a failed adaptive card)        | scaffold completes                            | every generator warning is forwarded to the scaffold warning channel with its spec-parser warning type and content, instead of being discarded                                                                                                                                                                                                                     |
| SCN-CREATE-APIPLUGIN-OPENAPI-14 | L1   | the description document is incompatible (validation reports errors, e.g. no supported API) | scaffold fails                                | the shared `validateOpenAPISpec` gate runs **before** generation and fails with a **`UserError`** named `invalid-api-spec`, so no plugin artifact is generated and the failure is not reported as a generator crash                                                                                                                                                |

## Composed operations

This scenario **flows through** these operation specs; their mechanics are
**referenced, never restated**:

- [`resolve-build-target`](../../operations/scaffolding/resolve-build-target.md)
  - selects the create build target (ADR-0014); the create selector routes
    `daTemplate == 'add-action' && actionSource == 'openapi'` to the
    `da/api-plugin-from-existing-api` v4 package.
- [`resolve-template-source`](../../operations/scaffolding/resolve-template-source.md)
  - picks the `da/api-plugin-from-existing-api` package and pins its
    `{version, digest}` (ADR-0006 / ADR-0015).
- [`open-template-package`](../../operations/scaffolding/open-template-package.md)
  - [`validate-template-package`](../../operations/scaffolding/validate-template-package.md)
  * opens and well-formed-checks the package (ADR-0015); content is returned
    flat and language-neutral.
- [`collect-inputs`](../../operations/scaffolding/collect-inputs.md)
  - collects `apiSpecLocation`, then resolves `apiOperations` through the
    `openapi.operations` provider against that location.
- [`build-render-context`](../../operations/scaffolding/build-render-context.md)
  - derives the render-var map from the caller floor and descriptor replaceMap;
    for this package `ApiSpecPath` is the const
    `./appPackage/apiSpecificationFile/openapi.yaml`.
- [`run-scaffold-pipeline`](../../operations/scaffolding/run-scaffold-pipeline.md)
  - executes the render phase, then the `default` pipeline's
    `require-empty-target` guard, `openapi/generate-plugin-files` step, and
    feature-gated sensitivity step. The OpenAPI step is a domain-typed
    whitelisted post-render step under ADR-0017.
- [`set-declarative-agent-sensitivity-label`](../../operations/scaffolding/set-declarative-agent-sensitivity-label.md)
  - owns the optional post-render label mutation; its flag-on vertical behavior
    is covered by
    [`SCN-DA-SENSITIVITY-LABEL`](apply-general-sensitivity-label.md).

## Flow

```mermaid
flowchart TD
  Sel[resolve-build-target + resolve-template-source: da/api-plugin-from-existing-api] --> Open[open + validate-template-package]
  Open --> Inputs[collect-inputs: apiSpecLocation + selected apiOperations]
  Inputs --> Guard{require-empty-target}
  Guard -- non-empty --> Err[UserError - nothing written]
  Guard -- empty --> Render[render phase: write common DA shell]
  Render --> Gen[openapi/generate-plugin-files]
  Gen --> Plugin[generate ai-plugin.json + filtered openapi.yaml]
  Plugin --> Agent[inject DA action + conversation starters]
  Agent --> Auth[inject m365agents auth registration when needed]
  Auth --> Done([scaffold output ready])
```

## Boundary

This scenario does **not** assert:

- **The `csharp` language** - deferred by product request for this migration
  slice; C# remains on the legacy path until its VS-specific project identifiers
  are represented in the v4 caller floor.
- **The `new API from scratch` sources** - no-auth, API-key, and OAuth / Microsoft
  Entra from-scratch templates are covered by their sibling scenario specs.
- **Remote-network availability for URL specs** - the template itself is
  `requiresNetwork:false`; if the user supplies a remote OpenAPI URL, fetching
  that user artifact is owned by the spec parser and the OpenAPI ingestion
  boundary, not by the static template package.
- **Provision-time auth registration success** - scaffold only emits the
  `apiKey/register` / `oauth/register` actions and env-file outputs. Executing
  those actions belongs to provision.
- **OpenAPI semantic validation internals** - operation validity, auth scheme
  detection, and filtered-spec generation are owned by the upstream spec parser;
  this scenario asserts only the scaffold contract around its outputs.
- **Surface mechanics** - the VS Code Quick Pick / CLI prompt-and-flag tree that
  leads to the OpenAPI pick. Those trace to product scenarios or surface tests,
  not this scaffold-output contract.
