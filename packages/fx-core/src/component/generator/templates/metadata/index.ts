// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName, Platform } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { FeatureFlags, featureFlagManager } from "../../../../common/featureFlags";
import * as folder from "../../../../folder";
import * as templateHelper from "../../templateHelper";
import { Template } from "./interface";

const DECLARATIVE_AGENT_ID_PREFIX = "declarative-agent";

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
    jsonPath = cachedJsonPath;
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

export interface TemplateGroup {
  name: string;
  alias?: string;
  displayName: string;
  description: string;
  language: string;
}

/**
 * Group templates by name, ignoring programming language. The first language
 * encountered for a given name wins, and the display name falls back to
 * `displayName || alias || name`.
 */
export function groupTemplatesByName(templates: Template[]): TemplateGroup[] {
  const groupedTemplates = new Map<string, TemplateGroup>();
  templates.forEach((template) => {
    if (!groupedTemplates.has(template.name)) {
      groupedTemplates.set(template.name, {
        name: template.name,
        alias: template.alias,
        displayName: template.displayName || template.alias || template.name,
        description: template.description,
        language: template.language,
      });
    }
  });
  return Array.from(groupedTemplates.values());
}

// Pick the platform to list templates for: VS (csharp) when the CLI .NET flag
// is on, otherwise VSCode.
function getListPlatform(): Platform {
  return featureFlagManager.getBooleanValue(FeatureFlags.CLIDotNet) ? Platform.VS : Platform.VSCode;
}

// List all templates grouped by name.
export function listAllTemplates(): TemplateGroup[] {
  return groupTemplatesByName(getAllTemplatesOnPlatform(getListPlatform()));
}

// List declarative agent templates grouped by name.
export function listDeclarativeAgentTemplates(): TemplateGroup[] {
  const templates = getAllTemplatesOnPlatform(getListPlatform()).filter((t) =>
    (t.alias || t.name).startsWith(DECLARATIVE_AGENT_ID_PREFIX)
  );
  return groupTemplatesByName(templates);
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
