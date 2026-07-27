// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import { err } from "neverthrow";
import {
  STEP_INJECT_YML_ACTION,
  STEP_PERSIST_CREDENTIAL_ENV,
  mcpAuthInjectYmlAction,
  mcpAuthPersistCredentialEnv,
} from "../../../../src/v4/runtime/steps/mcpAuth";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { mcpAuthScaffoldDeps } from "../../../../src/v4/mcp/mcpAuthScaffold";
import { NOOP_MANIFEST_WRAPPER } from "../../../../src/v4/runtime/runtimeRegistry";
import { createInMemoryRuntime } from "../../../../src/v4/runtime/inMemoryRuntime";
import { afterEach, assert, beforeEach, vi } from "vitest";

/** A minimal in-memory `StepContext` whose read/write share one file map. */
function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
  secretEnvironmentVariables: Map<string, Map<string, string>>;
  warnings: string[];
} {
  const runtime = createInMemoryRuntime();
  const warnings: string[] = [];
  for (const [path, body] of Object.entries(initial)) {
    runtime.files.set(path, Buffer.from(body, "utf8"));
  }
  const ctx = Object.assign(
    {
      read: runtime.port.read,
      write: runtime.port.write,
      writeEnvironment: runtime.port.writeEnvironment,
      manifestWrapper: () => NOOP_MANIFEST_WRAPPER,
    },
    { warn: (message: string) => warnings.push(message) }
  );
  return {
    ctx,
    files: runtime.files,
    secretEnvironmentVariables: runtime.secretEnvironmentVariables,
    warnings,
  };
}

function text(files: Map<string, Buffer>, path: string): string {
  return files.get(path)?.toString("utf8") ?? "";
}

const SERVER_URL = "https://api.github.com/mcp"; // namespace derives to apigithubc
const CLIENT_ID_ENV_VAR = "MCP_DA_OAUTH_CLIENT_ID_APIGITHUBC";
const CLIENT_SECRET_ENV_VAR = "SECRET_MCP_DA_OAUTH_CLIENT_SECRET_APIGITHUBC";
const SCOPE_ENV_VAR = "MCP_DA_OAUTH_SCOPE_APIGITHUBC";

/** A realistic provision skeleton: the auth action is inserted after `teamsApp/create`, which the
 * v3 injector locates via its `writeToEnvironmentFile.teamsAppId`. */
const PROVISION_YML = [
  "version: v1.12",
  "provision:",
  "  - uses: teamsApp/create",
  "    with:",
  "      name: test-app",
  "    writeToEnvironmentFile:",
  "      teamsAppId: TEAMS_APP_ID",
].join("\n");

