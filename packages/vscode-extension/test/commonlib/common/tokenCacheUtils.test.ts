import { assert } from "vitest";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AccountInfo } from "@azure/msal-node";
import { getAccountByHomeId } from "../../../src/commonlib/common/tokenCacheUtils";

describe("tokenCacheUtils", () => {
  describe("getAccountByHomeId", () => {
    const mockAccount1: AccountInfo = {
      homeAccountId: "account-1",
      environment: "login.windows.net",
      tenantId: "tenant-1",
      username: "user1@example.com",
      localAccountId: "local-1",
      name: "User One",
      idTokenClaims: {},
    };

    const mockAccount2: AccountInfo = {
      homeAccountId: "account-2",
      environment: "login.windows.net",
      tenantId: "tenant-2",
      username: "user2@example.com",
      localAccountId: "local-2",
      name: "User Two",
      idTokenClaims: {},
    };

    const mockAccount3: AccountInfo = {
      homeAccountId: "account-3",
      environment: "login.windows.net",
      tenantId: "tenant-3",
      username: "user3@example.com",
      localAccountId: "local-3",
      name: "User Three",
      idTokenClaims: {},
    };

    it("should return the matching account when homeAccountId exists", () => {
      const allAccounts = [mockAccount1, mockAccount2, mockAccount3];
      const result = getAccountByHomeId("account-2", allAccounts);

      assert.isNotNull(result);
      assert.equal(result?.homeAccountId, "account-2");
      assert.equal(result?.username, "user2@example.com");
    });

    it("should return null when homeAccountId does not exist in allAccounts", () => {
      const allAccounts = [mockAccount1, mockAccount2, mockAccount3];
      const result = getAccountByHomeId("non-existent-id", allAccounts);

      assert.isNull(result);
    });

    it("should return null when homeAccountId is empty string", () => {
      const allAccounts = [mockAccount1, mockAccount2, mockAccount3];
      const result = getAccountByHomeId("", allAccounts);

      assert.isNull(result);
    });

    it("should return null when allAccounts is empty array", () => {
      const result = getAccountByHomeId("account-1", []);

      assert.isNull(result);
    });

    it("should return null when allAccounts is null", () => {
      const result = getAccountByHomeId("account-1", null as any);

      assert.isNull(result);
    });

    it("should return null when allAccounts is undefined", () => {
      const result = getAccountByHomeId("account-1", undefined as any);

      assert.isNull(result);
    });

    it("should return null when homeAccountId is undefined", () => {
      const allAccounts = [mockAccount1, mockAccount2, mockAccount3];
      const result = getAccountByHomeId(undefined as any, allAccounts);

      assert.isNull(result);
    });
  });
});
