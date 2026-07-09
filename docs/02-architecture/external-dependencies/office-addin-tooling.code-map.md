# Office Add-in tooling — Code Map

Navigation aid for refactor work on the Office Add-in tooling binding.
Maps each fact in
[`office-addin-tooling.md`](office-addin-tooling.md) to its current
location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`office-addin-tooling.md`](office-addin-tooling.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `office-addin-tooling.md` §1) | File(s) |
|---|---|
| §1.1 `office-addin-project` dependency declaration | `packages/fx-core/package.json` (`dependencies["office-addin-project"]`) |
| §1.1 `office-addin-manifest` dependency declaration | `packages/fx-core/package.json` (`dependencies["office-addin-manifest"]`) |
| §1.1 / §1.2 `convertProject` import + call site | `packages/fx-core/src/component/generator/officeAddin/generator.ts` (import from `office-addin-project`; `OfficeAddinGenerator.doScaffolding` import branch) |
| §1.2 Precondition shim ensuring `package.json.scripts` exists | `packages/fx-core/src/component/generator/officeAddin/generator.ts` (`OfficeAddinGenerator.ensurePackageJsonForConvert`) |
| §1.3 Create-new template bundle helpers (no Yo Office) | `packages/fx-core/src/component/generator/officeAddin/generator.ts`, `packages/fx-core/src/component/generator/officeAddin/helperMethods.ts` |
| §1.4 MetaOS DA `$schema` URL literal | `packages/fx-core/src/component/generator/officeAddin/metaOSHelper.ts` (DA `$schema` constant) |
| §1.4 MetaOS Plugin `$schema` URL literal | `packages/fx-core/src/component/generator/officeAddin/metaOSHelper.ts` (Plugin `$schema` constant) |
