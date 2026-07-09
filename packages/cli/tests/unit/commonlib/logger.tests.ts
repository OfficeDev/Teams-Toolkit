// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Colors, LogLevel } from "@microsoft/teamsfx-api";
import ScreenManager from "../../../src/console/screen";
import { logger } from "../../../src/commonlib/logger";
import { chai, vi } from "vitest";

describe("CLILogger", () => {
  logger.logLevel = LogLevel.Debug;
  const sandox = vi;
  let message = "";

  beforeEach(() => {
    vi.spyOn(ScreenManager, "writeLine").mockImplementation((msg: string) => (message += msg));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    message = "";
  });

  it("Log - Verbose", async () => {
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
    logger.logInFile(LogLevel.Info, "info");
    chai.expect(message).to.eq("");
  });
  it("OutputSuccess", async () => {
    logger.outputSuccess("success");
    chai.expect(message).to.contain("success");
  });
});
