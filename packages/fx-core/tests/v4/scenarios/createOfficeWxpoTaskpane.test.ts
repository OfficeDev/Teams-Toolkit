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
 * T3 scenario tier: the `office-addin-wxpo-taskpane` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/office/create-wxpo-taskpane.md
 * (SCN-CREATE-WXPO-TASKPANE-01..04)
 */

const templatePackage = loadV4Package("create", "office-addin-wxpo-taskpane");
const callerFloor = { appName: "My Office Addin", language: "typescript" };

async function run() {
  return runV4Package(templatePackage, { callerFloor });
}

describe("SCN-OFFICE-CREATE-WXPO-TASKPANE (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-WXPO-TASKPANE-01: scaffold writes the Office task pane file set", async () => {
    const { outcome } = await run();
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "src/taskpane/taskpane.ts");
    assert.include(outcome.written, "src/commands/commands.ts");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "webpack.config.js");
  });

  it("SCN-CREATE-WXPO-TASKPANE-02: package and manifest render appName-derived values", async () => {
    const { files } = await run();
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "myofficeaddin");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Office Addin");
    assert.strictEqual(name.full, "Full name for My Office Addin");
  });

  it("SCN-CREATE-WXPO-TASKPANE-03: only require-empty-target runs", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-WXPO-TASKPANE-04: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const result = await scaffold(
      {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: {},
        callerFloor,
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
