// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { isMap, isSeq, parseDocument } from "yaml";

const SOURCE = "Scaffold";
const MIN_DCR_YAML_VERSION = "v1.13";
const SUPPORTED_AUTH_TYPES = new Set([
  "none",
  "oauth",
  "entra-sso",
  "oauth-dynamic",
  "bearer-token",
]);

export const MCP_DCR_WELL_KNOWN_URL_PLACEHOLDER =
  "<PLEASE_FILL_IN_WELL_KNOWN_AUTHORIZATION_SERVER_URL>";

/**
 * Placeholders for a static `oauth` action whose authorization / token URLs could not be
 * discovered. `identityProvider: Custom` is unusable without both, and omitting the fields
 * hides the gap; the placeholders make it visible and editable.
 */
export const MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER = "<PLEASE_FILL_IN_AUTHORIZATION_URL>";
export const MCP_OAUTH_TOKEN_URL_PLACEHOLDER = "<PLEASE_FILL_IN_TOKEN_URL>";

export interface ResolvedMCPAuthEndpoints {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  wellKnownUrl?: string;
}

export interface MCPAuthActionArgs {
  authType: string;
  authName: string;
  registrationId: string;
  mcpServerUrl: string;
  endpoints: ResolvedMCPAuthEndpoints;
  credentialEnvNames?: {
    clientId: string;
    clientSecret?: string;
    scope?: string;
  };
}

export interface MCPAuthActionResult {
  yaml: string;
  wellKnownUrlPlaceholderUsed: boolean;
  oauthUrlPlaceholderUsed: boolean;
}

function failure(message: string): Result<never, FxError> {
  return err(new SystemError({ source: SOURCE, name: "McpAuthInjectFailed", message }));
}

function registrationId(item: unknown): string | undefined {
  if (!isMap(item)) {
    return undefined;
  }
  const output = item.get("writeToEnvironmentFile", true);
  if (!isMap(output)) {
    return undefined;
  }
  const outputName = uses(item) === "apiKey/register" ? "registrationId" : "configurationId";
  const value = output.get(outputName);
  return typeof value === "string" ? value : undefined;
}

function uses(item: unknown): string | undefined {
  if (!isMap(item)) {
    return undefined;
  }
  const value = item.get("uses");
  return typeof value === "string" ? value : undefined;
}

function teamsAppId(item: unknown): string | undefined {
  if (uses(item) !== "teamsApp/create" || !isMap(item)) {
    return undefined;
  }
  const output = item.get("writeToEnvironmentFile", true);
  if (!isMap(output)) {
    return undefined;
  }
  const value = output.get("teamsAppId");
  return typeof value === "string" ? value : undefined;
}

function ensureMinimumVersion(current: unknown, minimum: string): string | undefined {
  if (typeof current !== "string") {
    return undefined;
  }
  const parse = (version: string): number[] | undefined => {
    const match = /^v?(\d+(?:\.\d+){1,2})$/.exec(version);
    return match?.[1].split(".").map((part) => Number.parseInt(part, 10));
  };
  const currentParts = parse(current);
  const minimumParts = parse(minimum);
  if (!currentParts || !minimumParts) {
    return undefined;
  }
  const width = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < width; index++) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart > minimumPart) {
      return undefined;
    }
    if (currentPart < minimumPart) {
      return minimum;
    }
  }
  return undefined;
}

function oauthAction(args: MCPAuthActionArgs, appIdEnvName: string): Record<string, unknown> {
  const endpointFields: Record<string, string> = {};
  if (args.authType === "oauth") {
    endpointFields.authorizationUrl =
      args.endpoints.authorizationUrl ?? MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER;
    endpointFields.tokenUrl = args.endpoints.tokenUrl ?? MCP_OAUTH_TOKEN_URL_PLACEHOLDER;
    if (args.endpoints.refreshUrl) {
      endpointFields.refreshUrl = args.endpoints.refreshUrl;
    }
  }
  return {
    uses: "oauth/register",
    with: {
      name: args.authName,
      appId: `\${{${appIdEnvName}}}`,
      flow: "authorizationCode",
      ...(args.authType === "oauth"
        ? { ...endpointFields, identityProvider: "Custom" }
        : { identityProvider: "MicrosoftEntra" }),
      baseUrl: args.mcpServerUrl,
      ...(args.credentialEnvNames
        ? {
            clientId: `\${{${args.credentialEnvNames.clientId}}}`,
            ...(args.credentialEnvNames.clientSecret
              ? { clientSecret: `\${{${args.credentialEnvNames.clientSecret}}}` }
              : {}),
            ...(args.credentialEnvNames.scope
              ? { scope: `\${{${args.credentialEnvNames.scope}}}` }
              : {}),
          }
        : {}),
    },
    writeToEnvironmentFile: { configurationId: args.registrationId },
  };
}

