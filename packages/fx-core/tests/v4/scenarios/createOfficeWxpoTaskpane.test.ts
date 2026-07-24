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
  recordArrayProperty,
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

async function run(answers?: Record<string, string | string[]>) {
  return runV4Package(templatePackage, { callerFloor, answers });
}

function manifestExtension(files: Map<string, Buffer>): Record<string, unknown> {
  const manifest = readJsonObject(files, "appPackage/manifest.json");
  return recordArrayProperty(manifest, "extensions")[0];
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

  it("SCN-CREATE-WXPO-TASKPANE-05: the selected hosts drive the manifest requirement scopes", async () => {
    const all = manifestExtension(
      (await run({ officeAddinHosts: ["word", "powerpoint", "outlook", "excel"] })).files
    );
    assert.deepStrictEqual(recordProperty(all, "requirements").scopes, [
      "mail",
      "workbook",
      "document",
      "presentation",
    ]);

    const noOutlook = manifestExtension((await run({ officeAddinHosts: ["word", "excel"] })).files);
    assert.deepStrictEqual(recordProperty(noOutlook, "requirements").scopes, [
      "workbook",
      "document",
    ]);
  });

  it("SCN-CREATE-WXPO-TASKPANE-06: Outlook-only manifest blocks appear only when outlook is selected", async () => {
    const runtimeIds = (extension: Record<string, unknown>): unknown[] =>
      recordArrayProperty(extension, "runtimes").map((runtime) => runtime.id);

    const withOutlook = manifestExtension(
      (await run({ officeAddinHosts: ["word", "outlook"] })).files
    );
    assert.include(runtimeIds(withOutlook), "TaskPaneRuntimeMail");
    assert.lengthOf(recordArrayProperty(withOutlook, "ribbons"), 2);

    const withoutOutlook = manifestExtension(
      (await run({ officeAddinHosts: ["word", "excel"] })).files
    );
    assert.notInclude(runtimeIds(withoutOutlook), "TaskPaneRuntimeMail");
    assert.lengthOf(recordArrayProperty(withoutOutlook, "ribbons"), 1);
  });

  it("SCN-CREATE-WXPO-TASKPANE-07: the debug surface and source files match the selected hosts", async () => {
    const { files, outcome } = await run({ officeAddinHosts: ["excel", "outlook"] });

    // Per-host source files for unselected hosts are not written.
    assert.include(outcome.written, "src/taskpane/excel.ts");
    assert.include(outcome.written, "src/taskpane/outlook.ts");
    assert.notInclude(outcome.written, "src/taskpane/word.ts");
    assert.notInclude(outcome.written, "src/taskpane/powerpoint.ts");
    assert.notInclude(outcome.written, "src/commands/word.ts");

    // The taskpane entry only imports selected hosts.
    const taskpane = files.get("src/taskpane/taskpane.ts")?.toString("utf8") ?? "";
    assert.include(taskpane, './excel"');
    assert.include(taskpane, './outlook"');
    assert.notInclude(taskpane, './word"');

    // launch.json lists only the selected hosts in the Run/Debug dropdown.
    const launch = readJsonObject(files, ".vscode/launch.json");
    assert.deepStrictEqual(
      recordArrayProperty(launch, "compounds").map((c) => c.name),
      ["Excel Desktop (Edge Chromium)", "Outlook Desktop (Edge Chromium)"]
    );

    // package.json scripts and default debug app match the selection.
    const pkg = readJsonObject(files, "package.json");
    const scripts = recordProperty(pkg, "scripts");
    assert.property(scripts, "start:desktop:excel");
    assert.property(scripts, "start:desktop:outlook");
    assert.notProperty(scripts, "start:desktop:word");
    assert.strictEqual(recordProperty(pkg, "config").app_to_debug, "excel");
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
