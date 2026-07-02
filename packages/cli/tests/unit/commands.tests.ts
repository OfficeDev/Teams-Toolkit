import { CLIContext, SystemError, err, ok } from "@microsoft/teamsfx-api";
import {
  CliQuestionName,
  CollaborationConstants,
  CollaborationStateResult,
  FeatureFlags,
  FxCore,
  ListCollaboratorResult,
  PackageService,
  PermissionGrantInputs,
  PermissionListInputs,
  PermissionsResult,
  QuestionNames,
  UserCancelError,
  envUtil,
  featureFlagManager,
} from "@microsoft/teamsfx-core";
import * as settingHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import { RestoreFn } from "mocked-env";
import { assert, vi } from "vitest";
import * as activate from "../../src/activate";
import { localTelemetryReporter } from "../../src/cmds/preview/localTelemetryReporter";
import {
  accountLoginAzureCommand,
  accountLoginM365Command,
  accountUtils,
  addCommand,
  addSPFxWebpartCommand,
  createSampleCommand,
  deployCommand,
  envAddCommand,
  envListCommand,
  getCreateCommand,
  listSamplesCommand,
  m365LaunchInfoCommand,
  m365SideloadingCommand,
  m365UnacquireCommand,
  m365utils,
  packageCommand,
  permissionGrantCommand,
  permissionStatusCommand,
  previewCommand,
  provisionCommand,
  publishCommand,
  validateCommand,
} from "../../src/commands/models";
import { addAuthConfigCommand } from "../../src/commands/models/addAuthConfig";
import { addCapabilityCommand } from "../../src/commands/models/addCapability";
import { addPluginCommand } from "../../src/commands/models/addPlugin";
import { entraAppUpdateCommand } from "../../src/commands/models/entraAppUpdate";
import { envResetCommand } from "../../src/commands/models/envReset";
import { exportOpenPluginCommand } from "../../src/commands/models/exportOpenPlugin";
import { importOpenPluginCommand } from "../../src/commands/models/importOpenPlugin";
import * as listTemplatesModule from "../../src/commands/models/listTemplates";
import { regeneratePluginCommand } from "../../src/commands/models/regeneratePlugin";
import { shareCommand } from "../../src/commands/models/share";
import { shareRemoveCommand } from "../../src/commands/models/shareRemove";
import { teamsappPackageCommand } from "../../src/commands/models/teamsapp/package";
import { teamsappPublishCommand } from "../../src/commands/models/teamsapp/publish";
import { teamsappUpdateCommand } from "../../src/commands/models/teamsapp/update";
import { teamsappValidateCommand } from "../../src/commands/models/teamsapp/validate";
import AzureTokenProvider from "../../src/commonlib/azureLogin";
import { logger } from "../../src/commonlib/logger";
import M365TokenProvider from "../../src/commonlib/M365TokenProviderWrapper";
import { MissingRequiredOptionError } from "../../src/error";
import * as utils from "../../src/utils";

