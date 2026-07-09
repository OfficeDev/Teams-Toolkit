// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { SystemError } from "@microsoft/teamsfx-api";
import { loadPackageDir } from "../../../src/v4/distribution/packageDir";
import { scaffoldFromPackageDir } from "../../../src/v4/runtime/scaffoldFromPackageDir";
import { assert } from "vitest";

/**
 * The product front-door for the on-disk declarative path: load a template
 * package straight from its authored directory (descriptor.json + pipeline.json
 * + content/**), then scaffold it onto a real output directory through the
 * on-disk runtime — the same end-to-end the T3 scenario proves in memory, but
 * driven entirely by product code (no test-side request assembly).
 *
 * `loadPackageDir` is the on-disk sibling of `openTemplatePackage` (which opens
 * v3-shaped zip bytes); `scaffoldFromPackageDir` is the one call a surface or
 * the v3 bridge makes to run a declarative create. Welding that call into the
 * live distribution chain (so the bundled declarative package reaches it) is the
 * follow-on, blocked on distributing the declarative format.
 *
 * Spec: docs/03-specs/scenarios/da/create-mcp-server.md (re-validated through
 * the product front-door).
 *
 * v4-owned (INV-7): no v3 symbol participates.
 */

const PKG_DIR = path.resolve(__dirname, "../../../../../templates/v4/create/da/mcp-server");

const NAMESPACE = "apigithubc";
const AUTH_ENV_VAR = "MCP_DA_AUTH_ID_APIGITHUBC";

const ANSWERS_NONE = {
  mcpServerType: "remote",
  mcpServerUrl: "https://api.github.com/mcp",
  authType: "none",
};
const FLOOR = { appName: "MyMcpAgent", language: "common" };

