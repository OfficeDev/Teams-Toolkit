// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { afterEach, assert } from "vitest";
import { getLocalizedString } from "../../src/common/localizeUtils";
import {
  getResourceGroupNameFromResourceId,
  loadingDefaultPlaceholder,
  loadingOptionsPlaceholder,
  maskSecret,
  maskSecretFromEnv,
} from "../../src/common/stringUtils";
import { FailedToParseResourceIdError } from "../../src/error";

describe("stringUtils", () => {
  afterEach(async () => {
    // Cleanup if needed
  });
  describe("maskSecret", () => {
    it("happy path", async () => {
      const input =
        "Bearer eyJ0eXAiOiJKV1QiLCJub25jZSI6IkZQQVpfd0ZXc2EwdFpCcGMtcXJITFBzQjd6QnJSWmpzbnFTMW";
      const output = maskSecret(input);
      assert.equal(output, "Bearer <REDACTED:secret>");
    });
    it("input undefined", async () => {
      const output = maskSecret();
      assert.equal(output, "");
    });
  });

  describe("maskSecretFromEnv", () => {
    it("should handle special regex characters in environment variable values", () => {
      const originalEnv = process.env;
      try {
        process.env.SECRET_TEST = "+91O/snBU6On";

        const input = "The secret value is +91O/snBU6On and should be masked";
        const output = maskSecretFromEnv(input);

        assert.equal(output, "The secret value is <REDACTED:secret> and should be masked");
      } finally {
        process.env = originalEnv;
      }
    });

    it("should handle multiple special regex characters", () => {
      const originalEnv = process.env;
      try {
        process.env.SECRET_REGEX = ".*+?^${}()|[]\\";

        const input = "Secret with special chars: .*+?^${}()|[]\\";
        const output = maskSecretFromEnv(input);

        assert.equal(output, "Secret with special chars: <REDACTED:secret>");
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe("loadingOptionsPlaceholder", () => {
    it("happy path", async () => {
      const output = loadingOptionsPlaceholder();
      assert.equal(output, getLocalizedString("ui.select.LoadingOptionsPlaceholder"));
    });
  });

  describe("loadingDefaultPlaceholder", () => {
    it("happy path", async () => {
      const output = loadingDefaultPlaceholder();
      assert.equal(output, getLocalizedString("ui.select.LoadingDefaultPlaceholder"));
    });
  });

  describe("getResourceGroupNameFromResourceId", () => {
    it("error", async () => {
      try {
        getResourceGroupNameFromResourceId("abc");
      } catch (e) {
        assert.isTrue(e instanceof FailedToParseResourceIdError);
      }
    });
  });
});
