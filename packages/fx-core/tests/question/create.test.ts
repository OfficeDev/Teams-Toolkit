// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  ApiOperation,
  AppPackageFolderName,
  Context,
  FuncValidation,
  Inputs,
  LogProvider,
  OptionItem,
  Platform,
  TokenProvider,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as path from "path";
import * as utils from "../../src/common/globalVars";
import { setTools } from "../../src/common/globalVars";
import { getLocalizedString } from "../../src/common/localizeUtils";
import { OneDriveSharePointItemType } from "../../src/component/generator/constant";
import * as generatorHelper from "../../src/component/generator/declarativeAgent/helper";
import * as oneDriveSharePointHandler from "../../src/component/generator/declarativeAgent/oneDriveSharePointHandler";
import {
  ActionNotFoundError,
  DeclarativeAgentPathNotFoundError,
  EmptyOptionError,
  FileNotFoundError,
  OriginalSpecNotFoundError,
  SpecNotFoundError,
  UserCancelError,
} from "../../src/error";
import * as createQuestionDeps from "../../src/question/create";

import { assert, vi } from "vitest";
import { manifestUtils } from "../../src";
import { pluginManifestUtils } from "../../src/component/driver/teamsApp/utils/PluginManifestUtils";
import * as daHelper from "../../src/component/generator/declarativeAgent/helper";
import {
  ActionStartOptions,
  ApiAuthOptions,
  DeclarativeAgentApiSpecOptionId,
  GCNameQuestion,
  MeArchitectureOptions,
  QuestionNames,
  apiAuthQuestion,
  apiOperationQuestion,
  apiPluginStartQuestion,
  apiSpecFileQuestion,
  apiSpecLocationQuestion,
  apiSpecTypeSelectQuestion,
  apiSpecUrlQuestion,
  appNameQuestion,
  folderQuestion,
  getSolutionName,
  getTabWebsiteOptions,
  oneDriveSharePointItemQuestion,
  pluginManifestQuestion,
  selectApiOperationForRegenerateQuestion,
  selectExistingPluginManifestQuestion,
  selectOpenAPISpecFromPluginQuestion,
  webContentQuestion,
} from "../../src/question";
import { DACapabilityOptions } from "../../src/question/scaffold/vsc/CapabilityOptions";
import { MockTools, MockUserInteraction, randomAppName } from "../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../plugins/solution/util";

