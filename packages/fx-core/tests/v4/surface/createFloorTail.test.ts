// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  createFloorTail,
  validateCreateFloorAnswers,
} from "../../../src/v4/surface/createFloorTail";

describe("create floor tail (collect-create-inputs CCI-21/23)", () => {
  it("CCI-21/23: composes language plus prefilled folder and app-name as one tail", async () => {
    const floor = await createFloorTail(
      { platform: Platform.VSCode, folder: "C:/src", "app-name": "MyAgent" },
      ["typescript", "javascript"]
    );

    assert.isTrue(floor.isOk(), floor.isErr() ? floor.error.message : "expected ok");
    if (floor.isOk()) {
      assert.deepEqual(floor.value.answers, { folder: "C:/src", "app-name": "MyAgent" });
      assert.deepEqual(
        floor.value.questions.map((question) => question.name),
        ["language"]
      );
      assert.deepEqual(
        floor.value.questions[0].staticOptions?.map((option) => option.id),
        ["typescript", "javascript"]
      );
    }
  });

  it("CCI-21: returns only caller-owned language answers when no common floor inputs exist", async () => {
    const common = await createFloorTail(undefined, ["common"]);
    const singleLanguage = await createFloorTail(undefined, ["python"]);
    const multipleLanguages = await createFloorTail(undefined, ["typescript", "csharp"]);

    assert.isTrue(common.isOk());
    assert.deepEqual(common._unsafeUnwrap().answers, {});
    assert.deepEqual(common._unsafeUnwrap().questions, []);

    assert.isTrue(singleLanguage.isOk());
    assert.deepEqual(singleLanguage._unsafeUnwrap().answers, { language: "python" });
    assert.deepEqual(singleLanguage._unsafeUnwrap().questions, []);

    assert.isTrue(multipleLanguages.isOk());
    assert.deepEqual(multipleLanguages._unsafeUnwrap().answers, {});
    assert.deepEqual(
      multipleLanguages._unsafeUnwrap().questions[0].staticOptions?.map((option) => ({
        id: option.id,
        label: option.label,
      })),
      [
        { id: "typescript", label: "TypeScript" },
        { id: "csharp", label: "C#" },
      ]
    );
  });

  it("CCI-23: non-interactive floor uses default folder and requires an app name", async () => {
    const missingAppName = await createFloorTail({ platform: Platform.CLI, nonInteractive: true }, [
      "typescript",
    ]);

    assert.isTrue(missingAppName.isErr());
    assert.equal(missingAppName._unsafeUnwrapErr().name, "MissingRequiredInputError");

    const fromTdp = await createFloorTail(
      {
        platform: Platform.CLI,
        nonInteractive: true,
        teamsAppFromTdp: { appName: "My Agent!" },
      },
      ["typescript"]
    );

    assert.isTrue(fromTdp.isOk(), fromTdp.isErr() ? fromTdp.error.message : "expected ok");
    assert.deepEqual(fromTdp._unsafeUnwrap().answers, {
      language: "typescript",
      folder: "./",
      "app-name": "MyAgent",
    });
    assert.deepEqual(fromTdp._unsafeUnwrap().questions, []);
  });

  it("CCI-23: interactive floor asks missing common questions and wires app-name validation", async () => {
    const floor = await createFloorTail({ platform: Platform.VSCode }, ["typescript"]);

    assert.isTrue(floor.isOk(), floor.isErr() ? floor.error.message : "expected ok");
    const value = floor._unsafeUnwrap();
    assert.deepEqual(value.answers, { language: "typescript" });
    assert.deepEqual(
      value.questions.map((question) => ({ name: question.name, type: question.type })),
      [
        { name: "folder", type: "folder" },
        { name: "app-name", type: "text" },
      ]
    );
    assert.equal(value.questions[1].validation, "appName");
    assert.isFunction(value.validators.appName);
    assert.isString(
      await value.validators.appName("NameThatIsLongerThanThirtyCharacters", { folder: "C:/tmp" })
    );
  });

  it("CCI-23: validateCreateFloorAnswers rejects missing or invalid app names", async () => {
    const missing = await validateCreateFloorAnswers({ platform: Platform.VSCode }, {});
    assert.isTrue(missing.isErr());
    assert.equal(missing._unsafeUnwrapErr().name, "MissingRequiredInputError");

    const invalid = await validateCreateFloorAnswers(
      { platform: Platform.VSCode },
      { "app-name": "NameThatIsLongerThanThirtyCharacters" }
    );
    assert.isTrue(invalid.isErr());
    assert.equal(invalid._unsafeUnwrapErr().name, "InputValidationError");

    const valid = await validateCreateFloorAnswers(
      { platform: Platform.VSCode, folder: "Z:/path-that-should-not-exist" },
      { "app-name": "GoodName" }
    );
    assert.isTrue(valid.isOk(), valid.isErr() ? valid.error.message : "expected ok");
  });
});
