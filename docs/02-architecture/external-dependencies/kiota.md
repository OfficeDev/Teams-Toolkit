# Kiota

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it consumes Kiota to derive plugin
manifests from OpenAPI documents. Every fact below is anchored in current
source — change the Kiota package or its binary, and you must update this
page.

Kiota is owned outside this codebase (the Kiota project under
`microsoft/kiota`). This page records only what the toolkit consumes; how the
toolkit composes that contract into scaffold or compile flows is an internal
concern and belongs in an ADR under [`../adr/`](../adr/README.md).

## 1. Facts the toolkit is bound to

### 1.1 Package

| Aspect | Value |
|---|---|
| npm package | `@microsoft/kiota` |
| Version | Pinned to a single exact version (not a range) |
| Distribution model | npm-published wrapper around a native binary built outside Node; the binary is shipped inside the published npm package, per host OS |

### 1.2 Native binary requirement

Kiota's generation work runs in a native binary (the upstream Kiota
executable). The npm package is a wrapper that locates the binary at runtime
and invokes it. **There is no pure-JS implementation of the generator on
the upstream's public surface today.**

### 1.3 Binary discovery

Binary location resolution, in priority order:

1. If `process.env.KIOTA_BINARY_PATH` is set, that path is used (via
   `setKiotaConfig({ binaryLocation })`).
2. If the toolkit is running inside a `pkg`-bundled process (the Visual
   Studio host distribution), the binary directory is set to `~/kiota-bin/`.
3. Otherwise the npm package's default discovery is used.

Item 2 is a host-distribution constraint, not a toolkit feature flag; it
exists because the `pkg` bundle cannot extract binaries from inside the
packaged executable.

### 1.4 API surface consumed

The toolkit imports the following from `@microsoft/kiota` and uses no
others:

| Symbol | Kind | Purpose |
|---|---|---|
| `setKiotaConfig({ binaryLocation })` | function | Set binary directory before any other call |
| `searchDescription({ searchTerm, clearCache })` | function | Search the API description registry |
| `getKiotaTree({ descriptionPath, includeFilters, excludeFilters, clearCache, includeKiotaValidationRules })` | function | Build a navigable API tree for an OpenAPI spec |
| `generatePlugin(config)` | function | Generate plugin manifest + adaptive cards from an OpenAPI spec |
| `ConsumerOperation` | enum | Tags the kind of generation operation; the toolkit passes `Edit` |
| `PluginAuthType` | type | Tags the auth flavour passed in `generatePlugin` config |
| `KiotaSearchResultItem`, `KiotaTreeResult`, `GeneratePluginResult` | types | Return-shape types for the three call sites above |

### 1.5 `generatePlugin` contract

`generatePlugin` takes a single config object. The keys the toolkit
passes are:

- `descriptionPath` — local OpenAPI document path.
- `outputPath` — destination directory for plugin artifacts.
- `pluginName` — name segment for emitted files.
- `workingDirectory` — directory Kiota uses for cache / workspace.
- `pluginAuthType`, `pluginAuthRefid` — auth wiring.
- `includePatterns`, `excludePatterns` — operation filters.
- `operation: ConsumerOperation` — `Edit` is the toolkit's mode.
- `noWorkspace` — disable Kiota's `kiota-lock.json` / workspace file.
- `clearCache: false`, `cleanOutput: false`, `disabledValidationRules: []`
  — passed explicitly to lock the surface (omitting them lets upstream
  defaults drift).

It produces an API plugin manifest of the schema family captured in
[`manifest-schemas.md`](manifest-schemas.md) §1.1 plus per-operation
adaptive cards.

### 1.6 Error model

Kiota returns errors as **log entries on the result object**, not as thrown
exceptions:

- `result.logs` is the sequence of structured log items.
- Log level `>= 4` (numeric) is "error".
- `result.isSuccess === false` indicates the call did not produce usable
  output.

A missing or empty result is also treated as failure.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **Native binary is required.** Removing the binary dependency requires
   an upstream change to Kiota that does not exist today (§1.2); toolkit
   refactors cannot substitute a pure-JS implementation.
2. **Binary discovery hook must precede any Kiota call.** Any new call site
   must invoke the discovery procedure in §1.3 before any of the §1.4
   symbols, or the `pkg`-bundled host will fail.
3. **Plugin manifest belongs to the upstream schema family.** Output from
   `generatePlugin` is API Plugin manifest per
   [`manifest-schemas.md`](manifest-schemas.md) §1.1; toolkit code must not
   re-author or post-mutate the schema fields Kiota owns, only fields
   layered on top (e.g. OpenAPI extension patches applied as a separate
   post-process step).
4. **Errors are filtered, not thrown.** Any call site for §1.4 symbols
   must inspect `result.logs` for `level >= 4` and translate to a typed
   toolkit error; relying on thrown exceptions misses failures Kiota
   reports as log entries.
5. **Version pin is intentional.** Bumping `@microsoft/kiota` past the
   pinned version requires re-validating §1.4 / §1.5 contracts; the pin
   exists because Kiota's surface has changed across minor versions.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close.

- **Binary acquisition timing.** Today, the npm package's binary is
  extracted lazily on first invocation in the user's session, which makes
  every scaffold that touches Kiota an implicit first-run side effect.
  Should extraction be hoisted to toolkit-install / activation time so
  scaffold itself stays predictable? Tracked in
  [ADR-0011](../adr/ADR-0011-kiota-binary-acquisition-timing.md).

---

> **Where these facts live in code today:** see
> [`kiota.code-map.md`](kiota.code-map.md). The code map is a navigation
> aid and is expected to churn with refactors; it is not part of the
> contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`kiota.code-map.md`](kiota.code-map.md) in the same PR. Adding a new
> constraint to §2 requires an accepted ADR under
> [`../adr/`](../adr/README.md); link it from the constraint line.
