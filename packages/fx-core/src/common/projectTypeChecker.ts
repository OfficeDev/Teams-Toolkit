// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";
import semver from "semver";
import { parseDocument } from "yaml";
import { pathUtils } from "../component/utils/pathUtils";
import { isValidOfficeAddInProject } from "./projectSettingsHelper";
import {
  isYamlFileName,
  isYamlFileNameV4,
  MetadataV2,
  MetadataV3,
  MetadataV4,
} from "./versionMetadata";

export const TeamsJsModule = "@microsoft/teams-js";

export const SPFxKey = "@microsoft/generator-sharepoint";

export enum TeamsfxVersionState {
  Compatible = "compatible",
  Upgradable = "upgradable",
  Unsupported = "unsupported",
  Invalid = "invalid",
}

export interface ProjectTypeResult {
  isTeamsFx: boolean;
  teamsfxConfigType?: string;
  teamsfxConfigVersion?: string;
  teamsfxVersionState?: TeamsfxVersionState;
  teamsfxProjectId?: string;
  hasTeamsManifest: boolean;
  manifestCapabilities?: string[];
  manifestAppId?: string;
  manifestVersion?: string;
  dependsOnTeamsJs?: boolean;
  isSPFx?: boolean;
  officeAddinProjectType?: string;
  lauguages: ("ts" | "js" | "csharp" | "java" | "python" | "c")[];
}

class ProjectTypeChecker {
  async scanFolder(
    currentPath: string,
    ignoreFolderName: string[],
    data: ProjectTypeResult,
    fileCallback: (filePath: string, data: ProjectTypeResult) => Promise<boolean>,
    maxDepth: number,
    currentDepth = 0
  ) {
    const fileName = path.parse(currentPath).base;
    if (ignoreFolderName.includes(fileName)) {
      return true;
    }
    const res = await fileCallback(currentPath, data);
    if (!res) {
      return false;
    }
    const stat = await fs.stat(currentPath);
    if (stat.isDirectory()) {
      if (currentDepth < maxDepth) {
        const subFiles = await fs.readdir(currentPath);
        for (const subFile of subFiles) {
          const subFilePath = path.join(currentPath, subFile);
          const res = await this.scanFolder(
            subFilePath,
            ignoreFolderName,
            data,
            fileCallback,
            maxDepth,
            currentDepth + 1
          );
          if (!res) {
            return false;
          }
        }
      }
    }
    return true;
  }

  async findManifestCallback(filePath: string, data: ProjectTypeResult): Promise<boolean> {
    const fileName = path.parse(filePath).base;
    if (fileName.toLowerCase().includes("manifest") && fileName.toLowerCase().endsWith(".json")) {
      try {
        const manifestContent = await fs.readFile(filePath, "utf-8");
        const manifestObject = JSON.parse(manifestContent);
        const schemaLink = manifestObject["$schema"];
        if (schemaLink && schemaLink.endsWith("/MicrosoftTeams.schema.json")) {
          data.hasTeamsManifest = true;
          data.manifestCapabilities = getCapabilities(manifestObject);
          data.manifestAppId = manifestObject.id;
          data.manifestVersion = manifestObject.manifestVersion;
          return false;
        }
      } catch (error) {}
    }
    return true;
  }

