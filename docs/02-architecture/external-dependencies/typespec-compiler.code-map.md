# TypeSpec compiler — Code Map

Navigation aid for refactor work on the TypeSpec binding. Maps each fact
in [`typespec-compiler.md`](typespec-compiler.md) to its current location
in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`typespec-compiler.md`](typespec-compiler.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `typespec-compiler.md` §1) | File(s) |
|---|---|
| §1.1 Compiler invocation (today: CLI via `npx`) | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (`TypeSpecCompileDriver.execute` — `npx --package=@typespec/compiler tsp compile`) |
| §1.1 / §1.4 Compile orchestration entry (drives `npm install` then compile) | `packages/fx-core/src/common/tools.ts` (`runForTypeSpecProject`), `packages/fx-core/src/core/FxCore.ts` (call site), `packages/fx-core/src/component/driver/teamsApp/teamsappMgr.ts` (call site) |
| §1.2 `tspconfig.yaml` + main-file argument plumbing | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (`getTypeSpecArgs`, `TypeSpecCompileArgs`), `packages/fx-core/src/component/driver/typeSpec/constants.ts` |
| §1.3 M365 emitter use (decorators, manifest output) | (No toolkit code — owned entirely by `@microsoft/typespec-m365-copilot` invoked inside the user's `tsp compile`.) |
| §1.3 OpenAPI emitter output consumption | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (reads `openApiSpecsFolderPath` after compile) |
| §1.4 User-project layout assumed at runtime | (No code; observed by the `npm install` + `npx` calls in `runForTypeSpecProject` / `TypeSpecCompileDriver.execute`.) |
| §1.5 DA manifest filename + multi-spec action-id matching | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (`defaultDAManifestFileName`, single-spec vs multi-spec branch using `actions[].id`) |
| §1.5 OpenAPI-extension patch step layered on top of Kiota output | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (`patchOpenApiExtensionsIntoPluginManifest` call) |
