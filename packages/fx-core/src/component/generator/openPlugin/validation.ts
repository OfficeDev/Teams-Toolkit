// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";
import { OpenPluginInputError } from "./errors";
import { isValidPluginName, MCP_SCHEMA_URL, PLUGIN_SCHEMA_URL, resolveWithinRoot } from "./spec";
import {
  AtkAgentConnectorExt,
  AtkExtensionBlock,
  AuthorizationType,
  ConnectorAuthorizationType,
  OpenPluginManifest,
  OpenPluginMcpServerEntry,
} from "./types";

export interface ParsedAgentPluginManifest {
  manifest: OpenPluginManifest;
  warnings: string[];
}

export interface ParsedAgentPluginMcpJson {
  mcpServers: Record<string, OpenPluginMcpServerEntry>;
  invalidRemoteMcpServers: string[];
  warnings: string[];
}

const PLUGIN_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

const STDIO_FIELDS = new Set(["type", "command", "args", "env", "cwd"]);
const REMOTE_FIELDS = new Set(["type", "url", "headers"]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new OpenPluginInputError(`plugin.json '${field}' must be a string.`);
  }
  return value;
}

export function parseAgentPluginManifest(value: unknown): ParsedAgentPluginManifest {
  if (!isRecord(value)) {
    throw new OpenPluginInputError("plugin.json must contain a JSON object.");
  }
  if (value.$schema !== PLUGIN_SCHEMA_URL) {
    throw new OpenPluginInputError(`plugin.json '$schema' must be '${PLUGIN_SCHEMA_URL}'.`);
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new OpenPluginInputError("plugin.json is missing required 'name' field.");
  }
  if (!isValidPluginName(value.name)) {
    throw new OpenPluginInputError(
      "plugin.json 'name' does not satisfy the Agent Plugins 1.0.0 constraints."
    );
  }

  const manifest: OpenPluginManifest = { $schema: value.$schema, name: value.name };
  const version = optionalString(value, "version");
  const description = optionalString(value, "description");
  const homepage = optionalString(value, "homepage");
  const repository = optionalString(value, "repository");
  const license = optionalString(value, "license");
  if (version !== undefined) manifest.version = version;
  if (description !== undefined) manifest.description = description;
  if (homepage !== undefined) manifest.homepage = homepage;
  if (repository !== undefined) manifest.repository = repository;
  if (license !== undefined) manifest.license = license;

  if (value.author !== undefined) {
    if (!isRecord(value.author)) {
      throw new OpenPluginInputError("plugin.json 'author' must be an object.");
    }
    const unknownAuthorField = Object.keys(value.author).find(
      (field) => field !== "name" && field !== "email" && field !== "url"
    );
    if (unknownAuthorField) {
      throw new OpenPluginInputError(
        `plugin.json 'author.${unknownAuthorField}' is not permitted.`
      );
    }
    const name = optionalString(value.author, "name");
    const email = optionalString(value.author, "email");
    const url = optionalString(value.author, "url");
    manifest.author = {};
    if (name !== undefined) manifest.author.name = name;
    if (email !== undefined) manifest.author.email = email;
    if (url !== undefined) manifest.author.url = url;
  }

  if (value.keywords !== undefined) {
    if (
      !Array.isArray(value.keywords) ||
      !value.keywords.every((item) => typeof item === "string")
    ) {
      throw new OpenPluginInputError("plugin.json 'keywords' must be an array of strings.");
    }
    manifest.keywords = value.keywords;
  }

  const warnings: string[] = [];
  if (value.extensions !== undefined) {
    if (!isRecord(value.extensions)) {
      throw new OpenPluginInputError("plugin.json 'extensions' must be an object.");
    } else {
      const extensions: Record<string, unknown> = {};
      for (const [namespace, extension] of Object.entries(value.extensions)) {
        if (!isRecord(extension)) {
          throw new OpenPluginInputError(`plugin.json extension '${namespace}' must be an object.`);
        }
        extensions[namespace] = extension;
      }
      manifest.extensions = extensions;
    }
  }

  for (const field of Object.keys(value)) {
    if (!PLUGIN_FIELDS.has(field)) {
      warnings.push(
        `plugin.json field '${field}' is not defined by Agent Plugins 1.0.0 and was ignored.`
      );
    }
  }
  return { manifest, warnings };
}

