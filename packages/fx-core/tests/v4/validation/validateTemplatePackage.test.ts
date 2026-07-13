// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  ContentFile,
  TemplatePackagePort,
  VALIDATE_DANGLING_ROUTE,
  VALIDATE_ENGINE_TOO_OLD,
  VALIDATE_ENGINE_VERSION_INVALID,
  VALIDATE_KIND_OVERLAP,
  VALIDATE_MIN_ENGINE_MISSING,
  VALIDATE_PLACEHOLDER_DRIFT,
  VALIDATE_REQUIRED_FILE,
  VALIDATE_SCHEMA,
  VALIDATE_UNKNOWN_CAPABILITY,
  validateMinEngineVersion,
  validateTemplatePackage,
} from "../../../src/v4/validation/validateTemplatePackage";

/**
 * In-memory parts of one template package + its artifact/engine context. Each
 * test starts from `validParts()` (a self-consistent clean `create/mcp-server`
 * package) and mutates exactly the field its AC exercises, so a failure points
 * at one rule.
 */
interface PackageParts {
  descriptor: unknown;
  questions: unknown;
  pipeline: unknown;
  content: ContentFile[] | undefined;
  selectorCreate: unknown;
  selectorModify: unknown;
  presentCreate: string[];
  presentModify: string[];
  floor: string[];
  engineVersion: string;
  schemaDescriptorError: string | undefined;
  schemaQuestionError: string | undefined;
  schemaPipelineError: string | undefined;
  schemaSelectorError: string | undefined;
}

function validParts(): PackageParts {
  return {
    descriptor: {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: { mcpServerUrl: { type: "string" } } },
      replaceMap: [{ var: "MCPNamespace", const: "ns" }],
    },
    questions: { questions: [{ name: "mcpServerUrl", type: "text" }] },
    pipeline: { pipeline: "default", steps: [] },
    content: [{ path: "README.md", placeholders: ["MCPNamespace"] }],
    selectorCreate: {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "mcp-server" }],
    },
    selectorModify: { questions: [], routes: [] },
    presentCreate: ["mcp-server"],
    presentModify: [],
    floor: ["appName", "language"],
    engineVersion: "6.11.0",
    schemaDescriptorError: undefined,
    schemaQuestionError: undefined,
    schemaPipelineError: undefined,
    schemaSelectorError: undefined,
  };
}

function makePort(p: PackageParts): TemplatePackagePort {
  return {
    userError: (name, message) => new UserError({ source: "Scaffold", name, message }),
    descriptor: () => p.descriptor,
    questions: () => p.questions,
    pipeline: () => p.pipeline,
    content: () => p.content,
    selector: (kind) => (kind === "create" ? p.selectorCreate : p.selectorModify),
    schemas: {
      descriptor: () => p.schemaDescriptorError,
      question: () => p.schemaQuestionError,
      pipeline: () => p.schemaPipelineError,
      selector: () => p.schemaSelectorError,
    },
    capabilityFloor: (kind, id) => {
      if (kind === "step" && id === "da/set-sensitivity-label") {
        return "6.11.0";
      }
      if (kind === "step" && id === "future/unknown-step") {
        return undefined;
      }
      if (kind === "validator" && id === "future/validator") {
        return "6.11.0";
      }
      if (kind === "validator" && id === "future/unknown-validator") {
        return undefined;
      }
      return "5.20.0";
    },
    capabilityOutputs: (kind, id) =>
      kind === "provider" && id === "mcp.serverTypes" ? ["catalog"] : [],
    engineVersion: () => p.engineVersion,
    callerFloor: () => p.floor,
    presentTemplateIds: (kind) => (kind === "create" ? p.presentCreate : p.presentModify),
  };
}

