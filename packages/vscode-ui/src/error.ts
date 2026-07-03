// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import type { FxError, SystemErrorOptions } from "@microsoft/teamsfx-api";
import { SystemError, UserError } from "@microsoft/teamsfx-api";

export class UserCancelError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      name: "UserCancelError",
      message: message,
      displayMessage: displayMessage,
      categories: ["internal"],
    });
  }
}

export class EmptyOptionsError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      name: "EmptyOptionsError",
      message: message,
      displayMessage: displayMessage,
      categories: ["internal"],
    });
  }
}

export class InternalUIError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      name: "InternalUIError",
      message: message,
      displayMessage: displayMessage,
      categories: ["internal"],
    });
  }
}

export class ScriptTimeoutError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      name: "ScriptTimeoutError",
      message: message,
      displayMessage: displayMessage,
      categories: ["external"],
    });
  }
}

export class ScriptExecutionError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      name: "ScriptExecutionError",
      message: message,
      displayMessage: displayMessage,
      categories: ["external"],
    });
  }
}

export class UnsupportedQuestionTypeError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      name: "UnsupportedQuestionTypeError",
      message: message,
      displayMessage: displayMessage,
      categories: ["internal"],
    });
  }
}

export class InputValidationError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      message: message,
      displayMessage: displayMessage,
      categories: ["internal"],
    });
  }
}

export class MissingRequiredInputError extends UserError {
  constructor(message: string, displayMessage: string) {
    super({
      source: "UI",
      message: message,
      displayMessage: displayMessage,
      categories: ["internal"],
    });
  }
}
export class UnhandledError extends SystemError {
  constructor(e: any, message: string, displayMessage: string) {
    const option: SystemErrorOptions = {
      source: "UI",
      error: e,
      message: message,
      displayMessage: displayMessage,
      categories: ["unhandled"],
    };
    super(option);
  }
}
export function assembleError(e: any, message: string, displayMessage: string): FxError {
  if (e instanceof UserError || e instanceof SystemError) return e;
  return new UnhandledError(e, message, displayMessage);
}
