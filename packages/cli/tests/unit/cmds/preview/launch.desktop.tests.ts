// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IProgressHandler } from "@microsoft/teamsfx-api";
import cp from "child_process";
import * as commonUtils from "../../../../src/cmds/preview/commonUtils";
import { Browser } from "../../../../src/cmds/preview/constants";
import { openTeamsDesktopClient } from "../../../../src/cmds/preview/launch";
import cliLogger from "../../../../src/commonlib/log";
import cliTelemetry from "../../../../src/telemetry/cliTelemetry";
import CLIUIInstance from "../../../../src/userInteraction";
import { expect } from "../../utils";
import { vi } from "vitest";
describe("launch openTeamsDesktopClient", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  let telemetries: any[] = [];
  const telemetryProperties = {
    key1: "value1",
    key2: "value2",
  };

  beforeEach(() => {
    telemetries = [];

    vi.spyOn(process.stdout, "write").mockReturnValue(true as any);
    vi.spyOn(process.stderr, "write").mockReturnValue(true as any);

    vi.spyOn(cliTelemetry, "sendTelemetryEvent").mockImplementation((eventName, properties) => {
      telemetries.push([eventName, properties]);
    });
    vi.spyOn(cliTelemetry, "sendTelemetryErrorEvent").mockImplementation(
      (eventName, error, properties) => {
        telemetries.push([eventName, error, properties]);
      }
    );
    vi.spyOn(cliLogger, "necessaryLog").mockImplementation(() => {});
    vi.spyOn(CLIUIInstance, "createProgressBar").mockReturnValue(new MockProgressHandler());
    vi.spyOn(cp, "exec");
  });

  it("happy path windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await openTeamsDesktopClient("http://test-url", "username", Browser.default);
    expect(telemetries.length).to.deep.equals(0);
  });

  it("happy path mac", async () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    await openTeamsDesktopClient("http://test-url", "username", Browser.default);
    expect(telemetries.length).to.deep.equals(0);
  });

  it("happy path windows - with telemetry", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    await openTeamsDesktopClient(
      "http://test-url",
      "username",
      Browser.default,
      [],
      telemetryProperties
    );
    expect(telemetries.length).to.deep.equals(2);
  });

  it("happy path others", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(commonUtils, "openBrowser").mockImplementation(
      async (browser, url, browserArguments) => {}
    );
    await openTeamsDesktopClient("http://test-url", "username", Browser.default, ["test"]);
    expect(telemetries.length).to.deep.equals(0);
  });

  it("openBrowser error", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(commonUtils, "openBrowser").mockImplementation(() => {
      throw new Error();
    });
    await openTeamsDesktopClient("http://test-url", "username", Browser.default);
    expect(telemetries.length).to.deep.equals(0);
  });
});

class MockProgressHandler implements IProgressHandler {
  start(detail?: string): Promise<void> {
    return Promise.resolve();
  }
  next(detail?: string): Promise<void> {
    return Promise.resolve();
  }
  end(success: boolean): Promise<void> {
    return Promise.resolve();
  }
}
