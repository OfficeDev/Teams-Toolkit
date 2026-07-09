# Development Guideline for cli package

## Dev environment tips
- Use PowerShell scripts on Windows.
- Run `pnpm run setup` from the monorepo root (`../..`) when you need a full workspace build.
- For CLI package build, use `pnpm run build` (or `tsc -p ./ --incremental` for fast local compile-only checks).
- Make sure changed code is covered by unit tests before completion. Unit tests can be skipped only during temporary developing/validating iterations.
- Keep code cross-platform (Windows, Linux, and macOS).

## Build scope guidance
- **When only cli is changed**: Run `pnpm run build` in the cli package directory only. Do NOT rebuild the entire monorepo.
- **When cli and other packages are changed**: Run `pnpm run setup` from the monorepo root to build all affected packages.
- **For dependent packages**: If vscode-extension or other packages depend on cli changes, rebuild those packages in their respective directories AFTER cli builds successfully.
- **Agent instruction**: When presented with changes to a specific package folder, execute build commands scoped to that package directory only to optimize build time and reduce unnecessary compilation.

## Code style and testability
- Prefer namespace imports for internal modules when functions may need stubbing in UT. Example: use `import * as templateHelper from "..."` and call `templateHelper.useLocalTemplate()` instead of destructuring imports.
- Avoid binding external/static dependencies directly at call sites when behavior needs to be mocked. Route them through a deps object or a small wrapper function in the same module.
- Keep I/O and process boundaries explicit and injectable (file system, network, child process, time/random, environment reads), so tests can stub one stable seam.
- Avoid hidden side effects at module load time. Do initialization inside functions/classes when possible.
- In test files, do not double-stub the same symbol in nested hooks/tests; keep one owner stub per symbol to avoid Sinon wrap conflicts.
- For `fs-extra`, keep default import style (`import fs from "fs-extra"`) where stubbing is needed; namespace import can break Sinon stubbing in current Vitest setup.
- For new feature code, add at least one UT that validates the main behavior through the same seam used for mocking.

## Code formatting
- Use `pnpm exec eslint --fix <file>` to fix formatting issues. Do NOT use `prettier --write` directly — `eslint-plugin-prettier` may enforce different line-wrapping rules than standalone prettier, causing lint errors after a bare `prettier --write`.

## Testing instructions
- Use `pnpm test:unit` to run full set of unit tests and get coverage report.
- Use `pnpm test:unit:vitest` for faster local/full UT verification without coverage.
- Use `vitest --config vitest.config.ts` for local watch mode.
- Use `vitest run tests/unit/cmds --config vitest.config.ts --maxWorkers=75%` to run UT for a specific directory.
- Use `vitest run tests/unit/engine.tests.ts --config vitest.config.ts --maxWorkers=75%` to run UT for a specific file.
- Use Vitest as the unit test framework. Do not add `import "mocha"` in tests.
- Keep external dependencies mocked and avoid slow test patterns. New test cases should have low incremental runtime and should not introduce flaky behavior.
- Existing legacy BDD aliases (`before`/`after`/`context`) are provided by `tests/unit/setup.ts`; prefer Vitest APIs for new tests.
- Vitest config only includes `tests/unit/**/*.tests.ts`; place new UT files under `tests/unit` with `*.tests.ts` suffix.
- Current coverage gate is line coverage >= 80% (see `vitest.config.ts`).