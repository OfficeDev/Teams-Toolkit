# SPFx scaffolding tooling — Code Map

Navigation aid for refactor work on the SPFx scaffolding binding. Maps
each fact in [`spfx-tooling.md`](spfx-tooling.md) to its current location
in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`spfx-tooling.md`](spfx-tooling.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `spfx-tooling.md` §1) | File(s) |
|---|---|
| §1.1 Package names (`yo`, `@microsoft/generator-sharepoint`) | `packages/fx-core/src/component/generator/spfx/utils/constants.ts` (`Constants.YeomanPackageName`, `Constants.GeneratorPackageName`) |
| §1.1 On-demand install of `yo` | `packages/fx-core/src/component/generator/spfx/depsChecker/yoChecker.ts` |
| §1.1 On-demand install of `@microsoft/generator-sharepoint` | `packages/fx-core/src/component/generator/spfx/depsChecker/generatorChecker.ts` |
| §1.1 Shared install / sentinel logic | `packages/fx-core/src/component/generator/spfx/depsChecker/dependencyChecker.ts` |
| §1.1 `yo` subprocess spawn | `packages/fx-core/src/component/generator/spfx/spfxGenerator.ts` (`SPFxGenerator.doYeomanScaffold` — `spGeneratorChecker.getSpGeneratorPath()` or `"@microsoft/sharepoint"` fallback) |
| §1.2 Output-file post-processing (toolkit-side patches on generator output) | `packages/fx-core/src/component/generator/spfx/spfxGenerator.ts`, `packages/fx-core/src/component/generator/spfx/utils/utils.ts` |
| §1.3 Lowest supported SPFx version | `packages/fx-core/src/component/generator/spfx/utils/constants.ts` (`Constants.RecommendedLowestSpfxVersion`) |
| §1.3 Default generator version (`latest` dist-tag) | `packages/fx-core/src/component/generator/spfx/utils/constants.ts` (`Constants.LatestVersion`), `packages/fx-core/src/component/generator/spfx/spfxGenerator.ts` (target-version branches) |
| §1.5 Web part `componentId` handling on add / re-scaffold | `packages/fx-core/src/component/generator/spfx/spfxGenerator.ts` (`isAddWebPart` branch), `packages/fx-core/src/component/generator/spfx/utils/utils.ts` |

> §1.4 (`@microsoft/spfx-cli` / `@microsoft/spfx-template-api`) is an
> upstream-owned fact and has no corresponding toolkit source today; it
> is intentionally absent from this map until the toolkit binds to it
> (tracked in [ADR-0009](../adr/ADR-0009-spfx-scaffolding-tooling-path.md)).
