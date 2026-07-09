// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import {
  loadV4Package,
  readJsonObject,
  recordProperty,
  runV4Package,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `custom-copilot-rag-customize` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-custom-copilot-rag-customize.md
 * (SCN-CREATE-RAG-CUSTOMIZE-01..06)
 */

const templatePackage = loadV4Package("create", "custom-copilot-rag-customize");
const appName = "My Data Agent";

async function run(language: "typescript" | "javascript" | "python" = "typescript") {
  return runV4Package(templatePackage, { callerFloor: { appName, language } });
}

describe("SCN-TEAMS-CREATE-CUSTOM-COPILOT-RAG-CUSTOMIZE (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-RAG-CUSTOMIZE-01: TypeScript scaffold writes the RAG customize file set", async () => {
    const { outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/config.ts");
    assert.include(outcome.written, "src/app/app.ts");
    assert.include(outcome.written, "src/app/myDataSource.ts");
    assert.include(outcome.written, "src/data/Contoso_Electronics_Company_Overview.md");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "m365agents.yml");
  });

  it("SCN-CREATE-RAG-CUSTOMIZE-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "mydataagent");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Data Agent${{APP_NAME_SUFFIX}}");
  });

  it("SCN-CREATE-RAG-CUSTOMIZE-03: JavaScript scaffold selects the JavaScript subtree", async () => {
    const { outcome } = await run("javascript");
    assert.include(outcome.written, "src/index.js");
    assert.include(outcome.written, "src/config.js");
    assert.include(outcome.written, "src/app/app.js");
    assert.include(outcome.written, "src/app/myDataSource.js");
    assert.notInclude(outcome.written, "src/index.ts");
  });

  it("SCN-CREATE-RAG-CUSTOMIZE-04: Python scaffold selects the Python subtree", async () => {
    const { outcome } = await run("python");
    assert.include(outcome.written, "src/app.py");
    assert.include(outcome.written, "src/config.py");
    assert.include(outcome.written, "src/my_data_source.py");
    assert.include(outcome.written, "src/data/Contoso_Electronics_Company_Overview.md");
    assert.notInclude(outcome.written, "package.json");
  });

  it("SCN-CREATE-RAG-CUSTOMIZE-05: only require-empty-target runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-RAG-CUSTOMIZE-06: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const result = await scaffold(
      {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: {},
        callerFloor: { appName, language: "typescript" },
        targetDir: { path: "/out", existing: ["README.md"] },
      },
      runtime
    );
    assert.isTrue(result.isErr());
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(runtime.files.size, 0);
  });
});
