import * as globalVariables from "../../src/globalVariables";
import * as vscode from "vscode";
import { err, Inputs, Platform, Stage, SystemError } from "@microsoft/teamsfx-api";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { MockCore } from "../mocks/mockCore";
import { downloadSample, downloadSampleApp } from "../../src/handlers/downloadSample";
import { TelemetryTriggerFrom } from "../../src/telemetry/extTelemetryEvents";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("downloadSampleApp", () => {
  beforeEach(() => {
    vi.spyOn(globalState, "globalStateUpdate").mockResolvedValue(undefined as any);
  });

  it("happy path", async () => {
    vi.spyOn(globalVariables, "checkIsSPFx").mockReturnValue(false);
    vi.spyOn(vscode.commands, "executeCommand");
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const errorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    const createProject = vi.spyOn(globalVariables.core, "createSampleProject");

    await downloadSampleApp(TelemetryTriggerFrom.CopilotChat, "test");

    assert.isTrue(createProject.calledOnce);
    assert.isTrue(errorEventStub.notCalled);
  });

  it("has error", async () => {
    vi.spyOn(globalVariables, "checkIsSPFx").mockReturnValue(false);
    vi.spyOn(vscode.commands, "executeCommand");
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const errorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    vi.spyOn(projectSettingsHelper, "isValidOfficeAddInProject").mockReturnValue(false);
    vi.spyOn(globalVariables.core, "createSampleProject").mockRejectedValue(
      err(new Error("Cannot get user login information"))
    );

    await downloadSampleApp(TelemetryTriggerFrom.CopilotChat, "test");

    assert.isTrue(errorEventStub.calledOnce);
  });
});

describe("DownloadSample", () => {
  it("downloadSample", async () => {
    const inputs: Inputs = {
      scratch: "no",
      platform: Platform.VSCode,
    };
    mockValue(globalVariables, "core", new MockCore());
    const createProject = vi.spyOn(globalVariables.core, "createSampleProject");

    await downloadSample(inputs);

    inputs.stage = Stage.create;
    assert.isTrue(createProject.calledOnceWith(inputs));
  });

  it("downloadSample - error", async () => {
    const inputs: Inputs = {
      scratch: "no",
      platform: Platform.VSCode,
    };
    mockValue(globalVariables, "core", new MockCore());
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(undefined);
    const createProject = vi
      .spyOn(globalVariables.core, "createSampleProject")
      .mockRejectedValue(err(new Error("Cannot get user login information")));

    await downloadSample(inputs);

    inputs.stage = Stage.create;
    assert.isTrue(createProject.calledOnceWith(inputs));
    assert.isTrue(showErrorMessageStub.calledOnce);
  });

  it("downloadSample - LoginFailureError", async () => {
    const inputs: Inputs = {
      scratch: "no",
      platform: Platform.VSCode,
    };
    mockValue(globalVariables, "core", new MockCore());
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(undefined);
    const createProject = vi
      .spyOn(globalVariables.core, "createProject")
      .mockResolvedValue(err(new SystemError("test", "test", "Cannot get user login information")));

    await downloadSample(inputs);
  });
});
