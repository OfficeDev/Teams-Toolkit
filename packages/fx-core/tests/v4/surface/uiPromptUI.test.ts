// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  InputTextConfig,
  InputTextResult,
  MultiSelectConfig,
  MultiSelectResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleSelectConfig,
  SingleSelectResult,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { assert } from "vitest";
import { createUiPromptUI } from "../../../src/v4/surface/uiPromptUI";

class ScriptedUi {
  lastSelectConfig?: SingleSelectConfig;
  lastTextConfig?: InputTextConfig;
  lastFolderConfig?: SelectFolderConfig;
  lastMultiConfig?: MultiSelectConfig;

  constructor(
    private readonly script: {
      select?: Result<SingleSelectResult, FxError>;
      text?: Result<InputTextResult, FxError>;
      folder?: Result<SelectFolderResult, FxError>;
      multi?: Result<MultiSelectResult, FxError>;
    }
  ) {}

  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    this.lastSelectConfig = config;
    return Promise.resolve(this.script.select ?? err(noAnswer("selectOption")));
  }

  inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    this.lastTextConfig = config;
    return Promise.resolve(this.script.text ?? err(noAnswer("inputText")));
  }

  selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    this.lastFolderConfig = config;
    return Promise.resolve(this.script.folder ?? err(noAnswer("selectFolder")));
  }

  selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    this.lastMultiConfig = config;
    return Promise.resolve(this.script.multi ?? err(noAnswer("selectOptions")));
  }
}

function noAnswer(name: string): UserError {
  return new UserError({ source: "Test", name: "NoAnswer", message: name });
}

function asUi(ui: ScriptedUi): UserInteraction {
  return ui as unknown as UserInteraction;
}

