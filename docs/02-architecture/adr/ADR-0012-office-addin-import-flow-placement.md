# ADR-0012 — Office Add-in import flow placement

- **Status:** Proposed
- **Date:** 2026-05-28
- **Source:** [`../external-dependencies/office-addin-tooling.md` §3](../external-dependencies/office-addin-tooling.md#3-open-questions-candidates-for-adrs)

## Context

Capability §2.6 in [`../scaffolding.md`](../scaffolding.md) — convert
an existing Office Add-in project into toolkit shape — is today exposed
as a branch of the create-project flow:
`OfficeAddinGenerator.doScaffolding` selects between "create new" and
"import existing" inside the same generator, and the import branch
calls `office-addin-project.convertProject`.

The import branch has fragile preconditions documented in
[`../external-dependencies/office-addin-tooling.md`](../external-dependencies/office-addin-tooling.md)
§1.2 — the toolkit already carries a defensive shim
(`ensurePackageJsonForConvert`) because the upstream package throws on
missing `package.json.scripts`. As long as import lives inside the
create flow, every defect in the import path (or in the upstream
package) becomes a defect in the create-project entry surface, even
for users who never touch the import branch.

Create and import are also semantically different: create produces a
new project from a template; import mutates an existing user project
in place. Bundling them obscures the distinction in the UX and forces
a single failure / progress surface to model both.

## Options considered

- **A — Standalone command.** Move import to its own command
  (`atk import office-addin` / equivalent VS Code action). The create
  flow loses the import branch; the import flow gets its own progress
  / error surface; users who only create projects no longer carry the
  `office-addin-project` failure modes.
- **B — Keep inside create, isolate code path.** Keep the UX entry
  point inside create but extract the import branch into its own
  generator class so dependencies and failure surfaces are at least
  segregated in source.
- **C — Status quo.** One generator, two branches, shared error
  surface.

## Decision

(Pending.)

## Consequences

(Pending. A is the only option that lets create-project reliability
be measured independently of import reliability; A also lets the
import flow assume preconditions the create flow cannot.)
