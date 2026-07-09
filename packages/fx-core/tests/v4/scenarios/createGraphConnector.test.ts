// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import { loadV4Package, readJsonObject, runV4Package, text } from "./helpers/scenarioHarness";
import { assert } from "vitest";

/**
 * T3 scenario tier: the standalone `graph-connector` create package scaffolded
 * under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/graph-connector/create-graph-connector.md
 * (SCN-CREATE-STANDALONE-GC-01..06)
 */

const templatePackage = loadV4Package("create", "graph-connector");
const answers = {
  graphConnectorName: "GitHub Issues",
  graphConnectorConnectionId: "githubissues",
};
const callerFloor = { appName: "Graph Connector", language: "typescript" };

function expectedWritten(): string[] {
  return templatePackage.content
    .map((entry) => entry.path.replace(/^typescript\//, "").replace(/\.tpl$/, ""))
    .sort();
}

async function run() {
  return runV4Package(templatePackage, { answers, callerFloor });
}

describe("SCN-CREATE-GRAPH-CONNECTOR (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-STANDALONE-GC-01: the render phase writes the standalone Graph connector file set", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual([...outcome.written].sort(), expectedWritten());
    assert.isFalse(outcome.written.some((filePath) => filePath.startsWith("appPackage/")));
  });

  it("SCN-CREATE-STANDALONE-GC-02: env files render connector id and name", async () => {
    const { files } = await run();
    assert.include(text(files, "env/.env.local"), "CONNECTOR_ID=githubissues");
    assert.include(text(files, "env/.env.local"), "CONNECTOR_NAME=GitHub Issues");
    assert.match(text(files, "env/.env.dev"), /^CONNECTOR_ID=\r?$/m);
    assert.include(text(files, "env/.env.dev"), "CONNECTOR_NAME=GitHub Issues");
  });

  it("SCN-CREATE-STANDALONE-GC-03: package and yml render connector-only project stages", async () => {
    const { files } = await run();
    assert.strictEqual(readJsonObject(files, "package.json").name, "graphconnector");
    const yml = text(files, "m365agents.yml");
    assert.include(yml, "aadApp/create");
    assert.include(yml, "arm/deploy");
    assert.notInclude(yml, "teamsApp/create");
    assert.notInclude(yml, "teamsApp/zipAppPackage");
  });

  it("SCN-CREATE-STANDALONE-GC-04: the only pipeline step is require-empty-target", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
  });

  it("SCN-CREATE-STANDALONE-GC-05: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const result = await scaffold(
      {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers,
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

  it("SCN-CREATE-STANDALONE-GC-06: an identical re-run is deterministic", async () => {
    const first = await run();
    const second = await run();
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.strictEqual(text(first.files, "env/.env.local"), text(second.files, "env/.env.local"));
    assert.strictEqual(text(first.files, "env/.env.dev"), text(second.files, "env/.env.dev"));
  });
});
