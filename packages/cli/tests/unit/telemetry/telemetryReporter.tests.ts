// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import sinon from "sinon";
import { TelemetryClient } from "applicationinsights";

import Reporter from "../../../src/telemetry/telemetryReporter";
import { UserSettings } from "../../../src/userSetttings";
import { expect } from "../utils";
import Logger from "../../../src/commonlib/log";

describe("Telemetry Reporter", function () {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe("updateUserOptIn", () => {
    const sandbox = sinon.createSandbox();

    before(() => {
      sandbox
        .stub(UserSettings, "getTelemetrySetting")
        .onFirstCall()
        .returns(ok(false))
        .onSecondCall()
        .returns(ok(true));
      sandbox.stub(Reporter.prototype, <any>"createAppInsightsClient");
    });

    after(() => {
      sandbox.restore();
    });

    it("telemetry false", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      expect(reporter["userOptIn"]).to.be.false;
    });

    it("telemetry true", () => {
      const reporter = new Reporter("real", "real", "real", "real");
      expect(reporter["userOptIn"]).to.be.true;
    });
  });

  it("getCommonProperties", () => {
    sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
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
    sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
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
    const sandbox = sinon.createSandbox();

    before(() => {
      sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
    });

    after(() => {
      sandbox.restore();
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
    const sandbox = sinon.createSandbox();

    before(() => {
      sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
    });

    after(() => {
      sandbox.restore();
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
    sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
    sandbox.stub(TelemetryClient.prototype, "trackEvent");
    sandbox.stub(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    reporter["userOptIn"] = true;
    reporter.sendTelemetryEvent("eventName", { a: "real" });
  });

  it("sendTelemetryErrorEvent", () => {
    sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
    sandbox.stub(TelemetryClient.prototype, "trackEvent");
    sandbox.stub(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    reporter["userOptIn"] = true;
    reporter.sendTelemetryErrorEvent("eventName", { a: "real" });
  });

  it("sendTelemetryException", () => {
    sandbox.stub(UserSettings, "getTelemetrySetting").returns(ok(false));
    sandbox.stub(TelemetryClient.prototype, "trackEvent");
    sandbox.stub(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    reporter["userOptIn"] = true;
    reporter.sendTelemetryException(new Error("test error"), { a: "real" });
  });

  it("flush", async () => {
    sandbox.stub(TelemetryClient.prototype, "flush").callsFake((op) => {
      op?.callback?.("");
    });
    sandbox.stub(Logger, "debug");
    const reporter = new Reporter("real", "real", "real", "real");
    reporter["appInsightsClient"] = new TelemetryClient("123");
    await reporter.flush();
  });
});
