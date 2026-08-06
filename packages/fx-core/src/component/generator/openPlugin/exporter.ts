// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, FxError, ok, Result, SystemError, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import {
  ATK_EXTENSION_NAMESPACE,
  DEFAULT_REMOTE_MCP_TYPE,
  MCP_CONFIG_FILE,
  MCP_SCHEMA_URL,
  normalizePluginName,
  PLUGIN_MANIFEST_FILE,
  PLUGIN_SCHEMA_URL,
} from "./spec";
import { AtkAgentConnectorExt, AtkExtensionBlock, AuthorizationType, ExportInputs } from "./types";

export const OPEN_PLUGIN_EXPORT_SOURCE = "OpenPluginExport";

export interface ExportResult {
  /** Absolute path to the generated Agent Plugin directory. */
  outputPath: string;
  warnings: string[];
}

/**
 * Export an ATK project (folder containing appPackage/manifest.json plus the
 * usual agentSkills/agentConnectors layout) into an Agent Plugins v1.0.0
 * directory (https://agent-plugins.org/). The output is structured so that
 * `atk import agentplugin --path <output>` reconstructs an equivalent ATK
 * project; fields with no native Agent Plugins equivalent are preserved
 * verbatim under `extensions["com.microsoft.agents-toolkit"]` in plugin.json.
 *
 * Output is always spec-compliant 1.0.0: plugin.json in the plugin root, and
 * mcp.json (not .mcp.json) for MCP servers.
 */