describe("CLI commands", () => {
  const sandbox = vi;

  const mockedEnvRestore: RestoreFn = () => {};

  process.env.TEAMSFX_CLI_BIN_NAME = "atk";
  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true as any);
    vi.spyOn(process.stderr, "write").mockReturnValue(true as any);
    vi.spyOn(logger, "info").mockResolvedValue(true);
    vi.spyOn(logger, "error").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  describe("getCreateCommand", async () => {
    it("happy path for donet", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "bot",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("happy path for cli", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "bot",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("core return error", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(err(new UserCancelError()));
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isErr());
    });

    it("uses template alias and preset language in non-interactive mode", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectStub = vi
        .spyOn(FxCore.prototype, "createProject")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "api-plugin",
          alias: "api-plugin-from-scratch",
          displayName: "API Plugin",
          description: "desc",
          language: "typescript",
        },
      ] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "api-plugin-from-scratch",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      assert.isTrue(createProjectStub.mock.calls.length === 1);
      const inputs = createProjectStub.mock.calls[0][0] as any;
      assert.equal(inputs["template-name"], "api-plugin");
      assert.equal(inputs["programming-language"], "typescript");
    });

    it("keeps capability as template-name when template is not found", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectStub = vi
        .spyOn(FxCore.prototype, "createProject")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "unknown-template",
          nonInteractive: true,
          "programming-language": "javascript",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectStub.mock.calls[0][0] as any;
      assert.equal(inputs["template-name"], "unknown-template");
      assert.equal(inputs["programming-language"], "javascript");
    });

    it("includes template alias in capability choices", async () => {
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "api-plugin",
          alias: "api-plugin-from-scratch",
          displayName: "API Plugin",
          description: "desc",
          language: "typescript",
        },
      ] as any);

      const command = getCreateCommand();
      const capabilityOption = command.options?.find((o) => o.name === CliQuestionName.Capability);

      assert.include((capabilityOption as any)?.choices, "api-plugin-from-scratch");
    });

    it("keeps the v3 create option surface when TEAMSFX_V4_ENABLED is on", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "copilot-gpt-basic",
          alias: "declarative-agent",
          displayName: "Declarative Agent",
          description: "desc",
          language: "common",
        },
      ] as any);

      const command = getCreateCommand();
      const projectType = command.options?.find((o) => o.name === "project-type");
      const mcpServerUrl = command.options?.find((o) => o.name === "mcp-server-url");
      const capability = command.options?.find((o) => o.name === CliQuestionName.Capability);
      const mcpDaServerUrl = command.options?.find((o) => o.name === "mcp-da-server-url");
      const addinProjectFolder = command.options?.find((o) => o.name === "addin-project-folder");

      assert.isUndefined(projectType);
      assert.isUndefined(mcpServerUrl);
      assert.isDefined(capability);
      assert.include((capability as any)?.choices, "declarative-agent");
      assert.isTrue(capability?.required);
      assert.isDefined(mcpDaServerUrl);
      assert.isDefined(addinProjectFolder);
    });

    it("normalizes legacy create flags to neutral keys before calling the front door", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectFrontDoorStub = vi
        .spyOn(FxCore.prototype, "createProjectFrontDoor")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          nonInteractive: true,
          "mcp-da-server-url": "https://example.com/mcp",
          "mcp-tools-file-path": "C:/tools/mcp-tools.json",
          "mcp-da-auth-type": "none",
          "api-auth": "none",
          "api-operation": ["GET /repairs"],
          "azure-openai-key": "fake-key",
          "azure-openai-endpoint": "https://test.com",
          "azure-openai-deployment-name": "fake-deployment",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectFrontDoorStub.mock.calls[0][0] as any;
      assert.equal(inputs.mcpServerUrl, "https://example.com/mcp");
      assert.equal(inputs["mcp-da-server-url"], "https://example.com/mcp");
      assert.equal(inputs.mcpToolsFilePath, "C:/tools/mcp-tools.json");
      assert.equal(inputs["mcp-tools-file-path"], "C:/tools/mcp-tools.json");
      assert.equal(inputs.authType, "none");
      assert.equal(inputs["mcp-da-auth-type"], "none");
      assert.equal(inputs.apiAuth, "none");
      assert.equal(inputs["api-auth"], "none");
      assert.deepEqual(inputs.apiOperations, ["GET /repairs"]);
      assert.deepEqual(inputs["api-operation"], ["GET /repairs"]);
      assert.equal(inputs.azureOpenAIKey, "fake-key");
      assert.equal(inputs["azure-openai-key"], "fake-key");
      assert.equal(inputs.azureOpenAIEndpoint, "https://test.com");
      assert.equal(inputs["azure-openai-endpoint"], "https://test.com");
      assert.equal(inputs.azureOpenAIDeploymentName, "fake-deployment");
      assert.equal(inputs["azure-openai-deployment-name"], "fake-deployment");
    });

    it("normalizes legacy create route flags to v4 selector keys without pinning template-name", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectFrontDoorStub = vi
        .spyOn(FxCore.prototype, "createProjectFrontDoor")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "copilot-gpt-basic",
          alias: "declarative-agent",
          displayName: "Declarative Agent",
          description: "desc",
          language: "common",
        },
      ] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "declarative-agent",
          "with-plugin": "yes",
          "api-plugin-type": "api-spec",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectFrontDoorStub.mock.calls[0][0] as any;
      assert.equal(inputs.projectType, "copilot-agent-type");
      assert.equal(inputs.daTemplate, "add-action");
      assert.equal(inputs.actionSource, "openapi");
      assert.notProperty(inputs, "template-name");
    });

    it("normalizes copilot-gpt-basic with MCP plugin flags to the v4 MCP route", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectFrontDoorStub = vi
        .spyOn(FxCore.prototype, "createProjectFrontDoor")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "copilot-gpt-basic",
          "with-plugin": "yes",
          "api-plugin-type": "mcp",
          "mcp-da-server-url": "https://learn.microsoft.com/api/mcp",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectFrontDoorStub.mock.calls[0][0] as any;
      assert.equal(inputs.projectType, "copilot-agent-type");
      assert.equal(inputs.daTemplate, "add-action");
      assert.equal(inputs.actionSource, "mcp");
      assert.equal(inputs.mcpServerUrl, "https://learn.microsoft.com/api/mcp");
      assert.notProperty(inputs, "template-name");
    });

    it("normalizes declarative agent without action to v4 selector keys", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(FxCore.prototype);
      const createProjectFrontDoorStub = vi
        .spyOn(FxCore.prototype, "createProjectFrontDoor")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([]);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "declarative-agent",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectFrontDoorStub.mock.calls[0][0];
      assert.equal(inputs.projectType, "copilot-agent-type");
      assert.equal(inputs.daTemplate, "no-action");
      assert.notProperty(inputs, "template-name");
    });

    it("falls back to legacy create template-name when declarative agent route flags are unknown", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(FxCore.prototype);
      const createProjectFrontDoorStub = vi
        .spyOn(FxCore.prototype, "createProjectFrontDoor")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "copilot-gpt-basic",
          alias: "declarative-agent",
          displayName: "Declarative Agent",
          description: "desc",
          language: "common",
        },
      ]);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "declarative-agent",
          "with-plugin": "unknown",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectFrontDoorStub.mock.calls[0][0];
      assert.equal(inputs["template-name"], "copilot-gpt-basic");
      assert.equal(inputs["programming-language"], "common");
    });

    it("normalizes legacy bearer-token API auth to the v4 api-key selector value", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectFrontDoorStub = vi
        .spyOn(FxCore.prototype, "createProjectFrontDoor")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "declarative-agent",
          "with-plugin": "yes",
          "api-plugin-type": "new-api",
          "api-auth": "bearer-token",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);

      assert.isTrue(res.isOk());
      const inputs = createProjectFrontDoorStub.mock.calls[0][0] as any;
      assert.equal(inputs.apiAuth, "api-key");
      assert.equal(inputs["api-auth"], "bearer-token");
      assert.notProperty(inputs, "template-name");
    });

    it("with-plugin=yes and api-plugin-type matches a sub-template → uses subTemplate name", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectStub = vi
        .spyOn(FxCore.prototype, "createProject")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "declarative-agent",
          alias: "da",
          displayName: "Declarative Agent",
          description: "desc",
          language: "typescript",
        },
        {
          name: "declarative-agent-with-action-from-mcp",
          alias: "da-mcp",
          displayName: "DA+MCP",
          description: "desc",
          language: "typescript",
        },
      ] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "declarative-agent",
          "with-plugin": "yes",
          "api-plugin-type": "declarative-agent-with-action-from-mcp",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isOk());
      const inputs = createProjectStub.mock.calls[0][0] as any;
      assert.equal(inputs["template-name"], "declarative-agent-with-action-from-mcp");
    });

    it("with-plugin=yes and api-plugin-type=mcp falls back to actionTemplateMap", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectStub = vi
        .spyOn(FxCore.prototype, "createProject")
        .mockResolvedValue(ok({ projectPath: "..." }));
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      // Only parent template exists; 'mcp' action type is NOT in templates list
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "declarative-agent",
          alias: "da",
          displayName: "Declarative Agent",
          description: "desc",
          language: "typescript",
        },
      ] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "declarative-agent",
          "with-plugin": "yes",
          "api-plugin-type": "mcp",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isOk());
      const inputs = createProjectStub.mock.calls[0][0] as any;
      assert.equal(inputs["template-name"], "declarative-agent-with-action-from-mcp");
    });

    it("createProject result with warnings logs each warning", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(
        ok({
          projectPath: "...",
          warnings: [
            { type: "general", content: "warn1" },
            { type: "general", content: "warn2" },
          ],
        } as any)
      );
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      const warnStub = vi.spyOn(logger, "warning").mockResolvedValue();

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          capabilities: "bot",
          nonInteractive: true,
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isOk());
      assert.equal(warnStub.mock.calls.length, 2);
      assert.equal(warnStub.mock.calls[0][0], "warn1");
      assert.equal(warnStub.mock.calls[1][0], "warn2");
    });

    it("isTdpTemplate=true triggers createProjectFromTdp instead of createProject", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      const createProjectFromTdpStub = vi
        .spyOn(FxCore.prototype, "createProjectFromTdp")
        .mockResolvedValue(ok({ projectPath: "..." }));
      const createProjectStub = vi.spyOn(FxCore.prototype, "createProject");
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([] as any);

      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "new" },
        optionValues: {
          // Providing teamsAppFromTdp with a staticTab makes isTdpTemplate() return true
          teamsAppFromTdp: {
            teamsAppId: "test-app-id",
            staticTabs: [
              {
                objectId: "objId",
                entityId: "entityId",
                name: "tab",
                contentUrl: "https://example.com",
                websiteUrl: "https://example.com",
                scopes: [],
                context: [],
              },
            ],
          } as any,
          nonInteractive: true,
        } as any,
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const res = await getCreateCommand().handler!(ctx);
      assert.isTrue(res.isOk());
      assert.isTrue(createProjectFromTdpStub.mock.calls.length === 1);
      assert.isTrue(createProjectStub.mock.calls.length === 0);
    });
  });

  describe("createSampleCommand", async () => {
    it("happy path", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createSampleProject").mockResolvedValue(
        ok({ projectPath: "..." })
      );
      const ctx: CLIContext = {
        command: { ...createSampleCommand, fullName: "new sample" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await createSampleCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("core return error", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(err(new UserCancelError()));
      const ctx: CLIContext = {
        command: { ...createSampleCommand, fullName: "new sample" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await createSampleCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });
  describe("listSampleCommand", async () => {
    it("happy path", async () => {
      vi.spyOn(utils, "getTemplates").mockResolvedValue([]);
      const ctx: CLIContext = {
        command: {
          ...listSamplesCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} list samples`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await listSamplesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("accountLoginAzureCommand", async () => {
    it("should success when service-principal = false", async () => {
      vi.spyOn(AzureTokenProvider, "signout");
      vi.spyOn(accountUtils, "outputAzureInfo").mockResolvedValue();
      const ctx: CLIContext = {
        command: {
          ...accountLoginAzureCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth login azure`,
        },
        optionValues: { "service-principal": false },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountLoginAzureCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should fail when service-principal = true", async () => {
      vi.spyOn(AzureTokenProvider, "signout");
      vi.spyOn(accountUtils, "outputAzureInfo").mockResolvedValue();
      const ctx: CLIContext = {
        command: {
          ...accountLoginAzureCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth login azure`,
        },
        optionValues: { "service-principal": true },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountLoginAzureCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("should fail service-principal = false", async () => {
      vi.spyOn(AzureTokenProvider, "signout");
      vi.spyOn(accountUtils, "outputAzureInfo").mockResolvedValue();
      const ctx: CLIContext = {
        command: {
          ...accountLoginAzureCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth login azure`,
        },
        optionValues: { "service-principal": false, username: "abc" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountLoginAzureCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });
  describe("accountLoginM365Command", async () => {
    it("should success", async () => {
      vi.spyOn(M365TokenProvider, "signout");
      vi.spyOn(accountUtils, "outputM365Info").mockResolvedValue();
      const ctx: CLIContext = {
        command: {
          ...accountLoginM365Command,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} auth login m365`,
        },
        optionValues: { "service-principal": false },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await accountLoginM365Command.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("addSPFxWebpartCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "addWebpart").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...addSPFxWebpartCommand, fullName: "add spfx-web-part" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await addSPFxWebpartCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("addPluginCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "addPlugin").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...addPluginCommand, fullName: "add plugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await addPluginCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("importOpenPluginCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "importOpenPlugin").mockResolvedValue(
        ok({ projectPath: "/tmp/imported", warnings: [] })
      );
      const ctx: CLIContext = {
        command: { ...importOpenPluginCommand, fullName: "import openplugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await importOpenPluginCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });

    it("logs warnings returned by importOpenPlugin", async () => {
      vi.spyOn(FxCore.prototype, "importOpenPlugin").mockResolvedValue(
        ok({
          projectPath: "/tmp/imported",
          warnings: [{ type: "openPluginImport", content: "test warning" }],
        })
      );
      const ctx: CLIContext = {
        command: { ...importOpenPluginCommand, fullName: "import openplugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await importOpenPluginCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });

    it("propagates errors from importOpenPlugin", async () => {
      vi.spyOn(FxCore.prototype, "importOpenPlugin").mockResolvedValue(
        err(new SystemError("OpenPluginImport", "Boom", "boom"))
      );
      const ctx: CLIContext = {
        command: { ...importOpenPluginCommand, fullName: "import openplugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await importOpenPluginCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("exportOpenPluginCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "exportOpenPlugin").mockResolvedValue(
        ok({ outputPath: "/tmp/exported", warnings: [] })
      );
      const ctx: CLIContext = {
        command: { ...exportOpenPluginCommand, fullName: "export openplugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await exportOpenPluginCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });

    it("logs warnings returned by exportOpenPlugin", async () => {
      vi.spyOn(FxCore.prototype, "exportOpenPlugin").mockResolvedValue(
        ok({
          outputPath: "/tmp/exported",
          warnings: [{ type: "openPluginExport", content: "test warning" }],
        })
      );
      const ctx: CLIContext = {
        command: { ...exportOpenPluginCommand, fullName: "export openplugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await exportOpenPluginCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });

    it("propagates errors from exportOpenPlugin", async () => {
      vi.spyOn(FxCore.prototype, "exportOpenPlugin").mockResolvedValue(
        err(new SystemError("OpenPluginExport", "Boom", "boom"))
      );
      const ctx: CLIContext = {
        command: { ...exportOpenPluginCommand, fullName: "export openplugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await exportOpenPluginCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("regeneratePlguinCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "regeneratePlugin").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...regeneratePluginCommand, fullName: "regenerate plugin" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await regeneratePluginCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("addCapabilityCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "addKnowledge").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...addCapabilityCommand, fullName: "add capability" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await addCapabilityCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("getAddCommand", async () => {
    it("customize GPT is enabled", async () => {
      const commands = addCommand();
      assert.isTrue(commands.commands?.length === 4);
    });
  });

  describe("deployCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "deployArtifacts").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...deployCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await deployCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("success for customized yaml path", async () => {
      vi.spyOn(FxCore.prototype, "deployArtifacts").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...deployCommand, fullName: "teamsfx" },
        optionValues: { "config-file-path": "fakePath" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await deployCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("envAddCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "createEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(true);
      const ctx: CLIContext = {
        command: { ...envAddCommand, fullName: "teamsfx" },
        optionValues: { projectPath: "." },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envAddCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("isValidProjectV3: false", async () => {
      vi.spyOn(FxCore.prototype, "createEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(false);
      const ctx: CLIContext = {
        command: { ...envAddCommand, fullName: "teamsfx" },
        optionValues: { projectPath: "." },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envAddCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("uses empty string when projectPath is undefined", async () => {
      vi.spyOn(FxCore.prototype, "createEnv").mockResolvedValue(ok(undefined));
      const validStub = vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(true);
      const ctx: CLIContext = {
        command: { ...envAddCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envAddCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      assert.isTrue(validStub.mock.calls[0][0] === "");
    });
  });
  describe("envListCommand", async () => {
    it("success", async () => {
      vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(true);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      const ctx: CLIContext = {
        command: { ...envListCommand, fullName: "teamsfx" },
        optionValues: { projectPath: "." },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envListCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("isValidProjectV3: false", async () => {
      vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(false);
      const ctx: CLIContext = {
        command: { ...envListCommand, fullName: "teamsfx" },
        optionValues: { projectPath: "." },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envListCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("listEnv error", async () => {
      vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(true);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(err(new UserCancelError()));
      const ctx: CLIContext = {
        command: { ...envListCommand, fullName: "teamsfx" },
        optionValues: { projectPath: "." },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envListCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("uses empty string when projectPath is undefined", async () => {
      const validStub = vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(true);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      const ctx: CLIContext = {
        command: { ...envListCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envListCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      assert.isTrue(validStub.mock.calls[0][0] === "");
    });
  });
  describe("envResetCommand", async () => {
    it("success with env", async () => {
      vi.spyOn(envUtil, "resetEnv").mockResolvedValue();
      const ctx: CLIContext = {
        command: { ...envAddCommand, fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} env reset` },
        optionValues: { env: "dev", projectPath: "." },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envResetCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("success with env file", async () => {
      vi.spyOn(envUtil, "resetEnvFile").mockResolvedValue();
      const ctx: CLIContext = {
        command: { ...envAddCommand, fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} env reset` },
        optionValues: { "env-file": ".env.dev" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await envResetCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("provisionCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "provisionResources").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...provisionCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await provisionCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("non interactive mode", async () => {
      vi.spyOn(FxCore.prototype, "provisionResources").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...provisionCommand, fullName: "teamsfx" },
        optionValues: { nonInteractive: true, region: "East US" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await provisionCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("packageCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "createAppPackage").mockResolvedValue(ok({ state: "OK" }));
      const ctx: CLIContext = {
        command: { ...packageCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await packageCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("permissionGrantCommand", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("success with agent option", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(FxCore.prototype, "grantPermission").mockResolvedValue(
        ok({ state: "OK" } as PermissionsResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionGrantCommand, fullName: "teamsfx" },
        optionValues: { agent: true, email: "email", env: "dev" },
        globalOptionValues: { interactive: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionGrantCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      const inputs = ctx.optionValues as PermissionGrantInputs;
      assert.deepEqual(inputs[QuestionNames.collaborationAppType], [
        CollaborationConstants.AgentOptionId,
      ]);
    });

    it("success with agent option in interactive mode", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(FxCore.prototype, "grantPermission").mockResolvedValue(
        ok({ state: "OK" } as PermissionsResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionGrantCommand, fullName: "teamsfx" },
        optionValues: { agent: true },
        globalOptionValues: { interactive: true },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionGrantCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      const inputs = ctx.optionValues as PermissionGrantInputs;
      assert.deepEqual(inputs[QuestionNames.collaborationAppType], [
        CollaborationConstants.AgentOptionId,
      ]);
    });

    it("missing manifest options with agent = false", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(FxCore.prototype, "grantPermission").mockResolvedValue(
        ok({ state: "OK" } as PermissionsResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionGrantCommand, fullName: "teamsfx" },
        optionValues: { env: "dev", email: "email", agent: false },
        globalOptionValues: { interactive: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionGrantCommand.handler!(ctx);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof MissingRequiredOptionError);
      }
    });

    it("success interactive = false", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(FxCore.prototype, "grantPermission").mockResolvedValue(
        ok({ state: "OK" } as PermissionsResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionGrantCommand, fullName: "teamsfx" },
        optionValues: { "manifest-path": "abc" },
        globalOptionValues: { interactive: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionGrantCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });

    it("success interactive = true", async () => {
      vi.spyOn(FxCore.prototype, "grantPermission").mockResolvedValue(
        ok({ state: "OK" } as PermissionsResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionGrantCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: { interactive: true },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionGrantCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("missing option", async () => {
      vi.spyOn(FxCore.prototype, "grantPermission").mockResolvedValue(
        ok({ state: "OK" } as PermissionsResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionGrantCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: { interactive: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionGrantCommand.handler!(ctx);
      assert.isTrue(res.isErr() && res.error instanceof MissingRequiredOptionError);
    });
  });
  describe("permissionStatusCommand", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("listCollaborator with agent option", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(FxCore.prototype, "listCollaborator").mockResolvedValue(
        ok({ state: "OK" } as ListCollaboratorResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionStatusCommand, fullName: "teamsfx" },
        optionValues: { all: true, agent: true },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionStatusCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      const inputs = ctx.optionValues as PermissionListInputs;
      assert.deepEqual(inputs[QuestionNames.collaborationAppType], [
        CollaborationConstants.AgentOptionId,
      ]);
    });

    it("checkPermission with agent option", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(FxCore.prototype, "checkPermission").mockResolvedValue(
        ok({ state: "OK" } as CollaborationStateResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionStatusCommand, fullName: "teamsfx" },
        optionValues: { all: false, agent: true },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionStatusCommand.handler!(ctx);
      assert.isTrue(res.isOk());
      const inputs = ctx.optionValues as PermissionListInputs;
      assert.deepEqual(inputs[QuestionNames.collaborationAppType], [
        CollaborationConstants.AgentOptionId,
      ]);
    });

    it("listCollaborator", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(FxCore.prototype, "listCollaborator").mockResolvedValue(
        ok({ state: "OK" } as ListCollaboratorResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionStatusCommand, fullName: "teamsfx" },
        optionValues: { all: true },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionStatusCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });

    it("checkPermission", async () => {
      vi.spyOn(FxCore.prototype, "checkPermission").mockResolvedValue(
        ok({ state: "OK" } as CollaborationStateResult)
      );
      const ctx: CLIContext = {
        command: { ...permissionStatusCommand, fullName: "teamsfx" },
        optionValues: { all: false },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await permissionStatusCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("publishCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "publishApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...publishCommand, fullName: "teamsfx" },
        optionValues: { env: "local" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await publishCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("shareCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "shareApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...shareCommand, fullName: "teamsfx" },
        optionValues: { env: "dev" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await shareCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("shareRemoveCommand", async () => {
    it("share with owners", async () => {
      vi.spyOn(FxCore.prototype, "removeSharedAccess").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...shareRemoveCommand, fullName: "teamsfx" },
        optionValues: { env: "dev" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await shareRemoveCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("share with users", async () => {
      vi.spyOn(FxCore.prototype, "shareApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...shareRemoveCommand, fullName: "teamsfx" },
        optionValues: { env: "dev", users: "test@example.com" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await shareRemoveCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("previewCommand", async () => {
    it("success", async () => {
      vi.spyOn(localTelemetryReporter, "runWithTelemetryGeneric").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...previewCommand, fullName: "teamsfx" },
        optionValues: { env: "local" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await previewCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("error", async () => {
      vi.spyOn(localTelemetryReporter, "runWithTelemetryGeneric").mockResolvedValue(
        err(new UserCancelError())
      );
      const ctx: CLIContext = {
        command: { ...previewCommand, fullName: "teamsfx" },
        optionValues: { env: "local" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await previewCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });
  describe("entraAppUpdateCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "deployAadManifest").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...entraAppUpdateCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} entraapp update`,
        },
        optionValues: {
          env: "local",
          projectPath: "./",
          "manifest-file-path": "./aad.manifest.json",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await entraAppUpdateCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
  describe("validateCommand", async () => {
    it("conflict", async () => {
      vi.spyOn(FxCore.prototype, "validateApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...validateCommand, fullName: "teamsfx" },
        optionValues: { "manifest-path": "aaa", "app-package-file-path": "bbb" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await validateCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("none", async () => {
      vi.spyOn(FxCore.prototype, "validateApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...validateCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await validateCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("manifest", async () => {
      vi.spyOn(FxCore.prototype, "validateApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...validateCommand, fullName: "teamsfx" },
        optionValues: { "manifest-path": "aaa", env: "dev" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await validateCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("manifest missing env", async () => {
      vi.spyOn(FxCore.prototype, "validateApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...validateCommand, fullName: "teamsfx" },
        optionValues: { "manifest-path": "aaa" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await validateCommand.handler!(ctx);
      assert.isTrue(res.isErr() && res.error instanceof MissingRequiredOptionError);
    });
    it("package", async () => {
      vi.spyOn(FxCore.prototype, "validateApplication").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...validateCommand, fullName: "teamsfx" },
        optionValues: { "app-package-file-path": "bbb" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await validateCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("m365LaunchInfoCommand", async () => {
    beforeEach(() => {
      vi.spyOn(logger, "warning");
    });
    it("success retrieveTitleId", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("id");
      vi.spyOn(PackageService.prototype, "getLaunchInfoByTitleId").mockResolvedValue("id");
      const ctx: CLIContext = {
        command: { ...m365LaunchInfoCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365LaunchInfoCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("success", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "getLaunchInfoByTitleId").mockResolvedValue("id");
      const ctx: CLIContext = {
        command: { ...m365LaunchInfoCommand, fullName: "teamsfx" },
        optionValues: { "title-id": "aaa" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365LaunchInfoCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("MissingRequiredOptionError", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      const ctx: CLIContext = {
        command: { ...m365LaunchInfoCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365LaunchInfoCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("m365SideloadingCommand", async () => {
    beforeEach(() => {
      vi.spyOn(logger, "warning");
    });

    describe("M365Utils - getTokenAndUpn", async () => {
      it("getAccessToken fail", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(err(new UserCancelError()));
        try {
          await m365utils.getTokenAndUpn();
          assert.fail("should not reach here");
        } catch (e) {
          assert.isTrue(e instanceof UserCancelError);
        }
      });
      it("getStatus fail", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok("token"));
        vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(err(new UserCancelError()));
        const res = await m365utils.getTokenAndUpn();
        assert.deepEqual(res, ["token", undefined]);
      });
      it("getStatus ok", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok("token"));
        vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(
          ok({ accountInfo: { upn: "test" } } as any)
        );
        const res = await m365utils.getTokenAndUpn();
        assert.deepEqual(res, ["token", "test"]);
      });
      it("getStatus throw error", async () => {
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok("token"));
        vi.spyOn(M365TokenProvider, "getStatus").mockRejectedValue(new Error());
        const res = await m365utils.getTokenAndUpn();
        assert.deepEqual(res, ["token", undefined]);
      });
    });

    it("should success with zip package", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue(["", "", ""]);
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "file-path": "./" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should success with zip package with Personal scope", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue(["", "", ""]);
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "file-path": "./", scope: "Personal" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should success with zip package with Shared scope", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue(["", "", "share link"]);
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "file-path": "./", scope: "Shared" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should success with zip package with Shared scope - lower case", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue(["", "", "share link"]);
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "file-path": "./", scope: "shared" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should success with zip package with unknown scope", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue(["", "", ""]);
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "file-path": "./", scope: "unknown" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should success with xml", async () => {
      vi.spyOn(m365utils, "getTokenAndUpn").mockResolvedValue(["token", "upn"]);
      vi.spyOn(PackageService.prototype, "sideLoadXmlManifest").mockResolvedValue();
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "xml-path": "./" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("should fail if both zip and xml are provided", async () => {
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa", "xml-path": "./", "file-path": "./" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("should fail if non of zip and xml are provided", async () => {
      const ctx: CLIContext = {
        command: { ...m365SideloadingCommand, fullName: "teamsfx" },
        optionValues: { "manifest-id": "aaa" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365SideloadingCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("m365UnacquireCommand", async () => {
    beforeEach(() => {
      vi.spyOn(logger, "warning");
    });
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "uninstall").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...m365UnacquireCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365UnacquireCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("failed", async () => {
      vi.spyOn(FxCore.prototype, "uninstall").mockResolvedValue(err(new SystemError("", "", "")));
      const ctx: CLIContext = {
        command: { ...m365UnacquireCommand, fullName: "teamsfx" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await m365UnacquireCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("v3 commands", async () => {
    beforeEach(() => {
      vi.spyOn(logger, "warning");
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("update", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "updateTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappUpdateCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} update`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappUpdateCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("update conflict", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "updateTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappUpdateCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} update`,
        },
        optionValues: { "manifest-file": "manifest.json", "package-file": "package.zip" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappUpdateCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("package", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "packageTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappPackageCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} package`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappPackageCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("validate", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "validateTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappValidateCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} validate`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappValidateCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("validate conflict", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "validateTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappValidateCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} validate`,
        },
        optionValues: { "manifest-file": "manifest.json", "package-file": "package.zip" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappValidateCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
    it("publish", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "publishTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappPublishCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} publish`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappPublishCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("publish conflict", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "publishTeamsAppCLIV3").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: {
          ...teamsappPublishCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} publish`,
        },
        optionValues: { "manifest-file": "manifest.json", "package-file": "package.zip" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappPublishCommand.handler!(ctx);
      assert.isTrue(res.isErr());
    });
  });

  describe("addAuthConfigCommand", async () => {
    it("success", async () => {
      vi.spyOn(FxCore.prototype, "addAuthAction").mockResolvedValue(ok(undefined));
      const ctx: CLIContext = {
        command: { ...addAuthConfigCommand, fullName: "add auth-config" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await addAuthConfigCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
});
