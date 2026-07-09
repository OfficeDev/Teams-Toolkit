import { vi, assert } from "vitest";

import { TreeViewCommand } from "../../src/treeview/treeViewCommand";
import { CommandsTreeViewProvider } from "../../src/treeview/commandsTreeViewProvider";

describe("CommandsTreeViewProvider", () => {
  it("getCommands", async () => {
    const provider = new CommandsTreeViewProvider([new TreeViewCommand("test", "test")]);
    const commands = provider.getCommands();

    assert.equal(commands.length, 1);
    assert.equal(commands[0].label, "test");
  });

  it("getTreeItem", async () => {
    const provider = new CommandsTreeViewProvider([]);
    const command = provider.getTreeItem(new TreeViewCommand("test", "test"));

    assert.equal(command.label, "test");
  });

  it("getChildren", async () => {
    const provider = new CommandsTreeViewProvider([new TreeViewCommand("test", "test")]);
    const commands = await provider.getChildren();

    assert.equal(commands.length, 1);
    assert.equal(commands[0].label, "test");
  });

  it("accessibility tests", async () => {
    const provider = new CommandsTreeViewProvider([]);
    const command = new TreeViewCommand("testLabel", "testTooltip");
    let treeItem = provider.getTreeItem(command);

    assert.equal(treeItem.accessibilityInformation?.label, "testLabel. testTooltip");

    command.label = undefined;
    command.tooltip = undefined;
    treeItem = provider.getTreeItem(command);
    assert.equal(treeItem.accessibilityInformation?.label, ".");

    command.label = { label: "testLabel" };
    command.tooltip = { value: "testTooltip" } as any;
    treeItem = provider.getTreeItem(command);
    assert.equal(treeItem.accessibilityInformation?.label, "testLabel. testTooltip");
  });
});
