// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  BUILD_TARGET_DANGLING_V4_ROUTE,
  BUILD_TARGET_MALFORMED_ROUTE,
  BUILD_TARGET_MISSING_DIMENSION,
  BUILD_TARGET_UNKNOWN_TEMPLATE,
  RouteResolverPort,
  SelectorSpec,
  resolveBuildTarget,
  v4RouteRegistryFromSelector,
} from "../../../src/v4/buildTarget/resolveBuildTarget";

/**
 * Tests for docs/03-specs/operations/scaffolding/resolve-build-target.md.
 * One `it` per AC row. v4-isolated (no v3 import). The port is an in-memory
 * fake; route `when` / question `condition` ride the real evaluateExpression.
 */

interface PortOpts {
  answers?: Record<string, string>; // scripted prompt answers, keyed by question name
  flags?: Record<string, boolean>;
  v4?: string[];
  coreMethods?: string[];
}

function makePort(opts: PortOpts): { port: RouteResolverPort; calls: string[] } {
  const calls: string[] = [];
  const answers = opts.answers ?? {};
  const port: RouteResolverPort = {
    async prompt(question) {
      calls.push("prompt:" + question.name);
      if (!(question.name in answers)) {
        throw new Error("unscripted prompt for question: " + question.name);
      }
      return { kind: "value", value: answers[question.name] };
    },
    featureFlag(name) {
      calls.push("flag:" + name);
      return (opts.flags ?? {})[name] ?? false;
    },
    v4Registry(templateId) {
      calls.push("v4Registry:" + templateId);
      return (opts.v4 ?? []).includes(templateId);
    },
    v3CoreMethodRegistry(coreMethod) {
      calls.push("coreMethod:" + coreMethod);
      return (opts.coreMethods ?? []).includes(coreMethod);
    },
  };
  return { port, calls };
}

const DT = "TEAMSFX_MCP_FOR_DA_DT";

/** A create selector mirroring the real one: a DT-gated v4/v3-core-method split plus a surface-action route. */
function createSelector(): SelectorSpec {
  return {
    questions: [
      { name: "projectType" },
      { name: "actionSource", condition: { expr: "projectType == 'declarative-agent'" } },
    ],
    routes: [
      {
        when: `projectType=='declarative-agent' && actionSource=='mcp' && featureFlag('${DT}')`,
        engine: "v4",
        templateId: "da/mcp-server",
      },
      {
        when: `projectType=='declarative-agent' && actionSource=='mcp' && !featureFlag('${DT}')`,
        engine: "v3-core-method",
        coreMethod: "addPlugin",
      },
      {
        when: "projectType=='github-copilot'",
        engine: "surface-action",
        action: "open-github-copilot-chat",
        surfaces: ["vscode"],
      },
    ],
  };
}

