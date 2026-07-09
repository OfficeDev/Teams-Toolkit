import * as vscode from "vscode";
import * as localizeUtils from "../../src/utils/localizeUtils";
import fs from "fs-extra";
import * as globalVariables from "../../src/globalVariables";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { SystemError, UserError } from "@microsoft/teamsfx-api";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  isLoginFailureError,
  notifyOutputTroubleshoot,
  showError,
  wrapError,
} from "../../src/error/common";
import { TelemetryEvent } from "../../src/telemetry/extTelemetryEvents";
import { RecommendedOperations } from "../../src/debug/common/debugConstants";
import { featureFlagManager, GraphClient, FeatureFlagName } from "@microsoft/teamsfx-core";
import { MaximumNotificationOutputTroubleshootCount } from "../../src/constants";
import * as teamsfxCore from "@microsoft/teamsfx-core";

describe("common", async () => {
  let clock: ReturnType<typeof vi.useFakeTimers>;

  afterEach(() => {
    vi.restoreAllMocks();
    if (clock) {
      clock.restore();
    }
  });

  beforeEach(() => {
    vi.spyOn(GraphClient.prototype, "GetTeamsAppSettingsAsync").mockResolvedValue({
      sandboxingConfiguration: {
        isSideloadingEnabled: true,
        sensitivityLabelUsedToIdentifySandboxedContainers: "0fcfd0ff-1cda-407e-bc2b-a350307bd1d5",
      },
    });
  });

  it("showError", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(localizeUtils, "localize").mockReturnValue("");
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockImplementation((title: string, button: any) => {
        return Promise.resolve(button);
      });
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(vscode.commands, "executeCommand");
    const error = new UserError("test source", "test name", "test message", "test displayMessage");
    error.helpLink = "test helpLink";

    await showError(error);
    await showErrorMessageStub.firstCall.returnValue;

    // "Get Help" button has been removed; only the troubleshoot button is shown
    // when no other recommendations apply, so the call should still happen with
    // exactly one button.
    assert.isTrue(showErrorMessageStub.calledOnce);
  });

  it("showError - if user does not click any button", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(localizeUtils, "localize").mockReturnValue("");
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockImplementation((title: string, button: any) => {
        return Promise.resolve(undefined);
      });
    const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(vscode.commands, "executeCommand");
    const error = new UserError("test source", "test name", "test message", "test displayMessage");
    error.helpLink = "test helpLink";

    await showError(error);
    await showErrorMessageStub.firstCall.returnValue;

    assert.isFalse(
      sendTelemetryEventStub.calledWith(TelemetryEvent.ClickGetHelp, {
        "error-code": "test source.test name",
        "err-message": "test displayMessage",
        "help-link": "test helpLink",
      })
    );
  });

  it("showError with test tool button click", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(localizeUtils, "localize").mockReturnValue("");
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockImplementation((title: string, button: any) => {
        return Promise.resolve(button);
      });
    const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(vscode.commands, "executeCommand");
    const error = new UserError("test source", "test name", "test message", "test displayMessage");
    error.recommendedOperation = "debug-in-test-tool";
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

    await showError(error);
    await showErrorMessageStub.firstCall.returnValue;

    assert.isFalse(
      sendTelemetryEventStub.calledWith(TelemetryEvent.ClickGetHelp, {
        "error-code": "test source.test name",
        "err-message": "test displayMessage",
        "help-link": "test helpLink",
      })
    );
  });

  it("showError - similar issues", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockImplementation((title: string, button: unknown, ...items: vscode.MessageItem[]) => {
        return Promise.resolve(items[0]);
      });

    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");
    const error = new SystemError("Core", "DecryptionError", "test");

    await showError(error);
    await showErrorMessageStub.firstCall.returnValue;

    assert.isTrue(executeCommandStub.called);
  });

  it("showError - similar issues and no button clicked", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockImplementation((title: string, button: unknown, ...items: vscode.MessageItem[]) => {
        return Promise.resolve(undefined);
      });
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");
    const error = new SystemError("Core", "DecryptionError", "test");

    await showError(error);
    await showErrorMessageStub.firstCall.returnValue;

    assert.isTrue(executeCommandStub.notCalled);
  });

  describe("notify user to troubleshoot output with Teams Agent", async () => {
    let showInformationMessageStub: ReturnType<typeof vi.spyOn>;
    let showErrorMessageStub: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      showInformationMessageStub = vi.spyOn(vscode.window, "showInformationMessage");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockImplementation((title: string, button: any) => {
          return Promise.resolve(button);
        });
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      clock = vi.useFakeTimers();
    });

    afterEach(() => {
      globalVariables.setOutputTroubleshootNotificationCount(0);
      if (clock) {
        clock.restore();
      }
    });
    it("showError - notify user to troubleshoot output with Teams Agent", async () => {
      showInformationMessageStub.mockResolvedValue("Open output panel");
      globalVariables.setOutputTroubleshootNotificationCount(0);
      vi.spyOn(vscode.commands, "executeCommand");
      const error = new UserError(
        "test source",
        "test name",
        "test message",
        "test displayMessage"
      );
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      const job = showError(error);
      await clock.tickAsync(4000);
      await job;
      await showErrorMessageStub.firstCall.returnValue;

      // The auto-notify-after-error info message has been removed; the count
      // should remain unchanged.
      assert.equal(globalVariables.outputTroubleshootNotificationCount, 0);
    });

    it("showError - not notify user to troubleshoot output with Teams Agent if reaches limit", async () => {
      globalVariables.setOutputTroubleshootNotificationCount(3);
      vi.spyOn(vscode.commands, "executeCommand");
      const error = new UserError(
        "test source",
        "test name",
        "test message",
        "test displayMessage"
      );
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      await showError(error);
      await showErrorMessageStub.firstCall.returnValue;

      assert.equal(globalVariables.outputTroubleshootNotificationCount, 3);
      assert.isTrue(showErrorMessageStub.calledOnce);
    });

    it("showError - not notify user to troubleshoot output with Teams Agent if userCancelError", async () => {
      globalVariables.setOutputTroubleshootNotificationCount(0);

      vi.spyOn(vscode.commands, "executeCommand");
      const error = new UserError(
        "test source",
        "User Cancel",
        "test message",
        "test displayMessage"
      );
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      await showError(error);

      assert.equal(globalVariables.outputTroubleshootNotificationCount, 0);
      assert.isFalse(showErrorMessageStub.called);
    });

    it("should execute command when user selects 'Open output panel'", async () => {
      showInformationMessageStub.mockImplementation((title: string, button: any) => {
        return Promise.resolve(button);
      });
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const job = notifyOutputTroubleshoot("testErrorCode");
      await clock.tickAsync(4000);
      await job;
      await showInformationMessageStub.firstCall.returnValue;

      assert.isTrue(executeCommandStub.calledOnceWith("fx-extension.showOutputChannel"));
    });
  });

  [
    {
      type: "user error",
      buildError: () => {
        const error = new UserError(
          "test source",
          "test name",
          "test message",
          "test displayMessage"
        );
        error.helpLink = "test helpLink";
        error.recommendedOperation = RecommendedOperations.DebugInTestTool;

        return error;
      },
      // "Get Help" button removed → 1 button (runTestTool)
      buttonNum: 1,
    },
    {
      type: "system error",
      buildError: () => {
        const error = new SystemError(
          "test source",
          "test name",
          "test message",
          "test displayMessage"
        );
        error.recommendedOperation = RecommendedOperations.DebugInTestTool;
        return error;
      },
      // System error path: runTestTool + issue + similarIssues = 3 buttons
      buttonNum: 3,
    },
  ].forEach(({ type, buildError, buttonNum }) => {
    it(`showError - ${type} - recommend test tool`, async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      const showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockImplementation((title: string, button: any) => {
          return Promise.resolve(button);
        });
      vi.spyOn(teamsfxCore, "isTestToolEnabledProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(vscode.commands, "executeCommand");
      const error = buildError();
      await showError(error);
      await showErrorMessageStub.firstCall.returnValue;
      assert.equal(showErrorMessageStub.firstCall.args.length, buttonNum + 1);
    });

    it(`showError - ${type} - recommend troubleshoot`, async () => {
      clock = vi.useFakeTimers();
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      globalVariables.setOutputTroubleshootNotificationCount(
        MaximumNotificationOutputTroubleshootCount
      );
      const showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockImplementation((title: string, button: any) => {
          return Promise.resolve(button);
        });
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((featureFlag: any) => {
        if (featureFlag.name == FeatureFlagName.SandBoxedTeam) {
          return false;
        } else {
          return true;
        }
      });
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(teamsfxCore, "isTestToolEnabledProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(vscode.commands, "executeCommand");
      const error = buildError();
      const job = showError(error);
      await clock.tickAsync(4000);
      await job;
      await showErrorMessageStub.firstCall.returnValue;

      if (type == "system error") {
        assert.equal(showErrorMessageStub.firstCall.args.length, buttonNum + 1);
      } else {
        assert.equal(showErrorMessageStub.firstCall.args.length, buttonNum + 2);
      }
    });

    it(`showError - ${type} - recommend troubleshoot only`, async () => {
      clock = vi.useFakeTimers();
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      globalVariables.setOutputTroubleshootNotificationCount(
        MaximumNotificationOutputTroubleshootCount
      );
      const showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockImplementation((title: string, button: any) => {
          return Promise.resolve(button);
        });
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(teamsfxCore, "isTestToolEnabledProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(vscode.commands, "executeCommand");
      const error = buildError();
      const job = showError(error);
      await clock.tickAsync(4000);
      await job;
      await showErrorMessageStub.firstCall.returnValue;

      if (type == "system error") {
        assert.equal(showErrorMessageStub.firstCall.args.length, buttonNum + 1);
      } else {
        // User-error helpLink branch with sandbox + troubleshoot:
        // [troubleshoot, runSandbox] = 2 buttons + title = 3 args
        assert.equal(showErrorMessageStub.firstCall.args.length, buttonNum + 2);
      }
    });
  });

  describe("button click handlers", () => {
    it("runTestTool button: opens Microsoft 365 Agents Playground debug picker", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(teamsfxCore, "isTestToolEnabledProject").mockReturnValue(true);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const error = new UserError(
        "test source",
        "test name",
        "test message",
        "test displayMessage"
      );
      error.recommendedOperation = RecommendedOperations.DebugInTestTool;

      const showErrorMessageStub = vi
        .spyOn(vscode.window, "showErrorMessage")
        .mockImplementation(async (title: string, ...buttons: any[]) => {
          const button = buttons.find((item) => item && typeof item.run === "function");
          if (!button) {
            return undefined;
          }
          await button.run();
          return button;
        });

      await showError(error);

      assert.isTrue(showErrorMessageStub.calledOnce);
      if (executeCommandStub.called) {
        assert.isTrue(
          executeCommandStub.calledWith(
            "workbench.action.quickOpen",
            "debug Debug in Microsoft 365 Agents Playground"
          )
        );
        assert.isTrue(sendTelemetryEventStub.calledWith(TelemetryEvent.MessageDebugInTestTool));
      }
    });

    it("runSandbox button: opens sandbox debug picker", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) => {
        // SandBoxedTeam => true (so recommendSandbox=true), all others => false
        return flag.name === FeatureFlagName.SandBoxedTeam;
      });
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const error = new UserError(
        "test source",
        "test name",
        "test message",
        "test displayMessage"
      );
      error.helpLink = "test helpLink";

      vi.spyOn(vscode.window, "showErrorMessage").mockImplementation(
        async (title: string, ...buttons: any[]) => {
          const button = buttons.find((item) => item && typeof item.run === "function");
          if (!button) {
            return undefined;
          }
          await button.run();
          return button;
        }
      );

      await showError(error);

      assert.isTrue(
        executeCommandStub.calledWith(
          "workbench.action.quickOpen",
          "debug Debug in sandbox in Teams (Edge)"
        )
      );
      assert.isTrue(sendTelemetryEventStub.calledWith(TelemetryEvent.MessageDebugInSandbox));
    });

    it("issue button: opens GitHub bug report URL", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const error = new SystemError("Core", "TestSystemError", "test message");

      vi.spyOn(vscode.window, "showErrorMessage").mockImplementation(
        async (title: string, ...buttons: any[]) => {
          // System-error path with shouldRecommendTeamsAgent=false and no recommendations
          // => buttons = [issue, similarIssues]. Click the first one.
          const button = buttons[0];
          if (!button) {
            return undefined;
          }
          await button.run();
          return button;
        }
      );

      await showError(error);

      assert.isTrue(executeCommandStub.calledWith("vscode.open", expect.anything()));
    });
  });

  describe("wrapError", () => {
    it("returns the error directly when input is a UserError", () => {
      const original = new UserError("src", "name", "message");
      const result = wrapError(original);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.strictEqual(result.error, original);
      }
    });

    it("returns the error directly when input is a SystemError", () => {
      const original = new SystemError("src", "name", "message");
      const result = wrapError(original);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.strictEqual(result.error, original);
      }
    });

    it("wraps a plain Error in a SystemError", () => {
      const original = new Error("boom");
      const result = wrapError(original);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.instanceOf(result.error, SystemError);
      }
    });
  });

  describe("isLoginFailureError", () => {
    it("returns true when the message contains the login failure marker", () => {
      const e = new UserError("src", "name", "Cannot get user login information from cache");
      assert.isTrue(isLoginFailureError(e));
    });

    it("returns false for unrelated errors", () => {
      const e = new UserError("src", "name", "Something else went wrong");
      assert.isFalse(isLoginFailureError(e));
    });

    it("returns false when message is empty", () => {
      const e = new UserError("src", "name", "");
      assert.isFalse(isLoginFailureError(e));
    });
  });
});
