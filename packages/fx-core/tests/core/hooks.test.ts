// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks, Middleware, NextFunction } from "@feathersjs/hooks/lib";
import { assert } from "chai";
import "mocha";
import * as dotenv from "dotenv";
import { ErrorHandlerMW } from "../../src/core/middleware/errorHandler";
import {
  UserCancelError,
  err,
  FxError,
  Result,
  ok,
  Inputs,
  Platform,
  ConfigFolderName,
  Solution,
  Stage,
  SolutionContext,
  Json,
  AzureSolutionSettings,
  ConfigMap,
  QTreeNode,
  FunctionRouter,
  Func,
  InputTextConfig,
} from "@microsoft/teamsfx-api";
import { ConcurrentLockerMW } from "../../src/core/middleware/concurrentLocker";
import fs from "fs-extra";
import * as path from "path";
import {
  ConcurrentError,
  InvalidProjectError,
  NoProjectOpenedError,
  PathNotExistError,
} from "../../src/core/error";
import * as os from "os";
import {
  CoreHookContext,
  deserializeDict,
  InvalidInputError,
  mapToJson,
  serializeDict,
} from "../../src";
import { SolutionLoaderMW } from "../../src/core/middleware/solutionLoader";
import { ContextInjecterMW } from "../../src/core/middleware/contextInjecter";
import { ProjectSettingsWriterMW } from "../../src/core/middleware/projectSettingsWriter";
import sinon from "sinon";
import {
  MockLatestVersion2_3_0UserData,
  MockLatestVersion2_3_0Context,
  MockPreviousVersionBefore2_3_0UserData,
  MockPreviousVersionBefore2_3_0Context,
  MockProjectSettings,
  MockSolutionLoader,
  MockTools,
  randomAppName,
} from "./utils";
import {
  ProjectSettingsLoaderMW,
  newSolutionContext,
} from "../../src/core/middleware/projectSettingsLoader";
import { AzureResourceSQL } from "../../src/plugins/solution/fx-solution/question";
import { PluginNames } from "../../src/plugins/solution/fx-solution/constants";
import { QuestionModelMW } from "../../src/core/middleware/questionModel";
import { ProjectUpgraderMW } from "../../src/core/middleware/projectUpgrader";
import { environmentManager } from "../../src/core/environment";
import { EnvInfoLoaderMW } from "../../src/core/middleware/envInfoLoader";
import { EnvInfoWriterMW } from "../../src/core/middleware/envInfoWriter";

