# Scaffolding subsystem — historical v3 assessment

> **Historical context.** Describes the v3 implementation as of 2026-05.
> The v4 question-model / template-generator reshape has since landed and is the
> formal scaffolding path; this page is retained only because accepted ADRs and
> specs cite its pain-cluster anchors.
> **Not a contract, not a decision, not a navigation aid.** Current contracts live
> in [`scaffolding.md`](scaffolding.md), ADR-0014 ... ADR-0019, and
> [`docs/03-specs/`](../03-specs/README.md).

## 0. How to read this page

This page is a *historical assessment*: the observed costs of the v3
scaffolding implementation before the v4 reshape landed. It remains in the tree
as decision history, not as a description of the current architecture.

| What it IS | What it is NOT |
|---|---|
| Observed pain in the v3 implementation, with code citations | A spec or contract (those live in [`scaffolding.md`](scaffolding.md) §2/§3 and in [`docs/03-specs/`](../03-specs/README.md)) |
| A shared Context section accepted ADRs may link to | An ADR — it does not decide anything, and offers no solutions |
| Historical context for why the v4 shape exists | A navigation map ([`scaffolding.code-map.md`](scaffolding.code-map.md) is that) |
| A list of *gaps* relative to [`scaffolding.md`](scaffolding.md) §3 properties | An external-substrate fact page (those live in [`external-dependencies/`](external-dependencies/README.md)) |

Audience: readers following ADR-0014 ... ADR-0019 back to their original pain
clusters. For current implementation navigation, use
[`scaffolding.code-map.md`](scaffolding.code-map.md).

## 1. Scope

Two adjacent subsystems and the seam between them:

- The **question model** — the tree the engine walks to gather
  `inputs: Record<string, any>` from the user, surfaced as a VS Code
  wizard, a Visual Studio wizard, and a CLI (interactive or
  non-interactive). Source under
  [`packages/fx-core/src/question/`](../../packages/fx-core/src/question).
- The **template generator** — the code that turns those inputs into a
  project on disk. Source under
  [`packages/fx-core/src/component/generator/`](../../packages/fx-core/src/component/generator)
  and template content under [`templates/`](../../templates).
- The **seam** — the untyped `inputs` dictionary by which the question
  tree hands off to the generator, and the `templateName` string by
  which one identifies the unit produced.

Out of scope on this page: provision / deploy / publish / debug; specific
external substrates (those are fact pages); per-feature user flows (those
are specs).

## 2. Pain clusters

Each cluster: a one-sentence statement, the observed evidence with code
links, who feels it (Human / AI / Both), which
[`scaffolding.md`](scaffolding.md) §2 capability or §3 property it
threatens, and the ADR that would absorb it (or "no ADR yet" if there is
no proposal that covers it).

Clusters are ordered by priority — a composite of *blast radius* (how
many §2 capabilities / §3 properties are threatened), *trigger
frequency* (every scaffold vs occasional), *user-visible impact* (does it
reach the end user), and *AI-maintenance hazard* (how silently it breaks
under an agent). **A–E** are the high-priority tier (foundational,
high-frequency, or directly user-visible); **F–J** are structural debt
with narrower or more episodic cost. The lettering is a priority rank,
not a fixed identifier — it is expected to be re-sorted as the shape
changes.

### A. Untyped input space

> The hand-off between question tree and generator is
> `inputs: Record<string, any>`, with no schema, no exhaustiveness check,
> and no compile-time link between the keys a question writes and the
> keys a generator reads. This untyped seam is the foundation the rest of
> the subsystem rests on, which is why it ranks first.

Evidence:

