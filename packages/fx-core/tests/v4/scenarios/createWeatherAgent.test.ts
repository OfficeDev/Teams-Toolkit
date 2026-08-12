// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import {
  isRecord,
  loadV4Package,
  readJsonObject,
  recordProperty,
  runV4Package,
  text,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `weather-agent` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-weather-agent.md
 * (SCN-CREATE-WEATHER-01..06)
 */

const templatePackage = loadV4Package("create", "weather-agent");
const appName = "My Weather Agent";

function descriptorLanguages(): string[] {
  if (!isRecord(templatePackage.descriptor)) {
    assert.fail("expected descriptor to be an object");
  }
  const languages = templatePackage.descriptor.languages;
  if (!Array.isArray(languages)) {
    assert.fail("expected descriptor languages to be an array");
  }
  return languages.map((language) => {
    if (typeof language !== "string") {
      assert.fail("expected descriptor language to be a string");
    }
    return language;
  });
}

async function run(language: "typescript" | "javascript" = "typescript") {
  return runV4Package(templatePackage, { callerFloor: { appName, language } });
}

describe("SCN-TEAMS-CREATE-WEATHER-AGENT (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-WEATHER-01: TypeScript scaffold writes the weather agent file set", async () => {
    const { outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/agent.ts");
    assert.include(outcome.written, "src/tools/getWeatherTool.ts");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "m365agents.yml");
  });

  it("SCN-CREATE-WEATHER-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "myweatheragent");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Weather Agent${{APP_NAME_SUFFIX}}");
  });

  it("SCN-CREATE-WEATHER-03: JavaScript scaffold selects the JavaScript subtree", async () => {
    const { outcome } = await run("javascript");
    assert.include(outcome.written, "src/index.js");
    assert.include(outcome.written, "src/agent.js");
    assert.include(outcome.written, "src/tools/getWeatherTool.js");
    assert.notInclude(outcome.written, "src/index.ts");
  });

  it("SCN-CREATE-WEATHER-04: descriptor exposes TypeScript and JavaScript only", () => {
    assert.deepStrictEqual(descriptorLanguages(), ["typescript", "javascript"]);
  });

  it("SCN-CREATE-WEATHER-05: only require-empty-target runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-WEATHER-06: a non-empty target fails require-empty-target first", async () => {
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

  it("SCN-CREATE-WEATHER-07: generated agents normalize Adaptive Card content", async () => {
    for (const language of ["typescript", "javascript"] as const) {
      const { files } = await run(language);
      const extension = language === "typescript" ? "ts" : "js";
      const agentSource = text(files, `src/agent.${extension}`);

      assert.include(agentSource, "content must be a JSON object, not a JSON-encoded string");
      assert.include(agentSource, 'typeof llmResponseContent.content === "string"');
      assert.include(agentSource, "content: adaptiveCardContent");
    }
  });
});
