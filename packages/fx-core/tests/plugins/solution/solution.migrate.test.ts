// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { it } from "mocha";
import { SolutionRunningState, TeamsAppSolution } from " ../../../src/plugins/solution";
import {
  Platform,
  SolutionConfig,
  SolutionContext,
  ok,
  Result,
  FxError,
  SolutionSettings,
} from "@microsoft/teamsfx-api";
import * as sinon from "sinon";
import fs, { PathLike } from "fs-extra";
import {
  GLOBAL_CONFIG,
  PROGRAMMING_LANGUAGE,
  SolutionError,
} from "../../../src/plugins/solution/fx-solution/constants";
import {
  AzureSolutionQuestionNames,
  BotOptionItem,
  TabOptionItem,
} from "../../../src/plugins/solution/fx-solution/question";
import * as uuid from "uuid";
import { newEnvInfo } from "../../../src";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Solution migrate()", async () => {
  function mockSolutionContext(): SolutionContext {
    return {
      root: ".",
      envInfo: newEnvInfo(),
      answers: { platform: Platform.VSCode },
      projectSettings: undefined,
    };
  }

  const mocker = sinon.createSandbox();
  afterEach(() => {
    mocker.restore();
  });

  const fileContent: Map<string, any> = new Map();

  it("should fail if projectSettings is undefined", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    cleanPlugins(solution, mocker);
    const mockedSolutionCtx = mockSolutionContext();
    const result = await solution.migrate(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
    expect(result._unsafeUnwrapErr().message).equals("projectSettings is undefined");
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).to.be.not.undefined;
  });

  it("should fail if projectSettings.solutionSettings is undefined", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    cleanPlugins(solution, mocker);
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: undefined as unknown as SolutionSettings,
    };
    const result = await solution.migrate(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
    expect(result._unsafeUnwrapErr().message).equals("solutionSettings is undefined");
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).to.be.not.undefined;
  });

  it("should fail if capability is undefined", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    cleanPlugins(solution, mocker);
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      programmingLanguage: "",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
        migrateFromV1: true,
      },
    };
    const result = await solution.migrate(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
    expect(result._unsafeUnwrapErr().message).equals("capabilities is empty");
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).to.be.not.undefined;
  });

  it("should succeed if projectSettings, solution settings and v1 capability are provided, language is javascript", async () => {
    mocker.stub(fs, "access").callsFake((path: PathLike, mode?: number) => {
      throw new Error("");
    });
    fileContent.clear();
    const solution = new TeamsAppSolution();
    cleanPlugins(solution, mocker);
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
        migrateFromV1: true,
      },
    };

    const answers = mockedSolutionCtx.answers!;
    answers[AzureSolutionQuestionNames.V1Capability] = TabOptionItem.id;

    const result = await solution.migrate(mockedSolutionCtx);
    expect(result.isOk()).equals(true);
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).is.not.undefined;
    const lang = mockedSolutionCtx.projectSettings.programmingLanguage;
    expect(lang).equals("javascript");
  });

  it("should succeed if projectSettings, solution settings and v1 capability are provided, language is typescript", async () => {
    mocker.stub(fs, "access").callsFake(async (path: PathLike, mode?: number): Promise<void> => {
      return;
    });
    fileContent.clear();
    const solution = new TeamsAppSolution();
    cleanPlugins(solution, mocker);
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
        migrateFromV1: true,
      },
    };

    const answers = mockedSolutionCtx.answers!;
    answers[AzureSolutionQuestionNames.V1Capability] = TabOptionItem.id;

    const result = await solution.migrate(mockedSolutionCtx);
    expect(result.isOk()).equals(true);
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).is.not.undefined;
    const lang = mockedSolutionCtx.projectSettings.programmingLanguage;
    expect(lang).equals("typescript");
  });
});

function cleanPlugins(solution: TeamsAppSolution, mocker: sinon.SinonSandbox) {
  mocker
    .stub(solution.LocalDebugPlugin, "executeUserTask")
    .callsFake(async (): Promise<Result<any, FxError>> => {
      return ok(undefined);
    });
  mocker.stub(solution.AadPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.ApimPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.AppStudioPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.BotPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.SpfxPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.FrontendPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.FunctionPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.SqlPlugin, "activate").callsFake((): boolean => {
    return false;
  });
  mocker.stub(solution.LocalDebugPlugin, "activate").callsFake((): boolean => {
    return true;
  });
}
