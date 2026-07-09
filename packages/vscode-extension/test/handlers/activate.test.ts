import path from "path";
import { assert, vi } from "vitest";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import * as fileSystemWatcher from "../../src/utils/fileSystemWatcher";
import { mockValue } from "../mocks/vitestMockUtils";

import { ok, signedIn, signedOut } from "@microsoft/teamsfx-api";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import { FxCore, GraphScopes, featureFlagManager } from "@microsoft/teamsfx-core";
import envTreeProviderInstance from "../../src//treeview/environmentTreeViewProvider";
import commandController from "../../src/commandController";
import { AzureAccountManager } from "../../src/commonlib/azureLogin";
import M365TokenInstance from "../../src/commonlib/m365Login";
import {
  activate,
  refreshEnvTreeOnEnvFileChanged,
  refreshEnvTreeOnFilesNameChanged,
  refreshEnvTreeOnProjectSettingFileChanged,
} from "../../src/handlers/activate";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import accountTreeViewProviderInstance from "../../src/treeview/account/accountTreeViewProvider";
import TreeViewManagerInstance from "../../src/treeview/treeViewManager";
import { MockCore } from "../mocks/mockCore";

vi.mock("@microsoft/teamsfx-core/build/common/projectSettingsHelper", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@microsoft/teamsfx-core/build/common/projectSettingsHelper")
    >();
  return { ...actual };
});

vi.mock("@microsoft/teamsfx-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/teamsfx-core")>();
  return { ...actual };
});

vi.mock("../../src/utils/fileSystemWatcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/fileSystemWatcher")>();
  return { ...actual };
});

