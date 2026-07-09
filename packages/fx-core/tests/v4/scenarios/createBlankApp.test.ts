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
  text,
} from "./helpers/scenarioHarness";

const templatePackage = loadV4Package("create", "blank-app");
const appName = "My Blank App";

async function run() {
  return runV4Package(templatePackage, { callerFloor: { appName, language: "common" } });
}

describe("SCN-TEAMS-CREATE-BLANK-APP (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-BLANK-01: scaffold writes the blank app file set", async () => {
    const { outcome } = await run();
    assert.include(outcome.written, "README.md");
    assert.include(outcome.written, "m365agents.yml");
    assert.include(outcome.written, "m365agents.local.yml");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "appPackage/color.png");
    assert.include(outcome.written, "appPackage/outline.png");
    assert.include(outcome.written, "env/.env.dev");
    assert.include(outcome.written, "env/.env.local");
    assert.include(outcome.written, ".vscode/launch.json");
    assert.include(outcome.written, ".vscode/tasks.json");
    assert.include(outcome.written, ".vscode/settings.json");
    assert.include(outcome.written, ".vscode/extensions.json");
    assert.include(outcome.written, ".gitignore");
    assert.isEmpty(outcome.skipped);
  });

  it("SCN-CREATE-BLANK-02: manifest renders appName and declares no capabilities", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");

    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Blank App${{APP_NAME_SUFFIX}}");
    assert.strictEqual(name.full, "Full name for My Blank App");

    assert.notProperty(manifest, "bots");
    assert.notProperty(manifest, "staticTabs");
    assert.notProperty(manifest, "configurableTabs");
    assert.notProperty(manifest, "composeExtensions");
    assert.notProperty(manifest, "copilotAgents");
  });

  it("SCN-CREATE-BLANK-03: m365agents.yml renders the app lifecycle skeleton", async () => {
    const { files } = await run();
    const yml = text(files, "m365agents.yml");
    assert.include(yml, "version: v1.12");
    assert.include(yml, "name: My Blank App${{APP_NAME_SUFFIX}}");
    assert.include(yml, "uses: teamsApp/zipAppPackage");
    assert.include(yml, "uses: teamsApp/validateAppPackage");
    assert.include(yml, "uses: teamsApp/update");
    assert.include(yml, "uses: teamsApp/publishAppPackage");
  });

  it("SCN-CREATE-BLANK-04: only require-empty-target runs", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
  });

  it("SCN-CREATE-BLANK-05: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const result = await scaffold(
      {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: {},
        callerFloor: { appName, language: "common" },
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
