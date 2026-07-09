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

/** The closed function whitelist; an author cannot extend it (ADR-0016 decision 3). */
const WHITELIST = new Map<string, WhitelistFn>([
  ["mcpNamespace", mcpNamespace],
  ["mcpAuthRef", mcpAuthRef],
  ["safeProjectNameLowerCase", safeProjectNameLowerCase],
  ["pathDelimiter", pathDelimiter],
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
