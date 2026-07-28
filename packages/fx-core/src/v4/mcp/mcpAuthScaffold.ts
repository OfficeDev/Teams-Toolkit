// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { getLocalizedString } from "../../common/localizeUtils";
import {
  MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER,
  MCP_OAUTH_TOKEN_URL_PLACEHOLDER,
  ResolvedMCPAuthEndpoints,
  injectMcpAuthActionYaml,
} from "./mcpAuthAction";
import { probeMCPServerAuth, resolveMCPOAuthMetadata } from "../../common/mcpToolFetcher";
import { StepContext } from "../pipeline/runScaffoldPipeline";
import { deriveMcpServerName } from "../runtime/whitelist";

/**
 * v4 MCP-auth facade. The v4-owned YAML action mutator produces the create/add auth action shape
 * for every auth type (`oauth`/`entra-sso` -> `oauth/register`, `oauth-dynamic` -> `dcr/register`
 * with the v1.13 schema bump).
 *
 * Static OAuth and Entra credentials follow the v3 contract: the action references deterministic
 * environment names and the runtime environment writer persists regular values separately from
 * `SECRET_*` values. Dynamic registration has no static credential fields.
 */

const SOURCE = "Scaffold";

/** MCP create scaffolding persists collected credentials to the default development environment. */
const CREATE_ENVIRONMENT = "dev";

/** Indirection seam so unit tests can stub the network probes on a plain object. */
export const mcpAuthScaffoldDeps = {
  probeMCPServerAuth,
  resolveMCPOAuthMetadata,
};

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The MCP namespace, registration id, and uppercase server name derived from the server URL. */
function mcpAuthIdentifiers(mcpServerUrl: string): {
  namespace: string;
  registrationId: string;
  clientId: string;
  clientSecret: string;
  scope: string;
} {
  const namespace = deriveMcpServerName(mcpServerUrl);
  const uppercaseNamespace = namespace.toUpperCase();
  return {
    namespace,
    registrationId: `MCP_DA_AUTH_ID_${uppercaseNamespace}`,
    clientId: `MCP_DA_OAUTH_CLIENT_ID_${uppercaseNamespace}`,
    clientSecret: `SECRET_MCP_DA_OAUTH_CLIENT_SECRET_${uppercaseNamespace}`,
    scope: `MCP_DA_OAUTH_SCOPE_${uppercaseNamespace}`,
  };
}

/**
 * Best-effort resolution of the authorization-server endpoints for `oauth` / `oauth-dynamic`,
 * mirroring the v3 create flow: probe the server for its `resource_metadata`, then resolve the
 * well-known OAuth metadata. Any failure yields empty endpoints — the action is still injected and
 * the developer fills the URLs before provisioning, matching v3's best-effort behavior. `entra-sso`
 * and `none` need no endpoints (no network).
 */
async function resolveEndpoints(
  authType: string,
  mcpServerUrl: string,
  warn?: (message: string) => void
): Promise<ResolvedMCPAuthEndpoints> {
  if (authType !== "oauth" && authType !== "oauth-dynamic") {
    return {};
  }
  try {
    const probe = await mcpAuthScaffoldDeps.probeMCPServerAuth(mcpServerUrl);
    const metadata = await mcpAuthScaffoldDeps.resolveMCPOAuthMetadata(
      probe.authMetadataUrl,
      undefined,
      mcpServerUrl
    );
    return {
      authorizationUrl: metadata.authorizationUrl,
      tokenUrl: metadata.tokenUrl,
      refreshUrl: metadata.refreshUrl,
      wellKnownUrl: metadata.wellKnownUrl,
    };
  } catch (error) {
    warn?.(getLocalizedString("core.MCPForDA.mcpAuthMetadataMissingError", errorMessage(error)));
    return {};
  }
}

/**
 * Inject the `oauth/register` (or `dcr/register`) provision action into the rendered
 * `m365agents.yml` (idempotent; inserted after `teamsApp/create`, which writes the
 * `${{TEAMS_APP_ID}}` the action references).
 */
export async function injectMcpAuthAction(
  ctx: StepContext,
  args: {
    ymlPath: string;
    authType: string;
    mcpServerUrl: string;
    credentialFields?: { clientId: boolean; clientSecret: boolean; scope: boolean };
  }
): Promise<Result<void, FxError>> {
  const current = ctx.read(args.ymlPath);
  if (current === undefined) {
    return err(
      systemError(
        "McpAuthYmlMissing",
        `Cannot inject the auth action: '${args.ymlPath}' was not produced by the render phase.`
      )
    );
  }
  const identifiers = mcpAuthIdentifiers(args.mcpServerUrl);
  const endpoints = await resolveEndpoints(args.authType, args.mcpServerUrl, ctx.warn);
  const injectResult = injectMcpAuthActionYaml(current.toString("utf8"), {
    authType: args.authType,
    authName: identifiers.namespace,
    registrationId: identifiers.registrationId,
    mcpServerUrl: args.mcpServerUrl,
    endpoints,
    ...(args.authType === "oauth" && args.credentialFields?.clientId
      ? {
          credentialEnvNames: {
            clientId: identifiers.clientId,
            ...(args.credentialFields.clientSecret
              ? { clientSecret: identifiers.clientSecret }
              : {}),
            ...(args.credentialFields.scope ? { scope: identifiers.scope } : {}),
          },
        }
      : {}),
    ...(args.authType === "entra-sso" && args.credentialFields?.clientId
      ? { credentialEnvNames: { clientId: identifiers.clientId } }
      : {}),
  });
  if (injectResult.isErr()) {
    return err(injectResult.error);
  }
  if (injectResult.value.wellKnownUrlPlaceholderUsed) {
    ctx.warn?.(getLocalizedString("core.MCPForDA.mcpAuthDcrPlaceholderWarning", args.mcpServerUrl));
  }
  if (injectResult.value.oauthUrlPlaceholderUsed) {
    ctx.warn?.(
      getLocalizedString(
        "core.MCPForDA.mcpAuthOAuthPlaceholderWarning",
        args.mcpServerUrl,
        MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER,
        MCP_OAUTH_TOKEN_URL_PLACEHOLDER
      )
    );
  }
  ctx.write(args.ymlPath, Buffer.from(injectResult.value.yaml, "utf8"));
  return ok(undefined);
}

/**
 * Persist the deterministic registration placeholder and the static credentials collected during
 * create. The runtime routes `SECRET_*` through its encrypted user-environment storage.
 */
export function persistMcpAuthRegistrationEnv(
  ctx: StepContext,
  args: {
    authType: string;
    mcpServerUrl: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthScopes?: string;
    entraClientId?: string;
  }
): Promise<Result<void, FxError>> {
  const identifiers = mcpAuthIdentifiers(args.mcpServerUrl);
  const values: Record<string, string> = { [identifiers.registrationId]: "" };
  if (args.authType === "oauth") {
    if (args.oauthClientId !== undefined) {
      values[identifiers.clientId] = args.oauthClientId;
    }
    if (args.oauthClientSecret !== undefined) {
      values[identifiers.clientSecret] = args.oauthClientSecret;
    }
    if (args.oauthScopes?.trim()) {
      values[identifiers.scope] = args.oauthScopes;
    }
  } else if (args.authType === "entra-sso" && args.entraClientId !== undefined) {
    values[identifiers.clientId] = args.entraClientId;
  }
  return ctx.writeEnvironment(CREATE_ENVIRONMENT, values);
}
