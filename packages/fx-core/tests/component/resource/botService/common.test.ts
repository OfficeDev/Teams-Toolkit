// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as utils from "../../../../src/component/resource/botService/common";
import { chai } from "vitest";

describe("Common Utils", () => {
  describe("isHttpCodeOkOrCreated", () => {
    it("Expect True", () => {
      // Arrange
      const code = 200;

      // Act
      const result = utils.isHttpCodeOkOrCreated(code);

      // Assert
      chai.assert.isTrue(result);
    });
  });
});
