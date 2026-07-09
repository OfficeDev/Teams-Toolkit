import { LocalDebugPorts, resetLocalDebugPorts } from "../../src/globalVariables";
import { vi, assert } from "vitest";

describe("GlobalVariables", () => {
  it("resetLocalDebugPorts", async () => {
    resetLocalDebugPorts();
    assert.deepEqual(LocalDebugPorts, {
      checkPorts: [],
      conflictPorts: [],
      terminateButton: "",
      process2conflictPorts: {},
      terminateProcesses: [],
    });
  });
});
