// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs } from "@microsoft/teamsfx-api";

import { QuestionNames } from "../../question/questionNames";
import { ActionInjector } from "../configManager/actionInjector";
import { envUtil } from "./envUtil";
import { resolveMCPOAuthMetadata } from "./mcpToolFetcher";

/**
 * Indirection seam for the `mcpToolFetcher` functions this scaffolder calls, so
 * unit tests can stub them on a plain object. Sinon cannot reliably stub a
 * module's named export under the vitest module transform; stubbing a property
 * on this object always works.
 */

/**
 * Resolved authorization-server endpoints relevant to the MCP scaffolder.
 * `wellKnownUrl` is what `oauth-dynamic` (`dcr/register`) uses for
 * `wellKnownAuthorizationServer`; static `oauth` ignores it.
 */
export const mcpAuthScaffolderDeps = {
  resolveMCPOAuthMetadata,
};

export interface ResolvedMCPAuthEndpoints {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  wellKnownUrl?: string;
}

/**
 * Derive the `runtimes[0].auth` block for the ai-plugin manifest based on the
 * user's `mcp-da-auth-type` choice. Returns the `OAuthPluginVault` block when
 * auth is required and a registration id is available; returns `undefined` for
 * `"none"` (or any state where no `oauth/register` / `dcr/register` action has
 * been wired). Callers decide whether to omit the `auth` field or substitute
 * `{ type: "None" }` based on their manifest convention.
 */
export function deriveMCPManifestOAuth(
  authType: string | undefined,
  registrationId: string | undefined
): { type: "OAuthPluginVault"; reference_id: string } | undefined {
  if (authType && authType !== "none" && registrationId) {
    return {
      type: "OAuthPluginVault",
      reference_id: `\${{${registrationId}}}`,
    };
  }
  return undefined;
}

/**
 * Resolve OAuth endpoints based on the user's `mcp-da-auth-type` choice.
 *
 * - `oauth` and `oauth-dynamic`: probe `resource_metadata` /
 *   `.well-known/oauth-authorization-server` to discover authorization/token URLs.
 *   `oauth-dynamic` also needs the well-known URL itself for `dcr/register`.
 * - `entra-sso` and `none`: returns empty (no static endpoints to resolve).
 */
export async function resolveMCPAuthEndpoints(
  authType: string | undefined,
  inputs: Inputs
): Promise<ResolvedMCPAuthEndpoints> {
  if (authType !== "oauth" && authType !== "oauth-dynamic") {
    return {};
  }
  const metadata = await mcpAuthScaffolderDeps.resolveMCPOAuthMetadata(
    inputs[QuestionNames.MCPForDAAuthMetadataUrl],
    inputs[QuestionNames.MCPForDAAuthWellKnownUrl]
  );
  return {
    authorizationUrl: metadata.authorizationUrl,
    tokenUrl: metadata.tokenUrl,
    refreshUrl: metadata.refreshUrl,
    wellKnownUrl: metadata.wellKnownUrl,
  };
}

/**
 * Placeholder written to `wellKnownAuthorizationServer` when the
 * `oauth-dynamic` flow can't auto-discover the URL at scaffold time. The
 * developer must replace this before provisioning. Surfaced via the
 * `wellKnownUrlPlaceholderUsed` return flag so callers can emit a warning.
 */
export const MCP_DCR_WELL_KNOWN_URL_PLACEHOLDER =
  "<PLEASE_FILL_IN_WELL_KNOWN_AUTHORIZATION_SERVER_URL>";

export interface InjectMCPAuthActionResult {
  /** True when `oauth-dynamic` was injected with the placeholder URL because
   * `endpoints.wellKnownUrl` was missing. */
  wellKnownUrlPlaceholderUsed?: boolean;
}

/**
 * Inject the appropriate `oauth/register` or `dcr/register` action into
 * `m365agents.yml` based on the user's `mcp-da-auth-type` choice. `none`
 * is a no-op. `oauth-dynamic` routes to the DCR injector; `oauth` and
 * `entra-sso` share the OAuth injector (the injector itself selects
 * Custom vs. MicrosoftEntra based on `authType`).
 *
 * When `persistCredentialEnvRefs` is set (DT mode), the OAuth injector
 * adds explicit `${{...}}` references to credential env vars derived from
 * `serverName` so that `oauth/register` resolves credentials from env files
 * persisted by the add-action flow instead of the in-process bridge.
 *
 * `oauth-dynamic` is always injected even when `endpoints.wellKnownUrl` is
 * missing — a placeholder string is written instead so the action shows up in
 * `m365agents.yml` for the developer to fix. The return flag tells the caller
 * to emit a visible warning.
 */