describe("Activate", function () {
  describe("activate()", function () {
    beforeEach(() => {
      vi.spyOn(accountTreeViewProviderInstance, "subscribeToStatusChanges");
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);
      vi.spyOn(TreeViewManagerInstance, "getTreeView").mockReturnValue(undefined);
      vi.spyOn(ExtTelemetry, "dispose");
    });

    it("No globalState error", async () => {
      const result = await activate();
      assert.deepEqual(result.isOk() ? result.value : result.error.name, {});
    });

    it("Valid project", async () => {
      vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(true);
      const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const addSharedPropertyStub = vi.spyOn(ExtTelemetry, "addSharedProperty");
      const setCommandIsRunningStub = vi.spyOn(globalVariables, "setCommandIsRunning");
      mockValue(globalVariables, "workspaceUri", vscode.Uri.parse("test"));
      const addFileSystemWatcherStub = vi
        .spyOn(fileSystemWatcher, "addFileSystemWatcher")
        .mockImplementation(() => {});
      const lockedByOperationStub = vi.spyOn(commandController, "lockedByOperation");
      const unlockedByOperationStub = vi.spyOn(commandController, "unlockedByOperation");
      const azureAccountSetStatusChangeMapStub = vi.spyOn(
        AzureAccountManager.prototype,
        "setStatusChangeMap"
      );
      const m365AccountSetStatusChangeMapStub = vi.spyOn(M365TokenInstance, "setStatusChangeMap");
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue(undefined);
      let lockCallback: any;
      let unlockCallback: any;

      vi.spyOn(FxCore.prototype, "on").mockImplementation((event: string, callback: any) => {
        if (event === "lock") {
          lockCallback = callback;
        } else {
          unlockCallback = callback;
        }
      });
      azureAccountSetStatusChangeMapStub.mockImplementation(
        (
          name: string,
          statusChange: (
            status: string,
            token?: string,
            accountInfo?: Record<string, unknown>
          ) => Promise<void>
        ) => {
          statusChange(signedIn).then(() => {});
          statusChange(signedOut).then(() => {});
          return Promise.resolve(true);
        }
      );
      m365AccountSetStatusChangeMapStub.mockImplementation(
        (
          name: string,
          tokenRequest: unknown,
          statusChange: (
            status: string,
            token?: string,
            accountInfo?: Record<string, unknown>
          ) => Promise<void>
        ) => {
          statusChange(signedIn).then(() => {});
          statusChange(signedOut).then(() => {});
          return Promise.resolve(ok(true));
        }
      );
      const result = await activate();

      assert.isTrue(addFileSystemWatcherStub.calledOnceWith("test"));
      assert.isTrue(addSharedPropertyStub.called);
      assert.isTrue(sendTelemetryStub.calledOnceWith("open-teams-app"));
      assert.deepEqual(result.isOk() ? result.value : result.error.name, {});

      lockCallback("test");
      setCommandIsRunningStub.calledOnceWith(true);
      lockedByOperationStub.calledOnceWith("test");

      unlockCallback("test");
      unlockedByOperationStub.calledOnceWith("test");

      assert.isTrue(showMessageStub.called);
    });

    it("uses Graph scopes for M365 status change in sovereign high", async () => {
      vi.spyOn(featureFlagManager, "getStringValue").mockReturnValue("GCC H");
      vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(true);
      vi.spyOn(ExtTelemetry, "addSharedProperty");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "workspaceUri", vscode.Uri.parse("test"));
      vi.spyOn(fileSystemWatcher, "addFileSystemWatcher").mockImplementation(() => {});
      vi.spyOn(commandController, "lockedByOperation");
      vi.spyOn(commandController, "unlockedByOperation");
      vi.spyOn(AzureAccountManager.prototype, "setStatusChangeMap").mockResolvedValue(true);
      const m365AccountSetStatusChangeMapStub = vi
        .spyOn(M365TokenInstance, "setStatusChangeMap")
        .mockResolvedValue(ok(true));
      vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
      vi.spyOn(FxCore.prototype, "on").mockReturnValue();

      const result = await activate();

      assert.isTrue(result.isOk());
      assert.isTrue(
        m365AccountSetStatusChangeMapStub.calledWithMatch(
          "successfully-sign-in-m365",
          { scopes: GraphScopes },
          expect.any(Function),
          false
        )
      );
    });

    it("throws error", async () => {
      vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(false);
      vi.spyOn(M365TokenInstance, "setStatusChangeMap");
      vi.spyOn(FxCore.prototype, "on").throws(new Error("test"));
      const showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockResolvedValue(undefined);

      const result = await activate();

      assert.isTrue(result.isErr());
      assert.isTrue(showErrorMessageStub.called);
    });
  });

  describe("refreshEnvTreeOnEnvFileChanged", function () {
    it("Refresh Env", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const isEnvFileStub = vi.spyOn(globalVariables.core, "isEnvFile").mockResolvedValue(ok(true));
      const reloadEnvStub = vi.spyOn(envTreeProviderInstance, "reloadEnvironments");
      await refreshEnvTreeOnEnvFileChanged("workspaceUri", [
        vscode.Uri.parse("File1"),
        vscode.Uri.parse("File2"),
      ]);
      assert.isTrue(isEnvFileStub.calledOnce);
      assert.isTrue(reloadEnvStub.calledOnce);
    });

    it("No need to refresh Env", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const isEnvFileStub = vi
        .spyOn(globalVariables.core, "isEnvFile")
        .mockResolvedValue(ok(false));
      const reloadEnvStub = vi.spyOn(envTreeProviderInstance, "reloadEnvironments");
      await refreshEnvTreeOnEnvFileChanged("workspaceUri", [
        vscode.Uri.parse("File1"),
        vscode.Uri.parse("File2"),
      ]);
      assert.isTrue(isEnvFileStub.calledTwice);
      assert.isTrue(reloadEnvStub.notCalled);
    });
  });

  describe("refreshEnvTreeOnFilesNameChanged", function () {
    it("Refresh Env", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const isEnvFileStub = vi
        .spyOn(globalVariables.core, "isEnvFile")
        .mockImplementation((projectPath, inputFile) => {
          if (inputFile === "File1New" || inputFile === "File2New") {
            return Promise.resolve(ok(true));
          }
          return Promise.resolve(ok(false));
        });
      const reloadEnvStub = vi.spyOn(envTreeProviderInstance, "reloadEnvironments");
      await refreshEnvTreeOnFilesNameChanged("workspaceUri", {
        files: [
          { newUri: vscode.Uri.parse("File1New"), oldUri: vscode.Uri.parse("File1Old") },
          { newUri: vscode.Uri.parse("File2New"), oldUri: vscode.Uri.parse("File2Old") },
        ],
      });
      assert.isTrue(isEnvFileStub.calledOnce);
      assert.isTrue(reloadEnvStub.calledOnce);
    });

    it("No need to refresh Env", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const isEnvFileStub = vi
        .spyOn(globalVariables.core, "isEnvFile")
        .mockResolvedValue(ok(false));
      const reloadEnvStub = vi.spyOn(envTreeProviderInstance, "reloadEnvironments");
      await refreshEnvTreeOnFilesNameChanged("workspaceUri", {
        files: [
          { newUri: vscode.Uri.parse("File1New"), oldUri: vscode.Uri.parse("File1Old") },
          { newUri: vscode.Uri.parse("File2New"), oldUri: vscode.Uri.parse("File2Old") },
        ],
      });
      assert.isTrue(isEnvFileStub.callCount === 4);
      assert.isTrue(reloadEnvStub.notCalled);
    });
  });

  // eslint-disable-next-line no-secrets/no-secrets
  describe("refreshEnvTreeOnProjectSettingFileChanged", function () {
    it("Refresh Env", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const reloadEnvStub = vi.spyOn(envTreeProviderInstance, "reloadEnvironments");
      await refreshEnvTreeOnProjectSettingFileChanged(
        ".",
        path.resolve(".", `.fx`, "configs", "projectSettings.json")
      );
      assert.isTrue(reloadEnvStub.calledOnce);
    });

    it("No need to refresh Env", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const reloadEnvStub = vi.spyOn(envTreeProviderInstance, "reloadEnvironments");
      await refreshEnvTreeOnProjectSettingFileChanged(
        "..",
        path.resolve(".", `.fx`, "configs", "projectSettings.json")
      );
      assert.isTrue(reloadEnvStub.notCalled);
    });
  });
});
