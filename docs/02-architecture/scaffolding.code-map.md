# Scaffolding subsystem — Code Map

Navigation aid for refactor work on the scaffolding subsystem. Maps each
essential capability in [`scaffolding.md`](scaffolding.md) §2 and each
cross-cutting property in §3 to its current location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`scaffolding.md`](scaffolding.md#3-cross-cutting-properties); updates
> here do not require an ADR.

## Capabilities (§2)

| Capability | File(s) |
|---|---|
| §2.1 Template distribution — local vs remote selection | `packages/fx-core/src/component/generator/templateHelper.ts` (`useLocalTemplate`), `packages/fx-core/src/component/generator/utils.ts` (`getTemplateUrl`, `getTemplateLatestVersion`, `getTemplateVSLatestVersion`, `getTemplateZipUrlByVersion`), `packages/fx-core/src/common/templates-config.json` |
| §2.1 Remote zip fetch + unzip | `packages/fx-core/src/component/generator/utils.ts` (`fetchZipFromUrl`, `unzip`, `fetchTagList`), `packages/fx-core/src/component/generator/generatorAction.ts` |
| §2.1 Cached metadata reuse on VSC | `packages/fx-core/src/component/generator/templates/metadata/index.ts`, `packages/fx-core/src/question/scaffold/vsc/rootNode.ts`, `packages/fx-core/src/core/FxCore.ts` (template-bundle download branches) |
| §2.2 SPFx orchestration and Yeoman spawn | `packages/fx-core/src/component/generator/spfx/spfxGenerator.ts` (`SPFxGenerator.doYeomanScaffold`) |
| §2.2 SPFx dep checkers | `packages/fx-core/src/component/generator/spfx/depsChecker/yoChecker.ts`, `packages/fx-core/src/component/generator/spfx/depsChecker/generatorChecker.ts`, `packages/fx-core/src/component/generator/spfx/depsChecker/dependencyChecker.ts` |
| §2.2 SPFx constants and version pins | `packages/fx-core/src/component/generator/spfx/utils/constants.ts` (`Constants.YeomanPackageName`, `GeneratorPackageName`, `LatestVersion`, `RecommendedLowestSpfxVersion`) |
| §2.3 TypeSpec compile orchestration entry | `packages/fx-core/src/common/tools.ts` (`runForTypeSpecProject`), `packages/fx-core/src/core/FxCore.ts` (call site), `packages/fx-core/src/component/driver/teamsApp/teamsappMgr.ts` (call site) |
| §2.3 TypeSpec compile driver (npx tsp + Kiota glue) | `packages/fx-core/src/component/driver/typeSpec/compile.ts` (`TypeSpecCompileDriver.execute`) |
| §2.3 / §2.4 Kiota client wrapper | `packages/fx-core/src/common/kiotaClient.ts` (`setKiotaBinaryPath`, `searchOpenAPISpec`, `listAPITreeInfo`, `kiotageneratePlugin`) |
| §2.4 OpenAPI spec ingestion (URL or file → SpecParser) | `packages/fx-core/src/component/generator/openApiSpec/helper.ts`, `packages/fx-core/src/component/generator/openApiSpec/common.ts`, `packages/fx-core/src/component/generator/openApiSpec/kiota.ts`, `packages/fx-core/src/component/generator/openApiSpec/declarativeAgentGenerator.ts`, `packages/fx-core/src/component/generator/openApiSpec/customEngineAgentGenerator.ts`, `packages/fx-core/src/component/generator/openApiSpec/messageExtensionGenerator.ts` |
| §2.5 Office Add-in create flow + bundled-template helpers | `packages/fx-core/src/component/generator/officeAddin/generator.ts`, `packages/fx-core/src/component/generator/officeAddin/helperMethods.ts` |
| §2.5 MetaOS-side manifest authoring with hard-coded schema URLs | `packages/fx-core/src/component/generator/officeAddin/metaOSHelper.ts` |
| §2.6 Office Add-in import flow (`convertProject` + precondition shim) | `packages/fx-core/src/component/generator/officeAddin/generator.ts` (`OfficeAddinGenerator.doScaffolding` import branch, `OfficeAddinGenerator.ensurePackageJsonForConvert`) |
| §2.7 SharePoint / OneDrive URL → stable ID resolution | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`createGraphClientWithToken`, `getSharePointSiteByRelativePath`, `encodeSharePointUrl`, `getDriveItemInfo`) |
| §2.7 DA manifest writers consuming resolved identifiers | `packages/fx-core/src/component/generator/declarativeAgent/helper.ts`, `packages/fx-core/src/component/generator/declarativeAgent/generator.ts` |

## Cross-cutting properties (§3) — known counterexamples

| Property | Counterexample location |
|---|---|
| §3.2 Offline-capable — `npm install` on the user project at compile time | `packages/fx-core/src/common/tools.ts` (`runForTypeSpecProject` calls `cli/runNpmCommand` for `npm install`) |
| §3.2 Offline-capable — `yo` + `@microsoft/generator-sharepoint` install at scaffold time | `packages/fx-core/src/component/generator/spfx/depsChecker/dependencyChecker.ts`, `packages/fx-core/src/component/generator/spfx/depsChecker/yoChecker.ts`, `packages/fx-core/src/component/generator/spfx/depsChecker/generatorChecker.ts` |
| §3.2 Offline-capable — URL-fetched OpenAPI specs at scaffold time | `packages/fx-core/src/component/generator/openApiSpec/helper.ts` (`new SpecParser(apiSpecUrl, …)`), `packages/fx-core/src/component/generator/openApiSpec/common.ts` |
| §3.2 Offline-capable — lazy Kiota native-binary extraction on first call | `packages/fx-core/src/common/kiotaClient.ts` (`setKiotaBinaryPath` and downstream calls) |
| §3.3 Login-free — scaffold-time Graph calls for DA knowledge sources | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (uses `m365TokenProvider`) |
| §3.4 Reproducible — `latest` dist-tag resolution for SPFx packages | `packages/fx-core/src/component/generator/spfx/depsChecker/yoChecker.ts` (`findLatestVersion`), `packages/fx-core/src/component/generator/spfx/depsChecker/generatorChecker.ts` (`isLatestInstalled`) |
| §3.4 Reproducible — template `latest` tag resolution on VS / on stable upgrades | `packages/fx-core/src/component/generator/utils.ts` (`getTemplateLatestVersion`, `getTemplateVSLatestVersion`) |
