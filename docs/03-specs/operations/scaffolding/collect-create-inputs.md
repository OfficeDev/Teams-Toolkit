# Operation — `collect-create-inputs`

- **Status:** Accepted (design-first) — ready for tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Decision source:** [ADR-0016](../../../02-architecture/adr/ADR-0016-declarative-template-format.md)
  (decision 2 `optionsSchema`, decision 5 language axis, decision 6 native
  `QuestionSpec` walked by a surface-neutral driver)
- **Upstream operations:** [`collect-inputs`](collect-inputs.md) (the pure
  questions → answers walk this composes) and
  [`open-template-package`](open-template-package.md) (the floor-zip read this
  reuses, plus the sibling `openCreateQuestions` for the `questions.json` entry)
- **PRD/scenario:** [`scenarios/da/create-mcp-server`](../../scenarios/da/create-mcp-server.md)

## Purpose

Run one create template's **Q2 + common create floor** over the host
`UserInteraction`, producing the v4 `Answers` and the caller floor needed by the
scaffold (`language`, `folder`, `app-name`). This is the live create caller of
the shared [`collect-inputs`](collect-inputs.md) question-walk engine: it loads
the authored `questions.json` and the `descriptor` (its `optionsSchema` +
`languages`) from caller-supplied package metadata bytes
(`templates-metadata.zip` in production, full `templates.zip` in tests), injects
the common create floor questions, builds a `CollectInputsPort` whose prompt face
is a thin adapter over the host's surface-neutral `UserInteraction`, and walks
the combined question set once.

It is the half of the front-loaded create funnel that comes **after** the engine
is decided. [`resolve-build-target`](resolve-build-target.md) picks the
`templateId` and the `v4` engine (Q1 / principle 1); this operation then asks the
v4 template's own follow-up questions plus the create floor through the shared
v4 question-walk engine — never the v3 question tree. A v4 route's template-local
Q2 remains authored once, in `questions.json`; the common create floor is
operation-owned and injected once, not repeated in every template.

## Boundary

The operation owns the **surface composition** for the create Q2 + common floor
and nothing else:

1. **The prompt bridge** — `createUiPromptUI(ui)` adapts the v4 `PromptUI`
   (`ask` / `askMulti`) onto the host `UserInteraction` (`selectOption` /
   `inputText` / `selectOptions`). It maps a v4 identity-only `OptionItem` to the
   surface option shape and projects the surface result back to the selected
  `id` string / `string[]`. For text questions with `validation`, it also maps
  the named validator registry entry to `InputTextConfig.validation`, using the
  current collected answers as validator context, so interactive hosts can
  reject invalid input before the scaffold runtime receives it.
2. **The port assembly** — build the `CollectInputsPort` from the prompt bridge,
  the engine-owned `optionsFrom` provider registry, the engine-owned validator
  registry, and the shared `evaluate-expression` evaluator (whitelist +
  injected feature-flag reader). The provider/validator implementations are
  registered extension points (`src/v4/providers/createOptionsProviders.ts`,
  `src/v4/validators/createInputValidators.ts`), not code owned by this surface
  adapter.
3. **The combined run** — load `questions.json` + the descriptor's
  `optionsSchema` / `languages` from the caller-supplied metadata/full-package
  bytes, prepend/append the operation-owned common floor questions (`folder` +
  `app-name`, plus the descriptor-bound `language` axis), then call
  `collect-inputs` once.
4. **The floor write-back** — copy the common floor answers back onto the host
  `Inputs` keys the scaffold and existing telemetry surfaces read
  (`QuestionNames.Folder`, `QuestionNames.AppName`, and the v4 `language`
  answer). This write-back is caller glue; the shared question-walk engine does
  not know about `Inputs`.

It does **not** decide routing (that is
[`resolve-build-target`](resolve-build-target.md)), does **not** ask Q1, does
**not** render or scaffold (that is `scaffoldDeclarativeFromV4Channel`), and adds
**no** question grammar — every `condition` / `optionsFromParams` is the shared
evaluator's (collect-inputs INV-6).

The default `optionsFrom` registry includes MCP server-type discovery, local MCP
server listing, MCP tool listing, and OpenAPI operation listing. Live local-server
detection is injected through the ODR listing dependency so tests can pass an
in-memory provider while production uses the default registry.

