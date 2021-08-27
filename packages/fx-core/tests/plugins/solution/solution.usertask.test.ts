// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { it } from "mocha";
import { TeamsAppSolution } from " ../../../src/plugins/solution";
import {
  ConfigMap,
  SolutionConfig,
  SolutionContext,
  Platform,
  Func,
  ProjectSettings,
  Inputs,
  v2,
  Plugin,
  ok,
  Result,
  FxError,
} from "@microsoft/teamsfx-api";
import * as sinon from "sinon";
import { GLOBAL_CONFIG, SolutionError } from "../../../src/plugins/solution/fx-solution/constants";
import { MockedAppStudioProvider, MockedV2Context, mockPublishThatAlwaysSucceed } from "./util";
import _ from "lodash";
import {
  ResourcePlugins,
  ResourcePluginsV2,
} from "../../../src/plugins/solution/fx-solution/ResourcePluginContainer";
import Container from "typedi";
import * as uuid from "uuid";
import {
  AzureResourceSQL,
  AzureSolutionQuestionNames,
  BotOptionItem,
  HostTypeOptionAzure,
  HostTypeOptionSPFx,
  TabOptionItem,
} from "../../../src/plugins/solution/fx-solution/question";
import { executeUserTask } from "../../../src/plugins/solution/fx-solution/v2/executeUserTask";
import "../../../src/plugins/resource/function/v2";
import "../../../src/plugins/resource/sql/v2";
import "../../../src/plugins/resource/apim/v2";
import "../../../src/plugins/resource/localdebug/v2";
import "../../../src/plugins/resource/appstudio/v2";
import "../../../src/plugins/resource/frontend/v2";
import "../../../src/plugins/resource/bot/v2";
import { AppStudioPlugin, newEnvInfo } from "../../../src";
import fs from "fs-extra";

chai.use(chaiAsPromised);
const expect = chai.expect;
const appStudioPlugin = Container.get<AppStudioPlugin>(ResourcePlugins.AppStudioPlugin);
const botPlugin = Container.get<Plugin>(ResourcePlugins.BotPlugin);
const functionPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.FunctionPlugin);
const sqlPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.SqlPlugin);
const apimPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.ApimPlugin);

const localDebugPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.LocalDebugPlugin);
const appStudioPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AppStudioPlugin);
const frontendPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.FrontendPlugin);
const botPluginV2 = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.BotPlugin);

function mockScaffoldCodeThatAlwaysSucceeds(plugin: v2.ResourcePlugin) {
  plugin.scaffoldSourceCode = async function (
    _ctx: v2.Context,
    _inputs: Inputs
  ): Promise<Result<{ output: Record<string, string> }, FxError>> {
    return ok({ output: {} });
  };
}

function mockSolutionContextWithPlatform(platform?: Platform): SolutionContext {
  const config: SolutionConfig = new Map();
  config.set(GLOBAL_CONFIG, new ConfigMap());
  return {
    root: ".",
    envInfo: newEnvInfo(),
    answers: { platform: platform ? platform : Platform.VSCode },
    projectSettings: undefined,
  };
}

describe("executeUserTask VSpublish", async () => {
  it("should return error for non-vs platform", async () => {
    const mockedCtx = mockSolutionContextWithPlatform(Platform.VSCode);
    const solution = new TeamsAppSolution();
    const func: Func = {
      namespace: "solution",
      method: "VSpublish",
    };
    let result = await solution.executeUserTask(func, mockedCtx);
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.UnsupportedPlatform);

    mockedCtx.answers!.platform = Platform.CLI;
    result = await solution.executeUserTask(func, mockedCtx);
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.UnsupportedPlatform);

    // mockedCtx.answers!.platform = undefined;
    // result = await solution.executeUserTask(func, mockedCtx);
    // expect(result.isErr()).to.be.true;
    // expect(result._unsafeUnwrapErr().name).equals(SolutionError.UnsupportedPlatform);
  });

  describe("happy path", async () => {
    const mocker = sinon.createSandbox();

    beforeEach(() => {});

    afterEach(() => {
      mocker.restore();
    });

    it("should return ok", async () => {
      const mockedCtx = mockSolutionContextWithPlatform(Platform.VS);
      const solution = new TeamsAppSolution();
      const func: Func = {
        namespace: "solution",
        method: "VSpublish",
      };
      mockPublishThatAlwaysSucceed(appStudioPlugin);
      const spy = mocker.spy(appStudioPlugin, "publish");
      const result = await solution.executeUserTask(func, mockedCtx);
      expect(result.isOk()).to.be.true;
      expect(spy.calledOnce).to.be.true;
    });
  });
});

