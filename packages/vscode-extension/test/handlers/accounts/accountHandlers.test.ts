import * as vscode from "vscode";
import { FeatureFlags, GraphScopes, featureFlagManager } from "@microsoft/teamsfx-core";
import M365TokenInstance from "../../../src/commonlib/m365Login";
import { err, ok } from "@microsoft/teamsfx-api";
import { AzureAccountManager } from "../../../src/commonlib/azureLogin";
import * as vsc_ui from "../../../src/qm/vsc_ui";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../../mocks/vitestMockUtils";
import {
  azureAccountSignOutHelpHandler,
  cmpAccountsHandler,
  createAccountHandler,
} from "../../../src/handlers/accounts/accountHandlers";
import { ExtTelemetry } from "../../../src/telemetry/extTelemetry";
import * as localizeUtils from "../../../src/utils/localizeUtils";

describe("AccountHandlers", () => {
  describe("createAccountHandler", () => {
    beforeEach(() => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("test");
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
    });

    it("create M365 account", async () => {
      const selectOptionStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
        .mockResolvedValue(ok({ result: "createAccountM365" } as any));
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await createAccountHandler([]);

      expect(selectOptionStub.calledOnce).to.be.true;
      expect(
        openUrlStub.calledOnceWith("https://developer.microsoft.com/microsoft-365/dev-program")
      ).to.be.true;
      expect(sendTelemetryEventStub.args[1][1]["account-type"]).to.equal("m365");
      expect(sendTelemetryEventStub.args[1][1]["trigger-from"]).to.equal("CommandPalette");
    });

    it("create Azure account", async () => {
      const selectOptionStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
        .mockResolvedValue(ok({ result: "createAccountAzure" } as any));
      const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await createAccountHandler([]);

      expect(selectOptionStub.calledOnce).to.be.true;
      expect(openUrlStub.calledOnceWith("https://azure.microsoft.com/en-us/free/")).to.be.true;
      expect(sendTelemetryEventStub.args[1][1]["account-type"]).to.equal("azure");
      expect(sendTelemetryEventStub.args[1][1]["trigger-from"]).to.equal("CommandPalette");
    });

    it("create account error", async () => {
      const selectOptionStub = vi
        .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
        .mockResolvedValue(err("error") as any);
      const sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      await createAccountHandler([]);

      expect(selectOptionStub.calledOnce).to.be.true;
      expect(sendTelemetryEventStub.calledOnce).to.be.true;
      expect(sendTelemetryErrorEventStub.calledOnce).to.be.true;
    });
  });

  describe("cmpAccountsHandler", () => {
    let changeSelectionCallback: (e: readonly vscode.QuickPickItem[]) => any;
    let stubQuickPick: any;

    beforeEach(() => {
      changeSelectionCallback = () => {};
      stubQuickPick = {
        items: [],
        onDidChangeSelection: (
          _changeSelectionCallback: (e: readonly vscode.QuickPickItem[]) => any
        ) => {
          changeSelectionCallback = _changeSelectionCallback;
          return {
            dispose: () => {},
          };
        },
        onDidHide: () => {
          return {
            dispose: () => {},
          };
        },
        show: () => {},
        hide: () => {},
        onDidAccept: () => {},
      };
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(vscode.window, "createQuickPick").mockReturnValue(stubQuickPick as any);
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
        ok({ result: "unknown" } as any)
      );
    });

    it("Sign out happy path", async () => {
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue(undefined);
      const m365SignoutMock = vi.fn().mockResolvedValue(undefined);
      mockValue(M365TokenInstance, "signout", m365SignoutMock as never);
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(
        ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } })
      );
      vi.spyOn(AzureAccountManager.prototype, "getStatus").mockResolvedValue({
        status: "SignedIn",
        accountInfo: { upn: "test.email.com" },
      });
      const hideStub = vi.spyOn(stubQuickPick, "hide");

      await cmpAccountsHandler([]);
      changeSelectionCallback([stubQuickPick.items[1]]);

      for (const i of stubQuickPick.items) {
        await (i as any).function();
      }

      assert.isTrue(showMessageStub.calledTwice);
      assert.isTrue(m365SignoutMock.mock.calls.length === 1);
      assert.isTrue(hideStub.calledOnce);
    });

    it("Sign in happy path", async () => {
      const showMessageStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue(undefined);
      const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(
        ok({ status: "SignedOut", accountInfo: { upn: "test.email.com" } })
      );
      vi.spyOn(AzureAccountManager.prototype, "getStatus").mockResolvedValue({
        status: "SignedOut",
        accountInfo: { upn: "test.email.com" },
      });
      const hideStub = vi.spyOn(stubQuickPick, "hide");

      await cmpAccountsHandler([]);
      changeSelectionCallback([stubQuickPick.items[1]]);

      for (const i of stubQuickPick.items) {
        await (i as any).function();
      }

      assert.isTrue(showMessageStub.notCalled);
      assert.isTrue(executeCommandStub.calledThrice);
      expect(executeCommandStub.args[0][0]).to.be.equal("fx-extension.signinAzure");
      expect(executeCommandStub.args[1][0]).to.be.equal("fx-extension.signinM365");
      expect(executeCommandStub.args[2][0]).to.be.equal("fx-extension.signinAzure");
      assert.isTrue(hideStub.calledOnce);
    });

    it("Sign out happy path - unique_name", async () => {
      vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
      vi.spyOn(M365TokenInstance, "signout");
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(
        ok({ status: "SignedIn", accountInfo: { unique_name: "test.email.com" } })
      );
      vi.spyOn(AzureAccountManager.prototype, "getStatus").mockResolvedValue({
        status: "SignedIn",
        accountInfo: { upn: "test.email.com" },
      });
      vi.spyOn(stubQuickPick, "hide");

      await cmpAccountsHandler([]);

      assert.isTrue((stubQuickPick.items[0].label as string).includes("test.email.com"));
    });

    it("Sign out happy path - undefined", async () => {
      vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
      vi.spyOn(M365TokenInstance, "signout");
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(
        ok({ status: "SignedIn", accountInfo: {} })
      );
      vi.spyOn(AzureAccountManager.prototype, "getStatus").mockResolvedValue({
        status: "SignedIn",
        accountInfo: { upn: "test.email.com" },
      });
      vi.spyOn(stubQuickPick, "hide");

      await cmpAccountsHandler([]);

      assert.equal(
        stubQuickPick.items[0].label as string,
        localizeUtils.localize("teamstoolkit.handlers.signOutOfM365")
      );
    });

    it("uses Graph scopes in sovereign high", async () => {
      vi.spyOn(featureFlagManager, "getStringValue").mockReturnValue("DoD");
      const getStatusStub = vi
        .spyOn(M365TokenInstance, "getStatus")
        .mockResolvedValue(ok({ status: "SignedOut", accountInfo: {} } as any));
      vi.spyOn(AzureAccountManager.prototype, "getStatus").mockResolvedValue({
        status: "SignedOut",
        accountInfo: {},
      } as any);
      vi.spyOn(stubQuickPick, "hide");

      await cmpAccountsHandler([]);

      assert.isTrue(getStatusStub.calledOnceWithExactly({ scopes: GraphScopes }));
    });
  });

  describe("azureAccountSignOutHelpHandler", () => {
    it("happy path", async () => {
      try {
        azureAccountSignOutHelpHandler();
      } catch (e) {
        assert.isTrue(e instanceof Error);
      }
    });
  });
});
