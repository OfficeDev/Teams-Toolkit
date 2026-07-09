import { Err, Ok, SystemError } from "@microsoft/teamsfx-api";
import { PackageService } from "@microsoft/teamsfx-core";
import * as vscode from "vscode";
import M365TokenInstance from "../../../src/commonlib/m365Login";
import { infoIcon, passIcon, warningIcon } from "../../../src/treeview/account/common";
import { CopilotNode } from "../../../src/treeview/account/copilotNode";
import { DynamicNode } from "../../../src/treeview/dynamicNode";
import * as checkAccessCallback from "../../../src/handlers/accounts/checkAccessCallback";
import { vi, assert } from "vitest";

describe("copilotNode", () => {
  const eventEmitter = new vscode.EventEmitter<DynamicNode | undefined | void>();

  it("getTreeItem with empty string", async () => {
    const copilotNode = new CopilotNode(eventEmitter, "");
    const treeItem = await copilotNode.getTreeItem();

    assert.equal(treeItem.iconPath, infoIcon);
  });

  it("getTreeItem with check false", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockReturnValue(
      Promise.resolve(new Ok("test-token"))
    );
    vi.spyOn(PackageService, "GetSharedInstance").mockReturnValue(new PackageService("endpoint"));
    vi.spyOn(PackageService.prototype, "getCopilotStatus").mockResolvedValue(false);
    vi.spyOn(checkAccessCallback, "checkCopilotCallback");
    const copilotNode = new CopilotNode(eventEmitter, "token");
    const treeItem = await copilotNode.getTreeItem();

    assert.equal(treeItem.iconPath, warningIcon);
  });

  it("getTreeItem with check true", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockReturnValue(
      Promise.resolve(new Ok("test-token"))
    );
    vi.spyOn(PackageService, "GetSharedInstance").mockReturnValue(new PackageService("endpoint"));
    vi.spyOn(PackageService.prototype, "getCopilotStatus").mockResolvedValue(true);
    const copilotNode = new CopilotNode(eventEmitter, "token");
    const treeItem = await copilotNode.getTreeItem();

    assert.equal(treeItem.iconPath, passIcon);
  });

  it("getTreeItem with check error", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockReturnValue(
      Promise.resolve(new Ok("test-token"))
    );
    vi.spyOn(PackageService, "GetSharedInstance").mockReturnValue(new PackageService("endpoint"));
    vi.spyOn(PackageService.prototype, "getCopilotStatus").mockReturnValue(
      Promise.reject(new Error("test-error"))
    );
    const copilotNode = new CopilotNode(eventEmitter, "token");
    const treeItem = await copilotNode.getTreeItem();

    assert.equal(treeItem.iconPath, infoIcon);
  });

  it("getTreeItem with token error", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockReturnValue(
      Promise.resolve(new Err(new SystemError("test-source", "test-name", "test-error")))
    );
    const copilotNode = new CopilotNode(eventEmitter, "token");
    const treeItem = await copilotNode.getTreeItem();

    assert.equal(treeItem.iconPath, infoIcon);
  });

  it("getTreeItem with empty token", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockReturnValue(Promise.resolve(new Ok("")));
    const copilotNode = new CopilotNode(eventEmitter, "token");
    const treeItem = await copilotNode.getTreeItem();

    assert.equal(treeItem.iconPath, infoIcon);
  });

  it("getChildren", () => {
    const copilotNode = new CopilotNode(eventEmitter, "token");
    assert.isNull(copilotNode.getChildren());
  });
});
