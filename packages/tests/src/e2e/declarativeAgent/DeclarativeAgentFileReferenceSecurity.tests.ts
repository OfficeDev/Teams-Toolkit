// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createHash } from "crypto";
import { expect } from "chai";
import { spawn } from "child_process";
import * as fs from "fs-extra";
import { describe, it } from "mocha";
import * as path from "path";
import {
  cleanUpLocalProject,
  getTestFolder,
  getUniqueAppName,
} from "../commonUtils";
import { Capability } from "../../utils/constants";

interface CliResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

const workspaceCliPath = path.resolve(__dirname, "../../../../cli/cli.js");
const cliTimeoutMs = 2 * 60 * 1000;

function runCli(
  cliPath: string,
  args: string[],
  cwd: string,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: process.env,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, cliTimeoutMs);
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("Workspace CLI command timed out"));
      } else {
        resolve({ success: exitCode === 0, stdout, stderr });
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

describe("Declarative agent manifest file reference security", function () {
  this.timeout(5 * 60 * 1000);

  it("FILE-AC-08: atk package rejects an external traversal without producing artifacts", async function () {
    const testFolder = getTestFolder();
    const appName = getUniqueAppName();
    const projectPath = path.resolve(testFolder, appName);
    const appPackagePath = path.join(projectPath, "appPackage");
    const fixtureName = `${appName}-manifest-file-reference-secret.txt`;
    const fixturePath = path.join(testFolder, fixtureName);
    const sentinel = `E2E_MANIFEST_FILE_REFERENCE_${appName}`;

    try {
      const createResult = await runCli(
        workspaceCliPath,
        [
          "new",
          "--interactive",
          "false",
          "--debug",
          "--app-name",
          appName,
          "--capability",
          Capability.DeclarativeAgent,
          "--with-plugin",
          "no",
        ],
        testFolder,
      );
      expect(createResult.success, "scaffold should succeed").to.be.true;

      await fs.writeFile(fixturePath, sentinel, "utf8");
      const manifestDirectory = await fs.realpath(appPackagePath);
      const externalFixture = await fs.realpath(fixturePath);
      const relativeFixture = path.relative(manifestDirectory, externalFixture);
      expect(relativeFixture.startsWith(`..${path.sep}`)).to.be.true;
      const manifestFixtureReference = relativeFixture
        .split(path.sep)
        .join("/");

      const declarativeAgentPath = path.join(
        appPackagePath,
        "declarativeAgent.json",
      );
      const declarativeAgent: unknown = await fs.readJSON(declarativeAgentPath);
      expect(isRecord(declarativeAgent)).to.be.true;
      if (!isRecord(declarativeAgent)) {
        throw new Error("Expected declarativeAgent.json to contain an object");
      }
      declarativeAgent.instructions = `$[file('${manifestFixtureReference}')]`;
      await fs.writeJSON(declarativeAgentPath, declarativeAgent, { spaces: 2 });

      const buildPath = path.join(appPackagePath, "build");
      await fs.remove(buildPath);
      const digestBeforePackage = await sha256(fixturePath);

      const packageResult = await runCli(
        workspaceCliPath,
        [
          "package",
          "--manifest-file",
          "./appPackage/manifest.json",
          "--env",
          "dev",
        ],
        projectPath,
      );
      const output = `${packageResult.stdout}\n${packageResult.stderr}`;
      expect(
        packageResult.success,
        `package unexpectedly succeeded. output=${output}`,
      ).to.be.false;
      expect(output).to.include(
        "The file reference must point to a file inside the manifest directory",
      );
      expect(output).to.include(manifestFixtureReference);
      expect(output).to.include(externalFixture);
      expect(output).to.include(manifestDirectory);
      expect(output).to.include("Move the file into the manifest directory");
      expect(output).to.not.include(sentinel);
      expect(
        await fs.pathExists(path.join(buildPath, "declarativeAgent.dev.json")),
      ).to.be.false;
      expect(await fs.pathExists(path.join(buildPath, "appPackage.dev.zip"))).to
        .be.false;
      expect(await sha256(fixturePath)).to.equal(digestBeforePackage);
    } finally {
      await cleanUpLocalProject(projectPath);
      await fs.remove(fixturePath);
    }
  });
});
