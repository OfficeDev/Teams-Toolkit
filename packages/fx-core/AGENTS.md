# Development Guideline for fx-core package

## Dev environment tips
- Use Powershell scripts on Windows environment.
- Use `pnpm run setup` to fully build the whole monorepo under `../..` (project root) folder.
- Use `tsc -p ./ --incremental` to build the fx-core package.
- Make sure all of the changed codes are covered by unit tests in completed status. Unit test can be ignored in developing/validating status.
- Code should work both on Windows, Linux and macOS.

## Build scope guidance
- **When only fx-core is changed**: Run `pnpm run build` or `tsc -p ./ --incremental` **only in the fx-core package directory**. Do NOT rebuild the entire monorepo.
- **When fx-core and other packages are changed**: Run `pnpm run setup` from the monorepo root to build all affected packages.
- **For dependent packages**: If vscode-extension depends on fx-core changes, rebuild vscode-extension in its directory (`packages/vscode-extension`) AFTER fx-core builds successfully.
- **Agent instruction**: When presented with changes to a specific package folder, execute build commands scoped to that package directory only to optimize build time and reduce unnecessary compilation.

## Code style and testability
- Prefer namespace imports for internal modules when functions may need stubbing in UT. Example: use `import * as templateHelper from "..."` and call `templateHelper.useLocalTemplate()` instead of destructuring imports.
- Avoid binding external/static dependencies directly at call sites when behavior needs to be mocked. Route them through a deps object (for example `fxCoreDeps`) or a small wrapper function.
- Keep I/O and process boundaries explicit and injectable (file system, network, child process, time/random, environment reads), so tests can stub one stable seam.
- Avoid hidden side effects at module load time. Do initialization inside functions/classes when possible.
- In test files, do not double-stub the same symbol in nested hooks/tests; keep one owner stub per symbol to avoid Sinon wrap conflicts.
- For new feature code, add at least one UT that validates the main behavior through the same seam used for mocking.

## Code formatting
- Use `pnpm exec eslint --fix <file>` to fix formatting issues. Do NOT use `prettier --write` directly — `eslint-plugin-prettier` may enforce different line-wrapping rules than standalone prettier, causing lint errors after a bare `prettier --write`.

## Testing instructions
- Use `pnpm test:unit` to run full set of unit tests and get coverage report.
- Use `pnpm test:unit:vitest` for faster local/full UT verification without coverage.
- Use `pnpm test:unit:vitest:watch` for local watch mode.
- Use `vitest run tests/client --config vitest.config.ts --maxWorkers=75%` to run UT for a specific directory.
- Use `vitest run tests/client/graphClient.test.ts --config vitest.config.ts --maxWorkers=75%` to run UT for a specific file.
- Use Vitest as the unit test framework. Do not add `import "mocha"` in tests.
- Keep external dependencies mocked and avoid slow test patterns. New test cases should have low incremental runtime and should not introduce flaky behavior.
- Existing legacy BDD aliases (`before`/`after`/`context`) are provided by `tests/setup.ts`; prefer Vitest APIs for new tests.
- VS Code debug launch config uses `Vitest All` in `.vscode/launch.json`.

## Sinon vs Vitest mock best practices
- **New tests**: use Vitest-native APIs (`vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.mocked()`) exclusively. Do not introduce Sinon in new test files.
- **Existing tests**: Sinon sandboxes are fine to keep. Do not mix Sinon stubs and `vi.spyOn`/`vi.mock` on the same symbol in the same file — this causes double-wrap conflicts and unpredictable restore order.
- When a file already uses `sinon.createSandbox()`, keep all stubs in that sandbox and call `sandbox.restore()` in `afterEach`. Do not add `vi.mock` at the module level in the same file.
- When a file already uses `vi.mock()` at the top, do not also use `sinon.stub()` for the same module; use `vi.mocked()` to access the mock and control its behavior.
- Prefer `vi.mock(module, factory)` over `sinon.stub(obj, method)` for ES module boundaries, since Sinon cannot stub frozen ESM namespace objects directly.