// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as os from "os";
import * as extensionPackage from "./../../package.json";
import * as fs from "fs-extra";
import { ext } from "../extensionVariables";
import * as path from "path";
import { ConfigFolderName } from "@microsoft/teamsfx-api";
import { isValidProject } from "@microsoft/teamsfx-core";

export function getPackageVersion(versionStr: string): string {
  if (versionStr.includes("alpha")) {
    return "alpha";
  }

  if (versionStr.includes("beta")) {
    return "beta";
  }

  if (versionStr.includes("rc")) {
    return "rc";
  }

  return "formal";
}

export function isFeatureFlag(): boolean {
  return extensionPackage.featureFlag === "true";
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function isWindows() {
  return os.type() === "Windows_NT";
}

export function isMacOS() {
  return os.type() === "Darwin";
}

export function isLinux() {
  return os.type() === "Linux";
}

export function getActiveEnv() {
  // TODO: need to get active env if multiple env configurations supported
  return "default";
}

export function getTeamsAppId() {
  try {
    const ws = ext.workspaceUri.fsPath;
    if (isValidProject(ws)) {
      const env = getActiveEnv();
      const envJsonPath = path.join(ws, `.${ConfigFolderName}/env.${env}.json`);
      const envJson = JSON.parse(fs.readFileSync(envJsonPath, "utf8"));
      return envJson.solution.remoteTeamsAppId;
    }
  } catch (e) {
    return undefined;
  }
}

export function getProjectId(): string | undefined {
  try {
    const ws = ext.workspaceUri.fsPath;
    if (isValidProject(ws)) {
      const settingsJsonPath = path.join(ws, `.${ConfigFolderName}/settings.json`);
      const settingsJson = JSON.parse(fs.readFileSync(settingsJsonPath, "utf8"));
      return settingsJson.projectId;
    }
  } catch (e) {
    return undefined;
  }
}

export async function isSPFxProject(workspacePath: string): Promise<boolean> {
  if (await fs.pathExists(`${workspacePath}/SPFx`)) {
    return true;
  }
  return false;
}

export function anonymizeFilePaths(stack?: string): string {
  if (stack === undefined || stack === null) {
    return "";
  }

  const cleanupPatterns: RegExp[] = [];

  let updatedStack = stack;

  const cleanUpIndexes: [number, number][] = [];
  for (const regexp of cleanupPatterns) {
    while (true) {
      const result = regexp.exec(stack);
      if (!result) {
        break;
      }
      cleanUpIndexes.push([result.index, regexp.lastIndex]);
    }
  }

  const nodeModulesRegex = /^[\\\/]?(node_modules|node_modules\.asar)[\\\/]/;
  const fileRegex =
    /(file:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w-\._]+(\\\\|\\|\/))+[\w-\._]*/g;
  let lastIndex = 0;
  updatedStack = "";

  while (true) {
    const result = fileRegex.exec(stack);
    if (!result) {
      break;
    }
    // Anoynimize user file paths that do not need to be retained or cleaned up.
    if (
      !nodeModulesRegex.test(result[0]) &&
      cleanUpIndexes.every(([x, y]) => result.index < x || result.index >= y)
    ) {
      updatedStack += stack.substring(lastIndex, result.index) + "<REDACTED: user-file-path>";
      lastIndex = fileRegex.lastIndex;
    }
  }
  if (lastIndex < stack.length) {
    updatedStack += stack.substr(lastIndex);
  }

  // sanitize with configured cleanup patterns
  for (const regexp of cleanupPatterns) {
    updatedStack = updatedStack.replace(regexp, "");
  }

  return updatedStack;
}
