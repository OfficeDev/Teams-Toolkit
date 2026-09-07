// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  AppPackageFolderName,
  ConditionFunc,
  err,
  FuncValidation,
  Inputs,
  ok,
  Platform,
  SensitivityLabel,
  SingleFileQuestion,
  SingleSelectQuestion,
  SystemError,
  TeamsAppManifest,
  TextInputQuestion,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import { assert, vi } from "vitest";
import { manifestUtils } from "../../src";
import { GraphClient } from "../../src/client/graphClient";
import { setTools, TOOLS } from "../../src/common/globalVars";
import { getLocalizedString } from "../../src/common/localizeUtils";
import { environmentNameManager } from "../../src/core/environmentName";
import { ActionStartOptions, QuestionNames } from "../../src/question/constants";
import {
  addAuthActionQuestion,
  addSkillQuestionNode,
  apiFromPluginManifestQuestion,
  apiSpecFromPluginManifestQuestion,
  authNameQuestion,
  kiotaRegenerateQuestion,
  oauthAuthorizationUrlQuestion,
  oauthRefreshUrlQuestion,
  oauthScopeCustomQuestion,
  oauthScopeQuestion,
  oauthTokenUrlQuestion,
  openApiApiKeyNode,
  openApiOAuthCredentialNodes,
  selectDeclarativeAgentManifestQuestion,
  selectTargetEnvQuestion,
  setSensitivityLabelNode,
} from "../../src/question/other";

