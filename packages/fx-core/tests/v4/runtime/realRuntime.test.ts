// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { UserError } from "@microsoft/teamsfx-api";
import { TemplateFileEntry } from "../../../src/v4/model/dataModel";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createRealRuntime } from "../../../src/v4/runtime/realRuntime";
import { ScaffoldRequest, scaffold } from "../../../src/v4/runtime/scaffold";
import { assert } from "vitest";

/**
 * The on-disk `ScaffoldRuntime` face (ADR-0018): the same `da/mcp-server` create
 * package the T3 in-memory scenario scaffolds, but materialized onto a real
 * temp directory through `createRealRuntime`. This proves the production seam —
 * the render phase writes real bytes, a read-modify-write step reads them back
 * from disk, `.tpl` suffixes are stripped into real filenames, and the
 * create-empty contract guards a real non-empty directory.
 *
 * Spec: docs/03-specs/scenarios/da/create-mcp-server.md (the SCN-CREATE-MCP-*
 * contract, here re-validated against a real filesystem sink).
 *
 * v4-owned (INV-7): no v3 symbol participates.
 */

const PKG_DIR = path.resolve(__dirname, "../../../../../templates/v4/create/da/mcp-server");

const MCP_SERVER_URL = "https://api.github.com/mcp"; // namespace derives to apigithubc
const NAMESPACE = "apigithubc";
const AUTH_ENV_VAR = "MCP_DA_AUTH_ID_APIGITHUBC";

const descriptor: unknown = JSON.parse(
  fs.readFileSync(path.join(PKG_DIR, "descriptor.json"), "utf8")
);
const pipeline: unknown = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "pipeline.json"), "utf8"));

/** Load the package's `content/**` as the opened-entry list (forward-slash paths, raw bytes). */
function loadContent(): TemplateFileEntry[] {
  const root = path.join(PKG_DIR, "content");
  const entries: TemplateFileEntry[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else {
        entries.push({
          path: path.relative(root, full).replace(/\\/g, "/"),
          data: fs.readFileSync(full),
        });
      }
    }
  };
  walk(root);
  return entries;
}

const content = loadContent();

interface RunOptions {
  authType?: string;
  existing?: string[];
}

/** Build one scaffold request rooted at `dir` (the on-disk runtime's output root). */
function makeRequest(dir: string, options: RunOptions = {}): ScaffoldRequest {
  return {
    descriptor,
    pipeline,
    content,
    answers: {
      mcpServerType: "remote",
      mcpServerUrl: MCP_SERVER_URL,
      authType: options.authType ?? "none",
    },
    callerFloor: { appName: "MyMcpAgent", language: "common" },
    targetDir: { path: dir, existing: options.existing ?? [] },
  };
}

describe("createRealRuntime (v4, on-disk ScaffoldRuntime)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-v4-mcp-"));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  /** Scaffold the package into `tempDir` against a fresh on-disk runtime. */
  async function run(options: RunOptions = {}) {
    const runtime = createRealRuntime(tempDir);
    return scaffold(makeRequest(tempDir, options), runtime);
  }

  function diskPath(rel: string): string {
    return path.join(tempDir, rel);
  }
  function diskExists(rel: string): boolean {
    return fs.existsSync(diskPath(rel));
  }
  function diskText(rel: string): string {
    return fs.readFileSync(diskPath(rel), "utf8");
  }

  it("ON-DISK-01: materializes the package onto a real directory, `.tpl` stripped", async () => {
    const result = await run();
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    for (const rel of [
      "appPackage/ai-plugin.json",
      "appPackage/declarativeAgent.json",
      "appPackage/manifest.json",
      "appPackage/color.png",
      "appPackage/outline.png",
      "appPackage/instruction.txt",
      "m365agents.yml",
      ".vscode/mcp.json",
      ".vscode/extensions.json",
      "env/.env.dev",
      ".gitignore",
      "README.md",
    ]) {
      assert.isTrue(diskExists(rel), `expected '${rel}' on disk`);
    }

    // The render phase strips the `.tpl` suffix — no template artifacts remain.
    assert.isFalse(diskExists("m365agents.yml.tpl"), "m365agents.yml.tpl must not remain");
    assert.isFalse(
      diskExists("appPackage/ai-plugin.json.tpl"),
      "ai-plugin.json.tpl must not remain"
    );
    assert.isFalse(diskExists(".gitignore.tpl"), ".gitignore.tpl must not remain");

    // The rendered bytes on disk are valid JSON with the derived namespace.
    const aiPlugin: { namespace?: string } = JSON.parse(diskText("appPackage/ai-plugin.json"));
    assert.strictEqual(aiPlugin.namespace, NAMESPACE);
  });

  it("ON-DISK-02: an oauth run injects oauth/register and persists the env var on disk", async () => {
    const result = await run({ authType: "oauth" });
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    // The inject step read the rendered yml back from disk, mutated it, rewrote it.
    const yml = diskText("m365agents.yml");
    assert.include(yml, "uses: oauth/register");
    assert.include(yml, `name: ${NAMESPACE}`);

    // The persist step appended the credential var into the rendered env file.
    assert.include(diskText("env/.env.dev"), `${AUTH_ENV_VAR}=`);
  });

  it("ON-DISK-03: an entra-sso run injects microsoftEntra/register and persists the env var", async () => {
    const result = await run({ authType: "entra-sso" });
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    assert.include(diskText("m365agents.yml"), "uses: microsoftEntra/register");
    assert.include(diskText("env/.env.dev"), `${AUTH_ENV_VAR}=`);
  });

  it("ON-DISK-04: a none run writes no auth action and no credential var", async () => {
    const result = await run();
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    const yml = diskText("m365agents.yml");
    assert.notInclude(yml, "oauth/register");
    assert.notInclude(yml, "microsoftEntra/register");
    assert.notInclude(diskText("env/.env.dev"), AUTH_ENV_VAR);
  });

  it("ON-DISK-05: a non-empty target fails the create contract and writes nothing", async () => {
    fs.writeFileSync(path.join(tempDir, "existing.txt"), "keep me");

    const result = await run({ existing: ["existing.txt"] });

    assert.isTrue(result.isErr(), "expected the create-empty contract to fail");
    const error = result.isErr() ? result.error : undefined;
    assert.instanceOf(error, UserError);
    assert.strictEqual(error?.name, REQUIRE_EMPTY_TARGET);

    // The render phase never ran: none of our files landed, the pre-existing file is untouched.
    assert.isFalse(diskExists("appPackage/ai-plugin.json"));
    assert.isFalse(diskExists("m365agents.yml"));
    assert.strictEqual(diskText("existing.txt"), "keep me");
  });

  it("ON-DISK-06: re-running into a fresh directory is byte-identical (deterministic)", async () => {
    const first = await run();
    assert.isTrue(first.isOk(), first.isErr() ? first.error.message : "expected ok");
    const firstBytes = fs.readFileSync(diskPath("appPackage/ai-plugin.json"));

    const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-v4-mcp2-"));
    try {
      const second = await scaffold(makeRequest(secondDir), createRealRuntime(secondDir));
      assert.isTrue(second.isOk(), second.isErr() ? second.error.message : "expected ok");
      const secondBytes = fs.readFileSync(path.join(secondDir, "appPackage/ai-plugin.json"));
      assert.isTrue(
        firstBytes.equals(secondBytes),
        "ai-plugin.json must be byte-identical across runs"
      );
    } finally {
      fs.removeSync(secondDir);
    }
  });
});
