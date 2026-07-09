// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

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
 * T3 scenario tier (ADR-0018): the whole `da/api-plugin-from-scratch` create
 * package — the declarative agent with a brand-new (no-auth) API plugin action —
 * scaffolded under `InMemoryRuntime`, asserting the vertical contract for each
 * declared language.
 *
 * Spec: docs/03-specs/scenarios/da/create-api-plugin-from-scratch.md
 * (SCN-CREATE-APIPLUGIN-01..09)
 *
 * Each `it("SCN-CREATE-APIPLUGIN-0X")` maps 1:1 to a scenario AC row. This is the
 * first **language-partitioned** v4 package, so the suite also locks the
 * `select-language-content` axis: the same descriptor / pipeline scaffolds the
 * TypeScript or JavaScript subtree off the Q0 `language`, prefix stripped. The
 * action is pre-baked into `repairDeclarativeAgent.json` (the new-API-from-scratch
 * path), so — like basic DA — the only pipeline step is `require-empty-target`.
 * No v3 symbol participates.
 */

/** The TypeScript backend file set a scaffold writes (`.tpl` stripped, language prefix stripped). */
const EXPECTED_TS_FILES = [
  ".funcignore",
  ".gitignore",
  ".vscode/extensions.json",
  ".vscode/launch.json",
  ".vscode/settings.json",
  ".vscode/tasks.json",
  "README.md",
  "appPackage/adaptiveCards/listRepairs.data.json",
  "appPackage/adaptiveCards/listRepairs.json",
  "appPackage/ai-plugin.json",
  "appPackage/apiSpecificationFile/repair.yml",
  "appPackage/color.png",
  "appPackage/instruction.txt",
  "appPackage/manifest.json",
  "appPackage/outline.png",
  "appPackage/repairDeclarativeAgent.json",
  "env/.env.dev",
  "env/.env.local",
  "host.json",
  "infra/azure.bicep",
  "infra/azure.parameters.json",
  "local.settings.json",
  "m365agents.local.yml",
  "m365agents.yml",
  "package.json",
  "src/functions/repairs.ts",
  "src/repairsData.json",
  "tsconfig.json",
];

/** The JavaScript backend file set — the TS set minus `tsconfig.json`, with `repairs.js` for `repairs.ts`. */
const EXPECTED_JS_FILES = EXPECTED_TS_FILES.filter(
  (f) => f !== "tsconfig.json" && f !== "src/functions/repairs.ts"
).concat("src/functions/repairs.js");

const templatePackage = loadV4Package("create", "da/api-plugin-from-scratch");

interface RunOptions {
  existing?: string[];
}

/** Scaffold the package for one language against a fresh in-memory runtime (no answers). */
async function run(
  language: string,
  options: RunOptions = {}
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  return runV4Package(templatePackage, {
    answers: {},
    callerFloor: { appName: "MyAgent", language },
    existing: options.existing,
  });
}

