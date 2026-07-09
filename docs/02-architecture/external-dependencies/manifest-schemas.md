# Manifest schemas

External-dependency fact page. Captures the **non-negotiable** Microsoft 365
platform manifest schemas the Microsoft 365 Agents Toolkit must emit and
validate against today. Every fact below is anchored in current source —
change the upstream platform, and you must update this page.

This page does **not** decide engine-internal shape (type-library layout,
converter pattern, validation pipeline); that belongs in an ADR under
[`../adr/`](../adr/README.md). It only records what the M365 platform forces
the toolkit to honor when it produces or consumes manifests.

## 1. Facts the toolkit is bound to

### 1.1 Schema families

The toolkit emits and validates against three independent manifest families,
each owned by an M365 platform team:

| Family | Purpose | Identity field on the manifest |
|---|---|---|
| **Teams app manifest** | Core M365 app (bots, tabs, message extensions, app metadata) | `$schema` URL + `manifestVersion` string |
| **Declarative Agent manifest** | Declarative agent (instructions, capabilities, actions, conversation starters) | `$schema` URL + `version` string |
| **API Plugin manifest** | REST-API plugin capability (functions, runtimes, auth) referenced from a Declarative Agent or Teams app | `$schema` URL + `schema_version` string |

The three are independent specs with independent version cadences; a single
M365 app can ship a Teams manifest that references both a Declarative Agent
manifest and one or more API Plugin manifests in the same package.

### 1.2 Schema host

All three families are served from a single host under fixed path prefixes:

| Family | Path prefix on `developer.microsoft.com` |
|---|---|
| Teams app manifest | `/json-schemas/teams/...` |
| Declarative Agent manifest | `/json-schemas/copilot/declarative-agent/...` |
| API Plugin manifest | `/json-schemas/copilot/plugin/...` |

The path is also served under locale prefixes (`/en-us/json-schemas/...`,
`/zh-cn/json-schemas/...`, etc.); the locale segment is two letters
optionally followed by `-<region>` and resolves to the same underlying
schema document.

### 1.3 Schema source of record

Schema files are published as a Git repository:
`https://github.com/microsoft/json-schemas`, branch `live`. The folders
`teams/` and `copilot/` under the repo root hold the same schemas served at
the URLs in §1.2. The **repository is the upstream**, the served URLs are
convenience for end-user manifest authoring. The upstream advances on its
own cadence; downstream consumers (including this toolkit) must reconcile
local copies against `live` when they want to support newly published
versions.

### 1.4 Manifest versions in scope today

These are the versions the platform has published and the toolkit currently
understands. The set is fixed by the platform; the toolkit cannot mint new
version numbers.

| Family | Versions supported today | Latest |
|---|---|---|
| Teams app manifest | `1.0`, `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6`, `1.7`, `1.8`, `1.9`, `1.10`, `1.11`, `1.12`, `1.13`, `1.14`, `1.15`, `1.16`, `1.17`, `1.19`, `1.20`, `1.21`, `1.22`, `1.23`, `1.24`, `1.25`, `1.26`, `1.27`, `1.28`, plus `vDevPreview` | `1.28` |
| Declarative Agent manifest | `v1.0`, `v1.2`, `v1.3`, `v1.4`, `v1.5`, `v1.6`, `v1.7` | `v1.7` |
| API Plugin manifest | `v2.1`, `v2.2`, `v2.3`, `v2.4` | `v2.4` |

Gaps in the sequence (Teams `1.18` absent, Declarative Agent `v1.1` absent)
are platform-side — those version numbers were never published.

### 1.5 JSON Schema draft used

| Family / version | JSON Schema draft |
|---|---|
| Teams app manifest, all current versions | Draft-04 (`http://json-schema.org/draft-04/schema#`) |
| Declarative Agent manifest, all current versions | Draft-04 |
| API Plugin manifest, all current versions | Draft-04 |

All three families currently declare the same draft. The draft identifier
appears in the `$schema` field at the top of each schema document; if the
upstream advances one family to a newer draft, the others may not move in
lockstep.

### 1.6 Version-discriminator field per family

| Family | Field carried on the manifest to discriminate version |
|---|---|
| Teams app manifest | `manifestVersion` (string, matches §1.4 set) |
| Declarative Agent manifest | `version` (string, matches §1.4 set including the `v` prefix) |
| API Plugin manifest | `schema_version` (string, matches §1.4 set including the `v` prefix) |

The `$schema` URL on the manifest, when present, is informational for tools
and editors; the canonical discriminator is the version field above.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **No invented manifest types.** Any new manifest the toolkit produces or
   consumes must map to one of the three families in §1.1. New M365
   manifest surfaces require platform-side publication first.
2. **No invented schema host.** `$schema` URLs the toolkit writes into
   generated manifests must point at the `developer.microsoft.com`
   prefixes in §1.2; the toolkit cannot self-host the schema and link to it.
3. **Locale-stripped lookup.** Any code that resolves a `$schema` URL to a
   local schema file must first strip the optional locale segment per §1.2
   before matching the path prefix.
4. **Snapshot from the upstream repo.** Offline schema files bundled with
   the toolkit must originate from `microsoft/json-schemas` live branch
   (§1.3); hand-maintained schema files are forbidden.
5. **Closed version set.** Code paths that switch on `manifestVersion` /
   `schema_version` must accept exactly the values enumerated in §1.4 for
   the relevant family; unknown versions must fail loudly, not be silently
   downgraded.
6. **Draft-aware validation.** When validating a manifest in-process, the
   validator chosen must match the JSON Schema draft listed for the family
   in §1.5; mixing drafts produces false positives and false negatives.
7. **Discriminator-driven dispatch.** Converters, validators, and any other
   per-version logic must dispatch on the version-discriminator field in
   §1.6, not on the `$schema` URL. Manifests without `$schema` are
   permitted by the platform.
8. **Cross-family independence.** A scaffold output that mixes a Teams
   manifest with a Declarative Agent and a Plugin manifest must allow each
   family's version to advance independently; per-family version selection
   may not be collapsed into a single toolkit-wide knob.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close. None has
been promoted to an ADR yet.

- **Schema snapshot refresh policy.** The upstream repo in §1.3 advances on
  the platform's cadence; the toolkit's local snapshot of it does not.
  Should reconciliation be automated on a scheduled cadence, or remain a
  manual step taken when a new version is needed?
- **Per-family default version on scaffold output.** When the toolkit
  produces a manifest, which version of each family does it pick? "Always
  the latest in §1.4" is one policy, "pinned per scaffold output" is
  another; today the choice is not centralized.

---

> **Where these facts live in code today:** see
> [`manifest-schemas.code-map.md`](manifest-schemas.code-map.md). The code
> map is a navigation aid and is expected to churn with refactors; it is not
> part of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`manifest-schemas.code-map.md`](manifest-schemas.code-map.md) in the
> same PR. Adding a new constraint to §2 requires an accepted ADR under
> [`../adr/`](../adr/README.md); link it from the constraint line.
