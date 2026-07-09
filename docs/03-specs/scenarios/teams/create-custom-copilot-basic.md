# Create General Teams Agent

**Template id:** `custom-copilot-basic` (create)

## Acceptance Criteria

| ID | Runtime | Purpose | Gate | Harness | Scenario | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| SCN-CREATE-CUSTOM-COPILOT-BASIC-01 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the TypeScript general Teams agent template. | The scaffold writes the TypeScript Teams AI agent files. |
| SCN-CREATE-CUSTOM-COPILOT-BASIC-02 | L1 | scenario | per-PR | InMemoryRuntime | Render a TypeScript general Teams agent with app name `My Teams Agent`. | Package and manifest app-name fields are rendered from caller floor values. |
| SCN-CREATE-CUSTOM-COPILOT-BASIC-03 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the JavaScript general Teams agent template. | The scaffold selects the JavaScript subtree and writes JavaScript entry files. |
| SCN-CREATE-CUSTOM-COPILOT-BASIC-04 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the Python general Teams agent template. | The scaffold selects the Python subtree and omits Node package files. |
| SCN-CREATE-CUSTOM-COPILOT-BASIC-05 | L1 | scenario | per-PR | InMemoryRuntime | Run the scaffold pipeline. | The only pipeline step is `require-empty-target`. |
| SCN-CREATE-CUSTOM-COPILOT-BASIC-06 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold into a target that already contains a file. | The scaffold fails with `REQUIRE_EMPTY_TARGET` before writing files. |

## Flow

```mermaid
flowchart TD
  A[Create selector chooses Teams Agents and Apps > General Teams Agent] --> B[Resolve `custom-copilot-basic`]
  B --> C[Select language-specific content]
  C --> D[Require empty target]
  D --> E[Render app package, agent project files, infra, and m365agents yaml]
```

## Boundary

- This scenario covers v4 package rendering for a new general Teams agent project.
- It does not provision Azure, register a bot, call LLM services, or run CLI/VS Code/Visual Studio end-to-end scaffolding.

## Invariants

- The v4 create route must not fall back to the v3 `DefaultTemplateGenerator`.
- The package must render only the selected language subtree.
- The package must reject non-empty targets before writing output.