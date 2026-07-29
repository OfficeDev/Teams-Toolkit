// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppPackageFolderName,
  DefaultApiSpecFolderName,
  DefaultApiSpecYamlFileName,
  DefaultPluginManifestFileName,
  ManifestTemplateFileName,
  Warning,
} from "@microsoft/teamsfx-api";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import {
  assembleError,
  featureFlagManager,
  FeatureFlags,
  generateScaffoldingSummary,
  JSONSyntaxError,
  manifestUtils,
  outputScaffoldingWarningMessage,
  pathUtils,
  pluginManifestUtils,
} from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import path from "path";
import * as util from "util";
import * as vscode from "vscode";
import VsCodeLogInstance from "../commonlib/log";
import { CommandKey, GlobalKey } from "../constants";
import * as runIconHandlers from "../debug/runIconHandler";
import * as globalVariables from "../globalVariables";
import * as readmeHandlers from "../handlers/readmeHandlers";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent, TelemetryTriggerFrom } from "../telemetry/extTelemetryEvents";
import { getAppName } from "./appDefinitionUtils";
import { getLocalDebugMessageTemplate } from "./commonUtils";
import { localize } from "./localizeUtils";

export async function showLocalDebugMessage(skipNextStepNotification = false) {
  const shouldShowLocalDebugMessage = (await teamsfxCore.globalStateGet(
    GlobalKey.ShowLocalDebugMessage,
    false
  )) as boolean;

  if (!shouldShowLocalDebugMessage) {
    return;
  } else {
    await teamsfxCore.globalStateUpdate(GlobalKey.ShowLocalDebugMessage, false);
  }

  const hasLocalEnv =
    (await fs.pathExists(path.join(globalVariables.workspaceUri!.fsPath, "teamsapp.local.yml"))) ||
    (await fs.pathExists(path.join(globalVariables.workspaceUri!.fsPath, "m365agents.local.yml")));
  const hasKeyGenJsFile = await fs.pathExists(
    path.join(globalVariables.workspaceUri!.fsPath, "/src/keyGen.js")
  );
  const hasKeyGenTsFile = await fs.pathExists(
    path.join(globalVariables.workspaceUri!.fsPath, "/src/keyGen.ts")
  );

  const appName = (await getAppName()) ?? localize("teamstoolkit.handlers.fallbackAppName");
  const isWindows = process.platform === "win32";
  const folderLink = encodeURI(globalVariables.workspaceUri!.toString());
  const openFolderCommand = `command:fx-extension.openFolder?%5B%22${folderLink}%22%5D`;

  if (
    featureFlagManager.getBooleanValue(FeatureFlags.SensitivityLabelEnabled) &&
    globalVariables.isDeclarativeCopilotApp &&
    !globalVariables.isSensitivityLabelSet
  ) {
    showSetSensitivityLabelMessage();
  }

  // Every call to action below (local debug, preview, provision) starts a lifecycle that is
  // guaranteed to fail while the project still holds fill-in placeholders. The scaffolding
  // warning notification takes over as the single next step. The flag above is still consumed
  // so the stale invitation does not resurface the next time the workspace is opened.
  if (skipNextStepNotification) {
    return;
  }

  if (hasKeyGenJsFile || hasKeyGenTsFile) {
    const openReadMe = {
      title: localize("teamstoolkit.handlers.manualStepRequiredTitle"),
      run: async (): Promise<void> => {
        await readmeHandlers.openReadMeHandler([TelemetryTriggerFrom.Notification]);
      },
    };
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowManualStepRequiredNotification);
    const message = isWindows
      ? util.format(
          localize("teamstoolkit.handlers.manualStepRequired"),
          appName,
          openFolderCommand
        )
      : util.format(
          localize("teamstoolkit.handlers.manualStepRequired.fallback"),
          appName,
          globalVariables.workspaceUri?.fsPath
        );
    void vscode.window.showInformationMessage(message, openReadMe).then((selection) => {
      if (selection?.title === localize("teamstoolkit.handlers.manualStepRequiredTitle")) {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ClickReadManualStep);
        void selection.run();
      }
    });
  } else if (hasLocalEnv) {
    let title = localize("teamstoolkit.handlers.localDebugTitle");
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowLocalDebugNotification);

    let messageTemplate = getLocalDebugMessageTemplate(isWindows);
    if (globalVariables.isDeclarativeCopilotApp) {
      messageTemplate = isWindows
        ? localize("teamstoolkit.handlers.localPreviewDescription")
        : localize("teamstoolkit.handlers.localPreviewDescription.fallback");
      title = localize("teamstoolkit.handlers.localPreviewTitle");
    }
    const localDebug = {
      title: title,
      run: async (): Promise<void> => {
        await runIconHandlers.selectAndDebug();
      },
    };

    let message = util.format(messageTemplate, appName, globalVariables.workspaceUri?.fsPath);
    if (isWindows) {
      message = util.format(messageTemplate, appName, openFolderCommand);
    }
    void vscode.window.showInformationMessage(message, localDebug).then((selection) => {
      if (selection?.title === title) {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ClickLocalDebug);
        void selection.run();
      }
    });
  } else {
    // DA-with-MCP + dynamic tool discovery (flag on): swap the generic
    // Provision notification for the scenario-specific one defined in
    // SCN-DA-CREATE-WITH-MCP-SERVER §9. Marker file `.vscode/mcp.json` is only
    // emitted by the DA-with-MCP scaffold.
    const isDaWithMcpDt =
      featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT) &&
      (await fs.pathExists(path.join(globalVariables.workspaceUri!.fsPath, ".vscode", "mcp.json")));
    const provision = {
      title: localize("teamstoolkit.handlers.provisionTitle"),
      run: async (): Promise<void> => {
        await vscode.commands.executeCommand(CommandKey.Provision, [
          TelemetryTriggerFrom.Notification,
        ]);
      },
    };
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowProvisionNotification);
    let message: string;
    if (isDaWithMcpDt) {
      message = localize("teamstoolkit.handlers.openWorkspaceMCPConfigNotification.dt");
    } else {
      message = isWindows
        ? util.format(
            localize("teamstoolkit.handlers.provisionDescription"),
            appName,
            openFolderCommand
          )
        : util.format(
            localize("teamstoolkit.handlers.provisionDescription.fallback"),
            appName,
            globalVariables.workspaceUri?.fsPath
          );
    }
    void vscode.window.showInformationMessage(message, provision).then((selection) => {
      if (selection?.title === localize("teamstoolkit.handlers.provisionTitle")) {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ClickProvision);
        void selection.run();
      }
    });
  }
}