describe("SCN-DA-CREATE-API-PLUGIN-FROM-SCRATCH (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-APIPLUGIN-01: the render phase writes exactly the TypeScript file set (empty target)", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual([...outcome.written].sort(), [...EXPECTED_TS_FILES].sort());
    assert.isEmpty(outcome.skipped);
  });

  it("SCN-CREATE-APIPLUGIN-02: repairDeclarativeAgent.json wires the pre-baked action and omits the sensitivity label", async () => {
    const { files } = await run("typescript");
    const agent = readJsonObject(files, "appPackage/repairDeclarativeAgent.json");
    const actions = recordArrayProperty(agent, "actions");
    assert.strictEqual(agent.name, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.strictEqual(agent.instructions, "$[file('instruction.txt')]");
    assert.lengthOf(actions, 1);
    assert.deepStrictEqual(actions[0], { id: "repairPlugin", file: "ai-plugin.json" });
    // the sensitivity-label feature is off by default, so the section is omitted.
    assert.notProperty(agent, "sensitivity_label");
  });

  it("SCN-CREATE-APIPLUGIN-03: ai-plugin.json is the no-auth OpenApi runtime over the bundled spec", async () => {
    const { files } = await run("typescript");
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtimes = recordArrayProperty(plugin, "runtimes");
    assert.strictEqual(plugin.namespace, "repairs");
    assert.strictEqual(plugin.name_for_human, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.lengthOf(runtimes, 1);
    const runtime = runtimes[0];
    const auth = recordProperty(runtime, "auth");
    const spec = recordProperty(runtime, "spec");
    assert.strictEqual(runtime.type, "OpenApi");
    assert.strictEqual(auth.type, "None");
    assert.strictEqual(spec.url, "apiSpecificationFile/repair.yml");
  });

  it("SCN-CREATE-APIPLUGIN-04: manifest.json wires the single declarative agent and preserves the env refs", async () => {
    const { files } = await run("typescript");
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    const copilotAgents = recordProperty(manifest, "copilotAgents");
    const agents = recordArrayProperty(copilotAgents, "declarativeAgents");
    assert.strictEqual(manifest.manifestVersion, "1.29");
    // the env-var refs survive render verbatim (provision resolves them later).
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");
    assert.strictEqual(name.short, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.lengthOf(agents, 1);
    assert.deepStrictEqual(agents[0], {
      id: "repairDeclarativeAgent",
      file: "repairDeclarativeAgent.json",
    });
  });

  it("SCN-CREATE-APIPLUGIN-05: language 'typescript' narrows to the typescript subtree, prefix stripped", async () => {
    const { files, outcome } = await run("typescript");
    // every written path is project-root-relative — the language prefix is gone.
    for (const written of outcome.written) {
      assert.isFalse(
        written.startsWith("typescript/") || written.startsWith("javascript/"),
        `written path '${written}' still carries a language prefix`
      );
    }
    assert.isTrue(files.has("src/functions/repairs.ts"));
    assert.isTrue(files.has("tsconfig.json"));
    assert.isFalse(files.has("src/functions/repairs.js"));
    // the derived package.json name proves the SafeProjectNameLowerCase producer.
    assert.strictEqual(readJsonObject(files, "package.json").name, "myagent");
  });

  it("SCN-CREATE-APIPLUGIN-06: language 'javascript' writes the javascript subtree with the same rendered shapes", async () => {
    const { files, outcome } = await run("javascript");
    assert.deepStrictEqual([...outcome.written].sort(), [...EXPECTED_JS_FILES].sort());
    assert.isTrue(files.has("src/functions/repairs.js"));
    assert.isFalse(files.has("tsconfig.json"));
    assert.isFalse(files.has("src/functions/repairs.ts"));
    // the rendered agent / plugin / manifest shapes hold identically for JS.
    const agent = readJsonObject(files, "appPackage/repairDeclarativeAgent.json");
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtime = recordArrayProperty(plugin, "runtimes")[0];
    const auth = recordProperty(runtime, "auth");
    assert.deepStrictEqual(recordArrayProperty(agent, "actions")[0], {
      id: "repairPlugin",
      file: "ai-plugin.json",
    });
    assert.strictEqual(auth.type, "None");
    assert.strictEqual(readJsonObject(files, "package.json").name, "myagent");
  });

  it("SCN-CREATE-APIPLUGIN-07: the only pipeline step is require-empty-target; no post-render injection runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
  });

  it("SCN-CREATE-APIPLUGIN-08: a non-empty target fails require-empty-target first and writes nothing", async () => {
    const runtime = createInMemoryRuntime();
    const request: ScaffoldRequest = {
      descriptor: templatePackage.descriptor,
      pipeline: templatePackage.pipeline,
      content: templatePackage.content,
      answers: {},
      callerFloor: { appName: "MyAgent", language: "typescript" },
      targetDir: { path: "/out", existing: ["appPackage/manifest.json"] },
    };
    const result = await scaffold(request, runtime);
    assert.isTrue(result.isErr());
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(runtime.files.size, 0);
  });

  it("SCN-CREATE-APIPLUGIN-09: an identical re-run is deterministic (same written set and rendered agent)", async () => {
    const first = await run("typescript");
    const second = await run("typescript");
    assert.deepStrictEqual([...first.outcome.written].sort(), [...second.outcome.written].sort());
    assert.strictEqual(
      readJsonObject(first.files, "appPackage/repairDeclarativeAgent.json").name,
      readJsonObject(second.files, "appPackage/repairDeclarativeAgent.json").name
    );
  });
});
