// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import ScreenManager, { Row } from "../../../src/console/screen";
import { expect } from "../utils";
import { vi } from "vitest";
describe("Row", () => {
  it("create with an string.", () => {
    const row = new Row("Test");
    expect(row.freezed).equals(false);
    expect(row.content).equals("Test");
  });

  it("create with an callback.", () => {
    const cb = () => "Test cb";
    const row = new Row(cb);
    expect(row.freezed).equals(false);
    expect(row.update()).equals("Test cb");
  });

  it("update content.", () => {
    const row = new Row("Test");
    expect(row.update("Test2")).equals("Test2");
  });

  it("remove cb.", () => {
    const cb = () => "Test cb";
    const row = new Row(cb);
    row.removeCB();
    expect(row["cb"]).equals(undefined);
  });

  it("freeze.", () => {
    const row = new Row("Test");
    row.freeze();
    expect(row.freezed).equals(true);
  });
});

describe("Screen Manager", function () {
  const sandbox = vi;

  beforeEach(() => {
    ScreenManager["rows"] = [];
    ScreenManager["cursorY"] = 0;
    ScreenManager["paused"] = false;
    ScreenManager["cacheLogs"] = [];
    ScreenManager["clearTimer"]();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("add progress", () => {
    const refreshStub = vi.spyOn(ScreenManager, "refresh");
    const row = ScreenManager.addProgress(() => "Test add progress");
    expect(ScreenManager["rows"]).deep.equals([row]);
    expect(refreshStub.mock.calls.length === 1).to.be.true;
  });

  it("write when paused", () => {
    ScreenManager["paused"] = true;
    ScreenManager.write("Test write when paused");
    expect(ScreenManager["cacheLogs"]).deep.equals([["Test write when paused", false]]);
  });

  it("write and write line (out stream)", () => {
    const clearScreenStub = vi.spyOn(ScreenManager, "clearScreen");
    const renderScreenStub = vi.spyOn(ScreenManager, "renderScreen");
    const outWriteStub = vi.spyOn(process.stdout, "write");
    ScreenManager.writeLine("Test out");
    expect(clearScreenStub.mock.calls.length === 1).to.be.true;
    expect(renderScreenStub.mock.calls.length === 1).to.be.true;
    expect(outWriteStub.mock.calls.length === 1).to.be.true;
  });

  it("write and write line (err stream)", () => {
    const clearScreenStub = vi.spyOn(ScreenManager, "clearScreen");
    const renderScreenStub = vi.spyOn(ScreenManager, "renderScreen");
    const errWriteStub = vi.spyOn(process.stderr, "write");
    ScreenManager.writeLine("Test err", true);
    expect(clearScreenStub.mock.calls.length === 1).to.be.true;
    expect(renderScreenStub.mock.calls.length === 1).to.be.true;
    expect(errWriteStub.mock.calls.length === 1).to.be.true;
  });

  it("refresh", () => {
    const clearTimerStub = vi.spyOn(ScreenManager, "clearTimer");
    const renderScreenStub = vi.spyOn(ScreenManager, "renderScreen");
    const setTimerStub = vi.spyOn(ScreenManager, "setTimer");
    ScreenManager.refresh();
    expect(clearTimerStub.mock.calls.length === 1).to.be.true;
    expect(renderScreenStub.mock.calls.length === 1).to.be.true;
    expect(setTimerStub.mock.calls.length === 1).to.be.true;
  });

  it("freeze", () => {
    const writeLineStub = vi.spyOn(ScreenManager, "writeLine");
    const row = new Row(() => "Test freeze");
    ScreenManager["rows"] = [row];
    ScreenManager.freeze(row);
    expect(writeLineStub.mock.calls.length === 1).to.be.true;
    expect(ScreenManager["rows"].length).equals(0);
  });

  it("delete", () => {
    const row = new Row(() => "Test delete");
    ScreenManager["rows"] = [row];
    ScreenManager.delete(row);
    expect(ScreenManager["rows"].length).equals(0);
  });

  it("pause", () => {
    const clearScreenStub = vi.spyOn(ScreenManager, "clearScreen");
    ScreenManager.pause();
    expect(clearScreenStub.mock.calls.length === 1).to.be.true;
    expect(ScreenManager["paused"]).equals(true);
  });

  it("continue", () => {
    ScreenManager["paused"] = true;
    ScreenManager.continue();
    expect(ScreenManager["paused"]).equals(false);
  });

  it("set timer", () => {
    vi.spyOn(ScreenManager, "refresh");
    const row = new Row(() => "Test freeze");
    ScreenManager["rows"] = [row];
    ScreenManager["setTimer"]();
    expect(ScreenManager["timer"]).not.equals(undefined);
  });

  it("clear timer", () => {
    ScreenManager["timer"] = setTimeout(() => {}, 2000);
    ScreenManager["clearTimer"]();
    expect(ScreenManager["timer"]).equals(undefined);
  });
});
