import { err, FxError, Inputs, ok, Result, Stage, UserError } from "@microsoft/teamsfx-api";
import { QuestionNames, UserCancelError } from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  buildPackageHandler,
  publishInDeveloperPortalHandler,
  syncManifestHandler,
  updatePreviewManifest,
  validateManifestHandler,
} from "../../src/handlers/manifestHandlers";
import * as shared from "../../src/handlers/sharedOpts";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { MockCore } from "../mocks/mockCore";
describe("Manifest handlers", () => {
  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
  });

  describe("validateManifestHandler", () => {
    it("happy", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await validateManifestHandler();
      assert.isTrue(res.isOk());
    });
  });
  describe("buildPackageHandler", function () {
    it("happy()", async () => {
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await buildPackageHandler();
      assert.isTrue(res.isOk());
    });
  });
  describe("publishInDeveloperPortalHandler", async () => {
    beforeEach(() => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
    });
    it("publish in developer portal - success", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "test.zip" })
      );
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        ok({ type: "success", result: "test.zip" })
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readdir").mockResolvedValue(["test.zip", "test.json"] as any);
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const res = await publishInDeveloperPortalHandler();
      assert.isTrue(res.isOk());
      const res2 = await publishInDeveloperPortalHandler();
      assert.isTrue(res2.isOk());
    });

    it("publish in developer portal - cancelled", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "test2.zip" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        err(new UserCancelError("VSC"))
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readdir").mockResolvedValue(["test.zip", "test.json"] as any);
      const res = await publishInDeveloperPortalHandler();
      assert.isTrue(res.isOk());
    });
    it("select file error", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(err(new UserCancelError("VSC")));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readdir").mockResolvedValue(["test.zip", "test.json"] as any);
      const res = await publishInDeveloperPortalHandler();
      assert.isTrue(res.isOk());
    });
    it("runCommand error", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "test.zip" })
      );
      vi.spyOn(shared, "runCommand").mockResolvedValue(err(new UserCancelError("VSC")));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        ok({ type: "success", result: "test.zip" })
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readdir").mockResolvedValue(["test.zip", "test.json"] as any);
      const res = await publishInDeveloperPortalHandler();
      assert.isTrue(res.isErr());
    });
  });

  describe("updatePreviewManifest", () => {
    it("happy", async () => {
      mockValue(globalVariables, "core", new MockCore());
      const openTextDocumentStub = vi
        .spyOn(vscode.workspace, "openTextDocument")
        .mockReturnValue(Promise.resolve("" as any));
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await updatePreviewManifest([]);
      assert.isTrue(openTextDocumentStub.calledOnce);
    });
    it("getSelectedEnv error", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core);
      vi.spyOn(core, "getSelectedEnv").mockResolvedValue(err(new UserCancelError("VSC")));
      vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      const res = await updatePreviewManifest([]);
      assert.isTrue(res.isErr());
    });
  });
  describe("syncManifest", () => {
    it("happy", async () => {
      const runCommandStub = vi.spyOn(shared, "runCommand").mockResolvedValue(ok(undefined));
      await syncManifestHandler();
      assert.isTrue(runCommandStub.calledOnce);
    });
    it("teams app id in the input", async () => {
      const runCommandStub = vi
        .spyOn(shared, "runCommand")
        .mockImplementation(
          (stage: Stage, inputs: Inputs | undefined): Promise<Result<any, FxError>> => {
            if (inputs && inputs[QuestionNames.TeamsAppId] === "teamsAppId") {
              return Promise.resolve(ok(undefined));
            }
            return Promise.resolve(err(new UserError("ut", "error", "", "")));
          }
        );
      const res = await syncManifestHandler("teamsAppId");
      assert.isTrue(runCommandStub.calledOnce);
      assert.isTrue(res.isOk());
    });
  });
});
