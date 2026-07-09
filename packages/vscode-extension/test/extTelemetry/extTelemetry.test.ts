import { Stage, UserError } from "@microsoft/teamsfx-api";
import { maskSecret, telemetryUtils } from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import { Uri } from "vscode";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import * as globalVariables from "../../src/globalVariables";
import * as telemetryModule from "../../src/telemetry/extTelemetry";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { TelemetryEvent } from "../../src/telemetry/extTelemetryEvents";
import * as vscTelemetryUtils from "../../src/utils/telemetryUtils";
import { MockTelemetryReporter } from "../mocks/mockTools";
import { vi, expect } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("ExtTelemetry", () => {
  mockValue(ExtTelemetry, "reporter", undefined as any);
  let sendTelemetryErrorEventSpy: ReturnType<typeof vi.spyOn>;
  let sendTelemetryEventSpy: ReturnType<typeof vi.spyOn>;
  let sendTelemetryExceptionSpy: ReturnType<typeof vi.spyOn>;

  describe("setHasSentTelemetry", () => {
    it("query-expfeature", () => {
      const eventName = "query-expfeature";
      ExtTelemetry.hasSentTelemetry = false;
      ExtTelemetry.setHasSentTelemetry(eventName);
      expect(ExtTelemetry.hasSentTelemetry).equals(false);
    });

    it("other-event", () => {
      const eventName = "other-event";
      ExtTelemetry.hasSentTelemetry = false;
      ExtTelemetry.setHasSentTelemetry(eventName);
      expect(ExtTelemetry.hasSentTelemetry).equals(true);
    });
  });

  describe("stageToEvent", () => {
    it("Stage.create", () => {
      const stage = Stage.create;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.CreateProject);
    });

    it("Stage.provision", () => {
      const stage = Stage.provision;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.Provision);
    });

    it("Stage.deploy", () => {
      const stage = Stage.deploy;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.Deploy);
    });

    it("Stage.publish", () => {
      const stage = Stage.publish;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.Publish);
    });

    it("Stage.creatEnv", () => {
      const stage = Stage.createEnv;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.CreateNewEnvironment);
    });

    it("Stage.addWebpart", () => {
      const stage = Stage.addWebpart;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.AddWebpart);
    });

    it("Stage.copilotPluginAddAPI", () => {
      const stage = Stage.copilotPluginAddAPI;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.CopilotPluginAddAPI);
    });

    it("Stage.syncManifest", () => {
      const stage = Stage.syncManifest;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.SyncManifest);
    });

    it("Stage.RegeneratePlugin", () => {
      const stage = Stage.RegeneratePlugin;
      expect(ExtTelemetry.stageToEvent(stage)).equals(TelemetryEvent.RegenerateAction);
    });

    it("unknown", () => {
      const stage = "unknown";
      expect(ExtTelemetry.stageToEvent(stage as Stage)).equals(undefined);
    });
  });

  describe("Send Telemetry", () => {
    const reporterStub = new MockTelemetryReporter();

    beforeEach(() => {
      sendTelemetryErrorEventSpy = vi.spyOn(reporterStub, "sendTelemetryErrorEvent");
      sendTelemetryEventSpy = vi.spyOn(reporterStub, "sendTelemetryEvent");
      sendTelemetryExceptionSpy = vi.spyOn(reporterStub, "sendTelemetryException");
      mockValue(ExtTelemetry, "reporter", reporterStub);
      mockValue(ExtTelemetry, "settingsVersion", "1.0.0");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      mockValue(globalVariables, "isSPFxProject", false);
      mockValue(globalVariables, "isExistingUser", "no");
    });

    it("sendTelemetryEvent", () => {
      ExtTelemetry.sendTelemetryEvent(
        "sampleEvent",
        { stringProp: "some string" },
        { numericMeasure: 123 }
      );

      expect(sendTelemetryEventSpy).toHaveBeenCalledTimes(1);
      expect(sendTelemetryEventSpy).toHaveBeenCalledWith(
        "sampleEvent",
        expect.objectContaining({
          stringProp: "some string",
          component: "extension",
          "is-existing-user": "no",
          "is-spfx": "false",
          "settings-version": "1.0.0",
        }),
        { numericMeasure: 123 }
      );
    });

    it("sendTelemetryErrorEvent", () => {
      const error = new UserError(
        "test",
        "UserTestError",
        "test error message",
        "displayed test error message"
      );
      ExtTelemetry.sendTelemetryErrorEvent(
        "sampleEvent",
        error,
        { stringProp: "some string" },
        { numericMeasure: 123 },
        ["errorProps"]
      );

      expect(sendTelemetryErrorEventSpy).toHaveBeenCalledTimes(1);
      expect(sendTelemetryErrorEventSpy).toHaveBeenCalledWith(
        "sampleEvent",
        expect.objectContaining({
          stringProp: "some string",
          component: "extension",
          success: "no",
          "is-existing-user": "no",
          "is-spfx": "false",
          "settings-version": "1.0.0",
          "error-type": "user",
          "error-name": "UserTestError",
          "err-message": maskSecret(error.message),
          "err-stack": telemetryUtils.extractMethodNamesFromErrorStack(error.stack),
          "error-code": "test.UserTestError",
          "error-component": "",
          "error-method": "",
          "error-source": "",
          "error-stage": "",
        }),
        { numericMeasure: 123 },
        ["errorProps"]
      );
    });

    it("sendTelemetryException", () => {
      const error = new UserError("test", "UserTestError", "test error message");
      ExtTelemetry.sendTelemetryException(
        error,
        { stringProp: "some string" },
        { numericMeasure: 123 }
      );

      expect(sendTelemetryExceptionSpy).toHaveBeenCalledTimes(1);
      expect(sendTelemetryExceptionSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          stringProp: "some string",
          component: "extension",
          "is-existing-user": "no",
          "is-spfx": "false",
          "settings-version": "1.0.0",
        }),
        { numericMeasure: 123 }
      );
    });
  });

  describe("deactivate event", () => {
    it("cacheTelemetryEventAsync", async () => {
      const clock = vi.useFakeTimers();
      let state = "";
      vi.spyOn(vscTelemetryUtils, "getProjectId").mockResolvedValue("project-id");
      const globalStateUpdateStub = vi
        .spyOn(teamsfxCore, "globalStateUpdate")
        .mockImplementation(async (key, value) => (state = value as string));
      const eventName = "deactivate";

      await ExtTelemetry.cacheTelemetryEventAsync(eventName);

      expect(globalStateUpdateStub).toHaveBeenCalledTimes(1);
      const telemetryEvents = {
        eventName: eventName,
        properties: {
          "correlation-id": telemetryModule.lastCorrelationId,
          "project-id": "project-id",
          timestamp: new clock.Date().toISOString(),
        },
      };
      const newValue = JSON.stringify(telemetryEvents);
      expect(state).equals(newValue);
      clock.restore();
    });

    it("sendCachedTelemetryEventsAsync", async () => {
      const reporterStub = new MockTelemetryReporter();
      sendTelemetryEventSpy = vi.spyOn(reporterStub, "sendTelemetryEvent");
      mockValue(ExtTelemetry, "reporter", reporterStub);
      const timestamp = new Date().toISOString();
      const telemetryEvents = {
        eventName: "deactivate",
        properties: {
          "correlation-id": "correlation-id",
          "project-id": "project-id",
          timestamp: timestamp,
        },
      };
      const telemetryData = JSON.stringify(telemetryEvents);
      vi.spyOn(teamsfxCore, "globalStateGet").mockImplementation(async () => telemetryData);
      vi.spyOn(teamsfxCore, "globalStateUpdate").mockResolvedValue(undefined as any);

      await ExtTelemetry.sendCachedTelemetryEventsAsync();

      expect(sendTelemetryEventSpy).toHaveBeenCalledTimes(1);
      expect(sendTelemetryEventSpy).toHaveBeenCalledWith(
        "deactivate",
        expect.objectContaining({
          "correlation-id": "correlation-id",
          "project-id": "project-id",
          timestamp: timestamp,
        })
      );
    });
  });
});
