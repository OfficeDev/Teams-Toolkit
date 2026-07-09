import * as vscode from "vscode";
import { UriHandler, setUriEventHandler } from "../../src/uriHandler";
import { TelemetryTriggerFrom } from "../../src/telemetry/extTelemetryEvents";
import { featureFlagManager, FeatureFlags, QuestionNames } from "@microsoft/teamsfx-core";
import { syncManifestHandler } from "../../src/handlers/manifestHandlers";
import * as shared from "../../src/handlers/sharedOpts";
import { err, FxError, Inputs, Result, Stage, UserError, ok } from "@microsoft/teamsfx-api";
import { vi, expect, assert } from "vitest";

describe("uri handler", () => {
  it("invalid uri missing query", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse("vscode://test.test");
    const showMessage = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await handler.handleUri(uri);

    expect(showMessage).toHaveBeenCalledTimes(1);
  });

  it("invalid uri missing referer", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse("vscode://test.test?query=1");
    const showMessage = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await handler.handleUri(uri);

    expect(showMessage).toHaveBeenCalledTimes(1);
  });

  it("invalid uri missing app id", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse("vscode://test.test?test=1&referrer=developerportal");
    const showMessage = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await handler.handleUri(uri);

    expect(showMessage).toHaveBeenCalledTimes(1);
  });

  it("valid uri", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://test.test?appId=1&referrer=developerportal&login_hint=test"
    );

    const executeCommand = vi
      .spyOn(vscode.commands, "executeCommand")
      .mockReturnValue(Promise.resolve(""));
    await handler.handleUri(uri);

    assert.isTrue(executeCommand.calledOnce);
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith("fx-extension.openFromTdp", "1", "test");
  });

  it("error hanlding uri", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://test.test?appId=1&referrer=developerportal&login_hint=test"
    );

    const executeCommand = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    await handler.handleUri(uri);

    assert.isTrue(executeCommand.calledOnce);
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith("fx-extension.openFromTdp", "1", "test");
  });

  it("dev portal running", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://test.test?appId=1&referrer=developerportal&login_hint=test"
    );

    const showMessage = vi.spyOn(vscode.window, "showWarningMessage");
    handler.handleUri(uri);
    // call twice to trigger isRunning logic
    await handler.handleUri(uri);

    assert.isTrue(showMessage.calledOnce);
  });

  it("valid code spaces callback uri", async () => {
    try {
      const handler = new UriHandler();
      const uri = vscode.Uri.parse(
        "vscode://TeamsDevApp.ms-teams-vscode-extension/auth-complete?code=abc"
      );
      await handler.handleUri(uri);
    } catch (e) {
      assert.isTrue(false);
    }
  });

  it("invalid uri missing sampleId", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://TeamsDevApp.ms-teams-vscode-extension?referrer=officedoc"
    );
    const showMessage = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await handler.handleUri(uri);

    expect(showMessage).toHaveBeenCalledTimes(1);
  });

  it("valid designated sample callback uri", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://TeamsDevApp.ms-teams-vscode-extension?referrer=officedoc&sampleId=hello-world-teams-tab-and-outlook-add-in"
    );

    const executeCommand = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    await handler.handleUri(uri);

    assert.isTrue(executeCommand.calledOnce);
    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(
      "fx-extension.openSamples",
      TelemetryTriggerFrom.ExternalUrl,
      "hello-world-teams-tab-and-outlook-add-in"
    );
  });
  it("valid sync manifest uri", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://TeamsDevApp.ms-teams-vscode-extension?referrer=syncmanifest&appId=123"
    );
    const currentFeatureFlag = featureFlagManager.getBooleanValue(FeatureFlags.SyncManifest);
    featureFlagManager.setBooleanValue(FeatureFlags.SyncManifest, true);
    const executeCommand = vi
      .spyOn(vscode.commands, "executeCommand")
      .mockImplementation(async (command: string, ...args: any[]) => {
        await syncManifestHandler(args);
      });
    vi.spyOn(shared, "runCommand").mockImplementation(
      (stage: Stage, inputs: Inputs | undefined): Promise<Result<any, FxError>> => {
        if (inputs && inputs[QuestionNames.TeamsAppId] === "123") {
          return Promise.resolve(ok(undefined));
        }
        return Promise.resolve(err(new UserError("ut", "error", "", "")));
      }
    );
    await handler.handleUri(uri);
    featureFlagManager.setBooleanValue(FeatureFlags.SyncManifest, currentFeatureFlag);
    assert.isTrue(executeCommand.calledOnce);
  });

  it("sync manifest uri, missing app Id", async () => {
    const handler = new UriHandler();
    const currentFeatureFlag = featureFlagManager.getBooleanValue(FeatureFlags.SyncManifest);
    featureFlagManager.setBooleanValue(FeatureFlags.SyncManifest, true);
    const executeCommand = vi.spyOn(vscode.commands, "executeCommand").throws("error");
    const uri = vscode.Uri.parse(
      "vscode://TeamsDevApp.ms-teams-vscode-extension?referrer=syncmanifest"
    );
    await handler.handleUri(uri);

    const uri1 = vscode.Uri.parse(
      "vscode://TeamsDevApp.ms-teams-vscode-extension?referrer=syncmanifest&appId="
    );
    await handler.handleUri(uri1);
    featureFlagManager.setBooleanValue(FeatureFlags.SyncManifest, currentFeatureFlag);
    assert.isTrue(executeCommand.notCalled);
  });

  it("not registered referrer", async () => {
    const handler = new UriHandler();
    const executeCommand = vi.spyOn(vscode.commands, "executeCommand").throws("error");
    const uri = vscode.Uri.parse("vscode://TeamsDevApp.ms-teams-vscode-extension?referrer=fake");
    await handler.handleUri(uri);
    assert.isTrue(executeCommand.notCalled);
  });

  it("set uri handler", async () => {
    const uriHandler = new UriHandler();
    setUriEventHandler(uriHandler);
  });
});
