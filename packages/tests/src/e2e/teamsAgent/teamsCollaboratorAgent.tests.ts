// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Ning Tang
 */

import { describe } from "mocha";
import * as path from "path";

import { it } from "@microsoft/extra-shot-mocha";

import MockAzureAccountProvider from "@microsoft/m365agentstoolkit-cli/src/commonlib/azureLoginUserPassword";
import { AzureScopes, environmentNameManager } from "@microsoft/teamsfx-core";
import { assert } from "chai";
import fs from "fs-extra";
import { CliHelper } from "../../commonlib/cliHelper";
import { EnvConstants } from "../../commonlib/constants";
import {
  getResourceGroupNameFromResourceId,
  getSiteNameFromResourceId,
  getWebappSettings,
} from "../../commonlib/utilities";
import { Capability } from "../../utils/constants";
import {
  cleanUpLocalProject,
  createResourceGroup,
  deleteResourceGroupByName,
  getSubscriptionId,
  getTestFolder,
  getUniqueAppName,
  readContextMultiEnvV3,
} from "../commonUtils";
import {
  deleteAadAppByClientId,
  deleteBot,
  deleteTeamsApp,
  getAadAppByClientId,
  getBot,
  getTeamsApp,
} from "../debug/utility";

describe("Teams Collaborator Agent", function () {
  const testFolder = getTestFolder();
  const subscription = getSubscriptionId();
  const appName = getUniqueAppName();
  const resourceGroupName = `${appName}-rg`;
  const projectPath = path.resolve(testFolder, appName);
  const envName = environmentNameManager.getDefaultEnvName();

  after(async () => {
    // clean up
    let context = await readContextMultiEnvV3(projectPath, "local");
    if (context?.TEAMS_APP_ID) {
      await deleteTeamsApp(context.TEAMS_APP_ID);
    }
    if (context?.BOT_ID) {
      await deleteBot(context.BOT_ID);
      await deleteAadAppByClientId(context.BOT_ID);
    }

    context = await readContextMultiEnvV3(projectPath, "dev");
    if (context?.TEAMS_APP_ID) {
      await deleteTeamsApp(context.TEAMS_APP_ID);
    }
    await deleteResourceGroupByName(resourceGroupName);
    await cleanUpLocalProject(projectPath);
  });

  it(
    "typescript template",
    {
      testPlanCaseId: 35527255,
      author: "Ning.Tang@microsoft.com",
    },
    async function () {
      // Scaffold
      const myRecordAzOpenAI: Record<string, string> = {};
      myRecordAzOpenAI["programming-language"] = "typescript";
      myRecordAzOpenAI["azure-openai-key"] = "fake";
      myRecordAzOpenAI["azure-openai-deployment-name"] = "fake";
      myRecordAzOpenAI["azure-openai-endpoint"] = "https://test.com";
      const options = Object.entries(myRecordAzOpenAI)
        .map(([key, value]) => "--" + key + " " + value)
        .join(" ");
      await CliHelper.createProjectWithCapability(
        appName,
        testFolder,
        Capability.TeamsCollaboratorAgent,
        process.env,
        options,
      );

      // Validate Scaffold
      const indexFile = path.join(projectPath, "src", "index.ts");
      fs.access(indexFile, fs.constants.F_OK, (err) => {
        assert.notExists(err, "index.ts should exist");
      });

      // Local Debug (Provision)
      await CliHelper.provisionProject(projectPath, "", "local", {
        ...process.env,
        BOT_DOMAIN: "test.ngrok.io",
        BOT_ENDPOINT: "https://test.ngrok.io",
      });
      console.log(`[Successfully] provision for ${projectPath}`);

      let context = await readContextMultiEnvV3(projectPath, "local");
      assert.isDefined(context, "local env file should exist");

      // validate aad
      assert.isUndefined(context.AAD_APP_OBJECT_ID, "AAD should not exist");

      // validate teams app
      assert.isDefined(context.TEAMS_APP_ID, "teams app id should be defined");
      const teamsApp = await getTeamsApp(context.TEAMS_APP_ID);
      assert.equal(teamsApp?.teamsAppId, context.TEAMS_APP_ID);

      // validate bot
      assert.isDefined(context.BOT_ID);
      assert.isNotEmpty(context.BOT_ID);
      const aadApp = await getAadAppByClientId(context.BOT_ID);
      assert.isDefined(aadApp);
      assert.equal(aadApp?.appId, context.BOT_ID);
      const bot = await getBot(context.BOT_ID);
      assert.equal(bot?.botId, context.BOT_ID);
      assert.equal(
        bot?.messagingEndpoint,
        "https://test.ngrok.io/api/messages",
      );

      // Local Debug (Deploy)
      await CliHelper.deployAll(projectPath, "", "local");
      console.log(`[Successfully] deploy for ${projectPath}`);

      context = await readContextMultiEnvV3(projectPath, "local");
      assert.isDefined(context);

      // validate .localConfigs
      assert.isTrue(
        await fs.pathExists(path.join(projectPath, ".localConfigs")),
        ".localConfigs should exist",
      );

      // Remote Provision
      const result = await createResourceGroup(resourceGroupName, "westus");
      assert.isTrue(
        result,
        `failed to create resource group: ${resourceGroupName}`,
      );

      await CliHelper.provisionProject(projectPath, "", "dev", {
        ...process.env,
        AZURE_RESOURCE_GROUP_NAME: resourceGroupName,
      });

      context = await readContextMultiEnvV3(projectPath, envName);
      assert.exists(context, "env file should exist");

      // validate teams app
      assert.isDefined(context.TEAMS_APP_ID);
      const remoteTeamsApp = await getTeamsApp(context.TEAMS_APP_ID);
      assert.equal(remoteTeamsApp?.teamsAppId, context.TEAMS_APP_ID);

      const appServiceResourceId =
        context[EnvConstants.BOT_AZURE_APP_SERVICE_RESOURCE_ID];
      assert.exists(
        appServiceResourceId,
        "Azure App Service resource ID should exist",
      );

      const tokenProvider = MockAzureAccountProvider;
      const tokenCredential = await tokenProvider.getIdentityCredentialAsync();
      const token = (await tokenCredential?.getToken(AzureScopes()))?.token;
      assert.exists(token);

      const response = await getWebappSettings(
        subscription,
        getResourceGroupNameFromResourceId(appServiceResourceId),
        getSiteNameFromResourceId(appServiceResourceId),
        token as string,
      );
      assert.exists(response, "Web app settings should exist");
      assert.equal(
        response["WEBSITE_NODE_DEFAULT_VERSION"],
        "~22",
        "Node version should be 22",
      );
      assert.equal(
        response["WEBSITE_RUN_FROM_PACKAGE"],
        "1",
        "Run from package should be 1",
      );
      assert.equal(
        response["RUNNING_ON_AZURE"],
        "1",
        "Running on azure should be 1",
      );

      // Remote Deploy
      await CliHelper.deployAll(projectPath);

      // Validate Deploy
      context = await readContextMultiEnvV3(projectPath, envName);
      assert.exists(context, "env file should exist");
    },
  );
});