describe("scaffoldFromPackageDir (v4 product front-door)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-v4-front-"));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  function diskText(rel: string): string {
    return fs.readFileSync(path.join(tempDir, rel), "utf8");
  }
  function diskExists(rel: string): boolean {
    return fs.existsSync(path.join(tempDir, rel));
  }

  it("ORCH-01: loads the authored package dir and scaffolds it onto disk", async () => {
    const result = await scaffoldFromPackageDir(PKG_DIR, ANSWERS_NONE, FLOOR, {
      path: tempDir,
      existing: [],
    });
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    assert.isTrue(diskExists("appPackage/ai-plugin.json"), "ai-plugin.json on disk");
    assert.isTrue(diskExists("m365agents.yml"), "m365agents.yml on disk");
    assert.isFalse(diskExists("m365agents.yml.tpl"), ".tpl must be stripped");

    const aiPlugin: { namespace?: string } = JSON.parse(diskText("appPackage/ai-plugin.json"));
    assert.strictEqual(aiPlugin.namespace, NAMESPACE);
  });

  it("ORCH-02: flows answers through so an oauth run injects auth on disk", async () => {
    const result = await scaffoldFromPackageDir(
      PKG_DIR,
      { ...ANSWERS_NONE, authType: "oauth" },
      FLOOR,
      { path: tempDir, existing: [] }
    );
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    assert.include(diskText("m365agents.yml"), "uses: oauth/register");
    assert.include(diskText("env/.env.dev"), `${AUTH_ENV_VAR}=`);
  });

  it("ORCH-03: loadPackageDir surfaces a missing descriptor as a SystemError", () => {
    const result = loadPackageDir(tempDir); // empty dir — no descriptor.json
    assert.isTrue(result.isErr(), "expected an error for a package with no descriptor");
    const error = result.isErr() ? result.error : undefined;
    assert.instanceOf(error, SystemError);
    assert.strictEqual(error?.name, "PackageFileMissing");
  });

  it("ORCH-04: loadPackageDir surfaces malformed descriptor JSON as a SystemError", () => {
    fs.writeFileSync(path.join(tempDir, "descriptor.json"), "{ not valid json");
    const result = loadPackageDir(tempDir);
    assert.isTrue(result.isErr(), "expected an error for malformed descriptor JSON");
    const error = result.isErr() ? result.error : undefined;
    assert.instanceOf(error, SystemError);
    assert.strictEqual(error?.name, "PackageFileInvalid");
  });

  it("ORCH-05: loadPackageDir treats a missing content directory as pipeline-only content", () => {
    fs.writeFileSync(path.join(tempDir, "descriptor.json"), "{}");
    fs.writeFileSync(path.join(tempDir, "pipeline.json"), "{}");
    const result = loadPackageDir(tempDir); // descriptor + pipeline ok, no content/
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.deepEqual(result._unsafeUnwrap().content, []);
  });

  it("ORCH-06: loadPackageDir returns the parsed descriptor/pipeline and raw content entries", () => {
    const result = loadPackageDir(PKG_DIR);
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const loaded = result.isOk() ? result.value : undefined;
    assert.isObject(loaded?.descriptor);
    assert.isObject(loaded?.pipeline);
    assert.isAbove(loaded?.content.length ?? 0, 0);
    // Content is raw — the `.tpl` suffix is intact (the render phase strips it).
    const paths = (loaded?.content ?? []).map((entry) => entry.path);
    assert.include(paths, "appPackage/ai-plugin.json.tpl");
  });

  it("ORCH-07: scaffold exceptions are returned as SystemError results", async () => {
    const packageDir = path.join(tempDir, "package");
    fs.ensureDirSync(path.join(packageDir, "content"));
    fs.writeFileSync(path.join(packageDir, "descriptor.json"), "{}");
    fs.writeFileSync(
      path.join(packageDir, "pipeline.json"),
      JSON.stringify({
        pipeline: "default",
        steps: [
          {
            step: "mcp-local/materialize-servers",
            with: {
              target: "../outside.txt",
              selected: "{{selectedLocalServers}}",
              catalog: "{{localServerCatalog}}",
            },
          },
        ],
      })
    );

    const result = await scaffoldFromPackageDir(
      packageDir,
      {
        selectedLocalServers: ["local"],
        localServerCatalog: JSON.stringify({ local: { command: "node", args: [] } }),
      },
      FLOOR,
      {
        path: tempDir,
        existing: [],
      }
    );

    assert.isTrue(result.isErr(), "expected scaffold exception to be captured");
    const error = result.isErr() ? result.error : undefined;
    assert.instanceOf(error, SystemError);
    assert.strictEqual(error?.name, "ScaffoldPathEscape");
  });

  it("ORCH-08: applies declared render filters when their feature flag predicate is active", async () => {
    const packageDir = path.join(tempDir, "package");
    const outputDir = path.join(tempDir, "output");
    fs.ensureDirSync(path.join(packageDir, "content", "env"));
    fs.writeFileSync(path.join(packageDir, "descriptor.json"), JSON.stringify({ replaceMap: [] }));
    fs.writeFileSync(
      path.join(packageDir, "pipeline.json"),
      JSON.stringify({
        pipeline: "default",
        render: {
          filters: [
            {
              when: "!featureFlag('TEST_SANDBOX')",
              exclude: [
                "m365agents.sandbox.yml",
                "teamsapp.sandbox.yml",
                "env/.env.sandbox",
                "env/.env.sandbox.user",
              ],
            },
          ],
        },
        steps: [],
      })
    );
    fs.writeFileSync(path.join(packageDir, "content", "keep.txt"), "keep");
    fs.writeFileSync(path.join(packageDir, "content", "m365agents.sandbox.yml.tpl"), "sandbox yml");
    fs.writeFileSync(path.join(packageDir, "content", "teamsapp.sandbox.yml.tpl"), "sandbox yml");
    fs.writeFileSync(path.join(packageDir, "content", "env", ".env.sandbox"), "sandbox");
    fs.writeFileSync(path.join(packageDir, "content", "env", ".env.sandbox.user.tpl"), "user");

    const result = await scaffoldFromPackageDir(
      packageDir,
      {},
      FLOOR,
      { path: outputDir, existing: [] },
      () => false
    );
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    assert.isTrue(fs.existsSync(path.join(outputDir, "keep.txt")), "ordinary content on disk");
    assert.isFalse(fs.existsSync(path.join(outputDir, "m365agents.sandbox.yml")));
    assert.isFalse(fs.existsSync(path.join(outputDir, "teamsapp.sandbox.yml")));
    assert.isFalse(fs.existsSync(path.join(outputDir, "env", ".env.sandbox")));
    assert.isFalse(fs.existsSync(path.join(outputDir, "env", ".env.sandbox.user")));
  });

  it("ORCH-09: ignores declared render filters when their feature flag predicate is inactive", async () => {
    const packageDir = path.join(tempDir, "package");
    const outputDir = path.join(tempDir, "output");
    fs.ensureDirSync(path.join(packageDir, "content", "env"));
    fs.writeFileSync(path.join(packageDir, "descriptor.json"), JSON.stringify({ replaceMap: [] }));
    fs.writeFileSync(
      path.join(packageDir, "pipeline.json"),
      JSON.stringify({
        pipeline: "default",
        render: {
          filters: [
            {
              when: "!featureFlag('TEST_SANDBOX')",
              exclude: [
                "m365agents.sandbox.yml",
                "teamsapp.sandbox.yml",
                "env/.env.sandbox",
                "env/.env.sandbox.user",
              ],
            },
          ],
        },
        steps: [],
      })
    );
    fs.writeFileSync(path.join(packageDir, "content", "keep.txt"), "keep");
    fs.writeFileSync(path.join(packageDir, "content", "m365agents.sandbox.yml.tpl"), "sandbox yml");
    fs.writeFileSync(path.join(packageDir, "content", "teamsapp.sandbox.yml.tpl"), "sandbox yml");
    fs.writeFileSync(path.join(packageDir, "content", "env", ".env.sandbox"), "sandbox");
    fs.writeFileSync(path.join(packageDir, "content", "env", ".env.sandbox.user.tpl"), "user");

    const result = await scaffoldFromPackageDir(
      packageDir,
      {},
      FLOOR,
      { path: outputDir, existing: [] },
      () => true
    );
    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");

    assert.isTrue(fs.existsSync(path.join(outputDir, "keep.txt")), "ordinary content on disk");
    assert.isTrue(fs.existsSync(path.join(outputDir, "m365agents.sandbox.yml")));
    assert.isTrue(fs.existsSync(path.join(outputDir, "teamsapp.sandbox.yml")));
    assert.isTrue(fs.existsSync(path.join(outputDir, "env", ".env.sandbox")));
    assert.isTrue(fs.existsSync(path.join(outputDir, "env", ".env.sandbox.user")));
  });
});
