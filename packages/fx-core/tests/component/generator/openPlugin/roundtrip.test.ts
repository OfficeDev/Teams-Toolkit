// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { setTools } from "../../../../src/common/globalVars";
import { Generator } from "../../../../src/component/generator/generator";
import { exportOpenPlugin } from "../../../../src/component/generator/openPlugin/exporter";
import { importOpenPlugin } from "../../../../src/component/generator/openPlugin/importer";
import { MockTools } from "../../../core/utils";
import { scaffoldOpenPluginTemplateFromSource } from "./testTemplateScaffold";
import { chai, vi } from "vitest";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedSamplePlugin(root: string): Promise<void> {
  await fs.writeJSON(path.join(root, "plugin.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "demo-plugin",
    version: "1.2.3",
    description: "A demo Agent Plugin for the round-trip test.",
    author: { name: "Jane Doe", url: "https://example.com" },
    homepage: "https://example.com",
  });
  await fs.writeJSON(path.join(root, "mcp.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      web: { type: "streamable-http", url: "https://web.example.com/api" },
    },
  });
  await fs.ensureDir(path.join(root, "skills", "alpha-skill"));
  await fs.writeFile(
    path.join(root, "skills", "alpha-skill", "SKILL.md"),
    "---\nname: alpha-skill\ndescription: hi\n---\nbody"
  );
}

