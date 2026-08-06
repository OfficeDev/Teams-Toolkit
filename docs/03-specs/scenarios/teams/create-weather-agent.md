# Create Weather Agent

**Template id:** `weather-agent` (create)

## Acceptance Criteria

| ID | Runtime | Purpose | Gate | Harness | Scenario | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| SCN-CREATE-WEATHER-01 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the TypeScript weather agent template. | The scaffold writes the TypeScript weather agent files. |
| SCN-CREATE-WEATHER-02 | L1 | scenario | per-PR | InMemoryRuntime | Render a TypeScript weather agent with app name `My Weather Agent`. | Package and manifest app-name fields are rendered from caller floor values. |
| SCN-CREATE-WEATHER-03 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the JavaScript weather agent template. | The scaffold selects the JavaScript subtree and writes JavaScript entry files. |
| SCN-CREATE-WEATHER-04 | L1 | scenario | per-PR | InMemoryRuntime | Inspect the weather agent descriptor. | The descriptor exposes TypeScript and JavaScript only. |
| SCN-CREATE-WEATHER-05 | L1 | scenario | per-PR | InMemoryRuntime | Run the scaffold pipeline. | The only pipeline step is `require-empty-target`. |
| SCN-CREATE-WEATHER-06 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold into a target that already contains a file. | The scaffold fails with `REQUIRE_EMPTY_TARGET` before writing files. |

## Flow

```mermaid
flowchart TD
  A[Create selector chooses Custom Engine Agent > Weather Agent] --> B[Resolve `weather-agent`]
  B --> C[Select language-specific content]
  C --> D[Require empty target]
  D --> E[Render app package, weather agent project files, infra, and m365agents yaml]
```

## Boundary

- This scenario covers v4 package rendering for a new weather agent project.
- It does not provision Azure, register a bot, call weather APIs, or run CLI/VS Code/Visual Studio end-to-end scaffolding.

## Invariants

- The v4 create route must not fall back to the v3 `DefaultTemplateGenerator`.
- The package must render only the selected language subtree.
- The package must reject non-empty targets before writing output.