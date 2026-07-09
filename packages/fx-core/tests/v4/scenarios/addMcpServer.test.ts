// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import { assert } from "vitest";
import {
  isRecord,
  isRecordArray,
  loadV4Package,
  readJsonObject,
  recordProperty,
  runV4Package,
  text,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `modify/add-mcp-server` package applied to an existing
 * DA project under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/da/add-mcp-server.md (SCN-ADD-MCP-01..09)
 */

const MCP_SERVER_URL = "https://api.github.com/mcp";
const NAMESPACE = "apigithubc";
const PLUGIN_PATH = `appPackage/ai-plugin-${NAMESPACE}.json`;
const TEAMS_MANIFEST_PATH = "appPackage/manifest.json";
const DA_MANIFEST_PATH = "appPackage/declarativeAgent.json";
const YML_PATH = "m365agents.yml";
const ENV_PATH = "env/.env.dev";
const AUTH_REF = "${{MCP_DA_AUTH_ID_APIGITHUBC}}";
const AUTH_ENV_VAR = "MCP_DA_AUTH_ID_APIGITHUBC";

const templatePackage = loadV4Package("modify", "add-mcp-server");
const descriptor = templatePackage.descriptor;
const questions = templatePackage.questions;

function actions(manifest: Record<string, unknown>): Record<string, unknown>[] {
  const value = manifest.actions;
  assert.isTrue(isRecordArray(value));
  return value;
}

function runtimes(plugin: Record<string, unknown>): Record<string, unknown>[] {
  const value = plugin.runtimes;
  assert.isTrue(isRecordArray(value));
  return value;
}

function auth(runtime: Record<string, unknown>): Record<string, unknown> {
  const value = runtime.auth;
  assert.isTrue(isRecord(value));
  return value;
}

function questionItems(value: unknown): Record<string, unknown>[] {
  assert.isTrue(isRecord(value));
  const items = value.questions;
  assert.isTrue(isRecordArray(items));
  return items;
}

interface RunOptions {
  authType?: string;
  teamsManifestPath?: string;
}

async function run(options: RunOptions = {}): Promise<{
  files: Map<string, Buffer>;
  outcome: Awaited<ReturnType<typeof unwrapOutcome>>;
}> {
  const authType = options.authType ?? "none";
  const teamsManifestPath = options.teamsManifestPath ?? TEAMS_MANIFEST_PATH;
  return runV4Package(templatePackage, {
    answers: { mcpServerUrl: MCP_SERVER_URL, teamsManifestPath, authType },
    callerFloor: { appName: "Existing Agent", language: "common" },
    existing: [TEAMS_MANIFEST_PATH, DA_MANIFEST_PATH, YML_PATH, ENV_PATH],
    seedFiles: {
      [TEAMS_MANIFEST_PATH]: JSON.stringify({
        copilotAgents: {
          declarativeAgents: [{ id: "declarativeAgent", file: "declarativeAgent.json" }],
        },
      }),
      [DA_MANIFEST_PATH]: JSON.stringify({ name: "Existing Agent" }),
      [YML_PATH]: ["version: v1.12", "provision:"].join("\n"),
      [ENV_PATH]: "TEAMSFX_ENV=dev\n",
    },
    targetPath: "/project",
  });
}

function unwrapOutcome(result: Awaited<ReturnType<typeof scaffold>>) {
  assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  return result._unsafeUnwrap();
}

describe("SCN-DA-ADD-MCP-ACTION-TO-DA (v4, T3 InMemoryRuntime)", () => {
  it("SCN-ADD-MCP-01: writes only the dynamic plugin manifest in the render phase", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.written, [PLUGIN_PATH]);
  });

  it("SCN-ADD-MCP-02: renders a URL-derived namespace and dynamic plugin filename", async () => {
    const { files } = await run();
    const plugin = readJsonObject(files, PLUGIN_PATH);
    assert.strictEqual(plugin.namespace, NAMESPACE);
    assert.isTrue(files.has(PLUGIN_PATH));
    assert.isFalse(files.has("appPackage/ai-plugin.json"));
  });

  it("SCN-ADD-MCP-03: renders the RemoteMCPServer dynamic discovery runtime", async () => {
    const { files } = await run();
    const plugin = readJsonObject(files, PLUGIN_PATH);
    const runtime = runtimes(plugin)[0];
    assert.strictEqual(runtime.type, "RemoteMCPServer");
    const spec = runtime.spec;
    assert.isTrue(isRecord(spec));
    assert.strictEqual(spec.url, MCP_SERVER_URL);
    assert.strictEqual(spec.enable_dynamic_discovery, true);
    assert.deepStrictEqual(runtime.run_for_functions, ["*"]);
  });

  it("SCN-ADD-MCP-04: registers the rendered plugin in the existing DA manifest", async () => {
    const { files, outcome } = await run();
    assert.include(outcome.stepsRun, "da-action/register-plugin-manifest");
    const daManifest = readJsonObject(files, DA_MANIFEST_PATH);
    assert.deepInclude(actions(daManifest), { id: NAMESPACE, file: `ai-plugin-${NAMESPACE}.json` });
  });

  it("SCN-ADD-MCP-06: authType=oauth renders OAuthPluginVault and injects oauth/register", async () => {
    const { files, outcome } = await run({ authType: "oauth" });
    const runtime = runtimes(readJsonObject(files, PLUGIN_PATH))[0];
    assert.strictEqual(auth(runtime).type, "OAuthPluginVault");
    assert.strictEqual(auth(runtime).reference_id, AUTH_REF);
    assert.include(outcome.stepsRun, "mcp-auth/inject-yml-action");
    assert.include(text(files, YML_PATH), "oauth/register");
  });

  it("SCN-ADD-MCP-07: authType oauth/entra-sso persists MCP_DA_AUTH_ID_<NS>", async () => {
    for (const authType of ["oauth", "entra-sso"]) {
      const { files, outcome } = await run({ authType });
      assert.include(outcome.stepsRun, "mcp-auth/persist-credential-env");
      assert.include(text(files, ENV_PATH), `${AUTH_ENV_VAR}=`);
    }
  });

  it("SCN-ADD-MCP-08: authType=none renders auth None and skips auth wiring steps", async () => {
    const { files, outcome } = await run({ authType: "none" });
    const runtime = runtimes(readJsonObject(files, PLUGIN_PATH))[0];
    assert.strictEqual(auth(runtime).type, "None");
    assert.include(outcome.stepsSkipped, "mcp-auth/inject-yml-action");
    assert.include(outcome.stepsSkipped, "mcp-auth/persist-credential-env");
    assert.notInclude(text(files, ENV_PATH), "MCP_DA_AUTH_ID_");
  });

  it("SCN-ADD-MCP-09: entry params skip the prefilled URL and selected manifest path", async () => {
    assert.isTrue(isRecord(descriptor));
    const entry = recordProperty(descriptor, "entry");
    assert.deepStrictEqual(entry.params, ["mcpServerUrl", "teamsManifestPath"]);

    const mcpServerUrlQuestion = questionItems(questions).find(
      (question) => question.name === "mcpServerUrl"
    );
    assert.isDefined(mcpServerUrlQuestion);
    const condition = recordProperty(mcpServerUrlQuestion ?? {}, "condition");
    assert.strictEqual(condition.expr, "mcpServerUrl == null");
  });

  it("SCN-ADD-MCP-05: a same-URL re-run skips render collision and does not duplicate actions or auth", async () => {
    const first = await run({ authType: "oauth" });
    const runtime = createInMemoryRuntime();
    for (const [filePath, body] of first.files.entries()) {
      runtime.files.set(filePath, body);
    }
    const result = await scaffold(
      {
        descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: {
          mcpServerUrl: MCP_SERVER_URL,
          authType: "oauth",
        },
        callerFloor: { appName: "Existing Agent", language: "common" },
        targetDir: {
          path: "/project",
          existing: [TEAMS_MANIFEST_PATH, DA_MANIFEST_PATH, PLUGIN_PATH],
        },
      },
      runtime
    );

    const outcome = unwrapOutcome(result);
    assert.deepStrictEqual(outcome.written, []);
    assert.deepStrictEqual(
      outcome.skipped.map((item) => item.path),
      [PLUGIN_PATH]
    );
    const daManifest = readJsonObject(runtime.files, DA_MANIFEST_PATH);
    assert.lengthOf(actions(daManifest), 1);
    const yml = text(runtime.files, YML_PATH);
    assert.strictEqual(yml.match(/oauth\/register/g)?.length, 1);
    assert.strictEqual(
      text(runtime.files, ENV_PATH).match(/MCP_DA_AUTH_ID_APIGITHUBC=/g)?.length,
      1
    );
  });
});