- [`packages/fx-core/src/question/scaffold/constructNode.ts`](../../packages/fx-core/src/question/scaffold/constructNode.ts) materializes nodes whose handlers write arbitrary keys into `inputs` (`onDidSelection: setTemplateNameAndGC | setTemplateName`); the receiving end reads `inputs[QuestionNames.X]` with no shared type.
- The auto-generated [`packages/fx-core/src/question/options/CreateProjectOptions.ts`](../../packages/fx-core/src/question/options/CreateProjectOptions.ts) (produced from the question tree by [`packages/fx-core/src/question/generator.ts`](../../packages/fx-core/src/question/generator.ts) via `ts-morph`) gives the CLI surface a contract, but only as `string`-typed CLI flags; the engine-side `inputs` shape is still `any`.
- Template content uses mustache `{{var}}` placeholders inside the zip files; no static reference exists between
  [`templateReplaceMap.ts`](../../packages/fx-core/src/component/generator/templates/templateReplaceMap.ts) and the placeholders the templates actually use.

Consequences:

- A renamed key silently breaks the template (the placeholder renders as
  empty string; no compile-time or test-time signal unless a snapshot
  test happens to assert on the rendered content).
- A new question can introduce a key the generator never reads — and
  vice versa — without any warning.

- Feels it: **Both.** AI agents disproportionately for the
  template-content half (D).
- Threatens: §2.1 ("known set of starter files" presumes a known mapping
  of inputs to file content), §3.1 (determinism — silent rendering
  failures are non-deterministic w.r.t. what the user asked for).
- ADR coverage: **none.** Candidate for a future ADR.

### B. Multiple unsynchronized sources of truth

> One logical fact (a template exists, a question exists, a CLI option
> exists) has 3–7 separate physical representations, kept in sync only by
> convention and by the author remembering all the mirror locations.

Adding a single new template today touches up to seven places:

1. [`packages/fx-core/src/component/generator/templates/templateNames.ts`](../../packages/fx-core/src/component/generator/templates/templateNames.ts) — `TemplateNames` enum.
2. A generator subclass's `activate(context, inputs)` whitelist, e.g.
   [`packages/fx-core/src/component/generator/declarativeAgent/generator.ts`](../../packages/fx-core/src/component/generator/declarativeAgent/generator.ts).
3. Source UI definitions under [`templates/src/ui/`](../../templates/src/ui) (e.g. `wizard.ts`, `da.ts`).
4. Built UI artifact [`packages/fx-core/templates/ui/wizardNode.json`](../../packages/fx-core/templates/ui/wizardNode.json) — built from the source in (3) and checked in; must be regenerated for the change in (3) to take effect at runtime. [`packages/fx-core/src/question/scaffold/vsc/rootNode.ts`](../../packages/fx-core/src/question/scaffold/vsc/rootNode.ts) `loadUiNode` resolves it across three locations gated by `useLocalTemplate()`: the homedir cache `~/.<ConfigFolderName>/ui/`, then the bundled copy under `getTemplatesFolder()/ui/`.
5. Source metadata under [`templates/src/metadata/`](../../templates/src/metadata) and its built sibling consumed by [`packages/fx-core/src/component/generator/templates/metadata/index.ts`](../../packages/fx-core/src/component/generator/templates/metadata/index.ts).
6. The physical zip(s) under [`templates/vsc/`](../../templates/vsc) and/or [`templates/vs/`](../../templates/vs) — one per `(templateName, language)` plus implicit `common/` overlay (counts as of writing: `vsc/ts=19`, `vsc/js=10`, `vsc/python=10`, `vsc/common=9`).
7. The replace-map contract in [`packages/fx-core/src/component/generator/templates/templateReplaceMap.ts`](../../packages/fx-core/src/component/generator/templates/templateReplaceMap.ts), plus any localized strings used by new questions in [`packages/fx-core/resource/package.nls.json`](../../packages/fx-core/resource/package.nls.json).

The TypeScript program reaches (1), (2), (7) statically; (3) and (5) only
via the build pipeline; (4), (6) and `package.nls.json` are JSON / zip /
NLS data that the compiler cannot reason about.

