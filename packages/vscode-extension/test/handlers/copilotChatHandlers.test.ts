import * as vscode from "vscode";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

import VsCodeLogInstance from "../../src/commonlib/log";
import * as handlers from "../../src/handlers/copilotChatHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as extTelemetryEvents from "../../src/telemetry/extTelemetryEvents";
import * as versionUtils from "../../src/utils/versionUtil";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { err, ok, SystemError } from "@microsoft/teamsfx-api";
import { GlobalKey } from "../../src/constants";
import { TelemetryTriggerFrom } from "../../src/telemetry/extTelemetryEvents";

after(() => {
  vi.restoreAllMocks();
});

describe("copilotChatHandler", async () => {
  let clock: ReturnType<typeof vi.useFakeTimers> | undefined;
  let sendTelemetryErrorEventStub: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
    if (clock) {
      clock.restore();
    }
  });

  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "dispose");
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    vi.spyOn(VsCodeLogInstance, "outputChannel").value({
      name: "name",
      append: (value: string) => {},
      appendLine: (value: string) => {},
      replace: (value: string) => {},
      clear: () => {},
      show: (...params: any[]) => {},
      hide: () => {},
      dispose: () => {},
    });
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
  });

  describe("openGithubCopilotChat", async () => {
    it("open without query success", async () => {
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      const res = await handlers.openGithubCopilotChat([
        extTelemetryEvents.TelemetryTriggerFrom.CreateAppQuestionFlow,
      ]);
      assert.isTrue(res.isOk());
      assert.isTrue(executeCommandStub.called);
    });

    it("open without query success", async () => {
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      const res = await handlers.openGithubCopilotChat([
        extTelemetryEvents.TelemetryTriggerFrom.CreateAppQuestionFlow,
        "test",
      ]);
      assert.isTrue(res.isOk());
      assert.isTrue(executeCommandStub.called);
    });

    it("open without query error", async () => {
      vi.spyOn(vscode.commands, "executeCommand").mockImplementation(async (command: string) => {
        if (command === "workbench.panel.chat.view.copilot.focus") {
          throw new Error("Install Error");
        } else {
          return {};
        }
      });

      vi.spyOn(VsCodeLogInstance, "error").mockResolvedValue();

      const res = await handlers.openGithubCopilotChat();

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.source, "open-github-copilot-chat");
      }
    });

    it("open with query switching mode error", async () => {
      const executeCommandStub = vi
        .spyOn(vscode.commands, "executeCommand")
        .mockImplementation(async (command: string) => {
          if (command === "workbench.action.chat.toggleAgentMode") {
            throw new Error("Install Error");
          } else {
            return {};
          }
        });

      const res = await handlers.openGithubCopilotChat([
        extTelemetryEvents.TelemetryTriggerFrom.CreateAppQuestionFlow,
        "test",
      ]);

      assert.isTrue(res.isOk());
      assert.isTrue(executeCommandStub.called);
    });

    it("open with query error", async () => {
      vi.spyOn(vscode.commands, "executeCommand").mockImplementation(async (command: string) => {
        if (command === "workbench.panel.chat.view.copilot.focus") {
          throw new Error("Install Error");
        } else {
          return {};
        }
      });

      vi.spyOn(VsCodeLogInstance, "error").mockResolvedValue();

      const res = await handlers.openGithubCopilotChat([
        extTelemetryEvents.TelemetryTriggerFrom.CreateAppQuestionFlow,
        "test",
      ]);

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.source, "open-github-copilot-chat");
      }
    });
  });

  describe("installGithubCopilotChatExtension", async () => {
    it("no need to install Github Copilot", async () => {
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const res = await handlers.installGithubCopilotChatExtension([
        extTelemetryEvents.TelemetryTriggerFrom.CreateAppQuestionFlow,
      ]);

      assert.isTrue(res.isOk());
    });

    it("install Github Copilot successfully", async () => {
      vi.spyOn(versionUtils, "isVSCodeInsiderVersion").mockReturnValue(true);
      const installStub = vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);

      const res = await handlers.installGithubCopilotChatExtension([
        extTelemetryEvents.TelemetryTriggerFrom.CreateAppQuestionFlow,
      ]);

      assert.isTrue(res.isOk());
      assert.isTrue(installStub.called);
    });

    it("Install github copilot extension error", async () => {
      vi.spyOn(versionUtils, "isVSCodeInsiderVersion").mockReturnValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);
      const commandStub = vi
        .spyOn(vscode.commands, "executeCommand")
        .mockImplementation(async (command: string) => {
          if (command === "workbench.extensions.installExtension") {
            throw new Error("Install Error");
          } else {
            return {};
          }
        });

      vi.spyOn(VsCodeLogInstance, "error").mockResolvedValue();

      const res = await handlers.installGithubCopilotChatExtension();

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.source, "install-copilot-chat");
      }
      assert.equal(commandStub.callCount, 1);
    });
  });

  describe("openInstallTeamsAgent", () => {
    it("should open URL successfully", async () => {
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      await handlers.openInstallTeamsAgent();
      assert.isTrue(openUrlStub.calledOnce);
    });

    it("should handle URL opening failure", async () => {
      const error = new SystemError("test", "test", "test", "test");
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(err(error));
      const logErrorStub = vi.spyOn(VsCodeLogInstance, "error").mockResolvedValue();
      await handlers.openInstallTeamsAgent();
      assert.isTrue(openUrlStub.calledOnce);
      assert.isTrue(logErrorStub.calledOnceWith(error.message));
    });
  });

  describe("markTeamsAgentInstallationDone", () => {
    it("should update global state successfully", async () => {
      const globalStateUpdateStub = vi.spyOn(teamsfxCore, "globalStateUpdate").mockResolvedValue();
      await handlers.markTeamsAgentInstallationDone();
      assert.isTrue(globalStateUpdateStub.calledOnceWith(GlobalKey.TeamsAgentInstalled, true));
    });

    it("should handle global state update failure", async () => {
      const error = new SystemError("test", "test", "test", "test");
      const globalStateUpdateStub = vi
        .spyOn(teamsfxCore, "globalStateUpdate")
        .mockRejectedValue(error);
      await handlers.markTeamsAgentInstallationDone();
      assert.isTrue(globalStateUpdateStub.calledOnceWith(GlobalKey.TeamsAgentInstalled, true));
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });
  });

  describe("openTeamsAgentWalkthrough", () => {
    it("should execute command successfully", async () => {
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      await handlers.openTeamsAgentWalkthrough();
      assert.isTrue(
        executeCommandStub.calledOnceWith("workbench.action.openWalkthrough", {
          category: "TeamsDevApp.ms-teams-vscode-extension#teamsAgentGetStarted",
        })
      );
    });
  });

  describe("invokeTeamsAgent", () => {
    it("returns error if GitHub Copilot Chat is not installed", async () => {
      const args = [TelemetryTriggerFrom.TreeView];
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([
        {
          id: "someid",
          label: "",
        },
      ]);
      vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue();
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const res = await handlers.invokeTeamsAgent(args);

      assert.isTrue(res.isErr());
      assert.isTrue(executeCommandStub.notCalled);
    });

    it("invokes chat from treeview when not signed in (sign-in precheck removed)", async () => {
      const args = [TelemetryTriggerFrom.TreeView];
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([]);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const res = await handlers.invokeTeamsAgent(args);

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isTrue(res.value);
      }
      assert.isTrue(executeCommandStub.called);
      assert.isTrue(sendTelemetryErrorEventStub.notCalled);
    });

    it("invokes chat from treeview when @m365agents not installed (install precheck removed)", async () => {
      const args = [TelemetryTriggerFrom.TreeView];
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(false);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([
        {
          id: "someid",
          label: "",
        },
      ]);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const res = await handlers.invokeTeamsAgent(args);

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isTrue(res.value);
      }
      assert.isTrue(executeCommandStub.called);
      assert.isTrue(sendTelemetryErrorEventStub.notCalled);
    });

    it("invoke chat successfully from command palette", async () => {
      const args = [TelemetryTriggerFrom.CommandPalette];
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([
        {
          id: "someid",
          label: "",
        },
      ]);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const res = await handlers.invokeTeamsAgent(args);

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isTrue(res.value);
      }
      assert.isTrue(executeCommandStub.called);
      assert.isTrue(sendTelemetryErrorEventStub.notCalled);
    });

    it("invoke chat successfully from unknown", async () => {
      const args = [TelemetryTriggerFrom.Unknow];
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([
        {
          id: "someid",
          label: "",
        },
      ]);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const res = await handlers.invokeTeamsAgent(args);

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isTrue(res.value);
      }
      assert.isTrue(executeCommandStub.called);
      assert.isTrue(sendTelemetryErrorEventStub.notCalled);
    });

    it("skip precheck and invoke chat error from WalkThrough", async () => {
      const args = [TelemetryTriggerFrom.WalkThrough];

      vi.spyOn(vscode.commands, "executeCommand").mockImplementation(async (command: string) => {
        if (command === "workbench.action.chat.open") {
          throw new Error("Error");
        } else {
          return {};
        }
      });

      const res = await handlers.invokeTeamsAgent(args);

      assert.isTrue(res.isErr());
      if (res.isOk()) {
        assert.isTrue(res.value);
      }
      assert.isTrue(sendTelemetryErrorEventStub.called);
    });

    describe("invoke chat successfully from WalkThrough", async () => {
      const walkthroughTriggers = [
        TelemetryTriggerFrom.TeamsAgentWalkthroughCreate,
        TelemetryTriggerFrom.TeamsAgentWalkthroughExplore,
        TelemetryTriggerFrom.TeamsAgentWalkthroughTroubleshoot,
      ];

      walkthroughTriggers.forEach((trigger) => {
        it(`should invoke chat successfully from ${trigger}`, async () => {
          const args = [trigger];
          vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
          const res = await handlers.invokeTeamsAgent(args);
          assert.isTrue(res.isOk());
          if (res.isOk()) {
            assert.isTrue(res.value);
          } else {
            console.log(res.error);
          }
        });
      });
    });
  });

  describe("troubleshootSelectedText", async () => {
    beforeEach(() => {
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([
        {
          id: "someid",
          label: "",
        },
      ]);
    });
    it("can invoke teams agent", async () => {
      vi.spyOn(vscode.window, "activeTextEditor").value({
        selection: "current select",
        document: {
          getText: (selection: vscode.Selection) => "current select",
        },
      } as any);
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot",
      } as any);
      vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      const res = await handlers.troubleshootSelectedText();
      if (res.isErr()) {
        console.log(res.error);
      }
      assert.isTrue(res.isOk());
    });

    it("no active text", async () => {
      mockValue(vscode.window, "activeTextEditor", undefined);
      const res = await handlers.troubleshootSelectedText();
      assert.isTrue(res.isErr());
    });

    it("error", async () => {
      vi.spyOn(vscode.window, "activeTextEditor").value({
        selection: "current select",
        document: {
          getText: (selection: vscode.Selection) => "current select",
        },
      } as any);
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      const error = new SystemError("test", "test", "test", "test");
      vi.spyOn(vscode.commands, "executeCommand").mockRejectedValue(error);

      const res = await handlers.troubleshootSelectedText();
      assert.isTrue(res.isErr());
    });
  });

  describe("troubleshootError", async () => {
    beforeEach(() => {
      vi.spyOn(vscode.authentication, "getAccounts").mockResolvedValue([
        {
          id: "someid",
          label: "",
        },
      ]);
      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(true);
    });
    it("can invoke teams agent", async () => {
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);
      vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

      const currentError = new SystemError("test", "test", "test", "test");
      const res = await handlers.troubleshootError(["Notification", currentError]);
      assert.isTrue(res.isOk());
    });

    it("missing args", async () => {
      const res = await handlers.troubleshootError([]);
      const calledCommand = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      assert.isTrue(res.isOk());
      assert.isFalse(calledCommand.calledOnce);
    });

    it("error", async () => {
      const error = new SystemError("test", "test", "test", "test");
      vi.spyOn(vscode.commands, "executeCommand").mockRejectedValue(error);
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        name: "github.copilot-chat",
      } as any);

      const currentError = new SystemError("test", "test", "test", "test");
      const res = await handlers.troubleshootError(["triggerFrom", currentError]);
      assert.isTrue(res.isErr());
    });
  });
});
