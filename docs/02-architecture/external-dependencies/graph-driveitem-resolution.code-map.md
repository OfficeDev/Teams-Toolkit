# Microsoft Graph DriveItem resolution — Code Map

Navigation aid for refactor work on the Graph DriveItem resolution
binding. Maps each fact in
[`graph-driveitem-resolution.md`](graph-driveitem-resolution.md) to its
current location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`graph-driveitem-resolution.md`](graph-driveitem-resolution.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `graph-driveitem-resolution.md` §1) | File(s) |
|---|---|
| §1.1 `/sites/{hostname}:{path}` resolver | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`getSharePointSiteByRelativePath`) |
| §1.1 `/shares/{token}/driveItem` resolver | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`getDriveItemInfo`) |
| §1.1 `/sites/{siteId}/items/{itemId}` + `/sites/{siteId}` metadata | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (helper methods using `/sites/${siteId}/items/${itemId}` and `/sites/${siteId}`) |
| §1.2 Share URL encoding | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`encodeSharePointUrl`) |
| §1.3 Graph token acquisition + scopes | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`createGraphClientWithToken` using `m365TokenProvider`, `GraphScopes`) |
| §1.4 Identifier extraction from Graph responses | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`ItemMetadata` construction in `getSharePointSiteByRelativePath` / `getDriveItemInfo`) |
| §1.5 Sovereign-cloud Graph base URL | `packages/fx-core/src/component/generator/declarativeAgent/oneDriveSharePointHandler.ts` (`createGraphClientWithToken` uses `getResourceServiceEndpoint(ResourceServiceType.Graph)`) |
| §1.4 Manifest writers consuming resolved identifiers | `packages/fx-core/src/component/generator/declarativeAgent/helper.ts`, `packages/fx-core/src/component/generator/declarativeAgent/generator.ts` |
