// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import { assert } from "vitest";
import {
  isRecordArray,
  loadV4Package,
  readJsonObject,
  runV4Package,
  text,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `da/graph-connector` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/da/create-graph-connector.md (SCN-CREATE-GC-01..07)
 */

const templatePackage = loadV4Package("create", "da/graph-connector");
const answers = {
  graphConnectorName: "GitHub Issues",
  graphConnectorConnectionId: "githubissues",
};
const callerFloor = { appName: "Graph Agent", language: "common" };

function expectedWritten(): string[] {
  return templatePackage.content.map((entry) => entry.path.replace(/\.tpl$/, "")).sort();
}

async function run() {
  return runV4Package(templatePackage, { answers, callerFloor });
}

describe("SCN-DA-CREATE-GRAPH-CONNECTOR (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-GC-01: the render phase writes the flattened connector plus DA file set", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual([...outcome.written].sort(), expectedWritten());
    assert.include(outcome.written, "src/functions/connections.ts");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "appPackage/declarativeAgent.json");
  });

  it("SCN-CREATE-GC-02: declarativeAgent.json renders the GraphConnectors capability", async () => {
    const { files } = await run();
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    assert.strictEqual(agent.instructions, "$[file('instruction.txt')]");
    assert.notProperty(agent, "sensitivity_label");
    assert.isTrue(isRecordArray(agent.capabilities));
    const capability = agent.capabilities[0];
    assert.strictEqual(capability.name, "GraphConnectors");
    assert.isTrue(isRecordArray(capability.connections));
    const connection = capability.connections[0];
    assert.strictEqual(connection.connection_id, "${{CONNECTOR_ID}}");
  });

  it("SCN-CREATE-GC-03: env files render connector id and name", async () => {
    const { files } = await run();
    assert.include(text(files, "env/.env.local"), "CONNECTOR_ID=githubissues");
    assert.include(text(files, "env/.env.local"), "CONNECTOR_NAME=GitHub Issues");
    assert.match(text(files, "env/.env.dev"), /^CONNECTOR_ID=\r?$/m);
    assert.include(text(files, "env/.env.dev"), "CONNECTOR_NAME=GitHub Issues");
  });

  it("SCN-CREATE-GC-04: package and yml render DA app package plus Graph connector stages", async () => {
    const { files } = await run();
    assert.strictEqual(readJsonObject(files, "package.json").name, "graphagent");
    const yml = text(files, "m365agents.yml");
    assert.include(yml, "teamsApp/create");
    assert.include(yml, "teamsApp/zipAppPackage");
    assert.include(yml, "aadApp/create");
    assert.include(yml, "arm/deploy");
  });

  it("SCN-CREATE-GC-05: the only pipeline step is require-empty-target", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
  });

  it("SCN-CREATE-GC-06: a non-empty target fails require-empty-target first", async () => {
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

  it("SCN-CREATE-GC-07: an identical re-run is deterministic", async () => {
    const first = await run();
    const second = await run();
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.strictEqual(text(first.files, "env/.env.local"), text(second.files, "env/.env.local"));
    assert.strictEqual(
      readJsonObject(first.files, "appPackage/declarativeAgent.json").name,
      readJsonObject(second.files, "appPackage/declarativeAgent.json").name
    );
  });
});
