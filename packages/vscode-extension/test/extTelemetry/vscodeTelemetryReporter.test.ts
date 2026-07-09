// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// eslint-disable-next-line import-x/default
import TelemetryReporter from "@vscode/extension-telemetry";
import { VSCodeTelemetryReporter } from "../../src/telemetry/vscodeTelemetryReporter";
import { MockTelemetryReporter } from "../mocks/mockTools";
import { featureFlagManager } from "@microsoft/teamsfx-core";
import { vi } from "vitest";

const featureFlags = featureFlagManager.listEnabled().join(";") ?? "";

describe("vscodeTelemetryReporter", () => {
  let tester: VSCodeTelemetryReporter;
  const reporterStub = new MockTelemetryReporter();
  let sendTelemetryEventSpy: ReturnType<typeof vi.spyOn>;
  let sendTelemetryExceptionSpy: ReturnType<typeof vi.spyOn>;
  let sendTelemetryErrorEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tester = new VSCodeTelemetryReporter(
      "test",
      "1.0.0-rc.1",
      "test",
      reporterStub as unknown as TelemetryReporter
    );
    tester.addSharedProperty("project-id", "");
    tester.addSharedProperty("programming-language", "");
    tester.addSharedProperty("host-type", "");
    tester.addSharedProperty("is-from-sample", "");

    sendTelemetryEventSpy = vi.spyOn(reporterStub, "sendTelemetryEvent");
    sendTelemetryExceptionSpy = vi.spyOn(reporterStub, "sendTelemetryException");
    sendTelemetryErrorEventSpy = vi.spyOn(reporterStub, "sendTelemetryErrorEvent");
  });

  afterEach(() => {
    tester.dispose();
    vi.restoreAllMocks();
  });

  it("sendTelemetryEvent", () => {
    tester.sendTelemetryEvent(
      "sampleEvent",
      { stringProp: "some string" },
      { numericMeasure: 123 }
    );

    expect(sendTelemetryEventSpy).toHaveBeenCalledTimes(1);
    expect(sendTelemetryEventSpy).toHaveBeenCalledWith(
      "sampleEvent",
      expect.objectContaining({
        stringProp: "some string",
        "project-id": "",
        "correlation-id": "",
        "feature-flags": featureFlags,
        "programming-language": "",
        "host-type": "",
        "is-from-sample": "",
      }),
      { numericMeasure: 123 }
    );
  });

  it("sendTelemetryErrorEvent", () => {
    tester.sendTelemetryErrorEvent(
      "sampleErrorEvent",
      {
        stringProp: "some string",
        "error-stack": "some user stack trace at (C:/fake_path/fake_file:1:1)",
      },
      { numericMeasure: 123 },
      ["error-stack"]
    );

    expect(sendTelemetryErrorEventSpy).toHaveBeenCalledTimes(1);
    expect(sendTelemetryErrorEventSpy).toHaveBeenCalledWith(
      "sampleErrorEvent",
      expect.objectContaining({
        stringProp: "some string",
        "error-stack": "some user stack trace at (<REDACTED: user-file-path>/fake_file:1:1)",
        "project-id": "",
        "correlation-id": "",
        "feature-flags": featureFlags,
        "programming-language": "",
        "host-type": "",
        "is-from-sample": "",
      }),
      { numericMeasure: 123 }
    );
  });

  it("sendTelemetryErrorEvent: not overwrite correlationId if existing", () => {
    tester.sendTelemetryErrorEvent(
      "sampleErrorEvent",
      {
        stringProp: "some string",
        "error-stack": "some user stack trace at (C:/fake_path/fake_file:1:1)",
        "correlation-id": "fakeId",
      },
      { numericMeasure: 123 },
      ["error-stack"]
    );

    expect(sendTelemetryErrorEventSpy).toHaveBeenCalledTimes(1);
    expect(sendTelemetryErrorEventSpy).toHaveBeenCalledWith(
      "sampleErrorEvent",
      expect.objectContaining({
        stringProp: "some string",
        "error-stack": "some user stack trace at (<REDACTED: user-file-path>/fake_file:1:1)",
        "project-id": "",
        "correlation-id": "fakeId",
        "feature-flags": featureFlags,
        "programming-language": "",
        "host-type": "",
        "is-from-sample": "",
      }),
      { numericMeasure: 123 }
    );
  });

  it("sendTelemetryException", () => {
    const error = new Error("error for test");
    tester.sendTelemetryException(error, { stringProp: "some string" }, { numericMeasure: 123 });

    expect(sendTelemetryExceptionSpy).toHaveBeenCalledTimes(1);
    expect(sendTelemetryExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        stringProp: "some string",
        "project-id": "",
        "correlation-id": "",
        "feature-flags": featureFlags,
        "programming-language": "",
        "host-type": "",
        "is-from-sample": "",
      }),
      { numericMeasure: 123 }
    );
  });
});
