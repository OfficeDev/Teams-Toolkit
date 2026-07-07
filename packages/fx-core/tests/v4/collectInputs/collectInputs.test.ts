// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { assert } from "vitest";
import {
  ExpressionRuntimePort,
  WhitelistFn,
  evaluateExpression,
} from "../../../src/v4/expression/evaluateExpression";
import {
  Asked,
  CollectInputsPort,
  INPUT_BOTH_OPTION_SOURCES,
  INPUT_FORWARD_DERIVED_REFERENCE,
  INPUT_PROVIDER_FAILED,
  INPUT_VALIDATION_FAILED,
  INPUT_UNKNOWN_VALIDATOR,
  INPUT_WALK_CANCELLED,
  OptionItem,
  OptionsSource,
  OptionsProvider,
  PromptUI,
  QuestionSpec,
  ResolvedOptions,
  Validator,
  collectInputs,
} from "../../../src/v4/collectInputs/collectInputs";

/**
 * Tests for docs/03-specs/operations/scaffolding/collect-inputs.md.
 * One `it` per INPUT-* acceptance-criteria row. v4-isolated (no v3 import).
 *
 * The `evaluate` port face is backed by the real shared evaluator over an
 * in-memory ExpressionRuntimePort, so conditions exercise the real grammar.
 */

// --- in-memory fakes of the narrow CollectInputsPort faces ---

/** The pure expression port: a small whitelist + a configurable feature-flag map. */
class ExprPort implements ExpressionRuntimePort {
  private readonly flagMap: Record<string, boolean>;
  constructor(flagMap: Record<string, boolean> = {}) {
    this.flagMap = flagMap;
  }
  functions(name: string): WhitelistFn | undefined {
    const table: Record<string, WhitelistFn> = {
      safeUpper: (s) => (s ?? "").toUpperCase(),
      safeLower: (s) => (s ?? "").toLowerCase(),
    };
    return table[name];
  }
  flags(name: string): boolean {
    return this.flagMap[name] ?? false;
  }
}

/** A scripted prompt driver: returns pre-programmed answers, recording every ask. */
class ScriptedUI implements PromptUI {
  asked: string[] = [];
  lastOptions: Record<string, OptionItem[] | undefined> = {};
  lastValidations: Record<
    string,
    ((value: string) => string | undefined | Promise<string | undefined>) | undefined
  > = {};
  private readonly script: Record<string, string>;
  private readonly multiScript: Record<string, string[]>;
  constructor(script: Record<string, string>, multiScript: Record<string, string[]> = {}) {
    this.script = script;
    this.multiScript = multiScript;
  }
  async ask(
    question: QuestionSpec,
    options: OptionsSource | undefined,
    _step?: number,
    validation?: (value: string) => string | undefined | Promise<string | undefined>
  ): Promise<Result<Asked<string>, FxError>> {
    this.asked.push(question.name);
    this.lastValidations[question.name] = validation;
    const resolvedOptions = await resolveTestOptions(options);
    this.lastOptions[question.name] = resolvedOptions;
    if (question.skipSingleOption === true && resolvedOptions?.length === 1) {
      return ok({ kind: "value", value: optionId(resolvedOptions[0]) });
    }
    if (question.name in this.script) {
      const value = this.script[question.name];
      const message = await validation?.(value);
      if (message !== undefined) {
        return err(
          new UserError({
            source: "Test",
            name: INPUT_VALIDATION_FAILED,
            message: `'${question.name}': ${message}`,
          })
        );
      }
      return ok({ kind: "value", value });
    }
    return err(
      new UserError({
        source: "Test",
        name: "NoScriptedAnswer",
        message: `no scripted answer for '${question.name}'`,
      })
    );
  }
  async askMulti(
    question: QuestionSpec,
    options: OptionsSource | undefined
  ): Promise<Result<Asked<string[]>, FxError>> {
    this.asked.push(question.name);
    const resolvedOptions = await resolveTestOptions(options);
    this.lastOptions[question.name] = resolvedOptions;
    if (question.skipSingleOption === true && resolvedOptions?.length === 1) {
      return ok({ kind: "value", value: [optionId(resolvedOptions[0])] });
    }
    if (question.name in this.multiScript) {
      return ok({ kind: "value", value: this.multiScript[question.name] });
    }
    return err(
      new UserError({
        source: "Test",
        name: "NoScriptedAnswer",
        message: `no scripted multi-answer for '${question.name}'`,
      })
    );
  }
}

