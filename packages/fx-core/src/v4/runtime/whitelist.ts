// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ExpressionRuntimePort, WhitelistFn } from "../expression/evaluateExpression";
import * as path from "path";
import { readBooleanFeatureFlag } from "../../common/featureFlags";

/** Closed v4 render-context function whitelist. See build-render-context spec. */

const NAMESPACE_FALLBACK = "mcpServer";
const NAMESPACE_MAX_LENGTH = 10;

/** Derive a stable MCP server namespace from a URL host. */
export function deriveMcpServerName(url: string): string {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "";
  }
  const alphanumeric = host.replace(/[^a-zA-Z0-9]/g, "").substring(0, NAMESPACE_MAX_LENGTH);
  return alphanumeric.length > 0 ? alphanumeric : NAMESPACE_FALLBACK;
}

/** Whitelist fn `mcpNamespace(url)` — the rendered `ai-plugin.json` namespace. */
export const mcpNamespace: WhitelistFn = (url: string): string => deriveMcpServerName(url);

/** Whitelist fn `mcpAuthRef(url)` for the deferred auth env-ref placeholder. */
export const mcpAuthRef: WhitelistFn = (url: string): string =>
  "${{MCP_DA_AUTH_ID_" + deriveMcpServerName(url).toUpperCase() + "}}";

/** Whitelist fn `safeProjectNameLowerCase(appName)` for package names. */
export const safeProjectNameLowerCase: WhitelistFn = (appName: string): string =>
  appName.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();

/** Whitelist fn `pathDelimiter()` for PATH-like launch configuration values. */
export const pathDelimiter: WhitelistFn = (): string => path.delimiter;

/** Office add-in manifest requirement scope for each host id. */
const OFFICE_ADDIN_HOST_SCOPE: Record<string, string> = {
  outlook: "mail",
  excel: "workbook",
  word: "document",
  powerpoint: "presentation",
};

/** Stable host order for a deterministic multi-scope render. */
const OFFICE_ADDIN_HOST_ORDER = ["mail", "workbook", "document", "presentation"];

/** Parse a comma-joined multiSelect answer into its selected ids. */
function parseCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Whitelist fn `contains(csv, item)` — `"true"` when a multiSelect answer selects `item`. */
export const contains: WhitelistFn = (csv: string, item: string): string =>
  parseCsv(csv).includes(item) ? "true" : "";

/** Whitelist fn `officeAddinManifestScope(host)` — the single-host manifest scope literal. */
export const officeAddinManifestScope: WhitelistFn = (host: string): string =>
  `"${OFFICE_ADDIN_HOST_SCOPE[host] ?? OFFICE_ADDIN_HOST_SCOPE.word}"`;

/**
 * Whitelist fn `officeAddinManifestScopes(csv)` — the multiSelect host set rendered
 * as the inner body of a manifest `scopes` JSON array. Pre-joins so the array stays
 * valid for any host subset (v3 parity: no trailing-comma breakage).
 */
export const officeAddinManifestScopes: WhitelistFn = (csv: string): string => {
  const selected = new Set(parseCsv(csv).map((host) => OFFICE_ADDIN_HOST_SCOPE[host]));
  const scopes = OFFICE_ADDIN_HOST_ORDER.filter((scope) => selected.has(scope));
  const body = scopes.length > 0 ? scopes : [OFFICE_ADDIN_HOST_SCOPE.word];
  return body.map((scope) => `"${scope}"`).join(",\n                    ");
};

/**
 * Debug launch surface for the Office task-pane template.
 *
 * These functions pre-join the `.vscode/launch.json` and `package.json` host
 * entries instead of the `{{#HostOutlook}}` Mustache sections the manifest uses.
 * The manifest's optional blocks each sit next to a guaranteed-present sibling
 * (the default permission / runtime / ribbon), so a section can carry its own
 * trailing comma safely. The launch configs, compounds, and debug scripts are
 * *fully* optional arrays — every element depends on a host that may be
 * deselected — so there is no anchor element to absorb a trailing comma, and
 * flat Mustache cannot suppress the comma after the last selected block. A
 * comma `join` over the selected hosts is the only comma-correct option, which
 * only a function (not a template) can express.
 *
 * This mirrors how v3 handles the same files: rather than editing JSON text, v3
 * scaffolds all hosts and then `Array.filter`s the parsed `configurations` /
 * `compounds` / `scripts` and re-serializes (officeAddin generator `post`). v4
 * has no post-render file mutation, so the equivalent filtered-list-to-string
 * happens here at render time instead.
 */
