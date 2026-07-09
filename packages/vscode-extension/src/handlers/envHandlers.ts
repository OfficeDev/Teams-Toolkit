// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import path from "path";
import * as util from "util";
import fs from "fs-extra";
import {
  FxError,
  Result,
  SingleSelectConfig,
  Stage,
  SystemError,
  UserError,
  Void,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { InvalidProjectError, environmentManager, pathUtils } from "@microsoft/teamsfx-core";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
} from "../telemetry/extTelemetryEvents";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import { runCommand } from "./sharedOpts";
import envTreeProviderInstance from "../treeview/environmentTreeViewProvider";
import { workspaceUri } from "../globalVariables";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { showError } from "../error/common";
import { ExtensionSource, ExtensionErrors } from "../error/error";
import { localize } from "../utils/localizeUtils";

export async function createNewEnvironment(args?: any[]): Promise<Result<undefined, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.CreateNewEnvironmentStart,
    getTriggerFromProperty(args)
  );
  const result = await runCommand(Stage.createEnv);
  if (!result.isErr()) {
    await envTreeProviderInstance.reloadEnvironments();
  }
  return result;
}

export async function refreshEnvironment(args?: any[]): Promise<Result<Void, FxError>> {
  return await envTreeProviderInstance.reloadEnvironments();
}

export async function openConfigStateFile(args: any[]): Promise<any> {
  let telemetryStartName = TelemetryEvent.OpenManifestConfigStateStart;
  let telemetryName = TelemetryEvent.OpenManifestConfigState;

  if (args && args.length > 0 && args[0].from === "aad") {
    telemetryStartName = TelemetryEvent.OpenAadConfigStateStart;
    telemetryName = TelemetryEvent.OpenAadConfigState;
  }

  ExtTelemetry.sendTelemetryEvent(telemetryStartName);
  const workspacePath = workspaceUri?.fsPath;
  if (!workspacePath) {
    const noOpenWorkspaceError = new UserError(
      ExtensionSource,
      ExtensionErrors.NoWorkspaceError,
      localize("teamstoolkit.handlers.noOpenWorkspace")
    );
    void showError(noOpenWorkspaceError);
    ExtTelemetry.sendTelemetryErrorEvent(telemetryName, noOpenWorkspaceError);
    return err(noOpenWorkspaceError);
  }

  if (!projectSettingsHelper.isValidProject(workspacePath)) {
    const invalidProjectError = new UserError(
      ExtensionSource,
      ExtensionErrors.InvalidProject,
      localize("teamstoolkit.handlers.invalidProject")
    );
    void showError(invalidProjectError);
    ExtTelemetry.sendTelemetryErrorEvent(telemetryName, invalidProjectError);
    return err(invalidProjectError);
  }

  let sourcePath: string | undefined = undefined;
  let env: string | undefined = undefined;
  if (args && args.length > 0) {
    env = args[0].env;
    if (!env) {
      const envRes: Result<string | undefined, FxError> = await askTargetEnvironment();
      if (envRes.isErr()) {
        ExtTelemetry.sendTelemetryErrorEvent(telemetryName, envRes.error);
        return err(envRes.error);
      }
      env = envRes.value;
    }

    // Load env folder from yml
    const envFolder = await pathUtils.getEnvFolderPath(workspacePath);
    if (envFolder.isOk() && envFolder.value) {
      sourcePath = path.resolve(`${envFolder.value}/.env.${env as string}`);
    } else if (envFolder.isErr()) {
      return err(envFolder.error);
    }
  } else {
    const invalidArgsError = new SystemError(
      ExtensionSource,
      ExtensionErrors.InvalidArgs,
      util.format(localize("teamstoolkit.handlers.invalidArgs"), args ? JSON.stringify(args) : args)
    );
    void showError(invalidArgsError);
    ExtTelemetry.sendTelemetryErrorEvent(telemetryName, invalidArgsError);
    return err(invalidArgsError);
  }

  if (sourcePath && !(await fs.pathExists(sourcePath))) {
    const noEnvError = new UserError(
      ExtensionSource,
      ExtensionErrors.EnvFileNotFoundError,
      util.format(localize("teamstoolkit.handlers.findEnvFailed"), env)
    );
    void showError(noEnvError);
    ExtTelemetry.sendTelemetryErrorEvent(telemetryName, noEnvError);
    return err(noEnvError);
  }

  void vscode.workspace.openTextDocument(sourcePath as string).then((document) => {
    void vscode.window.showTextDocument(document);
  });
  ExtTelemetry.sendTelemetryEvent(telemetryName, {
    [TelemetryProperty.Success]: TelemetrySuccess.Yes,
  });
}

/**
 * Ask user to select environment, local is included
 */
export async function askTargetEnvironment(): Promise<Result<string, FxError>> {
  const projectPath = workspaceUri?.fsPath;
  if (!projectSettingsHelper.isValidProject(projectPath)) {
    return err(new InvalidProjectError(projectPath || ""));
  }
  const envProfilesResult = await environmentManager.listAllEnvConfigs(projectPath!);
  if (envProfilesResult.isErr()) {
    return err(envProfilesResult.error);
  }
  const config: SingleSelectConfig = {
    name: "targetEnvName",
    title: "Select an environment",
    options: envProfilesResult.value,
  };
  const selectedEnv = await VS_CODE_UI.selectOption(config);
  if (selectedEnv.isErr()) {
    return err(selectedEnv.error);
  } else {
    return ok(selectedEnv.value.result as string);
  }
}
