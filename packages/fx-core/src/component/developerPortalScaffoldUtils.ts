// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Yuqi Zhou <yuqzho@microsoft.com>
 */

import {
  BotOrMeScopes,
  Context,
  FxError,
  ICommandList,
  IStaticTab,
  Inputs,
  Result,
  TeamsAppManifest,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import semver from "semver";
import { getLocalizedString } from "../common/localizeUtils";
import { InputValidationError } from "../error";
import { QuestionNames } from "../question/constants";
import { getProjectTypeAndCapability } from "../question/create";
import { CoordinatorSource } from "./constants";
import * as appStudio from "./driver/teamsApp/appStudio";
import {
  COMPOSE_EXTENSIONS_TPL_V3,
  DEFAULT_DESCRIPTION,
  DEFAULT_DEVELOPER,
  getBotsTplBasedOnVersion,
} from "./driver/teamsApp/constants";
import { AppDefinition } from "./driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { manifestUtils } from "./driver/teamsApp/utils/ManifestUtils";
import { envUtil } from "./utils/envUtil";
import { pathUtils } from "./utils/pathUtils";

const appPackageFolderName = "appPackage";
const colorFileName = "color.png";
const outlineFileName = "outline.png";
const manifestFileName = "manifest.json";

export const answerToRepaceBotId = "bot";
export const answerToReplaceMessageExtensionBotId = "messageExtension";

export class DeveloperPortalScaffoldUtils {
  async updateFilesForTdp(
    ctx: Context,
    appDefinition: AppDefinition,
    inputs: Inputs
  ): Promise<Result<undefined, FxError>> {
    if (!inputs.projectPath) {
      return err(new InputValidationError("projectPath", "undefined"));
    }

    if (!ctx.tokenProvider) {
      return err(new InputValidationError("tokenProvider", "undefined"));
    }

    const manifestRes = await updateManifest(ctx, appDefinition, inputs);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const envRes = await updateEnv(appDefinition.teamsAppId!, inputs.projectPath);
    if (envRes.isErr()) {
      return err(envRes.error);
    }

    return ok(undefined);
  }
}

enum TabUrlType {
  WebsiteUrl = "WebsiteUrl",
  ContentUrl = "ContentUrl",
}

async function updateManifest(
  ctx: Context,
  appDefinition: AppDefinition,
  inputs: Inputs
): Promise<Result<undefined, FxError>> {
  const res = await appStudio.getAppPackage(
    appDefinition.teamsAppId!,
    ctx.tokenProvider!.m365TokenProvider,
    ctx.logProvider
  );
  if (res.isErr()) {
    return err(res.error);
  }

  const appPackage = res.value;
  if (!appPackage.manifest) {
    const msg = getLocalizedString(
      "core.developerPortal.scaffold.CannotFindManifest",
      appDefinition.teamsAppId
    );
    return err(new UserError(CoordinatorSource, "CouldNotFoundManifest", msg, msg));
  }

  const colorFilePath = path.join(inputs.projectPath!, appPackageFolderName, colorFileName);
  const outlineFilePath = path.join(inputs.projectPath!, appPackageFolderName, outlineFileName);

  const manifestTemplatePath = path.join(
    inputs.projectPath!,
    appPackageFolderName,
    manifestFileName
  );
  const manifestRes =
    await manifestUtils._readAppManifest.bind(manifestUtils)(manifestTemplatePath);
  if (manifestRes.isErr()) {
    return err(manifestRes.error);
  }
  const existingManifestTemplate = manifestRes.value;

  if (!existingManifestTemplate) {
    return err(new InputValidationError("manifest.json downloaded from template", "undefined"));
  }

  // icons
  const icons = appPackage.icons;
  if (icons) {
    if (icons.color) {
      await fs.writeFile(colorFilePath, icons.color);
    }

    if (icons.outline) {
      await fs.writeFile(outlineFilePath, icons.outline);
    }
  }

  // manifest
  const manifest = JSON.parse(appPackage.manifest.toString("utf8")) as TeamsAppManifest;
  manifest.id = "${{TEAMS_APP_ID}}";

  // manifest: tab
  const tabs = manifest.staticTabs;
  let needUpdateStaticTabUrls = false;
  if (
    inputs[QuestionNames.ReplaceContentUrl] &&
    inputs[QuestionNames.ReplaceContentUrl].length != 0
  ) {
    needUpdateStaticTabUrls = true;
    updateTabUrl(
      inputs[QuestionNames.ReplaceContentUrl],
      TabUrlType.ContentUrl,
      tabs,
      existingManifestTemplate.staticTabs
    );
  }

  if (
    inputs[QuestionNames.ReplaceWebsiteUrl] &&
    inputs[QuestionNames.ReplaceWebsiteUrl].length != 0
  ) {
    needUpdateStaticTabUrls = true;
    updateTabUrl(
      inputs[QuestionNames.ReplaceWebsiteUrl],
      TabUrlType.WebsiteUrl,
      tabs,
      existingManifestTemplate.staticTabs
    );
  }

  if (needUpdateStaticTabUrls) {
    const validDomains = manifest.validDomains ?? [];
    validDomains.push("${{TAB_DOMAIN}}");
    manifest.validDomains = validDomains;
  }

  // manifest: bot
  if (inputs[QuestionNames.ReplaceBotIds]) {
    if (inputs[QuestionNames.ReplaceBotIds].includes(answerToRepaceBotId)) {
      if (existingManifestTemplate.bots && existingManifestTemplate.bots.length > 0) {
        manifest.bots = existingManifestTemplate.bots;
      } else {
        manifest.bots = getBotsTplBasedOnVersion(manifest.manifestVersion);
        manifest.bots[0].botId = "${{BOT_ID}}";
      }
    }

    if (inputs[QuestionNames.ReplaceBotIds].includes(answerToReplaceMessageExtensionBotId)) {
      if (
        existingManifestTemplate.composeExtensions &&
        existingManifestTemplate.composeExtensions.length > 0
      ) {
        manifest.composeExtensions = existingManifestTemplate.composeExtensions;
      } else {
        manifest.composeExtensions = COMPOSE_EXTENSIONS_TPL_V3;
        manifest.composeExtensions[0].botId = "${{BOT_ID}}";
      }
    }
  }

  // manifest: no tab, bot or me selected on TDP before
  if (!getProjectTypeAndCapability(appDefinition)) {
    // which means user selects a capability through TTK UI.
    manifest.bots = existingManifestTemplate.bots;
    manifest.composeExtensions = existingManifestTemplate.composeExtensions;
    manifest.staticTabs = existingManifestTemplate.staticTabs;
    manifest.configurableTabs = existingManifestTemplate.configurableTabs;
    manifest.permissions = existingManifestTemplate.permissions;
    manifest.validDomains = existingManifestTemplate.validDomains;
    manifest.webApplicationInfo = existingManifestTemplate.webApplicationInfo;
    if (
      existingManifestTemplate.supportsChannelFeatures &&
      "supportsChannelFeatures" in appDefinition
    ) {
      manifest.supportsChannelFeatures = existingManifestTemplate.supportsChannelFeatures;
    }
  }

  // manifest: developer
  if (manifest.developer) {
    if (!manifest.developer.websiteUrl) {
      manifest.developer.websiteUrl = DEFAULT_DEVELOPER.websiteUrl;
    }

    if (!manifest.developer.privacyUrl) {
      manifest.developer.privacyUrl = DEFAULT_DEVELOPER.privacyUrl;
    }

    if (!manifest.developer.termsOfUseUrl) {
      manifest.developer.termsOfUseUrl = DEFAULT_DEVELOPER.termsOfUseUrl;
    }

    if (!manifest.developer.name) {
      manifest.developer.name = DEFAULT_DEVELOPER.name;
    }

    if (!manifest.description.short) {
      manifest.description.short = DEFAULT_DESCRIPTION.short;
    }

    if (!manifest.description.full) {
      manifest.description.full = DEFAULT_DESCRIPTION.full;
    }
  }

  // Adjust scope based on manifest version.
  if (!!manifest.configurableTabs && manifest.configurableTabs.length > 0) {
    if (manifest.configurableTabs[0].scopes) {
      manifest.configurableTabs[0].scopes = adjustScopeBasedOnVersion(
        manifest.configurableTabs[0].scopes,
        manifest.manifestVersion
      ) as ("team" | "groupchat")[];
    }
  }
  if (!!manifest.bots && manifest.bots.length > 0) {
    if (manifest.bots[0].scopes) {
      manifest.bots[0].scopes = adjustScopeBasedOnVersion(
        manifest.bots[0].scopes,
        manifest.manifestVersion
      ) as BotOrMeScopes;
    }

    if (manifest.bots[0].commandLists) {
      manifest.bots[0].commandLists.forEach((commandList: ICommandList) => {
        if (commandList.scopes) {
          commandList.scopes = adjustScopeBasedOnVersion(
            commandList.scopes,
            manifest.manifestVersion
          ) as BotOrMeScopes;
        }
      });
    }
  }

  if (!!manifest.composeExtensions && manifest.composeExtensions.length > 0) {
    if (manifest.composeExtensions[0].scopes) {
      manifest.composeExtensions[0].scopes = adjustScopeBasedOnVersion(
        manifest.composeExtensions[0].scopes,
        manifest.manifestVersion
      ) as BotOrMeScopes;
    }
  }

  await fs.writeFile(manifestTemplatePath, JSON.stringify(manifest, null, "\t"), "utf-8");

  // languages
  const languages = appPackage.languages;
  if (languages) {
    for (const code in languages) {
      const content = JSON.parse(languages[code].toString("utf8"));
      const languageFilePath = path.join(inputs.projectPath!, appPackageFolderName, `${code}.json`);
      await fs.writeFile(languageFilePath, JSON.stringify(content, null, "\t"), "utf-8");
    }
  }
  return ok(undefined);
}

// If the template does not have .env.local, write to .env.dev instead.
export async function updateEnv(
  appId: string,
  projectPath: string
): Promise<Result<undefined, FxError>> {
  const localEnvFilePathRes = await pathUtils.getEnvFilePath.bind(pathUtils)(projectPath, "local");
  if (localEnvFilePathRes.isErr()) return err(localEnvFilePathRes.error);
  if (!!localEnvFilePathRes.value && (await fs.pathExists(localEnvFilePathRes.value))) {
    return await envUtil.writeEnv.bind(envUtil)(projectPath, "local", {
      TEAMS_APP_ID: appId,
    });
  } else {
    return await envUtil.writeEnv.bind(envUtil)(projectPath, "dev", {
      TEAMS_APP_ID: appId,
    });
  }
}

function updateTabUrl(
  answers: string[],
  tabUrlType: TabUrlType,
  tabs: IStaticTab[] | undefined,
  existingManifestStaticTabs: IStaticTab[] | undefined
) {
  if (!tabs || tabs.length === 0) {
    return err(new InputValidationError("tabs in manifest.json", "empty"));
  }

  if (!existingManifestStaticTabs || existingManifestStaticTabs.length === 0) {
    return err(new InputValidationError("static tabs in manifest.json", "empty"));
  }
  answers.forEach((answer: string) => {
    const tabToUpdate = findTabBasedOnName(answer, tabs);
    if (tabToUpdate) {
      switch (tabUrlType) {
        case TabUrlType.ContentUrl:
          tabToUpdate.contentUrl = existingManifestStaticTabs[0].contentUrl;
          break;
        case TabUrlType.WebsiteUrl:
          tabToUpdate.websiteUrl = existingManifestStaticTabs[0].websiteUrl;
          break;
        default:
          break;
      }
    }
  });
}

function findTabBasedOnName(name: string, tabs: IStaticTab[]): IStaticTab | undefined {
  return tabs.find((o) => o.name === name);
}

// A temporary solution to adjust scope based on manifest version to avoid errors in manifest validation.
export function adjustScopeBasedOnVersion(scopes: string[], version: string): string[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return scopes.map((o) => {
      if (o === "groupchat") {
        return "groupChat";
      }
      return o;
    });
  } else {
    return scopes.map((o) => {
      if (o === "groupChat") {
        return "groupchat";
      }
      return o;
    });
  }
}

export const developerPortalScaffoldUtils = new DeveloperPortalScaffoldUtils();
