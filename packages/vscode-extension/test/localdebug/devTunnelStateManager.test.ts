import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Xiaofu Huang <xiaofhua@microsoft.com>
 */
import fs from "fs-extra";
import path from "path";
import * as uuid from "uuid";
import * as vscode from "vscode";
import { DevTunnelStateManager } from "../../src/debug/taskTerminal/utils/devTunnelStateManager";
import * as globalVariables from "../../src/globalVariables";

describe("devTunnelStateManager", () => {
  const baseDir = path.resolve(__dirname, "data", "devTunnelStateManager");
  beforeEach(async () => {
    const filePath = path.resolve(baseDir, uuid.v4().substring(0, 6));
    await fs.ensureDir(filePath);
    mockValue(globalVariables, "workspaceUri", vscode.Uri.parse(filePath));
    mockValue(process, "env", { TEAMSFX_DEV_TUNNEL_TEST: "true" });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(baseDir);
  });

  it("happy path", async () => {
    const devTunnelStateManager = DevTunnelStateManager.create();
    let states = await devTunnelStateManager.listDevTunnelStates();
    assert.isEmpty(states);
    await devTunnelStateManager.setTunnelState({
      tunnelId: "id1",
      clusterId: "cluster1",
      sessionId: "test-session",
    });
    states = await devTunnelStateManager.listDevTunnelStates();
    assert.deepEqual(states, [
      { tunnelId: "id1", clusterId: "cluster1", sessionId: "test-session" },
    ]);
    await devTunnelStateManager.setTunnelState({
      tunnelId: "id2",
      clusterId: "cluster2",
      sessionId: "test-session",
    });
    states = await devTunnelStateManager.listDevTunnelStates();
    assert.deepEqual(states, [
      { tunnelId: "id1", clusterId: "cluster1", sessionId: "test-session" },
      { tunnelId: "id2", clusterId: "cluster2", sessionId: "test-session" },
    ]);
    await devTunnelStateManager.deleteTunnelState({ tunnelId: "id1", clusterId: "cluster1" });
    states = await devTunnelStateManager.listDevTunnelStates();
    assert.deepEqual(states, [
      { tunnelId: "id2", clusterId: "cluster2", sessionId: "test-session" },
    ]);
    await devTunnelStateManager.deleteTunnelState({ tunnelId: "id2", clusterId: "cluster2" });
    states = await devTunnelStateManager.listDevTunnelStates();
    assert.isEmpty(states);
  });

  it("concurrency", async () => {
    const randomOperation = async () => {
      const testData = {
        tunnelId: "id-" + uuid.v4(),
        clusterId: "cluster-" + uuid.v4(),
        sessionId: uuid.v4(),
      };
      const devTunnelStateManager = DevTunnelStateManager.create();
      await devTunnelStateManager.setTunnelState(testData);
      let states = await devTunnelStateManager.listDevTunnelStates();
      assert.deepInclude(states, testData);
      await devTunnelStateManager.deleteTunnelState(testData);
      states = await devTunnelStateManager.listDevTunnelStates();
      assert.notInclude(states, testData);
    };

    const promises = [randomOperation(), randomOperation(), randomOperation()];
    await Promise.all(promises);
  });

  it("delete a non-existent item", async () => {
    const devTunnelStateManager = DevTunnelStateManager.create();
    let states = await devTunnelStateManager.listDevTunnelStates();
    assert.isEmpty(states);
    await devTunnelStateManager.deleteTunnelState({ tunnelId: "id1", clusterId: "cluster1" });
    states = await devTunnelStateManager.listDevTunnelStates();
    assert.isEmpty(states);
  });
});
