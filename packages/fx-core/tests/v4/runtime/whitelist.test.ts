// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { evaluateExpression } from "../../../src/v4/expression/evaluateExpression";
import { assert } from "vitest";
import { FeatureFlagName } from "../../../src/common/featureFlags";
import {
  createExpressionPort,
  deriveMcpServerName,
  mcpAuthRef,
  mcpNamespace,
  pathDelimiter,
  safeProjectNameLowerCase,
} from "../../../src/v4/runtime/whitelist";

/**
 * Tests for the closed render-context function whitelist (ADR-0016 decision 3)
 * and the real ExpressionRuntimePort that exposes it.
 *
 * Traces to docs/03-specs/scenarios/da/create-mcp-server.md
 * (SCN-CREATE-MCP-02 namespace, SCN-CREATE-MCP-05 reference_id).
 */
describe("v4 runtime — whitelist functions + ExpressionRuntimePort", () => {
  describe("deriveMcpServerName", () => {
    it("SCN-CREATE-MCP-02: derives `apigithubc` from a github host", () => {
      assert.strictEqual(deriveMcpServerName("https://api.github.com/mcp"), "apigithubc");
    });

    it("strips non-alphanumerics and truncates to ten characters", () => {
      assert.strictEqual(deriveMcpServerName("https://api.githubcopilot.com/mcp/"), "apigithubc");
    });

    it("falls back to `mcpServer` for an empty URL", () => {
      assert.strictEqual(deriveMcpServerName(""), "mcpServer");
    });

    it("falls back to `mcpServer` for a non-URL string", () => {
      assert.strictEqual(deriveMcpServerName("not a url"), "mcpServer");
    });
  });

  describe("mcpNamespace / mcpAuthRef", () => {
    it("SCN-CREATE-MCP-02: mcpNamespace is the derived namespace", () => {
      assert.strictEqual(mcpNamespace("https://api.github.com/mcp"), "apigithubc");
    });

    it("SCN-CREATE-MCP-05: mcpAuthRef is the literal `${{MCP_DA_AUTH_ID_<NS>}}` env ref", () => {
      assert.strictEqual(
        mcpAuthRef("https://api.github.com/mcp"),
        "${{MCP_DA_AUTH_ID_APIGITHUBC}}"
      );
    });
  });

  describe("safeProjectNameLowerCase", () => {
    it("SCN-CREATE-APIPLUGIN-01: lower-cases a simple app name (the package.json name)", () => {
      assert.strictEqual(safeProjectNameLowerCase("MyAgent"), "myagent");
    });

    it("strips every non-alphanumeric character and lower-cases the rest", () => {
      assert.strictEqual(safeProjectNameLowerCase("My Agent! 123"), "myagent123");
    });

    it("is deterministic and locale-independent for an ASCII app name", () => {
      assert.strictEqual(safeProjectNameLowerCase("REPAIR_Agent"), "repairagent");
    });
  });

  describe("pathDelimiter", () => {
    it("SCN-CREATE-MESSAGE-EXTENSION-03: returns the host PATH delimiter", () => {
      assert.strictEqual(pathDelimiter(), process.platform === "win32" ? ";" : ":");
    });
  });

  describe("createExpressionPort", () => {
    it("exposes the whitelisted functions and nothing else", () => {
      const port = createExpressionPort();
      assert.isFunction(port.functions("mcpNamespace"));
      assert.isFunction(port.functions("mcpAuthRef"));
      assert.isFunction(port.functions("safeProjectNameLowerCase"));
      assert.isFunction(port.functions("pathDelimiter"));
      assert.isUndefined(port.functions("notWhitelisted"));
    });

    it("reads feature flags through the injected reader", () => {
      const port = createExpressionPort((name) => name === "TEAMSFX_MCP_FOR_DA_DT");
      assert.isTrue(port.flags("TEAMSFX_MCP_FOR_DA_DT"));
      assert.isFalse(port.flags("TEAMSFX_MCP_FOR_DA_DCR"));
    });

    it("uses the shared fx-core feature flag semantics by default", () => {
      const originalV4 = process.env[FeatureFlagName.V4Enabled];
      const originalDcr = process.env[FeatureFlagName.MCPForDADCR];
      try {
        const port = createExpressionPort();
        process.env[FeatureFlagName.V4Enabled] = "1";
        assert.isTrue(port.flags(FeatureFlagName.V4Enabled));

        process.env[FeatureFlagName.V4Enabled] = "TRUE";
        assert.isTrue(port.flags(FeatureFlagName.V4Enabled));

        delete process.env[FeatureFlagName.MCPForDADCR];
        assert.isTrue(port.flags(FeatureFlagName.MCPForDADCR));
      } finally {
        if (originalV4 === undefined) {
          delete process.env[FeatureFlagName.V4Enabled];
        } else {
          process.env[FeatureFlagName.V4Enabled] = originalV4;
        }
        if (originalDcr === undefined) {
          delete process.env[FeatureFlagName.MCPForDADCR];
        } else {
          process.env[FeatureFlagName.MCPForDADCR] = originalDcr;
        }
      }
    });

    it("SCN-CREATE-MCP-02: the evaluator resolves `mcpNamespace(mcpServerUrl)` through the port", () => {
      const port = createExpressionPort();
      const result = evaluateExpression(
        { expr: "mcpNamespace(mcpServerUrl)" },
        { mcpServerUrl: "https://api.github.com/mcp" },
        port
      );
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.strictEqual(result.value, "apigithubc");
      }
    });

    it("SCN-CREATE-MCP-05: the evaluator resolves `mcpAuthRef(mcpServerUrl)` through the port", () => {
      const port = createExpressionPort();
      const result = evaluateExpression(
        { expr: "mcpAuthRef(mcpServerUrl)" },
        { mcpServerUrl: "https://api.github.com/mcp" },
        port
      );
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.strictEqual(result.value, "${{MCP_DA_AUTH_ID_APIGITHUBC}}");
      }
    });

    it("SCN-CREATE-APIPLUGIN-01: the evaluator resolves `safeProjectNameLowerCase(appName)` through the port", () => {
      const port = createExpressionPort();
      const result = evaluateExpression(
        { expr: "safeProjectNameLowerCase(appName)" },
        { appName: "MyAgent" },
        port
      );
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.strictEqual(result.value, "myagent");
      }
    });

    it("SCN-CREATE-MESSAGE-EXTENSION-03: the evaluator resolves `pathDelimiter()` through the port", () => {
      const port = createExpressionPort();
      const result = evaluateExpression({ expr: "pathDelimiter()" }, {}, port);
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.strictEqual(result.value, process.platform === "win32" ? ";" : ":");
      }
    });
  });
});
