// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import {
  ExpressionRuntimePort,
  Scope,
  WhitelistFn,
  evaluateExpression,
} from "../../../src/v4/expression/evaluateExpression";
import { RenderVars, TemplateFileEntry } from "../../../src/v4/model/dataModel";
import { assert } from "vitest";
import {
  ManifestWrapper,
  PIPELINE_CROSS_STEP_REFERENCE,
  PIPELINE_PARAMS_VIOLATION,
  PIPELINE_UNKNOWN_PIPELINE,
  PIPELINE_UNKNOWN_STEP,
  Pipeline,
  PipelineRuntimePort,
  REQUIRE_EMPTY_TARGET,
  RegisteredStep,
  StepContext,
  StepParams,
  TargetDir,
  runScaffoldPipeline,
} from "../../../src/v4/pipeline/runScaffoldPipeline";

/**
 * Tests for docs/03-specs/operations/scaffolding/run-scaffold-pipeline.md.
 * One `it` per AC-* row. v4-isolated (no v3 import).
 *
 * The `evalWhen` / `render` faces are backed by the real shared evaluator and a
 * strict in-memory Mustache so step `when` and `with` exercise the real grammar
 * and a real missing-token failure (never a silent empty substitution).
 */

// --- in-memory fakes of the narrow PipelineRuntimePort faces ---

/** The pure expression port the shared evaluator reads (no functions / flags needed by `when`). */
class ExprPort implements ExpressionRuntimePort {
  functions(_name: string): WhitelistFn | undefined {
    return undefined;
  }
  flags(name: string): boolean {
    return name === "TEST_ON";
  }
}

/** A strict `{{token}}` Mustache: a missing producer is a hard error, never an empty fill. */
function renderMustache(template: string, vars: RenderVars): Result<string, FxError> {
  let missing: string | undefined;
  const out = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (key in vars) {
      const v = vars[key];
      // a string[] (a multiSelect answer carried via {from}) stringifies like
      // Mustache's own array coercion (comma-join); scalar values fill verbatim
      return Array.isArray(v) ? v.join(",") : v;
    }
    missing = key;
    return "";
  });
  if (missing !== undefined) {
    return err(
      new SystemError({
        source: "Test",
        name: "RenderMissingToken",
        message: `no producer for {{${missing}}}`,
      })
    );
  }
  return ok(out);
}

/** Records every manifest mutation as the wrapper's action shape (AC-12 observability). */
class RecordingWrapper implements ManifestWrapper {
  registrations: Array<{ teamsManifestPath: string; pluginManifestPath: string }> = [];
  registerDeclarativeAgentAction(
    teamsManifestPath: string,
    pluginManifestPath: string
  ): Result<void, FxError> {
    this.registrations.push({ teamsManifestPath, pluginManifestPath });
    return ok(undefined);
  }
}

interface FakeStepOpts {
  validate?: (resolved: StepParams) => string | undefined;
  run?: (resolved: StepParams, ctx: StepContext) => Result<void, FxError>;
}

/** A registered step that records what it applied and defers validate/run to its options. */
class FakeStep implements RegisteredStep {
  applied: StepParams[] = [];
  private readonly opts: FakeStepOpts;
  constructor(opts: FakeStepOpts = {}) {
    this.opts = opts;
  }
  validateParams(resolved: StepParams): string | undefined {
    return this.opts.validate ? this.opts.validate(resolved) : undefined;
  }
  apply(resolved: StepParams, ctx: StepContext): Result<void, FxError> {
    this.applied.push(resolved);
    return this.opts.run ? this.opts.run(resolved, ctx) : ok(undefined);
  }
}

