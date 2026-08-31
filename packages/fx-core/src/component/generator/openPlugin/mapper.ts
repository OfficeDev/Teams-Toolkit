// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createHash } from "crypto";
import * as path from "path";
import { isValidHttpUrl } from "../../../common/stringUtils";
import { parseAuthor } from "./authorParser";
import { deterministicAppId } from "./deterministicId";
import { OpenPluginInputError } from "./errors";
import { normalizePortableRelativePath, portablePathsConflict, setRecordValue } from "./spec";
import { toTitleCaseFromKebab, truncateAtWordBoundary } from "./textUtils";
import {
  AuthorizationType,
  AtkAgentConnectorExt,
  AtkExtensionBlock,
  ConnectorAuthorizationType,
  CopyOp,
  ImportInputs,
  MappedManifest,
  OpenPluginMcpServerEntry,
  ParsedOpenPlugin,
} from "./types";

export const MANIFEST_SCHEMA_URL =
  "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json";
export const MANIFEST_VERSION = "devPreview";
export const ACCENT_COLOR = "#4A90D9";

const NAME_SHORT_MAX = 30;
const NAME_FULL_MAX = 100;
const DESC_SHORT_MAX = 80;
const DESC_FULL_MAX = 4000;
const MAX_AGENT_CONNECTORS = 10;
const MAX_AGENT_CONNECTOR_ID_LENGTH = 64;
const MAX_CONNECTOR_DISPLAY_NAME_LENGTH = 128;
const MAX_CONNECTOR_DESCRIPTION_LENGTH = 4000;
const MAX_AUTHORIZATION_REFERENCE_ID_LENGTH = 128;
const AUTHORIZATION_REFERENCE_HASH_LENGTH = 12;
const CONNECTOR_ID_HASH_LENGTH = 12;

export function validateMcpServerCount(mcpServers: Record<string, OpenPluginMcpServerEntry>): void {
  const connectorCount = Object.values(mcpServers).filter(
    (server) => typeof server.url === "string" && isSecureHttpUrl(server.url.trim())
  ).length;
  if (connectorCount > MAX_AGENT_CONNECTORS) {
    throw new OpenPluginInputError(
      `Too many MCP servers: ${connectorCount}. The manifest caps agentConnectors at ${MAX_AGENT_CONNECTORS}.`
    );
  }
}