## Inputs

| Input | Type | Origin |
|-------|------|--------|
| `packageBytes` | `Buffer` (injected) | `templates-metadata.zip` bytes from the staged artifact snapshot, or a full bundled-floor `templates.zip` in tests; injectable so the operation is CI-testable from an in-memory floor with no built artifact |
| `locator` | `DeclarativeLocator` (`{ kind, templateId }`) | the engine-decided create target (e.g. `{ kind:"create", templateId:"da/mcp-server" }`) |
| `entryParams` | `Answers` | pre-filled answers — a CLI arg / URL seed, **or** the upstream `walk`'s Q1 dimension picks (`BuildTarget.answers`); a pre-filled question is used as-is, never prompted (collect-inputs INPUT-12) |
| `ui` | `UserInteraction` | the host surface (`@microsoft/teamsfx-api`); the only non-v4 type, upstream of both worlds (INV-7 preserved) |
| `deps` | `{ optionsProvider?, flagReader?, surface? }` (injected, defaulted) | provider registry override (merged over the default `optionsFrom` provider registry, e.g. `mcp.serverTypes`, `mcp.localServers`, `mcp.tools`, `openapi.operations`) + feature-flag reader (default: env-backed) + the host `surface` (`vscode` / `cli` / `vs`, default `vscode`) that gates the `csharp` language axis |

## Outputs

`Promise<Result<Answers, FxError>>`:

- `ok(Answers)` — each asked question's value (scalar `string`, or `string[]` for
  a `multiSelect`) ∪ provider `derived.<id>.<key>`, ∪ the `entryParams` seed, ∪
  common create floor answers (`folder`, `app-name`, and `language` when the
  descriptor-bound language axis is recorded). The create caller writes the
  floor subset back to the host `Inputs` bag before scaffold.
- `UserError` — a user-fixable input failure (a `uri` that does not parse,
  surfaced as `INPUT_VALIDATION_FAILED`), a missing required non-interactive
  floor value, or a surface cancellation.
- `SystemError` — an engine-side break (a missing `questions.json` /
  `descriptor.json` in the floor, an unknown provider / validator, or a malformed
  common floor question definition).

## Acceptance Criteria

