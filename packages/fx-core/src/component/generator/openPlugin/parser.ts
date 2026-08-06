// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as path from "path";
import {
  ATK_EXTENSION_NAMESPACE,
  isSupportedMcpServerType,
  isValidPluginName,
  LEGACY_ATK_EXTENSION_KEY,
  LEGACY_MANIFEST_LOCATIONS,
  LEGACY_MCP_CONFIG_FILE,
  MCP_CONFIG_FILE,
  MCP_SERVER_TYPES,
  PLUGIN_MANIFEST_FILE,
  PLUGIN_NAME_MAX_LENGTH,
  PLUGIN_SCHEMA_URL,
  resolveWithinRoot,
} from "./spec";
import {
  AtkExtensionBlock,
  OpenPluginManifest,
  OpenPluginMcpJson,
  OpenPluginMcpServerEntry,
  ParsedManifestKind,
  ParsedOpenPlugin,
} from "./types";

interface ManifestLocation {
  relPath: string;
  kind: ParsedManifestKind;
  legacy: boolean;
}

/**
 * Agent Plugins 1.0.0 mandates plugin.json in the plugin root. The pre-1.0.0
 * locations are probed afterwards so older directories keep importing.
 */
const MANIFEST_LOCATIONS: ManifestLocation[] = [
  { relPath: PLUGIN_MANIFEST_FILE, kind: "agent-plugin", legacy: false },
  ...LEGACY_MANIFEST_LOCATIONS.map((l) => ({ ...l, legacy: true })),
];

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-_]*$/;

/**
 * Component-relocation fields. Agent Plugins 1.0.0 removed these — component
 * locations are fixed and the manifest cannot override them. Honoured only for
 * pre-1.0.0 layouts.
 */
const RELOCATION_FIELDS: Array<keyof OpenPluginManifest> = [
  "skills",
  "commands",
  "mcpServers",
  "agents",
  "hooks",
  "rules",
  "lspServers",
  "outputStyles",
];

const UNMAPPED_FIELDS: Array<keyof OpenPluginManifest> = [
  "agents",
  "hooks",
  "rules",
  "lspServers",
  "outputStyles",
];

function requireStringPathOverride(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(
    `Plugin manifest '${field}' override is set to a non-string value. Only the single-string form ` +
      `(e.g. \"${field}\": \"./custom/path\") is supported by this converter today.`
  );
}

/**
 * Resolve a component location. Agent Plugins 1.0.0 fixes component paths, so
 * manifest overrides are ignored (with a warning) for 1.0.0 layouts. Either
 * way the result must stay inside the plugin root.
 */
function resolveComponentPath(
  absRoot: string,
  override: string | undefined,
  fixedRel: string,
  field: string,
  isLegacyLayout: boolean,
  warnings: string[]
): string | undefined {
  let rel = fixedRel;
  if (override !== undefined) {
    if (isLegacyLayout) {
      rel = override;
    } else {
      warnings.push(
        `plugin.json '${field}' relocates a component, which Agent Plugins 1.0.0 no longer permits. ` +
          `Using the fixed location '${fixedRel}' instead.`
      );
    }
  }
  const resolved = resolveWithinRoot(absRoot, rel);
  if (!resolved) {
    warnings.push(
      `'${field}' path '${rel}' resolves outside the plugin root and was rejected for safety.`
    );
    return undefined;
  }
  return resolved;
}

