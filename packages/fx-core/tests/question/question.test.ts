// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { ResourceManagementClient } from "@azure/arm-resources";
import { TokenCredential } from "@azure/identity";
import {
  ConditionFunc,
  FuncValidation,
  Inputs,
  LocalFunc,
  OptionItem,
  Platform,
  Question,
  SingleSelectQuestion,
  TeamsAppManifest,
  TextInputQuestion,
  UserError,
  UserInteraction,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as path from "path";
import { assert, vi } from "vitest";
import { FeatureFlags, featureFlagManager } from "../../src";
import { setTools } from "../../src/common/globalVars";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import {
  newResourceGroupOption,
  resourceGroupHelper,
  resourceGroupQuestionNode,
  validateResourceGroupName,
} from "../../src/component/utils/ResourceGroupHelper";
import { azureClientHelper } from "../../src/component/utils/azureClient";
import { envUtil } from "../../src/component/utils/envUtil";
import { CollaborationConstants, CollaborationUtil } from "../../src/core/collaborator";
import {
  GCConnectionIdQuestion,
  GCInputQuestion,
  GCListQuestion,
  GCNameQuestion,
  SPFxImportFolderQuestion,
  questionNodes,
} from "../../src/question";
import { selectAadAppManifestQuestionNode } from "../../src/question/collaborator";
import {
  ActionStartOptions,
  GCSelectOptions,
  KnowledgeSearchTypeOptions,
  KnowledgeSourceOptions,
  QuestionNames,
  TeamsAppValidationOptions,
} from "../../src/question/constants";
import {
  addPluginQuestionNode,
  apiSpecApiKeyQuestion,
  createNewEnvQuestionNode,
  isAadMainifestContainsPlaceholder,
  newEnvNameValidation,
  oauthQuestion,
  selectAadManifestQuestion,
  selectLocalTeamsAppManifestQuestion,
  selectTeamsAppManifestQuestion,
} from "../../src/question/other";
import { teamsProjectTypeDeps } from "../../src/question/scaffold/vsc/teamsProjectTypeNode";
import { QuestionTreeVisitor, traverse } from "../../src/ui/visitor";
import { MockTools, MockUserInteraction, MockedAzureAccountProvider } from "../core/utils";

const ui = new MockUserInteraction();
export async function callFuncs(question: Question, inputs: Inputs, answer?: string) {
  try {
    if (question.default && typeof question.default !== "string") {
      await (question.default as LocalFunc<string | undefined>)(inputs);
    }

    if (
      (question.type === "singleSelect" || question.type === "multiSelect") &&
      typeof question.dynamicOptions !== "object" &&
      question.dynamicOptions
    ) {
      await question.dynamicOptions(inputs);
    }
    if (answer && (question as any).validation?.validFunc) {
      await (question as any).validation.validFunc(answer, inputs);
    }

    if ((question as any).placeholder && typeof (question as any).placeholder !== "string") {
      await (question as any).placeholder(inputs);
    }
  } catch (e) {}
}
describe("none scaffold questions", () => {
  const mockedEnvRestore: RestoreFn = () => {};
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });
  describe("addWebpart", async () => {
    it("happy path", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "./test",
      };

      const questionNames: string[] = [];
      const visitor: QuestionTreeVisitor = async (
        question: Question,
        ui: UserInteraction,
        inputs: Inputs,
        step?: number,
        totalSteps?: number
      ) => {
        questionNames.push(question.name);
        await callFuncs(question, inputs);
        if (QuestionNames.SPFxFolder) {
          return ok({
            type: "success",
            result: ".",
          });
        } else if (QuestionNames.SPFxWebpartName) {
          return ok({ type: "success", result: "test" });
        } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
          return ok({ type: "success", result: "teamsAppManifest" });
        } else if (question.name === QuestionNames.ConfirmManifest) {
          return ok({ type: "success", result: "manifest" });
        } else if (question.name === QuestionNames.LocalTeamsAppManifestFilePath) {
          return ok({ type: "success", result: "teamsAppManifest" });
        } else if (question.name === QuestionNames.ConfirmLocalManifest) {
          return ok({ type: "success", result: "manifest" });
        }
        return ok({ type: "success", result: undefined });
      };
      const node = questionNodes.addWebpart();

      await traverse(node, inputs, ui, undefined, visitor);
      assert.deepEqual(questionNames, [
        QuestionNames.SPFxFolder,
        QuestionNames.SPFxWebpartName,
        QuestionNames.SPFxFramework,
        QuestionNames.TeamsAppManifestFilePath,
        QuestionNames.ConfirmManifest,
        QuestionNames.LocalTeamsAppManifestFilePath,
        QuestionNames.ConfirmLocalManifest,
      ]);
    });
  });

  describe("selectTeamsAppManifest", async () => {
    it("happy path", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "./test",
      };

      const questionNames: string[] = [];
      const visitor: QuestionTreeVisitor = async (
        question: Question,
        ui: UserInteraction,
        inputs: Inputs,
        step?: number,
        totalSteps?: number
      ) => {
        questionNames.push(question.name);
        await callFuncs(question, inputs);
        if (question.name === QuestionNames.TeamsAppManifestFilePath) {
          return ok({ type: "success", result: "teamsAppManifest" });
        } else if (question.name === QuestionNames.ConfirmManifest) {
          return ok({ type: "success", result: "manifest" });
        }
        return ok({ type: "success", result: undefined });
      };
      const node = questionNodes.selectTeamsAppManifest();
      await traverse(node, inputs, ui, undefined, visitor);
      assert.deepEqual(questionNames, [
        QuestionNames.TeamsAppManifestFilePath,
        QuestionNames.ConfirmManifest,
      ]);
    });
  });
  describe("validateTeamsApp", async () => {
    it("happy path", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "./test",
      };

      const questionNames: string[] = [];
      const visitor: QuestionTreeVisitor = async (
        question: Question,
        ui: UserInteraction,
        inputs: Inputs,
        step?: number,
        totalSteps?: number
      ) => {
        questionNames.push(question.name);
        await callFuncs(question, inputs);
        if (question.name === QuestionNames.ValidateMethod) {
          return ok({ type: "success", result: TeamsAppValidationOptions.schema().id });
        } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
          return ok({ type: "success", result: "teamsAppManifest" });
        } else if (question.name === QuestionNames.ConfirmManifest) {
          return ok({ type: "success", result: "manifest" });
        }
        return ok({ type: "success", result: undefined });
      };
      const res = questionNodes.validateTeamsApp();

      await traverse(res, inputs, ui, undefined, visitor);
      assert.deepEqual(questionNames, [
        QuestionNames.ValidateMethod,
        QuestionNames.TeamsAppManifestFilePath,
      ]);
    });
  });
  describe("previewWithTeamsAppManifest", async () => {
    it("happy path", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "./test",
      };

      const questionNames: string[] = [];
      const visitor: QuestionTreeVisitor = async (
        question: Question,
        ui: UserInteraction,
        inputs: Inputs,
        step?: number,
        totalSteps?: number
      ) => {
        questionNames.push(question.name);
        await callFuncs(question, inputs);
        if (QuestionNames.SPFxFolder) {
          return ok({
            type: "success",
            result: ".",
          });
        } else if (question.name === QuestionNames.M365Host) {
          return ok({ type: "success", result: "test" });
        } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
          return ok({ type: "success", result: "test" });
        } else if (question.name === QuestionNames.ConfirmManifest) {
          return ok({ type: "success", result: "manifest" });
        }
        return ok({ type: "success", result: undefined });
      };
      const res = questionNodes.previewWithTeamsAppManifest();

      await traverse(res, inputs, ui, undefined, visitor);
      assert.deepEqual(questionNames, [
        QuestionNames.M365Host,
        QuestionNames.TeamsAppManifestFilePath,
        QuestionNames.ConfirmManifest,
      ]);
    });
  });
  it("SPFxImportFolderQuestion", () => {
    const projectDir = "\\test";

    const res = (SPFxImportFolderQuestion(true) as any).default({ projectPath: projectDir });

    assert.equal(path.resolve(res), path.resolve("\\test/src"));
  });
});

