import { ok } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";
import { PanelType } from "../../../src/controls/PanelType";
import { WebviewPanel } from "../../../src/controls/webviewPanel";
import { vi, expect } from "vitest";
import { mockValue } from "../../mocks/vitestMockUtils";
import {
  checkCopilotCallback,
  checkSandboxCallback,
  checkSideloadingCallback,
} from "../../../src/handlers/accounts/checkAccessCallback";
import * as vsc_ui from "../../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../../src/telemetry/extTelemetry";
import * as localizeUtils from "../../../src/utils/localizeUtils";

describe("checkAccessCallback", () => {
  describe("checkCopilotCallback", () => {
    beforeEach(() => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
    });

    it("checkCopilotCallback() and open url", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("Enroll");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const showMessageStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "showMessage")
        .mockResolvedValue(ok("Enroll"));
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");

      await checkCopilotCallback();

      expect(showMessageStub.callCount).to.be.equal(1);
      expect(openUrlStub.callCount).to.be.equal(1);
    });

    it("checkCopilotCallback() and fail to open url", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const showMessageStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "showMessage")
        .mockResolvedValue(ok("Enroll"));
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");

      await checkCopilotCallback();

      expect(showMessageStub.callCount).to.be.equal(1);
      expect(openUrlStub.callCount).to.be.equal(0);
    });

    it("checkCopilotCallback() and fail to show message", async () => {
      const localizeStub = vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const showMessageStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "showMessage")
        .mockRejectedValue(new Error("error"));

      await checkCopilotCallback();

      expect(showMessageStub.callCount).to.be.equal(1);
      expect(localizeStub.callCount).to.be.equal(2);
    });
  });

  describe("CheckSideloading", () => {
    let clock: ReturnType<typeof vi.useFakeTimers>;

    afterEach(() => {
      if (clock) {
        clock.restore();
      }
      clock.restore();
      vi.restoreAllMocks();
    });

    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
    });

    it("checkSideloadingCallback() - click enable custom app upload button", async () => {
      const showMessageStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "showMessage")
        .mockResolvedValue(ok("Enable Custom App Upload"));
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");

      clock = vi.useFakeTimers();
      await checkSideloadingCallback();
      await clock.tickAsync(5000);

      expect(showMessageStub).toHaveBeenCalledTimes(1);
      expect(openUrlStub).toHaveBeenCalledTimes(1);
      expect(openUrlStub).toHaveBeenCalledWith(
        "https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/tools-prerequisites#enable-custom-app-upload-using-admin-center"
      );
    });

    it("checkSideloadingCallback() - click use test tenant button", async () => {
      const showMessageStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "showMessage")
        .mockResolvedValue(ok("Use Test Tenant"));
      const createOrShow = vi.spyOn(WebviewPanel, "createOrShow");

      clock = vi.useFakeTimers();
      await checkSideloadingCallback();
      await clock.tickAsync(5000);

      expect(showMessageStub).toHaveBeenCalledTimes(1);
      expect(createOrShow).toHaveBeenCalledTimes(1);
      expect(createOrShow).toHaveBeenCalledWith(PanelType.AccountHelp);
    });
  });

  describe("checkSandboxCallback", () => {
    beforeEach(() => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
    });

    it("executes quick open command when user confirms", async () => {
      vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => {
        if (key === "teamstoolkit.accountTree.sandboxedTeam.button") {
          return "Debug in Sandbox";
        }
        return key;
      });
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(ok("Debug in Sandbox"));
      const executeCommandStub = vi
        .spyOn(vscode.commands, "executeCommand")
        .mockResolvedValue(undefined as any);

      await checkSandboxCallback();

      expect(executeCommandStub.calledOnce).to.be.true;
    });

    it("does not execute command when user skips", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("Debug in Sandbox");
      vi.spyOn(vsc_ui.VS_CODE_UI, "showMessage").mockResolvedValue(ok("Skip"));
      const executeCommandStub = vi
        .spyOn(vscode.commands, "executeCommand")
        .mockResolvedValue(undefined as any);

      await checkSandboxCallback();

      expect(executeCommandStub.called).to.be.false;
    });
  });
});
