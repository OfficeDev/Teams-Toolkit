// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import * as vscode from "vscode";
import {
  isDeclarativeCopilotApp,
  updateIsDeclarativeCopilotApp,
  workspaceUri,
} from "./globalVariables";
import path from "path";
import {
  AppPackageFolderName,
  ManifestTemplateFileName,
  TeamsAppManifest,
} from "@microsoft/teamsfx-api";
import TreeViewManagerInstance from "./treeview/treeViewManager";
import { ExtTelemetry } from "./telemetry/extTelemetry";
import { TelemetryEvent, TelemetryProperty } from "./telemetry/extTelemetryEvents";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";

function setAbortableTimeout(ms: number, signal: any) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      // Resolve the promise after 5 seconds
      resolve("After timeout. Checking app.");
    }, ms);

    // Listen for the abort event
    signal.addEventListener("abort", () => {
      // Clear the timeout and reject the promise if aborted
      clearTimeout(timeoutId);
      reject("resolved after clear");
    });
  });
}

export function manifestListener(): vscode.Disposable {
  let abortController: undefined | AbortController;
  const disposable = vscode.workspace.onDidSaveTextDocument(
    async (event): Promise<boolean | undefined> => {
      try {
        if (
          workspaceUri &&
          projectSettingsHelper.isValidProjectV3(workspaceUri.fsPath) &&
          event.fileName ===
            path.join(workspaceUri.fsPath, AppPackageFolderName, ManifestTemplateFileName)
        ) {
          if (abortController) {
            abortController.abort();
          }
          abortController = new AbortController();

          await setAbortableTimeout(5000, abortController.signal);
          if (!abortController.signal.aborted) {
            const currValue = isDeclarativeCopilotApp;
            const manifest: TeamsAppManifest = JSON.parse(event.getText());
            const newValue = updateIsDeclarativeCopilotApp(manifest);
            if (currValue !== newValue) {
              ExtTelemetry.sendTelemetryEvent(TelemetryEvent.UpdateAddPluginTreeview, {
                [TelemetryProperty.ShowAddPluginTreeView]: newValue.toString(),
              });
              TreeViewManagerInstance.updateDevelopmentTreeView();
            }

            return currValue !== newValue;
          }
        }
      } catch (error) {}
    }
  );

  return disposable;
}
