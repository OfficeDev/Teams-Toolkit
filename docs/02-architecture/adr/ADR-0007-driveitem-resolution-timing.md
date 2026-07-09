# ADR-0007 — When to resolve OneDrive / SharePoint URLs to stable IDs

- **Status:** Proposed
- **Date:** 2026-05-28
- **Source:** [`../external-dependencies/graph-driveitem-resolution.md` §3](../external-dependencies/graph-driveitem-resolution.md#3-open-questions-candidates-for-adrs)

## Context

DA manifests must carry the stable identifiers in
[`../external-dependencies/graph-driveitem-resolution.md`](../external-dependencies/graph-driveitem-resolution.md)
§1.4 (`siteId`, `webId`, `listId`, `listItemUniqueId`), not raw URLs.
Resolution requires the Graph calls in §1.1, which need a signed-in user
and outbound network (constraints §2.3, §2.4 on the fact page).

Today the resolver runs **during scaffolding**: the user pastes a
SharePoint / OneDrive URL, the toolkit immediately requests a Graph
token, calls `/sites/...` and `/shares/...`, and writes the resulting
identifiers into the generated manifest. This breaks two cross-cutting
properties of the scaffolding subsystem:

- `../scaffolding.md` §3.2 (offline-capable) — scaffold issues outbound
  HTTPS calls to Graph for this project type.
- `../scaffolding.md` §3.3 (login-free) — scaffold cannot proceed unless
  the user is already signed in to M365.

The Graph calls themselves are non-negotiable (constraint §2.1 on the
fact page). What is negotiable is **when** they happen.

## Options considered

- **A — Defer to provision.** The scaffolded manifest carries the raw
  URL (or the §1.2-encoded share token) as a placeholder; provision
  resolves it to IDs and rewrites the manifest before deployment.
  Scaffold becomes offline / login-free again.
- **B — Defer to a dedicated post-scaffold step.** Scaffold finishes
  offline; the resolution runs as a separate, explicit step the user
  triggers (or a follow-up driver in `provision`) with its own progress
  / error surface.
- **C — Keep at scaffold time, but gate explicitly.** The flow that
  needs DA knowledge sources requires sign-in as a prerequisite (UX
  gate), and the resolution stays inline. Document the broken §3.2 /
  §3.3 properties as inherent to this scaffold type.
- **D — Status quo.** Resolver runs inline at scaffold time without an
  explicit gate; today's behavior.

## Decision

(Pending.)

## Consequences

(Pending. If A or B is chosen, the scaffolded DA manifest will carry a
placeholder shape until a later phase rewrites it; the manifest schema
family in
[`../external-dependencies/manifest-schemas.md`](../external-dependencies/manifest-schemas.md)
§1.1 must accept that intermediate shape, or the toolkit must store
the placeholder outside the manifest until resolution runs.)