describe("mcp-auth steps (v4)", () => {
  beforeEach(() => {
    // `oauth`/`oauth-dynamic` probe the server for auth metadata; stub the network so unit tests
    // stay offline and deterministic. `entra-sso`/`none` never call these.
    vi.spyOn(mcpAuthScaffoldDeps, "probeMCPServerAuth").mockResolvedValue({
      requiresAuth: true,
      authMetadataUrl: "https://auth.example.com/.well-known/oauth-protected-resource",
    });
    vi.spyOn(mcpAuthScaffoldDeps, "resolveMCPOAuthMetadata").mockResolvedValue({
      authorizationUrl: "https://auth.example.com/authorize",
      tokenUrl: "https://auth.example.com/token",
      wellKnownUrl: "https://auth.example.com/.well-known/oauth-authorization-server",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe(STEP_INJECT_YML_ACTION, () => {
    it("validateParams: passes when ymlPath/authType/mcpServerUrl are strings", () => {
      assert.isUndefined(
        mcpAuthInjectYmlAction.validateParams({
          ymlPath: "m365agents.yml",
          authType: "oauth",
          mcpServerUrl: SERVER_URL,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret",
        })
      );
    });

    it("validateParams: reports each missing string parameter", () => {
      assert.isString(
        mcpAuthInjectYmlAction.validateParams({ authType: "oauth", mcpServerUrl: SERVER_URL })
      );
      assert.isString(
        mcpAuthInjectYmlAction.validateParams({
          ymlPath: "m365agents.yml",
          mcpServerUrl: SERVER_URL,
        })
      );
      assert.isString(
        mcpAuthInjectYmlAction.validateParams({ ymlPath: "m365agents.yml", authType: "oauth" })
      );
    });

    it("injects oauth/register (Custom) with resolved endpoints after teamsApp/create for authType=oauth (SCN-CREATE-MCP-05)", async () => {
      const { ctx, files } = makeCtx({ "m365agents.yml": PROVISION_YML });
      const res = await mcpAuthInjectYmlAction.apply(
        {
          ymlPath: "m365agents.yml",
          authType: "oauth",
          mcpServerUrl: SERVER_URL,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret",
          oauthScopes: "read:user",
        },
        ctx
      );
      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      const out = text(files, "m365agents.yml");
      assert.include(out, "uses: oauth/register");
      assert.include(out, "name: apigithubc");
      assert.include(out, "appId: ${{TEAMS_APP_ID}}");
      assert.include(out, "identityProvider: Custom");
      assert.include(out, "authorizationUrl:");
      assert.include(out, "tokenUrl:");
      assert.include(out, `clientId: \${{${CLIENT_ID_ENV_VAR}}}`);
      assert.include(out, `clientSecret: \${{${CLIENT_SECRET_ENV_VAR}}}`);
      assert.include(out, `scope: \${{${SCOPE_ENV_VAR}}}`);
      assert.include(out, "configurationId: MCP_DA_AUTH_ID_APIGITHUBC");
      // oauth/register references ${{TEAMS_APP_ID}}, so it must run after teamsApp/create
      assert.isAbove(out.indexOf("oauth/register"), out.indexOf("teamsApp/create"));
    });

    it("injects oauth/register with identityProvider MicrosoftEntra for authType=entra-sso (no probe)", async () => {
      const { ctx, files } = makeCtx({ "m365agents.yml": PROVISION_YML });
      const res = await mcpAuthInjectYmlAction.apply(
        {
          ymlPath: "m365agents.yml",
          authType: "entra-sso",
          mcpServerUrl: SERVER_URL,
          entraClientId: "entra-client-id",
        },
        ctx
      );
      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      const out = text(files, "m365agents.yml");
      assert.include(out, "uses: oauth/register");
      assert.include(out, "identityProvider: MicrosoftEntra");
      assert.include(out, `clientId: \${{${CLIENT_ID_ENV_VAR}}}`);
      assert.notInclude(out, "clientSecret:");
      // entra-sso needs no authorization-server probe
      assert.strictEqual(vi.mocked(mcpAuthScaffoldDeps.probeMCPServerAuth).mock.calls.length, 0);
    });

    it("injects dcr/register (v1.13) for authType=oauth-dynamic", async () => {
      const { ctx, files } = makeCtx({ "m365agents.yml": PROVISION_YML });
      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "oauth-dynamic", mcpServerUrl: SERVER_URL },
        ctx
      );
      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      const out = text(files, "m365agents.yml");
      assert.include(out, "uses: dcr/register");
      assert.include(out, "configurationId: MCP_DA_AUTH_ID_APIGITHUBC");
      assert.include(out, "version: v1.13");
    });

    it("warns and keeps the action when OAuth metadata discovery fails", async () => {
      vi.mocked(mcpAuthScaffoldDeps.probeMCPServerAuth).mockRejectedValue(
        new Error("metadata unavailable")
      );
      const { ctx, warnings } = makeCtx({ "m365agents.yml": PROVISION_YML });

      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "oauth", mcpServerUrl: SERVER_URL },
        ctx
      );

      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      assert.lengthOf(warnings, 2);
      assert.include(warnings[0], "metadata unavailable");
      // the action is still injected, with placeholders the developer must replace
      assert.include(warnings[1], SERVER_URL);
    });

    it("warns when oauth-dynamic requires manual replacement of the well-known URL", async () => {
      vi.mocked(mcpAuthScaffoldDeps.probeMCPServerAuth).mockRejectedValue(
        new Error("metadata unavailable")
      );
      const { ctx, warnings } = makeCtx({ "m365agents.yml": PROVISION_YML });

      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "oauth-dynamic", mcpServerUrl: SERVER_URL },
        ctx
      );

      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      assert.lengthOf(warnings, 2);
      assert.include(warnings[0], "metadata unavailable");
      assert.include(warnings[1], SERVER_URL);
    });

    it("is idempotent — a re-run does not duplicate the registration action", async () => {
      const { ctx, files } = makeCtx({ "m365agents.yml": PROVISION_YML });
      const params = { ymlPath: "m365agents.yml", authType: "oauth", mcpServerUrl: SERVER_URL };

      await mcpAuthInjectYmlAction.apply(params, ctx);
      await mcpAuthInjectYmlAction.apply(params, ctx);

      const occurrences = text(files, "m365agents.yml").match(/oauth\/register/g);
      assert.strictEqual(occurrences?.length, 1);
    });

    it("errors when the yml was not produced by the render phase", async () => {
      const { ctx } = makeCtx();
      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "oauth", mcpServerUrl: SERVER_URL },
        ctx
      );
      assert.isTrue(res.isErr());
      assert.instanceOf(res._unsafeUnwrapErr(), SystemError);
    });
  });

  describe(STEP_PERSIST_CREDENTIAL_ENV, () => {
    it("validateParams: passes / reports the missing parameter", () => {
      assert.isUndefined(
        mcpAuthPersistCredentialEnv.validateParams({
          authType: "oauth",
          mcpServerUrl: SERVER_URL,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret",
        })
      );
      assert.isString(mcpAuthPersistCredentialEnv.validateParams({ authType: "oauth" }));
    });

    it("appends MCP_DA_AUTH_ID_<NS> to env/.env.dev (SCN-CREATE-MCP-06)", async () => {
      const { ctx, files, secretEnvironmentVariables } = makeCtx({
        "env/.env.dev": "TEAMSFX_ENV=dev\n",
      });
      const res = await mcpAuthPersistCredentialEnv.apply(
        {
          authType: "oauth",
          mcpServerUrl: SERVER_URL,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret",
          oauthScopes: "read:user",
        },
        ctx
      );
      assert.isTrue(res.isOk());
      const out = text(files, "env/.env.dev");
      assert.include(out, "TEAMSFX_ENV=dev");
      assert.include(out, "MCP_DA_AUTH_ID_APIGITHUBC=");
      assert.include(out, `${CLIENT_ID_ENV_VAR}=client-id`);
      assert.include(out, `${SCOPE_ENV_VAR}=read:user`);
      assert.notInclude(out, "client-secret");
      assert.strictEqual(
        secretEnvironmentVariables.get("dev")?.get(CLIENT_SECRET_ENV_VAR),
        "client-secret"
      );
    });

    it("is idempotent — a re-run does not duplicate the variable", async () => {
      const { ctx, files } = makeCtx({ "env/.env.dev": "TEAMSFX_ENV=dev\n" });
      await mcpAuthPersistCredentialEnv.apply({ authType: "oauth", mcpServerUrl: SERVER_URL }, ctx);
      await mcpAuthPersistCredentialEnv.apply({ authType: "oauth", mcpServerUrl: SERVER_URL }, ctx);
      const occurrences = text(files, "env/.env.dev").match(/MCP_DA_AUTH_ID_APIGITHUBC=/g);
      assert.strictEqual(occurrences?.length, 1);
    });

    it("propagates an environment-writer failure", async () => {
      const { ctx } = makeCtx();
      const failure = new SystemError({
        source: "Scaffold",
        name: "EnvironmentWriteFailed",
        message: "environment write failed",
      });
      ctx.writeEnvironment = () => Promise.resolve(err(failure));

      const result = await mcpAuthPersistCredentialEnv.apply(
        {
          authType: "oauth",
          mcpServerUrl: SERVER_URL,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret",
        },
        ctx
      );

      assert.isTrue(result.isErr());
      assert.strictEqual(result._unsafeUnwrapErr(), failure);
    });
  });
});
