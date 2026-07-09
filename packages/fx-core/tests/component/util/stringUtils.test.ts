// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Siglud <siglud@gmail.com>
 */
import { maskSecretFromEnv } from "../../../src/common/stringUtils";
import { assert } from "vitest";

describe("stringUtils.maskSecretFromEnv", () => {
  afterEach(() => {
    delete process.env["SECRET_KEY"];
    delete process.env["NON_SECRET_KEY"];
  });

  it("should mask secret values in stdout", () => {
    process.env["SECRET_KEY"] = "secretValue";
    process.env["NON_SECRET_KEY"] = "This is a";
    const stdout = "This is a secretValue";
    const maskedStdout = maskSecretFromEnv(stdout, "***");
    assert.equal(maskedStdout, "This is a ***");
  });

  it("should not mask non-secret values in stdout", () => {
    process.env["NON_SECRET_KEY"] = "nonSecretValue";
    const stdout = "This is a nonSecretValue";
    const maskedStdout = maskSecretFromEnv(stdout, "***");
    assert.equal(maskedStdout, stdout);
  });

  it("should not mask secret values if they are not in stdout", () => {
    process.env["SECRET_KEY"] = "secretValue";
    const stdout = "This is a stdout";
    const maskedStdout = maskSecretFromEnv(stdout, "***");
    assert.equal(maskedStdout, stdout);
  });

  it("should not mask secret values if they are not in process.env", () => {
    const stdout = "This is a secretValue";
    const maskedStdout = maskSecretFromEnv(stdout, "***");
    assert.equal(maskedStdout, stdout);
  });

  it("contains secret value but is blank", () => {
    process.env["SECRET_KEY"] = "";
    const maskedStdout = maskSecretFromEnv("This is a secretValue", "***");
    assert.equal(maskedStdout, "This is a secretValue");
  });
});
