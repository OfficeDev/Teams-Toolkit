// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Colors, LogLevel } from "@microsoft/teamsfx-api";
import { CLILogProvider } from "../../../src/commonlib/log";
import ScreenManager from "../../../src/console/screen";
import { CLILogLevel } from "../../../src/constants";
import { chai, vi } from "vitest";

describe("CLILogProvider", () => {
  const logger = new CLILogProvider();
  logger.setLogLevel(CLILogLevel.debug);
  const sandox = vi;
  let message = "";

  beforeEach(() => {
    vi.spyOn(ScreenManager, "writeLine").mockImplementation((msg: string) => (message += msg));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    message = "";
  });

  it("Log - verbose", async () => {
    logger.verbose("verbose");
    chai.expect(message).to.contain("verbose");
  });

  it("Log - Debug", async () => {
    logger.debug("debug");
    chai.expect(message).to.contain("debug");
  });

  it("Log - Info", async () => {
    logger.info("info");
    chai.expect(message).to.contain("info");
  });
  it("Log - Info", async () => {
    logger.info([{ content: "infocolor", color: Colors.WHITE }]);
    chai.expect(message).to.contain("infocolor");
  });
  it("Log - Warning", async () => {
    logger.warning("warning");
    chai.expect(message).to.contain("warning");
  });

  it("Log - Error", async () => {
    logger.error("error");
    chai.expect(message).to.contain("error");
  });
  it("logInFile", async () => {
    await logger.logInFile(LogLevel.Info, "info");
    chai.expect(message).to.eq("");
  });
  it("OutputSuccess", async () => {
    logger.outputSuccess("success");
    chai.expect(message).to.contain("success");
  });

  it("NecessaryLog - Verbose", async () => {
    logger.necessaryLog(LogLevel.Verbose, "trace");
    chai.expect(message).to.contain("trace");
  });

  it("NecessaryLog - Debug", async () => {
    logger.necessaryLog(LogLevel.Debug, "debug");
    chai.expect(message).to.contain("debug");
  });

  it("NecessaryLog - Info", async () => {
    logger.necessaryLog(LogLevel.Info, "info");
    chai.expect(message).to.contain("info");
  });

  it("NecessaryLog - Info - White", async () => {
    logger.necessaryLog(LogLevel.Info, "info", true);
    chai.expect(message).to.contain("info");
  });

  it("NecessaryLog - Warning", async () => {
    logger.necessaryLog(LogLevel.Warning, "warning");
    chai.expect(message).to.contain("warning");
  });

  it("NecessaryLog - Error", async () => {
    logger.necessaryLog(LogLevel.Error, "error");
    chai.expect(message).to.contain("error");
  });
});
