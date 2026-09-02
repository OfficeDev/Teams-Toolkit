# ADR-0022 — Ownership of host-agnostic manifest-template resolution

- **Status:** Accepted
- **Date:** 2026-08-06
- **Source:** Internal concern — a second host (the SPFx `copilotAgentPlugin`
  build in ODSP-Web) needs the manifest `${{ENV}}` / `$[file()]` resolver
  without depending on `@microsoft/teamsfx-core` or a `DriverContext`. Related
  fact page: [`../external-dependencies/manifest-schemas.md`](../external-dependencies/manifest-schemas.md).

## Context

Resolving a Microsoft 365 manifest template means expanding two syntaxes before
the JSON is validated or packaged: `${{ENV_NAME}}` environment-variable
placeholders and `$[file('<path>')]` function macros (which inline a `.txt` /
`.md` file, itself env-expanded, with nested `file(file(...))` and
`file(${{ENV}})` forms). Historically this logic lived only in `fx-core`
(`envFunctionUtils` / `getResolvedManifest`) and was entangled with
`DriverContext` — telemetry, `logProvider`, `getLocalizedString`, and the
`FxError` type.

`fx-core` is the toolkit **engine** (heavy, VS Code / CLI oriented). A new
consumer — the SPFx build pipeline that emits declarative-agent packages — needs
the identical resolution but runs in a plain Node build with no `DriverContext`,
no `neverthrow`, and no localized-string catalogue. The question this ADR
settles is engine-internal and purely about **package ownership / dependency
direction**: *which package owns the host-agnostic resolution, so more than one
host can share it without duplicating the grammar?* No external platform forces
the answer; the manifest schemas the output conforms to are a related fact, not
the decision.

## Options considered

- **A — Keep it in `fx-core`; other hosts import `fx-core` or re-implement it.**
  Either drags the whole engine (and `DriverContext`) into a lightweight SPFx
  build, or forks the grammar into a second copy that drifts. Rejected.
- **B — Move the host-agnostic resolution down into `@microsoft/app-manifest`
  (the leaf manifest package), and have each host wrap it.** The manifest
  package already owns manifest structure and already depends on `fs` / `path` /
  `strip-bom`. It exposes pure primitives (`expandFileFunctionMacros`,
  `resolveManifest` → `ResolveManifestResult`) and a plain
  `ManifestTemplateError` hierarchy; `fx-core` keeps a thin wrapper
  (`resolveManifestWithContext`) that adds only its cross-cutting concerns
  (function-count telemetry, localized `FxError` mapping). Follows the existing
  `fx-core → @microsoft/teamsfx-api → @microsoft/app-manifest` dependency
  direction. Chosen.
- **C — Extract a new standalone `manifest-template` package.** Over-fragments
  the graph for logic that is intrinsically about manifests; the manifest
  package is already the right home. Rejected.

## Decision

**Option B.** Host-agnostic manifest-template resolution lives in
`@microsoft/app-manifest`. It is the single source of the resolution grammar and
ordering (expand `$[file()]` — except for `ApiSpec` — then `${{ENV}}`, then fail
on any unresolved variable) and throws a plain `ManifestTemplateError` subclass
carrying the offending path/token. Hosts (`fx-core` today; the SPFx build next)
consume it and add only their own cross-cutting concerns; no host re-implements
the grammar.

## Consequences

- **New constraint:** the manifest-template grammar (`${{ENV}}` / `$[file()]`,
  file embedding, missing-variable detection) exists in exactly one place —
  `@microsoft/app-manifest`. A host that needs resolution wraps
  `resolveManifest` / `expandFileFunctionMacros`; re-implementing the grammar in
  a host is a review reject.
- `@microsoft/app-manifest`'s `ManifestTemplateError` messages are plain,
  non-localized English; a host that surfaces them to users catches the specific
  subclass and remaps it to its own localized error (as `fx-core`'s
  `toFxError` does).
- `resolveManifest` becomes published API surface of `@microsoft/app-manifest`.
  The SPFx `copilotAgentPlugin` build (ODSP-Web PR 2326359) ships an interim
  in-process copy until this lands and publishes, then swaps to the shared
  functions.
- `fx-core`'s `getResolvedManifest` delegates to `resolveManifestWithContext`;
  its file-only `expandVariableWithFunction` shares the same
  `runManifestResolver` wrapper, so the two hosts of the primitive inside
  `fx-core` stay in lockstep.
