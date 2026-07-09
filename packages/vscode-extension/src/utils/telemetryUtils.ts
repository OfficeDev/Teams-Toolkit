// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as teamsfxCore from "@microsoft/teamsfx-core";
import * as globalVariables from "../globalVariables";
import { TelemetryProperty, TelemetryTriggerFrom } from "../telemetry/extTelemetryEvents";
import * as systemEnvUtils from "./systemEnvUtils";

export function getPackageVersion(versionStr: string): string {
  if (versionStr.includes("alpha")) {
    return "alpha";
  }

  if (versionStr.includes("beta")) {
    return "beta";
  }

  if (versionStr.includes("rc")) {
    return "rc";
  }

  return "formal";
}

export async function getProjectId(): Promise<string | undefined> {
  const workspacePath = globalVariables.workspaceUri?.fsPath;
  const currentCore = globalVariables.core;
  if (!workspacePath || !currentCore) {
    return undefined;
  }
  try {
    const projInfoRes = await currentCore.getProjectId(workspacePath);
    if (projInfoRes.isOk()) {
      return projInfoRes.value;
    }
  } catch (e) {}
  return undefined;
}

export function getTriggerFromProperty(args?: any[]) {
  // if not args are not supplied, by default, it is trigger from "CommandPalette"
  // e.g. vscode.commands.executeCommand("fx-extension.openWelcome");
  // in this case, "fx-exentiosn.openWelcome" is trigged from "CommandPalette".
  if (!args || args.length === 0 || !args[0]) {
    return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.CommandPalette };
  }

  switch ((args[0] as TelemetryTriggerFrom).toString()) {
    case TelemetryTriggerFrom.TreeView:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.TreeView };
    case TelemetryTriggerFrom.ViewTitleNavigation:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.ViewTitleNavigation };
    case TelemetryTriggerFrom.QuickPick:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.QuickPick };
    case TelemetryTriggerFrom.Webview:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Webview };
    case TelemetryTriggerFrom.CodeLens:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.CodeLens };
    case TelemetryTriggerFrom.EditorTitle:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.EditorTitle };
    case TelemetryTriggerFrom.SideBar:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.SideBar };
    case TelemetryTriggerFrom.Notification:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Notification };
    case TelemetryTriggerFrom.WalkThrough:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.WalkThrough };
    case TelemetryTriggerFrom.CopilotChat:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.CopilotChat };
    case TelemetryTriggerFrom.Auto:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Auto };
    case TelemetryTriggerFrom.ExternalUrl:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.ExternalUrl };
    case TelemetryTriggerFrom.Other:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Other };
    case TelemetryTriggerFrom.CreateAppQuestionFlow:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.CreateAppQuestionFlow };
    case TelemetryTriggerFrom.EditorContextMenu:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.EditorContextMenu };
    case TelemetryTriggerFrom.TeamsAgentWalkthroughCreate:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.TeamsAgentWalkthroughCreate };
    case TelemetryTriggerFrom.TeamsAgentWalkthroughExplore:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.TeamsAgentWalkthroughExplore };
    case TelemetryTriggerFrom.TeamsAgentWalkthroughTroubleshoot:
      return {
        [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.TeamsAgentWalkthroughTroubleshoot,
      };
    case TelemetryTriggerFrom.TeamsAgentWalkthrough:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.TeamsAgentWalkthrough };
    default:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Unknow };
  }
}

export function isTriggerFromWalkThrough(args?: any[]): boolean {
  if (!args || args.length === 0) {
    return false;
  } else if (
    (args[0] as TelemetryTriggerFrom).toString() === TelemetryTriggerFrom.WalkThrough ||
    (args[0] as TelemetryTriggerFrom).toString() === TelemetryTriggerFrom.Notification
  ) {
    return true;
  }

  return false;
}

export interface TeamsAppTelemetryInfo {
  appId: string;
  tenantId: string;
}

export async function getTeamsAppTelemetryInfoByEnv(
  env: string,
  isValidProjectFn: (workspacePath: string) => boolean = teamsfxCore.isValidProject
): Promise<TeamsAppTelemetryInfo | undefined> {
  try {
    const ws = globalVariables.workspaceUri?.fsPath;
    const currentCore = globalVariables.core;
    if (ws && currentCore && isValidProjectFn(ws)) {
      const projectInfoRes = await currentCore.getProjectInfo(ws, env);
      if (projectInfoRes.isOk()) {
        const projectInfo = projectInfoRes.value;
        return {
          appId: projectInfo.teamsAppId,
          tenantId: projectInfo.m365TenantId,
        };
      }
    }
  } catch (e) {}
  return undefined;
}

export async function getSettingsVersion(): Promise<string | undefined> {
  if (globalVariables.core) {
    const versionCheckResult = await projectVersionCheck();

    if (versionCheckResult.isOk()) {
      return versionCheckResult.value.currentVersion;
    }
  }
  return undefined;
}

export async function projectVersionCheck() {
  return await globalVariables.core.projectVersionCheck(systemEnvUtils.getSystemInputs());
}
