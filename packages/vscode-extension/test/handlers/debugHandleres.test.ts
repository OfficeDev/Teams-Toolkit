import { Inputs, err, ok } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  debugInTestToolHandler,
  selectAndDebugHandler,
  treeViewLocalDebugHandler,
  treeViewPreviewHandler,
} from "../../src/handlers/debugHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { TelemetryEvent } from "../../src/telemetry/extTelemetryEvents";
import * as localizeUtils from "../../src/utils/localizeUtils";
import * as runIconHandler from "../../src/debug/runIconHandler";
import * as sharedOpts from "../../src/handlers/sharedOpts";
import * as systemEnvUtils from "../../src/utils/systemEnvUtils";
import * as launch from "../../src/debug/launch";
import { MockCore } from "../mocks/mockCore";

describe("DebugHandlers", () => {
  describe("DebugInTestTool", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("treeViewDebugInTestToolHandler", async () => {
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      await debugInTestToolHandler("treeview")();

      assert.isTrue(
        executeCommandStub.calledOnceWith(
          "workbench.action.quickOpen",
          "debug Debug in Microsoft 365 Agents Playground"
        )
      );
    });

    it("messageDebugInTestToolHandler", async () => {
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      await debugInTestToolHandler("message")();

      assert.isTrue(
        executeCommandStub.calledOnceWith(
          "workbench.action.quickOpen",
          "debug Debug in Microsoft 365 Agents Playground"
        )
      );
    });
  });

  describe("TreeViewPreviewHandler", () => {
    it("treeViewPreviewHandler() - previewWithManifest error", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(systemEnvUtils, "getSystemInputs").mockReturnValue({} as Inputs);
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(globalVariables.core, "previewWithManifest").mockResolvedValue(
        err({ foo: "bar" } as any)
      );

      const result = await treeViewPreviewHandler("dev");

      assert.isTrue(result.isErr());
    });

    it("treeViewPreviewHandler() - happy path", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(systemEnvUtils, "getSystemInputs").mockReturnValue({} as Inputs);
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(globalVariables.core, "previewWithManifest").mockResolvedValue(ok("test-url"));
      vi.spyOn(launch, "openHubWebClient").mockResolvedValue();

      const result = await treeViewPreviewHandler("dev");

      assert.isTrue(result.isOk());
    });
  });

  describe("SelectAndDebugHandler", () => {
    it("Happy path", async () => {
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const selectAndDebugStub = vi
        .spyOn(runIconHandler, "selectAndDebug")
        .mockResolvedValue(ok(null));
      const processResultStub = vi.spyOn(sharedOpts, "processResult");

      await selectAndDebugHandler();

      assert.isTrue(sendTelemetryEventStub.called);
      assert.equal(sendTelemetryEventStub.getCall(0).args[0], TelemetryEvent.RunIconDebugStart);
      assert.isTrue(selectAndDebugStub.calledOnce);
      assert.isTrue(processResultStub.calledOnce);
      assert.equal(processResultStub.getCall(0).args[0], TelemetryEvent.RunIconDebug);
    });
  });

  describe("TreeViewLocalDebugHandler", () => {
    it("Happy path", async () => {
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

      await treeViewLocalDebugHandler();

      assert.isTrue(sendTelemetryEventStub.calledOnceWith(TelemetryEvent.TreeViewLocalDebug));
      assert.isTrue(executeCommandStub.calledOnceWith("workbench.action.quickOpen", "debug "));
    });
  });
});
