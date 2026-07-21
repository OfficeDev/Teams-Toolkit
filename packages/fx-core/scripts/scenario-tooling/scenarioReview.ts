// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ChildProcess, SpawnOptions, spawn } from "child_process";
import { pathToFileURL } from "url";

export interface ScenarioArtifactLaunchCommand {
  command: string;
  arguments: string[];
}

export interface ScenarioReviewDependencies {
  platform: NodeJS.Platform;
  spawn(command: string, arguments_: string[], options: SpawnOptions): ChildProcess;
}

const DEFAULT_DEPENDENCIES: ScenarioReviewDependencies = {
  platform: process.platform,
  spawn: (command, arguments_, options) => spawn(command, arguments_, options),
};

export function resolveScenarioArtifactLaunchCommand(
  filePath: string,
  platform: NodeJS.Platform
): ScenarioArtifactLaunchCommand {
  const fileUrl = pathToFileURL(filePath).href;
  if (platform === "win32") {
    return {
      command: "rundll32.exe",
      arguments: ["url.dll,FileProtocolHandler", fileUrl],
    };
  }
  if (platform === "darwin") {
    return { command: "open", arguments: [fileUrl] };
  }
  return { command: "xdg-open", arguments: [fileUrl] };
}

function launchAndWait(
  command: ScenarioArtifactLaunchCommand,
  dependencies: ScenarioReviewDependencies
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = dependencies.spawn(command.command, command.arguments, {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else if (signal !== null) {
        reject(new Error(`Scenario artifact opener stopped with signal ${signal}.`));
      } else {
        reject(new Error(`Scenario artifact opener exited with exit code ${code}.`));
      }
    });
  });
}

export async function launchScenarioArtifacts(
  artifactPaths: string[],
  dependencies: ScenarioReviewDependencies = DEFAULT_DEPENDENCIES
): Promise<void> {
  for (const artifactPath of artifactPaths) {
    await launchAndWait(
      resolveScenarioArtifactLaunchCommand(artifactPath, dependencies.platform),
      dependencies
    );
  }
}
