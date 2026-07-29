---
description: Rules for the generated vscuse case engine - use when changing packages/tests/vscuse/vscode-test-cases cases, components, engine code, generated plans, or the compile-vscuse-case-bundles spec. Covers the verification loop, component format constraints, evidence-backed assertions, and the no-fabricated-coordinates rule.
applyTo: 'packages/tests/vscuse/vscode-test-cases/**,docs/03-specs/operations/product/compile-vscuse-case-bundles.md'
---

# vscuse Generated Case Engine Rules

These rules cover the **generated** case engine only: semantic case YAML under
`cases/`, recorded UI components under `components/`, compiler code under
`engine/`, the manifest-owned plans under `plans/`, and the owning spec
`docs/03-specs/operations/product/compile-vscuse-case-bundles.md`.

Hand-recorded plans in `plans/` that are **not** listed in
`plans/.vscuse-generated-plans` are out of scope — those belong to the
`vscuse-case-diagnosis` and `vscuse-scenario-authoring` skills.

## Verification Loop

Run all four after every change, from the repository root:

```powershell
pnpm --dir packages/tests run generate:vscuse-cases
pnpm --dir packages/tests run test:vscuse-engine
pnpm exec prettier --check "packages/tests/vscuse/vscode-test-cases/engine/*.cjs" "packages/tests/vscuse/vscode-test-cases/cases/*.yml" "docs/03-specs/operations/product/compile-vscuse-case-bundles.md"
pnpm --dir packages/tests run generate:vscuse-cases   # must print "No generated plan changes."
```

Never pipe `generate:vscuse-cases` into a truncating pipe such as
`Select-Object -First N` or `Select-String ... | Select-Object -First N`.
PowerShell tears down the pipeline early, kills the node process mid-run, and
leaves a zero-byte `plans/.vscuse-generated-plans.lock`. Redirect instead:

```powershell
pnpm --dir packages/tests run generate:vscuse-cases *> $env:TEMP\vscuse-gen.txt
```

If a stale `plans/.vscuse-generated-plans.lock` exists, delete it before
rerunning. Never hand-edit files under `plans/` — regenerate them.

## Component Constraints

`engine/render-component.cjs` rejects components that break these:

- `.tpl` files must use **LF** line endings, or rendering fails with
  `VCB_COMPONENT_FORMAT`. Files created on Windows default to CRLF — convert
  before running the engine.
- The parameters a component **declares** in `component.parameters`, the ones it
  **uses** as `{{text:...}}` / `{{json:...}}`, and the ones the compiler
  **supplies** must be exactly the same set, or rendering fails with
  `VCB_COMPONENT_PARAMETER`. `instanceSuffix` is always one of them.
- Step IDs must be unique after rendering, so every `step_id` includes
  `{{text:instanceSuffix}}`.
- A component owns exactly one entry state. Do not add optional steps, runtime
  fallbacks, or "A or B" assertions to make one template serve two states.

## Interactions and Coordinates

vscuse has **no coordinate-free interaction tool**: every `click` requires
`x`/`y`, and empty `tool` is only valid on `assertion` and `code` steps.

- Prefer typed filtering (`type_text` into a quick input, then assert the option
  is selectable) over recorded clicks for quick-pick options.
- Never fabricate coordinates. Widget geometry is not derivable, and it is not
  even stable per option: inside the single recorded plan
  `plans/DA_Add_Action_Import_Existing_API.json`, `Declarative Agent` was clicked
  at y 93 and y 86, `No Action` at y 132 and y 135, and `Start with a New API` at
  y 82 and y 128. A misplaced click silently selects the wrong option instead of
  failing.
- Coordinates may only enter the repository through a real recording, together
  with the `dhash:` preconditions captured at the same time. Do not reuse a
  recorded coordinate on a different screen because the dialog "looks the same".

## Authoring Cases

- Semantic case YAML expresses intent only — no component paths, tools, command
  titles, coordinates, or assertion sentences. Those live in the compiler and
  its components.
- Ground every assertion in verified evidence before writing it: read the
  template file the assertion quotes, or call the service the agent will call.
  Reachability differs per variant — a placeholder credential may yield `401`,
  an empty result set, or an interactive sign-in rather than the data you
  expect, and each demands a different expectation.
- Do not assert response content that depends on a service this repository does
  not control. Prefer a weaker but stable expectation, and record why in a YAML
  comment next to the check.
- For the Copilot target profile, `target` already emits the readiness
  assertion; `open` re-emits it and exists to establish `chat-ready`. Adding a
  bare `open` with no following chat check adds no coverage.
- Editing a case file can break engine tests that call
  `compileFixture("<that file>.yml", transform)` with literal string
  replacements. Always rerun `test:vscuse-engine` after touching `cases/`.

## Spec and Tests

Behavior changes require, in this order:

1. A new acceptance-criteria row in
   `docs/03-specs/operations/product/compile-vscuse-case-bundles.md`, using the
   next free `VCB-NN` id, plus any contract prose the row depends on.
2. A test in `engine/semantic-step-compiler.test.cjs` named after that id.
3. The compiler change.

Determinism is part of the contract: `plan_id` is derived from the source path
and case id, and step suffixes from the component hash, occurrence, and component
index. Any change that reorders or renames steps rewrites plan files — review
that diff instead of skimming it.
