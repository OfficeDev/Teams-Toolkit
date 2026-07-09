# PRD

This README and PRD Markdown files in this directory are the AI-facing source of truth.

Keep this directory Markdown-only for active PRD content. Scenario behavior, inline Mermaid flow blocks, surface notes, and HTML visual review aids belong under `../scenarios/` as same-name Markdown + optional HTML pairs.

Product requirements and requirement deltas live here. PRD pages define the high-level user problem, scope, success criteria, constraints, owners, status, and open questions before specs are written. Concrete user flows such as creating, testing, or provisioning a Declarative Agent belong in scenario Markdown under `../scenarios/<group>/`.

Every PRD page must include metadata so humans and agents can find the right people and track document state.

```markdown
## Metadata

- Status: draft | review | approved | implemented | superseded | archived
- Created: YYYY-MM-DDTHH:mm:ssZ
- Last updated: YYYY-MM-DDTHH:mm:ssZ
- PM owner: <owner-id or @handle from ../owner.md>
- Engineer owner: <owner-id or @handle from ../owner.md>
- Owner source: ../owner.md
- Related request: <GitHub issue, ADO work item, or chat summary>
```

Metadata rules:

- Use ISO 8601 UTC timestamps. If exact time is unknown, use the current date with `T00:00:00Z`.
- Update `Last updated` whenever the PRD content or status changes.
- Use [`../owner.md`](../owner.md) for PM and Engineer owner lookup. Package-level engineering owners can also be cross-checked with [`.github/CODEOWNERS`](../../../.github/CODEOWNERS).
- Do not approve a PRD with `TBD` PM or Engineer owners.
- `Status` tracks the PRD document lifecycle, not test or code state.

For AI workflow validation:

- PRD changes land as Markdown under this directory.
- Scenario design, inline Mermaid flow blocks, surface notes, and HTML visual aids land under grouped directories in `docs/01-product/scenarios/`.
- Specs under [`docs/03-specs/`](../../03-specs/README.md) consume the confirmed PRD + UX design and convert it into AC rows, Flow diagrams, tests, and code.

PRD pages should not enumerate every click or command. Link to scenarios for concrete flows and keep PRD requirements stable enough for multiple scenarios to trace back to the same high-level intent.

Pre-reorganization PRD and product material lives under [`../_backups_/`](../_backups_/README.md) and must be rewritten into this schema before it becomes active again.