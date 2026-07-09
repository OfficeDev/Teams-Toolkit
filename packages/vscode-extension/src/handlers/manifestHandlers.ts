// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  AppPackageFolderName,
  BuildFolderName,
  err,
  FxError,
  Inputs,
  ok,
  Platform,
  Result,
  SelectFileConfig,
  SingleSelectConfig,
  Stage,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import { window, workspace } from "vscode";
import { core, workspaceUri } from "../globalVariables";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent } from "../telemetry/extTelemetryEvents";
import { localize } from "../utils/localizeUtils";
import { getSystemInputs } from "../utils/systemEnvUtils";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import * as sharedOpts from "./sharedOpts";
import { SyncManifestInputs } from "@microsoft/teamsfx-core";

export async function validateManifestHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.ValidateManifestStart,
    getTriggerFromProperty(args)
  );

  const inputs = getSystemInputs();
  return await sharedOpts.runCommand(Stage.validateApplication, inputs);
}

export async function syncManifestHandler(...args: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SyncManifestStart, getTriggerFromProperty(args));
  const inputs: SyncManifestInputs = {
    platform: Platform.VSCode,
  };
  if (args.length > 0) {
    inputs["teams-app-id"] = args[0];
  }
  return await sharedOpts.runCommand(Stage.syncManifest, inputs);
}

export async function buildPackageHandler(...args: unknown[]): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.BuildStart, getTriggerFromProperty(args));
  return await sharedOpts.runCommand(Stage.createAppPackage);
}

let lastAppPackageFile: string | undefined;

export async function publishInDeveloperPortalHandler(
  ...args: unknown[]
): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.PublishInDeveloperPortalStart,
    getTriggerFromProperty(args)
  );
  const workspacePath = workspaceUri?.fsPath;
  const zipDefaultFolder: string | undefined = path.join(
    workspacePath!,
    BuildFolderName,
    AppPackageFolderName
  );

  let files: string[] = [];
  if (await fs.pathExists(zipDefaultFolder)) {
    files = await fs.readdir(zipDefaultFolder);
    files = files
      .filter((file) => path.extname(file).toLowerCase() === ".zip")
      .map((file) => {
        return path.join(zipDefaultFolder, file);
      });
  }
  while (true) {
    const selectFileConfig: SelectFileConfig = {
      name: "appPackagePath",
      title: localize("teamstoolkit.publishInDevPortal.selectFile.title"),
      placeholder: localize("teamstoolkit.publishInDevPortal.selectFile.placeholder"),
      filters: {
        "Zip files": ["zip"],
      },
    };
    if (lastAppPackageFile && fs.existsSync(lastAppPackageFile)) {
      selectFileConfig.default = lastAppPackageFile;
    } else {
      selectFileConfig.possibleFiles = files.map((file) => {
        const appPackageFilename = path.basename(file);
        const appPackageFilepath = path.dirname(file);
        return {
          id: file,
          label: `$(file) ${appPackageFilename}`,
          description: appPackageFilepath,
        };
      });
    }
    const selectFileResult = await VS_CODE_UI.selectFile(selectFileConfig);
    if (selectFileResult.isErr()) {
      ExtTelemetry.sendTelemetryErrorEvent(
        TelemetryEvent.PublishInDeveloperPortal,
        selectFileResult.error,
        getTriggerFromProperty(args)
      );
      return ok(null);
    }
    if (
      (lastAppPackageFile && selectFileResult.value.result === lastAppPackageFile) ||
      (!lastAppPackageFile && files.indexOf(selectFileResult.value.result!) !== -1)
    ) {
      // user selected file in options
      lastAppPackageFile = selectFileResult.value.result;
      break;
    }
    // final confirmation
    lastAppPackageFile = selectFileResult.value.result!;
    const appPackageFilename = path.basename(lastAppPackageFile);
    const appPackageFilepath = path.dirname(lastAppPackageFile);
    const confirmOption: SingleSelectConfig = {
      options: [
        {
          id: "yes",
          label: `$(file) ${appPackageFilename}`,
          description: appPackageFilepath,
        },
      ],
      name: "confirm",
      title: localize("teamstoolkit.publishInDevPortal.selectFile.title"),
      placeholder: localize("teamstoolkit.publishInDevPortal.confirmFile.placeholder"),
      step: 2,
    };
    const confirm = await VS_CODE_UI.selectOption(confirmOption);
    if (confirm.isErr()) {
      ExtTelemetry.sendTelemetryErrorEvent(
        TelemetryEvent.PublishInDeveloperPortal,
        confirm.error,
        getTriggerFromProperty(args)
      );
      return ok(null);
    }
    if (confirm.value.type === "success") {
      break;
    }
  }
  const inputs = getSystemInputs();
  inputs["appPackagePath"] = lastAppPackageFile;
  const res = await sharedOpts.runCommand(Stage.publishInDeveloperPortal, inputs);
  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.PublishInDeveloperPortal,
      res.error,
      getTriggerFromProperty(args)
    );
  }
  return res;
}

export async function updatePreviewManifest(args: any[]): Promise<any> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.UpdatePreviewManifestStart,
    getTriggerFromProperty(args && args.length > 1 ? [args[1]] : undefined)
  );
  const inputs = getSystemInputs();
  const result = await sharedOpts.runCommand(Stage.deployTeams, inputs);

  if (!args || args.length === 0) {
    const workspacePath = workspaceUri?.fsPath;
    const inputs = getSystemInputs();
    inputs.ignoreEnvInfo = true;
    const env = await core.getSelectedEnv(inputs);
    if (env.isErr()) {
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdatePreviewManifest, env.error);
      return err(env.error);
    }
    const manifestPath = `${
      workspacePath as string
    }/${AppPackageFolderName}/${BuildFolderName}/manifest.${env.value as string}.json`;
    void workspace.openTextDocument(manifestPath).then((document) => {
      void window.showTextDocument(document);
    });
  }
  return result;
}