describe("OpenAPI action credential questions", () => {
  const apiSpecInputs: Inputs = {
    platform: Platform.CLI,
    [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
    apiAuthData: [{ serverUrl: "https://example.com", authType: "oauth2" }],
  };

  it("shows the API key question only for one CLI API-key registration", async () => {
    const condition = openApiApiKeyNode().condition;
    if (typeof condition !== "function") {
      assert.fail("API key condition is missing");
    }

    assert.isTrue(
      await condition({
        ...apiSpecInputs,
        apiAuthData: [{ serverUrl: "https://example.com", authType: "apiKey" }],
      })
    );
    assert.isFalse(await condition({ ...apiSpecInputs, platform: Platform.VSCode }));
    assert.isFalse(await condition({ ...apiSpecInputs, apiAuthData: [] }));
    assert.isFalse(await condition(apiSpecInputs));
  });

  it("shows OAuth follow-ups only for applicable CLI OAuth inputs", async () => {
    const nodes = openApiOAuthCredentialNodes();
    const identityProviderCondition = nodes[0].condition;
    const pkceCondition = nodes[2].condition;
    const clientSecretCondition = nodes[3].condition;
    const scopesCondition = nodes[4].condition;
    if (
      typeof identityProviderCondition !== "function" ||
      typeof pkceCondition !== "function" ||
      typeof clientSecretCondition !== "function" ||
      typeof scopesCondition !== "function"
    ) {
      assert.fail("OAuth credential condition is missing");
    }

    assert.isTrue(await identityProviderCondition(apiSpecInputs));
    assert.isFalse(
      await identityProviderCondition({ ...apiSpecInputs, platform: Platform.VSCode })
    );
    assert.isFalse(await identityProviderCondition({ ...apiSpecInputs, apiAuthData: [] }));

    const confidentialInputs: Inputs = {
      ...apiSpecInputs,
      [QuestionNames.OpenApiAuthClientId]: "client-id",
    };
    assert.isTrue(await pkceCondition(confidentialInputs));
    assert.isTrue(await clientSecretCondition(confidentialInputs));
    assert.isTrue(await scopesCondition(confidentialInputs));
    assert.isFalse(
      await pkceCondition({
        ...confidentialInputs,
        [QuestionNames.OpenApiAuthIdentityProvider]: "microsoft-entra",
      })
    );
    assert.isFalse(
      await clientSecretCondition({
        ...confidentialInputs,
        [QuestionNames.OpenApiAuthPKCE]: true,
      })
    );
    assert.isFalse(
      await scopesCondition({
        ...confidentialInputs,
        [QuestionNames.OpenApiAuthClientId]: " ",
      })
    );
  });
});

describe("env question", () => {
  it("should not show testtool env", async () => {
    const dynamicOptions = selectTargetEnvQuestion(
      QuestionNames.TargetEnvName,
      false
    ).dynamicOptions;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    if (dynamicOptions) {
      const envs = (await dynamicOptions(inputs)) as string[];
      assert.notInclude(envs, environmentNameManager.getTestToolEnvName());
    }
  });

  it("should not show testtool env for non-remote", async () => {
    const dynamicOptions = selectTargetEnvQuestion(
      QuestionNames.TargetEnvName,
      true
    ).dynamicOptions;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    if (dynamicOptions) {
      const envs = (await dynamicOptions(inputs)) as string[];
      assert.notInclude(envs, environmentNameManager.getTestToolEnvName());
    }
  });
});

describe("kiotaRegenerate question", () => {
  it("should ask for manifest", async () => {
    const question = kiotaRegenerateQuestion();
    assert.equal(question.data.name, QuestionNames.TeamsAppManifestFilePath);
  });
});

describe("addAuthActionQuestion", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SCN-ADD-AUTH-CONFIG-01: offers an optional API key only in CLI auth-config", async () => {
    const apiKeyNode = addAuthActionQuestion().children?.find(
      (child) => child.data.name === QuestionNames.ApiSpecApiKey
    );

    assert.isDefined(apiKeyNode);
    assert.equal(apiKeyNode.data.type, "text");
    assert.isTrue(apiKeyNode.data.password);
    assert.isFalse(apiKeyNode.data.required);
    assert.equal(apiKeyNode.data.cliShortName, "k");
    assert.isDefined(apiKeyNode.condition);
    assert.isDefined(apiKeyNode.data.validation);

    const cliResult = await apiKeyNode.condition({
      platform: Platform.CLI,
      [QuestionNames.ApiAuth]: "api-key",
    });
    const vscodeResult = await apiKeyNode.condition({
      platform: Platform.VSCode,
      [QuestionNames.ApiAuth]: "api-key",
    });
    const blankValidationResult = await apiKeyNode.data.validation.validFunc("   ");
    const shortValidationResult = await apiKeyNode.data.validation.validFunc("short");
    const longValidationResult = await apiKeyNode.data.validation.validFunc("a".repeat(513));
    const validValidationResult = await apiKeyNode.data.validation.validFunc("a".repeat(10));

    assert.isTrue(cliResult);
    assert.isFalse(vscodeResult);
    assert.isUndefined(blankValidationResult);
    assert.isDefined(shortValidationResult);
    assert.equal(longValidationResult, shortValidationResult);
    assert.isUndefined(validValidationResult);
  });

  it("SCN-ADD-AUTH-CONFIG-01: offers an optional secret for CLI bearer-token auth-config", async () => {
    const apiKeyNode = addAuthActionQuestion().children?.find(
      (child) => child.data.name === QuestionNames.ApiSpecApiKey
    );

    assert.isDefined(apiKeyNode?.condition);
    assert.isTrue(
      await apiKeyNode.condition({
        platform: Platform.CLI,
        [QuestionNames.ApiAuth]: "bearer-token",
      })
    );
    assert.isFalse(
      await apiKeyNode.condition({
        platform: Platform.VSCode,
        [QuestionNames.ApiAuth]: "bearer-token",
      })
    );
  });

  it("SCN-ADD-AUTH-CONFIG-02: offers optional OAuth credentials only in CLI auth-config", async () => {
    const children = addAuthActionQuestion().children ?? [];
    const clientIdNode = children.find((child) => child.data.name === QuestionNames.OauthClientId);
    const clientSecretNode = children.find(
      (child) => child.data.name === QuestionNames.OauthClientSecret
    );

    if (
      !clientIdNode ||
      clientIdNode.data.type !== "text" ||
      typeof clientIdNode.condition !== "function"
    ) {
      assert.fail("OAuth client ID question is missing");
    }
    if (
      !clientSecretNode ||
      clientSecretNode.data.type !== "text" ||
      typeof clientSecretNode.condition !== "function"
    ) {
      assert.fail("OAuth client secret question is missing");
    }
    assert.isFalse(clientIdNode.data.required);
    assert.isFalse(clientSecretNode.data.required);
    assert.isTrue(clientSecretNode.data.password);
    assert.isTrue(
      await clientIdNode.condition({
        platform: Platform.CLI,
        [QuestionNames.ApiAuth]: "oauth",
      })
    );
    assert.isTrue(
      await clientSecretNode.condition({
        platform: Platform.CLI,
        [QuestionNames.ApiAuth]: "oauth",
        [QuestionNames.OauthPKCE]: "false",
      })
    );
    assert.isFalse(
      await clientSecretNode.condition({
        platform: Platform.CLI,
        [QuestionNames.ApiAuth]: "oauth",
        [QuestionNames.OauthPKCE]: "true",
      })
    );
    assert.isFalse(
      await clientIdNode.condition({
        platform: Platform.VSCode,
        [QuestionNames.ApiAuth]: "oauth",
      })
    );
  });

  it("SCN-ADD-AUTH-CONFIG-03: offers only an optional client ID for Entra", async () => {
    const children = addAuthActionQuestion().children ?? [];
    const clientIdNode = children.find((child) => child.data.name === QuestionNames.OauthClientId);
    const clientSecretNode = children.find(
      (child) => child.data.name === QuestionNames.OauthClientSecret
    );
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.ApiAuth]: "microsoft-entra",
    };

    if (!clientIdNode || typeof clientIdNode.condition !== "function") {
      assert.fail("OAuth client ID question is missing");
    }
    if (!clientSecretNode || typeof clientSecretNode.condition !== "function") {
      assert.fail("OAuth client secret question is missing");
    }
    assert.isTrue(await clientIdNode.condition(inputs));
    assert.isFalse(await clientSecretNode.condition(inputs));
  });

  it("apiSpecFromPluginManifestQuestion", async () => {
    const inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "test",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec1.yaml",
          },
          run_for_functions: ["function1"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec2.yaml",
          },
          run_for_functions: ["function2"],
        },
        {
          type: "LocalPlugin",
          spec: {
            local_endpoint: "spec3.yaml",
          },
        },
      ],
    });
    const apiSpecOptions = apiSpecFromPluginManifestQuestion().dynamicOptions;
    if (apiSpecOptions) {
      const options = await apiSpecOptions(inputs);
      assert.equal(options.length, 2);
    }
  });

  it("apiSpecFromPluginManifestQuestion condition: should skip", async () => {
    const inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "test",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec1.yaml",
          },
          run_for_functions: ["function1"],
        },
      ],
    });
    const condition = addAuthActionQuestion().children![0].condition;
    if (condition) {
      const res = await (condition as ConditionFunc)(inputs);
      assert.isFalse(res);
    }
  });

  it("apiSpecFromPluginManifestQuestion condition: should skip when no plugin manifest file path", async () => {
    const inputs = {
      platform: Platform.VSCode,
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec1.yaml",
          },
          run_for_functions: ["function1"],
        },
      ],
    });
    const condition = addAuthActionQuestion().children![0].condition;
    if (condition) {
      const res = await (condition as ConditionFunc)(inputs);
      assert.isFalse(res);
    }
  });

  it("apiSpecFromPluginManifestQuestion condition: should ask question", async () => {
    const inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "test",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec1.yaml",
          },
          run_for_functions: ["function1"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec2.yaml",
          },
          run_for_functions: ["function2"],
        },
        {
          type: "LocalPlugin",
          spec: {
            local_endpoint: "spec3.yaml",
          },
        },
      ],
    });
    const condition = addAuthActionQuestion().children![0].condition;
    if (condition) {
      const res = await (condition as ConditionFunc)(inputs);
      assert.isTrue(res);
    }
  });

  it("apiFromPluginManifestQuestion", async () => {
    const inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "test",
      [QuestionNames.ApiSpecLocation]: "spec.yaml",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec.yaml",
          },
          run_for_functions: ["function1"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec.yaml",
          },
          run_for_functions: ["function2"],
        },
        {
          type: "LocalPlugin",
          spec: {
            local_endpoint: "spec.yaml",
          },
        },
      ],
    });
    const apiOptions = apiFromPluginManifestQuestion().dynamicOptions;
    if (apiOptions) {
      const options = await apiOptions(inputs);
      assert.equal(options.length, 2);
    }
  });

  it("apiFromPluginManifestQuestion condition: should ask question", async () => {
    const inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "test",
      [QuestionNames.ApiSpecLocation]: "spec.yaml",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec.yaml",
          },
          run_for_functions: ["function1"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec.yaml",
          },
          run_for_functions: ["function2"],
        },
        {
          type: "LocalPlugin",
          spec: {
            local_endpoint: "spec.yaml",
          },
        },
      ],
    });
    const condition = addAuthActionQuestion().children![1].condition;
    if (condition) {
      const res = await (condition as ConditionFunc)(inputs);
      assert.isTrue(res);
    }
  });

  it("apiFromPluginManifestQuestion condition: should require selection for multiple APIs", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      [QuestionNames.PluginManifestFilePath]: "test",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: { url: "spec.yaml" },
          run_for_functions: ["function1"],
        },
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: { url: "spec.yaml" },
          run_for_functions: ["function2", "function1"],
        },
      ],
    });

    const questions = addAuthActionQuestion();
    const apiSpecCondition = questions.children![0].condition as ConditionFunc;
    const apiOperationCondition = questions.children![1].condition as ConditionFunc;
    const apiSpecResult = await apiSpecCondition(inputs);
    const apiOperationResult = await apiOperationCondition(inputs);

    assert.isFalse(apiSpecResult);
    assert.equal(inputs[QuestionNames.ApiSpecLocation], "spec.yaml");
    assert.isTrue(apiOperationResult);
    assert.isUndefined(inputs[QuestionNames.ApiOperation]);
  });

  it("apiFromPluginManifestQuestion condition: should preserve explicit APIs", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      [QuestionNames.PluginManifestFilePath]: "test",
      [QuestionNames.ApiSpecLocation]: "spec.yaml",
      [QuestionNames.ApiOperation]: ["function2"],
    };
    const readJsonSpy = vi.spyOn(fs, "readJson");

    const condition = addAuthActionQuestion().children![1].condition as ConditionFunc;
    const res = await condition(inputs);

    assert.isFalse(res);
    assert.deepEqual(inputs[QuestionNames.ApiOperation], ["function2"]);
    expect(readJsonSpy).not.toHaveBeenCalled();
  });

  it("apiFromPluginManifestQuestion condition: should skip", async () => {
    const inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: "test",
      [QuestionNames.ApiSpecLocation]: "spec.yaml",
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec.yaml",
          },
          run_for_functions: ["function1"],
        },
      ],
    });
    const condition = addAuthActionQuestion().children![1].condition;
    if (condition) {
      const res = await (condition as ConditionFunc)(inputs);
      assert.isFalse(res);
    }
  });

  it("apiFromPluginManifestQuestion condition: should skip when no plugin manifest file path", async () => {
    const inputs = {
      platform: Platform.VSCode,
    };
    vi.spyOn(fs, "readJson").mockResolvedValue({
      schema_version: "1.0",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec.yaml",
          },
          run_for_functions: ["function1"],
        },
      ],
    });
    const condition = addAuthActionQuestion().children![1].condition;
    if (condition) {
      const res = await (condition as ConditionFunc)(inputs);
      assert.isFalse(res);
    }
  });

  it("authname: validate auth name", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const validation = (
      (addAuthActionQuestion().children![2].data as TextInputQuestion)
        .additionalValidationOnAccept as FuncValidation<string>
    ).validFunc;
    const res = await validation("input", inputs);
    assert.equal(inputs[QuestionNames.ActionType], "new-api");
  });

  it("authname: should fail if no inputs when validate auth name", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const validation = (
      (addAuthActionQuestion().children![2].data as TextInputQuestion)
        .additionalValidationOnAccept as FuncValidation<string>
    ).validFunc;
    try {
      const res = await validation("input", undefined);
    } catch (error) {
      assert.equal(error.message, "inputs is undefined");
    }
  });

  it("oauthAuthorizationUrlQuestion: should throw error if no input", async () => {
    const validation = (oauthAuthorizationUrlQuestion().validation as FuncValidation<string>)
      .validFunc;
    try {
      const res = await validation("", undefined);
    } catch (error) {
      assert.equal(error.message, "Invalid URL format. Please enter a valid URL.");
    }
  });

  it("oauthAuthorizationUrlQuestion: happy path", async () => {
    const validation = (oauthAuthorizationUrlQuestion().validation as FuncValidation<string>)
      .validFunc;
    const res = await validation("https://mock-auth-url", undefined);
    assert.isUndefined(res);
  });

  it("oauthAuthorizationUrlQuestion: should throw error if not valid url", async () => {
    const validation = (oauthAuthorizationUrlQuestion().validation as FuncValidation<string>)
      .validFunc;
    try {
      const res = await validation("testUrl", undefined);
    } catch (error) {
      assert.equal(error.message, "Invalid URL format. Please enter a valid URL.");
    }
  });

  it("oauthTokenUrlQuestion: should throw error if no input", async () => {
    const validation = (oauthTokenUrlQuestion().validation as FuncValidation<string>).validFunc;
    try {
      const res = await validation("", undefined);
    } catch (error) {
      assert.equal(error.message, "Invalid URL format. Please enter a valid URL.");
    }
  });

  it("oauthTokenUrlQuestion: happy path", async () => {
    const validation = (oauthTokenUrlQuestion().validation as FuncValidation<string>).validFunc;
    const res = await validation("https://mock-token-url", undefined);
    assert.isUndefined(res);
  });

  it("oauthTokenUrlQuestion: should throw error if not valid url", async () => {
    const validation = (oauthTokenUrlQuestion().validation as FuncValidation<string>).validFunc;
    try {
      const res = await validation("testUrl", undefined);
    } catch (error) {
      assert.equal(error.message, "Invalid URL format. Please enter a valid URL.");
    }
  });

  it("oauthRefreshUrlQuestion: should not throw error if no input", async () => {
    const validation = (oauthRefreshUrlQuestion().validation as FuncValidation<string>).validFunc;
    const res = await validation("", undefined);
    assert.isUndefined(res);
  });

  it("oauthRefreshUrlQuestion: happy path", async () => {
    const validation = (oauthRefreshUrlQuestion().validation as FuncValidation<string>).validFunc;
    const res = await validation("https://mock-refresh-url", undefined);
    assert.isUndefined(res);
  });

  it("oauthRefreshUrlQuestion: should throw error if not valid url", async () => {
    const validation = (oauthRefreshUrlQuestion().validation as FuncValidation<string>).validFunc;
    try {
      const res = await validation("testUrl", undefined);
    } catch (error) {
      assert.equal(error.message, "Invalid URL format. Please enter a valid URL.");
    }
  });

  it("oauthScopeQuestion: should throw error if invalid input", async () => {
    const validation = (oauthScopeQuestion().validation as FuncValidation<string>).validFunc;
    try {
      const res = await validation("scope", undefined);
    } catch (error) {
      assert.equal(
        error.message,
        "Invalid scope format. Please enter a valid scope. Samle: scope1: description for scope1; scope2: description for scope2"
      );
    }
  });

  it("oauthScopeQuestion: happy path", async () => {
    const validation = (oauthScopeQuestion().validation as FuncValidation<string>).validFunc;
    const res = await validation(
      "api://tenant_id: description; api://clientId: description",
      undefined
    );
    assert.isUndefined(res);
  });

  it("oauthScopeCustomQuestion: happy path - single scope", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation("scope", undefined);
    assert.equal(res, undefined);
  });

  it("oauthScopeCustomQuestion: should return error if invalid input - semicolon separator", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation("scope1:desc1; scope2:desc2", undefined);
    assert.equal(res, getLocalizedString("core.createProjectQuestion.OauthScope.validation"));
  });

  it("oauthScopeCustomQuestion: should return error if invalid characters", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation("scope1@:desc1, scope2:desc2", undefined);
    assert.equal(res, getLocalizedString("core.createProjectQuestion.OauthScope.validation"));
  });

  it("oauthScopeCustomQuestion: happy path - single scope", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation("api.read", undefined);
    assert.isUndefined(res);
  });

  it("oauthScopeCustomQuestion: happy path - single scope with colon", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation("api.read:description", undefined);
    assert.isUndefined(res);
  });

  it("oauthScopeCustomQuestion: happy path - multiple scopes with comma separator", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation("api.read, api.write, user.profile", undefined);
    assert.isUndefined(res);
  });

  it("oauthScopeCustomQuestion: happy path - multiple scopes with colon and comma", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation(
      "api.read:ReadAPI, api.write:WriteAPI, user.profile:UserProfile",
      undefined
    );
    assert.isUndefined(res);
  });

  it("oauthScopeCustomQuestion: happy path - complex scopes with various characters", async () => {
    const validation = (oauthScopeCustomQuestion().validation as FuncValidation<string>).validFunc;
    const res = validation(
      "api/read-write:ReadAndWrite, user_profile.access:UserProfileAccess",
      undefined
    );
    assert.isUndefined(res);
  });

  it("oauthScopeCustomQuestion: additionalValidationOnAccept should set environment variable", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const additionalValidation = (
      oauthScopeCustomQuestion().additionalValidationOnAccept as FuncValidation<string>
    ).validFunc;
    const testScope = "api.read, api.write";

    // Clear any existing environment variable
    delete process.env[QuestionNames.OAuthScope];

    const res = additionalValidation(testScope, inputs);
    assert.isUndefined(res);
    assert.equal(process.env[QuestionNames.OAuthScope], testScope);
  });

  it("oauthScopeCustomQuestion: additionalValidationOnAccept should throw error if no inputs", async () => {
    const additionalValidation = (
      oauthScopeCustomQuestion().additionalValidationOnAccept as FuncValidation<string>
    ).validFunc;
    try {
      const res = additionalValidation("api.read", undefined);
    } catch (error) {
      assert.equal((error as Error).message, "inputs is undefined");
    }
  });

  it("authNameQuestion: should throw error if no input", async () => {
    const validation = (authNameQuestion().validation as FuncValidation<string>).validFunc;
    const res = await validation("", undefined);
    assert.equal(res, "Auth name cannot be empty.");
  });

  it("authNameQuestion: happy path", async () => {
    const validation = (authNameQuestion().validation as FuncValidation<string>).validFunc;
    const res = await validation("test", undefined);
    assert.isUndefined(res);
  });
});

