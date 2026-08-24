// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as path from "path";
import { OpenPluginInputError } from "./errors";
import { inspectPathWithinRoot, resolvePluginRoot } from "./fileSystem";
import { getAgentSkillValidationError } from "./skillValidation";
import {
  ATK_EXTENSION_NAMESPACE,
  LEGACY_ATK_EXTENSION_KEY,
  LEGACY_MANIFEST_LOCATIONS,
  LEGACY_MCP_CONFIG_FILE,
  MCP_CONFIG_FILE,
  PLUGIN_MANIFEST_FILE,
  resolveWithinRoot,
} from "./spec";
import {
  AtkExtensionBlock,
  OpenPluginManifest,
  OpenPluginMcpServerEntry,
  ParsedManifestKind,
  ParsedOpenPlugin,
} from "./types";
import {
  getRemoteMcpUrlError,
  isRecord,
  parseAtkExtension,
  parseAgentPluginManifest,
  parseAgentPluginMcpJson,
  parseLegacyOpenPluginManifest,
} from "./validation";

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
  throw new OpenPluginInputError(
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
  const absRoot = await resolvePluginRoot(root);

  // 1. Probe manifest locations: spec location first, then pre-1.0.0 layouts.
  let manifestPath: string | undefined;
  let manifestKind: ParsedManifestKind | undefined;
  let isLegacyLayout = false;
  for (const loc of MANIFEST_LOCATIONS) {
    const inspected = await inspectPathWithinRoot(absRoot, loc.relPath, "file");
    if (inspected.status === "missing") continue;
    if (inspected.status === "outside") {
      throw new OpenPluginInputError(
        `Plugin manifest '${loc.relPath}' resolves outside the plugin root.`
      );
    }
    if (inspected.status === "wrong-kind") {
      throw new OpenPluginInputError(`Plugin manifest '${loc.relPath}' must be a regular file.`);
    }
    manifestPath = inspected.path;
    manifestKind = loc.kind;
    isLegacyLayout = loc.legacy;
    break;
  }
  if (!manifestPath || !manifestKind) {
    throw new OpenPluginInputError(
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

  let manifestJson: unknown;
  try {
    manifestJson = await fs.readJSON(manifestPath);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new OpenPluginInputError("plugin.json contains invalid JSON.");
  }
  const parsedManifest = isLegacyLayout
    ? { manifest: parseLegacyOpenPluginManifest(manifestJson), warnings: [] }
    : parseAgentPluginManifest(manifestJson);
  const manifest = parsedManifest.manifest;
  warnings.push(...parsedManifest.warnings);

  // 2. MCP servers. 1.0.0 uses mcp.json; pre-1.0.0 used .mcp.json.
  const mcpOverride = isLegacyLayout
    ? requireStringPathOverride(manifest.mcpServers, "mcpServers")
    : undefined;
  const mcpServers: Record<string, OpenPluginMcpServerEntry> = {};
  const invalidRemoteMcpServers: string[] = [];
  const requestedMcp = mcpOverride
    ? resolveComponentPath(
        absRoot,
        mcpOverride,
        MCP_CONFIG_FILE,
        "mcpServers",
        isLegacyLayout,
        warnings
      )
    : resolveWithinRoot(absRoot, MCP_CONFIG_FILE);
  let inspectedMcp = requestedMcp
    ? await inspectPathWithinRoot(absRoot, path.relative(absRoot, requestedMcp), "file")
    : undefined;
  if (isLegacyLayout && inspectedMcp?.status === "missing") {
    const legacyMcp = await inspectPathWithinRoot(absRoot, LEGACY_MCP_CONFIG_FILE, "file");
    if (legacyMcp.status === "ok") {
      warnings.push(
        `Found '${LEGACY_MCP_CONFIG_FILE}'. Agent Plugins 1.0.0 renamed this to '${MCP_CONFIG_FILE}'; ` +
          `the dotted name is deprecated.`
      );
      inspectedMcp = legacyMcp;
    }
  }
  if (inspectedMcp?.status === "outside") {
    warnings.push(`'mcp.json' resolves outside the plugin root and was rejected for safety.`);
  } else if (inspectedMcp?.status === "wrong-kind") {
    warnings.push(`'mcp.json' must be a regular file; MCP was disabled for this plugin.`);
  } else if (inspectedMcp?.status === "ok") {
    let mcpJson: unknown;
    try {
      mcpJson = await fs.readJSON(inspectedMcp.path);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      warnings.push(`mcp.json is invalid JSON; MCP was disabled for this plugin.`);
    }
    if (mcpJson === undefined) {
      // A malformed document is isolated above; filesystem failures still propagate.
    } else if (isLegacyLayout) {
      readLegacyMcpServers(mcpJson, mcpServers, invalidRemoteMcpServers, warnings);
    } else {
      const parsedMcp = parseAgentPluginMcpJson(mcpJson);
      Object.assign(mcpServers, parsedMcp.mcpServers);
      invalidRemoteMcpServers.push(...parsedMcp.invalidRemoteMcpServers);
      warnings.push(...parsedMcp.warnings);
    }
  }

  // 3. Skills.
  const skillsAbs = resolveComponentPath(
    absRoot,
    isLegacyLayout ? requireStringPathOverride(manifest.skills, "skills") : undefined,
    "skills",
    "skills",
    isLegacyLayout,
    warnings
  );
  const skills: string[] = [];
  let skillsRoot: string | undefined;
  const inspectedSkills = skillsAbs
    ? await inspectPathWithinRoot(absRoot, path.relative(absRoot, skillsAbs), "directory")
    : undefined;
  if (inspectedSkills?.status === "outside") {
    warnings.push(`'skills' path resolves outside the plugin root and was rejected for safety.`);
  } else if (inspectedSkills?.status === "wrong-kind") {
    warnings.push(`'skills' must resolve to a directory; this component type was ignored.`);
  } else if (inspectedSkills?.status === "ok") {
    skillsRoot = inspectedSkills.path;
    const entries = await fs.readdir(inspectedSkills.path, { withFileTypes: true });
    for (const entry of entries) {
      const skillDirectory = await inspectPathWithinRoot(
        absRoot,
        path.relative(absRoot, path.join(inspectedSkills.path, entry.name)),
        "directory"
      );
      if (skillDirectory.status === "outside") {
        warnings.push(
          `Skipping skill folder '${entry.name}': it resolves outside the plugin root.`
        );
        continue;
      }
      if (skillDirectory.status !== "ok") continue;
      const skillMd = await inspectPathWithinRoot(
        absRoot,
        path.relative(absRoot, path.join(skillDirectory.path, "SKILL.md")),
        "file"
      );
      if (skillMd.status === "outside") {
        warnings.push(`Skipping skill '${entry.name}': SKILL.md resolves outside the plugin root.`);
        continue;
      }
      if (skillMd.status !== "ok") continue;
      const validationError = await getAgentSkillValidationError(entry.name, skillMd.path);
      if (validationError) {
        warnings.push(`Skipping skill '${entry.name}': ${validationError}.`);
        continue;
      }
      skills.push(entry.name);
    }
    skills.sort();
  }

  // 4. Commands. Not an Agent Plugins 1.0.0 component; still copied through so
  // pre-1.0.0 directories round-trip.
  const commandsAbs = resolveComponentPath(
    absRoot,
    isLegacyLayout ? requireStringPathOverride(manifest.commands, "commands") : undefined,
    "commands",
    "commands",
    isLegacyLayout,
    warnings
  );
  const commands: string[] = [];
  let commandsRoot: string | undefined;
  const inspectedCommands = commandsAbs
    ? await inspectPathWithinRoot(absRoot, path.relative(absRoot, commandsAbs), "directory")
    : undefined;
  if (inspectedCommands?.status === "outside") {
    warnings.push(`'commands' path resolves outside the plugin root and was rejected for safety.`);
  } else if (inspectedCommands?.status === "wrong-kind") {
    warnings.push(`'commands' must resolve to a directory and was ignored.`);
  } else if (inspectedCommands?.status === "ok") {
    commandsRoot = inspectedCommands.path;
    const entries = await fs.readdir(inspectedCommands.path, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      if (entry.isSymbolicLink()) {
        warnings.push(`Skipping command '${entry.name}': symbolic links are not permitted.`);
        continue;
      }
      if (!entry.isFile()) continue;
      const command = await inspectPathWithinRoot(
        absRoot,
        path.relative(absRoot, path.join(inspectedCommands.path, entry.name)),
        "file"
      );
      if (command.status === "outside") {
        warnings.push(`Skipping command '${entry.name}': it resolves outside the plugin root.`);
      } else if (command.status === "ok") {
        commands.push(entry.name);
      }
    }
    commands.sort();
  }

  // 5. Unmapped component fields → emit a warning so the caller knows we
  // dropped them. We do not throw — the spec says clients report and ignore
  // unknown members rather than rejecting an otherwise valid plugin.
  for (const field of UNMAPPED_FIELDS) {
    if (manifest[field] !== undefined) {
      warnings.push(`'${field}' field is present but not supported by MOS3 today; dropped.`);
    }
  }

  // 5b. Agent Plugins 1.0.0 closes the manifest schema, so relocation fields
  // are schema violations rather than merely unsupported.
  if (!isLegacyLayout) {
    const offenders = RELOCATION_FIELDS.filter((f) => manifest[f] !== undefined);
    if (offenders.length > 0) {
      warnings.push(
        `plugin.json declares ${offenders.map((f) => `'${String(f)}'`).join(", ")}, which Agent ` +
          `Plugins 1.0.0 does not permit (the manifest schema is closed and component locations ` +
          `are fixed). These fields were ignored.`
      );
    }
  }

  // 6. Icons.
  const hasColorPng = (await inspectPathWithinRoot(absRoot, "color.png", "file")).status === "ok";
  const hasOutlinePng =
    (await inspectPathWithinRoot(absRoot, "outline.png", "file")).status === "ok";

  // 7. Round-trip extension block (written by `atk export agentplugin`).
  const atkExtension = readAtkExtensionBlock(manifest, warnings);

  return {
    pluginRoot: absRoot,
    manifest,
    manifestPath,
    manifestKind,
    isLegacyLayout,
    mcpServers,
    invalidRemoteMcpServers,
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
  if (namespaced !== undefined) return parseAtkExtension(namespaced, warnings);
  const legacy = manifest.legacyAtkExtension;
  if (legacy !== undefined) {
    warnings.push(
      `Found the toolkit block at top-level '${LEGACY_ATK_EXTENSION_KEY}'. Agent Plugins 1.0.0 ` +
        `requires client data under 'extensions["${ATK_EXTENSION_NAMESPACE}"]'; the top-level key ` +
        `is deprecated and re-exporting will move it.`
    );
    return parseAtkExtension(legacy, warnings);
  }
  return undefined;
}

function readLegacyMcpServers(
  value: unknown,
  mcpServers: Record<string, OpenPluginMcpServerEntry>,
  invalidRemoteMcpServers: string[],
  warnings: string[]
): void {
  if (!isRecord(value)) return;
  const source = isRecord(value.mcpServers) ? value.mcpServers : value;
  for (const [name, server] of Object.entries(source)) {
    if (name === "$schema" || !isRecord(server)) continue;
    const entry: OpenPluginMcpServerEntry = {};
    for (const [field, fieldValue] of Object.entries(server)) {
      entry[field] = fieldValue;
    }
    if (entry.url !== undefined) {
      const urlError = getRemoteMcpUrlError(entry.url);
      if (urlError) {
        invalidRemoteMcpServers.push(name);
        warnings.push(`MCP server '${name}' is invalid and was skipped: ${urlError}`);
        continue;
      }
    }
    mcpServers[name] = entry;
  }
}
