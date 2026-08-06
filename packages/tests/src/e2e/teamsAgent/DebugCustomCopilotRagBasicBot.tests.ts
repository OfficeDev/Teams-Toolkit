// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Yuqi Zhou <yuqzho@microsoft.com>
 */

import * as chai from "chai";
import { describe } from "mocha";
import * as path from "path";

import { it } from "@microsoft/extra-shot-mocha";

import { CliHelper } from "../../commonlib/cliHelper";
import {
  cleanUpLocalProject,
  getTestFolder,
  getUniqueAppName,
  readContextMultiEnvV3,
} from "../commonUtils";
import {
  deleteAadAppByClientId,
  deleteAadAppByObjectId,
  deleteBot,
  deleteTeamsApp,
  getAadAppByClientId,
  getAadAppByObjectId,
  getBot,
  getTeamsApp,
} from "../debug/utility";

async function validateAadApp(context: Record<string, string>) {
  chai.assert.isDefined(context.BOT_ID);
  chai.assert.isNotEmpty(context.BOT_ID);
  const aadApp = context.BOT_OBJECT_ID
    ? await getAadAppByObjectId(context.BOT_OBJECT_ID)
    : await getAadAppByClientId(context.BOT_ID);
  chai.assert.isDefined(aadApp);
  chai.assert.equal(aadApp?.appId, context.BOT_ID);
}

