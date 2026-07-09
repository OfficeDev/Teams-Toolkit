// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import { AadManager, ResourceGroupManager } from "../commonlib";
import {
  BASE_APP_NAME_PREFIX,
  getAppNamePrefix,
  normalizeAppNamePrefix,
} from "./commonUtils";

export async function cleanUpAad(
  contains: string,
  hours?: number,
  retryTimes = 2,
): Promise<void> {
  const aadManager = await AadManager.init();
  await aadManager.deleteAadApps(contains, hours, retryTimes);
}

export async function cleanUpResourceGroup(
  contains: string,
  hours?: number,
  retryTimes = 2,
): Promise<void> {
  const groups = await ResourceGroupManager.searchResourceGroups(contains);
  const filteredGroups =
    hours && hours > 0
      ? groups.filter((group: { name?: string }) => {
          const name = group.name!;
          const startPos = name.indexOf(contains) + contains.length;
          const createdTime = Number(name.slice(startPos, startPos + 13));
          return Date.now() - createdTime > hours * 3600 * 1000;
        })
      : groups;

  const promises = filteredGroups.map((rg: { name?: string }) => {
    ResourceGroupManager.deleteResourceGroup(rg.name!, retryTimes);
    console.log(`[Successfully] clean up ${rg.name} resource group.`);
  });
  await Promise.all(promises);
  console.log(
    `[Successfully] clean up ${promises.length} Azure resource groups.`,
  );
}

(async () => {
  const rawPrefix = process.env.E2E_CLEANUP_PREFIX || getAppNamePrefix();
  const prefixList = Array.from(
    new Set([normalizeAppNamePrefix(rawPrefix), rawPrefix]),
  );

  const promises = prefixList.flatMap((prefix) => [
    cleanUpAad(prefix),
    cleanUpResourceGroup(prefix),
  ]);

  // Only clean legacy prefixes during broad (scheduled) cleanup
  if (prefixList.includes(BASE_APP_NAME_PREFIX)) {
    const promise3 = cleanUpResourceGroup("fx_e_2_e_");
    const promise4 = cleanUpResourceGroup("teamsfxt_");
    const promise5 = cleanUpResourceGroup("fx_");
    await Promise.all([...promises, promise3, promise4, promise5]);
  } else {
    await Promise.all(promises);
  }
})();
