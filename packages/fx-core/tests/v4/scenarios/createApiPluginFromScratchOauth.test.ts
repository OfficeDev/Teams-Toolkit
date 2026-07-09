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
  V4ScenarioOutcome,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier (ADR-0018): the whole `da/api-plugin-from-scratch-oauth`
 * create package — the declarative agent with a brand-new, **OAuth- / Microsoft-
 * Entra-protected** API plugin action — scaffolded under `InMemoryRuntime`,
 * asserting the vertical contract for each declared language.
 *
 * Spec: docs/03-specs/scenarios/da/create-api-plugin-from-scratch-oauth.md
 * (SCN-CREATE-APIPLUGIN-OAUTH-01..11)
 *
 * One package serves **two** action sources — `microsoft-entra` and `oauth` —
 * distinguished by the `apiAuth` selector dimension. The descriptor's `replaceMap`
 * carries a single conditional render var, `{ MicrosoftEntra: when apiAuth ==
 * 'microsoft-entra' }`; the `{{#MicrosoftEntra}}` / `{{^MicrosoftEntra}}` sections
 * (ai-plugin.json, aad.manifest.json, m365agents*.yml, README) then select the
 * Entra vs. generic-OAuth wiring. The file **set** is identical for both sources;
 * only the rendered content of those sections differs. No v3 symbol participates.
 */

/** The TypeScript backend file set a scaffold writes (`.tpl` stripped, language prefix stripped). */
const EXPECTED_TS_FILES = [
  ".funcignore",
  ".gitignore",
  ".tours/custom-token-validation-without-using-Easy-Auth.tour",
  ".vscode/extensions.json",
  ".vscode/launch.json",
  ".vscode/settings.json",
  ".vscode/tasks.json",
  "aad.manifest.json",
  "appPackage/adaptiveCards/listRepairs.data.json",
  "appPackage/adaptiveCards/listRepairs.json",
  "appPackage/ai-plugin.json",
  "appPackage/ai-plugin.local.json",
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
  "README.md",
  "src/functions/middleware/authMiddleware.ts",
  "src/functions/middleware/config.ts",
  "src/functions/middleware/tokenCacheWrapper.ts",
  "src/functions/middleware/tokenValidator.ts",
  "src/functions/middleware/utils.ts",
  "src/functions/repairs.ts",
  "src/repairsData.json",
  "tsconfig.json",
];

/**
 * The JavaScript backend file set — the TS set minus `tsconfig.json`, with every
 * `src/functions/**.ts` (the middleware + `repairs.ts`) re-suffixed `.js`.
 */
const EXPECTED_JS_FILES = EXPECTED_TS_FILES.filter((f) => f !== "tsconfig.json").map((f) =>
  f.startsWith("src/functions/") && f.endsWith(".ts") ? f.replace(/\.ts$/, ".js") : f
);

const templatePackage = loadV4Package("create", "da/api-plugin-from-scratch-oauth");

interface RunOptions {
  existing?: string[];
}

/**
 * Scaffold the package for one language + `apiAuth` source against a fresh
 * in-memory runtime. `apiAuth` ('microsoft-entra' | 'oauth') is the selector
 * dimension the descriptor's `MicrosoftEntra` render var keys off.
 */
async function run(
  language: string,
  apiAuth: string,
  options: RunOptions = {}
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  return runV4Package(templatePackage, {
    answers: { apiAuth },
    callerFloor: { appName: "MyAgent", language },
    existing: options.existing,
  });
}

function firstRuntime(files: Map<string, Buffer>, filePath = "appPackage/ai-plugin.json") {
  const plugin = readJsonObject(files, filePath);
  const runtimes = recordArrayProperty(plugin, "runtimes");
  assert.lengthOf(runtimes, 1);
  return runtimes[0];
}

function runtimeAuth(files: Map<string, Buffer>, filePath = "appPackage/ai-plugin.json") {
  return recordProperty(firstRuntime(files, filePath), "auth");
}

