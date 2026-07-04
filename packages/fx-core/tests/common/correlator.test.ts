// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Correlator } from "../../src/common/correlator";
import { chai } from "vitest";

describe("Correlator", () => {
  const func = () => {};
  it("setId", async () => {
    const setedId = Correlator.setId();
    const getId = Correlator.getId();
    chai.assert.equal(setedId, getId);
  });

  it("run when id is set", () => {
    const setedId = Correlator.setId();
    Correlator.run(func);
    const getId = Correlator.getId();
    chai.assert.equal(setedId, getId);
  });

  it("run when id is not set", () => {
    Correlator.run(func);
    const getId = Correlator.getId();
    chai.assert.isDefined(getId);
  });

  it("setId adopts a valid externally-provided UUID", () => {
    const externalId = "11111111-1111-4111-8111-111111111111";
    const setedId = Correlator.setId(externalId);
    chai.assert.equal(setedId, externalId);
    chai.assert.equal(Correlator.getId(), externalId);
  });

  it("setId mints a fresh UUID when the provided id is malformed", () => {
    const setedId = Correlator.setId("not-a-uuid");
    chai.assert.notEqual(setedId, "not-a-uuid");
    chai.assert.equal(Correlator.getId(), setedId);
  });

  it("setId mints a fresh UUID when no id is provided", () => {
    const setedId = Correlator.setId();
    chai.assert.isNotEmpty(setedId);
    chai.assert.equal(Correlator.getId(), setedId);
  });
});