function optionId(option: OptionItem): string {
  return option.id;
}

async function resolveTestOptions(
  options: OptionsSource | undefined
): Promise<OptionItem[] | undefined> {
  if (options === undefined || Array.isArray(options)) {
    return options;
  }
  return (await options()).options;
}

/** A no-scripted-answer error for the sequence-driven driver. */
function noScripted(name: string): FxError {
  return new UserError({ source: "Test", name: "NoScriptedAnswer", message: name });
}

/** One scripted reply for the sequenced driver: a scalar value, a multi value, or a host back. */
type SeqResponse =
  | { kind: "value"; value: string }
  | { kind: "multi"; value: string[] }
  | { kind: "back" };

/**
 * A sequence-driven prompt driver: it answers each ask / askMulti from an ordered
 * script (independent of the question name, so a question re-asked after a `back`
 * can get a different answer) and records each call's name + the host `step`.
 */
class SequencedPromptUI implements PromptUI {
  calls: { name: string; step?: number }[] = [];
  private cursor = 0;
  constructor(private readonly responses: SeqResponse[]) {}
  ask(
    question: QuestionSpec,
    _options: OptionsSource | undefined,
    step?: number
  ): Promise<Result<Asked<string>, FxError>> {
    this.calls.push({ name: question.name, step });
    const response = this.responses[this.cursor++];
    if (response === undefined || response.kind === "multi") {
      return Promise.resolve(err(noScripted(question.name)));
    }
    if (response.kind === "back") {
      return Promise.resolve(ok({ kind: "back" }));
    }
    return Promise.resolve(ok({ kind: "value", value: response.value }));
  }
  askMulti(
    question: QuestionSpec,
    _options: OptionsSource | undefined,
    step?: number
  ): Promise<Result<Asked<string[]>, FxError>> {
    this.calls.push({ name: question.name, step });
    const response = this.responses[this.cursor++];
    if (response === undefined || response.kind === "value") {
      return Promise.resolve(err(noScripted(question.name)));
    }
    if (response.kind === "back") {
      return Promise.resolve(ok({ kind: "back" }));
    }
    return Promise.resolve(ok({ kind: "value", value: response.value }));
  }
}

/** An in-memory options provider: records its fetch count and the params it saw. */
class FakeProvider implements OptionsProvider {
  fetchCount = 0;
  lastParams: Record<string, string> | undefined;
  derivedSchema?: string[];
  private readonly result: ResolvedOptions;
  constructor(result: ResolvedOptions, derivedSchema?: string[]) {
    this.result = result;
    this.derivedSchema = derivedSchema;
  }
  fetch(params: Record<string, string>): Promise<ResolvedOptions> {
    this.fetchCount++;
    this.lastParams = params;
    return Promise.resolve(this.result);
  }
}

/** The `"uri"` validator: an error message for a non-URI, `undefined` when valid. */
const uriValidator: Validator = (value) => {
  try {
    void new URL(value);
    return undefined;
  } catch {
    return "must be a valid URI";
  }
};

function makePort(opts: {
  ui: PromptUI;
  providers?: Record<string, OptionsProvider>;
  validators?: Record<string, Validator>;
  exprPort?: ExpressionRuntimePort;
}): CollectInputsPort {
  const exprPort = opts.exprPort ?? new ExprPort();
  return {
    ui: opts.ui,
    optionsProvider: (id) => opts.providers?.[id],
    validator: (name) => opts.validators?.[name],
    evaluate: (node, scope) => evaluateExpression(node, scope, exprPort),
  };
}