export function parseLegacyOpenPluginManifest(value: unknown): OpenPluginManifest {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
    throw new OpenPluginInputError("plugin.json is missing required 'name' field.");
  }
  const manifest: OpenPluginManifest = { name: value.name };
  if (typeof value.$schema === "string") manifest.$schema = value.$schema;
  if (typeof value.version === "string") manifest.version = value.version;
  if (typeof value.description === "string") manifest.description = value.description;
  if (typeof value.homepage === "string") manifest.homepage = value.homepage;
  if (typeof value.repository === "string") manifest.repository = value.repository;
  if (typeof value.license === "string") manifest.license = value.license;
  if (typeof value.author === "string" || isRecord(value.author)) manifest.author = value.author;
  if (Array.isArray(value.keywords) && value.keywords.every((item) => typeof item === "string")) {
    manifest.keywords = value.keywords;
  }
  if (isRecord(value.extensions)) manifest.extensions = value.extensions;
  copyLegacyFields(value, manifest);
  return manifest;
}

export function parseAtkExtension(
  value: unknown,
  warnings: string[]
): AtkExtensionBlock | undefined {
  if (!isRecord(value)) {
    warnings.push("Toolkit extension must be an object and was ignored.");
    return undefined;
  }

  const extension: AtkExtensionBlock = {};
  const manifestVersion = readExtensionString(
    value,
    "manifestVersion",
    "manifestVersion",
    warnings,
    (item) => item === "devPreview"
  );
  const id = readExtensionString(value, "id", "id", warnings, (item) => UUID_PATTERN.test(item));
  const packageName = readExtensionString(
    value,
    "packageName",
    "packageName",
    warnings,
    isNonEmptyString
  );
  const accentColor = readExtensionString(value, "accentColor", "accentColor", warnings, (item) =>
    ACCENT_COLOR_PATTERN.test(item)
  );
  if (manifestVersion !== undefined) extension.manifestVersion = manifestVersion;
  if (id !== undefined) extension.id = id;
  if (packageName !== undefined) extension.packageName = packageName;
  if (accentColor !== undefined) extension.accentColor = accentColor;

  const developer = parseExtensionDeveloper(value.developer, warnings);
  const name = parseExtensionTextPair(value.name, "name", 30, 100, warnings);
  const description = parseExtensionTextPair(value.description, "description", 80, 4000, warnings);
  const agentConnectors = parseExtensionConnectors(value.agentConnectors, warnings);
  if (developer) extension.developer = developer;
  if (name) extension.name = name;
  if (description) extension.description = description;
  if (agentConnectors) extension.agentConnectors = agentConnectors;

  const knownFields = new Set([
    "manifestVersion",
    "id",
    "packageName",
    "accentColor",
    "developer",
    "name",
    "description",
    "agentConnectors",
  ]);
  for (const field of Object.keys(value)) {
    if (!knownFields.has(field)) {
      warnings.push(`Toolkit extension field '${field}' is not supported and was ignored.`);
    }
  }
  return Object.keys(extension).length > 0 ? extension : undefined;
}

function parseExtensionDeveloper(
  value: unknown,
  warnings: string[]
): AtkExtensionBlock["developer"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    warnings.push("Toolkit extension field 'developer' is invalid and was ignored.");
    return undefined;
  }
  const developer: NonNullable<AtkExtensionBlock["developer"]> = {};
  const name = readExtensionString(value, "name", "developer.name", warnings, (item) =>
    hasLength(item, 32)
  );
  const websiteUrl = readExtensionString(
    value,
    "websiteUrl",
    "developer.websiteUrl",
    warnings,
    isHttpUrl
  );
  const privacyUrl = readExtensionString(
    value,
    "privacyUrl",
    "developer.privacyUrl",
    warnings,
    isHttpUrl
  );
  const termsOfUseUrl = readExtensionString(
    value,
    "termsOfUseUrl",
    "developer.termsOfUseUrl",
    warnings,
    isHttpUrl
  );
  if (name !== undefined) developer.name = name;
  if (websiteUrl !== undefined) developer.websiteUrl = websiteUrl;
  if (privacyUrl !== undefined) developer.privacyUrl = privacyUrl;
  if (termsOfUseUrl !== undefined) developer.termsOfUseUrl = termsOfUseUrl;
  return Object.keys(developer).length > 0 ? developer : undefined;
}