| ID | Tier | Given | When | Then |
|----|------|-------|------|------|
| CCI-01 | L1 | the real shipped `da/mcp-server` (in-memory floor), the **remote-only** `mcp.serverTypes` provider, a scripted UI answering the url + `authType=none` | `runCreateInputs` | `ok(Answers)` with `mcpServerType="remote"` (auto-selected by `skipSingleOption`, **not** prompted), `mcpServerUrl=<url>`, `authType="none"` |
| CCI-02 | L1 | the same template, a `mcp.serverTypes` provider yielding `[remote, local]`, a scripted UI picking `local` then `authType=none` | `runCreateInputs` | `mcpServerType="local"` (prompted — two options, no auto-skip), `mcpServerUrl` **not** asked (its `mcpServerType=='remote'` condition is false), `authType="none"` |
| CCI-03 | L1 | `entryParams={ mcpServerUrl:<url> }`, remote-only provider, a scripted UI answering `authType=oauth` | `runCreateInputs` | `mcpServerUrl` taken from the seed (**not** prompted), `authType="oauth"` (auth variants flow through unchanged) |
| CCI-04 | L1 | remote-only provider, a scripted UI returning a non-uri (`"not a uri"`) for `mcpServerUrl` | `runCreateInputs` | `err` `UserError` named `INPUT_VALIDATION_FAILED` — the `uri` validator is wired into the port |
| CCI-05 | L1 | the `da/mcp-server` descriptor whose `languages=["common"]` | `runCreateInputs` | the create floor composer adds no language question; `Answers` carries no `language` key |
| CCI-06 | L1 | a `singleSelect` `QuestionSpec` + v4 `OptionItem[]`, a fake `UserInteraction` | `createUiPromptUI(ui).ask(q, options)` | `ui.selectOption` is called with the options mapped to the surface shape (`returnObject=false`); the chosen `id` is returned as a `string` |
| CCI-07 | L1 | a `text` `QuestionSpec` (no options), a fake `UserInteraction` | `createUiPromptUI(ui).ask(q, undefined)` | `ui.inputText` is called; the entered string is returned |
| CCI-08 | L1 | a `multiSelect` `QuestionSpec` + v4 `OptionItem[]`, a fake `UserInteraction` | `createUiPromptUI(ui).askMulti(q, options)` | `ui.selectOptions` is called; the selected `id`s are returned as a `string[]` |
| CCI-09 | L1 | the in-memory floor | `openCreateQuestions(floor, { kind:"create", templateId:"da/mcp-server" })` | `ok([mcpServerType, mcpServerUrl, authType])` (the three authored questions); an unknown `templateId` is a `SystemError` named `PackageFileMissing` |
| CCI-10 | L1 | a `singleSelect` `QuestionSpec`, a fake `UserInteraction` whose `selectOption` returns `{ type: "back" }` | `createUiPromptUI(ui).ask(q, options)` | the host `back` is projected to `ok({ kind: "back" })` (collect-inputs INPUT-16) |
| CCI-11 | L1 | a `text` `QuestionSpec`, a fake `UserInteraction` whose `inputText` returns `{ type: "back" }` | `createUiPromptUI(ui).ask(q, undefined)` | the host `back` is projected to `ok({ kind: "back" })` |
| CCI-12 | L1 | a `multiSelect` `QuestionSpec`, a fake `UserInteraction` whose `selectOptions` returns `{ type: "back" }` | `createUiPromptUI(ui).askMulti(q, options)` | the host `back` is projected to `ok({ kind: "back" })` |
| CCI-13 | L1 | a `singleSelect` `QuestionSpec`, a caller-supplied `step` | `createUiPromptUI(ui).ask(q, options, 2)` | the `step` is threaded onto the host `SingleSelectConfig` (the Back-button gate), so the host shows Back past the first prompt |
| CCI-14 | L1 | a descriptor language list containing `csharp`, `surface="vscode"` (the VS Code extension) | `gateLanguagesBySurface(languages, surface, flagReader)` | `csharp` is dropped regardless of `TEAMSFX_CLI_DOTNET` — the VS Code extension never scaffolds C# (mirrors v3, whose template metadata carries no `csharp`) |
| CCI-15 | L1 | a language list containing `csharp`, `surface="cli"` / `"vs"` | `gateLanguagesBySurface(...)` | `csharp` is kept only when `flagReader("TEAMSFX_CLI_DOTNET")` is true (mirrors v3 CLI `listTemplates` / `create`); with the flag off it is dropped |
| CCI-16 | L1 | a language list with no `csharp` (e.g. `["typescript","javascript"]` / `["common"]`) | `gateLanguagesBySurface(...)` | the list passes through unchanged, order preserved — the gate only ever removes `csharp` |
| CCI-17 | L1 | a VS Code Teams Agents and Apps template descriptor language list containing `python`; and a non-Teams descriptor language list containing `python` | `runCreateInputs` asks the language axis | the Teams Agents and Apps Python language option keeps label `Python` and carries the localized `Preview` description, matching the v3 Teams Agents and Apps language picker; the non-Teams Python language option has no `Preview` description |
| CCI-18 | L1 | the real shipped `da/graph-connector` (in-memory floor), a scripted UI answering connector name + connection id | `runCreateInputs` | `ok(Answers)` with `graphConnectorName` and `graphConnectorConnectionId`; both validators are wired into the port |
| CCI-19 | L1 | the same template, a scripted UI returning a reserved Microsoft Graph external connection id prefix | `runCreateInputs` | `err` `UserError` named `INPUT_VALIDATION_FAILED` — the graph connector connection-id validator is wired into the port |
| CCI-20 | L1 | the real shipped standalone `graph-connector` (in-memory floor), a scripted UI answering connector name + connection id | `runCreateInputs` | `ok(Answers)` with `language="typescript"`, `graphConnectorName`, and `graphConnectorConnectionId`; the TypeScript-only package owns its Q2 questions instead of falling back to v3 |
| CCI-21 | L1 | the DA+MCP v4 route, a scripted UI answering template questions and then `folder` + `app-name` in the same create-input walk | `runCreateInputs` | `ok(Answers)` includes the template answers plus `folder` and `app-name`; the caller writes the floor answers to the host `Inputs` bag before scaffold, with no separate `collectCreateFloor` prompt engine |
| CCI-22 | L1 | the same route, a scripted UI that cancels on `folder` or `app-name` | `runCreateInputs` | `err` is the cancellation `UserError` propagated unchanged; the front door does not scaffold |
| CCI-23 | L1 | `entryParams` already contains `folder`, `app-name`, or `language` | `runCreateInputs` | those common floor values are used as pre-filled answers and are not prompted again; validation/bounds checking still happens in the shared walk |
| CCI-24 | L1 | an interactive text question with a registered validator (`mcpServerUrl` or common-floor `app-name`) and earlier answers that the validator depends on | `runCreateInputs` | the prompt bridge passes a validation callback to `inputText`, bound to the current answers, so invalid text can be rejected during collection rather than only later at scaffold runtime |

