// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { featureFlagManager, FeatureFlags } from "@microsoft/teamsfx-core";
import { TelemetryClient } from "applicationinsights";
import log4js from "log4js";
import os from "os";
import { vi } from "vitest";
import Logger from "../../../src/commonlib/log";
import Reporter from "../../../src/telemetry/telemetryReporter";
import { expect } from "../utils";

vi.mock("node-machine-id", () => ({
  machineIdSync: vi.fn(() => "mock-machine-id"),
}));

vi.mock("applicationinsights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("applicationinsights")>();
  let defaultClient: actual.TelemetryClient | undefined;

  class MockTelemetryClient {
    public channel = {
      setUseDiskRetryCaching: vi.fn(),
    };
    public commonProperties: Record<string, string> | undefined;

    constructor(public key: string) {}

    trackEvent() {}

    trackException() {}

    flush(options?: { callback?: (response?: string) => void }) {
      options?.callback?.("");
    }
  }

  const setup = vi.fn(() => {
    defaultClient = new MockTelemetryClient("setup") as unknown as actual.TelemetryClient;
    return {
      setAutoCollectRequests: vi.fn().mockReturnThis(),
      setAutoCollectPerformance: vi.fn().mockReturnThis(),
      setAutoCollectExceptions: vi.fn().mockReturnThis(),
      setAutoCollectDependencies: vi.fn().mockReturnThis(),
      setAutoDependencyCorrelation: vi.fn().mockReturnThis(),
      setAutoCollectConsole: vi.fn().mockReturnThis(),
      setUseDiskRetryCaching: vi.fn().mockReturnThis(),
      start: vi.fn(),
    };
  });

  return {
    ...actual,
    get defaultClient() {
      return defaultClient;
    },
    setup,
    TelemetryClient: MockTelemetryClient,
  };
});

