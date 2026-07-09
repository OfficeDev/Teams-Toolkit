// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as teamsfxCore from "@microsoft/teamsfx-core";
import * as vscode from "vscode";
import { TelemetryTriggerFrom } from "../telemetry/extTelemetryEvents";
import { openWelcomeHandler } from "../handlers/controlHandlers";

const welcomePageKey = "ms-teams-vscode-extension.welcomePage.shown";

export async function openWelcomePageAfterExtensionInstallation(): Promise<void> {
  if (await teamsfxCore.globalStateGet(welcomePageKey, false)) {
    // Don't show: already showed
    return;
  }

  // Let's show!
  await teamsfxCore.globalStateUpdate(welcomePageKey, true);
  await openWelcomeHandler(TelemetryTriggerFrom.Auto);
  await vscode.commands.executeCommand("workbench.view.extension.teamsfx");
}
