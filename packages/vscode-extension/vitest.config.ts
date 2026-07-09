import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "test/mocks/vscode-vitest.ts"),
      "@vscode/extension-telemetry": path.resolve(
        __dirname,
        "test/mocks/extension-telemetry-vitest.ts"
      ),
      keytar: path.resolve(__dirname, "packageMocks/keytar/index.js"),
    },
  },
  test: {
    globals: true,
    pool: "threads",
    fileParallelism: true,
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
    coverage: {
      provider: "istanbul",
      reportsDirectory: "coverage",
      reporter: ["text", "html", "json-summary", "cobertura", "lcov"],
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/controls/webviewPanel.ts",
        "src/commonlib/**",
        "src/exp/**",
        "src/qm/**",
        "src/treeview/webViewProvider/**",
        "src/utils/survey.ts",
        "src/extension.ts",
        "src/folder.ts",
        "src/debug/**/*.ts",
      ],
      thresholds: {
        lines: 40.53,
      },
    },
  },
});
