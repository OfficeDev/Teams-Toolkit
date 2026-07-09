# Create Teams Simple Bot

**Template id:** `default-bot` (create)

## Acceptance Criteria

| ID | Runtime | Purpose | Gate | Harness | Scenario | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| SCN-CREATE-DEFAULT-BOT-01 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the TypeScript simple bot template. | The scaffold writes the TypeScript bot app files. |
| SCN-CREATE-DEFAULT-BOT-02 | L1 | scenario | per-PR | InMemoryRuntime | Render a TypeScript simple bot with app name `My Bot App`. | Package and manifest app-name fields are rendered from caller floor values. |
| SCN-CREATE-DEFAULT-BOT-03 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the JavaScript simple bot template. | The scaffold selects the JavaScript subtree and writes JavaScript entry files. |
| SCN-CREATE-DEFAULT-BOT-04 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold the Python simple bot template. | The scaffold selects the Python subtree and omits Node package files. |
| SCN-CREATE-DEFAULT-BOT-05 | L1 | scenario | per-PR | InMemoryRuntime | Run the scaffold pipeline. | The only pipeline step is `require-empty-target`. |
| SCN-CREATE-DEFAULT-BOT-06 | L1 | scenario | per-PR | InMemoryRuntime | Scaffold into a target that already contains a file. | The scaffold fails with `REQUIRE_EMPTY_TARGET` before writing files. |

## Flow

```mermaid
flowchart TD
  A[Create selector chooses Teams Apps > Other > Simple Bot] --> B[Resolve `default-bot`]
  B --> C[Select language-specific content]
  C --> D[Require empty target]
  D --> E[Render app package, bot project files, infra, and m365agents yaml]
```

## Boundary

- This scenario covers v4 package rendering for a new Teams simple bot project.
- It does not provision Azure, register a bot, or run CLI/VS Code end-to-end scaffolding.

## Invariants

- The v4 create route must not fall back to the v3 `DefaultTemplateGenerator`.
- The package must render only the selected language subtree.
- The package must reject non-empty targets before writing output.