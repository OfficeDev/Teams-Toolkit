// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";
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

/**
 * T3 scenario tier: the `custom-copilot-rag-custom-api` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-custom-copilot-rag-custom-api.md
 * (SCN-CREATE-RAG-CUSTOM-API-01..06)
 */

const SPEC_PATH = path.resolve(__dirname, "fixtures/repairs-openapi.yaml");
const templatePackage = loadV4Package("create", "custom-copilot-rag-custom-api");
const appName = "My API Agent";

async function run(language: "typescript" | "javascript" | "python" = "typescript") {
  return runV4Package(templatePackage, {
    answers: { apiSpecLocation: SPEC_PATH, apiOperations: ["GET /repairs"] },
    callerFloor: { appName, language },
  });
}

describe("SCN-TEAMS-CREATE-CUSTOM-COPILOT-RAG-CUSTOM-API (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-RAG-CUSTOM-API-01: TypeScript scaffold writes and generates the custom API file set", async () => {
    const { files, outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/config.ts");
    assert.include(outcome.written, "src/app/app.ts");
    assert.include(outcome.written, "src/app/handlers.ts");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "m365agents.yml");

    assert.isTrue(files.has("appPackage/apiSpecificationFile/openapi.yaml"));
    assert.isTrue(files.has("src/app/functions.json"));
    assert.isTrue(files.has("src/app/instructions.txt"));
    assert.isTrue(files.has("src/adaptiveCards/listRepairs.json"));
    assert.include(text(files, "src/app/app.ts"), "functionDefs.listRepairs.name");
    assert.include(text(files, "src/app/handlers.ts"), "listRepairsHandler");
    assert.include(text(files, "src/app/handlers.ts"), "openapi.yaml");
    const functions = readJsonObject(files, "src/app/functions.json");
    assert.isTrue("listRepairs" in functions);
  });

  it("SCN-CREATE-RAG-CUSTOM-API-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "myapiagent");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My API Agent${{APP_NAME_SUFFIX}}");
  });

  it("SCN-CREATE-RAG-CUSTOM-API-03: post-render OpenAPI step runs after require-empty-target", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, [
      "require-empty-target",
      "openapi/generate-teams-ai-custom-api-files",
    ]);
  });

  it("SCN-CREATE-RAG-CUSTOM-API-04: JavaScript scaffold selects and updates the JavaScript subtree", async () => {
    const { files, outcome } = await run("javascript");
    assert.include(outcome.written, "src/index.js");
    assert.include(outcome.written, "src/config.js");
    assert.include(outcome.written, "src/app/app.js");
    assert.include(outcome.written, "src/app/handlers.js");
    assert.notInclude(outcome.written, "src/index.ts");
    assert.include(text(files, "src/app/app.js"), "functionDefs.listRepairs.name");
    assert.include(text(files, "src/app/handlers.js"), "listRepairsHandler");
  });

  it("SCN-CREATE-RAG-CUSTOM-API-05: Python scaffold selects and updates the Python subtree", async () => {
    const { files, outcome } = await run("python");
    assert.include(outcome.written, "src/app.py");
    assert.include(outcome.written, "src/handlers.py");
    assert.isTrue(files.has("src/functions.json"));
    assert.isTrue(files.has("src/adaptiveCards/listRepairs.json"));
    assert.notInclude(outcome.written, "package.json");
    assert.include(text(files, "src/app.py"), 'function_defs["listRepairs"]["name"]');
    assert.include(text(files, "src/handlers.py"), "client.listRepairs");
    assert.include(text(files, "src/handlers.py"), "openapi.yaml");
  });

  it("SCN-CREATE-RAG-CUSTOM-API-06: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const result = await scaffold(
      {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: { apiSpecLocation: SPEC_PATH, apiOperations: ["GET /repairs"] },
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
