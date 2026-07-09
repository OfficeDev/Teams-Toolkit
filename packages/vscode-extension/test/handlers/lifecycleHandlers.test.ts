import { err, ok, SystemError, UserError } from "@microsoft/teamsfx-api";
import {
  AppDefinition,
  featureFlagManager,
  teamsDevPortalClient,
  UnhandledError,
  UserCancelError,
} from "@microsoft/teamsfx-core";
import { ProgressHandler } from "@microsoft/vscode-ui";
import { assert, expect, vi } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

vi.mock("@microsoft/teamsfx-core/build/common/projectSettingsHelper", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@microsoft/teamsfx-core/build/common/projectSettingsHelper")
    >();
  return { ...actual };
});

import * as teamsfxCore from "@microsoft/teamsfx-core";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";
import { RestoreFn } from "mocked-env";
import * as vscode from "vscode";
import M365TokenInstance from "../../src/commonlib/m365Login";
import * as globalVariables from "../../src/globalVariables";
import * as copilotHandler from "../../src/handlers/copilotChatHandlers";
import {
  addAuthActionHandler,
  addKnowledgeHandler,
  addPluginHandler,
  addSkillHandler,
  addWebpartHandler,
  copilotPluginAddAPIHandler,
  createNewProjectHandler,
  deployHandler,
  m365PreAuthHandler,
  provisionHandler,
  publishHandler,
  regeneratePluginHandler,
  scaffoldFromDeveloperPortalHandler,
  setSensitivityLabelHandler,
  shareHandler,
  shareRemoveHandler,
} from "../../src/handlers/lifecycleHandlers";
import * as shared from "../../src/handlers/sharedOpts";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import envTreeProviderInstance from "../../src/treeview/environmentTreeViewProvider";
import * as workspaceUtils from "../../src/utils/workspaceUtils";
import { MockCore } from "../mocks/mockCore";
import { MockTools } from "../mocks/mockTools";
vi.mock("@microsoft/teamsfx-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/teamsfx-core")>();
  return { ...actual };
});

