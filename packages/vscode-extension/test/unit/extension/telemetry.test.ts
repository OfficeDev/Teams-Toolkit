/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-var-requires */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as chai from "chai";
import * as spies from "chai-spies";
import { TelemetryReporter } from "@microsoft/teamsfx-api";

chai.use(spies);
const expect = chai.expect;
const spy = chai.spy;

const reporterSpy = spy.interface({
  sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number },
    errorProps?: string[]
  ): void {},
  sendTelemetryEvent(
    eventName: string,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number }
  ): void {},
  sendTelemetryException(
    error: Error,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number }
  ): void {},
});

const mock = require("mock-require");
mock("vscode-extension-telemetry", {
  default: function (
    extensionId: string,
    extensionVersion: string,
    key: string,
    firstParty?: boolean
  ) {
    return reporterSpy;
  },
});

import { VSCodeTelemetryReporter } from "../../../src/commonlib/telemetry";
import { getAllFeatureFlags } from "../../../src/utils/commonUtils";

const featureFlags = getAllFeatureFlags()?.join(";") ?? "";

suite("telemetry", () => {
  let tester: TelemetryReporter;

  suiteSetup(() => {
    tester = new VSCodeTelemetryReporter("test", "1.0.0-rc.1", "test");
    chai.util.addProperty(tester, "reporter", () => reporterSpy);
  });

  test("sendTelemetryEvent", () => {
    tester.sendTelemetryEvent(
      "sampleEvent",
      { stringProp: "some string" },
      { numericMeasure: 123 }
    );

    expect(reporterSpy.sendTelemetryEvent).to.have.been.called.with(
      "sampleEvent",
      {
        stringProp: "some string",
        "project-id": "",
        "correlation-id": "",
        "feature-flags": featureFlags,
      },
      { numericMeasure: 123 }
    );
  });

  test("sendTelemetryErrorEvent", () => {
    tester.sendTelemetryErrorEvent(
      "sampleErrorEvent",
      {
        stringProp: "some string",
        stackProp: "some user stack trace",
      },
      { numericMeasure: 123 },
      ["stackProp"]
    );

    expect(reporterSpy.sendTelemetryErrorEvent).to.have.been.called.with(
      "sampleErrorEvent",
      {
        stringProp: "some string",
        stackProp: "some user stack trace",
        "project-id": "",
        "correlation-id": "",
        "feature-flags": featureFlags,
      },
      { numericMeasure: 123 },
      ["stackProp"]
    );
  });

  test("sendTelemetryException", () => {
    const error = new Error("error for test");
    tester.sendTelemetryException(error, { stringProp: "some string" }, { numericMeasure: 123 });

    expect(reporterSpy.sendTelemetryException).to.have.been.called.with(
      error,
      {
        stringProp: "some string",
        "project-id": "",
        "correlation-id": "",
        "feature-flags": featureFlags,
      },
      { numericMeasure: 123 }
    );
  });
});
