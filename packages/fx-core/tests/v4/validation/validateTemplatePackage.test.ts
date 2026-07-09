// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  ContentFile,
  TemplatePackagePort,
  VALIDATE_DANGLING_ROUTE,
  VALIDATE_ENGINE_TOO_OLD,
  VALIDATE_KIND_OVERLAP,
  VALIDATE_MIN_ENGINE_MISSING,
  VALIDATE_PLACEHOLDER_DRIFT,
  VALIDATE_REQUIRED_FILE,
  VALIDATE_SCHEMA,
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
    schemaSelectorError: undefined,
  };
}

function makePort(p: PackageParts): TemplatePackagePort {
  return {
    descriptor: () => p.descriptor,
    questions: () => p.questions,
    pipeline: () => p.pipeline,
    content: () => p.content,
    selector: (kind) => (kind === "create" ? p.selectorCreate : p.selectorModify),
    schemas: {
      descriptor: () => p.schemaDescriptorError,
      question: () => p.schemaQuestionError,
      selector: () => p.schemaSelectorError,
    },
    engineVersion: () => p.engineVersion,
    callerFloor: () => p.floor,
    presentTemplateIds: (kind) => (kind === "create" ? p.presentCreate : p.presentModify),
  };
}

describe("v4/validation/validateTemplatePackage", () => {
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

  it("AC-13: every selector route resolves to a present descriptor -> ok", () => {
    const res = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    assert.isTrue(res.isOk());
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

  it("AC-21: identical inputs return the identical Result (pure)", () => {
    const res1 = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    const res2 = validateTemplatePackage("create", "mcp-server", "load", makePort(validParts()));
    assert.isTrue(res1.isOk());
    assert.isTrue(res2.isOk());
    assert.deepEqual(res1._unsafeUnwrap(), res2._unsafeUnwrap());
  });
});
