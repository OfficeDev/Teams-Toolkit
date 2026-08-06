// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import * as fs from "fs-extra";
import { describe, it } from "mocha";
import * as path from "path";
import {
  cleanUpLocalProject,
  execAsync,
  getTestFolder,
  getUniqueAppName,
} from "../commonUtils";

describe("Declarative agent ROPC region lifecycle", function () {
  this.timeout(20 * 60 * 1000);

  it("scaffolds, provisions, and uninstalls a declarative agent", async function () {
    const testFolder = getTestFolder();
    const appName = getUniqueAppName();
    const projectPath = path.join(testFolder, appName);
    let provisioned = false;

    try {
      await execAsync(
        `atk new -c declarative-agent -n ${appName} -f ${testFolder} -i false`,
        {
          cwd: testFolder,
          env: process.env,
          timeout: 5 * 60 * 1000,
        },
      );
      expect(
        await fs.pathExists(projectPath),
        "scaffold should create the project",
      ).to.be.true;

      await execAsync("atk provision --env local -i false", {
        cwd: projectPath,
        env: process.env,
        timeout: 10 * 60 * 1000,
      });
      provisioned = true;
      expect(
        await fs.pathExists(path.join(projectPath, "env", ".env.local")),
        "provision should write the local environment file",
      ).to.be.true;
    } finally {
      try {
        if (provisioned) {
          await execAsync(
            `atk uninstall --mode env --env local --folder ${projectPath} --options m365-app,app-registration,bot-framework-registration -i false`,
            {
              cwd: projectPath,
              env: process.env,
              timeout: 5 * 60 * 1000,
            },
          );
        }
      } finally {
        await cleanUpLocalProject(projectPath);
      }
    }
  });
});
