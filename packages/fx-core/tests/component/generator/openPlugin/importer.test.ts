// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as mcpToolFetcher from "../../../../src/common/mcpToolFetcher";
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

  it("OPI-AUTH-06: Auto rejects an invalid MCP URL without probing", async () => {
    await fs.writeJSON(path.join(pluginDir, ".mcp.json"), {
      mcpServers: {
        invalid: { url: "not-a-valid-url" },
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
  });

  it("OPI-AUTH-01: preserves an exported connector override without discovery", async () => {
    const manifestPath = path.join(pluginDir, ".plugin", "plugin.json");
    const sourceManifest = await fs.readJSON(manifestPath);
    sourceManifest["x-microsoft-365-agents-toolkit"] = {
      agentConnectors: {
        web: {
          authorization: {
            type: "ApiKeyPluginVault",
            referenceId: "existing-api-key-reference",
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
      "http://tools.example.com/mcp",
      "https://[::1]/mcp",
      "https://[::ffff:127.0.0.1]/mcp",
      "https://tools.localhost./mcp",
    ]) {
      await fs.remove(outDir);
      await fs.writeJSON(path.join(pluginDir, ".mcp.json"), {
        mcpServers: {
          local: { url: serverUrl },
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
        .expect(manifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
        .to.deep.equal({ type: "None" });
      chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
      chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    }
  });

  it("OPI-AUTH-07: probes a public IPv6 MCP server", async () => {
    const serverUrl = "https://[2001:db8::1]/mcp";
    await fs.writeJSON(path.join(pluginDir, ".mcp.json"), {
      mcpServers: {
        remote: { url: serverUrl },
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
    await fs.writeJSON(path.join(pluginDir, ".mcp.json"), {
      mcpServers: {
        secure: { url: "https://secure.example.com/mcp" },
        stdio: { command: "node", args: ["server.js"] },
        public: { url: "https://public.example.com/mcp" },
        preserved: { url: "https://preserved.example.com/mcp" },
        local: { url: "http://localhost:5050/sse" },
      },
    });
    const manifestPath = path.join(pluginDir, ".plugin", "plugin.json");
    const sourceManifest = await fs.readJSON(manifestPath);
    sourceManifest["x-microsoft-365-agents-toolkit"] = {
      agentConnectors: {
        preserved: {
          authorization: {
            type: "ApiKeyPluginVault",
            referenceId: "existing-api-key-reference",
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
      .to.deep.equal(["local", "preserved", "public", "secure"]);
    chai
      .expect(
        manifest.agentConnectors.map(
          (connector: any) => connector.toolSource.remoteMcpServer.authorization.type
        )
      )
      .to.deep.equal(["None", "ApiKeyPluginVault", "None", "OAuthPluginVault"]);
    chai
      .expect(vi.mocked(mcpToolFetcher.probeMCPServerAuth).mock.calls.map((call) => call[0]))
      .to.deep.equal(["https://public.example.com/mcp", "https://secure.example.com/mcp"]);
    chai
      .expect(
        res.value.warnings
          .filter((warning) => warning.startsWith("Auto inferred"))
          .map((warning) => warning.match(/server '([^']+)'/)?.[1])
      )
      .to.deep.equal(["local", "public", "secure"]);
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
    }
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.readFile(path.join(outDir, "preexisting.txt"), "utf8")).to.equal("hi");
  });

  it("SCN-TOOLKIT-IMPORT-OPEN-PLUGIN-04: rejects excess connectors before discovery", async () => {
    const mcpServers: Record<string, { url: string }> = {};
    for (let index = 0; index < 11; index++) {
      mcpServers[`svc-${index}`] = { url: `https://svc-${index}.example.com/mcp` };
    }
    await fs.writeJSON(path.join(pluginDir, ".mcp.json"), { mcpServers });

    const res = await importOpenPlugin({
      path: pluginDir,
      output: outDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });

    chai.expect(res.isErr()).to.equal(true);
    chai.expect(mcpToolFetcher.probeMCPServerAuth).not.toHaveBeenCalled();
    chai.expect(mcpToolFetcher.resolveMCPOAuthMetadata).not.toHaveBeenCalled();
    chai.expect(Generator.generateTemplate).not.toHaveBeenCalled();
    chai.expect(await fs.pathExists(outDir)).to.equal(false);
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
