// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IProgressHandler } from "@microsoft/teamsfx-api";
import { LocalEnvManager } from "@microsoft/teamsfx-core";
import { createTaskStopCb } from "../../../../src/cmds/preview/commonUtils";
import cliLogger from "../../../../src/commonlib/log";
import cliTelemetry from "../../../../src/telemetry/cliTelemetry";
import { expect } from "../../utils";
import { vi } from "vitest";
describe("commonUtils createTaskStopCb npm install", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("npm install failure path", async () => {
    const getNpmInstallLogInfoStub = vi.spyOn(LocalEnvManager.prototype, "getNpmInstallLogInfo");
    getNpmInstallLogInfoStub.mockResolvedValue({
      cwd: "c:/tmp/app",
      exitCode: 1,
      timestamp: new Date(),
      nodeVersion: "18.0.0",
      npmVersion: "9.0.0",
      errorMessage: "install failed",
    });
    vi.spyOn(cliTelemetry, "sendTelemetryErrorEvent").mockImplementation(() => {});
    vi.spyOn(cliLogger, "necessaryLog").mockImplementation(() => {});

    const progressHandler = vi.mockObject(new MockProgressHandler());
    const taskStopCallback = createTaskStopCb(progressHandler, { k: "v" });
    await taskStopCallback("npm install", false, {
      command: "command",
      success: false,
      stdout: [],
      stderr: [],
      exitCode: 1,
    });
    expect(progressHandler.end.mock.calls.length === 1).to.be.true;
    expect(getNpmInstallLogInfoStub.mock.calls.length === 1).to.be.true;
  });
});

class MockProgressHandler implements IProgressHandler {
  start(detail?: string): Promise<void> {
    return Promise.resolve();
  }
  next(detail?: string): Promise<void> {
    return Promise.resolve();
  }
  end(success: boolean): Promise<void> {
    return Promise.resolve();
  }
}
