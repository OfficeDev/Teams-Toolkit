# OpenAPI spec parser — Code Map

Navigation aid for refactor work on the `@microsoft/m365-spec-parser`
binding. Maps each fact in
[`openapi-spec-parser.md`](openapi-spec-parser.md) to its current location
in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`openapi-spec-parser.md`](openapi-spec-parser.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `openapi-spec-parser.md` §1) | File(s) |
|---|---|
| §1.1 Package source | `packages/spec-parser/` (workspace) |
| §1.1 `fx-core` dependency declaration | `packages/fx-core/package.json` (`dependencies["@microsoft/m365-spec-parser"]`) |
| §1.2 `new SpecParser(url-or-path, options)` call sites | `packages/fx-core/src/component/generator/openApiSpec/helper.ts` (`new SpecParser` — see also `getParserOptions`), `packages/fx-core/src/component/generator/openApiSpec/common.ts` (`new SpecParser`) |
| §1.2 Per-flow parser options | `packages/fx-core/src/component/generator/openApiSpec/helper.ts` (`getParserOptions(ProjectType, allowApiKeyAuth)`) |
| §1.3 Validation / list / generate call sites | `packages/fx-core/src/component/generator/openApiSpec/helper.ts`, `packages/fx-core/src/component/generator/openApiSpec/common.ts`, `packages/fx-core/src/component/generator/openApiSpec/declarativeAgentGenerator.ts`, `packages/fx-core/src/component/generator/openApiSpec/customEngineAgentGenerator.ts`, `packages/fx-core/src/component/generator/openApiSpec/messageExtensionGenerator.ts` |
| §1.3 / Kiota interop adapter | `packages/fx-core/src/component/generator/openApiSpec/kiota.ts` |
| §1.4 / §1.5 Diagnostic surfacing for parser validation failures | `packages/fx-core/src/component/generator/openApiSpec/common.ts`, `packages/fx-core/src/component/generator/openApiSpec/const.ts` (error keys) |
