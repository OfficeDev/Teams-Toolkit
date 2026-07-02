// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  BUILD_TARGET_MALFORMED_SELECTOR,
  parseSelectorSpec,
} from "../../../src/v4/buildTarget/parseSelector";
import {
  RouteResolverPort,
  resolveBuildTarget,
} from "../../../src/v4/buildTarget/resolveBuildTarget";

/**
 * Tests for the load face of resolve-build-target (AC-19/20/21 in
 * docs/03-specs/operations/scaffolding/resolve-build-target.md): the raw
 * `selector.json` → `SelectorSpec` projection that feeds `resolveBuildTarget`.
 * v4-isolated (no v3 import). AC-21 loads the real shipped selector and runs it
 * through the resolver over an in-memory port — a regression lock on the
 * shipped routing table.
 */

const DT = "TEAMSFX_MCP_FOR_DA_DT";

/** The real shipped routing table parsed by every front-stage create flow. */
const SELECTOR_PATH = path.resolve(__dirname, "../../../../../templates/v4/create/selector.json");

const CURRENT_CREATE_V4_TEMPLATE_IDS = [
  "basic-custom-engine-agent",
  "custom-copilot-basic",
  "custom-copilot-rag-azure-ai-search",
  "custom-copilot-rag-custom-api",
  "custom-copilot-rag-customize",
  "declarative-agent-meta-os-upgrade-project",
  "default-bot",
  "default-message-extension",
  "graph-connector",
  "non-sso-tab",
  "da/api-plugin-from-existing-api",
  "da/api-plugin-from-scratch",
  "da/api-plugin-from-scratch-bearer",
  "da/api-plugin-from-scratch-oauth",
  "da/graph-connector",
  "da/mcp-server",
  "da/mcp-server-static",
  "da/no-action",
  "da/skill",
  "da/typespec",
  "non-sso-tab",
  "office-addin-config",
  "office-addin-excel-cfshortcut",
  "office-addin-wxpo-taskpane",
  "teams-collaborator-agent",
  "weather-agent",
];

interface PortOpts {
  flags?: Record<string, boolean>;
  v4?: string[];
}

/** A read-only port: only `featureFlag` / `v4Registry` matter for the route-mode keystone. */
function makePort(opts: PortOpts): RouteResolverPort {
  return {
    async prompt(question) {
      throw new Error("unexpected prompt for question: " + question.name);
    },
    featureFlag(name) {
      return (opts.flags ?? {})[name] ?? false;
    },
    v4Registry(templateId) {
      return (opts.v4 ?? []).includes(templateId);
    },
    v3Registry(templateId) {
      return (opts.v4 ?? []).includes(templateId);
    },
    v3CoreMethodRegistry() {
      return false;
    },
  };
}

