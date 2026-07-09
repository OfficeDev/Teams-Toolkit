import fs from "fs-extra";
import * as globalVariables from "../../src/globalVariables";
import * as vsc_ui from "../../src/qm/vsc_ui";
import * as vscode from "vscode";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import * as localizeUtils from "@microsoft/teamsfx-core/build/common/localizeUtils";
import * as errorCommon from "../../src/error/common";
import * as sharedOpts from "../../src/handlers/sharedOpts";
import * as envHandlers from "../../src/handlers/envHandlers";
import { FxError, err, ok } from "@microsoft/teamsfx-api";
import { environmentManager } from "@microsoft/teamsfx-core";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { MockCore } from "../mocks/mockCore";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  convertAadToNewSchemaHandler,
  editAadManifestTemplateHandler,
  openPreviewAadFileHandler,
  updateAadAppManifestHandler,
} from "../../src/handlers/aadManifestHandlers";

describe("aadManifestHandlers", () => {
  describe("openPreviewAadFileHandler", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    });

    it("project is not valid", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core);
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(false);
      const res = await openPreviewAadFileHandler([]);
      assert.isTrue(res.isErr());
      assert.equal(res.isErr() ? res.error.name : "Not Err", "InvalidProjectError");
    });

    it("select Env returns error", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core);
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(envHandlers, "askTargetEnvironment").mockResolvedValue(err("selectEnvErr") as any);
      const res = await openPreviewAadFileHandler([]);
      assert.isTrue(res.isErr());
      assert.equal(res.isErr() ? res.error : "Not Err", "selectEnvErr");
    });

    it("runCommand returns error", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core);
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(envHandlers, "askTargetEnvironment").mockResolvedValue(ok("dev"));
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(err("runCommandErr") as any);
      const res = await openPreviewAadFileHandler([]);
      assert.isTrue(res.isErr());
      assert.equal(res.isErr() ? res.error : "Not Err", "runCommandErr");
    });

    it("manifest file not exists", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core);
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(ok(["dev"]));
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        ok({
          type: "success",
          result: "dev",
        })
      );
      vi.spyOn(envHandlers, "askTargetEnvironment").mockResolvedValue(ok("dev"));
      vi.spyOn(errorCommon, "showError").mockImplementation(async () => {});
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));
      const res = await openPreviewAadFileHandler([]);
      assert.isTrue(res.isErr());
    });

    it("happy path", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core);
      vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(ok(["dev"]));
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        ok({
          type: "success",
          result: "dev",
        })
      );
      vi.spyOn(envHandlers, "askTargetEnvironment").mockResolvedValue(ok("dev"));
      vi.spyOn(errorCommon, "showError").mockImplementation(async () => {});
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue();
      vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue();

      const res = await openPreviewAadFileHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("updateAadAppManifestHandler", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    });

    it("deployAadAppmanifest", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const deployAadManifest = vi.spyOn(globalVariables.core, "deployAadManifest");
      await updateAadAppManifestHandler([{ fsPath: "path/aad.dev.template" }]);
      expect(deployAadManifest).toHaveBeenCalledTimes(1);
    });
  });

  describe("convertAadToNewSchemaHandler", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    });

    it("convertAadToNewSchemaHandler", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const convertAadToNewSchema = vi.spyOn(globalVariables.core, "convertAadToNewSchema");
      await convertAadToNewSchemaHandler([{ fsPath: "path/aad.manifest.json" }]);
      expect(convertAadToNewSchema).toHaveBeenCalledTimes(1);
    });

    it("convertAadToNewSchemaHandler no parameter", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const convertAadToNewSchema = vi.spyOn(globalVariables.core, "convertAadToNewSchema");
      await convertAadToNewSchemaHandler([]);
      expect(convertAadToNewSchema).toHaveBeenCalledTimes(1);
    });
  });

  describe("editAadManifestTemplate", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    });

    it("happy path", async () => {
      const workspacePath = "/test/workspace/path";
      const workspaceUri = vscode.Uri.file(workspacePath);
      mockValue(globalVariables, "workspaceUri", workspaceUri);

      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockResolvedValue({} as any);
      vi.spyOn(vscode.window, "showTextDocument");

      await editAadManifestTemplateHandler([null, "testTrigger"]);

      expect(openTextDocumentStub as any).toHaveBeenCalledTimes(1);
      expect(openTextDocumentStub as any).toHaveBeenCalledWith(
        `${workspaceUri.fsPath}/aad.manifest.json`
      );
    });

    it("happy path: no parameter", async () => {
      const workspacePath = "/test/workspace/path";
      const workspaceUri = vscode.Uri.file(workspacePath);
      mockValue(globalVariables, "workspaceUri", workspaceUri);

      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue({} as any);
      const showTextDocumentStub = vi.spyOn(vscode.window, "showTextDocument");

      await editAadManifestTemplateHandler([]);

      assert.isTrue(showTextDocumentStub.callCount === 0);
    });

    it("happy path: workspaceUri is undefined", async () => {
      const workspaceUri = undefined;
      mockValue(globalVariables, "workspaceUri", undefined);

      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockResolvedValue({} as any);
      vi.spyOn(vscode.window, "showTextDocument");

      await editAadManifestTemplateHandler([null, "testTrigger"]);

      expect(openTextDocumentStub as any).toHaveBeenCalledTimes(1);
      expect(openTextDocumentStub as any).toHaveBeenCalledWith(`${workspaceUri}/aad.manifest.json`);
    });
  });
});
