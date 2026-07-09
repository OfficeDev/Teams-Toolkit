// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "../utils";

import {
  getInternalFlagFromTokenClaims,
  getUsernameFromClaims,
} from "../../../src/commonlib/accountInfoUtils";

describe("accountInfoUtils", () => {
  it("getUsernameFromClaims should return empty string when claims is undefined", () => {
    const result = getUsernameFromClaims(undefined);
    expect(result).to.equal("");
  });

  it("getUsernameFromClaims should use fallback order upn -> unique_name -> preferred_username -> email", () => {
    expect(
      getUsernameFromClaims({ upn: "u@microsoft.com", unique_name: "x", email: "y" })
    ).to.equal("u@microsoft.com");
    expect(
      getUsernameFromClaims({ unique_name: "unique@test.com", email: "email@test.com" })
    ).to.equal("unique@test.com");
    expect(
      getUsernameFromClaims({ preferred_username: "preferred@test.com", email: "email@test.com" })
    ).to.equal("preferred@test.com");
    expect(getUsernameFromClaims({ email: "email@test.com" })).to.equal("email@test.com");
  });

  it("getInternalFlagFromTokenClaims should return true for microsoft accounts", () => {
    const result = getInternalFlagFromTokenClaims({ preferred_username: "User@Microsoft.com" });
    expect(result).to.equal("true");
  });

  it("getInternalFlagFromTokenClaims should return false for non-microsoft or missing account", () => {
    expect(getInternalFlagFromTokenClaims({ email: "user@example.com" })).to.equal("false");
    expect(getInternalFlagFromTokenClaims({})).to.equal("false");
  });
});
