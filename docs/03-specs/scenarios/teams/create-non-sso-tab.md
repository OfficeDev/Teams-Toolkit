# Scenario - Create Teams Tab (`non-sso-tab`)

- **Status:** Accepted (migration request 2026-06-29) - ready for scenario-tier tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Scenario ID:** `SCN-TEAMS-CREATE-NONSSO-TAB`
- **Template id:** `non-sso-tab` (create)

This is the vertical contract for the native v4 Teams tab create package. The package is pure render: scaffold writes the selected language subtree and does not run post-render injection.

## Acceptance Criteria

| ID                       | Runtime | Purpose       | Gate     | Harness                  | Given                                                                                   | When                                 | Then                                                                                                                                                     |
| ------------------------ | ------- | ------------- | -------- | ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCN-CREATE-NONSSO-TAB-01 | L1      | scenario      | required | InMemoryRuntime          | empty target and TypeScript language                                                    | scaffold completes                   | the render phase writes the Teams tab project file set (`.tpl` stripped) including `.vscode`, `appPackage`, `src`, `infra`, env, yaml, and package files |
| SCN-CREATE-NONSSO-TAB-02 | L1      | scenario      | required | InMemoryRuntime          | rendered TypeScript `package.json` and manifest                                         | render                               | package `name` is the lower-case safe project name; manifest app names use the caller floor `appName` and preserve `${{APP_NAME_SUFFIX}}`                |
| SCN-CREATE-NONSSO-TAB-03 | L1      | scenario      | required | InMemoryRuntime          | the Teams tab descriptor                                                                | inspect languages                    | the descriptor exposes TypeScript only                                                                                                                   |
| SCN-CREATE-NONSSO-TAB-04 | L1      | scenario      | required | InMemoryRuntime          | empty target                                                                            | scaffold                             | only the `require-empty-target` step runs; no post-render scaffold injection is run                                                                      |
| SCN-CREATE-NONSSO-TAB-05 | L1      | scenario      | required | InMemoryRuntime          | non-empty target                                                                        | scaffold                             | `require-empty-target` fails first with **`UserError`** and writes nothing                                                                               |
| SCN-CREATE-NONSSO-TAB-06 | L1      | compatibility | required | CompatibilityDiffHarness | the v3 `basic-tab` and rendered v4 `non-sso-tab` TypeScript server build configurations | compare their unbundled tsup entries | v4 preserves the v3 `src/index.ts` entry and additionally declares its imported `src/proxy.ts` module, avoiding an omitted local module                  |

## Composed operations

- [`resolve-build-target`](../../operations/scaffolding/resolve-build-target.md) - routes `teamsOtherAppType == 'non-sso-tab'` to the `non-sso-tab` v4 package.
- [`resolve-template-source`](../../operations/scaffolding/resolve-template-source.md), [`open-template-package`](../../operations/scaffolding/open-template-package.md), and [`validate-template-package`](../../operations/scaffolding/validate-template-package.md) - open and validate the package.
- [`build-render-context`](../../operations/scaffolding/build-render-context.md) - derives `SafeProjectNameLowerCase` from the caller floor `appName`.
- [`run-scaffold-pipeline`](../../operations/scaffolding/run-scaffold-pipeline.md) - runs `require-empty-target` and renders files.

## Flow

```mermaid
flowchart TD
  Sel[resolve-build-target: teams other tab] --> Open[open + validate-template-package]
  Open --> Lang[select language subtree]
  Lang --> Guard{require-empty-target}
  Guard -- non-empty --> Err[UserError - nothing written]
  Guard -- empty --> Render[render phase: write Teams tab project]
  Render --> Done([scaffold output ready])
```

## Boundary

This scenario does **not** assert:

- Running npm, pip, local debug, provision, deploy, or preview lifecycle stages; AC-06 compares the build configurations statically.
- VS C# templates; VS keeps its own template channel.
- SSO, bot, message extension, or sandboxed Teams behavior.
