// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import { mcpAuthScaffoldDeps } from "../../../src/v4/mcp/mcpAuthScaffold";
import { ActionInjector } from "../../../src/component/configManager/actionInjector";
import { deriveMCPNamespaceFromUrl } from "../../../src/component/generator/declarativeAgent/helper";
import { deriveMCPManifestOAuth } from "../../../src/component/utils/mcpAuthScaffolder";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { parse } from "yaml";
import { afterEach, assert, beforeEach, vi } from "vitest";
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
 * Spec: docs/03-specs/scenarios/da/add-mcp-server.md (SCN-ADD-MCP-01..10)
 */

const MCP_SERVER_URL = "https://api.github.com/mcp";
const NAMESPACE = "apigithubc";
const PLUGIN_PATH = `appPackage/ai-plugin-${NAMESPACE}.json`;
const TEAMS_MANIFEST_PATH = "appPackage/manifest.json";
const DA_MANIFEST_PATH = "appPackage/declarativeAgent.json";
const YML_PATH = "m365agents.yml";
const LOCAL_YML_PATH = "m365agents.local.yml";
const ENV_PATH = "env/.env.dev";
const LOCAL_ENV_PATH = "env/.env.local";
const AUTH_REF = "${{MCP_DA_AUTH_ID_APIGITHUBC}}";
const AUTH_ENV_VAR = "MCP_DA_AUTH_ID_APIGITHUBC";
const BASE_YML = [
  "version: v1.12",
  "provision:",
  "  - uses: teamsApp/create",
  "    with:",
  "      name: existing",
  "    writeToEnvironmentFile:",
  "      teamsAppId: TEAMS_APP_ID",
].join("\n");

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

function apiKeyRegistration(yml: string): Record<string, unknown> {
  const parsed: unknown = parse(yml);
  assert.isTrue(isRecord(parsed));
  const provision = parsed.provision;
  assert.isTrue(isRecordArray(provision));
  const action = provision.find((item) => item.uses === "apiKey/register");
  assert.isDefined(action);
  return action ?? {};
}

interface RunOptions {
  authType?: string;
  teamsManifestPath?: string;
  apiKey?: string;
}

async function run(options: RunOptions = {}): Promise<{
  files: Map<string, Buffer>;
  secrets: Map<string, string>;
  secretsByEnvironment: Map<string, Map<string, string>>;
  outcome: Awaited<ReturnType<typeof unwrapOutcome>>;
}> {
  const authType = options.authType ?? "none";
  const teamsManifestPath = options.teamsManifestPath ?? TEAMS_MANIFEST_PATH;
  return runV4Package(templatePackage, {
    answers: {
      mcpServerUrl: MCP_SERVER_URL,
      teamsManifestPath,
      authType,
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    },
    callerFloor: { appName: "Existing Agent", language: "common" },
    existing: [
      TEAMS_MANIFEST_PATH,
      DA_MANIFEST_PATH,
      YML_PATH,
      LOCAL_YML_PATH,
      ENV_PATH,
      LOCAL_ENV_PATH,
    ],
    seedFiles: {
      [TEAMS_MANIFEST_PATH]: JSON.stringify({
        copilotAgents: {
          declarativeAgents: [{ id: "declarativeAgent", file: "declarativeAgent.json" }],
        },
      }),
      [DA_MANIFEST_PATH]: JSON.stringify({ name: "Existing Agent" }),
      [YML_PATH]: BASE_YML,
      [LOCAL_YML_PATH]: BASE_YML,
      [ENV_PATH]: "TEAMSFX_ENV=dev\n",
      [LOCAL_ENV_PATH]: "TEAMSFX_ENV=local\n",
    },
    targetPath: "/project",
  });
}

function unwrapOutcome(result: Awaited<ReturnType<typeof scaffold>>) {
  assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  return result._unsafeUnwrap();
}

