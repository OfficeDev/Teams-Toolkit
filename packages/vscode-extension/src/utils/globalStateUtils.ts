// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Warning } from "@microsoft/teamsfx-api";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";
import { Uri } from "vscode";
import { GlobalKey } from "../constants";
import * as globalVariables from "../globalVariables";
import * as telemetryUtils from "./telemetryUtils";

export async function updateAutoOpenGlobalKey(
  showLocalDebugMessage: boolean,
  projectUri: Uri,
  warnings: Warning[] | undefined,
  args?: any[]
): Promise<void> {
  if (telemetryUtils.isTriggerFromWalkThrough(args)) {
    await globalState.globalStateUpdate(GlobalKey.OpenWalkThrough, true);
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, "");
  } else {
    await globalState.globalStateUpdate(GlobalKey.OpenWalkThrough, false);
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, projectUri.fsPath);
  }

  if (showLocalDebugMessage) {
    await globalState.globalStateUpdate(GlobalKey.ShowLocalDebugMessage, true);
  }

  if (warnings?.length) {
    await globalState.globalStateUpdate(GlobalKey.CreateWarnings, JSON.stringify(warnings));
  }

  if (globalVariables.checkIsSPFx(projectUri.fsPath)) {
    void globalState.globalStateUpdate(GlobalKey.AutoInstallDependency, true);
  }
}
