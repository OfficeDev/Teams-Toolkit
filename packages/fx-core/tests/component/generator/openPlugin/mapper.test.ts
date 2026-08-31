// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createHash } from "crypto";
import * as path from "path";
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
    manifestPath: "/tmp/plugin/plugin.json",
    manifestKind: "agent-plugin",
    isLegacyLayout: false,
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

  it("uses a resolved OAuthPluginVault type under Auto", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({
        mcpServers: {
          alpha: { url: "https://alpha.example.com/api", description: "alpha tools" },
        },
      }),
      baseInputs(),
      { alpha: "OAuthPluginVault" }
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

  it("OPI-AUTH-07: skips an HTTP loopback URL that Teams cannot represent", () => {
    const { manifest, warnings } = mapToTtkProject(
      baseParsed({
        mcpServers: { local: { url: "http://localhost:5050/sse" } },
      }),
      baseInputs(),
      { local: "None" }
    );
    chai.expect(manifest.agentConnectors).to.equal(undefined);
    chai.expect(warnings.some((warning) => warning.includes("requires HTTPS"))).to.equal(true);
  });

  it("AP-MAP-01: skips a malformed remote MCP URL", () => {
    const { manifest, warnings } = mapToTtkProject(
      baseParsed({
        mcpServers: { invalid: { url: "not a URL" } },
      }),
      baseInputs(),
      { invalid: "None" }
    );

    chai.expect(manifest.agentConnectors).to.equal(undefined);
    chai.expect(warnings.some((warning) => warning.includes("requires HTTPS"))).to.equal(true);
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

  it("AP-MAP-02: bounds generated authorization reference IDs without collisions", () => {
    const pluginName = "p".repeat(64);
    const sharedServerPrefix = "s".repeat(63);
    const parsed = baseParsed({
      manifest: { ...baseParsed().manifest, name: pluginName },
      mcpServers: {
        [`${sharedServerPrefix}a`]: { url: "https://a.example.com" },
        [`${sharedServerPrefix}b`]: { url: "https://b.example.com" },
      },
    });

    const first = mapToTtkProject(parsed, baseInputs({ defaultAuthType: "ApiKeyPluginVault" }));
    const second = mapToTtkProject(parsed, baseInputs({ defaultAuthType: "ApiKeyPluginVault" }));
    const firstReferenceIds = (first.manifest.agentConnectors as any[]).map(
      (connector) => connector.toolSource.remoteMcpServer.authorization.referenceId
    );
    const secondReferenceIds = (second.manifest.agentConnectors as any[]).map(
      (connector) => connector.toolSource.remoteMcpServer.authorization.referenceId
    );

    chai.expect(firstReferenceIds.every((referenceId) => referenceId.length <= 128)).to.equal(true);
    chai
      .expect(firstReferenceIds.every((referenceId) => /-[0-9a-f]{12}-auth$/.test(referenceId)))
      .to.equal(true);
    chai.expect(new Set(firstReferenceIds).size).to.equal(2);
    chai.expect(secondReferenceIds).to.deep.equal(firstReferenceIds);
  });

  it.each([
    "manifest.json",
    "COLOR.PNG",
    "skills",
    "skills/alpha-skill/tool.json",
    "commands/deploy.md/nested.json",
  ])("AP-MAP-03: rejects MCP tool-description collision at %s", (file) => {
    const parsed = baseParsed({
      mcpServers: { svc: { url: "https://svc.example.com" } },
      skills: ["alpha-skill"],
      skillsRoot: "/tmp/plugin/skills",
      commands: ["deploy.md"],
      commandsRoot: "/tmp/plugin/commands",
      atkExtension: {
        agentConnectors: {
          svc: {
            mcpToolDescription: { file, source: "source.json", contents: Buffer.from("{}") },
          },
        },
      },
    });

    chai
      .expect(() => mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" })))
      .to.throw(/MCP tool-description path.*collides/i);
  });

  it("AP-MAP-04: rejects case-insensitive MCP tool-description collisions", () => {
    const parsed = baseParsed({
      mcpServers: {
        alpha: { url: "https://alpha.example.com" },
        beta: { url: "https://beta.example.com" },
      },
      atkExtension: {
        agentConnectors: {
          alpha: {
            mcpToolDescription: {
              file: "descriptions/tools.json",
              source: "alpha.json",
              contents: Buffer.from("alpha"),
            },
          },
          beta: {
            mcpToolDescription: {
              file: "DESCRIPTIONS/TOOLS.JSON",
              source: "beta.json",
              contents: Buffer.from("beta"),
            },
          },
        },
      },
    });

    chai
      .expect(() => mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" })))
      .to.throw(/MCP tool-description paths.*collide/i);
  });

  it("AP-MAP-05: reserves the generated skills directory when no skills exist", () => {
    const parsed = baseParsed({
      mcpServers: { svc: { url: "https://svc.example.com" } },
      atkExtension: {
        agentConnectors: {
          svc: {
            mcpToolDescription: {
              file: "skills",
              source: "source.json",
              contents: Buffer.from("{}"),
            },
          },
        },
      },
    });

    chai
      .expect(() => mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" })))
      .to.throw(/MCP tool-description path.*collides/i);
  });

  it("AP-MAP-10: rejects an escaping MCP tool-description destination", () => {
    const parsed = baseParsed({
      mcpServers: { svc: { url: "https://svc.example.com" } },
      atkExtension: {
        agentConnectors: {
          svc: {
            mcpToolDescription: {
              file: "../escape.json",
              source: "source.json",
              contents: Buffer.from("{}"),
            },
          },
        },
      },
    });

    chai
      .expect(() => mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" })))
      .to.throw(/must identify a file within appPackage/i);
  });

  it("AP-MAP-11: deduplicates identical MCP tool-description destinations", () => {
    const contents = Buffer.from("{}");
    const parsed = baseParsed({
      mcpServers: {
        alpha: { url: "https://alpha.example.com" },
        beta: { url: "https://beta.example.com" },
      },
      atkExtension: {
        agentConnectors: {
          alpha: {
            mcpToolDescription: { file: "descriptions/tools.json", contents, source: "a.json" },
          },
          beta: {
            mcpToolDescription: { file: "descriptions/tools.json", contents, source: "b.json" },
          },
        },
      },
    });

    const mapped = mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" }));

    chai.expect(mapped.copyOps).to.have.length(1);
    chai
      .expect(mapped.copyOps[0].destRelative)
      .to.equal(path.join("appPackage", "descriptions", "tools.json"));
  });

  it("AP-MAP-12: rejects ancestor MCP tool-description destinations", () => {
    const parsed = baseParsed({
      mcpServers: {
        alpha: { url: "https://alpha.example.com" },
        beta: { url: "https://beta.example.com" },
      },
      atkExtension: {
        agentConnectors: {
          alpha: {
            mcpToolDescription: {
              file: "descriptions",
              contents: Buffer.from("alpha"),
              source: "a.json",
            },
          },
          beta: {
            mcpToolDescription: {
              file: "descriptions/tools.json",
              contents: Buffer.from("beta"),
              source: "b.json",
            },
          },
        },
      },
    });

    chai
      .expect(() => mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" })))
      .to.throw(/MCP tool-description paths.*collide/i);
  });

  it("AP-MAP-13: preserves an empty MCP tool-description override", () => {
    const parsed = baseParsed({
      mcpServers: { svc: { url: "https://svc.example.com" } },
      atkExtension: { agentConnectors: { svc: { mcpToolDescription: {} } } },
    });

    const mapped = mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" }));

    chai.expect(mapped.manifest.agentConnectors).to.deep.equal([
      {
        id: "svc",
        displayName: "svc MCP Server",
        description: "Remote MCP server providing tools for demo-plugin",
        toolSource: {
          remoteMcpServer: {
            mcpServerUrl: "https://svc.example.com",
            authorization: { type: "None" },
            mcpToolDescription: {},
          },
        },
      },
    ]);
    chai.expect(mapped.copyOps).to.deep.equal([]);
  });

  it("AP-MAP-06: bounds connector fields for long Agent Plugin server names", () => {
    const sharedServerPrefix = "s".repeat(150);
    const firstServerName = `${sharedServerPrefix}a`;
    const firstDerivedId = `${firstServerName.slice(0, 51)}-${createHash("sha256")
      .update(firstServerName)
      .digest("hex")
      .slice(0, 12)}`;
    const parsed = baseParsed({
      mcpServers: {
        [firstServerName]: {
          url: "https://a.example.com",
          description: "d".repeat(4001),
        },
        [`${sharedServerPrefix}b`]: {
          url: "https://b.example.com",
          description: "d".repeat(4001),
        },
        [firstDerivedId]: { url: "https://short.example.com" },
      },
    });

    const first = mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" }));
    const second = mapToTtkProject(parsed, baseInputs({ defaultAuthType: "None" }));
    const firstConnectors = first.manifest.agentConnectors as any[];
    const secondConnectors = second.manifest.agentConnectors as any[];

    chai.expect(firstConnectors.every((connector) => connector.id.length <= 64)).to.equal(true);
    chai
      .expect(firstConnectors.every((connector) => /-[0-9a-f]{12}$/.test(connector.id)))
      .to.equal(true);
    chai.expect(new Set(firstConnectors.map((connector) => connector.id)).size).to.equal(3);
    chai
      .expect(firstConnectors.some((connector) => connector.id === firstDerivedId))
      .to.equal(true);
    chai
      .expect(firstConnectors.every((connector) => connector.displayName.length <= 128))
      .to.equal(true);
    chai
      .expect(firstConnectors.every((connector) => connector.description.length <= 4000))
      .to.equal(true);
    chai
      .expect(secondConnectors.map((connector) => connector.id))
      .to.deep.equal(firstConnectors.map((connector) => connector.id));
  });

  it("AP-MAP-07: slices bounded connector fields at Unicode code-point boundaries", () => {
    const serverName = "😀".repeat(70);
    const hash = createHash("sha256").update(serverName).digest("hex").slice(0, 12);
    const expectedId = `${[...serverName].slice(0, 51).join("")}-${hash}`;

    const mapped = mapToTtkProject(
      baseParsed({ mcpServers: { [serverName]: { url: "https://unicode.example.com" } } }),
      baseInputs({ defaultAuthType: "ApiKeyPluginVault" })
    );
    const connector = (mapped.manifest.agentConnectors as any[])[0];

    chai.expect(connector.id).to.equal(expectedId);
    chai.expect(Buffer.from(connector.id, "utf8").toString("utf8")).to.equal(connector.id);
    chai.expect(connector.displayName).to.equal(`${serverName} MCP Server`);
    chai
      .expect(connector.toolSource.remoteMcpServer.authorization.referenceId)
      .to.equal(`demo-plugin-${serverName}-auth`);
  });

  it("AP-MAP-08: truncates manifest descriptions by Unicode code points", () => {
    const exactLimit = "😀".repeat(80);
    const splitBoundary = `${"a".repeat(79)}😀z`;

    const exactMapped = mapToTtkProject(
      baseParsed({ manifest: { ...baseParsed().manifest, description: exactLimit } }),
      baseInputs()
    );
    const splitMapped = mapToTtkProject(
      baseParsed({ manifest: { ...baseParsed().manifest, description: splitBoundary } }),
      baseInputs()
    );

    chai.expect((exactMapped.manifest.description as { short: string }).short).to.equal(exactLimit);
    chai
      .expect((splitMapped.manifest.description as { short: string }).short)
      .to.equal(`${"a".repeat(79)}😀`);
  });

  it("skips stdio MCP servers (no url) with a warning", () => {
    const { manifest, warnings } = mapToTtkProject(
      baseParsed({
        mcpServers: {
          stdio: {} as any,
          http: { url: "https://http.example.com" },
        },
      }),
      baseInputs(),
      { http: "OAuthPluginVault" }
    );
    const connectors = manifest.agentConnectors as any[];
    chai.expect(connectors.map((c) => c.id)).to.deep.equal(["http"]);
    chai.expect(warnings.some((w) => w.includes("stdio"))).to.equal(true);
  });

  it("throws when more than 10 MCP servers would be emitted", () => {
    const mcpServers: Record<string, { url: string }> = {};
    const authTypes: Record<string, "OAuthPluginVault"> = {};
    for (let i = 0; i < 11; i++) {
      mcpServers[`svc-${i}`] = { url: `https://svc-${i}.example.com` };
      authTypes[`svc-${i}`] = "OAuthPluginVault";
    }
    chai
      .expect(() => mapToTtkProject(baseParsed({ mcpServers }), baseInputs(), authTypes))
      .to.throw(/caps agentConnectors at 10/);
  });

  it("AP-MAP-09: excludes skipped HTTP servers from the connector limit", () => {
    const mcpServers: Record<string, { url: string }> = {
      skipped: { url: "http://localhost:3000" },
    };
    for (let index = 0; index < 10; index++) {
      mcpServers[`svc-${index}`] = { url: `https://svc-${index}.example.com` };
    }

    const { manifest, warnings } = mapToTtkProject(
      baseParsed({ mcpServers }),
      baseInputs({ defaultAuthType: "None" })
    );

    chai.expect(manifest.agentConnectors).to.have.length(10);
    chai.expect(warnings.some((warning) => warning.includes("requires HTTPS"))).to.equal(true);
  });

  it("OPI-AUTH-07: does not guess when an Auto resolution is missing", () => {
    chai
      .expect(() =>
        mapToTtkProject(
          baseParsed({ mcpServers: { svc: { url: "https://svc.example.com" } } }),
          baseInputs()
        )
      )
      .to.throw(/Missing resolved auth type/);
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

  it("copies only discovered command files when present", () => {
    const { copyOps } = mapToTtkProject(
      baseParsed({
        commands: ["deploy.md", "status.md"],
        commandsRoot: "/tmp/plugin/commands",
      }),
      baseInputs()
    );
    chai
      .expect(copyOps.filter((op) => op.kind === "file").map((op) => op.destRelative))
      .to.deep.equal(["appPackage/commands/deploy.md", "appPackage/commands/status.md"]);
  });

  it("uses default description when connector has no description", () => {
    const { manifest } = mapToTtkProject(
      baseParsed({
        mcpServers: { svc: { url: "https://svc.example.com" } },
      }),
      baseInputs(),
      { svc: "OAuthPluginVault" }
    );
    const connectors = manifest.agentConnectors as any[];
    chai.expect(connectors[0].description).to.include("Remote MCP server");
  });
});
