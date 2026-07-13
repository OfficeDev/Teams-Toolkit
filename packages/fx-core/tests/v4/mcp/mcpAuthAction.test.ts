// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { parse } from "yaml";
import { assert } from "vitest";
import { injectMcpAuthActionYaml } from "../../../src/v4/mcp/mcpAuthAction";

const BASE_YML = [
  "version: v1.12",
  "provision:",
  "  - uses: teamsApp/create",
  "    writeToEnvironmentFile:",
  "      teamsAppId: TEAMS_APP_ID",
].join("\n");

const BASE_ARGS = {
  authName: "apigithubc",
  registrationId: "MCP_DA_AUTH_ID_APIGITHUBC",
  mcpServerUrl: "https://api.github.com/mcp",
};

function provisionActions(yaml: string): any[] {
  return parse(yaml).provision;
}

describe("v4 MCP auth YAML action", () => {
  it("SCN-CREATE-MCP-05: injects the complete Custom OAuth action", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "oauth",
      endpoints: {
        authorizationUrl: "https://auth.example.com/authorize",
        tokenUrl: "https://auth.example.com/token",
        refreshUrl: "https://auth.example.com/refresh",
      },
    });

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const action = provisionActions(result._unsafeUnwrap().yaml)[1];
    assert.deepEqual(action, {
      uses: "oauth/register",
      with: {
        name: "apigithubc",
        appId: "${{TEAMS_APP_ID}}",
        flow: "authorizationCode",
        authorizationUrl: "https://auth.example.com/authorize",
        tokenUrl: "https://auth.example.com/token",
        refreshUrl: "https://auth.example.com/refresh",
        identityProvider: "Custom",
        baseUrl: "https://api.github.com/mcp",
      },
      writeToEnvironmentFile: { configurationId: "MCP_DA_AUTH_ID_APIGITHUBC" },
    });
  });

  it("SCN-CREATE-MCP-16: injects Entra without credential references", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "entra-sso",
      endpoints: {},
    });

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.deepEqual(provisionActions(result._unsafeUnwrap().yaml)[1].with, {
      name: "apigithubc",
      appId: "${{TEAMS_APP_ID}}",
      flow: "authorizationCode",
      identityProvider: "MicrosoftEntra",
      baseUrl: "https://api.github.com/mcp",
    });
  });

  it("SCN-CREATE-MCP-17: injects DCR and raises the schema floor", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "oauth-dynamic",
      endpoints: {
        wellKnownUrl: "https://auth.example.com/.well-known/oauth-authorization-server",
      },
    });

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const output = parse(result._unsafeUnwrap().yaml);
    assert.strictEqual(output.version, "v1.13");
    assert.deepEqual(output.provision[1], {
      uses: "dcr/register",
      with: {
        name: "apigithubc",
        appId: "${{TEAMS_APP_ID}}",
        applicableToApps: "AnyApp",
        targetAudience: "HomeTenant",
        wellKnownAuthorizationServer:
          "https://auth.example.com/.well-known/oauth-authorization-server",
        targetUrlsShouldStartWith: ["https://api.github.com/mcp"],
      },
      writeToEnvironmentFile: { configurationId: "MCP_DA_AUTH_ID_APIGITHUBC" },
    });
  });

  it("rejects an unknown auth type", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "bogus",
      endpoints: {},
    });

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "McpAuthInjectFailed");
  });

  it("SCN-CREATE-MCP-05: is idempotent by registration id", () => {
    const args = { ...BASE_ARGS, authType: "oauth", endpoints: {} };
    const first = injectMcpAuthActionYaml(BASE_YML, args)._unsafeUnwrap();
    const second = injectMcpAuthActionYaml(first.yaml, args)._unsafeUnwrap();

    assert.lengthOf(provisionActions(second.yaml), 2);
  });
});
