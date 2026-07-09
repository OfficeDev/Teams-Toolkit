// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { decodeClaimsChallenge, parseChallenges } from "../../../src/commonlib/common/utils";
import { chai, vi } from "vitest";

describe("test utils", () => {
  const sandbox: any = vi;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parseChallenges", () => {
    const claims =
      "eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTYwMzc0MjgwMCJ9fX0";
    const wwwAuthenticate = `Bearer authorization_uri="https://login.windows-ppe.net/", error="invalid_token", error_description="User session has been revoked", claims="${claims}"`;

    const claimsChallenge = parseChallenges(wwwAuthenticate);

    chai.assert.equal(claims, claimsChallenge.claims);
  });

  it("decodeClaimsChallenge", () => {
    const claims =
      "eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTYwMzc0MjgwMCJ9fX0=";
    const decoded = `{"access_token":{"nbf":{"essential":true, "value":"1603742800"}}}`;

    const decodedClaims = decodeClaimsChallenge(claims);

    chai.assert.equal(decoded, decodedClaims);
  });
});