describe("listCollaborator", async () => {
  const sandbox = vi;

  afterEach(async () => {
    vi.restoreAllMocks();
  });
  it("CLI_HELP", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI_HELP,
    };
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.listCollaborator();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, []);
  });
  it("happy path: both are selected", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(async (manifestFilePath) => {
      return manifestFilePath == "teamsAppManifest" ? ok("teamsAppId") : ok("aadAppId");
    });
    vi.spyOn(CollaborationUtil, "requireEnvQuestion").mockResolvedValue(true);
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "local"]));
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.collaborationAppType) {
        return ok({
          type: "success",
          result: [
            CollaborationConstants.TeamsAppQuestionId,
            CollaborationConstants.AadAppQuestionId,
          ],
        });
      } else if (question.name === QuestionNames.AadAppManifestFilePath) {
        return ok({ type: "success", result: "aadAppManifest" });
      } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
        return ok({ type: "success", result: "teamsAppManifest" });
      } else if (question.name === QuestionNames.Env) {
        return ok({ type: "success", result: "dev" });
      } else if (question.name === QuestionNames.ConfirmManifest) {
        return ok({ type: "success", result: "manifest" });
      } else if (question.name === QuestionNames.ConfirmAadManifest) {
        return ok({ type: "success", result: "manifest" });
      }
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.listCollaborator();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.collaborationAppType,
      QuestionNames.TeamsAppManifestFilePath,
      QuestionNames.ConfirmManifest,
      QuestionNames.AadAppManifestFilePath,
      QuestionNames.ConfirmAadManifest,
      QuestionNames.Env,
    ]);
  });
  it("happy path: teams app only", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(async (manifestFilePath) => {
      return manifestFilePath == "teamsAppManifest" ? ok("teamsAppId") : ok("aadAppId");
    });
    vi.spyOn(CollaborationUtil, "requireEnvQuestion").mockResolvedValue(true);
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "local"]));
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.collaborationAppType) {
        return ok({
          type: "success",
          result: [CollaborationConstants.TeamsAppQuestionId],
        });
      } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
        return ok({ type: "success", result: "teamsAppManifest" });
      } else if (question.name === QuestionNames.Env) {
        return ok({ type: "success", result: "dev" });
      } else if (question.name === QuestionNames.ConfirmManifest) {
        return ok({ type: "success", result: "manifest" });
      }
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.listCollaborator();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.collaborationAppType,
      QuestionNames.TeamsAppManifestFilePath,
      QuestionNames.ConfirmManifest,
      QuestionNames.Env,
    ]);
  });
});
describe("grantPermission", async () => {
  const sandbox = vi;

  afterEach(async () => {
    vi.restoreAllMocks();
  });
  it("CLI_HELP", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI_HELP,
    };
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.grantPermission();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, []);
  });

  it("happy path", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(async (manifestFilePath) => {
      return manifestFilePath == "teamsAppManifest" ? ok("teamsAppId") : ok("aadAppId");
    });
    vi.spyOn(CollaborationUtil, "requireEnvQuestion").mockResolvedValue(true);
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "test"]));
    const tools = new MockTools();
    setTools(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({
        tid: "mock_project_tenant_id",
        oid: "fake_oid",
        unique_name: "fake_unique_name",
        name: "fake_name",
      })
    );
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs, "xxx@xxx.com");
      if (question.name === QuestionNames.collaborationAppType) {
        return ok({
          type: "success",
          result: [
            CollaborationConstants.TeamsAppQuestionId,
            CollaborationConstants.AadAppQuestionId,
          ],
        });
      } else if (question.name === QuestionNames.AadAppManifestFilePath) {
        return ok({ type: "success", result: "aadAppManifest" });
      } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
        return ok({ type: "success", result: "teamsAppManifest" });
      } else if (question.name === QuestionNames.Env) {
        return ok({ type: "success", result: "dev" });
      } else if (question.name === QuestionNames.ConfirmManifest) {
        return ok({ type: "success", result: "manifest" });
      } else if (question.name === QuestionNames.ConfirmAadManifest) {
        return ok({ type: "success", result: "manifest" });
      } else if (question.name === QuestionNames.UserEmail) {
        return ok({ type: "success", result: "xxx@xxx.com" });
      }
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.grantPermission();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.collaborationAppType,
      QuestionNames.TeamsAppManifestFilePath,
      QuestionNames.ConfirmManifest,
      QuestionNames.AadAppManifestFilePath,
      QuestionNames.ConfirmAadManifest,
      QuestionNames.Env,
      QuestionNames.UserEmail,
    ]);
  });
});

