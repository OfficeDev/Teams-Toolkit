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

/**
 * T3 scenario tier: the `custom-copilot-rag-azure-ai-search` create package
 * scaffolded under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-custom-copilot-rag-azure-ai-search.md
 * (SCN-CREATE-RAG-AZURE-SEARCH-01..06)
 */

const templatePackage = loadV4Package("create", "custom-copilot-rag-azure-ai-search");
const appName = "My Search Agent";

async function run(
  language: "typescript" | "javascript" | "python" = "typescript",
  answers: Record<string, string> = {}
) {
  return runV4Package(templatePackage, { answers, callerFloor: { appName, language } });
}

describe("SCN-TEAMS-CREATE-CUSTOM-COPILOT-RAG-AZURE-AI-SEARCH (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-RAG-AZURE-SEARCH-01: TypeScript scaffold writes the Azure AI Search RAG file set", async () => {
    const { outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/config.ts");
    assert.include(outcome.written, "src/app/app.ts");
    assert.include(outcome.written, "src/app/azureAISearchDataSource.ts");
    assert.include(outcome.written, "src/indexers/setup.ts");
    assert.include(outcome.written, "src/indexers/data/Contoso_Electronics_Company_Overview.md");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "m365agents.yml");
  });

  it("SCN-CREATE-RAG-AZURE-SEARCH-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "mysearchagent");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Search Agent${{APP_NAME_SUFFIX}}");
  });

  it("OpenAI answers render the OpenAI data and chat branches", async () => {
    const { files } = await run("typescript", {
      llmService: "llm-service-openai",
      openAIKey: "fake-openai-key",
    });

    const app = text(files, "src/app/app.ts");
    assert.include(app, "apiKey: config.openAIKey!");
    assert.include(app, "openAIEmbeddingModelName: config.openAIEmbeddingModelName!");
    assert.include(app, "model: config.openAIModelName");
    assert.notInclude(app, "azureOpenAIApiKey");
    assert.notInclude(app, "endpoint: config.azureOpenAIEndpoint");
  });

  it("Azure OpenAI answers render the Azure OpenAI data and chat branches", async () => {
    const { files } = await run("typescript", {
      llmService: "llm-service-azure-openai",
      azureOpenAIKey: "fake-azure-openai-key",
      azureOpenAIEndpoint: "https://fake.openai.azure.com/",
      azureOpenAIDeploymentName: "fake-deployment",
    });

    const app = text(files, "src/app/app.ts");
    assert.include(app, "azureOpenAIApiKey: config.azureOpenAIKey!");
    assert.include(app, "azureOpenAIEndpoint: config.azureOpenAIEndpoint!");
    assert.include(app, "model: config.azureOpenAIDeploymentName");
    assert.notInclude(app, "openAIEmbeddingModelName: config.openAIEmbeddingModelName!");
    assert.notInclude(app, "model: config.openAIModelName");
  });

  it("SCN-CREATE-RAG-AZURE-SEARCH-03: JavaScript scaffold selects the JavaScript subtree", async () => {
    const { outcome } = await run("javascript");
    assert.include(outcome.written, "src/index.js");
    assert.include(outcome.written, "src/config.js");
    assert.include(outcome.written, "src/app/app.js");
    assert.include(outcome.written, "src/app/azureAISearchDataSource.js");
    assert.include(outcome.written, "src/indexers/setup.js");
    assert.notInclude(outcome.written, "src/index.ts");
  });

  it("SCN-CREATE-RAG-AZURE-SEARCH-04: Python scaffold selects the Python subtree", async () => {
    const { outcome } = await run("python");
    assert.include(outcome.written, "src/app.py");
    assert.include(outcome.written, "src/config.py");
    assert.include(outcome.written, "src/azure_ai_search_data_source.py");
    assert.include(outcome.written, "src/indexers/setup.py");
    assert.include(outcome.written, "src/indexers/data/Contoso_Electronics_Company_Overview.md");
    assert.notInclude(outcome.written, "package.json");
  });

  it("SCN-CREATE-RAG-AZURE-SEARCH-05: only require-empty-target runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-RAG-AZURE-SEARCH-06: a non-empty target fails require-empty-target first", async () => {
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
});