function parseExtensionTextPair(
  value: unknown,
  field: "name" | "description",
  shortMaxLength: number,
  fullMaxLength: number,
  warnings: string[]
): { short?: string; full?: string } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    warnings.push(`Toolkit extension field '${field}' is invalid and was ignored.`);
    return undefined;
  }
  const pair: { short?: string; full?: string } = {};
  const short = readExtensionString(value, "short", `${field}.short`, warnings, (item) =>
    hasLength(item, shortMaxLength)
  );
  const full = readExtensionString(value, "full", `${field}.full`, warnings, (item) =>
    hasLength(item, fullMaxLength)
  );
  if (short !== undefined) pair.short = short;
  if (full !== undefined) pair.full = full;
  return Object.keys(pair).length > 0 ? pair : undefined;
}

function parseExtensionConnectors(
  value: unknown,
  warnings: string[]
): Record<string, AtkAgentConnectorExt> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    warnings.push("Toolkit extension field 'agentConnectors' is invalid and was ignored.");
    return undefined;
  }
  const connectors: Record<string, AtkAgentConnectorExt> = {};
  for (const [serverName, rawConnector] of Object.entries(value)) {
    if (!isRecord(rawConnector)) {
      warnings.push(`Toolkit extension connector '${serverName}' is invalid and was ignored.`);
      continue;
    }
    const connector: AtkAgentConnectorExt = {};
    const displayName = readExtensionString(
      rawConnector,
      "displayName",
      `agentConnectors.${serverName}.displayName`,
      warnings,
      isNonEmptyString
    );
    const description = readExtensionString(
      rawConnector,
      "description",
      `agentConnectors.${serverName}.description`,
      warnings,
      isNonEmptyString
    );
    if (displayName !== undefined) connector.displayName = displayName;
    if (description !== undefined) connector.description = description;

    if (rawConnector.authorization !== undefined) {
      const fieldPath = `agentConnectors.${serverName}.authorization`;
      if (!isRecord(rawConnector.authorization)) {
        warnings.push(`Toolkit extension field '${fieldPath}' is invalid and was ignored.`);
      } else if (!isAuthorizationType(rawConnector.authorization.type)) {
        warnings.push(`Toolkit extension field '${fieldPath}.type' is invalid and was ignored.`);
      } else {
        connector.authorization = { type: rawConnector.authorization.type };
        const referenceId = readExtensionString(
          rawConnector.authorization,
          "referenceId",
          `${fieldPath}.referenceId`,
          warnings,
          isNonEmptyString
        );
        if (referenceId !== undefined) connector.authorization.referenceId = referenceId;
      }
    }
    if (Object.keys(connector).length > 0) connectors[serverName] = connector;
  }
  return Object.keys(connectors).length > 0 ? connectors : undefined;
}

function readExtensionString(
  record: Record<string, unknown>,
  field: string,
  fieldPath: string,
  warnings: string[],
  validate: (value: string) => boolean
): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value === "string" && validate(value)) return value;
  warnings.push(`Toolkit extension field '${fieldPath}' is invalid and was ignored.`);
  return undefined;
}

function isAuthorizationType(value: unknown): value is ConnectorAuthorizationType {
  return (
    value === "None" ||
    value === "OAuthPluginVault" ||
    value === "ApiKeyPluginVault" ||
    value === "DynamicClientRegistration" ||
    value === "AzureKeyVault"
  );
}

function isNonEmptyString(value: string): boolean {
  return value.length > 0;
}

