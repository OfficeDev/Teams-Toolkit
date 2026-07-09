// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../../src/commonlib/logger";
import { CliTelemetryReporter } from "../../../src/commonlib/telemetry";

const validInstrumentationKey = "00000000-0000-0000-0000-000000000000";

describe("CliTelemetryReporter", () => {
  const sandbox = vi;
  const stderrWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: any, ...args: any[]) => {
      const text = typeof chunk === "string" ? chunk : chunk?.toString?.() ?? "";
      if (text.includes("ApplicationInsights:An invalid instrumentation key was provided.")) {
        return true;
      }
      return stderrWrite(chunk, ...args);
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sendTelemetryErrorEvent", async () => {
    it("happy path", async () => {
      const reporter = new CliTelemetryReporter(validInstrumentationKey, "real", "real", "real");
      const debugStub = vi.spyOn(logger, "debug");
      const sendStub = vi.spyOn(reporter.reporter, "sendTelemetryErrorEvent");
      reporter.sendTelemetryErrorEvent("test");
      expect(debugStub.mock.calls.length > 0).toBe(true);
      expect(sendStub.mock.calls.length > 0).toBe(true);
    });
  });

  describe("sendTelemetryException", async () => {
    it("happy path", async () => {
      const reporter = new CliTelemetryReporter(validInstrumentationKey, "real", "real", "real");
      const stub = vi.spyOn(reporter.reporter, "sendTelemetryException");
      reporter.sendTelemetryException(new Error("test"));
      expect(stub.mock.calls.length > 0).toBe(true);
    });
  });
});
