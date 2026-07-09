// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  EXPR_UNDECLARED_IDENTIFIER,
  ExpressionRuntimePort,
  WhitelistFn,
} from "../../../src/v4/expression/evaluateExpression";
import {
  RCTX_SHADOWS_CALLER_FLOOR,
  ReplaceMapEntry,
  buildRenderContext,
} from "../../../src/v4/renderContext/buildRenderContext";

/**
 * Tests for docs/03-specs/operations/scaffolding/build-render-context.md.
 * One `it` per RCTX-* acceptance-criteria row (+ one INV-3 propagation case).
 * v4-isolated (no v3 import).
 */

// --- pure helpers mirroring the fx-core URL derivation the real whitelist
// delegates to (single source: deriveMCPNamespaceFromUrl). In-test only. ---
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "mcpServer";
  }
}
function deriveServerName(url: string): string {
  const stripped = hostOf(url).replace(/[^a-zA-Z0-9]/g, "");
  return (stripped.length === 0 ? "mcpServer" : stripped).substring(0, 10);
}

// In-memory fake of the narrow ExpressionRuntimePort: the same pure whitelist
// the evaluator tests use, sufficient for the replaceMap expr/from entries.
class FakePort implements ExpressionRuntimePort {
  functions(name: string): WhitelistFn | undefined {
    const table: Record<string, WhitelistFn> = {
      safeUpper: (s) => (s ?? "").toUpperCase(),
      safeLower: (s) => (s ?? "").toLowerCase(),
      safeAlphanumeric: (s) => (s ?? "").replace(/[^a-zA-Z0-9]/g, ""),
      mcpNamespace: (url) => deriveServerName(url).toLowerCase(),
      mcpAuthRef: (url) => "${{MCP_DA_AUTH_ID_" + deriveServerName(url).toUpperCase() + "}}",
    };
    return table[name];
  }

  flags(): boolean {
    return false;
  }
}

// The validated da/mcp-server replaceMap, copied verbatim from
// templates/v4/create/da/mcp-server/descriptor.json (the RCTX-08 conformance fixture).
const daMcpServerReplaceMap: ReplaceMapEntry[] = [
  { var: "DeclarativeCopilot", const: "true" },
  { var: "IsLocalMCP", when: "mcpServerType == 'local'", value: "true" },
  { var: "MCPForDAServerUrl", from: "mcpServerUrl" },
  { var: "IsNoAuth", when: "authType == 'none'", value: "true" },
  { var: "MicrosoftEntra", when: "authType == 'entra-sso'", value: "true" },
  { var: "MCPNamespace", expr: "mcpNamespace(mcpServerUrl)" },
  { var: "MCPAuthRefId", expr: "mcpAuthRef(mcpServerUrl)" },
];

