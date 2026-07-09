import { featureFlagManager, FeatureFlags } from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import { assert, expect, vi } from "vitest";
import * as vscode from "vscode";
import { PanelType } from "../../src/controls/PanelType";
import { WebviewPanel } from "../../src/controls/webviewPanel";
import { TreatmentVariableValue } from "../../src/exp/treatmentVariables";
import * as globalVariables from "../../src/globalVariables";
import {
  openReadMeHandler,
  openSampleReadmeHandler,
  openWorkspaceMCPConfigHandler,
} from "../../src/handlers/readmeHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as extTelemetryEvents from "../../src/telemetry/extTelemetryEvents";
import { mockValue } from "../mocks/vitestMockUtils";

describe("readmeHandlers", () => {
  describe("openReadMeHandler", () => {
    it("Happy Path", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", true);
      const executeCommands = vi.spyOn(vscode.commands, "executeCommand");
      vi.spyOn(vscode.workspace, "workspaceFolders").value([
        { uri: { fsPath: "readmeTestFolder" } },
      ]);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockResolvedValue({} as any as vscode.TextDocument);

      await openReadMeHandler([extTelemetryEvents.TelemetryTriggerFrom.Auto]);

      assert.isTrue(openTextDocumentStub.calledOnce);
      assert.isTrue(executeCommands.calledOnce);
    });

    it("Create Project", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", false);
      mockValue(globalVariables, "core", undefined);
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockImplementation(
          (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
            return Promise.resolve({
              title: "Yes",
              run: (options as any).run,
            } as vscode.MessageItem);
          }
        );
      await openReadMeHandler([extTelemetryEvents.TelemetryTriggerFrom.Auto]);

      assert.isTrue(showMessageStub.calledOnce);
    });

    it("Open Folder", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", false);
      mockValue(globalVariables, "core", undefined);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockImplementation(
          (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
            return Promise.resolve({
              title: "Yes",
              run: (items[0] as any).run,
            } as vscode.MessageItem);
          }
        );
      await openReadMeHandler([extTelemetryEvents.TelemetryTriggerFrom.Auto]);

      assert.isTrue(executeCommandStub.calledOnce);
    });

    it("Function Notification Bot Template", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(vscode.workspace, "workspaceFolders").value([
        { uri: { fsPath: "readmeTestFolder" } },
      ]);
      mockValue(TreatmentVariableValue, "inProductDoc", true);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        Buffer.from("## Get Started with the Notification bot")
      );
      const createOrShow = vi
        .spyOn(WebviewPanel, "createOrShow")
        .mockImplementation(() => undefined);

      await openReadMeHandler([extTelemetryEvents.TelemetryTriggerFrom.Auto]);

      expect(createOrShow).toHaveBeenCalledTimes(1);
      expect(createOrShow).toHaveBeenCalledWith(PanelType.FunctionBasedNotificationBotReadme);
    });

    it("Express Notification Bot Template", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(vscode.workspace, "workspaceFolders").value([
        { uri: { fsPath: "readmeTestFolder" } },
      ]);
      mockValue(TreatmentVariableValue, "inProductDoc", true);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        Buffer.from("## Get Started with the Notification bot express")
      );
      const createOrShow = vi
        .spyOn(WebviewPanel, "createOrShow")
        .mockImplementation(() => undefined);

      await openReadMeHandler([extTelemetryEvents.TelemetryTriggerFrom.Auto]);

      expect(createOrShow).toHaveBeenCalledTimes(1);
      expect(createOrShow).toHaveBeenCalledWith(PanelType.ExpressServerNotificationBotReadme);
    });
  });

  describe("openSampleReadmeHandler", () => {
    it("Trigger from Walkthrough", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(vscode.workspace, "openTextDocument");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      await openSampleReadmeHandler(["WalkThrough"]);

      assert.isTrue(executeCommandStub.calledOnce);
    });
  });

  describe("openWorkspaceMCPConfigHandler", () => {
    it("no workspace folder - returns ok without opening", async () => {
      mockValue(vscode.workspace, "workspaceFolders", undefined);
      const openTextDocumentStub = vi.spyOn(vscode.workspace, "openTextDocument");

      const res = await openWorkspaceMCPConfigHandler();

      assert.isTrue(res.isOk());
      assert.isTrue(openTextDocumentStub.notCalled);
    });

    it("config file missing - returns ok without opening", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const openTextDocumentStub = vi.spyOn(vscode.workspace, "openTextDocument");

      const res = await openWorkspaceMCPConfigHandler();

      assert.isTrue(res.isOk());
      assert.isTrue(openTextDocumentStub.notCalled);
    });

    it("DT flag off - shows Fetch Action notification and opens mcp.json", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockResolvedValue({} as vscode.TextDocument);
      vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue(undefined as any);
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Fetch Action" as any);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      const res = await openWorkspaceMCPConfigHandler();

      assert.isTrue(res.isOk());
      assert.isTrue(showMessageStub.calledOnce);
      assert.isTrue(openTextDocumentStub.calledOnce);
      // Fetch Action selection wires the updateActionWithMCP command.
      await Promise.resolve();
      expect(executeCommandStub).toHaveBeenCalledWith("fx-extension.updateActionWithMCP");
    });

    it("DT flag on - opens ai-plugin.json without Fetch Action notification", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag === FeatureFlags.MCPForDADT
      );
      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockResolvedValue({} as vscode.TextDocument);
      vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue(undefined as any);
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue(undefined);

      const res = await openWorkspaceMCPConfigHandler();

      assert.isTrue(res.isOk());
      assert.isTrue(showMessageStub.notCalled);
      assert.isTrue(openTextDocumentStub.calledOnce);
      const openedUri = openTextDocumentStub.firstCall.args[0] as vscode.Uri;
      assert.isTrue(openedUri.fsPath.endsWith("ai-plugin.json"));
    });

    it("DT flag on but ai-plugin.json missing - falls back to mcp.json", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(fs, "pathExists").mockImplementation(async (p: string | Buffer | URL) =>
        String(p).endsWith("mcp.json")
      );
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag === FeatureFlags.MCPForDADT
      );
      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockResolvedValue({} as vscode.TextDocument);
      vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue(undefined as any);

      const res = await openWorkspaceMCPConfigHandler();

      assert.isTrue(res.isOk());
      assert.isTrue(openTextDocumentStub.calledOnce);
      const openedUri = openTextDocumentStub.firstCall.args[0] as vscode.Uri;
      assert.isTrue(openedUri.fsPath.endsWith("mcp.json"));
    });
  });
});
