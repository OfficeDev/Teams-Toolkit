// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";
import { parseAuthor } from "./authorParser";
import { deterministicAppId } from "./deterministicId";
import { toTitleCaseFromKebab, truncateAtWordBoundary } from "./textUtils";
import {
  AuthorizationType,
  AtkAgentConnectorExt,
  AtkExtensionBlock,
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

export function validateMcpServerCount(mcpServers: Record<string, OpenPluginMcpServerEntry>): void {
  const connectorCount = Object.values(mcpServers).filter(
    (server) => typeof server.url === "string" && server.url.trim().length > 0
  ).length;
  if (connectorCount > MAX_AGENT_CONNECTORS) {
    throw new Error(
      `Too many MCP servers: ${connectorCount}. The manifest caps agentConnectors at ${MAX_AGENT_CONNECTORS}.`
    );
  }
}

export function mapToTtkProject(
  parsed: ParsedOpenPlugin,
  inputs: ImportInputs,
  resolvedAuthTypes: Readonly<Record<string, AuthorizationType>> = {}
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

  const author = parseAuthor(pj.author);
  const websiteUrl = inputs.websiteUrl ?? ext.developer?.websiteUrl ?? pj.homepage ?? author.url;
  if (!websiteUrl) {
    throw new Error(
      "developer.websiteUrl could not be resolved. Set 'homepage' in plugin.json, 'author.url', or pass --website-url."
    );
  }
  const privacyUrl = inputs.privacyUrl ?? ext.developer?.privacyUrl;
  if (!privacyUrl) {
    throw new Error(
      "developer.privacyUrl is required. Pass --privacy-url (Open Plugin spec has no equivalent field)."
    );
  }
  const termsUrl = inputs.termsUrl ?? ext.developer?.termsOfUseUrl;
  if (!termsUrl) {
    throw new Error(
      "developer.termsOfUseUrl is required. Pass --terms-url (Open Plugin spec has no equivalent field)."
    );
  }

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
    name: ext.developer?.name ?? author.name ?? "Unknown",
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
      });
    }
  }
  if (parsed.commandsRoot && parsed.commands.length > 0) {
    copyOps.push({
      src: parsed.commandsRoot,
      destRelative: "appPackage/commands",
    });
  }

  return { manifest, copyOps, warnings };
}

function buildAgentConnectors(
  mcpServers: Record<string, OpenPluginMcpServerEntry>,
  pluginName: string,
  defaultAuth: "Auto" | AuthorizationType,
  extOverrides: Record<string, AtkAgentConnectorExt> | undefined,
  warnings: string[],
  resolvedAuthTypes: Readonly<Record<string, AuthorizationType>>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const serverNames = Object.keys(mcpServers).sort();
  for (const name of serverNames) {
    const server = mcpServers[name];
    const url = typeof server.url === "string" ? server.url.trim() : "";
    if (!url) {
      warnings.push(
        `Skipping MCP server '${name}': no URL found (stdio servers require manual localMcpServer configuration).`
      );
      continue;
    }
    const override = extOverrides?.[name];
    const authType: AuthorizationType =
      override?.authorization?.type ?? resolveAuthType(name, defaultAuth, resolvedAuthTypes);
    const authorization: Record<string, unknown> = { type: authType };
    if (authType !== "None") {
      authorization.referenceId =
        override?.authorization?.referenceId ?? `${pluginName}-${name}-auth`;
    }
    const description =
      override?.description ??
      (typeof server.description === "string" && server.description
        ? server.description
        : `Remote MCP server providing tools for ${pluginName}`);
    out.push({
      id: name,
      displayName: override?.displayName ?? `${name} MCP Server`,
      description,
      toolSource: {
        remoteMcpServer: {
          mcpServerUrl: url,
          authorization,
        },
      },
    });
  }
  return out;
}

function resolveAuthType(
  serverName: string,
  defaultAuth: "Auto" | AuthorizationType,
  resolvedAuthTypes: Readonly<Record<string, AuthorizationType>>
): AuthorizationType {
  if (defaultAuth !== "Auto") {
    return defaultAuth;
  }
  const resolved = resolvedAuthTypes[serverName];
  if (!resolved) {
    throw new Error(`Missing resolved auth type for MCP server '${serverName}'.`);
  }
  return resolved;
}
