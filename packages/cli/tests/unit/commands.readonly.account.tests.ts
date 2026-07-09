// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLIContext, err, ok, signedIn, signedOut } from "@microsoft/teamsfx-api";
import { UserCancelError } from "@microsoft/teamsfx-core";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";
import mockedEnv, { RestoreFn } from "mocked-env";
import { accountLogoutCommand, accountShowCommand, accountUtils } from "../../src/commands/models";
import AzureTokenProvider from "../../src/commonlib/azureLogin";
import AzureTokenCIProvider from "../../src/commonlib/azureLoginCI";
import { AzureSpCrypto } from "../../src/commonlib/cacheAccess";
import { logger } from "../../src/commonlib/logger";
import M365TokenProvider from "../../src/commonlib/M365TokenProviderWrapper";
import { assert, expect, vi } from "vitest";

describe("CLI read-only commands account", () => {
  const sandbox = vi;
  let messages: string[] = [];

  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true as any);
    vi.spyOn(process.stderr, "write").mockReturnValue(true as any);
    vi.spyOn(logger, "info").mockImplementation(async (message: string) => {
      messages.push(message);
      return true;
    });
    vi.spyOn(logger, "error").mockImplementation(async (message: string) => {
      messages.push(message);
      return true;
    });
    vi.spyOn(logger, "outputInfo").mockImplementation(async (message: string) => {
      messages.push(message);
      return true;
    });
    vi.spyOn(logger, "outputError").mockImplementation(async (message: string) => {
      messages.push(message);
      return true;
    });
  });

  afterEach(() => {
    messages = [];
    vi.restoreAllMocks();
  });

  describe("AccountUtils", async () => {
    it("outputAccountInfoOffline", async () => {
      const res = accountUtils.outputAccountInfoOffline("m365", "xxx");
      assert.isTrue(res);
    });
    it("outputM365Info login success", async () => {
      vi.spyOn(M365TokenProvider, "getJsonObject").mockResolvedValue(ok({ upn: "fakename" }));
      vi.spyOn(M365TokenProvider, "getTenant").mockResolvedValue(undefined);
      const res = await accountUtils.outputM365Info("login");
      assert.isTrue(res);
    });
    context("outputM365Info login under hosting tenant", () => {
      let mocks: RestoreFn;
      beforeEach(() => {
        mocks = mockedEnv({ TEAMSFX_MULTI_TENANT: "true" });
        vi.spyOn(M365TokenProvider, "getJsonObject").mockResolvedValue(
          ok({ unique_name: "fakename" })
        );
        vi.spyOn(M365TokenProvider, "getTenant").mockResolvedValue("faked_tenant_id");
      });

      afterEach(() => {
        mocks();
      });

      it("specified tenant name displayed", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok("token"));
        vi.spyOn(tools, "listAllTenants").mockResolvedValue([
          { tenantId: "faked_tid_1" },
          { tenantId: "faked_tenant_id", displayName: "Test tenant" },
        ]);
        const res = await accountUtils.outputM365Info("login", "faked_tenant_id");
        assert.isTrue(res);
      });

      it("specified tenant not match", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok("token"));
        vi.spyOn(tools, "listAllTenants").mockResolvedValue([
          { tenantId: "faked_tid_1" },
          { tenantId: "faked_tid_2" },
        ]);
        const res = await accountUtils.outputM365Info("login", "faked_tenant_id");
        assert.isTrue(res);
      });

      it("failed to retrieve access token", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(
          err("failed to get access token" as any)
        );
        const res = await accountUtils.outputM365Info("login", "faked_tenant_id");
        assert.isTrue(res);
      });
    });
    it("outputM365Info login fail", async () => {
      vi.spyOn(M365TokenProvider, "getJsonObject").mockResolvedValue(err(new UserCancelError()));
      const res = await accountUtils.outputM365Info("login");
      assert.isFalse(res);
    });
    it("outputM365Info show success", async () => {
      vi.spyOn(M365TokenProvider, "getJsonObject").mockResolvedValue(ok({ upn: "fakename" }));
      vi.spyOn(M365TokenProvider, "getTenant").mockResolvedValue("faked_tenant_id");
      vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok("token"));
      vi.spyOn(tools, "listAllTenants").mockResolvedValue([
        { tenantId: "faked_tid_1" },
        { tenantId: "faked_tenant_id" },
      ]);
      const res = await accountUtils.outputM365Info("show");
      assert.isTrue(res);
    });
    it("outputM365Info show fail", async () => {
      vi.spyOn(M365TokenProvider, "getJsonObject").mockResolvedValue(err(new UserCancelError()));
      const res = await accountUtils.outputM365Info("show");
      assert.isFalse(res);
    });
    it("outputAzureInfo login", async () => {
      vi.spyOn(AzureTokenCIProvider, "load").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "init").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "getJsonObject").mockResolvedValue({ upn: "test" });
      vi.spyOn(AzureTokenCIProvider, "listSubscriptions").mockResolvedValue([]);
      const res = await accountUtils.outputAzureInfo("login", undefined, true);
      assert.isTrue(res);
    });
    it("outputAzureInfo login with tenant parameter", async () => {
      const mockedEnvRestore = mockedEnv({ TEAMSFX_MULTI_TENANT: "true" });
      vi.spyOn(AzureTokenCIProvider, "load").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "init").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "switchTenant").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "getJsonObject").mockResolvedValue({ unique_name: "test" });
      vi.spyOn(AzureTokenCIProvider, "listSubscriptions").mockResolvedValue([]);
      vi.spyOn(AzureTokenCIProvider, "getTenant").mockResolvedValue("faked_tenant_id");
      vi.spyOn(AzureTokenCIProvider, "getIdentityCredentialAsync").mockResolvedValue({
        getToken: async () => {
          return Promise.resolve({ token: "faked_token" });
        },
      } as any);
      vi.spyOn(tools, "listAllTenants").mockResolvedValue([
        { tenantId: "faked_tid_1" },
        { tenantId: "faked_tenant_id" },
      ]);
      const res = await accountUtils.outputAzureInfo("login", "faked_tenant_id", true);
      assert.isTrue(res);
      mockedEnvRestore();
    });
    it("outputAzureInfo login fail with tenant parameter - invalid token", async () => {
      const mockedEnvRestore = mockedEnv({ TEAMSFX_MULTI_TENANT: "true" });
      vi.spyOn(AzureTokenCIProvider, "load").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "init").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "switchTenant").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "getJsonObject").mockResolvedValue({ unique_name: "test" });
      vi.spyOn(AzureTokenCIProvider, "listSubscriptions").mockResolvedValue([]);
      vi.spyOn(AzureTokenCIProvider, "getTenant").mockResolvedValue("faked_tenant_id");
      vi.spyOn(AzureTokenCIProvider, "getIdentityCredentialAsync").mockResolvedValue(undefined);
      const res = await accountUtils.outputAzureInfo("login", "faked_tenant_id", true);
      assert.isTrue(res);
      mockedEnvRestore();
    });
    it("outputAzureInfo login fail with tenant parameter - tenant mismatch", async () => {
      const mockedEnvRestore = mockedEnv({ TEAMSFX_MULTI_TENANT: "true" });
      vi.spyOn(AzureTokenCIProvider, "load").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "init").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "switchTenant").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "getJsonObject").mockResolvedValue({ unique_name: "test" });
      vi.spyOn(AzureTokenCIProvider, "listSubscriptions").mockResolvedValue([]);
      vi.spyOn(AzureTokenCIProvider, "getTenant").mockResolvedValue("faked_tenant_id");
      vi.spyOn(AzureTokenCIProvider, "getIdentityCredentialAsync").mockResolvedValue({
        getToken: async () => {
          return Promise.resolve({ token: "faked_token" });
        },
      } as any);
      vi.spyOn(tools, "listAllTenants").mockResolvedValue([
        { tenantId: "faked_tid_1" },
        { tenantId: "faked_tid_2" },
      ]);
      const res = await accountUtils.outputAzureInfo("login", "faked_tenant_id", true);
      assert.isTrue(res);
      mockedEnvRestore();
    });
    it("outputAzureInfo login fail", async () => {
      vi.spyOn(AzureTokenProvider, "getJsonObject").mockResolvedValue(undefined);
      const res = await accountUtils.outputAzureInfo("login");
      assert.isFalse(res);
    });
    it("outputAzureInfo show", async () => {
      vi.spyOn(AzureTokenProvider, "getJsonObject").mockResolvedValue({ upn: "test" });
      vi.spyOn(AzureTokenProvider, "listSubscriptions").mockResolvedValue([]);
      const res = await accountUtils.outputAzureInfo("show");
      assert.isTrue(res);
    });
    it("outputAzureInfo show fail", async () => {
      vi.spyOn(AzureTokenProvider, "getJsonObject").mockResolvedValue(undefined);
      const res = await accountUtils.outputAzureInfo("show");
      assert.isFalse(res);
    });
    it("outputAzureInfo show with sp login", async () => {
      vi.spyOn(AzureSpCrypto, "checkAzureSPFile").mockResolvedValue(true);
      vi.spyOn(AzureTokenCIProvider, "load").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "init").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "switchTenant").mockResolvedValue();
      vi.spyOn(AzureTokenCIProvider, "getJsonObject").mockResolvedValue({ unique_name: "test" });
      vi.spyOn(AzureTokenCIProvider, "listSubscriptions").mockResolvedValue([]);
      vi.spyOn(AzureTokenCIProvider, "getTenant").mockResolvedValue("faked_tenant_id");
      const getTokenFake = {
        getToken: async (scope: string) => {
          return Promise.resolve({ token: "faked_token" });
        },
      };
      const getTokenSpy = vi.spyOn(getTokenFake, "getToken");
      vi.spyOn(AzureTokenCIProvider, "getIdentityCredentialAsync").mockResolvedValue(
        getTokenFake as any
      );
      vi.spyOn(tools, "listAllTenants").mockResolvedValue([
        { tenantId: "faked_tid_1" },
        { tenantId: "faked_tid_2" },
      ]);
      const res = await accountUtils.outputAzureInfo("login", "faked_tenant_id", true);
      assert.isTrue(res);
      expect(getTokenSpy).toHaveBeenCalledExactlyOnceWith(
        "https://management.core.windows.net/.default"
      );
    });
  });
  describe("accountShowCommand", async () => {
    it("both signedOut", async () => {
      vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(ok({ status: signedOut }));
      vi.spyOn(AzureTokenProvider, "getStatus").mockResolvedValue({ status: signedOut });
      messages = [];
      const ctx: CLIContext = {
        command: {
          ...accountShowCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth list`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountShowCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("both signedIn and checkIsOnline = true", async () => {
      vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(ok({ status: signedIn }));
      vi.spyOn(AzureTokenProvider, "getStatus").mockResolvedValue({ status: signedIn });
      vi.spyOn(accountUtils, "checkIsOnline").mockResolvedValue(true);
      const outputM365Info = vi.spyOn(accountUtils, "outputM365Info").mockResolvedValue();
      const outputAzureInfo = vi.spyOn(accountUtils, "outputAzureInfo").mockResolvedValue();
      messages = [];
      const ctx: CLIContext = {
        command: {
          ...accountShowCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth list`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountShowCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      assert.isTrue(outputM365Info.mock.calls.length === 1);
      assert.isTrue(outputAzureInfo.mock.calls.length === 1);
    });
    it("both signedIn and checkIsOnline = false", async () => {
      vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(
        ok({ status: signedIn, accountInfo: { upn: "xxx" } })
      );
      vi.spyOn(AzureTokenProvider, "getStatus").mockResolvedValue({
        status: signedIn,
        accountInfo: { upn: "xxx" },
      });
      vi.spyOn(accountUtils, "checkIsOnline").mockResolvedValue(false);
      const outputAccountInfoOffline = vi.spyOn(accountUtils, "outputAccountInfoOffline");
      messages = [];
      const ctx: CLIContext = {
        command: {
          ...accountShowCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth list`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountShowCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      assert.isTrue(outputAccountInfoOffline.mock.calls.length === 2);
    });
    it("M365TokenProvider.getStatus() returns error", async () => {
      vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(err(new UserCancelError()));
      messages = [];
      const ctx: CLIContext = {
        command: {
          ...accountShowCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth list`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountShowCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("accountLogoutCommand", async () => {
    it("azure success", async () => {
      vi.spyOn(AzureTokenProvider, "signout").mockResolvedValue(true);
      const ctx: CLIContext = {
        command: {
          ...accountLogoutCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth logout`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: ["azure"],
        telemetryProperties: {},
      };
      messages = [];
      const res = await accountLogoutCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("azure fail", async () => {
      vi.spyOn(AzureTokenProvider, "signout").mockResolvedValue(false);
      const ctx: CLIContext = {
        command: {
          ...accountLogoutCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth logout`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: ["azure"],
        telemetryProperties: {},
      };
      messages = [];
      const res = await accountLogoutCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("m365 success", async () => {
      vi.spyOn(M365TokenProvider, "signout").mockResolvedValue(true);
      const ctx: CLIContext = {
        command: {
          ...accountLogoutCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth logout`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: ["m365"],
        telemetryProperties: {},
      };
      const res = await accountLogoutCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("m365 fail", async () => {
      vi.spyOn(M365TokenProvider, "signout").mockResolvedValue(false);
      const ctx: CLIContext = {
        command: {
          ...accountLogoutCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth logout`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: ["m365"],
        telemetryProperties: {},
      };
      messages = [];
      const res = await accountLogoutCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
});
