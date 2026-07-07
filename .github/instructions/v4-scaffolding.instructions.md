---
description: V4 scaffolding architecture rules - use when changing fx-core v4 scaffolding, templates/v4, scaffolding specs/ADRs, providers, validators, pipeline steps, or tests. Enforces design-first reuse, shared question walk, extension points, and no hidden engine business logic.
applyTo: 'packages/fx-core/src/v4/**,packages/fx-core/tests/v4/**,templates/v4/**,docs/03-specs/operations/scaffolding/**,docs/03-specs/domains/01-scaffolding.md,docs/02-architecture/scaffolding*.md,docs/02-architecture/adr/ADR-0014*,docs/02-architecture/adr/ADR-0016*,docs/02-architecture/adr/ADR-0017*'
---

# V4 Scaffolding Rules

## Start From Design

Before changing v4 scaffolding code, templates, tests, or specs, identify the
owning design document and state the local target behavior from it. Use these as
the primary anchors:

- Domain contract: `docs/03-specs/domains/01-scaffolding.md`
- Q1 routing and BuildTarget: `docs/03-specs/operations/scaffolding/resolve-build-target.md`, `walk-create-selector.md`, and ADR-0014
- Q2 + common create floor: `docs/03-specs/operations/scaffolding/collect-create-inputs.md`
- Shared question walk: `docs/03-specs/operations/scaffolding/collect-inputs.md` and ADR-0016
- Provider / validator / pipeline extension points: ADR-0016, ADR-0017, and the owning operation spec

Do not infer the target architecture from nearby implementation alone. If code
and accepted specs disagree, call out the mismatch and implement toward the
accepted spec / ADR unless the user explicitly asks to revise the design first.

## Architecture Constraints

- Treat the v4 engine as generic interpreters and dispatchers. Capability logic
  must be enumerable as template data, a named provider, a named validator, or a
  named pipeline step.
- Do not add MCP, OpenAPI, Graph, Office, or template-specific branches to front
  doors, question-walk code, render-context code, or the pipeline executor.
- Reuse the shared `collect-inputs` semantics for Q1 selector questions and
  Q2+common-floor create questions. Do not create a parallel question-walk
  engine for one surface or one template family.
- Keep Q2 template questions, descriptor-bound `language`, and common create
  floor answers (`folder`, `app-name`) in one create-input walk when working on
  the target v4 create flow.
- Providers, validators, and pipeline steps are extension points with stable ids,
  dedicated implementation files, registry wiring, and focused tests. Surface
  adapters compose registries; they do not own concrete business logic.
- When adding behavior, first classify it as one of: template data, provider,
  validator, pipeline step, or generic engine semantics. If it does not fit one
  of those buckets, pause and update the design before coding.

## Test Shape

- Derive required tests from the owning spec's Acceptance Criteria and include
  the AC id in the test name when there is an AC row.
- Test generic engine semantics with in-memory fixtures and fake registries.
- Test provider, validator, and step business logic directly at that extension
  point; do not route those unit tests through a full create/scaffold front door.
- Use real `templates/v4` package bytes only for focused integration checks that
  prove package loading or cross-operation wiring. Do not rebuild or parse the
  full template floor for every provider/validator/step behavior test.
- If a test needs immutable package bytes, share or memoize the floor inside the
  test file instead of rebuilding it per case.

## Review Checklist

Before finishing, verify that the diff still has a single owner for each piece
of business logic:

- Template routing and question shape come from selector/template data.
- Dynamic option behavior lives in providers.
- Input checks live in validators.
- File or manifest side effects live in pipeline steps.
- Engine code only interprets declared data, performs registry lookup, and
  orchestrates generic control flow.