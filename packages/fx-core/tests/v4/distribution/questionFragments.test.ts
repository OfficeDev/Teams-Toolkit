// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { assert } from "vitest";
import { resolveQuestions } from "../../../src/v4/distribution/questionFragments";

/** A `FragmentReader` over an in-memory fragment map. */
function reader(
  fragments: Record<string, unknown>
): (name: string) => Result<unknown, SystemError> {
  return (name) => {
    if (Object.prototype.hasOwnProperty.call(fragments, name)) {
      return ok(fragments[name]);
    }
    return err(new SystemError({ source: "Test", name: "FragmentMissing", message: name }));
  };
}

function names(res: ReturnType<typeof resolveQuestions>): string[] {
  return res._unsafeUnwrap().map((q) => q.name);
}

describe("resolveQuestions (question fragments)", () => {
  it("splices a { use } fragment's questions in place", () => {
    const fragments = {
      llm: {
        questions: [
          { name: "a", type: "text" },
          { name: "b", type: "text" },
        ],
      },
    };
    const res = resolveQuestions(
      {
        questions: [{ name: "pre", type: "text" }, { use: "llm" }, { name: "post", type: "text" }],
      },
      "q.json",
      reader(fragments)
    );
    assert.deepEqual(names(res), ["pre", "a", "b", "post"]);
  });

  it("resolves nested fragments (a fragment may use another)", () => {
    const fragments = {
      outer: { questions: [{ use: "inner" }, { name: "x", type: "text" }] },
      inner: { questions: [{ name: "y", type: "text" }] },
    };
    const res = resolveQuestions({ questions: [{ use: "outer" }] }, "q.json", reader(fragments));
    assert.deepEqual(names(res), ["y", "x"]);
  });

  it("preserves every field on a spliced question (e.g. password)", () => {
    const fragments = {
      secret: { questions: [{ name: "key", type: "text", password: true, optional: true }] },
    };
    const res = resolveQuestions({ questions: [{ use: "secret" }] }, "q.json", reader(fragments));
    assert.deepEqual(res._unsafeUnwrap(), [
      { name: "key", type: "text", password: true, optional: true },
    ]);
  });

  it("propagates a missing-fragment reader error", () => {
    const res = resolveQuestions({ questions: [{ use: "nope" }] }, "q.json", reader({}));
    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, "FragmentMissing");
  });

  it("rejects a cyclic fragment reference", () => {
    const fragments = {
      a: { questions: [{ use: "b" }] },
      b: { questions: [{ use: "a" }] },
    };
    const res = resolveQuestions({ questions: [{ use: "a" }] }, "q.json", reader(fragments));
    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, "QuestionFragmentCycle");
  });

  it("rejects an unsafe fragment name before reading it (Zip-Slip guard)", () => {
    let read = false;
    const res = resolveQuestions({ questions: [{ use: "../evil" }] }, "q.json", () => {
      read = true;
      return ok({ questions: [] });
    });
    assert.isTrue(res.isErr());
    assert.equal(res._unsafeUnwrapErr().name, "QuestionFragmentInvalidName");
    assert.isFalse(read);
  });

  it("rejects a fragment whose body lacks a questions array", () => {
    const res = resolveQuestions(
      { questions: [{ use: "bad" }] },
      "q.json",
      reader({ bad: { notQuestions: [] } })
    );
    assert.isTrue(res.isErr());
  });

  it("rejects an item that is neither a question nor a { use } reference", () => {
    const res = resolveQuestions({ questions: [{ foo: "bar" }] }, "q.json", reader({}));
    assert.isTrue(res.isErr());
  });
});
