// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { readOpenPluginDir } from "../../../../src/component/generator/openPlugin/parser";
import { chai } from "vitest";

async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "op-parser-"));
}

interface ManifestSeedOptions {
  manifestRel?: string;
  pluginJson?: Record<string, unknown>;
  mcpJson?: Record<string, unknown> | null;
  skills?: string[];
  commands?: string[];
  invalidSkillNames?: string[];
  hasColor?: boolean;
  hasOutline?: boolean;
}

async function seedPlugin(root: string, opts: ManifestSeedOptions = {}): Promise<void> {
  const manifestRel = opts.manifestRel ?? ".plugin/plugin.json";
  await fs.ensureDir(path.join(root, path.dirname(manifestRel)));
  await fs.writeJSON(
    path.join(root, manifestRel),
    opts.pluginJson ?? { name: "demo-plugin", version: "1.0.0", description: "demo" }
  );
  if (opts.mcpJson) {
    await fs.writeJSON(path.join(root, ".mcp.json"), opts.mcpJson);
  }
  for (const name of opts.skills ?? []) {
    const dir = path.join(root, "skills", name);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\nbody`);
  }
  for (const name of opts.invalidSkillNames ?? []) {
    const dir = path.join(root, "skills", name);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, "SKILL.md"), "x");
  }
  if (opts.commands && opts.commands.length > 0) {
    await fs.ensureDir(path.join(root, "commands"));
    for (const name of opts.commands) {
      await fs.writeFile(path.join(root, "commands", name), "# cmd");
    }
  }
  if (opts.hasColor) {
    await fs.writeFile(path.join(root, "color.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
  if (opts.hasOutline) {
    await fs.writeFile(path.join(root, "outline.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
}

describe("openPlugin.readOpenPluginDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("throws when no manifest is present", async () => {
    let caught: Error | undefined;
    try {
      await readOpenPluginDir(tempDir);
    } catch (e) {
      caught = e as Error;
    }
    chai.expect(caught).to.exist;
    chai.expect(caught!.message).to.match(/No Open Plugin manifest/);
  });

  it("finds vendor-neutral .plugin/plugin.json", async () => {
    await seedPlugin(tempDir);
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("open-plugin");
    chai.expect(parsed.manifest.name).to.equal("demo-plugin");
  });

  it("finds .claude-plugin/plugin.json when .plugin/ absent", async () => {
    await seedPlugin(tempDir, { manifestRel: ".claude-plugin/plugin.json" });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("claude-plugin");
  });

  it("finds .cursor-plugin/plugin.json as last fallback", async () => {
    await seedPlugin(tempDir, { manifestRel: ".cursor-plugin/plugin.json" });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("cursor-plugin");
  });

  it("prefers .plugin/ over .claude-plugin/ when both exist", async () => {
    await seedPlugin(tempDir);
    await fs.ensureDir(path.join(tempDir, ".claude-plugin"));
    await fs.writeJSON(path.join(tempDir, ".claude-plugin/plugin.json"), {
      name: "claude-variant",
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("open-plugin");
    chai.expect(parsed.manifest.name).to.equal("demo-plugin");
  });

  it("reads wrapped form of .mcp.json", async () => {
    await seedPlugin(tempDir, {
      mcpJson: {
        mcpServers: {
          alpha: { url: "https://alpha.example.com" },
          beta: { url: "https://beta.example.com" },
        },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(Object.keys(parsed.mcpServers).sort()).to.deep.equal(["alpha", "beta"]);
  });

  it("reads bare-object form of .mcp.json", async () => {
    await seedPlugin(tempDir, {
      mcpJson: { gamma: { url: "https://gamma.example.com" } },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(Object.keys(parsed.mcpServers)).to.deep.equal(["gamma"]);
  });

  it("discovers skill folders with SKILL.md and warns on invalid names", async () => {
    await seedPlugin(tempDir, {
      skills: ["alpha-skill", "beta_skill"],
      invalidSkillNames: ["Bad Name"],
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.skills).to.deep.equal(["alpha-skill", "beta_skill"]);
    chai.expect(parsed.warnings.some((w) => w.includes("Bad Name"))).to.equal(true);
  });

  it("discovers commands/*.md", async () => {
    await seedPlugin(tempDir, { commands: ["foo.md", "bar.md"] });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.commands).to.deep.equal(["bar.md", "foo.md"]);
  });

  it("warns on unmapped Open Plugin fields", async () => {
    await seedPlugin(tempDir, {
      pluginJson: {
        name: "demo-plugin",
        agents: "./agents",
        hooks: "./hooks.json",
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.warnings.some((w) => w.includes("agents"))).to.equal(true);
    chai.expect(parsed.warnings.some((w) => w.includes("hooks"))).to.equal(true);
  });

  it("rejects non-string component path override", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { name: "demo-plugin", skills: ["./one", "./two"] },
    });
    let caught: Error | undefined;
    try {
      await readOpenPluginDir(tempDir);
    } catch (e) {
      caught = e as Error;
    }
    chai.expect(caught).to.exist;
    chai.expect(caught!.message).to.match(/single-string form/);
  });

  it("requires a 'name' field", async () => {
    await seedPlugin(tempDir, { pluginJson: { version: "1.0.0" } });
    let caught: Error | undefined;
    try {
      await readOpenPluginDir(tempDir);
    } catch (e) {
      caught = e as Error;
    }
    chai.expect(caught).to.exist;
    chai.expect(caught!.message).to.match(/required 'name'/);
  });

  it("uses a string override for the skills path", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { name: "demo-plugin", skills: "./custom-skills" },
    });
    await fs.ensureDir(path.join(tempDir, "custom-skills", "my-skill"));
    await fs.writeFile(
      path.join(tempDir, "custom-skills", "my-skill", "SKILL.md"),
      "---\nname: my-skill\n---\nbody"
    );
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.skills).to.deep.equal(["my-skill"]);
  });

  it("skips non-directory entries in the skills folder", async () => {
    await seedPlugin(tempDir, { skills: ["valid-skill"] });
    await fs.writeFile(path.join(tempDir, "skills", "README.md"), "# not a skill");
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.skills).to.deep.equal(["valid-skill"]);
  });

  it("detects color.png and outline.png when present", async () => {
    await seedPlugin(tempDir, { hasColor: true, hasOutline: true });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.hasColorPng).to.equal(true);
    chai.expect(parsed.hasOutlinePng).to.equal(true);
  });

  it("throws when the plugin directory does not exist", async () => {
    let caught: Error | undefined;
    try {
      await readOpenPluginDir(path.join(tempDir, "nonexistent"));
    } catch (e) {
      caught = e as Error;
    }
    chai.expect(caught).to.exist;
    chai.expect(caught!.message).to.match(/Plugin directory not found/);
  });
});