describe("v4/validation/validateTemplatePackage", () => {
  it("AC-02: descriptor.json absent -> UserError naming it required", () => {
    const parts = validParts();
    parts.descriptor = undefined;

    const result = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, VALIDATE_REQUIRED_FILE);
    assert.include(result._unsafeUnwrapErr().message, "descriptor.json");
  });

  it("AC-08: descriptor.json must be a JSON object", () => {
    const parts = validParts();
    parts.descriptor = [];

    const result = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, VALIDATE_SCHEMA);
    assert.include(result._unsafeUnwrapErr().message, "JSON object");
  });

  it("AC-01: well-formed package (all four files, schema-valid) passes", () => {
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    assert.isTrue(res.isOk());
    const out = res._unsafeUnwrap();
    assert.equal(out.minEngineVersion, "5.20.0");
    assert.deepEqual(out.contentFiles, [{ path: "README.md", placeholders: ["MCPNamespace"] }]);
  });

  it("AC-02: questions.json absent -> UserError naming it required", () => {
    const parts = validParts();
    parts.questions = undefined;
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.equal(e.name, VALIDATE_REQUIRED_FILE);
    assert.include(e.message, "questions.json");
  });

  it("AC-03: pipeline.json absent -> UserError naming it required", () => {
    const parts = validParts();
    parts.pipeline = undefined;
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_REQUIRED_FILE);
    assert.include(e.message, "pipeline.json");
  });

  it("AC-04: questions.json = { questions: [] } is required-but-empty, valid", () => {
    const parts = validParts();
    parts.questions = { questions: [] };
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isOk());
  });

  it("AC-05: pipeline.json = { pipeline: 'default', steps: [] } is required-but-empty, valid", () => {
    const parts = validParts();
    parts.pipeline = { pipeline: "default", steps: [] };
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isOk());
  });

  it("AC-06: create and modify packages with no content/ folder (content() undefined) are valid", () => {
    const createParts = validParts();
    createParts.descriptor = {
      id: "pipeline-only",
      name: "Pipeline Only",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [],
    };
    createParts.content = undefined;
    createParts.selectorCreate = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "pipeline-only" }],
    };
    createParts.presentCreate = ["pipeline-only"];
    const createRes = validateTemplatePackage(
      "create",
      "pipeline-only",
      "load",
      makePort(createParts)
    );
    assert.isTrue(createRes.isOk());
    assert.deepEqual(createRes._unsafeUnwrap().contentFiles, []);

    const modifyParts = validParts();
    modifyParts.descriptor = {
      id: "pipeline-only-modify",
      name: "Pipeline Only Modify",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [],
    };
    modifyParts.content = undefined;
    modifyParts.selectorCreate = { questions: [], routes: [] };
    modifyParts.presentCreate = [];
    modifyParts.selectorModify = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "pipeline-only-modify" }],
    };
    modifyParts.presentModify = ["pipeline-only-modify"];
    const modifyRes = validateTemplatePackage(
      "modify",
      "pipeline-only-modify",
      "load",
      makePort(modifyParts)
    );
    assert.isTrue(modifyRes.isOk());
    assert.deepEqual(modifyRes._unsafeUnwrap().contentFiles, []);
  });

  it("AC-07: any file under content/ is renderable content - no marker-file exemption", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [],
    };
    // A would-be "marker" file that still carries an unproduced token.
    parts.content = [{ path: ".gitkeep", placeholders: ["UnproducedToken"] }];
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_PLACEHOLDER_DRIFT);
    assert.include(e.message, "UnproducedToken");
    assert.include(e.message, ".gitkeep");
  });

  it("AC-08: descriptor.json fails its schema -> UserError naming descriptor + rule", () => {
    const parts = validParts();
    parts.schemaDescriptorError = "additionalProperties: unknown key 'foo'";
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.equal(e.name, VALIDATE_SCHEMA);
    assert.include(e.message, "descriptor.json");
    assert.include(e.message, "additionalProperties: unknown key 'foo'");
  });

  it("AC-09: questions.json fails its schema -> UserError naming questions + rule", () => {
    const parts = validParts();
    parts.schemaQuestionError = "questions[0].type: not in enum";
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_SCHEMA);
    assert.include(e.message, "questions.json");
    assert.include(e.message, "not in enum");
  });

  it("AC-10: selector.json fails its schema -> UserError naming selector + rule", () => {
    const parts = validParts();
    parts.schemaSelectorError = "routes[0].engine: not in enum";
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_SCHEMA);
    assert.include(e.message, "selector.json");
    assert.include(e.message, "not in enum");
  });

  it("AC-11: content token with no producer -> UserError (drift) naming token + file", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: { mcpServerUrl: { type: "string" } } },
      replaceMap: [],
    };
    parts.content = [{ path: "src/app.ts", placeholders: ["NotProduced"] }];
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_PLACEHOLDER_DRIFT);
    assert.include(e.message, "NotProduced");
    assert.include(e.message, "src/app.ts");
  });

  it("AC-11: a declared provider-derived value produces a pipeline render var", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [],
    };
    parts.questions = {
      questions: [{ name: "serverType", type: "singleSelect", optionsFrom: "mcp.serverTypes" }],
    };
    parts.pipeline = {
      pipeline: "default",
      steps: [
        {
          step: "require-empty-target",
          with: { catalog: "{{derived.mcp.serverTypes.catalog}}" },
        },
      ],
    };
    parts.content = undefined;

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
  });

  it("AC-11: array pipeline values ignore non-strings and escaped Mustache tokens", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [],
    };
    parts.pipeline = {
      pipeline: "default",
      steps: [
        {
          step: "require-empty-target",
          with: {
            values: [42, "${{NotATemplateToken}}", "{{appName}}"],
            count: 3,
          },
        },
      ],
    };
    parts.content = undefined;

    const result = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  });

  it("AC-23: object-form question validators participate in capability validation", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: { serverUrl: { type: "string" } } },
      replaceMap: [],
    };
    parts.questions = {
      questions: [{ name: "serverUrl", type: "text", validation: { use: "uri" } }],
    };
    parts.content = undefined;

    const result = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  });

  it("AC-12: required replaceMap var consumed by no content file -> UserError (orphan)", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [{ var: "Orphan", const: "x" }],
    };
    parts.content = [{ path: "README.md", placeholders: [] }];
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_PLACEHOLDER_DRIFT);
    assert.include(e.message, "Orphan");
  });

  it("AC-12: a pipeline with value consumes a required replaceMap var", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [{ var: "SourceFolder", from: "sourceFolder" }],
    };
    parts.pipeline = {
      pipeline: "default",
      steps: [{ step: "require-empty-target", with: { sourceFolder: "{{SourceFolder}}" } }],
    };
    parts.content = undefined;

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
  });

  it("AC-13: every selector route resolves to a present descriptor -> ok", () => {
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    assert.isTrue(res.isOk());
  });

  it("AC-13: non-v4 and malformed selector routes do not create descriptor obligations", () => {
    const parts = validParts();
    parts.selectorCreate = {
      questions: [],
      routes: [
        { when: "true", engine: "v4", templateId: "mcp-server" },
        { when: "true", engine: "v3", templateId: "legacy-only" },
        { when: "true", engine: "v4" },
        null,
      ],
    };
    parts.selectorModify = undefined;

    const result = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  });

  it("AC-14: a v4 route to a templateId with no descriptor -> UserError naming the route", () => {
    const parts = validParts();
    parts.selectorCreate = {
      questions: [],
      routes: [
        { when: "true", engine: "v4", templateId: "mcp-server" },
        { when: "false", engine: "v4", templateId: "ghost" },
      ],
    };
    parts.presentCreate = ["mcp-server"];
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_DANGLING_ROUTE);
    assert.include(e.message, "ghost");
  });

  it("AC-15: a templateId routed in both create and modify selectors -> UserError (overlap)", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "shared",
      name: "Shared",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [],
    };
    parts.content = undefined;
    parts.selectorCreate = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "shared" }],
    };
    parts.selectorModify = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "shared" }],
    };
    parts.presentCreate = ["shared"];
    parts.presentModify = ["shared"];
    const res = validateTemplatePackage("create", "shared", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.equal(e.name, VALIDATE_KIND_OVERLAP);
    assert.include(e.message, "shared");
  });

  it("AC-16: descriptor.minEngineVersion missing -> UserError (mandatory)", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      optionsSchema: { type: "object", properties: { mcpServerUrl: { type: "string" } } },
      replaceMap: [{ var: "MCPNamespace", const: "ns" }],
    };
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.equal(e.name, VALIDATE_MIN_ENGINE_MISSING);
    assert.include(e.message, "minEngineVersion");
  });

  it("AC-17: load, engine 6.11.0 >= minEngineVersion 5.20.0 -> ok", () => {
    const parts = validParts();
    parts.engineVersion = "6.11.0";
    // descriptor.minEngineVersion is 5.20.0 in validParts().
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isOk());
  });

  it("AC-18: load, engine 6.11.0 < minEngineVersion 6.11.3 -> UserError (upgrade engine)", () => {
    const parts = validParts();
    parts.engineVersion = "6.11.0";
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "6.11.3",
      optionsSchema: { type: "object", properties: { mcpServerUrl: { type: "string" } } },
      replaceMap: [{ var: "MCPNamespace", const: "ns" }],
    };
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(res.isErr());
    const e = res._unsafeUnwrapErr();
    assert.instanceOf(e, UserError);
    assert.equal(e.name, VALIDATE_ENGINE_TOO_OLD);
    assert.include(e.message, "6.11.3");
  });

  it("AC-19: per-package gate separates siblings in one artifact (mcp-server ok, foo too-old)", () => {
    const okParts = validParts();
    okParts.engineVersion = "6.11.0";

    const foo = validParts();
    foo.engineVersion = "6.11.0";
    foo.descriptor = {
      id: "foo",
      name: "Foo",
      languages: ["common"],
      minEngineVersion: "6.11.3",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [{ var: "MCPNamespace", const: "ns" }],
    };
    foo.content = [{ path: "README.md", placeholders: ["MCPNamespace"] }];
    foo.selectorCreate = {
      questions: [],
      routes: [{ when: "true", engine: "v4", templateId: "foo" }],
    };
    foo.presentCreate = ["foo"];

    const resOk = validateTemplatePackage("create", "mcp-server", "load", makePort(okParts));
    const resFoo = validateTemplatePackage("create", "foo", "load", makePort(foo));
    assert.isTrue(resOk.isOk());
    assert.isTrue(resFoo.isErr());
    assert.equal(resFoo._unsafeUnwrapErr().name, VALIDATE_ENGINE_TOO_OLD);
  });

  it("AC-20: a malformed package fails identically under build and load", () => {
    const parts = validParts();
    parts.questions = undefined;
    const build = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));
    const load = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));
    assert.isTrue(build.isErr());
    assert.isTrue(load.isErr());
    const eb = build._unsafeUnwrapErr();
    const el = load._unsafeUnwrapErr();
    assert.equal(eb.name, el.name);
    assert.equal(eb.message, el.message);
  });

  it("conditional replaceMap vars and malformed entries do not become required outputs", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "5.20.0",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [null, { const: "missing-var" }, { var: "Optional", const: "x", when: "false" }],
    };
    parts.content = undefined;

    const result = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  });

  it("AC-21: identical inputs return the identical Result (pure)", () => {
    const res1 = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    const res2 = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    assert.isTrue(res1.isOk());
    assert.isTrue(res2.isOk());
    assert.deepEqual(res1._unsafeUnwrap(), res2._unsafeUnwrap());
  });

  it("AC-22: pipeline.json fails its schema -> UserError naming pipeline + rule", () => {
    const parts = validParts();
    parts.schemaPipelineError = "steps[0].step: is required";

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isErr());
    const error = res._unsafeUnwrapErr();
    assert.equal(error.name, VALIDATE_SCHEMA);
    assert.include(error.message, "pipeline.json");
    assert.include(error.message, "steps[0].step: is required");
  });

  it("AC-23: unknown named capability -> UserError naming the capability", () => {
    const parts = validParts();
    parts.pipeline = { pipeline: "default", steps: [{ step: "future/unknown-step" }] };

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isErr());
    const error = res._unsafeUnwrapErr();
    assert.equal(error.name, VALIDATE_UNKNOWN_CAPABILITY);
    assert.include(error.message, "future/unknown-step");
  });

  it("AC-23: unknown nested input-box validator is rejected during package validation", () => {
    const parts = validParts();
    parts.questions = {
      questions: [
        {
          name: "apiSpecLocation",
          type: "singleFileOrText",
          inputOptionItem: { id: "input" },
          inputBoxConfig: {
            name: "input-api-spec-url",
            validation: "future/unknown-validator",
          },
        },
      ],
    };

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isErr());
    const error = res._unsafeUnwrapErr();
    assert.equal(error.name, VALIDATE_UNKNOWN_CAPABILITY);
    assert.include(error.message, "future/unknown-validator");
  });

  it("AC-24: capability introduced after minEngineVersion -> UserError naming its floor", () => {
    const parts = validParts();
    parts.pipeline = {
      pipeline: "default",
      steps: [{ step: "da/set-sensitivity-label" }],
    };

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isErr());
    const error = res._unsafeUnwrapErr();
    assert.equal(error.name, "TemplatePackageCapabilityFloor");
    assert.include(error.message, "da/set-sensitivity-label");
    assert.include(error.message, "6.11.0");
  });

  it("AC-24: nested input-box validator participates in capability floor checks", () => {
    const parts = validParts();
    parts.questions = {
      questions: [
        {
          name: "apiSpecLocation",
          type: "singleFileOrText",
          inputOptionItem: { id: "input" },
          inputBoxConfig: {
            name: "input-api-spec-url",
            validation: "future/validator",
          },
        },
      ],
    };

    const res = validateTemplatePackage("create", "mcp-server", "build", makePort(parts));

    assert.isTrue(res.isErr());
    const error = res._unsafeUnwrapErr();
    assert.equal(error.name, "TemplatePackageCapabilityFloor");
    assert.include(error.message, "future/validator");
    assert.include(error.message, "6.11.0");
  });

  it("AC-28: malformed minEngineVersion is rejected instead of coerced", () => {
    const parts = validParts();
    parts.descriptor = {
      id: "mcp-server",
      name: "MCP Server",
      languages: ["common"],
      minEngineVersion: "6.11.invalid",
      optionsSchema: { type: "object", properties: {} },
      replaceMap: [{ var: "MCPNamespace", const: "ns" }],
    };

    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));

    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, VALIDATE_ENGINE_VERSION_INVALID);
    assert.include(res._unsafeUnwrapErr().message, "6.11.invalid");
  });

  it("AC-28: malformed consuming engineVersion is rejected instead of coerced", () => {
    const parts = validParts();
    parts.engineVersion = "6.11-next";

    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(parts));

    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, VALIDATE_ENGINE_VERSION_INVALID);
    assert.include(res._unsafeUnwrapErr().message, "6.11-next");
  });

  it("AC-16: reverse-gate helper rejects a non-object descriptor", () => {
    const result = validateMinEngineVersion(
      "create",
      "mcp-server",
      [],
      "6.11.0",
      makePort(validParts()).userError
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, VALIDATE_SCHEMA);
    assert.include(result._unsafeUnwrapErr().message, "JSON object");
  });

  it("AC-16: reverse-gate helper requires minEngineVersion", () => {
    const result = validateMinEngineVersion(
      "create",
      "mcp-server",
      {},
      "6.11.0",
      makePort(validParts()).userError
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, VALIDATE_MIN_ENGINE_MISSING);
  });

  it("AC-28: reverse-gate helper rejects malformed minEngineVersion", () => {
    const result = validateMinEngineVersion(
      "create",
      "mcp-server",
      { minEngineVersion: "next" },
      "6.11.0",
      makePort(validParts()).userError
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, VALIDATE_ENGINE_VERSION_INVALID);
    assert.include(result._unsafeUnwrapErr().message, "next");
  });
});
