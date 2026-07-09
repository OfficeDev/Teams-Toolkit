// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  ConfigFolderName,
  CoreCallbackEvent,
  err,
  FxError,
  M365TokenProvider,
  ok,
  Result,
  signedIn,
  signedOut,
  Void,
} from "@microsoft/teamsfx-api";
import {
  AppStudioScopes,
  FxCore,
  getProjectMetadata,
  GraphScopes,
  isSovereignHigh,
  isValidProject,
} from "@microsoft/teamsfx-core";
import path from "path";
import { FileRenameEvent, Uri, window, workspace } from "vscode";
import commandController from "../commandController";
import azureAccountManager from "../commonlib/azureLogin";
import VsCodeLogInstance from "../commonlib/log";
import M365TokenInstance from "../commonlib/m365Login";
import { showError } from "../error/common";
import { ExtensionSource } from "../error/error";
import { getExpService } from "../exp/index";
import {
  core,
  setCommandIsRunning,
  setCore,
  setTools,
  tools,
  workspaceUri,
} from "../globalVariables";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent, TelemetryProperty } from "../telemetry/extTelemetryEvents";
import envTreeProviderInstance from "../treeview/environmentTreeViewProvider";
import { addFileSystemWatcher } from "../utils/fileSystemWatcher";
import { localize } from "../utils/localizeUtils";

export function activate(): Result<Void, FxError> {
  const result: Result<Void, FxError> = ok(Void);
  const validProject = isValidProject(workspaceUri?.fsPath);
  if (validProject) {
    const fixedProjectSettings = getProjectMetadata(workspaceUri?.fsPath);
    ExtTelemetry.addSharedProperty(
      TelemetryProperty.ProjectId,
      fixedProjectSettings?.projectId as string
    );
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenTeamsApp, {});
    void azureAccountManager.setStatusChangeMap(
      "successfully-sign-in-azure",
      (status, token, accountInfo) => {
        if (status === signedIn) {
          void window.showInformationMessage(localize("teamstoolkit.handlers.azureSignIn"));
        } else if (status === signedOut) {
          void window.showInformationMessage(localize("teamstoolkit.handlers.azureSignOut"));
        }
        return Promise.resolve();
      },
      false
    );
  }
  try {
    const m365Login: M365TokenProvider = M365TokenInstance;
    const m365NotificationCallback = (
      status: string,
      token: string | undefined,
      accountInfo: Record<string, unknown> | undefined
    ) => {
      if (status === signedIn) {
        void window.showInformationMessage(localize("teamstoolkit.handlers.m365SignIn"));
      } else if (status === signedOut) {
        // eslint-disable-next-line no-secrets/no-secrets
        void window.showInformationMessage(localize("teamstoolkit.handlers.m365SignOut"));
      }
      return Promise.resolve();
    };

    void M365TokenInstance.setStatusChangeMap(
      "successfully-sign-in-m365",
      { scopes: isSovereignHigh() ? GraphScopes : AppStudioScopes() },
      m365NotificationCallback,
      false
    );
    setTools({
      logProvider: VsCodeLogInstance,
      tokenProvider: {
        azureAccountProvider: azureAccountManager,
        m365TokenProvider: m365Login,
      },
      telemetryReporter: ExtTelemetry.reporter,
      ui: VS_CODE_UI,
      expServiceProvider: getExpService(),
    });
    setCore(new FxCore(tools));
    core.on(CoreCallbackEvent.lock, async (command: string) => {
      setCommandIsRunning(true);
      await commandController.lockedByOperation(command);
    });
    core.on(CoreCallbackEvent.unlock, async (command: string) => {
      setCommandIsRunning(false);
      await commandController.unlockedByOperation(command);
    });
    const workspacePath = workspaceUri?.fsPath;
    if (workspacePath) {
      addFileSystemWatcher(workspacePath);
    }

    if (workspacePath) {
      // refresh env tree when env config files added or deleted.
      workspace.onDidCreateFiles(async (event) => {
        await refreshEnvTreeOnEnvFileChanged(workspacePath, event.files);
      });

      workspace.onDidDeleteFiles(async (event) => {
        await refreshEnvTreeOnEnvFileChanged(workspacePath, event.files);
      });

      workspace.onDidRenameFiles(async (event) => {
        await refreshEnvTreeOnFilesNameChanged(workspacePath, event);
      });

      workspace.onDidSaveTextDocument(async (event) => {
        await refreshEnvTreeOnProjectSettingFileChanged(workspacePath, event.uri.fsPath);
      });
    }
  } catch (e) {
    const FxError: FxError = {
      name: (e as Error).name,
      source: ExtensionSource,
      message: (e as Error).message,
      stack: (e as Error).stack,
      timestamp: new Date(),
    };
    void showError(FxError);
    return err(FxError);
  }
  return result;
}

export async function refreshEnvTreeOnFilesNameChanged(
  workspacePath: string,
  event: FileRenameEvent
) {
  const files = [];
  for (const f of event.files) {
    files.push(f.newUri);
    files.push(f.oldUri);
  }

  await refreshEnvTreeOnEnvFileChanged(workspacePath, files);
}

export async function refreshEnvTreeOnEnvFileChanged(workspacePath: string, files: readonly Uri[]) {
  let needRefresh = false;
  for (const file of files) {
    // check if file is env config
    const res = await core.isEnvFile(workspacePath, file.fsPath);
    if (res.isOk() && res.value) {
      needRefresh = true;
      break;
    }
  }

  if (needRefresh) {
    await envTreeProviderInstance.reloadEnvironments();
  }
}

export async function refreshEnvTreeOnProjectSettingFileChanged(
  workspacePath: string,
  filePath: string
) {
  const projectSettingsPath = path.resolve(
    workspacePath,
    `.${ConfigFolderName}`,
    "configs",
    "projectSettings.json"
  );

  // check if file is project config
  if (path.normalize(filePath) === path.normalize(projectSettingsPath)) {
    await envTreeProviderInstance.reloadEnvironments();
  }
}
