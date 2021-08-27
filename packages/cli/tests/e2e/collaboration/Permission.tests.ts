// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import fs from "fs-extra";
import path from "path";
import { FeatureFlags } from "../../../src/constants";
import {
  cleanUp,
  execAsync,
  execAsyncWithRetry,
  getSubscriptionId,
  getTestFolder,
  getUniqueAppName,
  setSimpleAuthSkuNameToB1,
} from "../commonUtils";

describe("Permission", function () {
  const testFolder = getTestFolder();
  const appName = getUniqueAppName();
  const subscription = getSubscriptionId();
  const projectPath = path.resolve(testFolder, appName);
  const collaborator = process.env["M365_ACCOUNT_COLLABORATOR"];

  it("Permissions", async function () {
    // new a project
    await execAsync(`teamsfx new --interactive false --app-name ${appName}`, {
      cwd: testFolder,
      env: process.env,
      timeout: 0,
    });
    console.log(`[Successfully] scaffold to ${projectPath}`);

    await setSimpleAuthSkuNameToB1(projectPath);

    process.env[FeatureFlags.RemoteCollaboration] = "1";

    // provision
    await execAsyncWithRetry(`teamsfx provision --subscription ${subscription}`, {
      cwd: projectPath,
      env: process.env,
      timeout: 0,
    });
    console.log("[Successfully] provision");

    // Check Permission
    const checkPermissionResult = await execAsync(`teamsfx permission status`, {
      cwd: projectPath,
      env: process.env,
      timeout: 0,
    });

    expect(checkPermissionResult.stdout).to.contains(
      "Resource Name: Azure AD App, Permission: Owner"
    );
    expect(checkPermissionResult.stdout).to.contains(
      "Resource Name: Teams App, Permission: Administrator"
    );
    console.log("[Successfully] check permission");

    // Grant Permission
    const grantCollaboratorResult = await execAsync(
      `teamsfx permission grant --email ${collaborator}`,
      {
        cwd: projectPath,
        env: process.env,
        timeout: 0,
      }
    );

    expect(grantCollaboratorResult.stdout).to.contains(
      "Owner permission has been granted to Azure AD App"
    );
    expect(grantCollaboratorResult.stdout).to.contains(
      "Administrator permission has been granted to Teams App"
    );
    console.log("[Successfully] grant permission");

    const listCollaboratorResult = await execAsync(
      `teamsfx permission status --list-all-collaborator`,
      {
        cwd: projectPath,
        env: process.env,
        timeout: 0,
      }
    );

    expect(listCollaboratorResult.stdout).to.contains(`Account: ${collaborator}`);
    console.log("[Successfully] list collaborator");
  });

  after(async () => {
    // clean up
    await cleanUp(appName, projectPath, true, false, false);
  });
});
