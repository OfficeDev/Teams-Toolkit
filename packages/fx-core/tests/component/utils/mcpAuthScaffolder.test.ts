// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, Inputs, ok, Platform, UserError } from "@microsoft/teamsfx-api";

import { assert, expect, vi } from "vitest";
import { ActionInjector } from "../../../src/component/configManager/actionInjector";
import { envUtil } from "../../../src/component/utils/envUtil";
import {
  deriveMCPManifestOAuth,
  injectMCPAuthActionToYml,
  MCP_DCR_WELL_KNOWN_URL_PLACEHOLDER,
  mcpAuthScaffolderDeps,
  persistMCPAuthCredentialEnvVars,
  resolveMCPAuthEndpoints,
} from "../../../src/component/utils/mcpAuthScaffolder";
import { QuestionNames } from "../../../src/question/questionNames";

describe("mcpAuthScaffolder", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("deriveMCPManifestOAuth", () => {
    it("returns OAuthPluginVault block for oauth with registration id", () => {
      const result = deriveMCPManifestOAuth("oauth", "MCP_DA_AUTH_ID_FOO");
      assert.deepEqual(result, {
        type: "OAuthPluginVault",
        reference_id: "${{MCP_DA_AUTH_ID_FOO}}",
      });
    });

    it("returns block for oauth-dynamic with registration id", () => {
      const result = deriveMCPManifestOAuth("oauth-dynamic", "ID1");
      assert.deepEqual(result, { type: "OAuthPluginVault", reference_id: "${{ID1}}" });
    });

    it("returns block for entra-sso with registration id", () => {
      const result = deriveMCPManifestOAuth("entra-sso", "ID2");
      assert.deepEqual(result, { type: "OAuthPluginVault", reference_id: "${{ID2}}" });
    });

    it("returns undefined for none auth type", () => {
      assert.isUndefined(deriveMCPManifestOAuth("none", "ID3"));
    });

    it("returns undefined when auth type is missing", () => {
      assert.isUndefined(deriveMCPManifestOAuth(undefined, "ID4"));
    });

    it("returns undefined when registration id is missing", () => {
      assert.isUndefined(deriveMCPManifestOAuth("oauth", undefined));
    });
  });

  describe("resolveMCPAuthEndpoints", () => {
    const baseInputs: Inputs = { platform: Platform.VSCode };

    it("returns empty for entra-sso", async () => {
      const stub = vi.spyOn(mcpAuthScaffolderDeps, "resolveMCPOAuthMetadata");
      const result = await resolveMCPAuthEndpoints("entra-sso", baseInputs);
      assert.deepEqual(result, {});
      assert.isTrue(stub.mock.calls.length === 0);
    });

    it("returns empty for none", async () => {
      const stub = vi.spyOn(mcpAuthScaffolderDeps, "resolveMCPOAuthMetadata");
      const result = await resolveMCPAuthEndpoints("none", baseInputs);
      assert.deepEqual(result, {});
      assert.isTrue(stub.mock.calls.length === 0);
    });

    it("returns empty for undefined auth type", async () => {
      const stub = vi.spyOn(mcpAuthScaffolderDeps, "resolveMCPOAuthMetadata");
      const result = await resolveMCPAuthEndpoints(undefined, baseInputs);
      assert.deepEqual(result, {});
      assert.isTrue(stub.mock.calls.length === 0);
    });

    it("resolves endpoints for oauth via metadata url", async () => {
      const stub = vi.spyOn(mcpAuthScaffolderDeps, "resolveMCPOAuthMetadata").mockResolvedValue({
        authorizationUrl: "https://auth/authorize",
        tokenUrl: "https://auth/token",
        refreshUrl: "https://auth/token",
        wellKnownUrl: "https://auth/.well-known/oauth-authorization-server",
      });
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.MCPForDAAuthMetadataUrl]: "https://example.com/metadata",
      };
      const result = await resolveMCPAuthEndpoints("oauth", inputs);
      assert.deepEqual(result, {
        authorizationUrl: "https://auth/authorize",
        tokenUrl: "https://auth/token",
        refreshUrl: "https://auth/token",
        wellKnownUrl: "https://auth/.well-known/oauth-authorization-server",
      });
      expect(stub).toHaveBeenCalledExactlyOnceWith("https://example.com/metadata", undefined);
    });

    it("resolves endpoints for oauth-dynamic via well-known url", async () => {
      const stub = vi.spyOn(mcpAuthScaffolderDeps, "resolveMCPOAuthMetadata").mockResolvedValue({
        authorizationUrl: "https://auth/authorize",
        tokenUrl: "https://auth/token",
        refreshUrl: undefined,
        wellKnownUrl: "https://auth/.well-known/oauth-authorization-server",
      });
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.MCPForDAAuthWellKnownUrl]:
          "https://auth/.well-known/oauth-authorization-server",
      };
      const result = await resolveMCPAuthEndpoints("oauth-dynamic", inputs);
      assert.equal(result.wellKnownUrl, "https://auth/.well-known/oauth-authorization-server");
      expect(stub).toHaveBeenCalledExactlyOnceWith(
        undefined,
        "https://auth/.well-known/oauth-authorization-server"
      );
    });
  });

  describe("injectMCPAuthActionToYml", () => {
    const baseArgs = {
      ymlPath: "/proj/m365agents.yml",
      authName: "server1",
      registrationId: "MCP_DA_AUTH_ID_SERVER1",
      mcpServerUrl: "https://example.com/mcp",
    };

    it("is a no-op for none", async () => {
      const dcrStub = vi.spyOn(ActionInjector, "injectCreateDcrActionForMCP").mockResolvedValue();
      const oauthStub = vi
        .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
        .mockResolvedValue();
      const result = await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "none",
        endpoints: {},
      });
      assert.deepEqual(result, {});
      assert.isTrue(dcrStub.mock.calls.length === 0);
      assert.isTrue(oauthStub.mock.calls.length === 0);
    });

    it("injects DCR action with resolved well-known url", async () => {
      const dcrStub = vi.spyOn(ActionInjector, "injectCreateDcrActionForMCP").mockResolvedValue();
      const result = await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "oauth-dynamic",
        endpoints: { wellKnownUrl: "https://auth/.well-known/oauth-authorization-server" },
      });
      assert.deepEqual(result, {});
      expect(dcrStub).toHaveBeenCalledExactlyOnceWith(
        baseArgs.ymlPath,
        baseArgs.authName,
        baseArgs.registrationId,
        baseArgs.mcpServerUrl,
        "https://auth/.well-known/oauth-authorization-server"
      );
    });

    it("injects DCR action with placeholder when well-known url is missing", async () => {
      const dcrStub = vi.spyOn(ActionInjector, "injectCreateDcrActionForMCP").mockResolvedValue();
      const result = await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "oauth-dynamic",
        endpoints: {},
      });
      assert.deepEqual(result, { wellKnownUrlPlaceholderUsed: true });
      assert.equal(dcrStub.mock.calls[0][4], MCP_DCR_WELL_KNOWN_URL_PLACEHOLDER);
    });

    it("injects OAuth action with credential env refs when persisting (oauth)", async () => {
      const oauthStub = vi
        .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
        .mockResolvedValue();
      const result = await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "oauth",
        endpoints: {
          authorizationUrl: "https://auth/authorize",
          tokenUrl: "https://auth/token",
          refreshUrl: "https://auth/token",
        },
        persistCredentialEnvRefs: true,
        serverName: "SERVER1",
      });
      assert.deepEqual(result, {});
      assert.isTrue(oauthStub.mock.calls.length === 1);
      assert.deepEqual(oauthStub.mock.calls[0][8], {
        clientIdEnvName: "MCP_DA_OAUTH_CLIENT_ID_SERVER1",
        clientSecretEnvName: "SECRET_MCP_DA_OAUTH_CLIENT_SECRET_SERVER1",
        scopeEnvName: "MCP_DA_OAUTH_SCOPE_SERVER1",
      });
    });

    it("injects OAuth action with only client-id env ref for entra-sso", async () => {
      const oauthStub = vi
        .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
        .mockResolvedValue();
      await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "entra-sso",
        endpoints: {},
        persistCredentialEnvRefs: true,
        serverName: "SERVER1",
      });
      assert.deepEqual(oauthStub.mock.calls[0][8], {
        clientIdEnvName: "MCP_DA_OAUTH_CLIENT_ID_SERVER1",
      });
    });

    it("injects OAuth action without credential env refs when not persisting", async () => {
      const oauthStub = vi
        .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
        .mockResolvedValue();
      await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "oauth",
        endpoints: {},
      });
      assert.isUndefined(oauthStub.mock.calls[0][8]);
    });

    it("injects OAuth action without credential env refs when serverName is missing", async () => {
      const oauthStub = vi
        .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
        .mockResolvedValue();
      await injectMCPAuthActionToYml({
        ...baseArgs,
        authType: "oauth",
        endpoints: {},
        persistCredentialEnvRefs: true,
      });
      assert.isUndefined(oauthStub.mock.calls[0][8]);
    });
  });

  describe("persistMCPAuthCredentialEnvVars", () => {
    it("is a no-op for oauth-dynamic", async () => {
      const listStub = vi.spyOn(envUtil, "listEnv");
      await persistMCPAuthCredentialEnvVars({
        projectPath: "/proj",
        authType: "oauth-dynamic",
        serverName: "S1",
        clientId: "id",
      });
      assert.isTrue(listStub.mock.calls.length === 0);
    });

    it("is a no-op for none", async () => {
      const listStub = vi.spyOn(envUtil, "listEnv");
      await persistMCPAuthCredentialEnvVars({
        projectPath: "/proj",
        authType: "none",
        serverName: "S1",
      });
      assert.isTrue(listStub.mock.calls.length === 0);
    });

    it("returns before listing envs when no credentials provided", async () => {
      const listStub = vi.spyOn(envUtil, "listEnv");
      await persistMCPAuthCredentialEnvVars({
        projectPath: "/proj",
        authType: "oauth",
        serverName: "S1",
      });
      assert.isTrue(listStub.mock.calls.length === 0);
    });

    it("writes client id, secret and scopes for oauth across all envs", async () => {
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "test"]));
      const writeStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await persistMCPAuthCredentialEnvVars({
        projectPath: "/proj",
        authType: "oauth",
        serverName: "S1",
        clientId: "the-id",
        clientSecret: "the-secret",
        scopes: "scope1 scope2",
      });
      assert.isTrue(writeStub.mock.calls.length === 2);
      assert.deepEqual(writeStub.mock.calls[0][2], {
        MCP_DA_OAUTH_CLIENT_ID_S1: "the-id",
        SECRET_MCP_DA_OAUTH_CLIENT_SECRET_S1: "the-secret",
        MCP_DA_OAUTH_SCOPE_S1: "scope1 scope2",
      });
      assert.equal(writeStub.mock.calls[0][1], "dev");
      assert.equal(writeStub.mock.calls[1][1], "test");
    });

    it("writes only client id for entra-sso", async () => {
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      const writeStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await persistMCPAuthCredentialEnvVars({
        projectPath: "/proj",
        authType: "entra-sso",
        serverName: "S1",
        clientId: "the-id",
        clientSecret: "ignored",
        scopes: "ignored",
      });
      assert.deepEqual(writeStub.mock.calls[0][2], {
        MCP_DA_OAUTH_CLIENT_ID_S1: "the-id",
      });
    });

    it("defaults to dev env when listEnv returns empty", async () => {
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok([]));
      const writeStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await persistMCPAuthCredentialEnvVars({
        projectPath: "/proj",
        authType: "oauth",
        serverName: "S1",
        clientId: "the-id",
      });
      expect(writeStub).toHaveBeenCalledTimes(1);
      expect(writeStub.mock.calls[0][0]).toBe("/proj");
      expect(writeStub.mock.calls[0][1]).toBe("dev");
    });

    it("throws when listEnv fails", async () => {
      const error = new UserError("ut", "ListEnvError", "list failed");
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(err(error));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      try {
        await persistMCPAuthCredentialEnvVars({
          projectPath: "/proj",
          authType: "oauth",
          serverName: "S1",
          clientId: "the-id",
        });
        assert.fail("should have thrown");
      } catch (e: any) {
        assert.equal(e.name, "ListEnvError");
      }
    });

    it("throws when writeEnv fails", async () => {
      const error = new UserError("ut", "WriteEnvError", "write failed");
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(err(error));
      try {
        await persistMCPAuthCredentialEnvVars({
          projectPath: "/proj",
          authType: "oauth",
          serverName: "S1",
          clientId: "the-id",
        });
        assert.fail("should have thrown");
      } catch (e: any) {
        assert.equal(e.name, "WriteEnvError");
      }
    });
  });
});
