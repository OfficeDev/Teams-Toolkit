// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { vi, assert } from "vitest";
import { window } from "vscode";

import { ProgressHandler } from "../../src/debug/progressHandler";
import * as vscodeMocks from "../mocks/vsc";
import * as localizeUtils from "../../src/utils/localizeUtils";

describe("ProgressHandler", () => {
  let message: string | undefined = undefined;

  beforeEach(() => {
    vi.spyOn(window, "withProgress").mockImplementation(async (options, task) => {
      return await task(
        {
          report: (value) => {
            message = value.message;
          },
        },
        new vscodeMocks.CancellationToken()
      );
    });
    vi.spyOn(localizeUtils, "localize").mockImplementation((key) => {
      if (key === "teamstoolkit.progressHandler.showOutputLink") {
        return "Check [output window](%s) for details.";
      } else if (key === "teamstoolkit.progressHandler.showTerminalLink") {
        return "Check [terminal window](%s) for details.";
      } else if (key === "teamstoolkit.progressHandler.prepareTask") {
        return " Prepare task.";
      } else if (key === "teamstoolkit.progressHandler.reloadNotice") {
        return "%s%s%s (Notice: You can reload the window and retry if task spends too long time.)";
      }
      return "";
    });
  });

  it("terminal", async () => {
    const progressHandler = new ProgressHandler("test title", 1, "terminal");
    let expected =
      "test title: [0/1] Prepare task. Check [terminal window](command:workbench.action.terminal.focus) for details. (Notice: You can reload the window and retry if task spends too long time.)";
    await progressHandler.start();
    assert.equal(message, expected);
    await progressHandler.next("test message.");
    expected =
      "test title: [1/1] test message. Check [terminal window](command:workbench.action.terminal.focus) for details. (Notice: You can reload the window and retry if task spends too long time.)";
    assert.equal(message, expected);
  });

  it("output", async () => {
    const progressHandler = new ProgressHandler("test title", 1, "output");
    let expected =
      "test title: [0/1] Prepare task. Check [output window](command:fx-extension.showOutputChannel) for details. (Notice: You can reload the window and retry if task spends too long time.)";
    await progressHandler.start();
    assert.equal(message, expected);
    await progressHandler.next("test message.");
    expected =
      "test title: [1/1] test message. Check [output window](command:fx-extension.showOutputChannel) for details. (Notice: You can reload the window and retry if task spends too long time.)";
    assert.equal(message, expected);
  });

  it("not started", async () => {
    message = undefined;
    const progressHandler = new ProgressHandler("test title", 1, "output");
    await progressHandler.next("test message.");
    await progressHandler.end(true);
    assert.equal(message, undefined);
  });
});
