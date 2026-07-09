import { ok, signedIn, signedOut } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import M365TokenInstance from "../../src/commonlib/m365Login";
import { DeveloperPortalHomeLink } from "../../src/constants";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  findGitHubSimilarIssue,
  openAccountLinkHandler,
  openAppManagement,
  openAzureAccountHandler,
  openBotManagement,
  openDevelopmentLinkHandler,
  openDocumentHandler,
  openDocumentLinkHandler,
  openEnvLinkHandler,
  openExternalHandler,
  openHelpFeedbackLinkHandler,
  openLifecycleLinkHandler,
  openM365AccountHandler,
  openReportIssues,
  openResourceGroupInPortal,
  openSubscriptionInPortal,
} from "../../src/handlers/openLinkHandlers";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as envTreeUtils from "../../src/utils/envTreeUtils";
import * as localizeUtils from "../../src/utils/localizeUtils";
import { MockCore } from "../mocks/mockCore";
import { TelemetryTriggerFrom } from "../../src/telemetry/extTelemetryEvents";

describe("Open link handlers", () => {
  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockResolvedValue();
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent").mockResolvedValue();
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
  });

  describe("openAppManagement", async () => {
    it("open link with loginHint", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      mockValue(globalVariables, "core", new MockCore());
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(
        ok({
          status: signedIn,
          token: undefined,
          accountInfo: { upn: "test" },
        })
      );
      const openUrl = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));

      const res = await openAppManagement();

      assert.isTrue(openUrl.calledOnce);
      assert.isTrue(res.isOk());
      assert.equal(openUrl.args[0][0], `${DeveloperPortalHomeLink}?login_hint=test`);
    });

    it("open link without loginHint", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(
        ok({
          status: signedOut,
          token: undefined,
          accountInfo: { upn: "test" },
        })
      );
      const openUrl = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));

      const res = await openAppManagement();

      assert.isTrue(openUrl.calledOnce);
      assert.isTrue(res.isOk());
      assert.equal(openUrl.args[0][0], DeveloperPortalHomeLink);
    });
  });

  describe("openEnvLinkHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openEnvLinkHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openDevelopmentLinkHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDevelopmentLinkHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openDocumentHandler", () => {
    it("opens upgrade guide when clicked from sidebar", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const openUrl = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));

      await openDocumentHandler(TelemetryTriggerFrom.SideBar, "learnmore");

      assert.isTrue(openUrl.calledOnceWith("https://aka.ms/teams-toolkit-5.0-upgrade"));
    });
    it("opens build app guide when clicked from left pane", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const openUrl = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));

      await openDocumentHandler("documentName", "build-apps");

      assert.isTrue(openUrl.calledOnceWith("https://aka.ms/teamstoolkit-build-app"));
    });
    it("opens build agent guide when clicked from left pane", async () => {
      mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
      const openUrl = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));

      await openDocumentHandler("documentName", "build-agents");

      assert.isTrue(openUrl.calledOnceWith("https://aka.ms/teamstoolkit-build-agent"));
    });
  });

  describe("openLifecycleLinkHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openLifecycleLinkHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openHelpFeedbackLinkHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openHelpFeedbackLinkHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openM365AccountHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openM365AccountHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("openAzureAccountHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openAzureAccountHandler();
      assert.isTrue(res.isOk());
    });
  });

  describe("openBotManagement", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openBotManagement();
      assert.isTrue(res.isOk());
    });
  });

  describe("openAccountLinkHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openAccountLinkHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openReportIssues", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openReportIssues([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openExternalHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openExternalHandler([{ url: "abc" }]);
      assert.isTrue(res.isOk());
    });
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openExternalHandler([]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openDocumentHandler", () => {
    it("happy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentHandler(["", ""]);
      assert.isTrue(res.isOk());
    });
    it("happy learnmore", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentHandler(["", "learnmore"]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openDocumentLinkHandler", () => {
    it("signinM365", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "signinM365" }]);
      assert.isTrue(res.isOk());
    });
    it("signinAzure", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "signinAzure" }]);
      assert.isTrue(res.isOk());
    });
    it("fx-extension.create", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "fx-extension.create" }]);
      assert.isTrue(res.isOk());
    });
    it("fx-extension.provision", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "fx-extension.provision" }]);
      assert.isTrue(res.isOk());
    });
    it("fx-extension.build", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "fx-extension.build" }]);
      assert.isTrue(res.isOk());
    });
    it("fx-extension.deploy", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "fx-extension.deploy" }]);
      assert.isTrue(res.isOk());
    });
    it("fx-extension.publish", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "fx-extension.publish" }]);
      assert.isTrue(res.isOk());
    });
    it("fx-extension.publishInDeveloperPortal", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([
        { contextValue: "fx-extension.publishInDeveloperPortal" },
      ]);
      assert.isTrue(res.isOk());
    });
    it("empty", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([]);
      assert.isTrue(res.isOk());
    });
    it("none", async () => {
      vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
      const res = await openDocumentLinkHandler([{ contextValue: "" }]);
      assert.isTrue(res.isOk());
    });
  });

  describe("openSubscriptionInPortal", () => {
    it("subscriptionInfo not found", async () => {
      vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv");
      const res = await openSubscriptionInPortal("local");
      assert.equal(res.isErr() ? res.error.name : "Not Error", "EnvResourceInfoNotFoundError");
    });

    it("happy path", async () => {
      vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv").mockReturnValue({
        subscriptionName: "subscriptionName",
        subscriptionId: "subscriptionId",
        tenantId: "tenantId",
      } as any);
      const openExternalStub = vi.spyOn(vscode.env, "openExternal");
      await openSubscriptionInPortal("local");
      assert.equal(openExternalStub.callCount, 1);
      assert.deepEqual(
        openExternalStub.args[0][0],
        vscode.Uri.parse(
          `https://portal.azure.com/#@tenantId/resource/subscriptions/subscriptionId`
        )
      );
    });
  });

  describe("openResourceGroupInPortal", () => {
    it("subscriptionInfo not found", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue(
        "Unable to load %s info for environment %s."
      );
      vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv");
      vi.spyOn(envTreeUtils, "getResourceGroupNameFromEnv").mockReturnValue(
        "resourceGroupName" as any
      );
      const res = await openResourceGroupInPortal("local");
      assert.equal(
        res.isErr() ? res.error.message : "Not Error",
        "Unable to load Subscription info for environment local."
      );
    });

    it("resourceGroupName not found", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue(
        "Unable to load %s info for environment %s."
      );
      vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv").mockReturnValue({
        subscriptionName: "subscriptionName",
        subscriptionId: "subscriptionId",
        tenantId: "tenantId",
      } as any);
      vi.spyOn(envTreeUtils, "getResourceGroupNameFromEnv");
      const res = await openResourceGroupInPortal("local");
      assert.equal(
        res.isErr() ? res.error.message : "Not Error",
        "Unable to load Resource Group info for environment local."
      );
    });

    it("subscriptionInfo and resourceGroupName not found", async () => {
      vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv");
      vi.spyOn(envTreeUtils, "getResourceGroupNameFromEnv");
      const res = await openResourceGroupInPortal("local");
      assert.equal(
        res.isErr() ? res.error.message : "Not Error",
        "Unable to load Subscription and Resource Group info for environment local."
      );
    });

    it("happy path", async () => {
      vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv").mockReturnValue({
        subscriptionName: "subscriptionName",
        subscriptionId: "subscriptionId",
        tenantId: "tenantId",
      } as any);
      vi.spyOn(envTreeUtils, "getResourceGroupNameFromEnv").mockReturnValue(
        "resourceGroupName" as any
      );
      const openExternalStub = vi.spyOn(vscode.env, "openExternal");
      await openResourceGroupInPortal("local");
      assert.equal(openExternalStub.callCount, 1);
      assert.deepEqual(
        openExternalStub.args[0][0],
        vscode.Uri.parse(
          `https://portal.azure.com/#@tenantId/resource/subscriptions/subscriptionId/resourceGroups/resourceGroupName`
        )
      );
    });
  });

  describe("findGitHubSimilarIssue", () => {
    it("open issues", async () => {
      const commandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      await findGitHubSimilarIssue(["firsterror"]);

      assert.isTrue(commandStub.calledOnce);
    });

    it("do nothing if invalid args", async () => {
      const commandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      const res = await findGitHubSimilarIssue([]);

      assert.isFalse(commandStub.calledOnce);
      assert.isTrue(res.isOk());
    });

    it("do nothing if no args", async () => {
      const commandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      const res = await findGitHubSimilarIssue();

      assert.isFalse(commandStub.calledOnce);
      assert.isTrue(res.isOk());
    });
  });
});