- Feels it: **Both**, but AI agents disproportionately — see §3.
- Threatens: §2 (all capabilities — "a known set of starter files"
  presumes the set is knowable from one place), §3.1 (determinism — if
  the seven copies disagree, two scaffold runs against the "same" inputs
  diverge depending on which copy wins).
- ADR coverage: partial. [ADR-0006](adr/ADR-0006-template-distribution-channel.md) addresses (4) and (6) at the distribution layer but not the upstream metadata duplication.

### C. Distribution channel resolution split-brain

> Template content and template metadata are downloaded by two
> different code paths that disagree on which release stage maps to
> which template tag. Channel detection is by string-sniffing
> `package.json#version` (`includes("alpha") / ("beta") / ("rc")`),
> which conflates *build flavor* (what kind of fx-core this is) with
> *publish state* (is the matching templates tag already on GitHub).
> The result: a prerelease fx-core scaffolds projects from *stable*
> template content while reading its selector tree from *release-
> candidate* metadata, and the rc channel uses a mutable tag whose
> contents change inside a single release window. It ranks high because
> it is the most directly *user-visible* cluster — a prerelease build
> ships projects that do not match the templates that prerelease will
> release.

Evidence (see appendix items 22–25 for file:line):

- **Content vs metadata disagree on `beta`.** For VSCode, the
  *content* path falls through the `version.includes("beta")` branch
  without returning and ends up requesting the **latest stable**
  templates tag, while the *metadata* path explicitly maps `beta` to
  `0.0.0-rc`. One scaffold run can therefore mix stable content with
  rc selector / NLS data.
- **`0.0.0-rc` is a mutable tag.** Both paths point `alpha / beta /
  rc` at the single `templates@0.0.0-rc` tag, whose asset is
  re-uploaded across the RC window. The code knows this and works
  around it by always re-downloading (`needDownload(): true` when
  version is rc), but the asymmetry means "this fx-core build, this
  scaffold, this commit" is not reproducible a week later.
- **String-sniffing as channel detection.** Channel is inferred from
  substring matches against `package.json#version` in three places
  with different rules (VSCode content, VS content, metadata). There
  is no shared `Channel` enum and no single decision point; adding a
  fourth stage or splitting beta from rc requires editing all three.
- **Implicit silent fallback.** `ScaffoldRemoteTemplateAction` runs
  first; if it sets no `outputs`, `ScaffoldLocalTemplateAction` runs
  with bundled `<fx-core>/templates/fallback/<language>.zip`. Telemetry
  records `template-fallback`, but the user sees no signal that they
  got a different artifact than the engine intended to fetch. This
  collides with §3.1 (determinism) and §3.4 (reproducibility): the
  same `(engine version, inputs)` can produce different output
  depending on network state.
- **`useLocalTemplate` is a global flag, not a per-call mode.**
  `templates-config.json#useLocalTemplate: true` is the VS default;
  flipping it changes behavior across every surface and every
  template, with no per-surface or per-template override. Surface
  authors who want to opt one capability out of the remote channel
  cannot.

- Feels it: **users** (a scaffold from a prerelease build does not
  match the templates that prerelease will ship), **release
  engineers** (must mentally hold the asymmetric mapping when cutting
  rc / stable), **AI agents** (string-sniffing in three places is
  exactly the surface where an agent will edit one site and miss the
  others).
- Threatens: §3.1 (determinism), §3.2 (offline-capable), §3.4
  (reproducibility).
- ADR coverage: [ADR-0006](adr/ADR-0006-template-distribution-channel.md)
  asks whether to keep two channels at all; it does not yet address
  *resolution semantics within a chosen channel* (channel → tag
  mapping, mutable vs immutable tags, content/metadata unification,
  silent-fallback policy). ADR-0006 is the natural home; this cluster
  is a Context expansion for it.

### D. Template content (zip + mustache) is outside LSP reach

> The bulk of what scaffolding produces lives in zip files whose contents
> use mustache placeholders. Neither the symbol graph nor the test suite
> reaches into them in a way that catches drift.

Evidence:

