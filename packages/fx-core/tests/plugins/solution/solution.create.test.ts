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
  HostTypeOptionAzure,
  TabOptionItem,
} from "../../../src/plugins/solution/fx-solution/question";
import * as uuid from "uuid";
import { newEnvInfo } from "../../../src";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Solution running state on creation", () => {
  const solution = new TeamsAppSolution();
  it("should be idle", () => {
    expect(solution.runningState).equal(SolutionRunningState.Idle);
  });
});

describe("Solution create()", async () => {
  function mockSolutionContext(): SolutionContext {
    return {
      root: ".",
      envInfo: newEnvInfo(),
      answers: { platform: Platform.VSCode },
      projectSettings: undefined,
    };
  }

  const mocker = sinon.createSandbox();
  const permissionsJsonPath = "./permissions.json";
  const fileContent: Map<string, any> = new Map();
  beforeEach(() => {
    mocker.stub(fs, "writeFile").callsFake((path: number | PathLike, data: any) => {
      fileContent.set(path.toString(), data);
    });
    // mocker.stub(fs, "writeFile").resolves();
    mocker.stub(fs, "writeJSON").callsFake((file: string, obj: any) => {
      fileContent.set(file, JSON.stringify(obj));
    });
    // Uses stub<any, any> to circumvent type check. Beacuse sinon fails to mock my target overload of readJson.
    mocker.stub<any, any>(fs, "readJson").withArgs(permissionsJsonPath).resolves({});
    mocker.stub<any, any>(fs, "pathExists").withArgs(permissionsJsonPath).resolves(true);
    mocker.stub<any, any>(fs, "copy").resolves();
  });

  it("should fail if projectSettings is undefined", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).to.be.not.undefined;
  });

  it("should fail if projectSettings.solutionSettings is undefined", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: undefined as unknown as SolutionSettings,
    };
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
  });

  it("should fail if capability is empty", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
  });

  it("should succeed if projectSettings, solution settings and capabilities are provided", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    const answers = mockedSolutionCtx.answers!;
    answers[AzureSolutionQuestionNames.Capabilities] = [BotOptionItem.id];
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isOk()).equals(true);
    expect(mockedSolutionCtx.envInfo.profile.get(GLOBAL_CONFIG)).is.not.undefined;
  });

  it("should set programmingLanguage in config if programmingLanguage is in answers", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      programmingLanguage: "",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    const answers = mockedSolutionCtx.answers!;
    answers[AzureSolutionQuestionNames.Capabilities as string] = [BotOptionItem.id];
    const programmingLanguage = "TypeScript";
    answers[AzureSolutionQuestionNames.ProgrammingLanguage as string] = programmingLanguage;
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isOk()).equals(true);

    const lang = mockedSolutionCtx.projectSettings.programmingLanguage;
    expect(lang).equals(programmingLanguage);
  });

  it("shouldn't set programmingLanguage in config if programmingLanguage is not in answers", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    const answers = mockedSolutionCtx.answers!;
    answers[AzureSolutionQuestionNames.Capabilities as string] = [BotOptionItem.id];
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isOk()).equals(true);
    const lang = mockedSolutionCtx.envInfo.profile
      .get(GLOBAL_CONFIG)
      ?.getString(PROGRAMMING_LANGUAGE);
    expect(lang).to.be.undefined;
  });

  it("should require hostType azure in answers if tab is chosen", async () => {
    fileContent.clear();
    const solution = new TeamsAppSolution();
    const mockedSolutionCtx = mockSolutionContext();
    mockedSolutionCtx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
      },
    };
    const answers = mockedSolutionCtx.answers!;
    answers[AzureSolutionQuestionNames.Capabilities as string] = [TabOptionItem.id];
    const result = await solution.create(mockedSolutionCtx);
    expect(result.isErr()).equals(true);
    expect(result._unsafeUnwrapErr().message).equals("hostType is undefined");
    expect(result._unsafeUnwrapErr().name).equals(SolutionError.InternelError);
  });

  afterEach(() => {
    mocker.restore();
  });
});
