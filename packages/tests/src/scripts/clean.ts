// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Project } from "../utils/constants";
import { Env } from "../utils/env";
import {
  AppStudioCleanHelper,
  filterResourceGroupByName,
  deleteResourceGroupByName,
  resourceGroupHasTag,
  GraphApiCleanHelper,
  SharePointApiCleanHelper,
  DevTunnelCleanHelper,
  M365TitleCleanHelper,
} from "../utils/cleanHelper";
import { getAppNamePrefix } from "../utils/nameUtil";
import { delay } from "../utils/retryHandler";

// const appStudioAppNamePrefixList: string[] = [Project.namePrefix, "vs"];
const appNamePrefixList: string[] = [Project.namePrefix, "vs", "fx"];
// const aadNamePrefixList: string[] = [Project.namePrefix, "vs"];
const rgNamePrefixList: string[] = [Project.namePrefix, "vs"];
const adminMicrosoftEntraAppName = [
  "delete-client",
  "ATK Test SP",
  "TravelAgent-AADlocal",
  "Test SP",
];
const excludePrefix: string = getAppNamePrefix();
const keepNamePrefix = "keep-";
const notDeleteTag = "NOT_DELETE";

function hasNotDeleteTag(tags?: unknown): boolean {
  if (Array.isArray(tags)) {
    return tags.includes(notDeleteTag);
  }

  if (typeof tags === "string") {
    return tags.split(/[\s,;]+/).includes(notDeleteTag);
  }

  if (typeof tags === "object" && tags !== null) {
    return Object.prototype.hasOwnProperty.call(tags, notDeleteTag);
  }

  return false;
}

function hasGeneratedNamePrefix(displayName?: string): boolean {
  return displayName?.startsWith(excludePrefix) === true;
}

function hasKeepNamePrefix(displayName?: string): boolean {
  return displayName?.startsWith(keepNamePrefix) === true;
}

function shouldSkipAadApp(displayName?: string, tags?: unknown): boolean {
  if (!displayName) {
    return true;
  }

  return (
    adminMicrosoftEntraAppName.some((name) => displayName.startsWith(name)) ||
    hasGeneratedNamePrefix(displayName) ||
    hasNotDeleteTag(tags)
  );
}

function shouldCleanByPrefix(displayName?: string, tags?: unknown): boolean {
  if (!displayName) {
    return false;
  }

  return (
    appNamePrefixList.some((name) => displayName.startsWith(name)) &&
    !hasGeneratedNamePrefix(displayName) &&
    !hasNotDeleteTag(tags)
  );
}

function shouldCleanAgentResource(
  displayName?: string,
  tags?: unknown,
): boolean {
  return (
    !hasGeneratedNamePrefix(displayName) &&
    !hasKeepNamePrefix(displayName) &&
    !hasNotDeleteTag(tags)
  );
}

