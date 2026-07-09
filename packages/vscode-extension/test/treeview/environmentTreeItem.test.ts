import * as vscode from "vscode";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

import { FxError, LoginStatus, ok, Result, SubscriptionInfo } from "@microsoft/teamsfx-api";
import {
  FeatureFlags,
  GraphScopes,
  environmentNameManager,
  featureFlagManager,
} from "@microsoft/teamsfx-core";

import { M365Login } from "../../src/commonlib/m365Login";
import azureAccountManager from "../../src/commonlib/azureLogin";
import * as globalVariables from "../../src/globalVariables";
import { warningIcon } from "../../src/treeview/account/common";
import { DynamicNode } from "../../src/treeview/dynamicNode";
import { EnvironmentNode } from "../../src/treeview/environmentTreeItem";
import * as localizeUtils from "../../src/utils/localizeUtils";
import * as envTreeUtils from "../../src/utils/envTreeUtils";

describe("EnvironmentNode", () => {
  it("getTreeItem for local", async () => {
    const environmentNode = new EnvironmentNode("local");
    vi.spyOn(environmentNode, "getChildren").mockReturnValue(Promise.resolve([]));

    const treeItem = await environmentNode.getTreeItem();

    assert.deepEqual(treeItem.iconPath, new vscode.ThemeIcon("symbol-folder"));
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "local");
  });

  it("getTreeItem for local", async () => {
    const environmentNode = new EnvironmentNode("testtool");
    vi.spyOn(environmentNode, "getChildren").mockReturnValue(Promise.resolve([]));

    const treeItem = await environmentNode.getTreeItem();

    assert.deepEqual(treeItem.iconPath, new vscode.ThemeIcon("symbol-folder"));
    assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.equal(treeItem.contextValue, "testtool");
  });

  it("getChildren returns warning for SPFx project", async () => {
    const environmentNode = new EnvironmentNode("test");
    vi.spyOn(environmentNameManager, "isRemoteEnvironment").mockReturnValue(true);
    vi.spyOn(M365Login.getInstance(), "getStatus").mockReturnValue(
      Promise.resolve<Result<LoginStatus, FxError>>(
        ok({
          status: "SignedIn",
          accountInfo: {
            tid: "test",
          },
        })
      )
    );
    vi.spyOn(envTreeUtils, "getM365TenantFromEnv").mockReturnValue(Promise.resolve("m365TenantId"));
    mockValue(globalVariables, "isSPFxProject", true);
    vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv").mockReturnValue(
      Promise.resolve<SubscriptionInfo | undefined>({
        subscriptionName: "subscriptionName",
        subscriptionId: "subscriptionId",
        tenantId: "tenantId",
      })
    );
    vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => {
      if (key === "teamstoolkit.commandsTreeViewProvider.m365AccountNotMatch") {
        return "test string";
      }
      return "";
    });

    const children = await environmentNode.getChildren();

    assert.equal(children?.length, 2);
    const warningNode = (await (children as DynamicNode[])[0].getTreeItem()) as DynamicNode;
    assert.deepEqual(warningNode.iconPath, warningIcon);
    assert.equal(warningNode.tooltip, "test string");
    assert.equal(warningNode.getChildren(), null);
    assert.equal(warningNode.getTreeItem(), warningNode);
  });

  it("getChildren returns subscription", async () => {
    const environmentNode = new EnvironmentNode("test");
    vi.spyOn(environmentNameManager, "isRemoteEnvironment").mockReturnValue(true);
    vi.spyOn(M365Login.getInstance(), "getStatus").mockReturnValue(
      Promise.resolve<Result<LoginStatus, FxError>>(
        ok({
          status: "SignedIn",
          accountInfo: {
            tid: "test",
          },
        })
      )
    );
    vi.spyOn(envTreeUtils, "getM365TenantFromEnv").mockReturnValue(Promise.resolve("test"));
    mockValue(globalVariables, "isSPFxProject", true);
    vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv").mockReturnValue(
      Promise.resolve<SubscriptionInfo | undefined>({
        subscriptionName: "subscriptionName",
        subscriptionId: "subscriptionId",
        tenantId: "tenantId",
      })
    );
    vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => {
      if (key === "teamstoolkit.envTree.subscriptionTooltip") {
        return "'%s' environment is provisioned in Azure subscription '%s' (ID: %s)";
      }
      return "";
    });
    vi.spyOn(envTreeUtils, "getResourceGroupNameFromEnv").mockReturnValue(
      Promise.resolve("resource group")
    );

    const children = await environmentNode.getChildren();

    assert.equal(children?.length, 1);
    const subscriptionNode = (await (children as DynamicNode[])[0].getTreeItem()) as DynamicNode;
    assert.deepEqual(subscriptionNode.iconPath, new vscode.ThemeIcon("key"));
    assert.equal(subscriptionNode.label, "subscriptionName");
    assert.equal(
      subscriptionNode.tooltip,
      "'test' environment is provisioned in Azure subscription 'subscriptionName' (ID: subscriptionId)"
    );
    assert.equal(subscriptionNode.description, "subscriptionId");
    const subscriptionNodeTreeItem = await subscriptionNode.getTreeItem();
    assert.equal(subscriptionNodeTreeItem, subscriptionNode);

    const subscriptionNodeChildren = await subscriptionNode.getChildren();
    const resourceGroupNode = (subscriptionNodeChildren as DynamicNode[])[0];
    assert.equal(resourceGroupNode.getTreeItem(), resourceGroupNode);
    assert.isNull(resourceGroupNode.getChildren());
  });

  it("checkAccountForEnvironment uses Graph scopes in sovereign high", async () => {
    vi.spyOn(featureFlagManager, "getStringValue").mockReturnValue("GCC H");
    const environmentNode = new EnvironmentNode("test");
    const getStatusStub = vi
      .spyOn(M365Login.getInstance(), "getStatus")
      .mockResolvedValue(ok({ status: "SignedOut", accountInfo: {} } as any));
    mockValue(globalVariables, "isSPFxProject", true);

    await environmentNode.getChildren();

    assert.isTrue(getStatusStub.calledOnceWithExactly({ scopes: GraphScopes }));
  });

  it("getChildren returns cached children", async () => {
    const environmentNode = new EnvironmentNode("test");
    vi.spyOn(environmentNameManager, "isRemoteEnvironment").mockReturnValue(false);

    const children1 = await environmentNode.getChildren();
    const children2 = await environmentNode.getChildren();

    expect(children1).to.equal(children2);
  });

  it("getChildren adds warning when Azure account is not signed in", async () => {
    const environmentNode = new EnvironmentNode("test");
    vi.spyOn(environmentNameManager, "isRemoteEnvironment").mockReturnValue(true);
    vi.spyOn(M365Login.getInstance(), "getStatus").mockResolvedValue(
      ok({
        status: "SignedIn",
        accountInfo: {
          tid: "tenant-id",
        },
      } as LoginStatus)
    );
    vi.spyOn(envTreeUtils, "getM365TenantFromEnv").mockResolvedValue("tenant-id");
    mockValue(globalVariables, "isSPFxProject", false);
    vi.spyOn(azureAccountManager, "getAccountInfo").mockReturnValue(undefined);
    vi.spyOn(envTreeUtils, "getSubscriptionInfoFromEnv").mockResolvedValue(undefined);
    vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => key);

    const children = await environmentNode.getChildren();
    const warningNode = (await (children as DynamicNode[])[0].getTreeItem()) as DynamicNode;

    expect(warningNode).to.not.be.undefined;
    expect(String(warningNode.tooltip)).to.include(
      "teamstoolkit.commandsTreeViewProvider.azureAccountNotSignedIn"
    );
  });
});
