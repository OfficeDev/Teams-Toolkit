# Scenario - Create Declarative Agent by Upgrading an Existing Office Add-in (`declarative-agent-meta-os-upgrade-project`)

- **Status:** Accepted (v4 migration of the v3 MetaOS upgrade create template) - ready for scenario-tier (T3) tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Scenario ID:** `SCN-DA-CREATE-METAOS-UPGRADE-PROJECT`
- **Template id:** `declarative-agent-meta-os-upgrade-project` (create)

This is the vertical contract for the native v4 Declarative Agent with Office Add-in Action upgrade package. The v3 path rendered no Office project template content: it copied an existing Office Add-in project into the new project folder, filtered generated/runtime files, extended the copied project with Declarative Agent manifests and Office action handlers, upgraded `office-addin-debugging`, and unified the Teams app id. The v4 package preserves that Office-project behavior as an explicit post-render pipeline step, and renders only the minimal lifecycle baseline required for the created project to be usable by CLI/VS Code surfaces.

## Acceptance Criteria

| ID | Tier | Given | When | Then |
|----|------|-------|------|------|
| SCN-CREATE-METAOS-UPGRADE-01 | L1 | an existing Office Add-in project folder | scaffold completes | copied source files are written into the target while `README.md`, Teams yaml files, lock files, `env/`, and `node_modules/` are excluded |
| SCN-CREATE-METAOS-UPGRADE-02 | L1 | copied `appPackage/manifest.json` contains an Office commands runtime | upgrade step runs | the manifest references `declarativeAgent.json` and adds the three Office action ids to the commands runtime |
| SCN-CREATE-METAOS-UPGRADE-03 | L1 | copied project has no DA/action manifests | upgrade step runs | `appPackage/declarativeAgent.json` and `appPackage/alchemy-plugin.json` are generated with the Office LocalPlugin action shape |
| SCN-CREATE-METAOS-UPGRADE-04 | L1 | copied `src/commands/commands.ts` and `package.json` exist | upgrade step runs | Office action handler code is appended and `office-addin-debugging` is set to `6.0.6` |
| SCN-CREATE-METAOS-UPGRADE-05 | L1 | copied manifest and env are present or env is absent | upgrade step finishes | manifest `id` and `env/.env.dev` `TEAMS_APP_ID` are set to the same generated UUID |
| SCN-CREATE-METAOS-UPGRADE-06 | L1 | empty target | scaffold | `m365agents.yml` and `env/.env.dev` lifecycle baseline files are rendered, then the package runs only `metaos/upgrade-existing-project` |

## Composed operations

- [`walk-create-selector`](../../operations/scaffolding/walk-create-selector.md) - routes Office DA MetaOS upgrade to this v4 package when `TEAMSFX_DA_METAOS` is enabled.
- [`run-scaffold-pipeline`](../../operations/scaffolding/run-scaffold-pipeline.md) - renders lifecycle baseline content and runs the upgrade step.

## Boundary

This scenario covers only the Office DA MetaOS upgrade create path. It does **not** cover generic Office Add-in import/config upgrade or the DA MetaOS new-project template.