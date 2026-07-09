// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TextType, colorize, replaceTemplateString } from "../../src/colorize";
import ScreenManager from "../../src/console/screen";
import { chai, vi } from "vitest";

describe("colorize", () => {
  const sandox = vi;
  let message = "";
  let isTTY: boolean;
  beforeEach(() => {
    isTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;
    vi.spyOn(ScreenManager, "writeLine").mockImplementation((msg: string) => (message += msg));
  });

  afterEach(() => {
    process.stdout.isTTY = isTTY;
    vi.restoreAllMocks();
    message = "";
  });

  it("colorize - Success", async () => {
    colorize("test", TextType.Success);
  });

  it("colorize - Error", async () => {
    colorize("test", TextType.Error);
  });

  it("colorize - Warning", async () => {
    colorize("test", TextType.Warning);
  });

  it("colorize - Info", async () => {
    colorize("test", TextType.Info);
  });

  it("colorize - Hyperlink", async () => {
    colorize("test", TextType.Hyperlink);
  });

  it("colorize - Email", async () => {
    colorize("test", TextType.Email);
  });

  it("colorize - Important", async () => {
    colorize("test", TextType.Important);
  });

  it("colorize - Details", async () => {
    colorize("test", TextType.Details);
  });
  it("colorize - Commands", async () => {
    colorize("test", TextType.Commands);
  });
  it("replace template string", async () => {
    const template = "test %s";
    const result = replaceTemplateString(template, "test");
    chai.expect(result).to.equal("test test");
  });
});
