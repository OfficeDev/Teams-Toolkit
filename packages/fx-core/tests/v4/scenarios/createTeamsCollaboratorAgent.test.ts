// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { buildRenderContext } from "../../../src/v4/renderContext/buildRenderContext";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { parseDeclaredKeys, parseReplaceMap } from "../../../src/v4/runtime/packageParse";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import {
  loadV4Package,
  readJsonObject,
  recordProperty,
  runV4Package,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `teams-collaborator-agent` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-teams-collaborator-agent.md
 * (SCN-CREATE-COLLABORATOR-01..04)
 */

const templatePackage = loadV4Package("create", "teams-collaborator-agent");
const appName = "My Collaborator Agent";

async function run(language: "typescript" = "typescript") {
  return runV4Package(templatePackage, { callerFloor: { appName, language } });
}

describe("SCN-TEAMS-CREATE-TEAMS-COLLABORATOR-AGENT (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-COLLABORATOR-01: TypeScript scaffold writes the collaborator file set", async () => {
    const { outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/agent/manager.ts");
    assert.include(outcome.written, "src/storage/conversations.db");
    assert.include(outcome.written, "src/capabilities/actionItems/actionItems.ts");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "m365agents.yml");
  });

  it("SCN-CREATE-COLLABORATOR-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "mycollaboratoragent");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Collaborator Agent${{APP_NAME_SUFFIX}}");
  });

  it("SCN-CREATE-COLLABORATOR-SDK: Teams SDK peer packages are pinned to one version", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    const dependencies = recordProperty(pkg, "dependencies");

    assert.strictEqual(dependencies["@microsoft/teams.ai"], "2.0.12");
    assert.strictEqual(dependencies["@microsoft/teams.api"], "2.0.12");
    assert.strictEqual(dependencies["@microsoft/teams.apps"], "2.0.12");
    assert.strictEqual(dependencies["@microsoft/teams.common"], "2.0.12");
    assert.strictEqual(dependencies["@microsoft/teams.dev"], "2.0.12");
    assert.strictEqual(dependencies["@microsoft/teams.openai"], "2.0.12");
    assert.strictEqual(dependencies["@microsoft/teams.cards"], undefined);
    assert.strictEqual(dependencies["@microsoft/teams.graph"], undefined);
  });

  it("SCN-CREATE-COLLABORATOR-03: only require-empty-target runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-COLLABORATOR-AOAI: Azure OpenAI CLI inputs render into env variables", () => {
    const replaceMap = parseReplaceMap(templatePackage.descriptor);
    assert.isTrue(replaceMap.isOk());

    const runtime = createInMemoryRuntime();
    const renderContext = buildRenderContext(
      replaceMap._unsafeUnwrap(),
      {
        azureOpenAIKey: "fake-key",
        azureOpenAIEndpoint: "https://test.com",
        azureOpenAIDeploymentName: "fake-deployment",
      },
      { appName, language: "typescript" },
      runtime.exprPort,
      parseDeclaredKeys(templatePackage.descriptor)
    );

    assert.isTrue(renderContext.isOk());
    const vars = renderContext._unsafeUnwrap();
    assert.strictEqual(vars.azureOpenAIKey, "fake-key");
    assert.strictEqual(vars.originalAzureOpenAIKey, "fake-key");
    assert.strictEqual(vars.azureOpenAIEndpoint, "https://test.com");
    assert.strictEqual(vars.azureOpenAIDeploymentName, "fake-deployment");
  });

  it("SCN-CREATE-COLLABORATOR-04: a non-empty target fails require-empty-target first", async () => {
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
