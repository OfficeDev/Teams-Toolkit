import * as vscode from "vscode";
import { vi, assert } from "vitest";

import { CommandStatus, TreeViewCommand } from "../../src/treeview/treeViewCommand";
import * as localizeUtils from "../../src/utils/localizeUtils";

describe("TreeViewCommand", () => {
  it("setStatus", async () => {
    vi.spyOn(localizeUtils, "localize").mockImplementation((key: string) => {
      if (key === "teamstoolkit.commandsTreeViewProvider.key.running") {
        return "test running";
      } else if (key === "teamstoolkit.commandsTreeViewProvider.key.blockTooltip") {
        return "blocked tooltip";
      }
      return "";
    });

    const command = new TreeViewCommand("label", "tooltip", "command", "key");

    command.setStatus(CommandStatus.Ready);
    assert.equal(command.label, "label");
    assert.equal(command.tooltip, "tooltip");

    command.setStatus(CommandStatus.Running);
    assert.equal(command.label, "test running");
    assert.deepEqual(command.iconPath, new vscode.ThemeIcon("loading~spin"));

    command.setStatus(CommandStatus.Blocked, command.getBlockingTooltip());
    assert.equal(command.tooltip, "blocked tooltip");
  });
});
