// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import detectPort from "detect-port";
import { afterEach, beforeEach, chai, vi } from "vitest";
import { getPortsInUse } from "../../../src/component/local/portChecker";

vi.mock("detect-port", () => ({
  default: vi.fn(),
}));

describe("portChecker", () => {
  const detectPortMock = vi.mocked(detectPort);

  describe("getPortsInUse()", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("happy path", async () => {
      detectPortMock.mockImplementation(async (port) => port as number);

      const waitingCheckPorts = [53000, 3978];
      const ports = await getPortsInUse(waitingCheckPorts);

      chai.assert.isDefined(ports);
      chai.assert.equal(ports.length, 0);
    });

    it("detect-port timeout", async () => {
      vi.useFakeTimers();
      detectPortMock.mockImplementation(
        async (port) =>
          await new Promise<number>((resolve) => {
            setTimeout(() => resolve((port as number) + 1), 60 * 1000);
          })
      );

      const waitingCheckPorts = [3978];
      const portsPromise = getPortsInUse(waitingCheckPorts);
      await vi.advanceTimersByTimeAsync(11 * 1000);
      const ports = await portsPromise;

      chai.assert.isDefined(ports);
      chai.assert.equal(ports.length, 0);
    });

    it("53000 in use", async () => {
      detectPortMock.mockImplementation(async (port) =>
        (port as number) === 53000 ? 53001 : (port as number)
      );

      const waitingCheckPorts = [53000, 3978];
      const ports = await getPortsInUse(waitingCheckPorts);

      chai.assert.isDefined(ports);
      chai.assert.deepEqual(ports, [53000]);
    });

    it("55000 in use, do not detect", async () => {
      detectPortMock.mockImplementation(async (port) =>
        (port as number) === 55000 ? 55001 : (port as number)
      );

      const waitingCheckPorts = [53000, 3978];
      const ports = await getPortsInUse(waitingCheckPorts);

      chai.assert.isDefined(ports);
      chai.assert.deepEqual(ports, []);
    });

    it("dev:teamsfx port", async () => {
      detectPortMock.mockImplementation(async (port) =>
        (port as number) === 9229 ? 9230 : (port as number)
      );

      const waitingCheckPorts = [3978, 9229, 9239];
      const ports = await getPortsInUse(waitingCheckPorts);

      chai.assert.isDefined(ports);
      chai.assert.deepEqual(ports, [9229]);
    });
  });
});
