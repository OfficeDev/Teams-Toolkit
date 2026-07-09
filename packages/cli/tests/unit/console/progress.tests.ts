// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { vi } from "vitest";
import Progress from "../../../src/console/progress";
import ScreenManager, { Row } from "../../../src/console/screen";
import * as Utils from "../../../src/utils";
import { expect } from "../utils";
describe("Progress", () => {
  const sandbox = vi;

  beforeEach(() => {
    Progress["instances"] = [];
    Progress["rows"] = [];
    Progress["finishedRows"] = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("static add", () => {
    vi.spyOn(ScreenManager, "addProgress").mockReturnValue(new Row(() => "Test static add"));
    const instance = new Progress("Test static add", 3);
    Progress["add"](instance);
    expect(Progress["instances"]).deep.equals([instance]);
  });

  it("static finish", () => {
    const updateStub = vi.spyOn(Row.prototype, "update");
    const romoveCBStub = vi.spyOn(Row.prototype, "removeCB");
    const freezeStub = vi.spyOn(Row.prototype, "freeze");
    const instance = new Progress("Test static finish", 3);
    const row = new Row(() => "Test static finish");
    Progress["instances"] = [instance];
    Progress["rows"] = [row];
    Progress["finish"](instance);
    expect(updateStub.mock.calls.length === 1).to.be.true;
    expect(romoveCBStub.mock.calls.length === 1).to.be.true;
    expect(freezeStub.mock.calls.length === 1).to.be.true;
    expect(Progress["instances"]).deep.equals([]);
    expect(Progress["rows"]).deep.equals([]);
    expect(Progress["finishedRows"]).deep.equals([]);
  });

  it("static finish hide", () => {
    const updateStub = vi.spyOn(Row.prototype, "update");
    const romoveCBStub = vi.spyOn(Row.prototype, "removeCB");
    const freezeStub = vi.spyOn(Row.prototype, "freeze");
    const instance = new Progress("Test static finish", 3);
    const row = new Row(() => "Test static finish");
    Progress["instances"] = [instance];
    Progress["rows"] = [row];
    Progress["finish"](instance, true);
    expect(updateStub.mock.calls.length === 1).to.be.true;
    expect(romoveCBStub.mock.calls.length === 1).to.be.true;
    // expect(freezeStub.mock.calls.length === 1).to.be.true;
    expect(Progress["instances"]).deep.equals([]);
    expect(Progress["rows"]).deep.equals([]);
    expect(Progress["finishedRows"]).deep.equals([]);
  });

  it("static end", () => {
    const endStub = vi.spyOn(Progress.prototype, "end").mockReturnValue(undefined as any);
    const instance = new Progress("Test static end", 3);
    Progress["instances"] = [instance];
    Progress["end"](true);
    expect(endStub.mock.calls.length === 1).to.be.true;
  });

  it("start", async () => {
    const addStub = vi.spyOn(Progress, "add").mockReturnValue(undefined as any);
    const instance = new Progress("Test start", 3);
    await instance.start();
    expect(instance["status"]).equals("running");
    expect(instance["detail"]).equals(undefined);
    expect(instance["currentStep"]).equals(0);
    expect(addStub.mock.calls.length === 1).to.be.true;
  });

  it("end", async () => {
    const finishStub = vi.spyOn(Progress, "finish").mockReturnValue(undefined as any);
    const instance = new Progress("Test finish", 3);
    Progress["instances"] = [instance];
    await instance.end(true);
    expect(instance["status"]).equals("done");
    expect(instance["currentPercentage"]).equals(100);
    expect(finishStub.mock.calls.length === 1).to.be.true;
  });

  it("next", async () => {
    const instance = new Progress("Test next", 3);
    instance["currentStep"] = 3;
    await instance.next("step 1");
    expect(instance["currentStep"]).equals(4);
    expect(instance["totalSteps"]).equals(4);
  });
  it("text", async () => {
    const instance = new Progress("Test next", 3);
    instance["currentStep"] = 3;
    await instance.text("step 1");
    expect(instance["currentStep"]).equals(3);
  });
  it("updatePercentage", () => {
    const instance = new Progress("Test next", 3);
    instance["currentPercentage"] = 0;
    instance["currentStep"] = 1;
    instance["updatePercentage"]();
    expect(instance["currentPercentage"]).gt(0).lte(100);
    instance["currentStep"] = 2;
    instance["updatePercentage"]();
    expect(instance["currentPercentage"]).gt(5).lte(100);
  });

  it("wholeMessage", () => {
    vi.spyOn(Utils, "getColorizedString").mockImplementation((messages) => {
      return messages.map((m) => m.content).join("");
    });
    vi.spyOn(Progress.prototype, "updatePercentage");
    const instance = new Progress("Test next", 3);
    instance["status"] = "running";
    expect(instance.wholeMessage()).not.contains("Failed");
    expect(instance.wholeMessage()).not.contains("Done");
    instance["status"] = "done";
    expect(instance.wholeMessage()).contains("Done");
    instance["status"] = "error";
    expect(instance.wholeMessage()).contains("Failed");
  });
});
