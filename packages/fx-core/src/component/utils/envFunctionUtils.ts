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
  ManifestType,
  expandFileFunctionMacros,
  UnsupportedFileFormatError as ManifestUnsupportedFileFormatError,
  InvalidFunctionError as ManifestInvalidFunctionError,
  InvalidFunctionParameterError as ManifestInvalidFunctionParameterError,
  ReadFileError as ManifestReadFileError,
  FileNotFoundError as ManifestFileNotFoundError,
  MissingEnvironmentVariablesError as ManifestMissingEnvironmentVariablesError,
  resolveManifest,
  ResolveManifestResult,
} from "@microsoft/teamsfx-api";
import { FileNotFoundError, MissingEnvironmentVariablesError, assembleError } from "../../error";
import { getLocalizedString } from "../../common/localizeUtils";
import { DriverContext } from "../driver/interface/commonArgs";

const source = "ResolveManifestFunction";
const telemetryEvent = "manifest-with-function";
const helpLink = "https://aka.ms/teamsfx-customize-manifest";

enum TelemetryPropertyKey {
  manifestType = "manifest-type",
  functionCount = "function-count",
}

// Re-exported for existing importers (ManifestUtils, PluginManifestUtils, utils, createAppPackage).
export { ManifestType };

// Map a plain error thrown by @microsoft/app-manifest's resolver to the localized
// FxError surface fx-core drivers expect, emitting the same diagnostic logs as before.
function toFxError(e: unknown, ctx: DriverContext): FxError {
  if (e instanceof ManifestUnsupportedFileFormatError) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.unsupportedFile.errorLog", e.filePath, "txt")
    );
    return new UnsupportedFileFormatError(ctx.platform);
  }
  if (e instanceof ManifestInvalidFunctionError) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.unsupportedFunction.errorLog", e.token, "file")
    );
    return new InvalidFunctionError(ctx.platform);
  }
  if (e instanceof ManifestInvalidFunctionParameterError) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.invalidFunctionParameter.errorLog", e.token, "file")
    );
    return new InvalidFunctionParameter(ctx.platform);
  }
  if (e instanceof ManifestReadFileError) {
    ctx.logProvider.error(
      getLocalizedString("core.envFunc.readFile.errorLog", e.filePath, e.cause?.toString())
    );
    return new ReadFileError(ctx.platform, e.filePath);
  }
  if (e instanceof ManifestFileNotFoundError) {
    return new FileNotFoundError(source, e.filePath);
  }
  if (e instanceof ManifestMissingEnvironmentVariablesError) {
    return new MissingEnvironmentVariablesError("manifest", e.names, e.fromPath);
  }
  // Anything else is unexpected; wrap it so the Result<T, FxError> contract holds.
  return assembleError(e, source);
}

// Run a resolver that yields { content, functionCount }, mapping thrown
// ManifestTemplateErrors to localized FxError and emitting function-count telemetry.
async function runManifestResolver(
  resolve: () => Promise<ResolveManifestResult>,
  ctx: DriverContext,
  manifestType: ManifestType
): Promise<Result<string, FxError>> {
  let resolved: ResolveManifestResult;
  try {
    resolved = await resolve();
  } catch (e) {
    return err(toFxError(e, ctx));
  }

  if (resolved.functionCount > 0) {
    ctx.telemetryReporter?.sendTelemetryEvent(telemetryEvent, {
      [TelemetryPropertyKey.manifestType]: manifestType.toString(),
      [TelemetryPropertyKey.functionCount]: resolved.functionCount.toString(),
    });
  }
  return ok(resolved.content);
}

// Expand only `$[file()]` macros, leaving `${{ENV}}` substitution to the caller.
export async function expandVariableWithFunction(
  content: string,
  ctx: DriverContext,
  envs: { [key in string]: string } | undefined,
  isJson: boolean,
  manifestType: ManifestType,
  fromPath: string
): Promise<Result<string, FxError>> {
  return runManifestResolver(
    () => expandFileFunctionMacros(content, isJson, { envs, fromPath }),
    ctx,
    manifestType
  );
}

// Fully resolve a manifest via @microsoft/app-manifest's resolveManifest (shared
// file()+env logic), adding the fx-core concerns it is agnostic to.
export async function resolveManifestWithContext(
  content: string,
  ctx: DriverContext,
  manifestType: ManifestType,
  fromPath: string
): Promise<Result<string, FxError>> {
  return runManifestResolver(
    () => resolveManifest(content, { manifestType, fromPath }),
    ctx,
    manifestType
  );
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
