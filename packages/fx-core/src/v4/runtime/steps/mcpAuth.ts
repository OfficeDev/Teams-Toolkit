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

function stringArrayParam(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
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
    if (
      resolved.optionalYmlPaths !== undefined &&
      stringArrayParam(resolved, "optionalYmlPaths") === undefined
    ) {
      return "parameter 'optionalYmlPaths' must be a string array";
    }
    return undefined;
  },
  apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const ymlPath = stringParam(resolved, "ymlPath");
    const authType = stringParam(resolved, "authType");
    const mcpServerUrl = stringParam(resolved, "mcpServerUrl");
    if (ymlPath === undefined || authType === undefined || mcpServerUrl === undefined) {
      return Promise.resolve(
        err(systemError("McpAuthInjectParams", "resolved parameters are not all strings"))
      );
    }
    return injectMcpAuthAction(ctx, {
      ymlPath,
      authType,
      mcpServerUrl,
      optionalYmlPaths: stringArrayParam(resolved, "optionalYmlPaths"),
      credentialFields: {
        clientId: authType === "oauth" || authType === "entra-sso",
        clientSecret: authType === "oauth",
        scope: Boolean(stringParam(resolved, "oauthScopes")?.trim()),
        apiKey: authType === "bearer-token",
      },
    });
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
    return undefined;
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
      apiKey: stringParam(resolved, "apiKey"),
    });
  },
};