describe("openPlugin.roundtrip (import → export → import)", () => {
  setTools(new MockTools());

  beforeEach(() => {
    vi.spyOn(Generator, "generateTemplate").mockImplementation(async (ctx, dest) => {
      const appName = ctx.templateVariables?.appName ?? "";
      await scaffoldOpenPluginTemplateFromSource(dest, { appName });
      return ok(undefined);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips losslessly without needing --privacy-url/--terms-url the second time", async () => {
    const sourceDir = await tmp("op-roundtrip-source-");
    const firstProject = await tmp("op-roundtrip-first-");
    const exportedPlugin = await tmp("op-roundtrip-export-");
    const secondProject = await tmp("op-roundtrip-second-");
    try {
      await seedSamplePlugin(sourceDir);
      const firstImport = await importOpenPlugin({
        path: sourceDir,
        output: firstProject,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType: "None",
      });
      if (firstImport.isErr()) throw new Error(firstImport.error.message);

      const exported = await exportOpenPlugin({ path: firstProject, output: exportedPlugin });
      if (exported.isErr()) throw new Error(exported.error.message);

      const secondImport = await importOpenPlugin({
        path: exportedPlugin,
        output: secondProject,
      });
      if (secondImport.isErr()) throw new Error(secondImport.error.message);

      const firstManifest = await fs.readFile(
        path.join(firstProject, "appPackage", "manifest.json"),
        "utf8"
      );
      const secondManifest = await fs.readFile(
        path.join(secondProject, "appPackage", "manifest.json"),
        "utf8"
      );
      chai.expect(secondManifest).to.equal(firstManifest);

      const exportedMcp = await fs.readJSON(path.join(exportedPlugin, "mcp.json"));
      chai
        .expect(exportedMcp.$schema)
        .to.equal("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
      chai.expect(exportedMcp.mcpServers.web.type).to.equal("streamable-http");

      const sourceSkill = await fs.readFile(
        path.join(sourceDir, "skills", "alpha-skill", "SKILL.md"),
        "utf8"
      );
      const secondSkill = await fs.readFile(
        path.join(secondProject, "appPackage", "skills", "alpha-skill", "SKILL.md"),
        "utf8"
      );
      chai.expect(secondSkill).to.equal(sourceSkill);
    } finally {
      await Promise.all(
        [sourceDir, firstProject, exportedPlugin, secondProject].map(
          async (directory) => await fs.remove(directory)
        )
      );
    }
  });

  it("AP-ROUNDTRIP-01: preserves an MCP server named __proto__", async () => {
    const sourceDir = await tmp("op-reserved-source-");
    const firstProject = await tmp("op-reserved-first-");
    const exportedPlugin = await tmp("op-reserved-export-");
    const secondProject = await tmp("op-reserved-second-");
    try {
      await seedSamplePlugin(sourceDir);
      const firstImport = await importOpenPlugin({
        path: sourceDir,
        output: firstProject,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType: "None",
      });
      if (firstImport.isErr()) throw new Error(firstImport.error.message);

      const firstManifestPath = path.join(firstProject, "appPackage", "manifest.json");
      const firstManifest = await fs.readJSON(firstManifestPath);
      firstManifest.agentConnectors[0].id = "__proto__";
      await fs.writeJSON(firstManifestPath, firstManifest, { spaces: 4 });

      const exported = await exportOpenPlugin({ path: firstProject, output: exportedPlugin });
      if (exported.isErr()) throw new Error(exported.error.message);
      chai.expect(await fs.pathExists(path.join(exportedPlugin, "mcp.json"))).to.equal(true);
      const exportedMcp = await fs.readJSON(path.join(exportedPlugin, "mcp.json"));
      chai.expect(Object.keys(exportedMcp.mcpServers)).to.deep.equal(["__proto__"]);

      const secondImport = await importOpenPlugin({
        path: exportedPlugin,
        output: secondProject,
      });
      if (secondImport.isErr()) throw new Error(secondImport.error.message);
      const secondManifest = await fs.readJSON(
        path.join(secondProject, "appPackage", "manifest.json")
      );
      chai.expect(secondManifest.agentConnectors[0].id).to.equal("__proto__");
    } finally {
      await Promise.all(
        [sourceDir, firstProject, exportedPlugin, secondProject].map(
          async (directory) => await fs.remove(directory)
        )
      );
    }
  });

  it("AP-ROUNDTRIP-02: preserves reusable and MCP tool-description fields", async () => {
    const sourceDir = await tmp("op-tool-description-source-");
    const firstProject = await tmp("op-tool-description-first-");
    const exportedPlugin = await tmp("op-tool-description-export-");
    const secondProject = await tmp("op-tool-description-second-");
    try {
      await seedSamplePlugin(sourceDir);
      const firstImport = await importOpenPlugin({
        path: sourceDir,
        output: firstProject,
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
        defaultAuthType: "None",
      });
      if (firstImport.isErr()) throw new Error(firstImport.error.message);

      const toolDescription = '{"tools":[{"name":"search"}]}';
      const toolDescriptionFile = "mcp-tool-description.json";
      const firstManifestPath = path.join(firstProject, "appPackage", "manifest.json");
      const firstManifest = await fs.readJSON(firstManifestPath);
      firstManifest.agentConnectors[0].reusable = false;
      firstManifest.agentConnectors[0].toolSource.remoteMcpServer.mcpToolDescription = {
        file: toolDescriptionFile,
      };
      await fs.writeJSON(firstManifestPath, firstManifest, { spaces: 4 });
      await fs.writeFile(
        path.join(firstProject, "appPackage", toolDescriptionFile),
        toolDescription
      );

      const exported = await exportOpenPlugin({ path: firstProject, output: exportedPlugin });
      if (exported.isErr()) throw new Error(exported.error.message);
      const exportedManifest = await fs.readJSON(path.join(exportedPlugin, "plugin.json"));
      const preservedDescription =
        exportedManifest.extensions["com.microsoft.agents-toolkit"].agentConnectors.web
          .mcpToolDescription;
      chai.expect(preservedDescription).to.deep.equal({
        file: toolDescriptionFile,
        source: ".microsoft-agents-toolkit/mcp-tool-descriptions/0.json",
      });
      vi.mocked(Generator.generateTemplate).mockImplementation(async (ctx, dest) => {
        await fs.remove(path.join(exportedPlugin, preservedDescription.source));
        const appName = ctx.templateVariables?.appName ?? "";
        await scaffoldOpenPluginTemplateFromSource(dest, { appName });
        return ok(undefined);
      });
      const secondImport = await importOpenPlugin({
        path: exportedPlugin,
        output: secondProject,
      });
      if (secondImport.isErr()) throw new Error(secondImport.error.message);

      const secondManifest = await fs.readJSON(
        path.join(secondProject, "appPackage", "manifest.json")
      );
      chai.expect(secondManifest.agentConnectors[0].reusable).to.equal(false);
      chai
        .expect(secondManifest.agentConnectors[0].toolSource.remoteMcpServer.mcpToolDescription)
        .to.deep.equal({ file: toolDescriptionFile });
      chai
        .expect(
          await fs.readFile(path.join(secondProject, "appPackage", toolDescriptionFile), "utf8")
        )
        .to.equal(toolDescription);
    } finally {
      await Promise.all(
        [sourceDir, firstProject, exportedPlugin, secondProject].map(
          async (directory) => await fs.remove(directory)
        )
      );
    }
  });

  for (const authorizationType of [
    "None",
    "OAuthPluginVault",
    "ApiKeyPluginVault",
    "DynamicClientRegistration",
    "AzureKeyVault",
  ]) {
    it(`round-trips ${authorizationType} connector authorization`, async () => {
      const sourceDir = await tmp("op-auth-source-");
      const firstProject = await tmp("op-auth-first-");
      const exportedPlugin = await tmp("op-auth-export-");
      const secondProject = await tmp("op-auth-second-");
      try {
        await seedSamplePlugin(sourceDir);
        const firstImport = await importOpenPlugin({
          path: sourceDir,
          output: firstProject,
          privacyUrl: "https://example.com/privacy",
          termsUrl: "https://example.com/terms",
          defaultAuthType: "None",
        });
        if (firstImport.isErr()) throw new Error(firstImport.error.message);

        const firstManifestPath = path.join(firstProject, "appPackage", "manifest.json");
        const firstManifest = await fs.readJSON(firstManifestPath);
        firstManifest.agentConnectors[0].toolSource.remoteMcpServer.authorization = {
          type: authorizationType,
          referenceId: `ref-${authorizationType}`,
        };
        await fs.writeJSON(firstManifestPath, firstManifest, { spaces: 4 });

        const exported = await exportOpenPlugin({ path: firstProject, output: exportedPlugin });
        if (exported.isErr()) throw new Error(exported.error.message);
        const secondImport = await importOpenPlugin({
          path: exportedPlugin,
          output: secondProject,
        });
        if (secondImport.isErr()) throw new Error(secondImport.error.message);

        const secondManifest = await fs.readJSON(
          path.join(secondProject, "appPackage", "manifest.json")
        );
        const expectedAuthorization =
          authorizationType === "None"
            ? { type: authorizationType }
            : { type: authorizationType, referenceId: `ref-${authorizationType}` };
        chai
          .expect(secondManifest.agentConnectors[0].toolSource.remoteMcpServer.authorization)
          .to.deep.equal(expectedAuthorization);
      } finally {
        await Promise.all(
          [sourceDir, firstProject, exportedPlugin, secondProject].map(
            async (directory) => await fs.remove(directory)
          )
        );
      }
    });
  }
});