export async function ShowScaffoldingWarningSummary(
  workspacePath: string,
  warning: string
): Promise<void> {
  try {
    let createWarnings: Warning[] = [];

    if (warning) {
      try {
        createWarnings = JSON.parse(warning) as Warning[];
      } catch (e) {
        const error = new JSONSyntaxError(warning, e, "vscode");
        ExtTelemetry.sendTelemetryErrorEvent(
          TelemetryEvent.ShowScaffoldingWarningSummaryError,
          error
        );
      }
    }
    const manifestRes = await manifestUtils._readAppManifest(
      path.join(workspacePath, AppPackageFolderName, ManifestTemplateFileName)
    );
    let message;
    if (manifestRes.isOk()) {
      const teamsManifest = manifestRes.value;
      const commonProperties = manifestUtils.parseCommonProperties(teamsManifest);
      if (commonProperties.capabilities.includes("plugin")) {
        const apiSpecFilePathRes = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
          teamsManifest,
          path.join(workspacePath, AppPackageFolderName, ManifestTemplateFileName)
        );
        if (apiSpecFilePathRes.isErr()) {
          ExtTelemetry.sendTelemetryErrorEvent(
            TelemetryEvent.ShowScaffoldingWarningSummaryError,
            apiSpecFilePathRes.error
          );
        } else {
          message = await generateScaffoldingSummary(
            createWarnings,
            teamsManifest,
            path.relative(workspacePath, apiSpecFilePathRes.value[0]),
            path.join(
              AppPackageFolderName,
              teamsManifest.copilotExtensions
                ? teamsManifest.copilotExtensions.plugins![0].file
                : teamsManifest.copilotAgents!.plugins![0].file
            ),
            workspacePath
          );
        }
      } else if (
        commonProperties.isApiME &&
        teamsManifest.composeExtensions![0].apiSpecificationFile
      ) {
        message = await generateScaffoldingSummary(
          createWarnings,
          teamsManifest,
          path.join(AppPackageFolderName, teamsManifest.composeExtensions![0].apiSpecificationFile),
          undefined,
          workspacePath
        );
      } else if (commonProperties.capabilities.includes("copilotGpt")) {
        message = await generateScaffoldingSummary(
          createWarnings,
          teamsManifest,
          path.join(AppPackageFolderName, DefaultApiSpecFolderName, DefaultApiSpecYamlFileName),
          path.join(AppPackageFolderName, DefaultPluginManifestFileName),
          workspacePath
        );
      } else {
        message = outputScaffoldingWarningMessage(createWarnings);
      }

      if (message) {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowScaffoldingWarningSummary);
        VsCodeLogInstance.outputChannel.show();
        void VsCodeLogInstance.info(message);
      }
    } else {
      ExtTelemetry.sendTelemetryErrorEvent(
        TelemetryEvent.ShowScaffoldingWarningSummaryError,
        manifestRes.error
      );
    }

    // The output channel is easy to miss, and an unreplaced placeholder guarantees a
    // provision failure later, so raise this one case to a notification.
    showMCPAuthPlaceholderNotification(workspacePath, createWarnings);
  } catch (e) {
    const error = assembleError(e);
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.ShowScaffoldingWarningSummaryError, error);
  }
}