- 19 + 10 + 10 + 9 template folders under [`templates/vsc/`](../../templates/vsc) (`ts`, `js`, `python`, `common`), with high duplication across `(templateName, language)` pairs.
- No `Find References` / rename works across `{{useAzureOpenAI}}`,
  `{{appName}}`, etc.
- Drift between a placeholder in a zip and a key in
  [`templateReplaceMap.ts`](../../packages/fx-core/src/component/generator/templates/templateReplaceMap.ts) renders the placeholder as the empty string with no error.

- Feels it: **AI** primarily; humans feel it more episodically.
- Threatens: §2.1 (the "known set of starter files" is opaque to static
  reasoning), §3.1 (determinism — a renamed key silently changes output).
- ADR coverage: **none.**

### E. Tests cover the conventions, not the conventions' correctness

> Snapshot and unit tests assert that question IDs and option labels do
> not drift, and that the generator orchestration calls the expected
> drivers. They do not assert that the artifact a user would actually run
> works.

Evidence:

- Unzip is mocked in most generator tests, so the test passes as long as
  the orchestration sequence is intact; whether the final project
  installs and starts is out of scope of the unit suite.
- Snapshot tests on `staticOptions[i].id === "…"` catch wording drift in
  question metadata but do not exercise the seam in A (which keys end up
  in `inputs`) or the side effects in H.

- Feels it: **Both.** AI agents disproportionately, because a green test
  run is the strongest signal an AI agent currently has that a change is
  safe.
- Threatens: §3.1 (determinism), and any §2 capability that requires the
  produced project to be runnable.
- ADR coverage: **none.** Test strategy is generally outside the ADR
  scope today.

### F. String-dispatched control flow

> Branching decisions in the subsystem are made by switching on string
> values (`templateName`, `option.id`, `option.data`) and by per-subclass
> `activate(context, inputs)` whitelists, rather than by typed dispatch
> or registry.

Evidence:

- [`packages/fx-core/src/component/generator/defaultGenerator.ts`](../../packages/fx-core/src/component/generator/defaultGenerator.ts) is the default path; specialized subclasses each implement `activate(context, inputs)` as a hand-written `templateName === "…" || …` whitelist.
- [`OptionItem.data`](../../packages/fx-core/src/question/scaffold/vsc/CapabilityOptions.ts) is overloaded: usually a `TemplateNames` enum value, but for at least the MCP-server scenario it is a JSON-serialized server-config object (`JSON.parse(option.data)` in `processMCPLocalServers` inside [`packages/fx-core/src/component/generator/declarativeAgent/generator.ts`](../../packages/fx-core/src/component/generator/declarativeAgent/generator.ts)).
- [`constructNode.ts`](../../packages/fx-core/src/question/scaffold/constructNode.ts) hydrates JSON nodes via named-reference escape hatches (`node: "mcpServerTypeNode"` etc.) — discovery of where such a reference resolves requires a workspace grep, not a `Go to Definition`.

Consequences:

- Adding a branch in the wrong generator subclass silently no-ops (the
  default path picks up the request instead).
- Mistyping a `templateName` is caught only by integration tests that
  happen to scaffold that template.

- Feels it: **Both.** AI agents disproportionately (F reinforces B).
- Threatens: §2 (every capability that switches on project type),
  §3.1 (determinism).
- ADR coverage: partial — [ADR-0010](adr/ADR-0010-typespec-compile-chain-shape.md) and [ADR-0012](adr/ADR-0012-office-addin-import-flow-placement.md) reshape one branch each. No ADR covers the dispatch shape itself.

### G. Generated artifacts and source-of-truth confusion

> Some files in the tree are generated; others are hand-edited; the
> distinction is not enforced and is easy to invert.

Evidence:

