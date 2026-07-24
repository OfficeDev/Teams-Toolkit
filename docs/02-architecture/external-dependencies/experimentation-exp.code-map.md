# Experimentation (Azure ExP / TAS) — Code Map

Navigation aid for refactor work on the experimentation substrate. Maps each
fact in [`experimentation-exp.md`](experimentation-exp.md) to its current
location in source.

> **This file is not part of the contract.** It is expected to churn as code
> moves. Constraints live in
> [`experimentation-exp.md`](experimentation-exp.md#2-constraints-derived-from-these-facts);
> updates here do not require an ADR.

| Fact (from `experimentation-exp.md` §1) | File(s) |
|---|---|
| §1.1 TAS endpoint, target population, `vscode-tas-client` wiring (VS Code) | `packages/vscode-extension/src/exp/index.ts` |
| §1.1 TAS endpoint, `tas-client` `ExperimentationService` construction (CLI) | `packages/cli/src/exp/index.ts` |
| §1.2 Assignment unit / audience filters (VS Code — supplied by `vscode-tas-client`) | `packages/vscode-extension/src/exp/index.ts` |
| §1.2 Assignment unit / audience filters (CLI `CliFilterProvider`, `X-MSEdge-ClientId` = `machineIdSync()`, `X-VSCode-Build: atk-cli`, extension name) | `packages/cli/src/exp/index.ts` |
| §1.3 Config namespace (`vscode` / `VSCodeConfig`) + flag keys (`featureflag-23-1`, `DynamicMcp`, …) | `packages/vscode-extension/src/exp/treatmentVariables.ts` |
| §1.3 Config namespace + flag key requested by the CLI test command | `packages/cli/src/commands/models/testExp.ts` |
| §1.3 `getTreatmentVariableAsync<T>` provider contract (`boolean`/`number`/`string`) | `packages/api/src/utils/exp.ts` |
| §1.3 `expServiceProvider` on the engine `Tools` / `Context` boundary | `packages/api/src/utils/index.ts`, `packages/api/src/context.ts` |
| §1.4 Telemetry event name / assignment-context property / cache key (VS Code — `vscode-tas-client` defaults, `Memento`) | `packages/vscode-extension/src/exp/index.ts` |
| §1.4 Telemetry bridge + cache key `ATK.CLI.ABExp.FeatureData` + `~/.fx/exp/assignments.json` (CLI) | `packages/cli/src/exp/index.ts` |
| §1.5 Activation-time fetch + cached treatment value (VS Code) | `packages/vscode-extension/src/extension.ts` |
| §1.5 Per-process init, `refetchInterval: 0`, wired into engine `Tools` (CLI) | `packages/cli/src/exp/index.ts`, `packages/cli/src/activate.ts` |
| §1.5 `checkCache` live-vs-cached read demonstration | `packages/vscode-extension/src/exp/index.ts`, `packages/cli/src/commands/models/testExp.ts` |
| §1.6 ExP Studio object model (feature experiment / variants / progression / stage) | *External — Azure ExP Studio; no in-repo source.* |
