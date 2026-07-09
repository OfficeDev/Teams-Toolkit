import { vi, assert } from "vitest";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Ning Tang <nintan@microsoft.com>
 */
import * as vscode from "vscode";
import { ok } from "@microsoft/teamsfx-api";

import commandController from "../../src/commandController";
import TreeViewManagerInstance from "../../src/treeview/treeViewManager";

describe("Command Controller", () => {
  it("directly call command callback", async () => {
    const commandName = "fx-extension.provision";
    const commandCallback = vi.fn().mockResolvedValue(ok(undefined));

    commandController.registerCommand(commandName, commandCallback);
    await commandController.runCommand(commandName, []);

    assert.isTrue(commandCallback.calledOnce);
  });

  it("refresh UI when receiving lock events", async () => {
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
    const setRunningCommandStub = vi.spyOn(TreeViewManagerInstance, "setRunningCommand");

    await commandController.lockedByOperation("provisionResources");

    assert.isTrue(
      executeCommandStub.calledOnceWithExactly("setContext", "fx-extension.commandLocked", true)
    );
    assert.isTrue(setRunningCommandStub.calledOnce);
  });

  it("refresh UI when receiving unlock events", async () => {
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
    const restoreRunningCommandStub = vi.spyOn(TreeViewManagerInstance, "restoreRunningCommand");

    await commandController.unlockedByOperation("provisionResources");

    assert.isTrue(
      executeCommandStub.calledOnceWithExactly("setContext", "fx-extension.commandLocked", false)
    );
    assert.isTrue(restoreRunningCommandStub.calledOnce);
  });
});