describe("v4/buildTarget/parseSelector", () => {
  it("AC-19: parse drops question presentation fields and keeps only routing keys", () => {
    const raw = {
      questions: [
        {
          name: "projectType",
          type: "singleSelect",
          title: "New Project",
          keyPrefix: "x",
          staticOptions: [{ id: "a", label: "A" }],
        },
        {
          name: "actionSource",
          type: "singleSelect",
          title: "Action",
          staticOptions: [],
          condition: { expr: "projectType == 'copilot-agent-type'" },
        },
      ],
      routes: [
        {
          when: "projectType=='copilot-agent-type'",
          engine: "v3",
          templateId: "copilot-gpt-basic",
          v3Adapter: "DeclarativeAgentGenerator",
          comment: "authoring note that must not survive",
        },
        {
          when: "projectType=='start-with-github-copilot'",
          engine: "surface-action",
          action: "open-github-copilot-chat",
          surfaces: ["vscode"],
        },
      ],
    };

    const res = parseSelectorSpec(raw);
    assert.isTrue(res.isOk());
    const spec = res._unsafeUnwrap();

    // questions: only { name, condition? } survive — no type/title/staticOptions/keyPrefix.
    assert.deepStrictEqual(Object.keys(spec.questions[0]), ["name"]);
    assert.strictEqual(spec.questions[0].name, "projectType");
    assert.deepStrictEqual(Object.keys(spec.questions[1]).sort(), ["condition", "name"]);
    assert.deepStrictEqual(spec.questions[1].condition, {
      expr: "projectType == 'copilot-agent-type'",
    });

    // routes: when + engine + only that engine's key — authoring `comment` is dropped.
    assert.deepStrictEqual(spec.routes[0], {
      when: "projectType=='copilot-agent-type'",
      engine: "v3",
      templateId: "copilot-gpt-basic",
      v3Adapter: "DeclarativeAgentGenerator",
    });
    assert.deepStrictEqual(spec.routes[1], {
      when: "projectType=='start-with-github-copilot'",
      engine: "surface-action",
      action: "open-github-copilot-chat",
      surfaces: ["vscode"],
    });
  });

  it("AC-20: a malformed selector is an explicit UserError, never a crash", () => {
    const malformed: unknown[] = [
      42, // non-object root
      "selector", // non-object root
      [], // array root, not the { questions, routes } object
      { routes: [] }, // questions not an array (absent)
      { questions: {}, routes: [] }, // questions not an array
      { questions: [], routes: 7 }, // routes not an array
      { questions: [{ type: "singleSelect" }], routes: [] }, // question without a string name
      { questions: [{ name: 5 }], routes: [] }, // question name not a string
      { questions: [], routes: [{ engine: "v4", templateId: "x" }] }, // route without a string when
      { questions: [], routes: [{ when: "true", engine: "v9" }] }, // route engine outside the closed set
      {
        questions: [{ name: "p", condition: { nope: "x" } }],
        routes: [],
      }, // condition not an ExpressionNode shape
    ];
    for (const raw of malformed) {
      const res = parseSelectorSpec(raw);
      assert.isTrue(res.isErr(), `expected err for ${JSON.stringify(raw)}`);
      const error = res._unsafeUnwrapErr();
      assert.instanceOf(error, UserError);
      assert.strictEqual(error.name, BUILD_TARGET_MALFORMED_SELECTOR);
    }
  });

  it("AC-21: the real shipped selector routes the MCP dimensions by feature flag", async () => {
    const raw: unknown = JSON.parse(fs.readFileSync(SELECTOR_PATH, "utf8"));
    const parsed = parseSelectorSpec(raw);
    assert.isTrue(parsed.isOk());
    const selector = parsed._unsafeUnwrap();

    const mcpFlags = {
      projectType: "copilot-agent-type",
      daTemplate: "add-action",
      actionSource: "mcp",
    };

    // DT on → the v4 route wins, selecting the v4 template id (principle 1: the
    // selector chooses "da/mcp-server", not a hand-coded check).
    const onPort = makePort({
      flags: { [DT]: true },
      v4: CURRENT_CREATE_V4_TEMPLATE_IDS,
    });
    const on = await resolveBuildTarget(selector, mcpFlags, false, onPort);
    assert.isTrue(on.isOk());
    const onBt = on._unsafeUnwrap();
    assert.strictEqual(onBt.engine, "v4");
    assert.strictEqual(onBt.templateId, "da/mcp-server");

    // DT off → the v4 static MCP route wins, producing the legacy static-tools output shape.
    const offPort = makePort({
      flags: { [DT]: false },
      v4: CURRENT_CREATE_V4_TEMPLATE_IDS,
    });
    const off = await resolveBuildTarget(selector, mcpFlags, false, offPort);
    assert.isTrue(off.isOk());
    const offBt = off._unsafeUnwrap();
    assert.strictEqual(offBt.engine, "v4");
    assert.strictEqual(offBt.templateId, "da/mcp-server-static");

    // a sibling top-level dimension resolves to its own v4 route, unaffected by the flag.
    const gcPort = makePort({
      v4: CURRENT_CREATE_V4_TEMPLATE_IDS,
    });
    const gc = await resolveBuildTarget(
      selector,
      { projectType: "graph-connector-type" },
      false,
      gcPort
    );
    assert.isTrue(gc.isOk());
    const gcBt = gc._unsafeUnwrap();
    assert.strictEqual(gcBt.engine, "v4");
    assert.strictEqual(gcBt.templateId, "graph-connector");
  });
});