describe("v4/buildTarget/resolveBuildTarget", () => {
  it("AC-06a: v4RouteRegistryFromSelector indexes only v4 template ids", () => {
    const registry = v4RouteRegistryFromSelector({
      questions: [],
      routes: [
        { when: "true", engine: "v4", templateId: "da/mcp-server" },
        { when: "true", engine: "v4" },
        { when: "true", engine: "v3-core-method", coreMethod: "addPlugin" },
        { when: "true", engine: "surface-action", action: "open-chat" },
      ],
    });

    assert.isTrue(registry("da/mcp-server"));
    assert.isFalse(registry("addPlugin"));
    assert.isFalse(registry("open-chat"));
    assert.isFalse(registry("missing"));
  });

  it("AC-01: an interactive walk walks Q1 + the route predicate to a templateId (no language resolved here)", async () => {
    const { port, calls } = makePort({
      answers: { projectType: "declarative-agent", actionSource: "mcp" },
      flags: { [DT]: true },
      v4: ["da/mcp-server"],
    });
    const res = await resolveBuildTarget(createSelector(), {}, true, port);
    assert.isTrue(res.isOk());
    const bt = res._unsafeUnwrap();
    assert.strictEqual(bt.templateId, "da/mcp-server");
    assert.strictEqual(bt.engine, "v4");
    // language is collect-inputs' Q0 (ADR-0014 Amendment 2); the walk never prompts it.
    assert.isEmpty(calls.filter((c) => c === "prompt:language"));
  });

  it("AC-03: a fully pre-filled non-interactive walk derives the templateId via the route predicate, no prompt", async () => {
    const { port, calls } = makePort({
      flags: { [DT]: true },
      v4: ["da/mcp-server"],
    });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      port
    );
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().templateId, "da/mcp-server");
    assert.isEmpty(calls.filter((c) => c.startsWith("prompt:")));
  });

  it("AC-04: a route gated by featureFlag(DT) with the flag on resolves the v4 route", async () => {
    const { port } = makePort({ flags: { [DT]: true }, v4: ["da/mcp-server"] });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      port
    );
    const bt = res._unsafeUnwrap();
    assert.strictEqual(bt.engine, "v4");
    assert.strictEqual(bt.templateId, "da/mcp-server");
  });

  it("AC-05: the same MCP context with DT off resolves the non-DT route, not the v4 id", async () => {
    const { port } = makePort({
      flags: { [DT]: false },
      v4: ["da/mcp-server"],
      coreMethods: ["addPlugin"],
    });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      port
    );
    const bt = res._unsafeUnwrap();
    assert.strictEqual(bt.engine, "v3-core-method");
    assert.strictEqual(bt.templateId, "addPlugin");
    assert.notStrictEqual(bt.templateId, "da/mcp-server");
  });

  it("AC-06: a walk reaching a v4 route dispatches to v4; the decision consults v4Registry, never a language axis", async () => {
    const { port, calls } = makePort({ flags: { [DT]: true }, v4: ["da/mcp-server"] });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      port
    );
    assert.strictEqual(res._unsafeUnwrap().engine, "v4");
    // validateRoutes consulted v4Registry for the v4 route; nothing branched on language.
    assert.include(calls, "v4Registry:da/mcp-server");
    assert.isEmpty(calls.filter((c) => c === "prompt:language"));
  });

  it("AC-08: a route naming a coreMethod in v3CoreMethodRegistry dispatches to v3-core-method", async () => {
    const { port } = makePort({
      flags: { [DT]: false },
      v4: ["da/mcp-server"],
      coreMethods: ["addPlugin"],
    });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      port
    );
    const bt = res._unsafeUnwrap();
    assert.strictEqual(bt.engine, "v3-core-method");
    assert.strictEqual(bt.templateId, "addPlugin");
  });

  it("AC-09: a surface-action route scaffolds nothing — returns the action id, carrying the walk answers", async () => {
    const { port } = makePort({ v4: ["da/mcp-server"] });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "github-copilot" },
      false,
      port
    );
    const bt = res._unsafeUnwrap();
    assert.strictEqual(bt.engine, "surface-action");
    assert.strictEqual(bt.templateId, "open-github-copilot-chat");
    assert.deepEqual(bt.answers, { projectType: "github-copilot" });
  });

  it("AC-09a: prefilled answers for condition-skipped dimensions are not carried forward", async () => {
    const { port } = makePort({ v4: ["da/mcp-server"] });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "github-copilot", actionSource: "mcp" },
      false,
      port
    );
    assert.isTrue(res.isOk());
    const bt = res._unsafeUnwrap();
    assert.strictEqual(bt.engine, "surface-action");
    assert.deepEqual(bt.answers, { projectType: "github-copilot" });
  });

  it("AC-10: a route naming a coreMethod absent from v3CoreMethodRegistry is an explicit UserError, never a silent fallback", async () => {
    const { port } = makePort({ flags: { [DT]: false }, v4: ["da/mcp-server"], coreMethods: [] });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      port
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.strictEqual(e.name, BUILD_TARGET_UNKNOWN_TEMPLATE);
    assert.include(e.message, "addPlugin");
  });

  it("AC-11: a route missing its engine key — or carrying a foreign key — is rejected", async () => {
    const missingKey: SelectorSpec = {
      questions: [],
      routes: [{ when: "true", engine: "v4" }],
    };
    const res1 = await resolveBuildTarget(missingKey, {}, false, makePort({}).port);
    assert.isTrue(res1.isErr());
    assert.strictEqual(res1._unsafeUnwrapErr().name, BUILD_TARGET_MALFORMED_ROUTE);

    const foreignKey: SelectorSpec = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "t", coreMethod: "addPlugin" }],
    };
    const res2 = await resolveBuildTarget(foreignKey, {}, false, makePort({ v4: ["t"] }).port);
    assert.isTrue(res2.isErr());
    assert.strictEqual(res2._unsafeUnwrapErr().name, BUILD_TARGET_MALFORMED_ROUTE);

    const missingCoreMethod: SelectorSpec = {
      questions: [],
      routes: [{ when: "true", engine: "v3-core-method" }],
    };
    const res3 = await resolveBuildTarget(missingCoreMethod, {}, false, makePort({}).port);
    assert.isTrue(res3.isErr());
    assert.strictEqual(res3._unsafeUnwrapErr().name, BUILD_TARGET_MALFORMED_ROUTE);

    const malformedCoreMethod: SelectorSpec = {
      questions: [],
      routes: [
        { when: "true", engine: "v3-core-method", coreMethod: "addPlugin", templateId: "t" },
      ],
    };
    const res4 = await resolveBuildTarget(malformedCoreMethod, {}, false, makePort({}).port);
    assert.isTrue(res4.isErr());
    assert.strictEqual(res4._unsafeUnwrapErr().name, BUILD_TARGET_MALFORMED_ROUTE);

    const missingAction: SelectorSpec = {
      questions: [],
      routes: [{ when: "true", engine: "surface-action" }],
    };
    const res5 = await resolveBuildTarget(missingAction, {}, false, makePort({}).port);
    assert.isTrue(res5.isErr());
    assert.strictEqual(res5._unsafeUnwrapErr().name, BUILD_TARGET_MALFORMED_ROUTE);

    const malformedAction: SelectorSpec = {
      questions: [],
      routes: [{ when: "true", engine: "surface-action", action: "open", coreMethod: "add" }],
    };
    const res6 = await resolveBuildTarget(malformedAction, {}, false, makePort({}).port);
    assert.isTrue(res6.isErr());
    assert.strictEqual(res6._unsafeUnwrapErr().name, BUILD_TARGET_MALFORMED_ROUTE);
  });

  it("AC-12: a v4 route whose templateId has no descriptor is a build failure", async () => {
    const dangling: SelectorSpec = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "ghost" }],
    };
    const res = await resolveBuildTarget(dangling, {}, false, makePort({}).port);
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.strictEqual(e.name, BUILD_TARGET_DANGLING_V4_ROUTE);
    assert.include(e.message, "ghost");
  });

  it("AC-17: identical inputs resolve to the identical BuildTarget (determinism)", async () => {
    const prefilled = { projectType: "declarative-agent", actionSource: "mcp" };
    const opts: PortOpts = { flags: { [DT]: true }, v4: ["da/mcp-server"] };
    const first = await resolveBuildTarget(createSelector(), prefilled, false, makePort(opts).port);
    const second = await resolveBuildTarget(
      createSelector(),
      prefilled,
      false,
      makePort(opts).port
    );
    assert.deepEqual(first._unsafeUnwrap(), second._unsafeUnwrap());
  });

  it("AC-18: a new-project walk (interactive) and an add walk (pre-filled) reaching the same templateId hand off identically", async () => {
    const viaNew = await resolveBuildTarget(
      createSelector(),
      {},
      true,
      makePort({
        answers: { projectType: "declarative-agent", actionSource: "mcp" },
        flags: { [DT]: true },
        v4: ["da/mcp-server"],
      }).port
    );
    const viaAdd = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent", actionSource: "mcp" },
      false,
      makePort({ flags: { [DT]: true }, v4: ["da/mcp-server"] }).port
    );
    const newBt = viaNew._unsafeUnwrap();
    const addBt = viaAdd._unsafeUnwrap();
    // Same dispatch hand-off and the same dimension answers regardless of how the
    // single walk was driven (interactive prompts vs pre-filled) — `atk new` and
    // `atk add` differ only in provenance, not in the resolved BuildTarget.
    assert.strictEqual(newBt.templateId, addBt.templateId);
    assert.strictEqual(newBt.engine, addBt.engine);
    assert.deepEqual(newBt.answers, addBt.answers);
    assert.deepEqual(addBt.answers, { projectType: "declarative-agent", actionSource: "mcp" });
  });

  it("AC-03a: a partially pre-filled interactive walk skips the pre-filled dimension and prompts the rest", async () => {
    const { port, calls } = makePort({
      answers: { actionSource: "mcp" }, // only the un-pre-filled dimension is scripted
      flags: { [DT]: true },
      v4: ["da/mcp-server"],
    });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent" },
      true,
      port
    );
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().templateId, "da/mcp-server");
    // projectType came from prefilled (not prompted); only actionSource was asked.
    assert.isEmpty(calls.filter((c) => c === "prompt:projectType"));
    assert.include(calls, "prompt:actionSource");
    assert.deepEqual(res._unsafeUnwrap().answers, {
      projectType: "declarative-agent",
      actionSource: "mcp",
    });
  });

  it("AC-03b: a non-interactive walk missing a required gated dimension is an explicit UserError, no prompt", async () => {
    const { port, calls } = makePort({
      flags: { [DT]: true },
      v4: ["da/mcp-server"],
    });
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "declarative-agent" }, // actionSource missing
      false,
      port
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.strictEqual(e.name, BUILD_TARGET_MISSING_DIMENSION);
    assert.include(e.message, "actionSource");
    assert.isEmpty(calls.filter((c) => c.startsWith("prompt:")));
  });

  it("AC-07: backing out from the first interactive selector prompt cancels the walk", async () => {
    const port = makePort({ v4: ["da/mcp-server"] }).port;
    port.prompt = async () => ({ kind: "back" });

    const res = await resolveBuildTarget(createSelector(), {}, true, port);

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "BuildTargetWalkCancelled");
  });

  it("AC-13: unmatched resolved selector answers fail explicitly", async () => {
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: "unknown" },
      false,
      makePort({ v4: ["da/mcp-server"] }).port
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "BuildTargetNoMatchingRoute");
  });

  it("AC-14: selector dimensions must resolve to scalar strings", async () => {
    const res = await resolveBuildTarget(
      createSelector(),
      { projectType: ["declarative-agent"] } as unknown as Record<string, string>,
      false,
      makePort({ flags: { [DT]: true }, v4: ["da/mcp-server"] }).port
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "BuildTargetNonScalarAnswer");
  });

  it("AC-03c: backing out after the first selector prompt re-asks the previous dimension", async () => {
    const { port, calls } = makePort({ flags: { [DT]: true }, v4: ["da/mcp-server"] });
    const replies = [
      { kind: "value", value: "declarative-agent" },
      { kind: "back" },
      { kind: "value", value: "github-copilot" },
    ] as const;
    let index = 0;
    port.prompt = async (question, step) => {
      calls.push(`scripted:${question.name}:${step}`);
      const reply = replies[index++];
      if (reply === undefined) {
        throw new Error("unscripted prompt");
      }
      return reply;
    };

    const res = await resolveBuildTarget(createSelector(), {}, true, port);

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.strictEqual(res._unsafeUnwrap().engine, "surface-action");
    assert.deepEqual(
      calls.filter((call) => call.startsWith("scripted:")),
      ["scripted:projectType:1", "scripted:actionSource:2", "scripted:projectType:1"]
    );
  });
});
