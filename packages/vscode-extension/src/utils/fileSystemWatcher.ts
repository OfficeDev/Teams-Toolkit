// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { isValidProject } from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import * as vscode from "vscode";
import { context, initializeGlobalVariables } from "../globalVariables";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent, TelemetryProperty } from "../telemetry/extTelemetryEvents";
import TreeViewManagerInstance from "../treeview/treeViewManager";

export const fileSystemWatcherOps = {
  readJson: (filePath: string) => fs.readJson(filePath),
};
const fileSystemWatcherDeps = fileSystemWatcherOps;

export function addFileSystemWatcher(workspacePath: string) {
  if (isValidProject(workspacePath)) {
    const packageLockFileWatcher = vscode.workspace.createFileSystemWatcher("**/package-lock.json");

    packageLockFileWatcher.onDidCreate(async (event) => {
      await sendSDKVersionTelemetry(event.fsPath);
    });

    packageLockFileWatcher.onDidChange(async (event) => {
      await sendSDKVersionTelemetry(event.fsPath);
    });

    const yorcFileWatcher = vscode.workspace.createFileSystemWatcher("**/.yo-rc.json");
    yorcFileWatcher.onDidCreate((_event) => {
      refreshSPFxTreeOnFileChanged();
    });
    yorcFileWatcher.onDidChange((_event) => {
      refreshSPFxTreeOnFileChanged();
    });
    yorcFileWatcher.onDidDelete((_event) => {
      refreshSPFxTreeOnFileChanged();
    });
  }
}

export function refreshSPFxTreeOnFileChanged() {
  initializeGlobalVariables(context);
  TreeViewManagerInstance.updateDevelopmentTreeView();
}

export async function sendSDKVersionTelemetry(filePath: string) {
  const packageLockFile = (await fileSystemWatcherDeps.readJson(filePath).catch(() => {})) as {
    dependencies: { [key: string]: { version: string } };
  };
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.UpdateSDKPackages, {
    [TelemetryProperty.BotbuilderVersion]: packageLockFile?.dependencies["botbuilder"]?.version,
    [TelemetryProperty.TeamsFxVersion]:
      packageLockFile?.dependencies["@microsoft/teamsfx"]?.version,
    [TelemetryProperty.TeamsJSVersion]:
      packageLockFile?.dependencies["@microsoft/teams-js"]?.version,
  });
}