describe("setSensitivityLabelNode", () => {
  const sandbox = vi;
  setTools({
    tokenProvider: {
      m365TokenProvider: {
        getAccessToken: async () => {
          return ok("mockToken");
        },
      },
    },
  } as any);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should have correct structure", () => {
    const node = setSensitivityLabelNode();
    assert.isTrue(node.data.type === "group");
    assert.isTrue(node.children?.length === 2);
  });

  it("list sensitivity label happy path", async () => {
    const node = setSensitivityLabelNode();
    const sensitivityLabelQuestion = node.children?.[1].data as SingleSelectQuestion;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const mockLabels = [
      { id: "1", displayName: "Label1" },
      { id: "2", displayName: "Label2" },
    ];
    vi.spyOn(GraphClient.prototype, "listSensitivityLabels").mockResolvedValue(ok(mockLabels));
    // mock token provider
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mockToken")
    );
    const options = await sensitivityLabelQuestion?.dynamicOptions?.(inputs);
    assert.equal(options?.length, 2);
    assert.equal((options?.[0] as any).id, "1");
    assert.equal((options?.[0] as any).label, "Label1");
  });

  it("list sensitivity label - empty label", async () => {
    const node = setSensitivityLabelNode();
    const sensitivityLabelQuestion = node.children?.[1].data as SingleSelectQuestion;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const mockLabels = [{}, {}] as unknown as SensitivityLabel[];
    vi.spyOn(GraphClient.prototype, "listSensitivityLabels").mockResolvedValue(ok(mockLabels));
    // mock token provider
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mockToken")
    );
    const options = await sensitivityLabelQuestion?.dynamicOptions?.(inputs);
    assert.equal(options?.length, 2);
    assert.equal((options?.[0] as any).id, "");
    assert.equal((options?.[0] as any).label, "");
  });

  it("throw graphAPI exception", async () => {
    const node = setSensitivityLabelNode();
    const sensitivityLabelQuestion = node.children?.[1].data as SingleSelectQuestion;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    vi.spyOn(GraphClient.prototype, "listSensitivityLabels").mockImplementation(() => {
      throw new Error("Graph API error");
    });
    // mock token provider
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mockToken")
    );
    let exception = undefined;
    try {
      await sensitivityLabelQuestion?.dynamicOptions?.(inputs);
    } catch (e) {
      exception = e;
    }
    assert.isTrue((exception as any).message.includes("Graph API error"));
  });

  it("throw token error", async () => {
    const node = setSensitivityLabelNode();
    const sensitivityLabelQuestion = node.children?.[1].data as SingleSelectQuestion;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(new SystemError("TestSource", "TestError", "Test error message"))
    );
    const mockLabels = [
      { id: "1", displayName: "Label1" },
      { id: "2", displayName: "Label2" },
    ];
    vi.spyOn(GraphClient.prototype, "listSensitivityLabels").mockResolvedValue(ok(mockLabels));

    let exception = undefined;
    try {
      await sensitivityLabelQuestion?.dynamicOptions?.(inputs);
    } catch (e) {
      exception = e;
    }
    assert.isTrue((exception as any).message.includes("Test error message"));
  });

  it("throw list sensitivity label error", async () => {
    const node = setSensitivityLabelNode();
    const sensitivityLabelQuestion = node.children?.[1].data as SingleSelectQuestion;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    vi.spyOn(GraphClient.prototype, "listSensitivityLabels").mockResolvedValue(
      err(
        new SystemError({
          name: "TestError",
          message: "Test error message",
          source: "TestSource",
        })
      )
    );
    let exception = undefined;
    try {
      await sensitivityLabelQuestion?.dynamicOptions?.(inputs);
    } catch (e) {
      exception = e;
    }
    assert.isTrue((exception as any).message.includes("Test error message"));
  });

  it("should return the correct default path for selectDeclarativeAgentManifestQuestion - CLI_HELP", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI_HELP,
      projectPath: "./testProject",
    };
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.equal(defaultPath, "./appPackage/declarativeAgent.json");
  });

  it("should return the correct default path for selectDeclarativeAgentManifestQuestion", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./testProject",
    };
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        copilotAgents: {
          declarativeAgents: [
            {
              file: "agent.json",
            },
          ],
        },
      } as TeamsAppManifest)
    );
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.equal(defaultPath, path.join(inputs.projectPath!, AppPackageFolderName, "agent.json"));
  });

  it("should return undefined if projectPath is not defined for selectDeclarativeAgentManifestQuestion", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.isUndefined(defaultPath);
  });

  it("should return undefined if manifest path does not exist for selectDeclarativeAgentManifestQuestion", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./nonExistentProject",
    };
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.isUndefined(defaultPath);
  });

  it("should return undefined if manifest does not contain DA for selectDeclarativeAgentManifestQuestion", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./testProject",
    };
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok({} as any));
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.isUndefined(defaultPath);
  });

  it("should return error if failed to read manifest for selectDeclarativeAgentManifestQuestion", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./testProject",
    };
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      err(new SystemError("TestError", "Test error message", "TestSource"))
    );
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.isUndefined(defaultPath);
  });

  it("should return error if declarativeAgentManifest path does not exist", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./testProject",
    };
    vi.spyOn(fs, "pathExistsSync").mockImplementation((path: string) => {
      if (path.includes("manifest")) {
        return true;
      }
      return false;
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        copilotAgents: {
          declarativeAgents: [
            {
              file: "agent.json",
            },
          ],
        },
      } as TeamsAppManifest)
    );
    const question = selectDeclarativeAgentManifestQuestion() as SingleFileQuestion;
    const defaultPath = await ((question?.default as any)(inputs) as Promise<string | undefined>);
    assert.isUndefined(defaultPath);
  });
});