describe("SCN-DA-CREATE-API-PLUGIN-FROM-SCRATCH-OAUTH (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-APIPLUGIN-OAUTH-01: the render phase writes exactly the TypeScript file set (incl. the auth middleware + aad.manifest.json)", async () => {
    const { outcome } = await run("typescript", "microsoft-entra");
    assert.deepStrictEqual([...outcome.written].sort(), [...EXPECTED_TS_FILES].sort());
    assert.isEmpty(outcome.skipped);
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-02: repairDeclarativeAgent.json wires the pre-baked action and omits the sensitivity label", async () => {
    const { files } = await run("typescript", "microsoft-entra");
    const agent = readJsonObject(files, "appPackage/repairDeclarativeAgent.json");
    const actions = recordArrayProperty(agent, "actions");
    assert.strictEqual(agent.name, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.strictEqual(agent.instructions, "$[file('instruction.txt')]");
    assert.lengthOf(actions, 1);
    assert.deepStrictEqual(actions[0], { id: "repairPlugin", file: "ai-plugin.json" });
    assert.notProperty(agent, "sensitivity_label");
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-03: apiAuth 'microsoft-entra' renders the OAuthPluginVault runtime with the Entra reference_id", async () => {
    const { files } = await run("typescript", "microsoft-entra");
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtimes = recordArrayProperty(plugin, "runtimes");
    assert.strictEqual(plugin.namespace, "repairs");
    assert.lengthOf(runtimes, 1);
    const runtime = runtimes[0];
    const auth = recordProperty(runtime, "auth");
    const spec = recordProperty(runtime, "spec");
    assert.strictEqual(runtime.type, "OpenApi");
    assert.strictEqual(auth.type, "OAuthPluginVault");
    // the {{#MicrosoftEntra}} branch selects the Entra auth-code configuration ref.
    assert.strictEqual(auth.reference_id, "${{AADAUTHCODE_CONFIGURATION_ID}}");
    assert.strictEqual(spec.url, "apiSpecificationFile/repair.yml");
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-04: apiAuth 'oauth' renders the OAuthPluginVault runtime with the generic OAuth reference_id", async () => {
    const { files } = await run("typescript", "oauth");
    const auth = runtimeAuth(files);
    assert.strictEqual(auth.type, "OAuthPluginVault");
    // MicrosoftEntra is absent (falsy) -> the {{^MicrosoftEntra}} branch selects the generic OAuth ref.
    assert.strictEqual(auth.reference_id, "${{OAUTH2AUTHCODE_CONFIGURATION_ID}}");
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-05: ai-plugin.local.json is the no-auth local runtime (both sources)", async () => {
    for (const apiAuth of ["microsoft-entra", "oauth"]) {
      const { files } = await run("typescript", apiAuth);
      const runtime = firstRuntime(files, "appPackage/ai-plugin.local.json");
      const auth = recordProperty(runtime, "auth");
      const spec = recordProperty(runtime, "spec");
      assert.strictEqual(auth.type, "None");
      assert.strictEqual(spec.url, "apiSpecificationFile/repair.local.yml");
    }
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-06: manifest.json wires the single declarative agent and preserves the env refs", async () => {
    const { files } = await run("typescript", "microsoft-entra");
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    const copilotAgents = recordProperty(manifest, "copilotAgents");
    const agents = recordArrayProperty(copilotAgents, "declarativeAgents");
    assert.strictEqual(manifest.manifestVersion, "1.29");
    assert.strictEqual(manifest.id, "${{TEAMS_APP_ID}}");
    assert.strictEqual(name.short, "MyAgent${{APP_NAME_SUFFIX}}");
    assert.lengthOf(agents, 1);
    assert.deepStrictEqual(agents[0], {
      id: "repairDeclarativeAgent",
      file: "repairDeclarativeAgent.json",
    });
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-07: language 'typescript' narrows to the typescript subtree, prefix stripped", async () => {
    const { files, outcome } = await run("typescript", "microsoft-entra");
    for (const written of outcome.written) {
      assert.isFalse(
        written.startsWith("typescript/") || written.startsWith("javascript/"),
        `written path '${written}' still carries a language prefix`
      );
    }
    assert.isTrue(files.has("src/functions/repairs.ts"));
    assert.isTrue(files.has("src/functions/middleware/authMiddleware.ts"));
    assert.isTrue(files.has("tsconfig.json"));
    assert.isFalse(files.has("src/functions/repairs.js"));
    // The TS oauth package.json hardcodes its name (a v3 template quirk preserved
    // verbatim by the 0-diff migration); the SafeProjectNameLowerCase producer is
    // exercised by the JS variant instead (SCN-CREATE-APIPLUGIN-OAUTH-08).
    assert.strictEqual(readJsonObject(files, "package.json").name, "apipluginoauth");
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-08: language 'javascript' writes the javascript subtree with the same rendered auth shape", async () => {
    const { files, outcome } = await run("javascript", "microsoft-entra");
    assert.deepStrictEqual([...outcome.written].sort(), [...EXPECTED_JS_FILES].sort());
    assert.isTrue(files.has("src/functions/repairs.js"));
    assert.isTrue(files.has("src/functions/middleware/authMiddleware.js"));
    assert.isFalse(files.has("tsconfig.json"));
    assert.isFalse(files.has("src/functions/repairs.ts"));
    assert.strictEqual(runtimeAuth(files).reference_id, "${{AADAUTHCODE_CONFIGURATION_ID}}");
    assert.strictEqual(readJsonObject(files, "package.json").name, "myagent");
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-09: the only pipeline step is require-empty-target; no post-render injection runs", async () => {
    const { outcome } = await run("typescript", "oauth");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
    assert.isEmpty(outcome.stepsSkipped);
  });

  it("SCN-CREATE-APIPLUGIN-OAUTH-10: a non-empty target fails require-empty-target first and writes nothing", async () => {
    const runtime = createInMemoryRuntime();
    const request: ScaffoldRequest = {
      descriptor: templatePackage.descriptor,
      pipeline: templatePackage.pipeline,
      content: templatePackage.content,
      answers: { apiAuth: "microsoft-entra" },
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

  it("SCN-CREATE-APIPLUGIN-OAUTH-11: the two sources differ only in the rendered auth ref — identical file set, distinct reference_id", async () => {
    const entra = await run("typescript", "microsoft-entra");
    const oauth = await run("typescript", "oauth");
    // identical written set: apiAuth changes content, not the emitted file list.
    assert.deepStrictEqual([...entra.outcome.written].sort(), [...oauth.outcome.written].sort());
    // but the rendered remote-plugin auth ref diverges on the MicrosoftEntra section.
    assert.notStrictEqual(
      runtimeAuth(entra.files).reference_id,
      runtimeAuth(oauth.files).reference_id
    );
  });
});
