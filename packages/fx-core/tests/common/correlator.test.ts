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
});