## Flow

```mermaid
flowchart TD
  start(["runCreateInputs(package bytes, locator, entryParams, ui, deps)"]) --> q["openCreateQuestions(package bytes, locator)"]
  start --> d["openDeclarativePackage(package bytes, locator) → descriptor"]
  d --> os["optionsSchema + languages (parsed from descriptor)"]
  q --> compose["compose input questions\ndescriptor language + template questions + common floor"]
  os --> compose
  compose --> port
  os --> port["build CollectInputsPort\n(createUiPromptUI(ui) + provider registry + validator registry + evaluate)"]
  port --> ci["collectInputs(combined questions, optionsSchema, entryParams, port)"]
  ci --> wb["write floor subset back to Inputs\n(folder, app-name, language)"]
  wb --> out(["ok(Answers) | UserError | SystemError"])
```

## Invariants

- **INV-1** — The prompt bridge and the orchestrator are v4-owned; they import no
  v3 symbol. `UserInteraction` is `@microsoft/teamsfx-api` (upstream of both
  worlds), not v3, so INV-7 holds.
- **INV-2** — The template-local Q2 questions are the authored `questions.json`
  walked by the surface-neutral driver, and the common floor questions are
  operation-owned normalized `QuestionSpec`s in the same walk. Neither is ever
  rehydrated into a v3 `IQTreeNode` (ADR-0016 decision 6 / collect-inputs INV-1).
  A `questions` array item may also be a `{ "use": "<name>" }` reference to a
  shared fragment under `v4/_shared/questions/<name>.json`; the loader splices the
  fragment's own `questions` in place (recursively; bare-name / cycle guarded) so
  the walk always sees one flat `QuestionSpec[]`. This is authoring-time reuse
  only (e.g. the `llm-service` fragment shared by the custom-copilot / CEA
  templates) — it changes neither the resolved questions nor any behavior.
- **INV-3** — A v4 identity-only `OptionItem` carries no configuration payload
  across the bridge (no v3 `option.data`); only its `id` round-trips
  (collect-inputs INV-2).
- **INV-4** — The feature-flag reader is injected; v4 imports no
  `featureFlagManager`. The default reads `process.env`.
- **INV-5** — The package bytes are injectable, so the operation is CI-testable
  from an in-memory floor built from the loose `templates/v4` source — no built
  `templates.zip` artifact required.
- **INV-6** — The bridge threads the caller's 1-based `step` onto each host config
  (the Back-button gate) and projects a host `back` result to `{ kind: "back" }`,
  so [`collect-inputs`](collect-inputs.md) drives back navigation
  surface-neutrally (CCI-10..13 / INPUT-16..19).
- **INV-7** — The `csharp` language axis is gated by `surface` + the injected
  `TEAMSFX_CLI_DOTNET` reader **before** the create floor composer builds the language question
  (CCI-14..16): the VS Code extension never offers C#, the CLI / VS surfaces offer
  it only under the flag. The gate only removes `csharp`; every other language is
  untouched. This is the v4 mirror of v3's platform gating (C# templates live on
  `Platform.VS`, which the CLI selects only when `CLIDotNet` is on).
