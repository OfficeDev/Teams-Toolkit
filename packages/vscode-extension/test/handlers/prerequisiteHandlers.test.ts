import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
/**
 * @author HuihuiWu-Microsoft <73154171+HuihuiWu-Microsoft@users.noreply.github.com>
 */
import { SystemError, err } from "@microsoft/teamsfx-api";
import { DepsManager, DepsType } from "@microsoft/teamsfx-core";
import path from "path";
import * as vscode from "vscode";
import * as getStartedChecker from "../../src/debug/depsChecker/getStartedChecker";
import * as globalVariables from "../../src/globalVariables";
import {
  getDotnetPathHandler,
  getPathDelimiterHandler,
  installAdaptiveCardExt,
  validateGetStartedPrerequisitesHandler,
} from "../../src/handlers/prerequisiteHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";

describe("prerequisiteHandlers", () => {
  describe("getDotnetPathHandler", async () => {
    it("dotnet is installed", async () => {
      vi.spyOn(DepsManager.prototype, "getStatus").mockResolvedValue([
        {
          name: ".NET Core SDK",
          type: DepsType.Dotnet,
          isInstalled: true,
          command: "",
          details: {
            isLinuxSupported: false,
            installVersion: "",
            supportedVersions: [],
            binFolders: ["dotnet-bin-folder/dotnet"],
          },
        },
      ]);

      const dotnetPath = await getDotnetPathHandler();
      assert.equal(dotnetPath, `${path.delimiter}dotnet-bin-folder${path.delimiter}`);
    });

    it("dotnet is not installed", async () => {
      vi.spyOn(DepsManager.prototype, "getStatus").mockResolvedValue([
        {
          name: ".NET Core SDK",
          type: DepsType.Dotnet,
          isInstalled: false,
          command: "",
          details: {
            isLinuxSupported: false,
            installVersion: "",
            supportedVersions: [],
            binFolders: undefined,
          },
        },
      ]);

      const dotnetPath = await getDotnetPathHandler();
      assert.equal(dotnetPath, `${path.delimiter}`);
    });

    it("failed to get dotnet path", async () => {
      vi.spyOn(DepsManager.prototype, "getStatus").mockRejectedValue(
        new Error("failed to get status")
      );
      const dotnetPath = await getDotnetPathHandler();
      assert.equal(dotnetPath, `${path.delimiter}`);
    });
  });

  describe("getPathDelimiterHandler", () => {
    it("happy path", async () => {
      const actualPath = await getPathDelimiterHandler();
      assert.equal(actualPath, path.delimiter);
    });
  });

  describe("validateGetStartedPrerequisitesHandler", () => {
    it("error", async () => {
      const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(getStartedChecker, "checkPrerequisitesForGetStarted").mockResolvedValue(
        err(new SystemError("test", "test", "test"))
      );

      const result = await validateGetStartedPrerequisitesHandler();

      assert.isTrue(sendTelemetryStub.called);
      assert.isTrue(result.isErr());
    });
  });

  describe("installAdaptiveCardExt", () => {
    it("Happy path()", async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue("Install" as unknown as vscode.MessageItem);

      await installAdaptiveCardExt();

      assert.isTrue(executeCommandStub.calledOnce);
    });
  });
});
