// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err } from "neverthrow";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";
import { injectMcpAuthAction, persistMcpAuthRegistrationEnv } from "../../mcp/mcpAuthScaffold";

/** MCP auth post-render steps for the create flow. See create-mcp-server scenario spec. */

const SOURCE = "Scaffold";

/** Engine step name `mcp-auth/inject-yml-action`. */
export const STEP_INJECT_YML_ACTION = "mcp-auth/inject-yml-action";

/** Engine step name `mcp-auth/persist-credential-env`. */
export const STEP_PERSIST_CREDENTIAL_ENV = "mcp-auth/persist-credential-env";

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

/** Read a `with` value as a string, or `undefined` if it is absent / non-string. */
function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function validateCredentialParams(resolved: StepParams, authType: string): string | undefined {
  if (authType === "oauth") {
    if (!stringParam(resolved, "oauthClientId")?.trim()) {
      return "missing non-empty string parameter 'oauthClientId'";
    }
    if (!stringParam(resolved, "oauthClientSecret")?.trim()) {
      return "missing non-empty string parameter 'oauthClientSecret'";
    }
  } else if (authType === "entra-sso" && !stringParam(resolved, "entraClientId")?.trim()) {
    return "missing non-empty string parameter 'entraClientId'";
  }
  return undefined;
}

/** Registered step for injecting the shared v4 MCP auth action into `m365agents.yml`. */
export const mcpAuthInjectYmlAction: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "ymlPath") === undefined) {
      return "missing string parameter 'ymlPath'";
    }
    const authType = stringParam(resolved, "authType");
    if (authType === undefined) {
      return "missing string parameter 'authType'";
    }
    if (stringParam(resolved, "mcpServerUrl") === undefined) {
      return "missing string parameter 'mcpServerUrl'";
    }
    return validateCredentialParams(resolved, authType);
  },
  apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const ymlPath = stringParam(resolved, "ymlPath");
    const authType = stringParam(resolved, "authType");
    const mcpServerUrl = stringParam(resolved, "mcpServerUrl");
    const oauthScopes = stringParam(resolved, "oauthScopes");
    if (ymlPath === undefined || authType === undefined || mcpServerUrl === undefined) {
      return Promise.resolve(
        err(systemError("McpAuthInjectParams", "resolved parameters are not all strings"))
      );
    }
    return injectMcpAuthAction(ctx, { ymlPath, authType, mcpServerUrl, oauthScopes });
  },
};

/**
 * Registered step for writing the deterministic `MCP_DA_AUTH_ID_<NS>` registration placeholder into
 * `env/.env.dev`.
 */
export const mcpAuthPersistCredentialEnv: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    const authType = stringParam(resolved, "authType");
    if (authType === undefined) {
      return "missing string parameter 'authType'";
    }
    if (stringParam(resolved, "mcpServerUrl") === undefined) {
      return "missing string parameter 'mcpServerUrl'";
    }
    return validateCredentialParams(resolved, authType);
  },
  apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const authType = stringParam(resolved, "authType");
    const mcpServerUrl = stringParam(resolved, "mcpServerUrl");
    if (authType === undefined || mcpServerUrl === undefined) {
      return Promise.resolve(
        err(systemError("McpAuthPersistParams", "resolved parameters are not all strings"))
      );
    }
    return persistMcpAuthRegistrationEnv(ctx, {
      authType,
      mcpServerUrl,
      oauthClientId: stringParam(resolved, "oauthClientId"),
      oauthClientSecret: stringParam(resolved, "oauthClientSecret"),
      oauthScopes: stringParam(resolved, "oauthScopes"),
      entraClientId: stringParam(resolved, "entraClientId"),
    });
  },
};
