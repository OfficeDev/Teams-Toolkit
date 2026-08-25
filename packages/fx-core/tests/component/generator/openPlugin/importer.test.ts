// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AppManifestUtils, ok, SystemError, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { getDefaultString, getLocalizedString } from "../../../../src/common/localizeUtils";
import * as mcpToolFetcher from "../../../../src/common/mcpToolFetcher";
import { setTools } from "../../../../src/common/globalVars";
import { Generator } from "../../../../src/component/generator/generator";
import { importOpenPlugin } from "../../../../src/component/generator/openPlugin/importer";
import { ATK_EXTENSION_NAMESPACE } from "../../../../src/component/generator/openPlugin/spec";
import { MockTools } from "../../../core/utils";
import { scaffoldOpenPluginTemplateFromSource } from "./testTemplateScaffold";
import { chai, vi } from "vitest";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedSamplePlugin(root: string, manifestRel = "plugin.json"): Promise<void> {
  // Agent Plugins 1.0.0 layout by default; callers pass a legacy path to
  // exercise the back-compat probe.
  const isLegacy = manifestRel !== "plugin.json";
  await fs.ensureDir(path.join(root, path.dirname(manifestRel)));
  await fs.writeJSON(path.join(root, manifestRel), {
    ...(isLegacy ? {} : { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" }),
    name: "demo-plugin",
    version: "1.2.3",
    description: "A demo Agent Plugin used by converter tests.",
    author: { name: "Jane Doe", email: "jane@example.com", url: "https://example.com" },
    homepage: "https://example.com",
  });
  await fs.writeJSON(path.join(root, isLegacy ? ".mcp.json" : "mcp.json"), {
    ...(isLegacy ? {} : { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json" }),
    mcpServers: {
      web: {
        type: "streamable-http",
        url: "https://web.example.com/api",
      },
      stdioOnly: { type: "stdio", command: "node", args: ["server.js"] },
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
    vi.spyOn(mcpToolFetcher, "probeMCPServerAuth").mockResolvedValue({
      requiresAuth: true,
      endpointStatus: "confirmed",
      authMetadataUrl: "https://web.example.com/.well-known/oauth-protected-resource",
    });
    vi.spyOn(mcpToolFetcher, "resolveMCPOAuthMetadata").mockResolvedValue({
      authorizationUrl: "https://login.example.com/authorize",
      tokenUrl: "https://login.example.com/token",
      wellKnownUrl: "https://login.example.com/.well-known/oauth-authorization-server",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(pluginDir);
    await fs.remove(outDir);
  });

  it("SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-01: scaffolds an Auto-auth Toolkit project", async () => {
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
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization.type)
      .to.equal("OAuthPluginVault");
    chai.expect(res.value.warnings.some((warning) => warning.includes("web"))).to.equal(true);
  });

  it("AP-PATH-02: normalizes a legacy plugin name before deriving the default output path", async () => {
    const sandboxRoot = await tmp("op-conv-default-output-");
    const workingDirectory = path.join(sandboxRoot, "working");
    const originalCwd = process.cwd();
    try {
      await fs.ensureDir(workingDirectory);
      await fs.remove(path.join(pluginDir, "plugin.json"));
      await fs.remove(path.join(pluginDir, "mcp.json"));
      await fs.ensureDir(path.join(pluginDir, ".plugin"));
      await fs.writeJSON(path.join(pluginDir, ".plugin", "plugin.json"), {
        name: "../escaped-output",
        homepage: "https://example.com",
      });
      process.chdir(workingDirectory);

      const res = await importOpenPlugin({
        path: pluginDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType: "None",
      });

      if (res.isErr()) throw new Error(res.error.message);
      chai.expect(res.value.projectPath).to.equal(path.join(workingDirectory, "escaped-output"));
      chai.expect(await fs.pathExists(path.join(sandboxRoot, "escaped-output"))).to.equal(false);
    } finally {
      process.chdir(originalCwd);
      await fs.remove(sandboxRoot);
    }
  });

  it("AP-COMMAND-01: copies only discovered regular Markdown command files", async () => {
    await fs.writeFile(path.join(pluginDir, "commands", "notes.txt"), "not a command");
    await fs.ensureDir(path.join(pluginDir, "commands", "bad.md"));
    await fs.writeFile(path.join(pluginDir, "commands", "bad.md", "nested.txt"), "not a file");

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "deploy.md")))
      .to.equal(true);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "notes.txt")))
      .to.equal(false);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "bad.md")))
      .to.equal(false);
  });

  it("AP-PATH-10: skips an in-root command file symlink", async () => {
    await fs.ensureDir(path.join(pluginDir, "commands", "linked-target"));
    await fs.writeFile(path.join(pluginDir, "commands", "linked-target", "content.txt"), "test");
    await fs.ensureSymlink(
      path.join(pluginDir, "commands", "linked-target"),
      path.join(pluginDir, "commands", "linked.md"),
      process.platform === "win32" ? "junction" : "dir"
    );

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "linked.md")))
      .to.equal(false);
    chai.expect(res.value.warnings.some((warning) => warning.includes("linked.md"))).to.equal(true);
  });

  it("AP-PATH-11: rejects a commands directory junction", async () => {
    const commandsTarget = path.join(pluginDir, "commands-target");
    await fs.remove(path.join(pluginDir, "commands"));
    await fs.ensureDir(commandsTarget);
    await fs.writeFile(path.join(commandsTarget, "deploy.md"), "# linked deploy");
    await fs.ensureSymlink(
      commandsTarget,
      path.join(pluginDir, "commands"),
      process.platform === "win32" ? "junction" : "dir"
    );

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "deploy.md")))
      .to.equal(false);
    chai.expect(res.value.warnings.some((warning) => warning.includes("commands"))).to.equal(true);
  });

  it("AP-PATH-12: rechecks a command file before copying it", async () => {
    vi.mocked(Generator.generateTemplate).mockImplementation(async (ctx, dest) => {
      const commandTarget = path.join(pluginDir, "command-target");
      await fs.remove(path.join(pluginDir, "commands", "deploy.md"));
      await fs.ensureDir(commandTarget);
      await fs.writeFile(path.join(commandTarget, "content.txt"), "linked content");
      await fs.ensureSymlink(
        commandTarget,
        path.join(pluginDir, "commands", "deploy.md"),
        process.platform === "win32" ? "junction" : "dir"
      );
      const appName = ctx.templateVariables?.appName ?? "";
      await scaffoldOpenPluginTemplateFromSource(dest, { appName });
      return ok(undefined);
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "deploy.md")))
      .to.equal(false);
    chai.expect(res.value.warnings.some((warning) => warning.includes("deploy.md"))).to.equal(true);
  });

  it("AP-PATH-13: rechecks a skill directory before copying it", async () => {
    const outside = await tmp("op-conv-replaced-skill-");
    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "outside");
      vi.mocked(Generator.generateTemplate).mockImplementation(async (ctx, dest) => {
        await fs.remove(path.join(pluginDir, "skills", "alpha-skill"));
        await fs.ensureSymlink(
          outside,
          path.join(pluginDir, "skills", "alpha-skill"),
          process.platform === "win32" ? "junction" : "dir"
        );
        const appName = ctx.templateVariables?.appName ?? "";
        await scaffoldOpenPluginTemplateFromSource(dest, { appName });
        return ok(undefined);
      });

      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType: "None",
      });

      if (res.isErr()) throw new Error(res.error.message);
      chai
        .expect(
          await fs.pathExists(
            path.join(outDir, "appPackage", "skills", "alpha-skill", "secret.txt")
          )
        )
        .to.equal(false);
      chai
        .expect(await fs.pathExists(path.join(outDir, "appPackage", "skills", "beta-skill")))
        .to.equal(true);
      chai
        .expect(res.value.warnings.some((warning) => warning.includes("alpha-skill")))
        .to.equal(true);
    } finally {
      await fs.remove(outside);
    }
  });

  it("AP-PATH-14: skips a broken command link", async () => {
    const target = path.join(pluginDir, "broken-target");
    await fs.ensureDir(target);
    await fs.remove(path.join(pluginDir, "commands", "deploy.md"));
    await fs.ensureSymlink(
      target,
      path.join(pluginDir, "commands", "deploy.md"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await fs.remove(target);

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    chai
      .expect(await fs.pathExists(path.join(outDir, "appPackage", "commands", "deploy.md")))
      .to.equal(false);
  });

  it("validates required local inputs before Auto auth discovery", async () => {
    const res = await importOpenPlugin({ path: pluginDir, output: outDir });

    chai.expect(res.isErr()).to.equal(true);
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it.each([
    {
      field: "websiteUrl",
      inputs: {
        websiteUrl: "not-a-url",
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      },
    },
    {
      field: "privacyUrl",
      inputs: {
        websiteUrl: "https://example.com",
        privacyUrl: "ftp://example.com/privacy",
        termsUrl: "https://example.com/terms",
      },
    },
    {
      field: "termsOfUseUrl",
      inputs: {
        websiteUrl: "https://example.com",
        privacyUrl: "https://example.com/privacy",
        termsUrl: "file:///terms",
      },
    },
  ])("rejects an invalid $field before Auto auth discovery", async ({ inputs, field }) => {
    const res = await importOpenPlugin({ path: pluginDir, output: outDir, ...inputs });

    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) {
      chai.expect(res.error).to.be.instanceOf(UserError);
      chai.expect(res.error.message).to.include(field);
    }
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("returns a user error for an invalid current plugin manifest", async () => {
    const manifestPath = path.join(pluginDir, "plugin.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.$schema = "https://example.com/not-agent-plugins.schema.json";
    await fs.writeJSON(manifestPath, manifest);

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) chai.expect(res.error).to.be.instanceOf(UserError);
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("returns a system error when mapped manifest schema validation fails", async () => {
    vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockRejectedValue(
      new Error("schema unavailable")
    );

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) {
      chai.expect(res.error).to.be.instanceOf(SystemError);
      chai.expect(res.error.message).to.equal("schema unavailable");
      chai
        .expect(res.error.displayMessage)
        .to.equal(getLocalizedString("core.openPluginImport.failed"));
    }
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it.each(["appId", "authorName", "version"])(
    "rejects a mapped manifest with an invalid %s before auth discovery",
    async (invalidField) => {
      const manifestPath = path.join(pluginDir, "plugin.json");
      const manifest = await fs.readJSON(manifestPath);
      if (invalidField === "authorName") manifest.author.name = "a".repeat(33);
      if (invalidField === "version") manifest.version = "1".repeat(257);
      await fs.writeJSON(manifestPath, manifest);

      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        appId: invalidField === "appId" ? "not-a-guid" : undefined,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });

      chai.expect(res.isErr()).to.equal(true);
      if (res.isErr()) {
        const defaultPrefix = getDefaultString("core.openPluginImport.invalidManifest", "");
        const localizedPrefix = getLocalizedString("core.openPluginImport.invalidManifest", "");
        chai.expect(res.error.name).to.equal("InvalidManifest");
        chai.expect(defaultPrefix).not.to.equal("");
        chai.expect(localizedPrefix).not.to.equal("");
        chai.expect(res.error.message.startsWith(defaultPrefix)).to.equal(true);
        chai.expect(res.error.displayMessage.startsWith(localizedPrefix)).to.equal(true);
      }
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
      chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
      chai.expect(await fs.pathExists(outDir)).to.equal(false);
    }
  );

  it("skips an invalid legacy MCP URL when authentication is explicit", async () => {
    await fs.remove(path.join(pluginDir, "plugin.json"));
    await fs.remove(path.join(pluginDir, "mcp.json"));
    await fs.ensureDir(path.join(pluginDir, ".plugin"));
    await fs.writeJSON(path.join(pluginDir, ".plugin", "plugin.json"), {
      name: "demo-plugin",
      homepage: "https://example.com",
    });
    await fs.writeJSON(path.join(pluginDir, ".mcp.json"), {
      mcpServers: {
        invalid: { type: "streamable-http", url: "not-a-valid-url" },
        valid: { type: "streamable-http", url: "https://valid.example.com/mcp" },
      },
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors.map((connector: { id: string }) => connector.id))
      .to.eql(["valid"]);
    chai.expect(res.value.warnings.some((warning) => warning.includes("invalid"))).to.equal(true);
  });

  it("AP-PATH-03: does not copy a nested junction that escapes the plugin root", async () => {
    const outside = await tmp("op-conv-outside-skill-");
    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "outside");
      await fs.ensureSymlink(
        outside,
        path.join(pluginDir, "skills", "alpha-skill", "external"),
        process.platform === "win32" ? "junction" : "dir"
      );

      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType: "None",
      });

      if (res.isErr()) throw new Error(res.error.message);
      chai
        .expect(
          await fs.pathExists(
            path.join(outDir, "appPackage", "skills", "alpha-skill", "external", "secret.txt")
          )
        )
        .to.equal(false);
      chai.expect(res.value.warnings.some((warning) => warning.includes("outside"))).to.equal(true);
    } finally {
      await fs.remove(outside);
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

  it("OPI-AUTH-03: Auto selects None for a confirmed public MCP endpoint", async () => {
    vi.mocked(mcpToolFetcher.probeMCPServerAuth).mockResolvedValue({
      requiresAuth: false,
      endpointStatus: "confirmed",
    });
    vi.mocked(mcpToolFetcher.resolveMCPOAuthMetadata).mockRejectedValue(
      new Error("No OAuth metadata")
    );

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
      .to.deep.equal({ type: "None" });
    chai.expect(res.value.warnings.some((warning) => warning.includes("web"))).to.equal(true);
  });

  it("OPI-AUTH-04: Auto selects OAuth for a confirmed auth challenge", async () => {
    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
      .to.deep.equal({
        type: "OAuthPluginVault",
        referenceId: "demo-plugin-web-auth",
      });
    chai.expect(mcpToolFetcher.probeMCPServerAuth).toHaveBeenCalledOnce();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).toHaveBeenCalledOnce();
    chai.expect(res.value.warnings.some((warning) => warning.includes("web"))).to.equal(true);
  });

  it("OPI-AUTH-05: Auto detects OAuth deferred until tool calls", async () => {
    vi.mocked(mcpToolFetcher.probeMCPServerAuth).mockResolvedValue({
      requiresAuth: false,
      endpointStatus: "confirmed",
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization.type)
      .to.equal("OAuthPluginVault");
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).toHaveBeenCalledOnce();
    chai.expect(res.value.warnings.some((warning) => warning.includes("web"))).to.equal(true);
  });

  it("OPI-AUTH-08 / SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-05: falls back to OAuth for a confirmed challenge without metadata", async () => {
    vi.mocked(mcpToolFetcher.resolveMCPOAuthMetadata).mockRejectedValue(
      new Error("No OAuth metadata")
    );

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
      .to.deep.equal({
        type: "OAuthPluginVault",
        referenceId: "demo-plugin-web-auth",
      });
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).toHaveBeenCalledOnce();
    chai
      .expect(
        res.value.warnings.some(
          (warning) =>
            warning.includes("web") &&
            warning.includes("could not be resolved") &&
            warning.includes("Verify") &&
            warning.includes("register")
        )
      )
      .to.equal(true);
  });

  it("OPI-AUTH-06: Auto stops before scaffolding when auth is unresolved", async () => {
    const probe = vi.mocked(mcpToolFetcher.probeMCPServerAuth);
    const cases = [
      async () =>
        probe.mockResolvedValueOnce({ requiresAuth: true, endpointStatus: "undetermined" }),
      async () =>
        probe.mockResolvedValueOnce({
          requiresAuth: true,
          endpointStatus: "notEndpoint",
          responseStatus: 404,
        }),
      async () => probe.mockRejectedValueOnce(new Error("network unavailable")),
    ];

    for (const arrange of cases) {
      await fs.remove(outDir);
      vi.mocked(Generator.generateTemplate).mockClear();
      await arrange();

      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });

      chai.expect(res.isErr()).to.equal(true);
      if (res.isErr()) chai.expect(res.error.name).to.equal("UnresolvedMcpAuth");
      chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
      chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
      chai.expect(await fs.pathExists(outDir)).to.equal(false);
    }
  });

  it("OPI-AUTH-06: Auto rejects an invalid MCP URL without probing or scaffolding", async () => {
    await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        invalid: { type: "streamable-http", url: "not-a-valid-url" },
      },
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) chai.expect(res.error.name).to.equal("UnresolvedMcpAuth");
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("skips an invalid MCP URL when authentication is explicit", async () => {
    await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        invalid: { type: "streamable-http", url: "not-a-valid-url" },
      },
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
      defaultAuthType: "None",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai.expect(manifest.agentConnectors).to.equal(undefined);
    chai.expect(res.value.warnings.some((warning) => warning.includes("invalid"))).to.equal(true);
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).toHaveBeenCalledOnce();
  });

  it("OPI-AUTH-01: preserves an exported connector override without discovery", async () => {
    const manifestPath = path.join(pluginDir, "plugin.json");
    const sourceManifest = await fs.readJSON(manifestPath);
    sourceManifest.extensions = {
      [ATK_EXTENSION_NAMESPACE]: {
        agentConnectors: {
          web: {
            authorization: {
              type: "ApiKeyPluginVault",
              referenceId: "existing-api-key-reference",
            },
          },
        },
      },
    };
    await fs.writeJSON(manifestPath, sourceManifest);

    for (const defaultAuthType of [
      "Auto",
      "None",
      "OAuthPluginVault",
      "ApiKeyPluginVault",
    ] as const) {
      await fs.remove(outDir);
      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType,
      });

      if (res.isErr()) throw new Error(res.error.message);
      const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
      chai
        .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
        .to.deep.equal({
          type: "ApiKeyPluginVault",
          referenceId: "existing-api-key-reference",
        });
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    }
  });

  it("OPI-AUTH-02: applies every explicit default without discovery", async () => {
    for (const defaultAuthType of ["None", "OAuthPluginVault", "ApiKeyPluginVault"] as const) {
      await fs.remove(outDir);
      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType,
      });

      if (res.isErr()) throw new Error(res.error.message);
      const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
      chai
        .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization.type)
        .to.equal(defaultAuthType);
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    }
  });

  it("OPI-AUTH-07: keeps localhost variants on None without discovery", async () => {
    for (const serverUrl of [
      "http://localhost:5050/sse",
      "https://[::1]/mcp",
      "https://[::ffff:127.0.0.1]/mcp",
    ]) {
      await fs.remove(outDir);
      await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          local: { type: "streamable-http", url: serverUrl },
        },
      });

      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });

      if (res.isErr()) throw new Error(res.error.message);
      const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
      if (serverUrl.startsWith("http://")) {
        chai.expect(manifest.agentConnectors).to.equal(undefined);
        chai
          .expect(res.value.warnings.some((warning) => warning.includes("requires HTTPS")))
          .to.equal(true);
      } else {
        chai
          .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
          .to.deep.equal({ type: "None" });
      }
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    }
  });

  it("OPI-AUTH-07: probes a public IPv6 MCP server", async () => {
    const serverUrl = "https://[2001:db8::1]/mcp";
    await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        remote: { type: "streamable-http", url: serverUrl },
      },
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    chai.expect(mcpToolFetcher.probeMCPServerAuth).toHaveBeenCalledWith(serverUrl);
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).toHaveBeenCalledOnce();
  });

  it("OPI-AUTH-07: resolves mixed connectors in deterministic server-name order", async () => {
    await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        secure: { type: "streamable-http", url: "https://secure.example.com/mcp" },
        stdio: { type: "stdio", command: "node", args: ["server.js"] },
        public: { type: "streamable-http", url: "https://public.example.com/mcp" },
        preserved: { type: "streamable-http", url: "https://preserved.example.com/mcp" },
        local: { type: "streamable-http", url: "http://localhost:5050/sse" },
      },
    });
    const manifestPath = path.join(pluginDir, "plugin.json");
    const sourceManifest = await fs.readJSON(manifestPath);
    sourceManifest.extensions = {
      [ATK_EXTENSION_NAMESPACE]: {
        agentConnectors: {
          preserved: {
            authorization: {
              type: "ApiKeyPluginVault",
              referenceId: "existing-api-key-reference",
            },
          },
        },
      },
    };
    await fs.writeJSON(manifestPath, sourceManifest);
    vi.mocked(mcpToolFetcher.probeMCPServerAuth).mockImplementation(async (serverUrl) => ({
      requiresAuth: serverUrl.includes("secure"),
      endpointStatus: "confirmed",
      authMetadataUrl: serverUrl.includes("secure")
        ? "https://secure.example.com/.well-known/oauth-protected-resource"
        : undefined,
    }));
    vi.mocked(mcpToolFetcher.resolveMCPOAuthMetadata).mockImplementation(
      async (_authMetadataUrl, _wellKnownUrl, serverUrl) => {
        if (!serverUrl?.includes("secure")) throw new Error("No OAuth metadata");
        return {
          authorizationUrl: "https://login.example.com/authorize",
          tokenUrl: "https://login.example.com/token",
          wellKnownUrl: "https://login.example.com/.well-known/oauth-authorization-server",
        };
      }
    );

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors.map((connector: any) => connector.id))
      .to.deep.equal(["preserved", "public", "secure"]);
    chai
      .expect(
        manifest.agentConnectors.map(
          (connector: any) => connector.toolSource.remoteMcpServer.authorization.type
        )
      )
      .to.deep.equal(["ApiKeyPluginVault", "None", "OAuthPluginVault"]);
    chai
      .expect(vi.mocked(mcpToolFetcher.probeMCPServerAuth).mock.calls.map((call) => call[0]))
      .to.deep.equal(["https://public.example.com/mcp", "https://secure.example.com/mcp"]);
    chai
      .expect(
        res.value.warnings
          .filter((warning) => warning.startsWith("Auto inferred"))
          .map((warning) => warning.match(/server '([^']+)'/)?.[1])
      )
      .to.deep.equal(["public", "secure"]);
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

  it("SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-03: rejects non-empty output before discovery", async () => {
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
      chai
        .expect(res.error.message)
        .to.equal(getDefaultString("core.openPluginImport.outputDirectoryNotEmpty", outDir));
      chai
        .expect(res.error.displayMessage)
        .to.equal(getLocalizedString("core.openPluginImport.outputDirectoryNotEmpty", outDir));
    }
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.readFile(path.join(outDir, "preexisting.txt"), "utf8")).to.equal("hi");
  });

  it("AP-PATH-17: rejects an empty output directory link before discovery", async () => {
    const outside = await tmp("op-conv-output-link-target-");
    await fs.ensureSymlink(outside, outDir, process.platform === "win32" ? "junction" : "dir");
    try {
      const res = await importOpenPlugin({
        path: pluginDir,
        output: outDir,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });

      chai.expect(res.isErr()).to.equal(true);
      if (res.isErr()) {
        chai.expect(res.error.name).to.equal("InvalidOutputPath");
        chai
          .expect(res.error.message)
          .to.equal(getDefaultString("core.openPluginImport.invalidOutputPath", outDir));
        chai
          .expect(res.error.displayMessage)
          .to.equal(getLocalizedString("core.openPluginImport.invalidOutputPath", outDir));
      }
      chai.expect(await fs.readdir(outside)).to.deep.equal([]);
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    } finally {
      await fs.remove(outside);
    }
  });

  it("SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-06: rejects a missing output beneath a directory link", async () => {
    const outside = await tmp("op-conv-output-parent-link-target-");
    const linkRoot = await tmp("op-conv-output-parent-link-");
    const linkedParent = path.join(linkRoot, "linked");
    const nestedOutput = path.join(linkedParent, "new-output");
    await fs.ensureSymlink(
      outside,
      linkedParent,
      process.platform === "win32" ? "junction" : "dir"
    );
    try {
      const res = await importOpenPlugin({
        path: pluginDir,
        output: nestedOutput,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      });

      chai.expect(res.isErr()).to.equal(true);
      if (res.isErr()) chai.expect(res.error.name).to.equal("InvalidOutputPath");
      chai.expect(await fs.readdir(outside)).to.deep.equal([]);
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    } finally {
      await fs.remove(linkRoot);
      await fs.remove(outside);
    }
  });

  it("SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-07: skips fixed-header MCP without probing it", async () => {
    await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        tenant: {
          type: "streamable-http",
          url: "https://tenant.example.com/mcp",
          headers: { "X-Tenant": "public-tenant" },
        },
        plain: {
          type: "streamable-http",
          url: "https://plain.example.com/mcp",
        },
      },
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    if (res.isErr()) throw new Error(res.error.message);
    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));
    chai
      .expect(manifest.agentConnectors.map((connector: { id: string }) => connector.id))
      .to.eql(["plain"]);
    chai.expect(res.value.warnings.some((warning) => warning.includes("tenant"))).to.equal(true);
    chai.expect(mcpToolFetcher.probeMCPServerAuth).toHaveBeenCalledOnce();
    chai
      .expect(mcpToolFetcher.probeMCPServerAuth)
      .toHaveBeenCalledWith("https://plain.example.com/mcp");
  });

  it("SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-04: rejects excess connectors before discovery", async () => {
    const mcpServers: Record<string, { type: string; url: string }> = {};
    for (let index = 0; index < 11; index++) {
      mcpServers[`svc-${index}`] = {
        type: "streamable-http",
        url: `https://svc-${index}.example.com/mcp`,
      };
    }
    await fs.writeJSON(path.join(pluginDir, "mcp.json"), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers,
    });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) chai.expect(res.error).to.be.instanceOf(UserError);
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
  });

  it("returns an error when --path does not exist", async () => {
    const missingPath = path.join(pluginDir, "does-not-exist");
    const res = await importOpenPlugin({
      path: missingPath,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    chai.expect(res.isErr()).to.equal(true);
    if (res.isErr()) {
      const defaultPrefix = getDefaultString("core.openPluginImport.invalidPlugin", "");
      const localizedPrefix = getLocalizedString("core.openPluginImport.invalidPlugin", "");
      chai.expect(res.error).to.be.instanceOf(UserError);
      chai.expect(res.error.name).to.equal("InvalidPlugin");
      chai.expect(defaultPrefix).not.to.equal("");
      chai.expect(localizedPrefix).not.to.equal("");
      chai.expect(res.error.message.startsWith(defaultPrefix)).to.equal(true);
      chai.expect(res.error.displayMessage.startsWith(localizedPrefix)).to.equal(true);
    }
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
      chai
        .expect(res.error.message)
        .to.equal(getDefaultString("core.openPluginImport.missingPluginPath"));
      chai
        .expect(res.error.displayMessage)
        .to.equal(getLocalizedString("core.openPluginImport.missingPluginPath"));
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
