import * as vscode from "vscode";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";
import { errorIcon, infoIcon, passIcon } from "../../../src/treeview/account/common";
import { SideloadingNode } from "../../../src/treeview/account/sideloadingNode";
import { DynamicNode } from "../../../src/treeview/dynamicNode";
import * as checkAccessCallback from "../../../src/handlers/accounts/checkAccessCallback";
import { featureFlagManager, GraphClient } from "@microsoft/teamsfx-core";
import { vi, assert } from "vitest";

describe("sideloadingNode", () => {
  const eventEmitter = new vscode.EventEmitter<DynamicNode | undefined | void>();

  it("getTreeItem with empty string", async () => {
    const sideloadingNode = new SideloadingNode(eventEmitter, "");
    const treeItem = await sideloadingNode.getTreeItem();

    assert.equal(treeItem.iconPath, infoIcon);
  });

  it("getTreeItem with invalid token", async () => {
    vi.spyOn(tools, "getSideloadingStatus").mockReturnValue(Promise.resolve(false));
    vi.spyOn(checkAccessCallback, "checkSideloadingCallback").mockResolvedValue(undefined as never);
    const sideloadingNode = new SideloadingNode(eventEmitter, "token");
    const treeItem = await sideloadingNode.getTreeItem();

    assert.equal(treeItem.iconPath, errorIcon);
  });

  it("getTreeItem with valid token", async () => {
    vi.spyOn(tools, "getSideloadingStatus").mockReturnValue(Promise.resolve(true));
    const sideloadingNode = new SideloadingNode(eventEmitter, "token");
    const treeItem = await sideloadingNode.getTreeItem();

    assert.equal(treeItem.iconPath, passIcon);
  });

  it("getChildren", () => {
    const sideloadingNode = new SideloadingNode(eventEmitter, "token");
    assert.isNull(sideloadingNode.getChildren());
  });

  it("Check sandbox permission", async () => {
    vi.spyOn(tools, "getSideloadingStatus").mockReturnValue(Promise.resolve(false));
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    vi.spyOn(GraphClient.prototype, "GetTeamsAppSettingsAsync").mockResolvedValue({
      sandboxingConfiguration: {
        isSideloadingEnabled: false,
        sensitivityLabelUsedToIdentifySandboxedContainers: "0fcfd0ff-1cda-407e-bc2b-a350307bd1d5",
      },
    });
    vi.spyOn(checkAccessCallback, "checkSandboxCallback").mockResolvedValue(undefined as never);
    const sideloadingNode = new SideloadingNode(eventEmitter, "token");
    const treeItem = await sideloadingNode.getTreeItem();

    assert.equal(treeItem.iconPath, errorIcon);
  });

  it("Check sandbox permission - disabled", async () => {
    vi.spyOn(tools, "getSideloadingStatus").mockReturnValue(Promise.resolve(false));
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    vi.spyOn(GraphClient.prototype, "GetTeamsAppSettingsAsync").mockResolvedValue({
      sandboxingConfiguration: {
        isSideloadingEnabled: false,
        sensitivityLabelUsedToIdentifySandboxedContainers: "",
      },
    });
    vi.spyOn(checkAccessCallback, "checkSideloadingCallback").mockResolvedValue(undefined as never);
    const sideloadingNode = new SideloadingNode(eventEmitter, "token");
    const treeItem = await sideloadingNode.getTreeItem();

    assert.equal(treeItem.iconPath, errorIcon);
  });
});
