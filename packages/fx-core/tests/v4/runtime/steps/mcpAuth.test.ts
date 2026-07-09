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
import { assert } from "vitest";

/** A minimal in-memory `StepContext` whose read/write share one file map. */
function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  for (const [path, body] of Object.entries(initial)) {
    files.set(path, Buffer.from(body, "utf8"));
  }
  const ctx: StepContext = {
    read: (path) => files.get(path),
    write: (path, data) => {
      files.set(path, data);
    },
    manifestWrapper: () => ({ addAction: () => undefined }),
  };
  return { ctx, files };
}

function text(files: Map<string, Buffer>, path: string): string {
  return files.get(path)?.toString("utf8") ?? "";
}

const SERVER_URL = "https://api.github.com/mcp"; // namespace derives to apigithubc

describe("mcp-auth steps (v4)", () => {
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

    it("injects oauth/register as the first provision action for authType=oauth (SCN-CREATE-MCP-05)", async () => {
      const yml = ["version: v1.12", "provision:", "  - uses: teamsApp/create"].join("\n");
      const { ctx, files } = makeCtx({ "m365agents.yml": yml });
      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "oauth", mcpServerUrl: SERVER_URL },
        ctx
      );
      assert.isTrue(res.isOk());
      const out = text(files, "m365agents.yml");
      assert.include(out, "- uses: oauth/register");
      assert.include(out, "name: apigithubc");
      assert.include(out, "registrationId: MCP_DA_AUTH_ID_APIGITHUBC");
      // injected above the pre-existing action — it is the first provision entry
      assert.isBelow(out.indexOf("oauth/register"), out.indexOf("teamsApp/create"));
    });

    it("injects microsoftEntra/register for authType=entra-sso", async () => {
      const yml = ["provision:", "  - uses: teamsApp/create"].join("\n");
      const { ctx, files } = makeCtx({ "m365agents.yml": yml });
      const res = await mcpAuthInjectYmlAction.apply(
        { ymlPath: "m365agents.yml", authType: "entra-sso", mcpServerUrl: SERVER_URL },
        ctx
      );
      assert.isTrue(res.isOk());
      assert.include(text(files, "m365agents.yml"), "- uses: microsoftEntra/register");
    });

    it("is idempotent — a re-run does not duplicate the registration action", async () => {
      const yml = ["version: v1.12", "provision:", "  - uses: teamsApp/create"].join("\n");
      const { ctx, files } = makeCtx({ "m365agents.yml": yml });
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
