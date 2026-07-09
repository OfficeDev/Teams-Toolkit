# Kiota — Code Map

Navigation aid for refactor work on the Kiota binding. Maps each fact in
[`kiota.md`](kiota.md) to its current location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`kiota.md`](kiota.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `kiota.md` §1) | File(s) |
|---|---|
| §1.1 Package + pinned version | `packages/fx-core/package.json` (`dependencies["@microsoft/kiota"]`) |
| §1.2 Native binary requirement (no pure-JS path) | (No code; observed by absence of any alternative import in `packages/fx-core/src/common/kiotaClient.ts`) |
| §1.3 Binary discovery (env var, `pkg` bundle, default) | `packages/fx-core/src/common/kiotaClient.ts` (`setKiotaBinaryPath`) |
| §1.4 `setKiotaConfig`, `searchDescription`, `getKiotaTree`, `generatePlugin` imports + usage | `packages/fx-core/src/common/kiotaClient.ts` (top-level import + `searchOpenAPISpec`, `listAPITreeInfo`, `kiotageneratePlugin`) |
| §1.5 `generatePlugin` config object construction | `packages/fx-core/src/common/kiotaClient.ts` (`kiotageneratePlugin`) |
| §1.5 TypeSpec-driver call sites for `kiotageneratePlugin` | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (`TypeSpecCompileDriver.execute` — single-spec + multi-spec branches), `packages/fx-core/src/common/daSpecParser.ts` (`patchOpenApiExtensionsIntoPluginManifest` call chain) |
| §1.5 OpenAPI-plugin call sites for `kiotageneratePlugin` | `packages/fx-core/src/component/generator/openApiSpec/kiota.ts`, `packages/fx-core/src/component/generator/openApiSpec/helper.ts` |
| §1.6 Log-level filter for Kiota errors | `packages/fx-core/src/common/kiotaClient.ts` (`ERROR_LOG_LEVEL = 4`, `listAPITreeInfo` filter, `kiotageneratePlugin` filter) |
| §1.6 Toolkit error wrapper for `generatePlugin` failures | `packages/fx-core/src/common/kiotaClient.ts` (`KiotaGeneratePluginError` import + throw site) |
