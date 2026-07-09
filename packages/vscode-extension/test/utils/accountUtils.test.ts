import * as vscode from "vscode";
import { AzureAccountManager } from "../../src/commonlib/azureLogin";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { signOutM365, signOutAzure, signInAzure, signInM365 } from "../../src/utils/accountUtils";
import envTreeProviderInstance from "../../src/treeview/environmentTreeViewProvider";
import M365TokenInstance from "../../src/commonlib/m365Login";
import { vi, expect, assert } from "vitest";

describe("accountUtils", () => {
  it("signInAzure()", async () => {
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

    await signInAzure();

    assert.isTrue(executeCommandStub.calledOnce);
  });

  it("signInM365()", async () => {
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

    await signInM365();

    assert.isTrue(executeCommandStub.calledOnce);
  });

  it("signOutM365", async () => {
    const signOut = vi.spyOn(M365TokenInstance, "signout").mockResolvedValue(true);
    const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(envTreeProviderInstance, "reloadEnvironments");

    await signOutM365(false);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("signOutAzure", async () => {
    Object.setPrototypeOf(AzureAccountManager, vi.fn());
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockResolvedValue(undefined);
    const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

    await signOutAzure(false);

    expect(showMessageStub).toHaveBeenCalledTimes(1);
  });
});
