// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import {
  STEP_INJECT_YML_ACTION,
  STEP_PERSIST_CREDENTIAL_ENV,
  mcpAuthInjectYmlAction,
  mcpAuthPersistCredentialEnv,
} from "../../../../src/v4/runtime/steps/mcpAuth";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { mcpAuthScaffoldDeps } from "../../../../src/v4/mcp/mcpAuthScaffold";
import { NOOP_MANIFEST_WRAPPER } from "../../../../src/v4/runtime/runtimeRegistry";
import { afterEach, assert, beforeEach, vi } from "vitest";

/** A minimal in-memory `StepContext` whose read/write share one file map. */
function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
  warnings: string[];
} {
  const files = new Map<string, Buffer>();
  const warnings: string[] = [];
  for (const [path, body] of Object.entries(initial)) {
    files.set(path, Buffer.from(body, "utf8"));
  }
  const ctx = Object.assign(
    {
      read: (path: string) => files.get(path),
      write: (path: string, data: Buffer) => {
        files.set(path, data);
      },
      manifestWrapper: () => NOOP_MANIFEST_WRAPPER,
    },
    { warn: (message: string) => warnings.push(message) }
  );
  return { ctx, files, warnings };
}

function text(files: Map<string, Buffer>, path: string): string {
  return files.get(path)?.toString("utf8") ?? "";
}

const SERVER_URL = "https://api.github.com/mcp"; // namespace derives to apigithubc

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
        { ymlPath: "m365agents.yml", authType: "oauth", mcpServerUrl: SERVER_URL },
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
      assert.include(out, "configurationId: MCP_DA_AUTH_ID_APIGITHUBC");
      // oauth/register references ${{TEAMS_APP_ID}}, so it must run after teamsApp/create
      assert.isAbove(out.indexOf("oauth/register"), out.indexOf("teamsApp/create"));
    });

    it("injects oauth/register with identityProvider MicrosoftEntra for authType=entra-sso (no probe)", async () => {
      const { ctx, files } = makeCtx({ "m365agents.yml": PROVISION_YML });
      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "entra-sso", mcpServerUrl: SERVER_URL },
        ctx
      );
      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      const out = text(files, "m365agents.yml");
      assert.include(out, "uses: oauth/register");
      assert.include(out, "identityProvider: MicrosoftEntra");
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
      assert.lengthOf(warnings, 1);
      assert.include(warnings[0], "metadata unavailable");
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
        mcpAuthPersistCredentialEnv.validateParams({ authType: "oauth", mcpServerUrl: SERVER_URL })
      );
      assert.isString(mcpAuthPersistCredentialEnv.validateParams({ authType: "oauth" }));
    });

    it("appends MCP_DA_AUTH_ID_<NS> to env/.env.dev (SCN-CREATE-MCP-06)", async () => {
      const { ctx, files } = makeCtx({ "env/.env.dev": "TEAMSFX_ENV=dev\n" });
      const res = await mcpAuthPersistCredentialEnv.apply(
        { authType: "oauth", mcpServerUrl: SERVER_URL },
        ctx
      );
      assert.isTrue(res.isOk());
      const out = text(files, "env/.env.dev");
      assert.include(out, "TEAMSFX_ENV=dev");
      assert.include(out, "MCP_DA_AUTH_ID_APIGITHUBC=");
    });

    it("is idempotent — a re-run does not duplicate the variable", async () => {
      const { ctx, files } = makeCtx({ "env/.env.dev": "TEAMSFX_ENV=dev\n" });
      await mcpAuthPersistCredentialEnv.apply({ authType: "oauth", mcpServerUrl: SERVER_URL }, ctx);
      await mcpAuthPersistCredentialEnv.apply({ authType: "oauth", mcpServerUrl: SERVER_URL }, ctx);
      const occurrences = text(files, "env/.env.dev").match(/MCP_DA_AUTH_ID_APIGITHUBC=/g);
      assert.strictEqual(occurrences?.length, 1);
    });
  });
});
