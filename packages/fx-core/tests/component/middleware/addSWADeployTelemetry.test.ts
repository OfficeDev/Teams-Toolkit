// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Siglud <siglud@gmail.com>
 */
import { HookContext, NextFunction } from "@feathersjs/hooks";
import { FxError } from "@microsoft/teamsfx-api";
import { chai, vi } from "vitest";
import { addSWADeployTelemetry } from "../../../src/component/driver/middleware/addSWADeployTelemetry";

describe("addSWADeployTelemetry", () => {
  let clock: any;
  let next: NextFunction;
  let ctx: HookContext;
  let telemetryReporter: {
    sendTelemetryEvent: any;
    sendTelemetryErrorEvent: any;
  };

  beforeEach(() => {
    clock = vi.useFakeTimers();
    next = vi.fn(() => {
      return Promise.resolve(12);
    }) as unknown as NextFunction;
    telemetryReporter = {
      sendTelemetryEvent: vi.fn(),
      sendTelemetryErrorEvent: vi.fn(),
    };
    ctx = {
      arguments: [
        { args: "test command" },
        { telemetryReporter, telemetryProperties: {} } as any,
        undefined,
        "",
        "deploy to Azure Static Web Apps",
      ],
      result: { isOk: vi.fn().mockReturnValue(true) },
    } as HookContext;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should not add telemetry for script", async () => {
    const middleware = addSWADeployTelemetry("testEvent");
    const res = await middleware(ctx, next);
    chai.expect(res).to.equal(undefined);
  });

  it("should add telemetry for non-script", async () => {
    const middleware = addSWADeployTelemetry("testEvent");
    await middleware(ctx, next);
    vi.advanceTimersByTime(1000); // Simulate time passing
    chai.expect(telemetryReporter.sendTelemetryEvent.mock.calls.length > 0).to.be.true;
    chai.expect(telemetryReporter.sendTelemetryErrorEvent.mock.calls.length > 0).to.be.false;
  });

  it("When name is not deploy to Azure Static Web Apps", async () => {
    const ctx = {
      arguments: [
        { args: "test command" },
        { telemetryReporter, telemetryProperties: {} } as any,
        undefined,
        "",
        "Anything else",
      ],
      result: { isOk: vi.fn().mockReturnValue(true) },
    } as HookContext;
    const middleware = addSWADeployTelemetry("testEvent");
    const res = await middleware(ctx, next);
    chai.expect(res).to.equal(undefined);
    chai.expect(telemetryReporter.sendTelemetryEvent.mock.calls.length > 0).to.be.false;
    chai.expect(telemetryReporter.sendTelemetryErrorEvent.mock.calls.length > 0).to.be.false;
  });

  it("When return value is not ok", async () => {
    const err = { e: "error" } as unknown as FxError;
    const ctx = {
      arguments: [
        { args: "test command" },
        { telemetryReporter, telemetryProperties: {} } as any,
        undefined,
        "",
        "deploy to Azure Static Web Apps",
      ],
      result: { isOk: vi.fn().mockReturnValue(false), error: err },
    } as HookContext;
    const middleware = addSWADeployTelemetry("testEvent");
    await middleware(ctx, next);
    chai.expect(telemetryReporter.sendTelemetryEvent.mock.calls.length > 0).to.be.true;
    chai.expect(telemetryReporter.sendTelemetryErrorEvent.mock.calls.length > 0).to.be.true;
  });
});