describe("convertAadToNewSchemaQuestionNode", async () => {
  const sandbox = vi;

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("happy path", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("${{fake_placeHolder}}"));
    const questions: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questions.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.AadAppManifestFilePath) {
        return ok({ type: "success", result: "aadAppManifest" });
      } else if (question.name === QuestionNames.ConfirmManifest) {
        return ok({ type: "success", result: "manifest" });
      }
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.convertAadToNewSchema();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questions, [
      QuestionNames.AadAppManifestFilePath,
      QuestionNames.ConfirmAadManifest,
    ]);
  });
});

describe("deployAadManifest", async () => {
  const sandbox = vi;

  afterEach(async () => {
    vi.restoreAllMocks();
  });
  it("CLI_HELP", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI_HELP,
    };
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.deployAadManifest();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, []);
  });
  it("traverse without projectPath", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const questions: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questions.push(question.name);
      return ok({ type: "success", result: undefined });
    };
    await traverse(selectAadAppManifestQuestionNode(), inputs, ui, undefined, visitor);
    assert.deepEqual(questions, [QuestionNames.AadAppManifestFilePath]);
  });

  it("happy path", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("${{fake_placeHolder}}"));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "local"]));
    const questions: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questions.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.AadAppManifestFilePath) {
        return ok({ type: "success", result: "aadAppManifest" });
      } else if (question.name === QuestionNames.Env) {
        return ok({ type: "success", result: "dev" });
      } else if (question.name === QuestionNames.ConfirmManifest) {
        return ok({ type: "success", result: "manifest" });
      }
      return ok({ type: "success", result: undefined });
    };
    await traverse(selectAadAppManifestQuestionNode(), inputs, ui, undefined, visitor);
    assert.deepEqual(questions, [
      QuestionNames.AadAppManifestFilePath,
      QuestionNames.ConfirmAadManifest,
    ]);
  });
  it("without env", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("${{fake_placeHolder}}"));
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(err(new UserError({})));
    const questions: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questions.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.AadAppManifestFilePath) {
        return ok({ type: "success", result: "aadAppManifest" });
      } else if (question.name === QuestionNames.Env) {
        return ok({ type: "success", result: "dev" });
      } else if (question.name === QuestionNames.ConfirmManifest) {
        return ok({ type: "success", result: "manifest" });
      }
      return ok({ type: "success", result: undefined });
    };
    await traverse(selectAadAppManifestQuestionNode(), inputs, ui, undefined, visitor);
    assert.deepEqual(questions, [
      QuestionNames.AadAppManifestFilePath,
      QuestionNames.ConfirmAadManifest,
    ]);
  });
  it("isAadMainifestContainsPlaceholder return true", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    inputs[QuestionNames.AadAppManifestFilePath] = path.join(
      __dirname,
      "..",
      "samples",
      "sampleV3",
      "aad.manifest.json"
    );
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("${{fake_placeHolder}}"));
    const res = await isAadMainifestContainsPlaceholder(inputs);
    assert.isTrue(res);
  });
  it("isAadMainifestContainsPlaceholder skip", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    inputs[QuestionNames.AadAppManifestFilePath] = "aadAppManifest";
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("test"));
    const res = await isAadMainifestContainsPlaceholder(inputs);
    assert.isFalse(res);
  });
});

describe("resourceGroupQuestionNode", async () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("validateResourceGroupName invalid pattern", () => {
    const res = validateResourceGroupName("!!!!!", { platform: Platform.VSCode });
    assert.isTrue(res !== undefined);
  });
  it("validateResourceGroupName already exists", () => {
    const res = validateResourceGroupName("myrg123", {
      platform: Platform.VSCode,
      existingResourceGroupNames: ["myrg123"],
    });
    assert.isTrue(res !== undefined);
  });
  it("create new resource group success", async () => {
    vi.spyOn(resourceGroupHelper, "listResourceGroups").mockResolvedValue(
      ok([
        ["g1", "East US"],
        ["g2", "Center US"],
      ])
    );
    vi.spyOn(resourceGroupHelper, "getLocations").mockResolvedValue(ok(["East US", "Center US"]));
    const mockSubscriptionId = "mockSub";
    const defaultRG = "defaultRG";
    const accountProvider = new MockedAzureAccountProvider();
    const mockToken = await accountProvider.getIdentityCredentialAsync();
    const mockRmClient = new ResourceManagementClient(
      mockToken as TokenCredential,
      mockSubscriptionId
    );
    vi.spyOn(azureClientHelper, "createRmClient").mockResolvedValue(mockRmClient);
    const node = resourceGroupQuestionNode(accountProvider, mockSubscriptionId, defaultRG);
    assert.isTrue(node !== undefined);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };

    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs, "testrg123");
      if (question.name === QuestionNames.TargetResourceGroupName) {
        return ok({
          type: "success",
          result: { id: newResourceGroupOption, label: newResourceGroupOption },
        });
      } else if (question.name === QuestionNames.NewResourceGroupName) {
        return ok({ type: "success", result: "testrg123" });
      } else if (question.name === QuestionNames.NewResourceGroupLocation) {
        return ok({ type: "success", result: "East US" });
      }
      return ok({ type: "success", result: undefined });
    };
    await traverse(node, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.TargetResourceGroupName,
      QuestionNames.NewResourceGroupName,
      QuestionNames.NewResourceGroupLocation,
    ]);
  });

  it("select existing resource group", async () => {
    vi.spyOn(resourceGroupHelper, "listResourceGroups").mockResolvedValue(
      ok([
        ["g1", "East US"],
        ["g2", "Center US"],
      ])
    );
    const mockSubscriptionId = "mockSub";
    const defaultRG = "defaultRG";
    const accountProvider = new MockedAzureAccountProvider();
    const mockToken = await accountProvider.getIdentityCredentialAsync();
    const mockRmClient = new ResourceManagementClient(
      mockToken as TokenCredential,
      mockSubscriptionId
    );
    vi.spyOn(azureClientHelper, "createRmClient").mockResolvedValue(mockRmClient);
    const node = resourceGroupQuestionNode(accountProvider, mockSubscriptionId, defaultRG);
    assert.isTrue(node !== undefined);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.TargetResourceGroupName) {
        return ok({
          type: "success",
          result: { id: "g1", label: newResourceGroupOption },
        });
      }
      return ok({ type: "success", result: undefined });
    };
    await traverse(node, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [QuestionNames.TargetResourceGroupName]);
  });
});

