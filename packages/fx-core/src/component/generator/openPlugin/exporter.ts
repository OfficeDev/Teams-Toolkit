// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, FxError, ok, Result, SystemError, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import { isValidHttpUrl } from "../../../common/stringUtils";
import {
  copyDirectoryWithoutSymbolicLinks,
  inspectPathWithinRoot,
  hasLinkedPathSegment,
  resolvePluginRoot,
} from "./fileSystem";
import { OpenPluginInputError } from "./errors";
import { getAgentSkillValidationError } from "./skillValidation";
import {
  ATK_EXTENSION_NAMESPACE,
  DEFAULT_REMOTE_MCP_TYPE,
  MCP_CONFIG_FILE,
  MCP_SCHEMA_URL,
  normalizePluginName,
  PLUGIN_MANIFEST_FILE,
  PLUGIN_SCHEMA_URL,
} from "./spec";
import {
  AtkAgentConnectorExt,
  AtkExtensionBlock,
  ConnectorAuthorizationType,
  ExportInputs,
} from "./types";
import { getRemoteMcpUrlError, isRecord, parseAgentPluginManifest } from "./validation";

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
    const projectRoot = await resolvePluginRoot(inputs.path);
    const inspectedAppPackage = await inspectPathWithinRoot(projectRoot, "appPackage", "directory");
    if (inspectedAppPackage.status === "outside" || inspectedAppPackage.status === "wrong-kind") {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidProjectStructure",
          "appPackage must be a directory contained within the project root."
        )
      );
    }
    if (inspectedAppPackage.status === "missing") {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "ManifestNotFound",
          `appPackage/manifest.json not found under ${projectRoot}.`
        )
      );
    }
    const appPackageDir = inspectedAppPackage.path;
    const inspectedManifest = await inspectPathWithinRoot(
      projectRoot,
      path.relative(projectRoot, path.join(appPackageDir, "manifest.json")),
      "file"
    );
    if (inspectedManifest.status === "outside" || inspectedManifest.status === "wrong-kind") {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidProjectStructure",
          "appPackage/manifest.json must be a regular file contained within the project root."
        )
      );
    }
    if (inspectedManifest.status === "missing") {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "ManifestNotFound",
          `appPackage/manifest.json not found under ${projectRoot}.`
        )
      );
    }
    const manifestPath = inspectedManifest.path;

    const manifestRaw: unknown = await fs.readJSON(manifestPath);
    if (!isRecord(manifestRaw)) {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidManifest",
          `appPackage/manifest.json is not a JSON object: ${manifestPath}.`
        )
      );
    }
    if (manifestRaw.version !== undefined && typeof manifestRaw.version !== "string") {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidAgentPluginManifest",
          "Cannot export an Agent Plugins 1.0.0 manifest: version must be a string."
        )
      );
    }
    const parsedManifest = parseTeamsLikeManifest(manifestRaw);
    if (typeof parsedManifest === "string") {
      return err(new UserError(OPEN_PLUGIN_EXPORT_SOURCE, "InvalidManifest", parsedManifest));
    }
    const manifest = parsedManifest;
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

    if (await hasLinkedPathSegment(outputPath)) {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidOutputPath",
          `Output path must not be a symbolic link or junction: ${outputPath}.`
        )
      );
    }

    const invalidDeveloperUrl = validateDeveloperUrls(manifest);
    if (invalidDeveloperUrl) return err(invalidDeveloperUrl);
    const pluginJson = buildPluginJson(manifest, pluginName);
    try {
      parseAgentPluginManifest(pluginJson);
    } catch (error) {
      if (!(error instanceof OpenPluginInputError)) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "InvalidAgentPluginManifest",
          `Cannot export an Agent Plugins 1.0.0 manifest: ${detail}`
        )
      );
    }
    const invalidMcpUrl = validateRemoteMcpUrls(manifest);
    if (invalidMcpUrl) return err(invalidMcpUrl);
    const destinationCollision = validateExportDestinationKeys(manifest);
    if (destinationCollision) return err(destinationCollision);

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
    if (e instanceof OpenPluginInputError) {
      return err(
        new UserError(OPEN_PLUGIN_EXPORT_SOURCE, "InvalidProjectPath", e.message, e.message)
      );
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

function parseTeamsLikeManifest(value: Record<string, unknown>): TeamsLikeManifest | string {
  const manifest: TeamsLikeManifest = {};
  const schema = readOptionalString(value, "$schema");
  const manifestVersion = readOptionalString(value, "manifestVersion");
  const version = readOptionalString(value, "version");
  const id = readOptionalString(value, "id");
  const packageName = readOptionalString(value, "packageName");
  const accentColor = readOptionalString(value, "accentColor");
  for (const parsed of [schema, manifestVersion, version, id, packageName, accentColor]) {
    if (parsed && typeof parsed !== "string") return parsed.message;
  }
  if (typeof schema === "string") manifest.$schema = schema;
  if (typeof manifestVersion === "string") manifest.manifestVersion = manifestVersion;
  if (typeof version === "string") manifest.version = version;
  if (typeof id === "string") manifest.id = id;
  if (typeof packageName === "string") manifest.packageName = packageName;
  if (typeof accentColor === "string") manifest.accentColor = accentColor;

  const developer = parseStringObject(value.developer, "developer", [
    "name",
    "websiteUrl",
    "privacyUrl",
    "termsOfUseUrl",
  ]);
  if (typeof developer === "string") return developer;
  if (developer) manifest.developer = developer;

  const name = parseTextPair(value.name, "name");
  if (typeof name === "string") return name;
  if (name) manifest.name = name;

  const description = parseTextPair(value.description, "description");
  if (typeof description === "string") return description;
  if (description) manifest.description = description;

  if (value.agentSkills !== undefined) {
    if (!Array.isArray(value.agentSkills)) return "manifest 'agentSkills' must be an array.";
    const agentSkills: Array<{ folder?: string }> = [];
    for (const [index, rawSkill] of value.agentSkills.entries()) {
      if (!isRecord(rawSkill)) return `manifest 'agentSkills[${index}]' must be an object.`;
      const folder = readOptionalString(rawSkill, "folder");
      if (folder && typeof folder !== "string") return folder.message;
      agentSkills.push(folder ? { folder } : {});
    }
    manifest.agentSkills = agentSkills;
  }

  if (value.agentConnectors !== undefined) {
    if (!Array.isArray(value.agentConnectors)) {
      return "manifest 'agentConnectors' must be an array.";
    }
    const agentConnectors: NonNullable<TeamsLikeManifest["agentConnectors"]> = [];
    for (const [index, rawConnector] of value.agentConnectors.entries()) {
      const parsedConnector = parseAgentConnector(rawConnector, index);
      if (typeof parsedConnector === "string") return parsedConnector;
      agentConnectors.push(parsedConnector);
    }
    manifest.agentConnectors = agentConnectors;
  }
  return manifest;
}

interface InvalidStringField {
  message: string;
}

function readOptionalString(
  record: Record<string, unknown>,
  field: string
): string | InvalidStringField | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") return { message: `manifest '${field}' must be a string.` };
  return value;
}