async function main() {
  const cleanService = await GraphApiCleanHelper.create(
    Env.cleanTenantId,
    Env.cleanClientId,
    Env.username,
    Env.password,
  );

  try {
    console.log(`clean teams app (exclude ${excludePrefix})`);
    const teamsUserId = await cleanService.getUserIdByName(Env.username);
    const teamsAppList = await cleanService.listTeamsApp(teamsUserId);
    if (teamsAppList) {
      for (const app of teamsAppList) {
        const displayName = app?.teamsAppDefinition?.displayName;
        if (shouldCleanByPrefix(displayName, app?.teamsAppDefinition?.tags)) {
          console.log(displayName);
          try {
            await cleanService.uninstallTeamsApp(teamsUserId, app?.id ?? "");
          } catch {
            console.log(`Failed to uninstall Teams App ${displayName}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`Failed to clean teams app`);
  }

  try {
    console.log(`audit Entra objects related to test artifacts`);
    const aadList = await cleanService.listAad();
    const enterpriseAppList = await cleanService.listEnterpriseApplications();
    const deletedAadList = await cleanService.listDeletedAad();
    const deletedEnterpriseAppList =
      await cleanService.listDeletedEnterpriseApplications();

    console.log(`active app registrations: ${aadList.length}`);
    console.log(`active enterprise applications: ${enterpriseAppList.length}`);
    console.log(`deleted app registrations: ${deletedAadList.length}`);
    console.log(
      `deleted enterprise applications: ${deletedEnterpriseAppList.length}`,
    );
  } catch (e: any) {
    console.log(`Failed to audit Entra objects, ${e.message}`);
  }

  try {
    console.log(`clean AAD (exclude ${excludePrefix})`);
    const aadList = await cleanService.listAad();
    if (aadList) {
      for (const aad of aadList) {
        if (!shouldSkipAadApp(aad.displayName, aad.tags)) {
          console.log(aad.displayName);
          try {
            await cleanService.deleteAad(aad.id!);
          } catch (e: any) {
            console.log(
              `Failed to delete AAD ${aad.displayName} with error: ${e.message}`,
            );
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`Failed to clean AAD`);
  }

  try {
    console.log(`clean enterprise applications (exclude ${excludePrefix})`);
    const enterpriseAppList = await cleanService.listEnterpriseApplications();
    if (enterpriseAppList) {
      for (const enterpriseApp of enterpriseAppList) {
        if (
          shouldCleanByPrefix(enterpriseApp.displayName, enterpriseApp.tags)
        ) {
          console.log(enterpriseApp.displayName);
          try {
            await cleanService.deleteEnterpriseApplication(enterpriseApp.id!);
          } catch (e: any) {
            console.log(
              `Failed to delete enterprise application ${enterpriseApp.displayName} with error: ${e.message}`,
            );
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`Failed to clean enterprise applications`);
  }

  try {
    console.log(
      `purge deleted AAD app registrations (exclude ${excludePrefix})`,
    );
    const deletedAadList = await cleanService.listDeletedAad();
    if (deletedAadList) {
      for (const aad of deletedAadList) {
        if (!shouldSkipAadApp(aad.displayName, aad.tags)) {
          console.log(aad.displayName);
          try {
            await cleanService.deleteDeletedItem(aad.id!);
          } catch (e: any) {
            console.log(
              `Failed to purge deleted AAD ${aad.displayName} with error: ${e.message}`,
            );
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`Failed to purge deleted AAD app registrations`);
  }

  try {
    console.log(
      `purge deleted enterprise applications (exclude ${excludePrefix})`,
    );
    const deletedEnterpriseAppList =
      await cleanService.listDeletedEnterpriseApplications();
    if (deletedEnterpriseAppList) {
      for (const enterpriseApp of deletedEnterpriseAppList) {
        if (
          shouldCleanByPrefix(enterpriseApp.displayName, enterpriseApp.tags)
        ) {
          console.log(enterpriseApp.displayName);
          try {
            await cleanService.deleteDeletedItem(enterpriseApp.id!);
          } catch (e: any) {
            console.log(
              `Failed to purge deleted enterprise application ${enterpriseApp.displayName} with error: ${e.message}`,
            );
          }
        }
      }
    }
  } catch (e: any) {
    console.log(`Failed to purge deleted enterprise applications`);
  }

  try {
    console.log(`clean app in app studio`);
    const addStudioCleanService = await AppStudioCleanHelper.create(
      Env.cleanTenantId,
      Env.cleanClientId,
      Env.username,
      Env.password,
    );
    const appStudioAppList = await addStudioCleanService.getAppsInAppStudio();
    if (appStudioAppList) {
      for (const app of appStudioAppList) {
        if (shouldCleanAgentResource(app?.displayName, app?.tags)) {
          console.log(app?.displayName);
          try {
            await addStudioCleanService.deleteAppInAppStudio(
              app?.appDefinitionId,
            );
          } catch {
            console.log(
              `Failed to delete Teams App ${app?.displayName} in App Studio`,
            );
          }
        }
      }
    }

    console.log(`clean api key registration`);
    const apiKeyRegistrationList =
      await addStudioCleanService.getApiKeyRegistration();
    if (apiKeyRegistrationList) {
      for (const apiKey of apiKeyRegistrationList) {
        if (hasNotDeleteTag(apiKey?.tags)) {
          continue;
        }

        try {
          await addStudioCleanService.deleteApiKeyRegistration(apiKey?.id);
          console.log(apiKey?.id, " is deleted");
        } catch {
          console.log(`Failed to delete api key ${apiKey?.id}`);
        }
      }
    }
  } catch (e: any) {
    console.log(`Failed to clean app in app studio`);
  }

  try {
    console.log(
      `clean up the Azure resource group with name start with ${Project.namePrefix} (exclude ${excludePrefix})`,
    );
    const rgNameList: string[] = [];
    for (const name of rgNamePrefixList) {
      const group = await filterResourceGroupByName(name);
      group.map((rgName) => rgNameList.push(rgName));
    }
    if (rgNameList.length > 0) {
      for (const rgName of rgNameList) {
        for (const name of rgNamePrefixList) {
          if (
            rgName.startsWith(name) &&
            !hasGeneratedNamePrefix(rgName) &&
            !(await resourceGroupHasTag(rgName, notDeleteTag))
          ) {
            await deleteResourceGroupByName(rgName);
          }
        }
      }
    }
  } catch (e: any) {
    console.log(
      `Failed to clean up the Azure resource group with name start with ${Project.namePrefix} (exclude ${excludePrefix})`,
    );
  }

  try {
    console.log(`clean SharePoint app package files`);
    const sharePointCleanService = await SharePointApiCleanHelper.create(
      Env.cleanTenantId,
      Env.cleanClientId,
      Env.username,
      Env.password,
    );
    const sharePointAppList = await sharePointCleanService.listApp();
    if (sharePointAppList) {
      for (const app of sharePointAppList) {
        for (const name of appNamePrefixList) {
          if (
            app.Title?.startsWith(name) &&
            !hasGeneratedNamePrefix(app.Title) &&
            !hasNotDeleteTag(app.Tags ?? app.tags)
          ) {
            console.log(app.Title);
            try {
              await sharePointCleanService.deleteApp(app.ID!);
            } catch {
              console.log(`Failed to delete SharePoint app ${app.ID!}`);
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.log(
      `Failed to clean up SharePoint app package files, ${e.message}`,
    );
  }

  try {
    console.log(`clean dev tunnel`);
    const devTunnelCleanHelper = await DevTunnelCleanHelper.create(
      Env.cleanTenantId,
      Env.username,
      Env.password,
    );
    await devTunnelCleanHelper.deleteAll(
      "TeamsToolkitCreatedTag",
      notDeleteTag,
    );
  } catch (e: any) {
    console.log(`Failed to clean dev tunnel`);
  }

  let retry: boolean;
  let count = 10;
  const total = count + 1;
  do {
    retry = false;
    console.log(`Start to try ${total - count} times`);
    const m365TitleCleanService = await M365TitleCleanHelper.create(
      Env.cleanTenantId,
      "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0",
      Env.username,
      Env.password,
    );
    console.log(`clean M365 Titles (exclude ${excludePrefix})`);
    try {
      const acquisitions = await m365TitleCleanService.listAcquisitions();
      if (acquisitions) {
        for (const acquisition of acquisitions) {
          const titleName = acquisition.titleDefinition?.name;
          const titleTags =
            acquisition.tags ?? acquisition.titleDefinition?.tags;
          if (shouldCleanAgentResource(titleName, titleTags)) {
            console.log(titleName);
            console.log(acquisition.titleId);
            const result = await m365TitleCleanService.unacquire(
              acquisition.titleId,
              1,
            );
            if (!retry && result) {
              retry = true;
            }
          }
        }
      }
    } catch (e: any) {
      console.log(`Get error: ${e.message}`);
      retry = true;
      if (count > 1) {
        // Retry after a short time if getting "Rate limit is exceeded"
        await delay(30 * 1000);
      }
    }

    count--;
  } while (retry && count > 0);
}

main()
  .then((_) => {
    console.log("Clean Job Done.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