export function mapToTtkProject(
  parsed: ParsedOpenPlugin,
  inputs: ImportInputs,
  resolvedAuthTypes: Readonly<Record<string, ConnectorAuthorizationType>> = {}
): MappedManifest {
  const warnings = [...parsed.warnings];
  const pj = parsed.manifest;
  const pluginName = pj.name;
  const ext: AtkExtensionBlock = parsed.atkExtension ?? {};

  if (inputs.packageName !== undefined) {
    warnings.push(
      "--package-name was provided but the devPreview manifest schema does not include 'packageName'; ignored."
    );
  }

  const { websiteUrl, privacyUrl, termsUrl, authorName } = resolveDeveloperInputs(parsed, inputs);

  // NOTE: the "openplugin:" seed is load-bearing — it feeds the deterministic
  // UUIDv5 app id. Renaming it would change the generated id for every existing
  // plugin, so it stays as-is despite the spec rename.
  const idSeed = inputs.packageName ?? ext.packageName ?? `openplugin:${pluginName}`;
  const appId = inputs.appId ?? ext.id ?? deterministicAppId(idSeed);

  const displayName = toTitleCaseFromKebab(pluginName);
  const shortName = ext.name?.short ?? truncateAtWordBoundary(displayName, NAME_SHORT_MAX);
  const fullName = ext.name?.full ?? truncateAtWordBoundary(displayName, NAME_FULL_MAX);
  const description = pj.description ?? pluginName;
  const shortDesc = ext.description?.short ?? truncateAtWordBoundary(description, DESC_SHORT_MAX);
  const fullDesc = ext.description?.full ?? truncateAtWordBoundary(description, DESC_FULL_MAX);

  const agentSkills = parsed.skills.map((folder) => ({ folder: `./skills/${folder}` }));

  validateMcpServerCount(parsed.mcpServers);
  const agentConnectors = buildAgentConnectors(
    parsed.mcpServers,
    pluginName,
    inputs.defaultAuthType ?? "Auto",
    ext.agentConnectors,
    warnings,
    resolvedAuthTypes
  );

  const developer: Record<string, unknown> = {
    name: ext.developer?.name ?? authorName ?? "Unknown",
    websiteUrl,
    privacyUrl,
    termsOfUseUrl: termsUrl,
  };

  const accentColor = ext.accentColor ?? ACCENT_COLOR;

  const manifest: Record<string, unknown> = {
    $schema: MANIFEST_SCHEMA_URL,
    manifestVersion: ext.manifestVersion ?? MANIFEST_VERSION,
    version: pj.version ?? "1.0.0",
    id: appId,
  };
  manifest.developer = developer;
  manifest.name = { short: shortName, full: fullName };
  manifest.description = { short: shortDesc, full: fullDesc };
  manifest.icons = { color: "color.png", outline: "outline.png" };
  manifest.accentColor = accentColor;
  if (agentSkills.length > 0) {
    manifest.agentSkills = agentSkills;
  }
  if (agentConnectors.length > 0) {
    manifest.agentConnectors = agentConnectors;
  }

  const copyOps: CopyOp[] = [];
  if (parsed.skillsRoot) {
    for (const skill of parsed.skills) {
      copyOps.push({
        src: path.join(parsed.skillsRoot, skill),
        destRelative: `appPackage/skills/${skill}`,
        kind: "directory",
      });
    }
  }
  if (parsed.commandsRoot && parsed.commands.length > 0) {
    for (const command of parsed.commands) {
      copyOps.push({
        src: path.join(parsed.commandsRoot, command),
        destRelative: `appPackage/commands/${command}`,
        kind: "file",
      });
    }
  }
  copyOps.push(...buildMcpToolDescriptionCopyOps(parsed, ext));

  return { manifest, copyOps, warnings };
}

function buildMcpToolDescriptionCopyOps(
  parsed: ParsedOpenPlugin,
  extension: AtkExtensionBlock
): CopyOp[] {
  const reservedPaths = [
    "manifest.json",
    "color.png",
    "outline.png",
    "skills",
    ...parsed.skills.map((skill) => path.posix.join("skills", skill)),
    ...parsed.commands.map((command) => path.posix.join("commands", command)),
  ];
  const destinations = new Map<string, { path: string; contents: Buffer }>();
  const copyOps: CopyOp[] = [];

  for (const serverName of Object.keys(parsed.mcpServers)) {
    const description = extension.agentConnectors?.[serverName]?.mcpToolDescription;
    if (!description?.file || !description.contents) continue;
    const normalizedFile = normalizePortableRelativePath(description.file);
    if (!normalizedFile) {
      throw new OpenPluginInputError(
        `MCP tool-description path '${description.file}' must identify a file within appPackage.`
      );
    }
    const reservedPath = reservedPaths.find((candidate) =>
      portablePathsConflict(normalizedFile, candidate)
    );
    if (reservedPath) {
      throw new OpenPluginInputError(
        `MCP tool-description path '${normalizedFile}' collides with generated output '${reservedPath}'.`
      );
    }

    const destinationKey = normalizedFile.toLowerCase();
    const existing = destinations.get(destinationKey);
    if (existing) {
      if (existing.path !== normalizedFile || !existing.contents.equals(description.contents)) {
        throw new OpenPluginInputError(
          `MCP tool-description paths '${existing.path}' and '${normalizedFile}' collide.`
        );
      }
      continue;
    }
    for (const destination of destinations.values()) {
      if (portablePathsConflict(normalizedFile, destination.path)) {
        throw new OpenPluginInputError(
          `MCP tool-description paths '${destination.path}' and '${normalizedFile}' collide.`
        );
      }
    }

    destinations.set(destinationKey, { path: normalizedFile, contents: description.contents });
    copyOps.push({
      contents: description.contents,
      destRelative: path.join("appPackage", normalizedFile),
      kind: "contents",
    });
  }
  return copyOps;
}

