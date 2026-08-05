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
  const ext = path.extname(filePath);
  if (ext.toLowerCase() !== ".txt" && ext.toLowerCase() !== ".md") {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.unsupportedFile.errorLog", filePath, "txt")
    );
    return err(new UnsupportedFileFormatError(ctx.platform));
  }

  const absolutePath = getAbsolutePath(filePath, fromPath);
  if (await fs.pathExists(absolutePath)) {
    try {
      let fileContent = await fs.readFile(absolutePath, "utf8");
      fileContent = stripBom(fileContent);
      let processedFileContent = expandEnvironmentVariable(fileContent, envs);
      processedFileContent = processedFileContent.replace(/\r\n/g, "\n");
      return ok(processedFileContent);
    } catch (e) {
      ctx.logProvider.error(
        getLocalizedString("core.envFunc.readFile.errorLog", absolutePath, e?.toString())
      );
      return err(new ReadFileError(ctx.platform, absolutePath));
    }
  } else {
    return err(new FileNotFoundError(source, filePath));
  }
}

function getAbsolutePath(relativeOrAbsolutePath: string, fromPath: string): string {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(path.dirname(fromPath), relativeOrAbsolutePath);
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
