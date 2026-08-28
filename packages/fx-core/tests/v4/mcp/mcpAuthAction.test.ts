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

  it("injects Custom OAuth with placeholders when the endpoints could not be discovered", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "oauth",
      endpoints: {},
    });

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.isTrue(result._unsafeUnwrap().oauthUrlPlaceholderUsed);
    assert.deepEqual(provisionActions(result._unsafeUnwrap().yaml)[1].with, {
      name: "apigithubc",
      appId: "${{TEAMS_APP_ID}}",
      flow: "authorizationCode",
      authorizationUrl: "<PLEASE_FILL_IN_AUTHORIZATION_URL>",
      tokenUrl: "<PLEASE_FILL_IN_TOKEN_URL>",
      identityProvider: "Custom",
      baseUrl: "https://api.github.com/mcp",
    });
  });

  it("does not flag Entra as needing OAuth URLs", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "entra-sso",
      endpoints: {},
    });

    assert.isFalse(result._unsafeUnwrap().oauthUrlPlaceholderUsed);
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

  it("SCN-ADD-MCP-15: injects API-key registration for bearer-token", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "bearer-token",
      endpoints: {},
    });

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.deepEqual(provisionActions(result._unsafeUnwrap().yaml)[1], {
      uses: "apiKey/register",
      with: {
        name: "apigithubc",
        appId: "${{TEAMS_APP_ID}}",
        baseUrl: "https://api.github.com/mcp",
      },
      writeToEnvironmentFile: { registrationId: "MCP_DA_AUTH_ID_APIGITHUBC" },
    });
    assert.isFalse(result._unsafeUnwrap().oauthUrlPlaceholderUsed);
    assert.isFalse(result._unsafeUnwrap().wellKnownUrlPlaceholderUsed);
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

  it("keeps the YAML unchanged when auth is disabled", () => {
    const result = injectMcpAuthActionYaml(BASE_YML, {
      ...BASE_ARGS,
      authType: "none",
      endpoints: {},
    });

    assert.deepEqual(result._unsafeUnwrap(), {
      yaml: BASE_YML,
      wellKnownUrlPlaceholderUsed: false,
      oauthUrlPlaceholderUsed: false,
    });
  });

  it("rejects malformed YAML", () => {
    const result = injectMcpAuthActionYaml("provision: [", {
      ...BASE_ARGS,
      authType: "oauth",
      endpoints: {},
    });

    assert.isTrue(result.isErr());
    assert.include(result._unsafeUnwrapErr().message, "not valid YAML");
  });

  it.each(["name: missing", "provision: invalid"])(
    "rejects a missing or non-sequence provision section: %s",
    (yaml) => {
      const result = injectMcpAuthActionYaml(yaml, {
        ...BASE_ARGS,
        authType: "oauth",
        endpoints: {},
      });

      assert.isTrue(result.isErr());
      assert.include(result._unsafeUnwrapErr().message, "provision sequence");
    }
  );

  it.each([
    "provision:\n  - ignored\n  - uses: teamsApp/create",
    "provision:\n  - uses: teamsApp/create\n    writeToEnvironmentFile: invalid",
    "provision:\n  - uses: teamsApp/create\n    writeToEnvironmentFile:\n      teamsAppId: 42",
  ])("rejects a Teams app action without a usable app id", (yaml) => {
    const result = injectMcpAuthActionYaml(yaml, {
      ...BASE_ARGS,
      authType: "oauth",
      endpoints: {},
    });

    assert.isTrue(result.isErr());
    assert.include(result._unsafeUnwrapErr().message, "does not expose a Teams app id");
  });

  it.each(["v1.13", "v1.14", "invalid"])(
    "preserves an existing DCR schema version: %s",
    (version) => {
      const result = injectMcpAuthActionYaml(BASE_YML.replace("v1.12", version), {
        ...BASE_ARGS,
        authType: "oauth-dynamic",
        endpoints: {},
      });

      const output = parse(result._unsafeUnwrap().yaml);
      assert.strictEqual(output.version, version);
      assert.isTrue(result._unsafeUnwrap().wellKnownUrlPlaceholderUsed);
    }
  );

  it("ignores an existing OAuth action with malformed registration output", () => {
    const yaml = [
      "version: v1.12",
      "provision:",
      "  - uses: oauth/register",
      "    writeToEnvironmentFile: invalid",
      "  - uses: teamsApp/create",
      "    writeToEnvironmentFile:",
      "      teamsAppId: TEAMS_APP_ID",
    ].join("\n");

    const result = injectMcpAuthActionYaml(yaml, {
      ...BASE_ARGS,
      authType: "oauth",
      endpoints: {},
    });

    assert.lengthOf(provisionActions(result._unsafeUnwrap().yaml), 3);
  });

  it("preserves a missing schema version when injecting DCR", () => {
    const yaml = BASE_YML.split("\n").slice(1).join("\n");

    const result = injectMcpAuthActionYaml(yaml, {
      ...BASE_ARGS,
      authType: "oauth-dynamic",
      endpoints: {},
    });

    const output = parse(result._unsafeUnwrap().yaml);
    assert.isUndefined(output.version);
    assert.isTrue(result._unsafeUnwrap().wellKnownUrlPlaceholderUsed);
  });

  it("SCN-CREATE-MCP-05: is idempotent by registration id", () => {
    const args = { ...BASE_ARGS, authType: "oauth", endpoints: {} };
    const first = injectMcpAuthActionYaml(BASE_YML, args)._unsafeUnwrap();
    const second = injectMcpAuthActionYaml(first.yaml, args)._unsafeUnwrap();

    assert.lengthOf(provisionActions(second.yaml), 2);
  });

  it("SCN-ADD-MCP-05: bearer-token is idempotent by registration id", () => {
    const args = { ...BASE_ARGS, authType: "bearer-token", endpoints: {} };
    const first = injectMcpAuthActionYaml(BASE_YML, args)._unsafeUnwrap();
    const second = injectMcpAuthActionYaml(first.yaml, args)._unsafeUnwrap();

    assert.lengthOf(provisionActions(second.yaml), 2);
  });
});
