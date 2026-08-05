# VScUse Easy Case Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the easiest failing hand-recorded Feature plans with deterministic semantic YAML cases, beginning with cases that need no new engine operation.

**Architecture:** Preserve semantic YAML as the only authored workflow source. Reuse the existing `localEnvironment`, lifecycle, target, open, and check adapters; do not expose low-level VScUse steps or coordinates. Remove a legacy plan only when a generated case covers all of its stable intent, and record the replacement in the migration mapping.

**Tech Stack:** YAML case bundles, CommonJS Node test runner, VScUse JSON plan generator, Prettier, pnpm.

---

## Scope And Order

1. Batch 1: migrate `Feature_LocalDebug_bot_with_existing_AAD.json` and retire `Feature_Basic_Tab_Instant_Tab_Remote.json` as already covered by `tab-ts-remote-teams`.
2. Batch 2: add a closed `configureActionAuthentication` operation and migrate the five DA authentication-configuration cases.
3. Batch 3: add target-time environment inputs; migrate the four `LocalDebug_*_without_*Keys` cases.
4. Batch 4: add a read-only wizard inspection operation; migrate wizard option and layout cases.
5. Add a dedicated capability operation before migrating `DA_Add_Action_And_Capability_Remote_Debug`; do not route it through authentication configuration.
6. Keep TDP, native file-picker, Teams Admin Center, arbitrary source-edit, and multi-window cases hand-recorded until each has a deterministic recorded component and a dedicated semantic adapter.

## Task 1: Add The Existing-Bot-Registration Contract

**Files:**

- Modify: `docs/03-specs/operations/product/compile-vscuse-case-bundles.md`
- Modify: `packages/tests/vscuse/vscode-test-cases/engine/semantic-step-compiler.test.cjs`

- [x] Add `VCB-121` stating that the checked-in JavaScript default-bot case for an existing bot registration writes `BOT_ID` and `SECRET_BOT_PASSWORD` through `localEnvironment` before local target startup and retains the Teams echo check.
- [x] Update `VCB-34` and its test from ninety-one generated plans to ninety-two.
- [x] Add a focused `VCB-121` test that compiles `default-bot.yml`, finds `simple-bot-js-local-teams-existing-registration`, and verifies both generated local-environment steps precede the target and the chat assertion follows it.
- [x] Run `pnpm --dir packages/tests run test:vscuse-engine` and verify the new test fails because the case does not exist.

## Task 2: Author The Existing-Bot-Registration Case

**Files:**

- Modify: `packages/tests/vscuse/vscode-test-cases/cases/default-bot.yml`

- [x] Add case `simple-bot-js-local-teams-existing-registration` using `scaffold-simple-bot-js`, `check-simple-bot-js`, the existing M365 login, two local environment assignments, the existing local Teams target, open, and echo check.
- [x] Add a `localEnvironment` step with `BOT_ID: "${{env:TEST_AAD_APP_ID}}"` and `SECRET_BOT_PASSWORD: "${{secret:TEST_AAD_APP_PASSWORD}}"`.
- [x] Run `pnpm --dir packages/tests run test:vscuse-engine` and verify `VCB-121` and the ninety-two-plan count pass.

## Task 3: Generate And Replace The Legacy Plans

**Files:**

- Modify: `packages/tests/vscuse/vscode-test-cases/cases/legacy-case-mapping.md`
- Modify: `packages/tests/vscuse/vscode-test-cases/cases/README.md`
- Modify: `packages/tests/vscuse/vscode-test-cases/plans/.vscuse-generated-plans`
- Create: `packages/tests/vscuse/vscode-test-cases/plans/default-bot--simple-bot-js-local-teams-existing-registration.json`
- Delete: `packages/tests/vscuse/vscode-test-cases/plans/Feature_LocalDebug_bot_with_existing_AAD.json`
- Delete: `packages/tests/vscuse/vscode-test-cases/plans/Feature_Basic_Tab_Instant_Tab_Remote.json`

