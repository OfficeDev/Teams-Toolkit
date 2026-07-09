// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { exportOpenPlugin } from "../../../../src/component/generator/openPlugin/exporter";
import { assert, chai } from "vitest";

const ATK_EXTENSION_KEY = "x-microsoft-365-agents-toolkit";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedAtkProject(root: string): Promise<void> {
  const appPackage = path.join(root, "appPackage");
  await fs.ensureDir(appPackage);
  await fs.writeJSON(path.join(appPackage, "manifest.json"), {
    $schema:
      "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
    manifestVersion: "devPreview",
    version: "1.2.3",
    id: "12345678-1234-1234-1234-123456789abc",
    packageName: "com.example.demo-plugin",
    accentColor: "#4A90D9",
    developer: {
      name: "Jane Doe",
      websiteUrl: "https://example.com",
      privacyUrl: "https://example.com/privacy",
      termsOfUseUrl: "https://example.com/terms",
    },
    name: { short: "demo-plugin", full: "Demo Plugin" },
    description: { short: "short desc", full: "a longer description" },
    icons: { color: "color.png", outline: "outline.png" },
    agentSkills: [{ folder: "./skills/alpha-skill" }, { folder: "./skills/beta-skill" }],
    agentConnectors: [
      {
        id: "web",
        displayName: "web MCP Server",
        description: "remote mcp",
        toolSource: {
          remoteMcpServer: {
            mcpServerUrl: "https://web.example.com/api",
            authorization: { type: "OAuthPluginVault", referenceId: "demo-plugin/web" },
          },
        },
      },
      {
        id: "stdioOnly",
        toolSource: {},
      },
    ],
  });
  await fs.ensureDir(path.join(appPackage, "skills", "alpha-skill"));
  await fs.writeFile(
    path.join(appPackage, "skills", "alpha-skill", "SKILL.md"),
    "---\nname: alpha-skill\n---\nbody"
  );
  await fs.ensureDir(path.join(appPackage, "skills", "beta-skill"));
  await fs.writeFile(
    path.join(appPackage, "skills", "beta-skill", "SKILL.md"),
    "---\nname: beta-skill\n---\nbody"
  );
  await fs.ensureDir(path.join(appPackage, "commands"));
  await fs.writeFile(path.join(appPackage, "commands", "deploy.md"), "# deploy");
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  await fs.writeFile(path.join(appPackage, "color.png"), png);
  await fs.writeFile(path.join(appPackage, "outline.png"), png);
}

describe("openPlugin.exportOpenPlugin", () => {
  let projectDir: string;
  let outDir: string;

  beforeEach(async () => {
    projectDir = await tmp("op-export-proj-");
    outDir = await tmp("op-export-out-");
    await fs.remove(outDir);
    await seedAtkProject(projectDir);
  });

  afterEach(async () => {
    await fs.remove(projectDir);
    await fs.remove(outDir);
  });

  it("writes plugin.json with the x-microsoft-365-agents-toolkit extension", async () => {
    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    if (res.isErr()) throw new Error(res.error.message);
    const plugin = (await fs.readJSON(path.join(outDir, ".plugin", "plugin.json"))) as Record<
      string,
      any
    >;
    chai.expect(plugin.name).to.equal("demo-plugin");
    chai.expect(plugin.version).to.equal("1.2.3");
    chai.expect(plugin.author).to.deep.equal({ name: "Jane Doe", url: "https://example.com" });
    chai.expect(plugin.homepage).to.equal("https://example.com");
    const ext = plugin[ATK_EXTENSION_KEY];
    chai.expect(ext).to.exist;
    chai.expect(ext.manifestVersion).to.equal("devPreview");
    chai.expect(ext.id).to.equal("12345678-1234-1234-1234-123456789abc");
    chai.expect(ext.packageName).to.equal("com.example.demo-plugin");
    chai.expect(ext.accentColor).to.equal("#4A90D9");
    chai.expect(ext.developer.privacyUrl).to.equal("https://example.com/privacy");
    chai.expect(ext.developer.termsOfUseUrl).to.equal("https://example.com/terms");
    chai.expect(ext.name.full).to.equal("Demo Plugin");
    chai.expect(ext.description.full).to.equal("a longer description");
    chai.expect(ext.agentConnectors.web.authorization).to.deep.equal({
      type: "OAuthPluginVault",
      referenceId: "demo-plugin/web",
    });
  });

  it("writes .mcp.json with remote MCP servers and skips stdio connectors with a warning", async () => {
    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    if (res.isErr()) throw new Error(res.error.message);
    const mcp = (await fs.readJSON(path.join(outDir, ".mcp.json"))) as Record<string, any>;
    chai.expect(mcp.mcpServers.web).to.deep.equal({
      type: "http",
      url: "https://web.example.com/api",
    });
    chai.expect(mcp.mcpServers.stdioOnly).to.be.undefined;
    chai.expect(res.value.warnings.some((w) => w.includes("stdioOnly"))).to.equal(true);
  });

  it("copies skill folders, commands, and icons", async () => {
    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    if (res.isErr()) throw new Error(res.error.message);
    for (const rel of [
      "skills/alpha-skill/SKILL.md",
      "skills/beta-skill/SKILL.md",
      "commands/deploy.md",
      "color.png",
      "outline.png",
    ]) {
      chai.expect(await fs.pathExists(path.join(outDir, rel)), `missing ${rel}`).to.equal(true);
    }
  });

  it("supports --manifest-kind claude-plugin", async () => {
    const res = await exportOpenPlugin({
      path: projectDir,
      output: outDir,
      manifestKind: "claude-plugin",
    });
    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, ".claude-plugin", "plugin.json")))
      .to.equal(true);
    chai.expect(await fs.pathExists(path.join(outDir, ".plugin", "plugin.json"))).to.equal(false);
  });

  it("supports --manifest-kind cursor-plugin", async () => {
    const res = await exportOpenPlugin({
      path: projectDir,
      output: outDir,
      manifestKind: "cursor-plugin",
    });
    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, ".cursor-plugin", "plugin.json")))
      .to.equal(true);
  });

  it("returns ManifestNotFound when appPackage/manifest.json is missing", async () => {
    const empty = await tmp("op-export-empty-");
    try {
      const res = await exportOpenPlugin({ path: empty, output: outDir });
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "ManifestNotFound");
    } finally {
      await fs.remove(empty);
    }
  });

  it("refuses to write into a non-empty output directory", async () => {
    await fs.ensureDir(outDir);
    await fs.writeFile(path.join(outDir, "preexisting.txt"), "hi");
    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "OutputDirectoryNotEmpty");
  });

  it("returns MissingProjectPath when --path is absent", async () => {
    const res = await exportOpenPlugin({ path: "", output: outDir });
    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "MissingProjectPath");
  });
});
