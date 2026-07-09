# ADR-0013 — Test tiering and the coverage gate's unit-of-measure

- **Status:** Accepted
- **Date:** 2026-06-03
- **Source:** Internal concern — surfaced while adding tests for the v4
  template-distribution channel (PR #16082). The repo defines test **tiers**
  (L1/L2/L3) by *runtime surface and speed*, but never defines the
  **unit-vs-integration** axis, and the codecov gate measures *per-file lines*.
  Those two facts pull new tests toward low-signal, mock-heavy unit tests written
  only to satisfy the line gate.

## Context

The spec layer ([`../../03-specs/README.md`](../../03-specs/README.md)) derives
tests 1:1 from an operation spec's `## Acceptance Criteria` table, and every AC
row is tagged `L1` / `L2` / `L3`. In practice today that tag means:

- **L1** — runs in-memory through an operation's injected port; fast; no real
  fs / network / process. (e.g. the 15 `resolveTemplateSource` AC rows.)
- **L2** — CLI E2E; documented, not yet a hard PR gate.
- **L3** — VS Code UI; documented, not yet a hard PR gate.

So the existing axis is **runtime surface + speed**. It does *not* answer the
question a contributor actually faces when a file shows red in codecov:

> Is this line uncovered because a **behavior** is untested, or because it is
> **adapter/glue** that no acceptance criterion should ever describe?

The v4 distribution design makes this gap concrete. Its value is a **pure
core** (`resolveTemplateSource`, semver selection, digest computation,
`parseTagList`) fully covered by AC-derived L1 tests, plus a **thin adapter**
(`createTemplateSourcePort`) that wires real `fs` / `axios` into that core.
The adapter holds no decision worth a spec row. codecov, measuring per-file
lines, flags the adapter as under-covered and therefore *rewards* writing
`fs`/`axios`-mock tests that assert mechanical call-throughs — exactly the
"tests for cases that can never happen" failure mode. The line gate is steering
the suite away from the behavior it should protect, and toward noise.

Two distinct axes are being conflated:

| Axis | Values | Defined in repo today? |
|---|---|---|
| Runtime surface / speed | L1 / L2 / L3 | Yes (informally) |
| Test purpose (what it protects) | file-unit / operation-integration / scenario-e2e | **No** |
| Coverage gate unit-of-measure | per-file line % | Yes (codecov `project: auto`) |

The missing middle row is what this ADR adds; the third row is what it
re-points.

## Options considered

- **A — Define the purpose axis, and make AC-derived integration coverage the
  gate's unit-of-measure (recommended).**
  - **operation-integration** (AC-derived) is the *primary* protected tier: one
    test per acceptance-criterion, exercised through the operation's port with
    in-memory fakes. This is most of today's "L1" rows.
  - **file-unit** (pure) is *optional and reserved* for genuinely complex pure
    modules (parsers, semver/range logic, digest) — written because the logic is
    intricate, never to chase a line number.
  - **scenario / CLI-E2E / UI** (L2/L3) protect cross-component and surface
    behavior; documented now, progressively gated later — this is the tier with
    the highest project value and the thinnest current coverage.
  - **Thin adapters and barrels** are covered by *one* real integration test
    that drives them across the real boundary (temp dir, stub only at the
    network edge), **or** are explicitly excluded with an `istanbul ignore` /
    codecov path rule carrying a one-line reason. They are never back-filled
    with mock-heavy micro-units.
  - The coverage conversation becomes "is every AC-described behavior covered,
    and is every excluded line justified," not "is every line in every file
    executed."

- **B — Keep tiers as-is; satisfy the per-file line gate however needed.**
  Status quo. Simple, but institutionalizes mock-heavy adapter tests and grows a
  low-signal suite; the gate keeps producing the noise this ADR was written to
  stop.

- **C — Lower or remove the coverage gate.**
  Removes the noise pressure but also removes the floor that catches genuinely
  untested behavior. Throws out the signal with the noise.

- **D — Per-file line gate, but exclude all adapters/barrels wholesale.**
  Less noise than B, but a blanket exclude also hides real untested behavior that
  happens to live next to glue, and gives no positive definition of what *should*
  be tested.

## Consequences expected per option

- **A** gives contributors a decision rule (behavior → integration test;
  complex pure logic → optional unit; glue → one integration test or justified
  ignore) and changes the gate's question from "every line" to "every AC + every
  exclusion justified." Cost: a one-time write-up in `docs/03-specs/` +
  `vibe-coding`, and agreeing how the gate reads (path-scoped coverage / ignore
  conventions) so codecov stops rewarding noise.
- **B** is zero-effort now but pays continuously in suite noise and reviewer
  fatigue, and never resolves the original complaint.
- **C** is cheap but unsafe — silent behavior regressions stop being caught.
- **D** reduces noise but under-specifies intent and can mask real gaps.

## Decision

**Option A.** A test's *purpose* tier — what it protects — is defined alongside
the existing L1/L2/L3 *runtime* tags, and AC-derived integration coverage, not
per-file line execution, is the unit-of-measure the gate exists to defend.

Three primary purpose tiers, plus one migration-specific subtype:

- **operation-integration** (AC-derived) — the primary protected tier. One test
  per acceptance-criterion row, run through the operation's injected port with
  in-memory fakes. Every AC row must have one; the test name carries the AC ID.
- **file-unit** (pure) — optional, reserved for genuinely complex pure modules
  (parsers, semver/range logic, digest). Written because the logic is intricate,
  never to chase a line number.
- **scenario / CLI-E2E / UI** (L2/L3) — protect cross-component and surface
  behavior; documented now, progressively gated later.
- **compatibility** — an AC-derived subtype used when a spec promises migration,
  v3/v4, or old/new parity. It protects the promise with a normalized diff so
  intentional differences are explicit and accidental drift is visible.

Decision rule for a contributor facing an uncovered line:

- Uncovered **behavior** → add its operation-integration test (AC row).
- Uncovered **migration or parity promise** → add its compatibility diff test
  (AC row).
- Uncovered **complex pure logic** → optionally add a file-unit test.
- Uncovered **thin adapter / glue / barrel** → cover it with *one* real
  integration test across the real boundary (temp dir; stub only at the network
  edge), **or** exclude it with `/* istanbul ignore next -- <reason> */` (or a
  codecov path rule) carrying a one-line reason. Never back-fill with
  mock-heavy micro-units.

The numeric coverage floor is kept as a backstop, not as the definition of done.
"Done" is: every AC row has its integration test, and every excluded line carries
a justified ignore.

## Consequences

Landed in the same PR that moves this ADR to `Accepted`:

- [`../../03-specs/README.md`](../../03-specs/README.md) gains a
  **"Test tiers — what each protects"** section defining the three purpose tiers,
  their relation to the L1/L2/L3 runtime tags, and the decision rule above.
- The [`vibe-coding`](../../../.github/skills/vibe-coding/SKILL.md) gate
  previously stated as "Lint clean, format clean, 80% coverage gate green" is
  reworded so the coverage clause reads as AC-integration coverage + justified
  adapter ignores, with the numeric floor named as a backstop.
- New constraint on contributors and reviewers: a thin adapter/barrel must be
  covered by one integration test or carry an `istanbul ignore` with a reason;
  mock-heavy micro-units added solely to lift a file's line % are a review
  red flag.
- The codecov gate (`project: auto`) is unchanged as a floor; this ADR changes
  *what contributors write to satisfy it*, not the threshold.
