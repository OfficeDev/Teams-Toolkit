import * as vscode from "vscode";
import { vi, assert } from "vitest";

import { AzureAccountManager } from "../../../src/commonlib/azureLogin";
import { AzureAccountNode } from "../../../src/treeview/account/azureNode";
import { AccountItemStatus, azureIcon, loadingIcon } from "../../../src/treeview/account/common";
import { DynamicNode } from "../../../src/treeview/dynamicNode";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";
import { localize } from "../../../src/utils/localizeUtils";

describe("AzureNode", () => {
  const eventEmitter = new vscode.EventEmitter<DynamicNode | undefined | void>();

  before(() => {
    Object.setPrototypeOf(AzureAccountManager, vi.fn());
  });

  it("setSignedIn", async () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    await azureNode.setSignedIn("", "", "test upn");
    const treeItem = await azureNode.getTreeItem();

    assert.equal(treeItem.iconPath, azureIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.label, "test upn");
    assert.equal(treeItem.contextValue, "signedinAzure");
    assert.equal(treeItem.command, undefined);
  });

  it("setSignedIn with same account", async () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    await azureNode.setSignedIn("", "", "test upn");
    await azureNode.setSignedIn("", "", "test upn");
    const treeItem = await azureNode.getTreeItem();

    assert.equal(treeItem.iconPath, azureIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.label, "test upn");
    assert.equal(treeItem.contextValue, "signedinAzure");
    assert.equal(treeItem.command, undefined);
  });

  it("setSignedIn with different account", async () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    await azureNode.setSignedIn("", "", "test upn");
    await azureNode.setSignedIn("", "", "test upn2");
    const treeItem = await azureNode.getTreeItem();

    assert.equal(treeItem.iconPath, azureIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.label, "test upn2");
    assert.equal(treeItem.contextValue, "signedinAzure");
    assert.equal(treeItem.command, undefined);
  });

  it("setSignedIn with multi-tenant", async () => {
    vi.spyOn(tools, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
      },
    ]);
    const azureNode = new AzureAccountNode(eventEmitter);
    await azureNode.setSignedIn("token", "0022fd51-06f5-4557-8a34-69be98de6e20", "test upn");
    const treeItem = await azureNode.getTreeItem();

    assert.equal(treeItem.iconPath, azureIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.label, "test upn (MSFT)");
    assert.equal(treeItem.contextValue, "signedinAzure");
    assert.equal(treeItem.command, undefined);
  });

  it("setSigningIn", async () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    azureNode.setSigningIn();
    const treeItem = await azureNode.getTreeItem();

    assert.equal(treeItem.iconPath, loadingIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "");
  });

  it("setSignedOut", async () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    azureNode.status = AccountItemStatus.SignedIn;
    await azureNode.setSignedOut();
    const treeItem = await azureNode.getTreeItem();

    assert.equal(treeItem.iconPath, azureIcon);
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "signinAzure");
  });

  it("getChildren", () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    assert.isNull(azureNode.getChildren());
  });

  it("accessibility test for azure node", async () => {
    const azureNode = new AzureAccountNode(eventEmitter);
    await azureNode.setSignedIn("token", "", "test upn");
    const treeItem = await azureNode.getTreeItem();

    assert.equal(
      treeItem.accessibilityInformation?.label,
      "test upn. " + localize("teamstoolkit.accountTree.azureAccountTooltip")
    );

    azureNode.label = undefined;
    const treeItem2 = await azureNode.getTreeItem();
    assert.equal(
      treeItem2.accessibilityInformation?.label,
      ". " + localize("teamstoolkit.accountTree.azureAccountTooltip")
    );

    azureNode.label = { label: "test label" };
    const treeItem3 = await azureNode.getTreeItem();
    assert.equal(
      treeItem3.accessibilityInformation?.label,
      "test label. " + localize("teamstoolkit.accountTree.azureAccountTooltip")
    );
  });
});
