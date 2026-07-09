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
 * T3 scenario tier: the `office-addin-excel-cfshortcut` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/office/create-excel-cfshortcut.md
 * (SCN-CREATE-EXCEL-CFSHORTCUT-01..04)
 */

const templatePackage = loadV4Package("create", "office-addin-excel-cfshortcut");
const callerFloor = { appName: "My Excel Addin", language: "typescript" };

async function run() {
  return runV4Package(templatePackage, { callerFloor });
}

describe("SCN-OFFICE-CREATE-EXCEL-CFSHORTCUT (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-EXCEL-CFSHORTCUT-01: scaffold writes the Excel add-in file set", async () => {
    const { outcome } = await run();
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "src/taskpane/taskpane.ts");
    assert.include(outcome.written, "src/taskpane/functions.ts");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "webpack.config.js");
  });

  it("SCN-CREATE-EXCEL-CFSHORTCUT-02: package and manifest render appName-derived values", async () => {
    const { files } = await run();
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "myexceladdin");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Excel Addin");
    assert.strictEqual(name.full, "Full name for My Excel Addin");
  });

  it("SCN-CREATE-EXCEL-CFSHORTCUT-03: only require-empty-target runs", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-EXCEL-CFSHORTCUT-04: a non-empty target fails require-empty-target first", async () => {
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
