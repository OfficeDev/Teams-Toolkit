import { vi, assert } from "vitest";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";

import { processUtil } from "../../src/utils/processUtil";
import * as depsCheckerCommon from "../../src/debug/depsChecker/common";
import VsCodeLogInstance from "../../src/commonlib/log";

describe("killProcessesOnPorts", () => {
  beforeEach(() => {
    // Stub the post-kill delay so tests don't wait 1 second.
    vi.spyOn(depsCheckerCommon, "waitAfterKill").mockResolvedValue();
    // Always reset to a fresh stubbed output channel to avoid cross-test stub conflicts.
    VsCodeLogInstance.outputChannel = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as any;
  });

  it("should return 'no-pids' when no PIDs found for ports", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockResolvedValue([]);
    const result = await depsCheckerCommon.killProcessesOnPorts([3978]);
    assert.equal(result, "no-pids");
  });

  it("should kill processes and return 'killed' when user confirms", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockResolvedValue([12345]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Terminate Process" as any);
    const killStub = vi.spyOn(processUtil, "killProcess").mockResolvedValue();

    const result = await depsCheckerCommon.killProcessesOnPorts([3978]);

    assert.equal(result, "killed");
    assert.isTrue(killStub.calledOnceWith(12345));
  });

  it("should return 'cancelled' when user dismisses notification", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockResolvedValue([12345]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined as any);
    const killStub = vi.spyOn(processUtil, "killProcess");

    const result = await depsCheckerCommon.killProcessesOnPorts([3978]);

    assert.equal(result, "cancelled");
    assert.isTrue(killStub.notCalled);
  });

  it("should return 'copilot' when user clicks Resolve with Copilot Chat", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockResolvedValue([12345]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      "Resolve with Copilot Chat" as any
    );
    const killStub = vi.spyOn(processUtil, "killProcess");

    const result = await depsCheckerCommon.killProcessesOnPorts([3978]);

    assert.equal(result, "copilot");
    assert.isTrue(killStub.notCalled);
  });

  it("should deduplicate PIDs across multiple ports", async () => {
    const getStub = vi.spyOn(processUtil, "getProcessIdsByPort");
    getStub.withArgs(3978).mockResolvedValue([12345]);
    getStub.withArgs(9239).mockResolvedValue([12345, 67890]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Terminate Process" as any);
    const killStub = vi.spyOn(processUtil, "killProcess").mockResolvedValue();

    const result = await depsCheckerCommon.killProcessesOnPorts([3978, 9239]);

    assert.equal(result, "killed");
    assert.equal(killStub.callCount, 2);
    const killedPids = killStub.getCalls().map((c) => c.args[0]);
    assert.includeMembers(killedPids, [12345, 67890]);
  });

  it("should return 'no-pids' and log warning when an exception occurs", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockRejectedValue(new Error("unexpected failure"));
    const warnStub = vi.spyOn(VsCodeLogInstance, "warning");

    const result = await depsCheckerCommon.killProcessesOnPorts([3978]);

    assert.equal(result, "no-pids");
    assert.isTrue(warnStub.calledOnce);
    assert.include(warnStub.firstCall.args[0], "unexpected failure");
  });

  it("should return 'no-pids' and log warning when killProcess throws", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockResolvedValue([12345]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Terminate Process" as any);
    vi.spyOn(processUtil, "killProcess").mockRejectedValue(new Error("kill failed"));
    const warnStub = vi.spyOn(VsCodeLogInstance, "warning");

    const result = await depsCheckerCommon.killProcessesOnPorts([3978]);

    assert.equal(result, "no-pids");
    assert.isTrue(warnStub.calledOnce);
  });

  it("should log port conflict details to output channel", async () => {
    vi.spyOn(processUtil, "getProcessIdsByPort").mockResolvedValue([12345]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Terminate Process" as any);
    vi.spyOn(processUtil, "killProcess").mockResolvedValue();
    const appendStub = VsCodeLogInstance.outputChannel.appendLine as ReturnType<typeof vi.spyOn>;

    await depsCheckerCommon.killProcessesOnPorts([3978]);

    const logCall = appendStub
      .getCalls()
      .find((c) => (c.args[0] as string).includes("[Port Conflict]"));
    assert.isDefined(logCall);
    assert.include(logCall!.args[0] as string, "3978");
    assert.include(logCall!.args[0] as string, "12345");
  });
});
