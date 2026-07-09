// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, ok, Result } from "@microsoft/teamsfx-api";
import { PanelType } from "../../controls/PanelType";
import { WebviewPanel } from "../../controls/webviewPanel";
import { VS_CODE_UI } from "../../qm/vsc_ui";
import { ExtTelemetry } from "../../telemetry/extTelemetry";
import { TelemetryEvent } from "../../telemetry/extTelemetryEvents";
import * as localizeUtils from "../../utils/localizeUtils";
import { commands } from "vscode";

export async function checkCopilotCallback(args?: any[]): Promise<Result<null, FxError>> {
  VS_CODE_UI.showMessage(
    "warn",
    localizeUtils.localize("teamstoolkit.accountTree.copilotMessage"),
    false,
    localizeUtils.localize("teamstoolkit.accountTree.copilotEnroll")
  )
    .then(async (result) => {
      if (
        result.isOk() &&
        result.value === localizeUtils.localize("teamstoolkit.accountTree.copilotEnroll")
      ) {
        await VS_CODE_UI.openUrl(
          "https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/prerequisites"
        );
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenCopilotEnroll);
      }
    })
    .catch((_error) => {});
  return Promise.resolve(ok(null));
}

export function checkSideloadingCallback(args?: any[]): Promise<Result<null, FxError>> {
  VS_CODE_UI.showMessage(
    "error",
    localizeUtils.localize("teamstoolkit.accountTree.sideloadingMessage"),
    false,
    localizeUtils.localize("teamstoolkit.accountTree.sideloadingUseTestTenant"),
    localizeUtils.localize("teamstoolkit.accountTree.sideloadingEnable")
  )
    .then(async (result) => {
      if (
        result.isOk() &&
        result.value === localizeUtils.localize("teamstoolkit.accountTree.sideloadingEnable")
      ) {
        await VS_CODE_UI.openUrl(
          "https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/tools-prerequisites#enable-custom-app-upload-using-admin-center"
        );
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenTestTenantLink);
      } else if (
        result.isOk() &&
        result.value === localizeUtils.localize("teamstoolkit.accountTree.sideloadingUseTestTenant")
      ) {
        WebviewPanel.createOrShow(PanelType.AccountHelp);
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenSideloadingEnable);
      }
    })
    .catch((_error) => {});
  return Promise.resolve(ok(null));
}

/**
 * Suggest users to use sandboxed team for debugging
 * @param args
 * @returns
 */
export function checkSandboxCallback(args?: any[]): Promise<Result<null, FxError>> {
  VS_CODE_UI.showMessage(
    "warn",
    localizeUtils.localize("teamstoolkit.accountTree.suggestSandboxedTeam"),
    false,
    localizeUtils.localize("teamstoolkit.accountTree.sandboxedTeam.button")
  )
    .then(async (result) => {
      if (
        result.isOk() &&
        result.value === localizeUtils.localize("teamstoolkit.accountTree.sandboxedTeam.button")
      ) {
        await commands.executeCommand(
          "workbench.action.quickOpen",
          "debug Debug in sandbox in Teams (Edge)"
        );
      }
    })
    .catch((_error) => {});
  return Promise.resolve(ok(null));
}
