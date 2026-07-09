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
 * T3 scenario tier (ADR-0018): the whole `da/mcp-server` create package
 * scaffolded under `InMemoryRuntime`, asserting the vertical contract.
 *
 * Spec: docs/03-specs/scenarios/da/create-mcp-server.md (SCN-CREATE-MCP-01..14)
 *
 * Each `it("SCN-CREATE-MCP-0X")` maps 1:1 to a scenario AC row. The package's
 * real authored files are loaded from disk (the distribution chain's output
 * shape), then composed; no v3 symbol participates.
 */

const MCP_SERVER_URL = "https://api.github.com/mcp"; // namespace derives to apigithubc
const NAMESPACE = "apigithubc";
const AUTH_REF = "${{MCP_DA_AUTH_ID_APIGITHUBC}}";
const AUTH_ENV_VAR = "MCP_DA_AUTH_ID_APIGITHUBC";

const templatePackage = loadV4Package("create", "da/mcp-server");

/** A provider-style local catalog: each identity id → its stdio launch spec. */
const LOCAL_CATALOG = JSON.stringify({
  ghmcp: { command: "npx", args: ["-y", "@github/github-mcp-server"] },
  filesystem: { command: "uvx", args: ["mcp-server-filesystem", "/data"] },
});

interface RunOptions {
  authType?: string;
  existing?: string[];
  mcpServerType?: string;
  selectedLocalServers?: string[];
  localServerCatalog?: string;
}

/** Scaffold the package with the given auth type against a fresh in-memory runtime. */
async function run(
  options: RunOptions = {}
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  const answers: ScaffoldRequest["answers"] =
    options.mcpServerType === "local"
      ? {
          mcpServerType: "local",
          selectedLocalServers: options.selectedLocalServers ?? [],
          localServerCatalog: options.localServerCatalog ?? "{}",
          authType: options.authType ?? "none",
        }
      : {
          mcpServerType: "remote",
          mcpServerUrl: MCP_SERVER_URL,
          authType: options.authType ?? "none",
        };
  return runV4Package(templatePackage, {
    answers,
    callerFloor: { appName: "MyMcpAgent", language: "common" },
    existing: options.existing,
  });
}

