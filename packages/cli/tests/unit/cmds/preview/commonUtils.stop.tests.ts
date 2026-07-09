// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IProgressHandler } from "@microsoft/teamsfx-api";
import { createTaskStopCb } from "../../../../src/cmds/preview/commonUtils";
import { expect } from "../../utils";
import { vi } from "vitest";
describe("commonUtils createTaskStopCb", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path", async () => {
    const progressHandler = vi.mockObject(new MockProgressHandler());
    const taskStopCallback = createTaskStopCb(progressHandler);
    await taskStopCallback("stop", true, {
      command: "command",
      success: true,
      stdout: [],
      stderr: [],
      exitCode: null,
    });
    expect(progressHandler.end.mock.calls.length === 1).to.be.true;
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