describe("createNewEnvQuestionNode", async () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("createNewEnv", () => {
    const res = questionNodes.createNewEnv();
    assert.isTrue(res !== undefined);
  });
  it("newEnvNameValidation invalid pattern", () => {
    const res = newEnvNameValidation("!!!!!", { platform: Platform.VSCode, projectPath: "." });
    assert.isTrue(res !== undefined);
  });
  it("newEnvNameValidation invlid local", () => {
    const res = newEnvNameValidation("local", {
      platform: Platform.VSCode,
    });
    assert.isTrue(res !== undefined);
  });
  it("newEnvNameValidation exists", () => {
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev1", "dev2"]));
    const res = newEnvNameValidation("dev1", {
      platform: Platform.VSCode,
      projectPath: ".",
    });
    assert.isTrue(res !== undefined);
  });
  it("newEnvNameValidation listEnv return error", () => {
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(err(new UserError({})));
    const res = newEnvNameValidation("dev1", {
      platform: Platform.VSCode,
      projectPath: ".",
    });
    assert.isTrue(res !== undefined);
  });
  it("happy path", async () => {
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev1", "dev2"]));
    const node = createNewEnvQuestionNode();
    assert.isTrue(node !== undefined);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs, "dev3");
      if (question.name === QuestionNames.NewTargetEnvName) {
        return ok({ type: "success", result: "dev3" });
      } else if (question.name === QuestionNames.SourceEnvName) {
        return ok({ type: "success", result: "dev2" });
      }
      return ok({ type: "success", result: undefined });
    };
    await traverse(node, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [QuestionNames.NewTargetEnvName, QuestionNames.SourceEnvName]);
  });
});

describe("copilotPluginQuestions", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs, "xxx@xxx.com");
      if (question.name == QuestionNames.ApiSpecLocation) {
        return ok({
          type: "success",
          result: ["https://example.json"],
        });
      } else if (question.name == QuestionNames.ApiOperation) {
        return ok({
          type: "success",
          result: [
            {
              id: "testOperation1",
              label: "operation1",
              groupName: "1",
              data: {
                serverUrl: "https://server1",
              },
            },
          ],
        });
      }
      return ok({ type: "success", result: undefined });
    };
    const res = questionNodes.copilotPluginAddAPI();
    await traverse(res, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [QuestionNames.ApiSpecLocation, QuestionNames.ApiOperation]);
  });
});

describe("selectTeamsAppManifestQuestion", async () => {
  it("default for CLI_HELP", async () => {
    const question = selectTeamsAppManifestQuestion();
    if (typeof question.default === "function") {
      const res = await question.default({ platform: Platform.CLI_HELP });
      assert.equal(res, "./appPackage/manifest.json");
    }
  });
});

describe("selectLocalTeamsAppManifestQuestion", async () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("default for CLI_HELP", async () => {
    const question = selectLocalTeamsAppManifestQuestion();
    if (typeof question.default === "function") {
      const res = await question.default({ platform: Platform.CLI_HELP });
      assert.equal(res, "./appPackage/manifest.local.json");
    }
  });
  it("default for vsc, path exists", async () => {
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const question = selectLocalTeamsAppManifestQuestion();
    if (typeof question.default === "function") {
      const res = await question.default({ platform: Platform.VSCode, projectPath: "./" });
      assert.isDefined(res);
    }
  });
});
describe("selectAadManifestQuestion", async () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });
  it("default for CLI_HELP", async () => {
    const question = selectAadManifestQuestion();
    if (typeof question.default === "function") {
      const res = await question.default({ platform: Platform.CLI_HELP });
      assert.equal(res, "./aad.manifest.json");
    }
  });
  it("default for VSCode", async () => {
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
    const question = selectAadManifestQuestion();
    if (typeof question.default === "function") {
      const res = await question.default({ platform: Platform.VSCode, projectPath: "./" });
      assert.isUndefined(res);
    }
  });
  it("CLI V3", async () => {
    mockedEnvRestore = mockedEnv({
      TEAMSFX_CLI_V3: "true",
    });
    const question = selectAadManifestQuestion();
    assert.equal(question.cliName, "entra-app-manifest-file");
  });
});

describe("apiKeyQuestion", async () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("will pop up question", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    const question = apiSpecApiKeyQuestion();
    const condition = question.condition;
    const res = await (condition as ConditionFunc)(inputs);
    assert.equal(res, true);
    const confirmQuesion = question.children![0];
    assert.equal(confirmQuesion.data.name, "api-key-confirm");
  });

  it("will not pop up question due to api key exists", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    inputs.outputEnvVarNames.set("registrationId", "registrationId");
    mockedEnvRestore = mockedEnv({
      registrationId: "fake-id",
    });
    const question = apiSpecApiKeyQuestion();
    const condition = question.condition;
    const res = await (condition as ConditionFunc)(inputs);
    assert.equal(res, false);
  });

  it("will not pop up question due to secret exists", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
      primaryClientSecret: "fakeClientSecret",
    };
    const question = apiSpecApiKeyQuestion();
    const condition = question.condition;
    const res = await (condition as ConditionFunc)(inputs);
    assert.equal(res, false);
  });

  it("validation passed", async () => {
    const question = apiSpecApiKeyQuestion();
    const validation = (question.data as TextInputQuestion).validation;
    const result = (validation as FuncValidation<string>).validFunc("mockedApiKey");
    assert.equal(result, undefined);
  });

  it("validation failed due to length", async () => {
    const question = apiSpecApiKeyQuestion();
    const validation = (question.data as TextInputQuestion).validation;
    const result = (validation as FuncValidation<string>).validFunc("abc");
    assert.equal(result, "Invalid client secret. It should be 10 to 512 characters long.");
  });
});

