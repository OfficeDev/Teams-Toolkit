# Scaffolding subsystem

Architecture topic page. Defines the **engine-internal** subsystem that
produces a runnable project skeleton on disk in response to a user "create"
or "import" action, before any provision / deploy step runs.

This page captures the **essential capabilities** the subsystem must
deliver and the cross-cutting properties it must hold. Specific tooling
choices that implement each capability are recorded as ADRs under
[`adr/`](adr/README.md); the upstream contracts the subsystem binds to
are fact pages under
[`external-dependencies/`](external-dependencies/README.md).

This page does **not** decide which tool implements which capability —
that is what the linked ADRs answer. It also does not describe per-feature
user flows; those are specs under [`../03-specs/`](../03-specs/README.md).

## 1. Scope

The scaffolding subsystem is the engine code path from:

- a user-confirmed `create` or `import` request reaching the engine, to
- a project folder on disk containing all files the user needs in order to
  run the project-local commands declared by that project type
  (`npm install`, `func start`, `dotnet build`, …).

Out of scope: provision, deploy, publish; debug-time lifecycle; any logic
that reads from or writes to Azure / M365 service-plane state. Those are
separate lifecycle phases and have their own subsystems.

## 2. Essential capabilities

Each item states a capability the subsystem must deliver, abstracted from
implementation. Implementation choices are linked to the relevant fact
page and ADR.

1. **Deliver versioned project skeletons.** Place a known set of starter
   files for a known project type onto disk. The set of files per project
   type must be versioned — either co-versioned with the engine binary
   (bundled), or independently versioned (remote fetch). The choice is
   decided in [ADR-0006](adr/ADR-0006-template-distribution-channel.md)
   (**`Accepted`**).

2. **Produce an SPFx-toolchain-recognized solution.** For SharePoint
   Framework scaffolds, the output must conform to the directory layout
   in [`external-dependencies/spfx-tooling.md`](external-dependencies/spfx-tooling.md)
   §1.2. The choice of *how* (current Yeoman path vs upstream-published
   successor `@microsoft/spfx-cli` / `@microsoft/spfx-template-api`) is
   tracked in [ADR-0009](adr/ADR-0009-spfx-scaffolding-tooling-path.md).

3. **Produce DA and plugin manifests from TypeSpec sources.** For
   TypeSpec scaffolds, the subsystem (or the user-owned build step it
   triggers) must transform `.tsp` source into the artifacts declared
   in [`external-dependencies/typespec-compiler.md`](external-dependencies/typespec-compiler.md)
   §1.5, conforming to the manifest schema families in
   [`external-dependencies/manifest-schemas.md`](external-dependencies/manifest-schemas.md)
   §1.1. The shape of the compile chain that drives this — including how
   the compiler is invoked (`npx` vs programmatic) and how its `npm
   install` precondition is satisfied — is tracked in
   [ADR-0010](adr/ADR-0010-typespec-compile-chain-shape.md).

4. **Ingest a user-supplied OpenAPI spec and produce a plugin manifest.**
   For API-plugin scaffolds, the subsystem must read a user OpenAPI
   document, validate it, subset it, and emit a plugin manifest with
   adaptive cards and auth scaffolding. Upstream contracts in
   [`external-dependencies/openapi-spec-parser.md`](external-dependencies/openapi-spec-parser.md)
   and [`external-dependencies/kiota.md`](external-dependencies/kiota.md).
   The boundary between "subsystem fetches the URL" and "user provides a
   local path" is tracked in
   [ADR-0008](adr/ADR-0008-openapi-spec-ingestion-boundary.md).

5. **Deliver an Office Web Add-in starter integrated with the toolkit
   lifecycle.** For Office Add-in create flows, the output must include
   a manifest of the schema family in
   [`external-dependencies/manifest-schemas.md`](external-dependencies/manifest-schemas.md)
   §1.1 and a project layout the toolkit's other lifecycle phases
   recognize. This capability is template-bundled today per
   [`external-dependencies/office-addin-tooling.md`](external-dependencies/office-addin-tooling.md)
   §1.3 and has no open ADR of its own.

6. **Convert an existing Office Add-in project into toolkit shape.** For
   Office Add-in import flows, the subsystem must run
   `office-addin-project.convertProject` per
   [`external-dependencies/office-addin-tooling.md`](external-dependencies/office-addin-tooling.md)
   §1.2 while honoring its preconditions, and preserve user files not
   owned by the toolkit. The choice of where this flow lives in the UX
   (inside the create flow vs standalone command) is tracked in
   [ADR-0012](adr/ADR-0012-office-addin-import-flow-placement.md).

7. **Turn user-pasted SharePoint / OneDrive URLs into stable
   identifiers.** For scaffolds that reference SharePoint sites or
   OneDrive items, the subsystem (or a later phase) must resolve the URL
   to the identifiers defined in
   [`external-dependencies/graph-driveitem-resolution.md`](external-dependencies/graph-driveitem-resolution.md)
   §1.4. The timing — scaffold vs provision — is tracked in
   [ADR-0007](adr/ADR-0007-driveitem-resolution-timing.md).

## 3. Cross-cutting properties