describe("Middleware", () => {
  describe("ErrorHandlerMW", () => {
    const inputs: Inputs = { platform: Platform.VSCode };

    it("return error", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return err(UserCancelError);
        }
      }
      hooks(MyClass, {
        myMethod: [ErrorHandlerMW],
      });
      const my = new MyClass();
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr() && res.error === UserCancelError);
    });

    it("return ok", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("hello");
        }
      }
      hooks(MyClass, {
        myMethod: [ErrorHandlerMW],
      });
      const my = new MyClass();
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk() && res.value === "hello");
      my.tools = undefined;
      const res2 = await my.myMethod(inputs);
      assert.isTrue(res2.isOk() && res2.value === "hello");
    });

    it("throw known error", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          throw UserCancelError;
        }
      }
      hooks(MyClass, {
        myMethod: [ErrorHandlerMW],
      });
      const my = new MyClass();
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr() && res.error === UserCancelError);
    });

    it("throw unknown error", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          throw { name: "unkown", message: "hello", stack: new Error().stack } as Error;
        }
      }
      hooks(MyClass, {
        myMethod: [ErrorHandlerMW],
      });
      const my = new MyClass();
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr() && res.error.name === "unkown" && res.error.message === "hello");
    });
  });

  describe("ConcurrentLockerMW", () => {
    it("sequence: ok", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = path.join(os.tmpdir(), randomAppName());
      try {
        await fs.ensureDir(inputs.projectPath);
        await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
        const res = await my.myMethod(inputs);
        assert.isTrue(res.isOk() && res.value === "");
        my.tools = undefined;
        const res2 = await my.myMethod(inputs);
        assert.isTrue(res2.isOk() && res2.value === "");
      } finally {
        await fs.rmdir(inputs.projectPath!, { recursive: true });
      }
    });

    it("single: throw error", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          throw UserCancelError;
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = path.join(os.tmpdir(), randomAppName());
      try {
        await fs.ensureDir(inputs.projectPath);
        await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
        await my.myMethod(inputs);
      } catch (e) {
        assert.isTrue(e === UserCancelError);
      } finally {
        await fs.rmdir(inputs.projectPath!, { recursive: true });
      }
    });

    it("single: invalid NoProjectOpenedError", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = undefined;
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr() && res.error.name === NoProjectOpenedError().name);
    });

    it("single: invalid PathNotExistError", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = path.join(os.tmpdir(), randomAppName());
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr() && res.error.name === PathNotExistError(inputs.projectPath).name);
    });

    it("single: invalid InvalidProjectError", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = path.join(os.tmpdir(), randomAppName());
      try {
        await fs.ensureDir(inputs.projectPath);
        const res = await my.myMethod(inputs);
        assert.isTrue(res.isErr() && res.error.name === InvalidProjectError().name);
      } finally {
        await fs.rmdir(inputs.projectPath!, { recursive: true });
      }
    });

    it("concurrent: fail to get lock", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          const res = await this.myMethod(inputs);
          assert.isTrue(res.isErr() && res.error.name === ConcurrentError().name);
          this.tools = undefined;
          const res2 = await this.myMethod(inputs);
          assert.isTrue(res2.isErr() && res2.error.name === ConcurrentError().name);
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
      });
      const inputs: Inputs = { platform: Platform.VSCode };
      const my = new MyClass();
      try {
        inputs.projectPath = path.join(os.tmpdir(), randomAppName());
        await fs.ensureDir(inputs.projectPath);
        await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
        await my.myMethod(inputs);
      } finally {
        await fs.rmdir(inputs.projectPath!, { recursive: true });
      }
    });

    it("concurrent: ignore lock", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          const inputs2: Inputs = { platform: Platform.VSCode, ignoreLock: true };
          const res2 = await this.myMethod2(inputs2);
          assert.isTrue(res2.isOk() && res2.value === "");
          return ok("");
        }
        async myMethod2(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ConcurrentLockerMW],
        myMethod2: [ConcurrentLockerMW],
      });
      const inputs: Inputs = { platform: Platform.VSCode };
      const my = new MyClass();
      try {
        inputs.projectPath = path.join(os.tmpdir(), randomAppName());
        await fs.ensureDir(inputs.projectPath);
        await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
        await my.myMethod(inputs);
      } finally {
        await fs.rmdir(inputs.projectPath!, { recursive: true });
      }
    });
  });

  describe("SolutionLoaderMW, ContextInjecterMW", () => {
    it("load solution and inject", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined && ctx.solution !== undefined);
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [SolutionLoaderMW(new MockSolutionLoader()), ContextInjecterMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk() && res.value === "");
    });
  });

  describe("ProjectSettingsLoaderMW, ContextInjecterMW part 1", () => {
    it("fail to load: ignore", async () => {
      class MyClass {
        tools = new MockTools();
        async getQuestions(
          stage: Stage,
          inputs: Inputs,
          ctx?: CoreHookContext
        ): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined && ctx.solutionContext === undefined);
          return ok("");
        }
        async other(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined && ctx.solutionContext === undefined);
          return ok("");
        }
      }
      hooks(MyClass, {
        getQuestions: [ProjectSettingsLoaderMW, ContextInjecterMW],
        other: [ProjectSettingsLoaderMW, ContextInjecterMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      await my.getQuestions(Stage.create, inputs);
      inputs.platform = Platform.CLI_HELP;
      await my.other(inputs);
      inputs.platform = Platform.VS;
      await my.other(inputs);
      inputs.ignoreTypeCheck = true;
      await my.other(inputs);
    });

    it("failed to load: NoProjectOpenedError, PathNotExistError", async () => {
      class MyClass {
        tools?: any = new MockTools();
        async other(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        other: [ProjectSettingsLoaderMW, ContextInjecterMW],
      });
      const my = new MyClass();
      const inputs: Inputs = { platform: Platform.VSCode };
      const res = await my.other(inputs);
      assert.isTrue(res.isErr() && res.error.name === NoProjectOpenedError().name);
      inputs.projectPath = path.join(os.tmpdir(), randomAppName());
      const res2 = await my.other(inputs);
      assert.isTrue(res2.isErr() && res2.error.name === PathNotExistError(inputs.projectPath).name);
    });
  });

  describe("ProjectSettingsLoaderMW, ContextInjecterMW part 2", () => {
    const sandbox = sinon.createSandbox();

    const appName = randomAppName();

    const projectSettings = MockProjectSettings(appName);

    const envJson: Json = {
      solution: {},
    };

    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), appName);
    const envName = environmentManager.getDefaultEnvName();
    const confFolderPath = path.resolve(inputs.projectPath, `.${ConfigFolderName}`);
    const settingsFile = path.resolve(confFolderPath, "settings.json");
    const envJsonFile = path.resolve(confFolderPath, `env.${envName}.json`);
    const userDataFile = path.resolve(confFolderPath, `${envName}.userdata`);

    beforeEach(() => {
      sandbox.stub<any, any>(fs, "readJson").callsFake(async (file: string) => {
        if (settingsFile === file) return projectSettings;
        if (envJsonFile === file) return envJson;
        return {};
      });
      sandbox.stub<any, any>(fs, "pathExists").callsFake(async (file: string) => {
        if (userDataFile === file) return false;
        if (inputs.projectPath === file) return true;
        return {};
      });
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("success to load solutionContext happy path", async () => {
      class MyClass {
        name = "jay";
        tools = new MockTools();
        async other(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined);
          assert.isTrue(ctx!.solutionContext !== undefined);
          const solutionContext = ctx!.solutionContext!;
          assert.isTrue(solutionContext.envInfo.profile.get("solution") !== undefined);
          assert.deepEqual(projectSettings, solutionContext.projectSettings);
          return ok("");
        }
      }
      hooks(MyClass, {
        other: [ProjectSettingsLoaderMW, EnvInfoLoaderMW(false, false), ContextInjecterMW],
      });
      const my = new MyClass();
      const res = await my.other(inputs);
      assert.isTrue(res.isOk() && res.value === "");
    });

    it("fail to load solutionContext, missing plugins", async () => {
      class MyClass {
        name = "jay";
        tools = new MockTools();
        async other(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined);
          assert.isTrue(ctx!.solutionContext !== undefined);
          const solutionContext = ctx!.solutionContext!;
          assert.isTrue(solutionContext.projectSettings !== undefined);
          assert.isTrue(solutionContext.projectSettings!.appName === appName);
          assert.isTrue(solutionContext.envInfo.profile.get("solution") !== undefined);
          return ok("");
        }
      }
      hooks(MyClass, {
        other: [ProjectSettingsLoaderMW, ContextInjecterMW],
      });
      const my = new MyClass();
      (projectSettings.solutionSettings as AzureSolutionSettings).azureResources.push(
        AzureResourceSQL.id
      );
      const res = await my.other(inputs);
      assert.isTrue(
        res.isErr() &&
          res.error.message.includes(`${PluginNames.SQL} setting is missing in settings.json`)
      );
    });
  });

  describe("ProjectSettingsWriterMW", () => {
    const sandbox = sinon.createSandbox();
    afterEach(function () {
      sandbox.restore();
    });
    it("ignore write", async () => {
      const spy = sandbox.spy(fs, "writeFile");
      class MyClass {
        tools?: any = new MockTools();
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ProjectSettingsWriterMW],
      });
      const my = new MyClass();
      const inputs1: Inputs = { platform: Platform.VSCode };
      await my.myMethod(inputs1);
      const inputs2: Inputs = {
        platform: Platform.CLI_HELP,
        projectPath: path.join(os.tmpdir(), randomAppName()),
      };
      await my.myMethod(inputs2);
      const inputs3: Inputs = {
        platform: Platform.VSCode,
        projectPath: path.join(os.tmpdir(), randomAppName()),
        ignoreConfigPersist: true,
      };
      await my.myMethod(inputs3);
      const inputs4: Inputs = {
        platform: Platform.VSCode,
        projectPath: path.join(os.tmpdir(), randomAppName()),
      };
      await my.myMethod(inputs4);
      assert(spy.callCount === 0);
    });

    it("write success", async () => {
      const appName = randomAppName();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = path.join(os.tmpdir(), appName);
      const tools = new MockTools();
      const solutionContext = await newSolutionContext(tools, inputs);
      solutionContext.envInfo.profile.set("solution", new ConfigMap());
      solutionContext.projectSettings = MockProjectSettings(appName);
      const fileMap = new Map<string, any>();

      sandbox.stub<any, any>(fs, "writeFile").callsFake(async (file: string, data: any) => {
        fileMap.set(file, data);
      });
      sandbox.stub(fs, "pathExists").resolves(true);

      const envName = environmentManager.getDefaultEnvName();
      const confFolderPath = path.resolve(inputs.projectPath, `.${ConfigFolderName}`);
      const settingsFile = path.resolve(confFolderPath, "settings.json");
      const envJsonFile = path.resolve(confFolderPath, `env.${envName}.json`);

      class MyClass {
        tools = tools;
        async myMethod(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          ctx!.solutionContext = solutionContext;
          return ok("");
        }
      }
      hooks(MyClass, {
        myMethod: [ContextInjecterMW, ProjectSettingsWriterMW, EnvInfoWriterMW()],
      });
      const my = new MyClass();
      await my.myMethod(inputs);
      let content = fileMap.get(settingsFile);
      const settingsInFile = JSON.parse(content);
      content = fileMap.get(envJsonFile);
      const configInFile = JSON.parse(content);
      const configExpected = mapToJson(solutionContext.envInfo.profile);
      assert.deepEqual(solutionContext.projectSettings, settingsInFile);
      assert.deepEqual(configExpected, configInFile);
    });
  });

  describe("ProjectSettingsLoaderMW, ProjectSettingsWriterMW for user data encryption", () => {
    const sandbox = sinon.createSandbox();

    afterEach(function () {
      sandbox.restore();
    });

    it("successfully encrypt userdata and load it", async () => {
      const appName = randomAppName();
      const inputs: Inputs = { platform: Platform.VSCode };
      inputs.projectPath = path.join(os.tmpdir(), appName);
      const tools = new MockTools();
      const solutionContext = await newSolutionContext(tools, inputs);
      const configMap = new ConfigMap();
      const pluginName = "fx-resource-aad-app-for-teams";
      const secretName = "clientSecret";
      const secretText = "test";
      configMap.set(secretName, secretText);
      solutionContext.envInfo.profile.set("solution", new ConfigMap());
      solutionContext.envInfo.profile.set(pluginName, configMap);
      const oldProjectId = solutionContext.projectSettings!.projectId;
      solutionContext.projectSettings = MockProjectSettings(appName);
      solutionContext.projectSettings!.projectId = oldProjectId;
      const fileMap = new Map<string, any>();
      sandbox.stub<any, any>(fs, "writeFile").callsFake(async (file: string, data: any) => {
        fileMap.set(file, data);
      });
      sandbox.stub(fs, "pathExists").resolves(true);

      const envName = environmentManager.getDefaultEnvName();
      const confFolderPath = path.resolve(inputs.projectPath, `.${ConfigFolderName}`);
      const userdataFile = path.resolve(confFolderPath, `${envName}.userdata`);
      const settingsFile = path.resolve(confFolderPath, "settings.json");
      const envJsonFile = path.resolve(confFolderPath, `env.${envName}.json`);

      class MyClass {
        tools = tools;
        async WriteConfigTrigger(
          inputs: Inputs,
          ctx?: CoreHookContext
        ): Promise<Result<any, FxError>> {
          ctx!.solutionContext = solutionContext;
          return ok("");
        }
        async ReadConfigTrigger(
          inputs: Inputs,
          ctx?: CoreHookContext
        ): Promise<Result<any, FxError>> {
          assert.isTrue(ctx !== undefined);
          assert.isTrue(ctx!.solutionContext !== undefined);
          const solutionContext = ctx!.solutionContext!;
          assert.isTrue(solutionContext.projectSettings !== undefined);
          assert.isTrue(solutionContext.projectSettings!.appName === appName);
          assert.isTrue(solutionContext.envInfo.profile.get(pluginName) !== undefined);
          const value = solutionContext.envInfo.profile.get(pluginName)!.get(secretName);
          assert.isTrue(value === secretText);
          return ok("");
        }
      }
      hooks(MyClass, {
        WriteConfigTrigger: [ContextInjecterMW, ProjectSettingsWriterMW, EnvInfoWriterMW()],
        ReadConfigTrigger: [
          ProjectSettingsLoaderMW,
          EnvInfoLoaderMW(false, false),
          ContextInjecterMW,
        ],
      });
      const my = new MyClass();
      await my.WriteConfigTrigger(inputs);
      const content = fileMap.get(userdataFile);
      const userdata = dotenv.parse(content);
      const secretValue = userdata[`${pluginName}.${secretName}`];
      assert.isTrue(secretValue !== undefined);
      assert.isTrue(secretValue.startsWith("crypto_"));

      sandbox.stub<any, any>(fs, "readJson").callsFake(async (file: string) => {
        if (settingsFile === file) return JSON.parse(fileMap.get(settingsFile));
        if (envJsonFile === file) return JSON.parse(fileMap.get(envJsonFile));
        return {};
      });
      sandbox.stub<any, any>(fs, "readFile").callsFake(async (file: string) => {
        if (userdataFile === file) return content;
        return {};
      });
      await my.ReadConfigTrigger(inputs);
    });
  });

  describe("QuestionModelMW", () => {
    const sandbox = sinon.createSandbox();
    afterEach(function () {
      sandbox.restore();
    });

    it("successful happy path", async () => {
      const inputs: Inputs = { platform: Platform.VSCode };
      const tools = new MockTools();
      const MockContextLoaderMW: Middleware = async (ctx: CoreHookContext, next: NextFunction) => {
        ctx.solutionContext = await newSolutionContext(tools, inputs);
        await next();
      };

      const ui = tools.ui;
      const questionName = "mockquestion";
      let questionValue = randomAppName();
      sandbox.stub(ui, "inputText").callsFake(async (config: InputTextConfig) => {
        return ok({ type: "success", result: questionValue });
      });
      class MockCore {
        tools = tools;
        async createProject(inputs: Inputs): Promise<Result<string, FxError>> {
          assert.isTrue(inputs[questionName] === questionValue);
          return ok("");
        }
        async provisionResources(inputs: Inputs): Promise<Result<any, FxError>> {
          assert.isTrue(inputs[questionName] === questionValue);
          return ok("");
        }
        async deployArtifacts(inputs: Inputs): Promise<Result<any, FxError>> {
          assert.isTrue(inputs[questionName] === questionValue);
          return ok("");
        }
        async localDebug(inputs: Inputs): Promise<Result<any, FxError>> {
          assert.isTrue(inputs[questionName] === questionValue);
          return ok("");
        }
        async publishApplication(inputs: Inputs): Promise<Result<any, FxError>> {
          assert.isTrue(inputs[questionName] === questionValue);
          return ok("");
        }
        async executeUserTask(func: Func, inputs: Inputs): Promise<Result<unknown, FxError>> {
          assert.isTrue(inputs[questionName] === questionValue);
          return ok("");
        }
        async _getQuestionsForCreateProject(
          inputs: Inputs
        ): Promise<Result<QTreeNode | undefined, FxError>> {
          const node = new QTreeNode({
            type: "text",
            name: questionName,
            title: "",
          });
          return ok(node);
        }
        async _getQuestions(
          ctx: SolutionContext,
          solution: Solution,
          stage: Stage,
          inputs: Inputs
        ): Promise<Result<QTreeNode | undefined, FxError>> {
          const node = new QTreeNode({
            type: "text",
            password: true,
            name: questionName,
            title: "",
          });
          return ok(node);
        }
        async _getQuestionsForUserTask(
          ctx: SolutionContext,
          solution: Solution,
          func: FunctionRouter,
          inputs: Inputs
        ): Promise<Result<QTreeNode | undefined, FxError>> {
          const node = new QTreeNode({
            type: "text",
            name: questionName,
            title: "",
          });
          return ok(node);
        }
      }
      hooks(MockCore, {
        createProject: [
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        provisionResources: [
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        deployArtifacts: [
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        localDebug: [
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        publishApplication: [
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        executeUserTask: [
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
      });
      const my = new MockCore();

      const res = await my.createProject(inputs);
      assert.isTrue(res.isOk() && res.value === "");

      delete inputs[questionName];
      questionValue = randomAppName() + "provisionResources";
      await my.provisionResources(inputs);

      delete inputs[questionName];
      questionValue = randomAppName() + "deployArtifacts";
      await my.deployArtifacts(inputs);

      delete inputs[questionName];
      questionValue = randomAppName() + "localDebug";
      await my.localDebug(inputs);

      delete inputs[questionName];
      questionValue = randomAppName() + "publishApplication";
      await my.publishApplication(inputs);

      delete inputs[questionName];
      questionValue = randomAppName() + "executeUserTask";
      const func: Func = { method: "test", namespace: "" };
      await my.executeUserTask(func, inputs);
    });

    it("get question or traverse question tree error", async () => {
      const inputs: Inputs = { platform: Platform.VSCode };
      const tools = new MockTools();
      const MockContextLoaderMW: Middleware = async (ctx: CoreHookContext, next: NextFunction) => {
        ctx.solutionContext = await newSolutionContext(tools, inputs);
        await next();
      };

      const ui = tools.ui;
      const questionName = "mockquestion";
      let questionValue = randomAppName();
      sandbox.stub(ui, "inputText").callsFake(async (config: InputTextConfig) => {
        return ok({ type: "success", result: questionValue });
      });
      class MockCore {
        tools = tools;
        async createProject(inputs: Inputs): Promise<Result<string, FxError>> {
          return ok("");
        }
        async provisionResources(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
        async deployArtifacts(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
        async localDebug(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
        async publishApplication(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok("");
        }
        async executeUserTask(func: Func, inputs: Inputs): Promise<Result<unknown, FxError>> {
          return ok("");
        }
        async _getQuestionsForCreateProject(
          inputs: Inputs
        ): Promise<Result<QTreeNode | undefined, FxError>> {
          return err(InvalidInputError("mock"));
        }
        async _getQuestions(
          ctx: SolutionContext,
          solution: Solution,
          stage: Stage,
          inputs: Inputs
        ): Promise<Result<QTreeNode | undefined, FxError>> {
          return err(InvalidInputError("mock"));
        }
        async _getQuestionsForUserTask(
          ctx: SolutionContext,
          solution: Solution,
          func: FunctionRouter,
          inputs: Inputs
        ): Promise<Result<QTreeNode | undefined, FxError>> {
          const node = new QTreeNode({
            type: "singleSelect",
            name: questionName,
            title: "",
            staticOptions: [],
          });
          return ok(node);
        }
      }
      hooks(MockCore, {
        createProject: [
          ErrorHandlerMW,
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        provisionResources: [
          ErrorHandlerMW,
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        deployArtifacts: [
          ErrorHandlerMW,
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        localDebug: [
          ErrorHandlerMW,
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        publishApplication: [
          ErrorHandlerMW,
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
        executeUserTask: [
          ErrorHandlerMW,
          SolutionLoaderMW(new MockSolutionLoader()),
          MockContextLoaderMW,
          QuestionModelMW,
        ],
      });
      const my = new MockCore();

      let res = await my.createProject(inputs);
      assert(res.isErr() && res.error.name === InvalidInputError("").name);

      delete inputs[questionName];
      questionValue = randomAppName() + "provisionResources";
      res = await my.provisionResources(inputs);
      assert(res.isErr() && res.error.name === InvalidInputError("").name);

      delete inputs[questionName];
      questionValue = randomAppName() + "deployArtifacts";
      res = await my.deployArtifacts(inputs);
      assert(res.isErr() && res.error.name === InvalidInputError("").name);

      delete inputs[questionName];
      questionValue = randomAppName() + "localDebug";
      res = await my.localDebug(inputs);
      assert(res.isErr() && res.error.name === InvalidInputError("").name);

      delete inputs[questionName];
      questionValue = randomAppName() + "publishApplication";
      res = await my.publishApplication(inputs);
      assert(res.isErr() && res.error.name === InvalidInputError("").name);

      delete inputs[questionName];
      questionValue = randomAppName() + "executeUserTask";
      const func: Func = { method: "test", namespace: "" };
      const res2 = await my.executeUserTask(func, inputs);
      assert(res2.isErr() && res2.error.name === "EmptySelectOption");
    });
  });

  describe("ProjectUpgraderMW", () => {
    const sandbox = sinon.createSandbox();
    const appName = randomAppName();
    const projectSettings = MockProjectSettings(appName);
    let envJson: Json = {};
    let userData: Record<string, string> = {};

    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), appName);
    const envName = environmentManager.getDefaultEnvName();
    const confFolderPath = path.resolve(inputs.projectPath, `.${ConfigFolderName}`);
    const settingsFile = path.resolve(confFolderPath, "settings.json");
    const envJsonFile = path.resolve(confFolderPath, `env.${envName}.json`);
    const userDataFile = path.resolve(confFolderPath, `${envName}.userdata`);

    function MockFunctions() {
      sandbox.stub<any, any>(fs, "readJson").callsFake(async (file: string) => {
        if (settingsFile === file) return projectSettings;
        if (envJsonFile === file) return envJson;
        return {};
      });
      sandbox.stub<any, any>(fs, "writeFile").callsFake(async (file: string, content: any) => {
        if (userDataFile === file) {
          userData = deserializeDict(content);
        }
        if (envJsonFile === file) {
          envJson = JSON.parse(content);
        }
      });
      sandbox.stub<any, any>(fs, "readFile").callsFake(async (file: string) => {
        if (userDataFile === file) return serializeDict(userData);
        return {};
      });
    }

    beforeEach(() => {
      sandbox.stub<any, any>(fs, "pathExists").callsFake(async (file: string) => {
        if (userDataFile === file) return true;
        if (inputs.projectPath === file) return true;
        return {};
      });
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("Previous context and userdata", async () => {
      envJson = MockPreviousVersionBefore2_3_0Context();
      userData = MockPreviousVersionBefore2_3_0UserData();
      MockFunctions();

      class ProjectUpgradeHook {
        tools = new MockTools();
        async upgrade(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.equal(userData["fx-resource-aad-app-for-teams.local_clientId"], "local_clientId");
          assert.equal(userData["solution.localDebugTeamsAppId"], "teamsAppId");
          assert.equal(
            (envJson["solution"] as any)["localDebugTeamsAppId"],
            "{{solution.localDebugTeamsAppId}}"
          );
          assert.equal(
            (envJson["fx-resource-aad-app-for-teams"] as any)["local_clientId"],
            "{{fx-resource-aad-app-for-teams.local_clientId}}"
          );
          return ok("");
        }
      }

      hooks(ProjectUpgradeHook, {
        upgrade: [ProjectUpgraderMW],
      });

      const my = new ProjectUpgradeHook();
      const res = await my.upgrade(inputs);
      assert.isTrue(res.isOk() && res.value === "");
    });

    it("Previous context and new userdata", async () => {
      envJson = MockPreviousVersionBefore2_3_0Context();
      userData = MockLatestVersion2_3_0UserData();
      MockFunctions();

      class ProjectUpgradeHook {
        tools = new MockTools();
        async upgrade(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.equal(
            userData["fx-resource-aad-app-for-teams.local_clientId"],
            "local_clientId_new"
          );
          assert.equal(userData["solution.localDebugTeamsAppId"], "teamsAppId_new");
          assert.equal(
            (envJson["solution"] as any)["localDebugTeamsAppId"],
            "{{solution.localDebugTeamsAppId}}"
          );
          assert.equal(
            (envJson["fx-resource-aad-app-for-teams"] as any)["local_clientId"],
            "{{fx-resource-aad-app-for-teams.local_clientId}}"
          );
          return ok("");
        }
      }

      hooks(ProjectUpgradeHook, {
        upgrade: [ProjectUpgraderMW],
      });

      const my = new ProjectUpgradeHook();
      const res = await my.upgrade(inputs);
      assert.isTrue(res.isOk() && res.value === "");
    });

    it("New context and previous userdata", async () => {
      envJson = MockLatestVersion2_3_0Context();
      userData = MockPreviousVersionBefore2_3_0UserData();
      MockFunctions();

      class ProjectUpgradeHook {
        tools = new MockTools();
        async upgrade(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.equal(userData["fx-resource-aad-app-for-teams.local_clientId"], undefined);
          assert.equal(userData["solution.localDebugTeamsAppId"], undefined);
          assert.equal(
            (envJson["solution"] as any)["localDebugTeamsAppId"],
            "{{solution.localDebugTeamsAppId}}"
          );
          assert.equal(
            (envJson["fx-resource-aad-app-for-teams"] as any)["local_clientId"],
            "{{fx-resource-aad-app-for-teams.local_clientId}}"
          );
          return ok("");
        }
      }

      hooks(ProjectUpgradeHook, {
        upgrade: [ProjectUpgraderMW],
      });

      const my = new ProjectUpgradeHook();
      const res = await my.upgrade(inputs);
      assert.isTrue(res.isOk() && res.value === "");
    });

    it("Previous context and userdata without secret", async () => {
      envJson = MockPreviousVersionBefore2_3_0Context();
      userData = {};
      MockFunctions();

      class ProjectUpgradeHook {
        name = "jay";
        tools = new MockTools();
        async upgrade(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          assert.equal(userData["fx-resource-aad-app-for-teams.local_clientId"], undefined);
          assert.equal(userData["solution.localDebugTeamsAppId"], undefined);
          assert.equal(
            (envJson["solution"] as any)["localDebugTeamsAppId"],
            "{{solution.localDebugTeamsAppId}}"
          );
          assert.equal(
            (envJson["fx-resource-aad-app-for-teams"] as any)["local_clientId"],
            "{{fx-resource-aad-app-for-teams.local_clientId}}"
          );
          return ok("");
        }
      }

      hooks(ProjectUpgradeHook, {
        upgrade: [ProjectUpgraderMW],
      });

      const my = new ProjectUpgradeHook();
      const res = await my.upgrade(inputs);
      assert.isTrue(res.isOk() && res.value === "");
    });
  });
});
