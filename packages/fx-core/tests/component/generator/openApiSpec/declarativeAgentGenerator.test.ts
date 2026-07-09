import { ProjectType, SpecParser, ValidationStatus } from "@microsoft/m365-spec-parser";
import { ApiOperation, Inputs, Platform, SystemError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { RestoreFn } from "mocked-env";
import { err, ok } from "neverthrow";
import { featureFlagManager, FeatureFlagName } from "../../../../src/common/featureFlags";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { EmbeddedKnowledgeLocalDirectoryName } from "../../../../src/component/driver/teamsApp/constants";
import { copilotGptManifestUtils } from "../../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { DeclarativeAgentWithExistingApiSpecGenerator } from "../../../../src/component/generator/openApiSpec/declarativeAgentGenerator";
import * as helper from "../../../../src/component/generator/openApiSpec/helper";
import { TemplateNames } from "../../../../src/component/generator/templates/templateNames";
import { ActionStartOptions, ProgrammingLanguage, QuestionNames } from "../../../../src/question";
import { DACapabilityOptions } from "../../../../src/question/scaffold/vsc/CapabilityOptions";
import { MockTools } from "../../../core/utils";
import { teamsManifest } from "./fakeData";
import { assert, vi } from "vitest";

const tools = new MockTools();

describe("DeclarativeAgentWithExistingApiSpecGenerator", async () => {
  const sandbox = vi;
  before(() => {
    setTools(tools);
  });
  after(() => {
    vi.restoreAllMocks();
  });
  describe("activate", async () => {
    it("should activate and get correct template name", async () => {
      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithActionFromExistingApiSpec,
      };
      const res = await generator.activate(context, inputs);
      assert.isTrue(res);
    });
  });

  describe("getTemplateInfos", async () => {
    const sandbox = vi;
    let mockedEnvRestore: RestoreFn | undefined;
    afterEach(async () => {
      vi.restoreAllMocks();
      if (mockedEnvRestore) {
        mockedEnvRestore();
      }
    });

    it("happy path", async () => {
      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithExistingAction,
        [QuestionNames.AppName]: "testapp",
      };
      inputs[QuestionNames.ApiSpecLocation] = "test.yaml";
      inputs.apiAuthData = [
        { serverUrl: "https://test.com", authName: "test", authType: "apiKey" },
      ];
      const res = await generator.getTemplateInfos(context, inputs, ".");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.length, 1);
        assert.equal(res.value[0].templateName, TemplateNames.DeclarativeAgentWithExistingAction);
        assert.equal(res.value[0].replaceMap?.["DeclarativeCopilot"], "true");
      }
    });

    it("succeed even get yaml file failed", async () => {
      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testapp",
        [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.CSharp,
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithExistingAction,
      };
      inputs[QuestionNames.ApiSpecLocation] = "test.yaml";
      inputs.apiAuthData = [
        { serverUrl: "https://test.com", authName: "test", authType: "apiKey" },
      ];
      vi.spyOn(JSON, "parse").mockImplementation(() => {
        throw new Error();
      });
      const res = await generator.getTemplateInfos(context, inputs, ".", { telemetryProps: {} });
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.length, 1);
        assert.equal(res.value[0].templateName, TemplateNames.DeclarativeAgentWithExistingAction);
        assert.equal(res.value[0].language, ProgrammingLanguage.CSharp);
      }
    });
  });

  describe("post", function () {
    const sandbox = vi;
    let mockedEnvRestore: RestoreFn | undefined;

    const apiOperations: ApiOperation[] = [
      {
        id: "operation1",
        label: "operation1",
        groupName: "1",
        data: {
          serverUrl: "https://server1",
        },
      },
      {
        id: "operation2",
        label: "operation2",
        groupName: "1",
        data: {
          serverUrl: "https://server1",
          authName: "auth",
        },
      },
    ];

    before(() => {
      setTools(tools);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      if (mockedEnvRestore) {
        mockedEnvRestore();
      }
    });

    it("success", async function () {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "path",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.ApiSpecLocation]: "https://test.com",
        [QuestionNames.ApiOperation]: ["operation1"],
        supportedApisFromApiSpec: apiOperations,
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });
      vi.spyOn(copilotGptManifestUtils, "updateDeclarativeAgentManifest").mockResolvedValue(ok(""));
      vi.spyOn(helper, "generateScaffoldingSummary").mockResolvedValue("");

      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");

      assert.isTrue(result.isOk());
      assert.isTrue(generateBasedOnSpec.mock.calls.length === 1);
    });

    it("generate for oauth: success", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "path",
        [QuestionNames.AppName]: "test",
        [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.TS,
        [QuestionNames.ApiSpecLocation]: "test.yaml",
        [QuestionNames.ApiOperation]: ["operation1"],
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        supportedApisFromApiSpec: [
          {
            id: "operation1",
            label: "operation1",
            groupName: "1",
            data: {
              serverUrl: "https://server1",
              authName: "auth",
              authType: "oauth2",
            },
          },
        ] as ApiOperation[],
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();

      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(copilotGptManifestUtils, "updateDeclarativeAgentManifest").mockResolvedValue(ok(""));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });
      vi.spyOn(helper, "generateScaffoldingSummary").mockResolvedValue("");

      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");
      assert.isTrue(result.isOk());
      assert.isTrue(generateBasedOnSpec.mock.calls.length === 1);
    });

    it("declarative copilot with plugin success", async function () {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "path",
        [QuestionNames.Capabilities]: DACapabilityOptions.declarativeAgent().id,
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.ApiSpecLocation]: "https://test.com",
        [QuestionNames.ApiOperation]: ["operation1"],
        supportedApisFromApiSpec: apiOperations,
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      const addAction = vi
        .spyOn(copilotGptManifestUtils, "addAction")
        .mockResolvedValue(ok({} as any));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });
      vi.spyOn(helper, "generateScaffoldingSummary").mockResolvedValue("");

      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");

      assert.isTrue(result.isOk());
      assert.isTrue(generateBasedOnSpec.mock.calls.length === 1);
      assert.isTrue(addAction.mock.calls.length === 1);
    });

    it("declarative copilot with plugin error", async function () {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "path",
        [QuestionNames.Capabilities]: DACapabilityOptions.declarativeAgent().id,
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.ApiSpecLocation]: "https://test.com",
        [QuestionNames.ApiOperation]: ["operation1"],
        supportedApisFromApiSpec: apiOperations,
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      const addAction = vi
        .spyOn(copilotGptManifestUtils, "addAction")
        .mockResolvedValue(err(new SystemError("test", "test", "test", "test")));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });

      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");

      assert.isTrue(result.isErr() && result.error.name === "test");
      assert.isTrue(generateBasedOnSpec.mock.calls.length === 1);
      assert.isTrue(addAction.mock.calls.length === 1);
    });

    it("add embedded knowledge folder success - CLI", async function () {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "path",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.ApiSpecLocation]: "https://test.com",
        [QuestionNames.ApiOperation]: ["operation1"],
        supportedApisFromApiSpec: apiOperations,
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });
      vi.spyOn(copilotGptManifestUtils, "updateDeclarativeAgentManifest").mockResolvedValue(ok(""));
      vi.spyOn(helper, "generateScaffoldingSummary").mockResolvedValue("");
      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");

      assert.isTrue(result.isOk());
    });

    it("add embedded knowledge folder success - VSC", async function () {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "path",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.ApiSpecLocation]: "https://test.com",
        [QuestionNames.ApiOperation]: ["operation1"],
        supportedApisFromApiSpec: apiOperations,
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });
      vi.spyOn(copilotGptManifestUtils, "updateDeclarativeAgentManifest").mockResolvedValue(ok(""));
      vi.spyOn(helper, "generateScaffoldingSummary").mockResolvedValue("");
      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");

      assert.isTrue(result.isOk());
    });

    it("add embedded knowledge folder skipped - VS", async function () {
      const inputs: Inputs = {
        platform: Platform.VS,
        projectPath: "path",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.ApiSpecLocation]: "https://test.com",
        [QuestionNames.ApiOperation]: ["operation1"],
        supportedApisFromApiSpec: apiOperations,
        templateState: {
          templateName: "api-plugin-existing-api",
          isPlugin: true,
          uri: "https://test.com",
          isYaml: true,
          type: ProjectType.Copilot,
        },
      };
      const context = createContext();
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
        status: ValidationStatus.Valid,
        errors: [],
        warnings: [],
      });
      vi.spyOn(fs, "ensureDir").mockImplementation((path) => {
        if (path.includes(EmbeddedKnowledgeLocalDirectoryName)) {
          throw new Error("fail");
        }
        return Promise.resolve();
      });
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
      const generateBasedOnSpec = vi
        .spyOn(SpecParser.prototype, "generateForCopilot")
        .mockResolvedValue({ allSuccess: true, warnings: [] });
      vi.spyOn(copilotGptManifestUtils, "updateDeclarativeAgentManifest").mockResolvedValue(ok(""));
      vi.spyOn(helper, "generateScaffoldingSummary").mockResolvedValue("");
      const generator = new DeclarativeAgentWithExistingApiSpecGenerator();
      const result = await generator.post(context, inputs, "projectPath");

      assert.isTrue(result.isOk());
    });
  });
});
