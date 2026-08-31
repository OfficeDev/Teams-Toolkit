// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";

/**
 * Constants and helpers for the Agent Plugins specification v1.0.0
 * (https://agent-plugins.org/).
 *
 * This specification was previously published as the "Open Plugin Spec" at
 * https://open-plugins.com/, which now permanently redirects (308) to
 * agent-plugins.org. Internal identifiers in this module keep the historical
 * `openPlugin` naming; the user-facing CLI accepts both `openplugin` and
 * `agentplugin`.
 */

export const AGENT_PLUGINS_VERSION = "1.0.0";

/** Required `$schema` value in plugin.json. */
export const PLUGIN_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/** `$schema` value in mcp.json. */
export const MCP_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

/** Spec-mandated manifest location: plugin.json in the plugin root. */
export const PLUGIN_MANIFEST_FILE = "plugin.json";

/** Spec-mandated MCP configuration location: mcp.json in the plugin root. */
export const MCP_CONFIG_FILE = "mcp.json";

/**
 * Reverse-domain namespace for toolkit-specific manifest data. Agent Plugins
 * 1.0.0 closes the manifest schema (`additionalProperties: false`), so client
 * data must live under `extensions[<namespace>]` rather than at the top level.
 */
export const ATK_EXTENSION_NAMESPACE = "com.microsoft.agents-toolkit";

/** Pre-1.0.0 top-level extension key. Still read on import for back-compat. */
export const LEGACY_ATK_EXTENSION_KEY = "x-microsoft-365-agents-toolkit";

/** Pre-1.0.0 MCP config filename. Still read on import for back-compat. */
export const LEGACY_MCP_CONFIG_FILE = ".mcp.json";

/**
 * Pre-1.0.0 manifest locations. Agent Plugins 1.0.0 requires plugin.json in the
 * plugin root; these are still probed on import so directories authored against
 * the older spec keep working.
 */
export const LEGACY_MANIFEST_LOCATIONS: ReadonlyArray<{
  relPath: string;
  kind: "open-plugin" | "claude-plugin" | "cursor-plugin";
}> = [
  { relPath: ".plugin/plugin.json", kind: "open-plugin" },
  { relPath: ".claude-plugin/plugin.json", kind: "claude-plugin" },
  { relPath: ".cursor-plugin/plugin.json", kind: "cursor-plugin" },
];

/** `name` constraints from plugin.schema.json. */
export const PLUGIN_NAME_MAX_LENGTH = 64;
export const PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const WINDOWS_RESERVED_DEVICE_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const WINDOWS_RESERVED_PATH_SEGMENT_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const PORTABLE_INVALID_PATH_CHARACTER_PATTERN = /[<>:"|?*\u0000-\u001f]/;

/** Transport types permitted by mcp.schema.json. `sse` is legacy HTTP+SSE. */
export type AgentPluginMcpServerType = "stdio" | "streamable-http" | "sse";
export const MCP_SERVER_TYPES: readonly AgentPluginMcpServerType[] = [
  "stdio",
  "streamable-http",
  "sse",
];

/** Transport emitted by `atk export` for remote MCP servers. */
export const DEFAULT_REMOTE_MCP_TYPE: AgentPluginMcpServerType = "streamable-http";

export function isValidPluginName(name: string): boolean {
  return (
    typeof name === "string" &&
    name.length >= 1 &&
    name.length <= PLUGIN_NAME_MAX_LENGTH &&
    PLUGIN_NAME_PATTERN.test(name)
  );
}

export function isSupportedMcpServerType(value: unknown): value is AgentPluginMcpServerType {
  return value === "stdio" || value === "streamable-http" || value === "sse";
}

/** Add an own enumerable entry without invoking Object.prototype.__proto__. */
export function setRecordValue<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/** Reject absolute and drive-relative paths under both POSIX and Windows semantics. */
export function isPortableRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    !/^[a-zA-Z]:/.test(value)
  );
}

export function normalizePortableRelativePath(value: string): string | undefined {
  if (!isPortableRelativePath(value) || /[\\/]$/.test(value)) return undefined;
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  const hasNonPortableSegment = normalized
    .split("/")
    .some(
      (segment) =>
        segment.length === 0 ||
        /[ .]$/.test(segment) ||
        PORTABLE_INVALID_PATH_CHARACTER_PATTERN.test(segment) ||
        WINDOWS_RESERVED_PATH_SEGMENT_PATTERN.test(segment)
    );
  if (hasNonPortableSegment) return undefined;
  return normalized;
}

export function portablePathsConflict(left: string, right: string): boolean {
  const leftKey = left.toLowerCase();
  const rightKey = right.toLowerCase();
  return (
    leftKey === rightKey || leftKey.startsWith(`${rightKey}/`) || rightKey.startsWith(`${leftKey}/`)
  );
}

/**
 * Coerce an arbitrary display string into a name that satisfies
 * plugin.schema.json: lowercase, `[a-z0-9.-]`, no leading/trailing `.`/`-`,
 * no `--` or `..`, and at most 64 characters.
 */
export function normalizePluginName(raw: string, fallback = "exported-plugin"): string {
  let s = (raw ?? "").toLowerCase();
  // Anything outside the permitted alphabet becomes a hyphen.
  s = s.replace(/[^a-z0-9.-]+/g, "-");
  // Collapse the two forbidden digraphs. Loop because collapsing one can
  // create the other (e.g. ".-." -> "..").
  while (/--|\.\./.test(s)) {
    s = s.replace(/-{2,}/g, "-").replace(/\.{2,}/g, ".");
  }
  // Must start and end with an alphanumeric.
  s = s.replace(/^[.-]+/, "").replace(/[.-]+$/, "");
  if (s.length > PLUGIN_NAME_MAX_LENGTH) {
    s = s.slice(0, PLUGIN_NAME_MAX_LENGTH).replace(/[.-]+$/, "");
  }
  const windowsBaseName = s.split(".", 1)[0];
  if (WINDOWS_RESERVED_DEVICE_NAME_PATTERN.test(windowsBaseName)) {
    s = `plugin-${s}`.slice(0, PLUGIN_NAME_MAX_LENGTH).replace(/[.-]+$/, "");
  }
  return s.length > 0 ? s : fallback;
}

/**
 * Reject paths that escape their designated root, per the Agent Plugins
 * security rules ("resolved paths MUST remain within the plugin root").
 * Returns the resolved absolute path, or undefined when it escapes.
 */
export function resolveWithinRoot(root: string, relative: string): string | undefined {
  const absRoot = path.resolve(root);
  const resolved = path.resolve(absRoot, relative);
  const rel = path.relative(absRoot, resolved);
  if (rel === "") {
    return resolved;
  }
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return undefined;
  }
  return resolved;
}
