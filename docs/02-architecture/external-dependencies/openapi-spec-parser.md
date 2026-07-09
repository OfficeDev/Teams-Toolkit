# OpenAPI spec parser

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it consumes
`@microsoft/m365-spec-parser` to ingest a user-supplied OpenAPI document
and produce plugin / message-extension artifacts. Every fact below is
anchored in current source — change the parser package, and you must
update this page.

`@microsoft/m365-spec-parser` ships from a separate workspace package in
this monorepo, but the toolkit consumes it as a black-box npm dependency:
only its public exports are used and they are treated the same way as any
other external package's surface.

## 1. Facts the toolkit is bound to

### 1.1 Package

| Aspect | Value |
|---|---|
| npm package | `@microsoft/m365-spec-parser` |
| Public surface consumed | `SpecParser` class, `Utils` namespace, and the associated helper / option types |

### 1.2 Construction

`new SpecParser(input, options)` accepts:

- `input` — a URL string **or** a local file path to an OpenAPI document.
- `options` — parser options carrying project type (e.g. `ProjectType.Copilot`,
  message-extension variants), whether to allow URL inputs, and other
  per-flow toggles selected by the calling site.

When `input` is a URL, the parser's own HTTP client fetches the document;
the toolkit does not pre-fetch or intermediate that request.

### 1.3 Capabilities consumed

The toolkit relies on the parser for:

- Spec validation against the OpenAPI version it declares.
- Operation enumeration (list of HTTP operations exposed by the spec).
- Spec subsetting / pruning (emit a smaller spec containing only selected
  operations).
- Generation of adaptive cards from operations.
- Emission of plugin-flavored OpenAPI artifacts (subset YAML/JSON, plugin
  manifest scaffolding) consumed by the toolkit and by the Kiota chain in
  [`kiota.md`](kiota.md).

### 1.4 OpenAPI version coverage

The parser accepts OpenAPI 3.x documents by default. Swagger 2.0 input
is also accepted (default option `allowSwagger: true`) and is
converted to OpenAPI 3.0 in-memory before further processing; the
calling site can set `allowSwagger: false` in `options` to make the
parser reject Swagger 2.0 with a validation error instead.

### 1.5 Validation diagnostics

The parser validates inputs against its declared OpenAPI version and
against project-type-specific rules (e.g. required operation IDs,
supported parameter serializations, supported HTTP methods, presence
of adaptive-card-eligible response shapes). Failures are returned as
structured diagnostic objects on the parser's validation result, not
thrown as exceptions; the exact rule set lives with the parser package
and can change with parser versions.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **URL input is a network boundary.** When the calling site allows
   `input` to be a URL per §1.2, that URL is user-controlled and the
   parser will issue an outbound HTTP request from the toolkit process —
   call sites must treat the URL as untrusted input and surface failures
   as network-or-validation errors, not infrastructure errors.
2. **Do not duplicate parser capabilities.** Validation, subsetting, and
   adaptive-card generation in §1.3 are the parser's domain; toolkit code
   must not re-implement these on top of raw OpenAPI parsing.
3. **Parser diagnostics surface verbatim.** Validation-rule failures
   (§1.5) and version failures (§1.4) must be reported to the user using
   the parser's own diagnostic strings — re-wrapping or summarizing them
   loses the information the user needs to fix the spec.
4. **Output shape is parser-owned.** The plugin-manifest scaffolding the
   parser emits (§1.3) belongs to the schema family in
   [`manifest-schemas.md`](manifest-schemas.md) §1.1; toolkit code must
   not post-mutate top-level shape, only layer on top.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close.

- **Ingestion boundary.** Should scaffold flows accept a URL input
  (§1.2) and let the parser fetch, or require the user to provide a
  local file path (URL fetch handled as an explicit import step earlier
  in the flow)? Tracked in
  [ADR-0008](../adr/ADR-0008-openapi-spec-ingestion-boundary.md).

---

> **Where these facts live in code today:** see
> [`openapi-spec-parser.code-map.md`](openapi-spec-parser.code-map.md).
> The code map is a navigation aid and is expected to churn with
> refactors; it is not part of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`openapi-spec-parser.code-map.md`](openapi-spec-parser.code-map.md) in
> the same PR. Adding a new constraint to §2 requires an accepted ADR
> under [`../adr/`](../adr/README.md); link it from the constraint line.
