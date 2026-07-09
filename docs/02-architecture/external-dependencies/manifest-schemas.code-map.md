# Manifest schemas — Code Map

Navigation aid for refactor work on M365 manifest schema bindings. Maps each
fact in [`manifest-schemas.md`](manifest-schemas.md) to its current location
in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`manifest-schemas.md`](manifest-schemas.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `manifest-schemas.md` §1) | File(s) |
|---|---|
| §1.1 Three schema families — TS type unions | `packages/manifest/src/generated-types/index.ts` (`TeamsManifest`, `DeclarativeAgentManifest`, `APIPluginManifest`, `AppManifest`) |
| §1.2 Schema host path prefixes + §1.3 locale-strip | `packages/manifest/src/generated-types/index.ts` (`AppManifestUtils.getLocalSchemaSuffix`) |
| §1.3 Schema source of record + snapshot fetcher | `packages/manifest/download.js`, `packages/manifest/src/json-schemas/` |
| §1.4 Teams manifest version set | `packages/manifest/src/generated-types/teams/TeamsManifestV1D*.ts`, `packages/manifest/src/generated-types/teams/TeamsManifestVDevPreview.ts`, `TeamsManifestConverterMap` in `packages/manifest/src/generated-types/index.ts` |
| §1.4 Declarative Agent version set | `packages/manifest/src/generated-types/copilot/declarative-agent/DeclarativeAgentManifestV1D*.ts`, `DeclarativeAgentConverterMap` in `packages/manifest/src/generated-types/index.ts` |
| §1.4 API Plugin version set | `packages/manifest/src/generated-types/copilot/plugin/ApiPluginManifestV2D*.ts`, `ApiPluginConverterMap` in `packages/manifest/src/generated-types/index.ts` |
| §1.4 Latest-version aliases | `TeamsManifestLatest`, `DeclarativeAgentManifestLatest`, `APIPluginManifestLatest` in `packages/manifest/src/generated-types/index.ts` |
| §1.5 JSON Schema draft selection at validation time | `packages/manifest/src/generated-types/index.ts` (`AppManifestUtils.validateAgainstSchema` — Ajv-draft-04 vs Ajv-2020 branch), `packages/manifest/src/index.ts` (`ManifestUtil.validateManifestAgainstSchema`, deprecated mirror) |
| §1.5 Bundled local schema files (draft tag visible in `$schema` of each `.json`) | `packages/manifest/src/json-schemas/teams/**`, `packages/manifest/src/json-schemas/copilot/**`, `packages/manifest/devPreviewSchema.json` |
| §1.6 Version-discriminator field — Teams | `manifestVersion` literal types on each `TeamsManifestV1D*.TeamsManifestV1D*` union arm in `packages/manifest/src/generated-types/index.ts` |
| §1.6 Version-discriminator field — DA / Plugin (`schema_version` dispatch) | `DeclarativeAgentManifestConverter.jsonToManifest`, `ApiPluginManifestConverter.jsonToManifest` in `packages/manifest/src/generated-types/index.ts` |