describe("SCN-DA-ADD-MCP-ACTION-TO-DA (v4, T3 InMemoryRuntime)", () => {
  beforeEach(() => {
    // The oauth/oauth-dynamic auth step probes the server for metadata; stub the network so the
    // scenario stays offline and deterministic. entra-sso/none never probe.
    vi.spyOn(mcpAuthScaffoldDeps, "probeMCPServerAuth").mockResolvedValue({
      requiresAuth: true,
      authMetadataUrl: "https://auth.example.com/.well-known/oauth-protected-resource",
    });
    vi.spyOn(mcpAuthScaffoldDeps, "resolveMCPOAuthMetadata").mockResolvedValue({
      authorizationUrl: "https://auth.example.com/authorize",
      tokenUrl: "https://auth.example.com/token",
      wellKnownUrl: "https://auth.example.com/.well-known/oauth-authorization-server",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    assert.deepStrictEqual(spec, { url: MCP_SERVER_URL });
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
    assert.deepStrictEqual(entry.params, ["mcpServerUrl", "teamsManifestPath", "apiKey"]);

    const mcpServerUrlQuestion = questionItems(questions).find(
      (question) => question.name === "mcpServerUrl"
    );
    assert.isDefined(mcpServerUrlQuestion);
    const condition = recordProperty(mcpServerUrlQuestion ?? {}, "condition");
    assert.strictEqual(condition.expr, "mcpServerUrl == null");
  });

  it("SCN-ADD-MCP-13 and SCN-ADD-MCP-14: auth question accepts and describes bearer-token", () => {
    const authTypeQuestion = questionItems(questions).find(
      (question) => question.name === "authType"
    );
    assert.isDefined(authTypeQuestion);
    const staticOptions = authTypeQuestion?.staticOptions;
    assert.isTrue(isRecordArray(staticOptions));
    const bearerToken = staticOptions.find((option) => option.id === "bearer-token");
    assert.isDefined(bearerToken);
    assert.isNotEmpty(bearerToken?.detail);
    assert.isUndefined(questionItems(questions).find((question) => question.name === "apiKey"));
  });

  it("SCN-ADD-MCP-10: static auth defers credentials to provision", async () => {
    assert.isTrue(isRecord(descriptor));
    const properties = recordProperty(recordProperty(descriptor, "optionsSchema"), "properties");
    assert.notProperty(properties, "oauthClientId");
    assert.notProperty(properties, "oauthClientSecret");
    assert.notProperty(properties, "oauthScopes");
    assert.notProperty(properties, "entraClientId");

    for (const authType of ["oauth", "entra-sso"]) {
      const { files } = await run({ authType });
      const yml = text(files, YML_PATH);
      assert.include(yml, "uses: oauth/register");
      assert.notInclude(yml, "clientId:");
      assert.notInclude(yml, "clientSecret:");
      assert.notInclude(yml, "MCP_DA_OAUTH_");
      assert.notInclude(yml, "SECRET_MCP_DA_OAUTH_");
    }
  });

  it("SCN-ADD-MCP-15 and SCN-ADD-MCP-16: bearer-token uses API-key auth without OAuth data", async () => {
    const { files, outcome, secretsByEnvironment } = await run({
      authType: "bearer-token",
      apiKey: "the-bearer-token",
    });
    const plugin = readJsonObject(files, PLUGIN_PATH);
    const runtime = runtimes(plugin)[0];
    assert.equal(plugin.namespace, deriveMCPNamespaceFromUrl(MCP_SERVER_URL));
    assert.deepEqual(auth(runtime), deriveMCPManifestOAuth("bearer-token", AUTH_ENV_VAR));
    assert.include(outcome.stepsRun, "mcp-auth/inject-yml-action");
    assert.include(outcome.stepsRun, "mcp-auth/persist-credential-env");
    const yml = text(files, YML_PATH);
    assert.include(yml, "uses: apiKey/register");
    assert.include(text(files, LOCAL_YML_PATH), "uses: apiKey/register");
    assert.include(yml, `baseUrl: ${MCP_SERVER_URL}`);
    assert.notInclude(yml, "apiSpecPath:");
    assert.notInclude(yml, "oauth/register");
    assert.notInclude(yml, "dcr/register");
    assert.include(yml, "primaryClientSecret: ${{SECRET_MCP_DA_API_KEY_APIGITHUBC}}");
    assert.notInclude(yml, "the-bearer-token");
    assert.include(text(files, ENV_PATH), `${AUTH_ENV_VAR}=`);
    assert.equal(
      secretsByEnvironment.get("dev")?.get("SECRET_MCP_DA_API_KEY_APIGITHUBC"),
      "the-bearer-token"
    );
    assert.equal(
      secretsByEnvironment.get("local")?.get("SECRET_MCP_DA_API_KEY_APIGITHUBC"),
      "the-bearer-token"
    );
    assert.equal(mcpAuthScaffoldDeps.probeMCPServerAuth.mock.calls.length, 0);
    assert.equal(mcpAuthScaffoldDeps.resolveMCPOAuthMetadata.mock.calls.length, 0);
  });

  it("SCN-ADD-MCP-14: omitted optional API key preserves provision-time collection", async () => {
    const { files, secrets } = await run({ authType: "bearer-token" });

    assert.notInclude(text(files, YML_PATH), "primaryClientSecret:");
    assert.isFalse(secrets.has("SECRET_MCP_DA_API_KEY_APIGITHUBC"));
  });

  it("SCN-ADD-MCP-17: bearer-token emits an API-key action equivalent to legacy", async () => {
    const { files } = await run({ authType: "bearer-token", apiKey: "the-bearer-token" });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-add-mcp-parity-"));
    const legacyYmlPath = path.join(tempDir, "m365agents.yml");

    try {
      fs.writeFileSync(legacyYmlPath, BASE_YML, "utf8");
      await ActionInjector.injectCreateAPIKeyActionForMCP(
        legacyYmlPath,
        NAMESPACE,
        AUTH_ENV_VAR,
        MCP_SERVER_URL,
        "SECRET_MCP_DA_API_KEY_APIGITHUBC"
      );

      assert.deepEqual(
        apiKeyRegistration(text(files, YML_PATH)),
        apiKeyRegistration(fs.readFileSync(legacyYmlPath, "utf8"))
      );
    } finally {
      fs.removeSync(tempDir);
    }
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
