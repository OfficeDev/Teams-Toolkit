// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { Result } from "neverthrow";
import { RenderVars } from "../model/dataModel";
import { ExpressionRuntimePort, Scope, evaluateExpression } from "../expression/evaluateExpression";
import {
  ManifestWrapper,
  Orchestration,
  PipelineRuntimePort,
  RegisteredStep,
} from "../pipeline/runScaffoldPipeline";
import { renderMustache } from "./renderMustache";
import { STEP_REGISTER_PLUGIN_MANIFEST, daActionRegisterPluginManifest } from "./steps/daAction";
import {
  STEP_INJECT_YML_ACTION,
  STEP_PERSIST_CREDENTIAL_ENV,
  mcpAuthInjectYmlAction,
  mcpAuthPersistCredentialEnv,
} from "./steps/mcpAuth";
import { STEP_MATERIALIZE_LOCAL_SERVERS, mcpLocalMaterializeServers } from "./steps/mcpLocal";
import { STEP_MATERIALIZE_STATIC_MCP_TOOLS, mcpStaticMaterializeTools } from "./steps/mcpStatic";
import {
  STEP_IMPORT_EXISTING_OFFICE_ADDIN_PROJECT,
  officeAddinImportExistingProject,
} from "./steps/officeAddin";
import {
  STEP_GENERATE_OPENAPI_PLUGIN_FILES,
  STEP_GENERATE_TEAMS_AI_CUSTOM_API_FILES,
  openApiGeneratePluginFiles,
  openApiGenerateTeamsAiCustomApiFiles,
} from "./steps/openApi";
import {
  STEP_UNIFY_PROJECT_ID,
  STEP_UPGRADE_EXISTING_PROJECT,
  metaOsUnifyProjectId,
  metaOsUpgradeExistingProject,
} from "./steps/metaOs";

/** Shared v4 pipeline registry and port factory. See ADR-0017 for whitelist rules. */

/** The orchestration names the engine knows (ADR-0017 closed whitelist). */
export const KNOWN_PIPELINES = new Set(["default", "openapi", "typespec", "officeAddin", "spfx"]);

/** The post-render step whitelist (ADR-0017 decision 2). */
export const STEP_REGISTRY = new Map<string, RegisteredStep>([
  [STEP_REGISTER_PLUGIN_MANIFEST, daActionRegisterPluginManifest],
  [STEP_INJECT_YML_ACTION, mcpAuthInjectYmlAction],
  [STEP_PERSIST_CREDENTIAL_ENV, mcpAuthPersistCredentialEnv],
  [STEP_MATERIALIZE_LOCAL_SERVERS, mcpLocalMaterializeServers],
  [STEP_MATERIALIZE_STATIC_MCP_TOOLS, mcpStaticMaterializeTools],
  [STEP_GENERATE_OPENAPI_PLUGIN_FILES, openApiGeneratePluginFiles],
  [STEP_GENERATE_TEAMS_AI_CUSTOM_API_FILES, openApiGenerateTeamsAiCustomApiFiles],
  [STEP_IMPORT_EXISTING_OFFICE_ADDIN_PROJECT, officeAddinImportExistingProject],
  [STEP_UNIFY_PROJECT_ID, metaOsUnifyProjectId],
  [STEP_UPGRADE_EXISTING_PROJECT, metaOsUpgradeExistingProject],
]);

/** No-op wrapper for create flows that do not mutate a manifest. */
export const NOOP_MANIFEST_WRAPPER: ManifestWrapper = {
  addAction: () => undefined,
};

/** Runtime-specific file sink injected behind the shared pipeline port. */
export interface FileSink {
  /** Persist `data` at `path` (a target-relative, forward-slash path). */
  write(path: string, data: Buffer): void;
  /** Read back a previously written file, or `undefined` when absent (EAFP). */
  read(path: string): Buffer | undefined;
}

/** Drop list-valued render vars before calling the scalar expression evaluator. */
function scalarScope(renderVars: RenderVars): Scope {
  const scope: Scope = {};
  for (const [key, value] of Object.entries(renderVars)) {
    if (Array.isArray(value)) {
      continue;
    }
    scope[key] = value;
  }
  return scope;
}

/** Build the shared pipeline port over an injected file sink. */
export function buildPipelinePort(
  exprPort: ExpressionRuntimePort,
  sink: FileSink
): PipelineRuntimePort {
  return {
    pipelineRegistry: (name: string): Orchestration | undefined =>
      KNOWN_PIPELINES.has(name) ? { name } : undefined,
    stepRegistry: (name: string): RegisteredStep | undefined => STEP_REGISTRY.get(name),
    evalWhen: (expr: string, renderVars: RenderVars): Result<boolean, FxError> =>
      evaluateExpression({ expr }, scalarScope(renderVars), exprPort).map(
        (value) => value === true
      ),
    render: (mustache: string, renderVars: RenderVars): Result<string, FxError> =>
      renderMustache(mustache, renderVars),
    manifestWrapper: (): ManifestWrapper => NOOP_MANIFEST_WRAPPER,
    write: (path: string, data: Buffer): void => sink.write(path, data),
    read: (path: string): Buffer | undefined => sink.read(path),
  };
}