Properties the subsystem must hold as a whole, regardless of which
capability in §2 is exercised. These are constraints on any implementation
choice.

1. **Deterministic.** Two scaffold runs against the same inputs and the
   same engine version must produce byte-identical output, modulo
   file-mtime metadata and identifiers the M365 platform forces (e.g. SPFx
   web part `componentId` per
   [`external-dependencies/spfx-tooling.md`](external-dependencies/spfx-tooling.md)
   §1.5).

2. **Offline-capable by default.** Scaffolding must not require outbound
   network for the create flow to succeed when (a) templates are bundled
   with the engine and (b) the project type does not inherently require a
   user-supplied remote artifact. Any capability that breaks this must be
   justified inside its ADR.

3. **Login-free by default.** Scaffolding must not require a signed-in
   M365 identity for the create flow to succeed when the project type does
   not inherently require resolving a user-tenant artifact. Capabilities
   that currently require login must either move login earlier as an
   explicit gate or defer the M365 call to a later lifecycle phase.

4. **Reproducible across machines and time.** No capability may pin its
   output to "whatever `latest` resolves to today" — version pins must be
   explicit, captured in the user-owned project files, and re-runnable a
   year later without different behavior.

Properties 2 and 3 today have known counterexamples (URL-fetched OpenAPI
specs, scaffold-time Graph resolution, on-demand `npm install` for the
SPFx Yeoman path, lazy Kiota binary extraction). Each counterexample is
the trigger for one of the ADRs in §4.

## 4. Open structural questions

Each question is tracked as a `Proposed` ADR. Decisions made by these
ADRs add constraints to the relevant fact pages or to §3 above; this page
is the index of the open set, not a place for decisions.

| Question | ADR |
|---|---|
| When to resolve OneDrive / SharePoint URLs to stable IDs | [ADR-0007](adr/ADR-0007-driveitem-resolution-timing.md) |
| Boundary of user-supplied OpenAPI spec ingestion | [ADR-0008](adr/ADR-0008-openapi-spec-ingestion-boundary.md) |
| SPFx scaffolding tooling path | [ADR-0009](adr/ADR-0009-spfx-scaffolding-tooling-path.md) |
| TypeSpec → agent-artifact compile chain shape | [ADR-0010](adr/ADR-0010-typespec-compile-chain-shape.md) |
| Kiota binary acquisition timing | [ADR-0011](adr/ADR-0011-kiota-binary-acquisition-timing.md) |
| Office Add-in import flow placement | [ADR-0012](adr/ADR-0012-office-addin-import-flow-placement.md) |

> **[ADR-0006](adr/ADR-0006-template-distribution-channel.md) (template
> distribution channel) has graduated out of this open set — now
> `Accepted`** (capability §2.1), having derived its specs
> [`resolve-template-source`](../03-specs/operations/scaffolding/resolve-template-source.md)
> and [`open-template-package`](../03-specs/operations/scaffolding/open-template-package.md).
> ADR-0007 – ADR-0012 stay `Proposed`: each binds only when its specific
> template pipeline is actually built, so they remain deferred until then.

The v4 **create/modify shape** is the current scaffolding architecture. It was
decomposed from the former
[`scaffolding.create.proposal.md`](scaffolding.create.proposal.md) into six
focused ADRs, all **`Accepted`** (2026-06-08), and is contracted by the derived
specs under [`docs/03-specs/`](../03-specs/README.md). The former proposal file
is now only a decomposition map; deferred scenario refinements and the Visual
Studio surface notes live in [`scaffolding.backlog.md`](scaffolding.backlog.md):

| Question | ADR |
|---|---|
| Dispatcher + BuildTarget resolution (front stage, descriptor-derived routing, legacy-engine rejection) | [ADR-0014](adr/ADR-0014-dispatcher-buildtarget-resolution.md) |
| `templates-v4@version` release artifact shape | [ADR-0015](adr/ADR-0015-templates-version-artifact-shape.md) |
| Declarative descriptor + questions + replaceMap format | [ADR-0016](adr/ADR-0016-declarative-template-format.md) |
| Named pipeline + step whitelist + domain-typed step naming | [ADR-0017](adr/ADR-0017-named-pipeline-step-whitelist.md) |
| `ScaffoldRuntime` + T1/T2/T3 test pyramid + design-first spec gate | [ADR-0018](adr/ADR-0018-scaffold-runtime-test-pyramid.md) |
| Dual-stream scaffold telemetry | [ADR-0019](adr/ADR-0019-dual-stream-scaffold-telemetry.md) |

> **Note on §3 property 2 (offline-capable).** The per-template
> `descriptor.requiresNetwork` flag (ADR-0016) makes the offline-by-default
> property statically checkable: both MCP scenarios set `requiresNetwork:false`.
> This binding is *not* itself an ADR — it ties §3.2 to a discoverable flag.

---

> **Where these capabilities live in code today:** see
> [`scaffolding.code-map.md`](scaffolding.code-map.md). The code map is a
> navigation aid and is expected to churn with refactors; it is not part
> of the contract.

> **How to update this page:** adding a new capability to §2 or a new
> property to §3 requires an accepted ADR under [`adr/`](adr/README.md);
> link it from the new item. Updating the code-map sibling does not
> require an ADR.