function hasLength(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function copyLegacyFields(value: Record<string, unknown>, manifest: OpenPluginManifest): void {
  if (typeof value.logo === "string") manifest.logo = value.logo;
  if (isLegacyPathValue(value.skills)) manifest.skills = value.skills;
  if (isLegacyPathValue(value.commands)) manifest.commands = value.commands;
  if (isLegacyPathValue(value.agents)) manifest.agents = value.agents;
  if (isLegacyPathValue(value.hooks)) manifest.hooks = value.hooks;
  if (isLegacyPathValue(value.mcpServers)) manifest.mcpServers = value.mcpServers;
  if (isLegacyPathValue(value.lspServers)) manifest.lspServers = value.lspServers;
  if (typeof value.rules === "string" || Array.isArray(value.rules) || isRecord(value.rules)) {
    manifest.rules = value.rules;
  }
  if (typeof value.outputStyles === "string" || Array.isArray(value.outputStyles)) {
    manifest.outputStyles = value.outputStyles;
  }
  manifest.legacyAtkExtension = value["x-microsoft-365-agents-toolkit"];
}

function isLegacyPathValue(value: unknown): value is string | string[] | Record<string, unknown> {
  return typeof value === "string" || Array.isArray(value) || isRecord(value);
}

export function parseAgentPluginMcpJson(value: unknown): ParsedAgentPluginMcpJson {
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return invalidMcpConfig("mcp.json must contain a JSON object.");
  }
  const unknownTopLevel = Object.keys(value).find(
    (field) => field !== "$schema" && field !== "mcpServers"
  );
  if (unknownTopLevel) {
    return invalidMcpConfig(`mcp.json contains unsupported top-level field '${unknownTopLevel}'.`);
  }
  if (value.$schema !== MCP_SCHEMA_URL) {
    return invalidMcpConfig(`mcp.json '$schema' must be '${MCP_SCHEMA_URL}'.`);
  }
  if (!isRecord(value.mcpServers)) {
    return invalidMcpConfig("mcp.json 'mcpServers' must be an object.");
  }

  const mcpServers: Record<string, OpenPluginMcpServerEntry> = {};
  const invalidRemoteMcpServers: string[] = [];
  for (const [name, server] of Object.entries(value.mcpServers)) {
    const parsed = parseAgentPluginMcpServer(server);
    if (typeof parsed === "string") {
      warnings.push(`MCP server '${name}' is invalid and was skipped: ${parsed}`);
      if (
        isRecord(server) &&
        (server.type === "streamable-http" || server.type === "sse") &&
        getRemoteMcpUrlError(server.url)
      ) {
        invalidRemoteMcpServers.push(name);
      }
    } else {
      mcpServers[name] = parsed;
    }
  }
  return { mcpServers, invalidRemoteMcpServers, warnings };
}

function invalidMcpConfig(message: string): ParsedAgentPluginMcpJson {
  return {
    mcpServers: {},
    invalidRemoteMcpServers: [],
    warnings: [`mcp.json is invalid: ${message} MCP was disabled for this plugin.`],
  };
}

function parseAgentPluginMcpServer(value: unknown): OpenPluginMcpServerEntry | string {
  if (!isRecord(value) || typeof value.type !== "string") {
    return "an explicit transport type is required.";
  }
  if (value.type === "stdio") {
    return parseStdioServer(value);
  }
  if (value.type === "streamable-http" || value.type === "sse") {
    return parseRemoteServer(value);
  }
  return `transport '${value.type}' is not supported by Agent Plugins 1.0.0.`;
}

