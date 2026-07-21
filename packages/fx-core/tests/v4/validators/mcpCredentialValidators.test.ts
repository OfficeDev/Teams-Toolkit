// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  mcpEntraClientIdRequiredValidator,
  mcpOauthClientIdRequiredValidator,
  mcpOauthClientSecretRequiredValidator,
} from "../../../src/v4/validators/mcpCredentialValidators";
import { assert } from "vitest";

describe("MCP credential validators (v4)", () => {
  it("CCI-03c: required MCP credentials reject blank values and accept non-empty values", () => {
    for (const validator of [
      mcpOauthClientIdRequiredValidator,
      mcpOauthClientSecretRequiredValidator,
      mcpEntraClientIdRequiredValidator,
    ]) {
      assert.isString(validator(" ", {}));
      assert.isUndefined(validator("credential", {}));
    }
  });
});
