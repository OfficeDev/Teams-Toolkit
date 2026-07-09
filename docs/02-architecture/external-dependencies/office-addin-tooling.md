# Office Add-in tooling

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it interoperates with existing
Office Add-in projects (import) or authors the MetaOS-side manifests that
accompany them. Every fact below is anchored in current source — change
the upstream `office-addin-*` packages or the MetaOS schema URLs, and you
must update this page.

The `office-addin-*` packages are owned by the Office product team,
outside this codebase. This page records only what the toolkit consumes;
how it composes that contract into scaffold flows is an internal concern
and belongs in an ADR under [`../adr/`](../adr/README.md).

## 1. Facts the toolkit is bound to

### 1.1 npm packages consumed

| Package | Role |
|---|---|
| `office-addin-project` | Exposes `convertProject(manifestFile, backupZipPath, addinRoot, eraseInPlace)` for migrating an existing Office Add-in project into a toolkit-shaped folder |
| `office-addin-manifest` | Office Add-in manifest reader/writer used by various flows |

Both are declared as toolkit runtime dependencies.

### 1.2 `convertProject` precondition

`office-addin-project.convertProject` reads `package.json` at the addin
root and unconditionally calls `Object.keys(content.scripts)`. If `scripts`
is absent or not an object, the call throws a `TypeError` from inside the
upstream package — there is no public option to disable this read.

### 1.3 Create-new path is template-bundled

New Office Add-in projects are **not** scaffolded via Yo Office
(`generator-office`). The toolkit ships its own templates bundled with
the engine (per the template distribution model in
[`../scaffolding.md`](../scaffolding.md) §2.1) and only uses the
`office-addin-*` packages above for import and manifest editing.

### 1.4 MetaOS-side manifest schema URLs

When the toolkit authors the MetaOS-flavored DA / plugin manifests that
sit alongside an Office Add-in project, it writes literal `$schema` URLs
into the produced JSON. The URLs are pinned to specific versions of the
schema families in [`manifest-schemas.md`](manifest-schemas.md) §1.1 and
served from the host in `manifest-schemas.md` §1.2:

| Manifest family | Pinned `$schema` URL |
|---|---|
| Declarative Agent | `https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.4/schema.json` |
| API Plugin | `https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json` |

These version segments (`v1.4`, `v2.3`) are pinned independently of the
toolkit-wide "latest version" tracked in `manifest-schemas.md` §1.4 — they
reflect the highest versions the Office Add-in MetaOS flow has been
validated against.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **`convertProject` precondition must be ensured upstream of the call.**
   Any code path that invokes `office-addin-project.convertProject` must
   ensure §1.2 holds — either the project already has a valid
   `scripts` object in `package.json`, or the toolkit writes a minimal
   one beforehand. There is no error to "handle" — the call throws.
2. **Yo Office is not on the toolkit surface.** Per §1.3, the create-new
   path is template-based; introducing `generator-office` as a runtime
   dependency of a new flow requires an ADR — it changes the offline /
   determinism profile of scaffolding (see
   [`../scaffolding.md`](../scaffolding.md) §3).
3. **MetaOS `$schema` URLs must move with the family.** When a schema
   family in `manifest-schemas.md` §1.4 advances and the Office Add-in
   MetaOS flow is re-validated against the new version, the literal URLs
   in §1.4 must be updated together; an out-of-band bump anywhere else
   in the codebase is not a substitute.
4. **MetaOS pins are explicit.** §1.4 pins must stay literal strings (or
   constants whose values are §1.4 strings). Computing them from the
   "latest version" of the schema family at runtime would defeat the
   explicit-validation property of §1.4.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close.

- **Import flow placement.** Today the Office Add-in import path is one
  branch of the create-project flow. Should it be lifted to a standalone
  command so its failure modes do not affect new-project reliability?
  Tracked in
  [ADR-0012](../adr/ADR-0012-office-addin-import-flow-placement.md).

---

> **Where these facts live in code today:** see
> [`office-addin-tooling.code-map.md`](office-addin-tooling.code-map.md).
> The code map is a navigation aid and is expected to churn with
> refactors; it is not part of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`office-addin-tooling.code-map.md`](office-addin-tooling.code-map.md)
> in the same PR. Adding a new constraint to §2 requires an accepted ADR
> under [`../adr/`](../adr/README.md); link it from the constraint line.
