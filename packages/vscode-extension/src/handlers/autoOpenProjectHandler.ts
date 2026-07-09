// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import { GlobalKey, CommandKey } from "../constants";
import * as globalVariables from "../globalVariables";
import { TelemetryTriggerFrom } from "../telemetry/extTelemetryEvents";
import * as autoOpenHelper from "../utils/autoOpenHelper";
import * as projectStatusUtils from "../utils/projectStatusUtils";
import * as readmeHandlers from "./readmeHandlers";

export async function autoOpenProjectHandler(): Promise<void> {
  const isOpenWalkThrough = (await teamsfxCore.globalStateGet(
    GlobalKey.OpenWalkThrough,
    false
  )) as boolean;
  const isOpenReadMe = (await teamsfxCore.globalStateGet(GlobalKey.OpenReadMe, "")) as string;
  const isOpenSampleReadMe = (await teamsfxCore.globalStateGet(
    GlobalKey.OpenSampleReadMe,
    false
  )) as boolean;
  const createWarnings = (await teamsfxCore.globalStateGet(GlobalKey.CreateWarnings, "")) as string;
  const autoInstallDependency = (await teamsfxCore.globalStateGet(
    GlobalKey.AutoInstallDependency
  )) as boolean;
  if (isOpenWalkThrough) {
    await autoOpenHelper.showLocalDebugMessage();
    await teamsfxCore.globalStateUpdate(GlobalKey.OpenWalkThrough, false);

    if (globalVariables.workspaceUri?.fsPath) {
      await autoOpenHelper.ShowScaffoldingWarningSummary(
        globalVariables.workspaceUri.fsPath,
        createWarnings
      );
      await teamsfxCore.globalStateUpdate(GlobalKey.CreateWarnings, "");
    }
  }
  if (isOpenReadMe === globalVariables.workspaceUri?.fsPath) {
    await autoOpenHelper.showLocalDebugMessage();
    await readmeHandlers.openReadMeHandler(TelemetryTriggerFrom.Auto);
    await readmeHandlers.openWorkspaceMCPConfigHandler(TelemetryTriggerFrom.Auto);
    await projectStatusUtils.updateProjectStatus(
      globalVariables.workspaceUri.fsPath,
      CommandKey.OpenReadMe,
      ok(null)
    );
    await teamsfxCore.globalStateUpdate(GlobalKey.OpenReadMe, "");

    await autoOpenHelper.ShowScaffoldingWarningSummary(
      globalVariables.workspaceUri.fsPath,
      createWarnings
    );
    await teamsfxCore.globalStateUpdate(GlobalKey.CreateWarnings, "");
  }
  if (isOpenSampleReadMe) {
    await autoOpenHelper.showLocalDebugMessage();
    await readmeHandlers.openSampleReadmeHandler([TelemetryTriggerFrom.Auto]);
    await teamsfxCore.globalStateUpdate(GlobalKey.OpenSampleReadMe, false);
  }
  if (autoInstallDependency) {
    await autoOpenHelper.autoInstallDependencyHandler();
    await teamsfxCore.globalStateUpdate(GlobalKey.AutoInstallDependency, false);
  }
}