describe("scaffold question", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe("appNameQuestion", () => {
    const question = appNameQuestion();
    const validFunc = (question.validation as FuncValidation<string>).validFunc;
    it("happy path", async () => {
      const inputs: Inputs = { platform: Platform.VSCode, folder: "./" };
      const appName = "1234";
      let validRes = await validFunc(appName, inputs);
      assert.isTrue(validRes === getLocalizedString("core.QuestionAppName.validation.pattern"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      inputs.appName = randomAppName();
      inputs.folder = "./";
      validRes = await validFunc(inputs.appName, inputs);
      const expected = getLocalizedString(
        "core.QuestionAppName.validation.pathExist",
        path.resolve(inputs.folder, inputs.appName)
      );
      assert.equal(validRes, expected);
      vi.restoreAllMocks();
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      validRes = await validFunc(inputs.appName, inputs);
      assert.isTrue(validRes === undefined);
    });

    it("app name has 25 length - VSC", async () => {
      const mockedUI = new MockedUserInteraction();
      vi.spyOn(createQuestionDeps.createQuestionDeps, "createContext").mockReturnValue({
        userInteraction: mockedUI,
      } as Context);
      const showMessageStub = vi.spyOn(mockedUI, "showMessage");

      const input = "abcdefghijklmnopqrstuvwxy";
      await validFunc(input, { platform: Platform.VSCode });

      assert.isTrue(showMessageStub.mock.calls.length === 1);
    });

    it("app name has 25 length - VS", async () => {
      const mockedLogProvider = new MockedLogProvider();
      vi.spyOn(createQuestionDeps.createQuestionDeps, "createContext").mockReturnValue({
        logProvider: mockedLogProvider as LogProvider,
      } as Context);
      const warningStub = vi.spyOn(mockedLogProvider, "warning");

      const input = "abcdefghijklmnopqrstuvwxy";
      await validFunc(input, { platform: Platform.VS });

      assert.isTrue(warningStub.mock.calls.length === 1);

      await validFunc(input);

      assert.isTrue(warningStub.mock.calls.length === 2);
    });

    it("app name exceed maxlength of 30", async () => {
      const input = "SurveyMonkeyWebhookNotification";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.maxlength"));
    });

    it("app name with only letters", async () => {
      const input = "app";
      const result = await validFunc(input);

      assert.isUndefined(result);
    });

    it("app name starting with digit", async () => {
      const input = "123app";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });

    it("app name count of alphanumerics less than 2", async () => {
      const input = "a..(";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });

    it("app name containing dot", async () => {
      const input = "app.123";
      const result = await validFunc(input);

      assert.isUndefined(result);
    });

    it("app name containing hyphen", async () => {
      const input = "app-123";
      const result = await validFunc(input);

      assert.isUndefined(result);
    });

    it("app name containing multiple special characters", async () => {
      const input = "a..(1";
      const result = await validFunc(input);

      assert.isUndefined(result);
    });

    it("app name containing space", async () => {
      const input = "app 123";
      const result = await validFunc(input);

      assert.isUndefined(result);
    });

    it("app name containing dot at the end - wrong pattern", async () => {
      const input = "app.app.";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });

    it("app name containing space at the end - wrong pattern", async () => {
      const input = "app123 ";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });

    it("app name containing invalid control code", async () => {
      const input = "a\u0001a";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });

    it("app name containing invalid character", async () => {
      const input = "app<>123";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });

    it("invalid app name containing &", async () => {
      const input = "app&123";
      const result = await validFunc(input);

      assert.equal(result, getLocalizedString("core.QuestionAppName.validation.pattern"));
    });
  });

  describe("folderQuestion", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("should find taskpane template", () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
      };
      const question = folderQuestion() as any;
      const title = question.title(inputs);
      const defaultV = question.default(inputs);
      assert.equal(title, "Directory where the project folder will be created in");
      assert.equal(defaultV, "./");
    });
  });

  describe("getSolutionName", () => {
    const sandbox = vi;
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy path", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({
        "@microsoft/generator-sharepoint": {
          solutionName: "testSolutionName",
        },
      });
      const res = await getSolutionName("");
      assert.equal(res, "testSolutionName");
    });

    it("FileNotFoundError", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      try {
        await getSolutionName(".");
        assert.fail("should throw");
      } catch (e) {
        assert.isTrue(e instanceof FileNotFoundError);
      }
    });

    it("undefined", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({});
      const res = await getSolutionName("");
      assert.isUndefined(res);
    });
  });

  describe("api plugin auth question", () => {
    const ui = new MockUserInteraction();
    let mockedEnvRestore: RestoreFn;
    const tools = new MockTools();
    setTools(tools);
    beforeEach(() => {
      mockedEnvRestore = mockedEnv({});
    });

    afterEach(() => {
      if (mockedEnvRestore) {
        mockedEnvRestore();
      }
    });
    it("api message extension", async () => {
      const question = apiAuthQuestion();
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      inputs[QuestionNames.MeArchitectureType] = MeArchitectureOptions.newApi().id;
      assert.isDefined(question.dynamicOptions);
      if (question.dynamicOptions) {
        const options = (await question.dynamicOptions(inputs)) as OptionItem[];
        assert.deepEqual(options, [
          ApiAuthOptions.none(),
          ApiAuthOptions.bearerToken(),
          ApiAuthOptions.microsoftEntra(),
        ]);
      }
    });

    it("api plugin from scratch with auth enabled", async () => {
      const question = apiAuthQuestion();
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      inputs[QuestionNames.ActionType] = ActionStartOptions.newApi().id;
      assert.isDefined(question.dynamicOptions);
      if (question.dynamicOptions) {
        const options = (await question.dynamicOptions(inputs)) as OptionItem[];
        assert.deepEqual(options, [
          ApiAuthOptions.none(),
          ApiAuthOptions.apiKey(),
          ApiAuthOptions.microsoftEntra(),
          ApiAuthOptions.oauth(),
        ]);
      }
    });

    it("api plugin from add action with auth enabled", async () => {
      const question = apiAuthQuestion(true);
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      inputs[QuestionNames.ActionType] = ActionStartOptions.newApi().id;
      assert.isDefined(question.dynamicOptions);
      if (question.dynamicOptions) {
        const options = (await question.dynamicOptions(inputs)) as OptionItem[];
        assert.deepEqual(options, [
          ApiAuthOptions.apiKey(),
          ApiAuthOptions.microsoftEntra(),
          ApiAuthOptions.oauth(),
        ]);
      }
    });
  });
  describe("api plugin auth question (AAD disabled)", () => {
    let mockedEnvRestore: RestoreFn;
    const tools = new MockTools();
    setTools(tools);
    beforeEach(() => {
      mockedEnvRestore = mockedEnv({});
    });

    afterEach(() => {
      if (mockedEnvRestore) {
        mockedEnvRestore();
      }
    });

    it("api plugin from scratch without AAD enabled", async () => {
      const question = apiAuthQuestion();
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      inputs[QuestionNames.ActionType] = ActionStartOptions.newApi().id;
      assert.isDefined(question.dynamicOptions);
      if (question.dynamicOptions) {
        const options = (await question.dynamicOptions(inputs)) as OptionItem[];
        assert.deepEqual(options, [
          ApiAuthOptions.none(),
          ApiAuthOptions.apiKey(),
          ApiAuthOptions.microsoftEntra(),
          ApiAuthOptions.oauth(),
        ]);
      }
    });
  });

  describe("add knowledge", () => {
    const tools = new MockTools();
    setTools(tools);
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("Web Content", () => {
      it("happy path", async () => {
        const question = webContentQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("https://test.com", inputs);
        assert.isUndefined(res);
      });

      it("happy path", async () => {
        const question = webContentQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("https://test.com", inputs);
        assert.isUndefined(res);
      });

      it("error path: invalid url", async () => {
        const question = webContentQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("fakeUrl", inputs);
        assert.equal(res, "Invalid web content. Please provide a valid URL.");
      });

      it("error path: no inputs", async () => {
        const question = webContentQuestion();

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        try {
          await validationSchema.validFunc?.("http://fakeUrl.com", undefined);
          assert.fail("Should throw error");
        } catch (err) {
          assert.isNotNull(err);
        }
      });
    });

    describe("OneDrive & SharePoint get ODSP item ", () => {
      it("happy path: site", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        const fakeAxiosInstance = axios.create();
        vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
        const axiosGetStub = vi.spyOn(fakeAxiosInstance, "get");
        axiosGetStub.mockResolvedValueOnce({
          status: 200,
          data: {
            id: "fakeId",
            name: "fakeName",
            sharepointIds: {
              webId: "fakeWebId",
              siteId: "fakeSiteId",
            },
          },
        });

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("https://test.com", inputs);
        assert.deepEqual(inputs.oneDriveSharePointItem, [
          {
            id: "fakeId",
            name: "fakeName",
            siteId: "fakeSiteId",
            webId: "fakeWebId",
          },
        ]);
        assert.isUndefined(res);
      });

      it("happy path: drive", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        const fakeAxiosInstance = axios.create();
        vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
        const axiosGetStub = vi.spyOn(fakeAxiosInstance, "get");
        axiosGetStub.mockResolvedValueOnce(
          err(new UserError("fakeError", "fakeError", "fakeError", "fakeError"))
        );
        axiosGetStub.mockResolvedValueOnce({
          status: 200,
          data: {
            id: "fakeId",
            name: "fakeName",
            sharepointIds: {
              listItemUniqueId: "fakeUniqueId",
              listId: "fakeListId",
              webId: "fakeWebId",
              siteId: "fakeSiteId",
            },
            webUrl: "fakeWebUrl",
            file: "fakeFile",
          },
        });

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("https://test.com", inputs);
        assert.deepEqual(inputs.oneDriveSharePointItem, [
          {
            id: "fakeId",
            itemType: OneDriveSharePointItemType.File,
            listId: "fakeListId",
            name: "fakeName",
            siteId: "fakeSiteId",
            uniqueId: "fakeUniqueId",
            webId: "fakeWebId",
          },
        ]);
        assert.isUndefined(res);
      });

      it("error path: invalid input url", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("", inputs);
        assert.equal(res, "Please input a valid URL");
      });

      it("error path: no item url", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("", inputs);
        assert.equal(res, "Please input a valid URL");
      });

      it("error path: graph client result error", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
          err(new UserError("fakeError", "fakeError", "fakeError", "fakeError"))
        );

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("http://fakeUrl.com", inputs);
        assert.isNotNull(res);
      });

      it("error path: no inputs", async () => {
        const question = oneDriveSharePointItemQuestion();

        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        try {
          await validationSchema.validFunc?.("http://fakeUrl.com", undefined);
          assert.fail("Should throw error");
        } catch (err) {
          assert.isNotNull(err);
        }
      });

      it("error path: axios error", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        const config: InternalAxiosRequestConfig = {
          url: "/test",
          method: "get",
          headers: new axios.AxiosHeaders({
            "Content-Type": "application/json",
          }),
          baseURL: "https://test.com",
          timeout: 1000,
        };

        const request = {};
        const response: AxiosResponse = {
          data: { message: "Fake error" },
          status: 500,
          statusText: "Fake error",
          headers: {},
          config: config,
          request: request,
        };
        vi.spyOn(oneDriveSharePointHandler, "createGraphClientWithToken").mockImplementation(() => {
          throw new AxiosError("fake error", "FAKE_ERROR", config, request, response);
        });
        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("https://test.com", inputs);
        assert.isNotNull(res);
      });

      it("error path: non-axios error", async () => {
        const question = oneDriveSharePointItemQuestion();
        const inputs: Inputs = {
          platform: Platform.VSCode,
        };
        vi.spyOn(oneDriveSharePointHandler, "createGraphClientWithToken").mockImplementation(() => {
          throw new UserError("test", "test", "test", "test");
        });
        const validationSchema = question.additionalValidationOnAccept as FuncValidation<string>;
        const res = await validationSchema.validFunc?.("https://test.com", inputs);
        assert.isNotNull(res);
      });
    });

    describe("Copilot connectors", () => {
      it("happy path", async () => {
        const fakeAxiosInstance = axios.create();
        vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
        const axiosGetStub = vi.spyOn(fakeAxiosInstance, "get");
        axiosGetStub.mockResolvedValueOnce({
          status: 200,
          data: {
            value: [
              {
                id: "fakeId",
                name: "fakeName",
              },
            ],
          },
        });
        const res = await generatorHelper.getGraphConnectors();
        assert.equal(res[0].id, "fakeId");
        assert.equal(res[0].label, "fakeId");
      });

      it("getAccessToken error", async () => {
        vi.spyOn(utils, "createContext").mockReturnValue({
          tokenProvider: {
            m365TokenProvider: {
              getAccessToken: async () => {
                return Promise.resolve(err(new Error("fakeError")));
              },
            },
          } as unknown as TokenProvider,
        } as Context);
        try {
          await generatorHelper.getGraphConnectors();
          assert.fail("Should throw error");
        } catch (error) {
          assert.isNotNull(error);
        }
      });

      it("api error", async () => {
        const fakeAxiosInstance = axios.create();
        vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
        const axiosGetStub = vi.spyOn(fakeAxiosInstance, "get");
        axiosGetStub.mockRejectedValueOnce({
          status: 404,
          error: "fakeError",
        });
        axiosGetStub.mockRejectedValueOnce(new Error("fakeError"));
        try {
          await generatorHelper.getGraphConnectors();
          assert.fail("Should throw error");
        } catch (error) {
          assert.isNotNull(error);
        }

        try {
          await generatorHelper.getGraphConnectors();
          assert.fail("Should throw error");
        } catch (error) {
          assert.isNotNull(error);
        }
      });

      it("api 403 error", async () => {
        const fakeAxiosInstance = axios.create();
        vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
        const axiosGetStub = vi.spyOn(fakeAxiosInstance, "get");
        axiosGetStub.mockRejectedValueOnce({
          response: {
            status: 403,
            error: "fakeError",
          },
        });
        try {
          await generatorHelper.getGraphConnectors();
          assert.fail("Should throw error");
        } catch (error) {
          assert.isNotNull(error);
        }
      });
    });
  });

  describe("apiOperationQuestion", () => {
    it("includeExistingAPIs = false", async () => {
      const question = apiOperationQuestion(false);
      if (question.placeholder) {
        const placeholder =
          typeof question.placeholder === "function"
            ? question.placeholder({} as any)
            : question.placeholder;
        assert.equal(
          placeholder,
          getLocalizedString(
            "core.createProjectQuestion.apiSpec.operation.placeholder.skipExisting"
          )
        );
      }
    });
  });
  describe("apiPluginStartQuestion", () => {
    it("Capability === DACapabilityOptions.declarativeAgent().id", async () => {
      const question = apiPluginStartQuestion(false);
      const title =
        typeof question.title === "function"
          ? question.title({
              [QuestionNames.Capabilities]: DACapabilityOptions.declarativeAgent().id,
            } as any)
          : question.title;
      assert.equal(title, getLocalizedString("core.createProjectQuestion.addApiPlugin.title"));
      const placeholder =
        typeof question.placeholder === "function"
          ? question.placeholder({
              [QuestionNames.Capabilities]: DACapabilityOptions.declarativeAgent().id,
            } as any)
          : question.placeholder;
      assert.equal(
        placeholder,
        getLocalizedString("template.createProjectQuestion.addApiPlugin.placeholder")
      );
    });
    it("doesProjectExists = true", async () => {
      const question = apiPluginStartQuestion(true);
      const title =
        typeof question.title === "function" ? question.title({} as any) : question.title;
      assert.equal(title, getLocalizedString("core.createProjectQuestion.addApiPlugin.title"));
    });
    it("doesProjectExists = false", async () => {
      const question = apiPluginStartQuestion(false);
      const title =
        typeof question.title === "function" ? question.title({} as any) : question.title;
      assert.equal(
        title,
        getLocalizedString("template.createProjectQuestion.createApiPlugin.title")
      );
    });
  });

  describe("GCNameQuestion", () => {
    it("happy", async () => {
      const question = GCNameQuestion();
      if ((question.additionalValidationOnAccept as any).validFunc) {
        const res = (question.additionalValidationOnAccept as any).validFunc("test", {} as any);
        assert.isUndefined(res);
      }
      if ((question.validation as any).validFunc) {
        const res = (question.validation as any).validFunc("test", {} as any);
        assert.isUndefined(res);
      }
    });
  });

  describe("getTabWebsiteOptions", () => {
    it("happy", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        teamsAppFromTdp: {
          staticTabs: [
            {
              name: "tabname",
              websiteUrl: "https://example.com", // Provide a valid URL for the test
            },
          ],
        },
      };
      const options = getTabWebsiteOptions(inputs);
      assert.equal(options.length, 1);
    });
    it("empty tab", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        teamsAppFromTdp: {
          staticTabs: [],
        },
      };
      const options = getTabWebsiteOptions(inputs);
      assert.equal(options.length, 0);
    });
  });

  describe("pluginManifestQuestion", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("readPluginManifestFile fail", async () => {
      vi.spyOn(pluginManifestUtils, "readPluginManifestFile").mockResolvedValue(
        err(new UserCancelError())
      );
      const question = pluginManifestQuestion();
      const validFunc = (question.validation as any).validFunc;
      const res = validFunc("test", {} as any);
      assert.isDefined(res);
    });
    it("validateSourcePluginManifest fail", async () => {
      vi.spyOn(pluginManifestUtils, "readPluginManifestFile").mockResolvedValue(ok({} as any));
      vi.spyOn(daHelper, "validateSourcePluginManifest").mockReturnValue(
        err(new UserCancelError())
      );
      const question = pluginManifestQuestion();
      const validFunc = (question.validation as any).validFunc;
      const res = validFunc("test", {} as any);
      assert.isDefined(res);
    });
  });

  describe("selectExistingPluginManifestQuestion", () => {
    const sandbox = vi;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("dynamicOptions: should throw error when projectPath is undefined", async () => {
      const question = selectExistingPluginManifestQuestion();
      try {
        await question.dynamicOptions!({} as any);
        assert.fail("Should throw error");
      } catch (e) {
        assert.equal((e as Error).message, "projectPath is undefined");
      }
    });

    it("dynamicOptions: should throw error when manifest read fails", async () => {
      const question = selectExistingPluginManifestQuestion();
      const inputs = { projectPath: "test-path" };
      const error = new Error("manifest read error");

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(err(error as any));

      try {
        await question.dynamicOptions!(inputs as any);
        assert.fail("Should throw error");
      } catch (e) {
        assert.equal(e, error);
      }
    });

    it("dynamicOptions: should throw DeclarativeAgentPathNotFoundError when no agent path", async () => {
      const question = selectExistingPluginManifestQuestion();
      const inputs = { projectPath: "test-path" };
      const manifest = {};

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest as any));

      try {
        await question.dynamicOptions!(inputs as any);
        assert.fail("Should throw DeclarativeAgentPathNotFoundError");
      } catch (e) {
        assert.isTrue(e instanceof DeclarativeAgentPathNotFoundError);
      }
    });

    it("dynamicOptions: should throw ActionNotFoundError when no actions", async () => {
      const question = selectExistingPluginManifestQuestion();
      const inputs = { projectPath: "test-path" };
      const manifest = {
        copilotAgents: {
          declarativeAgents: [{ file: "agent.json" }],
        },
      };
      const agentJson = {};

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest as any));
      vi.spyOn(fs, "readJSON").mockResolvedValue(agentJson);

      try {
        await question.dynamicOptions!(inputs as any);
        assert.fail("Should throw ActionNotFoundError");
      } catch (e) {
        assert.isTrue(e instanceof ActionNotFoundError);
      }
    });

    it("dynamicOptions: should throw ActionNotFoundError when actions is empty array", async () => {
      const question = selectExistingPluginManifestQuestion();
      const inputs = { projectPath: "test-path" };
      const manifest = {
        copilotAgents: {
          declarativeAgents: [{ file: "agent.json" }],
        },
      };
      const agentJson = { actions: [] };

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest as any));
      vi.spyOn(fs, "readJSON").mockResolvedValue(agentJson);

      try {
        await question.dynamicOptions!(inputs as any);
        assert.fail("Should throw ActionNotFoundError");
      } catch (e) {
        assert.isTrue(e instanceof ActionNotFoundError);
      }
    });

    it("dynamicOptions: should return options for valid actions", async () => {
      const question = selectExistingPluginManifestQuestion();
      const inputs = { projectPath: "test-path" };
      const manifest = {
        copilotAgents: {
          declarativeAgents: [{ file: "agent.json" }],
        },
      };
      const agentJson = {
        actions: [
          { file: "action1.json", id: "action1" },
          { file: "action2.json", id: "action2" },
        ],
      };

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest as any));
      vi.spyOn(fs, "readJSON").mockResolvedValue(agentJson);

      const result: any = await question!.dynamicOptions!(inputs as any);

      assert.equal(result.length, 2);
      assert.equal(result[0].id, path.join("test-path", AppPackageFolderName, "action1.json"));
      assert.equal(result[0].label, "action1.json");
      assert.equal(result[0].data, "action1");
      assert.equal(result[1].id, path.join("test-path", AppPackageFolderName, "action2.json"));
      assert.equal(result[1].label, "action2.json");
      assert.equal(result[1].data, "action2");
    });

    it("onDidSelection: should set SelectPluginId input", () => {
      const question = selectExistingPluginManifestQuestion();
      const inputs: any = {};
      const item: OptionItem = {
        id: "item-id",
        label: "item-label",
        data: "action-id",
      };

      question.onDidSelection!(item, inputs);

      assert.equal(inputs[QuestionNames.SelectPluginId], "action-id");
    });

    it("should have correct properties", () => {
      const question = selectExistingPluginManifestQuestion();

      assert.equal(question.type, "singleSelect");
      assert.equal(question.name, QuestionNames.SelectPluginManifest);
      assert.equal(question.title, "Select plugin manifest file.");
      assert.equal(question.cliDescription, "Select plugin manifest file.");
      assert.deepEqual(question.staticOptions, []);
      assert.isFunction(question.onDidSelection);
      assert.isFunction(question.dynamicOptions);
    });
  });

  describe("selectOpenAPISpecFromPluginQuestion", () => {
    const sandbox = vi;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should have correct properties", () => {
      const question = selectOpenAPISpecFromPluginQuestion();

      assert.equal(question.type, "singleSelect");
      assert.equal(question.name, QuestionNames.SelectOpenAPISpecFromPlugin);
      assert.equal(question.title, "Select OpenAPI description document file.");
      assert.deepEqual(question.staticOptions, []);
      assert.isFunction(question.onDidSelection);
      assert.isFunction(question.dynamicOptions);
    });

    it("onDidSelection: should set ActionType to DeclarativeAgentApiSpecOptionId", () => {
      const question = selectOpenAPISpecFromPluginQuestion();
      const inputs: any = {};
      const item: OptionItem = {
        id: "item-id",
        label: "item-label",
      };

      question.onDidSelection!(item, inputs);

      assert.equal(inputs[QuestionNames.ActionType], DeclarativeAgentApiSpecOptionId);
    });

    it("dynamicOptions: should return options for valid plugin manifest with specs", async () => {
      const question = selectOpenAPISpecFromPluginQuestion();
      const manifestPath = "test-path/plugin.json";
      const inputs: any = {
        [QuestionNames.SelectPluginManifest]: manifestPath,
      };

      const pluginManifest = {
        runtimes: [
          {
            spec: {
              url: "spec1.json",
            },
            run_for_functions: ["function1", "function2"],
          },
          {
            spec: {
              url: "spec2.json",
            },
            run_for_functions: ["function3"],
          },
        ],
      };

      vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);

      const result: any = await question.dynamicOptions!(inputs);

      assert.equal(result.length, 2);
      assert.equal(result[0].id, path.join(path.dirname(manifestPath), "spec1.json"));
      assert.equal(result[0].label, "spec1.json");
      assert.equal(result[1].id, path.join(path.dirname(manifestPath), "spec2.json"));
      assert.equal(result[1].label, "spec2.json");
    });

    it("dynamicOptions: should combine specs with same URL", async () => {
      const question = selectOpenAPISpecFromPluginQuestion();
      const manifestPath = "test-path/plugin.json";
      const inputs: any = {
        [QuestionNames.SelectPluginManifest]: manifestPath,
      };

      const pluginManifest = {
        runtimes: [
          {
            spec: {
              url: "spec1.json",
            },
            run_for_functions: ["function1"],
          },
          {
            spec: {
              url: "spec1.json",
            },
            run_for_functions: ["function2"],
          },
        ],
      };

      vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);

      const result: any = await question.dynamicOptions!(inputs);

      assert.equal(result.length, 1);
      assert.equal(result[0].id, path.join(path.dirname(manifestPath), "spec1.json"));
      assert.equal(result[0].label, "spec1.json");
    });

    it("dynamicOptions: should handle runtimes without run_for_functions", async () => {
      const question = selectOpenAPISpecFromPluginQuestion();
      const manifestPath = "test-path/plugin.json";
      const inputs: any = {
        [QuestionNames.SelectPluginManifest]: manifestPath,
      };

      const pluginManifest = {
        runtimes: [
          {
            spec: {
              url: "spec1.json",
            },
          },
        ],
      };

      vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);

      const result: any = await question.dynamicOptions!(inputs);

      assert.equal(result.length, 1);
      assert.equal(result[0].id, path.join(path.dirname(manifestPath), "spec1.json"));
      assert.equal(result[0].label, "spec1.json");
    });

    it("dynamicOptions: should throw SpecNotFoundError when no specs found", async () => {
      const question = selectOpenAPISpecFromPluginQuestion();
      const manifestPath = "test-path/plugin.json";
      const inputs: any = {
        [QuestionNames.SelectPluginManifest]: manifestPath,
      };

      const pluginManifest = {
        runtimes: [],
      };

      vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);

      try {
        await question.dynamicOptions!(inputs);
        assert.fail("Should throw SpecNotFoundError");
      } catch (e) {
        assert.isTrue(e instanceof SpecNotFoundError);
      }
    });

    it("dynamicOptions: should throw SpecNotFoundError when no runtimes", async () => {
      const question = selectOpenAPISpecFromPluginQuestion();
      const manifestPath = "test-path/plugin.json";
      const inputs: any = {
        [QuestionNames.SelectPluginManifest]: manifestPath,
      };

      const pluginManifest = {};

      vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);

      try {
        await question.dynamicOptions!(inputs);
        assert.fail("Should throw SpecNotFoundError");
      } catch (e) {
        assert.isTrue(e instanceof SpecNotFoundError);
      }
    });
  });

  describe("selectApiOperationForRegenerateQuestion", () => {
    const sandbox = vi;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should have correct properties", () => {
      const question = selectApiOperationForRegenerateQuestion();

      assert.equal(question.type, "multiSelect");
      assert.equal(question.name, QuestionNames.ApiOperation);
      assert.equal(question.title, "Select operation(s) Copilot can interact with.");
      assert.equal(question.cliDescription, "Select operation(s) Copilot can interact with.");
      assert.equal(question.cliShortName, "o");
      assert.equal(
        question.placeholder,
        getLocalizedString("core.createProjectQuestion.apiSpec.operation.plugin.placeholder")
      );
      assert.isTrue(question.forgetLastValue);
      assert.deepEqual(question.staticOptions, []);
      assert.isFunction((question.validation as any)?.validFunc);
      assert.isFunction(question.dynamicOptions);
    });

    it("validation: should return undefined when all operations have the same server URL", () => {
      const question = selectApiOperationForRegenerateQuestion();
      const validationFunc = (question.validation as any).validFunc;

      const operations: ApiOperation[] = [
        {
          id: "op1",
          label: "Operation 1",
          groupName: "Group 1",
          data: { serverUrl: "https://api.example.com" },
        },
        {
          id: "op2",
          label: "Operation 2",
          groupName: "Group 1",
          data: { serverUrl: "https://api.example.com" },
        },
      ];

      const inputs: any = {
        supportedApisFromApiSpec: operations,
      };

      const result = validationFunc(["op1", "op2"], inputs);
      assert.isUndefined(result);
    });

    it("validation: should return error message when operations have different server URLs", () => {
      const question = selectApiOperationForRegenerateQuestion();
      const validationFunc = (question.validation! as any).validFunc;

      const operations: ApiOperation[] = [
        {
          id: "op1",
          label: "Operation 1",
          groupName: "Group 1",
          data: { serverUrl: "https://api.example.com" },
        },
        {
          id: "op2",
          label: "Operation 2",
          groupName: "Group 1",
          data: { serverUrl: "https://api.another.com" },
        },
      ];

      const inputs: any = {
        supportedApisFromApiSpec: operations,
      };

      const result = validationFunc(["op1", "op2"], inputs);
      assert.equal(
        result,
        getLocalizedString(
          "core.createProjectQuestion.apiSpec.operation.multipleServer",
          "https://api.example.com, https://api.another.com"
        )
      );
    });

    it("dynamicOptions: should throw OriginalSpecNotFoundError when spec file doesn't exist", async () => {
      const question = selectApiOperationForRegenerateQuestion();
      const inputs: any = {
        [QuestionNames.SelectOpenAPISpecFromPlugin]: "path/to/spec",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      try {
        await question.dynamicOptions!(inputs);
        assert.fail("Should throw error");
      } catch (e) {
        assert.isTrue(e instanceof OriginalSpecNotFoundError);
      }
    });

    it("dynamicOptions: should throw error when listOperations returns error", async () => {
      const question = selectApiOperationForRegenerateQuestion();
      const inputs: any = {
        [QuestionNames.SelectOpenAPISpecFromPlugin]: "path/to/spec",
      };

      const errorMessage = "List operations failed";
      const mockError = [new Error(errorMessage)];

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(createQuestionDeps.createQuestionDeps, "createContext").mockReturnValue(
        {} as Context
      );
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        err(mockError as any)
      );

      try {
        await question.dynamicOptions!(inputs);
        assert.fail("Should throw error");
      } catch (e) {
        assert.deepEqual(e, mockError);
      }
    });

    it("dynamicOptions: should throw EmptyOptionError when no operations found", async () => {
      const question = selectApiOperationForRegenerateQuestion();
      const inputs: any = {
        [QuestionNames.SelectOpenAPISpecFromPlugin]: "path/to/spec",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(createQuestionDeps.createQuestionDeps, "createContext").mockReturnValue(
        {} as Context
      );
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(ok([]));

      try {
        await question.dynamicOptions!(inputs);
        assert.fail("Should throw error");
      } catch (e) {
        assert.isTrue(e instanceof EmptyOptionError);
      }
    });

    it("dynamicOptions: should return operations when listOperations succeeds", async () => {
      const question = selectApiOperationForRegenerateQuestion();
      const inputs: any = {
        [QuestionNames.SelectOpenAPISpecFromPlugin]: "path/to/spec",
      };

      const operations: ApiOperation[] = [
        {
          id: "op1",
          label: "Operation 1",
          groupName: "Group 1",
          data: { serverUrl: "https://api.example.com" },
        },
        {
          id: "op2",
          label: "Operation 2",
          groupName: "Group 1",
          data: { serverUrl: "https://api.example.com" },
        },
      ];

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(createQuestionDeps.createQuestionDeps, "createContext").mockReturnValue(
        {} as Context
      );
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        ok(operations as any)
      );

      const result = await question.dynamicOptions!(inputs);

      assert.deepEqual(result, operations);
      assert.equal(inputs[QuestionNames.ApiSpecLocation], "path/to/spec.original");
      assert.deepEqual(inputs.supportedApisFromApiSpec, operations);
    });
  });

  describe("apiSpecTypeSelectQuestion", () => {
    it("should return a singleSelect question with 3 options", () => {
      const question = apiSpecTypeSelectQuestion();
      assert.equal(question.type, "singleSelect");
      assert.equal(question.name, QuestionNames.OpenAPISpecType);
      assert.equal(question.staticOptions.length, 3);
    });

    it("should have enter-url, open-file, and search-api options", () => {
      const question = apiSpecTypeSelectQuestion();
      const options = question.staticOptions as OptionItem[];
      assert.equal(options[0].id, "enter-url");
      assert.equal(options[1].id, "open-file");
      assert.equal(options[2].id, "search-api");
    });

    it("onDidSelection should set ActionType to api-spec", () => {
      const question = apiSpecTypeSelectQuestion();
      const inputs: Inputs = { platform: Platform.VSCode };
      question.onDidSelection?.("enter-url", inputs);
      assert.equal(inputs[QuestionNames.ActionType], ActionStartOptions.apiSpec().id);
    });
  });

  describe("apiSpecUrlQuestion", () => {
    it("should return a text question with correct properties", () => {
      const question = apiSpecUrlQuestion();
      assert.equal(question.type, "text");
      assert.equal(question.name, QuestionNames.ApiSpecLocation);
      assert.equal(question.title, getLocalizedString("core.createProjectQuestion.apiSpec.title"));
      assert.equal(
        question.placeholder,
        getLocalizedString("core.createProjectQuestion.apiSpec.placeholder")
      );
    });

    it("validation should pass for valid HTTP URL", async () => {
      const question = apiSpecUrlQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.isUndefined(result);
    });

    it("validation should fail for non-URL string", async () => {
      const question = apiSpecUrlQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const result = await validFunc("not-a-url", inputs);
      assert.isDefined(result);
    });

    it("validation should fail for non-URL string on CLI", async () => {
      const question = apiSpecUrlQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.CLI };
      const result = await validFunc("not-a-url", inputs);
      assert.isDefined(result);
      assert.include(result, "valid HTTP URL");
    });

    it("additionalValidationOnAccept should call listOperations and set supportedApisFromApiSpec on success", async () => {
      const question = apiSpecUrlQuestion();
      const inputs: Inputs = { platform: Platform.VSCode };
      const mockOperations = [{ id: "op1", label: "GET /pets", data: {} }];
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        ok(mockOperations as any)
      );
      const validFunc = (question as any).additionalValidationOnAccept.validFunc;
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.isUndefined(result);
      assert.deepEqual(inputs.supportedApisFromApiSpec, mockOperations);
    });

    it("additionalValidationOnAccept should return error message on failure", async () => {
      const question = apiSpecUrlQuestion();
      const inputs: Inputs = { platform: Platform.VSCode };
      const mockErrors = [{ type: 0, content: "Spec parse error" }];
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        err(mockErrors as any)
      );
      const validFunc = (question as any).additionalValidationOnAccept.validFunc;
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.equal(result, "Spec parse error");
    });

    it("additionalValidationOnAccept should return joined errors on CLI", async () => {
      const question = apiSpecUrlQuestion();
      const inputs: Inputs = { platform: Platform.CLI };
      const mockErrors = [
        { type: 0, content: "Error 1" },
        { type: 0, content: "Error 2" },
      ];
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        err(mockErrors as any)
      );
      const validFunc = (question as any).additionalValidationOnAccept.validFunc;
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.equal(result, "Error 1\nError 2");
    });

    it("additionalValidationOnAccept should return generic message for multiple long errors on VSCode", async () => {
      const question = apiSpecUrlQuestion();
      const inputs: Inputs = { platform: Platform.VSCode };
      const longError = "A".repeat(100);
      const mockErrors = [
        { type: 0, content: longError },
        { type: 0, content: "Error 2" },
      ];
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        err(mockErrors as any)
      );
      const validFunc = (question as any).additionalValidationOnAccept.validFunc;
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.equal(
        result,
        getLocalizedString(
          "core.createProjectQuestion.apiSpec.multipleValidationErrors.vscode.message"
        )
      );
    });

    it("additionalValidationOnAccept should throw when inputs is undefined", async () => {
      const question = apiSpecUrlQuestion();
      const validFunc = (question as any).additionalValidationOnAccept.validFunc;
      try {
        await validFunc("https://example.com/api.yaml", undefined);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.equal(e.message, "inputs is undefined");
      }
    });
  });

  describe("apiSpecFileQuestion", () => {
    it("should return a singleFile question with correct properties", () => {
      const question = apiSpecFileQuestion();
      assert.equal(question.type, "singleFile");
      assert.equal(question.name, QuestionNames.ApiSpecLocation);
      assert.equal(question.title, getLocalizedString("core.createProjectQuestion.apiSpec.title"));
      assert.isDefined(question.filters);
    });

    it("should have correct file filters", () => {
      const question = apiSpecFileQuestion();
      const filters = question.filters!;
      assert.deepEqual(filters["OpenAPI Description Document"], ["json", "yml", "yaml"]);
    });

    it("validation should fail when file does not exist", async () => {
      const question = apiSpecFileQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await validFunc("nonexistent.yaml", inputs);
      assert.isDefined(result);
      assert.include(result as string, "File not found");
    });

    it("validation should call listOperations when file exists and set supportedApisFromApiSpec", async () => {
      const question = apiSpecFileQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const mockOperations = [{ id: "op1", label: "GET /pets", data: {} }];
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        ok(mockOperations as any)
      );
      const result = await validFunc("test.yaml", inputs);
      assert.isUndefined(result);
      assert.deepEqual(inputs.supportedApisFromApiSpec, mockOperations);
    });

    it("validation should return error when listOperations fails", async () => {
      const question = apiSpecFileQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const mockErrors = [{ type: 0, content: "Invalid spec" }];
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        err(mockErrors as any)
      );
      const result = await validFunc("test.yaml", inputs);
      assert.equal(result, "Invalid spec");
    });

    it("validation should return joined errors on CLI", async () => {
      const question = apiSpecFileQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.CLI };
      const mockErrors = [
        { type: 0, content: "Error 1" },
        { type: 0, content: "Error 2" },
      ];
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        err(mockErrors as any)
      );
      const result = await validFunc("test.yaml", inputs);
      assert.equal(result, "Error 1\nError 2");
    });

    it("validation should throw when inputs is undefined", async () => {
      const question = apiSpecFileQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      try {
        await validFunc("test.yaml", undefined);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.equal(e.message, "inputs is undefined");
      }
    });
  });

  describe("apiSpecLocationQuestion", () => {
    it("should return a singleFileOrText question", () => {
      const question = apiSpecLocationQuestion();
      assert.equal(question.type, "singleFileOrText");
      assert.equal(question.name, QuestionNames.ApiSpecLocation);
    });

    it("should have inputOptionItem and filters", () => {
      const question = apiSpecLocationQuestion();
      assert.isDefined(question.inputOptionItem);
      assert.equal(question.inputOptionItem.id, "input");
      assert.isDefined(question.filters);
    });

    it("inputBoxConfig validation should pass for valid URL", async () => {
      const question = apiSpecLocationQuestion();
      const validFunc = (question.inputBoxConfig.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.isUndefined(result);
    });

    it("inputBoxConfig validation should fail for non-URL", async () => {
      const question = apiSpecLocationQuestion();
      const validFunc = (question.inputBoxConfig.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const result = await validFunc("not-a-url", inputs);
      assert.isDefined(result);
    });

    it("outer validation should call listOperations for valid URL", async () => {
      const question = apiSpecLocationQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      const mockOperations = [{ id: "op1", label: "GET /pets", data: {} }];
      vi.spyOn(createQuestionDeps.createQuestionDeps, "listOperations").mockResolvedValue(
        ok(mockOperations as any)
      );
      const result = await validFunc("https://example.com/api.yaml", inputs);
      assert.isUndefined(result);
      assert.deepEqual(inputs.supportedApisFromApiSpec, mockOperations);
    });

    it("outer validation should fail for non-existent file path", async () => {
      const question = apiSpecLocationQuestion();
      const validFunc = (question.validation as FuncValidation<string>).validFunc;
      const inputs: Inputs = { platform: Platform.VSCode };
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await validFunc("nonexistent.yaml", inputs);
      assert.isDefined(result);
      assert.include(result as string, "valid HTTP URL");
    });
  });
});
