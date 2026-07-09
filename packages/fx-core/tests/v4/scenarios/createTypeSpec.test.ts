// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import { assert } from "vitest";
import {
  loadV4Package,
  readJsonObject,
  recordProperty,
  runV4Package,
  text,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `da/typespec` create package scaffolded under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/da/create-typespec.md (SCN-CREATE-TYPESPEC-01..07)
 */

const templatePackage = loadV4Package("create", "da/typespec");
const callerFloor = { appName: "TypeSpec Agent", language: "common" };

function expectedWritten(): string[] {
  return templatePackage.content.map((entry) => entry.path.replace(/\.tpl$/, "")).sort();
}

async function run() {
  return runV4Package(templatePackage, { callerFloor });
}

describe("SCN-DA-CREATE-TYPESPEC (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-TYPESPEC-01: the render phase writes exactly the TypeSpec DA file set", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual([...outcome.written].sort(), expectedWritten());
    assert.include(outcome.written, "src/agent/main.tsp");
    assert.include(outcome.written, "tspconfig.yaml");
    assert.include(outcome.written, "AGENTS.md");
  });

  it("SCN-CREATE-TYPESPEC-02: package.json renders the safe name and TypeSpec dependencies", async () => {
    const { files } = await run();
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "typespecagent");
    const devDependencies = recordProperty(pkg, "devDependencies");
    assert.property(devDependencies, "@microsoft/typespec-m365-copilot");
    assert.property(devDependencies, "@typespec/compiler");
  });

  it("SCN-CREATE-TYPESPEC-03: main.tsp renders agent display name and namespace", async () => {
    const { files } = await run();
    const main = text(files, "src/agent/main.tsp");
    assert.include(main, 'import "@microsoft/typespec-m365-copilot";');
    assert.match(main, /@agent\(\r?\n  "TypeSpec Agent"/);
    assert.include(main, "namespace typespecagent");
  });

  it("SCN-CREATE-TYPESPEC-04: manifest.json preserves TypeSpec-owned generated output boundary", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(manifest.manifestVersion, "1.28");
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");
    assert.strictEqual(name.short, "TypeSpec Agent${{APP_NAME_SUFFIX}}");
    assert.notProperty(manifest, "copilotAgents");
  });

  it("SCN-CREATE-TYPESPEC-05: yaml includes npm, env generation, and typeSpec compile stages only", async () => {
    const { outcome, files } = await run();
    const yml = text(files, "m365agents.yml");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.include(yml, "args: install --progress=false");
    assert.include(yml, "args: run generate:env -- ${{TEAMSFX_ENV}}");
    assert.include(yml, "typeSpec/compile");
  });

  it("SCN-CREATE-TYPESPEC-06: a non-empty target fails require-empty-target first", async () => {
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

  it("SCN-CREATE-TYPESPEC-07: an identical re-run is deterministic", async () => {
    const first = await run();
    const second = await run();
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.strictEqual(
      text(first.files, "src/agent/main.tsp"),
      text(second.files, "src/agent/main.tsp")
    );
  });
});
