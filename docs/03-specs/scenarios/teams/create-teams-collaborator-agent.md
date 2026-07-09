# Create Teams Collaborator Agent

**Template id:** `teams-collaborator-agent` (create)

## Acceptance Criteria

| ID | Runtime | Purpose | Gate | Harness | Scenario | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| SCN-CREATE-COLLABORATOR-01 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the TypeScript Teams collaborator agent template. | The scaffold writes the TypeScript collaborator agent files and local storage seed. |
| SCN-CREATE-COLLABORATOR-02 | L1 | scenario | per-PR | InMemoryRuntime | Render a TypeScript Teams collaborator agent with app name `My Collaborator Agent`. | Package and manifest app-name fields are rendered from caller floor values. |
| SCN-CREATE-COLLABORATOR-03 | L1 | scenario | per-PR | InMemoryRuntime | Run the scaffold pipeline. | The only pipeline step is `require-empty-target`. |
| SCN-CREATE-COLLABORATOR-04 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold into a target that already contains a file. | The scaffold fails with `REQUIRE_EMPTY_TARGET` before writing files. |

## Flow

```mermaid
flowchart TD
  A[Create selector chooses Teams Agents and Apps > Teams Collaborator Agent] --> B[Resolve `teams-collaborator-agent`]
  B --> C[Select language-specific content]
  C --> D[Require empty target]
  D --> E[Render app package, collaborator agent project files, infra, and m365agents yaml]
```

## Boundary

- This scenario covers v4 package rendering for a new Teams collaborator agent project.
- It does not provision Azure, register a bot, create SQL resources, call LLM services, or run CLI/VS Code/Visual Studio end-to-end scaffolding.

## Invariants

- The v4 create route must not fall back to the v3 `DefaultTemplateGenerator`.
- The package must render only the selected language subtree.
- The package must reject non-empty targets before writing output.