// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  err,
  FxError,
  ok,
  Platform,
  Result,
  UserError,
  UserErrorOptions,
} from "@microsoft/teamsfx-api";
import path from "path";
import fs from "fs-extra";
import stripBom from "strip-bom";
import { FileNotFoundError } from "../../error";
import { expandEnvironmentVariable } from "./common";
import { getLocalizedString } from "../../common/localizeUtils";
import { DriverContext } from "../driver/interface/commonArgs";

const source = "ResolveManifestFunction";
const telemetryEvent = "manifest-with-function";
const helpLink = "https://aka.ms/teamsfx-customize-manifest";

enum TelemetryPropertyKey {
  manifestType = "manifest-type",
  functionCount = "function-count",
}

export enum ManifestType {
  TeamsManifest = "teams-manifest",
  PluginManifest = "plugin-manifest",
  DeclarativeCopilotManifest = "declarative-copilot-manifest",
  ApiSpec = "api-spec",
  EmbeddedKnowledgeFile = "embedded-knowledge-file",
}

export async function expandVariableWithFunction(
  content: string,
  ctx: DriverContext,
  envs: { [key in string]: string } | undefined,
  isJson: boolean,
  manifestType: ManifestType,
  fromPath: string
): Promise<Result<string, FxError>> {
  const regex = /\$\[ *[a-zA-Z][a-zA-Z]*\([^\]]*\) *\]/g;
  const matches = content.match(regex);

  if (!matches) {
    return ok(content); // no function
  }
  let count = 0;
  for (const placeholder of matches) {
    const processedRes = await processFunction(
      placeholder.slice(2, -1).trim(),
      ctx,
      envs,
      fromPath
    );
    if (processedRes.isErr()) {
      return err(processedRes.error);
    }
    let value = processedRes.value;
    if (isJson && value) {
      value = JSON.stringify(value).slice(1, -1);
    }
    if (value) {
      count += 1;
      content = content.replace(placeholder, value);
    }
  }

  if (count > 0) {
    ctx.telemetryReporter?.sendTelemetryEvent(telemetryEvent, {
      [TelemetryPropertyKey.manifestType]: manifestType.toString(),
      [TelemetryPropertyKey.functionCount]: count.toString(),
    });
  }
  return ok(content);
}

async function processFunction(
  content: string,
  ctx: DriverContext,
  envs: { [key in string]: string } | undefined,
  path: string
): Promise<Result<string, FxError>> {
  const firstTrimmedContent = content.trim();
  if (!firstTrimmedContent.startsWith("file(") || !firstTrimmedContent.endsWith(")")) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.unsupportedFunction.errorLog", firstTrimmedContent, "file")
    );
    return err(new InvalidFunctionError(ctx.platform));
  }

  // file()
  const trimmedParameter = content.slice(5, -1).trim();
  if (trimmedParameter[0] === "'" && trimmedParameter[trimmedParameter.length - 1] === "'") {
    // static string as function parameter
    const res = await readFileContent(
      trimmedParameter.substring(1, trimmedParameter.length - 1),
      ctx,
      envs,
      path
    );
    return res;
  } else if (trimmedParameter.startsWith("${{") && trimmedParameter.endsWith("}}")) {
    // env variable inside
    const resolvedParameter = expandEnvironmentVariable(trimmedParameter, envs);

    const res = readFileContent(resolvedParameter, ctx, envs, path);
    return res;
  } else if (trimmedParameter.startsWith("file(") && trimmedParameter.endsWith(")")) {
    // nested function inside
    const processsedRes = await processFunction(trimmedParameter, ctx, envs, path);

    if (processsedRes.isErr()) {
      return err(processsedRes.error);
    }

    const readFileRes = await readFileContent(processsedRes.value, ctx, envs, path);
    return readFileRes;
  } else {
    // invalid content inside function
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.invalidFunctionParameter.errorLog", trimmedParameter, "file")
    );
    return err(new InvalidFunctionParameter(ctx.platform));
  }
}

async function readFileContent(
  filePath: string,
  ctx: DriverContext,
  envs: { [key in string]: string } | undefined,
  fromPath: string
): Promise<Result<string, FxError>> {
  const manifestDirectory = path.resolve(path.dirname(fromPath));
  const absolutePath = path.resolve(manifestDirectory, filePath);
  const safeFileReference = path.isAbsolute(filePath) ? path.basename(filePath) : filePath;
  if (!isPathContained(manifestDirectory, absolutePath)) {
    return fileReferenceOutsideManifestDirectory(ctx, filePath, absolutePath, manifestDirectory);
  }

  if (!isSupportedFileFormat(filePath)) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.unsupportedFile.errorLog", safeFileReference, "txt")
    );
    return err(new UnsupportedFileFormatError(ctx.platform));
  }

  let realManifestDirectory: string;
  let realFilePath: string;
  try {
    realManifestDirectory = await fs.realpath(manifestDirectory);
    realFilePath = await fs.realpath(absolutePath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return err(new FileNotFoundError(source, safeFileReference));
    }
    ctx.logProvider.error(
      getLocalizedString(
        "core.envFunc.readFile.errorLog",
        safeFileReference,
        getFileSystemErrorCode(error)
      )
    );
    return err(new ReadFileError(ctx.platform, safeFileReference));
  }

  if (!isPathContained(realManifestDirectory, realFilePath)) {
    return fileReferenceOutsideManifestDirectory(ctx, filePath, realFilePath, manifestDirectory);
  }

  if (!isSupportedFileFormat(realFilePath)) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.unsupportedFile.errorLog", safeFileReference, "txt")
    );
    return err(new UnsupportedFileFormatError(ctx.platform));
  }

  try {
    let fileContent = await fs.readFile(realFilePath, "utf8");
    fileContent = stripBom(fileContent);
    let processedFileContent = expandEnvironmentVariable(fileContent, envs);
    processedFileContent = processedFileContent.replace(/\r\n/g, "\n");
    return ok(processedFileContent);
  } catch (error) {
    ctx.logProvider.error(
      getLocalizedString(
        "core.envFunc.readFile.errorLog",
        safeFileReference,
        getFileSystemErrorCode(error)
      )
    );
    return err(new ReadFileError(ctx.platform, safeFileReference));
  }
}

