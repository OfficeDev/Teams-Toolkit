// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FuncValidation,
  Inputs,
  Platform,
  StringArrayValidation,
  StringValidation,
  VsCodeEnv,
} from "@microsoft/teamsfx-api";
import { validate, validationUtils } from "../../src/ui/validationUtils";
import { assert, vi } from "vitest";

describe("ValidationUtils", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe("validateInputForMultipleSelectQuestion", () => {
    it("should return undefined", async () => {
      const res = await validationUtils.validateInputForMultipleSelectQuestion(
        {
          type: "multiSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        ["a"],
        { platform: Platform.VSCode }
      );
      assert.isUndefined(res);
    });
    it("should return error string", async () => {
      const res = await validationUtils.validateInputForMultipleSelectQuestion(
        {
          type: "multiSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        ["d"],
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });
  });
  describe("validateInputForSingleSelectQuestion", () => {
    it("should return undefined", async () => {
      const res = await validationUtils.validateInputForSingleSelectQuestion(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        "a",
        { platform: Platform.VSCode }
      );
      assert.isUndefined(res);
    });
    it("should return error string", async () => {
      const res = await validationUtils.validateInputForSingleSelectQuestion(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        "d",
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });

    it("should return error string when invalid question definition", async () => {
      const res = await validationUtils.validateInputForSingleSelectQuestion(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
          returnObject: true,
        },
        "d",
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });

    it("should return error string when input is string and object is expected", async () => {
      const res = await validationUtils.validateInputForSingleSelectQuestion(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => [
            { id: "a", label: "a" },
            { id: "b", label: "b" },
          ],
          title: "title",
          returnObject: true,
        },
        "a",
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });

    it("should return error string when input is not in the allowed list", async () => {
      const res = await validationUtils.validateInputForSingleSelectQuestion(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => [
            { id: "a", label: "a" },
            { id: "b", label: "b" },
          ],
          title: "title",
          returnObject: true,
        },
        { id: "c", label: "c" },
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });

    it("should return error string when option list is empty array", async () => {
      const res = await validationUtils.validateInputForSingleSelectQuestion(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => [],
          title: "title",
          returnObject: true,
        },
        { id: "a", label: "a" },
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });
  });

  describe("validateInputs", () => {
    it("should return undefined for multiSelect", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "multiSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        ["a"],
        { platform: Platform.VSCode }
      );
      assert.isUndefined(res);
    });
    it("should return error string for multiSelect", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "multiSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        ["d"],
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });
    it("should return undefined for singleSelect", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        "a",
        { platform: Platform.VSCode }
      );
      assert.isUndefined(res);
    });
    it("should return error string for singleSelect", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "singleSelect",
          name: "name",
          staticOptions: [],
          dynamicOptions: (inputs: Inputs) => ["a", "b", "c"],
          title: "title",
        },
        "d",
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });
    it("should return error string for textInput", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "text",
          name: "name",
          validation: { pattern: "^[a-z]+$" },
          title: "title",
        },
        "123",
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });
    it("should return undefined for textInput", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "text",
          name: "name",
          validation: { pattern: "^[a-z]+$" },
          title: "title",
        },
        "abc",
        { platform: Platform.VSCode }
      );
      assert.isUndefined(res);
    });
    it("should return error for textInput with additional validation", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "text",
          name: "name",
          validation: { pattern: "^[a-z]+$" },
          title: "title",
          additionalValidationOnAccept: { pattern: "^[a]+$" },
        },
        "abc",
        { platform: Platform.VSCode }
      );
      assert.isDefined(res);
    });
    it("should return undefined for textInput with additional validation", async () => {
      const res = await validationUtils.validateInputs(
        {
          type: "text",
          name: "name",
          validation: { pattern: "^[a-z]+$" },
          title: "title",
          additionalValidationOnAccept: { pattern: "^[a-z]+$" },
        },
        "abc",
        { platform: Platform.VSCode }
      );
      assert.isUndefined(res);
    });
  });
});

