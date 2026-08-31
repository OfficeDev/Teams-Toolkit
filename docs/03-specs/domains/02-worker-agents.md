# Worker Agents

- **Status:** Approved
- **Owner:** Microsoft 365 Agents Toolkit maintainers
- **Requirement source:** Maintainer request received on August 31, 2026
- **Product decision:** No PRD or product scenario change is required because this change exposes
  engine-only capabilities and intentionally adds no CLI or VS Code surface.

## Purpose

Own declarative-agent worker reference mutation, inspection, offline graph validation, package
collection, and provision preflight in fx-core so every consuming surface observes one domain
contract.

## Vocabulary

- **Root manifest:** The first DA file declared by `appPackage/manifest.json`. Project-level
  operations resolve environment placeholders in that file reference and fall back to
  `appPackage/declarativeAgent.json` when no DA file is declared or the Teams manifest is absent.
  Provision uses its existing manifest resolver, treats a valid Teams manifest with no DA
  declaration as a non-DA project, and skips Worker validation.
- **ReferenceKey:** A slash-normalized lexical `file` path relative to the declarative-agent
  manifest containing the reference. It rejects absolute paths and lexical traversal outside
  `appPackage`, and does not require the target to exist.
- **ResolvedTarget:** The canonical filesystem identity of an existing regular file after
  resolving symbolic links and junctions. It is used for canonical containment, aliases,
  duplicate-target detection, recursion, self-reference, cycles, and package collection.
- **Blocking diagnostic:** A worker diagnostic whose severity is `error`.

## Reference Resolution

Nested `worker_agents[].file` references are relative to the directory containing the
declarative-agent manifest that declares them. This follows the Microsoft 365 app-package rule
that second-level supplementary files retain the path specified by the first-level file that
references them: https://learn.microsoft.com/office/dev/add-ins/overview/app-package-for-microsoft-365#manually-create-the-app-package-file.

The canonical `appPackage` directory is the containment boundary at every depth. On Windows,
canonical path identity and containment comparisons are case-insensitive; on case-sensitive
platforms they are case-sensitive. Two different lexical references that resolve to the same
canonical target are aliases and diagnose as a duplicate target. A missing target has no
`ResolvedTarget`, so repair operations compare it by `ReferenceKey` only.

## Shared Model

All operations use one internal parser, reference normalizer, and graph walker. The parser retains
the authored JSON object shape for Worker diagnostics and routes the non-Worker DA document through
the generated manifest converter for base type validation. Published IDs are trimmed at the public
input boundary and are otherwise opaque, case-sensitive leaves. File references preserve their
authored spelling in manifests and package content; normalized keys and canonical targets are
internal comparison identities only.

The graph walker validates each existing local manifest as a declarative-agent JSON document,
walks local worker references recursively, and never resolves an ID over the network. Graph depth
is the number of local `file` edges from the root; depth greater than two produces
`WORKER_DEPTH_RECOMMENDED` as a warning.

ID worker references require declarative-agent schema v1.6 or later. Local `file` worker
references require v1.7 or later.

## Diagnostics

Diagnostics have this stable shape:

```typescript
interface WorkerDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
  path?: string;
}
```

Local deterministic failures use stable `WORKER_*` codes. Diagnostics are sorted by
project-relative `file`, JSON `path`, severity (`error`, `warning`, `info`), then `code`, using
ordinal comparison.

## Operations

- [Add worker agent](../operations/worker-agents/add-worker-agent.md)
- [Remove worker agent](../operations/worker-agents/remove-worker-agent.md)
- [Inspect worker agents](../operations/worker-agents/inspect-worker-agents.md)
- [Validate worker agents](../operations/worker-agents/validate-worker-agents.md)
- [Package worker agents](../operations/worker-agents/package-worker-agents.md)
- [Provision worker agents](../operations/worker-agents/provision-worker-agents.md)

## Boundary

This domain does not implement a WIQD surface or manifest host, replace Microsoft Validation
Layer, implement A2A, create delegation credentials, perform offline network lookup, or create,
delete, publish, unpublish, share, clone, or update a worker resource.

## Invariants

1. fx-core is the single owner of worker-agent domain behavior.
2. Reference DTO validation, normalization, graph traversal, and diagnostics are shared by every
   operation and lifecycle integration.
3. Unknown manifest properties and authored worker reference values are preserved unless the
   requested mutation removes the containing entry.
4. Local file content outside canonical `appPackage` is never read or packaged.
5. Offline operations make no network calls for published IDs.
6. Windows aliases differing only by filesystem case have one canonical identity.
