// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import mockedEnv, { RestoreFn } from "mocked-env";
import { expect } from "../utils";
import { ok, err, FxError, UserError } from "@microsoft/teamsfx-api";
import ui from "../../../src/userInteraction";
import { M365Login } from "../../../src/commonlib/m365Login";
import M365TokenProviderUserPassword from "../../../src/commonlib/m365LoginUserPassword";
import M365TokenProviderWrapper from "../../../src/commonlib/M365TokenProviderWrapper";
import { vi } from "vitest";
describe("M365TokenProviderWrapper Tests", function () {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn = () => {};

  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  describe("getProvider", () => {
    it("should return M365Login when interactive is true", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockM365Login = {
        getAccessToken: vi.fn().mockResolvedValue(ok("token")),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const provider = M365TokenProviderWrapper.getProvider();

      expect(provider).to.equal(mockM365Login);
    });

    it("should return M365Login when interactive is false but env vars not set", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(false);
      // Explicitly ensure env vars are not set
      mockedEnvRestore = mockedEnv({
        M365_ACCOUNT_NAME: undefined,
        M365_ACCOUNT_PASSWORD: undefined,
      });
      const mockM365Login = {
        getAccessToken: vi.fn().mockResolvedValue(ok("token")),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const provider = M365TokenProviderWrapper.getProvider();

      expect(provider).to.equal(mockM365Login);
    });

    it("should return M365TokenProviderUserPassword when interactive is false and env vars are set", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(false);
      mockedEnvRestore = mockedEnv({
        M365_ACCOUNT_NAME: "test@test.com",
        M365_ACCOUNT_PASSWORD: "password",
      });

      const provider = M365TokenProviderWrapper.getProvider();

      expect(provider).to.equal(M365TokenProviderUserPassword);
    });
  });

  describe("getAccessToken", () => {
    it("should delegate to the provider's getAccessToken", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockToken = "test-token";
      const mockM365Login = {
        getAccessToken: vi.fn().mockResolvedValue(ok(mockToken)),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.getAccessToken({ scopes: ["scope1"] });

      expect(result.isOk()).to.be.true;
      expect(result._unsafeUnwrap()).to.equal(mockToken);
      expect(mockM365Login.getAccessToken.mock.calls.length === 1).to.be.true;
    });
  });

  describe("getJsonObject", () => {
    it("should delegate to the provider's getJsonObject", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockJson = { name: "test" };
      const mockM365Login = {
        getJsonObject: vi.fn().mockResolvedValue(ok(mockJson)),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.getJsonObject(
        { scopes: ["scope1"] },
        "tenantId"
      );

      expect(result.isOk()).to.be.true;
      expect(result._unsafeUnwrap()).to.deep.equal(mockJson);
      expect(mockM365Login.getJsonObject.mock.calls.length === 1).to.be.true;
    });
  });

  describe("getStatus", () => {
    it("should delegate to the provider's getStatus", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockStatus = { status: "signedIn", accountInfo: { upn: "test@test.com" } };
      const mockM365Login = {
        getStatus: vi.fn().mockResolvedValue(ok(mockStatus)),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.getStatus({ scopes: ["scope1"] });

      expect(result.isOk()).to.be.true;
      expect(result._unsafeUnwrap()).to.deep.equal(mockStatus);
      expect(mockM365Login.getStatus.mock.calls.length === 1).to.be.true;
    });
  });

  describe("setStatusChangeMap", () => {
    it("should delegate to the provider's setStatusChangeMap", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockM365Login = {
        setStatusChangeMap: vi.fn().mockResolvedValue(ok(true)),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const statusChange = async () => {};
      const result = await M365TokenProviderWrapper.setStatusChangeMap(
        "test",
        { scopes: ["scope1"] },
        statusChange,
        true
      );

      expect(result.isOk()).to.be.true;
      expect(mockM365Login.setStatusChangeMap.mock.calls.length === 1).to.be.true;
    });
  });

  describe("removeStatusChangeMap", () => {
    it("should delegate to the provider's removeStatusChangeMap", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockM365Login = {
        removeStatusChangeMap: vi.fn().mockResolvedValue(ok(true)),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.removeStatusChangeMap("test");

      expect(result.isOk()).to.be.true;
      expect(mockM365Login.removeStatusChangeMap.mock.calls.length === 1).to.be.true;
    });
  });

  describe("signout", () => {
    it("should delegate to the provider's signout", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockM365Login = {
        signout: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.signout();

      expect(result).to.be.true;
      expect(mockM365Login.signout.mock.calls.length === 1).to.be.true;
    });
  });

  describe("switchTenant", () => {
    it("should delegate to the provider's switchTenant", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockM365Login = {
        switchTenant: vi.fn().mockResolvedValue(ok("newTenantId")),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.switchTenant("newTenantId");

      expect(result.isOk()).to.be.true;
      expect(mockM365Login.switchTenant.mock.calls.length === 1).to.be.true;
    });
  });

  describe("getTenant", () => {
    it("should delegate to the provider's getTenant", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockTenantId = "test-tenant-id";
      const mockM365Login = {
        getTenant: vi.fn().mockResolvedValue(mockTenantId),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.getTenant();

      expect(result).to.equal(mockTenantId);
      expect(mockM365Login.getTenant.mock.calls.length === 1).to.be.true;
    });

    it("should return undefined when provider's getTenant returns undefined", async () => {
      vi.spyOn(ui, "interactive", "get").mockReturnValue(true);
      const mockM365Login = {
        getTenant: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(M365Login, "getInstance").mockReturnValue(mockM365Login as any);

      const result = await M365TokenProviderWrapper.getTenant();

      expect(result).to.be.undefined;
    });
  });
});
