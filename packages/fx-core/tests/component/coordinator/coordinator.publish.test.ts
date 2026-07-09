import { DotenvParseOutput } from "dotenv";
import fs from "fs-extra";

import {
  err,
  Inputs,
  InputsWithProjectPath,
  IProgressHandler,
  ok,
  Platform,
} from "@microsoft/teamsfx-api";

import { MetadataV3, VersionInfo, VersionSource } from "../../../src/common/versionMetadata";
import {
  ExecutionError,
  ExecutionResult,
  ProjectModel,
} from "../../../src/component/configManager/interface";
import { coordinator } from "../../../src/component/coordinator";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { createDriverContext } from "../../../src/component/driver/util/utils";
import { envUtil } from "../../../src/component/utils/envUtil";
import { metadataUtil } from "../../../src/component/utils/metadataUtil";
import { pathUtils } from "../../../src/component/utils/pathUtils";
import { FxCore } from "../../../src/core/FxCore";
import { setTools } from "../../../src/common/globalVars";
import * as v3MigrationUtils from "../../../src/core/middleware/utils/v3MigrationUtils";
import { MockTools } from "../../core/utils";
import { mockedResolveDriverInstances } from "./coordinator.test";
import { assert, expect, vi } from "vitest";

const versionInfo: VersionInfo = {
  version: MetadataV3.projectVersion,
  source: VersionSource.teamsapp,
};
describe("component coordinator test", () => {
  const sandbox = vi;
  const tools = new MockTools();
  setTools(tools);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(v3MigrationUtils, "getProjectVersion").mockResolvedValue(versionInfo);
  });
  it("publish happy path", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const showMessageStub = vi
      .spyOn(tools.ui, "showMessage")
      .mockImplementation(async (level, msg, modal, ...items) => {
        if (items.length > 0 && items[0].includes("admin portal")) {
          return ok(items[0]);
        }
        return ok("");
      });
    const openUrlStub = vi.spyOn(tools.ui, "openUrl").mockResolvedValue(ok(true));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(true);
    assert.isTrue(openUrlStub.mock.calls.length === 1);
  });
  it("publish happy path - CLI", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "Failure",
              error: { source: "test", timestamp: new Date() },
            } as ExecutionError),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isErr());
    assert.deepEqual(inputs.envVars, {} as DotenvParseOutput);
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("publish happy path - no ui", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    const mockTools = new MockTools();
    mockTools.ui = undefined as any;
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(mockTools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
  });
  it("publish happy path - VS - no ui", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    const mockTools = new MockTools();
    mockTools.ui = undefined as any;
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VS,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(mockTools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
  });
  it("publish failed", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "Failure",
              error: { source: "test", timestamp: new Date() },
            } as ExecutionError),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isErr());
    assert.deepEqual(inputs.envVars, {} as DotenvParseOutput);
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("publish without progress bar", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue(undefined as any as IProgressHandler);
    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok(""));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(showMessageStub.mock.calls.length > 0);
    assert.isTrue(progressStartStub.mock.calls.length === 0);
    assert.isTrue(progressEndStub.mock.calls.length === 0);
  });
  it("provision lifecycle undefined", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const context = createDriverContext(inputs);
    const res = await coordinator.provision(context, inputs);
    assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
  });
  it("deploy lifecycle undefined", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const context = createDriverContext(inputs);
    const res = await coordinator.deploy(context, inputs);
    assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
  });
  it("publish lifecycle undefined", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const context = createDriverContext(inputs);
    const res = await coordinator.publish(context, inputs);
    assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
  });
  it("publish happy path - copilotAgent/publish opens Microsoft Admin Center", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      publish: {
        name: "publish",
        driverDefs: [{ uses: "copilotAgent/publish", with: {} }],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const showMessageStub = vi
      .spyOn(tools.ui, "showMessage")
      .mockImplementation(async (level, msg, modal, ...items) => {
        if (items.length > 0 && items[0].includes("admin portal")) {
          return ok(items[0]);
        }
        return ok("");
      });
    const openUrlStub = vi.spyOn(tools.ui, "openUrl").mockResolvedValue(ok(true));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.publishApplication(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(true);
    assert.isTrue(openUrlStub.mock.calls.length === 1);
    expect(openUrlStub).toHaveBeenCalledWith("https://aka.ms/atk-mac");
  });
});