const OFFICE_ADDIN_HOST_LABEL: Record<string, string> = {
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
  outlook: "Outlook",
};
const OFFICE_ADDIN_LAUNCH_HOST_ORDER = ["word", "excel", "powerpoint", "outlook"];

/** Selected hosts in canonical order, defaulting to word when nothing is selected. */
function selectedLaunchHosts(csv: string): string[] {
  const selected = new Set(parseCsv(csv));
  const hosts = OFFICE_ADDIN_LAUNCH_HOST_ORDER.filter((host) => selected.has(host));
  return hosts.length > 0 ? hosts : ["word"];
}

/** Indent a multi-line JSON fragment so it nests under the given column. */
function indentJson(json: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return json
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

/**
 * Whitelist fn `officeAddinLaunchConfigurations(csv)` — the inner body of the
 * `.vscode/launch.json` `configurations` array, limited to the selected hosts.
 */
export const officeAddinLaunchConfigurations: WhitelistFn = (csv: string): string => {
  const blocks = selectedLaunchHosts(csv).flatMap((host) => {
    const label = OFFICE_ADDIN_HOST_LABEL[host];
    return [
      `{
  "name": "${label} Desktop Host",
  "type": "node-terminal",
  "request": "launch",
  "command": "npm run start:desktop:${host}",
  "cwd": "\${workspaceFolder}",
  "preLaunchTask": "Install",
  "postDebugTask": "Stop Debug",
  "presentation": {
    "hidden": true
  }
}`,
      `{
  "name": "${label} Desktop Attach (Edge Chromium)",
  "type": "msedge",
  "request": "attach",
  "port": 9229,
  "timeout": 600000,
  "webRoot": "\${workspaceRoot}",
  "presentation": {
    "hidden": true
  }
}`,
    ];
  });
  return blocks
    .map((block) => indentJson(block, 4))
    .join(",\n")
    .trimStart();
};

/**
 * Whitelist fn `officeAddinLaunchCompounds(csv)` — the inner body of the
 * `.vscode/launch.json` `compounds` array, limited to the selected hosts.
 */
export const officeAddinLaunchCompounds: WhitelistFn = (csv: string): string => {
  const blocks = selectedLaunchHosts(csv).map((host) => {
    const label = OFFICE_ADDIN_HOST_LABEL[host];
    return `{
  "name": "${label} Desktop (Edge Chromium)",
  "configurations": [
    "${label} Desktop Host",
    "${label} Desktop Attach (Edge Chromium)"
  ],
  "stopAll": true
}`;
  });
  return blocks
    .map((block) => indentJson(block, 4))
    .join(",\n")
    .trimStart();
};

/**
 * Whitelist fn `officeAddinDebugScripts(csv)` — the `start:desktop:<host>` npm
 * script entries for the selected hosts, each on its own line with a trailing comma.
 */
export const officeAddinDebugScripts: WhitelistFn = (csv: string): string =>
  selectedLaunchHosts(csv)
    .map(
      (host) =>
        `    "start:desktop:${host}": "office-addin-debugging start appPackage/manifest.json desktop --app ${host}",`
    )
    .join("\n")
    .trimStart();

/** Whitelist fn `officeAddinDebugApp(csv)` — the default `app_to_debug` host. */
export const officeAddinDebugApp: WhitelistFn = (csv: string): string =>
  selectedLaunchHosts(csv)[0];

/** The closed function whitelist; an author cannot extend it (ADR-0016 decision 3). */
const WHITELIST = new Map<string, WhitelistFn>([
  ["mcpNamespace", mcpNamespace],
  ["mcpAuthRef", mcpAuthRef],
  ["safeProjectNameLowerCase", safeProjectNameLowerCase],
  ["pathDelimiter", pathDelimiter],
  ["contains", contains],
  ["officeAddinManifestScope", officeAddinManifestScope],
  ["officeAddinManifestScopes", officeAddinManifestScopes],
  ["officeAddinLaunchConfigurations", officeAddinLaunchConfigurations],
  ["officeAddinLaunchCompounds", officeAddinLaunchCompounds],
  ["officeAddinDebugScripts", officeAddinDebugScripts],
  ["officeAddinDebugApp", officeAddinDebugApp],
]);

/** Default feature-flag reader: an env-backed truthy check (`"true"` / `"1"`). */
function envFlagReader(name: string): boolean {
  return readBooleanFeatureFlag(name);
}

/** Build the real pure expression runtime port. */
export function createExpressionPort(
  flagReader: (name: string) => boolean = envFlagReader
): ExpressionRuntimePort {
  return {
    functions: (name: string): WhitelistFn | undefined => WHITELIST.get(name),
    flags: (name: string): boolean => flagReader(name),
  };
}
