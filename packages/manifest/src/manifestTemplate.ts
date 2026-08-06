// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Host-agnostic resolution of manifest templating: the `${{ENV}}` environment
// variable syntax and the `$[file('<path>')]` function syntax. This logic was
// previously entangled with fx-core's DriverContext (telemetry, logging, i18n,
// FxError). It is relocated here so consumers such as the SPFx build pipeline can
// resolve declarative-agent manifests without depending on @microsoft/teamsfx-core
// or a DriverContext. fx-core keeps telemetry and localized-error mapping and
// delegates the resolution itself to the functions below.

import path from "path";
import fs from "fs-extra";
import stripBom from "strip-bom";

const placeholderRegex = /\${{ *[a-zA-Z_][a-zA-Z0-9_]* *}}/g;
const functionRegex = /\$\[ *[a-zA-Z][a-zA-Z]*\([^\]]*\) *\]/g;

export enum ManifestType {
  TeamsManifest = "teams-manifest",
  PluginManifest = "plugin-manifest",
  DeclarativeCopilotManifest = "declarative-copilot-manifest",
  ApiSpec = "api-spec",
  EmbeddedKnowledgeFile = "embedded-knowledge-file",
}

export interface ResolveManifestOptions {
  // Explicit environment map. When omitted, process.env is used.
  envs?: { [key in string]: string };
  // Absolute path of the manifest file being resolved. `file()` paths are
  // resolved relative to this file's directory.
  fromPath: string;
  manifestType: ManifestType;
  // Optional diagnostic sink, replacing DriverContext.logProvider.
  logger?: { error: (message: string) => void };
}

export interface ResolveManifestResult {
  // The resolved manifest content.
  content: string;
  // Number of `file()` macros that produced a value, for host telemetry.
  functionCount: number;
}

/**
 * Base error for all template-resolution failures. Consumers can catch this to
 * distinguish resolution errors from unexpected exceptions. Subclasses carry the
 * offending path/token so a host (e.g. fx-core) can remap them to its own errors.
 *
 * @remarks
 * Messages on these errors are plain, non-localized English. A host that surfaces
 * them to end users (fx-core, the SPFx build pipeline, etc.) is expected to catch
 * the specific subclass and remap it to its own localized error before display.
 */
export class ManifestTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestTemplateError";
  }
}

export class UnsupportedFileFormatError extends ManifestTemplateError {
  constructor(public readonly filePath: string) {
    super("The file to be embedded must be a .txt or .md file.");
    this.name = "UnsupportedFileFormatError";
  }
}

export class InvalidFunctionError extends ManifestTemplateError {
  constructor(public readonly token: string) {
    super("Unsupported function. Only the 'file' function is supported.");
    this.name = "InvalidFunctionError";
  }
}

export class InvalidFunctionParameterError extends ManifestTemplateError {
  constructor(public readonly token: string) {
    super("Invalid parameter for the 'file' function.");
    this.name = "InvalidFunctionParameterError";
  }
}

export class ReadFileError extends ManifestTemplateError {
  constructor(
    public readonly filePath: string,
    public readonly cause?: unknown
  ) {
    super(`Failed to read file '${filePath}'.`);
    this.name = "ReadFileError";
  }
}

export class FileNotFoundError extends ManifestTemplateError {
  constructor(public readonly filePath: string) {
    super(`File not found: '${filePath}'.`);
    this.name = "FileNotFoundError";
  }
}

export class MissingEnvironmentVariablesError extends ManifestTemplateError {
  constructor(
    public readonly names: string,
    public readonly fromPath: string
  ) {
    super(`The following environment variables are not defined: ${names}.`);
    this.name = "MissingEnvironmentVariablesError";
  }
}

// Expand `${{ENV_NAME}}` references in content. A value not present in
// `envs`/process.env leaves the placeholder untouched, except APP_NAME_SUFFIX
// which is substituted whenever it is explicitly set (including empty string).
export function expandEnvironmentVariable(
  content: string,
  envs?: { [key in string]: string }
): string {
  const placeholders = content.match(placeholderRegex);
  if (placeholders) {
    for (const placeholder of placeholders) {
      const envName = placeholder.slice(3, -2).trim(); // removes `${{` and `}}`
      const envValue = envs ? envs[envName] : process.env[envName];
      if (envName === "APP_NAME_SUFFIX") {
        if (envValue !== undefined && envValue !== null) {
          content = content.replace(placeholder, envValue);
        }
      } else {
        if (envValue) {
          content = content.replace(placeholder, envValue);
        }
      }
    }
  }

  return content;
}

/**
 * Expand environment variables in content. The format of referencing environment variable is: ${{ENV_NAME}}
 * @return An array of environment variables
 */
