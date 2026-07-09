// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as sharedOpts from "../handlers/sharedOpts";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent } from "../telemetry/extTelemetryEvents";
import { CreateProjectResult, FxError, Result, Stage, ok } from "@microsoft/teamsfx-api";
import * as systemEnvUtils from "../utils/systemEnvUtils";
import { getTriggerFromProperty } from "../utils/telemetryUtils";

export async function createProjectFromWalkthroughHandler(
  args?: any[]
): Promise<Result<CreateProjectResult, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CreateProjectStart, getTriggerFromProperty(args));

  // parse questions model answers to inputs
  const inputs = systemEnvUtils.getSystemInputs();
  if (args && args.length >= 2 && args[1]) {
    Object.keys(args[1]).forEach((k) => {
      inputs[k] = args[1][k];
    });
  }

  const result = await sharedOpts.runCommand(Stage.create, inputs);
  return result;
}

export function getBuildIntelligentAppsWalkthroughID() {
  return "TeamsDevApp.ms-teams-vscode-extension#buildIntelligentApps";
}

export async function openBuildIntelligentAppsWalkthroughHandler(
  ...args: unknown[]
): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.WalkThroughBuildIntelligentApps,
    getTriggerFromProperty(args)
  );
  const data = await vscode.commands.executeCommand(
    "workbench.action.openWalkthrough",
    getBuildIntelligentAppsWalkthroughID()
  );
  return Promise.resolve(ok(data));
}
