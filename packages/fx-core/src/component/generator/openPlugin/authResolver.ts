// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, UserError } from "@microsoft/teamsfx-api";
import { err, ok, Result } from "neverthrow";
import { getLocalizedString } from "../../../common/localizeUtils";
import * as mcpToolFetcher from "../../../common/mcpToolFetcher";
import { AuthorizationType, DefaultAuthOption, ParsedOpenPlugin } from "./types";

const SOURCE = "OpenPluginImport";

export interface OpenPluginMcpAuthResolution {
  authTypes: Readonly<Record<string, AuthorizationType>>;
  warnings: string[];
}

type AuthProbeTarget = "invalid" | "noProbe" | "remote";

function isLocalHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  ) {
    return true;
  }

  const mappedIpv4 = /^\[::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}\]$/.exec(hostname);
  return mappedIpv4 !== null && Number.parseInt(mappedIpv4[1], 16) >> 8 === 0x7f;
}

function classifyAuthProbeTarget(serverUrl: string): AuthProbeTarget {
  try {
    const parsed = new URL(serverUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return parsed.protocol === "https:" && !isLocalHostname(hostname) ? "remote" : "noProbe";
  } catch {
    return "invalid";
  }
}

function unresolvedAuth(serverName: string, error?: unknown): UserError {
  const message = getLocalizedString("core.openPluginImport.unresolvedMcpAuth", serverName);
  return new UserError({
    source: SOURCE,
    name: "UnresolvedMcpAuth",
    message,
    displayMessage: message,
    error: error instanceof Error ? error : undefined,
  });
}

/** Resolve every connector auth type before the pure manifest mapper runs. */
export async function resolveOpenPluginMcpAuth(
  parsed: ParsedOpenPlugin,
  defaultAuth: DefaultAuthOption
): Promise<Result<OpenPluginMcpAuthResolution, FxError>> {
  const authTypes: Record<string, AuthorizationType> = {};
  const warnings: string[] = [];

  for (const serverName of Object.keys(parsed.mcpServers).sort()) {
    const server = parsed.mcpServers[serverName];
    const serverUrl = typeof server.url === "string" ? server.url.trim() : "";
    if (!serverUrl) {
      continue;
    }

    const override = parsed.atkExtension?.agentConnectors?.[serverName]?.authorization?.type;
    if (override) {
      authTypes[serverName] = override;
      continue;
    }
    if (defaultAuth !== "Auto") {
      authTypes[serverName] = defaultAuth;
      continue;
    }
    const probeTarget = classifyAuthProbeTarget(serverUrl);
    if (probeTarget === "invalid") {
      return err(unresolvedAuth(serverName));
    }
    if (probeTarget === "noProbe") {
      authTypes[serverName] = "None";
      warnings.push(getLocalizedString("core.openPluginImport.autoAuthNone", serverName));
      continue;
    }

    let probe: mcpToolFetcher.MCPAuthProbeResult;
    try {
      probe = await mcpToolFetcher.probeMCPServerAuth(serverUrl);
    } catch (error) {
      return err(unresolvedAuth(serverName, error));
    }
    if (probe.endpointStatus !== "confirmed") {
      return err(unresolvedAuth(serverName));
    }

    try {
      await mcpToolFetcher.resolveMCPOAuthMetadata(probe.authMetadataUrl, undefined, serverUrl);
      authTypes[serverName] = "OAuthPluginVault";
      warnings.push(getLocalizedString("core.openPluginImport.autoAuthOAuth", serverName));
    } catch {
      if (probe.requiresAuth) {
        authTypes[serverName] = "OAuthPluginVault";
        warnings.push(getLocalizedString("core.openPluginImport.authFallback", serverName));
        continue;
      }
      authTypes[serverName] = "None";
      warnings.push(getLocalizedString("core.openPluginImport.autoAuthNone", serverName));
    }
  }

  return ok({ authTypes, warnings });
}
