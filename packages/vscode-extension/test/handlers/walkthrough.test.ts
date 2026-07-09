import * as vscode from "vscode";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { expect, vi } from "vitest";
import {
  createProjectFromWalkthroughHandler,
  openBuildIntelligentAppsWalkthroughHandler,
} from "../../src/handlers/walkthrough";
import { Inputs, ok } from "@microsoft/teamsfx-api";
import * as systemEnvUtils from "../../src/utils/systemEnvUtils";
import * as sharedOpts from "../../src/handlers/sharedOpts";

describe("walkthrough", () => {
  it("create proejct from walkthrough", async () => {
    const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const inputs = {} as Inputs;
    const systemInputsStub = vi
      .spyOn(systemEnvUtils, "getSystemInputs")
      .mockImplementation(() => inputs);

    const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(null));

    await createProjectFromWalkthroughHandler([
      "walkthrough",
      { "project-type": "custom-copilot-type", capabilities: "cutsom-copilot-agent" },
    ]);

    expect(sendTelemetryEventStub).toHaveBeenCalledTimes(1);
    expect(systemInputsStub).toHaveBeenCalledTimes(1);
    expect(runCommandStub).toHaveBeenCalledTimes(1);

    expect(Object.keys(inputs)).lengthOf(2);
  });

  it("build intelligent apps", async () => {
    const sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const executeCommands = vi.spyOn(vscode.commands, "executeCommand");

    await openBuildIntelligentAppsWalkthroughHandler();
    expect(sendTelemetryEventStub).toHaveBeenCalledTimes(1);
    expect(executeCommands).toHaveBeenCalledTimes(1);
    expect(executeCommands).toHaveBeenCalledWith(
      "workbench.action.openWalkthrough",
      "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps"
    );
  });
});
