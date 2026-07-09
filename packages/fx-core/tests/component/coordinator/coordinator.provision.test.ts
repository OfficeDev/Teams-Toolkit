import fs, { PathLike } from "fs-extra";
import * as os from "os";
import * as path from "path";

import {
  err,
  Inputs,
  IProgressHandler,
  ok,
  Platform,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";

import mockedEnv, { RestoreFn } from "mocked-env";
import { setTools } from "../../../src/common/globalVars";
import { MetadataV3, VersionInfo, VersionSource } from "../../../src/common/versionMetadata";
import { ExecutionResult, ProjectModel } from "../../../src/component/configManager/interface";
import { openUrl, showAadResourceLink } from "../../../src/component/coordinator";
import { SummaryReporter } from "../../../src/component/coordinator/summary";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { provisionUtils } from "../../../src/component/provisionUtils";
import { dotenvUtil, envUtil } from "../../../src/component/utils/envUtil";
import { metadataUtil } from "../../../src/component/utils/metadataUtil";
import { pathUtils } from "../../../src/component/utils/pathUtils";
import { resourceGroupHelper } from "../../../src/component/utils/ResourceGroupHelper";
import { settingsUtil } from "../../../src/component/utils/settingsUtil";
import { FxCore } from "../../../src/core/FxCore";
import * as v3MigrationUtils from "../../../src/core/middleware/utils/v3MigrationUtils";
import {
  InvalidAzureCredentialError,
  ResourceGroupConflictError,
  SelectSubscriptionError,
} from "../../../src/error/azure";
import { UserCancelError } from "../../../src/error/common";
import { MockTools, randomAppName } from "../../core/utils";
import { mockedResolveDriverInstances } from "./coordinator.test";
import { assert, expect, vi } from "vitest";

const versionInfo: VersionInfo = {
  version: MetadataV3.projectVersion,
  source: VersionSource.teamsapp,
};
const V3Version = MetadataV3.projectVersion;
describe("coordinator provision", () => {
  let envRestore: RestoreFn = () => {};
  const sandbox = vi;
  const tools = new MockTools();
  setTools(tools);
  afterEach(() => {
    vi.restoreAllMocks();
    envRestore?.();
  });

  beforeEach(() => {
    vi.spyOn(v3MigrationUtils, "getProjectVersion").mockResolvedValue(versionInfo);
  });

  it("provision happy path from zero", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
      environmentFolderPath: "./envs",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.spyOn(fs, "writeFile").mockResolvedValue();
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
      isLocalDebug: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    // getSelectedEnv
    const selectEnvRes = await fxCore.getSelectedEnv(inputs);
    if (selectEnvRes.isErr()) {
      console.log(selectEnvRes.error);
    }
    assert.isTrue(selectEnvRes.isOk());
    if (selectEnvRes.isOk()) {
      assert.equal(selectEnvRes.value, "dev");
    }
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("provision success with subscriptionId in yml", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: {
              subscriptionId: "mockSubId",
            },
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision happy path from zero case 2", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision happy path: validate multi-env", async () => {
    envRestore = mockedEnv({
      TEAMSFX_ENV: "dev",
    });
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return [];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          const map = new Map();
          map.set("KEY1", "VALUE1");
          map.set("SECRET_KEY2", "VALUE2");
          return { result: ok(map), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );

    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(
      ok({ version: "1.0", trackingId: "mockTrackingId" })
    );
    const fileDataMap = new Map();
    vi.spyOn(fs, "writeFile").mockImplementation(async (file: PathLike | number, data: any) => {
      fileDataMap.set(file, data);
    });
    const appName = randomAppName();
    const projectPath = path.resolve(os.tmpdir(), appName);
    const envFilePath = path.resolve(projectPath, "env", ".env.dev");
    const userDataFilePath = envFilePath + ".user";
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(envFilePath));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: projectPath,
      ignoreLockByUT: true,
      env: "dev",
      workflowFilePath: path.resolve(projectPath, "m365agents.yml"),
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    const envData = fileDataMap.get(envFilePath);
    const pRes1 = dotenvUtil.deserialize(envData);
    const secretData = fileDataMap.get(userDataFilePath);
    const pRes2 = dotenvUtil.deserialize(secretData);
    assert.equal(pRes1.obj["KEY1"], "VALUE1");
    assert.isUndefined(pRes1.obj["SECRET_KEY2"]);
    assert.isTrue(pRes2.obj["SECRET_KEY2"].startsWith("crypto_"));
  });
  it("provision happy path with existing resource groups in VS Code", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: false,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision failed to get selected subscription", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      undefined
    );
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      env: "dev",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof SelectSubscriptionError);
    }
  });
  it("provision SPFx project shows success notification", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
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
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const stubShowMessage = vi.spyOn(tools.ui, "showMessage");

    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    assert.isTrue(stubShowMessage.mock.calls.length === 1);
  });
  it("provision failed when user directly update yml with empty subscriptionId", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: {
              subscriptionId: "",
            },
          },
        ],
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
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed with parse error", async () => {
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(err(new UserError({})));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed to get subInfo", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );

    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      undefined
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();

    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed getLifecycleDescriptions Error", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(SummaryReporter.prototype, "getLifecycleDescriptions").mockReturnValue(
      err(new UserError({}))
    );
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
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("provision failed with partial success", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    const progressStartStub = vi.fn();
    const progressEndStub = vi.fn();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
      start: progressStartStub,
      end: progressEndStub,
    } as any as IProgressHandler);
    // sandbox
    //   .stub(SummaryReporter.prototype, "getLifecycleDescriptions")
    //   .mockResolvedValue(err(new UserError({})));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    assert.isTrue(progressStartStub.mock.calls.length === 1);
    expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("provision failed with getM365TenantId Error", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      err(new UserError({ source: "Tst", name: "TestError" }))
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed with getSelectedSubscription Error", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      undefined
    );
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision happy path with CLI inputs", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      env: "dev",
      targetSubscriptionId: "mockSubId",
      targetResourceGroupName: "test-rg",
      targetResourceLocationName: "Ease US",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision happy path with CLI inputs for existing resource group", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "aadApp/update",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(
      err(new ResourceGroupConflictError("xxx", "sss"))
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      targetSubscriptionId: "mockSubId",
      targetResourceGroupName: "test-rg",
      targetResourceLocationName: "Ease US",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
  });
  it("provision failed with CLI inputs: create resource group failed", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
    };
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(
      err(new UserError({ source: "test", name: "OtherError" }))
    );
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      env: "dev",
      targetSubscriptionId: "mockSubId",
      targetResourceGroupName: "test-rg",
      targetResourceLocationName: "Ease US",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision failed when getting azure credentials", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(undefined);
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof InvalidAzureCredentialError);
    }
  });
  it("provision failed when checking resource group existence", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue({
      getToken: (scopes: string) => {
        return Promise.resolve({ token: "token", expiresOnTimestamp: 1 });
      },
    });
    vi.spyOn(resourceGroupHelper, "checkResourceGroupExistence").mockResolvedValue(
      err(new SystemError("test", "test", "", ""))
    );
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "test");
    }
  });
  it("provision happy path (debug)", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
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
    vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(
      ok({ trackingId: "mockId", version: V3Version })
    );
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      workflowFilePath: "./app.local.yml",
      env: "local",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    if (res.isErr()) {
      console.log(res?.error);
    }
    assert.isTrue(res.isOk());
  });

  it("provision happy path (VS debug)", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
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
    vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(
      ok({ trackingId: "mockId", version: V3Version })
    );
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.VS,
      projectPath: ".",
      workflowFilePath: "./app.local.yml",
      env: "local",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    if (res.isErr()) {
      console.log(res?.error);
    }
    assert.isTrue(res.isOk());
  });

  it("provision failed with check whether m365 tenant matched fail after user retry", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(
      err(new UserError("coordinator", "checkM365TenantError", "msg", "msg"))
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "signout").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("Continue"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "checkM365TenantError");
    }
  });
  it("provision failed with resource group after user succeed to re-login m365 tenant", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3")
      .mockReturnValueOnce(err(new UserError("coordinator", "checkM365TenantError", "msg", "msg")))
      .mockReturnValueOnce(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "signout").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("Continue"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      err(new UserError("coordinator", "ensureSubscriptionError", "msg", "msg"))
    );
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "ensureSubscriptionError");
    }
  });
  it("provision failed with getting m365 tenant id after user retry", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId")
      .mockResolvedValueOnce(
        ok({
          tenantIdInToken: "mockM365Tenant",
          tenantUserName: "mockM365UserName",
        })
      )
      .mockResolvedValueOnce(
        err(new UserError("coordinator", "getM365TenantIdError", "msg", "msg"))
      );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(
      err(new UserError("coordinator", "checkM365TenantError", "msg", "msg"))
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "signout").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("Continue"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "getM365TenantIdError");
    }
  });
  it("provision failed with user cancel after m365 tenant id mismatch", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(
      err(new UserError("coordinator", "checkM365TenantError", "msg", "msg"))
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "signout").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("Cancel"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UserCancel");
    }
  });
  it("provision failed with user exit after m365 tenant id mismatch", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(
      err(new UserError("coordinator", "checkM365TenantError", "msg", "msg"))
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "signout").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(undefined);
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UserCancel");
    }
  });
  it("provision failed with no subscription permission", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
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
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockRejectedValue(
      new UserError({ source: "Test", name: "NoPermission" })
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
      ignoreLockByUT: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });
  it("provision with no progress bar", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      provision: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
        },
        execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
        resolveDriverInstances: mockedResolveDriverInstances,
      },
      environmentFolderPath: "./envs",
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureSubscription").mockResolvedValue(
      ok({
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      })
    );
    vi.spyOn(provisionUtils, "ensureResourceGroup").mockResolvedValue(
      ok({
        createNewResourceGroup: true,
        name: "test-rg",
        location: "East US",
      })
    );
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(provisionUtils, "askForProvisionConsentV3").mockResolvedValue(ok(undefined));
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        tenantId: "mockTenantId",
        subscriptionName: "mockSubName",
      }
    );
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
    vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
      if (config.name === "env") {
        return ok({ type: "success", result: "dev" });
      } else {
        return ok({ type: "success", result: "" });
      }
    });
    vi.spyOn(resourceGroupHelper, "createNewResourceGroup").mockResolvedValue(ok("test-rg"));
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(tools.ui, "createProgressBar").mockReturnValue(undefined as any as IProgressHandler);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      ignoreLockByUT: true,
      isLocalDebug: true,
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isOk());
    // getSelectedEnv
    const selectEnvRes = await fxCore.getSelectedEnv(inputs);
    if (selectEnvRes.isErr()) {
      console.log(selectEnvRes.error);
    }
    assert.isTrue(selectEnvRes.isOk());
    if (selectEnvRes.isOk()) {
      assert.equal(selectEnvRes.value, "dev");
    }
  });
  it("provision select subscription cancel", async () => {
    const mockProjectModel: ProjectModel = {
      version: "1.0.0",
      registerApp: {
        name: "configureApp",
        driverDefs: [
          {
            uses: "arm/deploy",
            with: undefined,
          },
          {
            uses: "teamsApp/create",
            with: undefined,
          },
        ],
        resolvePlaceholders: () => {
          return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
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
    vi.spyOn(provisionUtils, "ensureM365TenantMatchesV3").mockReturnValue(ok(undefined));
    vi.spyOn(provisionUtils, "getM365TenantId").mockResolvedValue(
      ok({
        tenantIdInToken: "mockM365Tenant",
        tenantUserName: "mockM365UserName",
      })
    );
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue();
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockRejectedValue(
      new UserCancelError()
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
      env: "dev",
    };
    const fxCore = new FxCore(tools);
    const res = await fxCore.provisionResources(inputs);
    assert.isTrue(res.isErr());
  });

  it("provision showAadResourceLink", async () => {
    const mockProjectModel = {
      aadPermission: {
        graphPermission: {
          hasGraphPermission: true,
          hasRole: true,
          hasAdminScope: true,
          scopes: ["scope1", "scope2"],
          roles: ["role1", "role2"],
        },
      },
    } as ProjectModel;
    const ctx = tools as unknown as DriverContext;
    showAadResourceLink(ctx, false, mockProjectModel);
    showAadResourceLink(ctx, true, mockProjectModel);
    showAadResourceLink(ctx, true, mockProjectModel, "test-app-id");
    mockProjectModel.aadPermission?.graphPermission.roles.push(
      "ExternalConnection.ReadWrite.OwnedBy"
    );
    showAadResourceLink(ctx, true, mockProjectModel, "test-app-id");
    mockProjectModel.aadPermission = undefined;
    showAadResourceLink(ctx, true, mockProjectModel, "test-app-id");
  });

  it("provision showAadResourceLink", async () => {
    const mockProjectModel = {
      aadPermission: {
        graphPermission: {
          hasGraphPermission: true,
          hasRole: true,
          hasAdminScope: true,
          scopes: ["scope1", "scope2"],
          roles: ["ExternalConnection.ReadWrite.OwnedBy"],
        },
      },
    } as ProjectModel;
    const ctx = tools as unknown as DriverContext;
    const stubShowMessage = vi.spyOn(tools.ui, "showMessage");
    vi.spyOn(tools.ui, "openUrl").mockResolvedValue(ok(true));
    stubShowMessage.mockResolvedValueOnce(err("error" as any));
    stubShowMessage.mockResolvedValueOnce(ok("false title"));
    stubShowMessage.mockResolvedValueOnce(ok("View provisioned Entra ID"));
    showAadResourceLink(ctx, true, mockProjectModel, "test-app-id");
    showAadResourceLink(ctx, true, mockProjectModel, "test-app-id");
    showAadResourceLink(ctx, true, mockProjectModel, "test-app-id");
  });

  it("provision openUrl", async () => {
    const ctx = tools as unknown as DriverContext;
    const ui = ctx.ui;
    ctx.ui = undefined;
    openUrl(ctx, "test-url");
    ctx.ui = ui;
  });
});