describe("V2 implementation", () => {
  const mocker = sinon.createSandbox();
  beforeEach(() => {
    mocker.stub<any, any>(fs, "copy").resolves();
  });
  afterEach(() => {
    mocker.restore();
  });
  it("should return err if given invalid router", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
        activeResourcePlugins: [appStudioPlugin.name],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "someInvalidNamespace", method: "invalid" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals("executeUserTaskRouteFailed");
  });

  it("should return err when trying to add capability for SPFx project", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionSPFx.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPlugin.name],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addCapability" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.FailedToAddCapability);
  });

  it("should return err when trying to add resource for SPFx project", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionSPFx.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPlugin.name],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addResource" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.AddResourceNotSupport);
  });

  it("should return err when trying to add bot capability repeatedly", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPlugin.name, botPlugin.name],
        capabilities: [BotOptionItem.id],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };
    mockedInputs[AzureSolutionQuestionNames.Capabilities] = [BotOptionItem.id];

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addCapability" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.FailedToAddCapability);
  });

  it("should return ok when adding tab to bot project", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPlugin.name, botPlugin.name],
        capabilities: [BotOptionItem.id],
        azureResources: [],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };
    mockedInputs[AzureSolutionQuestionNames.Capabilities] = [TabOptionItem.id];

    mockScaffoldCodeThatAlwaysSucceeds(appStudioPluginV2);
    mockScaffoldCodeThatAlwaysSucceeds(localDebugPluginV2);
    mockScaffoldCodeThatAlwaysSucceeds(frontendPluginV2);

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addCapability" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isOk()).to.be.true;
  });

  it("should return error when adding resource's input is invalid", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPluginV2.name],
        capabilities: [TabOptionItem.id],
        azureResources: [],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addResource" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InvalidInput);
  });

  it("should return error when adding SQL resource repeatedly", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPluginV2.name, frontendPluginV2.name, sqlPluginV2.name],
        capabilities: [TabOptionItem.id],
        azureResources: [AzureResourceSQL.id],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };

    mockedInputs[AzureSolutionQuestionNames.AddResources] = [AzureResourceSQL.id];

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addResource" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isErr()).to.be.true;
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.AddResourceNotSupport);
    expect(result._unsafeUnwrapErr().message).contains("SQL/APIM is already added");
  });

  it("should return ok when adding SQL resource to a project without SQL", async () => {
    const projectSettings: ProjectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "test",
        version: "1.0",
        activeResourcePlugins: [appStudioPluginV2.name, frontendPluginV2.name],
        capabilities: [TabOptionItem.id],
        azureResources: [],
      },
    };
    const mockedCtx = new MockedV2Context(projectSettings);
    const mockedProvider = new MockedAppStudioProvider();
    const mockedInputs: Inputs = {
      platform: Platform.VSCode,
    };

    mockedInputs[AzureSolutionQuestionNames.AddResources] = [AzureResourceSQL.id];

    mockScaffoldCodeThatAlwaysSucceeds(appStudioPluginV2);
    mockScaffoldCodeThatAlwaysSucceeds(localDebugPluginV2);
    mockScaffoldCodeThatAlwaysSucceeds(sqlPluginV2);

    const result = await executeUserTask(
      mockedCtx,
      { namespace: "solution", method: "addResource" },
      mockedInputs,
      mockedProvider
    );
    expect(result.isOk()).to.be.true;
  });
});
