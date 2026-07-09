import { err, ok, UserError } from "@microsoft/teamsfx-api";
import { ProgressHandler } from "@microsoft/vscode-ui";
import { assert, vi } from "vitest";
import * as vscode from "vscode";
import VsCodeLogInstance from "../../src/commonlib/log";
import * as errorCommon from "../../src/error/common";
import {
  migrateTeamsManifestHandler,
  migrateTeamsTabAppHandler,
} from "../../src/handlers/migrationHandler";
import { TeamsAppMigrationHandler } from "../../src/migration/migrationHandler";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as localizeUtils from "../../src/utils/localizeUtils";
import { mockValue } from "../mocks/vitestMockUtils";

describe("Migration handlers", () => {
  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
  });

  describe("migrateTeamsTabAppHandler", () => {
    it("happy path", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsTabApp.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: "test" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updatePackageJson").mockResolvedValue(ok(true));
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updateCodes").mockResolvedValue(ok([]));

      const result = await migrateTeamsTabAppHandler();

      assert.deepEqual(result, ok(null));
    });

    it("happy path: failed files", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsTabApp.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: "test" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      const warningStub = vi.spyOn(VsCodeLogInstance, "warning");
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updatePackageJson").mockResolvedValue(ok(true));
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updateCodes").mockResolvedValue(
        ok(["test1", "test2"])
      );

      const result = await migrateTeamsTabAppHandler();

      assert.deepEqual(result, ok(null));
      assert.isTrue(warningStub.calledOnce);
    });

    it("error", async () => {
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsTabApp.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: "test" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updatePackageJson").mockResolvedValue(ok(true));
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updateCodes").mockResolvedValue(
        err({ foo: "bar" } as any)
      );

      const result = await migrateTeamsTabAppHandler();

      assert.isTrue(result.isErr());
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });

    it("user cancel", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsTabApp.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFolder").mockResolvedValue(ok({ type: "skip" }));

      const result = await migrateTeamsTabAppHandler();

      assert.deepEqual(result, ok(null));
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });

    it("user cancel: skip folder selection", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(ok("cancel"));

      const result = await migrateTeamsTabAppHandler();

      assert.deepEqual(result, ok(null));
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });

    it("no change in package.json", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsTabApp.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: "test" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      vi.spyOn(VsCodeLogInstance, "warning").mockReturnValue();
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updatePackageJson").mockResolvedValue(
        ok(false)
      );

      const result = await migrateTeamsTabAppHandler();

      assert.deepEqual(result, ok(null));
    });
  });

  describe("migrateTeamsManifestHandler", () => {
    it("happy path", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsManifest.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "test" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updateManifest").mockResolvedValue(ok(null));

      const result = await migrateTeamsManifestHandler();

      assert.deepEqual(result, ok(null));
    });

    it("user cancel: skip file selection", async () => {
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsManifest.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(ok({ type: "skip" }));
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updateManifest").mockResolvedValue(ok(null));

      const result = await migrateTeamsManifestHandler();

      assert.deepEqual(result, ok(null));
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });

    it("error", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const progressHandler = new ProgressHandler("title", 1);
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(
        ok("teamstoolkit.migrateTeamsManifest.upgrade")
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "test" })
      );
      vi.spyOn(vsc_ui.VS_CODE_UI, "createProgressBar").mockReturnValue(progressHandler);
      vi.spyOn(VsCodeLogInstance, "info").mockReturnValue();
      vi.spyOn(TeamsAppMigrationHandler.prototype, "updateManifest").mockResolvedValue(
        err(new UserError("source", "name", ""))
      );
      vi.spyOn(errorCommon, "showError").mockImplementation(async () => {});

      const result = await migrateTeamsManifestHandler();

      assert.isTrue(result.isErr());
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });
  });
});
