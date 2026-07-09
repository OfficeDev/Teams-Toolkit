// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";
import * as vscode from "vscode";

import { TeamsAppManifest, Tools } from "@microsoft/teamsfx-api";
import {
  copilotGptManifestUtils,
  FxCore,
  isManifestOnlyOfficeAddinProject,
  isValidOfficeAddInProject,
  isValidProject,
  manifestUtils,
} from "@microsoft/teamsfx-core";
import { UserState } from "./constants";

/**
 * Common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
export let context: vscode.ExtensionContext;
export let workspaceUri: vscode.Uri | undefined;
export let isTeamsFxProject = false;
export let isOfficeAddInProject = false;
export let isOfficeManifestOnlyProject = false;
export let isMetaOSAddinProject = false;
export let isSPFxProject = false;
export let isDeclarativeCopilotApp = false;
export let isSensitivityLabelSet = false;
export let isExistingUser = "no";
export let defaultExtensionLogPath: string;
export let commandIsRunning = false;
export let core: FxCore;
export let tools: Tools;
export let diagnosticCollection: vscode.DiagnosticCollection; // Collection of diagnositcs after running app validation.
export let deleteAadInProgress = false;
export let outputTroubleshootNotificationCount = 0;

export interface ILocalDebugPorts {
  checkPorts: number[];
  conflictPorts: number[];
  terminateButton: string;
  process2conflictPorts: Record<string, number[]>;
  terminateProcesses: string[];
}

export const LocalDebugPorts: ILocalDebugPorts = {
  checkPorts: [],
  conflictPorts: [],
  terminateButton: "",
  process2conflictPorts: {},
  terminateProcesses: [],
};

export function resetLocalDebugPorts() {
  LocalDebugPorts.checkPorts = [];
  LocalDebugPorts.conflictPorts = [];
  LocalDebugPorts.terminateButton = "";
  LocalDebugPorts.process2conflictPorts = {};
  LocalDebugPorts.terminateProcesses = [];
}

if (vscode.workspace && vscode.workspace.workspaceFolders) {
  if (vscode.workspace.workspaceFolders.length > 0) {
    workspaceUri = vscode.workspace.workspaceFolders[0].uri;
  }
}

export function initializeGlobalVariables(ctx: vscode.ExtensionContext): void {
  context = ctx;
  outputTroubleshootNotificationCount = 0;
  const workspacePath = workspaceUri?.fsPath;
  isExistingUser = context.globalState.get<string>(UserState.IsExisting) || "no";
  isTeamsFxProject = isValidProject(workspacePath);
  isOfficeAddInProject = workspacePath ? isValidOfficeAddInProject(workspacePath) : false;
  if (isOfficeAddInProject && workspacePath) {
    isOfficeManifestOnlyProject = isManifestOnlyOfficeAddinProject(workspacePath);
  }
  // Default Extension log path
  // eslint-disable-next-line no-secrets/no-secrets
  // e.g. C:/Users/xx/AppData/Roaming/Code/logs/20230221T095340/window7/exthost/TeamsDevApp.ms-teams-vscode-extension
  defaultExtensionLogPath = ctx.logUri.fsPath;
  if (!fs.pathExistsSync(defaultExtensionLogPath)) {
    fs.mkdirSync(defaultExtensionLogPath);
  }
  if (isTeamsFxProject && workspaceUri?.fsPath) {
    isSPFxProject = checkIsSPFx(workspaceUri?.fsPath);
    isMetaOSAddinProject = checkIsMetaOSAddinProject(workspaceUri.fsPath);
    isDeclarativeCopilotApp = checkIsDeclarativeCopilotApp(workspaceUri.fsPath);
    isSensitivityLabelSet = checkIsSensitivityLabelSet(workspaceUri.fsPath);
  } else {
    isSPFxProject = fs.existsSync(path.join(workspaceUri?.fsPath ?? "./", "SPFx"));
  }
}

export function checkIsMetaOSAddinProject(directory: string): boolean {
  if (!directory) {
    return false;
  }

  const manifestResult = manifestUtils.readAppManifestSync(directory);
  if (manifestResult.isOk()) {
    if ((manifestResult.value as any)?.extensions) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export function checkIsSPFx(directory: string): boolean {
  const root = path.parse(directory).root;
  if (!directory || directory === root) {
    return false;
  }

  const visited = new Set<string>();
  const maxDepth = 6;

  const check = (currentDir: string, depth: number): boolean => {
    if (depth > maxDepth || visited.has(currentDir)) {
      return false;
    }
    visited.add(currentDir);

    let files: string[] = [];
    try {
      files = fs.readdirSync(currentDir);
    } catch {
      return false;
    }

    for (const file of files) {
      if (file === ".yo-rc.json") {
        try {
          const content = fs.readJsonSync(path.join(currentDir, file)) as Record<string, unknown>;
          if (content["@microsoft/generator-sharepoint"]) {
            return true;
          }
        } catch {
          continue;
        }
      } else {
        const childPath = path.join(currentDir, file);
        try {
          if (fs.lstatSync(childPath).isDirectory()) {
            if (check(childPath, depth + 1)) return true;
          }
        } catch {
          continue;
        }
      }
    }

    return false;
  };

  return check(directory, 0);
}

export function checkIsDeclarativeCopilotApp(directory: string): boolean {
  const manifestRes = manifestUtils.readAppManifestSync(directory);
  if (manifestRes.isOk()) {
    return manifestUtils.getCapabilities(manifestRes.value).includes("copilotGpt");
  } else {
    return false;
  }
}

export function updateIsDeclarativeCopilotApp(manifest: TeamsAppManifest): boolean {
  const value = manifestUtils.getCapabilities(manifest).includes("copilotGpt");
  isDeclarativeCopilotApp = value;
  return isDeclarativeCopilotApp;
}

export function checkIsSensitivityLabelSet(directory: string): boolean {
  const manifestRes = manifestUtils.readAppManifestSync(directory);
  if (!manifestRes.isOk()) {
    return false;
  }
  const declarativeAgentPath = manifestRes.value.copilotAgents?.declarativeAgents?.[0]?.file;
  if (!declarativeAgentPath) {
    return false;
  }
  const appPackagePath = path.dirname(manifestUtils.getTeamsAppManifestPath(directory));
  const declarativeAgentRes = copilotGptManifestUtils.readDeclarativeAgentManifestFileSync(
    path.resolve(appPackagePath, declarativeAgentPath)
  );
  if (!declarativeAgentRes.isOk()) {
    return false;
  }
  return !!declarativeAgentRes.value.sensitivity_label?.id;
}

export function setCommandIsRunning(isRunning: boolean) {
  commandIsRunning = isRunning;
}

// Only used by checkProjectUpgradable() when error happens
export function unsetIsTeamsFxProject() {
  isTeamsFxProject = false;
}

export function setTools(toolsInstance: Tools) {
  tools = toolsInstance;
}
export function setCore(coreInstance: FxCore) {
  core = coreInstance;
}

export function setDiagnosticCollection(collection: vscode.DiagnosticCollection) {
  diagnosticCollection = collection;
}

export function setDeleteAadInProgress(inProgress: boolean) {
  deleteAadInProgress = inProgress;
}

export function setOutputTroubleshootNotificationCount(value: number) {
  outputTroubleshootNotificationCount = value;
}