describe("validate", () => {
  const inputs: Inputs = {
    platform: Platform.VSCode,
    vscodeEnv: VsCodeEnv.local,
  };
  describe("StringValidation", () => {
    it("equals", async () => {
      const validation: StringValidation = { equals: "123" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = "1234";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = "";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("notEquals", async () => {
      const validation: StringValidation = { notEquals: "123" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = "1234";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 === undefined);
    });

    it("minLength,maxLength", async () => {
      const validation: StringValidation = { minLength: 2, maxLength: 5 };
      const value1 = "a";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = "aa";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "aaaa";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4 = "aaaaaa";
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("enum", async () => {
      const validation: StringValidation = { enum: ["1", "2", "3"] };
      const value1 = "1";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = "3";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "4";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("pattern", async () => {
      const validation: StringValidation = { pattern: "^[0-9a-z]+$" };
      const value1 = "1";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = "asb13";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "as--123";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("startsWith", async () => {
      const validation: StringValidation = { startsWith: "123" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = "234";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = "1234";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("endsWith", async () => {
      const validation: StringValidation = { endsWith: "123" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = "234";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = "345sdf123";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("startsWith,endsWith", async () => {
      const validation: StringValidation = { startsWith: "123", endsWith: "789" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = "123asfsdwer7892345789";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "sadfws789";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("includes", async () => {
      const validation: StringValidation = { includes: "123" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = "123asfsdwer7892345789";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "sadfws789";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
    });

    it("includes,startsWith,endsWith", async () => {
      const validation: StringValidation = { startsWith: "123", endsWith: "789", includes: "abc" };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = "123asfabcer7892345789";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = "123sadfws789";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = "abc789";
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("includes,startsWith,endsWith,maxLength", async () => {
      const validation: StringValidation = {
        startsWith: "123",
        endsWith: "789",
        includes: "abc",
        maxLength: 10,
      };
      const value1 = "123";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = "123asfabcer7892345789";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = "123sadfws789";
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4 = "123abch789";
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 === undefined);
    });

    it("excludesEnum", async () => {
      const validation: StringValidation = { excludesEnum: ["1", "2", "3"] };
      const value1 = "1";
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = "3";
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = "4";
      const res3 = await validate(validation, value3, inputs);
      assert.isUndefined(res3);
      const value4 = undefined;
      const res4 = await validate(validation, value4, inputs);
      assert.isUndefined(res4);
    });
  });

  describe("StringArrayValidation", () => {
    it("maxItems,minItems", async () => {
      const validation: StringArrayValidation = { maxItems: 3, minItems: 1 };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = ["1", "2", "3", "4"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = ["1", "2"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("uniqueItems", async () => {
      const validation: StringArrayValidation = { uniqueItems: true };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = ["1", "2", "1", "2"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = ["1", "2"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 === undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("equals", async () => {
      const validation: StringArrayValidation = { equals: ["1", "2", "3"] };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = ["1", "2", "1", "2"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = ["1", "2"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("enum", async () => {
      const validation: StringArrayValidation = { enum: ["1", "2", "3"] };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = ["1", "2", "4", "2"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 !== undefined);
      const value3 = ["1", "2"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 === undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 === undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("contains", async () => {
      const validation: StringArrayValidation = { contains: "4" };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 !== undefined);
      const value2 = ["1", "2", "4", "2"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = ["1", "2"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("containsAll", async () => {
      const validation: StringArrayValidation = { containsAll: ["1", "2"] };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = ["1", "2", "4", "2"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = ["1", "3"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });

    it("containsAny", async () => {
      const validation: StringArrayValidation = { containsAny: ["1", "2"] };
      const value1 = ["1", "2", "3"];
      const res1 = await validate(validation, value1, inputs);
      assert.isTrue(res1 === undefined);
      const value2 = ["4", "5", "6", "1"];
      const res2 = await validate(validation, value2, inputs);
      assert.isTrue(res2 === undefined);
      const value3 = ["5", "7"];
      const res3 = await validate(validation, value3, inputs);
      assert.isTrue(res3 !== undefined);
      const value4: string[] = [];
      const res4 = await validate(validation, value4, inputs);
      assert.isTrue(res4 !== undefined);
      const value5 = undefined;
      const res5 = await validate(validation, value5, inputs);
      assert.isTrue(res5 !== undefined);
    });
  });

  it("FuncValidation", async () => {
    const validation: FuncValidation<string> = {
      validFunc: function (input: string): string | undefined | Promise<string | undefined> {
        if ((input as string).length > 5) return "length > 5";
        return undefined;
      },
    };
    const value1 = "123456";
    const res1 = await validate(validation, value1, inputs);
    assert.isTrue(res1 !== undefined);
    const value2 = "12345";
    const res2 = await validate(validation, value2, inputs);
    assert.isTrue(res2 === undefined);
    const value3 = "";
    const res3 = await validate(validation, value3, inputs);
    assert.isTrue(res3 === undefined);
  });
  it("FuncValidation 2", async () => {
    const validation = (inputs: Inputs) => {
      const input = inputs.input as string;
      return input.length <= 5;
    };
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    inputs.input = "123456";
    const res1 = await validate(validation, "", inputs);
    assert.isTrue(res1 !== undefined);
    inputs.input = "12345";
    const res2 = await validate(validation, "", inputs);
    assert.isTrue(res2 === undefined);
    inputs.input = "";
    const res3 = await validate(validation, "", inputs);
    assert.isTrue(res3 === undefined);
  });
});