function isPathContained(directory: string, filePath: string): boolean {
  const relativePath = path.relative(directory, filePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function isSupportedFileFormat(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".txt" || extension === ".md";
}

function isFileNotFoundError(error: unknown): boolean {
  return getFileSystemErrorCode(error) === "ENOENT";
}

function getFileSystemErrorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "UNKNOWN";
}

function fileReferenceOutsideManifestDirectory(
  ctx: DriverContext,
  fileReference: string,
  resolvedPath: string,
  manifestDirectory: string
): Result<string, FxError> {
  const errorLog =
    ctx.platform === Platform.VSCode
      ? getLocalizedString(
          "core.envFunc.fileReferenceOutsideManifestDirectory.errorLog.vsc",
          fileReference,
          resolvedPath,
          manifestDirectory
        )
      : getLocalizedString("core.envFunc.fileReferenceOutsideManifestDirectory.errorLog");
  ctx.logProvider.error(errorLog);
  return err(new FileReferenceOutsideManifestDirectoryError(ctx.platform, fileReference));
}

class UnsupportedFileFormatError extends UserError {
  constructor(platform: Platform | undefined) {
    const message =
      platform === Platform.VSCode
        ? getLocalizedString(
            "core.envFunc.unsupportedFile.errorMessage",
            getLocalizedString("core.error.checkOutput.vsc")
          )
        : getLocalizedString("core.envFunc.unsupportedFile.errorMessage");
    const errorOptions: UserErrorOptions = {
      source,
      name: "UnsupportedFileFormat",
      message,
      displayMessage: message,
      helpLink,
    };
    super(errorOptions);
  }
}

class FileReferenceOutsideManifestDirectoryError extends UserError {
  constructor(platform: Platform | undefined, fileReference: string) {
    const message = getLocalizedString(
      "core.envFunc.fileReferenceOutsideManifestDirectory.errorMessage"
    );
    const displayMessage =
      platform === Platform.VSCode
        ? getLocalizedString(
            "core.envFunc.fileReferenceOutsideManifestDirectory.errorMessage.vsc",
            fileReference
          )
        : message;
    const errorOptions: UserErrorOptions = {
      source,
      name: "FileReferenceOutsideManifestDirectory",
      message,
      displayMessage,
      helpLink,
    };
    super(errorOptions);
  }
}

class InvalidFunctionError extends UserError {
  constructor(platform: Platform) {
    const message =
      platform === Platform.VSCode
        ? getLocalizedString(
            "core.envFunc.unsupportedFunction.errorMessage",
            getLocalizedString("core.error.checkOutput.vsc")
          )
        : getLocalizedString("core.envFunc.unsupportedFunction.errorMessage", "");
    const errorOptions: UserErrorOptions = {
      source,
      name: "InvalidFunction",
      message,
      displayMessage: message,
      helpLink,
    };
    super(errorOptions);
  }
}

class InvalidFunctionParameter extends UserError {
  constructor(platform: Platform) {
    const message =
      platform === Platform.VSCode
        ? getLocalizedString(
            "core.envFunc.invalidFunctionParameter.errorMessage",
            "file",
            getLocalizedString("core.error.checkOutput.vsc")
          )
        : getLocalizedString("core.envFunc.invalidFunctionParameter.errorMessage", "file", "");
    const errorOptions: UserErrorOptions = {
      source,
      name: "InvalidFunctionParameter",
      message,
      displayMessage: message,
      helpLink,
    };
    super(errorOptions);
  }
}

class ReadFileError extends UserError {
  constructor(platform: Platform, filePath: string) {
    const message =
      platform === Platform.VSCode
        ? getLocalizedString(
            "core.envFunc.readFile.errorMessage",
            filePath,
            getLocalizedString("core.error.checkOutput.vsc")
          )
        : getLocalizedString("core.envFunc.readFile.errorMessage", filePath, "");
    const errorOptions: UserErrorOptions = {
      source,
      name: "ReadFileError",
      message,
      displayMessage: message,
      helpLink,
    };
    super(errorOptions);
  }
}