describe("collectInputs (v4)", () => {
  it("INPUT-01: a question whose condition is false is skipped whole", async () => {
    const questions: QuestionSpec[] = [
      {
        name: "mcpServerType",
        type: "singleSelect",
        staticOptions: [{ id: "local" }, { id: "remote" }],
      },
      { name: "mcpServerUrl", type: "text", condition: { expr: "mcpServerType == 'remote'" } },
    ];
    const ui = new ScriptedUI({ mcpServerType: "local" });
    const res = await collectInputs(
      questions,
      { properties: { mcpServerType: {}, mcpServerUrl: {} } },
      {},
      makePort({ ui })
    );
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().mcpServerType, "local");
    assert.notProperty(res._unsafeUnwrap(), "mcpServerUrl");
    assert.notInclude(ui.asked, "mcpServerUrl");
  });

  it("INPUT-02: an option-level condition hides only that option, not the question", async () => {
    const questions: QuestionSpec[] = [
      {
        name: "authType",
        type: "singleSelect",
        staticOptions: [
          { id: "oauth" },
          {
            id: "oauth-dynamic",
            condition: {
              expr: "featureFlag('TEAMSFX_MCP_FOR_DA_DT') && featureFlag('TEAMSFX_MCP_FOR_DA_DCR')",
            },
          },
          { id: "entra-sso" },
          { id: "none" },
        ],
      },
    ];
    const ui = new ScriptedUI({ authType: "none" });
    // flags off → the oauth-dynamic option is hidden, the question is still asked
    const res = await collectInputs(
      questions,
      { properties: { authType: {} } },
      {},
      makePort({ ui, exprPort: new ExprPort({}) })
    );
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().authType, "none");
    assert.include(ui.asked, "authType");
    assert.deepStrictEqual(
      (ui.lastOptions.authType ?? []).map((o) => o.id),
      ["oauth", "entra-sso", "none"]
    );
  });

  it("INPUT-03: a question declaring both staticOptions and optionsFrom is rejected", async () => {
    const questions: QuestionSpec[] = [
      { name: "x", type: "singleSelect", staticOptions: [{ id: "a" }], optionsFrom: "p" },
    ];
    const res = await collectInputs(
      questions,
      { properties: { x: {} } },
      {},
      makePort({ ui: new ScriptedUI({}) })
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, INPUT_BOTH_OPTION_SOURCES);
  });

  it("INPUT-04: skipSingleOption auto-selects a sole provider option through the UI", async () => {
    const provider = new FakeProvider({ options: [{ id: "remote" }] });
    const questions: QuestionSpec[] = [
      {
        name: "mcpServerType",
        type: "singleSelect",
        optionsFrom: "mcp.serverTypes",
        skipSingleOption: true,
      },
    ];
    const ui = new ScriptedUI({});
    const res = await collectInputs(
      questions,
      { properties: { mcpServerType: {} } },
      {},
      makePort({ ui, providers: { "mcp.serverTypes": provider } })
    );
    assert.strictEqual(res._unsafeUnwrap().mcpServerType, "remote");
    assert.include(ui.asked, "mcpServerType");
  });

  it("INPUT-05: optionsFrom invokes the named provider through the port", async () => {
    const provider = new FakeProvider({ options: [{ id: "local" }, { id: "remote" }] });
    const questions: QuestionSpec[] = [
      { name: "mcpServerType", type: "singleSelect", optionsFrom: "mcp.serverTypes" },
    ];
    const ui = new ScriptedUI({ mcpServerType: "remote" });
    const res = await collectInputs(
      questions,
      { properties: { mcpServerType: {} } },
      {},
      makePort({ ui, providers: { "mcp.serverTypes": provider } })
    );
    assert.strictEqual(provider.fetchCount, 1);
    assert.strictEqual(res._unsafeUnwrap().mcpServerType, "remote");
    assert.deepStrictEqual(
      (ui.lastOptions.mcpServerType ?? []).map((o) => o.id),
      ["local", "remote"]
    );
  });

  it("INPUT-06: optionsFromParams close over an answer via the shared evaluator", async () => {
    const provider = new FakeProvider({ options: [{ id: "op1" }] });
    const questions: QuestionSpec[] = [
      { name: "apiSpecLocation", type: "text" },
      {
        name: "apiOperation",
        type: "singleSelect",
        optionsFrom: "openapi.operations",
        optionsFromParams: { specLocation: { from: "apiSpecLocation" } },
        skipSingleOption: true,
      },
    ];
    const ui = new ScriptedUI({ apiSpecLocation: "https://contoso.example/openapi.yaml" });
    const res = await collectInputs(
      questions,
      { properties: { apiSpecLocation: {}, apiOperation: {} } },
      {},
      makePort({ ui, providers: { "openapi.operations": provider } })
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(provider.lastParams, {
      specLocation: "https://contoso.example/openapi.yaml",
    });
  });

  it("INPUT-07: provider derived merges under the reserved derived.<id>.<key> namespace", async () => {
    const provider = new FakeProvider(
      { options: [{ id: "remote" }], derived: { apiAuthData: "bearer" } },
      ["apiAuthData"]
    );
    const questions: QuestionSpec[] = [
      {
        name: "mcpServerType",
        type: "singleSelect",
        optionsFrom: "mcp.serverTypes",
        skipSingleOption: true,
      },
    ];
    const res = await collectInputs(
      questions,
      { properties: { mcpServerType: {} } },
      {},
      makePort({ ui: new ScriptedUI({}), providers: { "mcp.serverTypes": provider } })
    );
    assert.strictEqual(res._unsafeUnwrap()["derived.mcp.serverTypes.apiAuthData"], "bearer");
  });

  it("INPUT-08: a forward derived.<id>.<key> reference is rejected", async () => {
    const early = new FakeProvider({ options: [{ id: "x" }] });
    const late = new FakeProvider({ options: [{ id: "y" }], derived: { key: "v" } }, ["key"]);
    const questions: QuestionSpec[] = [
      // 'early' reads derived.late.key, but 'late' is declared after → forward reference
      {
        name: "q1",
        type: "singleSelect",
        optionsFrom: "early",
        optionsFromParams: { p: { from: "derived.late.key" } },
        skipSingleOption: true,
      },
      { name: "q2", type: "singleSelect", optionsFrom: "late", skipSingleOption: true },
    ];
    const res = await collectInputs(
      questions,
      { properties: { q1: {}, q2: {} } },
      {},
      makePort({ ui: new ScriptedUI({}), providers: { early, late } })
    );
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, SystemError);
    assert.strictEqual(e.name, INPUT_FORWARD_DERIVED_REFERENCE);
  });

  it("INPUT-09: a provider resolves once per (providerId, params) within a run", async () => {
    const provider = new FakeProvider({ options: [{ id: "remote" }] });
    const questions: QuestionSpec[] = [
      { name: "a", type: "singleSelect", optionsFrom: "mcp.serverTypes", skipSingleOption: true },
      { name: "b", type: "singleSelect", optionsFrom: "mcp.serverTypes", skipSingleOption: true },
    ];
    const res = await collectInputs(
      questions,
      { properties: { a: {}, b: {} } },
      {},
      makePort({ ui: new ScriptedUI({}), providers: { "mcp.serverTypes": provider } })
    );
    assert.isTrue(res.isOk());
    // the second invocation hits the session cache — no re-fetch
    assert.strictEqual(provider.fetchCount, 1);
  });

  it("INPUT-10: a failed validation is a UserError naming the question", async () => {
    const questions: QuestionSpec[] = [{ name: "mcpServerUrl", type: "text", validation: "uri" }];
    const ui = new ScriptedUI({ mcpServerUrl: "not a uri" });
    const res = await collectInputs(
      questions,
      { properties: { mcpServerUrl: {} } },
      {},
      makePort({ ui, validators: { uri: uriValidator } })
    );
    assert.isFunction(ui.lastValidations.mcpServerUrl);
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.strictEqual(e.name, INPUT_VALIDATION_FAILED);
    assert.include(e.message, "mcpServerUrl");
  });

  it("INPUT-10: an unknown question validator is rejected before prompting", async () => {
    const questions: QuestionSpec[] = [
      { name: "mcpServerUrl", type: "text", validation: "missing" },
    ];
    const ui = new ScriptedUI({ mcpServerUrl: "https://api.example.com/mcp" });

    const res = await collectInputs(
      questions,
      { properties: { mcpServerUrl: {} } },
      {},
      makePort({ ui })
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_UNKNOWN_VALIDATOR);
    assert.deepStrictEqual(ui.asked, []);
  });

  it("INPUT-10: an unknown input-box validator is rejected before prompting", async () => {
    const questions: QuestionSpec[] = [
      {
        name: "apiSpecLocation",
        type: "singleFileOrText",
        inputOptionItem: { id: "input" },
        inputBoxConfig: { name: "input-api-spec-url", validation: "missing" },
      },
    ];
    const ui = new ScriptedUI({ apiSpecLocation: "https://example.com/openapi.yaml" });

    const res = await collectInputs(
      questions,
      { properties: { apiSpecLocation: {} } },
      {},
      makePort({ ui })
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_UNKNOWN_VALIDATOR);
    assert.deepStrictEqual(ui.asked, []);
  });

  it("INPUT-10: scalar provider errors after prompting are returned as input errors", async () => {
    const providerError = new UserError({
      source: "Test",
      name: "ProviderUserError",
      message: "bad",
    });
    const provider: OptionsProvider = { fetch: async () => Promise.reject(providerError) };
    const questions: QuestionSpec[] = [
      { name: "openApiSpec", type: "singleSelect", optionsFrom: "openapi.search" },
    ];

    const res = await collectInputs(
      questions,
      { properties: { openApiSpec: {} } },
      {},
      makePort({
        ui: new SequencedPromptUI([{ kind: "value", value: "https://example.com/openapi.yaml" }]),
        providers: { "openapi.search": provider },
      })
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "ProviderUserError");
  });

  it("INPUT-10: multi provider exceptions after prompting are wrapped as provider failures", async () => {
    const provider: OptionsProvider = {
      fetch: async () => Promise.reject(new Error("provider exploded")),
    };
    const questions: QuestionSpec[] = [
      { name: "apiOperations", type: "multiSelect", optionsFrom: "openapi.operations" },
    ];

    const res = await collectInputs(
      questions,
      { properties: { apiOperations: {} } },
      {},
      makePort({
        ui: new SequencedPromptUI([{ kind: "multi", value: ["GET /repairs"] }]),
        providers: { "openapi.operations": provider },
      })
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_PROVIDER_FAILED);
  });

  it("INPUT-10: non-Error provider exceptions are wrapped as provider failures", async () => {
    const provider: OptionsProvider = {
      fetch: async () => Promise.reject("provider exploded"),
    };
    const questions: QuestionSpec[] = [
      { name: "apiOperations", type: "multiSelect", optionsFrom: "openapi.operations" },
    ];

    const res = await collectInputs(
      questions,
      { properties: { apiOperations: {} } },
      {},
      makePort({
        ui: new SequencedPromptUI([{ kind: "multi", value: ["GET /repairs"] }]),
        providers: { "openapi.operations": provider },
      })
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, INPUT_PROVIDER_FAILED);
    assert.include(res._unsafeUnwrapErr().message, "provider exploded");
  });

  it("INPUT-11: machine-state (odr.exe) gating is the provider, never a condition predicate", async () => {
    // odr absent → the provider yields only 'remote'; no condition probes the machine.
    const odrAbsent = new FakeProvider({ options: [{ id: "remote" }] });
    const questions: QuestionSpec[] = [
      {
        name: "mcpServerType",
        type: "singleSelect",
        optionsFrom: "mcp.serverTypes",
        skipSingleOption: true,
      },
    ];
    const res = await collectInputs(
      questions,
      { properties: { mcpServerType: {} } },
      {},
      makePort({ ui: new ScriptedUI({}), providers: { "mcp.serverTypes": odrAbsent } })
    );
    assert.strictEqual(res._unsafeUnwrap().mcpServerType, "remote");
    assert.strictEqual(odrAbsent.fetchCount, 1);
  });

  it("INPUT-12: an entry.params pre-fill skips the question (condition false) and uses the value", async () => {
    // modify add-mcp-server conformance fixture: condition `mcpServerUrl == null`.
    const questions: QuestionSpec[] = [
      {
        name: "mcpServerUrl",
        type: "text",
        condition: { expr: "mcpServerUrl == null" },
        validation: "uri",
      },
    ];
    const url = "https://api.github.com/mcp";
    // pre-filled: the supplied value is used, the question is not prompted
    const uiPre = new ScriptedUI({});
    const resPre = await collectInputs(
      questions,
      { properties: { mcpServerUrl: {} } },
      { mcpServerUrl: url },
      makePort({ ui: uiPre, validators: { uri: uriValidator } })
    );
    assert.isTrue(resPre.isOk());
    assert.strictEqual(resPre._unsafeUnwrap().mcpServerUrl, url);
    assert.notInclude(uiPre.asked, "mcpServerUrl");
    // not pre-filled: the unanswered declared id is null → the question IS asked
    const uiAsk = new ScriptedUI({ mcpServerUrl: url });
    const resAsk = await collectInputs(
      questions,
      { properties: { mcpServerUrl: {} } },
      {},
      makePort({ ui: uiAsk, validators: { uri: uriValidator } })
    );
    assert.isTrue(resAsk.isOk());
    assert.include(uiAsk.asked, "mcpServerUrl");
    assert.strictEqual(resAsk._unsafeUnwrap().mcpServerUrl, url);
  });

  it("INPUT-13: caller-provided language question behaves like any other singleSelect", async () => {
    const questions: QuestionSpec[] = [
      { name: "first", type: "singleSelect", staticOptions: [{ id: "a" }, { id: "b" }] },
      {
        name: "language",
        type: "singleSelect",
        staticOptions: [
          { id: "typescript", label: "TypeScript" },
          { id: "javascript", label: "JavaScript" },
          { id: "python", label: "Python" },
        ],
      },
    ];
    const uiMulti = new ScriptedUI({ first: "a", language: "typescript" });
    const resMulti = await collectInputs(
      questions,
      { properties: { first: {}, language: {} } },
      {},
      makePort({ ui: uiMulti })
    );
    assert.strictEqual(resMulti._unsafeUnwrap().first, "a");
    assert.strictEqual(resMulti._unsafeUnwrap().language, "typescript");
    assert.deepStrictEqual(uiMulti.asked, ["first", "language"]);
    // the language options carry proper-cased display labels (mirroring v3's LanguageOptionMap),
    // not the raw lowercase ids
    assert.deepStrictEqual(uiMulti.lastOptions.language, [
      { id: "typescript", label: "TypeScript" },
      { id: "javascript", label: "JavaScript" },
      { id: "python", label: "Python" },
    ]);

    // A caller whose descriptor languages are ['common'] simply does not add a language question.
    const uiCommon = new ScriptedUI({});
    const resCommon = await collectInputs([], {}, {}, makePort({ ui: uiCommon }));
    assert.notInclude(uiCommon.asked, "language");
    assert.notProperty(resCommon._unsafeUnwrap(), "language");
  });

  it("INPUT-13: a pre-filled language skips the caller-provided language question", async () => {
    const ui = new ScriptedUI({});
    const res = await collectInputs(
      [
        {
          name: "language",
          type: "singleSelect",
          staticOptions: [{ id: "typescript" }, { id: "javascript" }],
        },
      ],
      { properties: { language: {} } },
      { language: "javascript" },
      makePort({ ui })
    );

    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().language, "javascript");
    assert.notInclude(ui.asked, "language");
  });

  it("INPUT-14: identical inputs collect identical answers", async () => {
    const questions: QuestionSpec[] = [
      {
        name: "mcpServerType",
        type: "singleSelect",
        optionsFrom: "mcp.serverTypes",
        skipSingleOption: true,
      },
      { name: "authType", type: "singleSelect", staticOptions: [{ id: "none" }, { id: "oauth" }] },
    ];
    const build = (provider: OptionsProvider): CollectInputsPort =>
      makePort({
        ui: new ScriptedUI({ authType: "none" }),
        providers: { "mcp.serverTypes": provider },
      });
    const a = await collectInputs(
      questions,
      { properties: { mcpServerType: {}, authType: {} } },
      {},
      build(new FakeProvider({ options: [{ id: "remote" }] }))
    );
    const b = await collectInputs(
      questions,
      { properties: { mcpServerType: {}, authType: {} } },
      {},
      build(new FakeProvider({ options: [{ id: "remote" }] }))
    );
    assert.deepStrictEqual(a._unsafeUnwrap(), b._unsafeUnwrap());
  });

  it("INPUT-15: a multiSelect question records the selected ids as a string[]", async () => {
    const questions: QuestionSpec[] = [
      {
        name: "selectedLocalServers",
        type: "multiSelect",
        staticOptions: [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }],
      },
    ];
    const ui = new ScriptedUI({}, { selectedLocalServers: ["alpha", "gamma"] });
    const res = await collectInputs(
      questions,
      { properties: { selectedLocalServers: {} } },
      {},
      makePort({ ui })
    );
    assert.isTrue(res.isOk());
    // INV-7: the multi-pick face yields the string[] of selected ids, order-preserving
    assert.deepStrictEqual(res._unsafeUnwrap().selectedLocalServers, ["alpha", "gamma"]);
    assert.include(ui.asked, "selectedLocalServers");
  });

  it("INPUT-16: a back re-asks the previous prompted question, discarding the stale answer", async () => {
    const questions: QuestionSpec[] = [
      { name: "first", type: "singleSelect", staticOptions: [{ id: "a" }, { id: "b" }] },
      { name: "second", type: "singleSelect", staticOptions: [{ id: "x" }, { id: "y" }] },
    ];
    // first→a, second→back (re-asks first), first→b, second→x
    const ui = new SequencedPromptUI([
      { kind: "value", value: "a" },
      { kind: "back" },
      { kind: "value", value: "b" },
      { kind: "value", value: "x" },
    ]);
    const res = await collectInputs(
      questions,
      { properties: { first: {}, second: {} } },
      {},
      makePort({ ui })
    );
    assert.isTrue(res.isOk());
    // the stale first=a is discarded; the re-picked first=b wins
    assert.deepStrictEqual(res._unsafeUnwrap(), { first: "b", second: "x" });
    // back re-asks first, so the call order is first, second, first, second
    assert.deepStrictEqual(
      ui.calls.map((c) => c.name),
      ["first", "second", "first", "second"]
    );
    // the first prompt is step 1 (no Back button); the second is step 2
    assert.deepStrictEqual(
      ui.calls.map((c) => c.step),
      [1, 2, 1, 2]
    );
  });

  it("INPUT-17: a back from a caller-provided language question crosses into the previous question", async () => {
    const questions: QuestionSpec[] = [
      { name: "first", type: "singleSelect", staticOptions: [{ id: "a" }, { id: "b" }] },
      {
        name: "language",
        type: "singleSelect",
        staticOptions: [{ id: "typescript" }, { id: "javascript" }],
      },
    ];
    // first→a, language→back (re-asks Q2), first→b, language→javascript
    const ui = new SequencedPromptUI([
      { kind: "value", value: "a" },
      { kind: "back" },
      { kind: "value", value: "b" },
      { kind: "value", value: "javascript" },
    ]);
    const res = await collectInputs(
      questions,
      { properties: { first: {}, language: {} } },
      {},
      makePort({ ui })
    );
    assert.isTrue(res.isOk());
    // the stale first=a is discarded; the re-picked first=b wins
    assert.deepStrictEqual(res._unsafeUnwrap(), { first: "b", language: "javascript" });
    assert.deepStrictEqual(
      ui.calls.map((c) => c.name),
      ["first", "language", "first", "language"]
    );
    assert.deepStrictEqual(
      ui.calls.map((c) => c.step),
      [1, 2, 1, 2]
    );
  });

  it("INPUT-18: a back at the very first prompt cancels the walk", async () => {
    const questions: QuestionSpec[] = [
      { name: "first", type: "singleSelect", staticOptions: [{ id: "a" }, { id: "b" }] },
    ];
    const ui = new SequencedPromptUI([{ kind: "back" }]);
    const res = await collectInputs(questions, { properties: { first: {} } }, {}, makePort({ ui }));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.strictEqual(e.name, INPUT_WALK_CANCELLED);
    // only the first prompt was shown, at step 1 (so the host showed no Back button)
    assert.deepStrictEqual(ui.calls, [{ name: "first", step: 1 }]);
  });

  it("INPUT-19: a back at a multiSelect re-asks the previous question; the multi value is discarded", async () => {
    const questions: QuestionSpec[] = [
      { name: "first", type: "singleSelect", staticOptions: [{ id: "a" }, { id: "b" }] },
      {
        name: "servers",
        type: "multiSelect",
        staticOptions: [{ id: "x" }, { id: "y" }, { id: "z" }],
      },
    ];
    // first→a, servers→back (re-asks first), first→b, servers→[x,z]
    const ui = new SequencedPromptUI([
      { kind: "value", value: "a" },
      { kind: "back" },
      { kind: "value", value: "b" },
      { kind: "multi", value: ["x", "z"] },
    ]);
    const res = await collectInputs(
      questions,
      { properties: { first: {}, servers: {} } },
      {},
      makePort({ ui })
    );
    assert.isTrue(res.isOk());
    assert.deepStrictEqual(res._unsafeUnwrap(), { first: "b", servers: ["x", "z"] });
    assert.deepStrictEqual(
      ui.calls.map((c) => c.name),
      ["first", "servers", "first", "servers"]
    );
  });
});
