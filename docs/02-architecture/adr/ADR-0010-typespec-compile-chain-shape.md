# ADR-0010 — TypeSpec → agent-artifact compile chain shape

- **Status:** Proposed
- **Date:** 2026-05-28
- **Source:** [`../external-dependencies/typespec-compiler.md` §3](../external-dependencies/typespec-compiler.md#3-open-questions-candidates-for-adrs)

## Context

TypeSpec capability §2.3 in [`../scaffolding.md`](../scaffolding.md)
requires producing DA and plugin manifests from `.tsp` sources.

Today the chain is:

1. `runForTypeSpecProject` runs `npm install` on the user project.
2. `TypeSpecCompileDriver.execute` shells out to
   `npx --package=@typespec/compiler tsp compile`.
3. The driver reads the emitted OpenAPI spec(s) and DA manifest from
   the `output-dir` configured per emitter (per
   [`../external-dependencies/typespec-compiler.md`](../external-dependencies/typespec-compiler.md)
   §1.3).
4. For each OpenAPI spec, the driver calls `kiotageneratePlugin` (per
   [`../external-dependencies/kiota.md`](../external-dependencies/kiota.md))
   to produce a plugin manifest — plugin manifests are *not* emitted by
   the TypeSpec compile step itself.
5. The driver patches OpenAPI extensions back into each plugin
   manifest.

Two aspects of step 2 are open: the use of `npx` (a subprocess that
resolves the compiler from the user project's `node_modules`) vs the
programmatic Node API exposed by `@typespec/compiler` (per fact-page
§1.1, both modes are available upstream); and the `npm install`
precondition in step 1 needed only to populate `node_modules` for that
subprocess.

Whether the Kiota chain (steps 4–5) can be removed depends on whether
the M365 emitter is extended upstream to emit plugin manifests
directly. That is an upstream-evolution question, not a current-source
fact, so it is out of scope for this ADR and would be the subject of a
future ADR if and when the M365 emitter ships that capability. ADR-0011
(Kiota binary acquisition timing) is independent of this ADR.

## Options considered

- **A — Programmatic compile.** Replace step 2's `npx tsp compile`
  subprocess with `@typespec/compiler`'s programmatic Node API,
  imported by the toolkit from the user project's `node_modules`.
  Step 1's `npm install` precondition stays (the user project still
  needs its `devDependencies` installed for the compiler to resolve
  emitters), but the subprocess and the `cli/runNpmCommand` wrapper
  for compile go away. Steps 3–5 unchanged.
- **B — Keep CLI invocation; tighten npm-install scope.** Continue to
  use `npx tsp compile`, but reduce the `npm install` invocation in
  step 1 to the narrowest form that satisfies the subprocess (e.g.
  skip when `node_modules` already exists with the right pins).
  Subprocess shape unchanged.
- **C — Status quo.** Today's chain unchanged.

## Decision

(Pending.)

## Consequences

(Pending. Option A removes a subprocess hop and the `npm install`
wrapper around it, at the cost of resolving the compiler from the user
project's `node_modules` in toolkit code. Option B keeps the subprocess
but narrows the offline / latency tax of step 1. Both leave the Kiota
chain in place — Kiota's acquisition timing is tracked separately in
ADR-0011.)
