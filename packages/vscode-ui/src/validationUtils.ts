// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import type {
  ConditionFunc,
  FuncValidation,
  Inputs,
  MultiSelectQuestion,
  OptionItem,
  Question,
  SingleSelectQuestion,
  StaticOptions,
  StaticValidation,
  StringArrayValidation,
  StringValidation,
  ValidationSchema,
} from "@microsoft/teamsfx-api";
import * as jsonschema from "jsonschema";
import { EmptyOptionsError } from "./error";

class ValidationUtils {
  async validateInputForSingleSelectQuestion(
    question: SingleSelectQuestion,
    value: string | OptionItem,
    inputs: Inputs
  ): Promise<string | undefined> {
    let options = question.staticOptions;
    if (question.dynamicOptions) {
      options = await question.dynamicOptions(inputs);
    }
    return this.isAllowedValue(question.name, value, options, question.returnObject);
  }

  async validateInputForMultipleSelectQuestion(
    question: MultiSelectQuestion,
    value: string[] | OptionItem[],
    inputs: Inputs
  ): Promise<string | undefined> {
    let options = question.staticOptions;
    if (question.dynamicOptions) {
      options = await question.dynamicOptions(inputs);
    }
    for (const item of value) {
      const error = this.isAllowedValue(question.name, item, options, question.returnObject);
      if (error) return error;
    }
    return undefined;
  }
  formatInvalidInputError(key: string, value: string | OptionItem, options: StaticOptions): string {
    return `Invalid input '${key}':${JSON.stringify(value)}, allowed value: ${JSON.stringify(
      options
    )}`;
  }
  formatInvalidOptionsError(options: StaticOptions): string {
    return `Invalid question, expect input object, but allowed value: ${JSON.stringify(options)}`;
  }
  isAllowedValue(
    key: string,
    value: string | OptionItem,
    options: StaticOptions,
    returnObject?: boolean
  ): string | undefined {
    if (options.length === 0) {
      return new EmptyOptionsError("Empty options.", "Empty options.").message;
    }
    const optionIsStringArray = typeof options[0] === "string";
    if (returnObject) {
      if (optionIsStringArray) {
        return this.formatInvalidOptionsError(options);
      }
      if (!value || typeof value === "string") {
        return this.formatInvalidInputError(key, value, options);
      }
      if (!(options as OptionItem[]).find((item) => item.id === value.id)) {
        return this.formatInvalidInputError(key, value, options);
      }
    } else {
      if (!value || typeof value !== "string") {
        return this.formatInvalidInputError(key, value, options);
      }
      // value is string here
      const foundOption = optionIsStringArray
        ? (options as string[]).find((item: string) => item === value)
        : (options as OptionItem[]).find((item: OptionItem) => item.id === value);
      if (!foundOption) {
        return this.formatInvalidInputError(key, value, options);
      }
    }
  }

  /**
   * validate value against question model definition
   */
  async validateInputs(
    question: Question,
    value: string | string[] | OptionItem | OptionItem[],
    inputs: Inputs
  ): Promise<string | undefined> {
    if (question.type === "singleSelect") {
      if (question.skipValidation) return undefined;
      return await this.validateInputForSingleSelectQuestion(
        question,
        value as string | OptionItem,
        inputs
      );
    } else if (question.type === "multiSelect") {
      if (question.skipValidation) return undefined;
      return await this.validateInputForMultipleSelectQuestion(
        question,
        value as string[] | OptionItem[],
        inputs
      );
    } else {
      if (question.validation) {
        const vFunc = getValidationFunction<string | string[]>(question.validation, inputs);
        const res = await vFunc(value as string | string[]);
        if (res) return res;
      }
      if (question.type === "text" && question.additionalValidationOnAccept) {
        const vFunc = getValidationFunction<string | string[]>(
          question.additionalValidationOnAccept,
          inputs
        );
        const res = await vFunc(value as string | string[]);
        if (res) return res;
      }
      return undefined;
    }
  }
}

export const validationUtils = new ValidationUtils();

/**
 * A function to return a validation function according the validation schema
 * @param validation validation schema
 * @param inputs object to carry all user inputs
 * @returns a validation function
 */
export function getValidationFunction<T extends string | string[] | undefined>(
  validation: ValidationSchema,
  inputs: Inputs
): (input: T) => string | undefined | Promise<string | undefined> {
  return function (input: T): string | undefined | Promise<string | undefined> {
    return validate(validation, input, inputs);
  };
}
/**
 * Implementation of validation function
 * @param validSchema validation schema
 * @param value value to validate
 * @param inputs user inputs object, which works as the context of the validation
 * @returns A human-readable string which is presented as diagnostic message.
 * Return `undefined` when 'value' is valid.
 */