export async function exportOpenPlugin(
  inputs: ExportInputs
): Promise<Result<ExportResult, FxError>> {
  try {
    if (!inputs.path) {
      return err(
        new UserError(OPEN_PLUGIN_EXPORT_SOURCE, "MissingProjectPath", "--path is required.")
      );
    }
    const projectRoot = path.resolve(inputs.path);
    const appPackageDir = path.join(projectRoot, "appPackage");
    const manifestPath = path.join(appPackageDir, "manifest.json");
    if (!(await fs.pathExists(manifestPath))) {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "ManifestNotFound",
          `appPackage/manifest.json not found under ${projectRoot}.`
        )
      );
    }

    const manifestRaw = await fs.readJSON(manifestPath);
    if (!manifestRaw || typeof manifestRaw !== "object" || Array.isArray(manifestRaw)) {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidManifest",
          `appPackage/manifest.json is not a JSON object: ${manifestPath}.`
        )
      );
    }
    const manifest = manifestRaw as TeamsLikeManifest;
    const warnings: string[] = [];
    if (inputs.manifestKind && inputs.manifestKind !== "open-plugin") {
      warnings.push(
        `--manifest-kind '${inputs.manifestKind}' is ignored. Agent Plugins 1.0.0 mandates ` +
          `'${PLUGIN_MANIFEST_FILE}' in the plugin root, so alternate manifest locations are no ` +
          `longer emitted.`
      );
    }

    const pluginName = derivePluginName(manifest);
    const defaultOutput = path.join(process.cwd(), `${pluginName}-agentplugin`);
    const outputPath = path.resolve(inputs.output ?? defaultOutput);

    if (await fs.pathExists(outputPath)) {
      const entries = await fs.readdir(outputPath);
      if (entries.length > 0) {
        return err(
          new UserError(
            OPEN_PLUGIN_EXPORT_SOURCE,
            "OutputDirectoryNotEmpty",
            `Output directory is not empty: ${outputPath}. Choose a different --output path or empty the directory.`
          )
        );
      }
    }
    await fs.ensureDir(outputPath);

    const pluginJson = buildPluginJson(manifest, pluginName);
    const manifestOut = path.join(outputPath, PLUGIN_MANIFEST_FILE);
    await fs.writeJSON(manifestOut, pluginJson, { spaces: 2 });

    await writeMcpJson(outputPath, manifest, warnings);
    await copySkills(outputPath, appPackageDir, manifest, warnings);
    await copyCommands(outputPath, appPackageDir, warnings);
    await copyIcons(outputPath, appPackageDir, warnings);

    return ok({ outputPath, warnings });
  } catch (e) {
    if (e instanceof UserError || e instanceof SystemError) {
      return err(e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return err(
      new SystemError({
        source: OPEN_PLUGIN_EXPORT_SOURCE,
        name: "ExportOpenPluginFailed",
        message,
        displayMessage: message,
      })
    );
  }
}

interface TeamsLikeManifest {
  $schema?: string;
  manifestVersion?: string;
  version?: string;
  id?: string;
  packageName?: string;
  accentColor?: string;
  developer?: {
    name?: string;
    websiteUrl?: string;
    privacyUrl?: string;
    termsOfUseUrl?: string;
  };
  name?: { short?: string; full?: string };
  description?: { short?: string; full?: string };
  icons?: { color?: string; outline?: string };
  agentSkills?: Array<{ folder?: string }>;
  agentConnectors?: Array<{
    id?: string;
    displayName?: string;
    description?: string;
    toolSource?: {
      remoteMcpServer?: {
        mcpServerUrl?: string;
        authorization?: { type?: string; referenceId?: string };
      };
    };
  }>;
}

/**
 * Derive a plugin name that satisfies the Agent Plugins 1.0.0 `name`
 * constraint (1-64 chars, `^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`).
 */
function derivePluginName(manifest: TeamsLikeManifest): string {
  const short = manifest.name?.short?.trim();
  const full = manifest.name?.full?.trim();
  const fromName = short ?? full ?? "";
  const slug = normalizePluginName(fromName, "");
  if (slug) return slug;
  if (manifest.packageName) {
    const last = manifest.packageName.split(".").pop();
    const fromPackage = normalizePluginName(last ?? "", "");
    if (fromPackage) return fromPackage;
  }
  return "exported-plugin";
}

function buildPluginJson(manifest: TeamsLikeManifest, pluginName: string): Record<string, unknown> {
  const author: Record<string, unknown> = {};
  if (manifest.developer?.name) author.name = manifest.developer.name;
  if (manifest.developer?.websiteUrl) author.url = manifest.developer.websiteUrl;

  // Key order mirrors the published schema: $schema and name first.
  const pluginJson: Record<string, unknown> = {
    $schema: PLUGIN_SCHEMA_URL,
    name: pluginName,
    version: manifest.version ?? "1.0.0",
    description: manifest.description?.full ?? manifest.description?.short ?? pluginName,
  };
  if (Object.keys(author).length > 0) {
    pluginJson.author = author;
  }
  if (manifest.developer?.websiteUrl) {
    pluginJson.homepage = manifest.developer.websiteUrl;
  }

  const extension: AtkExtensionBlock = {};
  if (manifest.manifestVersion) extension.manifestVersion = manifest.manifestVersion;
  if (manifest.id) extension.id = manifest.id;
  if (manifest.packageName) extension.packageName = manifest.packageName;
  if (manifest.accentColor) extension.accentColor = manifest.accentColor;
  if (manifest.developer) {
    const dev: NonNullable<AtkExtensionBlock["developer"]> = {};
    if (manifest.developer.name) dev.name = manifest.developer.name;
    if (manifest.developer.websiteUrl) dev.websiteUrl = manifest.developer.websiteUrl;
    if (manifest.developer.privacyUrl) dev.privacyUrl = manifest.developer.privacyUrl;
    if (manifest.developer.termsOfUseUrl) dev.termsOfUseUrl = manifest.developer.termsOfUseUrl;
    if (Object.keys(dev).length > 0) extension.developer = dev;
  }
  if (manifest.name?.short || manifest.name?.full) {
    extension.name = {};
    if (manifest.name.short) extension.name.short = manifest.name.short;
    if (manifest.name.full) extension.name.full = manifest.name.full;
  }
  if (manifest.description?.short || manifest.description?.full) {
    extension.description = {};
    if (manifest.description.short) extension.description.short = manifest.description.short;
    if (manifest.description.full) extension.description.full = manifest.description.full;
  }

  const connectorOverrides: Record<string, AtkAgentConnectorExt> = {};
  for (const connector of manifest.agentConnectors ?? []) {
    if (!connector.id) continue;
    const override: AtkAgentConnectorExt = {};
    if (connector.displayName) override.displayName = connector.displayName;
    if (connector.description) override.description = connector.description;
    const auth = connector.toolSource?.remoteMcpServer?.authorization;
    if (auth?.type && isAuthorizationType(auth.type)) {
      override.authorization = { type: auth.type };
      if (auth.referenceId) override.authorization.referenceId = auth.referenceId;
    }
    if (Object.keys(override).length > 0) {
      connectorOverrides[connector.id] = override;
    }
  }
  if (Object.keys(connectorOverrides).length > 0) {
    extension.agentConnectors = connectorOverrides;
  }

  // Agent Plugins 1.0.0 closes the manifest schema (additionalProperties:
  // false), so client data must be namespaced under `extensions` rather than
  // written to a top-level `x-...` key.
  if (Object.keys(extension).length > 0) {
    pluginJson.extensions = { [ATK_EXTENSION_NAMESPACE]: extension };
  }
  return pluginJson;
}

function isAuthorizationType(value: string): value is AuthorizationType {
  return value === "None" || value === "OAuthPluginVault" || value === "ApiKeyPluginVault";
}

async function writeMcpJson(
  outputPath: string,
  manifest: TeamsLikeManifest,
  warnings: string[]
): Promise<void> {
  const servers: Record<string, { type: string; url: string }> = {};
  for (const connector of manifest.agentConnectors ?? []) {
    const remote = connector.toolSource?.remoteMcpServer;
    const id = connector.id;
    if (!id || !remote?.mcpServerUrl) {
      warnings.push(
        `Skipping connector '${
          connector.id ?? "(unnamed)"
        }' during export: only remoteMcpServer connectors with a URL are supported.`
      );
      continue;
    }
    // "http" is not an Agent Plugins transport; 1.0.0 defines stdio,
    // streamable-http and (legacy) sse.
    servers[id] = { type: DEFAULT_REMOTE_MCP_TYPE, url: remote.mcpServerUrl };
  }
  if (Object.keys(servers).length === 0) {
    return;
  }
  await fs.writeJSON(
    path.join(outputPath, MCP_CONFIG_FILE),
    { $schema: MCP_SCHEMA_URL, mcpServers: servers },
    { spaces: 2 }
  );
}

async function copySkills(
  outputPath: string,
  appPackageDir: string,
  manifest: TeamsLikeManifest,
  warnings: string[]
): Promise<void> {
  const skillsRefs = manifest.agentSkills ?? [];
  if (skillsRefs.length === 0) {
    return;
  }
  const destRoot = path.join(outputPath, "skills");
  await fs.ensureDir(destRoot);
  for (const skill of skillsRefs) {
    if (!skill.folder) continue;
    const rel = skill.folder.replace(/^\.\//, "");
    const src = path.resolve(appPackageDir, rel);
    const relativeToPackage = path.relative(appPackageDir, src);
    if (relativeToPackage.startsWith("..") || path.isAbsolute(relativeToPackage)) {
      warnings.push(`Skill folder '${skill.folder}' resolves outside appPackage; skipped.`);
      continue;
    }
    if (!(await fs.pathExists(src))) {
      warnings.push(`Skill folder referenced by manifest not found on disk: ${skill.folder}`);
      continue;
    }
    const name = path.basename(rel);
    await fs.copy(src, path.join(destRoot, name));
  }
}

async function copyCommands(
  outputPath: string,
  appPackageDir: string,
  _warnings: string[]
): Promise<void> {
  const src = path.join(appPackageDir, "commands");
  if (!(await fs.pathExists(src))) return;
  await fs.copy(src, path.join(outputPath, "commands"));
}

async function copyIcons(
  outputPath: string,
  appPackageDir: string,
  warnings: string[]
): Promise<void> {
  for (const icon of ["color.png", "outline.png"]) {
    const src = path.join(appPackageDir, icon);
    if (await fs.pathExists(src)) {
      await fs.copy(src, path.join(outputPath, icon));
    } else {
      warnings.push(`Icon file not found in appPackage: ${icon}`);
    }
  }
}