function parseStdioServer(value: Record<string, unknown>): OpenPluginMcpServerEntry | string {
  const unknownField = Object.keys(value).find((field) => !STDIO_FIELDS.has(field));
  if (unknownField) return `field '${unknownField}' is not permitted for stdio.`;
  if (typeof value.command !== "string" || value.command.length === 0) {
    return "stdio requires a non-empty command.";
  }
  if (!isValidCommand(value.command))
    return "stdio command is not a bare or plugin-relative token.";
  if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every(isString))) {
    return "stdio args must be an array of strings.";
  }
  if (value.env !== undefined && !isValidStringRecord(value.env, true)) {
    return "stdio env must contain string values and cannot override PLUGIN_ROOT or PLUGIN_DATA.";
  }
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || !isValidCwd(value.cwd))) {
    return "stdio cwd is not a contained plugin or plugin-data path.";
  }

  const entry: OpenPluginMcpServerEntry = { type: "stdio", command: value.command };
  if (Array.isArray(value.args)) entry.args = value.args.filter(isString);
  if (isRecord(value.env)) {
    const env: Record<string, string> = {};
    for (const [name, envValue] of Object.entries(value.env)) {
      if (typeof envValue === "string") env[name] = envValue;
    }
    entry.env = env;
  }
  if (typeof value.cwd === "string") entry.cwd = value.cwd;
  return entry;
}

function parseRemoteServer(value: Record<string, unknown>): OpenPluginMcpServerEntry | string {
  const unknownField = Object.keys(value).find((field) => !REMOTE_FIELDS.has(field));
  if (unknownField) return `field '${unknownField}' is not permitted for remote MCP.`;
  if (value.type !== "streamable-http" && value.type !== "sse") {
    return "remote MCP requires a supported transport type.";
  }
  const urlError = getRemoteMcpUrlError(value.url);
  if (urlError) return urlError;
  if (typeof value.url !== "string") return "remote MCP requires a non-empty URL.";
  if (value.headers !== undefined && !isValidHeaders(value.headers)) {
    return "headers must contain valid HTTP header names and string values.";
  }

  const entry: OpenPluginMcpServerEntry = { type: value.type, url: value.url };
  if (isRecord(value.headers)) {
    const headers: Record<string, string> = {};
    for (const [name, headerValue] of Object.entries(value.headers)) {
      if (typeof headerValue === "string") headers[name] = headerValue;
    }
    entry.headers = headers;
  }
  return entry;
}

export function getRemoteMcpUrlError(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return "remote MCP requires a non-empty URL.";
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "remote MCP URL must be absolute.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "remote MCP URL must use HTTP or HTTPS.";
  }
  if (parsed.username || parsed.password || parsed.hash) {
    return "remote MCP URL cannot contain user information or a fragment.";
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname)) {
    return "non-loopback remote MCP URLs must use HTTPS.";
  }
  return undefined;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized) ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(normalized)
  );
}

function isValidHeaders(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const names = new Set<string>();
  for (const [name, headerValue] of Object.entries(value)) {
    const normalized = name.toLowerCase();
    if (
      !HEADER_NAME_PATTERN.test(name) ||
      names.has(normalized) ||
      typeof headerValue !== "string" ||
      /[\0\r\n]/.test(headerValue)
    ) {
      return false;
    }
    names.add(normalized);
  }
  return true;
}

function isValidStringRecord(value: unknown, rejectReservedNames: boolean): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([name, item]) =>
      typeof item === "string" &&
      (!rejectReservedNames || (name !== "PLUGIN_ROOT" && name !== "PLUGIN_DATA"))
  );
}

function isValidCommand(command: string): boolean {
  if (command.startsWith("./")) {
    return resolveWithinRoot(path.posix.resolve("/plugin"), command) !== undefined;
  }
  return !command.includes("/") && !command.includes("\\") && !path.isAbsolute(command);
}

function isValidCwd(cwd: string): boolean {
  if (cwd === "." || cwd === "./") return true;
  if (cwd.startsWith("./")) return isContainedPosixPath(cwd.slice(2));
  for (const token of ["${PLUGIN_ROOT}", "${PLUGIN_DATA}"]) {
    if (cwd === token || cwd === `${token}/`) return true;
    const prefix = `${token}/`;
    if (cwd.startsWith(prefix)) return isContainedPosixPath(cwd.slice(prefix.length));
  }
  return false;
}

function isContainedPosixPath(relativePath: string): boolean {
  if (relativePath.includes("\\")) return false;
  const normalized = path.posix.normalize(relativePath);
  return normalized !== ".." && !normalized.startsWith("../") && !path.posix.isAbsolute(normalized);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
