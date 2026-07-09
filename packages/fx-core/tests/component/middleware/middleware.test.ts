import { performance } from "perf_hooks";
import { setTools } from "../../../src/common/globalVars";
import { TelemetryProperty } from "../../../src/common/telemetry";
import { TeamsFxTelemetryReporter } from "../../../src/component/utils/teamsFxTelemetryReporter";
import { MockTools } from "../../core/utils";
import { MockDriver } from "./helper";
import { chai, vi } from "vitest";

describe("Action Middleware", () => {
  const tools = new MockTools();
  const sandbox = vi;
  setTools(tools);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("addStartAndEndTelemetry send correct cost time", async () => {
    const perfStub = vi.spyOn(performance, "now");
    perfStub.mockReturnValueOnce(0);
    perfStub.mockReturnValueOnce(1000);
    vi.spyOn(TeamsFxTelemetryReporter.prototype, "sendStartEvent");
    const sendEndEventStub = vi.spyOn(TeamsFxTelemetryReporter.prototype, "sendEndEvent");
    sendEndEventStub.mockImplementation((config) => {
      chai.assert.equal(config.measurements?.[TelemetryProperty.TimeCost], 1000);
    });

    await new MockDriver().execute(undefined, { telemetryReporter: {} as any } as any);

    chai.assert.isTrue(sendEndEventStub.mock.calls.length > 0);
  });
});