describe("oauthQuestion", async () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("will pop up question for client id, client secret and confirm", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    const question = oauthQuestion();

    const clientIdQuestion = question.children![0];
    const clientIdCondition = clientIdQuestion.condition;
    const clientIdRes = await (clientIdCondition as ConditionFunc)(inputs);
    assert.equal(clientIdRes, true);

    const clientSecretQuestion = question.children![2];
    const clientSecretCondition = clientSecretQuestion.condition;
    const clientSecretRes = await (clientSecretCondition as ConditionFunc)(inputs);
    assert.equal(clientSecretRes, true);

    const confirmQuesion = question.children![4];
    const confirmCondition = confirmQuesion.condition;
    const confirmRes = await (confirmCondition as ConditionFunc)(inputs);
    assert.equal(confirmRes, true);
  });

  it("will pop up question for client id, and confirm", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
      clientSecret: "fakeClientSecret",
    };
    const question = oauthQuestion();

    const clientIdQuestion = question.children![0];
    const clientIdCondition = clientIdQuestion.condition;
    const clientIdRes = await (clientIdCondition as ConditionFunc)(inputs);
    assert.equal(clientIdRes, true);

    const clientSecretQuestion = question.children![2];
    const clientSecretCondition = clientSecretQuestion.condition;
    const clientSecretRes = await (clientSecretCondition as ConditionFunc)(inputs);
    assert.equal(clientSecretRes, false);

    const confirmQuesion = question.children![4];
    const confirmCondition = confirmQuesion.condition;
    const confirmRes = await (confirmCondition as ConditionFunc)(inputs);
    assert.equal(confirmRes, true);
  });

  it("will pop up question for client secret, and confirm", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
      clientId: "fakeClientId",
    };
    const question = oauthQuestion();

    const clientIdQuestion = question.children![0];
    const clientIdCondition = clientIdQuestion.condition;
    const clientIdRes = await (clientIdCondition as ConditionFunc)(inputs);
    assert.equal(clientIdRes, false);

    const clientSecretQuestion = question.children![2];
    const clientSecretCondition = clientSecretQuestion.condition;
    const clientSecretRes = await (clientSecretCondition as ConditionFunc)(inputs);
    assert.equal(clientSecretRes, true);

    const confirmQuestion = question.children![4];
    const confirmCondition = confirmQuestion.condition;
    const confirmRes = await (confirmCondition as ConditionFunc)(inputs);
    assert.equal(confirmRes, true);
  });

  it("will not pop up question since client id, client secret exists", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
      clientId: "fakeClientId",
      clientSecret: "fakeClientSecret",
      scope: "read:user",
    };
    const question = oauthQuestion();

    const clientIdQuestion = question.children![0];
    const clientIdCondition = clientIdQuestion.condition;
    const clientIdRes = await (clientIdCondition as ConditionFunc)(inputs);
    assert.equal(clientIdRes, false);

    const clientSecretQuestion = question.children![2];
    const clientSecretCondition = clientSecretQuestion.condition;
    const clientSecretRes = await (clientSecretCondition as ConditionFunc)(inputs);
    assert.equal(clientSecretRes, false);

    const confirmQuesion = question.children![4];
    const confirmCondition = confirmQuesion.condition;
    const confirmRes = await (confirmCondition as ConditionFunc)(inputs);
    assert.equal(confirmRes, false);
  });

  it("will not pop up question due to registrationId exists", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    inputs.outputEnvVarNames.set("configurationId", "configurationId");
    mockedEnvRestore = mockedEnv({
      configurationId: "fake-id",
    });
    const question = oauthQuestion();
    const condition = question.condition;
    const res = await (condition as ConditionFunc)(inputs);
    assert.equal(res, false);
  });

  it("client secret validation passed", async () => {
    const question = oauthQuestion().children![2];
    const validation = (question.data as TextInputQuestion).validation;
    const result = (validation as FuncValidation<string>).validFunc("mockedClientSecret");
    assert.equal(result, undefined);
  });

  it("client secret validation failed due to length", async () => {
    const question = oauthQuestion().children![2];
    const validation = (question.data as TextInputQuestion).validation;
    const result = (validation as FuncValidation<string>).validFunc("abc");
    assert.equal(result, "Invalid client secret. It should be 10 to 512 characters long.");
  });

  it("client id additionalValidationOnAccept passed", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    const question = oauthQuestion().children![0];
    const validation = (question.data as TextInputQuestion).additionalValidationOnAccept;
    const result = (validation as FuncValidation<string>).validFunc("mockedClientId", inputs);
    assert.equal(result, undefined);
  });

  it("client secret additionalValidationOnAccept passed", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    const question = oauthQuestion().children![2];
    const validation = (question.data as TextInputQuestion).additionalValidationOnAccept;
    const result = (validation as FuncValidation<string>).validFunc("mockedClientSecret", inputs);
    assert.equal(result, undefined);
  });

  it("will pop up entra client id question for MicrosoftEntra identity provider", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
      identityProvider: "MicrosoftEntra",
    };
    const question = oauthQuestion();

    const oauthClientIdQuestion = question.children![0];
    const oauthClientIdCondition = oauthClientIdQuestion.condition;
    const oauthClientIdRes = await (oauthClientIdCondition as ConditionFunc)(inputs);
    assert.equal(oauthClientIdRes, false);

    const entraClientIdQuestion = question.children![1];
    const entraClientIdCondition = entraClientIdQuestion.condition;
    const entraClientIdRes = await (entraClientIdCondition as ConditionFunc)(inputs);
    assert.equal(entraClientIdRes, true);

    const clientSecretQuestion = question.children![2];
    const clientSecretCondition = clientSecretQuestion.condition;
    const clientSecretRes = await (clientSecretCondition as ConditionFunc)(inputs);
    assert.equal(clientSecretRes, false);

    const confirmQuestion = question.children![4];
    const confirmCondition = confirmQuestion.condition;
    const confirmRes = await (confirmCondition as ConditionFunc)(inputs);
    assert.equal(confirmRes, false);
  });

  it("entra client id additionalValidationOnAccept passed", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      outputEnvVarNames: new Map<string, string>(),
    };
    const question = oauthQuestion().children![1];
    const validation = (question.data as TextInputQuestion).additionalValidationOnAccept;
    const result = (validation as FuncValidation<string>).validFunc("mockedEntraClientId", inputs);
    assert.equal(result, undefined);
  });
});

