// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Colors,
  ConfirmConfig,
  ConfirmQuestion,
  ConfirmResult,
  FolderQuestion,
  FxError,
  IProgressHandler,
  IQTreeNode,
  InputResult,
  InputTextConfig,
  InputTextResult,
  Inputs,
  MultiFileQuestion,
  MultiSelectConfig,
  MultiSelectQuestion,
  MultiSelectResult,
  OptionItem,
  Platform,
  Result,
  SelectFileConfig,
  SelectFileResult,
  SelectFilesConfig,
  SelectFilesResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleFileOrInputConfig,
  SingleFileOrInputQuestion,
  SingleFileQuestion,
  SingleSelectConfig,
  SingleSelectQuestion,
  SingleSelectResult,
  StaticOptions,
  StringValidation,
  TextInputQuestion,
  UserInteraction,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { RestoreFn } from "mocked-env";
import { assert, vi } from "vitest";
import { setTools } from "../../src/common/globalVars";
import {
  EmptyOptionError,
  InputValidationError,
  MissingRequiredInputError,
  UserCancelError,
} from "../../src/error/common";
import {
  findValue,
  getSingleOption,
  loadOptions,
  questionVisitor,
  singleSelectCallback,
  traverse,
} from "../../src/ui/visitor";
import { MockTools } from "../core/utils";

function createInputs(): Inputs {
  return {
    platform: Platform.VSCode,
  };
}

function createTextQuestion(name: string): TextInputQuestion {
  return {
    type: "text",
    name: name,
    title: name,
  };
}

function createSingleSelectQuestion(name: string, options?: string[]): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: name,
    title: name,
    staticOptions: options || [],
  };
}

function createMultiSelectQuestion(name: string): MultiSelectQuestion {
  return {
    type: "multiSelect",
    name: name,
    title: name,
    staticOptions: [],
  };
}

