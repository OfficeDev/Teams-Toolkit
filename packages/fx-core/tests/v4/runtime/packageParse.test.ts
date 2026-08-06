// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { parsePipeline } from "../../../src/v4/runtime/packageParse";
import { assert } from "vitest";

describe("v4 runtime — packageParse", () => {
  it("parsePipeline accepts render filters", () => {
    const res = parsePipeline({
      pipeline: "default",
      render: {
        filters: [
          {
            comment: "sandbox files are opt-in",
            when: "!featureFlag('TEAMSFX_SANDBOXED_TEAM')",
            exclude: ["m365agents.sandbox.yml", "env/.env.sandbox"],
          },
        ],
      },
      steps: [],
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepStrictEqual(res._unsafeUnwrap().render?.filters, [
      {
        comment: "sandbox files are opt-in",
        when: "!featureFlag('TEAMSFX_SANDBOXED_TEAM')",
        exclude: ["m365agents.sandbox.yml", "env/.env.sandbox"],
      },
    ]);
  });

  it("parsePipeline rejects malformed render filters", () => {
    const res = parsePipeline({
      pipeline: "default",
      render: {
        filters: [{ when: true, exclude: ["m365agents.sandbox.yml"] }],
      },
      steps: [],
    });

    assert.isTrue(res.isErr());
  });

  it("parsePipeline rejects malformed render filter containers", () => {
    const nonObjectRender = parsePipeline({
      pipeline: "default",
      render: "nope",
      steps: [],
    });
    const nonArrayFilters = parsePipeline({
      pipeline: "default",
      render: { filters: "nope" },
      steps: [],
    });

    assert.isTrue(nonObjectRender.isErr());
    assert.isTrue(nonArrayFilters.isErr());
  });

  it("parsePipeline rejects malformed render filter items", () => {
    const nonObjectFilter = parsePipeline({
      pipeline: "default",
      render: { filters: ["nope"] },
      steps: [],
    });
    const nonStringExclude = parsePipeline({
      pipeline: "default",
      render: { filters: [{ exclude: ["m365agents.sandbox.yml", 1] }] },
      steps: [],
    });

    assert.isTrue(nonObjectFilter.isErr());
    assert.isTrue(nonStringExclude.isErr());
  });

  it("parsePipeline accepts literal string[] step parameters", () => {
    const res = parsePipeline({
      pipeline: "default",
      steps: [
        {
          step: "example/step",
          with: {
            scopes: ["User.Read", "Mail.Read"],
          },
        },
      ],
    });

    assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
    assert.deepStrictEqual(res._unsafeUnwrap().steps[0].with, {
      scopes: ["User.Read", "Mail.Read"],
    });
  });

  it("parsePipeline rejects non-string arrays in step parameters", () => {
    const res = parsePipeline({
      pipeline: "default",
      steps: [
        {
          step: "example/step",
          with: {
            scopes: ["User.Read", 1],
          },
        },
      ],
    });

    assert.isTrue(res.isErr());
  });
});
