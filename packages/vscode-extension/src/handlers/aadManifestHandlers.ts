// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as util from "util";
import fs from "fs-extra";
import {
  Result,
  FxError,
  err,
  Stage,
  BuildFolderName,
  ok,
  SystemError,
} from "@microsoft/teamsfx-api";
import { InvalidProjectError, MetadataV3, QuestionNames } from "@microsoft/teamsfx-core";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import { showError } from "../error/common";
import { ExtensionSource } from "../error/error";
import { workspaceUri } from "../globalVariables";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
} from "../telemetry/extTelemetryEvents";
import { localize } from "../utils/localizeUtils";
import { getSystemInputs } from "../utils/systemEnvUtils";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import { runCommand } from "./sharedOpts";
import { askTargetEnvironment } from "./envHandlers";

export async function openPreviewAadFileHandler(args: any[]): Promise<Result<any, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.PreviewAadManifestFile,
    getTriggerFromProperty(args)
  );
  const workspacePath = workspaceUri?.fsPath;
  const validProject = projectSettingsHelper.isValidProject(workspacePath);
  if (!validProject) {
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.PreviewAadManifestFile,
      new InvalidProjectError(workspacePath || "")
    );
    return err(new InvalidProjectError(workspacePath || ""));
  }

  const selectedEnv = await askTargetEnvironment();
  if (selectedEnv.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.PreviewAadManifestFile, selectedEnv.error);
    return err(selectedEnv.error);
  }
  const envName = selectedEnv.value;

  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.BuildAadManifestStart,
    getTriggerFromProperty(args)
  );
  const inputs = getSystemInputs();
  inputs.env = envName;
  const res = await runCommand(Stage.buildAad, inputs);

  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.PreviewAadManifestFile, res.error);
    return err(res.error);
  }

  const manifestFile = `${workspacePath as string}/${BuildFolderName}/aad.${envName}.json`;

  if (fs.existsSync(manifestFile)) {
    void vscode.workspace.openTextDocument(manifestFile).then((document) => {
      void vscode.window.showTextDocument(document);
    });
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PreviewAadManifestFile, {
      [TelemetryProperty.Success]: TelemetrySuccess.Yes,
    });
    return ok(manifestFile);
  } else {
    const error = new SystemError(
      ExtensionSource,
      "FileNotFound",
      util.format(localize("teamstoolkit.handlers.fileNotFound"), manifestFile)
    );
    void showError(error);
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.PreviewAadManifestFile, error);
    return err(error);
  }
}

export function editAadManifestTemplateHandler(args: any[]) {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.EditAadManifestTemplate,
    getTriggerFromProperty(args && args.length > 1 ? [args[1]] : undefined)
  );
  if (args && args.length > 1) {
    const workspacePath = workspaceUri?.fsPath;
    const manifestPath = `${workspacePath as string}/${MetadataV3.aadManifestFileName}`;
    void vscode.workspace.openTextDocument(manifestPath).then((document) => {
      void vscode.window.showTextDocument(document);
    });
  }
}

export async function updateAadAppManifestHandler(args: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DeployAadManifestStart);
  const inputs = getSystemInputs();
  return await runCommand(Stage.deployAad, inputs);
}

export async function convertAadToNewSchemaHandler(args: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ConvertAadToNewSchemaStart);
  const inputs = getSystemInputs();
  if (args && args.length === 1) {
    inputs[QuestionNames.AadAppManifestFilePath] = args[0].fsPath;
  }
  return await runCommand(Stage.ConvertAadToNewSchema, inputs);
}