class MockUserInteraction implements UserInteraction {
  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFiles(config: SelectFilesConfig): Promise<Result<SelectFilesResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    throw new Error("Method not implemented.");
  }

  openUrl(link: string): Promise<Result<boolean, FxError>> {
    throw new Error("Method not implemented.");
  }
  async showMessage(
    level: "info" | "warn" | "error",
    message: string,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  async showMessage(
    level: "info" | "warn" | "error",
    message: Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  async showMessage(
    level: "info" | "warn" | "error",
    message: string | Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>> {
    throw new Error("Method not implemented.");
  }
  createProgressBar(title: string, totalSteps: number): IProgressHandler {
    throw new Error("Method not implemented.");
  }

  selectFileOrInput(
    config: SingleFileOrInputConfig
  ): Promise<Result<InputResult<string>, FxError>> {
    throw new Error("Method not implemented.");
  }
  async confirm(config: ConfirmConfig): Promise<Result<ConfirmResult, FxError>> {
    return ok({ type: "success", result: true });
  }
}

const mockUI = new MockUserInteraction();

describe("Question Model - Visitor Test", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe("traverse()", () => {
    beforeEach(() => {});

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("fail: user cancel", async () => {
      const num = 10;
      const cancelNum = 5;
      const actualSequence: string[] = [];
      vi.spyOn(mockUI, "inputText").mockImplementation(async (config: InputTextConfig) => {
        const actualStep = Number(config.name);
        if (actualStep === cancelNum) {
          return err(new UserCancelError());
        }
        actualSequence.push(config.name);
        assert(config.step === actualStep);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [],
      };

      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        root.children!.push({ data: createTextQuestion(`${i}`) });
        if (i < cancelNum) expectedSequence.push(`${i}`);
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isErr() && res.error instanceof UserCancelError);
      for (let i = 1; i < cancelNum; ++i) {
        assert.isUndefined(inputs[`${i}`]);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: flat sequence", async () => {
      const actualSequence: string[] = [];
      vi.spyOn(mockUI, "inputText").mockImplementation(async (config: InputTextConfig) => {
        actualSequence.push(config.name);
        const actualStep = Number(config.name);
        assert(config.step === actualStep);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [],
      };
      const num = 10;
      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        root.children!.push({ data: createTextQuestion(`${i}`) });
        expectedSequence.push(`${i}`);
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= num; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: auto skip single option select", async () => {
      const actualSequence: string[] = [];
      vi.spyOn(mockUI, "selectOption").mockImplementation(async (config: SingleSelectConfig) => {
        actualSequence.push(config.name);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [],
      };
      const num = 10;
      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        const name = `${i}`;
        const question = createSingleSelectQuestion(name);
        if (i % 2 === 0) question.staticOptions = [`mocked value of ${name}`];
        else {
          question.staticOptions = [`mocked value of ${name}`, `mocked value of ${name} - 2`];
          expectedSequence.push(name);
        }
        question.skipSingleOption = true;
        root.children!.push({ data: question });
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= num; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: auto skip single option select with skipSingleOption being a function ", async () => {
      const actualSequence: string[] = [];
      vi.spyOn(mockUI, "selectOption").mockImplementation(async (config: SingleSelectConfig) => {
        actualSequence.push(config.name);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [],
      };
      const num = 10;
      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        const name = `${i}`;
        const question = createSingleSelectQuestion(name);
        if (i % 2 === 0) question.staticOptions = [`mocked value of ${name}`];
        else {
          question.staticOptions = [`mocked value of ${name}`, `mocked value of ${name} - 2`];
          expectedSequence.push(name);
        }
        question.skipSingleOption = () => {
          return true;
        };
        root.children!.push({ data: question });
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= num; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: flat sequence with back operation", async () => {
      const actualSequence: string[] = [];
      let backed = false;
      const inputs = createInputs();
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          if (config.name === "3" && !backed) {
            backed = true;
            return ok({ type: "back" });
          }
          return ok({ type: "success", result: `mocked value of ${config.name}` });
        }
      );
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [
          {
            data: createSingleSelectQuestion("1", ["1", "2", "3"]),
          },
          {
            data: createSingleSelectQuestion("2", ["1", "2", "3"]),
          },
          {
            data: createSingleSelectQuestion("3", ["1", "2", "3"]),
          },
        ],
      };
      const expectedSequence: string[] = ["1", "2", "3", "2", "3"];
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("fail: go back from start and cancel", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      let count = 0;
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          count++;
          if (count >= 3) {
            return ok({ type: "back" });
          }
          return ok({ type: "success", result: `mocked value of ${config.name}` });
        }
      );
      const expectedSequence: string[] = ["1", "2", "3", "2", "1"];
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [
          {
            data: createSingleSelectQuestion("1", ["1", "2", "3"]),
          },
          {
            data: createSingleSelectQuestion("2", ["1", "2", "3"]),
          },
          {
            data: createSingleSelectQuestion("3", ["1", "2", "3"]),
          },
        ],
      };

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isErr() && res.error instanceof UserCancelError);
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("fail: go back and skip auto selected question", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      let backed = false;
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          if (config.name === "3") {
            if (backed) {
              return ok({ type: "success", result: "1" });
            } else {
              backed = true;
              return ok({ type: "back" });
            }
          }
          return ok({ type: "success", result: "1" });
        }
      );
      const expectedSequence: string[] = ["1", "3", "1", "3"];
      const question2 = createSingleSelectQuestion("2", ["1"]);
      question2.skipSingleOption = true;
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [
          {
            data: createSingleSelectQuestion("1", ["1", "2", "3"]),
          },
          {
            data: question2,
          },
          {
            data: createSingleSelectQuestion("3", ["1", "2", "3"]),
          },
        ],
      };

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: SingleSelectQuestion, MultiSelectQuestion", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({ type: "success", result: (config.options as StaticOptions)[0] });
        }
      );
      vi.spyOn(mockUI, "selectOptions").mockImplementation(
        async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({
            type: "success",
            result: [(config.options as StaticOptions)[0] as OptionItem],
          });
        }
      );
      const root: IQTreeNode = {
        data: { type: "group" },
        children: [],
      };
      const expectedSequence: string[] = ["1", "4"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [{ id: `mocked value of 1`, label: `mocked value of 1` }];
      question1.returnObject = true;
      root.children!.push({ data: question1 });

      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [{ id: `mocked value of 2`, label: `mocked value of 2` }];
      question2.skipSingleOption = true;
      root.children!.push({ data: question2 });

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [{ id: `mocked value of 3`, label: `mocked value of 3` }];
      question3.skipSingleOption = true;
      question3.returnObject = true;
      root.children!.push({ data: question3 });

      const question4 = createMultiSelectQuestion("4");
      question4.staticOptions = [{ id: `mocked value of 4`, label: `mocked value of 4` }];
      root.children!.push({ data: question4 });

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.deepEqual(inputs["1"], { id: `mocked value of 1`, label: `mocked value of 1` });
      assert.isTrue(typeof inputs["2"] === "string" && inputs["2"] === `mocked value of 2`);
      assert.isTrue(inputs["3"] instanceof Array);
      assert.isTrue(inputs["4"] instanceof Array);
      assert.deepEqual((inputs["3"] as StaticOptions)[0], {
        id: `mocked value of 3`,
        label: `mocked value of 3`,
      });
      assert.deepEqual((inputs["4"] as StaticOptions)[0], {
        id: `mocked value of 4`,
        label: `mocked value of 4`,
      });
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: node condition", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({
            type: "success",
            result: (config.options as StaticOptions)[0] as OptionItem,
          });
        }
      );
      vi.spyOn(mockUI, "selectOptions").mockImplementation(
        async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({
            type: "success",
            result: [(config.options as StaticOptions)[0] as OptionItem],
          });
        }
      );

      const expectedSequence: string[] = ["1"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = ["2", "3"];
      question1.returnObject = true;

      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [{ id: `mocked value of 2`, label: `mocked value of 2` }];
      question2.skipSingleOption = true;
      const node2: IQTreeNode = { data: question2, condition: { equals: "2" } };

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [{ id: `mocked value of 3`, label: `mocked value of 3` }];
      question3.skipSingleOption = true;
      const node3: IQTreeNode = { data: question3, condition: { equals: "3" } };

      const node1: IQTreeNode = { data: question1, children: [node2, node3] };

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["1"] === `2`);
      assert.isTrue(typeof inputs["2"] === "string" && inputs["2"] === `mocked value of 2`);
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: node condition on OptionItem", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({
            type: "success",
            result: (config.options as StaticOptions)[0] as OptionItem,
          });
        }
      );
      vi.spyOn(mockUI, "selectOptions").mockImplementation(
        async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({
            type: "success",
            result: [(config.options as StaticOptions)[0] as OptionItem],
          });
        }
      );

      const expectedSequence: string[] = ["1"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [
        { id: "2", label: "2" },
        { id: "3", label: "3" },
      ];
      question1.returnObject = true;
      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [{ id: `mocked value of 2`, label: `mocked value of 2` }];
      question2.skipSingleOption = true;
      const node2: IQTreeNode = { data: question2, condition: { equals: "2" } };

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [{ id: `mocked value of 3`, label: `mocked value of 3` }];
      question3.skipSingleOption = true;
      const node3: IQTreeNode = { data: question3, condition: { equals: "3" } };

      const node1: IQTreeNode = { data: question1, children: [node2, node3] };

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["1"].id === "2");
      assert.isTrue(typeof inputs["2"] === "string" && inputs["2"] === `mocked value of 2`);
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("pre-defined question will not be count as one step", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      vi.spyOn(mockUI, "selectOption").mockImplementation(
        async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
          actualSequence.push(config.name);
          return ok({ type: "success", result: (config.options as StaticOptions)[0] });
        }
      );
      const multiSelect = vi
        .spyOn(mockUI, "selectOptions")
        .mockImplementation(
          async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({
              type: "success",
              result: [(config.options as StaticOptions)[0] as OptionItem],
            });
          }
        );

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [
        { id: `mocked value of 1`, label: `mocked value of 1` },
        { id: `mocked value of 2`, label: `mocked value of 2` },
      ];
      question1.returnObject = true;
      inputs["1"] = { id: `mocked value of 1`, label: `mocked value of 1` };

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [
        { id: `mocked value of 3`, label: `mocked value of 3` },
        { id: `mocked value of 4`, label: `mocked value of 4` },
      ];
      question3.skipSingleOption = true;
      question3.returnObject = true;

      const root: IQTreeNode = {
        data: { type: "group" },
        children: [{ data: question1 }, { data: question3 }],
      };
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.equal((multiSelect.mock.lastCall![0] as MultiSelectConfig).step, 1);
    });

    it("success: complex go back", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      let skiped = false;
      vi.spyOn(mockUI, "inputText").mockImplementation(async (config: InputTextConfig) => {
        actualSequence.push(config.name);
        if (config.name === "3" && !skiped) {
          skiped = true;
          return ok({ type: "back" });
        }
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });

      const expectedSequence: string[] = ["1", "2", "3", "2", "3", "4"];

      const question1 = createTextQuestion("1");
      const question2 = createTextQuestion("2");
      const question3 = createTextQuestion("3");
      const question4 = createTextQuestion("4");

      const node1: IQTreeNode = {
        data: question1,
        children: [
          {
            data: question2,
            children: [{ data: question3 }, { data: question4 }],
          },
        ],
      };

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= 4; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("single selection", async () => {
      vi.spyOn(mockUI, "selectOption").mockResolvedValue(ok({ type: "success", result: "1" }));
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: [],
        dynamicOptions: () => Promise.resolve([{ id: "1", label: "1" }]),
      };
      const inputs = createInputs();
      const res = await traverse({ data: question }, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["test"] === "1");
    });

    it("single selection empty options", async () => {
      vi.spyOn(mockUI, "selectOption").mockResolvedValue(ok({ type: "success", result: "1" }));
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: [],
      };
      const inputs = createInputs();
      const res = await traverse({ data: question }, inputs, mockUI);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof EmptyOptionError);
      }
    });

    it("single file or input", async () => {
      vi.spyOn(mockUI, "selectFileOrInput").mockResolvedValue(
        ok({ type: "success", result: "file" })
      );
      const question: SingleFileOrInputQuestion = {
        type: "singleFileOrText",
        name: "test",
        title: "test",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          type: "innerText",
          name: "input",
          title: "input",
        },
      };
      const inputs = createInputs();
      const res = await traverse({ data: question }, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["test"] === "file");
    });

    it("single file or input with validation and additional validation", async () => {
      vi.spyOn(mockUI, "selectFileOrInput").mockResolvedValue(
        ok({ type: "success", result: "file" })
      );
      const validation: StringValidation = {
        equals: "test",
      };
      const question: SingleFileOrInputQuestion = {
        type: "singleFileOrText",
        name: "test",
        title: "test",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          name: "input",
          type: "innerText",
          title: "input",
        },
        validation: validation,
      };
      const inputs = createInputs();
      const res = await traverse({ data: question }, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["test"] === "file");
    });

    it("the order of condition visit should be in DFS order", async () => {
      const actualSequence: string[] = [];
      vi.spyOn(mockUI, "inputText").mockImplementation(async (config: InputTextConfig) => {
        actualSequence.push(config.name);
        return ok({ type: "success", result: config.name });
      });
      const node: IQTreeNode = {
        data: {
          type: "text",
          title: "1",
          name: "1",
        },
        children: [
          {
            data: {
              type: "text",
              title: "2",
              name: "2",
            },
            children: [
              {
                data: {
                  type: "text",
                  title: "3",
                  name: "3",
                },
              },
            ],
          },
          {
            data: {
              type: "text",
              title: "4",
              name: "4",
            },
            condition: (inputs) => inputs["3"] === "3",
          },
        ],
      };

      const expectedSequence = ["1", "2", "3", "4"];

      const inputs = createInputs();
      const res = await traverse(node, inputs, mockUI);
      assert.isTrue(res.isOk());

      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: go backward and change the traverse order", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      let firstVisit5 = true;
      let firstCheck4 = true;
      let visit3Num = 1;
      vi.spyOn(mockUI, "inputText").mockImplementation(async (config: InputTextConfig) => {
        actualSequence.push(config.name);
        if (config.name === "5" && firstVisit5) {
          firstVisit5 = false;
          return ok({ type: "back" });
        } else if (config.name === "3") {
          if (visit3Num++ === 2) {
            return ok({ type: "back" });
          }
        }
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });

      const expectedSequence: string[] = ["1", "2", "3", "5", "3", "2", "3", "4", "5"];

      const question1 = createTextQuestion("1");
      const question2 = createTextQuestion("2");
      const question3 = createTextQuestion("3");
      const question4 = createTextQuestion("4");
      const question5 = createTextQuestion("5");

      const node1: IQTreeNode = {
        data: question1,
        children: [
          {
            data: question2,
            children: [
              { data: question3 },
              {
                condition: () => {
                  if (firstCheck4) {
                    firstCheck4 = false;
                    return false;
                  } else {
                    return true;
                  }
                },
                data: question4,
              },
            ],
          },
          {
            data: question5,
          },
        ],
      };

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= 5; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });
  });

  describe("questionVisitor", () => {
    const tools = new MockTools();
    setTools(tools);
    const mockedEnvRestore: RestoreFn = () => {};
    afterEach(() => {
      mockedEnvRestore();
      vi.restoreAllMocks();
    });
    it("should return MissingRequiredInputError for non-interactive mode", async () => {
      const question: TextInputQuestion = {
        type: "text",
        name: "test",
        title: "test",
        required: true,
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isErr() && res.error instanceof MissingRequiredInputError);
    });
    it("should return skip for non-interactive mode", async () => {
      const question: TextInputQuestion = {
        type: "text",
        name: "test",
        title: "test",
        required: false,
      };
      const inputs = createInputs();
      inputs.nonInteractive = true;
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip" && res.value.result === undefined);
    });
    it("should return empty option error for non-interactive mode", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: [],
        skipSingleOption: true,
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isErr() && res.error instanceof EmptyOptionError);
    });

    it("should return single option for non-interactive mode", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        skipSingleOption: true,
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip" && res.value.result === "a");
    });

    it("should return default value for non-interactive mode", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a", "b"],
        default: "b",
        skipSingleOption: true,
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip" && res.value.result === "b");
    });
    it("should return default value (validation failed) for non-interactive mode", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a", "b"],
        default: "c",
        validation: { validFunc: () => "error" },
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isErr() && res.error instanceof InputValidationError);
    });
    it("selectFiles", async () => {
      vi.spyOn(tools.ui, "selectFiles").mockResolvedValue(ok({ type: "success", result: ["a"] }));
      const question: MultiFileQuestion = {
        type: "multiFile",
        name: "test",
        title: "test",
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "success");
    });
    it("selectFile", async () => {
      const uiStub = vi
        .spyOn(tools.ui, "selectFile")
        .mockResolvedValue(ok({ type: "success", result: "a" }));
      const question: SingleFileQuestion = {
        type: "singleFile",
        name: "test",
        title: "test",
        default: "test",
        innerStep: 1,
        innerTotalStep: 2,
        defaultFolder: "./",
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      let res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(uiStub.mock.calls[0][0].defaultFolder === "./");
      assert.isTrue(res.isOk() && res.value.type === "success");

      question.defaultFolder = (inputs: Inputs) => {
        return "test";
      };
      res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "success");
      assert.isTrue(
        typeof uiStub.mock.calls[1][0].defaultFolder === "function" &&
          (await uiStub.mock.calls[1][0].defaultFolder()) === "test"
      );
    });
    it("selectFile forwards static possibleFiles to UI", async () => {
      const uiStub = vi
        .spyOn(tools.ui, "selectFile")
        .mockResolvedValue(ok({ type: "success", result: "a" }));
      const possibleFiles = [
        { id: "/abs/foo.json", label: "$(file) foo.json", description: "/abs" },
      ];
      const question: SingleFileQuestion = {
        type: "singleFile",
        name: "test",
        title: "test",
        possibleFiles,
      };
      const inputs: Inputs = { platform: Platform.VSCode };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk());
      assert.deepEqual(uiStub.mock.calls[0][0].possibleFiles, possibleFiles);
    });
    it("selectFile resolves async possibleFiles function", async () => {
      const uiStub = vi
        .spyOn(tools.ui, "selectFile")
        .mockResolvedValue(ok({ type: "success", result: "a" }));
      const dynamic = [
        { id: "id1", label: "label1" },
        { id: "id2", label: "label2", description: "d" },
      ];
      const question: SingleFileQuestion = {
        type: "singleFile",
        name: "test",
        title: "test",
        possibleFiles: async () => dynamic,
      };
      const inputs: Inputs = { platform: Platform.VSCode };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk());
      assert.deepEqual(uiStub.mock.calls[0][0].possibleFiles, dynamic);
    });
    it("selectFile leaves possibleFiles undefined when not provided", async () => {
      const uiStub = vi
        .spyOn(tools.ui, "selectFile")
        .mockResolvedValue(ok({ type: "success", result: "a" }));
      const question: SingleFileQuestion = {
        type: "singleFile",
        name: "test",
        title: "test",
      };
      const inputs: Inputs = { platform: Platform.VSCode };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk());
      assert.isUndefined(uiStub.mock.calls[0][0].possibleFiles);
    });
    it("selectFolder", async () => {
      vi.spyOn(tools.ui, "selectFolder").mockResolvedValue(ok({ type: "success", result: "a" }));
      const question: FolderQuestion = {
        type: "folder",
        name: "test",
        title: "test",
        default: () => "test",
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "success");
    });
    it("selectFileOrInput", async () => {
      vi.spyOn(tools.ui, "selectFileOrInput").mockResolvedValue(
        ok({ type: "success", result: "a" })
      );
      const question: SingleFileOrInputQuestion = {
        type: "singleFileOrText",
        name: "test",
        title: "test",
        inputOptionItem: { id: "test", label: "test" },
        inputBoxConfig: {
          type: "innerText",
          name: "test",
          title: "test",
        },
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "success");
    });
    it("confirm", async () => {
      vi.spyOn(tools.ui, "confirm").mockResolvedValue(ok({ type: "success", result: true }));
      const question: ConfirmQuestion = {
        type: "confirm",
        name: "test",
        title: "test",
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "success");
    });
    it("onDidSelection for preset answer", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        onDidSelection: () => {},
      };
      const stub = vi.spyOn(question, "onDidSelection");
      const inputs: Inputs = {
        platform: Platform.VSCode,
        test: "a",
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip");
      assert.isTrue(stub.mock.calls.length === 1);
    });
    it("skip single select will trigger onDidSelection in non-interactive mode", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        onDidSelection: () => {},
        skipSingleOption: true,
      };
      const stub = vi.spyOn(question, "onDidSelection");
      const inputs: Inputs = {
        platform: Platform.CLI,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip");
      assert.isTrue(stub.mock.calls.length === 1);
    });
    it("skip single select will trigger onDidSelection in interactive mode", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        onDidSelection: () => {},
        skipSingleOption: true,
      };
      const stub = vi.spyOn(question, "onDidSelection");
      const inputs: Inputs = {
        platform: Platform.CLI,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip");
      assert.isTrue(stub.mock.calls.length === 1);
    });
    it("select default value will trigger onDidSelection", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a", "b"],
        default: "a",
        onDidSelection: () => {},
      };
      const stub = vi.spyOn(question, "onDidSelection");
      const inputs: Inputs = {
        platform: Platform.CLI,
        nonInteractive: true,
      };
      const res = await questionVisitor(question, tools.ui, inputs);
      assert.isTrue(res.isOk() && res.value.type === "skip");
      assert.isTrue(stub.mock.calls.length === 1);
    });
  });
  describe("getSingleOption", () => {
    it("undefined option", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a", "b"],
        default: "a",
        onDidSelection: () => {},
      };
      const options = getSingleOption(question, undefined);
      assert.deepEqual(options as string, "a");
    });
  });
  describe("singleSelectCallback", async () => {
    it("no onDidSelection", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        test: "a",
      };
      singleSelectCallback(question, "a", inputs, ["a"]);
    });
    it("answer is OptionItem", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        onDidSelection: () => {},
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        test: "a",
      };
      const stub = vi.spyOn(question, "onDidSelection");
      singleSelectCallback(question, { id: "a", label: "" }, inputs, ["a"]);
      assert.isTrue(stub.mock.calls.length === 1);
    });
    it("option is string[]", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        onDidSelection: () => {},
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        test: "a",
      };
      const stub = vi.spyOn(question, "onDidSelection");
      singleSelectCallback(question, "a", inputs, ["a"]);
      assert.isTrue(stub.mock.calls.length === 1);
    });
    it("option is OptionItem[]", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: [{ id: "a", label: "" }],
        onDidSelection: () => {},
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        test: "a",
      };
      const stub = vi.spyOn(question, "onDidSelection");
      singleSelectCallback(question, "a", inputs, [{ id: "a", label: "" }]);
      assert.isTrue(stub.mock.calls.length === 1);
    });
    it("answer not match in options", async () => {
      const question: SingleSelectQuestion = {
        type: "singleSelect",
        name: "test",
        title: "test",
        staticOptions: ["a"],
        onDidSelection: () => {},
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        test: "a",
      };
      const stub = vi.spyOn(question, "onDidSelection");
      singleSelectCallback(question, "b", inputs, ["a"]);
      assert.isTrue(stub.mock.calls.length === 0);
    });
  });

  describe("loadOptions", async () => {
    it("load dynamic options", async () => {
      const options = await loadOptions(
        {
          type: "singleSelect",
          name: "test",
          title: "test",
          dynamicOptions: () => ["a"],
          staticOptions: [],
        },
        { platform: Platform.VSCode }
      );
      assert.deepEqual(options, ["a"]);
    });
  });

  describe("findValue", () => {
    it("group node return the value of parent", () => {
      const node: IQTreeNode = {
        data: {
          type: "group",
          name: "1",
        },
      };
      const parent: IQTreeNode = {
        data: {
          type: "text",
          title: "2",
          name: "2",
          value: "2",
        },
      };
      const map = new Map();
      map.set(node, parent);
      const value = findValue(node, map);
      assert.equal(value, "2");
    });
    it("group node no parent", () => {
      const node: IQTreeNode = {
        data: {
          type: "group",
          name: "1",
        },
      };
      const map = new Map();
      const value = findValue(node, map);
      assert.isUndefined(value);
    });
  });
});
