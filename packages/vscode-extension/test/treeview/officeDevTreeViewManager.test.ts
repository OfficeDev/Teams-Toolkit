import * as vscode from "vscode";
import officeDevTreeViewManager from "../../src/treeview/officeDevTreeViewManager";
import { vi, assert } from "vitest";

describe("OfficeDevTreeViewManager", () => {
  it("registerOfficeDevTreeViews", () => {
    officeDevTreeViewManager.registerOfficeDevTreeViews({
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);

    const developmentTreeview = officeDevTreeViewManager.getTreeView(
      "teamsfx-officedev-development"
    );
    assert.isDefined(developmentTreeview);
    assert.equal((developmentTreeview as any).commands.length, 5);

    const lifeCycleTreeview = officeDevTreeViewManager.getTreeView("teamsfx-officedev-lifecycle");
    assert.isDefined(lifeCycleTreeview);
    assert.equal((lifeCycleTreeview as any).commands.length, 2);

    const utilityTreeView = officeDevTreeViewManager.getTreeView("teamsfx-officedev-utility");
    assert.isDefined(utilityTreeView);
    assert.equal((utilityTreeView as any).commands.length, 3);

    const helpAndFeedbackTreeView = officeDevTreeViewManager.getTreeView(
      "teamsfx-officedev-help-and-feedback"
    );
    assert.isDefined(helpAndFeedbackTreeView);
    assert.equal((helpAndFeedbackTreeView as any).commands.length, 4);
  });
});