function resolveDeveloperInputs(
  parsed: ParsedOpenPlugin,
  inputs: ImportInputs
): { websiteUrl: string; privacyUrl: string; termsUrl: string; authorName?: string } {
  const author = parseAuthor(parsed.manifest.author);
  const extension = parsed.atkExtension;
  const websiteUrl =
    inputs.websiteUrl ?? extension?.developer?.websiteUrl ?? parsed.manifest.homepage ?? author.url;
  if (!websiteUrl) {
    throw new OpenPluginInputError(
      "developer.websiteUrl could not be resolved. Set 'homepage' in plugin.json, 'author.url', or pass --website-url."
    );
  }
  const privacyUrl = inputs.privacyUrl ?? extension?.developer?.privacyUrl;
  if (!privacyUrl) {
    throw new OpenPluginInputError(
      "developer.privacyUrl is required. Pass --privacy-url (the Agent Plugins spec has no equivalent field)."
    );
  }
  const termsUrl = inputs.termsUrl ?? extension?.developer?.termsOfUseUrl;
  if (!termsUrl) {
    throw new OpenPluginInputError(
      "developer.termsOfUseUrl is required. Pass --terms-url (the Agent Plugins spec has no equivalent field)."
    );
  }
  for (const [field, value] of [
    ["websiteUrl", websiteUrl],
    ["privacyUrl", privacyUrl],
    ["termsOfUseUrl", termsUrl],
  ]) {
    if (!isValidHttpUrl(value)) {
      throw new OpenPluginInputError(`developer.${field} must be a valid HTTP(S) URL.`);
    }
  }

  return { websiteUrl, privacyUrl, termsUrl, authorName: author.name };
}

export function validateImportInputs(parsed: ParsedOpenPlugin, inputs: ImportInputs): void {
  resolveDeveloperInputs(parsed, inputs);
  validateMcpServerCount(parsed.mcpServers);
}

function buildAgentConnectors(
  mcpServers: Record<string, OpenPluginMcpServerEntry>,
  pluginName: string,
  defaultAuth: "Auto" | AuthorizationType,
  extOverrides: Record<string, AtkAgentConnectorExt> | undefined,
  warnings: string[],
  resolvedAuthTypes: Readonly<Record<string, ConnectorAuthorizationType>>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const serverNames = Object.keys(mcpServers).sort();
  const connectorIds = createConnectorIds(serverNames);
  for (const name of serverNames) {
    const server = mcpServers[name];
    const url = typeof server.url === "string" ? server.url.trim() : "";
    if (!url) {
      warnings.push(
        `Skipping MCP server '${name}': no URL found (stdio servers require manual localMcpServer configuration).`
      );
      continue;
    }
    if (!isSecureHttpUrl(url)) {
      warnings.push(
        `Skipping MCP server '${name}': the Teams remoteMcpServer schema requires HTTPS.`
      );
      continue;
    }
    const override = extOverrides?.[name];
    const authType: ConnectorAuthorizationType =
      override?.authorization?.type ?? resolveAuthType(name, defaultAuth, resolvedAuthTypes);
    const authorization: Record<string, unknown> = { type: authType };
    if (authType !== "None") {
      authorization.referenceId =
        override?.authorization?.referenceId ?? createAuthorizationReferenceId(pluginName, name);
    }
    const description =
      override?.description ??
      (typeof server.description === "string" && server.description
        ? server.description
        : `Remote MCP server providing tools for ${pluginName}`);
    const remoteMcpServer: Record<string, unknown> = {
      mcpServerUrl: url,
      authorization,
    };
    if (override?.mcpToolDescription) {
      remoteMcpServer.mcpToolDescription =
        override.mcpToolDescription.file === undefined
          ? {}
          : { file: override.mcpToolDescription.file };
    }
    const mappedConnector: Record<string, unknown> = {
      id: connectorIds[name],
      displayName: truncateConnectorText(
        override?.displayName ?? `${name} MCP Server`,
        MAX_CONNECTOR_DISPLAY_NAME_LENGTH
      ),
      description: truncateConnectorText(description, MAX_CONNECTOR_DESCRIPTION_LENGTH),
      toolSource: {
        remoteMcpServer,
      },
    };
    if (override?.reusable !== undefined) mappedConnector.reusable = override.reusable;
    out.push(mappedConnector);
  }
  return out;
}

