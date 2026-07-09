// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { renderMustache } from "../../../src/v4/runtime/renderMustache";
import { assert } from "vitest";

/**
 * Tests for the single v4 Mustache surface.
 *
 * Traces to docs/03-specs/operations/scaffolding/run-scaffold-pipeline.md AC-18
 * (body substitution by the render surface) and the render facts of
 * docs/03-specs/scenarios/da/create-mcp-server.md (the `${{…}}` env refs that
 * must survive render, the `{{#IsNoAuth}}` auth-branch selection).
 */
describe("v4 runtime — renderMustache", () => {
  it("AC-18: substitutes a producer-backed token from renderVars", () => {
    const result = renderMustache("name: {{appName}}", { appName: "Contoso" });
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, "name: Contoso");
    }
  });

  it("leaves an env ref `${{APP_NAME_SUFFIX}}` literal (no producer, resolved at provision)", () => {
    const result = renderMustache("{{appName}}${{APP_NAME_SUFFIX}}", { appName: "Contoso" });
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, "Contoso${{APP_NAME_SUFFIX}}");
    }
  });

  it("leaves a producer-less bare token literal (v3 escape-empty-variable parity)", () => {
    const result = renderMustache('"{{ServerName}}": {}', {});
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, '"{{ServerName}}": {}');
    }
  });

  it("renders the `{{#IsNoAuth}}` branch when the section var is truthy", () => {
    const template = "{{#IsNoAuth}}None{{/IsNoAuth}}{{^IsNoAuth}}OAuth{{/IsNoAuth}}";
    const result = renderMustache(template, { IsNoAuth: "true" });
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, "None");
    }
  });

  it("renders the `{{^IsNoAuth}}` branch when the section var is absent", () => {
    const template = "{{#IsNoAuth}}None{{/IsNoAuth}}{{^IsNoAuth}}OAuth{{/IsNoAuth}}";
    const result = renderMustache(template, {});
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, "OAuth");
    }
  });

  it("performs no HTML escaping (URLs and ampersands pass through verbatim)", () => {
    const result = renderMustache("url: {{url}}", { url: "https://x/y?a=1&b=2" });
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, "url: https://x/y?a=1&b=2");
    }
  });

  it("inserts a producer value containing `${{…}}` verbatim, never re-rendered", () => {
    const result = renderMustache('"reference_id": "{{MCPAuthRefId}}"', {
      MCPAuthRefId: "${{MCP_DA_AUTH_ID_APIGITHUBC}}",
    });
    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.strictEqual(result.value, '"reference_id": "${{MCP_DA_AUTH_ID_APIGITHUBC}}"');
    }
  });

  it("returns a SystemError for a malformed template body", () => {
    const result = renderMustache("{{#unclosed}}oops", {});
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.strictEqual(result.error.name, "RenderParseError");
    }
  });
});
