# Create Teams Agent with Data from Customized Source

**Template id:** `custom-copilot-rag-customize` (create)

## Acceptance Criteria

| ID | Runtime | Purpose | Gate | Harness | Scenario | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| SCN-CREATE-RAG-CUSTOMIZE-01 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the TypeScript Teams agent with data from a customized source. | The scaffold writes the TypeScript RAG agent files, sample data, app package, infra, and m365agents yaml. |
| SCN-CREATE-RAG-CUSTOMIZE-02 | L1 | scenario | per-PR | InMemoryRuntime | Render a TypeScript RAG customize agent with app name `My Data Agent`. | Package and manifest app-name fields are rendered from caller floor values. |
| SCN-CREATE-RAG-CUSTOMIZE-03 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the JavaScript RAG customize agent. | The scaffold selects the JavaScript subtree and writes JavaScript entry files. |
| SCN-CREATE-RAG-CUSTOMIZE-04 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the Python RAG customize agent. | The scaffold selects the Python subtree and omits Node package files. |
| SCN-CREATE-RAG-CUSTOMIZE-05 | L1 | scenario | per-PR | InMemoryRuntime | Run the scaffold pipeline. | The only pipeline step is `require-empty-target`. |
| SCN-CREATE-RAG-CUSTOMIZE-06 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold into a target that already contains a file. | The scaffold fails with `REQUIRE_EMPTY_TARGET` before writing files. |

## Flow

```mermaid
flowchart TD
  A[Create selector chooses Teams Agents and Apps > Chat with your data > Customized source] --> B[Resolve `custom-copilot-rag-customize`]
  B --> C[Select language-specific content]
  C --> D[Require empty target]
  D --> E[Render app package, RAG agent project files, sample data, infra, and m365agents yaml]
```

## Boundary

- This scenario covers v4 package rendering for a new Teams agent with data from a customized source.
- It does not provision Azure, create or query a data source, call LLM services, or run CLI/VS Code/Visual Studio end-to-end scaffolding.

## Invariants

- The v4 create route must not fall back to the v3 `DefaultTemplateGenerator`.
- The package must render only the selected language subtree.
- The package must reject non-empty targets before writing output.