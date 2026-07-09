# External dependencies

Fact pages for the external substrate the Microsoft 365 Agents Toolkit binds
to. Each page captures **what is fixed outside the codebase** — APIs, identity,
service endpoints, registered app metadata — so that refactor decisions in
[`../`](../README.md) can reason against
a stable boundary.

## Page shape (template)

Each topic is captured by **two sibling files** with different lifecycles:

### Fact page — `<topic>.md`

Stable contract. Three sections:

1. **Facts the toolkit is bound to** — fields, values, library choices,
   per-flow contracts. Purely external; no engine-internal symbols, no file
   paths. If an item names a TS interface, class, or function defined in
   this repo, it is **not** a fact about an external dependency — it is an
   internal-architecture concern and belongs in
   [`../`](../README.md). When an
   external fact happens to be enumerated in code (a const map, an enum, a
   string literal list), transcribe the **data** into §1 and link the
   source file from the code map. The data is the fact; the code shape
   that holds it is not.
2. **Constraints derived from these facts** — numbered, one-line rules a
   refactor must honor. Each is a direct consequence of §1. State the rule
   in terms of the external fact (e.g. "must resolve URL per sovereign
   environment"), not the helper that implements it today (e.g. "must call
   `getResourceServiceEndpoint`"); helper names belong in the code map.
3. **Open questions** — gaps the refactor needs to close. Each is tracked
   as a `Proposed` ADR stub under
   [`../adr/`](../adr/README.md); link
   the ADR ID from the bullet. These are not facts; do not derive constraints
   from them.

See **Updating a fact page** under the Code map section below for the rules
on when §1 and §2 changes require an ADR.

### Code map — `<topic>.code-map.md`

Navigation aid for refactor work. Maps each fact in the sibling fact page to
its current location in source. Expected to churn with refactors; **not part
of the contract**. Updates do not require an ADR.

Every fact in §1 of the fact page must have a row in the code map. If a
"fact" has no anchor in source, it is not a fact about the toolkit.

**Updating a fact page:**

- **Adding** a new §1 fact (typically pure upstream sync — e.g. a new
  pre-authorized host client ID published by another Microsoft team) only
  requires updating the code map in the same PR. No ADR.
- **Changing or removing** a §1 fact requires an accepted ADR plus the
  code-map update in the same PR — it is changing what the toolkit is bound
  to.
- **Adding** a new §2 constraint requires an accepted ADR; link it from the
  constraint line.

## Pages

| Topic | Fact page | Code map |
|---|---|---|
| Identity & login (first-party AAD app, broker, sovereign clouds, token-provider boundary) | [`identity-and-login.md`](identity-and-login.md) | [`identity-and-login.code-map.md`](identity-and-login.code-map.md) |
| Manifest schemas (Teams app, Declarative Agent, API Plugin — host, versions, JSON Schema draft) | [`manifest-schemas.md`](manifest-schemas.md) | [`manifest-schemas.code-map.md`](manifest-schemas.code-map.md) |
| Office Developer Runtime (ODR) (Windows binary, `odr list` contract, MCP-server enumeration) | [`odr.md`](odr.md) | [`odr.code-map.md`](odr.code-map.md) |
| Kiota (`@microsoft/kiota` package, native binary discovery, `generatePlugin` contract) | [`kiota.md`](kiota.md) | [`kiota.code-map.md`](kiota.code-map.md) |
| SPFx scaffolding tooling (Yeoman + `@microsoft/generator-sharepoint`, web part GUIDs, pre-release successor `@microsoft/spfx-cli` + `@microsoft/spfx-template-api`) | [`spfx-tooling.md`](spfx-tooling.md) | [`spfx-tooling.code-map.md`](spfx-tooling.code-map.md) |
| TypeSpec compiler (`@typespec/compiler` + M365 / OpenAPI emitters, compile-input contract) | [`typespec-compiler.md`](typespec-compiler.md) | [`typespec-compiler.code-map.md`](typespec-compiler.code-map.md) |
| OpenAPI spec parser (`@microsoft/m365-spec-parser` public surface, URL-vs-path input, validation diagnostics) | [`openapi-spec-parser.md`](openapi-spec-parser.md) | [`openapi-spec-parser.code-map.md`](openapi-spec-parser.code-map.md) |
| Office Add-in tooling (`office-addin-project` / `office-addin-manifest`, `convertProject` precondition, MetaOS schema pins) | [`office-addin-tooling.md`](office-addin-tooling.md) | [`office-addin-tooling.code-map.md`](office-addin-tooling.code-map.md) |
| Microsoft Graph DriveItem resolution (`/sites`, `/shares` endpoints, share-URL encoding, stable identifiers) | [`graph-driveitem-resolution.md`](graph-driveitem-resolution.md) | [`graph-driveitem-resolution.code-map.md`](graph-driveitem-resolution.code-map.md) |

## What does NOT live here

- Engine-internal decisions about how to *consume* these dependencies (token
  passing, credential caching, retry policy) — ADRs in
  [`../adr/`](../adr/README.md).
- How a feature uses a dependency end-to-end — specs in
  [`../../03-specs/`](../../03-specs/README.md).
- Product intent / scenarios → [`../../01-product/`](../../01-product/README.md).
