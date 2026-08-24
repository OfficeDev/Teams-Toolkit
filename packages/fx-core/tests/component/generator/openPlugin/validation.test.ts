// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { chai } from "vitest";
import { OpenPluginInputError } from "../../../../src/component/generator/openPlugin/errors";
import {
  MCP_SCHEMA_URL,
  PLUGIN_SCHEMA_URL,
} from "../../../../src/component/generator/openPlugin/spec";
import {
  getRemoteMcpUrlError,
  parseAgentPluginManifest,
  parseAgentPluginMcpJson,
  parseAtkExtension,
  parseLegacyOpenPluginManifest,
} from "../../../../src/component/generator/openPlugin/validation";

describe("openPlugin validation", () => {
  it.each([
    ["a non-object manifest", null, /JSON object/],
    [
      "an incorrect schema",
      { $schema: "https://example.com/plugin.schema.json", name: "demo-plugin" },
      /\$schema/,
    ],
    ["an empty name", { $schema: PLUGIN_SCHEMA_URL, name: "" }, /required 'name'/],
    ["an invalid name", { $schema: PLUGIN_SCHEMA_URL, name: "Bad--Name" }, /constraints/],
    [
      "a non-string optional field",
      { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", homepage: 42 },
      /homepage.*string/,
    ],
    [
      "a non-object author",
      { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", author: "Jane" },
      /author.*object/,
    ],
    [
      "an unknown author field",
      { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", author: { company: "Contoso" } },
      /author\.company.*not permitted/,
    ],
    [
      "non-string keywords",
      { $schema: PLUGIN_SCHEMA_URL, name: "demo-plugin", keywords: ["agent", 42] },
      /keywords.*array of strings/,
    ],
  ])("AP-VALIDATE-06: rejects %s", (_description, manifest, expected) => {
    chai.expect(() => parseAgentPluginManifest(manifest)).to.throw(OpenPluginInputError, expected);
  });

  it("AP-VALIDATE-07: preserves all supported 1.0.0 metadata", () => {
    const parsed = parseAgentPluginManifest({
      $schema: PLUGIN_SCHEMA_URL,
      name: "demo-plugin",
      version: "1.2.3",
      description: "Demo plugin",
      homepage: "https://example.com",
      repository: "https://example.com/repo",
      license: "MIT",
      author: {
        name: "Jane Doe",
        email: "jane@example.com",
        url: "https://example.com/jane",
      },
      keywords: ["agent", "plugin"],
      extensions: { "com.example.client": { enabled: true } },
      skills: "./relocated-skills",
    });

    chai.expect(parsed.manifest).to.deep.equal({
      $schema: PLUGIN_SCHEMA_URL,
      name: "demo-plugin",
      version: "1.2.3",
      description: "Demo plugin",
      homepage: "https://example.com",
      repository: "https://example.com/repo",
      license: "MIT",
      author: {
        name: "Jane Doe",
        email: "jane@example.com",
        url: "https://example.com/jane",
      },
      keywords: ["agent", "plugin"],
      extensions: { "com.example.client": { enabled: true } },
    });
    chai.expect(parsed.warnings).to.have.lengthOf(1);
    chai.expect(parsed.warnings[0]).to.include("component locations are fixed");
  });

  it("AP-VALIDATE-09: warns and ignores malformed extensions and unknown fields", () => {
    const parsed = parseAgentPluginManifest({
      $schema: PLUGIN_SCHEMA_URL,
      name: "demo-plugin",
      extensions: [],
      futureField: true,
    });

    chai.expect(parsed.manifest.extensions).to.equal(undefined);
    chai.expect(parsed.warnings.some((warning) => warning.includes("extensions"))).to.equal(true);
    chai.expect(parsed.warnings.some((warning) => warning.includes("futureField"))).to.equal(true);
  });

  it("AP-VALIDATE-10: rejects a legacy manifest without a name", () => {
    chai
      .expect(() => parseLegacyOpenPluginManifest({ version: "0.9.0" }))
      .to.throw(OpenPluginInputError, /required 'name'/);
  });

  it("AP-VALIDATE-08: preserves supported legacy manifest fields", () => {
    const parsed = parseLegacyOpenPluginManifest({
      $schema: "https://example.com/legacy-schema.json",
      name: "legacy-plugin",
      version: "0.9.0",
      description: "Legacy plugin",
      homepage: "https://example.com",
      repository: "https://example.com/repo",
      license: "MIT",
      author: "Jane Doe",
      keywords: ["legacy"],
      extensions: { "com.example.client": true },
      logo: "logo.png",
      skills: "./custom-skills",
      commands: ["./commands"],
      agents: { primary: "./agent.md" },
      hooks: "./hooks",
      mcpServers: "./mcp.json",
      lspServers: ["./lsp.json"],
      rules: { enabled: true },
      outputStyles: ["compact"],
      "x-microsoft-365-agents-toolkit": { manifestVersion: "devPreview" },
    });

    chai.expect(parsed).to.deep.equal({
      $schema: "https://example.com/legacy-schema.json",
      name: "legacy-plugin",
      version: "0.9.0",
      description: "Legacy plugin",
      homepage: "https://example.com",
      repository: "https://example.com/repo",
      license: "MIT",
      author: "Jane Doe",
      keywords: ["legacy"],
      extensions: { "com.example.client": true },
      logo: "logo.png",
      skills: "./custom-skills",
      commands: ["./commands"],
      agents: { primary: "./agent.md" },
      hooks: "./hooks",
      mcpServers: "./mcp.json",
      lspServers: ["./lsp.json"],
      rules: { enabled: true },
      outputStyles: ["compact"],
      legacyAtkExtension: { manifestVersion: "devPreview" },
    });
  });

  it("AP-EXT-02: preserves valid Toolkit extension metadata", () => {
    const warnings: string[] = [];
    const extension = parseAtkExtension(
      {
        manifestVersion: "devPreview",
        id: "12345678-1234-1234-1234-123456789abc",
        packageName: "com.example.demo",
        accentColor: "#123ABC",
        developer: {
          name: "Jane Doe",
          websiteUrl: "https://example.com",
          privacyUrl: "https://example.com/privacy",
          termsOfUseUrl: "https://example.com/terms",
        },
        name: { short: "Demo", full: "Demo Plugin" },
        description: { short: "Short", full: "Full description" },
        agentConnectors: {
          web: {
            displayName: "Web MCP",
            description: "Remote server",
            authorization: { type: "OAuthPluginVault", referenceId: "demo/web" },
          },
        },
      },
      warnings
    );

    chai.expect(warnings).to.deep.equal([]);
    chai.expect(extension).to.deep.equal({
      manifestVersion: "devPreview",
      id: "12345678-1234-1234-1234-123456789abc",
      packageName: "com.example.demo",
      accentColor: "#123ABC",
      developer: {
        name: "Jane Doe",
        websiteUrl: "https://example.com",
        privacyUrl: "https://example.com/privacy",
        termsOfUseUrl: "https://example.com/terms",
      },
      name: { short: "Demo", full: "Demo Plugin" },
      description: { short: "Short", full: "Full description" },
      agentConnectors: {
        web: {
          displayName: "Web MCP",
          description: "Remote server",
          authorization: { type: "OAuthPluginVault", referenceId: "demo/web" },
        },
      },
    });
  });

  it("AP-EXT-03: warns and drops invalid Toolkit extension metadata", () => {
    const nonObjectWarnings: string[] = [];
    chai.expect(parseAtkExtension([], nonObjectWarnings)).to.equal(undefined);
    chai.expect(nonObjectWarnings).to.have.lengthOf(1);

    const warnings: string[] = [];
    const extension = parseAtkExtension(
      {
        manifestVersion: "1.0",
        id: "not-a-guid",
        packageName: "",
        accentColor: "blue",
        developer: "Jane Doe",
        name: "Demo",
        description: { short: "", full: 42 },
        agentConnectors: {
          invalid: [],
          malformed: { displayName: "", description: 42, authorization: "None" },
          unsupportedAuth: { authorization: { type: "BypassDiscovery" } },
          invalidReference: { authorization: { type: "None", referenceId: "" } },
        },
        futureField: true,
      },
      warnings
    );

    chai.expect(extension).to.deep.equal({
      agentConnectors: {
        invalidReference: { authorization: { type: "None" } },
      },
    });
    for (const field of [
      "manifestVersion",
      "id",
      "packageName",
      "accentColor",
      "developer",
      "name",
      "description.short",
      "description.full",
      "invalid",
      "malformed.displayName",
      "malformed.description",
      "malformed.authorization",
      "unsupportedAuth.authorization.type",
      "invalidReference.authorization.referenceId",
      "futureField",
    ]) {
      chai
        .expect(
          warnings.some((warning) => warning.includes(field)),
          field
        )
        .to.equal(true);
    }

    const nestedWarnings: string[] = [];
    chai
      .expect(
        parseAtkExtension(
          { developer: { websiteUrl: "not-a-url" }, agentConnectors: [] },
          nestedWarnings
        )
      )
      .to.equal(undefined);
    chai.expect(nestedWarnings.some((warning) => warning.includes("websiteUrl"))).to.equal(true);
    chai
      .expect(nestedWarnings.some((warning) => warning.includes("agentConnectors")))
      .to.equal(true);
  });

  it("AP-EXT-04: drops connector metadata that exceeds Teams manifest limits", () => {
    const warnings: string[] = [];
    const extension = parseAtkExtension(
      {
        agentConnectors: {
          web: {
            displayName: "d".repeat(129),
            description: "d".repeat(4001),
            authorization: {
              type: "OAuthPluginVault",
              referenceId: "r".repeat(129),
            },
          },
        },
      },
      warnings
    );

    chai.expect(extension).to.deep.equal({
      agentConnectors: {
        web: { authorization: { type: "OAuthPluginVault" } },
      },
    });
    for (const field of ["displayName", "description", "referenceId"]) {
      chai
        .expect(
          warnings.some((warning) => warning.includes(field)),
          field
        )
        .to.equal(true);
    }
  });

  it("AP-EXT-05: counts Unicode code points for connector metadata limits", () => {
    const displayName = "😀".repeat(128);
    const description = "😀".repeat(4000);
    const referenceId = "😀".repeat(128);
    const warnings: string[] = [];

    const extension = parseAtkExtension(
      {
        agentConnectors: {
          web: {
            displayName,
            description,
            authorization: { type: "OAuthPluginVault", referenceId },
          },
        },
      },
      warnings
    );

    chai.expect(warnings).to.deep.equal([]);
    chai.expect(extension).to.deep.equal({
      agentConnectors: {
        web: {
          displayName,
          description,
          authorization: { type: "OAuthPluginVault", referenceId },
        },
      },
    });
  });

  it.each([
    [null, "JSON object"],
    [{ $schema: MCP_SCHEMA_URL, mcpServers: {}, futureField: true }, "unsupported top-level"],
    [{ $schema: "https://example.com/schema.json", mcpServers: {} }, "$schema"],
    [{ $schema: MCP_SCHEMA_URL, mcpServers: [] }, "mcpServers"],
  ])("AP-MCP-11: disables an invalid top-level MCP config", (config, warningFragment) => {
    const parsed = parseAgentPluginMcpJson(config);

    chai.expect(parsed.mcpServers).to.deep.equal({});
    chai.expect(parsed.warnings[0]).to.include(warningFragment);
  });

  it("AP-MCP-12: skips every invalid MCP server shape with a targeted warning", () => {
    const parsed = parseAgentPluginMcpJson({
      $schema: MCP_SCHEMA_URL,
      mcpServers: {
        missingType: {},
        unsupported: { type: "websocket" },
        stdioUnknown: { type: "stdio", command: "node", futureField: true },
        stdioEmpty: { type: "stdio", command: "" },
        stdioPath: { type: "stdio", command: "../node" },
        stdioArgs: { type: "stdio", command: "node", args: [42] },
        stdioEnv: { type: "stdio", command: "node", env: { PLUGIN_ROOT: "override" } },
        stdioCwd: { type: "stdio", command: "node", cwd: "../outside" },
        remoteUnknown: {
          type: "sse",
          url: "https://example.com/mcp",
          futureField: true,
        },
        remoteUrl: { type: "streamable-http", url: "relative/mcp" },
        remoteHeaders: {
          type: "sse",
          url: "https://example.com/mcp",
          headers: { "Bad Header": "value" },
        },
        duplicateHeaders: {
          type: "sse",
          url: "https://example.com/mcp",
          headers: { "X-Test": "first", "x-test": "second" },
        },
      },
    });

    chai.expect(parsed.mcpServers).to.deep.equal({});
    const expectedWarnings = {
      missingType: "explicit transport type",
      unsupported: "not supported",
      stdioUnknown: "not permitted for stdio",
      stdioEmpty: "non-empty command",
      stdioPath: "bare or plugin-relative token",
      stdioArgs: "array of strings",
      stdioEnv: "cannot override",
      stdioCwd: "contained plugin or plugin-data path",
      remoteUnknown: "not permitted for remote MCP",
      remoteUrl: "must be absolute",
      remoteHeaders: "valid HTTP header names",
      duplicateHeaders: "valid HTTP header names",
    };
    chai.expect(parsed.warnings).to.have.lengthOf(Object.keys(expectedWarnings).length);
    for (const [serverName, reason] of Object.entries(expectedWarnings)) {
      chai
        .expect(
          parsed.warnings.some(
            (warning) => warning.includes(`'${serverName}'`) && warning.includes(reason)
          ),
          serverName
        )
        .to.equal(true);
    }
    chai.expect(parsed.invalidRemoteMcpServers).to.deep.equal(["remoteUrl"]);
  });

  it("AP-MCP-13: preserves all supported MCP server fields", () => {
    const parsed = parseAgentPluginMcpJson({
      $schema: MCP_SCHEMA_URL,
      mcpServers: {
        local: {
          type: "stdio",
          command: "./bin/server",
          args: ["--stdio"],
          env: { MODE: "test" },
          cwd: "${PLUGIN_DATA}/cache",
        },
        remote: {
          type: "streamable-http",
          url: "https://example.com/mcp",
          headers: { "X-Tenant": "public" },
        },
      },
    });

    chai.expect(parsed.warnings).to.deep.equal([]);
    chai.expect(parsed.mcpServers.local).to.deep.equal({
      type: "stdio",
      command: "./bin/server",
      args: ["--stdio"],
      env: { MODE: "test" },
      cwd: "${PLUGIN_DATA}/cache",
    });
    chai.expect(parsed.mcpServers.remote).to.deep.equal({
      type: "streamable-http",
      url: "https://example.com/mcp",
      headers: { "X-Tenant": "public" },
    });
  });

  it.each([
    [undefined, "non-empty URL"],
    ["relative/mcp", "absolute"],
    ["ftp://example.com/mcp", "HTTP or HTTPS"],
    ["https://user@example.com/mcp", "user information"],
    ["https://example.com/mcp#tools", "fragment"],
    ["http://example.com/mcp", "must use HTTPS"],
    ["http://localhost:3000/mcp", undefined],
    ["http://127.0.0.1:3000/mcp", undefined],
    ["http://[::1]:3000/mcp", undefined],
    ["http://[::ffff:7f00:1]:3000/mcp", undefined],
  ])("AP-MCP-14: validates remote MCP URL %s", (url, expected) => {
    const error = getRemoteMcpUrlError(url);
    if (expected === undefined) {
      chai.expect(error).to.equal(undefined);
    } else {
      chai.expect(error).to.include(expected);
    }
  });
});