- [x] Generate plans with `pnpm --dir packages/tests run generate:vscuse-cases`.
- [x] Add a Full mapping from the new default-bot case to `Feature_LocalDebug_bot_with_existing_AAD.json`.
- [x] Add a Full mapping from `tab-ts-remote-teams` to `Feature_Basic_Tab_Instant_Tab_Remote.json`, noting that the generated case includes scaffold/file validation plus complete remote lifecycle and page validation beyond the legacy plan's three scaffold selections.
- [x] Remove both superseded legacy JSON files.
- [x] Update the README case count for `default-bot.yml` and the total generated-plan count.

## Task 4: Verify Batch 1

**Files:**

- Validate all files changed by Tasks 1-3.

- [x] Run `pnpm --dir packages/tests run generate:vscuse-cases` and require `No generated plan changes.`
- [x] Run `pnpm --dir packages/tests run test:vscuse-engine`.
- [x] Run `pnpm exec prettier --check "packages/tests/vscuse/vscode-test-cases/engine/*.cjs" "packages/tests/vscuse/vscode-test-cases/cases/*.yml" "docs/03-specs/operations/product/compile-vscuse-case-bundles.md"`.
- [x] Confirm neither deleted legacy filename appears outside the intentional migration-ledger entries.
- [x] Review the diff to ensure no unrelated generated plans changed.

## Task 5: Add The Action Authentication Contract

**Files:**

- Modify: `docs/03-specs/operations/product/compile-vscuse-case-bundles.md`
- Modify: `packages/tests/vscuse/vscode-test-cases/engine/validate-case-bundle.cjs`
- Modify: `packages/tests/vscuse/vscode-test-cases/engine/semantic-step-compiler.cjs`
- Modify: `packages/tests/vscuse/vscode-test-cases/engine/semantic-step-compiler.test.cjs`
- Create: `packages/tests/vscuse/vscode-test-cases/components/quick-input/empty-text.json.tpl`

- [x] Add `VCB-122` and a closed `configureActionAuthentication` discriminated union for API key, bearer token, Microsoft Entra, OAuth, and PKCE OAuth.
- [x] Keep command titles, visible prompt labels, component paths, and interaction details compiler-owned.
- [x] Validate required, extra, empty, and type-incompatible inputs.
- [x] Support an accepted empty OAuth refresh URL through a reusable LF-formatted component.
- [x] Carry authentication state into provision validation so Entra and PKCE require only a client ID while non-PKCE OAuth retains its protected client secret.
- [x] Run `pnpm --dir packages/tests run test:vscuse-engine` and verify the focused contract is green.

## Task 6: Author And Generate The Authentication Cases

**Files:**

- Modify: `packages/tests/vscuse/vscode-test-cases/cases/da-api-plugin-from-existing-api.yml`
- Modify: `packages/tests/vscuse/vscode-test-cases/cases/README.md`
- Modify: `packages/tests/vscuse/vscode-test-cases/plans/.vscuse-generated-plans`
- Create: `packages/tests/vscuse/vscode-test-cases/plans/da-api-plugin-from-existing-api--da-add-*-auth-configuration.json`

- [x] Add API-key, bearer-token, Microsoft Entra, OAuth, and PKCE OAuth cases that reuse the existing API scaffold and file checks.
- [x] Preserve each legacy flow's provision inputs and stable terminal assertion: provision success for API key and bearer, Copilot sign-in for Entra and OAuth variants.
- [x] Update `VCB-34` and the README from ninety-two generated plans to ninety-seven.
- [x] Generate all five manifest-owned plans.

## Task 7: Replace And Verify The Authentication Plans

**Files:**

- Modify: `packages/tests/vscuse/vscode-test-cases/cases/legacy-case-mapping.md`
- Delete: `packages/tests/vscuse/vscode-test-cases/plans/Feature_DA_No_Action_Add_*_Auth_Configurations.json`

- [x] Add five Full migration mappings and remove the superseded legacy plans.
- [x] Run generation again and require `No generated plan changes.`
- [x] Run the complete semantic-engine test suite.
- [x] Run Prettier and `git diff --check` validation.
- [x] Review the final diff for unrelated generated-plan changes.

## Batch 2 Design Decision

The generic `command` operation was rejected because it would expose unstable command and prompt details in case YAML. `configureActionAuthentication` owns the product workflow as a closed semantic operation. `DA_Add_Action_And_Capability_Remote_Debug` remains recorded until a separate capability operation has its own contract and adapter.