describe("SCN-DA-CREATE-WITH-MCP-SERVER (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-MCP-01: the render phase writes the new files (authType=none, empty target)", async () => {
    const { files, outcome } = await run();
    for (const expected of [
      "appPackage/ai-plugin.json",
      "appPackage/declarativeAgent.json",
      "appPackage/manifest.json",
      "m365agents.yml",
      ".vscode/mcp.json",
      "env/.env.dev",
      "README.md",
      "evals/prompts.json",
    ]) {
      assert.include(outcome.written, expected);
    }
    // the remote MCP server is keyed by the URL-derived namespace (not an empty
    // dangling `{{ServerName}}`), typed http and pointing at the server URL.
    const mcp = readJsonObject(files, ".vscode/mcp.json");
    const servers = recordProperty(mcp, "servers");
    assert.deepStrictEqual(servers[NAMESPACE], { type: "http", url: MCP_SERVER_URL });
  });

  it("SCN-CREATE-MCP-02: ai-plugin.json namespace is URL-derived, never action_1", async () => {
    const { files } = await run();
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    assert.strictEqual(plugin.namespace, NAMESPACE);
    assert.notStrictEqual(plugin.namespace, "action_1");
  });

  it("SCN-CREATE-MCP-03: the RemoteMCPServer runtime is rendered with dynamic discovery", async () => {
    const { files } = await run();
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtime = recordArrayProperty(plugin, "runtimes")[0];
    const spec = recordProperty(runtime, "spec");
    assert.strictEqual(runtime.type, "RemoteMCPServer");
    assert.strictEqual(spec.url, MCP_SERVER_URL);
    assert.strictEqual(spec.enable_dynamic_discovery, true);
    assert.deepStrictEqual(runtime.run_for_functions, ["*"]);
  });

  it("SCN-CREATE-MCP-04: authType=none renders auth None and skips inject-yml-action", async () => {
    const { files, outcome } = await run({ authType: "none" });
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtime = recordArrayProperty(plugin, "runtimes")[0];
    const auth = recordProperty(runtime, "auth");
    assert.strictEqual(auth.type, "None");
    assert.include(outcome.stepsSkipped, "mcp-auth/inject-yml-action");
  });

  it("SCN-CREATE-MCP-05: authType=oauth renders OAuthPluginVault and injects oauth/register", async () => {
    const { files, outcome } = await run({ authType: "oauth" });
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    const runtime = recordArrayProperty(plugin, "runtimes")[0];
    const auth = recordProperty(runtime, "auth");
    assert.strictEqual(auth.type, "OAuthPluginVault");
    assert.strictEqual(auth.reference_id, AUTH_REF);
    assert.include(outcome.stepsRun, "mcp-auth/inject-yml-action");
    assert.include(text(files, "m365agents.yml"), "oauth/register");
  });

  it("SCN-CREATE-MCP-06: authType oauth/entra-sso persists MCP_DA_AUTH_ID_<NS> into env/.env.dev", async () => {
    for (const authType of ["oauth", "entra-sso"]) {
      const { files, outcome } = await run({ authType });
      assert.include(outcome.stepsRun, "mcp-auth/persist-credential-env");
      assert.include(text(files, "env/.env.dev"), `${AUTH_ENV_VAR}=`);
    }
  });

  it("SCN-CREATE-MCP-07: authType=none skips persist-credential-env and writes no MCP_DA_AUTH_ID_*", async () => {
    const { files, outcome } = await run({ authType: "none" });
    assert.include(outcome.stepsSkipped, "mcp-auth/persist-credential-env");
    assert.notInclude(text(files, "env/.env.dev"), "MCP_DA_AUTH_ID_");
  });

  it("SCN-CREATE-MCP-08: m365agents.yml renders as the v1.12 skeleton without the auth step", async () => {
    const { files } = await run({ authType: "none" });
    const yml = text(files, "m365agents.yml");
    assert.include(yml, "version: v1.12");
    assert.notInclude(yml, "oauth/register");
    assert.notInclude(yml, "microsoftEntra/register");
  });

  it("SCN-CREATE-MCP-09: a non-empty target fails require-empty-target first and writes nothing", async () => {
    const runtime = createInMemoryRuntime();
    const request: ScaffoldRequest = {
      descriptor: templatePackage.descriptor,
      pipeline: templatePackage.pipeline,
      content: templatePackage.content,
      answers: { mcpServerType: "remote", mcpServerUrl: MCP_SERVER_URL, authType: "none" },
      callerFloor: { appName: "MyMcpAgent", language: "common" },
      targetDir: { path: "/out", existing: ["appPackage/manifest.json"] },
    };
    const result = await scaffold(request, runtime);
    assert.isTrue(result.isErr());
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(runtime.files.size, 0);
  });

  it("SCN-CREATE-MCP-10: an identical re-run is deterministic (written set + namespace/reference_id)", async () => {
    const first = await run({ authType: "oauth" });
    const second = await run({ authType: "oauth" });
    assert.deepStrictEqual(first.outcome.written, second.outcome.written);
    const a = readJsonObject(first.files, "appPackage/ai-plugin.json");
    const b = readJsonObject(second.files, "appPackage/ai-plugin.json");
    const aRuntime = recordArrayProperty(a, "runtimes")[0];
    const bRuntime = recordArrayProperty(b, "runtimes")[0];
    const aAuth = recordProperty(aRuntime, "auth");
    const bAuth = recordProperty(bRuntime, "auth");
    assert.strictEqual(a.namespace, b.namespace);
    assert.strictEqual(aAuth.reference_id, bAuth.reference_id);
  });

  it("SCN-CREATE-MCP-11: a local server is materialized as a stdio entry, overwriting the remote stub", async () => {
    const { files } = await run({
      mcpServerType: "local",
      selectedLocalServers: ["ghmcp"],
      localServerCatalog: LOCAL_CATALOG,
    });
    const mcp = readJsonObject(files, ".vscode/mcp.json");
    const servers = recordProperty(mcp, "servers");
    assert.deepStrictEqual(servers.ghmcp, {
      type: "stdio",
      command: "npx",
      args: ["-y", "@github/github-mcp-server"],
    });
    // the render-phase remote stub key is gone — the step replaced the file
    assert.deepStrictEqual(Object.keys(servers), ["ghmcp"]);
  });

  it("SCN-CREATE-MCP-12: multiple selected local servers each become their own stdio entry", async () => {
    const { files } = await run({
      mcpServerType: "local",
      selectedLocalServers: ["ghmcp", "filesystem"],
      localServerCatalog: LOCAL_CATALOG,
    });
    const mcp = readJsonObject(files, ".vscode/mcp.json");
    const servers = recordProperty(mcp, "servers");
    const filesystem = recordProperty(servers, "filesystem");
    assert.deepStrictEqual(Object.keys(servers).sort(), ["filesystem", "ghmcp"]);
    assert.strictEqual(filesystem.type, "stdio");
    assert.strictEqual(filesystem.command, "uvx");
    assert.deepStrictEqual(filesystem.args, ["mcp-server-filesystem", "/data"]);
  });

  it("SCN-CREATE-MCP-13: the local branch leaves ai-plugin runtimes empty and skips the auth steps", async () => {
    const { files, outcome } = await run({
      mcpServerType: "local",
      selectedLocalServers: ["ghmcp"],
      localServerCatalog: LOCAL_CATALOG,
    });
    const plugin = readJsonObject(files, "appPackage/ai-plugin.json");
    assert.deepStrictEqual(recordArrayProperty(plugin, "runtimes"), []);
    assert.include(outcome.stepsSkipped, "mcp-auth/inject-yml-action");
    assert.include(outcome.stepsSkipped, "mcp-auth/persist-credential-env");
    assert.notInclude(text(files, "env/.env.dev"), "MCP_DA_AUTH_ID_");
  });

  it("SCN-CREATE-MCP-14: the local branch scaffolds with no mcpServerUrl answer and runs the materialize step", async () => {
    // No mcpServerUrl is answered for local; build-render-context seeds the
    // declared-but-unanswered id as the empty string (RCTX-12), so the shared
    // remote replaceMap does not crash the local scaffold before any step runs.
    const { outcome } = await run({
      mcpServerType: "local",
      selectedLocalServers: ["ghmcp"],
      localServerCatalog: LOCAL_CATALOG,
    });
    assert.include(outcome.stepsRun, "mcp-local/materialize-servers");
    assert.notInclude(outcome.stepsRun, "mcp-auth/inject-yml-action");
  });
});