- **INV-8** — Q2 and the common create floor are one input walk. `folder` /
  `app-name` are not collected by a second front-door prompt seam after Q2; they
  participate in the same prefill, back/cancel, non-interactive, validation, and
  answer-merge semantics as template questions.
- **INV-9** — Provider and validator implementations are registered extension
  points. This surface adapter composes the registries into `CollectInputsPort`
  and may accept injected overrides for tests or live providers, but concrete
  implementations such as MCP tools, OpenAPI operations, and Graph connector
  validators live in dedicated provider/validator files, parallel to pipeline
  step implementations.
- **INV-10** — Tests are layered at the same boundary as the operation. Most
  Q2/common-floor behavior is tested with synthetic metadata or direct
  [`collect-inputs`](collect-inputs.md) fixtures plus fake registries; concrete
  MCP/OpenAPI/Graph provider and validator behavior is tested in the dedicated
  provider/validator test files. Real `templates/v4` package bytes are used only
  for focused integration checks such as descriptor/question loading and the
  default registry wiring, and may be shared across tests in that file because
  package bytes are immutable input.

## Notes

- `openCreateQuestions` is the `questions.json` sibling of
  `openDeclarativePackage` (which reads only `descriptor.json` / `pipeline.json` /
  `content/**`). It locates the same `v4/<kind>/<templateId>/` subtree and parses
  the `{ questions: QuestionSpec[] }` envelope; a structural type guard narrows
  the parsed JSON with no `as` cast, deferring full field validation to the
  build-time `validate-template-package`.
- The bridge supports the question kinds the create templates and common floor
  use today — `singleSelect` / `text` via `ask`, `multiSelect` via `askMulti`,
  and the common floor's folder/app-name prompts through the same prompt bridge.
  Other kinds (`confirm` / `singleFile` / `singleFileOrText`) are an explicit
  `SystemError` until a template needs them, rather than a silent mismatch.
- Local-server Q2 uses the `mcp.serverTypes` and `mcp.localServers` providers
  backed by the injected ODR listing dependency. The provider implementation is
  tested directly, while `runCreateInputs` tests focus on registry wiring and
  question-walk behavior.
- **Q1 answers seed Q2.** The upstream `walk`
  ([`resolve-build-target`](resolve-build-target.md) /
  [`walk-create-selector`](walk-create-selector.md)) surfaces its Q1 dimension
  picks as `BuildTarget.answers`; the create front door passes them straight in
  as `entryParams`, so a Q2 question whose `name` collides with a Q1 dimension is
  taken from the pick and never re-asked (INPUT-12) — the same
  skip-already-answered linkage the v3 visitor gives the v3 path. No translation
  happens here: the picks are the selector's neutral keys, and a v4 Q2 question
  reading one (rare today) reads it by that key.
- **The `language` axis lives here (ADR-0014 Amendment 2).** Routing
  ([`resolve-build-target`](resolve-build-target.md)) resolves no language; the
  resolved template's `descriptor.languages` is the option range of the Q0
  `language` question this operation composes into the `questions` array before
  calling [`collect-inputs`](collect-inputs.md) (CCI-05 / INPUT-13, ADR-0016 decision 5).
  A single-language template (`["common"]`) auto-skips it — the shipped
  `da/mcp-server` never prompts and the scaffolder falls back to `common`; a
  pre-filled `language` in `entryParams` is used-as-is (INPUT-12).
- **C# is surface- + flag-gated (INV-7, CCI-14..16).** Before the language range
  reaches [`collect-inputs`](collect-inputs.md), `gateLanguagesBySurface` filters
  `csharp` out unless `surface !== "vscode"` **and** the injected
  `TEAMSFX_CLI_DOTNET` reader is on. So the VS Code extension never scaffolds C#
  (its resolved `surface` is `vscode`), while the CLI and the VS surface expose C#
  only under the flag — the v4 mirror of v3, where the C# templates live on
  `Platform.VS` and the CLI switches to them only when `CLIDotNet` is set
  (`listTemplates` / `create`). The `surface` is resolved once in the create front
  door (`surfaceOf(inputs.platform)`) and injected; the gate itself imports no v3
  symbol and no `featureFlagManager` (INV-1 / INV-4).
