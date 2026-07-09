import * as fs from "fs-extra";

import * as tmp from "tmp";
import { cpUtils } from "../../../../src/component/deps-checker/util/cpUtils";
import { isWindows } from "../../../../src/component/deps-checker/util/system";
import { logger } from "../adapters/testLogger";
import { chai } from "vitest";

export async function commandExistsInPath(command: string): Promise<boolean> {
  try {
    if (isWindows()) {
      await cpUtils.executeCommand(undefined, logger, { shell: "cmd.exe" }, "where", command);
    } else {
      await cpUtils.executeCommand(
        undefined,
        logger,
        { shell: "/bin/bash" },
        "type",
        "-P",
        command
      );
    }
    return true;
  } catch (error) {
    return false;
  }
}

export function assertPathEqual(actual: string, expected: string) {
  chai.assert.equal(fs.realpathSync(actual), fs.realpathSync(expected));
}

export async function getExecutionPolicyForCurrentUser(): Promise<string> {
  const policy = await cpUtils.executeCommand(
    undefined,
    logger,
    undefined,
    "powershell.exe",
    "-Command",
    "Get-ExecutionPolicy",
    "-Scope",
    "CurrentUser"
  );
  return policy.trim();
}

export async function setExecutionPolicyForCurrentUser(policy: string): Promise<void> {
  await cpUtils.executeCommand(
    undefined,
    logger,
    undefined,
    "powershell.exe",
    "-Command",
    "Set-ExecutionPolicy",
    "-Scope",
    "CurrentUser",
    policy
  );
}

export function createTmpDir(): Promise<[string, () => void]> {
  return new Promise((resolve, reject) => {
    // unsafeCleanup: recursively removes the created temporary directory, even when it's not empty.
    tmp.dir({ unsafeCleanup: true }, function (err, path, cleanupCallback) {
      if (err) {
        reject(err);
        return;
      }
      resolve([path, cleanupCallback]);
    });
  });
}

export async function isNonEmptyDir(dir: string): Promise<boolean> {
  try {
    const files = await fs.readdir(dir);
    return files.length !== 0;
  } catch (error) {
    return false;
  }
}
