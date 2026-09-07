// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, TeamsManifestV1D19, UserError, err, ok } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { featureFlagManager } from "../../../../src/common/featureFlags";
import { DriverContext } from "../../../../src/component/driver/interface/commonArgs";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { copilotGptManifestUtils } from "../../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import * as workerAgents from "../../../../src/core/workerAgents";
import { MockTools } from "../../../core/utils";

function declarativeAgent(workerAgents?: unknown[], capabilities?: unknown[]) {
  return {
    version: "v1.8",
    name: "Test agent",
    description: "Test agent description",
    instructions: "Answer test questions.",
    worker_agents: workerAgents,
    capabilities,
  };
}

describe("worker agent package integration", () => {
  let projectPath: string;
  let appPackagePath: string;
  let outputPath: string;
  let context: DriverContext;
  let previousEnvironment: string | undefined;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "fx-worker-package-"));
    appPackagePath = path.join(projectPath, "appPackage");
    outputPath = path.join(appPackagePath, "build", "appPackage.dev.zip");
    await fs.ensureDir(appPackagePath);
    await fs.writeFile(path.join(appPackagePath, "color.png"), "color");
    await fs.writeFile(path.join(appPackagePath, "outline.png"), "outline");
    const tools = new MockTools();
    context = {
      azureAccountProvider: tools.tokenProvider.azureAccountProvider,
      m365TokenProvider: tools.tokenProvider.m365TokenProvider,
      ui: tools.ui,
      progressBar: undefined,
      logProvider: tools.logProvider,
      telemetryReporter: tools.telemetryReporter,
      projectPath,
      platform: Platform.CLI,
    };
    previousEnvironment = process.env.TEAMSFX_ENV;
    process.env.TEAMSFX_ENV = "dev";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (previousEnvironment === undefined) delete process.env.TEAMSFX_ENV;
    else process.env.TEAMSFX_ENV = previousEnvironment;
    await fs.remove(projectPath);
  });

  function stubTeamsManifest(): void {
    const teamsManifest: TeamsManifestV1D19.TeamsManifestV1D19 = {
      manifestVersion: "1.19",
      version: "1.0.0",
      id: "00000000-0000-0000-0000-000000000000",
      developer: {
        name: "Test",
        websiteUrl: "https://example.com",
        privacyUrl: "https://example.com/privacy",
        termsOfUseUrl: "https://example.com/terms",
      },
      name: { short: "Test", full: "Test agent" },
      description: { short: "Test", full: "Test agent" },
      icons: { color: "color.png", outline: "outline.png" },
      accentColor: "#FFFFFF",
      copilotAgents: {
        declarativeAgents: [{ id: "root", file: "declarativeAgent.json" }],
      },
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
  }

  it("WORKER-PACKAGE-01: ZIP preserves references and includes the local closure", async () => {
    stubTeamsManifest();
    await fs.ensureDir(path.join(appPackagePath, "workers"));
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ id: "Published.Title.declarativeAgent" }, { file: "workers/one.json" }])
    );
    await fs.writeJson(
      path.join(appPackagePath, "workers", "one.json"),
      declarativeAgent(
        [{ file: "two.json" }],
        [{ name: "EmbeddedKnowledge", files: [{ file: "knowledge.txt" }] }]
      )
    );
    await fs.writeJson(path.join(appPackagePath, "workers", "two.json"), declarativeAgent());
    await fs.writeFile(path.join(appPackagePath, "workers", "knowledge.txt"), "worker knowledge");

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    const zip = new AdmZip(outputPath);
    const entries = zip
      .getEntries()
      .map((entry) => entry.entryName)
      .sort();
    expect(entries).toContain("declarativeAgent.json");
    expect(entries).toContain("workers/one.json");
    expect(entries).toContain("workers/two.json");
    expect(entries).toContain("workers/knowledge.txt");
    const rootEntry = zip.getEntry("declarativeAgent.json");
    const rootManifest = JSON.parse(rootEntry?.getData().toString("utf8") ?? "{}");
    expect(rootManifest.worker_agents).toContainEqual({
      id: "Published.Title.declarativeAgent",
    });
    expect(rootManifest.worker_agents).toContainEqual({ file: "workers/one.json" });
  });

  it("WORKER-PACKAGE-02: resolves worker dependencies from the authored alias location", async ({
    skip,
  }) => {
    stubTeamsManifest();
    const workersPath = path.join(appPackagePath, "workers");
    const targetsPath = path.join(appPackagePath, "targets");
    await fs.ensureDir(workersPath);
    await fs.ensureDir(targetsPath);
    await fs.writeJson(
      path.join(targetsPath, "worker.json"),
      declarativeAgent(undefined, [
        { name: "EmbeddedKnowledge", files: [{ file: "knowledge.txt" }] },
      ])
    );
    await fs.writeFile(path.join(workersPath, "knowledge.txt"), "authored dependency");
    await fs.writeFile(path.join(targetsPath, "knowledge.txt"), "canonical dependency");
    try {
      await fs.symlink(
        path.join(targetsPath, "worker.json"),
        path.join(workersPath, "alias.json"),
        "file"
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "EPERM") {
        skip();
        return;
      }
      throw error;
    }
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "workers/alias.json" }])
    );

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    const zip = new AdmZip(outputPath);
    expect(zip.getEntry("workers/knowledge.txt")?.getData().toString("utf8")).toBe(
      "authored dependency"
    );
    expect(zip.getEntry("targets/knowledge.txt")).toBeNull();
  });

  it("WORKER-PACKAGE-02: resolves agent skills from the Worker manifest directory", async () => {
    stubTeamsManifest();
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const workersPath = path.join(appPackagePath, "workers");
    const skillPath = path.join(workersPath, "skill");
    await fs.ensureDir(skillPath);
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "workers/one.json" }])
    );
    await fs.writeJson(path.join(workersPath, "one.json"), {
      ...declarativeAgent(),
      agent_skills: [{ folder: "skill" }],
    });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "# Worker skill");

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    expect(new AdmZip(outputPath).getEntry("workers/skill/SKILL.md")).not.toBeNull();
  });

  it("WORKER-PACKAGE-01: generated Worker paths match authored package references", async () => {
    const generatedPath = path.join(appPackagePath, ".generated");
    const resourcesPath = path.join(generatedPath, "resources");
    await fs.ensureDir(resourcesPath);
    await fs.writeJson(path.join(generatedPath, "manifest.json"), {});
    await fs.writeFile(path.join(resourcesPath, "color.png"), "color");
    await fs.writeFile(path.join(resourcesPath, "outline.png"), "outline");
    await fs.writeJson(
      path.join(resourcesPath, "declarativeAgent.json"),
      declarativeAgent([{ file: "workers/one.json" }])
    );
    await fs.ensureDir(path.join(resourcesPath, "workers"));
    await fs.writeJson(path.join(resourcesPath, "workers", "one.json"), {
      ...declarativeAgent(undefined, [
        { name: "EmbeddedKnowledge", files: [{ file: "knowledge.txt" }] },
      ]),
      actions: [{ id: "action", file: "plugin.json" }],
    });
    await fs.writeFile(path.join(resourcesPath, "workers", "knowledge.txt"), "knowledge");
    await fs.writeJson(path.join(resourcesPath, "workers", "plugin.json"), {
      schema_version: "v2",
      name_for_human: "Plugin",
      description_for_model: "Plugin",
      runtimes: [],
    });
    const teamsManifest: TeamsManifestV1D19.TeamsManifestV1D19 = {
      manifestVersion: "1.19",
      version: "1.0.0",
      id: "00000000-0000-0000-0000-000000000000",
      developer: {
        name: "Test",
        websiteUrl: "https://example.com",
        privacyUrl: "https://example.com/privacy",
        termsOfUseUrl: "https://example.com/terms",
      },
      name: { short: "Test", full: "Test agent" },
      description: { short: "Test", full: "Test agent" },
      icons: { color: "color.png", outline: "outline.png" },
      accentColor: "#FFFFFF",
      copilotAgents: {
        declarativeAgents: [{ id: "root", file: "resources/declarativeAgent.json" }],
      },
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    const zip = new AdmZip(outputPath);
    expect(zip.getEntry("resources/declarativeAgent.json")).not.toBeNull();
    expect(zip.getEntry("resources/workers/one.json")).not.toBeNull();
    expect(zip.getEntry("resources/workers/knowledge.txt")).not.toBeNull();
    expect(zip.getEntry("resources/workers/plugin.json")).not.toBeNull();
    expect(zip.getEntry(".generated/resources/workers/one.json")).toBeNull();
  });

  it("WORKER-PACKAGE-05: ZIP consumes the worker snapshot validated by the operation", async () => {
    stubTeamsManifest();
    const workerPath = path.join(appPackagePath, "worker.json");
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "worker.json" }])
    );
    await fs.writeJson(workerPath, { ...declarativeAgent(), snapshot: "validated" });
    const validate = workerAgents.validateWorkerAgentGraph;
    vi.spyOn(workerAgents, "validateWorkerAgentGraph").mockImplementation(async (options) => {
      const result = await validate(options);
      await fs.writeJson(workerPath, {
        ...declarativeAgent(),
        snapshot: "changed-after-validation",
      });
      return result;
    });

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    const content = new AdmZip(outputPath).getEntry("worker.json")?.getData().toString("utf8");
    expect(content).toContain('"snapshot": "validated"');
    expect(content).not.toContain("changed-after-validation");
  });

  it("WORKER-PACKAGE-06: packages a shared Worker and its dependency once", async () => {
    stubTeamsManifest();
    const workersPath = path.join(appPackagePath, "workers");
    await fs.ensureDir(workersPath);
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "workers/one.json" }, { file: "workers/two.json" }])
    );
    await fs.writeJson(
      path.join(workersPath, "one.json"),
      declarativeAgent([{ file: "shared.json" }])
    );
    await fs.writeJson(
      path.join(workersPath, "two.json"),
      declarativeAgent([{ file: "shared.json" }])
    );
    await fs.writeJson(
      path.join(workersPath, "shared.json"),
      declarativeAgent(undefined, [
        { name: "EmbeddedKnowledge", files: [{ file: "knowledge.txt" }] },
      ])
    );
    await fs.writeFile(path.join(workersPath, "knowledge.txt"), "shared knowledge");

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    const names = new AdmZip(outputPath).getEntries().map((entry) => entry.entryName);
    expect(names.filter((name) => name === "workers/shared.json")).toHaveLength(1);
    expect(names.filter((name) => name === "workers/knowledge.txt")).toHaveLength(1);
  });

  it("WORKER-PACKAGE-07: cancellation during graph loading stops before ZIP publication", async () => {
    stubTeamsManifest();
    const firstWorkerPath = path.join(appPackagePath, "first.json");
    const secondWorkerPath = path.join(appPackagePath, "second.json");
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "first.json" }, { file: "second.json" }])
    );
    await fs.writeJson(firstWorkerPath, declarativeAgent());
    await fs.writeJson(secondWorkerPath, declarativeAgent());
    const controller = new AbortController();
    context.signal = controller.signal;
    let releaseLoad: (() => void) | undefined;
    let signalLoadStarted: (() => void) | undefined;
    const loadStarted = new Promise<void>((resolve) => (signalLoadStarted = resolve));
    const blocked = new Promise<void>((resolve) => (releaseLoad = resolve));
    const getManifest = copilotGptManifestUtils.getManifest.bind(copilotGptManifestUtils);
    const workerLoads: string[] = [];
    vi.spyOn(copilotGptManifestUtils, "getManifest").mockImplementation(
      async (manifestPath, workerContext) => {
        if (manifestPath === firstWorkerPath || manifestPath === secondWorkerPath) {
          workerLoads.push(manifestPath);
        }
        if (manifestPath === firstWorkerPath) {
          signalLoadStarted?.();
          await blocked;
        }
        return getManifest(manifestPath, workerContext);
      }
    );

    const executionPromise = new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );
    await loadStarted;
    controller.abort();
    releaseLoad?.();
    const execution = await executionPromise;

    expect(execution.result.isErr()).toBe(true);
    if (execution.result.isErr()) expect(execution.result.error.name).toBe("UserCancel");
    expect(workerLoads).toEqual([firstWorkerPath]);
    expect(await fs.pathExists(outputPath)).toBe(false);
  });

  it("WORKER-PACKAGE-03: blocking validation prevents final ZIP publication", async () => {
    stubTeamsManifest();
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "workers/missing.json" }])
    );

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isErr()).toBe(true);
    expect(await fs.pathExists(outputPath)).toBe(false);
  });

  it("preserves a nested worker manifest loader error", async () => {
    stubTeamsManifest();
    const workerPath = path.join(appPackagePath, "worker.json");
    await fs.writeJson(
      path.join(appPackagePath, "declarativeAgent.json"),
      declarativeAgent([{ file: "worker.json" }])
    );
    await fs.writeJson(workerPath, declarativeAgent());
    const loaderError = new UserError("worker-loader", "WORKER_LOADER_FAILED", "load failed");
    const getManifest = copilotGptManifestUtils.getManifest.bind(copilotGptManifestUtils);
    vi.spyOn(copilotGptManifestUtils, "getManifest").mockImplementation(
      async (manifestPath, workerContext) =>
        manifestPath === workerPath ? err(loaderError) : getManifest(manifestPath, workerContext)
    );

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isErr()).toBe(true);
    if (execution.result.isErr()) expect(execution.result.error).toBe(loaderError);
    expect(await fs.pathExists(outputPath)).toBe(false);
  });

  it("WORKER-PACKAGE-04: a project without workers retains existing package behavior", async () => {
    stubTeamsManifest();
    await fs.writeJson(path.join(appPackagePath, "declarativeAgent.json"), declarativeAgent());

    const execution = await new CreateAppPackageDriver().execute(
      {
        manifestPath: path.join(appPackagePath, "manifest.json"),
        outputZipPath: outputPath,
        outputFolder: path.join(appPackagePath, "build"),
      },
      context
    );

    expect(execution.result.isOk()).toBe(true);
    expect(
      new AdmZip(outputPath)
        .getEntries()
        .map((entry) => entry.entryName)
        .sort()
    ).toEqual(["color.png", "declarativeAgent.json", "manifest.json", "outline.png"]);
  });
});
