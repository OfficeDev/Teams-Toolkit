# ADR-0006 — Template distribution channel for project skeletons

- **Status:** Accepted
- **Date:** 2026-05-29 (revised 2026-06-01, 2026-06-12)
- **Source:** [`../scaffolding.md` §2.1](../scaffolding.md#2-essential-capabilities)

## Context

The scaffolding subsystem must deliver versioned project skeletons per
[`../scaffolding.md`](../scaffolding.md) §2.1. Today the subsystem
supports two channels for the same templates:

- **Bundled with the engine** — selected by `useLocalTemplate()`, which is
  the default for the VS Code surface and for alpha / local-version
  builds.
- **Fetched from GitHub releases** — `templates-config.json` points at
  `https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/...`,
  selected for the Visual Studio surface and for stable VSC upgrades when
  the upstream tag list advances beyond `localVersion`.

The bundle path is offline / deterministic; the fetch path lets templates
ship independently of the engine binary. Carrying both indefinitely
multiplies the failure surface (axios timeouts, GitHub rate limits, zip
integrity, tag-list parsing) for a benefit that may no longer apply now
that VS Code already bypasses fetch entirely.

This decision is internal to the toolkit (no upstream forces a channel
choice) — recorded here because it determines whether constraints 3.2
and 3.4 in `../scaffolding.md` apply unconditionally or only conditionally.

### Concrete deficiencies in the current resolution logic

The "Status Quo" option below (D) inherits the following bugs from the
v3 implementation. They are documented in detail as cluster C in
[`../scaffolding.current-state.md`](../scaffolding.current-state.md#c-distribution-channel-resolution-split-brain)
(see appendix items 22–26 for code references); summarized here so the
trade-off table reads honestly:

1. **Content vs metadata disagree on `beta`.** Templates content
   ([`getTemplateVSCUrl`](../../../packages/fx-core/src/component/generator/utils.ts))
   falls through `beta` into the *stable* tag, while metadata
   ([`fetchOnlineTemplateMetadata`](../../../packages/fx-core/src/core/FxCore.ts))
   maps `beta` to `0.0.0-rc`. A single scaffold run can mix stable
   content with rc selector / NLS data.
2. **`0.0.0-rc` is a mutable tag.** All non-stable channels point at
   one tag whose asset is re-uploaded across an rc window. The code
   works around it by always re-downloading, defeating both caching
   and `../scaffolding.md` §3.4 reproducibility within the window.
3. **Channel detection by substring-sniffing `package.json#version`**
   in three places (VSCode content, VS content, metadata) with subtly
   different rules. No shared `Channel` enum, no single decision
   point, no way to add a fourth stage without touching all three.
4. **Implicit silent fallback to bundled.** `ScaffoldRemoteTemplate`
   runs first; on empty result `ScaffoldLocalTemplate` takes over with
   `<fx-core>/templates/fallback/<language>.zip`. Telemetry fires
   `template-fallback`, but the user is not informed that the
   delivered artifact differs from what the engine intended. Two
   identical `(engine, inputs)` runs can produce different output
   depending on network state, violating `../scaffolding.md` §3.1.
5. **`useLocalTemplate` is a global build-time flag.** No per-surface
   or per-template opt-out is possible; the only choice is "every
   remote fetch on" or "every remote fetch off".

The pending decision below should answer not only "which channel(s) do
we keep" but also "how does the kept channel(s) resolve a build to a
templates tag", to avoid inheriting these bugs.

## Options considered

- **A — Bundle only.** Drop the GitHub-release channel; templates ship
  inside the engine package for both VSC and VS. "Templates lag engine
  releases" is acceptable because each surface releases on roughly the
  same cadence as the engine.
- **B — Bundle + opt-in remote update channel.** Bundle as default;
  remote fetch becomes a user-opt-in "check for newer templates" that
  produces a one-off cache on disk. Removes the on-scaffold network
  dependency without losing the ability to ship templates faster than
  the engine.
- **C — npm-published templates package.** Replace the GitHub releases
  channel with an npm package (`@microsoft/m365-agents-templates-<lang>`)
  whose version is declared in the engine's `package.json`. Resolution
  goes through the user's npm cache / proxy / audit chain instead of
  toolkit-written HTTP code. *Rejected:* the `templates` package is
  deliberately kept `private: true` and distributed by copying its build
  output into `<fx-core>/templates/` plus uploading zips to GitHub
  releases; publishing to npm would be a new distribution surface, not a
  refinement of the existing one.
- **D — Status quo.** Keep both channels with current selection logic.
- **E — Bundle floor + immutable GitHub-release channel, with the channel
  resolved once at `lerna version` time (refines B).** Keep both the
  bundled floor and the GitHub-release channel, but stop re-deriving the
  channel at scaffold time. Today the channel is *already* known when
  [`pkg-version.sh`](../../../.github/scripts/pkg-version.sh) runs during
  `lerna version` (independent mode), yet the runtime re-infers it from
  `package.json#version` substrings in three places
  ([`getTemplateVSCUrl`](../../../packages/fx-core/src/component/generator/utils.ts),
  [`getTemplateVSUrl`](../../../packages/fx-core/src/component/generator/utils.ts),
  [`useLocalTemplate`](../../../packages/fx-core/src/component/generator/templateHelper.ts)).
  Option E moves the decision to build time and makes the runtime read-only.

## Decision

**Option E (refined B), reduced to two runtime concepts.** Keep both the
bundled floor and the GitHub-release channel, resolve the choice once at
`lerna version` time, and have the scaffold runtime read the result
instead of re-deriving it from `package.json#version`. The runtime reads
exactly two things — `range` and `bundled` — through one pure function.

1. **Two build-time concepts replace runtime sniffing (fixes deficiencies
   1, 3, 5).** The CD version step
   ([`fxcore-sync-up-version.js`](../../../.github/scripts/fxcore-sync-up-version.js),
   successor to today's `updateUseLocalFlag`) writes two explicit fields
   into
   [`templates-config.json`](../../../packages/fx-core/src/common/templates-config.json):

   - **`range`** — the SemVer range this build may resolve (reusing the
     existing `version` field, e.g. `"~6.10"`).
   - **`bundled`** — a boolean: test / offline / daily builds read the
     bundled floor only; shipped builds prefer the release channel.

   The decision is keyed off **the CD job's purpose (test vs ship)** — a
   *release* pipeline writes `bundled=false`, every other build writes
   `bundled=true` — not off whether the version string is a prerelease,
   which is what folded test-mode and lane together in v3. A single
   `resolveTemplateSource({ range, bundled, runtime })` reads these fields;
   it never parses `package.json#version`, so the VSC-ships-stable /
   VS-ships-beta fork in `version.includes("beta")` disappears. All three
   surfaces (VSC / CLI / VS-server) share this one function — surface
   differences are injected field values, not code branches, so one
   T1/T2/T3 set over `InMemoryRuntime` covers every surface.
   `TEMPLATE_VERSION=local` remains the highest-priority per-invocation
   override for `bundled=true`.

2. **Lane is SemVer prerelease semantics, not a field (fixes deficiency
   1).** `stable` vs `beta` need no separate field and no lane-sharded
   tag-list. Beta versions carry a `-beta` prerelease segment;
   `semver.maxSatisfying` over a single tag-list already excludes
   prerelease versions from a stable `range` unless the range itself names
   the segment (`>=6.11.0-beta`). Lane isolation is therefore free from
   SemVer. "alpha" stops being a third lane — it was only ever
  `bundled=true`, now expressed directly. Because selector, descriptor,
  and content are pinned by one resolved v4 artifact snapshot, content and
  metadata can no longer disagree.

3. **Digest-addressed pinning replaces both `0.0.0-rc` and a fixed version
   (fixes deficiency 2).** The mutable hand-written `0.0.0-rc` tag is
   removed; `lerna version` already mints immutable prerelease versions
   (e.g. `templates@6.11.0-rc.0`) in independent mode. Rather than pinning
   one concrete version (permanently reproducible, but templates could
   never update independently of the engine), the build pins the `range`
  and records the resolved version plus digest evidence on the scaffold outcome
  and telemetry. In the final v4 channel, digest pinning is per staged
  artifact (`create-selector`, `modify-selector`, `metadata`, `templates`)
  rather than one top-level package digest. The on-disk cache is keyed by
  version and artifact kind under `~/.fx/templates-cache/templates-v4@<version>/`,
  strengthening the immutable tag against a re-push. This yields **auditable strong
   reproducibility** — a recorded digest always re-fetches the same bytes
   — without sacrificing post-ship template updates, restoring
   [`../scaffolding.md`](../scaffolding.md) §3.4 across the rc window.

4. **Fallback is a max over satisfiers, observable never silent (fixes
   deficiency 4).** When the release channel is unreachable, resolution
   falls to `max(highest cached version satisfying range, bundled floor
   version)` — both immutable, checksum-validated, and satisfying `range`.
   The outcome records `source = cache | bundled-fallback` and the
   resolved version, and `scaffold-v4-template` carries the corresponding
   `package-source`. The bundle is an intentional floor, not an implicit
   substitution; two identical `(engine, inputs)` runs that diverge on
   network state are now an observable event.

5. **v3 non-blocking constraints (already-shipped clients).** A frozen v3
   client depends only on three shared resources: the legacy tag-list URL
   (`.../template-tag-list/template-tags.txt`), its own baked SemVer
   `range`, and the per-version zip asset names. v4 must therefore obey:
   (a) **channel isolation** — v4 template releases use a **dedicated tag
   prefix** (`templates-v4@`, mirroring the existing `templates-vs@` split)
   published to a **separate model-A tag list**; the legacy `templates@`
   tag list a v3 client reads never contains a v4 version, so v3 can never
   `maxSatisfying` into one *regardless of version number*. This lets v4
   versions stay in sync with the engine's `6.x` line rather than forcing
   a MAJOR jump. (b) the **legacy tag-list URL is never deleted or moved** —
   it keeps receiving the stable versions v3 still needs; (c) **historical
   release assets are frozen** — `templates@6.10.x/ts.zip` etc. stay
   byte-for-byte, and the single-package v4 layout (§5.2 / ADR-0014)
   applies only to go-forward v4 versions under the `templates-v4@` prefix.
   With prefix isolation there is no residual wide-range risk: even a
   historical client baked with a *wide* range (e.g. `>=6.0.0`) reads only
   the legacy `templates@` list and cannot see a `templates-v4@` version.

The rollout is incremental and behavior-preserving first. **This work is
part of v4, not a v3 feature**, even though it may ship ahead of the v4
scaffolding engine: the new `resolveTemplateSource()` and the new
CD / workflow steps that write `range` + `bundled` live **isolated in the
v4 world** (the v4 generator directory and dedicated workflow steps),
consistent with the two-worlds model in
[§5.1](../scaffolding.create.proposal.md). The **only** changes permitted
on the v3 side are the minimal modifications needed to retire the broken
behavior — pointing the existing v3 resolution functions at the new seam,
and removing the `0.0.0-rc` mutable-tag path and the `package.json#version`
substring sniffing. v3 is otherwise frozen (§5.1 frozen registry); no new
distribution logic is added to it. The de-risking first cut — write
`range` + `bundled`, introduce `resolveTemplateSource()`, and route the v3
functions through it — changes no behavior and is runnable in parallel
with the v4 tracer-bullet. The observable fallback, digest cache, and the
final removal of `getTemplateVSCUrl` / `getTemplateVSUrl` /
`useLocalTemplate` follow once that is stable.

## Consequences

- `fetchZipFromUrl`, `fetchTagList`, and `getTemplateLatestVersion` are
  retained (the GitHub-release channel stays) but are reached only through
  the single `resolveTemplateSource()` decision point; the three
  substring-sniffing call sites are deleted in the final step.
- `templates-config.json` keeps `range` (the existing `version` field) and
  gains `bundled`. It does **not** gain `channel`, `source`, or a fixed
  `pinnedTemplateVersion`; `localVersion` and `useLocalTemplate` are
  removed once the two-field model lands. The resolved `digest` lives on
  the scaffold outcome / telemetry, not in the committed config. `0.0.0-rc`
  and the mutable-tag download path are removed.
- `../scaffolding.md` §3 keeps §3.1 (Deterministic), §3.2
  (Offline-by-default — the bundled floor), and §3.4 (Reproducible) as
  unconditional constraints, since the bundled floor and digest-recorded
  resolution now hold on every path.
- The release workflow must publish RC zips to immutable lerna prerelease
  tags instead of re-uploading `0.0.0-rc`, and v4 template releases must
  publish under the dedicated `templates-v4@` tag prefix to a separate
  model-A tag list, keeping v3 `templates@` clients on their own channel;
  these are the workflow changes that are not behavior-preserving.
- **The v4 channel publish is gated on `goproduct`, decoupled from the
  `preid` lane.** Because the v4 channel is the *only* way already-shipped
  engines (VSC / CLI) receive new templates, the CD step that uploads a
  `templates-v4@<version>` release and appends its NDJSON digest entry is
  gated solely on `goproduct=true` (`PRODUCTION`), independent of `preid`.
  This makes a **templates-only RC** a first-class flow: dispatching CD with
  `preid=rc` + `goproduct=true` + `pkgs=template` (no `extension@` /
  `teamsfx@` version change) publishes a prerelease *into the channel*
  without releasing a new engine. The flow is safe for live `stable`
  clients precisely because of point 2: a shipped engine carries a frozen,
  prerelease-free `range` (e.g. `~6.11`), and `semver.maxSatisfying`
  excludes the `-rc` version from that range — so an `rc` in the channel is
  invisible to `stable` users and can only be exercised on purpose, via the
  `TEMPLATE_VERSION=<rc-version>` pin (the `pinnedOnline` path) or a build
  whose `range` names the prerelease segment. A subsequent
  `preid=stable` + `goproduct=true` + `pkgs=template` run then publishes
  `templates-v4@<version>`, which the same frozen `~6.11` clients *do*
  resolve — delivering the validated templates without touching the engine.
  Net: the test-then-promote (`rc` → `stable`) sequence for a
  templates-only update cannot break shipped VSC / CLI. The one
  non-obvious constraint is that `rc` must also set `goproduct=true`, since
  the upload switch lives on `goproduct`, not on `preid`.
- Decomposes into the cluster C fix tracked alongside the v4 proposal
  [§5.2 distribution seam](../scaffolding.create.proposal.md). The legacy
  full-package seam still resolves `(source, version, digest)`; the final v4
  seam resolves a `TemplateArtifactSnapshot` that pins one version and one
  artifact digest set across Q1, Q2, and scaffold.

## Final v4 staged artifact follow-up

*Added 2026-07-01. Replaces the earlier metadata-cache transition. There is no
online v4 channel using the older draft shape, so the first published v4 channel
uses this final protocol directly.*

The v4 release unit `templates-v4@<version>` publishes four assets:
`create-selector.json`, `modify-selector.json`, `templates-metadata.zip`, and
`templates.zip`. The separate v4 tag-list asset is NDJSON with one entry per
line in the shape `{ "version": "6.11.0", "artifacts": { ... } }`. Each
artifact ref carries its own file name and `sha256:` digest; there is no
top-level `digest`.

### Staged invariants

- **INV-S1 — resolve once per invocation.** A create or modify invocation
  resolves one `TemplateArtifactSnapshot` and pins it for the whole run. Q1,
  Q2, and scaffold never mix artifact versions.
- **INV-S2 — Q1 uses selector assets.** Interactive create reads
  `create-selector.json`; interactive modify reads `modify-selector.json`.
  The selector routes are sufficient to identify v4 template ids without
  opening `templates.zip`.
- **INV-S3 — Q2 uses metadata assets.** Input collection reads
  `templates-metadata.zip`, which contains selectors, descriptors, questions,
  and pipelines, but no `content/**`.
- **INV-S4 — scaffold uses full templates.** The full `templates.zip` asset is
  required only when rendering content, or immediately for non-interactive
  template-id resolution.
- **INV-S5 — cache retention is per artifact kind and minor line.** For each
  artifact kind and each `major.minor`, keep only the highest cached patch.
  A new `6.11.x` cache entry does not evict `6.10.x`.

`fetchOnlineTemplateMetadata` no longer downloads the legacy v3-style
`metadata.zip` for v4. When v4 is enabled, it warms `templates-metadata.zip`
through the same staged artifact resolver and leaves the legacy `~/.fx`
metadata directory untouched; legacy metadata readers continue to use bundled
v4 data while the create/modify front doors use staged artifacts directly.
