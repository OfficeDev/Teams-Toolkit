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
 * T3 scenario tier: the `basic-custom-engine-agent` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-basic-custom-engine-agent.md
 * (SCN-CREATE-BASIC-CEA-01..06)
 */

const templatePackage = loadV4Package("create", "basic-custom-engine-agent");
const appName = "My Agent App";

async function run(language: "typescript" | "javascript" | "python" = "typescript") {
  return runV4Package(templatePackage, { callerFloor: { appName, language } });
}

describe("SCN-TEAMS-CREATE-BASIC-CUSTOM-ENGINE-AGENT (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-BASIC-CEA-01: TypeScript scaffold writes the agent file set", async () => {
    const { outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/agent.ts");
    assert.include(outcome.written, "src/config.ts");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "m365agents.yml");
  });

  it("SCN-CREATE-BASIC-CEA-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "myagentapp");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Agent App${{APP_NAME_SUFFIX}}");
  });

  it("SCN-CREATE-BASIC-CEA-03: JavaScript scaffold selects the JavaScript subtree", async () => {
    const { outcome } = await run("javascript");
    assert.include(outcome.written, "src/index.js");
    assert.include(outcome.written, "src/agent.js");
    assert.include(outcome.written, "src/config.js");
    assert.notInclude(outcome.written, "src/index.ts");
  });

  it("SCN-CREATE-BASIC-CEA-04: Python scaffold selects the Python subtree", async () => {
    const { outcome } = await run("python");
    assert.include(outcome.written, "src/app.py");
    assert.include(outcome.written, "src/agent.py");
    assert.include(outcome.written, "src/config.py");
    assert.notInclude(outcome.written, "package.json");
  });

  it("SCN-CREATE-BASIC-CEA-05: only require-empty-target runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-BASIC-CEA-06: a non-empty target fails require-empty-target first", async () => {
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
