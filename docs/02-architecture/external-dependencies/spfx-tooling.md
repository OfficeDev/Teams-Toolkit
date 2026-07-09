# SPFx scaffolding tooling

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it produces a SharePoint
Framework (SPFx) solution. Every fact below is anchored in upstream
SharePoint Framework releases or in current source — change the SPFx
toolchain, and you must update this page.

The SPFx toolchain is owned by the SharePoint product team, outside this
codebase. This page records only what the toolkit consumes and what the
SharePoint Framework currently requires of its inputs and outputs; how the
toolkit chooses to drive that toolchain is an internal concern and belongs
in an ADR under [`../adr/`](../adr/README.md).

## 1. Facts the toolkit is bound to

### 1.1 Toolchain packages

The toolkit drives SPFx solution creation through two npm packages owned by
the SharePoint team:

| Package | Role |
|---|---|
| `yo` | Yeoman CLI; invoked as a subprocess |
| `@microsoft/generator-sharepoint` | The SPFx Yeoman generator — owns the actual scaffold logic and emitted file shapes |

Both are out-of-band installs from the toolkit's perspective: not declared
as runtime dependencies of the toolkit's own `package.json`. The toolkit
installs them on demand into a managed directory and then spawns `yo`.

### 1.2 Output solution shape

A solution produced by `@microsoft/generator-sharepoint` is recognized by
the SPFx toolchain (`gulp serve`, `gulp bundle`, `gulp package-solution`)
only if it contains, at minimum:

- `.yo-rc.json` at the solution root, recording the SPFx framework version
  the solution was created against.
- `package.json` listing the SPFx-toolchain devDependencies for that
  version (`@microsoft/sp-build-web`, `@microsoft/sp-module-interfaces`,
  `gulp`, etc.).
- `src/webparts/<name>/<Name>WebPart.manifest.json` per web part, with a
  unique `id` GUID.
- `config/package-solution.json` and other `config/*.json` files the
  toolchain reads at build time.

The exact file set per SPFx version is owned by the generator; the toolkit
does not re-author these files.

### 1.3 SPFx version pin

| Aspect | Value |
|---|---|
| Lowest supported SPFx version | `v1.14.0` |
| Default generator version requested | `latest` (the npm dist-tag) |

The lower bound exists because solutions produced by earlier SPFx releases
do not satisfy contract §1.2 in a way the rest of the toolkit's lifecycle
can consume.

### 1.4 Successor tooling published by SharePoint

The SharePoint team has published `@microsoft/spfx-cli` (the
"SharePoint Framework CLI") as the successor to the Yeoman path. Per
the [Microsoft Learn page for the SPFx CLI](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/sharepoint-framework-cli)
(last updated 2026-04-10):

- The CLI "replaces the legacy Yeoman-based generator
  (`@microsoft/generator-sharepoint`)".
- A companion package, `@microsoft/spfx-template-api`, is published as
  a programmatic API for template rendering — i.e. an in-process
  alternative to spawning a subprocess.
- Templates are fetched at runtime from
  [github.com/SharePoint/spfx](https://github.com/SharePoint/spfx);
  the CLI exposes `--spfx-version`, `--local-source`, `--remote-source`,
  and `--template-url` to decouple template version from CLI version.
- The page itself carries a pre-release (alpha/beta/RC) callout. No
  specific EOL milestone for the Yeoman path is stated on this page.

This is recorded as a fact because it is owned by SharePoint, not by
the toolkit. The choice of when and how the toolkit moves to the
successor tooling — and what "pre-release" means for that choice — is
the ADR in §3.

### 1.5 Web part component identity

Each web part in an SPFx solution carries a `componentId` GUID
(`src/webparts/<name>/<Name>WebPart.manifest.json`). The SPFx runtime
treats this GUID as the canonical identity of the web part across versions
of the same solution; tenants record permissions and registrations against
it. Regenerating the GUID for an existing web part is therefore a
breaking change to the deployed identity.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **Cannot self-author SPFx files.** The toolkit must not produce
   `.yo-rc.json`, `package-solution.json`, web part manifests, or the
   build-config files in §1.2 from scratch — the generator owns them and
   their shape changes per SPFx version. The toolkit may only post-process
   the generator's output.
2. **Lowest version must hold.** Any code path that selects an SPFx
   version must reject values below the pin in §1.3.
3. **`latest` resolution must be reproducible.** When the toolkit requests
   the `latest` dist-tag of either package in §1.1, the resolved version
   must be captured into the produced solution (via `.yo-rc.json` and
   `package.json`) so that subsequent operations on the same solution
   reproduce the same version — never re-resolve `latest` at a later
   lifecycle phase.
4. **Web part GUIDs are preserved across re-scaffolding.** When the
   toolkit modifies or re-scaffolds an existing SPFx solution (add web
   part, regenerate), the `componentId` GUIDs in §1.5 for already-present
   web parts must be preserved, not regenerated.
5. **Successor-tooling awareness.** Any binding to the Yeoman path
   (§1.1) must be tracked against §1.4; the toolkit cannot indefinitely
   ignore an upstream-published successor whose stated purpose is to
   replace that path, even while the successor remains in pre-release.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close.

- **Tooling path migration.** Given §1.4, when and how does the toolkit
  move off the Yeoman path? Options span "adopt `@microsoft/spfx-cli` /
  `@microsoft/spfx-template-api` now while pre-release", "ship both paths
  behind a flag and flip default at GA", "wait for upstream GA before
  reacting", or "stay on Yeoman until forced". Tracked in
  [ADR-0009](../adr/ADR-0009-spfx-scaffolding-tooling-path.md).

---

> **Where these facts live in code today:** see
> [`spfx-tooling.code-map.md`](spfx-tooling.code-map.md). The code map is a
> navigation aid and is expected to churn with refactors; it is not part
> of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`spfx-tooling.code-map.md`](spfx-tooling.code-map.md) in the same PR.
> Adding a new constraint to §2 requires an accepted ADR under
> [`../adr/`](../adr/README.md); link it from the constraint line.
