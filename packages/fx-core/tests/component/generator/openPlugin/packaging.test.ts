// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok, Platform } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as os from "os";
import * as path from "path";
import { featureFlagManager, FeatureFlags } from "../../../../src/common/featureFlags";
import { setTools } from "../../../../src/common/globalVars";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { CreateAppPackageArgs } from "../../../../src/component/driver/teamsApp/interfaces/CreateAppPackageArgs";
import { Generator } from "../../../../src/component/generator/generator";
import { importOpenPlugin } from "../../../../src/component/generator/openPlugin/importer";
import { MockedM365Provider, MockTools } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { scaffoldOpenPluginTemplateFromSource } from "./testTemplateScaffold";
import { chai, vi } from "vitest";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedSamplePlugin(root: string): Promise<void> {
  await fs.ensureDir(path.join(root, ".plugin"));
  await fs.writeJSON(path.join(root, ".plugin", "plugin.json"), {
    name: "pkg-demo",
    version: "1.0.0",
    description: "demo",
    homepage: "https://example.com",
    author: { name: "Demo" },
  });
  await fs.ensureDir(path.join(root, "skills", "hello"));
  await fs.writeFile(
    path.join(root, "skills", "hello", "SKILL.md"),
    "---\nname: hello\ndescription: hi\n---\nbody"
  );
  await fs.ensureDir(path.join(root, "skills", "hello", "nested"));
  await fs.writeFile(path.join(root, "skills", "hello", "nested", "helper.md"), "# nested helper");
}