- [`packages/fx-core/templates/ui/wizardNode.json`](../../packages/fx-core/templates/ui/wizardNode.json) is built from [`templates/src/ui/`](../../templates/src/ui) but is checked in. An editor opening either is equally plausible; only the source has effect across a clean build. A third copy can shadow both at runtime: [`rootNode.ts`](../../packages/fx-core/src/question/scaffold/vsc/rootNode.ts) `loadUiNode` prefers a homedir cache (`~/.<ConfigFolderName>/ui/`) over the bundled artifact when `useLocalTemplate()` is false.
- [`packages/fx-core/src/question/options/CreateProjectOptions.ts`](../../packages/fx-core/src/question/options/CreateProjectOptions.ts) is marked AUTO-GENERATED but exposes the same shape the question-tree authors would naturally want to edit.
- The remote-vs-local template path means a local-debug scaffold can use
  a bundled zip while a release scaffold pulls a remote zip — the
  test-time and runtime artifacts diverge (see
  [`packages/fx-core/src/component/generator/generatorAction.ts`](../../packages/fx-core/src/component/generator/generatorAction.ts) `ScaffoldRemoteTemplateAction` → `ScaffoldLocalTemplateAction` fallback chain calling `getTemplateLatestVersion` at runtime).

- Feels it: **Both.** AI agents very strongly — see §3.
- Threatens: §3.1 (determinism), §3.4 (reproducibility — `latest` at runtime is the textbook §3.4 violation).
- ADR coverage: [ADR-0006](adr/ADR-0006-template-distribution-channel.md) closes the runtime half of this when accepted; the build-vs-source half is uncovered.

### H. Imperative side effects inside a declarative shell

> Question nodes and the generator's `post()` look declarative
> (`condition`, `dynamicOptions`, ordered hooks) but encode imperative
> sequencing that does not survive reorder or split.

Evidence:

- `dynamicOptions(inputs)` on SPFx-related questions writes back into
  `inputs` as a side channel (e.g. `inputs.globalSpfxPackageVersion`)
  while ostensibly returning the option list ([`packages/fx-core/src/question/create.ts`](../../packages/fx-core/src/question/create.ts)).
- `onDidSelection` on capability options has the side effect of *setting*
  `inputs[QuestionNames.TemplateName]`, so what looks like a UI handler
  is actually the canonical writer of the dispatch key ([`packages/fx-core/src/question/scaffold/constructNode.ts`](../../packages/fx-core/src/question/scaffold/constructNode.ts)).
- `post(context, inputs, destinationPath)` in subclass generators (e.g.
  [`packages/fx-core/src/component/generator/declarativeAgent/generator.ts`](../../packages/fx-core/src/component/generator/declarativeAgent/generator.ts)) is a sequence of `if` blocks whose order encodes invariants — sensitivity-label rewriting must run before MCP-server re-generation, etc. — without those invariants being expressed anywhere.
- `condition` is half-declarative (`{equals: "…"}`) half-functional
  (`(inputs) => bool`), so a single tree mixes statically inspectable
  predicates with arbitrary code.

- Feels it: **Both.** AI agents disproportionately for `post()`
  re-ordering.
- Threatens: §3.1 (determinism — reorder changes output).
- ADR coverage: **none** as a cross-cutting shape; individual ADRs touch
  individual instances.

### I. One tree, three surfaces

> The same question tree serves the VS Code wizard, the Visual Studio
> wizard, and the CLI (interactive and non-interactive). Surface-specific
> fields and behaviors live as scattered properties on each node, with no
> indication that omitting one leaks an internal-only question into the
> CLI surface.

Evidence:

- Per-node properties seen in [`packages/fx-core/src/question/scaffold/vsc/createRootNode.ts`](../../packages/fx-core/src/question/scaffold/vsc/createRootNode.ts) and around it: `cliName`, `cliShortName`, `cliOptionDisabled`, `cliDescription`, `forgetLastValue`, `interactiveOnly`, etc.
- The CLI option file ([`CreateProjectOptions.ts`](../../packages/fx-core/src/question/options/CreateProjectOptions.ts)) is generated from these fields by [`packages/fx-core/src/question/generator.ts`](../../packages/fx-core/src/question/generator.ts) (`collectNodesForCliOptions`, `computeRequired`); missing a flag silently exposes a question that was meant for the wizard only.