describe("Lifecycle handlers", () => {
  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
  });

  describe("provision handlers", () => {
    it("error", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(err(new UserCancelError()));
      const res = await provisionHandler();
      assert.isTrue(res.isErr());
    });
  });

  describe("createNewProjectHandler", function () {
    const mockedEnvRestore: RestoreFn = () => {};

    afterEach(() => {
      mockedEnvRestore();
      vi.restoreAllMocks();
    });

    it("invokeTeamsAgent", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(
        ok({
          projectPath: "abc",
          shouldInvokeTeamsAgent: true,
          projectId: "mockId",
        })
      );
      vi.spyOn(copilotHandler, "invokeTeamsAgent").mockResolvedValue();
      const res = await createNewProjectHandler();
      assert.isTrue(res.isOk());
    });

    it("triggered in office agent", async () => {
      vi.spyOn(teamsfxCore, "isValidOfficeAddInProject").mockReturnValue(true);
      vi.spyOn(shared, "runCommand").mockResolvedValue(
        ok({
          projectPath: "abc",
          shouldInvokeTeamsAgent: false,
          projectId: "mockId",
        })
      );
      vi.spyOn(copilotHandler, "invokeTeamsAgent").mockResolvedValue();
      const res = await createNewProjectHandler("", { agent: "office" });
      assert.isTrue(res.isOk());
    });

    it("office add-in", async () => {
      vi.spyOn(teamsfxCore, "isValidOfficeAddInProject").mockReturnValue(true);
      const openOfficeDevFolder = vi
        .spyOn(workspaceUtils, "openOfficeDevFolder")
        .mockResolvedValue();
      vi.spyOn(shared, "runCommand").mockResolvedValue(
        ok({
          projectPath: "abc",
          shouldInvokeTeamsAgent: false,
          projectId: "mockId",
        })
      );
      const res = await createNewProjectHandler();
      assert.isTrue(res.isOk());
      assert.isTrue(openOfficeDevFolder.calledOnce);
    });

    it("none office add-in", async () => {
      vi.spyOn(teamsfxCore, "isValidOfficeAddInProject").mockReturnValue(false);
      const openFolder = vi.spyOn(workspaceUtils, "openFolder").mockResolvedValue();
      vi.spyOn(shared, "runCommand").mockResolvedValue(
        ok({
          projectPath: "abc",
          shouldInvokeTeamsAgent: false,
          projectId: "mockId",
        })
      );
      const res = await createNewProjectHandler({ teamsAppFromTdp: true }, {});
      assert.isTrue(res.isOk());
      assert.isTrue(openFolder.calledOnce);
    });
  });

  describe("provisionHandler", function () {
    it("happy", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      vi.spyOn(envTreeProviderInstance, "reloadEnvironments").mockResolvedValue();
      const res = await provisionHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("deployHandler", function () {
    it("happy", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await deployHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("publishHandler", function () {
    it("happy()", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await publishHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("shareHandler", function () {
    it("happy()", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await shareHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("addWebpartHandler", function () {
    it("happy()", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await addWebpartHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("scaffoldFromDeveloperPortalHandler", async () => {
    beforeEach(() => {
      vi.spyOn(globalVariables, "checkIsSPFx").mockReturnValue(false);
    });

    it("missing args", async () => {
      const progressHandler = new ProgressHandler("title", 1);
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);

      const res = await scaffoldFromDeveloperPortalHandler();

      assert.equal(res.isOk(), true);
      assert.equal(createProgressBar.notCalled, true);
    });

    it("incorrect number of args", async () => {
      const progressHandler = new ProgressHandler("title", 1);
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);

      const res = await scaffoldFromDeveloperPortalHandler();

      assert.equal(res.isOk(), true);
      assert.equal(createProgressBar.notCalled, true);
    });

    it("general error when signing in M365", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const progressHandler = new ProgressHandler("title", 1);
      const startProgress = vi.spyOn(progressHandler, "start").mockResolvedValue();
      const endProgress = vi.spyOn(progressHandler, "end").mockResolvedValue();
      vi.spyOn(M365TokenInstance, "signInWhenInitiatedFromTdp").throws("error1");
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);
      const showErrorMessage = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockResolvedValue(undefined);

      const res = await scaffoldFromDeveloperPortalHandler(["appId"]);
      assert.isTrue(res.isErr());
      assert.isTrue(createProgressBar.calledOnce);
      assert.isTrue(startProgress.calledOnce);
      assert.isTrue(endProgress.calledOnceWithExactly(false));
      assert.isTrue(showErrorMessage.calledOnce);
      if (res.isErr()) {
        assert.isTrue(res.error instanceof UnhandledError);
      }
    });

    it("error when signing M365", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const progressHandler = new ProgressHandler("title", 1);
      const startProgress = vi.spyOn(progressHandler, "start").mockResolvedValue();
      const endProgress = vi.spyOn(progressHandler, "end").mockResolvedValue();
      vi.spyOn(M365TokenInstance, "signInWhenInitiatedFromTdp").mockResolvedValue(
        err(new UserError("source", "name", "message", "displayMessage"))
      );
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);
      const showErrorMessage = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockResolvedValue(undefined);

      const res = await scaffoldFromDeveloperPortalHandler(["appId"]);

      assert.equal(res.isErr(), true);
      assert.equal(createProgressBar.calledOnce, true);
      assert.equal(startProgress.calledOnce, true);
      assert.equal(endProgress.calledOnceWithExactly(false), true);
      assert.equal(showErrorMessage.calledOnce, true);
    });

    it("error when signing in M365 but missing display message", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const progressHandler = new ProgressHandler("title", 1);
      const startProgress = vi.spyOn(progressHandler, "start").mockResolvedValue();
      const endProgress = vi.spyOn(progressHandler, "end").mockResolvedValue();
      vi.spyOn(M365TokenInstance, "signInWhenInitiatedFromTdp").mockResolvedValue(
        err(new UserError("source", "name", "", ""))
      );
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);
      const showErrorMessage = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockResolvedValue(undefined);

      const res = await scaffoldFromDeveloperPortalHandler(["appId"]);

      assert.equal(res.isErr(), true);
      assert.equal(createProgressBar.calledOnce, true);
      assert.equal(startProgress.calledOnce, true);
      assert.equal(endProgress.calledOnceWithExactly(false), true);
      assert.equal(showErrorMessage.calledOnce, true);
    });

    it("failed to get teams app", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const progressHandler = new ProgressHandler("title", 1);
      const startProgress = vi.spyOn(progressHandler, "start").mockResolvedValue();
      const endProgress = vi.spyOn(progressHandler, "end").mockResolvedValue();
      vi.spyOn(M365TokenInstance, "signInWhenInitiatedFromTdp").mockResolvedValue(ok("token"));
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        err(new SystemError("source", "name", "", ""))
      );
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(vscode.commands, "executeCommand");
      vi.spyOn(globalState, "globalStateUpdate");
      const getApp = vi.spyOn(teamsDevPortalClient, "getApp").throws("error");

      const res = await scaffoldFromDeveloperPortalHandler(["appId"]);

      assert.isTrue(res.isErr());
      assert.isTrue(getApp.calledOnce);
      assert.isTrue(createProgressBar.calledOnce);
      assert.isTrue(startProgress.calledOnce);
      assert.isTrue(endProgress.calledOnceWithExactly(true));
    });

    it("happy path", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const progressHandler = new ProgressHandler("title", 1);
      const startProgress = vi.spyOn(progressHandler, "start").mockResolvedValue();
      const endProgress = vi.spyOn(progressHandler, "end").mockResolvedValue();
      vi.spyOn(M365TokenInstance, "signInWhenInitiatedFromTdp").mockResolvedValue(ok("token"));
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(ok("authSvcToken"));
      vi.spyOn(teamsDevPortalClient, "setRegionEndpointByToken").mockResolvedValue();
      vi.spyOn(workspaceUtils, "openFolder").mockResolvedValue();
      const createProgressBar = vi
        .spyOn(vsc_ui.VS_CODE_UI, "createProgressBar")
        .mockReturnValue(progressHandler);
      mockValue(globalVariables, "core", new MockCore());
      const createProject = vi.spyOn(globalVariables.core, "createProjectFromTdp");
      vi.spyOn(vscode.commands, "executeCommand");
      vi.spyOn(globalState, "globalStateUpdate");
      const appDefinition: AppDefinition = {
        teamsAppId: "mock-id",
      };
      vi.spyOn(teamsDevPortalClient, "getApp").mockResolvedValue(appDefinition);

      const res = await scaffoldFromDeveloperPortalHandler("appId", "testuser");

      assert.equal(createProject.args[0][0].teamsAppFromTdp.teamsAppId, "mock-id");
      assert.isTrue(res.isOk());
      assert.isTrue(createProgressBar.calledOnce);
      assert.isTrue(startProgress.calledOnce);
      assert.isTrue(endProgress.calledOnceWithExactly(true));
    });

    it("skip AuthSvc region setup in sovereign high", async () => {
      vi.spyOn(featureFlagManager, "getStringValue").mockReturnValue("DoD");
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(progressHandler, "start").mockResolvedValue();
      vi.spyOn(progressHandler, "end").mockResolvedValue();
      vi.spyOn(M365TokenInstance, "signInWhenInitiatedFromTdp").mockResolvedValue(ok("token"));
      const getAccessTokenStub = vi.spyOn(M365TokenInstance, "getAccessToken");
      const setRegionStub = vi
        .spyOn(teamsDevPortalClient, "setRegionEndpointByToken")
        .mockResolvedValue();
      vi.spyOn(workspaceUtils, "openFolder").mockResolvedValue();
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(vscode.commands, "executeCommand");
      vi.spyOn(globalState, "globalStateUpdate");
      vi.spyOn(teamsDevPortalClient, "getApp").mockResolvedValue({
        teamsAppId: "mock-id",
      } as AppDefinition);

      const res = await scaffoldFromDeveloperPortalHandler("appId", "testuser");

      assert.isTrue(res.isOk());
      assert.isTrue(getAccessTokenStub.notCalled);
      assert.isTrue(setRegionStub.notCalled);
    });
  });

  describe("copilotPluginAddAPIHandler", async () => {
    it("API ME:", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const addAPIHanlder = vi.spyOn(globalVariables.core, "copilotPluginAddAPI");
      const args = [
        {
          fsPath: "manifest.json",
        },
      ];

      await copilotPluginAddAPIHandler(args);

      expect(addAPIHanlder).toHaveBeenCalledTimes(1);
    });

    it("API Plugin", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const addAPIHanlder = vi.spyOn(globalVariables.core, "copilotPluginAddAPI");
      const args = [
        {
          fsPath: "openapi.yaml",
          isFromApiPlugin: true,
          manifestPath: "manifest.json",
        },
      ];

      await copilotPluginAddAPIHandler(args);

      expect(addAPIHanlder).toHaveBeenCalledTimes(1);
    });
  });

  describe("AddPluginHandler", async () => {
    it("success:", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const addPluginHanlder = vi.spyOn(globalVariables.core, "addPlugin");

      await addPluginHandler();

      expect(addPluginHanlder).toHaveBeenCalledTimes(1);
    });
  });

  describe("regeneratePluginHandler", async () => {
    it("success:", async () => {
      mockValue(globalVariables, "core", new MockCore());
      await regeneratePluginHandler();
    });

    it("failed: when runCommand throw error", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(
        err(new UserError("source", "name", "message"))
      );
      const result = await regeneratePluginHandler();
      assert.isTrue(result.isErr());
    });
  });

  describe("AddAuthActionHandler", async () => {
    it("happy path", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Provision");
      const addAuthAction = vi.spyOn(globalVariables.core, "addAuthAction");
      const runCommandSpy = vi.spyOn(shared, "runCommand");
      await addAuthActionHandler();
      expect(addAuthAction).toHaveBeenCalledTimes(1);
      expect(runCommandSpy.mock.calls.some((call) => call[0] === "provision")).toBe(true);
    });
  });

  describe("addKnowledgeHandler", async () => {
    it("happy path", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const addKnowledge = vi.spyOn(globalVariables.core, "addKnowledge");

      await addKnowledgeHandler();

      expect(addKnowledge).toHaveBeenCalledTimes(1);
    });
  });

  describe("addSkillHandler", async () => {
    it("happy path", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const addSkill = vi.spyOn(globalVariables.core, "addSkill");

      await addSkillHandler();

      expect(addSkill).toHaveBeenCalledTimes(1);
    });
  });

  describe("setSensitivityLabelHandler", () => {
    it("runCommand successfully", async () => {
      const args = [{ declarativeAgentManifestPath: "path", sensitivityLabel: "label" }];
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await setSensitivityLabelHandler(args);
    });

    it("runCommand successfully - no args", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await setSensitivityLabelHandler([]);
    });

    it("runCommand successfully - undefined array args", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await setSensitivityLabelHandler([undefined]);
    });

    it("runCommand successfully - undefined args", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await setSensitivityLabelHandler(undefined as any);
    });

    it("runCommand fails", async () => {
      const args = [{ declarativeAgentManifestPath: "path", sensitivityLabel: "label" }];
      const error = new UserError("source", "name", "message");
      vi.spyOn(shared, "runCommand").mockResolvedValue(err(error));

      await setSensitivityLabelHandler(args);
    });
  });
  describe("shareRemoveHandler", () => {
    it("runCommand successfully", async () => {
      const args = [{ teamsAppId: "appId" }];
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await shareRemoveHandler(args);
    });
  });
  describe("m365PreAuthHandler", () => {
    globalVariables.setTools(new MockTools());
    it("get access token successfully", async () => {
      const args = [{ scopes: ["scope1"] }];
      mockValue(globalVariables, "tools", globalVariables.tools);
      vi.spyOn(
        globalVariables.tools.tokenProvider.m365TokenProvider,
        "getAccessToken"
      ).mockResolvedValue(ok("token"));
      await m365PreAuthHandler(args);
    });

    it("get access token fails", async () => {
      const args = [{ scopes: ["scope1"] }];
      const error = new UserError("source", "name", "message");
      mockValue(globalVariables, "tools", globalVariables.tools);
      vi.spyOn(
        globalVariables.tools.tokenProvider.m365TokenProvider,
        "getAccessToken"
      ).mockResolvedValue(err(error));
      await m365PreAuthHandler(args);
    });
  });
});
