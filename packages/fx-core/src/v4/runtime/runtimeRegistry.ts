// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  DeclarativeAgentManifestWrapper,
  FxError,
  SystemError,
  TeamsManifestWrapper,
} from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import path from "path";
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
  GeneralSensitivityLabelService,
  NOOP_GENERAL_SENSITIVITY_LABEL_SERVICE,
  STEP_SET_SENSITIVITY_LABEL,
  createDaSetSensitivityLabelStep,
} from "./steps/daSensitivity";
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

/** Generic named-step lookup assembled at a runtime composition boundary. */
export type StepRegistry = ReadonlyMap<string, RegisteredStep>;

/** Bind runtime-owned business adapters into the closed post-render step whitelist. */
export function createStepRegistry(
  generalSensitivityLabel: GeneralSensitivityLabelService = NOOP_GENERAL_SENSITIVITY_LABEL_SERVICE
): StepRegistry {
  return new Map<string, RegisteredStep>([
    [STEP_REGISTER_PLUGIN_MANIFEST, daActionRegisterPluginManifest],
    [STEP_SET_SENSITIVITY_LABEL, createDaSetSensitivityLabelStep(generalSensitivityLabel)],
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
}

/** Default post-render step whitelist for offline runtimes and compatibility tests. */
export const STEP_REGISTRY = createStepRegistry();

/** No-op wrapper for create flows that do not mutate a manifest. */
export const NOOP_MANIFEST_WRAPPER: ManifestWrapper = {
  registerDeclarativeAgentAction: () =>
    err(
      manifestError(
        "ManifestMutationUnavailable",
        "the current runtime does not provide manifest mutation"
      )
    ),
};

function manifestError(name: string, message: string, cause?: unknown): SystemError {
  return cause instanceof Error
    ? new SystemError({ source: "Scaffold", name, message, error: cause })
    : new SystemError({ source: "Scaffold", name, message });
}

function normalizeTargetPath(entryPath: string): string {
  return entryPath.replace(/\\/g, "/");
}

function resolveSiblingPath(baseFile: string, relativeFile: string): string {
  return normalizeTargetPath(
    path.posix.normalize(path.posix.join(path.posix.dirname(baseFile), relativeFile))
  );
}

function pluginFileRelativeToAgent(agentManifestPath: string, pluginManifestPath: string): string {
  return normalizeTargetPath(
    path.posix.relative(path.posix.dirname(agentManifestPath), pluginManifestPath)
  );
}

function actionId(pluginManifestPath: string): string {
  const basename = path.posix.basename(pluginManifestPath, path.posix.extname(pluginManifestPath));
  return basename.startsWith("ai-plugin-") ? basename.substring("ai-plugin-".length) : basename;
}

function readManifest(
  sink: FileSink,
  filePath: string,
  missingErrorName: string,
  readErrorName: string
): Result<Buffer, FxError> {
  try {
    const contents = sink.read(filePath);
    return contents === undefined
      ? err(manifestError(missingErrorName, `Cannot read '${filePath}'.`))
      : ok(contents);
  } catch (error) {
    return err(manifestError(readErrorName, `Cannot read '${filePath}'.`, error));
  }
}

function registerDeclarativeAgentAction(
  sink: FileSink,
  teamsManifestPath: string,
  pluginManifestPath: string
): Result<void, FxError> {
  const teamsManifestContents = readManifest(
    sink,
    teamsManifestPath,
    "DaActionTeamsManifestMissing",
    "DaActionTeamsManifestReadFailed"
  );
  if (teamsManifestContents.isErr()) {
    return err(teamsManifestContents.error);
  }

  let teamsManifest: TeamsManifestWrapper;
  try {
    teamsManifest = TeamsManifestWrapper.fromJSON(teamsManifestContents.value.toString("utf8"));
  } catch {
    return err(
      manifestError("DaActionTeamsManifestInvalid", `'${teamsManifestPath}' is not valid JSON.`)
    );
  }
  const agentFile = teamsManifest.getDeclarativeAgentPaths()[0];
  if (agentFile === undefined) {
    return err(
      manifestError(
        "DaActionManifestFileMissing",
        `The Teams manifest '${teamsManifestPath}' does not reference a declarative agent manifest.`
      )
    );
  }

  const agentManifestPath = resolveSiblingPath(teamsManifestPath, agentFile);
  const agentManifestContents = readManifest(
    sink,
    agentManifestPath,
    "DaActionManifestMissing",
    "DaActionManifestReadFailed"
  );
  if (agentManifestContents.isErr()) {
    return err(agentManifestContents.error);
  }

  let agentManifest: DeclarativeAgentManifestWrapper;
  try {
    agentManifest = DeclarativeAgentManifestWrapper.fromJSON(
      agentManifestContents.value.toString("utf8")
    );
  } catch {
    return err(
      manifestError("DaActionManifestInvalid", `'${agentManifestPath}' is not valid JSON.`)
    );
  }
  agentManifest.upsertAction(
    actionId(pluginManifestPath),
    pluginFileRelativeToAgent(agentManifestPath, pluginManifestPath)
  );
  try {
    sink.write(agentManifestPath, Buffer.from(agentManifest.toJSON(), "utf8"));
  } catch (error) {
    return err(
      manifestError("DaActionManifestWriteFailed", `Cannot write '${agentManifestPath}'.`, error)
    );
  }
  return ok(undefined);
}

function buildManifestWrapper(sink: FileSink): ManifestWrapper {
  return {
    registerDeclarativeAgentAction: (teamsManifestPath, pluginManifestPath) =>
      registerDeclarativeAgentAction(sink, teamsManifestPath, pluginManifestPath),
    setSensitivityLabel: (manifestPath: string, id: string): Result<void, FxError> => {
      const contents = readManifest(
        sink,
        manifestPath,
        "DaSensitivityLabelManifestMissing",
        "DaSensitivityLabelManifestReadFailed"
      );
      if (contents.isErr()) {
        return err(contents.error);
      }

      let serialized: Buffer;
      try {
        const wrapper = DeclarativeAgentManifestWrapper.fromJSON(contents.value.toString("utf8"));
        wrapper.setSensitivityLabel(id);
        serialized = Buffer.from(wrapper.toJSON(), "utf8");
      } catch (error) {
        return err(
          manifestError(
            "DaSensitivityLabelManifestInvalid",
            "the Declarative Agent manifest to label is invalid",
            error
          )
        );
      }
      try {
        sink.write(manifestPath, serialized);
        return ok(undefined);
      } catch (error) {
        return err(
          manifestError(
            "DaSensitivityLabelManifestWriteFailed",
            `Cannot write '${manifestPath}'.`,
            error
          )
        );
      }
    },
  };
}

/** Runtime-specific file sink injected behind the shared pipeline port. */
export interface FileSink {
  /** Persist `data` at `path` (a target-relative, forward-slash path). */
  write(path: string, data: Buffer): void;
  /** Read back a previously written file, or `undefined` when absent (EAFP). */
  read(path: string): Buffer | undefined;
}

/** Runtime-owned persistence boundary for regular and secret environment values. */
export type EnvironmentWriter = (
  environment: string,
  values: Record<string, string>
) => Promise<Result<void, FxError>>;

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
  sink: FileSink,
  environmentWriter: EnvironmentWriter,
  stepRegistry: StepRegistry = STEP_REGISTRY,
  warningSink?: (message: string) => void
): PipelineRuntimePort {
  return {
    pipelineRegistry: (name: string): Orchestration | undefined =>
      KNOWN_PIPELINES.has(name) ? { name } : undefined,
    stepRegistry: (name: string): RegisteredStep | undefined => stepRegistry.get(name),
    evalWhen: (expr: string, renderVars: RenderVars): Result<boolean, FxError> =>
      evaluateExpression({ expr }, scalarScope(renderVars), exprPort).map(
        (value) => value === true
      ),
    render: (mustache: string, renderVars: RenderVars): Result<string, FxError> =>
      renderMustache(mustache, renderVars),
    manifestWrapper: (): ManifestWrapper => buildManifestWrapper(sink),
    warn: warningSink,
    write: (path: string, data: Buffer): void => sink.write(path, data),
    writeEnvironment: environmentWriter,
    read: (path: string): Buffer | undefined => sink.read(path),
  };
}