describe("openPlugin → teamsApp/zipAppPackage end-to-end", () => {
  setTools(new MockTools());
  const driver = new CreateAppPackageDriver();
  let pluginDir: string;
  let projectDir: string;
  let envRestore: RestoreFn | undefined;
  const sandbox = vi;

  beforeEach(async () => {
    pluginDir = await tmp("op-pkg-plugin-");
    projectDir = await tmp("op-pkg-proj-");
    await fs.remove(projectDir);
    await seedSamplePlugin(pluginDir);
    envRestore = mockedEnv({
      TEAMSFX_ENV: "dev",
      TEAMS_APP_ID: "00000000-0000-0000-0000-000000000000",
    });
    vi.spyOn(Generator, "generateTemplate").mockImplementation(async (ctx, dest) => {
      const appName = ctx.templateVariables?.appName ?? "";
      await scaffoldOpenPluginTemplateFromSource(dest, { appName });
      return ok(undefined);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(pluginDir);
    await fs.remove(projectDir);
    if (envRestore) {
      envRestore();
      envRestore = undefined;
    }
  });

  it("zips skill folders unconditionally for Teams manifest agentSkills", async () => {
    const convertRes = await importOpenPlugin({
      path: pluginDir,
      output: projectDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (convertRes.isErr()) throw new Error(convertRes.error.message);

    const args: CreateAppPackageArgs = {
      manifestPath: path.join(projectDir, "appPackage", "manifest.json"),
      outputZipPath: path.join(projectDir, "appPackage", "build", "appPackage.dev.zip"),
      outputFolder: path.join(projectDir, "appPackage", "build"),
    };
    const ctx: any = {
      m365TokenProvider: new MockedM365Provider(),
      projectPath: projectDir,
      platform: Platform.CLI,
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      addTelemetryProperties: () => {},
    };
    const buildRes = (await driver.execute(args, ctx)).result;
    if (buildRes.isErr()) throw new Error(buildRes.error.message);

    const zip = new AdmZip(args.outputZipPath);
    const entries = zip.getEntries().map((e) => e.entryName);
    chai.expect(entries).to.include("manifest.json");
    chai.expect(entries).to.include("color.png");
    chai.expect(entries).to.include("outline.png");
    chai
      .expect(entries.some((e) => e === "skills/hello/SKILL.md" || e === "skills\\hello\\SKILL.md"))
      .to.equal(true);
    chai
      .expect(
        entries.some(
          (e) => e === "skills/hello/nested/helper.md" || e === "skills\\hello\\nested\\helper.md"
        )
      )
      .to.equal(true);
  });

  it("zips skill folders even when TEAMSFX_AGENT_SKILLS is off (Teams manifest agentSkills is unconditional)", async () => {
    const convertRes = await importOpenPlugin({
      path: pluginDir,
      output: projectDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (convertRes.isErr()) throw new Error(convertRes.error.message);

    const wasEnabled = featureFlagManager.getBooleanValue(FeatureFlags.AgentSkillsManifest);
    featureFlagManager.setBooleanValue(FeatureFlags.AgentSkillsManifest, false);
    try {
      const args: CreateAppPackageArgs = {
        manifestPath: path.join(projectDir, "appPackage", "manifest.json"),
        outputZipPath: path.join(projectDir, "appPackage", "build", "appPackage.dev.zip"),
        outputFolder: path.join(projectDir, "appPackage", "build"),
      };
      const ctx: any = {
        m365TokenProvider: new MockedM365Provider(),
        projectPath: projectDir,
        platform: Platform.CLI,
        logProvider: new MockedLogProvider(),
        ui: new MockedUserInteraction(),
        addTelemetryProperties: () => {},
      };
      const buildRes = (await driver.execute(args, ctx)).result;
      if (buildRes.isErr()) throw new Error(buildRes.error.message);

      const zip = new AdmZip(args.outputZipPath);
      const entries = zip.getEntries().map((e) => e.entryName);
      chai
        .expect(
          entries.some((e) => e === "skills/hello/SKILL.md" || e === "skills\\hello\\SKILL.md")
        )
        .to.equal(true);
    } finally {
      featureFlagManager.setBooleanValue(FeatureFlags.AgentSkillsManifest, wasEnabled);
    }
  });

  it("returns error when agentSkills folder points outside appPackage", async () => {
    const convertRes = await importOpenPlugin({
      path: pluginDir,
      output: projectDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (convertRes.isErr()) throw new Error(convertRes.error.message);

    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentSkills = [{ folder: "../../escape" }];
    await fs.writeJSON(manifestPath, manifest, { spaces: 4 });

    const args: CreateAppPackageArgs = {
      manifestPath,
      outputZipPath: path.join(projectDir, "appPackage", "build", "appPackage.dev.zip"),
      outputFolder: path.join(projectDir, "appPackage", "build"),
    };
    const ctx: any = {
      m365TokenProvider: new MockedM365Provider(),
      projectPath: projectDir,
      platform: Platform.CLI,
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      addTelemetryProperties: () => {},
    };
    const buildRes = (await driver.execute(args, ctx)).result;
    chai.expect(buildRes.isErr()).to.equal(true);
  });

  it("returns error when agentSkills folder does not exist", async () => {
    const convertRes = await importOpenPlugin({
      path: pluginDir,
      output: projectDir,
      privacyUrl: "https://example.com/privacy",
      termsUrl: "https://example.com/terms",
    });
    if (convertRes.isErr()) throw new Error(convertRes.error.message);

    const manifestPath = path.join(projectDir, "appPackage", "manifest.json");
    const manifest = await fs.readJSON(manifestPath);
    manifest.agentSkills = [{ folder: "./skills/nonexistent" }];
    await fs.writeJSON(manifestPath, manifest, { spaces: 4 });

    const args: CreateAppPackageArgs = {
      manifestPath,
      outputZipPath: path.join(projectDir, "appPackage", "build", "appPackage.dev.zip"),
      outputFolder: path.join(projectDir, "appPackage", "build"),
    };
    const ctx: any = {
      m365TokenProvider: new MockedM365Provider(),
      projectPath: projectDir,
      platform: Platform.CLI,
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      addTelemetryProperties: () => {},
    };
    const buildRes = (await driver.execute(args, ctx)).result;
    chai.expect(buildRes.isErr()).to.equal(true);
  });
});