- Feels it: **Both.**
- Threatens: §2 (capabilities meant for a specific surface leak; the CLI
  exposes wizard-internal questions).
- ADR coverage: **none.**

### J. No contract document for this internal seam

> The subsystem has a topic page ([`scaffolding.md`](scaffolding.md)) and
> a code map, but neither documents the *question ↔ generator* seam (the
> shape of `inputs`, the meaning of `templateName`, the contract of a
> generator subclass). Each refactor session pays a fixed re-discovery
> cost.

Evidence:

- [`scaffolding.md`](scaffolding.md) §2 talks about *capabilities of the
  whole subsystem*; nothing describes the internal handoff.
- [`scaffolding.code-map.md`](scaffolding.code-map.md) is explicitly a
  navigation aid; it neither defines the seam nor is allowed to be
  treated as a contract.
- The closest thing to an internal contract today is the implicit
  convention in [`packages/fx-core/src/component/generator/templates/metadata/interface.ts`](../../packages/fx-core/src/component/generator/templates/metadata/interface.ts) (`Template { id, name, alias?, displayName?, language, description, link? }`) plus the implicit `(templateName, language)` cartesian — neither machine-checked.

- Feels it: **Both.** AI agents disproportionately, because human
  authors retain tacit knowledge across sessions; AI agents do not.
- Threatens: every property in §3 indirectly, because there is no place
  to express a property at the seam level.
- ADR coverage: **none.**

## 3. AI-vibe-coding overlay

All ten clusters are felt differently when the maintainer is an AI
agent. This overlay is not a separate list of pains; it is an account of
which existing clusters get *amplified* and why, so that the
[`.github/skills/vibe-coding/`](../../.github/skills/vibe-coding/SKILL.md)
skill can react. Bullets follow the §2 priority order.

- **Cluster A (untyped inputs).** AI agents will introduce a new
  `inputs.someFlag` without adding it to
  [`templateReplaceMap.ts`](../../packages/fx-core/src/component/generator/templates/templateReplaceMap.ts) — and the change passes every test because the placeholder renders as `""`. The agent will also delete an "unused" replace-map key when the only user is a mustache `{{key}}` inside a zip.
- **Cluster B (multi-source truth).** Adding "a new template" with seven
  mirror locations means an AI agent that confidently edits one or two
  reports the change done. The non-TS mirrors — JSON, zip, NLS — are
  the ones most likely to be skipped because they do not surface in the
  symbol graph the agent searches.
- **Cluster C (distribution split-brain).** AI agents edit one of the
  three `package.json#version` sniffing sites and miss the other two, or
  "fix" the `beta` fall-through in isolation, silently re-pairing content
  and metadata channels that were intentionally (if confusingly) split.
- **Cluster D (mustache-invisible).** AI agents cannot reach inside zip
  contents with their usual tools (rename, find references), so they
  treat zip-resident symbols as if they did not exist.
- **Cluster E (weak tests).** Green test runs are the strongest signal
  an AI agent currently has; in this subsystem, green is much weaker
  than the agent treats it.
- **Cluster F (string dispatch).** AI agents put a new branch in
  [`defaultGenerator.ts`](../../packages/fx-core/src/component/generator/defaultGenerator.ts) when it belonged in a specialized subclass — or vice versa — because the dispatch is by `activate` whitelist, not by type.
- **Cluster G (build vs source).** AI agents edit the built artifact
  ([`packages/fx-core/templates/ui/wizardNode.json`](../../packages/fx-core/templates/ui/wizardNode.json), [`CreateProjectOptions.ts`](../../packages/fx-core/src/question/options/CreateProjectOptions.ts)) and report the change applied; the next clean build wipes it.
