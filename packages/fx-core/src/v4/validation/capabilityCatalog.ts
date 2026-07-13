// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import type { CapabilityKind } from "./validateTemplatePackage";

/** Source-owned introduction versions for every template-visible engine capability. */
const CAPABILITY_FLOORS: Record<CapabilityKind, ReadonlyMap<string, string>> = {
  step: new Map([
    ["require-empty-target", "5.20.0"],
    ["da-action/register-plugin-manifest", "5.20.0"],
    ["da/set-sensitivity-label", "6.11.0"],
    ["mcp-auth/inject-yml-action", "5.20.0"],
    ["mcp-auth/persist-credential-env", "5.20.0"],
    ["mcp-local/materialize-servers", "5.20.0"],
    ["mcp-static/materialize-tools", "5.20.0"],
    ["metaos/unify-project-id", "5.20.0"],
    ["metaos/upgrade-existing-project", "5.20.0"],
    ["officeaddin/import-existing-project", "5.20.0"],
    ["openapi/generate-plugin-files", "5.20.0"],
    ["openapi/generate-teams-ai-custom-api-files", "5.20.0"],
  ]),
  provider: new Map([
    ["mcp.serverTypes", "5.20.0"],
    ["mcp.localServers", "5.20.0"],
    ["mcp.tools", "5.20.0"],
    ["openapi.search", "5.20.0"],
    ["openapi.operations", "5.20.0"],
  ]),
  validator: new Map([
    ["uri", "5.20.0"],
    ["openapiUrl", "5.20.0"],
    ["graphConnectorName", "5.20.0"],
    ["graphConnectorConnectionId", "5.20.0"],
  ]),
};

const CAPABILITY_OUTPUTS: Record<CapabilityKind, ReadonlyMap<string, readonly string[]>> = {
  step: new Map(),
  provider: new Map([
    ["mcp.serverTypes", ["catalog"]],
    ["mcp.tools", ["toolsJson"]],
  ]),
  validator: new Map(),
};

/** Return when a template-visible capability first became available in the engine. */
export function templateCapabilityFloor(kind: CapabilityKind, id: string): string | undefined {
  return CAPABILITY_FLOORS[kind].get(id);
}

/** Enumerate a capability kind for registry/catalogue parity tests. */
export function templateCapabilities(kind: CapabilityKind): string[] {
  return [...CAPABILITY_FLOORS[kind].keys()];
}

/** Return the render-context keys a capability may derive. */
export function templateCapabilityOutputs(kind: CapabilityKind, id: string): string[] {
  return [...(CAPABILITY_OUTPUTS[kind].get(id) ?? [])];
}
