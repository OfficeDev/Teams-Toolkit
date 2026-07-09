// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandOption } from "@microsoft/teamsfx-api";
import { FeatureFlags, featureFlagManager } from "@microsoft/teamsfx-core";
import { gateMCPDAAuthTypeChoices, gateMCPDACredentialOptions } from "../../../src/commands/common";
import { assert, vi } from "vitest";

describe("commands/common MCP-for-DA gating", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  type FeatureFlagLike = { name: string };

  function stubEnabledFlags(enabled: FeatureFlagLike[]) {
    const enabledNames = new Set(enabled.map((f) => f.name));
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: FeatureFlagLike) =>
      enabledNames.has(flag.name)
    );
  }

  function authTypeOption(): CLICommandOption {
    return {
      name: "mcp-da-auth-type",
      type: "string",
      description: "auth type",
      choices: ["oauth", "entra-sso", "none"],
    };
  }

  function authTypeChoices(options: CLICommandOption[]): string[] | undefined {
    const option = options.find((o) => o.name === "mcp-da-auth-type");
    return option && option.type === "string" ? option.choices : undefined;
  }

  describe("gateMCPDAAuthTypeChoices", () => {
    it("includes oauth-dynamic only when both DT and DCR flags are on", () => {
      stubEnabledFlags([FeatureFlags.MCPForDADT, FeatureFlags.MCPForDADCR]);
      const options = [authTypeOption()];
      gateMCPDAAuthTypeChoices(options);
      assert.deepEqual(authTypeChoices(options), ["oauth", "oauth-dynamic", "entra-sso", "none"]);
    });

    it("excludes oauth-dynamic when only DT flag is on", () => {
      stubEnabledFlags([FeatureFlags.MCPForDADT]);
      const options = [authTypeOption()];
      gateMCPDAAuthTypeChoices(options);
      assert.deepEqual(authTypeChoices(options), ["oauth", "entra-sso", "none"]);
    });

    it("excludes oauth-dynamic when both flags are off", () => {
      stubEnabledFlags([]);
      const options = [authTypeOption()];
      gateMCPDAAuthTypeChoices(options);
      assert.deepEqual(authTypeChoices(options), ["oauth", "entra-sso", "none"]);
    });
  });

  describe("gateMCPDACredentialOptions", () => {
    const credentialNames = ["mcp-da-client-id", "mcp-da-client-secret", "mcp-da-scopes"];

    function baseOptions(): CLICommandOption[] {
      return [authTypeOption()];
    }

    it("adds credential options when DT flag is on", () => {
      stubEnabledFlags([FeatureFlags.MCPForDADT]);
      const result = gateMCPDACredentialOptions(baseOptions());
      for (const name of credentialNames) {
        assert.isTrue(
          result.some((o) => o.name === name),
          `expected ${name} to be present`
        );
      }
    });

    it("omits credential options when DT flag is off", () => {
      stubEnabledFlags([]);
      const result = gateMCPDACredentialOptions(baseOptions());
      for (const name of credentialNames) {
        assert.isFalse(
          result.some((o) => o.name === name),
          `expected ${name} to be absent`
        );
      }
    });

    it("is idempotent: does not duplicate credential options on repeated calls", () => {
      stubEnabledFlags([FeatureFlags.MCPForDADT]);
      const once = gateMCPDACredentialOptions(baseOptions());
      const twice = gateMCPDACredentialOptions(once);
      for (const name of credentialNames) {
        assert.equal(
          twice.filter((o) => o.name === name).length,
          1,
          `expected exactly one ${name}`
        );
      }
    });

    it("removes previously-injected credential options when DT flag flips off", () => {
      stubEnabledFlags([FeatureFlags.MCPForDADT]);
      const withCreds = gateMCPDACredentialOptions(baseOptions());
      vi.restoreAllMocks();
      stubEnabledFlags([]);
      const withoutCreds = gateMCPDACredentialOptions(withCreds);
      for (const name of credentialNames) {
        assert.isFalse(
          withoutCreds.some((o) => o.name === name),
          `expected ${name} to be removed`
        );
      }
    });

    it("does not mutate the input array", () => {
      stubEnabledFlags([FeatureFlags.MCPForDADT]);
      const input = baseOptions();
      const before = input.length;
      gateMCPDACredentialOptions(input);
      assert.equal(input.length, before);
    });
  });
});