export async function injectMCPAuthActionToYml(args: {
  ymlPath: string;
  authType: string;
  authName: string;
  registrationId: string;
  mcpServerUrl: string;
  endpoints: ResolvedMCPAuthEndpoints;
  persistCredentialEnvRefs?: boolean;
  serverName?: string;
}): Promise<InjectMCPAuthActionResult> {
  if (args.authType === "none") return {};
  if (args.authType === "oauth-dynamic") {
    const placeholderUsed = !args.endpoints.wellKnownUrl;
    const wellKnownUrl = args.endpoints.wellKnownUrl ?? MCP_DCR_WELL_KNOWN_URL_PLACEHOLDER;
    await ActionInjector.injectCreateDcrActionForMCP(
      args.ymlPath,
      args.authName,
      args.registrationId,
      args.mcpServerUrl,
      wellKnownUrl
    );
    return placeholderUsed ? { wellKnownUrlPlaceholderUsed: true } : {};
  }
  let credentialEnvNames:
    | { clientIdEnvName: string; clientSecretEnvName?: string; scopeEnvName?: string }
    | undefined;
  if (args.persistCredentialEnvRefs && args.serverName) {
    if (args.authType === "oauth") {
      credentialEnvNames = {
        clientIdEnvName: `MCP_DA_OAUTH_CLIENT_ID_${args.serverName}`,
        clientSecretEnvName: `SECRET_MCP_DA_OAUTH_CLIENT_SECRET_${args.serverName}`,
        scopeEnvName: `MCP_DA_OAUTH_SCOPE_${args.serverName}`,
      };
    } else if (args.authType === "entra-sso") {
      credentialEnvNames = {
        clientIdEnvName: `MCP_DA_OAUTH_CLIENT_ID_${args.serverName}`,
      };
    }
  }
  await ActionInjector.injectCreateOAuthActionForMCP(
    args.ymlPath,
    args.authType,
    args.authName,
    args.registrationId,
    args.mcpServerUrl,
    args.endpoints.authorizationUrl,
    args.endpoints.tokenUrl,
    args.endpoints.refreshUrl,
    credentialEnvNames
  );
  return {};
}

/**
 * Persist user-provided MCP OAuth credentials into env files so the
 * `oauth/register` action resolves them at provision time via the
 * `${{MCP_DA_OAUTH_*_<SERVERNAME>}}` refs emitted by the injector.
 *
 * - `oauth`: writes `MCP_DA_OAUTH_CLIENT_ID_<NAME>` + optional
 *   `MCP_DA_OAUTH_SCOPE_<NAME>` to `env/.env.<env>`; writes
 *   `SECRET_MCP_DA_OAUTH_CLIENT_SECRET_<NAME>` (auto-encrypted + masked)
 *   to `env/.env.<env>.user`.
 * - `entra-sso`: writes only `MCP_DA_OAUTH_CLIENT_ID_<NAME>`.
 * - `oauth-dynamic` / `none`: no-op.
 *
 * Writes to every env folder entry returned by `envUtil.listEnv` (typically
 * `dev` for fresh scaffolds; multiple envs for existing projects).
 */
export async function persistMCPAuthCredentialEnvVars(args: {
  projectPath: string;
  authType: string;
  serverName: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
}): Promise<void> {
  if (args.authType !== "oauth" && args.authType !== "entra-sso") return;

  const envs: Record<string, string> = {};
  if (args.clientId) {
    envs[`MCP_DA_OAUTH_CLIENT_ID_${args.serverName}`] = args.clientId;
  }
  if (args.authType === "oauth") {
    if (args.clientSecret) {
      envs[`SECRET_MCP_DA_OAUTH_CLIENT_SECRET_${args.serverName}`] = args.clientSecret;
    }
    if (args.scopes) {
      envs[`MCP_DA_OAUTH_SCOPE_${args.serverName}`] = args.scopes;
    }
  }
  if (Object.keys(envs).length === 0) return;

  const listRes = await envUtil.listEnv(args.projectPath);
  if (listRes.isErr()) throw listRes.error;
  const envNames = listRes.value.length > 0 ? listRes.value : ["dev"];
  for (const envName of envNames) {
    const writeRes = await envUtil.writeEnv(args.projectPath, envName, { ...envs });
    if (writeRes.isErr()) throw writeRes.error;
  }
}
