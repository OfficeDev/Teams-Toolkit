// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

/** Declarative Agent manifest mutation steps for modify flows. */

const SOURCE = "Scaffold";

/** Engine step name `da-action/register-plugin-manifest`. */
export const STEP_REGISTER_PLUGIN_MANIFEST = "da-action/register-plugin-manifest";

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAction(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.file === "string" &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function parseJsonObject(
  json: Buffer,
  errorName: string,
  filePath: string
): Result<Record<string, unknown>, FxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.toString("utf8"));
  } catch {
    return err(systemError(errorName, `'${filePath}' is not valid JSON.`));
  }
  if (!isRecord(parsed)) {
    return err(systemError(errorName, `'${filePath}' must be a JSON object.`));
  }
  return ok(parsed);
}

function firstFileFromArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const first = value[0];
  return isRecord(first) && typeof first.file === "string" ? first.file : undefined;
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function declarativeAgentFile(teamsManifest: Record<string, unknown>): string | undefined {
  const copilotExtensions = nestedRecord(teamsManifest, "copilotExtensions");
  const legacy = firstFileFromArray(copilotExtensions?.declarativeCopilots);
  if (legacy !== undefined) {
    return legacy;
  }

  const copilotAgents = nestedRecord(teamsManifest, "copilotAgents");
  const current = firstFileFromArray(copilotAgents?.declarativeAgents);
  if (current !== undefined) {
    return current;
  }

  return firstFileFromArray(teamsManifest.declarativeAgents);
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

function upsertAction(
  manifest: Record<string, unknown>,
  action: Record<string, string>
): Record<string, unknown>[] {
  const existing = manifest.actions;
  const actions = Array.isArray(existing) ? existing.filter(isAction) : [];
  const index = actions.findIndex((item) => item.file === action.file);
  if (index === -1) {
    actions.push(action);
  } else {
    actions[index] = action;
  }
  manifest.actions = actions;
  return actions;
}

function readRequired(
  ctx: StepContext,
  filePath: string,
  errorName: string
): Result<Buffer, FxError> {
  const current = ctx.read(filePath);
  if (current === undefined) {
    return err(systemError(errorName, `Cannot read '${filePath}'.`));
  }
  return ok(current);
}

/** Registered step for adding a rendered API plugin manifest as a DA action. */
export const daActionRegisterPluginManifest: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "teamsManifestPath") === undefined) {
      return "missing string parameter 'teamsManifestPath'";
    }
    if (stringParam(resolved, "pluginManifestPath") === undefined) {
      return "missing string parameter 'pluginManifestPath'";
    }
    return undefined;
  },
  apply(resolved: StepParams, ctx: StepContext): Result<void, FxError> {
    const teamsManifestPath = stringParam(resolved, "teamsManifestPath");
    const pluginManifestPath = stringParam(resolved, "pluginManifestPath");
    if (teamsManifestPath === undefined || pluginManifestPath === undefined) {
      return err(systemError("DaActionRegisterParams", "resolved parameters are not all strings"));
    }

    const teamsManifestRaw = readRequired(ctx, teamsManifestPath, "DaActionTeamsManifestMissing");
    if (teamsManifestRaw.isErr()) {
      return err(teamsManifestRaw.error);
    }
    const teamsManifest = parseJsonObject(
      teamsManifestRaw.value,
      "DaActionTeamsManifestInvalid",
      teamsManifestPath
    );
    if (teamsManifest.isErr()) {
      return err(teamsManifest.error);
    }

    const agentFile = declarativeAgentFile(teamsManifest.value);
    if (agentFile === undefined) {
      return err(
        systemError(
          "DaActionManifestFileMissing",
          `The Teams manifest '${teamsManifestPath}' does not reference a declarative agent manifest.`
        )
      );
    }

    const agentManifestPath = resolveSiblingPath(teamsManifestPath, agentFile);
    const agentManifestRaw = readRequired(ctx, agentManifestPath, "DaActionManifestMissing");
    if (agentManifestRaw.isErr()) {
      return err(agentManifestRaw.error);
    }
    const agentManifest = parseJsonObject(
      agentManifestRaw.value,
      "DaActionManifestInvalid",
      agentManifestPath
    );
    if (agentManifest.isErr()) {
      return err(agentManifest.error);
    }

    upsertAction(agentManifest.value, {
      id: actionId(pluginManifestPath),
      file: pluginFileRelativeToAgent(agentManifestPath, pluginManifestPath),
    });
    ctx.write(
      agentManifestPath,
      Buffer.from(JSON.stringify(agentManifest.value, null, 2) + "\n", "utf8")
    );
    return ok(undefined);
  },
};
