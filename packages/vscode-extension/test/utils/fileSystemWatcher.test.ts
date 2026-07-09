import { assert, expect, vi } from "vitest";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import TreeViewManagerInstance from "../../src/treeview/treeViewManager";

vi.mock("@microsoft/teamsfx-core/build/common/projectSettingsHelper", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@microsoft/teamsfx-core/build/common/projectSettingsHelper")
    >();
  return { ...actual };
});

import * as teamsfxCore from "@microsoft/teamsfx-core";
import {
  addFileSystemWatcher,
  fileSystemWatcherOps,
  refreshSPFxTreeOnFileChanged,
  sendSDKVersionTelemetry,
} from "../../src/utils/fileSystemWatcher";
vi.mock("@microsoft/teamsfx-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/teamsfx-core")>();
  return { ...actual };
});

const fileSystemWatcherDeps = fileSystemWatcherOps;

describe("FileSystemWatcher", function () {
  describe("addFileSystemWatcher", function () {
    it("addFileSystemWatcher detect SPFx project", async () => {
      const workspacePath = "test";
      vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(true);
      vi.spyOn(globalVariables, "initializeGlobalVariables").mockImplementation(() => {});
      vi.spyOn(TreeViewManagerInstance, "updateDevelopmentTreeView").mockResolvedValue();

      const watcher = {
        onDidCreate: () => ({ dispose: () => undefined }),
        onDidChange: () => ({ dispose: () => undefined }),
        onDidDelete: () => ({ dispose: () => undefined }),
      } as any;
      const createWatcher = vi
        .spyOn(vscode.workspace, "createFileSystemWatcher")
        .mockReturnValue(watcher);
      const createListener = vi
        .spyOn(watcher, "onDidCreate")
        .mockImplementation((...args: unknown[]) => {
          (args as any)[0]({ fsPath: "test/package-lock.json" });
          return { dispose: () => undefined };
        });
      const changeListener = vi
        .spyOn(watcher, "onDidChange")
        .mockImplementation((...args: unknown[]) => {
          (args as any)[0]({ fsPath: "test/package-lock.json" });
          return { dispose: () => undefined };
        });
      vi.spyOn(watcher, "onDidDelete").mockImplementation((...args: unknown[]) => {
        return { dispose: () => undefined };
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockImplementation(() => {});

      addFileSystemWatcher(workspacePath);

      assert.equal(createWatcher.callCount, 2);
      assert.equal(createListener.callCount, 2);
      assert.isTrue(changeListener.calledTwice);
    });

    it("addFileSystemWatcher in invalid project", async () => {
      const workspacePath = "test";
      vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(false);

      const watcher = {
        onDidCreate: () => ({ dispose: () => undefined }),
        onDidChange: () => ({ dispose: () => undefined }),
      } as any;
      const createWatcher = vi.spyOn(vscode.workspace, "createFileSystemWatcher");
      const createListener = vi.spyOn(watcher, "onDidCreate").mockResolvedValue();
      const changeListener = vi.spyOn(watcher, "onDidChange").mockResolvedValue();

      addFileSystemWatcher(workspacePath);

      assert.isTrue(createWatcher.notCalled);
      assert.isTrue(createListener.notCalled);
      assert.isTrue(changeListener.notCalled);
    });
  });

  describe("refreshSPFxTreeOnFileChanged", function () {
    it("refreshSPFxTreeOnFileChanged", () => {
      const initGlobalVariables = vi
        .spyOn(globalVariables, "initializeGlobalVariables")
        .mockImplementation(() => {});
      const updateDevelopmentTreeView = vi
        .spyOn(TreeViewManagerInstance, "updateDevelopmentTreeView")
        .mockResolvedValue();

      refreshSPFxTreeOnFileChanged();

      expect(initGlobalVariables.calledOnce).to.be.true;
      expect(updateDevelopmentTreeView.calledOnce).to.be.true;
    });
  });

  describe("sendSDKVersionTelemetry", function () {
    it("happy path", async () => {
      const filePath = "test/package-lock.json";

      const readJsonFunc = vi.spyOn(fileSystemWatcherDeps, "readJson").mockResolvedValue();
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      sendSDKVersionTelemetry(filePath);

      assert.isTrue(readJsonFunc.calledOnce);
    });
  });
});