describe("addSkillQuestionNode", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return a group node with 6 children", () => {
    const node = addSkillQuestionNode();
    assert.equal(node.data.type, "group");
    assert.equal(node.children?.length, 6);
  });

  it("skillNameQuestion child should have condition checking SkillFrom", () => {
    const node = addSkillQuestionNode();
    const nameChild = node.children![2];
    assert.isDefined(nameChild.condition);
    const conditionFn = nameChild.condition as ConditionFunc;
    // When SkillFrom is set, condition should be false (skip the question)
    const inputsWithFrom: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.SkillFrom]: "some/path",
    };
    assert.isFalse(conditionFn(inputsWithFrom));
    // When SkillFrom is not set, condition should be true
    const inputsWithoutFrom: Inputs = { platform: Platform.VSCode };
    assert.isTrue(conditionFn(inputsWithoutFrom));
  });

  it("skillNameQuestion validates invalid pattern", () => {
    const node = addSkillQuestionNode();
    const nameChild = node.children![2];
    const question = nameChild.data as TextInputQuestion;
    const validFunc = (question.validation as FuncValidation<string>).validFunc;
    // Invalid: starts with number
    const result1 = validFunc("1abc", {} as Inputs);
    assert.isDefined(result1);
    // Invalid: contains spaces
    const result2 = validFunc("my skill", {} as Inputs);
    assert.isDefined(result2);
    // Invalid: contains underscores
    const result3 = validFunc("my_skill", {} as Inputs);
    assert.isDefined(result3);
    // Valid: starts with letter, alphanumeric + hyphens
    const result4 = validFunc("my-skill", {} as Inputs);
    assert.isUndefined(result4);
    // Valid: single letter
    const result5 = validFunc("a", {} as Inputs);
    assert.isUndefined(result5);
  });

  it("skillNameQuestion validates duplicate skill directory", () => {
    const node = addSkillQuestionNode();
    const nameChild = node.children![2];
    const question = nameChild.data as TextInputQuestion;
    const validFunc = (question.validation as FuncValidation<string>).validFunc;

    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "/test/project",
    };
    const result = validFunc("existing-skill", inputs);
    assert.isDefined(result);
  });

  it("skillNameQuestion skips duplicate check without projectPath", () => {
    const node = addSkillQuestionNode();
    const nameChild = node.children![2];
    const question = nameChild.data as TextInputQuestion;
    const validFunc = (question.validation as FuncValidation<string>).validFunc;
    // No projectPath — should only validate pattern, not duplicates
    const result = validFunc("valid-name", {} as Inputs);
    assert.isUndefined(result);
  });

  it("skillNameQuestion uses custom ManifestPath when provided", () => {
    const node = addSkillQuestionNode();
    const nameChild = node.children![2];
    const question = nameChild.data as TextInputQuestion;
    const validFunc = (question.validation as FuncValidation<string>).validFunc;

    const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "/test/project",
      [QuestionNames.ManifestPath]: "/test/project/custom/manifest.json",
    };
    const result = validFunc("my-skill", inputs);
    assert.isUndefined(result);
    // Verify it checked the correct path using custom manifest location
    expect(pathExistsStub).toHaveBeenCalledWith(
      path.join("/test/project/custom", "skills", "my-skill")
    );
  });

  it("skillDescriptionQuestion child should have condition checking SkillFrom", () => {
    const node = addSkillQuestionNode();
    const descChild = node.children![3];
    assert.isDefined(descChild.condition);
    const conditionFn = descChild.condition as ConditionFunc;
    const inputsWithFrom: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.SkillFrom]: "some/path",
    };
    assert.isFalse(conditionFn(inputsWithFrom));
  });
});