describe("buildRenderContext (v4)", () => {
  it("RCTX-01: a {const} entry puts the literal value", () => {
    const res = buildRenderContext(
      [{ var: "DeclarativeCopilot", const: "true" }],
      {},
      {},
      new FakePort()
    );
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().DeclarativeCopilot, "true");
  });

  it("RCTX-02: a {from} entry copies the answer value verbatim", () => {
    const res = buildRenderContext(
      [{ var: "MCPForDAServerUrl", from: "mcpServerUrl" }],
      { mcpServerUrl: "https://api.github.com/mcp" },
      {},
      new FakePort()
    );
    assert.strictEqual(res._unsafeUnwrap().MCPForDAServerUrl, "https://api.github.com/mcp");
  });

  it("RCTX-03: a {when,value} entry whose guard is true emits the value", () => {
    const res = buildRenderContext(
      [{ var: "IsNoAuth", when: "authType == 'none'", value: "true" }],
      { authType: "none" },
      {},
      new FakePort()
    );
    assert.strictEqual(res._unsafeUnwrap().IsNoAuth, "true");
  });

  it("RCTX-04: a {when,value} entry whose guard is false emits nothing (optional var)", () => {
    const res = buildRenderContext(
      [{ var: "IsNoAuth", when: "authType == 'none'", value: "true" }],
      { authType: "oauth" },
      {},
      new FakePort()
    );
    assert.notProperty(res._unsafeUnwrap(), "IsNoAuth");
  });

  it("RCTX-05: an {expr} entry puts the value-context evaluator result", () => {
    const res = buildRenderContext(
      [{ var: "MCPNamespace", expr: "mcpNamespace(mcpServerUrl)" }],
      { mcpServerUrl: "https://api.github.com/mcp" },
      {},
      new FakePort()
    );
    assert.strictEqual(res._unsafeUnwrap().MCPNamespace, "apigithubc");
  });

  it("RCTX-06: a var that shadows a caller-injected id is a SystemError", () => {
    const res = buildRenderContext(
      [{ var: "appName", const: "x" }],
      {},
      { appName: "MyApp" },
      new FakePort()
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, RCTX_SHADOWS_CALLER_FLOOR);
  });

  it("RCTX-07: a derived var reads the floor id without mutating it in place", () => {
    const res = buildRenderContext(
      [{ var: "SafeAppName", expr: "safeAlphanumeric(appName)" }],
      {},
      { appName: "My App 1!" },
      new FakePort()
    );
    const vars = res._unsafeUnwrap();
    assert.strictEqual(vars.SafeAppName, "MyApp1");
    // the floor id itself is never emitted/mutated by this operation
    assert.notProperty(vars, "appName");
  });

  it("RCTX-08: the validated da/mcp-server replaceMap resolves (authType=oauth, remote)", () => {
    const res = buildRenderContext(
      daMcpServerReplaceMap,
      { mcpServerUrl: "https://api.github.com/mcp", authType: "oauth", mcpServerType: "remote" },
      {},
      new FakePort()
    );
    const vars = res._unsafeUnwrap();
    assert.strictEqual(vars.DeclarativeCopilot, "true");
    assert.notProperty(vars, "IsLocalMCP"); // remote → absent
    assert.strictEqual(vars.MCPForDAServerUrl, "https://api.github.com/mcp");
    assert.notProperty(vars, "IsNoAuth"); // oauth → absent
    assert.notProperty(vars, "MicrosoftEntra"); // oauth → absent
    assert.strictEqual(vars.MCPNamespace, "apigithubc"); // URL-derived
    assert.strictEqual(vars.MCPAuthRefId, "${{MCP_DA_AUTH_ID_APIGITHUBC}}"); // URL-derived
  });

  it("RCTX-09: renderVars is exactly raw answers ∪ replaceMap-derived ∪ derived.*", () => {
    const answers = {
      mcpServerUrl: "https://x.example.com/mcp",
      authType: "none",
      "derived.mcp.foo": "bar",
    };
    const res = buildRenderContext(
      [
        { var: "DeclarativeCopilot", const: "true" },
        { var: "MCPForDAServerUrl", from: "mcpServerUrl" },
      ],
      answers,
      {},
      new FakePort()
    );
    const vars = res._unsafeUnwrap();
    // raw answers carried through
    assert.strictEqual(vars.mcpServerUrl, "https://x.example.com/mcp");
    assert.strictEqual(vars.authType, "none");
    // provider derived.* carried through
    assert.strictEqual(vars["derived.mcp.foo"], "bar");
    // replaceMap-derived present
    assert.strictEqual(vars.DeclarativeCopilot, "true");
    assert.strictEqual(vars.MCPForDAServerUrl, "https://x.example.com/mcp");
    // exactly that union, nothing else (no caller floor leakage)
    assert.deepStrictEqual(
      Object.keys(vars).sort(),
      [
        "DeclarativeCopilot",
        "MCPForDAServerUrl",
        "authType",
        "derived.mcp.foo",
        "mcpServerUrl",
      ].sort()
    );
  });

  it("RCTX-10: identical inputs yield identical renderVars without mutating them", () => {
    const replaceMap: ReplaceMapEntry[] = [
      { var: "MCPNamespace", expr: "mcpNamespace(mcpServerUrl)" },
    ];
    const answers = { mcpServerUrl: "https://api.github.com/mcp" };
    const a = buildRenderContext(replaceMap, answers, {}, new FakePort());
    const b = buildRenderContext(replaceMap, answers, {}, new FakePort());
    assert.deepStrictEqual(a._unsafeUnwrap(), b._unsafeUnwrap());
    // inputs are not mutated (pure function)
    assert.deepStrictEqual(answers, { mcpServerUrl: "https://api.github.com/mcp" });
  });

  it("RCTX-11: a {from} of a multiSelect string[] answer copies the array verbatim", () => {
    const res = buildRenderContext(
      [{ var: "SelectedLocalServers", from: "selectedLocalServers" }],
      { selectedLocalServers: ["alpha", "gamma"] },
      {},
      new FakePort()
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().SelectedLocalServers, ["alpha", "gamma"]);
  });

  it("RCTX-12: a {from}/{expr} to a declared-but-unanswered id resolves to empty, not a SystemError", () => {
    // The local branch: `mcpServerUrl` is a DECLARED option (in declaredKeys) but
    // left unanswered (mcpServerType == 'local'). A {from} / {expr} over it must
    // render the empty string (the NULL_VALUE presence model collect-inputs uses),
    // never an undeclared SystemError — otherwise the shared remote replaceMap
    // would crash the local scaffold before any step runs.
    const res = buildRenderContext(
      [
        { var: "MCPForDAServerUrl", from: "mcpServerUrl" },
        { var: "MCPNamespace", expr: "mcpNamespace(mcpServerUrl)" },
      ],
      { mcpServerType: "local" },
      {},
      new FakePort(),
      ["mcpServerType", "mcpServerUrl", "authType"]
    );
    assert.isTrue(res.isOk());
    const vars = res._unsafeUnwrap();
    assert.strictEqual(vars.MCPForDAServerUrl, "");
    assert.strictEqual(vars.MCPNamespace, "mcpserver"); // mcpNamespace("") fallback

    // Contrast: an id outside declaredKeys ∪ derived.* ∪ callerFloor is still the
    // INV-3 SystemError — declared-domain seeding never masks a real typo.
    const undeclared = buildRenderContext(
      [{ var: "X", from: "totallyUnknownId" }],
      { mcpServerType: "local" },
      {},
      new FakePort(),
      ["mcpServerType", "mcpServerUrl", "authType"]
    );
    assert.isTrue(undeclared.isErr());
    assert.strictEqual(undeclared._unsafeUnwrapErr().name, EXPR_UNDECLARED_IDENTIFIER);
  });

  it("INV-3: an undeclared identifier in {from}/{expr} propagates as a SystemError", () => {
    const res = buildRenderContext([{ var: "X", from: "doesNotExist" }], {}, {}, new FakePort());
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, EXPR_UNDECLARED_IDENTIFIER);
  });
});
