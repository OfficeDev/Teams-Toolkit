// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import { Validator } from "../../../src/component/configManager/validator";
import { chai, vi } from "vitest";
describe("yaml validator", () => {
  const validator = new Validator();
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not support invalid versions", () => {
    chai.expect(validator.isVersionSupported("invalid version")).to.be.false;
  });

  it("should support valid versions", () => {
    chai
      .expect(validator.supportedVersions())
      .contains("1.0.0")
      .and.contains("1.1.0")
      .and.contains("v1.2")
      .and.contains("v1.3");
  });
});
