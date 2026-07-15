// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err } from "neverthrow";
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

    return ctx
      .manifestWrapper("declarativeAgent")
      .registerDeclarativeAgentAction(teamsManifestPath, pluginManifestPath);
  },
};
