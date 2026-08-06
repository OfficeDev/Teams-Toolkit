# Architecture

Engine-neutral architecture documents for the Microsoft 365 Agents Toolkit. This
folder answers a single question:

> *"How is the engine itself built — what shape must any new piece of code fit
> into, and what cross-cutting contracts does it have to honor?"*

Architecture is engine-internal: it describes the toolkit's own codebase. The
external substrate it binds to (identity, service endpoints, registered app
metadata) is captured as fact pages under
[`external-dependencies/`](external-dependencies/README.md) — those facts feed
*into* architecture decisions but are not themselves architectural choices.
Business behavior — what a feature does from the user's point of view — lives
in [`docs/01-product/`](../01-product/README.md) and is contracted in
[`docs/03-specs/`](../03-specs/README.md).

## What lives here

Three kinds of content, in this order:

1. **Chosen structure** — package boundaries, layering, dependency direction,
   composition rules, lifecycle composition. The deliberate shape of the engine.
2. **Cross-cutting contracts** — error model, logging / telemetry boundary,
   configuration model, context propagation, public vs internal API surface, i18n.
   Things every package must agree on for the engine to work as one system.
3. **Resulting constraints** — rules new code must follow because of (1) and (2)
   (e.g. "no cross-package internal imports", "no new module-scoped runtime
   state"). Constraints are the *output* of architectural decisions, not the
   definition of architecture.

Binding decisions are recorded as **ADRs** (numbered, dated, immutable). Every
constraint in this folder should be traceable to an ADR that explains *why*.

## What does NOT live here

- Per-feature behavior, AC tables, operation specs, scenario specs — [`docs/03-specs/`](../03-specs/README.md).
- Product intent, scenarios, surface UX — [`docs/01-product/`](../01-product/README.md).
- Per-package coding conventions (file headers, lint rules, naming) — [`.github/instructions/`](../../.github/instructions/).

## Subfolders

- [`adr/`](adr/README.md) — numbered, dated, immutable architectural decisions.
- [`external-dependencies/`](external-dependencies/README.md) — fact pages for the
  external substrate the toolkit binds to (first-party AAD app, broker,
  sovereign clouds, service endpoints). Inputs to architecture decisions, not
  decisions themselves.

## Topic pages

Engine-internal subsystem topic pages live at the root of this folder. Each
topic page lists the subsystem's essential capabilities and cross-cutting
properties, links to the relevant fact pages for the upstream contracts it
binds to, and links to `Proposed` ADRs for any open structural questions.
Topic pages have up to two siblings:

- `<topic>.code-map.md` — navigation aid mapping each capability / property
  to current source; not part of the contract; expected to churn.
- `<topic>.current-state.md` — *optional*, time-bound. Observed costs of
  the current implementation, organized to inform ADR proposals and to
  give AI agents a written floor of context. Not a contract, not a
  decision, not a navigation aid. Carries an `Expires-when:` header (see
  [Conventions](#conventions)) and is rewritten, deleted, or explicitly marked
  historical once that condition is met. Add one only when (a) the subsystem has
  open structural questions being worked through ADRs and (b) those ADRs share a
  common backdrop worth writing down once rather than restating in every ADR's
  Context section.

| Topic | Page | Code map | Historical context |
|---|---|---|---|
| Scaffolding subsystem (create / import → on-disk project skeleton) | [`scaffolding.md`](scaffolding.md) | [`scaffolding.code-map.md`](scaffolding.code-map.md) | [`scaffolding.current-state.md`](scaffolding.current-state.md) |

## Conventions

- ADRs are Markdown, English, numbered sequentially, and never edited after they
  are accepted. To change an accepted decision, add a new ADR whose status is
  `Accepted` and update the old one's status to `Superseded by ADR-NNNN`.
- **Single source of truth.** A fact lives in exactly one page; every other page
  links to its owner rather than restating it. Architecture pages reference ADRs
  by number rather than restating them; the same rule holds between any two
  pages. Restating a fact that already has an owner is a review reject.
- **Time-bound pages carry an `Expires-when:` header.** Any page meant to die —
  a `*.current-state.md` assessment, an ADR-decomposition *proposal* — opens with
  a blockquote naming its death condition: the ADR ids (or a link to the section
  listing them) whose all-`Accepted` state retires the page, plus any human
  clause that is not machine-checkable (for example, **Expires-when:** ADR-0014 –
  ADR-0019 all `Accepted`). CI flags such a page (soft, not a hard fail) once its
  listed ADRs are all `Accepted`, prompting a human to collapse it to a pointer
  or delete it. A time-bound page without this header is a review reject.
- Specific architectural choices (e.g. composition pattern, error type, registry
  vs class hierarchy) belong in ADRs, not in this README — this page is a
  contents page, not a decision log.

## Status

ADRs live under [`adr/`](adr/README.md). Open backlog items (status
`Proposed`) are seeded from open questions on
[`external-dependencies/`](external-dependencies/README.md) fact pages and
from open structural questions on the topic pages above. This folder is
being populated incrementally; topic pages and ADRs together are the
authoritative source as they land.
