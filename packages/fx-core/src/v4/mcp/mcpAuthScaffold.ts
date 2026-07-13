// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { getLocalizedString } from "../../common/localizeUtils";
import { ResolvedMCPAuthEndpoints, injectMcpAuthActionYaml } from "./mcpAuthAction";
import { probeMCPServerAuth, resolveMCPOAuthMetadata } from "../../common/mcpToolFetcher";
import { StepContext } from "../pipeline/runScaffoldPipeline";
import { deriveMcpServerName } from "../runtime/whitelist";

/**
 * v4 MCP-auth facade. The v4-owned YAML action mutator produces the create/add auth action shape
 * for every auth type (`oauth`/`entra-sso` -> `oauth/register`, `oauth-dynamic` -> `dcr/register`
 * with the v1.13 schema bump).
 *
 * Credential env persistence (v3 `persistMCPAuthCredentialEnvVars`) is intentionally NOT run at
 * scaffold time: it encrypts the `SECRET_*` client secret with `LocalCrypto(projectId)`, and
 * `settingsUtil.readSettings` materializes that `projectId` from a fresh `uuid.v4()` when the yml
 * lacks one. That non-determinism would break the deterministic-scaffold contract
 * (SCN-CREATE-MCP-10). So the action is injected with `persistCredentialEnvRefs: false` (create
 * and add do not collect credentials; the existing `oauth/register` question middleware asks for
 * missing values at provision), and only the deterministic `MCP_DA_AUTH_ID_<NS>` registration
 * placeholder is written here (SCN-CREATE-MCP-06/15/16, SCN-ADD-MCP-07/10).
 */

const SOURCE = "Scaffold";

/** MCP create/add scaffolding targets the `dev` environment for the registration placeholder. */
const CREATE_ENV_FILE = "env/.env.dev";

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
} {
  const namespace = deriveMcpServerName(mcpServerUrl);
  return {
    namespace,
    registrationId: `MCP_DA_AUTH_ID_${namespace.toUpperCase()}`,
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
      undefined
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
  args: { ymlPath: string; authType: string; mcpServerUrl: string }
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
  const { namespace, registrationId } = mcpAuthIdentifiers(args.mcpServerUrl);
  const endpoints = await resolveEndpoints(args.authType, args.mcpServerUrl, ctx.warn);
  const injectResult = injectMcpAuthActionYaml(current.toString("utf8"), {
    authType: args.authType,
    authName: namespace,
    registrationId,
    mcpServerUrl: args.mcpServerUrl,
    endpoints,
  });
  if (injectResult.isErr()) {
    return err(injectResult.error);
  }
  if (injectResult.value.wellKnownUrlPlaceholderUsed) {
    ctx.warn?.(getLocalizedString("core.MCPForDA.mcpAuthDcrPlaceholderWarning", args.mcpServerUrl));
  }
  ctx.write(args.ymlPath, Buffer.from(injectResult.value.yaml, "utf8"));
  return ok(undefined);
}

/** True if the dotenv content already declares `name=…` (idempotency guard). */
function containsEnvVar(envContent: string, name: string): boolean {
  return envContent.split("\n").some((line) => line.startsWith(name + "="));
}

/**
 * Write the deterministic `MCP_DA_AUTH_ID_<NS>=` registration placeholder into `env/.env.dev`
 * (SCN-CREATE-MCP-06). The value is populated at provision by the injected action's
 * `writeToEnvironmentFile.configurationId`.
 */
export function persistMcpAuthRegistrationEnv(
  ctx: StepContext,
  args: { mcpServerUrl: string }
): Result<void, FxError> {
  const { registrationId } = mcpAuthIdentifiers(args.mcpServerUrl);
  const current = ctx.read(CREATE_ENV_FILE);
  const base = current ? current.toString("utf8") : "";
  if (containsEnvVar(base, registrationId)) {
    return ok(undefined);
  }
  const separator = base.length > 0 && !base.endsWith("\n") ? "\n" : "";
  ctx.write(CREATE_ENV_FILE, Buffer.from(base + separator + registrationId + "=\n", "utf8"));
  return ok(undefined);
}
