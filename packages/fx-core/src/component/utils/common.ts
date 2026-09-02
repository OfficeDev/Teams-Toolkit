// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { BaseComponentInnerError, PrerequisiteError } from "../error/componentError";
import {
  err,
  FxError,
  LogProvider,
  ok,
  Result,
  SystemError,
  UserError,
  Warning,
} from "@microsoft/teamsfx-api";
import path from "path";
import { ExecutionResult } from "../driver/interface/stepDriver";
import { getLocalizedString } from "../../common/localizeUtils";
import { SummaryConstant } from "../configManager/constant";
import { EOL } from "os";

/**
 * check parameter, throw error if value is null or undefined
 * @param name parameter name
 * @param value parameter value
 */
export function checkMissingArgs<T>(name: string, value: T | null | undefined): T {
  if (!value) {
    throw PrerequisiteError.somethingMissing("Deploy", name);
  }
  return value;
}

export function asOptional<T>(as: (s: unknown, key: string, helpLink?: string) => T) {
  return function (s: unknown, key: string, helpLink?: string): T | undefined {
    if (s === undefined || s === null) {
      return undefined;
    }
    return as(s, key, helpLink);
  };
}

export function asBoolean(s: unknown, key: string, helpLink?: string): boolean {
  if (typeof s === "boolean") {
    return s;
  } else if (typeof s === "string") {
    return s === "true";
  }
  throw PrerequisiteError.somethingMissing("Deploy", key, helpLink);
}

export function asString(s: unknown, key: string, helpLink?: string): string {
  if (typeof s === "string") {
    return s;
  }
  throw PrerequisiteError.somethingMissing("Deploy", key, helpLink);
}

type KeyValidators<T> = {
  [P in keyof T]-?: (s: unknown, key: string, helpLink?: string) => T[P];
};

export function asFactory<T>(keyValidators: KeyValidators<T>) {
  return function (data: unknown, helpLink?: string): T {
    if (typeof data === "object" && data !== null) {
      const maybeT = data as unknown as T;
      for (const key of Object.keys(keyValidators) as Array<keyof T>) {
        keyValidators[key](maybeT[key], `${String(key)}`, helpLink);
      }
      return maybeT;
    }
    throw PrerequisiteError.somethingIllegal(
      "Deploy",
      "data",
      "plugins.bot.InvalidData",
      undefined,
      helpLink
    );
  };
}

export async function wrapRun(
  exec: () => Promise<Map<string, string>>,
  errorSource: string,
  errorHandler?: () => Promise<void>,
  logProvider?: LogProvider
): Promise<Result<Map<string, string>, FxError>> {
  try {
    return ok(await exec());
  } catch (error) {
    return await errorHandle(error, errorSource, logProvider, errorHandler);
  }
}

export async function errorHandle(
  error: unknown,
  errorSource: string,
  logProvider?: LogProvider,
  errorHandler?: () => Promise<void>
): Promise<Result<Map<string, string>, FxError>> {
  if (errorHandler) {
    await errorHandler();
  }
  if (error instanceof BaseComponentInnerError) {
    if (error.detail) {
      logProvider?.debug(`Error occurred: ${error.detail}`);
    }
    return err(error.toFxError());
  } else if (error instanceof UserError || error instanceof SystemError) {
    return err(error);
  }
  // always return error as SystemError
  return err(BaseComponentInnerError.unknownError(errorSource, error).toFxError());
}

export async function wrapSummary(
  exec: () => Promise<Result<Map<string, string>, FxError>>,
  summary: string[]
): Promise<ExecutionResult> {
  const result = await exec();
  if (result.isOk()) {
    const summaries = summary.map((s) => getLocalizedString(s));
    return { result, summaries };
  } else {
    const summaries: string[] = [];
    return { result, summaries };
  }
}

// Manifest env-variable (`${{ENV_NAME}}`) expansion lives in @microsoft/app-manifest
// (re-exported via @microsoft/teamsfx-api) so hosts can resolve manifests without
// fx-core. Re-exported here to keep the existing import path for fx-core call sites.
export { expandEnvironmentVariable, getEnvironmentVariables } from "@microsoft/teamsfx-api";

export function getAbsolutePath(relativeOrAbsolutePath: string, projectPath: string): string {
  relativeOrAbsolutePath = relativeOrAbsolutePath || "";
  projectPath = projectPath || "";
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(projectPath, relativeOrAbsolutePath);
}

export function outputScaffoldingWarningMessage(warnings: Warning[]): string {
  const manifestWarningMessage = warnings.map((warn) => {
    return `${SummaryConstant.NotExecuted} ${warn.content}`;
  });

  return manifestWarningMessage.length > 0
    ? getLocalizedString("core.scaffold.warning.summary", manifestWarningMessage.join(EOL))
    : "";
}
