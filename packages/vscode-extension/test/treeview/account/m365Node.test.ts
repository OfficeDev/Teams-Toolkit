import { featureFlagManager } from "@microsoft/teamsfx-core";
import * as vscode from "vscode";
import { AccountItemStatus, loadingIcon, m365Icon } from "../../../src/treeview/account/common";
import { M365AccountNode } from "../../../src/treeview/account/m365Node";
import { DynamicNode } from "../../../src/treeview/dynamicNode";
import * as tool from "@microsoft/teamsfx-core/build/common/tools";
import * as globalVariables from "../../../src/globalVariables";
import { MockTools } from "../../mocks/mockTools";
import { ok } from "@microsoft/teamsfx-api";
import { localize } from "../../../src/utils/localizeUtils";
import { vi, assert } from "vitest";
import { mockValue } from "../../mocks/vitestMockUtils";

describe("m365Node", () => {
  const eventEmitter = new vscode.EventEmitter<DynamicNode | undefined | void>();

  it("setSignedIn", async () => {
    mockValue(globalVariables, "tools", new MockTools());
    vi.spyOn(
      globalVariables.tools.tokenProvider.m365TokenProvider,
      "getAccessToken"
    ).mockResolvedValue(ok(""));
    const m365Node = new M365AccountNode(eventEmitter);
    await m365Node.setSignedIn("test upn", "");
    const treeItem = await m365Node.getTreeItem();

    assert.equal(treeItem.iconPath, m365Icon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.label, "test upn");
    assert.equal(treeItem.contextValue, "signedinM365");
    assert.equal(treeItem.command, undefined);
  });

  it("accessibility test for m365 node", async () => {
    mockValue(globalVariables, "tools", new MockTools());
    vi.spyOn(
      globalVariables.tools.tokenProvider.m365TokenProvider,
      "getAccessToken"
    ).mockResolvedValue(ok(""));
    const m365Node = new M365AccountNode(eventEmitter);
    await m365Node.setSignedIn("test upn", "");
    const treeItem = await m365Node.getTreeItem();

    assert.equal(
      treeItem.accessibilityInformation?.label,
      "test upn. " + localize("teamstoolkit.accountTree.m365AccountTooltip")
    );

    m365Node.label = undefined;
    const treeItem2 = await m365Node.getTreeItem();
    assert.equal(
      treeItem2.accessibilityInformation?.label,
      ". " + localize("teamstoolkit.accountTree.m365AccountTooltip")
    );

    m365Node.label = { label: "test label" };
    const treeItem3 = await m365Node.getTreeItem();
    assert.equal(
      treeItem3.accessibilityInformation?.label,
      "test label. " + localize("teamstoolkit.accountTree.m365AccountTooltip")
    );
  });

  it("setSignedIn - multitenant", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    mockValue(globalVariables, "tools", new MockTools());
    vi.spyOn(
      globalVariables.tools.tokenProvider.m365TokenProvider,
      "getAccessToken"
    ).mockResolvedValue(ok("test-token"));
    vi.spyOn(tool, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
      },
    ]);

    const m365Node = new M365AccountNode(eventEmitter);
    await m365Node.setSignedIn("test upn", "0022fd51-06f5-4557-8a34-69be98de6e20");
    const treeItem = await m365Node.getTreeItem();

    assert.equal(treeItem.iconPath, m365Icon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.label, "test upn (MSFT)");
    assert.equal(treeItem.contextValue, "signedinM365");
    assert.equal(treeItem.command, undefined);
  });

  it("setSigningIn", async () => {
    const m365Node = new M365AccountNode(eventEmitter);
    m365Node.setSigningIn();
    const treeItem = await m365Node.getTreeItem();

    assert.equal(treeItem.iconPath, loadingIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "");
  });

  it("setSignedOut", async () => {
    const m365Node = new M365AccountNode(eventEmitter);
    m365Node.status = AccountItemStatus.SignedIn;
    await m365Node.setSignedOut();
    const treeItem = await m365Node.getTreeItem();

    assert.equal(treeItem.iconPath, m365Icon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "signinM365");
  });

  it("setSwitching", async () => {
    const m365Node = new M365AccountNode(eventEmitter);
    m365Node.setSwitching();
    const treeItem = await m365Node.getTreeItem();

    assert.equal(treeItem.iconPath, loadingIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "");
  });

  it("getChildren", () => {
    const m365Node = new M365AccountNode(eventEmitter);
    assert.isDefined(m365Node.getChildren());
  });

  it("updateChecks", () => {
    const m365Node = new M365AccountNode(eventEmitter);
    m365Node.updateChecks("test token", false, false);
    assert.isDefined(m365Node.getChildren());
    assert.equal(2, (m365Node.getChildren() as any).length);
    m365Node.updateChecks("test token", true, false);
    assert.isDefined(m365Node.getChildren());
    assert.equal(2, (m365Node.getChildren() as any).length);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const m365NodeWithCopilot = new M365AccountNode(eventEmitter);
    m365NodeWithCopilot.updateChecks("test token", false, true);
    assert.isDefined(m365NodeWithCopilot.getChildren());
    assert.equal(3, (m365NodeWithCopilot.getChildren() as any).length);
    m365NodeWithCopilot.updateChecks("test token", true, true);
    assert.isDefined(m365NodeWithCopilot.getChildren());
    assert.equal(3, (m365NodeWithCopilot.getChildren() as any).length);
  });
});
