# Scenario - Import an Open Plugin project

- **Status:** Implemented with L1 scenario coverage
- **Domain:** Product import/export
- **Scenario ID:** `SCN-TOOLKIT-IMPORT-OPEN-PLUGIN` (mirrors product scenario
  [`import-open-plugin.md`](../../../01-product/scenarios/toolkit/import-open-plugin.md))
- **Feature workflow:** `atk import openplugin`

This is the vertical contract for importing one portable plugin directory into a usable Agents
Toolkit project. It pins only the concrete workflow outputs and composes the auth-resolution
operation rather than restating its evidence rules.

## Acceptance Criteria

| ID                                | Runtime | Purpose  | Gate     | Harness                                                   | Given                                                                                                          | When                                           | Then                                                                                                                                                                                                                 |
| --------------------------------- | ------- | -------- | -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-01 | L1      | scenario | per-PR   | TempDirRuntime with MCP/OAuth and template-provider fakes | an Open Plugin directory containing two skills, commands, one remote HTTPS MCP server, and Auto authentication | the fx-core importer completes                 | the destination contains the standard Toolkit project files, copied skills and commands, and a manifest whose remote connector uses the evidence-resolved OAuth type; the result includes the Auto inference warning |
| SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-02 | L2      | CLI-E2E  | deferred | CLI command harness with controlled MCP endpoint          | the same plugin and destination inputs                                                                         | `atk import openplugin` runs non-interactively | the command exit code, generated project, and warning output match the L1 scenario oracle                                                                                                                            |
| SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-03 | L1      | scenario | per-PR   | TempDirRuntime with network fakes                         | the selected destination is non-empty                                                                          | the fx-core importer runs                      | it returns `OutputDirectoryNotEmpty` before auth discovery and preserves the destination                                                                                                                             |
| SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-04 | L1      | scenario | per-PR   | TempDirRuntime with network fakes                         | the source declares more than ten URL-based MCP servers                                                        | the fx-core importer runs                      | it rejects the manifest-limit violation before auth discovery or scaffolding                                                                                                                                         |
| SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-05 | L1      | scenario | per-PR   | TempDirRuntime with MCP/OAuth and template-provider fakes | Auto receives a confirmed auth challenge but OAuth metadata cannot be resolved                                 | the fx-core importer runs                      | the destination is scaffolded with an `OAuthPluginVault` connector and deterministic placeholder reference; the result warns that the fallback type must be verified and registered                                  |

## Composed operations

- [`resolve-open-plugin-mcp-auth`](../../operations/product/resolve-open-plugin-mcp-auth.md) owns
  authentication precedence, endpoint evidence, unresolved behavior, and inference warnings.
- Existing Open Plugin parsing, mapping, template scaffolding, and artifact-writing operations own
  their horizontal contracts; this scenario asserts only their composed observable result.

## Flow

The end-to-end behavior follows the product scenario
[`import-open-plugin.md`](../../../01-product/scenarios/toolkit/import-open-plugin.md#flow): read and
locally validate the source/destination, resolve authentication, map the plugin, then scaffold and
write the project. Local validation or an unconfirmed MCP endpoint terminates before scaffolding;
a confirmed auth challenge with incomplete metadata falls back to OAuth and continues with a
warning.

## Executable validation

- **Harness:**
  [`importer.test.ts`](../../../../packages/fx-core/tests/component/generator/openPlugin/importer.test.ts)
  uses temporary source/destination directories, the production parser/importer/mapper/writers, a
  static template-provider fake, and fakes only the MCP/OAuth network boundary.
- **Traceability:** the four required L1 rows map 1:1 to scenario-tier tests in that file.
- **Deferred surface:** `SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-02` records the L2 CLI E2E intent and is not a
  current per-PR gate.

Run the focused scenario validation from the repository root:

```bash
pnpm --dir packages/fx-core exec vitest run --config vitest.config.ts tests/component/generator/openPlugin/importer.test.ts
```

## Boundary

This scenario does not assert:

- live behavior of an arbitrary MCP or OAuth server;
- OAuth client registration or credential provisioning;
- stdio MCP conversion to a local connector;
- VS Code or Visual Studio surfaces;
- the internal evidence rules owned by the composed auth-resolution operation.

## Invariants

- Guaranteed local validation failures make no outbound auth-discovery request and write no project.
- An Auto decision with an unconfirmed MCP endpoint writes no project or placeholder connector
  reference.
- A confirmed auth challenge with unresolved metadata writes an OAuth placeholder and a visible
  verification warning.
- Explicit or preserved authentication remains authoritative for each connector.
