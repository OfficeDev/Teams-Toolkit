// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import {
  assembleError,
  Func,
  FxError,
  Inputs,
  newSystemError,
  newUserError,
  Stage,
  SystemError,
  UserError,
  ArchiveFolderName,
} from "@microsoft/teamsfx-api";

export const CoreSource = "Core";

export function ProjectFolderExistError(path: string): UserError {
  return newUserError(
    CoreSource,
    "ProjectFolderExistError",
    `Path ${path} already exists. Select a different folder.`
  );
}

export function ProjectFolderNotExistError(path: string): UserError {
  return newUserError(
    CoreSource,
    "ProjectFolderNotExistError",
    `Path ${path} does not exist. Select a different folder.`
  );
}

export function EmptyProjectFolderError(): SystemError {
  return newSystemError(CoreSource, "EmptyProjectFolderError", "Project path is empty");
}

export function MigrateNotImplementError(path: string): SystemError {
  return newSystemError(
    CoreSource,
    "MigrateNotImplemented",
    `Migrate V1 Project is not implemented.`
  );
}

export function WriteFileError(e: Error): SystemError {
  const error = assembleError(e);
  error.name = "WriteFileError";
  error.source = CoreSource;
  return error;
}

export function ReadFileError(e: Error): SystemError {
  const error = assembleError(e);
  error.name = "ReadFileError";
  error.source = CoreSource;
  return error;
}

export function NoneFxError(e: any): FxError {
  const err = assembleError(e);
  err.name = "NoneFxError";
  return err;
}

export function NoProjectOpenedError(): UserError {
  return newUserError(
    CoreSource,
    "NoProjectOpened",
    "No project opened, you can create a new project or open an existing one."
  );
}

export function InvalidV1ProjectError(message?: string) {
  return newUserError(
    CoreSource,
    "InvalidV1Project",
    `The project is not a valid Teams Toolkit V1 project. ${message}`
  );
}

export function ArchiveFolderExistError() {
  return newUserError(
    CoreSource,
    "ArchiveFolderExist",
    `Archive folder '${ArchiveFolderName}' already exists. Rollback the project or remove '${ArchiveFolderName}' folder.`
  );
}

export function PathNotExistError(path: string): UserError {
  return newUserError(CoreSource, "PathNotExist", `The path not exist: ${path}`);
}

export function InvalidProjectError(msg?: string): UserError {
  return newUserError(
    CoreSource,
    "InvalidProject",
    `The command only works for project created by Teamsfx Toolkit. ${msg ? ": " + msg : ""}`
  );
}

export function ConcurrentError(): UserError {
  return newUserError(
    CoreSource,
    "ConcurrentOperation",
    "Concurrent operation error, please wait until the running task finish or you can reload the window to cancel it."
  );
}

export function TaskNotSupportError(task: Stage | string): SystemError {
  return newSystemError(CoreSource, "TaskNotSupport", `Task is not supported yet: ${task}`);
}

export function FetchSampleError(): UserError {
  return newUserError(CoreSource, "FetchSampleError", "Failed to download sample app");
}

export function InvalidInputError(reason: string, inputs?: Inputs): UserError {
  return newUserError(
    CoreSource,
    "InvalidInput",
    inputs
      ? `Invalid inputs: ${reason}, inputs: ${JSON.stringify(inputs)}`
      : `Invalid inputs: ${reason}`
  );
}

export function FunctionRouterError(func: Func): UserError {
  return newUserError(
    CoreSource,
    "FunctionRouterError",
    `Failed to route function call:${JSON.stringify(func)}`
  );
}

export function ContextUpgradeError(error: any, isUserError = false): FxError {
  if (isUserError) {
    return newUserError(
      CoreSource,
      "ContextUpgradeError",
      `Failed to update context: ${error.message}`,
      undefined,
      error
    );
  } else {
    return newSystemError(
      CoreSource,
      "ContextUpgradeError",
      `Failed to update context: ${error.message}`,
      undefined,
      error
    );
  }
}

export function PluginHasNoTaskImpl(pluginName: string, task: string): SystemError {
  return newSystemError(
    CoreSource,
    "PluginHasNoTaskImplError",
    `Plugin ${pluginName} has not implemented method: ${task}`
  );
}

export function ProjectSettingsUndefinedError(): SystemError {
  return newSystemError(
    CoreSource,
    "ProjectSettingsUndefinedError",
    "Project settings is undefined"
  );
}

export function ProjectEnvNotExistError(env: string): SystemError {
  return newUserError(
    CoreSource,
    "ProjectEnvNotExistError",
    `The specified env ${env} does not exist. Select an existing env.`
  );
}

export function InvalidEnvNameError(): FxError {
  return new UserError(
    CoreSource,
    "InvalidEnvNameError",
    `Environment name can only contain letters, digits, _ and -.`
  );
}
