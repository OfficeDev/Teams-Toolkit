# 01 - Product

AI entry point for product intent before specs, tests, or code. Use this directory to clarify requirements and scenario design, then hand approved Markdown sources to engineering workflows.

## Read First

- Workflow skill: [`prd-ux-design`](../../.github/skills/prd-ux-design/SKILL.md)
- PRD format: [`prd/README.md`](prd/README.md)
- Scenario format: [`scenarios/README.md`](scenarios/README.md)
- Owner lookup: [`owner.md`](owner.md)
- Human scenario index: [`scenarios/index.html`](scenarios/index.html)

## What Belongs Here

- [`prd/`](prd/README.md) - high-level PRDs and requirement deltas.
- [`scenarios/`](scenarios/README.md) - concrete product scenarios; the scenario guide owns their model, workload grouping, format, and approval rules.
- [`scenarios/index.html`](scenarios/index.html) - human-facing links to scenario HTML only.
- [`_backups_/`](_backups_/README.md) - old material for reference only; rewrite before using as active product input.

## Rules For AI Agents

- Use `prd-ux-design` for any PRD or scenario change here.
- Do not write specs, tests, or implementation code from this directory.
- Treat PRD/scenario Markdown as the contract. HTML is only a human visual aid.
- Keep PRDs high-level. Put concrete user flows, Mermaid, states, and UI/E2E test intent in scenario Markdown.
- Follow [`scenarios/README.md`](scenarios/README.md) for scenario grouping, HTML format, and shared asset usage.
- Keep exactly one scenario README at [`scenarios/README.md`](scenarios/README.md); group folders are classification buckets, not rule roots.
- Update [`scenarios/index.html`](scenarios/index.html) whenever scenario HTML is added, removed, renamed, or moved.
- Ask the PM, issue owner, or work-item owner when requirements, owners, success criteria, or flows are unclear.

## Handoff

Engineering may proceed only after the PRD/scenario delta is approved or explicitly confirmed unchanged. The handoff should name the source request, PRD artifacts, scenario artifacts, scenario IDs, owners, surfaces, open questions, and next engineering workflow.