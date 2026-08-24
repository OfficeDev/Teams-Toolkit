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

async function expectReadFailure(root: string, pattern: RegExp): Promise<void> {
  let message: string | undefined;
  try {
    await readOpenPluginDir(root);
  } catch (error) {
    if (error instanceof Error) {
      message = error.message;
    }
  }
  chai.expect(message).to.match(pattern);
}

const PLUGIN_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

interface ManifestSeedOptions {
  manifestRel?: string;
  pluginJson?: Record<string, unknown>;
  mcpJson?: Record<string, unknown> | null;
  /** Filename for the MCP config. Defaults to the 1.0.0 name. */
  mcpRel?: string;
  includeMcpSchema?: boolean;
  skills?: string[];
  commands?: string[];
  invalidSkillNames?: string[];
  hasColor?: boolean;
  hasOutline?: boolean;
}

async function seedPlugin(root: string, opts: ManifestSeedOptions = {}): Promise<void> {
  // Agent Plugins 1.0.0 layout by default: plugin.json in the plugin root.
  const manifestRel = opts.manifestRel ?? "plugin.json";
  await fs.ensureDir(path.join(root, path.dirname(manifestRel)));
  await fs.writeJSON(
    path.join(root, manifestRel),
    opts.pluginJson ?? {
      $schema: PLUGIN_SCHEMA_URL,
      name: "demo-plugin",
      version: "1.0.0",
      description: "demo",
    }
  );
  if (opts.mcpJson) {
    const mcpRel = opts.mcpRel ?? "mcp.json";
    const isLegacy = manifestRel !== "plugin.json" || mcpRel === ".mcp.json";
    const mcpJson =
      !isLegacy && opts.includeMcpSchema !== false
        ? { $schema: MCP_SCHEMA_URL, ...opts.mcpJson }
        : opts.mcpJson;
    await fs.writeJSON(path.join(root, mcpRel), mcpJson);
  }
  for (const name of opts.skills ?? []) {
    const dir = path.join(root, "skills", name);
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: Test skill ${name}\n---\nbody`
    );
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
    chai.expect(caught!.message).to.match(/No plugin manifest/);
  });

  it("finds plugin.json in the plugin root (Agent Plugins 1.0.0)", async () => {
    await seedPlugin(tempDir);
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("agent-plugin");
    chai.expect(parsed.isLegacyLayout).to.equal(false);
    chai.expect(parsed.manifest.name).to.equal("demo-plugin");
  });

  it("finds legacy .plugin/plugin.json and warns", async () => {
    await seedPlugin(tempDir, { manifestRel: ".plugin/plugin.json" });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("open-plugin");
    chai.expect(parsed.isLegacyLayout).to.equal(true);
    chai.expect(parsed.warnings.some((w) => w.includes("deprecated"))).to.equal(true);
  });

  it("finds .claude-plugin/plugin.json when the root manifest is absent", async () => {
    await seedPlugin(tempDir, { manifestRel: ".claude-plugin/plugin.json" });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("claude-plugin");
    chai.expect(parsed.isLegacyLayout).to.equal(true);
  });

  it("finds .cursor-plugin/plugin.json as last fallback", async () => {
    await seedPlugin(tempDir, { manifestRel: ".cursor-plugin/plugin.json" });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("cursor-plugin");
    chai.expect(parsed.isLegacyLayout).to.equal(true);
  });

  it("prefers the root plugin.json over legacy locations when both exist", async () => {
    await seedPlugin(tempDir);
    await fs.ensureDir(path.join(tempDir, ".plugin"));
    await fs.writeJSON(path.join(tempDir, ".plugin/plugin.json"), { name: "legacy-variant" });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.manifestKind).to.equal("agent-plugin");
    chai.expect(parsed.manifest.name).to.equal("demo-plugin");
  });

  it("AP-VALIDATE-01: rejects a 1.0.0 manifest without $schema", async () => {
    await seedPlugin(tempDir, { pluginJson: { name: "demo-plugin" } });
    await expectReadFailure(tempDir, /\$schema/);
  });

  it("AP-VALIDATE-02: rejects a 1.0.0 manifest with an invalid name", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { $schema: PLUGIN_SCHEMA_URL, name: "Bad--Name" },
    });
    await expectReadFailure(tempDir, /name/);
  });

  it("AP-VALIDATE-03: rejects a known extensions field with the wrong type", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", extensions: [] },
    });

    await expectReadFailure(tempDir, /extensions/);
  });

  it("AP-VALIDATE-04: reports and ignores an unknown root field", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", futureField: true },
    });

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(parsed.manifest.name).to.equal("demo-plugin");
    chai.expect(parsed.warnings.some((warning) => warning.includes("futureField"))).to.equal(true);
  });

  it("AP-MCP-01: skips a 1.0.0 MCP server entry without a type", async () => {
    await seedPlugin(tempDir, {
      mcpJson: { mcpServers: { alpha: { url: "https://alpha.example.com" } } },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai
      .expect(parsed.warnings.some((w) => w.includes("alpha") && w.includes("invalid")))
      .to.equal(true);
  });

  it("accepts the 1.0.0 transports without warning", async () => {
    await seedPlugin(tempDir, {
      mcpJson: {
        mcpServers: {
          alpha: { type: "streamable-http", url: "https://alpha.example.com" },
          beta: { type: "sse", url: "https://beta.example.com" },
          gamma: { type: "stdio", command: "./bin/server" },
        },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(Object.keys(parsed.mcpServers).sort()).to.deep.equal(["alpha", "beta", "gamma"]);
    chai.expect(parsed.warnings.some((w) => w.includes("type"))).to.equal(false);
  });

  it("AP-MCP-02: skips an unrecognized MCP transport", async () => {
    await seedPlugin(tempDir, {
      mcpJson: { mcpServers: { alpha: { type: "http", url: "https://alpha.example.com" } } },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai
      .expect(parsed.warnings.some((w) => w.includes("alpha") && w.includes("invalid")))
      .to.equal(true);
  });

  it("AP-PATH-04: skips a stdio cwd that escapes PLUGIN_ROOT", async () => {
    await seedPlugin(tempDir, {
      mcpJson: {
        mcpServers: {
          unsafe: {
            type: "stdio",
            command: "node",
            cwd: "${PLUGIN_ROOT}/../outside",
          },
        },
      },
    });

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai.expect(parsed.warnings.some((warning) => warning.includes("unsafe"))).to.equal(true);
  });

  it("falls back to legacy .mcp.json for a legacy manifest and warns", async () => {
    await seedPlugin(tempDir, {
      manifestRel: ".plugin/plugin.json",
      mcpRel: ".mcp.json",
      mcpJson: {
        mcpServers: { alpha: { type: "streamable-http", url: "https://alpha.example.com" } },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(Object.keys(parsed.mcpServers)).to.deep.equal(["alpha"]);
    chai.expect(parsed.warnings.some((w) => w.includes(".mcp.json"))).to.equal(true);
  });

  it("AP-MCP-03: disables MCP when the 1.0.0 top-level shape is invalid", async () => {
    await seedPlugin(tempDir, {
      mcpJson: {
        gamma: { type: "streamable-http", url: "https://gamma.example.com" },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai
      .expect(parsed.warnings.some((w) => w.includes("mcp.json") && w.includes("invalid")))
      .to.equal(true);
  });

  it("AP-MCP-04: disables MCP when $schema is missing", async () => {
    await seedPlugin(tempDir, {
      includeMcpSchema: false,
      mcpJson: {
        mcpServers: {
          alpha: { type: "streamable-http", url: "https://alpha.example.com" },
        },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai.expect(parsed.warnings.some((w) => w.includes("$schema"))).to.equal(true);
  });

  it("AP-MCP-05: disables MCP when mcp.json contains malformed JSON", async () => {
    await seedPlugin(tempDir);
    await fs.writeFile(path.join(tempDir, "mcp.json"), "{ invalid json");

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai
      .expect(
        parsed.warnings.some(
          (warning) => warning.includes("mcp.json") && warning.includes("invalid")
        )
      )
      .to.equal(true);
  });

  it("reads the toolkit block from extensions[com.microsoft.agents-toolkit]", async () => {
    await seedPlugin(tempDir, {
      pluginJson: {
        $schema: PLUGIN_SCHEMA_URL,
        name: "demo-plugin",
        extensions: {
          "com.microsoft.agents-toolkit": {
            id: "12345678-1234-1234-1234-123456789abc",
            accentColor: "#123456",
          },
        },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.atkExtension?.id).to.equal("12345678-1234-1234-1234-123456789abc");
    chai.expect(parsed.atkExtension?.accentColor).to.equal("#123456");
  });

  it("AP-EXT-01: drops an invalid toolkit authorization override", async () => {
    await seedPlugin(tempDir, {
      pluginJson: {
        $schema: PLUGIN_SCHEMA_URL,
        name: "demo-plugin",
        extensions: {
          "com.microsoft.agents-toolkit": {
            agentConnectors: {
              web: { authorization: { type: "BypassDiscovery" } },
            },
          },
        },
      },
    });

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(parsed.atkExtension?.agentConnectors?.web?.authorization).to.equal(undefined);
    chai
      .expect(parsed.warnings.some((warning) => warning.includes("authorization.type")))
      .to.equal(true);
  });

  it("reads the legacy top-level toolkit block and warns", async () => {
    await seedPlugin(tempDir, {
      manifestRel: ".plugin/plugin.json",
      pluginJson: {
        name: "demo-plugin",
        "x-microsoft-365-agents-toolkit": {
          id: "87654321-4321-4321-4321-cba987654321",
        },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.atkExtension?.id).to.equal("87654321-4321-4321-4321-cba987654321");
    chai
      .expect(parsed.warnings.some((w) => w.includes("x-microsoft-365-agents-toolkit")))
      .to.equal(true);
  });

  it("ignores component relocation on a 1.0.0 layout and warns", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", skills: "./custom-skills" },
      skills: ["fixed-skill"],
    });
    await fs.ensureDir(path.join(tempDir, "custom-skills", "relocated-skill"));
    await fs.writeFile(
      path.join(tempDir, "custom-skills", "relocated-skill", "SKILL.md"),
      "---\nname: relocated-skill\n---\nbody"
    );
    const parsed = await readOpenPluginDir(tempDir);
    // The fixed skills/ location wins; the override is ignored.
    chai.expect(parsed.skills).to.deep.equal(["fixed-skill"]);
    chai
      .expect(parsed.warnings.some((w) => w.includes("'skills'") && w.includes("ignored")))
      .to.equal(true);
  });

  it("rejects a component path that escapes the plugin root", async () => {
    await seedPlugin(tempDir, {
      manifestRel: ".plugin/plugin.json",
      pluginJson: { name: "demo-plugin", skills: "../outside-skills" },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.skills).to.deep.equal([]);
    chai.expect(parsed.warnings.some((w) => w.includes("outside the plugin root"))).to.equal(true);
  });

  it("AP-PATH-01: rejects a skills junction that resolves outside the plugin root", async () => {
    await seedPlugin(tempDir);
    const outside = await makeTempDir();
    try {
      await fs.ensureDir(path.join(outside, "external-skill"));
      await fs.writeFile(path.join(outside, "external-skill", "SKILL.md"), "external");
      await fs.ensureSymlink(
        outside,
        path.join(tempDir, "skills"),
        process.platform === "win32" ? "junction" : "dir"
      );

      const parsed = await readOpenPluginDir(tempDir);

      chai.expect(parsed.skills).to.deep.equal([]);
      chai
        .expect(parsed.warnings.some((w) => w.includes("outside the plugin root")))
        .to.equal(true);
    } finally {
      await fs.remove(outside);
    }
  });

  it("AP-COMPONENT-01: ignores a wrong-kind skills path and keeps valid MCP servers", async () => {
    await seedPlugin(tempDir, {
      mcpJson: {
        mcpServers: {
          alpha: { type: "streamable-http", url: "https://alpha.example.com" },
        },
      },
    });
    await fs.writeFile(path.join(tempDir, "skills"), "not a directory");

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(Object.keys(parsed.mcpServers)).to.deep.equal(["alpha"]);
    chai.expect(parsed.skills).to.deep.equal([]);
    chai
      .expect(parsed.warnings.some((w) => w.includes("skills") && w.includes("directory")))
      .to.equal(true);
  });

  it("reads wrapped form of mcp.json", async () => {
    await seedPlugin(tempDir, {
      mcpJson: {
        mcpServers: {
          alpha: { type: "streamable-http", url: "https://alpha.example.com" },
          beta: { type: "streamable-http", url: "https://beta.example.com" },
        },
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(Object.keys(parsed.mcpServers).sort()).to.deep.equal(["alpha", "beta"]);
  });

  it("reads bare-object form of mcp.json", async () => {
    await seedPlugin(tempDir, {
      manifestRel: ".plugin/plugin.json",
      mcpRel: ".mcp.json",
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
    chai.expect(parsed.skills).to.deep.equal(["alpha-skill"]);
    chai.expect(parsed.warnings.some((w) => w.includes("Bad Name"))).to.equal(true);
    chai.expect(parsed.warnings.some((w) => w.includes("beta_skill"))).to.equal(true);
  });

  it("AP-SKILL-01: skips a skill without valid required frontmatter", async () => {
    await seedPlugin(tempDir, { skills: ["invalid-skill"] });
    await fs.writeFile(
      path.join(tempDir, "skills", "invalid-skill", "SKILL.md"),
      "---\nname: other-name\n---\nbody"
    );

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(parsed.skills).to.deep.equal([]);
    chai.expect(parsed.warnings.some((w) => w.includes("invalid-skill"))).to.equal(true);
  });

  it("AP-SKILL-03: skips a skill with a non-string license", async () => {
    await seedPlugin(tempDir, { skills: ["invalid-license"] });
    await fs.writeFile(
      path.join(tempDir, "skills", "invalid-license", "SKILL.md"),
      "---\nname: invalid-license\ndescription: Test skill\nlicense:\n  type: MIT\n---\nbody"
    );

    const parsed = await readOpenPluginDir(tempDir);

    chai.expect(parsed.skills).to.deep.equal([]);
    chai.expect(parsed.warnings.some((warning) => warning.includes("license"))).to.equal(true);
  });

  it("discovers commands/*.md", async () => {
    await seedPlugin(tempDir, { commands: ["foo.md", "bar.md"] });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.commands).to.deep.equal(["bar.md", "foo.md"]);
  });

  it("warns on unmapped Open Plugin fields", async () => {
    await seedPlugin(tempDir, {
      manifestRel: ".plugin/plugin.json",
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

  it("ignores non-string component path overrides in a 1.0.0 manifest", async () => {
    await seedPlugin(tempDir, {
      pluginJson: {
        $schema: PLUGIN_SCHEMA_URL,
        name: "demo-plugin",
        skills: ["./one", "./two"],
      },
    });
    const parsed = await readOpenPluginDir(tempDir);
    chai.expect(parsed.skills).to.deep.equal([]);
    chai
      .expect(parsed.warnings.some((w) => w.includes("'skills'") && w.includes("ignored")))
      .to.equal(true);
  });

  it("requires a 'name' field", async () => {
    await seedPlugin(tempDir, {
      pluginJson: { $schema: PLUGIN_SCHEMA_URL, version: "1.0.0" },
    });
    let caught: Error | undefined;
    try {
      await readOpenPluginDir(tempDir);
    } catch (e) {
      caught = e as Error;
    }
    chai.expect(caught).to.exist;
    chai.expect(caught!.message).to.match(/required 'name'/);
  });

  it("honours a string override for the skills path on a legacy layout", async () => {
    await seedPlugin(tempDir, {
      manifestRel: ".plugin/plugin.json",
      pluginJson: { name: "demo-plugin", skills: "./custom-skills" },
    });
    await fs.ensureDir(path.join(tempDir, "custom-skills", "my-skill"));
    await fs.writeFile(
      path.join(tempDir, "custom-skills", "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: Relocated test skill\n---\nbody"
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
