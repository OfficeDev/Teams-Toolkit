# Office Developer Runtime (ODR) — Code Map

Navigation aid for refactor work on the ODR binding. Maps each fact in
[`odr.md`](odr.md) to its current location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`odr.md`](odr.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `odr.md` §1) | File(s) |
|---|---|
| §1.1 Platform gate (`process.platform === "win32"`) + §1.2 `odr list` invocation | `packages/fx-core/src/component/utils/odrProvider.ts` (`ODRProvider.listServers`) |
| §1.2 Failure-is-empty fallback (exec error, empty stdout, non-JSON) | `packages/fx-core/src/component/utils/odrProvider.ts` (`ODRProvider.listServers` try/catch + empty-string guard) |
| §1.3 / §1.4 Response shape parsing (`servers[]`, `_meta` walk, completeness skip) | `packages/fx-core/src/component/utils/odrProvider.ts` (`ODRProvider.parseODRListOutput`) |
| §1.4 / §1.5 TS shapes for parsed ODR servers and tools | `packages/fx-core/src/component/utils/odrProvider.ts` (`ODRServer`, `ODRTool` interfaces) |
| §1.6 Server-identity tuple re-lookup | `packages/fx-core/src/component/utils/odrProvider.ts` (`ODRProvider.getToolsForODRServer`) |
| §1.7 Lexical recognition of ODR-launched server config | `packages/fx-core/src/component/utils/odrProvider.ts` (`ODRProvider.isODRServer`) |
| §1.1 / §1.2 / §1.4 Call-site that drives the scaffold MCP-server option list | `packages/fx-core/src/question/scaffold/vsc/teamsProjectTypeNode.ts` (`ODRProvider.listServers` usage) |
