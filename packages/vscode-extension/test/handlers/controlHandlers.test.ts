import { ok, TeamsAppManifest } from "@microsoft/teamsfx-api";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import * as path from "path";
import { assert, expect, vi } from "vitest";
import * as vscode from "vscode";
import { PanelType } from "../../src/controls/PanelType";
import { WebviewPanel } from "../../src/controls/webviewPanel";
import * as globalVariables from "../../src/globalVariables";
import {
  openFolderHandler,
  openLifecycleTreeview,
  openSamplesHandler,
  openWelcomeHandler,
  saveTextDocumentHandler,
  selectWalkthrough,
} from "../../src/handlers/controlHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryUpdateAppReason,
} from "../../src/telemetry/extTelemetryEvents";
import * as commonUtils from "../../src/utils/commonUtils";
import { getDefaultString } from "../../src/utils/localizeUtils";
import { mockValue } from "../mocks/vitestMockUtils";

vi.mock("@microsoft/teamsfx-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/teamsfx-core")>();
  return { ...actual };
});

describe("Control Handlers", () => {
  describe("openWelcomeHandler", () => {
    it("opens intelligent app walkthrough for API plugin apps", async () => {
      vi.spyOn(teamsfxCore.featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(teamsfxCore.manifestUtils, "readAppManifest").mockResolvedValue(
        ok({} as TeamsAppManifest)
      );
      vi.spyOn(teamsfxCore.manifestUtils, "getCapabilities").mockReturnValue(["copilotGpt"]);
      mockValue(globalVariables, "workspaceUri", { fsPath: "/test" });
      const executeCommands = vi.spyOn(vscode.commands, "executeCommand");
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await openWelcomeHandler("invalidArgs");

      expect(executeCommands).toHaveBeenCalledTimes(1);
      expect(executeCommands).toHaveBeenCalledWith(
        "workbench.action.openWalkthrough",
        "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps"
      );
    });

    it("opens intelligent app walkthrough with chat for API plugin apps", async () => {
      vi.spyOn(teamsfxCore.featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(teamsfxCore.manifestUtils, "readAppManifest").mockResolvedValue(
        ok({} as TeamsAppManifest)
      );
      vi.spyOn(teamsfxCore.manifestUtils, "getCapabilities").mockReturnValue(["copilotGpt"]);
      mockValue(globalVariables, "workspaceUri", { fsPath: "/test" });
      const executeCommands = vi.spyOn(vscode.commands, "executeCommand");
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await openWelcomeHandler("invalidArgs");

      expect(executeCommands).toHaveBeenCalledTimes(1);
      expect(executeCommands).toHaveBeenCalledWith(
        "workbench.action.openWalkthrough",
        "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps"
      );
    });

    it("opens intelligent app walkthrough for JS/TS custom engine copilot apps", async () => {
      vi.spyOn(teamsfxCore.featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(teamsfxCore.manifestUtils, "readAppManifest").mockResolvedValue(
        ok({} as TeamsAppManifest)
      );
      vi.spyOn(teamsfxCore.manifestUtils, "getCapabilities").mockReturnValue(["bot"]);
      mockValue(globalVariables, "workspaceUri", { fsPath: "/test" });
      vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
        return path.includes("package.json");
      });
      vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from('"@microsoft/teams-ai"'));
      const executeCommands = vi.spyOn(vscode.commands, "executeCommand");
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await openWelcomeHandler();

      expect(executeCommands).toHaveBeenCalledTimes(1);
      expect(executeCommands).toHaveBeenCalledWith(
        "workbench.action.openWalkthrough",
        "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps"
      );
    });

    it("opens intelligent app walkthrough for python custom engine copilot apps", async () => {
      vi.spyOn(teamsfxCore.featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(teamsfxCore.manifestUtils, "readAppManifest").mockResolvedValue(
        ok({} as TeamsAppManifest)
      );
      vi.spyOn(teamsfxCore.manifestUtils, "getCapabilities").mockReturnValue(["bot"]);
      mockValue(globalVariables, "workspaceUri", { fsPath: "/test" });
      vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
        return path.includes("requirements.txt");
      });
      vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("teams-ai"));
      const executeCommands = vi.spyOn(vscode.commands, "executeCommand");
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await openWelcomeHandler();

      expect(executeCommands).toHaveBeenCalledTimes(1);
      expect(executeCommands).toHaveBeenCalledWith(
        "workbench.action.openWalkthrough",
        "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps"
      );
    });
  });

  describe("openSamplesHandler", () => {
    it("openSamplesHandler", async () => {
      const createOrShow = vi
        .spyOn(WebviewPanel, "createOrShow")
        .mockImplementation(() => undefined);
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await openSamplesHandler();

      expect(createOrShow).toHaveBeenCalledTimes(1);
      expect(createOrShow).toHaveBeenCalledWith(PanelType.SampleGallery, []);
    });
  });

  describe("openFolderHandler", () => {
    it("empty args", async () => {
      const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await openFolderHandler();

      assert.isTrue(sendTelemetryStub.called);
      assert.isTrue(result.isOk());
    });

    it("happy path", async () => {
      const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const openFolderInExplorerStub = vi
        .spyOn(commonUtils, "openFolderInExplorer")
        .mockImplementation(() => {
          return;
        });

      const result = await openFolderHandler("file://path/to/folder");

      const expectedPath = "/path/to/folder".split("/").join(path.sep);
      assert.isTrue(sendTelemetryStub.called);
      assert.isTrue(openFolderInExplorerStub.calledOnceWith(expectedPath));
      assert.isTrue(result.isOk());
    });
  });

  describe("saveTextDocumentHandler", () => {
    it("non valid project", () => {
      const isValidProjectStub = vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(false);
      mockValue(globalVariables, "workspaceUri", { fsPath: "/path/to/workspace" });

      saveTextDocumentHandler({ document: {} } as any);

      assert.isTrue(isValidProjectStub.calledOnceWith("/path/to/workspace"));
    });

    it("manual save reason", () => {
      const isValidProjectStub = vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(true);
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "workspaceUri", { fsPath: "/path/to/workspace" });

      saveTextDocumentHandler({
        document: { fileName: "/dirname/fileName" },
        reason: vscode.TextDocumentSaveReason.Manual,
      } as vscode.TextDocumentWillSaveEvent);

      assert.isTrue(isValidProjectStub.calledTwice);
      assert.equal(isValidProjectStub.getCall(0).args[0], "/path/to/workspace");
      assert.equal(isValidProjectStub.getCall(1).args[0], "/dirname");
      assert.equal(sendTelemetryEventStub.getCall(0).args[0], TelemetryEvent.UpdateTeamsApp);
      assert.equal(
        sendTelemetryEventStub.getCall(0).args[1][TelemetryProperty.UpdateTeamsAppReason],
        TelemetryUpdateAppReason.Manual
      );
    });

    it("after delay save reason", () => {
      const isValidProjectStub = vi.spyOn(teamsfxCore, "isValidProject").mockReturnValue(true);
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "workspaceUri", { fsPath: "/path/to/workspace" });

      saveTextDocumentHandler({
        document: { fileName: "/dirname/fileName" },
        reason: vscode.TextDocumentSaveReason.AfterDelay,
      } as vscode.TextDocumentWillSaveEvent);

      assert.isTrue(isValidProjectStub.calledTwice);
      assert.equal(isValidProjectStub.getCall(0).args[0], "/path/to/workspace");
      assert.equal(isValidProjectStub.getCall(1).args[0], "/dirname");
      assert.equal(sendTelemetryEventStub.getCall(0).args[0], TelemetryEvent.UpdateTeamsApp);
      assert.equal(
        sendTelemetryEventStub.getCall(0).args[1][TelemetryProperty.UpdateTeamsAppReason],
        TelemetryUpdateAppReason.AfterDelay
      );
    });

    it("focus out save reason", () => {
      const dirname = "/dirname";
      const parentDir = path.join(dirname, "..");
      const isValidProjectStub = vi
        .spyOn(teamsfxCore, "isValidProject")
        .mockImplementation((p: string | undefined) => {
          return p !== dirname;
        });
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "workspaceUri", { fsPath: "/path/to/workspace" });

      saveTextDocumentHandler({
        document: { fileName: "/dirname/fileName" },
        reason: vscode.TextDocumentSaveReason.FocusOut,
      } as vscode.TextDocumentWillSaveEvent);

      assert.isTrue(isValidProjectStub.calledThrice);
      assert.equal(isValidProjectStub.getCall(0).args[0], "/path/to/workspace");
      assert.equal(isValidProjectStub.getCall(1).args[0], dirname);
      assert.equal(isValidProjectStub.getCall(2).args[0], parentDir);
      assert.equal(sendTelemetryEventStub.getCall(0).args[0], TelemetryEvent.UpdateTeamsApp);
      assert.equal(
        sendTelemetryEventStub.getCall(0).args[1][TelemetryProperty.UpdateTeamsAppReason],
        TelemetryUpdateAppReason.FocusOut
      );
    });
  });

  describe("openLifecycleTreeview", () => {
    it("TeamsFx Project", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", true);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      await openLifecycleTreeview();

      assert.isTrue(executeCommandStub.calledWith("teamsfx-lifecycle.focus"));
    });

    it("non-TeamsFx Project", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", false);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      await openLifecycleTreeview();

      assert.isTrue(executeCommandStub.calledWith("workbench.view.extension.teamsfx"));
    });
  });

  describe("selectWalkthrough", () => {
    let quickPickStub: ReturnType<typeof vi.spyOn>;
    let executeCommandStub: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Stubbing VS Code APIs
      quickPickStub = vi.spyOn(vscode.window, "showQuickPick");
      executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");
    });

    it("should select the declarative agent walkthrough", async () => {
      quickPickStub.mockResolvedValue({
        label: getDefaultString("teamstoolkit.walkthroughs.buildIntelligentApps.title"),
        detail: "Some description",
      });

      executeCommandStub.mockImplementation((command: string, ...args: any[]) => {
        assert(command, "workbench.action.openWalkthrough");
        assert(args[0], "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps");
        return "Success";
      });

      const result = await selectWalkthrough();

      assert.isTrue(quickPickStub.calledOnce);
      assert.isTrue(executeCommandStub.calledOnce);
      assert.isTrue(result.isOk());
    });
  });
});