export async function validate<T extends string | string[] | OptionItem | OptionItem[] | undefined>(
  validSchema: ValidationSchema | ConditionFunc,
  value: T,
  inputs?: Inputs
): Promise<string | undefined> {
  {
    //FuncValidation
    const funcValidation: FuncValidation<T> = validSchema as FuncValidation<T>;
    if (funcValidation.validFunc) {
      const res = await funcValidation.validFunc(value, inputs);
      return res as string;
    } else if (typeof funcValidation === "function") {
      const res = await (funcValidation as ConditionFunc)(inputs!);
      if (res) return undefined;
      return "condition function is not met.";
    }
  }

  if (!value) {
    if ((validSchema as StaticValidation).required === true) return `input value is required.`;
  }

  const noneEmptyKeyNum = Object.keys(validSchema).filter(
    (key) => (validSchema as any)[key] !== undefined
  ).length;

  if (noneEmptyKeyNum === 0) {
    return undefined;
  }

  if (
    value === undefined &&
    ((validSchema as any).required ||
      (validSchema as any).equals ||
      (validSchema as any).maxLength ||
      (validSchema as any).minLength ||
      (validSchema as any).pattern ||
      (validSchema as any).enum ||
      (validSchema as any).startsWith ||
      (validSchema as any).endsWith ||
      (validSchema as any).includes ||
      (validSchema as any).maxItems ||
      (validSchema as any).minItems ||
      (validSchema as any).uniqueItems ||
      (validSchema as any).contains ||
      (validSchema as any).containsAll ||
      (validSchema as any).containsAny)
  ) {
    return `'undefined' does not meet condition:'${JSON.stringify(validSchema)}'`;
  }
  const jsonValue = JSON.stringify(value);
  {
    // StringValidation
    const stringValidation: StringValidation = validSchema as StringValidation;
    const strToValidate = value as string;
    if (strToValidate === undefined || typeof strToValidate === "string") {
      const schema: any = {};
      if (stringValidation.equals && typeof stringValidation.equals === "string") {
        schema.const = stringValidation.equals;
      }
      if (
        stringValidation.enum &&
        stringValidation.enum.length > 0 &&
        typeof stringValidation.enum[0] === "string"
      )
        schema.enum = stringValidation.enum;
      if (stringValidation.minLength) schema.minLength = stringValidation.minLength;
      if (stringValidation.maxLength) schema.maxLength = stringValidation.maxLength;
      if (stringValidation.pattern) schema.pattern = stringValidation.pattern;
      if (Object.keys(schema).length > 0) {
        const validateResult = jsonschema.validate(strToValidate, schema);
        if (validateResult.errors && validateResult.errors.length > 0) {
          return `${jsonValue} ${validateResult.errors[0].message}`;
        }
      }

      if (stringValidation.startsWith) {
        if (!strToValidate.startsWith(stringValidation.startsWith)) {
          return `${jsonValue} does not meet startsWith:'${stringValidation.startsWith}'`;
        }
      }
      if (stringValidation.endsWith) {
        if (!strToValidate.endsWith(stringValidation.endsWith)) {
          return `${jsonValue} does not meet endsWith:'${stringValidation.endsWith}'`;
        }
      }
      if (stringValidation.includes) {
        if (!strToValidate.includes(stringValidation.includes)) {
          return `${jsonValue} does not meet includes:'${stringValidation.includes}'`;
        }
      }
      if (stringValidation.notEquals) {
        if (strToValidate === stringValidation.notEquals) {
          return `${jsonValue} does not meet notEquals:'${stringValidation.notEquals}'`;
        }
      }
      if (stringValidation.excludesEnum) {
        if (stringValidation.excludesEnum.includes(strToValidate)) {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${jsonValue} does not meet excludesEnum:'${stringValidation.excludesEnum}'`;
        }
      }
    }
  }

  //StringArrayValidation
  {
    const stringArrayValidation: StringArrayValidation = validSchema as StringArrayValidation;
    const arrayToValidate = value as string[];
    if (arrayToValidate === undefined || arrayToValidate instanceof Array) {
      const schema: any = {};
      if (stringArrayValidation.maxItems) schema.maxItems = stringArrayValidation.maxItems;
      if (stringArrayValidation.minItems) schema.minItems = stringArrayValidation.minItems;
      if (stringArrayValidation.uniqueItems) schema.uniqueItems = stringArrayValidation.uniqueItems;
      if (Object.keys(schema).length > 0) {
        const validateResult = jsonschema.validate(arrayToValidate, schema);
        if (validateResult.errors && validateResult.errors.length > 0) {
          return `${jsonValue} ${validateResult.errors[0].message}`;
        }
      }
      if (stringArrayValidation.equals) {
        if (stringArrayValidation.equals instanceof Array) {
          stringArrayValidation.enum = stringArrayValidation.equals;
          stringArrayValidation.containsAll = stringArrayValidation.equals;
        } else {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          return `${jsonValue} does not equals to:'${stringArrayValidation.equals}'`;
        }
      }
      if (stringArrayValidation.enum && arrayToValidate) {
        for (const item of arrayToValidate) {
          if (!stringArrayValidation.enum.includes(item)) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return `${jsonValue} does not meet with enum:'${stringArrayValidation.enum}'`;
          }
        }
      }
      if (stringArrayValidation.excludes) {
        if (arrayToValidate && arrayToValidate.includes(stringArrayValidation.excludes)) {
          return `${jsonValue} does not meet with excludes:'${stringArrayValidation.excludes}'`;
        }
      }
      if (stringArrayValidation.contains) {
        if (arrayToValidate && !arrayToValidate.includes(stringArrayValidation.contains)) {
          return `${jsonValue} does not meet with contains:'${stringArrayValidation.contains}'`;
        }
      }
      if (stringArrayValidation.containsAll) {
        const containsAll: string[] = stringArrayValidation.containsAll;
        if (containsAll.length > 0) {
          for (const i of containsAll) {
            if (arrayToValidate && !arrayToValidate.includes(i)) {
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              return `${jsonValue} does not meet with containsAll:'${containsAll}'`;
            }
          }
        }
      }
      if (stringArrayValidation.containsAny) {
        const containsAny: string[] = stringArrayValidation.containsAny;
        if (containsAny.length > 0) {
          // let array = valueToValidate as string[];
          let found = false;
          for (const i of containsAny) {
            if (arrayToValidate && arrayToValidate.includes(i)) {
              found = true;
              break;
            }
          }
          if (!found) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return `${jsonValue} does not meet containsAny:'${containsAny}'`;
          }
        }
      }
    }
  }
  return undefined;
}
