// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { fsAdapter, pathAdapter } from "../../src/common/npmPackageDeps";
import * as globalVariables from "../../src/globalVariables";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as localizeUtils from "../../src/utils/localizeUtils";
import { setupMCPServer } from "../../src/utils/mcpUtils";
import { mockValue } from "../mocks/vitestMockUtils";

vi.mock("vscode");

describe("mcpUtils", () => {
  describe("setupMCPServer", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("/test"));
      mockValue(globalVariables, "context", { extensionPath: "/mock/extension/path" });

      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => {
        const localizationMap: Record<string, string> = {
          "teamstoolkit.mcpUtils.setupMcpServer.message": "Setup MCP Server for %s",
          "teamstoolkit.mcpUtils.setupMcpServer.confirm": "Confirm",
          "teamstoolkit.mcpUtils.setupMcpServer.skip": "Skip",
          "teamstoolkit.mcpUtils.setupMcpServer.successMessage":
            "MCP Server setup completed successfully!",
          "teamstoolkit.mcpUtils.setupMcpServer.errorMessage": "Error setting up MCP Server: %s",
        };
        return localizationMap[key] || key;
      });
    });

    it("should return early if no workspace folders", async () => {
      mockValue(globalVariables, "workspaceUri", undefined);
      const showInformationMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Confirm" as any);
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await setupMCPServer();

      expect(showInformationMessageStub.called).to.be.false;
      expect(sendTelemetryEventStub.called).to.be.false;
    });

    it("should create files when user confirms and both are missing", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockReturnValue(false);
      vi.spyOn(fsAdapter, "mkdirSync").mockImplementation(() => undefined);
      vi.spyOn(fsAdapter, "readFileSync").mockReturnValue("Default copilot instructions content");
      vi.spyOn(fsAdapter, "writeFileSync").mockImplementation(() => undefined);

      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      const mockMcpConfig = {
        get: vi.fn((key: string) =>
          key === "servers"
            ? {
                "other-server": { command: "other-command" },
              }
            : undefined
        ),
      };
      getConfigurationStub.mockReturnValue(mockMcpConfig as any);

      const showInformationMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockImplementation(async (_message: string, ...items: string[]) => items[0]);

      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await setupMCPServer();

      expect(sendTelemetryEventStub.called).to.be.true;
    });

    it("should return early when both files are already set up", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockReturnValue(true);
      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      getConfigurationStub.mockReturnValue({
        get: vi.fn((key: string) =>
          key === "servers"
            ? {
                m365agentstoolkit: {
                  command: "npx",
                  args: ["@microsoft/m365agentstoolkit-mcp@latest", "server", "start"],
                },
              }
            : undefined
        ),
      } as any);

      const showInformationMessageStub = vi.spyOn(vscode.window, "showInformationMessage");
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await setupMCPServer();

      expect(showInformationMessageStub.called).to.be.false;
      expect(sendTelemetryEventStub.called).to.be.false;
    });

    it("should update existing mcp.json when user confirms", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockReturnValue(true);
      vi.spyOn(fsAdapter, "mkdirSync").mockImplementation(() => undefined);
      vi.spyOn(fsAdapter, "readFileSync").mockReturnValue(
        JSON.stringify({
          servers: {
            "other-server": { command: "other-command" },
          },
        })
      );
      const writeFileSyncStub = vi
        .spyOn(fsAdapter, "writeFileSync")
        .mockImplementation(() => undefined);

      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      getConfigurationStub.mockReturnValue({
        get: vi.fn((key: string) =>
          key === "servers"
            ? {
                "other-server": { command: "other-command" },
              }
            : undefined
        ),
      } as any);

      const showInformationMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Confirm" as any);
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

      await setupMCPServer();

      expect(writeFileSyncStub.called).to.be.true;
      expect(sendTelemetryErrorEventStub.called).to.be.false;
      expect(showInformationMessageStub.called).to.be.true;
    });

    it("should initialize servers when existing mcp.json has no servers object", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockReturnValue(true);
      vi.spyOn(fsAdapter, "readFileSync").mockReturnValue(JSON.stringify({}));
      const writeFileSyncStub = vi
        .spyOn(fsAdapter, "writeFileSync")
        .mockImplementation(() => undefined);

      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      getConfigurationStub.mockReturnValue({
        get: vi.fn((key: string) =>
          key === "servers"
            ? {
                "other-server": { command: "other-command" },
              }
            : undefined
        ),
      } as any);

      vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue("Confirm" as any);
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await setupMCPServer();

      expect(writeFileSyncStub.called).to.be.true;
      const writtenConfig = JSON.parse(writeFileSyncStub.mock.calls[0][1] as string);
      expect(writtenConfig.servers).to.have.property("M365AgentsToolkit MCP Server");
    });

    it("should continue when reading mcp configuration throws", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockReturnValue(true);
      vi.spyOn(fsAdapter, "readFileSync").mockReturnValue(
        JSON.stringify({
          servers: {
            "other-server": { command: "other-command" },
          },
        })
      );
      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      getConfigurationStub.mockImplementation(() => {
        throw new Error("bad config");
      });

      const showInformationMessageStub = vi.spyOn(vscode.window, "showInformationMessage");
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await setupMCPServer();

      expect(showInformationMessageStub.called).to.be.true;
      expect(sendTelemetryEventStub.called).to.be.true;
    });

    it("should handle error during file creation", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockReturnValue(false);
      vi.spyOn(fsAdapter, "readFileSync").mockImplementation(() => {
        throw new Error("Test error");
      });

      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      const mockMcpConfig = {
        get: vi.fn((key: string) =>
          key === "servers"
            ? {
                "other-server": { command: "other-command" },
              }
            : undefined
        ),
      };
      getConfigurationStub.mockReturnValue(mockMcpConfig as any);

      const showInformationMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Confirm" as any);
      const showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockResolvedValue(undefined as any);

      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

      await setupMCPServer();

      expect(showErrorMessageStub.called).to.be.true;
      expect(sendTelemetryErrorEventStub.called).to.be.true;
    });

    it("should prompt user when copilot instructions file is missing", async () => {
      vi.spyOn(fsAdapter, "existsSync").mockImplementation((filePath: string) => {
        return !filePath.endsWith("copilot-instructions.md");
      });

      const getConfigurationStub = vi.spyOn(vscode.workspace, "getConfiguration");
      const mockMcpConfig = {
        get: vi.fn((key: string) =>
          key === "servers"
            ? {
                "test-server": {
                  command: "npx",
                  args: ["@microsoft/m365agentstoolkit-mcp@latest", "server", "start"],
                },
              }
            : undefined
        ),
      };
      getConfigurationStub.mockReturnValue(mockMcpConfig as any);

      const showInformationMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Skip" as any);

      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await setupMCPServer();

      expect(showInformationMessageStub.called).to.be.true;
      expect(sendTelemetryEventStub.called).to.be.true;
    });
  });

  describe("Adapter delegation tests", () => {
    it("fsAdapter.existsSync delegates to fs-extra", () => {
      const result = fsAdapter.existsSync("/test/path");
      expect(typeof result).to.equal("boolean");
    });

    it("fsAdapter.writeFileSync delegates to fs-extra", () => {
      const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
      fsAdapter.writeFileSync("/test/path", "content");
      expect(writeSpy.mock.calls.length).to.equal(1);
      expect(writeSpy.mock.calls[0]).to.deep.equal(["/test/path", "content", "utf-8"]);
      writeSpy.mockRestore();
    });

    it("pathAdapter.join delegates to path module", () => {
      const result = pathAdapter.join("/test", "path");
      expect(typeof result).to.equal("string");
      expect(result.toLowerCase()).to.include("test");
    });
  });
});
