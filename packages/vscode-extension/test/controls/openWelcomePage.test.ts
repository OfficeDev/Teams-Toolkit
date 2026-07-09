import * as vscode from "vscode";
import { vi, assert } from "vitest";
import { openWelcomePageAfterExtensionInstallation } from "../../src/controls/openWelcomePage";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as teamsfxCore from "@microsoft/teamsfx-core";

describe("openWelcomePageAfterExtensionInstallation()", () => {
  it("will not open welcome page if shown before", async () => {
    vi.spyOn(teamsfxCore, "globalStateGet").mockResolvedValue(true);
    const globalStateUpdateStub = vi
      .spyOn(teamsfxCore, "globalStateUpdate")
      .mockResolvedValue(undefined as any);

    await openWelcomePageAfterExtensionInstallation();

    assert.isTrue(globalStateUpdateStub.notCalled);
  });

  it("opens welcome page if not shown before", async () => {
    vi.spyOn(teamsfxCore, "globalStateGet").mockResolvedValue(false);
    const globalStateUpdateStub = vi
      .spyOn(teamsfxCore, "globalStateUpdate")
      .mockResolvedValue(undefined as any);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

    await openWelcomePageAfterExtensionInstallation();

    assert.isTrue(globalStateUpdateStub.calledOnce);
    assert.isTrue(executeCommandStub.calledTwice);
  });
});
