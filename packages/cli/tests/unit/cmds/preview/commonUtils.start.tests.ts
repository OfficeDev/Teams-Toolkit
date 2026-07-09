// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IProgressHandler } from "@microsoft/teamsfx-api";
import { createTaskStartCb } from "../../../../src/cmds/preview/commonUtils";
import { expect } from "../../utils";
import { vi } from "vitest";
describe("commonUtils createTaskStartCb", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path", async () => {
    const progressHandler = vi.mockObject(new MockProgressHandler());
    const taskStartCallback = createTaskStartCb(progressHandler, "start message");
    await taskStartCallback("start", true);
    expect(progressHandler.start.mock.calls.length === 1).to.be.true;
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
