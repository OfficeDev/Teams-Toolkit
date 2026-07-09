// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  EXPR_NON_WHITELISTED_FUNCTION,
  EXPR_PARSE_ERROR,
  EXPR_UNDECLARED_IDENTIFIER,
  ExpressionRuntimePort,
  NULL_VALUE,
  WhitelistFn,
  evaluateExpression,
} from "../../../src/v4/expression/evaluateExpression";

/**
 * Tests for docs/03-specs/operations/scaffolding/evaluate-expression.md.
 * One `it` per EVAL-* acceptance-criteria row. v4-isolated (no v3 import).
 */

// --- pure helpers that mirror the fx-core URL derivation the real whitelist
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

// In-memory fake of the narrow ExpressionRuntimePort: pure function whitelist +
// read-only flag reader, with call recording so purity/short-circuit are observable.
class FakePort implements ExpressionRuntimePort {
  public readonly calls: string[] = [];
  private readonly flagMap: Record<string, boolean>;

  constructor(opts?: { flags?: Record<string, boolean> }) {
    this.flagMap = opts?.flags ?? {};
  }

  functions(name: string): WhitelistFn | undefined {
    const table: Record<string, WhitelistFn> = {
      safeUpper: (s) => (s ?? "").toUpperCase(),
      safeLower: (s) => (s ?? "").toLowerCase(),
      safeAlphanumeric: (s) => (s ?? "").replace(/[^a-zA-Z0-9]/g, ""),
      safeServer: (s) => (s ?? "").replace(/[^a-zA-Z0-9.-]/g, ""),
      surface: () => "vscode",
      mcpNamespace: (url) => deriveServerName(url).toLowerCase(),
      mcpAuthRef: (url) => "${{MCP_DA_AUTH_ID_" + deriveServerName(url).toUpperCase() + "}}",
    };
    const fn = table[name];
    if (!fn) {
      return undefined;
    }
    return (...args: string[]): string => {
      this.calls.push(name);
      return fn(...args);
    };
  }

  flags(name: string): boolean {
    this.calls.push("flag:" + name);
    return this.flagMap[name] ?? false;
  }
}

