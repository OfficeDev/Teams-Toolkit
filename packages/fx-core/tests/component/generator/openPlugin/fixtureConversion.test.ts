// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok, Platform } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as os from "os";
import * as path from "path";
import { setTools } from "../../../../src/common/globalVars";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { CreateAppPackageArgs } from "../../../../src/component/driver/teamsApp/interfaces/CreateAppPackageArgs";
import { Generator } from "../../../../src/component/generator/generator";
import { deterministicAppId } from "../../../../src/component/generator/openPlugin/deterministicId";
import { importOpenPlugin } from "../../../../src/component/generator/openPlugin/importer";
import { MockedM365Provider, MockTools } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { scaffoldOpenPluginTemplateFromSource } from "./testTemplateScaffold";
import { chai, vi } from "vitest";

const FIXTURE = path.join(__dirname, "fixtures", "contoso-helper");
const FAKE_LOGO_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
]);

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("openPlugin fixture conversion (Contoso Helper)", () => {
  setTools(new MockTools());
  let outDir: string;
  const sandbox = vi;

  beforeEach(async () => {
    outDir = await tmp("op-fix-contoso-");
    await fs.remove(outDir); // converter requires the target to be empty
    vi.spyOn(Generator, "generateTemplate").mockImplementation(async (ctx, dest) => {
      const appName = ctx.templateVariables?.appName ?? "";
      await scaffoldOpenPluginTemplateFromSource(dest, { appName });
      return ok(undefined);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(outDir);
  });

  it("produces the expected vDevPreview manifest, project tree, and warnings", async () => {
    const expectedId = deterministicAppId("openplugin:contoso-helper");
    const res = await importOpenPlugin({
      path: FIXTURE,
      output: outDir,
      privacyUrl: "https://contoso.com/privacy",
      termsUrl: "https://contoso.com/terms",
    });
    if (res.isErr()) throw new Error(`importOpenPlugin failed: ${res.error.message}`);

    const manifest = await fs.readJSON(path.join(outDir, "appPackage", "manifest.json"));

    // 1. Full manifest deep-equal against the expected literal.
    chai.expect(manifest).to.deep.equal({
      $schema:
        "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
      manifestVersion: "devPreview",
      version: "2.1.0",
      id: expectedId,
      developer: {
        name: "Contoso Engineering",
        websiteUrl: "https://contoso.com",
        privacyUrl: "https://contoso.com/privacy",
        termsOfUseUrl: "https://contoso.com/terms",
      },
      name: {
        short: "Contoso Helper",
        full: "Contoso Helper",
      },
      description: {
        short: "Contoso productivity helper that automates code review documentation generation",
        full: "Contoso productivity helper that automates code review documentation generation and routine engineering tasks for Contoso teams.",
      },
      icons: { color: "color.png", outline: "outline.png" },
      accentColor: "#4A90D9",
      agentSkills: [
        { folder: "./skills/code-reviewer" },
        { folder: "./skills/doc-writer" },
        { folder: "./skills/task-runner" },
      ],
      agentConnectors: [
        {
          id: "contoso-tools",
          displayName: "contoso-tools MCP Server",
          description: "Contoso engineering toolbelt over MCP.",
          toolSource: {
            remoteMcpServer: {
              mcpServerUrl: "https://tools.contoso.com/mcp",
              authorization: {
                type: "OAuthPluginVault",
                referenceId: "contoso-helper-contoso-tools-auth",
              },
            },
          },
        },
        {
          id: "local-dev",
          displayName: "local-dev MCP Server",
          description: "Remote MCP server providing tools for contoso-helper",
          toolSource: {
            remoteMcpServer: {
              mcpServerUrl: "http://localhost:5050/sse",
              authorization: { type: "None" },
            },
          },
        },
      ],
    });

    // 2. Project tree: all expected files and the copied logo.
    const expectedFiles = [
      "appPackage/manifest.json",
      "appPackage/color.png",
      "appPackage/outline.png",
      "appPackage/skills/code-reviewer/SKILL.md",
      "appPackage/skills/doc-writer/SKILL.md",
      "appPackage/skills/task-runner/SKILL.md",
      "appPackage/commands/deploy.md",
      "appPackage/commands/status.md",
      ".gitignore",
      ".vscode/launch.json",
      ".vscode/settings.json",
      ".vscode/extensions.json",
      "env/.env.dev",
      "m365agents.yml",
      "README.md",
    ];
    for (const rel of expectedFiles) {
      chai.expect(await fs.pathExists(path.join(outDir, rel)), `missing ${rel}`).to.equal(true);
    }

    // 3. color.png was copied from the fixture's `logo` field, not generated.
    const colorBytes = await fs.readFile(path.join(outDir, "appPackage", "color.png"));
    chai.expect(colorBytes.equals(FAKE_LOGO_BYTES)).to.equal(true);

    // 4. outline.png was generated (real PNG signature, non-trivial size).
    const outlineBytes = await fs.readFile(path.join(outDir, "appPackage", "outline.png"));
    chai
      .expect(
        outlineBytes
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      )
      .to.equal(true);
    chai.expect(outlineBytes.length).to.be.greaterThan(32);

    // 5. Warnings: stdio MCP skipped, unmapped Open Plugin fields surfaced.
    const warnings = res.value.warnings;
    chai
      .expect(
        warnings.some((w) => w.includes("stdio-only") && w.includes("no URL")),
        "expected stdio MCP warning"
      )
      .to.equal(true);
    chai
      .expect(
        warnings.some((w) => w.includes("'agents'") && w.includes("not supported")),
        "expected agents-field warning"
      )
      .to.equal(true);
    chai
      .expect(
        warnings.some((w) => w.includes("'hooks'") && w.includes("not supported")),
        "expected hooks-field warning"
      )
      .to.equal(true);

    // 6. Renders the appName into m365agents.yml and README.
    const yml = await fs.readFile(path.join(outDir, "m365agents.yml"), "utf8");
    chai.expect(yml).to.include("name: contoso-helper${{APP_NAME_SUFFIX}}");
    const readme = await fs.readFile(path.join(outDir, "README.md"), "utf8");
    chai.expect(readme).to.include("# contoso-helper");
  });

  it("packages the scaffolded project end-to-end with skills included in the zip", async () => {
    const convertRes = await importOpenPlugin({
      path: FIXTURE,
      output: outDir,
      privacyUrl: "https://contoso.com/privacy",
      termsUrl: "https://contoso.com/terms",
    });
    if (convertRes.isErr()) throw new Error(convertRes.error.message);

    let envRestore: RestoreFn | undefined;
    try {
      envRestore = mockedEnv({
        TEAMSFX_ENV: "dev",
        TEAMS_APP_ID: "00000000-0000-0000-0000-000000000000",
      });

      const driver = new CreateAppPackageDriver();
      const args: CreateAppPackageArgs = {
        manifestPath: path.join(outDir, "appPackage", "manifest.json"),
        outputZipPath: path.join(outDir, "appPackage", "build", "appPackage.dev.zip"),
        outputFolder: path.join(outDir, "appPackage", "build"),
      };
      const ctx: any = {
        m365TokenProvider: new MockedM365Provider(),
        projectPath: outDir,
        platform: Platform.CLI,
        logProvider: new MockedLogProvider(),
        ui: new MockedUserInteraction(),
        addTelemetryProperties: () => {},
      };
      const buildRes = (await driver.execute(args, ctx)).result;
      if (buildRes.isErr()) throw new Error(buildRes.error.message);

      const zip = new AdmZip(args.outputZipPath);
      const entries = zip.getEntries().map((e) => e.entryName.replace(/\\/g, "/"));

      // Manifest + icons always present.
      chai.expect(entries).to.include("manifest.json");
      chai.expect(entries).to.include("color.png");
      chai.expect(entries).to.include("outline.png");

      // Every SKILL.md is in the zip under skills/<name>/SKILL.md.
      for (const name of ["code-reviewer", "doc-writer", "task-runner"]) {
        chai.expect(entries).to.include(`skills/${name}/SKILL.md`);
      }

      // commands/ is deliberately NOT swept into the zip (no manifest contract for it yet).
      chai.expect(entries.some((e) => e.startsWith("commands/"))).to.equal(false);
    } finally {
      if (envRestore) envRestore();
    }
  });
});
