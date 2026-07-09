import fs from "fs-extra";

import {
  err,
  Inputs,
  IProgressHandler,
  ok,
  Platform,
  UserError,
  Void,
} from "@microsoft/teamsfx-api";

import { assert, expect, vi } from "vitest";
import { setTools } from "../../../src/common/globalVars";
import { MetadataV3, VersionInfo, VersionSource } from "../../../src/common/versionMetadata";
import { ExecutionResult, ProjectModel } from "../../../src/component/configManager/interface";
import { deployUtils } from "../../../src/component/deployUtils";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { envUtil } from "../../../src/component/utils/envUtil";
import { metadataUtil } from "../../../src/component/utils/metadataUtil";
import { pathUtils } from "../../../src/component/utils/pathUtils";
import { settingsUtil } from "../../../src/component/utils/settingsUtil";
import { FxCore } from "../../../src/core/FxCore";
import * as v3MigrationUtils from "../../../src/core/middleware/utils/v3MigrationUtils";
import { UserCancelError } from "../../../src/error";
import { MockTools } from "../../core/utils";
import { mockedResolveDriverInstances } from "./coordinator.test";

const versionInfo: VersionInfo = {
  version: MetadataV3.projectVersion,
  source: VersionSource.teamsapp,
};
const V3Version = MetadataV3.projectVersion;
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

  it("deploy happy path", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
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
    vi.spyOn(deployUtils, "askForDeployConsentV3").mockResolvedValue(ok(Void));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isOk());
  });
  it("deploy happy path - VS", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
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
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok(undefined));
    vi.spyOn(deployUtils, "askForDeployConsentV3").mockResolvedValue(ok(Void));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VS,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isOk());
  });
  it("deploy cancel", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(deployUtils, "askForDeployConsentV3").mockResolvedValue(err(new UserCancelError()));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isErr() && res.error instanceof UserCancelError);
    vi.restoreAllMocks();
  });
  it("deploy happy path (debug)", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "configureApp",
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
    vi.spyOn(deployUtils, "askForDeployConsentV3").mockResolvedValue(ok(Void));
    vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(
      ok({ trackingId: "mockId", version: V3Version })
    );
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      workflowFilePath: "./app.local.yml",
      env: "local",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    if (res.isErr()) {
      console.log(res?.error);
    }
    assert.isTrue(res.isOk());
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("deploy failed partial success", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        driverDefs: [],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return {
            result: err({
              kind: "PartialSuccess",
              env: new Map(),
              reason: {
                kind: "DriverError",
                failedDriver: { uses: "", with: {} },
                error: new UserError({}),
              },
            }),
            summaries: [],
          };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(deployUtils, "askForDeployConsentV3").mockResolvedValue(ok(Void));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
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
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isErr());
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("deploy without progress bar", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      deploy: {
        name: "deploy",
        driverDefs: [{ uses: "azureStorage/deploy", with: "" }],
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
    vi.spyOn(deployUtils, "askForDeployConsentV3").mockResolvedValue(ok(Void));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue(undefined as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.deployArtifacts(inputs);
    assert.isTrue(res.isOk());
  });
});