function makePort(opts: { pipelines?: string[]; steps?: Record<string, RegisteredStep> } = {}): {
  port: PipelineRuntimePort;
  writes: Map<string, Buffer>;
  environmentWrites: Array<{ environment: string; values: Record<string, string> }>;
  wrapper: RecordingWrapper;
  warnings: string[];
} {
  const writes = new Map<string, Buffer>();
  const environmentWrites: Array<{ environment: string; values: Record<string, string> }> = [];
  const warnings: string[] = [];
  const wrapper = new RecordingWrapper();
  const pipelines = new Set(
    opts.pipelines ?? ["default", "openapi", "typespec", "officeAddin", "spfx"]
  );
  const steps = opts.steps ?? {};
  const exprPort = new ExprPort();
  const port: PipelineRuntimePort = {
    pipelineRegistry: (name) => (pipelines.has(name) ? { name } : undefined),
    stepRegistry: (name) => steps[name],
    evalWhen: (expr, vars) => {
      const scope: Scope = {};
      for (const [k, v] of Object.entries(vars)) {
        if (!Array.isArray(v)) {
          scope[k] = v;
        }
      }
      const r = evaluateExpression({ expr }, scope, exprPort);
      return r.isErr() ? err(r.error) : ok(r.value === true);
    },
    render: (mustache, vars) => renderMustache(mustache, vars),
    manifestWrapper: () => wrapper,
    warn: (message) => warnings.push(message),
    write: (path, data) => {
      writes.set(path, data);
    },
    read: (path) => writes.get(path),
    writeEnvironment: (environment, values) => {
      environmentWrites.push({ environment, values });
      return Promise.resolve(ok(undefined));
    },
  };
  return { port, writes, environmentWrites, wrapper, warnings };
}

function entry(path: string, body: string): TemplateFileEntry {
  return { path, data: Buffer.from(body, "utf8") };
}

function target(existing: string[] = []): TargetDir {
  return { path: "/out", existing };
}

