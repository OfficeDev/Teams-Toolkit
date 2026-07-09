# Scenario - Create Graph Connector (`graph-connector`)

- **Status:** Accepted (Decision source [ADR-0018](../../../02-architecture/adr/ADR-0018-scaffold-runtime-test-pyramid.md) Accepted 2026-06-08) - ready for scenario-tier (T3) tests
- **Domain:** [`01-scaffolding`](../../domains/01-scaffolding.md)
- **Scenario ID:** `SCN-CREATE-GRAPH-CONNECTOR` (a standalone Microsoft Graph connector project)
- **Template id:** `graph-connector` (create)

This is the vertical contract for the native v4 standalone Microsoft Graph connector create package. The v3 path uses `DefaultTemplateGenerator` over the TypeScript `graph-connector` template and has no post-render mutation. The v4 package preserves that static output as a TypeScript-only package; the create caller owns `appName`, while the Q2 connector answers render the connector name and connection id.

## Acceptance Criteria

| ID | Tier | Given | When | Then |
|----|------|-------|------|------|
| SCN-CREATE-STANDALONE-GC-01 | L1 | empty target and connector answers | scaffold completes | the render phase writes the standalone Graph connector file set (`.tpl` stripped and local `.env.*.user` files omitted), including TypeScript connector source, infra, scripts, AAD manifest, project yaml files, and no DA `appPackage` |
| SCN-CREATE-STANDALONE-GC-02 | L1 | rendered env files | render | `env/.env.local` contains `CONNECTOR_ID` and `CONNECTOR_NAME` from Q2; `env/.env.dev` contains the same connector name and leaves `CONNECTOR_ID` empty for provision |
| SCN-CREATE-STANDALONE-GC-03 | L1 | rendered project files | render | `package.json.name` is the safe lower-case project name; `m365agents.yml` includes the Graph connector Azure/AAD stages and does not include DA app package stages |
| SCN-CREATE-STANDALONE-GC-04 | L1 | empty target | scaffold | the only scaffold pipeline step is `require-empty-target`; there is no v4 post-render mutation step |
| SCN-CREATE-STANDALONE-GC-05 | L1 | non-empty target | scaffold | `require-empty-target` fails first with **`UserError`** and writes nothing |
| SCN-CREATE-STANDALONE-GC-06 | L1 | identical inputs re-run | scaffold | deterministic - identical `written` set and identical rendered connector env values |

## Composed operations

- [`walk-create-selector`](../../operations/scaffolding/walk-create-selector.md) - routes `projectType == 'graph-connector-type'` to the `graph-connector` v4 package.
- [`collect-create-inputs`](../../operations/scaffolding/collect-create-inputs.md) - asks `graphConnectorName` and `graphConnectorConnectionId` with graph-connector validators.
- [`resolve-template-source`](../../operations/scaffolding/resolve-template-source.md), [`open-template-package`](../../operations/scaffolding/open-template-package.md), and [`validate-template-package`](../../operations/scaffolding/validate-template-package.md) - open and validate the package.
- [`build-render-context`](../../operations/scaffolding/build-render-context.md) - derives `SafeProjectNameLowerCase` and maps Q2 answers to legacy template variables `gcName` and `gcConnectionId`.
- [`run-scaffold-pipeline`](../../operations/scaffolding/run-scaffold-pipeline.md) - runs `require-empty-target` and renders files.

## Flow

```mermaid
flowchart TD
  Sel[walk-create-selector: graph-connector] --> Inputs[collect-create-inputs: connector name + id]
  Inputs --> Open[open + validate-template-package]
  Open --> Guard{require-empty-target}
  Guard -- non-empty --> Err[UserError - nothing written]
  Guard -- empty --> Render[render phase: write standalone connector project]
  Render --> Done([scaffold output ready])
```

## Boundary

This scenario does **not** assert:

- Provisioning the Graph connector or registering the external connection in Microsoft Graph.
- Running the connector Azure Functions project.
- Declarative-agent-with-Graph-connector output; that is owned by [`da/create-graph-connector`](../da/create-graph-connector.md).