# Create Basic Custom Engine Agent

**Template id:** `basic-custom-engine-agent` (create)

## Acceptance Criteria

| ID | Runtime | Purpose | Gate | Harness | Scenario | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| SCN-CREATE-BASIC-CEA-01 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the TypeScript basic custom engine agent template. | The scaffold writes the TypeScript agent app files. |
| SCN-CREATE-BASIC-CEA-02 | L1 | scenario | per-PR | InMemoryRuntime | Render a TypeScript basic custom engine agent with app name `My Agent App`. | Package and manifest app-name fields are rendered from caller floor values. |
| SCN-CREATE-BASIC-CEA-03 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the JavaScript basic custom engine agent template. | The scaffold selects the JavaScript subtree and writes JavaScript entry files. |
| SCN-CREATE-BASIC-CEA-04 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the Python basic custom engine agent template. | The scaffold selects the Python subtree and omits Node package files. |
| SCN-CREATE-BASIC-CEA-05 | L1 | scenario | per-PR | InMemoryRuntime | Run the scaffold pipeline. | The only pipeline step is `require-empty-target`. |
| SCN-CREATE-BASIC-CEA-06 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold into a target that already contains a file. | The scaffold fails with `REQUIRE_EMPTY_TARGET` before writing files. |

## Flow

```mermaid
flowchart TD
  A[Create selector chooses Custom Engine Agent > Basic Custom Engine Agent] --> B[Resolve `basic-custom-engine-agent`]
  B --> C[Select language-specific content]
  C --> D[Require empty target]
  D --> E[Render app package, agent project files, infra, and m365agents yaml]
```

## Boundary

- This scenario covers v4 package rendering for a new basic custom engine agent project.
- It does not provision Azure, register a bot, or run CLI/VS Code end-to-end scaffolding.

## Invariants

- The v4 create route must not fall back to the v3 `DefaultTemplateGenerator`.
- The package must render only the selected language subtree.
- The package must reject non-empty targets before writing output.