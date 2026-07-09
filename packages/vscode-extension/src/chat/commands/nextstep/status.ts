// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as projectStatusUtils from "../../../utils/projectStatusUtils";
import * as helper from "./helper";
import { MachineStatus, WholeStatus } from "./types";

export const firstInstalledKey = "first-installation";

export async function getWholeStatus(folder?: string): Promise<WholeStatus> {
  if (!folder) {
    return {
      machineStatus: await getMachineStatus(),
    };
  } else {
    const projectSettings = helper.getProjectMetadata(folder);
    const projectId = projectSettings?.projectId;
    const actionStatus = await projectStatusUtils.getProjectStatus(projectId ?? folder);
    const codeModifiedTime = {
      source: await projectStatusUtils.getFileModifiedTime(
        `${folder.split("\\").join("/")}/**/*.{ts,tsx,js,jsx}`
      ),
      infra: await projectStatusUtils.getFileModifiedTime(
        `${folder.split("\\").join("/")}/infra/**/*`
      ),
    };

    return {
      machineStatus: await getMachineStatus(),
      projectOpened: {
        path: folder,
        projectId,
        codeModifiedTime,
        readmeContent: await projectStatusUtils.getREADME(folder),
        actionStatus,
        launchJSONContent: await projectStatusUtils.getLaunchJSON(folder),
      },
    };
  }
}

export async function getMachineStatus(): Promise<MachineStatus> {
  const firstInstalled = await helper.globalStateGet(firstInstalledKey, true);
  await helper.globalStateUpdate(firstInstalledKey, false);
  return {
    firstInstalled,
    ...(await helper.checkCredential()),
  };
}
