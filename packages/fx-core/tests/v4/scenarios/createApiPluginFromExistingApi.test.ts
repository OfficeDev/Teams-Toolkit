// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";
import { UserError } from "@microsoft/teamsfx-api";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { ScaffoldRequest, scaffold } from "../../../src/v4/runtime/scaffold";
import { assert } from "vitest";
import {
  loadV4Package,
  readJsonObject,
  recordArrayProperty,
  recordProperty,
  runV4Package,
  text,
  V4ScenarioOutcome,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier (ADR-0018): the whole `da/api-plugin-from-existing-api`
 * create package — the declarative agent with an action generated from an
 * existing OpenAPI description document — scaffolded under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/da/create-api-plugin-from-existing-api.md
 * (SCN-CREATE-APIPLUGIN-OPENAPI-01..10)
 */

const SPEC_PATH = path.resolve(__dirname, "fixtures/repairs-openapi.yaml");
const APIKEY_SPEC_PATH = path.resolve(__dirname, "fixtures/repairs-openapi-apikey.yaml");

const templatePackage = loadV4Package("create", "da/api-plugin-from-existing-api");

const EXPECTED_RENDER_FILES = [
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

async function run(
  options: { existing?: string[]; specPath?: string } = {}
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  return runV4Package(templatePackage, {
    answers: { apiSpecLocation: options.specPath ?? SPEC_PATH, apiOperations: ["GET /repairs"] },
    callerFloor: { appName: "MyAgent", language: "common" },
    existing: options.existing,
  });
}

describe("SCN-DA-CREATE-API-PLUGIN-FROM-EXISTING-API (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-APIPLUGIN-OPENAPI-01: the render phase writes exactly the common file set", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual([...outcome.written].sort(), [...EXPECTED_RENDER_FILES].sort());
    assert.isEmpty(outcome.skipped);
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-02: the OpenAPI post-render step generates the plugin manifest and filtered spec", async () => {
    const { files } = await run();
    assert.isTrue(files.has("appPackage/ai-plugin.json"));
    assert.isTrue(files.has("appPackage/apiSpecificationFile/openapi.yaml"));
    assert.include(
      text(files, "appPackage/apiSpecificationFile/openapi.yaml.original"),
      "title: Repairs API"
    );
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtimes = recordArrayProperty(plugin, "runtimes");
    const runtime = runtimes[0];
    const auth = recordProperty(runtime, "auth");
    const spec = recordProperty(runtime, "spec");
    assert.lengthOf(runtimes, 1);
    assert.strictEqual(runtime.type, "OpenApi");
    assert.strictEqual(auth.type, "None");
    assert.strictEqual(spec.url, "apiSpecificationFile/openapi.yaml");
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-10: referenced static adaptive card templates are preserved", async () => {
    const { files } = await run();
    assert.isTrue(files.has("appPackage/adaptiveCards/listRepairs.json"));
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-03: declarativeAgent.json is updated with the generated action", async () => {
    const { files } = await run();
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    assert.strictEqual(agent.name, "MyAgent");
    assert.deepStrictEqual(recordArrayProperty(agent, "actions"), [
      { id: "action_1", file: "ai-plugin.json" },
    ]);
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-09: OpenAPI summaries are propagated to conversation starters", async () => {
    const { files } = await run();
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    assert.deepStrictEqual(recordArrayProperty(agent, "conversation_starters"), [
      { text: "List repairs" },
    ]);
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-04: manifest.json preserves the declarative agent wiring and env refs", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const copilotAgents = recordProperty(manifest, "copilotAgents");
    const agents = recordArrayProperty(copilotAgents, "declarativeAgents");
    assert.strictEqual(manifest.manifestVersion, "1.29");
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");
    assert.deepStrictEqual(agents[0], {
      id: "declarativeAgent",
      file: "declarativeAgent.json",
    });
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-05: the only post-render step is openapi/generate-plugin-files after require-empty-target", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, [
      "require-empty-target",
      "openapi/generate-plugin-files",
    ]);
    assert.deepStrictEqual(outcome.stepsSkipped, ["da/set-sensitivity-label"]);
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-06: a non-empty target fails require-empty-target first and writes nothing", async () => {
    const runtime = createInMemoryRuntime();
    const request: ScaffoldRequest = {
      descriptor: templatePackage.descriptor,
      pipeline: templatePackage.pipeline,
      content: templatePackage.content,
      answers: { apiSpecLocation: SPEC_PATH, apiOperations: ["GET /repairs"] },
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

  it("SCN-CREATE-APIPLUGIN-OPENAPI-07: identical inputs are deterministic", async () => {
    const first = await run();
    const second = await run();
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.strictEqual(
      text(first.files, "appPackage/ai-plugin.json"),
      text(second.files, "appPackage/ai-plugin.json")
    );
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-08: selected API-key operations inject API-key registration actions into yml", async () => {
    const { files } = await run({ specPath: APIKEY_SPEC_PATH });
    const yml = text(files, "m365agents.yml");
    const localYml = text(files, "m365agents.local.yml");
    for (const content of [yml, localYml]) {
      assert.include(content, "  - uses: apiKey/register");
      assert.include(content, "      name: ApiKeyAuth");
      assert.include(content, "      apiSpecPath: ./appPackage/apiSpecificationFile/openapi.yaml");
      assert.include(content, "      registrationId:");
    }
  });
});
