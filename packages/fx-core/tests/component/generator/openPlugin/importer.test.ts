// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { setTools } from "../../../../src/common/globalVars";
import { Generator } from "../../../../src/component/generator/generator";
import { importOpenPlugin } from "../../../../src/component/generator/openPlugin/importer";
import { MockTools } from "../../../core/utils";
import { scaffoldOpenPluginTemplateFromSource } from "./testTemplateScaffold";
import { chai, vi } from "vitest";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedSamplePlugin(root: string, manifestRel = ".plugin/plugin.json"): Promise<void> {
  await fs.ensureDir(path.join(root, path.dirname(manifestRel)));
  await fs.writeJSON(path.join(root, manifestRel), {
    name: "demo-plugin",
    version: "1.2.3",
    description: "A demo Open Plugin used by converter tests.",
    author: { name: "Jane Doe", email: "jane@example.com", url: "https://example.com" },
    homepage: "https://example.com",
  });
  await fs.writeJSON(path.join(root, ".mcp.json"), {
    mcpServers: {
      web: { url: "https://web.example.com/api", description: "web tools" },
      stdioOnly: { command: "node", args: ["server.js"] },
    },
  });
  await fs.ensureDir(path.join(root, "skills", "alpha-skill"));
  await fs.writeFile(
    path.join(root, "skills", "alpha-skill", "SKILL.md"),
    "---\nname: alpha-skill\ndescription: hi\n---\nbody"
  );
  await fs.ensureDir(path.join(root, "skills", "beta-skill"));
  await fs.writeFile(
    path.join(root, "skills", "beta-skill", "SKILL.md"),
    "---\nname: beta-skill\ndescription: hi\n---\nbody"
  );
  await fs.ensureDir(path.join(root, "commands"));
  await fs.writeFile(path.join(root, "commands", "deploy.md"), "# deploy");
}

describe("openPlugin.importOpenPlugin", () => {
  setTools(new MockTools());
  let pluginDir: string;
  let outDir: string;
  const sandbox = vi;

  beforeEach(async () => {
    pluginDir = await tmp("op-conv-plugin-");
    outDir = await tmp("op-conv-out-");
    await fs.remove(outDir); // must be absent for the success path
    await seedSamplePlugin(pluginDir);
    vi.spyOn(Generator, "generateTemplate").mockImplementation(async (ctx, dest) => {
      const appName = ctx.templateVariables?.appName ?? "";
      await scaffoldOpenPluginTemplateFromSource(dest, { appName });
      return ok(undefined);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(pluginDir);
    await fs.remove(outDir);
  });

  it("scaffolds the expected project tree", async () => {
    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (res.isErr()) {
      throw new Error(`importOpenPlugin failed: ${res.error.message}`);
    }
    chai.expect(res.value.projectPath).to.equal(path.resolve(outDir));

    const expected = [
      "appPackage/manifest.json",
      "appPackage/color.png",
      "appPackage/outline.png",
      "appPackage/skills/alpha-skill/SKILL.md",
      "appPackage/skills/beta-skill/SKILL.md",
      "appPackage/commands/deploy.md",
      ".gitignore",
      ".vscode/launch.json",
      ".vscode/settings.json",
      ".vscode/extensions.json",
      "env/.env.dev",
      "m365agents.yml",
      "README.md",
    ];
    for (const rel of expected) {
      chai.expect(await fs.pathExists(path.join(outDir, rel)), `missing ${rel}`).to.equal(true);
    }
  });

  it("emits the expected agentSkills and agentConnectors in manifest.json", async () => {
    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (res.isErr()) {
      throw new Error(res.error.message);
    }
    const manifest = (await fs.readJSON(
      path.join(outDir, "appPackage", "manifest.json")
    )) as Record<string, any>;
    chai
      .expect(manifest.agentSkills)
      .to.deep.equal([{ folder: "./skills/alpha-skill" }, { folder: "./skills/beta-skill" }]);
    chai.expect(manifest.agentConnectors).to.have.length(1);
    chai.expect(manifest.agentConnectors[0]).to.include({
      id: "web",
      displayName: "web MCP Server",
    });
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.mcpServerUrl)
      .to.equal("https://web.example.com/api");
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization.type)
      .to.equal("OAuthPluginVault");
  });

  it("surfaces a warning for stdio MCP servers", async () => {
    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (res.isErr()) throw new Error(res.error.message);
    chai.expect(res.value.warnings.some((w) => w.includes("stdioOnly"))).to.equal(true);
  });

  it("produces byte-identical manifests across the three manifest path locations", async () => {
    // Run once with .plugin/, capture manifest.
    const firstRes = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (firstRes.isErr()) throw new Error(firstRes.error.message);
    const firstManifest = await fs.readFile(
      path.join(outDir, "appPackage", "manifest.json"),
      "utf8"
    );

    // Now seed a .claude-plugin/ variant and re-run.
    const claudeDir = await tmp("op-conv-plugin-claude-");
    const claudeOut = await tmp("op-conv-out-claude-");
    await fs.remove(claudeOut);
    await seedSamplePlugin(claudeDir, ".claude-plugin/plugin.json");
    try {
      const secondRes = await importOpenPlugin({
        path: claudeDir,
        output: claudeOut,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });
      if (secondRes.isErr()) throw new Error(secondRes.error.message);
      const secondManifest = await fs.readFile(
        path.join(claudeOut, "appPackage", "manifest.json"),
        "utf8"
      );
      chai.expect(secondManifest).to.equal(firstManifest);
    } finally {
      await fs.remove(claudeDir);
      await fs.remove(claudeOut);
    }
  });

  it("refuses to write into a non-empty output directory", async () => {
    await fs.ensureDir(outDir);
    await fs.writeFile(path.join(outDir, "preexisting.txt"), "hi");
    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) {
      chai.expect(res.error.name).to.equal("OutputDirectoryNotEmpty");
    }
  });

  it("returns an error when --path does not exist", async () => {
    const res = await importOpenPlugin({
      path: path.join(pluginDir, "does-not-exist"),
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    chai.expect(res.isErr()).to.equal(true);
  });

  it("returns MissingPluginPath when path is empty", async () => {
    const res = await importOpenPlugin({
      path: "",
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) {
      chai.expect(res.error.name).to.equal("MissingPluginPath");
    }
  });

  it("generates valid PNG icons by default", async () => {
    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (res.isErr()) throw new Error(res.error.message);
    const colorBuf = await fs.readFile(path.join(outDir, "appPackage", "color.png"));
    chai
      .expect(
        colorBuf
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      )
      .to.equal(true);
    const outlineBuf = await fs.readFile(path.join(outDir, "appPackage", "outline.png"));
    chai
      .expect(
        outlineBuf
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      )
      .to.equal(true);
  });

  it("uses cwd-based default output when --output is not provided", async () => {
    const cwdDir = await tmp("op-conv-cwd-");
    const savedCwd = process.cwd();
    process.chdir(cwdDir);
    try {
      const res = await importOpenPlugin({
        path: pluginDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });
      if (res.isErr()) throw new Error(res.error.message);
      chai.expect(res.value.projectPath).to.equal(path.join(cwdDir, "demo-plugin"));
    } finally {
      process.chdir(savedCwd);
      await fs.remove(cwdDir);
    }
  });
});
