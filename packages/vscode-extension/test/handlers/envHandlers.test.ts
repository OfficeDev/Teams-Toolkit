import { ConfigFolderName, err, ok, Void } from "@microsoft/teamsfx-api";
import { environmentManager, pathUtils } from "@microsoft/teamsfx-core";
import * as localizeUtils from "@microsoft/teamsfx-core/build/common/localizeUtils";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import fs from "fs-extra";
import path from "path";
import * as vscode from "vscode";
import { ExtensionErrors } from "../../src/error/error";
import * as globalVariables from "../../src/globalVariables";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  askTargetEnvironment,
  createNewEnvironment,
  openConfigStateFile,
  refreshEnvironment,
} from "../../src/handlers/envHandlers";
import * as shared from "../../src/handlers/sharedOpts";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import envTreeProviderInstance from "../../src/treeview/environmentTreeViewProvider";

describe("Env handlers", () => {
  describe("createNewEnvironment", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    });

    it("happy", async () => {
      vi.spyOn(envTreeProviderInstance, "reloadEnvironments").mockResolvedValue(ok(Void));
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await createNewEnvironment();
      assert.isTrue(res.isOk());
    });
  });

  describe("refreshEnvironment", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    });

    it("happy", async () => {
      vi.spyOn(envTreeProviderInstance, "reloadEnvironments").mockResolvedValue(ok(Void));
      const res = await refreshEnvironment();
      assert.isTrue(res.isOk());
    });
  });

  describe("openConfigStateFile", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    });

    it("InvalidArgs", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await openConfigStateFile([]);

      if (res) {
        assert.isTrue(res.isErr());
        assert.equal(res.error.name, ExtensionErrors.InvalidArgs);
      }
    });

    it("noOpenWorkspace", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", { fsPath: undefined });

      const res = await openConfigStateFile([]);

      if (res) {
        assert.isTrue(res.isErr());
        assert.equal(res.error.name, ExtensionErrors.NoWorkspaceError);
      }
    });

    it("invalidProject", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(false);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await openConfigStateFile([{ env: "dev" }]);

      if (res) {
        assert.isTrue(res.isErr());
        assert.equal(res.error.name, ExtensionErrors.InvalidProject);
      }
    });

    it("invalid target environment", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(ok([]));
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        err({ error: "invalid target env" } as any)
      );
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await openConfigStateFile([{ env: undefined, type: "env" }]);

      if (res) {
        assert.isTrue(res.isErr());
      }
    });

    it("valid args", async () => {
      const env = "remote";
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok(env));
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await openConfigStateFile([{ env: env, type: "env", from: "aad" }]);

      if (res) {
        assert.isTrue(res.isErr());
        assert.equal(res.error.name, ExtensionErrors.EnvFileNotFoundError);
      }
    });

    it("invalid env folder", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(err({ error: "unknown" } as any));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue("" as any);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await openConfigStateFile([{ env: "local", type: "env" }]);

      if (res) {
        assert.isTrue(res.isErr());
      }
    });

    it("success", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok(""));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue("" as any);
      vi.spyOn(vscode.window, "showTextDocument").mockReturnValue(undefined as any);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await openConfigStateFile([{ env: "local", type: "env" }]);

      assert.isTrue(res === undefined);
    });
  });

  describe("askTargetEnvironment", () => {
    it("invalid project", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(false);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await askTargetEnvironment();

      assert.isTrue(res.isErr());
    });

    it("success", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(ok(["dev", "prod"]));
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(ok({ result: "dev" } as any));
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await askTargetEnvironment();

      assert.isTrue(res.isOk());
      assert.equal(res.value, "dev");
    });

    it("listAllEnvConfigs returns error", async () => {
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(
        err({ error: "unknown" } as any)
      );
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("./tmp"));

      const res = await askTargetEnvironment();

      assert.isTrue(res.isErr());
    });
  });
});