export function getEnvironmentVariables(content: string): string[] {
  const placeholders = content.match(placeholderRegex);
  if (placeholders) {
    const variables = placeholders.map((placeholder) => placeholder.slice(3, -2).trim()); // removes `${{` and `}}`)
    // remove duplicates
    return [...new Set(variables)];
  }
  return [];
}

function getAbsolutePath(relativeOrAbsolutePath: string, fromPath: string): string {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(path.dirname(fromPath), relativeOrAbsolutePath);
}

async function readFileContent(
  filePath: string,
  envs: { [key in string]: string } | undefined,
  fromPath: string,
  logger?: { error: (message: string) => void }
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".txt" && ext !== ".md") {
    logger?.error(`Unsupported file '${filePath}'. Only .txt and .md files are supported.`);
    throw new UnsupportedFileFormatError(filePath);
  }

  const absolutePath = getAbsolutePath(filePath, fromPath);
  if (await fs.pathExists(absolutePath)) {
    try {
      let fileContent = await fs.readFile(absolutePath, "utf8");
      fileContent = stripBom(fileContent);
      let processedFileContent = expandEnvironmentVariable(fileContent, envs);
      processedFileContent = processedFileContent.replace(/\r\n/g, "\n");
      return processedFileContent;
    } catch (e) {
      logger?.error(`Failed to read file '${absolutePath}': ${(e as Error)?.toString()}`);
      throw new ReadFileError(absolutePath, e);
    }
  }
  throw new FileNotFoundError(filePath);
}

export async function processManifestFunction(
  content: string,
  envs: { [key in string]: string } | undefined,
  fromPath: string,
  logger?: { error: (message: string) => void }
): Promise<string> {
  const firstTrimmedContent = content.trim();
  if (!firstTrimmedContent.startsWith("file(") || !firstTrimmedContent.endsWith(")")) {
    logger?.error(`Unsupported function '${firstTrimmedContent}'. Only 'file' is supported.`);
    throw new InvalidFunctionError(firstTrimmedContent);
  }

  // file()
  const trimmedParameter = content.slice(5, -1).trim();
  if (trimmedParameter[0] === "'" && trimmedParameter[trimmedParameter.length - 1] === "'") {
    // static string as function parameter
    return readFileContent(
      trimmedParameter.substring(1, trimmedParameter.length - 1),
      envs,
      fromPath,
      logger
    );
  } else if (trimmedParameter.startsWith("${{") && trimmedParameter.endsWith("}}")) {
    // env variable inside
    const resolvedParameter = expandEnvironmentVariable(trimmedParameter, envs);
    return readFileContent(resolvedParameter, envs, fromPath, logger);
  } else if (trimmedParameter.startsWith("file(") && trimmedParameter.endsWith(")")) {
    // nested function inside
    const nested = await processManifestFunction(trimmedParameter, envs, fromPath, logger);
    return readFileContent(nested, envs, fromPath, logger);
  } else {
    // invalid content inside function
    logger?.error(`Invalid parameter '${trimmedParameter}' for the 'file' function.`);
    throw new InvalidFunctionParameterError(trimmedParameter);
  }
}

export async function expandFileFunctionMacros(
  content: string,
  isJson: boolean,
  options: Pick<ResolveManifestOptions, "envs" | "fromPath" | "logger">
): Promise<ResolveManifestResult> {
  const matches = content.match(functionRegex);
  if (!matches) {
    return { content, functionCount: 0 }; // no function
  }
  let functionCount = 0;
  for (const placeholder of matches) {
    let value = await processManifestFunction(
      placeholder.slice(2, -1).trim(),
      options.envs,
      options.fromPath,
      options.logger
    );
    if (isJson && value) {
      value = JSON.stringify(value).slice(1, -1);
    }
    if (value) {
      functionCount += 1;
      content = content.replace(placeholder, value);
    }
  }
  return { content, functionCount };
}

// Fully resolve a manifest template string: expand `$[file()]` calls (except for
// ApiSpec) then `${{ENV}}` variables, failing if any variable is left unresolved.
// This is the host-agnostic counterpart of fx-core's getResolvedManifest, which
// wraps it with telemetry and localized-error mapping. `functionCount` is the number
// of `file()` calls that produced a value, so a host can report telemetry.
export async function resolveManifest(
  content: string,
  options: ResolveManifestOptions
): Promise<ResolveManifestResult> {
  let value = content;
  let functionCount = 0;
  if (options.manifestType !== ManifestType.ApiSpec) {
    const expanded = await expandFileFunctionMacros(content, true, options);
    value = expanded.content;
    functionCount = expanded.functionCount;
    value = expandEnvironmentVariable(value, options.envs);
  } else {
    value = expandEnvironmentVariable(value, options.envs);
  }

  const notExpandedVars = getEnvironmentVariables(value);
  if (notExpandedVars.length > 0) {
    throw new MissingEnvironmentVariablesError(notExpandedVars.join(","), options.fromPath);
  }

  return { content: value, functionCount };
}