describe("Telemetry Reporter", function () {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getCommonProperties", () => {
    const reporter = new Reporter("real", "real", "real", "real");
    const properties = reporter["getCommonProperties"]();
    expect(Object.keys(properties)).deep.equals([
      "common.os",
      "common.platformversion",
      "common.cliversion",
      "common.machineid",
    ]);
  });

  it("cloneAndChange", () => {
    const reporter = new Reporter("real", "real", "real", "real");
    const obj = {
      a: "aa",
      b: "bb",
    };
    const change = (key: string, val: string) => [key, val].join(",");
    const properties = reporter["cloneAndChange"](obj, change);
    expect(properties).deep.equals({
      a: "a,aa",
      b: "b,bb",
    });
    expect(obj).deep.equals({
      a: "aa",
      b: "bb",
    });
  });

  describe("anonymizeFilePaths", () => {
    const sandbox = vi;

    before(() => {});

    after(() => {
      vi.restoreAllMocks();
    });

    it("No stack", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["anonymizeFilePaths"]();
      expect(result).equals("");
    });

    it("abcdefg", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["anonymizeFilePaths"]("abcdefg");
      expect(result).equals("abcdefg");
    });

    it("abcrealdefg", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["anonymizeFilePaths"]("abcrealdefg");
      expect(result).equals("abcdefg");
    });

    it("file://abc/real./defg", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["anonymizeFilePaths"]("file://abc/real./defg");
      expect(result).equals("<REDACTED: user-file-path>");
    });
  });

  describe("removePropertiesWithPossibleUserInfo", () => {
    const sandbox = vi;

    before(() => {});

    after(() => {
      vi.restoreAllMocks();
    });

    it("undefined", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["removePropertiesWithPossibleUserInfo"](undefined);
      expect(result).equals(undefined);
    });

    it("abcdefg", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["removePropertiesWithPossibleUserInfo"]({ a: "abcdefg" });
      expect(result).deep.equals({ a: "abcdefg" });
    });

    it("xxxx@yyy.zzz", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["removePropertiesWithPossibleUserInfo"]({ a: "xxxx@yyy.zzz" });
      expect(result).deep.equals({ a: "<REDACTED: email>" });
    });

    it("password", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["removePropertiesWithPossibleUserInfo"]({ a: "ssword=sasdfsdf" });
      expect(result).deep.equals({ a: "<REDACTED: password>" });
    });

    it("token", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      const result = reporter["removePropertiesWithPossibleUserInfo"]({ a: "token=asdfasdfasdf" });
      expect(result).deep.equals({ a: "<REDACTED: token>" });
    });
  });

  it("sendTelemetryEvent", () => {
    vi.spyOn(TelemetryClient.prototype, "trackEvent");
    vi.spyOn(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    reporter.sendTelemetryEvent("eventName", { a: "real" });
  });

  it("sendTelemetryErrorEvent", () => {
    vi.spyOn(TelemetryClient.prototype, "trackEvent");
    vi.spyOn(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    reporter.sendTelemetryErrorEvent("eventName", { a: "real" });
  });

  it("sendTelemetryException", () => {
    vi.spyOn(TelemetryClient.prototype, "trackEvent");
    vi.spyOn(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    reporter.sendTelemetryException(new Error("test error"), { a: "real" });
  });

  it("flush", async () => {
    vi.spyOn(TelemetryClient.prototype, "flush").mockImplementation((op) => {
      op?.callback?.("");
    });
    vi.spyOn(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    await reporter.flush();
  });

  describe("log4js integration (debug on)", () => {
    let getBooleanStub: any;
    let configureStub: any;
    let getLoggerStub: any;
    let homedirStub: any;
    const fakeLogger = {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as log4js.Logger;

    beforeEach(() => {
      getBooleanStub = vi
        .spyOn(featureFlagManager, "getBooleanValue")
        .mockImplementation((flag: FeatureFlags) =>
          flag === FeatureFlags.TelemetryTest ? true : false
        );
      configureStub = vi.spyOn(log4js, "configure");
      getLoggerStub = vi.spyOn(log4js, "getLogger").mockReturnValue(fakeLogger);
      homedirStub = vi.spyOn(os, "homedir").mockReturnValue("C:/home");
      vi.spyOn(TelemetryClient.prototype, "trackEvent");
      vi.spyOn(TelemetryClient.prototype, "trackException");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("sendTelemetryEvent logs to log4js", () => {
      const reporter = new Reporter("atk", "1.0.0", "ikey", undefined);
      (reporter as any)["debug"] = true;
      (reporter as any)["log4jsLogger"] = fakeLogger;
      reporter["appInsightsClient"] = new TelemetryClient("123");
      reporter.sendTelemetryEvent("unit-test-event", { a: "b" }, { m: 1 });
      expect((fakeLogger.info as any).mock.calls.length > 0).to.be.true;
      const msg = (fakeLogger.info as any).mock.lastCall[0] as string;
      expect(msg).to.contain("Event: atk/unit-test-event");
    });

    it("sendTelemetryErrorEvent logs to log4js", () => {
      const reporter = new Reporter("atk", "1.0.0", "ikey", undefined);
      (reporter as any)["debug"] = true;
      (reporter as any)["log4jsLogger"] = fakeLogger;
      reporter["appInsightsClient"] = new TelemetryClient("123");
      reporter.sendTelemetryErrorEvent("unit-test-error", { x: "y" });
      expect((fakeLogger.info as any).mock.calls.length > 0).to.be.true;
      const msg = (fakeLogger.info as any).mock.lastCall[0] as string;
      expect(msg).to.contain("ErrorEvent: atk/unit-test-error");
    });

    it("sendTelemetryException logs to log4js", () => {
      const reporter = new Reporter("atk", "1.0.0", "ikey", undefined);
      (reporter as any)["debug"] = true;
      (reporter as any)["log4jsLogger"] = fakeLogger;
      reporter["appInsightsClient"] = new TelemetryClient("123");
      reporter.sendTelemetryException(new Error("boom"), { z: "w" });
      expect((fakeLogger.error as any).mock.calls.length > 0).to.be.true;
      const msg = (fakeLogger.error as any).mock.lastCall[0] as string;
      expect(msg).to.contain("Exception: atk/Error boom");
    });
  });
});