describe("runScaffoldPipeline (v4)", () => {
  it("AC-01: a known pipeline selects its orchestration; render then steps execute", async () => {
    const s1 = new FakeStep();
    const pipeline: Pipeline = { pipeline: "default", steps: [{ step: "s1" }] };
    const { port, writes } = makePort({ steps: { s1 } });
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("a.txt.tpl", "hi")],
      {},
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.include(res._unsafeUnwrap().written, "a.txt");
    assert.isTrue(writes.has("a.txt"));
    assert.strictEqual(s1.applied.length, 1);
    assert.deepStrictEqual(res._unsafeUnwrap().stepsRun, ["s1"]);
  });

  it("AC-02: a pipeline not in the registry is a SystemError", async () => {
    const pipeline: Pipeline = { pipeline: "bogus", steps: [] };
    const { port } = makePort({ pipelines: ["default"] });
    const res = await runScaffoldPipeline(pipeline, [], {}, target([]), port);
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, PIPELINE_UNKNOWN_PIPELINE);
  });

  it("AC-03: a step not in the registry is a SystemError", async () => {
    const pipeline: Pipeline = { pipeline: "default", steps: [{ step: "ghost-step" }] };
    const { port } = makePort({ steps: {} });
    const res = await runScaffoldPipeline(pipeline, [], {}, target([]), port);
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, PIPELINE_UNKNOWN_STEP);
  });

  it("AC-04: an empty target writes every rendered file; skipped is empty", async () => {
    const pipeline: Pipeline = { pipeline: "default", steps: [] };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("ai-plugin.json.tpl", "{}"), entry("m365agents.yml.tpl", "version: 1.12")],
      {},
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().written, ["ai-plugin.json", "m365agents.yml"]);
    assert.deepStrictEqual(res._unsafeUnwrap().skipped, []);
    assert.isTrue(writes.has("ai-plugin.json"));
    assert.isTrue(writes.has("m365agents.yml"));
  });

  it("AC-05: a colliding render path is skipped + warned, never overwritten; siblings still write", async () => {
    const pipeline: Pipeline = { pipeline: "default", steps: [] };
    const { port, writes, warnings } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("ai-plugin.json.tpl", "{}"), entry("m365agents.yml.tpl", "v")],
      {},
      target(["ai-plugin.json"]),
      port
    );
    assert.isTrue(res.isOk());
    const outcome = res._unsafeUnwrap();
    assert.deepStrictEqual(
      outcome.skipped.map((s) => s.path),
      ["ai-plugin.json"]
    );
    assert.include(outcome.skipped[0].warning, "not overwritten");
    assert.include(outcome.written, "m365agents.yml");
    assert.notInclude(outcome.written, "ai-plugin.json");
    assert.isFalse(writes.has("ai-plugin.json")); // never overwritten
    assert.isTrue(writes.has("m365agents.yml"));
    assert.lengthOf(warnings, 1);
    assert.include(warnings[0], "ai-plugin.json");
    assert.include(warnings[0], "not overwritten");
  });

  it("AC-23: active render filters omit matching paths before write/skip handling", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      render: {
        filters: [
          {
            when: "!featureFlag('TEST_OFF')",
            exclude: ["m365agents.sandbox.yml", "env/.env.sandbox"],
          },
        ],
      },
      steps: [],
    };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [
        entry("m365agents.sandbox.yml.tpl", "sandbox"),
        entry("env/.env.sandbox", "sandbox-env"),
        entry("m365agents.yml.tpl", "main"),
      ],
      {},
      target(["env/.env.sandbox"]),
      port
    );

    assert.isTrue(res.isOk());
    const outcome = res._unsafeUnwrap();
    assert.deepStrictEqual(outcome.filtered, ["m365agents.sandbox.yml", "env/.env.sandbox"]);
    assert.deepStrictEqual(outcome.written, ["m365agents.yml"]);
    assert.deepStrictEqual(outcome.skipped, []);
    assert.isFalse(writes.has("m365agents.sandbox.yml"));
    assert.isFalse(writes.has("env/.env.sandbox"));
    assert.isTrue(writes.has("m365agents.yml"));
  });

  it("AC-24: active render filters omit tpl bodies before missing-token render failures", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      render: {
        filters: [{ when: "featureFlag('TEST_ON')", exclude: ["filtered.txt"] }],
      },
      steps: [],
    };
    const { port } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("filtered.txt.tpl", "{{missingProducer}}"), entry("kept.txt.tpl", "ok")],
      {},
      target([]),
      port
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepStrictEqual(res._unsafeUnwrap().filtered, ["filtered.txt"]);
    assert.deepStrictEqual(res._unsafeUnwrap().written, ["kept.txt"]);
  });

  it("AC-23: inactive render filters leave matching files to normal write and skip handling", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      render: {
        filters: [{ when: "featureFlag('TEST_OFF')", exclude: ["copy.txt", "skip.txt"] }],
      },
      steps: [],
    };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("copy.txt", "copy"), entry("skip.txt", "skip")],
      {},
      target(["skip.txt"]),
      port
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    const outcome = res._unsafeUnwrap();
    assert.deepStrictEqual(outcome.filtered, []);
    assert.deepStrictEqual(outcome.written, ["copy.txt"]);
    assert.deepStrictEqual(
      outcome.skipped.map((s) => s.path),
      ["skip.txt"]
    );
    assert.strictEqual(writes.get("copy.txt")?.toString(), "copy");
    assert.isFalse(writes.has("skip.txt"));
  });

  it("AC-23: render filter predicate errors stop before writing matching files", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      render: {
        filters: [{ when: "missingFlag == 'on'", exclude: ["copy.txt"] }],
      },
      steps: [],
    };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("copy.txt", "copy")],
      {},
      target([]),
      port
    );

    assert.isTrue(res.isErr());
    assert.instanceOf(res._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(writes.size, 0);
  });

  it("AC-23: render filter predicate errors stop tpl files before body render", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      render: {
        filters: [{ when: "missingFlag == 'on'", exclude: ["copy.txt"] }],
      },
      steps: [],
    };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("copy.txt.tpl", "{{missingProducer}}")],
      {},
      target([]),
      port
    );

    assert.isTrue(res.isErr());
    assert.instanceOf(res._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(writes.size, 0);
  });

  it("AC-23: render filters match the final output path after path render and tpl stripping", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      render: {
        filters: [{ exclude: ["sandbox/m365agents.yml"] }],
      },
      steps: [],
    };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("{{folder}}/m365agents.yml.tpl", "{{missingProducer}}"), entry("kept.yml.tpl", "ok")],
      { folder: "sandbox" },
      target([]),
      port
    );

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepStrictEqual(res._unsafeUnwrap().filtered, ["sandbox/m365agents.yml"]);
    assert.isFalse(writes.has("sandbox/m365agents.yml"));
    assert.isTrue(writes.has("kept.yml"));
  });

  it("AC-06: declared-order steps apply in order, after the render phase completes", async () => {
    const order: string[] = [];
    let renderedBeforeSteps = false;
    const pipeline: Pipeline = { pipeline: "default", steps: [{ step: "s1" }, { step: "s2" }] };
    const { port, writes } = makePort({
      steps: {
        // s1 observes the rendered file already on disk → render preceded steps
        s1: new FakeStep({
          run: () => {
            renderedBeforeSteps = writes.has("f.txt");
            order.push("s1");
            return ok(undefined);
          },
        }),
        s2: new FakeStep({
          run: () => {
            order.push("s2");
            return ok(undefined);
          },
        }),
      },
    });
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("f.txt.tpl", "x")],
      {},
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().stepsRun, ["s1", "s2"]);
    assert.deepStrictEqual(order, ["s1", "s2"]);
    assert.isTrue(renderedBeforeSteps);
  });

  it("AC-07: a step whose when is false is skipped and listed in stepsSkipped", async () => {
    const s = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "s", when: "authType != 'none'" }],
    };
    const { port } = makePort({ steps: { s } });
    const res = await runScaffoldPipeline(pipeline, [], { authType: "none" }, target([]), port);
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().stepsSkipped, ["s"]);
    assert.deepStrictEqual(res._unsafeUnwrap().stepsRun, []);
    assert.strictEqual(s.applied.length, 0);
  });

  it("AC-08: the same step with a true when runs and is listed in stepsRun", async () => {
    const s = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "s", when: "authType != 'none'" }],
    };
    const { port } = makePort({ steps: { s } });
    const res = await runScaffoldPipeline(pipeline, [], { authType: "oauth" }, target([]), port);
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().stepsRun, ["s"]);
    assert.strictEqual(s.applied.length, 1);
  });

  it("AC-09: with is resolved by the same Mustache surface over renderVars", async () => {
    const s = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [
        {
          step: "s",
          with: { authType: "{{authType}}", mcpServerUrl: "{{MCPForDAServerUrl}}" },
        },
      ],
    };
    const { port } = makePort({ steps: { s } });
    const res = await runScaffoldPipeline(
      pipeline,
      [],
      { authType: "oauth", MCPForDAServerUrl: "https://api.example/mcp" },
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(s.applied[0], {
      authType: "oauth",
      mcpServerUrl: "https://api.example/mcp",
    });
  });

  it("AC-10: the resolved (not templated) with is what is validated", async () => {
    // the validator only passes if it sees the SUBSTITUTED value, never the raw `{{authType}}`
    const s = new FakeStep({
      validate: (r) => (r.authType === "oauth" ? undefined : "authType not resolved"),
    });
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "s", with: { authType: "{{authType}}" } }],
    };
    const { port } = makePort({ steps: { s } });
    const res = await runScaffoldPipeline(pipeline, [], { authType: "oauth" }, target([]), port);
    assert.isTrue(res.isOk());
    assert.strictEqual(s.applied.length, 1);
  });

  it("AC-11: a paramsSchema violation, or an absent identifier in when/with, is a SystemError", async () => {
    // (a) resolved `with` violates the step's paramsSchema
    const bad = new FakeStep({ validate: () => "missing required field 'ymlPath'" });
    const resA = await (async () => {
      const { port } = makePort({ steps: { bad } });
      return runScaffoldPipeline(
        { pipeline: "default", steps: [{ step: "bad", with: { x: "{{authType}}" } }] },
        [],
        { authType: "oauth" },
        target([]),
        port
      );
    })();
    assert.isTrue(resA.isErr());
    assert.instanceOf(resA._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(resA._unsafeUnwrapErr().name, PIPELINE_PARAMS_VIOLATION);

    // (b) a `with` value references an identifier absent from renderVars
    const s = new FakeStep();
    const resB = await (async () => {
      const { port } = makePort({ steps: { s } });
      return runScaffoldPipeline(
        { pipeline: "default", steps: [{ step: "s", with: { x: "{{absent}}" } }] },
        [],
        {},
        target([]),
        port
      );
    })();
    assert.isTrue(resB.isErr());
    assert.instanceOf(resB._unsafeUnwrapErr(), SystemError);

    // (c) a `when` guard references an identifier absent from renderVars
    const resC = await (async () => {
      const { port } = makePort({ steps: { s } });
      return runScaffoldPipeline(
        { pipeline: "default", steps: [{ step: "s", when: "ghost == 'x'" }] },
        [],
        {},
        target([]),
        port
      );
    })();
    assert.isTrue(resC.isErr());
    assert.instanceOf(resC._unsafeUnwrapErr(), SystemError);
  });

  it("AC-12: a manifest mutation is applied through the injected wrapper, never raw JSON", async () => {
    const register = new FakeStep({
      run: (r, ctx) => {
        const file = typeof r.pluginManifestPath === "string" ? r.pluginManifestPath : "";
        return ctx
          .manifestWrapper("declarativeAgent")
          .registerDeclarativeAgentAction("appPackage/manifest.json", file);
      },
    });
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [
        {
          step: "da-action/register-plugin-manifest",
          with: { pluginManifestPath: "appPackage/ai-plugin-{{MCPNamespace}}.json" },
        },
      ],
    };
    const { port, wrapper } = makePort({
      steps: { "da-action/register-plugin-manifest": register },
    });
    const res = await runScaffoldPipeline(
      pipeline,
      [],
      { MCPNamespace: "apigithubc" },
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(wrapper.registrations, [
      {
        teamsManifestPath: "appPackage/manifest.json",
        pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
      },
    ]);
  });

  it("AC-13: the create pipeline — guard passes, both mcp-auth steps run, ai-plugin.json is render-phase", async () => {
    const inject = new FakeStep({
      run: (_r, ctx) => {
        ctx.write("m365agents.yml", Buffer.from("# auth injected", "utf8"));
        return ok(undefined);
      },
    });
    const persist = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [
        { step: "require-empty-target" },
        {
          step: "mcp-auth/inject-yml-action",
          when: "authType != 'none'",
          with: {
            ymlPath: "m365agents.yml",
            authType: "{{authType}}",
            mcpServerUrl: "{{MCPForDAServerUrl}}",
          },
        },
        {
          step: "mcp-auth/persist-credential-env",
          when: "authType == 'oauth' || authType == 'entra-sso'",
          with: { authType: "{{authType}}", mcpServerUrl: "{{MCPForDAServerUrl}}" },
        },
      ],
    };
    const { port, writes } = makePort({
      steps: { "mcp-auth/inject-yml-action": inject, "mcp-auth/persist-credential-env": persist },
    });
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("appPackage/ai-plugin.json.tpl", "{}"), entry("m365agents.yml.tpl", "version: 1.12")],
      { authType: "oauth", MCPForDAServerUrl: "https://api.example/mcp" },
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    const outcome = res._unsafeUnwrap();
    assert.deepStrictEqual(outcome.stepsRun, [
      "require-empty-target",
      "mcp-auth/inject-yml-action",
      "mcp-auth/persist-credential-env",
    ]);
    assert.include(outcome.written, "appPackage/ai-plugin.json"); // from render, not a step
    assert.strictEqual(inject.applied.length, 1);
    assert.strictEqual(persist.applied.length, 1);
    assert.strictEqual(writes.get("m365agents.yml")?.toString(), "# auth injected");
  });

  it("AC-14: the create pipeline on a non-empty target is a UserError; nothing is written", async () => {
    const inject = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [
        { step: "require-empty-target" },
        { step: "mcp-auth/inject-yml-action", when: "authType != 'none'" },
      ],
    };
    const { port, writes } = makePort({ steps: { "mcp-auth/inject-yml-action": inject } });
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("appPackage/ai-plugin.json.tpl", "{}")],
      { authType: "oauth" },
      target(["README.md"]),
      port
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.strictEqual(e.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(writes.size, 0); // guard is first — no render, no write
    assert.strictEqual(inject.applied.length, 0);
  });

  it("AC-15: the modify pipeline — three steps run in order; render writes only absent files", async () => {
    const register = new FakeStep({
      run: (r, ctx) => {
        const file = typeof r.pluginManifestPath === "string" ? r.pluginManifestPath : "";
        return ctx
          .manifestWrapper("declarativeAgent")
          .registerDeclarativeAgentAction("appPackage/manifest.json", file);
      },
    });
    const inject = new FakeStep();
    const persist = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [
        {
          step: "da-action/register-plugin-manifest",
          with: {
            teamsManifestPath: "appPackage/manifest.json",
            pluginManifestPath: "appPackage/ai-plugin-{{MCPNamespace}}.json",
          },
        },
        {
          step: "mcp-auth/inject-yml-action",
          when: "authType != 'none'",
          with: { ymlPath: "m365agents.yml", authType: "{{authType}}" },
        },
        {
          step: "mcp-auth/persist-credential-env",
          when: "authType == 'oauth' || authType == 'entra-sso'",
          with: { authType: "{{authType}}" },
        },
      ],
    };
    const { port, writes, wrapper } = makePort({
      steps: {
        "da-action/register-plugin-manifest": register,
        "mcp-auth/inject-yml-action": inject,
        "mcp-auth/persist-credential-env": persist,
      },
    });
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("appPackage/ai-plugin-{{MCPNamespace}}.json.tpl", "{}")],
      {
        MCPNamespace: "apigithubc",
        authType: "oauth",
        MCPForDAServerUrl: "https://api.example/mcp",
      },
      target(["appPackage/manifest.json", "appPackage/declarativeAgent.json", "m365agents.yml"]),
      port
    );
    assert.isTrue(res.isOk());
    const outcome = res._unsafeUnwrap();
    assert.deepStrictEqual(outcome.stepsRun, [
      "da-action/register-plugin-manifest",
      "mcp-auth/inject-yml-action",
      "mcp-auth/persist-credential-env",
    ]);
    assert.deepStrictEqual(outcome.written, ["appPackage/ai-plugin-apigithubc.json"]);
    assert.isTrue(writes.has("appPackage/ai-plugin-apigithubc.json"));
    assert.deepStrictEqual(wrapper.registrations, [
      {
        teamsManifestPath: "appPackage/manifest.json",
        pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
      },
    ]);
  });

  it("AC-16: a cross-step reference (produces) is loader-rejected", async () => {
    const s = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "s", produces: ["serverName"] }],
    };
    const { port } = makePort({ steps: { s } });
    const res = await runScaffoldPipeline(pipeline, [], {}, target([]), port);
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, PIPELINE_CROSS_STEP_REFERENCE);
  });

  it("AC-17: identical inputs and target state yield an identical outcome", async () => {
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "s", when: "authType != 'none'" }],
    };
    const run = async (): Promise<Result<unknown, FxError>> => {
      const { port } = makePort({ steps: { s: new FakeStep() } });
      return runScaffoldPipeline(
        pipeline,
        [entry("a.txt.tpl", "{{authType}}"), entry("b.png", "raw")],
        { authType: "oauth" },
        target(["a.txt"]),
        port
      );
    };
    const a = await run();
    const b = await run();
    assert.isTrue(a.isOk());
    assert.deepStrictEqual(a._unsafeUnwrap(), b._unsafeUnwrap());
  });

  it("AC-18: a .tpl body is rendered and the .tpl suffix stripped on write", async () => {
    const pipeline: Pipeline = { pipeline: "default", steps: [] };
    const { port, writes } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("m365agents.yml.tpl", "url: {{MCPForDAServerUrl}}")],
      { MCPForDAServerUrl: "https://api.example/mcp" },
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.include(res._unsafeUnwrap().written, "m365agents.yml");
    assert.strictEqual(writes.get("m365agents.yml")?.toString(), "url: https://api.example/mcp");
  });

  it("AC-19: a non-.tpl entry is written verbatim — no substitution, no suffix change", async () => {
    const pipeline: Pipeline = { pipeline: "default", steps: [] };
    const { port, writes } = makePort();
    const png: TemplateFileEntry = {
      path: "appPackage/color.png",
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    };
    // a {{token}} inside a NON-.tpl file must survive verbatim (never rendered)
    const settings = entry(".vscode/settings.json", '{ "a": "{{b}}" }');
    const res = await runScaffoldPipeline(pipeline, [png, settings], {}, target([]), port);
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().written, [
      "appPackage/color.png",
      ".vscode/settings.json",
    ]);
    assert.deepStrictEqual(
      writes.get("appPackage/color.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
    assert.strictEqual(writes.get(".vscode/settings.json")?.toString(), '{ "a": "{{b}}" }');
  });

  it("AC-20: a .tpl body token with no producer is a SystemError, never an empty fill", async () => {
    const pipeline: Pipeline = { pipeline: "default", steps: [] };
    const { port } = makePort();
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("f.txt.tpl", "value: {{absent}}")],
      {},
      target([]),
      port
    );
    assert.isTrue(res.isErr());
    assert.instanceOf(res._unsafeUnwrapErr(), SystemError);
  });

  it("AC-21: a non-manifest step reads a render-phase file via ctx.read and rewrites it (RMW)", async () => {
    const appendStep = new FakeStep({
      run: (_resolved, ctx) => {
        const current = ctx.read("m365agents.yml");
        const base = current ? current.toString("utf8") : "";
        ctx.write("m365agents.yml", Buffer.from(base + "\n  - uses: oauth/register", "utf8"));
        return ok(undefined);
      },
    });
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "mcp-auth/inject-yml-action" }],
    };
    const { port, writes } = makePort({ steps: { "mcp-auth/inject-yml-action": appendStep } });
    const res = await runScaffoldPipeline(
      pipeline,
      [entry("m365agents.yml.tpl", "version: v1.12")],
      {},
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap().stepsRun, ["mcp-auth/inject-yml-action"]);
    // the render phase wrote the skeleton; the step read it back and appended the action
    assert.strictEqual(
      writes.get("m365agents.yml")?.toString(),
      "version: v1.12\n  - uses: oauth/register"
    );
  });

  it("AC-22: a with value that is exactly {{X}} of a string[] render-var passes the list structurally", async () => {
    const s = new FakeStep();
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "s", with: { servers: "{{SelectedLocalServers}}", host: "{{hostName}}" } }],
    };
    const { port } = makePort({ steps: { s } });
    const res = await runScaffoldPipeline(
      pipeline,
      [],
      { SelectedLocalServers: ["alpha", "gamma"], hostName: "example" },
      target([]),
      port
    );
    assert.isTrue(res.isOk());
    // the sole-token list resolves structurally (verbatim array); a scalar token still renders to a string
    assert.deepStrictEqual(s.applied[0], { servers: ["alpha", "gamma"], host: "example" });
  });

  it("AC-27: a named step reaches the injected environment writer without ordinary file writes", async () => {
    const persist: RegisteredStep = {
      validateParams: () => undefined,
      apply: (_resolved, ctx) =>
        ctx.writeEnvironment("dev", {
          MCP_DA_OAUTH_CLIENT_ID_TEST: "client-id",
          SECRET_MCP_DA_OAUTH_CLIENT_SECRET_TEST: "client-secret",
        }),
    };
    const pipeline: Pipeline = {
      pipeline: "default",
      steps: [{ step: "mcp-auth/persist-credential-env" }],
    };
    const { port, writes, environmentWrites } = makePort({
      steps: { "mcp-auth/persist-credential-env": persist },
    });

    const result = await runScaffoldPipeline(pipeline, [], {}, target([]), port);

    assert.isTrue(result.isOk());
    assert.deepStrictEqual(environmentWrites, [
      {
        environment: "dev",
        values: {
          MCP_DA_OAUTH_CLIENT_ID_TEST: "client-id",
          SECRET_MCP_DA_OAUTH_CLIENT_SECRET_TEST: "client-secret",
        },
      },
    ]);
    assert.strictEqual(writes.size, 0);
  });
});