- **Cluster H (imperative-in-declarative).** AI agents will split a
  `dynamicOptions` callback into smaller "pure" helpers and lose the
  side-channel writes; or will reorder `if` blocks in `post()` for
  readability and break invariants encoded only by sequence.
- **Cluster I (three surfaces).** AI agents add a new question without
  setting `cliOptionDisabled` / `forgetLastValue` / `cliName`, exposing
  an internal question to the CLI surface.
- **Cluster J (no contract docs).** Every session starts at zero.
  Understanding accumulated in one session does not persist; the next
  session re-derives it, often differently.

Two cross-cutting AI failure modes worth naming:

- **Silent template-variable drift** (A × D × E). The signature failure
  mode of this subsystem under AI maintenance: a key changes name; the
  template renders an empty string; the snapshot test does not assert on
  the rendered content; the agent reports success.
- **Cross-copy desynchronization** (B × G × D). The signature failure
  mode at the structural level: an agent edits 4 of 7 mirror locations
  for a new template; the next clean build reveals the missing ones, but
  not before the change has been declared done.

One inversion worth naming: AI agents are *faster than humans* at the
mechanical 7-place edit (cluster B), which is itself a symptom — the
mechanical work should not exist. Speeding it up confirms the cost is
real and uncompressed, not that the shape is fine.

## 4. ADR coverage matrix

| Cluster | Covered in part by | Gap |
|---|---|---|
| A. Untyped input space | — | No ADR proposes a typed seam. Candidate. |
| B. Multiple sources of truth | [ADR-0006](adr/ADR-0006-template-distribution-channel.md) (distribution slice only) | The metadata / question-tree / templateName triangle has no ADR. |
| C. Distribution channel resolution split-brain | [ADR-0006](adr/ADR-0006-template-distribution-channel.md) (channel choice only); [`scaffolding.create.proposal.md`](scaffolding.create.proposal.md) §5.2 (content/metadata unification by single-package shape) | Tag-resolution semantics, mutable-tag policy, and source-selection / silent-fallback policy remain ADR-0006's. |
| D. Mustache content outside LSP | — | No ADR. |
| E. Tests cover conventions, not correctness | — | Test strategy generally outside ADR scope today. |
| F. String-dispatched control flow | [ADR-0010](adr/ADR-0010-typespec-compile-chain-shape.md), [ADR-0012](adr/ADR-0012-office-addin-import-flow-placement.md) (each reshapes one branch) | The dispatch *shape* (subclass + whitelist + `option.data` overload) is uncovered. |
| G. Build artifact vs source | [ADR-0006](adr/ADR-0006-template-distribution-channel.md) (runtime half) | Build-artifact-checked-in half is uncovered. |
| H. Imperative-in-declarative | — | No ADR addresses the `post()` shape or `dynamicOptions` side-channel. |
| I. One tree, three surfaces | — | No ADR addresses surface-specific fields. |
| J. No contract document for the internal seam | — | Solving J is partly *this* page, partly a future seam-level contract page. |

## Appendix — raw pain points behind §2

The clusters in §2 absorb a longer raw list. Preserved here for
traceability so that future ADRs can cite the specific item rather than
the cluster heading.

**Question model, internal:**

1. Three representations of one tree (TS source, built JSON, auto-generated CLI options) — no single source. → B, G
2. JSON has named-reference escape hatches (`node: "mcpServerTypeNode"`). → B, F
3. One tree serves four contexts (VS, VSCode, CLI interactive, CLI non-interactive). → I
4. Untyped output (`inputs: Record<string, any>`). → A
5. Implicit side-channel: `dynamicOptions(inputs)` writes into `inputs`. → H
6. `onDidSelection` side effect is the canonical writer of `templateName`. → F, H
7. `OptionItem.data` overloaded (string vs JSON-serialized config). → F
8. `condition` is half-declarative, half-functional. → H, I

**Template generator, internal:**

