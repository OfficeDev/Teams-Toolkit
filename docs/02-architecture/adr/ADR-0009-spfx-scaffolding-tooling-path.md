# ADR-0009 — SPFx scaffolding tooling path

- **Status:** Proposed
- **Date:** 2026-05-28
- **Source:** [`../external-dependencies/spfx-tooling.md` §3](../external-dependencies/spfx-tooling.md#3-open-questions-candidates-for-adrs)

## Context

The SPFx capability §2.2 in [`../scaffolding.md`](../scaffolding.md)
requires producing a SharePoint-Framework-toolchain-recognized solution.

Today the toolkit drives the Yeoman path: it installs `yo` and
`@microsoft/generator-sharepoint` into a managed directory on first
scaffold (under `packages/fx-core/src/component/generator/spfx/depsChecker/`),
then spawns `yo` as a subprocess. This violates `../scaffolding.md`
§3.2 (offline-capable, on-demand install) and §3.4 (reproducible —
`latest` dist-tag resolution at install time).

Per
[`../external-dependencies/spfx-tooling.md`](../external-dependencies/spfx-tooling.md)
§1.4, the SharePoint team has published `@microsoft/spfx-cli` as the
successor to the Yeoman path, along with a companion programmatic
library `@microsoft/spfx-template-api` for in-process invocation
without subprocess or on-demand install. The Microsoft Learn page for
the CLI is currently marked pre-release and does not state a specific
EOL milestone for the Yeoman path; whatever migration the toolkit
plans must therefore make its own assumptions about timing.

## Options considered

- **A — Adopt the programmatic API now.** Replace the Yeoman path with
  `@microsoft/spfx-template-api` as the default. Removes the
  on-demand install and subprocess. Accepts pre-release churn and the
  risk of an API break before GA.
- **B — Dual path behind a feature flag.** Land the
  `@microsoft/spfx-template-api` path alongside the Yeoman path now;
  let users opt in; flip default once upstream signals GA; remove
  Yeoman after a release.
- **C — Wait for upstream GA.** Stay on the Yeoman path until the
  Microsoft Learn page drops the pre-release callout, then cut over to
  `@microsoft/spfx-cli` / `@microsoft/spfx-template-api`. Single code
  path; minimal preview exposure; longer lifetime for the current
  §3.2 / §3.4 violations.
- **D — Stay on Yeoman until forced.** Continue the current path with
  no exit plan; revisit only if upstream actually breaks the binding.
  Accepts the §3.2 / §3.4 violations as permanent for the SPFx
  capability.

## Decision

(Pending.)

## Consequences

(Pending. A or B will eliminate the on-demand install logic in
`spfx/depsChecker/`, remove the `~/.fx/bin/{yo,spGenerator}` directory
state, and let `../scaffolding.md` §3.2 hold for the SPFx capability,
at the cost of binding to a pre-release upstream. C defers that cost
and the cleanup. D leaves the current violations in place permanently
and adds maintenance risk per fact-page constraint §2.5.)
