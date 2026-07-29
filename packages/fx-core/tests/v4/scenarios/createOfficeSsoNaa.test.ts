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
 * T3 scenario tier: the `office-addin-sso-naa` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/office/create-sso-naa.md
 * (SCN-CREATE-SSO-NAA-01..04)
 */

const templatePackage = loadV4Package("create", "office-addin-sso-naa");
const callerFloor = { appName: "My Sso Addin", language: "typescript" };

async function run(answers?: Record<string, string | string[]>) {
  return runV4Package(templatePackage, { callerFloor, answers });
}

describe("SCN-OFFICE-CREATE-SSO-NAA (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-SSO-NAA-01: scaffold writes the add-in file set", async () => {
    const { outcome } = await run();
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "src/taskpane/taskpane.ts");
    assert.include(outcome.written, "src/taskpane/authConfig.ts");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "webpack.config.js");
  });

  it("SCN-CREATE-SSO-NAA-02: package and manifest render appName-derived values", async () => {
    const { files } = await run();
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "myssoaddin");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Sso Addin");
    assert.strictEqual(name.full, "Full name for My Sso Addin");
  });

  it("SCN-CREATE-SSO-NAA-05: the selected host drives the manifest requirement scope", async () => {
    const scopeFor = async (host: string): Promise<unknown> => {
      const manifest = readJsonObject(
        (await run({ officeAddinNaaHost: host })).files,
        "appPackage/manifest.json"
      );
      const extension = recordArrayProperty(manifest, "extensions")[0];
      return recordProperty(extension, "requirements").scopes;
    };
    assert.deepStrictEqual(await scopeFor("excel"), ["workbook"]);
    assert.deepStrictEqual(await scopeFor("word"), ["document"]);
    assert.deepStrictEqual(await scopeFor("powerpoint"), ["presentation"]);
  });

  it("SCN-CREATE-SSO-NAA-06: the debug surface targets only the selected host", async () => {
    const { files } = await run({ officeAddinNaaHost: "excel" });

    const launch = readJsonObject(files, ".vscode/launch.json");
    assert.deepStrictEqual(
      recordArrayProperty(launch, "compounds").map((c) => c.name),
      ["Excel Desktop (Edge Chromium)"]
    );

    const pkg = readJsonObject(files, "package.json");
    const scripts = recordProperty(pkg, "scripts");
    assert.property(scripts, "start:desktop:excel");
    assert.notProperty(scripts, "start:desktop:word");
    assert.notProperty(scripts, "start:desktop:powerpoint");
    assert.strictEqual(recordProperty(pkg, "config").app_to_debug, "excel");
  });

  it("SCN-CREATE-SSO-NAA-03: only require-empty-target runs", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-SSO-NAA-04: a non-empty target fails require-empty-target first", async () => {
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