function dcrAction(
  args: MCPAuthActionArgs,
  appIdEnvName: string,
  wellKnownUrl: string
): Record<string, unknown> {
  return {
    uses: "dcr/register",
    with: {
      name: args.authName,
      appId: `\${{${appIdEnvName}}}`,
      applicableToApps: "AnyApp",
      targetAudience: "HomeTenant",
      wellKnownAuthorizationServer: wellKnownUrl,
      targetUrlsShouldStartWith: [args.mcpServerUrl],
    },
    writeToEnvironmentFile: { configurationId: args.registrationId },
  };
}

function apiKeyAction(args: MCPAuthActionArgs, appIdEnvName: string): Record<string, unknown> {
  return {
    uses: "apiKey/register",
    with: {
      name: args.authName,
      appId: `\${{${appIdEnvName}}}`,
      baseUrl: args.mcpServerUrl,
    },
    writeToEnvironmentFile: { registrationId: args.registrationId },
  };
}

/** Add an MCP auth provision action while preserving the surrounding YAML document. */
export function injectMcpAuthActionYaml(
  yaml: string,
  args: MCPAuthActionArgs
): Result<MCPAuthActionResult, FxError> {
  if (!SUPPORTED_AUTH_TYPES.has(args.authType)) {
    return failure(`Unsupported MCP auth type '${args.authType}'.`);
  }
  if (args.authType === "none") {
    return ok({ yaml, wellKnownUrlPlaceholderUsed: false, oauthUrlPlaceholderUsed: false });
  }

  const document = parseDocument(yaml);
  if (document.errors.length > 0) {
    return failure("The rendered m365agents.yml is not valid YAML.");
  }
  const provision = document.get("provision", true);
  if (!isSeq(provision)) {
    return failure("The rendered m365agents.yml does not declare a provision sequence.");
  }

  const actionUses =
    args.authType === "oauth-dynamic"
      ? "dcr/register"
      : args.authType === "bearer-token"
        ? "apiKey/register"
        : "oauth/register";
  const alreadyRegistered = provision.items.some(
    (item) => uses(item) === actionUses && registrationId(item) === args.registrationId
  );
  if (alreadyRegistered) {
    return ok({
      yaml: document.toString(),
      wellKnownUrlPlaceholderUsed: false,
      oauthUrlPlaceholderUsed: false,
    });
  }

  provision.items = provision.items.filter((item) => uses(item) !== undefined);
  const teamsAppIndex = provision.items.findIndex((item) => uses(item) === "teamsApp/create");
  const appIdEnvName = teamsAppIndex >= 0 ? teamsAppId(provision.items[teamsAppIndex]) : undefined;
  if (!appIdEnvName) {
    return failure("The rendered m365agents.yml does not expose a Teams app id.");
  }

  const placeholderUsed = args.authType === "oauth-dynamic" && !args.endpoints.wellKnownUrl;
  const oauthUrlPlaceholderUsed =
    args.authType === "oauth" && (!args.endpoints.authorizationUrl || !args.endpoints.tokenUrl);
  const action =
    args.authType === "oauth-dynamic"
      ? dcrAction(
          args,
          appIdEnvName,
          args.endpoints.wellKnownUrl ?? MCP_DCR_WELL_KNOWN_URL_PLACEHOLDER
        )
      : args.authType === "bearer-token"
        ? apiKeyAction(args, appIdEnvName)
        : oauthAction(args, appIdEnvName);
  provision.items.splice(teamsAppIndex + 1, 0, document.createNode(action));

  if (args.authType === "oauth-dynamic") {
    const version = ensureMinimumVersion(document.get("version"), MIN_DCR_YAML_VERSION);
    if (version) {
      document.set("version", version);
    }
  }

  return ok({
    yaml: document.toString(),
    wellKnownUrlPlaceholderUsed: placeholderUsed,
    oauthUrlPlaceholderUsed,
  });
}
