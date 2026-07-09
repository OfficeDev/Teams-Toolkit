// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Aocheng Wang <aochengwang@microsoft.com>
 */

import { TelemetryReporter } from "@microsoft/teamsfx-api";
import os from "os";
import { DepsCheckerEvent } from "../../../src/component/deps-checker/constant";
import { CoreDepsTelemetryAdapter } from "../../../src/component/deps-checker/coreDepsTelemetryAdapter";
import { chai, expect, vi } from "vitest";

describe("CoreDepsTelemetryAdapter", () => {
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(os, "arch").mockReturnValue("mock");
    vi.spyOn(os, "release").mockReturnValue("mock");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendEvent", () => {
    // Arrange
    const stub = vi.fn();
    const reporter = { sendTelemetryEvent: stub } as any as TelemetryReporter;

    // Act
    const adapter = new CoreDepsTelemetryAdapter(reporter);
    adapter.sendEvent(DepsCheckerEvent.dotnetAlreadyInstalled, { property1: "value1" }, 42);

    // Assert
    expect(stub).toHaveBeenCalledWith(
      DepsCheckerEvent.dotnetAlreadyInstalled,
      {
        component: "core:debug:envchecker",
        ["os-arch"]: "mock",
        ["os-release"]: "mock",
        property1: "value1",
      },
      { ["completion-time"]: 42 }
    );
  });
  it("sendUserErrorEvent", () => {
    // Arrange
    let eventName = "";
    const telemetryReporter = {
      sendTelemetryErrorEvent(_eventName: string) {
        eventName = _eventName;
      },
    } as any as TelemetryReporter;

    // Act
    const adapter = new CoreDepsTelemetryAdapter(telemetryReporter);
    adapter.sendUserErrorEvent(DepsCheckerEvent.dotnetAlreadyInstalled, "error");

    // Assert
    chai.assert.equal(eventName, DepsCheckerEvent.dotnetAlreadyInstalled);
  });
  it("sendSystemErrorEvent", () => {
    // Arrange
    let eventName = "";
    const telemetryReporter = {
      sendTelemetryErrorEvent(_eventName: string) {
        eventName = _eventName;
      },
    } as any as TelemetryReporter;

    // Act
    const adapter = new CoreDepsTelemetryAdapter(telemetryReporter);
    adapter.sendUserErrorEvent(DepsCheckerEvent.dotnetAlreadyInstalled, "error");

    // Assert
    chai.assert.equal(eventName, DepsCheckerEvent.dotnetAlreadyInstalled);
  });
});
