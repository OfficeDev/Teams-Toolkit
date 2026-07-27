// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName, Platform } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import * as folder from "../../../../folder";
import * as templateHelper from "../../templateHelper";
import { Template } from "./interface";

function getMetadataVersionFiles(platform?: Platform): string[] {
  const configRoot = path.join(os.homedir(), `.${String(ConfigFolderName)}`);
  if (platform === Platform.VS) {
    return [path.join(configRoot, "vs-metadata", "template-vs-version.txt")];
  }
  return [
    path.join(configRoot, "template-version.txt"),
    path.join(configRoot, "template-version-v4.txt"),
  ];
}

function invalidateCorruptedMetadataCache(cacheFilePath: string, platform?: Platform): void {
  try {
    fs.removeSync(cacheFilePath);
  } catch {
    // best-effort cleanup
  }
  for (const versionFile of getMetadataVersionFiles(platform)) {
    try {
      fs.removeSync(versionFile);
    } catch {
      // best-effort cleanup
    }
  }
}

function getTemplateMetadataConfig(configName: string, platform?: Platform): Template[] {
  let jsonPath: string;

  const cacheSubDir = platform === Platform.VS ? "vs-metadata" : "metadata";
  const cachedJsonPath = path.join(
    os.homedir(),
    `.${String(ConfigFolderName)}`,
    cacheSubDir,
    configName
  );

  // Check if cached JSON exists, otherwise fallback to bundled templates folder.
  // The v4 channel migration covers only the VSC/CLI metadata (`templates-v4@`);
  // VS keeps its v3 `templates-vs@` cache untouched, so the v4 bundled decision
  // is not applied for Platform.VS.
  const forceBundledForV4 = platform !== Platform.VS && templateHelper.useBundledMetadataForV4();
  if (
    !templateHelper.useLocalTemplate() &&
    !forceBundledForV4 &&
    cachedJsonPath &&
    fs.pathExistsSync(cachedJsonPath)
  ) {
    try {
      const content = fs.readFileSync(cachedJsonPath, "utf-8");
      return JSON.parse(content) as Template[];
    } catch {
      invalidateCorruptedMetadataCache(cachedJsonPath, platform);
    }
    jsonPath = path.join(folder.getTemplatesFolder(), "metadata", configName);
  } else {
    jsonPath = path.join(folder.getTemplatesFolder(), "metadata", configName);
  }

  const content = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(content) as Template[];
}

// used by programming language question options filter
export function getAllTemplatesOnPlatform(platform: Platform): Template[] {
  const allTemplates = getTemplateMetadataConfig("allTemplates.json", platform);
  switch (platform) {
    case Platform.VSCode:
      return allTemplates.filter((t) => t.language !== "csharp");
    case Platform.VS:
      return allTemplates.filter((t) => t.language === "csharp");
    case Platform.CLI:
      return allTemplates;
    default:
      return [];
  }
}

// used by default generator
export function getDefaultTemplatesOnPlatform(platform: Platform): Template[] {
  const defaultGeneratorTemplates = getTemplateMetadataConfig(
    "defaultGeneratorTemplates.json",
    platform
  );
  switch (platform) {
    case Platform.VSCode:
      return defaultGeneratorTemplates.filter((t) => t.language !== "csharp");
    case Platform.VS:
      return defaultGeneratorTemplates.filter((t) => t.language === "csharp");
    case Platform.CLI:
      return defaultGeneratorTemplates;
    default:
      return [];
  }
}
