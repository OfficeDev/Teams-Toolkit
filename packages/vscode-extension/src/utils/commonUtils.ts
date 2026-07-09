// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { format } from "util";
import * as vscode from "vscode";
import { Result, SystemError, err, ok } from "@microsoft/teamsfx-api";
import { core, workspaceUri } from "../globalVariables";
import { localize } from "./localizeUtils";
import { ExtensionSource, ExtensionErrors } from "../error/error";
import { processAdapter, globAdapter, fsAdapter, envParseAdapter } from "../common/npmPackageDeps";

export function isWindows() {
  return processAdapter.type() === "Windows_NT";
}

export function isMacOS() {
  return processAdapter.type() === "Darwin";
}

export function isLinux() {
  return processAdapter.type() === "Linux";
}

export function openFolderInExplorer(folderPath: string): void {
  const command = format('start "" "%s"', folderPath);
  processAdapter.exec(command);
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function acpInstalled(): boolean {
  const extension = vscode.extensions.getExtension("TeamsDevApp.vscode-adaptive-cards");
  return !!extension;
}

export async function hasAdaptiveCardInWorkspace(): Promise<boolean> {
  // Skip large files which are unlikely to be adaptive cards to prevent performance impact.
  const fileSizeLimit = 1024 * 1024;

  if (workspaceUri) {
    const files = await globAdapter.glob(workspaceUri.path + "/**/*.json", {
      ignore: ["**/node_modules/**", "./node_modules/**"],
    });
    for (const file of files) {
      let content = "";
      let fd = -1;
      try {
        fd = await fsAdapter.open(file, "r");
        const stat = await fsAdapter.fstat(fd);
        // limit file size to prevent performance impact
        if (stat.size > fileSizeLimit) {
          continue;
        }

        // avoid security issue
        const buffer = new Uint8Array(fileSizeLimit);
        const { bytesRead } = await fsAdapter.read(fd, buffer, 0, buffer.byteLength, 0);
        content = new TextDecoder().decode(buffer.slice(0, bytesRead));
      } catch (e) {
        // skip invalid files
        continue;
      } finally {
        if (fd >= 0) {
          fsAdapter.close(fd).catch(() => {});
        }
      }

      if (isAdaptiveCard(content)) {
        return true;
      }
    }
  }

  return false;
}

function isAdaptiveCard(content: string): boolean {
  const pattern = /"type"\s*:\s*"AdaptiveCard"/;
  return pattern.test(content);
}

export function getLocalDebugMessageTemplate(isWindowsOS: boolean): string {
  const enabledTestTool =
    workspaceUri?.fsPath && envParseAdapter.isTestToolEnabledProject(workspaceUri.fsPath);

  if (isWindowsOS) {
    return enabledTestTool
      ? localize("teamstoolkit.handlers.localDebugDescription.enabledTestTool")
      : localize("teamstoolkit.handlers.localDebugDescription");
  }

  return enabledTestTool
    ? localize("teamstoolkit.handlers.localDebugDescription.enabledTestTool.fallback")
    : localize("teamstoolkit.handlers.localDebugDescription.fallback");
}

export function checkCoreNotEmpty(): Result<null, SystemError> {
  if (!core) {
    return err(
      new SystemError(
        ExtensionSource,
        ExtensionErrors.UnsupportedOperation,
        localize("teamstoolkit.handlers.coreNotReady")
      )
    );
  }
  return ok(null);
}