function parseStringObject<T extends string>(
  value: unknown,
  field: string,
  fields: readonly T[]
): Partial<Record<T, string>> | string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return `manifest '${field}' must be an object.`;
  const parsed: Partial<Record<T, string>> = {};
  for (const item of fields) {
    const result = readOptionalString(value, item);
    if (result && typeof result !== "string") {
      return `manifest '${field}.${item}' must be a string.`;
    }
    if (typeof result === "string") parsed[item] = result;
  }
  return parsed;
}

function parseTextPair(
  value: unknown,
  field: "name" | "description"
): { short?: string; full?: string } | string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return `manifest '${field}' must be an object.`;
  const pair: { short?: string; full?: string } = {};
  const short = readOptionalString(value, "short");
  const full = readOptionalString(value, "full");
  if (short && typeof short !== "string") return `manifest '${field}.short' must be a string.`;
  if (full && typeof full !== "string") return `manifest '${field}.full' must be a string.`;
  if (typeof short === "string") pair.short = short;
  if (typeof full === "string") pair.full = full;
  return pair;
}

function parseAgentConnector(
  value: unknown,
  index: number
): NonNullable<TeamsLikeManifest["agentConnectors"]>[number] | string {
  if (!isRecord(value)) return `manifest 'agentConnectors[${index}]' must be an object.`;
  const connector: NonNullable<TeamsLikeManifest["agentConnectors"]>[number] = {};
  const id = readOptionalString(value, "id");
  const displayName = readOptionalString(value, "displayName");
  const description = readOptionalString(value, "description");
  for (const parsed of [id, displayName, description]) {
    if (parsed && typeof parsed !== "string") return parsed.message;
  }
  if (typeof id === "string") connector.id = id;
  if (typeof displayName === "string") connector.displayName = displayName;
  if (typeof description === "string") connector.description = description;
  if (value.toolSource === undefined) return connector;
  if (!isRecord(value.toolSource))
    return `manifest 'agentConnectors[${index}].toolSource' must be an object.`;
  connector.toolSource = {};
  if (value.toolSource.remoteMcpServer === undefined) return connector;
  if (!isRecord(value.toolSource.remoteMcpServer)) {
    return `manifest 'agentConnectors[${index}].toolSource.remoteMcpServer' must be an object.`;
  }
  const remote: NonNullable<NonNullable<typeof connector.toolSource>["remoteMcpServer"]> = {};
  const serverUrl = readOptionalString(value.toolSource.remoteMcpServer, "mcpServerUrl");
  if (serverUrl && typeof serverUrl !== "string") return serverUrl.message;
  if (typeof serverUrl === "string") remote.mcpServerUrl = serverUrl;
  const rawAuthorization = value.toolSource.remoteMcpServer.authorization;
  if (rawAuthorization !== undefined) {
    if (!isRecord(rawAuthorization)) {
      return `manifest 'agentConnectors[${index}].toolSource.remoteMcpServer.authorization' must be an object.`;
    }
    const type = readOptionalString(rawAuthorization, "type");
    const referenceId = readOptionalString(rawAuthorization, "referenceId");
    if (type && typeof type !== "string") return type.message;
    if (referenceId && typeof referenceId !== "string") return referenceId.message;
    remote.authorization = {};
    if (typeof type === "string") remote.authorization.type = type;
    if (typeof referenceId === "string") remote.authorization.referenceId = referenceId;
  }
  connector.toolSource.remoteMcpServer = remote;
  return connector;
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

function isAuthorizationType(value: string): value is ConnectorAuthorizationType {
  return (
    value === "None" ||
    value === "OAuthPluginVault" ||
    value === "ApiKeyPluginVault" ||
    value === "DynamicClientRegistration" ||
    value === "AzureKeyVault"
  );
}

function validateExportDestinationKeys(manifest: TeamsLikeManifest): UserError | undefined {
  const connectorIds = new Set<string>();
  for (const connector of manifest.agentConnectors ?? []) {
    if (!connector.id) continue;
    if (connectorIds.has(connector.id)) {
      return new UserError(
        OPEN_PLUGIN_EXPORT_SOURCE,
        "InvalidManifest",
        `Duplicate connector id '${connector.id}' cannot be exported.`
      );
    }
    connectorIds.add(connector.id);
  }

  const skillNames = new Set<string>();
  for (const skill of manifest.agentSkills ?? []) {
    if (!skill.folder) continue;
    const name = path.basename(skill.folder.replace(/^\.\//, "")).toLowerCase();
    if (skillNames.has(name)) {
      return new UserError(
        OPEN_PLUGIN_EXPORT_SOURCE,
        "InvalidManifest",
        `Multiple Agent Skills resolve to the export destination '${name}'.`
      );
    }
    skillNames.add(name);
  }
  return undefined;
}

function validateRemoteMcpUrls(manifest: TeamsLikeManifest): UserError | undefined {
  for (const connector of manifest.agentConnectors ?? []) {
    const url = connector.toolSource?.remoteMcpServer?.mcpServerUrl;
    if (url === undefined) continue;
    const validationError = getRemoteMcpUrlError(url);
    if (validationError) {
      return new UserError(
        OPEN_PLUGIN_EXPORT_SOURCE,
        "InvalidMcpServerUrl",
        `Connector '${connector.id ?? "(unnamed)"}' cannot be exported: ${validationError}`
      );
    }
  }
  return undefined;
}

function validateDeveloperUrls(manifest: TeamsLikeManifest): UserError | undefined {
  const urls: Array<[string, string | undefined]> = [
    ["websiteUrl", manifest.developer?.websiteUrl],
    ["privacyUrl", manifest.developer?.privacyUrl],
    ["termsOfUseUrl", manifest.developer?.termsOfUseUrl],
  ];
  for (const [field, value] of urls) {
    if (value !== undefined && !isValidHttpUrl(value)) {
      return new UserError(
        OPEN_PLUGIN_EXPORT_SOURCE,
        "InvalidManifest",
        `Developer '${field}' must be a valid HTTP(S) URL.`
      );
    }
  }
  return undefined;
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
  const trustedAppPackageDir = appPackageDir;
  for (const skill of skillsRefs) {
    if (!skill.folder) continue;
    const rel = skill.folder.replace(/^\.\//, "");
    const inspectedSkill = await inspectPathWithinRoot(trustedAppPackageDir, rel, "directory");
    if (inspectedSkill.status === "outside") {
      warnings.push(`Skill folder '${skill.folder}' resolves outside appPackage; skipped.`);
      continue;
    }
    if (inspectedSkill.status === "missing") {
      warnings.push(`Skill folder referenced by manifest not found on disk: ${skill.folder}`);
      continue;
    }
    if (inspectedSkill.status === "wrong-kind") {
      warnings.push(`Skill folder '${skill.folder}' is not a directory; skipped.`);
      continue;
    }
    const name = path.basename(rel);
    const skillMd = await inspectPathWithinRoot(
      trustedAppPackageDir,
      path.relative(trustedAppPackageDir, path.join(inspectedSkill.path, "SKILL.md")),
      "file"
    );
    if (skillMd.status !== "ok") {
      warnings.push(`Skill folder '${skill.folder}' does not contain a safe SKILL.md; skipped.`);
      continue;
    }
    const validationError = await getAgentSkillValidationError(name, skillMd.path);
    if (validationError) {
      warnings.push(`Skill folder '${skill.folder}' is invalid: ${validationError}; skipped.`);
      continue;
    }
    await copyDirectoryWithoutSymbolicLinks(
      inspectedSkill.path,
      path.join(destRoot, name),
      (relativePath, resolvesOutside) => {
        warnings.push(
          `Skipped symbolic link '${relativePath}' while exporting skill '${name}'${
            resolvesOutside ? " because it resolves outside the skill root" : ""
          }.`
        );
      }
    );
  }
}

async function copyCommands(
  outputPath: string,
  appPackageDir: string,
  warnings: string[]
): Promise<void> {
  const trustedAppPackageDir = appPackageDir;
  const inspectedCommands = await inspectPathWithinRoot(
    trustedAppPackageDir,
    "commands",
    "directory"
  );
  if (inspectedCommands.status === "outside") {
    warnings.push("Commands directory resolves outside appPackage; skipped.");
    return;
  }
  if (inspectedCommands.status === "wrong-kind") {
    warnings.push("Commands path is not a directory; skipped.");
    return;
  }
  if (inspectedCommands.status === "missing") return;
  const entries = await fs.readdir(inspectedCommands.path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      const linkedCommand = await inspectPathWithinRoot(
        trustedAppPackageDir,
        path.relative(trustedAppPackageDir, path.join(inspectedCommands.path, entry.name)),
        "file"
      );
      warnings.push(
        linkedCommand.status === "outside"
          ? `Command '${entry.name}' resolves outside appPackage; skipped.`
          : `Command '${entry.name}' is a symbolic link; skipped.`
      );
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    const command = await inspectPathWithinRoot(
      trustedAppPackageDir,
      path.relative(trustedAppPackageDir, path.join(inspectedCommands.path, entry.name)),
      "file"
    );
    if (command.status === "outside") {
      warnings.push(`Command '${entry.name}' resolves outside appPackage; skipped.`);
    } else if (command.status === "ok") {
      const destination = path.join(outputPath, "commands", entry.name);
      await fs.ensureDir(path.dirname(destination));
      await fs.copy(command.path, destination);
    }
  }
}

async function copyIcons(
  outputPath: string,
  appPackageDir: string,
  warnings: string[]
): Promise<void> {
  const trustedAppPackageDir = appPackageDir;
  for (const icon of ["color.png", "outline.png"]) {
    const inspectedIcon = await inspectPathWithinRoot(trustedAppPackageDir, icon, "file");
    if (inspectedIcon.status === "ok") {
      await fs.copy(inspectedIcon.path, path.join(outputPath, icon));
    } else if (inspectedIcon.status === "missing") {
      warnings.push(`Icon file not found in appPackage: ${icon}`);
    } else if (inspectedIcon.status === "outside") {
      warnings.push(`Icon file '${icon}' resolves outside appPackage; skipped.`);
    } else {
      warnings.push(`Icon path '${icon}' is not a regular file; skipped.`);
    }
  }
}
