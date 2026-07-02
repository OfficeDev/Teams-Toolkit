# ADR-0015 — `templates-v4@version` release artifact shape

- **Status:** Accepted
- **Date:** 2026-05-28 (Accepted 2026-06-05)
- **Source:** [`scaffolding.create.proposal.md` §14](../scaffolding.create.proposal.md#14-adrs-this-proposal-will-be-decomposed-into)
  (decomposes §§3, 5). Validated against the on-disk layout under
  `v4/{create,modify}/<id>/` and `v4/{create,modify}/selector.json`.

## Context

This is an **internal** decision about the *shape* of the release artifact that
carries project starters, deliberately **decoupled** from where that artifact is
fetched from ([ADR-0006](ADR-0006-template-distribution-channel.md) owns the
channel, the `templates-v4@` tag prefix, and digest pinning). The proposal's
goal #1 (§1) is that "the unit of evolution for a
project starter is **one folder of declarative JSON + content**, versioned and
shippable independently of the engine." §3 fixes the on-disk shape; §5 fixes how
the selector indexes it.

The two shipped scenarios materialize that shape:
`v4/create/da/mcp-server/` and `v4/modify/add-mcp-server/`,
each a self-contained four-file package, with a per-kind `selector.json` and a
shared `v4/schema/`.

## Options considered

- **A — Per-template npm package.** Maximum independence, but N packages to
  publish/version and a heavy release process for a small starter edit.
- **B — Templates inlined into fx-core (status quo).** No new artifact, but
  every starter edit is an engine release and an AI agent edits TypeScript.
- **C — One versioned `templates-v4` artifact, kind-partitioned, four-file
  packages, schema-validated (chosen).** One release unit; starters evolve as
  data; the engine pins a compatible range.

## Decision

1. **One release unit `templates-v4@<version>` publishes four assets** under
  the dedicated `templates-v4@` tag prefix on its own model-A tag list
  (ADR-0006 §5) — never the legacy `templates@` channel a v3 client reads.
  Its version tracks the engine's `6.x` line (e.g. `templates-v4@6.11.0`)
  rather than forcing a MAJOR jump. The assets are `create-selector.json`,
  `modify-selector.json`, `templates-metadata.zip`, and `templates.zip`.
  The tag-list entry is `{ version, artifacts }`, with a digest per artifact;
  there is no top-level digest compatibility field. Inside `templates.zip`,
  packages are partitioned by lifecycle **kind** at the top level:
  `v4/{create,modify}/<id>/`. Each `<id>` package is **four-file isomorphic**:
   `descriptor.json` + `questions.json` + `pipeline.json` + optional `content/`
   (§3). `content/` is **optional** (a `modify` package that adds no files omits
   it entirely — emptiness is absence, not a marker file), while
   `questions.json` / `pipeline.json` are always required.

2. **Each package is self-contained on disk.** A `create` package's `content/`
   is **seeded by a one-time copy** of the corresponding v3 scenario tree, after
   which it is the **authoritative v4 source** — owned, editable, and free to
   diverge (the shipped `da/mcp-server` content has already been modified). The
   build zips these authored bytes verbatim under `v4/`; it **never** re-derives
   or stitches content from the v3 tree at build time (§3), so v3 edits do not
   leak into a v4 package and v4 edits do not touch v3. This is why
   `da/mcp-server/content/appPackage/ai-plugin.json.tpl` ships as a literal
   `.tpl` the author can hand-edit.

3. **Each kind carries one `selector.json`** at `v4/<kind>/selector.json`
  (§5). The same selector is also published as the small selector-only asset
  for Q1. `templates-metadata.zip` carries both selectors plus every
  `descriptor.json`, `questions.json`, and `pipeline.json`, but excludes all
  `content/**`; Q2 can therefore collect inputs without downloading the full
  scaffold content. `templates.zip` remains the full-content asset used for
  direct template-id resolution and scaffold.

4. **Compatibility is bidirectional, not a lockstep.** *Forward* (which artifact
  the engine resolves) is **ADR-0006's**: the engine pins a SemVer `range` over
  `templates-v4@<version>`, resolves one staged artifact snapshot through the
  `(package-source, package-version)` hand-off, and records the resolved
  version plus per-artifact digests. *Reverse* (whether a resolved package may run on this
   engine) is **this ADR's**: each template carries `descriptor.minEngineVersion`
   (both MCP scenarios pin `5.20.0`), checked before the package runs. Starter
   edits therefore ship as a new `templates-v4@<version>` within the engine's
   frozen `range` — no engine release — as long as `minEngineVersion` still holds.

   **Why `range` alone cannot replace `minEngineVersion`.** The two signals
   freeze at different times and at different granularity, and they point in
   opposite directions. `range` lives *in the engine* and is frozen when that
   engine ships; `minEngineVersion` lives *in each template descriptor* and is
   written by the template author, typically **long after** many engines are
   already in the field. The whole point of the ADR-0006 channel is that an
   already-shipped engine (say fx-core `6.11.0`, frozen `range = ~6.11`) keeps
   receiving templates published *later* — so that engine cannot possibly have
   pre-encoded, in its `range`, a capability requirement that did not yet exist
   when it shipped. Worked example: a future `templates-v4@6.11.5` carries two
   packages —

   ```
   templates-v4@6.11.5/
   ├── da/mcp-server   minEngineVersion: "5.20.0"   # needs no new engine capability
   └── da/foo          minEngineVersion: "6.11.3"   # uses a step added in 6.11.3
   ```

   A `6.11.0` client's `~6.11` range *forward*-resolves the whole `6.11.5`
   artifact (range is **artifact-level** — it cannot admit one package and
   reject another). `da/mcp-server` then passes the *reverse* gate
   (`6.11.0 >= 5.20.0`) and scaffolds; `da/foo` fails it (`6.11.0 < 6.11.3`) and
   raises an explicit upgrade error **instead of** crashing later on an unknown
   step. `range` is structurally unable to express this: tightening it to exclude
   `da/foo` would require shipping a *new engine*, which is exactly what the
   independent-template-release model forbids. So while `minEngineVersion` is
   **dormant today** (both shipped templates pin `5.20.0`, below every live
   `6.x` engine — running an old `6.11.0` engine against them is a *supported*
   path, not a counter-example), it is the only mechanism that protects the
   *first* template that needs a newer engine while older engines are still in
   the field. It is a near-zero-cost fuse, not everyday logic.

## Consequences

- **New constraint:** the build validates every package against
  `templates/v4/schema/{descriptor,question,selector}.schema.json` and the §3.4
  placeholder accounting before zipping; a malformed package fails the build,
  not a user scaffold.
- **New constraint:** `descriptor.minEngineVersion` is mandatory and is the
  **reverse** (template→engine) compatibility signal; the **forward**
  (engine→artifact) selection is ADR-0006's pinned `range` + recorded `digest`.
  Bumping a template in a way that needs a new step/provider raises
  `minEngineVersion`.
- **Hand-off, not overlap, with [ADR-0006](ADR-0006-template-distribution-channel.md):**
  this ADR settles the *content/metadata* half of the artifact; the
  `templates-v4@` tag prefix, the separate model-A tag list that isolates v3
  `templates@` clients, source selection, and fetch/caching/digest remain
  ADR-0006's. They share only `(package-source, package-version)` and the
  `minEngineVersion` check (§5.2).
- **Enables [ADR-0018](ADR-0018-scaffold-runtime-test-pyramid.md):** because a
  package is data on disk, T1/T2 tests load it without `npm install` or network.
- **Reversible while `Proposed`:** the four-file shape and kind partition are the
  ratifiable decision; the two shipped packages are the conformance fixtures.

## Derived specs

- [`validate-template-package`](../../03-specs/operations/scaffolding/validate-template-package.md)
  — the operation spec that turns this decision into an AC-tabled behavioral
  contract: the four-file isomorphism + schema + §3.4 placeholder accounting +
  selector/descriptor consistency (build-CI author gate **and** engine-load
  defense-in-depth), and the **reverse** `minEngineVersion` compatibility gate
  (explicit upgrade error, never a silent fallback). The placeholder rows share
  invariant 5 with [ADR-0016](ADR-0016-declarative-template-format.md); the
  routing-consistency rows share descriptor-derived routing with
  [ADR-0014](ADR-0014-dispatcher-buildtarget-resolution.md) §5.3.