describe("addPluginQuestionNode", async () => {
  const sandbox = vi;
  const mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("should include inputOrSearchAPISpecNode when KiotaNPMIntegration is enabled", async () => {
    const sandbox = vi;
    try {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
        if (flag === FeatureFlags.KiotaNPMIntegration) {
          return true;
        }
        return false;
      });

      const questionNode = addPluginQuestionNode();

      assert.isObject(questionNode);
      assert.property(questionNode, "data");
      assert.property(questionNode, "children");

      const children = questionNode.children;
      assert.isArray(children);
      assert.isObject(children![0]);
      assert.equal(children![0].data.name, QuestionNames.OpenAPISpecType);
      const inputs = {} as any;

      (children![0].data as SingleSelectQuestion)!.onDidSelection!("", inputs);
      assert.equal(inputs[QuestionNames.ActionType], ActionStartOptions.apiSpec().id);

      assert.equal(
        children![children!.length - 1].data.name,
        QuestionNames.TeamsAppManifestFilePath
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("success: can add a plugin from api spec", async () => {
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok({} as TeamsAppManifest));
    vi.spyOn(manifestUtils, "parseCommonProperties").mockReturnValue({
      capabilities: ["copilotGpt"],
      isApiME: false,
      isSPFx: false,
      id: "1",
      version: "1",
      manifestVersion: "",
      isApiMeAAD: false,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };

    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.TeamsAppManifestFilePath) {
        return ok({
          type: "success",
          result: "manifest.json",
        });
      } else if (question.name == QuestionNames.ActionType) {
        const select = question as SingleSelectQuestion;
        const options = await select.dynamicOptions!(inputs);
        //assert.isTrue(options.length === 2);
        return ok({ type: "success", result: ActionStartOptions.apiSpec().id });
      } else if (question.name === QuestionNames.ApiSpecLocation) {
        return ok({ type: "success", result: "test.yaml" });
      } else if (question.name === QuestionNames.ApiOperation) {
        return ok({ type: "success", result: "[GET /repairs]" });
      }
      return ok({ type: "success", result: undefined });
    };
    const node = questionNodes.addPlugin();

    await traverse(node, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.ActionType,
      QuestionNames.ApiSpecLocation,
      QuestionNames.ApiOperation,
      QuestionNames.TeamsAppManifestFilePath,
    ]);
  });
});

describe("addKnowledgeQuestionNode", async () => {
  const sandbox = vi;
  const mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("success: can add a knowledge from Web Search(by url)", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };

    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.KnowledgeSource) {
        return ok({ type: "success", result: KnowledgeSourceOptions.webSearch().id });
      } else if (question.name === QuestionNames.SearchType) {
        return ok({ type: "success", result: KnowledgeSearchTypeOptions.url().id });
      } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
        return ok({
          type: "success",
          result: "manifest.json",
        });
      }
      return ok({ type: "success", result: undefined });
    };
    const node = questionNodes.addKnowledge();

    await traverse(node, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.KnowledgeSource,
      QuestionNames.SearchType,
      QuestionNames.WebContent,
      QuestionNames.TeamsAppManifestFilePath,
    ]);
  });

  it("success: can add a knowledge from OneDrive and SharePoint(by url)", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url().id,
    };

    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.KnowledgeSource) {
        return ok({ type: "success", result: KnowledgeSourceOptions.oneDriveSharePoint().id });
      } else if (question.name === QuestionNames.SearchType) {
        return ok({ type: "success", result: KnowledgeSearchTypeOptions.url().id });
      } else if (question.name === QuestionNames.TeamsAppManifestFilePath) {
        return ok({
          type: "success",
          result: "manifest.json",
        });
      }
      return ok({ type: "success", result: undefined });
    };
    const node = questionNodes.addKnowledge();

    await traverse(node, inputs, ui, undefined, visitor);
    assert.deepEqual(questionNames, [
      QuestionNames.KnowledgeSource,
      QuestionNames.SearchType,
      QuestionNames.OneDriveSharePointURL,
      QuestionNames.OneDriveSharePointContent,
      QuestionNames.TeamsAppManifestFilePath,
    ]);
  });

  it("success: can add a knowledge from Copilot connector", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };

    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.KnowledgeSource) {
        return ok({ type: "success", result: KnowledgeSourceOptions.graphConnector().id });
      }
      return ok({ type: "success", result: undefined });
    };
    const node = questionNodes.addKnowledge();

    await traverse(node, inputs, ui, undefined, visitor);
  });

  it("GCInput validate check", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };
    const question = GCInputQuestion();
    const validation = question.validation as FuncValidation<string>;
    const res1 = validation.validFunc("test");
    assert.isTrue(res1 === undefined);
    const res2 = validation.validFunc("");
    assert.isFalse(res2 === undefined);
    const res3 = validation.validFunc("    ");
    assert.isFalse(res3 === undefined);
  });

  it("GCList validate check", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.graphConnector().id,
      [QuestionNames.GCContent]: GCSelectOptions.list().id,
    };
    const question = GCListQuestion();
    question.dynamicOptions = async () => {
      return [
        {
          id: "1",
          label: "1",
        },
      ];
    };
    const validation = question.validation as FuncValidation<string>;
    try {
      await validation.validFunc("test");
      assert.fail("Should throw error");
    } catch (error) {}
    validation.validFunc([] as any, inputs);
  });

  it("success: can add a knowledge from Embedded Knowledge", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };

    const questionNames: string[] = [];
    const visitor: QuestionTreeVisitor = async (
      question: Question,
      ui: UserInteraction,
      inputs: Inputs,
      step?: number,
      totalSteps?: number
    ) => {
      questionNames.push(question.name);
      await callFuncs(question, inputs);
      if (question.name === QuestionNames.KnowledgeSource) {
        return ok({ type: "success", result: KnowledgeSourceOptions.embeddedKnowledge().id });
      }
      return ok({ type: "success", result: undefined });
    };
    const node = questionNodes.addKnowledge();

    await traverse(node, inputs, ui, undefined, visitor);
  });
});

