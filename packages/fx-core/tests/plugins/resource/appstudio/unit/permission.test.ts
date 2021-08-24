// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import sinon from "sinon";
import { AppStudioPlugin } from "../../../../../src/plugins/resource/appstudio";
import { ConfigMap, Platform, PluginContext } from "@microsoft/teamsfx-api";
import {
  Constants,
  SOLUTION,
  SOLUTION_USERINFO,
} from "../../../../../src/plugins/resource/appstudio/constants";
import faker from "faker";
import {
  REMOTE_TEAMS_APP_ID,
  USER_INFO,
} from "../../../../../src/plugins/solution/fx-solution/constants";
import { AppStudioClient } from "./../../../../../src/plugins/resource/appstudio/appStudio";
import { MockedAppStudioTokenProvider } from "../helper";

const userList = {
  tenantId: faker.datatype.uuid(),
  aadId: faker.datatype.uuid(),
  displayName: "displayName",
  userPrincipalName: "userPrincipalName",
  isOwner: true,
};

describe("Remote Collaboration", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  let configOfOtherPlugins: Map<string, ConfigMap>;
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    plugin = new AppStudioPlugin();
    configOfOtherPlugins = new Map();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("Check permission", async () => {
    const appId = faker.datatype.uuid();

    const soltuionContext = new ConfigMap();
    soltuionContext.set(USER_INFO, JSON.stringify(userList));
    soltuionContext.set(REMOTE_TEAMS_APP_ID, appId);

    configOfOtherPlugins.set(SOLUTION, soltuionContext);

    ctx = {
      root: "./tests/plugins/resource/appstudio/resources/",
      configOfOtherPlugins: configOfOtherPlugins,
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      appStudioToken: new MockedAppStudioTokenProvider(),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };

    sandbox.stub(ctx.appStudioToken!, "getAccessToken").resolves("anything");
    sandbox.stub(AppStudioClient, "checkPermission").resolves("Administrator");

    const checkPermission = await plugin.checkPermission(ctx);
    chai.assert.isTrue(checkPermission.isOk());
    if (checkPermission.isOk()) {
      chai.assert.deepEqual(checkPermission.value[0].roles, ["Administrator"]);
    }
  });

  it("Grant permission", async () => {
    const appId = faker.datatype.uuid();

    const soltuionContext = new ConfigMap();
    soltuionContext.set(USER_INFO, JSON.stringify(userList));
    soltuionContext.set(REMOTE_TEAMS_APP_ID, appId);

    configOfOtherPlugins.set(SOLUTION, soltuionContext);

    ctx = {
      root: "./tests/plugins/resource/appstudio/resources/",
      configOfOtherPlugins: configOfOtherPlugins,
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      appStudioToken: new MockedAppStudioTokenProvider(),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };

    sandbox.stub(ctx.appStudioToken!, "getAccessToken").resolves("anything");
    sandbox.stub(AppStudioClient, "grantPermission").resolves();

    const grantPermission = await plugin.grantPermission(ctx);
    console.log(grantPermission);
    chai.assert.isTrue(grantPermission.isOk());
    if (grantPermission.isOk()) {
      chai.assert.deepEqual(grantPermission.value[0].roles, ["Administrator"]);
    }
  });
});
