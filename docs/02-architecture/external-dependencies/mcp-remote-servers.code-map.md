# Remote MCP servers — Code Map

Navigation aid for refactor work on the remote MCP server binding. Maps each
fact in [`mcp-remote-servers.md`](mcp-remote-servers.md) to its current
location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`mcp-remote-servers.md`](mcp-remote-servers.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `mcp-remote-servers.md` §1) | File(s) |
|---|---|
| §1.1 Both auth generations — discovery entry point | `packages/fx-core/src/common/mcpToolFetcher.ts` (`resolveMCPOAuthMetadata`) |
| §1.1 `resource_metadata` chain (2025-06-18) | `packages/fx-core/src/common/mcpToolFetcher.ts` (`candidatesFromProtectedResourceMetadata`) |
| §1.1 Origin-root fallback (2025-03-26) | `packages/fx-core/src/common/mcpToolFetcher.ts` (`buildMCPServerWellKnownCandidates`) |
| §1.1 Issuer-derived candidates, no origin-root forms | `packages/fx-core/src/common/mcpToolFetcher.ts` (`buildWellKnownCandidates`) |
| §1.2 `initialize` POST probe | `packages/fx-core/src/common/mcpToolFetcher.ts` (`probeMCPServerAuth`) |
| §1.2 Streamable HTTP / SSE transport selection for tool listing | `packages/fx-core/src/common/mcpToolFetcher.ts` (`fetchMCPTools`) |
| §1.2 Shared re-export consumed by v3 call sites | `packages/fx-core/src/component/utils/mcpToolFetcher.ts` |
| §1.3 / §1.4 `404` reported as "not an MCP endpoint" | `packages/fx-core/src/common/mcpToolFetcher.ts` (`MCPAuthProbeResult.endpointNotFound`) |
| §1.4 Warning raised on the dynamic-tool-discovery scaffold path | `packages/fx-core/src/component/generator/declarativeAgent/helper.ts` (`generateForMCPForDAWithAuth`, warning type `mcpServerUrlNotFound`) |
| §1.4 Warning text | `packages/fx-core/resource/package.nls.json` (`core.MCPForDA.mcpServerUrlNotFound`) |
| §1.4 Tool-fetch based signal on the non-DT paths | `packages/fx-core/src/component/generator/declarativeAgent/helper.ts` (`generateForMCPForDA`), `packages/fx-core/src/core/FxCore.declarativeAgent.ts` (warning type `mcpNoToolsFetched`) |
| §1.1 / §1.4 v3 endpoint resolution and placeholder fallback | `packages/fx-core/src/component/utils/mcpAuthScaffolder.ts` (`resolveMCPAuthEndpoints`) |
| §1.1 / §1.4 v4 endpoint resolution and placeholder fallback | `packages/fx-core/src/v4/mcp/mcpAuthScaffold.ts` (`resolveEndpoints`), `packages/fx-core/src/v4/mcp/mcpAuthAction.ts` |
| §1.4 v4 tool fetch on the static path | `packages/fx-core/src/v4/runtime/steps/mcpStatic.ts` |
| §3 MCP server URL question (input-time validation site) | `packages/fx-core/src/question/scaffold/vsc/teamsProjectTypeNode.ts` (`MCPForDAServerUrlNode`, `additionalValidationOnAccept`) |
| §1.3 / §1.4 Measured behavior regression tests | `packages/fx-core/tests/component/utils/mcpToolFetcher.test.ts`, `packages/fx-core/tests/component/generator/declarativeAgentGenerator.test.ts` |
