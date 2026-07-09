import { TeamsAppManifest, ok } from "@microsoft/teamsfx-api";
import { featureFlagManager, manifestUtils } from "@microsoft/teamsfx-core";
import { assert, vi } from "vitest";
import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { CommandsTreeViewProvider } from "../../src/treeview/commandsTreeViewProvider";
import treeViewManager from "../../src/treeview/treeViewManager";
import * as commonUtils from "../../src/utils/commonUtils";
import { mockValue } from "../mocks/vitestMockUtils";

describe("TreeViewManager", () => {
  it("registerTreeViews", () => {
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);
    assert.isDefined(treeViewManager.getTreeView("teamsfx-accounts"));

    const lifecycleTreeView = treeViewManager.getTreeView("teamsfx-lifecycle");
    assert.isDefined(lifecycleTreeView);
    assert.equal((lifecycleTreeView as any).commands.length, 3);
    assert.equal((lifecycleTreeView as any).commands[0].commandId, "fx-extension.provision");
  });

  it("Development Treeview", () => {
    mockValue(globalVariables, "context", { extensionPath: "" });
    mockValue(globalVariables, "isSPFxProject", false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeview = treeViewManager.getTreeView("teamsfx-development");
    assert.isDefined(developmentTreeview);
    assert.equal((developmentTreeview as any).commands.length, 4);
  });

  it("Development Treeview when HideGitHubCopilotPreviewTag is enabled", () => {
    mockValue(globalVariables, "context", { extensionPath: "" });
    mockValue(globalVariables, "isSPFxProject", false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeview = treeViewManager.getTreeView("teamsfx-development");
    assert.isDefined(developmentTreeview);
    assert.equal((developmentTreeview as any).commands.length, 5);
  });

  it("Development Treeview when enable extend MetaOS to DA", () => {
    mockValue(globalVariables, "isMetaOSAddinProject", true);
    mockValue(globalVariables, "isDeclarativeCopilotApp", false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);

    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeview = treeViewManager.getTreeView("teamsfx-development");
    assert.isDefined(developmentTreeview);
    assert.equal((developmentTreeview as any).commands.length, 5);
  });

  it("setRunningCommand", () => {
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);
    const command = (treeViewManager as any).commandMap.get("fx-extension.create");
    const setStatusStub = vi.spyOn(command, "setStatus");
    treeViewManager.setRunningCommand("fx-extension.create", ["fx-extension.openSamples"]);

    assert.equal(setStatusStub.callCount, 1);

    treeViewManager.restoreRunningCommand(["fx-extension.openSamples"]);
    assert.equal(setStatusStub.callCount, 2);
  });

  it("updateDevelopmentTreeView", () => {
    mockValue(globalVariables, "isSPFxProject", false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeviewProvider = treeViewManager.getTreeView(
      "teamsfx-development"
    ) as CommandsTreeViewProvider;

    const commands = developmentTreeviewProvider.getCommands();
    assert.equal(commands.length, 4);

    mockValue(globalVariables, "isSPFxProject", true);
    treeViewManager.updateDevelopmentTreeView();

    assert.equal(commands.length, 5);
  });

  it("updateTreeViewsByContent if remove project related commands", async () => {
    mockValue(globalVariables, "workspaceUri", "");
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(ok({} as TeamsAppManifest));
    vi.spyOn(manifestUtils, "getCapabilities").mockReturnValue(["tab"]);
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeviewProvider = treeViewManager.getTreeView(
      "teamsfx-development"
    ) as CommandsTreeViewProvider;

    const utilityTreeviewProvider = treeViewManager.getTreeView(
      "teamsfx-utility"
    ) as CommandsTreeViewProvider;

    await treeViewManager.updateTreeViewsByContent(true);
    const developmentCommands = developmentTreeviewProvider.getCommands();
    const utilityCommands = utilityTreeviewProvider.getCommands();
    assert.equal(developmentCommands.length, 3);
    assert.equal(utilityCommands.length, 3);
  });

  it("updateTreeViewsByContent if remove project related commands when HideGitHubCopilotPreviewTag is enabled", async () => {
    mockValue(globalVariables, "workspaceUri", "");
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(ok({} as TeamsAppManifest));
    vi.spyOn(manifestUtils, "getCapabilities").mockReturnValue(["tab"]);
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeviewProvider = treeViewManager.getTreeView(
      "teamsfx-development"
    ) as CommandsTreeViewProvider;

    const developmentCommands = developmentTreeviewProvider.getCommands();
    const utilityTreeviewProvider = treeViewManager.getTreeView(
      "teamsfx-utility"
    ) as CommandsTreeViewProvider;
    const utilityCommands = utilityTreeviewProvider.getCommands();
    assert.equal(developmentCommands.length, 5);
    assert.equal(utilityCommands.length, 3);

    await treeViewManager.updateTreeViewsByContent(true);
    assert.equal(developmentCommands.length, 4);
    assert.equal(utilityCommands.length, 3);
  });

  it("updateTreeViewsByContent when adaptiveCardInWorkspace is enabled", async () => {
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeviewProvider = treeViewManager.getTreeView(
      "teamsfx-development"
    ) as CommandsTreeViewProvider;

    const commands = developmentTreeviewProvider.getCommands();
    assert.equal(commands.length, 4);

    vi.spyOn(commonUtils, "hasAdaptiveCardInWorkspace").mockReturnValue(Promise.resolve(true));
    await treeViewManager.updateTreeViewsByContent();

    assert.equal(commands.length, 5);
  });

  it("Development Treeview when Add knowledge is enabled", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    mockValue(globalVariables, "isDeclarativeCopilotApp", true);
    treeViewManager.registerTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeview = treeViewManager.getTreeView("teamsfx-development");
    assert.isDefined(developmentTreeview);
    assert.equal((developmentTreeview as any).commands.length, 9);
  });
});
