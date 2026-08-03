import { err, LogLevel, ok, UserError } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";
import VsCodeLogInstance from "../../src/commonlib/log";
import { configMgr } from "../../src/config";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as vsc_ui from "../../src/qm/vsc_ui";
import * as lifecycleHandlers from "../../src/handlers/lifecycleHandlers";
import { vi, assert } from "vitest";

describe("configMgr", () => {
  describe("loadLogLevel", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });
    it("Debug", () => {
      vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
        get: () => {
          return "Debug";
        },
      } as any);
      configMgr.loadLogLevel();
      assert.equal(VsCodeLogInstance.logLevel, LogLevel.Debug);
    });

    it("Verbose", () => {
      vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
        get: () => {
          return "Verbose";
        },
      } as any);
      configMgr.loadLogLevel();
      assert.equal(VsCodeLogInstance.logLevel, LogLevel.Verbose);
    });

    it("Info", () => {
      vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
        get: () => {
          return "Info";
        },
      } as any);
      configMgr.loadLogLevel();
      assert.equal(VsCodeLogInstance.logLevel, LogLevel.Info);
    });
  });

  describe("changeConfigCallback", () => {
    it("happy", () => {
      const stub = vi.spyOn(configMgr, "loadConfigs").mockReturnValue();
      configMgr.changeConfigCallback({ affectsConfiguration: () => true });
      assert.isTrue(stub.called);
    });
  });
  describe("loadConfigs", () => {
    beforeEach(async () => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
        get: () => {
          return "test";
        },
      } as any);
    });
    it("happy", () => {
      const stub = vi.spyOn(configMgr, "loadLogLevel").mockReturnValue();
      const stub2 = vi.spyOn(configMgr, "loadFeatureFlags").mockReturnValue();
      configMgr.loadConfigs();
      assert.isTrue(stub.called);
      assert.isTrue(stub2.called);
    });
  });

  describe("loadFeatureFlags", () => {
    it("happy", () => {
      const stub = vi.spyOn(configMgr, "getConfiguration").mockReturnValue(false);
      configMgr.loadFeatureFlags();
      assert.isTrue(stub.called);
    });
  });

  describe("registerConfigChangeCallback", () => {
    it("happy", () => {
      const stub = vi.spyOn(configMgr, "loadConfigs").mockReturnValue();
      configMgr.registerConfigChangeCallback();
      assert.isTrue(stub.called);
    });
  });
});
