# TypeSpec compiler

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it derives agent artifacts
(OpenAPI specs, Declarative Agent manifests, API Plugin manifests) from
TypeSpec source. Every fact below is anchored in upstream TypeSpec or M365
emitter releases or in current source — change those, and you must update
this page.

The TypeSpec compiler and its emitters are owned outside this codebase
(`microsoft/typespec`, `microsoft/typespec-m365-copilot`). This page
records only what the toolkit consumes and what the upstream packages
currently expose; how the toolkit composes that into a compile flow is an
internal concern and belongs in an ADR under [`../adr/`](../adr/README.md).

## 1. Facts the toolkit is bound to

### 1.1 Compiler package

| Aspect | Value |
|---|---|
| npm package | `@typespec/compiler` |
| Invocation modes available upstream | (a) CLI binary `tsp`; (b) Node programmatic API exported from the package |
| Compile entry contract | input: a `.tsp` main file + a `tspconfig.yaml`; output: file artifacts written under the `output-dir` configured per emitter |

### 1.2 Compile input

The compiler takes:

- A main TypeSpec source file (referenced by relative or absolute path),
  which `import`s additional `.tsp` files transitively.
- A `tspconfig.yaml` configuration file declaring which emitters to run and
  per-emitter options (`output-dir`, emitter-specific flags).

The compiler is otherwise pure — it does not read environment variables to
change emitter selection, and it does not reach outside the project for
inputs.

### 1.3 Emitters consumed for M365 agent projects

| Emitter package | Artifact(s) consumed by the toolkit |
|---|---|
| `@typespec/openapi3` | OpenAPI 3.0 spec(s) — one per service namespace, written under the emitter's `output-dir` |
| `@microsoft/typespec-m365-copilot` | Declarative Agent manifest — a single JSON file (typically `declarativeAgent.json`) written under the emitter's `output-dir`; authored using M365-specific decorators (`@agent`, `@instructions`, `@conversationStarter`, capability ops such as `AgentCapabilities.WebSearch` / `AgentCapabilities.OneDriveAndSharePoint`) |

The DA manifest emitted by `@microsoft/typespec-m365-copilot` belongs to
the schema family captured in
[`manifest-schemas.md`](manifest-schemas.md) §1.1. Plugin manifests are
*not* emitted by either emitter — they are produced from the OpenAPI
specs by a separate Kiota step described in
[`kiota.md`](kiota.md). Whether the M365 emitter has any other emission
modes (e.g. direct plugin manifest emission) is not a fact about the
toolkit's binding and is therefore not captured here.

### 1.4 Project layout

A TypeSpec-flavored M365 scaffold output has, at minimum:

- A user-owned `package.json` declaring `@typespec/compiler` and the
  emitters in §1.3 under `devDependencies`.
- A `tspconfig.yaml` selecting at least one of the §1.3 emitters and
  declaring `output-dir` for each.
- One or more `.tsp` source files.

`@typespec/compiler` and emitters are user-project dependencies, not
toolkit-runtime dependencies. The compiler binary lives under the user
project's `node_modules` after `npm install`.

### 1.5 Output file conventions consumed by the toolkit

When emitters in §1.3 are used together, the toolkit's downstream
consumers expect:

- OpenAPI output directory contains one or more `.yaml` / `.json` files;
  multi-service projects produce files matching the pattern
  `openapi.{service-name}.{ext}`.
- DA manifest at a single fixed filename in the configured output
  directory.
- Plugin manifests — *not* emitted by either compiler emitter; produced
  by a follow-up Kiota step (see [`kiota.md`](kiota.md)) whose filenames
  the toolkit derives from the DA manifest `actions[].id` (one plugin
  manifest per action).

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **Compile is a user-project step.** The compiler and emitters in §1.1 /
   §1.3 are user-owned (§1.4); toolkit code that triggers compile must
   resolve the compiler from the user project's `node_modules`, not bring
   its own. A toolkit-private compiler would diverge from the version the
   user's `package.json` pins.
2. **Emitter set is declared in `tspconfig.yaml`.** Any post-processing
   step must check which artifact files actually exist after compile, not
   assume a fixed set — `tspconfig.yaml` may exclude an emitter the
   toolkit otherwise expects.
3. **Schema-family boundary applies.** DA manifests emitted by §1.3
   belong to the schema family in
   [`manifest-schemas.md`](manifest-schemas.md) §1.1; toolkit code must
   not mutate version fields or top-level shape produced by the emitter,
   only patch additive layers that the emitter does not own.
4. **Plugin manifests are downstream of compile, not produced by it.**
   The compile step in §1.3 emits the DA manifest and OpenAPI spec(s)
   only; any plugin manifest in the output directory is produced by a
   follow-up Kiota call per [`kiota.md`](kiota.md). A refactor must not
   conflate these two production paths.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close.

- **Compile chain shape.** Should the toolkit continue to drive compile
  via `npx tsp compile` or switch to the programmatic compiler API
  exposed by `@typespec/compiler` (§1.1)? Tracked in
  [ADR-0010](../adr/ADR-0010-typespec-compile-chain-shape.md).

---

> **Where these facts live in code today:** see
> [`typespec-compiler.code-map.md`](typespec-compiler.code-map.md). The
> code map is a navigation aid and is expected to churn with refactors;
> it is not part of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`typespec-compiler.code-map.md`](typespec-compiler.code-map.md) in the
> same PR. Adding a new constraint to §2 requires an accepted ADR under
> [`../adr/`](../adr/README.md); link it from the constraint line.
