import { err, Inputs, ok, Platform, SystemError, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { glob } from "glob";
import { RestoreFn } from "mocked-env";
import { createContext, setTools } from "../../../src/common/globalVars";
import { coordinator } from "../../../src/component/coordinator";
import { AppDefinition } from "../../../src/component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { manifestUtils } from "../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { DeclarativeAgentGenerator } from "../../../src/component/generator/declarativeAgent/generator";
import { DefaultTemplateGenerator } from "../../../src/component/generator/defaultGenerator";
import { Generator } from "../../../src/component/generator/generator";
import { OfficeAddinGeneratorNew } from "../../../src/component/generator/officeAddin/generator";
import { CustomEngineAgentWithExistingApiSpecGenerator } from "../../../src/component/generator/openApiSpec/customEngineAgentGenerator";
import { SsrTabGenerator } from "../../../src/component/generator/other/ssrTabGenerator";
import { TdpGenerator } from "../../../src/component/generator/other/tdpGenerator";
import { SPFxGeneratorNew } from "../../../src/component/generator/spfx/spfxGenerator";
import { TemplateNames } from "../../../src/component/generator/templates/templateNames";
import { pathUtils } from "../../../src/component/utils/pathUtils";
import { FxCore } from "../../../src/core/FxCore";
import { InputValidationError, MissingRequiredInputError } from "../../../src/error/common";
import { CreateSampleProjectInputs } from "../../../src/question";
import {
  ActionStartOptions,
  ApiAuthOptions,
  CustomCopilotRagOptions,
  QuestionNames,
  ScratchOptions,
} from "../../../src/question/constants";
import { TabCapabilityOptions } from "../../../src/question/scaffold/vsc/CapabilityOptions";
import { ProjectTypeOptions } from "../../../src/question/scaffold/vsc/ProjectTypeOptions";
import { validationUtils } from "../../../src/ui/validationUtils";
import { MockTools, randomAppName } from "../../core/utils";
import { MockedUserInteraction } from "../../plugins/solution/util";
import { assert, vi } from "vitest";

describe("coordinator create", () => {
  const sandbox = vi;
  const tools = new MockTools();
  let generator: any;
  setTools(tools);
  let mockedEnvRestore: RestoreFn | undefined;
  beforeEach(() => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(manifestUtils, "trimManifestShortName").mockResolvedValue(ok(undefined));
    generator = vi
      .spyOn(DefaultTemplateGenerator.prototype, "scaffolding" as any)
      .mockResolvedValue(ok(undefined));
  });
  afterEach(() => {
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
    vi.restoreAllMocks();
  });

  describe("createSampleProject", () => {
    beforeEach(() => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    });
    it("create project from sample", async () => {
      vi.spyOn(Generator, "generateSample").mockResolvedValue(ok(undefined));
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const inputs: CreateSampleProjectInputs = {
        platform: Platform.CLI,
        folder: ".",
        samples: "hello-world-tab-with-backend",
      };
      const fxCore = new FxCore(tools);
      const res = await fxCore.createSampleProject(inputs);
      assert.isTrue(res.isOk());
    });
    it("create project from sample: todo-list-SPFx", async () => {
      vi.spyOn(Generator, "generateSample").mockResolvedValue(ok(undefined));
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(glob, "glob").mockResolvedValue();
      vi.spyOn(fs, "readFile").mockResolvedValue("test" as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue("");
      const inputs: CreateSampleProjectInputs = {
        platform: Platform.CLI,
        folder: ".",
        samples: "todo-list-SPFx",
      };
      const fxCore = new FxCore(tools);
      const res = await fxCore.createSampleProject(inputs);
      assert.isTrue(res.isOk());
    });
    it("fail to create project from sample", async () => {
      vi.spyOn(Generator, "generateSample").mockResolvedValue(err(new UserError({})));
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const inputs: CreateSampleProjectInputs = {
        platform: Platform.CLI,
        folder: ".",
        samples: "hello-world-tab-with-backend",
      };
      const fxCore = new FxCore(tools);
      const res = await fxCore.createSampleProject(inputs);
      assert.isTrue(res.isErr());
    });
    it("create project from sample rename folder", async () => {
      vi.spyOn(Generator, "generateSample").mockResolvedValue(ok(undefined));
      vi.spyOn(fs, "pathExists")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      vi.spyOn(fs, "readdir")
        .mockResolvedValueOnce(["abc"] as any)
        .mockResolvedValueOnce([]);
      const inputs: CreateSampleProjectInputs = {
        platform: Platform.CLI,
        folder: ".",
        samples: "hello-world-tab-with-backend",
      };
      const fxCore = new FxCore(tools);
      const res = await fxCore.createSampleProject(inputs);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isTrue(res.value.projectPath.endsWith("_1"));
      }
    });
    it("MissingRequiredInputError missing sample id", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        ignoreLockByUT: true,
        folder: ".",
        [QuestionNames.Scratch]: ScratchOptions.no().id,
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof MissingRequiredInputError);
      }
    });
  });

  describe("create from scratch", async () => {
    it("MissingRequiredInputError missing folder", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof MissingRequiredInputError);
      }
    });
    it("MissingRequiredInputError missing App name", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        ignoreLockByUT: true,
        folder: ".",
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof MissingRequiredInputError);
      }
    });
    it("MissingRequiredInputError invalid App name", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        ignoreLockByUT: true,
        folder: ".",
        "app-name": "__#$%___",
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof InputValidationError);
      }
    });
    it("fail to create SPFx project", async () => {
      vi.spyOn(SPFxGeneratorNew.prototype, "run").mockResolvedValue(err(new UserError({})));
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProgrammingLanguage]: "javascript",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFramework]: "none",
        [QuestionNames.SPFxWebpartName]: "test",
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
    });

    it("ensureTrackingId fails", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(SPFxGeneratorNew.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(err(new UserError({})));
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProgrammingLanguage]: "typescript",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFramework]: "none",
        [QuestionNames.SPFxWebpartName]: "test",
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
    });
    it("success", async () => {
      vi.spyOn(SPFxGeneratorNew.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(ok("mock-id"));
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProgrammingLanguage]: "typescript",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFramework]: "none",
        [QuestionNames.SPFxWebpartName]: "test",
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isOk());
    });

    it("create project for app with tab features from Developer Portal", async () => {
      vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(ok("mock-id"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(TdpGenerator.prototype, "run").mockResolvedValue(ok({}));
      const appDefinition: AppDefinition = {
        teamsAppId: "mock-id",
        appId: "mock-id",
        staticTabs: [
          {
            name: "tab1",
            entityId: "tab1",
            contentUrl: "mock-contentUrl",
            websiteUrl: "mock-websiteUrl",
            context: [],
            scopes: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "javascript",
        teamsAppFromTdp: appDefinition,
        [QuestionNames.TemplateName]: TemplateNames.Tab,
        [QuestionNames.ReplaceWebsiteUrl]: ["tab1"],
        [QuestionNames.ReplaceContentUrl]: [],
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isOk());
    });
    it("create project for app with bot feature from Developer Portal with updating files failed", async () => {
      vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(ok("mock-id"));
      vi.spyOn(TdpGenerator.prototype, "run").mockResolvedValue(
        err(new UserError("coordinator", "error", "msg", "msg"))
      );
      const appDefinition: AppDefinition = {
        teamsAppId: "mock-id",
        appId: "mock-id",
        bots: [
          {
            botId: "mock-bot-id",
            isNotificationOnly: false,
            needsChannelSelector: false,
            supportsCalling: false,
            supportsFiles: false,
            supportsVideo: false,
            scopes: [],
            teamCommands: [],
            groupChatCommands: [],
            personalCommands: [],
          },
        ],
      };

      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "javascript",
        [QuestionNames.TemplateName]: TemplateNames.DefaultBot,
        [QuestionNames.ReplaceBotIds]: ["bot"],
        teamsAppFromTdp: appDefinition,
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "error");
      }
    });
    it("create project for app with tab and bot features from Developer Portal", async () => {
      vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(ok("mock-id"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(TdpGenerator.prototype, "run").mockResolvedValue(ok({}));
      const appDefinition: AppDefinition = {
        teamsAppId: "mock-id",
        appId: "mock-id",
        staticTabs: [
          {
            name: "tab1",
            entityId: "tab1",
            contentUrl: "mock-contentUrl",
            websiteUrl: "mock-websiteUrl",
            context: [],
            scopes: [],
          },
        ],
        bots: [
          {
            botId: "mock-bot-id",
            isNotificationOnly: false,
            needsChannelSelector: false,
            supportsCalling: false,
            supportsFiles: false,
            supportsVideo: false,
            scopes: [],
            teamCommands: [],
            groupChatCommands: [],
            personalCommands: [],
          },
        ],
      };

      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "javascript",
        teamsAppFromTdp: appDefinition,
        [QuestionNames.TemplateName]: TemplateNames.DefaultBot,
        [QuestionNames.ReplaceWebsiteUrl]: ["tab1"],
        [QuestionNames.ReplaceContentUrl]: [],
        [QuestionNames.ReplaceBotIds]: ["bot"],
      };
      const context = createContext();
      const res = await coordinator.create(context, inputs);
      assert.isTrue(res.isOk());
    });

    it("create non-sso tab from .NET 8", async () => {
      vi.spyOn(SsrTabGenerator.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      const inputs: Inputs = {
        platform: Platform.VS,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "csharp",
        [QuestionNames.SafeProjectName]: "safeprojectname",
        ["targetFramework"]: "net8.0",
        [QuestionNames.TemplateName]: TemplateNames.TabSSR,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("create sso tab from .NET 8", async () => {
      const v3ctx = createContext();
      vi.spyOn(SsrTabGenerator.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      v3ctx.userInteraction = new MockedUserInteraction();
      const inputs: Inputs = {
        platform: Platform.VS,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "csharp",
        [QuestionNames.SafeProjectName]: "safeprojectname",
        ["targetFramework"]: "net8.0",
        [QuestionNames.TemplateName]: TemplateNames.SsoTabSSR,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("create custom copilot rag custom api success", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "typescript",
        [QuestionNames.SafeProjectName]: "safeprojectname",
        [QuestionNames.ProjectType]: ProjectTypeOptions.customEngineAgentOptionId,
        [QuestionNames.TemplateName]: TemplateNames.CustomCopilotRagCustomApi,
        [QuestionNames.CustomCopilotRag]: CustomCopilotRagOptions.customApi().id,
        [QuestionNames.ApiSpecLocation]: "spec",
        [QuestionNames.ApiOperation]: "test",
        [QuestionNames.LLMService]: "llm-service-openAI",
        [QuestionNames.OpenAIKey]: "mockedopenaikey",
      };
      vi.spyOn(CustomEngineAgentWithExistingApiSpecGenerator.prototype, "run").mockResolvedValue(
        ok({})
      );
      vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("create custom copilot rag custom api with azure open ai success", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "typescript",
        [QuestionNames.SafeProjectName]: "safeprojectname",
        [QuestionNames.TemplateName]: TemplateNames.CustomCopilotRagCustomApi,
        [QuestionNames.CustomCopilotRag]: CustomCopilotRagOptions.customApi().id,
        [QuestionNames.ApiSpecLocation]: "spec",
        [QuestionNames.ApiOperation]: "test",
        [QuestionNames.LLMService]: "llm-service-azure-openai",
        [QuestionNames.AzureOpenAIKey]: "mockedAzureOpenAIKey",
        [QuestionNames.AzureOpenAIEndpoint]: "mockedAzureOpenAIEndpoint",
        [QuestionNames.AzureOpenAIDeploymentName]: "mockedAzureOpenAIDeploymentName",
      };
      vi.spyOn(CustomEngineAgentWithExistingApiSpecGenerator.prototype, "run").mockResolvedValue(
        ok({})
      );
      vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    // it("create custom agent api with azure open ai success", async () => {
    //   const v3ctx = createContext();
    //   v3ctx.userInteraction = new MockedUserInteraction();
    //   const inputs: Inputs = {
    //     platform: Platform.VSCode,
    //     folder: ".",
    //     [QuestionNames.AppName]: randomAppName(),
    //     [QuestionNames.ProgrammingLanguage]: "typescript",
    //     [QuestionNames.SafeProjectName]: "safeprojectname",
    //     [QuestionNames.TemplateName]: TemplateNames.CustomCopilotAssistantNew,
    //     [QuestionNames.CustomCopilotAssistant]: CustomCopilotAssistantOptions.new().id,
    //     [QuestionNames.ApiSpecLocation]: "spec",
    //     [QuestionNames.ApiOperation]: "test",
    //     [QuestionNames.AzureOpenAIKey]: "mockedAzureOpenAIKey",
    //     [QuestionNames.AzureOpenAIEndpoint]: "mockedAzureOpenAIEndpoint",
    //     [QuestionNames.AzureOpenAIDeploymentName]: "mockedAzureOpenAIDeploymentName",
    //   };
    //   vi.spyOn(DefaultTemplateGenerator.prototype, "run").mockResolvedValue(ok({}));
    //   vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    //   vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    //   vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    //   const res = await coordinator.create(v3ctx, inputs);

    //   assert.isTrue(res.isOk());
    // });

    it("create custom copilot rag custom api failed", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.ProgrammingLanguage]: "typescript",
        [QuestionNames.SafeProjectName]: "safeprojectname",
        [QuestionNames.TemplateName]: TemplateNames.CustomCopilotRagCustomApi,
        [QuestionNames.CustomCopilotRag]: CustomCopilotRagOptions.customApi().id,
        [QuestionNames.ApiSpecLocation]: "spec",
        [QuestionNames.ApiOperation]: "test",
        [QuestionNames.LLMService]: "llm-service-openAI",
        [QuestionNames.OpenAIKey]: "mockedopenaikey",
      };
      vi.spyOn(CustomEngineAgentWithExistingApiSpecGenerator.prototype, "run").mockResolvedValue(
        err(new SystemError("test", "test", "test"))
      );
      vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);

      const res = await coordinator.create(v3ctx, inputs);

      assert.isTrue(res.isErr() && res.error.name === "test");
    });

    it("create API Plugin with No authentication (feature flag enabled)", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      vi.spyOn(DeclarativeAgentGenerator.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.ProjectType]: ProjectTypeOptions.copilotAgentOptionId,
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.newApi().id,
        [QuestionNames.ApiAuth]: ApiAuthOptions.none().id,
        [QuestionNames.ProgrammingLanguage]: "javascript",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Scratch]: ScratchOptions.yes().id,
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithActionFromScratch,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("create API Plugin with api-key auth (feature flag enabled)", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      vi.spyOn(DeclarativeAgentGenerator.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.ProjectType]: ProjectTypeOptions.copilotAgentOptionId,
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.newApi().id,
        [QuestionNames.ApiAuth]: ApiAuthOptions.apiKey().id,
        [QuestionNames.ProgrammingLanguage]: "javascript",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Scratch]: ScratchOptions.yes().id,
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("create API Plugin with OAuth (feature flag enabled)", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      vi.spyOn(DeclarativeAgentGenerator.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.ProjectType]: ProjectTypeOptions.copilotAgentOptionId,
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.newApi().id,
        [QuestionNames.ApiAuth]: ApiAuthOptions.oauth().id,
        [QuestionNames.ProgrammingLanguage]: "javascript",
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Scratch]: ScratchOptions.yes().id,
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithActionFromScratch,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("should scaffold taskpane successfully", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(OfficeAddinGeneratorNew.prototype, "run").mockResolvedValue(ok({}));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.ProjectType]: ProjectTypeOptions.outlookAddinOptionId,
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Scratch]: ScratchOptions.yes().id,
        [QuestionNames.TemplateName]: TemplateNames.OutlookTaskpane,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("should scaffold from API spec successfully", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();

      vi.spyOn(DefaultTemplateGenerator.prototype, "run").mockResolvedValue(
        ok({ warnings: [{ type: "", content: "", data: {} } as any] })
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.ProjectType]: ProjectTypeOptions.copilotAgentOptionId,
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Scratch]: ScratchOptions.yes().id,
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithActionFromScratch,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isOk());
    });

    it("scaffold from API spec error", async () => {
      const v3ctx = createContext();
      v3ctx.userInteraction = new MockedUserInteraction();

      vi.spyOn(CustomEngineAgentWithExistingApiSpecGenerator.prototype, "run").mockResolvedValue(
        err(new SystemError("mockedSource", "mockedError", "mockedMessage", ""))
      );
      const inputs: Inputs = {
        platform: Platform.VSCode,
        folder: ".",
        [QuestionNames.ProjectType]: ProjectTypeOptions.copilotAgentOptionId,
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
        [QuestionNames.AppName]: randomAppName(),
        [QuestionNames.Scratch]: ScratchOptions.yes().id,
      };
      const res = await coordinator.create(v3ctx, inputs);
      assert.isTrue(res.isErr());
    });
  });
});
