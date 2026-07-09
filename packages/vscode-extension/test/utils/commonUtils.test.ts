import cp from "child_process";
import fs from "fs-extra";
import mockfs from "mock-fs";
import os from "os";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  acpInstalled,
  getLocalDebugMessageTemplate,
  hasAdaptiveCardInWorkspace,
  isLinux,
  isMacOS,
  isWindows,
  openFolderInExplorer,
} from "../../src/utils/commonUtils";
import {
  processAdapter,
  globAdapter,
  fsAdapter,
  envParseAdapter,
} from "../../src/common/npmPackageDeps";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";

describe("CommonUtils", () => {
  afterEach(() => {
    // Restore the default sandbox here
    vi.restoreAllMocks();
  });

  describe("openFolderInExplorer", () => {
    it("happy path", () => {
      const folderPath = "C:\\fakePath";
      vi.spyOn(processAdapter, "exec").mockImplementation(() => {
        return {} as never;
      });
      openFolderInExplorer(folderPath);
    });
  });

  describe("os assertion", () => {
    it("should return exactly result according to os.type", async () => {
      vi.spyOn(processAdapter, "type").mockReturnValue("Windows_NT");
      expect(isWindows()).equals(true);
      vi.restoreAllMocks();

      vi.spyOn(processAdapter, "type").mockReturnValue("Linux");
      expect(isLinux()).equals(true);
      vi.restoreAllMocks();

      vi.spyOn(processAdapter, "type").mockReturnValue("Darwin");
      expect(isMacOS()).equals(true);
      vi.restoreAllMocks();
    });
  });

  describe("hasAdaptiveCardInWorkspace()", () => {
    afterEach(() => {
      mockfs.restore();
      vi.restoreAllMocks();
    });

    it("no workspace", async () => {
      mockValue(globalVariables, "workspaceUri", undefined);

      const result = await hasAdaptiveCardInWorkspace();

      assert.isFalse(result);
    });

    it("happy path", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("/test"));
      mockfs({
        "/test/card.json": JSON.stringify({
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.5",
          actions: [
            {
              type: "Action.OpenUrl",
              title: "More Info",
              url: "https://example.com",
            },
          ],
        }),
      });

      const result = await hasAdaptiveCardInWorkspace();

      assert.isTrue(result);
    });

    it("hasAdaptiveCardInWorkspace() no adaptive card file", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("/test"));
      mockfs({
        "/test/card.json": JSON.stringify({ hello: "world" }),
      });

      const result = await hasAdaptiveCardInWorkspace();

      assert.isFalse(result);
    });

    it("hasAdaptiveCardInWorkspace() very large adaptive card file", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("/test"));
      mockfs({
        "/test/card.json": JSON.stringify({
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.5",
          actions: [
            {
              type: "Action.OpenUrl",
              title: "a".repeat(1024 * 1024 + 10),
              url: "https://example.com",
            },
          ],
        }),
      });

      const result = await hasAdaptiveCardInWorkspace();

      assert.isFalse(result);
    });
  });

  describe("acpInstalled()", () => {
    afterEach(() => {
      mockfs.restore();
      vi.restoreAllMocks();
    });

    it("already installed", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({} as any);

      const installed = acpInstalled();

      assert.isTrue(installed);
    });

    it("not installed", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);

      const installed = acpInstalled();

      assert.isFalse(installed);
    });
  });

  describe("getLocalDebugMessageTemplate()", () => {
    it("Test Tool enabled in Windows platform", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(envParseAdapter, "isTestToolEnabledProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));

      const result = await getLocalDebugMessageTemplate(true);
      assert.isTrue(result.includes("Microsoft 365 Agents Playground"));
    });

    it("Test Tool disabled in Windows platform", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(envParseAdapter, "isTestToolEnabledProject").mockReturnValue(false);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));

      const result = await getLocalDebugMessageTemplate(true);
      assert.isFalse(result.includes("Microsoft 365 Agents Playground"));
    });

    it("Test Tool enabled in non-Windows platform", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(envParseAdapter, "isTestToolEnabledProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));

      const result = await getLocalDebugMessageTemplate(false);
      assert.isTrue(result.includes("Microsoft 365 Agents Playground"));
    });

    it("Test Tool disabled in non-Windows platform", async () => {
      mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
      vi.spyOn(envParseAdapter, "isTestToolEnabledProject").mockReturnValue(false);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));

      const result = await getLocalDebugMessageTemplate(false);
      assert.isFalse(result.includes("Microsoft 365 Agents Playground"));
    });

    it("No workspace folder", async () => {
      mockValue(vscode.workspace, "workspaceFolders", []);
      vi.spyOn(fsAdapter, "pathExists").mockResolvedValue(false);

      const result = await getLocalDebugMessageTemplate(false);
      assert.isFalse(result.includes("Microsoft 365 Agents Playground"));
    });
  });
});