9. Dual paths (`DefaultTemplateGenerator` + static `Generator.generateTemplate`). → B
10. `activate(context, inputs)` is a hand-written whitelist. → B, F
11. Variable contract from `inputs` → template never explicit. → A, B, D
12. Multiple replace-maps merged at scaffold time. → A, D
13. `post()` is a junk drawer with order-dependent invariants. → H
14. Generator is not a closed unit (calls `developerPortalScaffoldUtils`, `copilotGptManifestUtils`, `addExistingPlugin`, `generateForMCPForDA`). → F, H
15. Remote-zip-then-local-fallback breaks [§3.4](scaffolding.md#3-cross-cutting-properties) reproducibility. → G
16. `(templateName, language)` cartesian + implicit `common/` overlay has no manifest. → B, D
17. Four-way consistency required (`TemplateNames` enum, wizard JSON, metadata JSON, generator subclass whitelist). → B
18. Filter logic mixes business rules with feature flags (e.g. `sandboxFilterFn`). → H, D

**Between:**

19. No contract between "ask" and "use" — the `inputs` dictionary is the contract by default. → B, J
20. Template pick has no dedicated node either side. → A, F
21. Cross-package pipeline ([`templates/src`](../../templates/src) → build → `fx-core`) amplifies the distance from edit to effect. → B, G

**Distribution channel / version resolution:**

22. Content vs metadata disagree on the `beta` channel. [`getTemplateVSCUrl`](../../packages/fx-core/src/component/generator/utils.ts) (around line 60) falls through the `version.includes("beta")` branch into the stable `getLatestVersion()` lookup, while [`fetchOnlineTemplateMetadata`](../../packages/fx-core/src/core/FxCore.ts) (around line 2706) maps `alpha / beta / rc` uniformly to `0.0.0-rc`. One scaffold can mix stable content with rc metadata. → C, B
23. `0.0.0-rc` is a single mutable tag reused across an entire rc window. [`fetchOnlineTemplateMetadata`](../../packages/fx-core/src/core/FxCore.ts) (around line 2722) opts out of caching for this version by always returning `needDownload(): true`. Reproducibility §3.4 is satisfied only within a single tag-upload generation. → C, G
24. Channel detection is `package.json#version` substring sniffing in three places ([`getTemplateVSCUrl`](../../packages/fx-core/src/component/generator/utils.ts), [`getTemplateVSUrl`](../../packages/fx-core/src/component/generator/utils.ts), [`fetchOnlineTemplateMetadata`](../../packages/fx-core/src/core/FxCore.ts)) with subtly different rules. No shared `Channel` enum, no single decision point. → C, F
25. [`ScaffoldRemoteTemplateAction`](../../packages/fx-core/src/component/generator/generatorAction.ts) silently falls back to [`ScaffoldLocalTemplateAction`](../../packages/fx-core/src/component/generator/generatorAction.ts) when the remote returns no zip; the user only sees a `template-fallback` telemetry event after the fact. Identical `(engine, inputs)` produces different scaffold output depending on network. → C, G
26. `templates-config.json#useLocalTemplate` is a global build-time flag with no per-surface or per-template override; flipping it affects every code path that calls `useLocalTemplate()`. → C

## 5. Closing

> v3 implements *asking* and *building files* as two heaps of imperative
> scripts that find each other by string convention, passing data
> through an untyped `inputs` dictionary. The four dimensions — template,
> language, question, variable — have no machine-checkable contract;
> consistency is maintained by grep and tribal knowledge.

> Under AI maintenance: an AI agent is faster than a human at the single
> mechanical edit, but it is also faster at producing cross-copy
> desynchronization, silent template-variable drift, and reordered
> `post()` blocks. The shape, not the maintainer, is the bottleneck.

## 6. What this page does NOT claim

- It does **not** propose any solution. Solutions belong in ADRs.
- It does **not** assert all ten clusters must be fixed. Some may be
  accepted costs.
- It does **not** describe the current scaffolding path. The v4 shape has landed;
  this file survives only as historical context for accepted ADR links.