export async function readOpenPluginDir(root: string): Promise<ParsedOpenPlugin> {
  const warnings: string[] = [];
  const absRoot = path.resolve(root);
  if (!(await fs.pathExists(absRoot))) {
    throw new Error(`Plugin directory not found: ${absRoot}`);
  }

  // 1. Probe manifest locations: spec location first, then pre-1.0.0 layouts.
  let manifestPath: string | undefined;
  let manifestKind: ParsedManifestKind | undefined;
  let isLegacyLayout = false;
  for (const loc of MANIFEST_LOCATIONS) {
    const candidate = path.join(absRoot, loc.relPath);
    if (await fs.pathExists(candidate)) {
      manifestPath = candidate;
      manifestKind = loc.kind;
      isLegacyLayout = loc.legacy;
      break;
    }
  }
  if (!manifestPath || !manifestKind) {
    throw new Error(
      `No plugin manifest found in ${absRoot}. Agent Plugins 1.0.0 requires '${PLUGIN_MANIFEST_FILE}' ` +
        `in the plugin root. Also looked for: ` +
        LEGACY_MANIFEST_LOCATIONS.map((l) => l.relPath).join(", ")
    );
  }
  if (isLegacyLayout) {
    warnings.push(
      `Manifest found at '${path.relative(absRoot, manifestPath)}'. Agent Plugins 1.0.0 requires ` +
        `'${PLUGIN_MANIFEST_FILE}' in the plugin root; this location is deprecated. ` +
        `Run 'atk export agentplugin' to emit a 1.0.0-compliant directory.`
    );
  }

  const manifest = (await fs.readJSON(manifestPath)) as OpenPluginManifest;
  if (!manifest.name || typeof manifest.name !== "string") {
    throw new Error(`plugin.json is missing required 'name' field at ${manifestPath}`);
  }
  if (!isValidPluginName(manifest.name)) {
    warnings.push(
      `plugin.json 'name' ("${manifest.name}") does not satisfy the Agent Plugins 1.0.0 constraint ` +
        `(1-${PLUGIN_NAME_MAX_LENGTH} chars, lowercase alphanumeric with '-'/'.', no leading/trailing ` +
        `separator, no '--' or '..').`
    );
  }
  if (!isLegacyLayout && manifest.$schema !== PLUGIN_SCHEMA_URL) {
    warnings.push(
      manifest.$schema
        ? `plugin.json '$schema' is "${manifest.$schema}"; Agent Plugins 1.0.0 expects "${PLUGIN_SCHEMA_URL}".`
        : `plugin.json is missing the required '$schema' field ("${PLUGIN_SCHEMA_URL}").`
    );
  }

  // 2. MCP servers. 1.0.0 uses mcp.json; pre-1.0.0 used .mcp.json.
  const mcpOverride = requireStringPathOverride(manifest.mcpServers, "mcpServers");
  const mcpServers: Record<string, OpenPluginMcpServerEntry> = {};
  let mcpAbs = mcpOverride
    ? resolveComponentPath(
        absRoot,
        mcpOverride,
        MCP_CONFIG_FILE,
        "mcpServers",
        isLegacyLayout,
        warnings
      )
    : resolveWithinRoot(absRoot, MCP_CONFIG_FILE);
  if (mcpAbs && !(await fs.pathExists(mcpAbs))) {
    const legacyMcp = resolveWithinRoot(absRoot, LEGACY_MCP_CONFIG_FILE);
    if (legacyMcp && (await fs.pathExists(legacyMcp))) {
      warnings.push(
        `Found '${LEGACY_MCP_CONFIG_FILE}'. Agent Plugins 1.0.0 renamed this to '${MCP_CONFIG_FILE}'; ` +
          `the dotted name is deprecated.`
      );
      mcpAbs = legacyMcp;
    }
  }
  if (mcpAbs && (await fs.pathExists(mcpAbs))) {
    const mcpJson = (await fs.readJSON(mcpAbs)) as OpenPluginMcpJson;
    const source =
      mcpJson &&
      typeof mcpJson === "object" &&
      mcpJson.mcpServers &&
      typeof mcpJson.mcpServers === "object"
        ? mcpJson.mcpServers
        : mcpJson;
    if (source && typeof source === "object") {
      for (const [name, value] of Object.entries(source)) {
        if (name === "$schema") {
          continue;
        }
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const entry = value as OpenPluginMcpServerEntry;
          // 1.0.0 requires an explicit transport on every entry.
          if (entry.type === undefined) {
            warnings.push(
              `MCP server '${name}' has no 'type'. Agent Plugins 1.0.0 requires an explicit transport ` +
                `(${MCP_SERVER_TYPES.join(", ")}); inferring from the entry's shape.`
            );
          } else if (!isSupportedMcpServerType(entry.type)) {
            warnings.push(
              `MCP server '${name}' declares unrecognized type '${String(entry.type)}'. ` +
                `Agent Plugins 1.0.0 defines ${MCP_SERVER_TYPES.join(", ")}.`
            );
          }
          mcpServers[name] = entry;
        }
      }
    }
  }

  // 3. Skills.
  const skillsAbs = resolveComponentPath(
    absRoot,
    requireStringPathOverride(manifest.skills, "skills"),
    "skills",
    "skills",
    isLegacyLayout,
    warnings
  );
  const skills: string[] = [];
  let skillsRoot: string | undefined;
  if (skillsAbs && (await fs.pathExists(skillsAbs))) {
    skillsRoot = skillsAbs;
    const entries = await fs.readdir(skillsAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!SKILL_NAME_RE.test(entry.name)) {
        warnings.push(
          `Skipping skill folder '${entry.name}': name does not match ${SKILL_NAME_RE.source}.`
        );
        continue;
      }
      const skillMd = path.join(skillsAbs, entry.name, "SKILL.md");
      if (await fs.pathExists(skillMd)) {
        skills.push(entry.name);
      }
    }
    skills.sort();
  }

  // 4. Commands. Not an Agent Plugins 1.0.0 component; still copied through so
  // pre-1.0.0 directories round-trip.
  const commandsAbs = resolveComponentPath(
    absRoot,
    requireStringPathOverride(manifest.commands, "commands"),
    "commands",
    "commands",
    isLegacyLayout,
    warnings
  );
  const commands: string[] = [];
  let commandsRoot: string | undefined;
  if (commandsAbs && (await fs.pathExists(commandsAbs))) {
    commandsRoot = commandsAbs;
    const entries = await fs.readdir(commandsAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        commands.push(entry.name);
      }
    }
    commands.sort();
  }

  // 5. Unmapped component fields → emit a warning so the caller knows we
  // dropped them. We do not throw — the spec says clients report and ignore
  // unknown members rather than rejecting an otherwise valid plugin.
  const manifestRecord = manifest as unknown as Record<string, unknown>;
  for (const field of UNMAPPED_FIELDS) {
    if (manifestRecord[field] !== undefined) {
      warnings.push(`'${field}' field is present but not supported by MOS3 today; dropped.`);
    }
  }

  // 5b. Agent Plugins 1.0.0 closes the manifest schema, so relocation fields
  // are schema violations rather than merely unsupported.
  if (!isLegacyLayout) {
    const offenders = RELOCATION_FIELDS.filter((f) => manifestRecord[f] !== undefined);
    if (offenders.length > 0) {
      warnings.push(
        `plugin.json declares ${offenders.map((f) => `'${String(f)}'`).join(", ")}, which Agent ` +
          `Plugins 1.0.0 does not permit (the manifest schema is closed and component locations ` +
          `are fixed). These fields were ignored.`
      );
    }
  }

  // 6. Icons.
  const hasColorPng = await fs.pathExists(path.join(absRoot, "color.png"));
  const hasOutlinePng = await fs.pathExists(path.join(absRoot, "outline.png"));

  // 7. Round-trip extension block (written by `atk export agentplugin`).
  const atkExtension = readAtkExtensionBlock(manifest, warnings);

  return {
    pluginRoot: absRoot,
    manifest,
    manifestPath,
    manifestKind,
    isLegacyLayout,
    mcpServers,
    skills,
    skillsRoot,
    commands,
    commandsRoot,
    hasColorPng,
    hasOutlinePng,
    warnings,
    atkExtension,
  };
}

/**
 * Read the toolkit round-trip block. Agent Plugins 1.0.0 places it at
 * `extensions["com.microsoft.agents-toolkit"]`; pre-1.0.0 exports wrote it to a
 * top-level `x-microsoft-365-agents-toolkit` key, which is still honoured.
 */
function readAtkExtensionBlock(
  manifest: OpenPluginManifest,
  warnings: string[]
): AtkExtensionBlock | undefined {
  const namespaced = manifest.extensions?.[ATK_EXTENSION_NAMESPACE];
  if (namespaced && typeof namespaced === "object" && !Array.isArray(namespaced)) {
    return namespaced as AtkExtensionBlock;
  }
  const legacy = (manifest as unknown as Record<string, unknown>)[LEGACY_ATK_EXTENSION_KEY];
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    warnings.push(
      `Found the toolkit block at top-level '${LEGACY_ATK_EXTENSION_KEY}'. Agent Plugins 1.0.0 ` +
        `requires client data under 'extensions["${ATK_EXTENSION_NAMESPACE}"]'; the top-level key ` +
        `is deprecated and re-exporting will move it.`
    );
    return legacy as AtkExtensionBlock;
  }
  return undefined;
}