  async findProjectLanguateCallback(filePath: string, data: ProjectTypeResult): Promise<boolean> {
    const parsed = path.parse(filePath);
    const fileName = parsed.base;
    if (fileName === "tsconfig.json") {
      data.lauguages.push("ts");
      return false;
    } else if (fileName === "package.json") {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const json = JSON.parse(content);
        if (json?.dependencies?.[TeamsJsModule]) {
          data.dependsOnTeamsJs = true;
        }
        const tsconfigExist = await fs.pathExists(path.join(parsed.dir, "tsconfig.json"));
        if (!tsconfigExist) data.lauguages.push("js");
        else data.lauguages.push("ts");
        return false;
      } catch (error) {}
    } else if (fileName.toLowerCase().endsWith(".csproj")) {
      data.lauguages.push("csharp");
      return false;
    } else if (fileName === "pom.xml" || fileName === "build.gradle") {
      data.lauguages.push("java");
      return false;
    } else if (fileName.toLowerCase() === "makefile") {
      data.lauguages.push("c");
      return false;
    } else if (fileName === "requirements.txt" || fileName === "pyproject.toml") {
      data.lauguages.push("python");
      return false;
    }
    return true;
  }
  async findTeamsFxCallback(filePath: string, data: ProjectTypeResult): Promise<boolean> {
    const parsed = path.parse(filePath);
    const fileName = parsed.base;
    if (fileName === ".fx") {
      const settingFile = path.join(filePath, "configs", "projectSettings.json");
      const exists = await fs.pathExists(settingFile);
      if (exists) {
        data.isTeamsFx = true;
        data.teamsfxConfigType = MetadataV2.configFile;
        const json = await fs.readJson(settingFile);
        data.teamsfxConfigVersion = json.version;
        data.teamsfxProjectId = json.projectId;
        const solutionSettings = json.solutionSettings;
        if (
          !solutionSettings ||
          !solutionSettings?.activeResourcePlugins ||
          !data.teamsfxConfigVersion
        ) {
          data.teamsfxVersionState = TeamsfxVersionState.Invalid;
        } else if (data.teamsfxConfigVersion) {
          if (
            semver.gte(data.teamsfxConfigVersion, MetadataV2.projectVersion) &&
            semver.lte(data.teamsfxConfigVersion, MetadataV2.projectMaxVersion)
          ) {
            data.teamsfxVersionState = TeamsfxVersionState.Upgradable;
          } else {
            data.teamsfxVersionState = TeamsfxVersionState.Unsupported;
          }
        }
        return false;
      }
    } else if (isYamlFileName(fileName)) {
      data.isTeamsFx = true;
      data.teamsfxConfigType = fileName;
      if (fileName === MetadataV3.configFile || fileName === MetadataV4.configFile) {
        const yamlFileContent: string = await fs.readFile(filePath, "utf8");
        const appYaml = parseDocument(yamlFileContent);
        data.teamsfxConfigVersion = appYaml.get("version") as string;
        data.teamsfxProjectId = appYaml.get("projectId") as string;
        if (
          isYamlFileNameV4(fileName) ||
          !semver.valid(data.teamsfxConfigVersion) ||
          semver.lt(data.teamsfxConfigVersion, MetadataV3.unSupprotVersion)
        ) {
          data.teamsfxVersionState = TeamsfxVersionState.Compatible;
        } else {
          data.teamsfxVersionState = TeamsfxVersionState.Unsupported;
        }
      } else {
        return true;
      }
      return false;
    }
    return true;
  }
  async findSPFxCallback(filePath: string, data: ProjectTypeResult): Promise<boolean> {
    const parsed = path.parse(filePath);
    const fileName = parsed.base;
    if (fileName === ".yo-rc.json") {
      const content = await fs.readJson(filePath);
      if (content[SPFxKey]) {
        data.isSPFx = true;
        return false;
      }
    }
    return true;
  }

  findOfficeAddinProject(filePath: string, data: ProjectTypeResult): boolean {
    if (isValidOfficeAddInProject(filePath)) {
      data.officeAddinProjectType = "XML";
      data.isTeamsFx = false;
      return false;
    }
    return true;
  }

  async checkProjectType(projectPath: string) {
    const result: ProjectTypeResult = {
      isTeamsFx: false,
      hasTeamsManifest: false,
      dependsOnTeamsJs: false,
      lauguages: [],
    };
    try {
      await this.scanFolder(
        projectPath,
        ["node_modules", "bin", "build", "dist", ".vscode"],
        result,
        this.findManifestCallback,
        2,
        0
      );
      await this.scanFolder(
        projectPath,
        ["node_modules", "bin", "build", "dist", ".vscode"],
        result,
        this.findProjectLanguateCallback,
        2,
        0
      );
      //only scan direct sub folder
      await this.scanFolder(
        projectPath,
        ["node_modules", "bin", "build", "dist", ".vscode"],
        result,
        this.findTeamsFxCallback,
        1,
        0
      );
      await this.scanFolder(
        projectPath,
        ["node_modules", "bin", "build", "dist", ".vscode"],
        result,
        this.findSPFxCallback,
        2,
        0
      );
      this.findOfficeAddinProject(projectPath, result);
    } catch (e) {}
    return result;
  }
}
export function getCapabilities(manifest: any): string[] {
  const capabilities: string[] = [];
  if (manifest.staticTabs && manifest.staticTabs.length > 0) {
    capabilities.push("staticTab");
  }
  if (manifest.configurableTabs && manifest.configurableTabs.length > 0) {
    capabilities.push("configurableTab");
  }
  if (manifest.bots && manifest.bots.length > 0) {
    capabilities.push("bot");
  }
  if (manifest.composeExtensions && manifest.composeExtensions.length > 0) {
    capabilities.push("composeExtension");
  }
  if (manifest.extensions && manifest.extensions.length > 0) {
    capabilities.push("extension");
  }
  if (
    manifest.copilotAgents?.plugins &&
    manifest.copilotAgents.plugins.length > 0 &&
    !capabilities.includes("plugin")
  ) {
    capabilities.push("plugin");
  }
  if (
    manifest.copilotAgents?.declarativeAgents &&
    manifest.copilotAgents.declarativeAgents.length > 0 &&
    !capabilities.includes("copilotGpt")
  ) {
    capabilities.push("copilotGpt");
  }
  return capabilities;
}

export function IsDeclarativeAgentManifest(manifest: any): boolean {
  return !!(
    manifest.copilotAgents?.declarativeAgents && manifest.copilotAgents.declarativeAgents.length > 0
  );
}

export function isTypeSpecProject(projectPath: string | undefined): boolean {
  if (!projectPath) {
    return false;
  }
  const yamlFilePath = pathUtils.getYmlFilePath(projectPath);
  if (!yamlFilePath) {
    return false;
  }

  const yamlContent = fs.readFileSync(yamlFilePath, "utf8");
  return yamlContent.includes("typeSpec/compile");
}

export const projectTypeChecker = new ProjectTypeChecker();
