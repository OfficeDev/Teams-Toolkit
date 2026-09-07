// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { InputsWithProjectPath, Platform, err, ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectModel } from "../../../src/component/configManager/interface";
import { coordinator } from "../../../src/component/coordinator";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { provisionUtils } from "../../../src/component/provisionUtils";
import { metadataUtil } from "../../../src/component/utils/metadataUtil";
import * as workerAgents from "../../../src/core/workerAgents";
import { UserCancelError } from "../../../src/error";
import { MockTools } from "../../core/utils";

describe("worker agent provision integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("WORKER-PROVISION-01: blocking validation fails before remote side effects", async () => {
    const execute = vi.fn().mockResolvedValue({ result: ok(new Map()), summaries: [] });
    const projectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "provision",
        driverDefs: [{ uses: "teamsApp/create", with: undefined }],
        resolvePlaceholders: () => [],
        execute,
        resolveDriverInstances: () => ok([]),
      },
      environmentFolderPath: "./envs",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(projectModel));
    vi.spyOn(workerAgents, "validateWorkerAgentGraph").mockResolvedValue(
      ok({
        valid: false,
        diagnostics: [
          {
            severity: "error",
            code: "WORKER_FILE_MISSING",
            message: "missing worker",
            manifestPath: "appPackage/declarativeAgent.json",
            path: "$.worker_agents[0]",
          },
        ],
        localManifests: [],
      })
    );
    const tokenCall = vi.spyOn(provisionUtils, "getM365TenantId");
    const tools = new MockTools();
    const context: DriverContext = {
      azureAccountProvider: tools.tokenProvider.azureAccountProvider,
      m365TokenProvider: tools.tokenProvider.m365TokenProvider,
      ui: tools.ui,
      progressBar: undefined,
      logProvider: tools.logProvider,
      telemetryReporter: tools.telemetryReporter,
      projectPath: "project",
      platform: Platform.CLI,
    };
    const inputs: InputsWithProjectPath = {
      projectPath: "project",
      platform: Platform.CLI,
      env: "dev",
      workflowFilePath: "project/m365agents.yml",
    };

    const result = await coordinator.provision(context, inputs);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("WORKER_FILE_MISSING");
    expect(tokenCall).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("WORKER-PROVISION-01: validates the DA file declared by the Teams manifest", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "fx-worker-provision-"));
    try {
      const appPackagePath = path.join(projectPath, "appPackage");
      await fs.ensureDir(appPackagePath);
      await fs.writeJson(path.join(appPackagePath, "manifest.json"), {
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
          declarativeAgents: [{ id: "repair", file: "repairDeclarativeAgent.json" }],
        },
      });
      await fs.writeJson(path.join(appPackagePath, "repairDeclarativeAgent.json"), {
        version: "v1.8",
        name: "Repair agent",
        description: "Repairs test issues",
        instructions: "Repair the issue.",
        worker_agents: [{ file: "missing-worker.json" }],
      });
      const execute = vi.fn().mockResolvedValue({ result: ok(new Map()), summaries: [] });
      const projectModel: ProjectModel = {
        version: "1.0.0",
        provision: {
          name: "provision",
          driverDefs: [],
          resolvePlaceholders: () => [],
          execute,
          resolveDriverInstances: () => ok([]),
        },
        environmentFolderPath: "./envs",
      };
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(projectModel));
      const tools = new MockTools();
      const context: DriverContext = {
        azureAccountProvider: tools.tokenProvider.azureAccountProvider,
        m365TokenProvider: tools.tokenProvider.m365TokenProvider,
        ui: tools.ui,
        progressBar: undefined,
        logProvider: tools.logProvider,
        telemetryReporter: tools.telemetryReporter,
        projectPath,
        platform: Platform.CLI,
      };
      const inputs: InputsWithProjectPath = {
        projectPath,
        platform: Platform.CLI,
        env: "dev",
        workflowFilePath: path.join(projectPath, "m365agents.yml"),
      };

      const result = await coordinator.provision(context, inputs);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("WORKER_FILE_MISSING");
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await fs.remove(projectPath);
    }
  });

  it("WORKER-PROVISION-02: revalidates a current worker graph before lifecycle execution", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ result: ok(new Map([["WORKER_RESULT", "unchanged"]])), summaries: [] });
    const projectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "provision",
        driverDefs: [],
        resolvePlaceholders: () => [],
        execute,
        resolveDriverInstances: () => ok([]),
      },
      environmentFolderPath: "./envs",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(projectModel));
    const validate = vi.spyOn(workerAgents, "validateWorkerAgentGraph").mockResolvedValue(
      ok({
        valid: true,
        diagnostics: [],
        localManifests: [
          {
            absolutePath: "project/appPackage/worker.json",
            lexicalPath: "project/appPackage/worker.json",
            packagePath: "worker.json",
            content: "{}",
            document: {},
          },
        ],
      })
    );
    const tools = new MockTools();
    const context: DriverContext = {
      azureAccountProvider: tools.tokenProvider.azureAccountProvider,
      m365TokenProvider: tools.tokenProvider.m365TokenProvider,
      ui: tools.ui,
      progressBar: undefined,
      logProvider: tools.logProvider,
      telemetryReporter: tools.telemetryReporter,
      projectPath: "project",
      platform: Platform.CLI,
    };
    const inputs: InputsWithProjectPath = {
      projectPath: "project",
      platform: Platform.CLI,
      env: "dev",
      workflowFilePath: "project/m365agents.yml",
    };

    const result = await coordinator.provision(context, inputs);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.WORKER_RESULT).toBe("unchanged");
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: "project", allowMissingRoot: true })
    );
    expect(execute).toHaveBeenCalledOnce();
  });

  it("WORKER-PROVISION-05: passes cancellation to graph validation before lifecycle execution", async () => {
    const execute = vi.fn().mockResolvedValue({ result: ok(new Map()), summaries: [] });
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        version: "1.0.0",
        provision: {
          name: "provision",
          driverDefs: [],
          resolvePlaceholders: () => [],
          execute,
          resolveDriverInstances: () => ok([]),
        },
        environmentFolderPath: "./envs",
      })
    );
    const controller = new AbortController();
    const validate = vi
      .spyOn(workerAgents, "validateWorkerAgentGraph")
      .mockImplementation(async (options) => {
        expect(options.signal).toBe(controller.signal);
        return err(new UserCancelError("WorkerAgents"));
      });
    const tools = new MockTools();
    const context: DriverContext = {
      azureAccountProvider: tools.tokenProvider.azureAccountProvider,
      m365TokenProvider: tools.tokenProvider.m365TokenProvider,
      ui: tools.ui,
      progressBar: undefined,
      logProvider: tools.logProvider,
      telemetryReporter: tools.telemetryReporter,
      projectPath: "project",
      platform: Platform.CLI,
      signal: controller.signal,
    };

    const result = await coordinator.provision(context, {
      projectPath: "project",
      platform: Platform.CLI,
      env: "dev",
      workflowFilePath: "project/m365agents.yml",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("UserCancel");
    expect(validate).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it("WORKER-PROVISION-03: a project without workers preserves lifecycle execution", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ result: ok(new Map([["RESULT", "unchanged"]])), summaries: [] });
    const projectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "provision",
        driverDefs: [],
        resolvePlaceholders: () => [],
        execute,
        resolveDriverInstances: () => ok([]),
      },
      environmentFolderPath: "./envs",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(projectModel));
    vi.spyOn(workerAgents, "validateWorkerAgentGraph").mockResolvedValue(
      ok({ valid: true, diagnostics: [], localManifests: [] })
    );
    const tools = new MockTools();
    const context: DriverContext = {
      azureAccountProvider: tools.tokenProvider.azureAccountProvider,
      m365TokenProvider: tools.tokenProvider.m365TokenProvider,
      ui: tools.ui,
      progressBar: undefined,
      logProvider: tools.logProvider,
      telemetryReporter: tools.telemetryReporter,
      projectPath: "project",
      platform: Platform.CLI,
    };
    const inputs: InputsWithProjectPath = {
      projectPath: "project",
      platform: Platform.CLI,
      env: "dev",
      workflowFilePath: "project/m365agents.yml",
    };

    const result = await coordinator.provision(context, inputs);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.RESULT).toBe("unchanged");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("WORKER-PROVISION-03: an ordinary Teams project preserves lifecycle execution", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "fx-worker-compat-"));
    try {
      const appPackagePath = path.join(projectPath, "appPackage");
      await fs.ensureDir(appPackagePath);
      await fs.writeJson(path.join(appPackagePath, "manifest.json"), {
        manifestVersion: "1.19",
        version: "1.0.0",
        id: "00000000-0000-0000-0000-000000000000",
        developer: {
          name: "Test",
          websiteUrl: "https://example.com",
          privacyUrl: "https://example.com/privacy",
          termsOfUseUrl: "https://example.com/terms",
        },
        name: { short: "Test", full: "${{UNRELATED_APP_NAME}}" },
        description: { short: "Test", full: "Test app" },
        icons: { color: "color.png", outline: "outline.png" },
        accentColor: "#FFFFFF",
      });
      const execute = vi
        .fn()
        .mockResolvedValue({ result: ok(new Map([["RESULT", "unchanged"]])), summaries: [] });
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          version: "1.0.0",
          provision: {
            name: "provision",
            driverDefs: [],
            resolvePlaceholders: () => [],
            execute,
            resolveDriverInstances: () => ok([]),
          },
          environmentFolderPath: "./envs",
        })
      );
      const tools = new MockTools();
      const context: DriverContext = {
        azureAccountProvider: tools.tokenProvider.azureAccountProvider,
        m365TokenProvider: tools.tokenProvider.m365TokenProvider,
        ui: tools.ui,
        progressBar: undefined,
        logProvider: tools.logProvider,
        telemetryReporter: tools.telemetryReporter,
        projectPath,
        platform: Platform.CLI,
      };

      const result = await coordinator.provision(context, {
        projectPath,
        platform: Platform.CLI,
        env: "dev",
        workflowFilePath: path.join(projectPath, "m365agents.yml"),
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.RESULT).toBe("unchanged");
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(projectPath);
    }
  });

  it("WORKER-PROVISION-04: a v1.5 DA without workers skips Worker schema validation", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "fx-worker-env-compat-"));
    const previousDaFile = process.env.DA_FILE;
    process.env.DA_FILE = "repairDeclarativeAgent.json";
    try {
      const appPackagePath = path.join(projectPath, "appPackage");
      await fs.ensureDir(appPackagePath);
      await fs.writeJson(path.join(appPackagePath, "manifest.json"), {
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
          declarativeAgents: [{ id: "repair", file: "${{DA_FILE}}" }],
        },
      });
      await fs.writeJson(path.join(appPackagePath, "repairDeclarativeAgent.json"), {
        version: "v1.5",
        worker_agents: [],
      });
      const execute = vi
        .fn()
        .mockResolvedValue({ result: ok(new Map([["RESULT", "unchanged"]])), summaries: [] });
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          version: "1.0.0",
          provision: {
            name: "provision",
            driverDefs: [],
            resolvePlaceholders: () => [],
            execute,
            resolveDriverInstances: () => ok([]),
          },
          environmentFolderPath: "./envs",
        })
      );
      const tools = new MockTools();
      const context: DriverContext = {
        azureAccountProvider: tools.tokenProvider.azureAccountProvider,
        m365TokenProvider: tools.tokenProvider.m365TokenProvider,
        ui: tools.ui,
        progressBar: undefined,
        logProvider: tools.logProvider,
        telemetryReporter: tools.telemetryReporter,
        projectPath,
        platform: Platform.CLI,
      };

      const result = await coordinator.provision(context, {
        projectPath,
        platform: Platform.CLI,
        env: "dev",
        workflowFilePath: path.join(projectPath, "m365agents.yml"),
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.RESULT).toBe("unchanged");
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      if (previousDaFile === undefined) delete process.env.DA_FILE;
      else process.env.DA_FILE = previousDaFile;
      await fs.remove(projectPath);
    }
  });
});
