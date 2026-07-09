import {
  err,
  FxError,
  Inputs,
  ok,
  Platform,
  Result,
  Stage,
  UserError,
} from "@microsoft/teamsfx-api";
import { UserCancelError, VersionState } from "@microsoft/teamsfx-core";
import * as uuid from "uuid";
import { assert, expect, vi } from "vitest";
import * as vscode from "vscode";
import { RecommendedOperations } from "../../src/debug/common/debugConstants";
import * as globalVariables from "../../src/globalVariables";
import { processResult, runCommand } from "../../src/handlers/sharedOpts";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { TelemetryEvent, TelemetryProperty } from "../../src/telemetry/extTelemetryEvents";
import * as systemEnvUtils from "../../src/utils/systemEnvUtils";
import * as telemetryUtils from "../../src/utils/telemetryUtils";
import { MockCore } from "../mocks/mockCore";
import { mockValue } from "../mocks/vitestMockUtils";

describe("SharedOpts", () => {
  describe("runCommand()", function () {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    });

    it("create sample with projectid", async () => {
      vi.restoreAllMocks();
      mockValue(globalVariables, "core", new MockCore());
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const createProject = vi.spyOn(globalVariables.core, "createProject");
      vi.spyOn(vscode.commands, "executeCommand");
      const inputs = { projectId: uuid.v4(), platform: Platform.VSCode };

      await runCommand(Stage.create, inputs);

      expect(createProject).toHaveBeenCalledTimes(1);
      assert.isTrue(createProject.args[0][0].projectId != undefined);
      assert.isTrue(sendTelemetryEvent.args[0][1]!["new-project-id"] != undefined);
    });

    it("create from scratch without projectid", async () => {
      vi.restoreAllMocks();
      mockValue(globalVariables, "core", new MockCore());
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const createProject = vi.spyOn(globalVariables.core, "createProject");
      vi.spyOn(vscode.commands, "executeCommand");

      await runCommand(Stage.create);
      expect(createProject).toHaveBeenCalledTimes(1);
      assert.isTrue(createProject.args[0][0].projectId != undefined);
      assert.isTrue(sendTelemetryEvent.args[0][1]!["new-project-id"] != undefined);
    });

    it("provisionResources", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const provisionResources = vi.spyOn(globalVariables.core, "provisionResources");

      await runCommand(Stage.provision);
      expect(provisionResources).toHaveBeenCalledTimes(1);
    });

    it("version check - unsupported should stop stage execution", async () => {
      const mockCore = new MockCore();
      const projectVersionCheck = vi
        .spyOn(mockCore, "projectVersionCheck")
        .mockResolvedValue(ok({ isSupport: VersionState.unsupported }));
      const provisionResources = vi.spyOn(mockCore, "provisionResources");
      mockValue(globalVariables, "core", mockCore);

      const result = await runCommand(Stage.provision, {
        platform: Platform.VSCode,
        projectPath: "test-project",
      } as Inputs);

      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error.name, "IncompatibleProject");
        assert.include(result.error.message, "cannot be upgraded");
      }
      expect(projectVersionCheck).toHaveBeenCalledTimes(1);
      assert.equal(projectVersionCheck.args[0][0].ignoreEnvInfo, true);
      expect(provisionResources).not.toHaveBeenCalled();
    });

    it("version check - upgradeable should stop stage execution", async () => {
      const mockCore = new MockCore();
      const projectVersionCheck = vi
        .spyOn(mockCore, "projectVersionCheck")
        .mockResolvedValue(ok({ isSupport: VersionState.upgradeable }));
      const deployArtifacts = vi.spyOn(mockCore, "deployArtifacts");
      mockValue(globalVariables, "core", mockCore);

      const result = await runCommand(Stage.deploy, {
        platform: Platform.VSCode,
        projectPath: "test-project",
      } as Inputs);

      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error.name, "IncompatibleProject");
        assert.include(result.error.message, "can be upgraded");
      }
      expect(projectVersionCheck).toHaveBeenCalledTimes(1);
      assert.equal(projectVersionCheck.args[0][0].ignoreEnvInfo, true);
      expect(deployArtifacts).not.toHaveBeenCalled();
    });

    it("version check - compatible should continue stage execution", async () => {
      const mockCore = new MockCore();
      const projectVersionCheck = vi
        .spyOn(mockCore, "projectVersionCheck")
        .mockResolvedValue(ok({ isSupport: VersionState.compatible }));
      const deployArtifacts = vi.spyOn(mockCore, "deployArtifacts");
      mockValue(globalVariables, "core", mockCore);

      const result = await runCommand(Stage.deploy, {
        platform: Platform.VSCode,
        projectPath: "test-project",
      } as Inputs);

      assert.isTrue(result.isOk());
      expect(projectVersionCheck).toHaveBeenCalledTimes(1);
      assert.equal(projectVersionCheck.args[0][0].ignoreEnvInfo, true);
      expect(deployArtifacts).toHaveBeenCalledTimes(1);
    });

    it("version check error should stop stage execution", async () => {
      const mockCore = new MockCore();
      const versionError = new UserError("test", "versionCheck", "version check failed");
      const projectVersionCheck = vi
        .spyOn(mockCore, "projectVersionCheck")
        .mockResolvedValue(err(versionError));
      const deployArtifacts = vi.spyOn(mockCore, "deployArtifacts");
      mockValue(globalVariables, "core", mockCore);

      const result = await runCommand(Stage.deploy, {
        platform: Platform.VSCode,
        projectPath: "test-project",
      } as Inputs);

      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error, versionError);
      }
      expect(projectVersionCheck).toHaveBeenCalledTimes(1);
      expect(deployArtifacts).not.toHaveBeenCalled();
    });

    it("deployTeamsManifest", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const deployTeamsManifest = vi.spyOn(globalVariables.core, "deployTeamsManifest");

      await runCommand(Stage.deployTeams);
      expect(deployTeamsManifest).toHaveBeenCalledTimes(1);
    });
    it("addWebpart", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const addWebpart = vi.spyOn(globalVariables.core, "addWebpart");

      await runCommand(Stage.addWebpart);
      expect(addWebpart).toHaveBeenCalledTimes(1);
    });
    it("createAppPackage", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const createAppPackage = vi.spyOn(globalVariables.core, "createAppPackage");

      await runCommand(Stage.createAppPackage);
      expect(createAppPackage).toHaveBeenCalledTimes(1);
    });
    it("error", async () => {
      mockValue(globalVariables, "core", new MockCore());
      try {
        await runCommand("none" as any);
        assert.fail("should not reach here");
      } catch (e) {}
    });
    it("provisionResources - local", async () => {
      const mockCore = new MockCore();
      const mockCoreStub = vi
        .spyOn(mockCore, "provisionResources")
        .mockResolvedValue(err(new UserError("test", "test", "test")));
      mockValue(globalVariables, "core", mockCore);

      const res = await runCommand(Stage.provision, {
        platform: Platform.VSCode,
        env: "local",
      } as Inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.recommendedOperation, RecommendedOperations.DebugInTestTool);
      }
      expect(mockCoreStub).toHaveBeenCalledTimes(1);
    });

    it("deployArtifacts", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const deployArtifacts = vi.spyOn(globalVariables.core, "deployArtifacts");

      await runCommand(Stage.deploy);
      expect(deployArtifacts).toHaveBeenCalledTimes(1);
    });

    it("deployArtifacts - local", async () => {
      const mockCore = new MockCore();
      const mockCoreStub = vi
        .spyOn(mockCore, "deployArtifacts")
        .mockResolvedValue(err(new UserError("test", "test", "test")));
      mockValue(globalVariables, "core", mockCore);

      await runCommand(Stage.deploy, {
        platform: Platform.VSCode,
        env: "local",
      } as Inputs);
      expect(mockCoreStub).toHaveBeenCalledTimes(1);
    });

    it("deployAadManifest", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const deployAadManifest = vi.spyOn(globalVariables.core, "deployAadManifest");
      const input: Inputs = systemEnvUtils.getSystemInputs();
      await runCommand(Stage.deployAad, input);

      expect(deployAadManifest).toHaveBeenCalledTimes(1);
    });

    it("deployAadManifest happy path", async () => {
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(globalVariables.core, "deployAadManifest").mockResolvedValue(ok(undefined));
      const input: Inputs = systemEnvUtils.getSystemInputs();
      const res = await runCommand(Stage.deployAad, input);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.strictEqual(res.value, undefined);
      }
    });

    it("localDebug", async () => {
      mockValue(globalVariables, "core", new MockCore());

      let ignoreEnvInfo: boolean | undefined = undefined;
      let localDebugCalled = 0;
      vi.spyOn(globalVariables.core, "localDebug").mockImplementation(
        async (inputs: Inputs): Promise<Result<undefined, FxError>> => {
          ignoreEnvInfo = inputs.ignoreEnvInfo;
          localDebugCalled += 1;
          return ok(undefined);
        }
      );

      await runCommand(Stage.debug);
      expect(ignoreEnvInfo).to.equal(false);
      expect(localDebugCalled).equals(1);
    });

    it("publishApplication", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const publishApplication = vi.spyOn(globalVariables.core, "publishApplication");

      await runCommand(Stage.publish);
      expect(publishApplication).toHaveBeenCalledTimes(1);
    });

    it("createEnv", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const createEnv = vi.spyOn(globalVariables.core, "createEnv");
      vi.spyOn(vscode.commands, "executeCommand");

      await runCommand(Stage.createEnv);
      expect(createEnv).toHaveBeenCalledTimes(1);
    });
    it("syncManifest", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const syncManifest = vi.spyOn(globalVariables.core, "syncManifest");
      vi.spyOn(vscode.commands, "executeCommand");

      await runCommand(Stage.syncManifest);
      expect(syncManifest).toHaveBeenCalledTimes(1);
    });
    it("setSensitivityLabel", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const setSensitivityLabel = vi.spyOn(globalVariables.core, "setSensitivityLabel");
      vi.spyOn(vscode.commands, "executeCommand");
      await runCommand(Stage.setSensitivityLabel);
      expect(setSensitivityLabel).toHaveBeenCalledTimes(1);
    });
    it("share", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const shareApplication = vi.spyOn(globalVariables.core, "shareApplication");
      vi.spyOn(vscode.commands, "executeCommand");
      await runCommand(Stage.share);
      expect(shareApplication).toHaveBeenCalledTimes(1);
    });
    it("shareRemove", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const removeSharedAccess = vi.spyOn(globalVariables.core, "removeSharedAccess");
      vi.spyOn(vscode.commands, "executeCommand");
      await runCommand(Stage.shareRemove);
      expect(removeSharedAccess).toHaveBeenCalledTimes(1);
    });
    it("installApp", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const installAppStub = vi.spyOn(globalVariables.core, "installAppToChannel");
      vi.spyOn(vscode.commands, "executeCommand");
      await runCommand(Stage.installApp);
      expect(installAppStub).toHaveBeenCalledTimes(1);
    });
  });

  describe("processResult", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    });

    it("CreateProject includes M365 telemetry", async () => {
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await processResult(TelemetryEvent.CreateProject, ok(null), {
        platform: Platform.VSCode,
        projectId: "project-id",
        isM365: true,
      });

      expect(sendTelemetryEvent).toHaveBeenCalledWith(
        TelemetryEvent.CreateProject,
        expect.objectContaining({
          [TelemetryProperty.NewProjectId]: "project-id",
          [TelemetryProperty.IsCreatingM365]: "true",
        })
      );
    });

    it("Deploy remaps to DeployAadManifest when aad manifest is included", async () => {
      const sendTelemetryErrorEvent = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const deployError = new UserError("test", "deploy", "deploy failed");

      await processResult(TelemetryEvent.Deploy, err(deployError), {
        platform: Platform.VSCode,
        env: "dev",
        "include-aad-manifest": "yes",
      } as Inputs);

      expect(sendTelemetryErrorEvent).toHaveBeenCalledWith(
        TelemetryEvent.DeployAadManifest,
        deployError,
        expect.any(Object)
      );
    });

    it("login failure shows login failed message", async () => {
      const showErrorMessage = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockResolvedValue(undefined);

      await processResult(
        TelemetryEvent.Deploy,
        err(new UserError("test", "login", "Cannot get user login information")),
        { platform: Platform.VSCode } as Inputs
      );

      expect(showErrorMessage).toHaveBeenCalledTimes(1);
    });

    it("UserCancelError", async () => {
      vi.spyOn(telemetryUtils, "getTeamsAppTelemetryInfoByEnv").mockResolvedValue({
        appId: "mockId",
        tenantId: "mockTenantId",
      });
      await processResult("", err(new UserCancelError()), {
        platform: Platform.VSCode,
        env: "dev",
      });
    });
    it("CreateNewEnvironment", async () => {
      await processResult(TelemetryEvent.CreateNewEnvironment, ok(null), {
        platform: Platform.VSCode,
        sourceEnvName: "dev",
        targetEnvName: "dev1",
      });
    });

    it("addWebpart throws when core does not have addWebpart method", async () => {
      const coreWithoutAddWebpart = { ...new MockCore() };
      delete (coreWithoutAddWebpart as any).addWebpart;
      mockValue(globalVariables, "core", coreWithoutAddWebpart);
      const sendTelemetryErrorEvent = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

      const result = await runCommand(Stage.addWebpart);

      expect(result.isErr()).to.be.true;
      expect(result.isErr() && result.error).to.have.property("name");
      expect(sendTelemetryErrorEvent).toHaveBeenCalledTimes(1);
    });
  });
});
