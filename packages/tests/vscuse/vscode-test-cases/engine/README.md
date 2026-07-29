# VscUse Case Engine

This directory contains the compiler foundation for semantic VscUse case bundles. The owning
behavior contract is
[`compile-vscuse-case-bundles`](../../../../../docs/03-specs/operations/product/compile-vscuse-case-bundles.md).

## Compile API

`index.cjs` exports `compileCaseBundle`:

```js
const result = compileCaseBundle({
  sourcePath: "cases/weather-agent.yml",
  sourceText,
  compileStep({ caseId, occurrence, stepName, definition }) {
    return { ok: true, value: renderedVscUseSteps };
  },
});
```

The function is synchronous and performs no I/O itself. It does not scan directories, read
environment variables, or write plans. A successful result contains one deterministic plan
descriptor per authored case. An expected failure contains only stable, source-addressed
diagnostics and no partial plans. Callers provide the `compileStep` port and are responsible for
keeping that adapter deterministic and free of side effects.

## Stages

| Module                       | Owns                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `parse-case-bundle.cjs`      | YAML parsing and entry into closed-shape validation.                  |
| `validate-case-bundle.cjs`   | V1 root, case, and semantic-step shape diagnostics.                   |
| `expand-case-bundle.cjs`     | Exact reference expansion and scaffold/template invariants.           |
| `preflight-output-paths.cjs` | Safe normalized filenames and source-wide collision detection.        |
| `compile-case-bundle.cjs`    | Adapter invocation and deterministic plan descriptor composition.     |
| `diagnostics.cjs`            | Stable diagnostic shape: code, source path, YAML path, fixed message. |

Every step occurrence receives an isolated definition snapshot. Every generated plan receives its
own metadata objects, so one case cannot mutate another case through shared YAML definitions.

## Adapter Boundary

`compileStep` is the only semantic-to-VscUse port in this increment. It must return either
`{ ok: true, value: steps }` or `{ ok: false, diagnostics }`. The engine preserves authored case and
step order and never infers a recipe.

`setupGeneratedPlans` uses the checked-in semantic adapter by default. The adapter resolves the
authored question IDs, option IDs, operation inputs, and target titles directly from `cases/`, then
instantiates reusable templates under `components/`. There is no second per-template catalog or
registry. Tests may still inject `compileStep` to isolate compiler or writer behavior.

## Setup API

`index.cjs` also exports `setupGeneratedPlans`. With no path overrides, it reads sibling
`cases/*.yml` and `cases/*.yaml` files in deterministic filename order and writes generated JSON
plans into sibling `plans/`:

```js
const result = await setupGeneratedPlans();
```

Setup prints a unified diff before touching generated plans. An unchanged rerun prints
`No generated plan changes.` and performs no writes. Callers may provide `onDiff` to capture the
raw diff instead.

The non-JSON `plans/.vscuse-generated-plans` manifest owns generated files. Setup may update or
remove only those files; a collision with a manually authored plan fails without changing disk.
All YAML sources compile successfully before any diff or write begins, and writes use sibling
temporary files. Changed setup acquires a non-JSON exclusive lock, revalidates the manifest and
target content and identity after diff reporting, verifies renamed backups before replacement, and
installs targets exclusively. Each target is registered to the transaction immediately after
linking and identity-checked again before commit completes; rollback removes only links that still
belong to that transaction. Descriptor
filenames must match the compiler's normalized lowercase alphanumeric-and-hyphen `.json` form,
which also rejects Windows alternate data streams and reserved device basenames. Staging or commit
failures roll back prior content; if restoration fails, the prior content remains in a sibling
`.bak` file and setup returns `VCB_OUTPUT_ROLLBACK`. If committed-output cleanup fails, setup keeps
the committed targets and returns `VCB_OUTPUT_CLEANUP`, including temporary, backup, or lock cleanup
failures. An empty first setup performs no writes and does not initialize an empty manifest.

The lock coordinates setup processes using this writer. It does not block unrelated processes from
editing files after the final identity check. Rollback covers I/O failures observed by the running
process; abrupt termination can leave the lock, temporary files, or recoverable backups for manual
inspection.

Run the focused compiler, writer, and component contracts from `packages/tests`:

```powershell
pnpm run test:vscuse-engine
```