describe("Debug V3 custom-copilot-rag TypeScript template", () => {
  const testFolder = getTestFolder();
  const appName = getUniqueAppName();
  const projectPath = path.resolve(testFolder, appName);

  afterEach(async function () {
    const context = await readContextMultiEnvV3(projectPath, "local");

    // clean up
    if (context?.TEAMS_APP_ID) {
      await deleteTeamsApp(context.TEAMS_APP_ID);
    }
    if (context?.BOT_ID) {
      await deleteBot(context.BOT_ID);
    }
    if (context?.BOT_OBJECT_ID) {
      await deleteAadAppByObjectId(context.BOT_OBJECT_ID);
    } else if (context?.BOT_ID) {
      await deleteAadAppByClientId(context.BOT_ID);
    }
    await cleanUpLocalProject(projectPath);
  });

  it(
    "Azure OpenAI happy path: provision and deploy",
    { testPlanCaseId: 27569137, author: "yuqzho@microsoft.com" },
    async function () {
      // create
      const myRecordAzOpenAI: Record<string, string> = {};
      myRecordAzOpenAI["programming-language"] = "typescript";
      myRecordAzOpenAI["custom-copilot-rag"] = "custom-copilot-rag-customize";
      myRecordAzOpenAI["llm-service"] = "llm-service-azure-openai";
      myRecordAzOpenAI["azure-openai-key"] = "fake";
      myRecordAzOpenAI["azure-openai-deployment-name"] = "fake";
      myRecordAzOpenAI["azure-openai-endpoint"] = "https://test.com";
      const options = Object.entries(myRecordAzOpenAI)
        .map(([key, value]) => "--" + key + " " + value)
        .join(" ");
      await CliHelper.createProjectWithCapability(
        appName,
        testFolder,
        "custom-copilot-rag-customize",
        undefined,
        options,
      );
      console.log(`[Successfully] scaffold to ${projectPath}`);

      // provision
      await CliHelper.provisionProject(projectPath, "", "local", {
        ...process.env,
        BOT_DOMAIN: "test.ngrok.io",
        BOT_ENDPOINT: "https://test.ngrok.io",
      });
      console.log(`[Successfully] provision for ${projectPath}`);

      let context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);

      // validate bot
      await validateAadApp(context);
      const bot = await getBot(context.BOT_ID);
      chai.assert.equal(bot?.botId, context.BOT_ID);
      chai.assert.equal(
        bot?.messagingEndpoint,
        "https://test.ngrok.io/api/messages",
      );
      chai.assert.deepEqual(bot?.configuredChannels, ["msteams"]);

      // validate teams app
      chai.assert.isDefined(context.TEAMS_APP_ID);
      const teamsApp = await getTeamsApp(context.TEAMS_APP_ID);
      chai.assert.equal(teamsApp?.teamsAppId, context.TEAMS_APP_ID);

      // deploy
      await CliHelper.deployAll(projectPath, "", "local");
      console.log(`[Successfully] deploy for ${projectPath}`);

      context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);
    },
  );

  it(
    "OpenAI happy path: provision and deploy",
    { testPlanCaseId: 28869466, author: "yuqzho@microsoft.com" },
    async function () {
      // create
      const myRecordOpenAI: Record<string, string> = {};
      myRecordOpenAI["programming-language"] = "typescript";
      myRecordOpenAI["custom-copilot-rag"] = "custom-copilot-rag-customize";
      myRecordOpenAI["llm-service"] = "llm-service-openai";
      myRecordOpenAI["openai-key"] = "fake";
      const options = Object.entries(myRecordOpenAI)
        .map(([key, value]) => "--" + key + " " + value)
        .join(" ");
      await CliHelper.createProjectWithCapability(
        appName,
        testFolder,
        "custom-copilot-rag-customize",
        undefined,
        options,
      );
      console.log(`[Successfully] scaffold to ${projectPath}`);

      // provision
      await CliHelper.provisionProject(projectPath, "", "local", {
        ...process.env,
        BOT_DOMAIN: "test.ngrok.io",
        BOT_ENDPOINT: "https://test.ngrok.io",
      });
      console.log(`[Successfully] provision for ${projectPath}`);

      let context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);

      // validate bot
      await validateAadApp(context);
      const bot = await getBot(context.BOT_ID);
      chai.assert.equal(bot?.botId, context.BOT_ID);
      chai.assert.equal(
        bot?.messagingEndpoint,
        "https://test.ngrok.io/api/messages",
      );
      chai.assert.deepEqual(bot?.configuredChannels, ["msteams"]);

      // validate teams app
      chai.assert.isDefined(context.TEAMS_APP_ID);
      const teamsApp = await getTeamsApp(context.TEAMS_APP_ID);
      chai.assert.equal(teamsApp?.teamsAppId, context.TEAMS_APP_ID);

      // deploy
      await CliHelper.deployAll(projectPath, "", "local");
      console.log(`[Successfully] deploy for ${projectPath}`);

      context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);
    },
  );

  it(
    "JavaScript Azure OpenAI happy path: provision and deploy",
    { testPlanCaseId: 27569146, author: "yuqzho@microsoft.com" },
    async function () {
      // create
      const myRecordAzOpenAI: Record<string, string> = {};
      myRecordAzOpenAI["programming-language"] = "javascript";
      myRecordAzOpenAI["custom-copilot-rag"] = "custom-copilot-rag-customize";
      myRecordAzOpenAI["llm-service"] = "llm-service-azure-openai";
      myRecordAzOpenAI["azure-openai-key"] = "fake";
      myRecordAzOpenAI["azure-openai-deployment-name"] = "fake";
      myRecordAzOpenAI["azure-openai-endpoint"] = "https://test.com";
      const options = Object.entries(myRecordAzOpenAI)
        .map(([key, value]) => "--" + key + " " + value)
        .join(" ");
      await CliHelper.createProjectWithCapability(
        appName,
        testFolder,
        "custom-copilot-rag-customize",
        undefined,
        options,
      );
      console.log(`[Successfully] scaffold to ${projectPath}`);

      // provision
      await CliHelper.provisionProject(projectPath, "", "local", {
        ...process.env,
        BOT_DOMAIN: "test.ngrok.io",
        BOT_ENDPOINT: "https://test.ngrok.io",
      });
      console.log(`[Successfully] provision for ${projectPath}`);

      let context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);

      // validate bot
      await validateAadApp(context);
      const bot = await getBot(context.BOT_ID);
      chai.assert.equal(bot?.botId, context.BOT_ID);
      chai.assert.equal(
        bot?.messagingEndpoint,
        "https://test.ngrok.io/api/messages",
      );
      chai.assert.deepEqual(bot?.configuredChannels, ["msteams"]);

      // validate teams app
      chai.assert.isDefined(context.TEAMS_APP_ID);
      const teamsApp = await getTeamsApp(context.TEAMS_APP_ID);
      chai.assert.equal(teamsApp?.teamsAppId, context.TEAMS_APP_ID);

      // deploy
      await CliHelper.deployAll(projectPath, "", "local");
      console.log(`[Successfully] deploy for ${projectPath}`);

      context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);
    },
  );

  it(
    "JavaScript OpenAI happy path: provision and deploy",
    { testPlanCaseId: 28869495, author: "yuqzho@microsoft.com" },
    async function () {
      // create
      const myRecordOpenAI: Record<string, string> = {};
      myRecordOpenAI["programming-language"] = "javascript";
      myRecordOpenAI["custom-copilot-rag"] = "custom-copilot-rag-customize";
      myRecordOpenAI["llm-service"] = "llm-service-openai";
      myRecordOpenAI["openai-key"] = "fake";
      const options = Object.entries(myRecordOpenAI)
        .map(([key, value]) => "--" + key + " " + value)
        .join(" ");
      await CliHelper.createProjectWithCapability(
        appName,
        testFolder,
        "custom-copilot-rag-customize",
        undefined,
        options,
      );
      console.log(`[Successfully] scaffold to ${projectPath}`);

      // provision
      await CliHelper.provisionProject(projectPath, "", "local", {
        ...process.env,
        BOT_DOMAIN: "test.ngrok.io",
        BOT_ENDPOINT: "https://test.ngrok.io",
      });
      console.log(`[Successfully] provision for ${projectPath}`);

      let context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);

      // validate bot
      await validateAadApp(context);
      const bot = await getBot(context.BOT_ID);
      chai.assert.equal(bot?.botId, context.BOT_ID);
      chai.assert.equal(
        bot?.messagingEndpoint,
        "https://test.ngrok.io/api/messages",
      );
      chai.assert.deepEqual(bot?.configuredChannels, ["msteams"]);

      // validate teams app
      chai.assert.isDefined(context.TEAMS_APP_ID);
      const teamsApp = await getTeamsApp(context.TEAMS_APP_ID);
      chai.assert.equal(teamsApp?.teamsAppId, context.TEAMS_APP_ID);

      // deploy
      await CliHelper.deployAll(projectPath, "", "local");
      console.log(`[Successfully] deploy for ${projectPath}`);

      context = await readContextMultiEnvV3(projectPath, "local");
      chai.assert.isDefined(context);
    },
  );
});
