// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { chai } from "vitest";
import {
  ACCENT_COLOR,
  MANIFEST_SCHEMA_URL,
  MANIFEST_VERSION,
  mapToTtkProject,
} from "../../../../src/component/generator/openPlugin/mapper";
import {
  ImportInputs,
  ParsedOpenPlugin,
} from "../../../../src/component/generator/openPlugin/types";

function baseParsed(overrides: Partial<ParsedOpenPlugin> = {}): ParsedOpenPlugin {
  return {
    pluginRoot: "/tmp/plugin",
    manifest: {
      name: "demo-plugin",
      version: "2.0.0",
      description: "A demo Open Plugin used by the converter tests.",
      author: { name: "Jane Doe", email: "jane@example.com", url: "https://example.com" },
      homepage: "https://example.com",
    },
    manifestPath: "/tmp/plugin/.plugin/plugin.json",
    manifestKind: "open-plugin",
    mcpServers: {},
    skills: [],
    commands: [],
    hasColorPng: false,
    hasOutlinePng: false,
    warnings: [],
    ...overrides,
  };
}

function baseInputs(overrides: Partial<ImportInputs> = {}): ImportInputs {
  return {
    path: "/tmp/plugin",
    privacyUrl: "https://example.com/privacy",
    termsUrl: "https://example.com/terms",
    ...overrides,
  };
}

describe("openPlugin.mapToTtkProject", () => {
  it("emits the devPreview manifest skeleton", () => {
    const { manifest } = mapToTtkProject(baseParsed(), baseInputs());
    chai.expect(manifest.$schema).to.equal(MANIFEST_SCHEMA_URL);
    chai.expect(manifest.manifestVersion).to.equal(MANIFEST_VERSION);
    chai.expect(manifest.version).to.equal("2.0.0");
    chai.expect(manifest.accentColor).to.equal(ACCENT_COLOR);
    chai.expect(manifest.icons).to.deep.equal({ color: "color.png", outline: "outline.png" });
  });

  it("omits packageName when --package-name is not provided", () => {
    const { manifest } = mapToTtkProject(baseParsed(), baseInputs());
    chai.expect("packageName" in manifest).to.equal(false);
  });

  it("warns when --package-name is provided (not in devPreview schema)", () => {
    const { manifest, warnings } = mapToTtkProject(
      baseParsed(),
      baseInputs({ packageName: "com.example.my-plugin" })
    );
    chai.expect("packageName" in manifest).to.equal(false);
    chai.expect(warnings.some((w) => w.includes("packageName"))).to.equal(true);
  });

  it("emits agentSkills entries with leading ./skills/<name>", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({ skills: ["alpha", "beta"], skillsRoot: "/tmp/plugin/skills" }),
      baseInputs()
    );
    chai
      .expect(manifest.agentSkills)
      .to.deep.equal([{ folder: "./skills/alpha" }, { folder: "./skills/beta" }]);
  });

  it("emits agentConnectors for http servers with OAuthPluginVault under Auto", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({
        mcpServers: {
          alpha: { url: "https://alpha.example.com/api", description: "alpha tools" },
        },
      }),
      baseInputs()
    );
    chai.expect(manifest.agentConnectors).to.deep.equal([
      {
        id: "alpha",
        displayName: "alpha MCP Server",
        description: "alpha tools",
        toolSource: {
          remoteMcpServer: {
            mcpServerUrl: "https://alpha.example.com/api",
            authorization: {
              type: "OAuthPluginVault",
              referenceId: "demo-plugin-alpha-auth",
            },
          },
        },
      },
    ]);
  });

  it("maps localhost http servers to None under Auto", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({
        mcpServers: { local: { url: "http://localhost:5050/sse" } },
      }),
      baseInputs()
    );
    const connectors = manifest.agentConnectors as any[];
    chai.expect(connectors[0].toolSource.remoteMcpServer.authorization).to.deep.equal({
      type: "None",
    });
  });

  it("respects an explicit defaultAuthType override", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({
        mcpServers: { svc: { url: "https://svc.example.com" } },
      }),
      baseInputs({ defaultAuthType: "ApiKeyPluginVault" })
    );
    const connectors = manifest.agentConnectors as any[];
    chai.expect(connectors[0].toolSource.remoteMcpServer.authorization).to.deep.equal({
      type: "ApiKeyPluginVault",
      referenceId: "demo-plugin-svc-auth",
    });
  });

  it("skips stdio MCP servers (no url) with a warning", () => {
    const { manifest, warnings } = mapToTtkProject(
      baseParsed({
        mcpServers: {
          stdio: {} as any,
          http: { url: "https://http.example.com" },
        },
      }),
      baseInputs()
    );
    const connectors = manifest.agentConnectors as any[];
    chai.expect(connectors.map((c) => c.id)).to.deep.equal(["http"]);
    chai.expect(warnings.some((w) => w.includes("stdio"))).to.equal(true);
  });

  it("throws when more than 10 MCP servers would be emitted", () => {
    const mcpServers: Record<string, { url: string }> = {};
    for (let i = 0; i < 11; i++) {
      mcpServers[`svc-${i}`] = { url: `https://svc-${i}.example.com` };
    }
    chai
      .expect(() => mapToTtkProject(baseParsed({ mcpServers }), baseInputs()))
      .to.throw(/caps agentConnectors at 10/);
  });

  it("does not emit contactInfo (not in devPreview schema)", () => {
    const { manifest } = mapToTtkProject(baseParsed(), baseInputs());
    chai.expect((manifest.developer as any).contactInfo).to.equal(undefined);
  });

  it("falls back to --website-url when plugin.json has no homepage or author.url", () => {
    const parsed = baseParsed({
      manifest: { name: "demo-plugin" },
    });
    const { manifest } = mapToTtkProject(
      parsed,
      baseInputs({ websiteUrl: "https://override.example.com" })
    );
    chai.expect((manifest.developer as any).websiteUrl).to.equal("https://override.example.com");
  });

  it("throws when no website URL can be resolved", () => {
    const parsed = baseParsed({ manifest: { name: "demo-plugin" } });
    chai.expect(() => mapToTtkProject(parsed, baseInputs())).to.throw(/websiteUrl/);
  });

  it("uses the same deterministic id for the same plugin name", () => {
    const a = mapToTtkProject(baseParsed(), baseInputs()).manifest.id;
    const b = mapToTtkProject(baseParsed(), baseInputs()).manifest.id;
    chai.expect(a).to.equal(b);
  });

  it("throws when privacyUrl is missing", () => {
    chai
      .expect(() => mapToTtkProject(baseParsed(), baseInputs({ privacyUrl: "" })))
      .to.throw(/privacyUrl/);
  });

  it("throws when termsUrl is missing", () => {
    chai
      .expect(() => mapToTtkProject(baseParsed(), baseInputs({ termsUrl: "" })))
      .to.throw(/termsOfUseUrl/);
  });

  it("copies commands folder when present", () => {
    const { copyOps } = mapToTtkProject(
      baseParsed({
        commands: ["deploy.md", "status.md"],
        commandsRoot: "/tmp/plugin/commands",
      }),
      baseInputs()
    );
    chai.expect(copyOps.some((op) => op.destRelative === "appPackage/commands")).to.equal(true);
  });

  it("uses default description when connector has no description", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({
        mcpServers: { svc: { url: "https://svc.example.com" } },
      }),
      baseInputs()
    );
    const connectors = manifest.agentConnectors as any[];
    chai.expect(connectors[0].description).to.include("Remote MCP server");
  });
});
