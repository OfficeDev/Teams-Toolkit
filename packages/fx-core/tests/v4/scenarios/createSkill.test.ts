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
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `da/skill` create package scaffolded under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/da/create-skill.md (SCN-CREATE-SKILL-01..07)
 */

const templatePackage = loadV4Package("create", "da/skill");
const callerFloor = { appName: "Skill Agent", language: "common" };

function expectedWritten(): string[] {
  return templatePackage.content.map((entry) => entry.path.replace(/\.tpl$/, "")).sort();
}

async function run() {
  return runV4Package(templatePackage, { callerFloor });
}

describe("SCN-DA-CREATE-SKILL (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-SKILL-01: the render phase writes exactly the skill-DA file set", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual([...outcome.written].sort(), expectedWritten());
    assert.include(outcome.written, "appPackage/skills/hello-atk/SKILL.md");
    assert.isEmpty(outcome.skipped);
  });

  it("SCN-CREATE-SKILL-02: declarativeAgent.json renders the local agent skill", async () => {
    const { files } = await run();
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    assert.strictEqual(agent.version, "v1.8");
    assert.strictEqual(agent.name, "Skill Agent${{APP_NAME_SUFFIX}}");
    assert.strictEqual(agent.instructions, "$[file('instruction.txt')]");
    assert.isTrue(isRecordArray(agent.agent_skills));
    assert.deepStrictEqual(agent.agent_skills[0], { folder: "skills/hello-atk" });
    assert.notProperty(agent, "capabilities");
    assert.notProperty(agent, "sensitivity_label");
  });

  it("SCN-CREATE-SKILL-03: manifest.json wires the single declarative agent", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    const copilotAgents = recordProperty(manifest, "copilotAgents");
    assert.strictEqual(manifest.manifestVersion, "1.28");
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");
    assert.strictEqual(name.short, "Skill Agent${{APP_NAME_SUFFIX}}");
    assert.isTrue(isRecordArray(copilotAgents.declarativeAgents));
    assert.deepStrictEqual(copilotAgents.declarativeAgents[0], {
      id: "declarativeAgent",
      file: "declarativeAgent.json",
    });
  });

  it("SCN-CREATE-SKILL-04: the rendered skill file declares hello-atk", async () => {
    const { files } = await run();
    const skill = text(files, "appPackage/skills/hello-atk/SKILL.md");
    assert.include(skill, "name: hello-atk");
    assert.include(skill, "Greets the user with a fun fact");
  });

  it("SCN-CREATE-SKILL-05: the only pipeline step is require-empty-target", async () => {
    const { files, outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
    const yml = text(files, "m365agents.yml");
    assert.notInclude(yml, "oauth/register");
    assert.notInclude(yml, "pluginManifestPath");
  });

  it("SCN-CREATE-SKILL-06: a non-empty target fails require-empty-target first", async () => {
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

  it("SCN-CREATE-SKILL-07: an identical re-run is deterministic", async () => {
    const first = await run();
    const second = await run();
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.deepStrictEqual(
      readJsonObject(first.files, "appPackage/declarativeAgent.json").agent_skills,
      readJsonObject(second.files, "appPackage/declarativeAgent.json").agent_skills
    );
  });
});
