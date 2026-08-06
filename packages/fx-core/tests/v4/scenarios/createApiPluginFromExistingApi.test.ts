// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";
import {
  SpecParser,
  SpecParserError,
  ErrorType,
  ValidationStatus,
  WarningType,
} from "@microsoft/m365-spec-parser";
import { SystemError, UserError, Warning } from "@microsoft/teamsfx-api";
import { ensureDir, writeFile, writeJson } from "fs-extra";
import { FeatureFlags, featureFlagManager } from "../../../src/common/featureFlags";
import * as kiotaClient from "../../../src/common/kiotaClient";
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
 * (SCN-CREATE-APIPLUGIN-OPENAPI-01..14)
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
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome; warnings: Warning[] }> {
  return runV4Package(templatePackage, {
    answers: { apiSpecLocation: options.specPath ?? SPEC_PATH, apiOperations: ["GET /repairs"] },
    callerFloor: { appName: "MyAgent", language: "common" },
    existing: options.existing,
  });
}

describe("SCN-DA-CREATE-API-PLUGIN-FROM-EXISTING-API (v4, T3 InMemoryRuntime)", () => {
  beforeEach(() => {
    // The shared generator's Kiota branch spawns an external binary; T3 runs the spec-parser branch.
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
  });

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

  it("SCN-CREATE-APIPLUGIN-OPENAPI-11: the Kiota branch owns the generated plugin artifacts and the original description", async () => {
    vi.mocked(featureFlagManager.getBooleanValue).mockImplementation(
      (flag) => flag === FeatureFlags.KiotaNPMIntegration
    );
    const listTree = vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({
      rootNode: {
        isOperation: true,
        path: "/repairs#GET",
        segment: "GET",
        operationId: "listRepairs",
        summary: "List repairs",
        selected: true,
        children: [],
      },
      servers: ["https://api.example.com"],
      security: [],
      securitySchemes: {},
      logs: [],
    } as never);
    const generate = vi
      .spyOn(kiotaClient, "kiotageneratePlugin")
      .mockImplementation(async (_specPath, outputPath, pluginName, workingDirectory) => {
        await ensureDir(outputPath);
        const generatedSpec = path.join(outputPath, "openapi.yaml");
        const generatedPlugin = path.join(outputPath, "ai-plugin.json");
        await writeFile(generatedSpec, "openapi: 3.0.0\ninfo:\n  title: Kiota Filtered API\n");
        await writeJson(generatedPlugin, {
          functions: [{ name: "listRepairs" }],
          runtimes: [{ type: "OpenApi", auth: { type: "None" }, spec: { url: "placeholder" } }],
        });
        const documents = path.join(workingDirectory, ".kiota", "documents", pluginName);
        await ensureDir(documents);
        await writeFile(
          path.join(documents, "openapi.yaml"),
          "openapi: 3.0.0\ninfo:\n  title: Kiota Original API\n"
        );
        return { openAPISpec: generatedSpec, aiPlugin: generatedPlugin } as never;
      });

    try {
      const { files } = await run();
      assert.include(
        text(files, "appPackage/apiSpecificationFile/openapi.yaml"),
        "title: Kiota Filtered API"
      );
      assert.include(
        text(files, "appPackage/apiSpecificationFile/openapi.yaml.original"),
        "title: Kiota Original API"
      );
      const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
      const runtime = recordArrayProperty(plugin, "runtimes")[0];
      assert.strictEqual(recordProperty(runtime, "spec").url, "apiSpecificationFile/openapi.yaml");
    } finally {
      listTree.mockRestore();
      generate.mockRestore();
    }
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-12: a spec parser generation failure surfaces as a SpecParser system error", async () => {
    const generateForCopilot = vi
      .spyOn(SpecParser.prototype, "generateForCopilot")
      .mockRejectedValue(
        new SpecParserError("cannot generate the plugin manifest", ErrorType.SpecNotValid)
      );

    try {
      const runtime = createInMemoryRuntime();
      const request: ScaffoldRequest = {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: { apiSpecLocation: SPEC_PATH, apiOperations: ["GET /repairs"] },
        callerFloor: { appName: "MyAgent", language: "common" },
        targetDir: { path: "/out", existing: [] },
      };
      const result = await scaffold(request, runtime);
      assert.isTrue(result.isErr());
      const error = result._unsafeUnwrapErr();
      assert.instanceOf(error, SystemError);
      assert.strictEqual(error.source, "SpecParser");
      assert.strictEqual(error.name, ErrorType.SpecNotValid.toString());
      assert.strictEqual(error.message, "cannot generate the plugin manifest");
    } finally {
      generateForCopilot.mockRestore();
    }
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-13: non-fatal generator warnings reach the scaffold warning channel", async () => {
    const generateForCopilot = vi
      .spyOn(SpecParser.prototype, "generateForCopilot")
      .mockResolvedValue({
        allSuccess: true,
        warnings: [
          { type: WarningType.GenerateCardFailed, content: "failed to generate the adaptive card" },
        ],
      });

    try {
      const { warnings } = await run();
      assert.deepStrictEqual(warnings, [
        {
          type: String(WarningType.GenerateCardFailed),
          content: "failed to generate the adaptive card",
        },
      ]);
    } finally {
      generateForCopilot.mockRestore();
    }
  });

  it("SCN-CREATE-APIPLUGIN-OPENAPI-14: an incompatible description document fails validation before generation", async () => {
    const validate = vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Error,
      errors: [{ type: ErrorType.NoSupportedApi, content: "" }],
      warnings: [],
      specHash: "",
    });
    const generateForCopilot = vi.spyOn(SpecParser.prototype, "generateForCopilot");

    try {
      const runtime = createInMemoryRuntime();
      const request: ScaffoldRequest = {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: { apiSpecLocation: SPEC_PATH, apiOperations: ["GET /repairs"] },
        callerFloor: { appName: "MyAgent", language: "common" },
        targetDir: { path: "/out", existing: [] },
      };
      const result = await scaffold(request, runtime);
      assert.isTrue(result.isErr());
      const error = result._unsafeUnwrapErr();
      assert.instanceOf(error, UserError);
      assert.strictEqual(error.name, "invalid-api-spec");
      assert.strictEqual(generateForCopilot.mock.calls.length, 0);
      assert.isFalse(runtime.files.has("appPackage/ai-plugin.json"));
    } finally {
      validate.mockRestore();
      generateForCopilot.mockRestore();
    }
  });
});
