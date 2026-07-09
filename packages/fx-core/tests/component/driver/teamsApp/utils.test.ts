// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { normalizePath } from "../../../../src/component/driver/teamsApp/utils/utils";
import { chai } from "vitest";

describe("utils", async () => {
  it("normalizePath: should use forward slash", () => {
    const res = normalizePath("resources\\test.yaml", true);
    chai.expect(res).equal("resources/test.yaml");
  });

  it("normalizePath: no need to convert", () => {
    const res = normalizePath("resources\\test.yaml", false);
    chai.expect(res).equal("resources\\test.yaml");
  });
});