describe("scaffold Copilot connector", async () => {
  const sandbox = vi;
  const mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("GCName validation check", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };
    const question = GCNameQuestion();
    const validation = question.validation as FuncValidation<string>;
    const res1 = validation.validFunc("test", inputs);
    assert.isTrue(res1 === undefined);
    const res2 = validation.validFunc("", inputs);
    assert.isFalse(res2 === undefined);
    const res3 = validation.validFunc("    ", inputs);
    assert.isFalse(res3 === undefined);
    const res4 = validation.validFunc("a", inputs);
    assert.isFalse(res4 === undefined);
  });

  it("GCName additionalValidationOnAccept check", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };
    const question = GCNameQuestion();
    const validation = question.additionalValidationOnAccept as FuncValidation<string>;
    try {
      await validation.validFunc("test");
      assert.fail("Should throw error");
    } catch (error) {}
    await validation.validFunc("test", inputs);
  });

  it("GC connection id validate check", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./test",
    };
    const question = GCConnectionIdQuestion();
    const validation = question.validation as FuncValidation<string>;
    const res1 = validation.validFunc("test");
    assert.isTrue(res1 === undefined);

    const res2 = validation.validFunc("");
    assert.isFalse(res2 === undefined);

    const res3 = validation.validFunc("ab");
    assert.isFalse(res3 === undefined);

    const res4 = validation.validFunc("---");
    assert.isFalse(res4 === undefined);

    const res5 = validation.validFunc("1234567890123456789012345678901234567890123456");
    assert.isFalse(res5 === undefined);

    const res6 = validation.validFunc("microsoft-graph-connector");
    assert.isFalse(res6 === undefined);
  });
});