describe("evaluateExpression (v4)", () => {
  it("EVAL-01: an identifier compared to a string literal resolves from scope", () => {
    const res = evaluateExpression(
      { expr: "mcpServerType == 'remote'" },
      { mcpServerType: "remote" },
      new FakePort()
    );
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap(), true);
  });

  it("EVAL-02: an identifier absent from scope is a SystemError, never silent false", () => {
    const res = evaluateExpression(
      { expr: "fooBar == 'x'" },
      { mcpServerType: "remote" },
      new FakePort()
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, EXPR_UNDECLARED_IDENTIFIER);
  });

  it("EVAL-03: == and || evaluate with the expected boolean algebra", () => {
    const expr = { expr: "authType == 'oauth' || authType == 'entra-sso'" };
    assert.strictEqual(
      evaluateExpression(expr, { authType: "entra-sso" }, new FakePort())._unsafeUnwrap(),
      true
    );
    assert.strictEqual(
      evaluateExpression(expr, { authType: "none" }, new FakePort())._unsafeUnwrap(),
      false
    );
  });

  it("EVAL-04: featureFlag reads port.flags and && short-circuits (the oauth-dynamic gate)", () => {
    const expr = {
      expr: "featureFlag('TEAMSFX_MCP_FOR_DA_DT') && featureFlag('TEAMSFX_MCP_FOR_DA_DCR')",
    };
    const bothOn = new FakePort({
      flags: { TEAMSFX_MCP_FOR_DA_DT: true, TEAMSFX_MCP_FOR_DA_DCR: true },
    });
    assert.strictEqual(evaluateExpression(expr, {}, bothOn)._unsafeUnwrap(), true);

    // DT off → && short-circuits → the DCR flag is never read.
    const dtOff = new FakePort({
      flags: { TEAMSFX_MCP_FOR_DA_DT: false, TEAMSFX_MCP_FOR_DA_DCR: true },
    });
    assert.strictEqual(evaluateExpression(expr, {}, dtOff)._unsafeUnwrap(), false);
    assert.notInclude(dtOff.calls, "flag:TEAMSFX_MCP_FOR_DA_DCR");
  });

  it("EVAL-05: a whitelisted function call in value context returns the derived string", () => {
    const res = evaluateExpression(
      { expr: "mcpNamespace(mcpServerUrl)" },
      { mcpServerUrl: "https://api.github.com/mcp" },
      new FakePort()
    );
    assert.strictEqual(res._unsafeUnwrap(), "apigithubc");
  });

  it("EVAL-06: a non-whitelisted function call is a SystemError (no JS escape hatch)", () => {
    const res = evaluateExpression({ expr: "eval('1+1')" }, {}, new FakePort());
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, EXPR_NON_WHITELISTED_FUNCTION);
  });

  it("EVAL-07: sugar {equals} desugars identically to the raw expr", () => {
    const scope = { a: "x" };
    const sugar = evaluateExpression({ equals: { a: "x" } }, scope, new FakePort());
    const raw = evaluateExpression({ expr: "a == 'x'" }, scope, new FakePort());
    assert.strictEqual(sugar._unsafeUnwrap(), raw._unsafeUnwrap());
    assert.strictEqual(sugar._unsafeUnwrap(), true);
  });

  it("EVAL-08: sugar {enum} desugars to a chain of || equality", () => {
    const scope = { a: "y" };
    const sugar = evaluateExpression({ enum: { a: ["x", "y"] } }, scope, new FakePort());
    const raw = evaluateExpression({ expr: "a == 'x' || a == 'y'" }, scope, new FakePort());
    assert.strictEqual(sugar._unsafeUnwrap(), raw._unsafeUnwrap());
    assert.strictEqual(sugar._unsafeUnwrap(), true);
  });

  it("EVAL-09: sugar {anyOf} desugars to a disjunction of conditions", () => {
    const scope = { a: "no", b: "y" };
    const sugar = evaluateExpression(
      { anyOf: [{ equals: { a: "x" } }, { equals: { b: "y" } }] },
      scope,
      new FakePort()
    );
    const raw = evaluateExpression({ expr: "(a == 'x') || (b == 'y')" }, scope, new FakePort());
    assert.strictEqual(sugar._unsafeUnwrap(), raw._unsafeUnwrap());
    assert.strictEqual(sugar._unsafeUnwrap(), true);
  });

  it("EVAL-10: sugar {featureFlag} desugars to a featureFlag call", () => {
    const sugar = evaluateExpression(
      { featureFlag: "F" },
      {},
      new FakePort({ flags: { F: true } })
    );
    const raw = evaluateExpression(
      { expr: "featureFlag('F')" },
      {},
      new FakePort({ flags: { F: true } })
    );
    assert.strictEqual(sugar._unsafeUnwrap(), raw._unsafeUnwrap());
    assert.strictEqual(sugar._unsafeUnwrap(), true);
  });

  it("EVAL-11: sugar {capability} desugars to capability == 'c'", () => {
    const scope = { capability: "da" };
    const sugar = evaluateExpression({ capability: "da" }, scope, new FakePort());
    const raw = evaluateExpression({ expr: "capability == 'da'" }, scope, new FakePort());
    assert.strictEqual(sugar._unsafeUnwrap(), raw._unsafeUnwrap());
    assert.strictEqual(sugar._unsafeUnwrap(), true);
  });

  it("EVAL-12: sugar {from} in value context is a verbatim copy of the identifier value", () => {
    const scope = { a: "hello" };
    const sugar = evaluateExpression({ from: "a" }, scope, new FakePort());
    const raw = evaluateExpression({ expr: "a" }, scope, new FakePort());
    assert.strictEqual(sugar._unsafeUnwrap(), raw._unsafeUnwrap());
    assert.strictEqual(sugar._unsafeUnwrap(), "hello");
  });

  it("EVAL-13: a whitelisted call is deterministic, side-effect-free, and synchronous", () => {
    const scope = { mcpServerUrl: "https://api.github.com/mcp" };
    const r1 = evaluateExpression({ expr: "mcpNamespace(mcpServerUrl)" }, scope, new FakePort());
    const r2 = evaluateExpression({ expr: "mcpNamespace(mcpServerUrl)" }, scope, new FakePort());
    // deterministic
    assert.strictEqual(r1._unsafeUnwrap(), r2._unsafeUnwrap());
    // synchronous: the call returns a Result, not a Promise
    assert.notInstanceOf(r1, Promise);
    // side-effect-free: the input scope is not mutated
    assert.deepStrictEqual(scope, { mcpServerUrl: "https://api.github.com/mcp" });
  });

  it("EVAL-14: the same expr yields one result regardless of call site", () => {
    const expr = { expr: "authType != 'none'" };
    const scope = { authType: "oauth" };
    const asStepWhen = evaluateExpression(expr, scope, new FakePort());
    const asQuestionCondition = evaluateExpression(expr, scope, new FakePort());
    const asReplaceMapWhen = evaluateExpression(expr, scope, new FakePort());
    assert.strictEqual(asStepWhen._unsafeUnwrap(), true);
    assert.strictEqual(asQuestionCondition._unsafeUnwrap(), asStepWhen._unsafeUnwrap());
    assert.strictEqual(asReplaceMapWhen._unsafeUnwrap(), asStepWhen._unsafeUnwrap());
  });

  it("EVAL-15: != is the negation of == (the operator shipped pipeline `when` clauses use)", () => {
    // grounded in templates/v4/**/pipeline.json: "when": "authType != 'none'"
    const expr = { expr: "authType != 'none'" };
    assert.strictEqual(
      evaluateExpression(expr, { authType: "oauth" }, new FakePort())._unsafeUnwrap(),
      true
    );
    assert.strictEqual(
      evaluateExpression(expr, { authType: "none" }, new FakePort())._unsafeUnwrap(),
      false
    );
  });

  it("EVAL-16: a malformed expr is a SystemError (parse failure), never a silent result", () => {
    const scope = { a: "1", b: "2", authType: "x" };
    const malformed = [
      "authType == 'x", // unterminated string
      "authType ==", // dangling operator
      "(authType == 'x'", // unbalanced parenthesis
      "authType == 'x' 'y'", // trailing tokens
      "a # b", // unexpected character
    ];
    for (const bad of malformed) {
      const res = evaluateExpression({ expr: bad }, scope, new FakePort());
      assert.isTrue(res.isErr(), `expected a parse error for: ${bad}`);
      const e = res._unsafeUnwrapErr();
      assert.instanceOf(e, SystemError);
      assert.strictEqual(e.name, EXPR_PARSE_ERROR, `wrong error name for: ${bad}`);
    }
  });

  it("EVAL-17: == null is a presence test — true for an unanswered declared id, false once answered", () => {
    // grounded in templates/v4/modify/add-mcp-server/questions.json:
    //   "condition": { "expr": "mcpServerUrl == null" }
    const port = new FakePort();
    // unanswered: collect-inputs seeds a declared-but-unanswered id with NULL_VALUE
    const unanswered = evaluateExpression(
      { expr: "mcpServerUrl == null" },
      { mcpServerUrl: NULL_VALUE },
      port
    );
    assert.strictEqual(unanswered._unsafeUnwrap(), true);
    // answered: a real value is never equal to null
    const answered = evaluateExpression(
      { expr: "mcpServerUrl == null" },
      { mcpServerUrl: "https://api.github.com/mcp" },
      port
    );
    assert.strictEqual(answered._unsafeUnwrap(), false);
    // != null is the negation (the pre-filled / supplied case)
    const present = evaluateExpression(
      { expr: "mcpServerUrl != null" },
      { mcpServerUrl: "https://api.github.com/mcp" },
      port
    );
    assert.strictEqual(present._unsafeUnwrap(), true);
    // a truly undeclared id (a typo) is still an error, not null
    const typo = evaluateExpression({ expr: "mcpServerUrlx == null" }, {}, port);
    assert.isTrue(typo.isErr());
    assert.strictEqual(typo._unsafeUnwrapErr().name, EXPR_UNDECLARED_IDENTIFIER);
  });

  it("EVAL-18: unary ! negates a boolean — the modify selector's non-DT fallback route gate", () => {
    // grounded in templates/v4/modify/selector.json route 2:
    //   "addCapability=='add-action' && actionSource=='mcp' && !featureFlag('TEAMSFX_MCP_FOR_DA_DT')"
    const off = new FakePort({ flags: { TEAMSFX_MCP_FOR_DA_DT: false } });
    const on = new FakePort({ flags: { TEAMSFX_MCP_FOR_DA_DT: true } });
    assert.strictEqual(
      evaluateExpression(
        { expr: "!featureFlag('TEAMSFX_MCP_FOR_DA_DT')" },
        {},
        off
      )._unsafeUnwrap(),
      true
    );
    assert.strictEqual(
      evaluateExpression({ expr: "!featureFlag('TEAMSFX_MCP_FOR_DA_DT')" }, {}, on)._unsafeUnwrap(),
      false
    );
    // the full real fallback predicate: ! binds to the call, && chains
    const full =
      "addCapability=='add-action' && actionSource=='mcp' && !featureFlag('TEAMSFX_MCP_FOR_DA_DT')";
    const scope = { addCapability: "add-action", actionSource: "mcp" };
    assert.strictEqual(evaluateExpression({ expr: full }, scope, off)._unsafeUnwrap(), true);
    assert.strictEqual(evaluateExpression({ expr: full }, scope, on)._unsafeUnwrap(), false);
    // double negation round-trips
    assert.strictEqual(
      evaluateExpression(
        { expr: "!!featureFlag('TEAMSFX_MCP_FOR_DA_DT')" },
        {},
        on
      )._unsafeUnwrap(),
      true
    );
  });
});
