// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { UserError } from "@microsoft/teamsfx-api";
import { exportOpenPlugin } from "../../../../src/component/generator/openPlugin/exporter";
import * as validation from "../../../../src/component/generator/openPlugin/validation";
import { assert, chai, vi } from "vitest";

const ATK_EXTENSION_NAMESPACE = "com.microsoft.agents-toolkit";
const PLUGIN_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

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
    "---\nname: alpha-skill\ndescription: Alpha test skill\n---\nbody"
  );
  await fs.ensureDir(path.join(appPackage, "skills", "beta-skill"));
  await fs.writeFile(
    path.join(appPackage, "skills", "beta-skill", "SKILL.md"),
    "---\nname: beta-skill\ndescription: Beta test skill\n---\nbody"
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
    vi.restoreAllMocks();
    await fs.remove(projectDir);
    await fs.remove(outDir);
  });

  it("writes plugin.json in the plugin root with the namespaced toolkit extension", async () => {
    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    if (res.isErr()) throw new Error(res.error.message);
    // Agent Plugins 1.0.0 mandates plugin.json in the root, not .plugin/.
    chai.expect(await fs.pathExists(path.join(outDir, ".plugin", "plugin.json"))).to.equal(false);
    const plugin = (await fs.readJSON(path.join(outDir, "plugin.json"))) as Record<string, any>;
    chai.expect(plugin.$schema).to.equal(PLUGIN_SCHEMA_URL);
    chai.expect(plugin.name).to.equal("demo-plugin");
    chai.expect(plugin.version).to.equal("1.2.3");
    chai.expect(plugin.author).to.deep.equal({ name: "Jane Doe", url: "https://example.com" });
    chai.expect(plugin.homepage).to.equal("https://example.com");
    // The closed 1.0.0 schema forbids top-level x- keys.
    chai.expect(plugin["x-microsoft-365-agents-toolkit"]).to.be.undefined;
    const ext = plugin.extensions[ATK_EXTENSION_NAMESPACE];
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

  it("writes mcp.json with remote MCP servers and skips stdio connectors with a warning", async () => {
    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    if (res.isErr()) throw new Error(res.error.message);
    // 1.0.0 renamed .mcp.json to mcp.json.
    chai.expect(await fs.pathExists(path.join(outDir, ".mcp.json"))).to.equal(false);
    const mcp = (await fs.readJSON(path.join(outDir, "mcp.json"))) as Record<string, any>;
    chai.expect(mcp.$schema).to.equal(MCP_SCHEMA_URL);
    chai.expect(mcp.mcpServers.web).to.deep.equal({
      // "http" is not an Agent Plugins transport.
      type: "streamable-http",
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

  it("AP-COMMAND-02: exports only regular Markdown command files", async () => {
    await fs.writeFile(
      path.join(projectDir, "appPackage", "commands", "notes.txt"),
      "not a command"
    );
    await fs.ensureDir(path.join(projectDir, "appPackage", "commands", "bad.md"));
    await fs.writeFile(
      path.join(projectDir, "appPackage", "commands", "bad.md", "nested.txt"),
      "not a file"
    );

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    if (res.isErr()) throw new Error(res.error.message);
    chai.expect(await fs.pathExists(path.join(outDir, "commands", "deploy.md"))).to.equal(true);
    chai.expect(await fs.pathExists(path.join(outDir, "commands", "notes.txt"))).to.equal(false);
    chai.expect(await fs.pathExists(path.join(outDir, "commands", "bad.md"))).to.equal(false);
  });

  it("ignores --manifest-kind claude-plugin and warns", async () => {
    const res = await exportOpenPlugin({
      path: projectDir,
      output: outDir,
      manifestKind: "claude-plugin",
    });
    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, ".claude-plugin", "plugin.json")))
      .to.equal(false);
    chai.expect(await fs.pathExists(path.join(outDir, "plugin.json"))).to.equal(true);
    chai.expect(res.value.warnings.some((w) => w.includes("--manifest-kind"))).to.equal(true);
  });

  it("ignores --manifest-kind cursor-plugin and warns", async () => {
    const res = await exportOpenPlugin({
      path: projectDir,
      output: outDir,
      manifestKind: "cursor-plugin",
    });
    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, ".cursor-plugin", "plugin.json")))
      .to.equal(false);
    chai.expect(await fs.pathExists(path.join(outDir, "plugin.json"))).to.equal(true);
    chai.expect(res.value.warnings.some((w) => w.includes("--manifest-kind"))).to.equal(true);
  });

  it("emits a spec-conformant plugin name for a display name with spaces and punctuation", async () => {
    const appPackage = path.join(projectDir, "appPackage");
    const manifest = await fs.readJSON(path.join(appPackage, "manifest.json"));
    manifest.name = { short: "My  Fancy -- Plugin!!", full: "My Fancy Plugin" };
    await fs.writeJSON(path.join(appPackage, "manifest.json"), manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });
    if (res.isErr()) throw new Error(res.error.message);
    const plugin = (await fs.readJSON(path.join(outDir, "plugin.json"))) as Record<string, any>;
    chai.expect(plugin.name).to.equal("my-fancy-plugin");
    chai
      .expect(plugin.name)
      .to.match(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, "name must satisfy 1.0.0");
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

  it("returns a user error when the project path does not exist", async () => {
    const res = await exportOpenPlugin({
      path: path.join(projectDir, "does-not-exist"),
      output: outDir,
    });

    assert.isTrue(res.isErr());
    if (res.isErr()) chai.expect(res.error).to.be.instanceOf(UserError);
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("returns a user error when the project path is not a directory", async () => {
    const projectFile = path.join(projectDir, "project.txt");
    await fs.writeFile(projectFile, "not a project directory");

    const res = await exportOpenPlugin({ path: projectFile, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) chai.expect(res.error).to.be.instanceOf(UserError);
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("AP-PATH-09: rejects an appPackage junction that escapes the project root", async () => {
    const project = await tmp("op-export-junction-project-");
    const outside = await tmp("op-export-junction-outside-");
    try {
      await fs.writeJSON(path.join(outside, "manifest.json"), {
        version: "1.0.0",
        name: { short: "outside" },
        description: { short: "outside", full: "outside" },
      });
      await fs.ensureSymlink(
        outside,
        path.join(project, "appPackage"),
        process.platform === "win32" ? "junction" : "dir"
      );

      const res = await exportOpenPlugin({ path: project, output: outDir });

      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "InvalidProjectStructure");
      chai.expect(await fs.pathExists(outDir)).to.equal(false);
    } finally {
      await fs.remove(project);
      await fs.remove(outside);
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

  it("AP-EXPORT-01: rejects a remote MCP URL that Agent Plugins 1.0.0 forbids", async () => {
    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentConnectors[0].toolSource.remoteMcpServer.mcpServerUrl =
      "http://nonloopback.example.com/mcp#fragment";
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidMcpServerUrl");
  });

  it("rejects an empty remote MCP URL before writing output", async () => {
    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentConnectors[0].toolSource.remoteMcpServer.mcpServerUrl = "";
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidMcpServerUrl");
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("AP-EXPORT-02: rejects generated plugin metadata with an invalid JSON type", async () => {
    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.version = 42;
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidAgentPluginManifest");
  });

  it("returns a system error for an unexpected plugin manifest parser failure", async () => {
    vi.spyOn(validation, "parseAgentPluginManifest").mockImplementation(() => {
      throw new Error("unexpected parser failure");
    });

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "ExportOpenPluginFailed");
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("AP-EXPORT-03: rejects malformed consumed source fields before writing output", async () => {
    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentSkills = { folder: "./skills/alpha-skill" };
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidManifest");
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it.each([
    ["websiteUrl", "not-a-url"],
    ["websiteUrl", ""],
    ["privacyUrl", "ftp://example.com/privacy"],
    ["termsOfUseUrl", "file:///terms"],
  ])("rejects an invalid developer %s before writing output", async (field, invalidValue) => {
    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.developer[field] = invalidValue;
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidManifest");
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("AP-EXPORT-04: rejects duplicate connector IDs before writing output", async () => {
    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentConnectors.push({
      id: "web",
      toolSource: {
        remoteMcpServer: {
          mcpServerUrl: "https://other.example.com/mcp",
          authorization: { type: "None" },
        },
      },
    });
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidManifest");
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("AP-EXPORT-05: rejects case-insensitive skill destination collisions before writing output", async () => {
    const appPackageDir = path.join(projectDir, "appPackage");
    const manifestPath = path.join(appPackageDir, "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentSkills.push({ folder: "./alternate/ALPHA-SKILL" });
    await fs.ensureDir(path.join(appPackageDir, "alternate", "ALPHA-SKILL"));
    await fs.writeFile(
      path.join(appPackageDir, "alternate", "ALPHA-SKILL", "SKILL.md"),
      "---\nname: alpha-skill\ndescription: Colliding test skill\n---\nbody"
    );
    await fs.writeJSON(manifestPath, manifest);

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    assert.isTrue(res.isErr());
    if (res.isErr()) assert.equal(res.error.name, "InvalidManifest");
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("AP-SKILL-02: skips an invalid Agent Skill during export", async () => {
    await fs.writeFile(
      path.join(projectDir, "appPackage", "skills", "alpha-skill", "SKILL.md"),
      "---\nname: wrong-name\n---\nbody"
    );

    const res = await exportOpenPlugin({ path: projectDir, output: outDir });

    if (res.isErr()) throw new Error(res.error.message);
    chai.expect(await fs.pathExists(path.join(outDir, "skills", "alpha-skill"))).to.equal(false);
    chai
      .expect(res.value.warnings.some((warning) => warning.includes("alpha-skill")))
      .to.equal(true);
  });

  it("AP-PATH-06: skips nested command junctions that escape appPackage", async () => {
    const outside = await tmp("op-export-outside-command-");
    try {
      await fs.writeFile(path.join(outside, "secret.md"), "outside");
      await fs.ensureSymlink(
        outside,
        path.join(projectDir, "appPackage", "commands", "external"),
        process.platform === "win32" ? "junction" : "dir"
      );

      const res = await exportOpenPlugin({ path: projectDir, output: outDir });

      if (res.isErr()) throw new Error(res.error.message);
      chai
        .expect(await fs.pathExists(path.join(outDir, "commands", "external", "secret.md")))
        .to.equal(false);
      chai.expect(res.value.warnings.some((warning) => warning.includes("outside"))).to.equal(true);
    } finally {
      await fs.remove(outside);
    }
  });

  it("AP-PATH-07: skips an icon junction that escapes appPackage", async () => {
    const outside = await tmp("op-export-outside-icon-");
    try {
      await fs.remove(path.join(projectDir, "appPackage", "color.png"));
      await fs.writeFile(path.join(outside, "secret.png"), "outside");
      await fs.ensureSymlink(
        outside,
        path.join(projectDir, "appPackage", "color.png"),
        process.platform === "win32" ? "junction" : "dir"
      );

      const res = await exportOpenPlugin({ path: projectDir, output: outDir });

      if (res.isErr()) throw new Error(res.error.message);
      chai.expect(await fs.pathExists(path.join(outDir, "color.png"))).to.equal(false);
      chai
        .expect(res.value.warnings.some((warning) => warning.includes("color.png")))
        .to.equal(true);
    } finally {
      await fs.remove(outside);
    }
  });
});
