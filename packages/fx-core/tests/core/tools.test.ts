// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { isValidProject } from "../../src/common/projectSettingsHelper";
import { chai } from "vitest";
describe("tools", () => {
  it("is not valid project", () => {
    chai.expect(isValidProject()).is.false;
  });
});