function createConnectorIds(serverNames: readonly string[]): Record<string, string> {
  const connectorIds: Record<string, string> = {};
  const usedIds = new Set<string>();
  for (const serverName of serverNames) {
    if (codePointLength(serverName) > MAX_AGENT_CONNECTOR_ID_LENGTH) continue;
    setRecordValue(connectorIds, serverName, serverName);
    usedIds.add(serverName);
  }
  for (const serverName of serverNames) {
    if (codePointLength(serverName) <= MAX_AGENT_CONNECTOR_ID_LENGTH) continue;
    let attempt = 0;
    let connectorId: string;
    do {
      connectorId = createBoundedConnectorId(serverName, attempt++);
    } while (usedIds.has(connectorId));
    setRecordValue(connectorIds, serverName, connectorId);
    usedIds.add(connectorId);
  }
  return connectorIds;
}

function createBoundedConnectorId(serverName: string, attempt: number): string {
  const hashInput = attempt === 0 ? serverName : `${serverName}:${attempt}`;
  const hash = createHash("sha256")
    .update(hashInput)
    .digest("hex")
    .slice(0, CONNECTOR_ID_HASH_LENGTH);
  const suffix = `-${hash}`;
  return `${sliceCodePoints(serverName, MAX_AGENT_CONNECTOR_ID_LENGTH - suffix.length)}${suffix}`;
}

function createAuthorizationReferenceId(pluginName: string, serverName: string): string {
  const referenceId = `${pluginName}-${serverName}-auth`;
  if (codePointLength(referenceId) <= MAX_AUTHORIZATION_REFERENCE_ID_LENGTH) return referenceId;

  const hash = createHash("sha256")
    .update(referenceId)
    .digest("hex")
    .slice(0, AUTHORIZATION_REFERENCE_HASH_LENGTH);
  const suffix = `-${hash}-auth`;
  return `${sliceCodePoints(referenceId, MAX_AUTHORIZATION_REFERENCE_ID_LENGTH - suffix.length)}${suffix}`;
}

function codePointLength(value: string): number {
  return [...value].length;
}

function sliceCodePoints(value: string, end: number): string {
  return [...value].slice(0, end).join("");
}

function truncateConnectorText(value: string, maxLength: number): string {
  const codePoints = [...value];
  if (codePoints.length <= maxLength) return value;
  return codePoints.slice(0, maxLength).join("").trimEnd();
}

function isSecureHttpUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveAuthType(
  serverName: string,
  defaultAuth: "Auto" | AuthorizationType,
  resolvedAuthTypes: Readonly<Record<string, ConnectorAuthorizationType>>
): ConnectorAuthorizationType {
  if (defaultAuth !== "Auto") {
    return defaultAuth;
  }
  const resolved = resolvedAuthTypes[serverName];
  if (!resolved) {
    throw new Error(`Missing resolved auth type for MCP server '${serverName}'.`);
  }
  return resolved;
}
