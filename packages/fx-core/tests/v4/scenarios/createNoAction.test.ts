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
  recordProperty,
  runV4Package,
  text,
  V4ScenarioOutcome,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier (ADR-0018): the whole `da/no-action` create package — the
 * basic declarative agent with no action — scaffolded under `InMemoryRuntime`,
 * asserting the vertical contract.
 *
 * Spec: docs/03-specs/scenarios/da/create-no-action.md (SCN-CREATE-NOACTION-01..07)
 *
 * Each `it("SCN-CREATE-NOACTION-0X")` maps 1:1 to a scenario AC row. The
 * package's real authored files are loaded from disk (the distribution chain's
 * output shape), then composed; no v3 symbol participates. Basic DA is a pure
 * render — the single `require-empty-target` guard is the only pipeline step, so
 * the scenario also locks "no post-render injection sneaks into the basic path".
 */

/** The complete set of files a basic DA scaffold writes (`.tpl` stripped on render). */
const EXPECTED_FILES = [
  ".gitignore",
  ".vscode/extensions.json",
  ".vscode/launch.json",
  ".vscode/settings.json",
  ".vscode/tasks.json",
  "README.md",
  "appPackage/color.png",
  "appPackage/declarativeAgent.json",
  "appPackage/instruction.txt",
  "appPackage/manifest.json",
  "appPackage/outline.png",
  "env/.env.dev",
  "env/.env.local",
  "evals/prompts.json",
  "m365agents.local.yml",
  "m365agents.yml",
];

const templatePackage = loadV4Package("create", "da/no-action");

interface RunOptions {
  existing?: string[];
}

/** Scaffold the basic-DA package against a fresh in-memory runtime (no answers). */
async function run(
  options: RunOptions = {}
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  return runV4Package(templatePackage, {
    callerFloor: { appName: "MyAgent", language: "common" },
    existing: options.existing,
  });
}

describe("SCN-DA-CREATE-NO-ACTION (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-NOACTION-01: the render phase writes exactly the basic-DA file set (empty target)", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual([...outcome.written].sort(), EXPECTED_FILES);
    assert.isEmpty(outcome.skipped);
  });

  it("SCN-CREATE-NOACTION-02: declarativeAgent.json renders no-action — instructions only, no capabilities", async () => {
    const { files } = await run();
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    assert.strictEqual(agent.name, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.strictEqual(agent.instructions, "$[file('instruction.txt')]");
    // basic DA carries no connector capability block and no sensitivity label.
    assert.notProperty(agent, "capabilities");
    assert.notProperty(agent, "sensitivity_label");
  });

  it("SCN-CREATE-NOACTION-03: manifest.json wires the single declarative agent and preserves the env refs", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    const copilotAgents = recordProperty(manifest, "copilotAgents");
    const agents = copilotAgents.declarativeAgents;
    assert.strictEqual(manifest.manifestVersion, "1.29");
    // the env-var refs survive render verbatim (provision resolves them later).
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");
    assert.strictEqual(name.short, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.isTrue(isRecordArray(agents));
    assert.lengthOf(agents, 1);
    assert.deepStrictEqual(agents[0], { id: "declarativeAgent", file: "declarativeAgent.json" });
  });

  it("SCN-CREATE-NOACTION-04: m365agents.yml is the v1.12 skeleton with no MCP / auth action", async () => {
    const { files } = await run();
    const yml = text(files, "m365agents.yml");
    assert.include(yml, "version: v1.12");
    assert.include(yml, "name: MyAgent${{APP_NAME_SUFFIX}}");
    assert.include(yml, "copilotAgent/publish");
    // no action wiring belongs in the basic path.
    assert.notInclude(yml, "oauth/register");
    assert.notInclude(yml, "pluginManifestPath");
  });

  it("SCN-CREATE-NOACTION-05: the only pipeline step is require-empty-target; no auth env is seeded", async () => {
    const { files, outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
    assert.notInclude(text(files, "env/.env.dev"), "MCP_DA_AUTH_ID_");
  });

  it("SCN-CREATE-NOACTION-06: a non-empty target fails require-empty-target first and writes nothing", async () => {
    const runtime = createInMemoryRuntime();
    const request = {
      descriptor: templatePackage.descriptor,
      pipeline: templatePackage.pipeline,
      content: templatePackage.content,
      answers: {},
      callerFloor: { appName: "MyAgent", language: "common" },
      targetDir: { path: "/out", existing: ["appPackage/manifest.json"] },
    };
    const result = await scaffold(request, runtime);
    assert.isTrue(result.isErr());
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(runtime.files.size, 0);
  });

  it("SCN-CREATE-NOACTION-07: an identical re-run is deterministic (same written set and rendered agent)", async () => {
    const first = await run();
    const second = await run();
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.strictEqual(
      readJsonObject(first.files, "appPackage/declarativeAgent.json").name,
      readJsonObject(second.files, "appPackage/declarativeAgent.json").name
    );
  });
});
