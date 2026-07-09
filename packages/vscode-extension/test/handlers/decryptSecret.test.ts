import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ok, err, UserError } from "@microsoft/teamsfx-api";
import { decryptSecret } from "../../src/handlers/decryptSecret";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { MockCore } from "../mocks/mockCore";
import { vi, expect } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("decryptSecret", function () {
  it("successfully update secret", async () => {
    mockValue(globalVariables, "context", { extensionPath: "" });
    mockValue(globalVariables, "core", new MockCore());
    const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const sendTelemetryErrorEvent = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    const decrypt = vi.spyOn(globalVariables.core, "decrypt");
    const encrypt = vi.spyOn(globalVariables.core, "encrypt");
    vi.spyOn(vscode.commands, "executeCommand");
    const editBuilder = vi.fn();
    vi.spyOn(vscode.window, "activeTextEditor").value({
      edit: function (callback: (eb: any) => void) {
        callback({
          replace: editBuilder,
        });
      },
    });
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      inputText: () => Promise.resolve(ok({ type: "success", result: "inputValue" })),
    });
    const range = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));

    await decryptSecret("test", range);

    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(editBuilder).toHaveBeenCalledTimes(1);
    expect(sendTelemetryEvent).toHaveBeenCalledTimes(2);
    expect(sendTelemetryErrorEvent).not.toHaveBeenCalled();
  });

  it("no active editor", async () => {
    mockValue(globalVariables, "context", { extensionPath: "" });
    mockValue(globalVariables, "core", new MockCore());
    const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const decrypt = vi.spyOn(globalVariables.core, "decrypt");
    vi.spyOn(vscode.commands, "executeCommand");
    vi.spyOn(vscode.window, "activeTextEditor");
    const range = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));

    await decryptSecret("test", range);

    expect(decrypt).not.toHaveBeenCalled();
    expect(sendTelemetryEvent).toHaveBeenCalledTimes(1);
  });

  it("failed to update due to corrupted secret", async () => {
    mockValue(globalVariables, "context", { extensionPath: "" });
    mockValue(globalVariables, "core", new MockCore());
    const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const sendTelemetryErrorEvent = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    const decrypt = vi.spyOn(globalVariables.core, "decrypt");
    decrypt.mockReturnValue(Promise.resolve(err(new UserError("", "fake error", ""))));
    const encrypt = vi.spyOn(globalVariables.core, "encrypt");
    vi.spyOn(vscode.commands, "executeCommand");
    const editBuilder = vi.fn();
    vi.spyOn(vscode.window, "activeTextEditor").value({
      edit: function (callback: (eb: any) => void) {
        callback({
          replace: editBuilder,
        });
      },
    });
    const showMessage = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    const range = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));

    await decryptSecret("test", range);

    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(encrypt).not.toHaveBeenCalled();
    expect(editBuilder).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledTimes(1);
    expect(sendTelemetryEvent).toHaveBeenCalledTimes(1);
    expect(sendTelemetryErrorEvent).toHaveBeenCalledTimes(1);
  });

  it("failed to encrypt secret", async () => {
    mockValue(globalVariables, "context", { extensionPath: "" });
    mockValue(globalVariables, "core", new MockCore());
    const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const sendTelemetryErrorEvent = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    const decrypt = vi.spyOn(globalVariables.core, "decrypt");
    const encrypt = vi
      .spyOn(globalVariables.core, "encrypt")
      .mockResolvedValue(err(new UserError("", "fake error", "")));
    vi.spyOn(vscode.commands, "executeCommand");
    const editBuilder = vi.fn();
    vi.spyOn(vscode.window, "activeTextEditor").value({
      edit: function (callback: (eb: any) => void) {
        callback({
          replace: editBuilder,
        });
      },
    });
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      inputText: () => Promise.resolve(ok({ type: "success", result: "inputValue" })),
    });
    const range = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));

    await decryptSecret("test", range);

    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(editBuilder).not.toHaveBeenCalled();
    expect(sendTelemetryEvent).toHaveBeenCalledTimes(1);
    expect(sendTelemetryErrorEvent).toHaveBeenCalledTimes(1);
    expect(sendTelemetryErrorEvent.getCall(0).args[0]).to.contain("edit-secret");
  });
});