/**
 * `Warning.type` values reported when MCP auth endpoint discovery failed and the scaffolder
 * fell back to fill-in placeholders in `m365agents.yml`. The other MCP warnings are advisory
 * and stay in the output channel.
 */
const MCP_AUTH_PLACEHOLDER_WARNING_TYPES = [
  "mcpAuthDcrWellKnownUrlPlaceholder",
  "mcpAuthOAuthUrlPlaceholder",
];

/**
 * Whether the scaffolded project needs a manual edit before any lifecycle can succeed, given
 * the raw `GlobalKey.CreateWarnings` payload. Callers use it to suppress notifications that
 * would invite the developer into a guaranteed failure.
 */
export function hasProvisionBlockingWarning(createWarnings: string): boolean {
  if (!createWarnings) {
    return false;
  }
  try {
    const warnings = JSON.parse(createWarnings) as Warning[];
    return Array.isArray(warnings) && warnings.some(isProvisionBlockingWarning);
  } catch {
    // ShowScaffoldingWarningSummary reports the parse failure. Here we only decide whether to
    // hide a notification, so an unreadable payload degrades to showing the usual one.
    return false;
  }
}

function isProvisionBlockingWarning(warning: Warning): boolean {
  return MCP_AUTH_PLACEHOLDER_WARNING_TYPES.includes(warning.type);
}

export function showMCPAuthPlaceholderNotification(
  workspacePath: string,
  warnings: Warning[]
): void {
  // The warning already carries the wording the other MCP auth flows show, so reuse it
  // instead of a second phrasing of the same problem.
  const message = warnings
    .filter(isProvisionBlockingWarning)
    .map((warning) => warning.content)
    .join(" ");
  if (!message) {
    return;
  }

  const openYml = {
    title: localize("teamstoolkit.handlers.mcpAuthPlaceholder.openYmlTitle"),
    run: async (): Promise<void> => {
      const ymlPath = pathUtils.getYmlFilePath(workspacePath, undefined, true);
      if (ymlPath) {
        await vscode.window.showTextDocument(vscode.Uri.file(ymlPath));
      }
    },
  };
  const recreate = {
    title: localize("teamstoolkit.handlers.mcpAuthPlaceholder.recreateTitle"),
    run: async (): Promise<void> => {
      await vscode.commands.executeCommand(CommandKey.Create, TelemetryTriggerFrom.Notification);
    },
  };

  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowMCPAuthPlaceholderNotification);
  void vscode.window.showWarningMessage(message, openYml, recreate).then((selection) => {
    if (selection) {
      ExtTelemetry.sendTelemetryEvent(
        selection.title === openYml.title
          ? TelemetryEvent.ClickOpenMCPAuthYml
          : TelemetryEvent.ClickRecreateMCPApp
      );
      void selection.run();
    }
  });
}

export async function autoInstallDependencyHandler() {
  await VS_CODE_UI.runCommand({
    cmd: "npm i",
    workingDirectory: "${workspaceFolder}/src",
    shellName: localize("teamstoolkit.handlers.autoInstallDependency"),
    iconPath: "cloud-download",
  });
}

export function showSetSensitivityLabelMessage() {
  const message = localize("teamstoolkit.handlers.SetsensitivityLabel");
  void vscode.window.showInformationMessage(message);
}