describe("updateActionWithMCP", async () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return updateActionWithMCP question node", () => {
    const res = questionNodes.updateActionWithMCP();
    assert.isTrue(res !== undefined);
  });

  it("should have correct structure for plugin manifest file path question", () => {
    const res = questionNodes.updateActionWithMCP();

    // Check the main data properties
    assert.equal(res.data?.type, "singleFile");
    assert.equal(res.data?.name, QuestionNames.PluginManifestFilePath);
    assert.isFunction((res.data as any)?.defaultFolder);
    // The parent node now uses possibleFiles instead of a synthesized default
    assert.isFunction((res.data as any)?.possibleFiles);

    // Test defaultFolder function
    const testInputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "/test/project",
    };
    const defaultFolder = ((res.data as any)?.defaultFolder as (inputs: Inputs) => string)(
      testInputs
    );
    assert.equal(defaultFolder, path.normalize(path.join("/test/project", "appPackage")));
  });

  it("should have pre-fetch tools question with dynamic options", () => {
    const res = questionNodes.updateActionWithMCP();
    // children[0] is the NewPluginManifestFileName text question;
    // children[1] is the MCPForDAPreFetchTools multiSelect question.
    const preFetchToolsNode = res.children?.[1];

    assert.isDefined(preFetchToolsNode);
    assert.equal(preFetchToolsNode?.data?.type, "multiSelect");
    assert.equal(preFetchToolsNode?.data?.name, QuestionNames.MCPForDAPreFetchTools);
    assert.isArray((preFetchToolsNode?.data as any)?.staticOptions);
    assert.lengthOf((preFetchToolsNode?.data as any)?.staticOptions, 0);
    assert.isFunction((preFetchToolsNode?.data as any)?.dynamicOptions);

    // Test dynamic options
    const testInputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.MCPForDAAvailableTools]: [
        { name: "tool1", description: "Tool 1 description" },
        { name: "tool2", description: "Tool 2 description" },
        { name: "tool3" }, // No description
      ],
    };

    const options = (
      (preFetchToolsNode?.data as any)?.dynamicOptions as (inputs: Inputs) => OptionItem[]
    )(testInputs);
    assert.lengthOf(options, 3);
    assert.equal(options[0].id, "tool1");
    assert.equal(options[0].label, "tool1");
    assert.equal(options[0].detail, "Tool 1 description");
    assert.equal(options[1].id, "tool2");
    assert.equal(options[1].label, "tool2");
    assert.equal(options[1].detail, "Tool 2 description");
    assert.equal(options[2].id, "tool3");
    assert.equal(options[2].label, "tool3");
    assert.equal(options[2].detail, "");
  });

  it("should handle default function for pre-fetch tools when no manifest file", async () => {
    const res = questionNodes.updateActionWithMCP();
    const preFetchToolsNode = res.children?.[1];

    const testInputs: Inputs = {
      platform: Platform.VSCode,
      // No PluginManifestFilePath provided
    };

    const defaultValue = await (
      (preFetchToolsNode?.data as any)?.default as (inputs: Inputs) => Promise<string[]>
    )(testInputs);
    assert.isArray(defaultValue);
    assert.lengthOf(defaultValue, 0);
  });

  it("should handle default function for pre-fetch tools with existing manifest", async () => {
    const res = questionNodes.updateActionWithMCP();
    const preFetchToolsNode = res.children?.[1];

    const mockPluginManifest = {
      runtimes: [
        {
          type: "RemoteMCPServer",
          spec: {
            url: "http://test-server.com",
          },
          run_for_functions: ["function1", "function2"],
        },
        {
          type: "RemoteMCPServer",
          spec: {
            url: "http://other-server.com", // Different URL
          },
          run_for_functions: ["function3"],
        },
        {
          type: "RemoteMCPServer",
          spec: {
            url: "http://test-server.com",
          },
          run_for_functions: ["function4"],
        },
      ],
    };

    // Mock deps used by updateActionWithMCP
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockResolvedValue(mockPluginManifest as any);

    const testInputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "/test/manifest.json",
      [QuestionNames.MCPForDAServerUrl]: "http://test-server.com",
    };

    const defaultValue = await (
      (preFetchToolsNode?.data as any)?.default as (inputs: Inputs) => Promise<string[]>
    )(testInputs);
    assert.isArray(defaultValue);
    assert.lengthOf(defaultValue, 3);
    assert.include(defaultValue, "function1");
    assert.include(defaultValue, "function2");
    assert.include(defaultValue, "function4");
    // function3 should not be included (different URL)
  });

  it("should handle auth type question conditionally", () => {
    const res = questionNodes.updateActionWithMCP();
    // children[2] is the auth-type singleSelect (after NewPluginManifestFileName
    // and MCPForDAPreFetchTools).
    const authTypeNode = res.children?.[2];

    assert.isDefined(authTypeNode);
    assert.isFunction(authTypeNode?.condition);
    assert.equal(authTypeNode?.data?.type, "singleSelect");
    assert.equal(authTypeNode?.data?.name, QuestionNames.MCPForDAAuthType);

    // Test condition function - should show when auth is not NoneAuth
    const conditionFunc = authTypeNode?.condition as ConditionFunc;

    const inputsWithAuth: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAuth]: "OAuth",
    };
    assert.isTrue(conditionFunc(inputsWithAuth));

    const inputsWithNoneAuth: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAuth]: "NoneAuth",
    };
    assert.isFalse(conditionFunc(inputsWithNoneAuth));

    // Should return true for VS Code when auth is not NoneAuth
    const inputsVSCode: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.MCPForDAAuth]: "OAuth",
    };
    assert.isTrue(conditionFunc(inputsVSCode));

    // Test static options - by default oauth-dynamic is surfaced first.
    const staticOptions = (authTypeNode?.data as any)?.staticOptions;
    assert.isArray(staticOptions);
    assert.deepEqual(
      staticOptions.map((opt: any) => opt.id),
      ["oauth-dynamic", "oauth", "entra-sso"]
    );
    assert.equal((authTypeNode?.data as any)?.default, "oauth-dynamic");

    // When TEAMSFX_MCP_FOR_DA_DCR is disabled, the dynamic-registration option is hidden.
    const flagSandbox = vi;
    try {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
        return flag !== FeatureFlags.MCPForDADCR;
      });
      const optionsWithFlags = (questionNodes.updateActionWithMCP().children?.[2]?.data as any)
        ?.staticOptions;
      assert.isArray(optionsWithFlags);
      assert.deepEqual(
        optionsWithFlags.map((opt: any) => opt.id),
        ["oauth", "entra-sso"]
      );
      assert.equal(
        (questionNodes.updateActionWithMCP().children?.[2]?.data as any)?.default,
        "oauth"
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("should handle fs.readJSON errors gracefully in default function", async () => {
    const res = questionNodes.updateActionWithMCP();
    const preFetchToolsNode = res.children?.[1];

    // Mock deps used by updateActionWithMCP default
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockRejectedValue(new Error("File not found"));

    const testInputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "/test/nonexistent.json",
      [QuestionNames.MCPForDAServerUrl]: "http://test-server.com",
    };

    try {
      const defaultValue = await (
        (preFetchToolsNode?.data as any)?.default as (inputs: Inputs) => Promise<string[]>
      )(testInputs);
      // If error is handled, should return empty array or throw
      assert.fail("Expected error to be thrown or handled");
    } catch (error) {
      // This is expected behavior - the function should propagate the error
      assert.isDefined(error);
    }
  });

  it("should filter runtimes correctly based on server URL", async () => {
    const res = questionNodes.updateActionWithMCP();
    const preFetchToolsNode = res.children?.[1];

    const mockPluginManifest = {
      runtimes: [
        {
          type: "LocalMCPServer", // Wrong type
          spec: {
            url: "http://test-server.com",
          },
          run_for_functions: ["function1"],
        },
        {
          type: "RemoteMCPServer",
          spec: {
            url: "http://test-server.com",
          },
          run_for_functions: ["function2", "function3"],
        },
      ],
    };

    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockResolvedValue(mockPluginManifest as any);

    const testInputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "/test/manifest.json",
      [QuestionNames.MCPForDAServerUrl]: "http://test-server.com",
    };

    const defaultValue = await (
      (preFetchToolsNode?.data as any)?.default as (inputs: Inputs) => Promise<string[]>
    )(testInputs);
    assert.isArray(defaultValue);
    assert.lengthOf(defaultValue, 2);
    assert.include(defaultValue, "function2");
    assert.include(defaultValue, "function3");
    // function1 should not be included (wrong runtime type)
  });
});

describe("ActionStartOptions", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("all()", () => {
    it("should include MCP option on VSCode platform", () => {
      const inputs: Inputs = { platform: Platform.VSCode };
      const options = ActionStartOptions.all(inputs, true);
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.mcp().id));
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.apiSpec().id));
    });

    it("should include MCP option on CLI platform", () => {
      const inputs: Inputs = { platform: Platform.CLI };
      const options = ActionStartOptions.all(inputs, true);
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.mcp().id));
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.apiSpec().id));
    });

    it("should return newApi and apiSpec when doesProjectExists is false", () => {
      const inputs: Inputs = { platform: Platform.VSCode };
      const options = ActionStartOptions.all(inputs, false);
      assert.equal(options.length, 2);
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.newApi().id));
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.apiSpec().id));
    });
  });

  describe("staticAll()", () => {
    it("should include apiSpec and mcp when doesProjectExists is true", () => {
      const options = ActionStartOptions.staticAll(true);
      assert.equal(options.length, 2);
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.apiSpec().id));
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.mcp().id));
    });

    it("should include newApi and apiSpec when doesProjectExists is false", () => {
      const options = ActionStartOptions.staticAll(false);
      assert.equal(options.length, 2);
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.newApi().id));
      assert.isTrue(options.some((o) => o.id === ActionStartOptions.apiSpec().id));
    });
  });
});