describe("createUiPromptUI (collect-create-inputs prompt bridge)", () => {
  it("renders scalar prompt kinds and projects host answers to strings", async () => {
    const singleUi = new ScriptedUi({
      select: ok({ type: "success", result: { id: "typescript", label: "TypeScript" } }),
    });
    const single = await createUiPromptUI(asUi(singleUi)).ask(
      { name: "language", type: "singleSelect", title: "Language" },
      [{ id: "typescript" }, { id: "javascript", label: "JavaScript" }],
      2
    );
    assert.deepEqual(single._unsafeUnwrap(), { kind: "value", value: "typescript" });
    assert.equal(singleUi.lastSelectConfig?.step, 2);
    assert.deepEqual(singleUi.lastSelectConfig?.options, [
      {
        id: "typescript",
        label: "typescript",
        description: undefined,
        detail: undefined,
        groupName: undefined,
      },
      {
        id: "javascript",
        label: "JavaScript",
        description: undefined,
        detail: undefined,
        groupName: undefined,
      },
    ]);

    const textUi = new ScriptedUi({ text: ok({ type: "success" }) });
    const text = await createUiPromptUI(asUi(textUi)).ask(
      { name: "app-name", type: "text" },
      undefined
    );
    assert.deepEqual(text._unsafeUnwrap(), { kind: "value", value: "" });

    const folderUi = new ScriptedUi({ folder: ok({ type: "success", result: "C:/src" }) });
    const folder = await createUiPromptUI(asUi(folderUi)).ask(
      { name: "folder", type: "folder" },
      undefined
    );
    assert.deepEqual(folder._unsafeUnwrap(), { kind: "value", value: "C:/src" });
  });

  it("projects empty and scalar single-select host answers", async () => {
    const scalar = await createUiPromptUI(
      asUi(new ScriptedUi({ select: ok({ type: "success", result: "javascript" }) }))
    ).ask({ name: "language", type: "singleSelect" }, [{ id: "javascript" }]);
    assert.deepEqual(scalar._unsafeUnwrap(), { kind: "value", value: "javascript" });

    const empty = await createUiPromptUI(
      asUi(new ScriptedUi({ select: ok({ type: "success" }) }))
    ).ask({ name: "language", type: "singleSelect" }, [{ id: "typescript" }]);
    assert.deepEqual(empty._unsafeUnwrap(), { kind: "value", value: "" });
  });

  it("wires text validation with the current answer snapshot", async () => {
    let seenFolder: unknown;
    const ui = new ScriptedUi({ text: ok({ type: "success", result: "MyAgent" }) });
    const prompt = createUiPromptUI(asUi(ui), (name) => {
      if (name !== "appName") {
        return undefined;
      }
      return (_value, answers) => {
        seenFolder = answers.folder;
        return "invalid";
      };
    });

    const result = await prompt.ask(
      { name: "app-name", type: "text", validation: { use: "appName" } },
      undefined,
      undefined,
      { folder: "C:/src" }
    );

    assert.deepEqual(result._unsafeUnwrap(), { kind: "value", value: "MyAgent" });
    assert.isFunction(ui.lastTextConfig?.validation);
    assert.equal(await ui.lastTextConfig?.validation?.("bad"), "invalid");
    assert.equal(seenFolder, "C:/src");
  });

  it("maps host back and error results without rewriting them", async () => {
    const back = await createUiPromptUI(asUi(new ScriptedUi({ select: ok({ type: "back" }) }))).ask(
      { name: "language", type: "singleSelect" },
      [{ id: "typescript" }]
    );
    assert.deepEqual(back._unsafeUnwrap(), { kind: "back" });

    const error = noAnswer("inputText");
    const failed = await createUiPromptUI(asUi(new ScriptedUi({ text: err(error) }))).ask(
      { name: "app-name", type: "text" },
      undefined
    );
    assert.isTrue(failed.isErr());
    assert.strictEqual(failed._unsafeUnwrapErr(), error);

    const textBack = await createUiPromptUI(
      asUi(new ScriptedUi({ text: ok({ type: "back" }) }))
    ).ask({ name: "app-name", type: "text" }, undefined);
    assert.deepEqual(textBack._unsafeUnwrap(), { kind: "back" });

    const folderError = noAnswer("selectFolder");
    const failedFolder = await createUiPromptUI(
      asUi(new ScriptedUi({ folder: err(folderError) }))
    ).ask({ name: "folder", type: "folder" }, undefined);
    assert.isTrue(failedFolder.isErr());
    assert.strictEqual(failedFolder._unsafeUnwrapErr(), folderError);

    const folderBack = await createUiPromptUI(
      asUi(new ScriptedUi({ folder: ok({ type: "back" }) }))
    ).ask({ name: "folder", type: "folder" }, undefined);
    assert.deepEqual(folderBack._unsafeUnwrap(), { kind: "back" });
  });

  it("renders multi-select answers without collapsing selected ids", async () => {
    const ui = new ScriptedUi({
      multi: ok({
        type: "success",
        result: ["GET /repairs", { id: "POST /repairs", label: "POST /repairs" }],
      }),
    });

    const result = await createUiPromptUI(asUi(ui)).askMulti(
      { name: "apiOperations", type: "multiSelect" },
      [{ id: "GET /repairs" }, { id: "POST /repairs" }],
      3
    );

    assert.deepEqual(result._unsafeUnwrap(), {
      kind: "value",
      value: ["GET /repairs", "POST /repairs"],
    });
    assert.equal(ui.lastMultiConfig?.step, 3);

    const empty = await createUiPromptUI(
      asUi(new ScriptedUi({ multi: ok({ type: "success" }) }))
    ).askMulti({ name: "apiOperations", type: "multiSelect" }, []);
    assert.deepEqual(empty._unsafeUnwrap(), { kind: "value", value: [] });

    const multiError = noAnswer("selectOptions");
    const failedMulti = await createUiPromptUI(
      asUi(new ScriptedUi({ multi: err(multiError) }))
    ).askMulti({ name: "apiOperations", type: "multiSelect" }, []);
    assert.isTrue(failedMulti.isErr());
    assert.strictEqual(failedMulti._unsafeUnwrapErr(), multiError);

    const multiBack = await createUiPromptUI(
      asUi(new ScriptedUi({ multi: ok({ type: "back" }) }))
    ).askMulti({ name: "apiOperations", type: "multiSelect" }, []);
    assert.deepEqual(multiBack._unsafeUnwrap(), { kind: "back" });
  });

  it("rejects unsupported prompt shapes before calling the host UI", async () => {
    const ui = new ScriptedUi({});
    const prompt = createUiPromptUI(asUi(ui));

    const missingOptions = await prompt.ask({ name: "language", type: "singleSelect" }, undefined);
    assert.isTrue(missingOptions.isErr());
    assert.equal(missingOptions._unsafeUnwrapErr().name, "UnsupportedQuestionKind");

    const unsupportedScalar = await prompt.ask({ name: "confirm", type: "confirm" }, undefined);
    assert.isTrue(unsupportedScalar.isErr());
    assert.equal(unsupportedScalar._unsafeUnwrapErr().name, "UnsupportedQuestionKind");

    const unsupportedMulti = await prompt.askMulti({ name: "language", type: "singleSelect" }, [
      { id: "typescript" },
    ]);
    assert.isTrue(unsupportedMulti.isErr());
    assert.equal(unsupportedMulti._unsafeUnwrapErr().name, "UnsupportedQuestionKind");
  });
});
