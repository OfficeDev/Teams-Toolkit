// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import { AuthType, ListAPIResult, ProjectType, SpecParser } from "@microsoft/m365-spec-parser";
import {
  AppPackageFolderName,
  DefaultApiSpecFolderName,
  FxError,
  Inputs,
  ManifestTemplateFileName,
  Platform,
  Result,
  Stage,
  SystemError,
  UserError,
  Warning,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import { listAPIInfo } from "../common/daSpecParser";
import { FeatureFlags, featureFlagManager } from "../common/featureFlags";
import { ErrorContextMW, TOOLS, createContext } from "../common/globalVars";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import { TelemetryEvent } from "../common/telemetry";
import { MetadataV3, MetadataV4 } from "../common/versionMetadata";
import { LocalMcpPrefix } from "../component/constants";
import { AppStudioError } from "../component/driver/teamsApp/errors";
import { AppStudioResultFactory } from "../component/driver/teamsApp/results";
import { copilotGptManifestUtils } from "../component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../component/driver/teamsApp/utils/ManifestUtils";
import { pluginManifestUtils } from "../component/driver/teamsApp/utils/PluginManifestUtils";
import { normalizePath } from "../component/driver/teamsApp/utils/utils";
import * as declarativeAgentHelperModule from "../component/generator/declarativeAgent/helper";
import { deriveMCPServerNameFromUrl } from "../component/generator/declarativeAgent/helper";
import { templateDefaultOnActionError } from "../component/generator/generator";
import { GeneratorContext } from "../component/generator/generatorAction";
import * as openApiSpecHelperModule from "../component/generator/openApiSpec/helper";
import { getParserOptions } from "../component/generator/openApiSpec/helper";
import {
  ResolvedV4ChannelPackage,
  scaffoldDeclarativeFromV4Channel,
} from "../component/generator/v4TemplateBridge";
import { QuestionMW } from "../component/middleware/questionMW";
import { outputScaffoldingWarningMessage } from "../component/utils/common";
import {
  ResolvedMCPAuthEndpoints,
  deriveMCPManifestOAuth,
  injectMCPAuthActionToYml,
  resolveMCPAuthEndpoints,
} from "../component/utils/mcpAuthScaffolder";
import { pathUtils } from "../component/utils/pathUtils";
import { UserCancelError, assembleError } from "../error/common";
import { ActionStartOptions, QuestionNames } from "../question/constants";
import { CreateNewPluginManifestSentinel } from "../question/scaffold/vsc/teamsProjectTypeNode";
import type { Answers, BuildTarget } from "../v4";
import { ConcurrentLockerMW } from "./middleware/concurrentLocker";
import { ErrorHandlerMW } from "./middleware/errorHandler";
import { modifyProjectFrontDoor } from "./modifyProjectFrontDoor";
import { resolveV4TemplateArtifactSnapshot } from "./v4ArtifactSnapshot";

export interface ScaffoldAddMcpServerFromV4Options {
  templateId: string;
  projectPath: string;
  platform?: Platform;
  teamsManifestPath: string;
  appName: string;
  mcpServerUrl: string;
  authType: string;
  resolvedPackage?: ResolvedV4ChannelPackage;
}

function targetRelativePath(projectPath: string, filePath: string): string {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectPath, filePath);
  return path.relative(projectPath, absolute).replace(/\\/g, "/");
}

function stringAnswer(answers: Answers, key: string): string | undefined {
  const value = answers[key];
  return typeof value === "string" ? value : undefined;
}

function unsupportedModifyTarget(target: BuildTarget): SystemError {
  return new SystemError({
    source: "Scaffold",
    name: "UnsupportedModifyEngine",
    message: `The add MCP server flow does not handle the '${target.engine}' modify target '${target.templateId}'.`,
  });
}

async function scaffoldAddMcpServerFromV4(
  options: ScaffoldAddMcpServerFromV4Options
): Promise<Result<undefined, FxError>> {
  const context: GeneratorContext = {
    name: options.appName,
    language: "common",
    platform: options.platform,
    destination: options.projectPath,
    logProvider: TOOLS.logProvider,
    onActionError: templateDefaultOnActionError,
  };
  try {
    const source = await scaffoldDeclarativeFromV4Channel(
      context,
      { kind: "modify", templateId: options.templateId },
      {
        mcpServerUrl: options.mcpServerUrl,
        teamsManifestPath: targetRelativePath(options.projectPath, options.teamsManifestPath),
        authType: options.authType,
      },
      { appName: options.appName, language: "common" },
      undefined,
      undefined,
      options.resolvedPackage
    );
    if (source.warning) {
      TOOLS.logProvider.warning(source.warning);
    }
  } catch (error) {
    return err(assembleError(error));
  }
  return ok(undefined);
}

// Non-translatable CLI command template used in warning messages
const mcpAddActionHint =
  "atk add action --api-plugin-type mcp --mcp-da-server-url <server-url> --mcp-tools-file-path <path-to-tools-json> --interactive false";

export const fxCoreDeclarativeAgentDeps = {
  addExistingPlugin: declarativeAgentHelperModule.addExistingPlugin,
  createNewActionPluginManifest: declarativeAgentHelperModule.createNewActionPluginManifest,
  deriveMCPServerNameFromUrl,
  generateFromApiSpec: openApiSpecHelperModule.generateFromApiSpec,
  generateScaffoldingSummary: openApiSpecHelperModule.generateScaffoldingSummary,
  modifyProjectFrontDoor,
  resolveV4TemplateArtifactSnapshot,
  scaffoldAddMcpServerFromV4,
};
export class FxCoreDeclarativeAgentPart {
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.installApp }),
    ErrorHandlerMW,
    QuestionMW("updateActionWithMCP"),
    ConcurrentLockerMW,
  ])
  async updateActionWithMCP(inputs: Inputs): Promise<Result<any, FxError>> {
    const context = createContext();
    const projectPath = inputs.projectPath;
    if (!projectPath) {
      throw new Error("projectPath is undefined"); // should never happen
    }
    let aiPluginFilePath = inputs[QuestionNames.PluginManifestFilePath] as string;

    // If the user picked the "Create a new ai-plugin.json" option in the question,
    // the value will be the sentinel. Generate a fresh skeleton manifest under
    // appPackage using the file name from the follow-up text question and
    // register it as a new action of the declarative agent before continuing
    // with the regular update flow.
    if (aiPluginFilePath === CreateNewPluginManifestSentinel) {
      const desiredFileName =
        (inputs[QuestionNames.NewPluginManifestFileName] as string) || "ai-plugin.json";
      const teamsManifestPath = path.join(
        projectPath,
        AppPackageFolderName,
        ManifestTemplateFileName
      );
      const manifestRes = await manifestUtils._readAppManifest(teamsManifestPath);
      if (manifestRes.isErr()) {
        return err(manifestRes.error);
      }
      const declarativeAgentRelativePath =
        manifestRes.value?.copilotAgents?.declarativeAgents?.[0]?.file;
      if (!declarativeAgentRelativePath) {
        return err(
          AppStudioResultFactory.UserError(
            AppStudioError.TeamsAppRequiredPropertyMissingError.name,
            AppStudioError.TeamsAppRequiredPropertyMissingError.message(
              "declarativeAgents",
              teamsManifestPath
            )
          )
        );
      }
      const declarativeAgentManifestPath = path.join(
        projectPath,
        AppPackageFolderName,
        declarativeAgentRelativePath
      );
      const createRes = await declarativeAgentHelperModule.createNewActionPluginManifest(
        projectPath,
        desiredFileName,
        declarativeAgentManifestPath
      );
      if (createRes.isErr()) {
        return err(createRes.error);
      }
      aiPluginFilePath = createRes.value.pluginManifestPath;
      inputs[QuestionNames.PluginManifestFilePath] = aiPluginFilePath;
    }

    if (!(await fs.pathExists(aiPluginFilePath))) {
      const error = new SystemError(
        "MCPForDAPluginManifestNotFound",
        "PluginManifestNotFound",
        getDefaultString("core.MCPForDA.pluginManifestNotFound", aiPluginFilePath),
        getLocalizedString("core.MCPForDA.pluginManifestNotFound", aiPluginFilePath)
      );
      return err(error);
    }
    const aiPluginFilePathRelative = path.basename(aiPluginFilePath);

    const mcpServerUrl = inputs[QuestionNames.MCPForDAServerUrl];
    const serverName = inputs[QuestionNames.MCPForDAServerName] as string;
    const mcpAuth = inputs[QuestionNames.MCPForDAAuth];
    const authType = inputs[QuestionNames.MCPForDAAuthType];

    let mcpAuthEndpoints: ResolvedMCPAuthEndpoints = {};
    let registrationId: string | undefined = undefined;

    if (mcpAuth === "OAuthPluginVault") {
      try {
        registrationId = `MCP_DA_AUTH_ID_${serverName.toUpperCase()}`;
        mcpAuthEndpoints = await resolveMCPAuthEndpoints(authType, inputs);
      } catch (error: any) {
        void context.userInteraction.showMessage(
          "error",
          getLocalizedString("core.MCPForDA.mcpAuthMetadataMissingError", error.message),
          false
        );
      }
    }

    // 2. Read ai-plugin.json
    const aiPluginContent = await fs.readJSON(aiPluginFilePath);

    // For dynamic fetch tools, keep the functions empty and add runtime info
    // TODO: support dynamic fetch tools in the future
    const mcpToolsDetail = inputs[QuestionNames.MCPForDAAvailableTools];
    const mcpToolsSelected = inputs[QuestionNames.MCPForDAPreFetchTools];
    if (!mcpToolsDetail || !mcpToolsSelected) {
      const error = new UserError(
        "MCPForDAPreFetchToolsNotFound",
        "PreFetchToolsNotFound",
        getDefaultString("core.MCPForDA.preFetchToolsNotFound"),
        getLocalizedString("core.MCPForDA.preFetchToolsNotFound")
      );
      return err(error);
    }

    const pluginFunctions = Array.isArray(aiPluginContent.functions)
      ? aiPluginContent.functions
      : [];
    const pluginRuntimes = Array.isArray(aiPluginContent.runtimes) ? aiPluginContent.runtimes : [];

    const toolsSelectedPrevious: string[] = [];
    pluginRuntimes
      .filter(
        (runtime: any) =>
          (runtime.type === "RemoteMCPServer" && runtime.spec?.url === mcpServerUrl) ||
          runtime.type === "LocalPlugin"
      )
      .forEach((runtime: any) => {
        if (Array.isArray(runtime.run_for_functions)) {
          toolsSelectedPrevious.push(...runtime.run_for_functions);
        }
      });
    aiPluginContent.functions = pluginFunctions.filter(
      (func: any) => !toolsSelectedPrevious.includes(func.name)
    );
    aiPluginContent.functions = [
      ...aiPluginContent.functions,
      ...mcpToolsDetail
        .filter((tool: any) => mcpToolsSelected.includes(tool.name))
        .map((tool: any) => {
          if (inputs[QuestionNames.MCPLocalServerIdentifier] != null) {
            return {
              name: tool.name,
              description: tool.description,
              parameters: {
                type: tool.inputSchema.type || "object",
                properties: tool.inputSchema.properties,
                required: tool.inputSchema.required || [],
              },
            };
          } else {
            return {
              name: tool.name,
              description: tool.description,
            };
          }
        }),
    ];

    const matchedRuntime = pluginRuntimes.find(
      (runtime: any) => runtime.type === "RemoteMCPServer" && runtime.spec?.url === mcpServerUrl
    );

    aiPluginContent.runtimes = pluginRuntimes.filter(
      (runtime: any) =>
        (runtime.type !== "RemoteMCPServer" && runtime.type !== "LocalPlugin") ||
        runtime.spec?.url !== mcpServerUrl
    );

    if (inputs[QuestionNames.MCPLocalServerIdentifier] != null) {
      (aiPluginContent.runtimes as any[]).push({
        type: "LocalPlugin",
        spec: {
          local_endpoint: `${LocalMcpPrefix}${
            inputs[QuestionNames.MCPLocalServerIdentifier] as string
          }`,
        },
        run_for_functions: mcpToolsSelected,
      });
    } else {
      let mcpFile = matchedRuntime?.spec.mcp_tool_description?.file;
      if (!mcpFile) {
        mcpFile = "mcp-tools.json";
        let suffix = 1;
        while (await fs.pathExists(path.join(path.dirname(aiPluginFilePath), mcpFile))) {
          mcpFile = `mcp-tools-${suffix}.json`;
          suffix += 1;
        }
      }
      await fs.writeJSON(
        path.join(path.dirname(aiPluginFilePath), mcpFile),
        {
          tools: [
            ...mcpToolsDetail
              .filter((tool: any) => mcpToolsSelected.includes(tool.name))
              .map((tool: any) => {
                return {
                  ...tool,
                  title: (tool.name as string)
                    .replace(/_/g, " ")
                    .replace(/^./, (str) => str.toUpperCase()),
                };
              }),
          ],
        },
        { spaces: 4 }
      );
      (aiPluginContent.runtimes as any[]).push({
        type: "RemoteMCPServer",
        spec: {
          url: mcpServerUrl,
          mcp_tool_description: {
            file: mcpFile,
          },
        },
        run_for_functions: mcpToolsSelected,
        auth: deriveMCPManifestOAuth(authType, registrationId) ?? {
          type: "None",
        },
      });
    }

    if (mcpAuth === "OAuthPluginVault" && !!registrationId) {
      // insert oauth info in teamsapp.yaml
      await injectMCPAuthActionToYml({
        ymlPath: pathUtils.getYmlFilePath(projectPath) as string,
        authType,
        authName: serverName,
        registrationId,
        mcpServerUrl,
        endpoints: mcpAuthEndpoints,
      });
    }
    void context.userInteraction
      .showMessage(
        "info",
        getLocalizedString("core.MCPForDA.updatePluginManifest", aiPluginFilePathRelative),
        false,
        "Provision"
      )
      .then((result) => {
        if (result.isOk() && result.value === "Provision") {
          void this.provisionResources(inputs);
        }
      });
    await fs.writeJSON(aiPluginFilePath, aiPluginContent, { spaces: 4 });
    void context.userInteraction.openFile?.(aiPluginFilePath);
    return ok(undefined);
  }

  // This method will be implemented by FxCore
  provisionResources(_inputs: Inputs): Promise<Result<any, FxError>> {
    throw new Error("Method not implemented.");
  }

  // These methods will be implemented by FxCore
  protected parseAuthNameAndScheme(
    _listResult: ListAPIResult,
    _inputs: Inputs
  ): { authName: string; authScheme: AuthType }[] {
    throw new Error("Method not implemented.");
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async updateAuthActionInYaml(
    _authName: string | undefined,
    _authScheme: AuthType | undefined,
    _projectPath: string,
    _apSpecPath: string,
    _pluginManifestPath: string,
    _forceToAddNew?: boolean
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  /**
   * Add plugin
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.addPlugin }),
    ErrorHandlerMW,
    QuestionMW("addPlugin"),
    ConcurrentLockerMW,
  ])
  async addPlugin(inputs: Inputs): Promise<Result<undefined | any, FxError>> {
    if (!inputs.projectPath) {
      throw new Error("projectPath is undefined"); // should never happen
    }
    const projectPath = inputs.projectPath;

    const context = createContext();
    const isGenerateFromApiSpec =
      inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id;
    const isGenerateFromMCP = inputs[QuestionNames.ActionType] === ActionStartOptions.mcp().id;

    // VS Code MCP "Add Action" flow: aligned with the "DA with MCP" scaffolding
    // behavior. Only the MCP server URL is collected from the user. The toolkit
    // writes the URL into .vscode/mcp.json and signals the caller to open the
    // file and surface the "start MCP server / Fetch Action" notification, which
    // already exists for the scaffolding flow. The actual plugin manifest and DA
    // action are produced later by the "Update Action with MCP" command.
    //
    // The CLI flow (below) keeps the original non-interactive behavior of
    // probing the MCP server, fetching tools and writing ai-plugin.json + yaml
    // OAuth registration, since the CLI has no equivalent notification UX.
    //
    // Under the Dynamic Tool Discovery (DT) flag this early redirect is skipped
    // so that VS Code runs the same inline scaffolder as the CLI — the
    // CodeLens "fetch action" hop is absorbed into add-action itself.
    if (
      isGenerateFromMCP &&
      inputs.platform === Platform.VSCode &&
      !featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT)
    ) {
      return await this.addPluginFromMCP(inputs, context);
    }

    // VS Code MCP inline flow (DT on) skips the Teams-manifest picker; infer
    // the path from `projectPath/appPackage/manifest.json` to match the leaner
    // `updateActionWithMCP` UX. CLI and non-MCP flows still supply ManifestPath
    // via the question tree / `--manifest-file`.
    const teamsManifestPath =
      (inputs[QuestionNames.ManifestPath] as string | undefined) ??
      path.join(inputs.projectPath, AppPackageFolderName, ManifestTemplateFileName);
    const appPackageFolder = path.dirname(teamsManifestPath);

    // validate the project is valid for adding plugin
    const manifestRes = await manifestUtils._readAppManifest(teamsManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const teamsManifest = manifestRes.value;
    const declarativeGpt = teamsManifest.copilotExtensions
      ? teamsManifest.copilotExtensions.declarativeCopilots?.[0]
      : teamsManifest.copilotAgents?.declarativeAgents?.[0];
    if (!declarativeGpt?.file) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppRequiredPropertyMissingError.name,
          AppStudioError.TeamsAppRequiredPropertyMissingError.message(
            "declarativeAgents",
            teamsManifestPath
          )
        )
      );
    }
    const gptManifestFilePathRes = await copilotGptManifestUtils.getManifestPath(teamsManifestPath);
    if (gptManifestFilePathRes.isErr()) {
      return err(gptManifestFilePathRes.error);
    }

    const declarativeCopilotManifestPath = gptManifestFilePathRes.value;

    const declarativeCopilotManifesRes = await copilotGptManifestUtils.readCopilotGptManifestFile(
      declarativeCopilotManifestPath
    );
    if (declarativeCopilotManifesRes.isErr()) {
      return err(declarativeCopilotManifesRes.error);
    }

    const declarativeCopilotManifest = declarativeCopilotManifesRes.value;
    const mcpAuthTypeChoice = inputs[QuestionNames.MCPForDAAuthType] as string | undefined;
    const mcpTouchesYml = isGenerateFromMCP && mcpAuthTypeChoice && mcpAuthTypeChoice !== "none";
    let confirmMessage = getLocalizedString(
      isGenerateFromMCP
        ? mcpTouchesYml
          ? "core.addApi.confirm.mcp.teamsYaml"
          : "core.addApi.confirm.mcp"
        : "core.addApi.confirm",
      path.relative(inputs.projectPath, appPackageFolder),
      ...(mcpTouchesYml ? [MetadataV4.configFile] : [])
    );

    // Will be used if generating from API spec
    let specParser: SpecParser | undefined = undefined;
    let authNameAndSchemes: { authName: string; authScheme: AuthType }[] = [];

    if (isGenerateFromApiSpec) {
      specParser = new SpecParser(
        inputs[QuestionNames.ApiSpecLocation].trim(),
        getParserOptions(ProjectType.Copilot, true)
      );
      const listResult = await listAPIInfo(inputs[QuestionNames.ApiSpecLocation].trim());
      authNameAndSchemes = this.parseAuthNameAndScheme(listResult, inputs);

      if (authNameAndSchemes.length > 0) {
        const doesLocalYamlPathExists = await fs.pathExists(
          path.join(inputs.projectPath, MetadataV3.localConfigFile)
        );
        confirmMessage = doesLocalYamlPathExists
          ? getLocalizedString(
              "core.addApi.confirm.localTeamsYaml",
              path.relative(inputs.projectPath, appPackageFolder),
              MetadataV4.localConfigFile,
              MetadataV4.configFile
            )
          : getLocalizedString(
              "core.addApi.confirm.teamsYaml",
              path.relative(inputs.projectPath, appPackageFolder),
              MetadataV4.configFile
            );
      }
    }

    // confirm
    // VS Code MCP inline flow (DT on) skips the confirmation modal to match
    // the leaner `updateActionWithMCP` UX; writes happen as soon as the last
    // required answer is provided. CLI interactive and other flows still show it.
    const skipConfirmModal =
      isGenerateFromMCP &&
      inputs.platform === Platform.VSCode &&
      featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT);

    if (!skipConfirmModal) {
      const confirmRes = await context.userInteraction.showMessage(
        "warn",
        confirmMessage,
        true,
        getLocalizedString("core.addApi.continue")
      );

      if (confirmRes.isErr()) {
        return err(confirmRes.error);
      } else if (confirmRes.value !== getLocalizedString("core.addApi.continue")) {
        return err(new UserCancelError());
      }
    }

    // find the next available action id
    let actionId = "";
    let suffix = 1;
    actionId = `action_${suffix}`;
    const existingActionIds = declarativeCopilotManifest.actions?.map((action) => action.id);
    while (existingActionIds?.includes(actionId)) {
      suffix += 1;
      actionId = `action_${suffix}`;
    }

    let destinationPluginManifestPath: string;
    // generate files
    if (isGenerateFromApiSpec && specParser) {
      destinationPluginManifestPath =
        await copilotGptManifestUtils.getDefaultNextAvailablePluginManifestPath(
          appPackageFolder,
          undefined
        );
      const destinationApiSpecPath = await pluginManifestUtils.getDefaultNextAvailableApiSpecPath(
        inputs[QuestionNames.ApiSpecLocation].trim(),
        path.join(appPackageFolder, DefaultApiSpecFolderName)
      );

      const generateRes = await openApiSpecHelperModule.generateFromApiSpec(
        specParser,
        teamsManifestPath,
        inputs,
        context,
        Stage.addPlugin,
        ProjectType.Copilot,
        {
          destinationApiSpecFilePath: destinationApiSpecPath,
          pluginManifestFilePath: destinationPluginManifestPath,
        },
        inputs[QuestionNames.ApiSpecLocation].trim()
      );
      if (generateRes.isErr()) {
        return err(generateRes.error);
      }

      const warnings = generateRes.value.warnings;
      if (warnings && warnings.length > 0) {
        const warnSummary = await openApiSpecHelperModule.generateScaffoldingSummary(
          warnings,
          manifestRes.value,
          path.relative(inputs.projectPath, destinationApiSpecPath),
          path.relative(inputs.projectPath, destinationPluginManifestPath),
          inputs.projectPath
        );
        context.logProvider.info(warnSummary + "\n");
      }

      const addActionRes = await copilotGptManifestUtils.addAction(
        declarativeCopilotManifestPath,
        actionId,
        normalizePath(path.relative(appPackageFolder, destinationPluginManifestPath), true)
      );
      if (addActionRes.isErr()) {
        return err(addActionRes.error);
      }

      for (const authNameAndScheme of authNameAndSchemes) {
        await this.updateAuthActionInYaml(
          authNameAndScheme.authName,
          authNameAndScheme.authScheme,
          inputs.projectPath,
          destinationApiSpecPath,
          destinationPluginManifestPath
        );
      }
    } else if (isGenerateFromMCP) {
      // CLI MCP action: create ai-plugin.json with MCP runtime config.
      // (VS Code path is handled earlier by addPluginFromMCP.)
      const mcpServerUrl = inputs[QuestionNames.MCPForDAServerUrl];
      const toolsFilePath = inputs[QuestionNames.MCPToolsFilePath];
      const mcpWarnings: Warning[] = [];

      // Validate: --mcp-da-server-url is required for MCP actions
      if (!mcpServerUrl) {
        return err(
          new UserError(
            Stage.addPlugin,
            "MissingMCPServerUrl",
            getLocalizedString("core.MCPForDA.missingServerUrl"),
            getLocalizedString("core.MCPForDA.missingServerUrl")
          )
        );
      }

      // Dynamic Tool Discovery flow: the v4 modify package renders the dynamic
      // plugin manifest and reuses the same MCP auth steps as create.
      if (featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT)) {
        const authType = inputs[QuestionNames.MCPForDAAuthType] as string | undefined;
        const dispatchRes = await fxCoreDeclarativeAgentDeps.modifyProjectFrontDoor(
          inputs,
          { addCapability: "add-action", actionSource: "mcp" },
          {
            mcpServerUrl,
            teamsManifestPath: targetRelativePath(projectPath, teamsManifestPath),
            authType: authType || "none",
          },
          {
            scaffoldV4: async (
              _inputs: Inputs,
              target: BuildTarget,
              answers: Answers,
              resolvedPackage?: ResolvedV4ChannelPackage
            ) => {
              if (target.engine !== "v4") {
                return err(unsupportedModifyTarget(target));
              }
              const answerMcpServerUrl = stringAnswer(answers, "mcpServerUrl");
              const answerAuthType = stringAnswer(answers, "authType") ?? "none";
              if (answerMcpServerUrl === undefined) {
                return err(
                  new SystemError({
                    source: "Scaffold",
                    name: "ModifyInputMissing",
                    message: "The add MCP server modify package did not resolve mcpServerUrl.",
                  })
                );
              }
              return fxCoreDeclarativeAgentDeps.scaffoldAddMcpServerFromV4({
                templateId: target.templateId,
                projectPath,
                platform: inputs.platform,
                teamsManifestPath,
                appName: manifestRes.value.name?.short ?? path.basename(projectPath),
                mcpServerUrl: answerMcpServerUrl,
                authType: answerAuthType,
                resolvedPackage,
              });
            },
            callCoreMethod: (_inputs: Inputs, target: BuildTarget) =>
              Promise.resolve(err(unsupportedModifyTarget(target))),
            resolveArtifactSnapshot: fxCoreDeclarativeAgentDeps.resolveV4TemplateArtifactSnapshot,
          }
        );
        if (dispatchRes.isErr()) {
          return err(dispatchRes.error);
        }
        return ok(undefined);
      } else {
        // Load tools from file if provided and not yet loaded
        const existingTools = inputs[QuestionNames.MCPForDAAvailableTools];
        if (toolsFilePath && (!existingTools || existingTools.length === 0)) {
          try {
            const { readMCPToolsFromFile } = await import("../component/utils/mcpToolFetcher");
            const fileTools = await readMCPToolsFromFile(toolsFilePath);
            inputs[QuestionNames.MCPForDAAvailableTools] = fileTools;
            if (!inputs[QuestionNames.MCPForDAPreFetchTools]) {
              inputs[QuestionNames.MCPForDAPreFetchTools] = fileTools.map((t: any) => t.name);
            }
          } catch {
            mcpWarnings.push({
              type: "mcpToolsFileReadError",
              content: getLocalizedString(
                "core.MCPForDA.toolsFileReadError",
                toolsFilePath,
                mcpAddActionHint
              ),
            });
          }
        }

        // Probe auth if tools were loaded from file but auth not yet detected
        if (
          inputs[QuestionNames.MCPForDAAvailableTools]?.length > 0 &&
          !inputs[QuestionNames.MCPForDAAuth] &&
          mcpServerUrl
        ) {
          try {
            const { probeMCPServerAuth } = await import("../component/utils/mcpToolFetcher");
            const authProbe = await probeMCPServerAuth(mcpServerUrl);
            if (authProbe.requiresAuth) {
              inputs[QuestionNames.MCPForDAAuth] = "OAuthPluginVault";
              if (authProbe.authMetadataUrl) {
                inputs[QuestionNames.MCPForDAAuthMetadataUrl] = authProbe.authMetadataUrl;
              }
            }
          } catch {
            // Auth probe failed - continue without auth
          }
        }

        // Auto-fetch tools if not yet loaded (CLI flow for no-auth servers)
        const currentTools = inputs[QuestionNames.MCPForDAAvailableTools];
        if ((!currentTools || currentTools.length === 0) && mcpServerUrl) {
          try {
            const { fetchMCPTools } = await import("../component/utils/mcpToolFetcher");
            const result = await fetchMCPTools(mcpServerUrl);
            if (!result.requiresAuth && result.tools.length > 0) {
              inputs[QuestionNames.MCPForDAAvailableTools] = result.tools;
              if (!inputs[QuestionNames.MCPForDAPreFetchTools]) {
                inputs[QuestionNames.MCPForDAPreFetchTools] = result.tools.map((t) => t.name);
              }
            } else if (result.requiresAuth) {
              // Store auth metadata for later use
              inputs[QuestionNames.MCPForDAAuth] = "OAuthPluginVault";
              if (result.authMetadataUrl) {
                inputs[QuestionNames.MCPForDAAuthMetadataUrl] = result.authMetadataUrl;
              }
              mcpWarnings.push({
                type: "mcpAuthRequired",
                content: getLocalizedString(
                  "core.MCPForDA.authRequired",
                  mcpServerUrl,
                  mcpAddActionHint
                ),
              });
            } else {
              mcpWarnings.push({
                type: "mcpNoToolsFetched",
                content: getLocalizedString(
                  "core.MCPForDA.noToolsFetched",
                  mcpServerUrl,
                  mcpAddActionHint
                ),
              });
            }
          } catch {
            mcpWarnings.push({
              type: "mcpFetchError",
              content: getLocalizedString(
                "core.MCPForDA.fetchError",
                mcpServerUrl,
                mcpAddActionHint
              ),
            });
          }
        }

        // If no tools available (auth required or fetch failed), skip creating plugin - just warn
        const mcpTools = inputs[QuestionNames.MCPForDAAvailableTools];
        const mcpToolsSelected = inputs[QuestionNames.MCPForDAPreFetchTools] || [];
        if (!mcpTools || mcpTools.length === 0 || mcpToolsSelected.length === 0) {
          if (mcpWarnings.length > 0) {
            for (const warning of mcpWarnings) {
              context.logProvider.warning(warning.content);
            }
          }
          return ok(undefined);
        }

        destinationPluginManifestPath =
          await copilotGptManifestUtils.getDefaultNextAvailablePluginManifestPath(
            appPackageFolder,
            undefined
          );

        const pluginManifest: any = {
          $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
          schema_version: "v2.4",
          name_for_human: "MCP Action",
          description_for_human: "Action powered by MCP server",
          contact_email: "publisher-email@example.com",
          namespace: "mcpAction",
          functions: [],
          runtimes: [],
        };

        if (mcpTools && mcpTools.length > 0 && mcpToolsSelected.length > 0) {
          const selectedTools = mcpTools.filter((tool: any) =>
            mcpToolsSelected.includes(tool.name)
          );

          pluginManifest.functions = selectedTools.map((tool: any) => ({
            name: tool.name,
            description: tool.description || "",
          }));

          // Write mcp-tools file with full tool definitions (no field filtering)
          const mcpToolsFile = `mcp-tools-${suffix}.json`;
          const mcpToolsOutputPath = path.join(appPackageFolder, mcpToolsFile);
          await fs.writeJSON(mcpToolsOutputPath, { tools: selectedTools }, { spaces: 4 });

          pluginManifest.runtimes = [
            {
              type: "RemoteMCPServer",
              spec: {
                url: mcpServerUrl,
                mcp_tool_description: {
                  file: mcpToolsFile,
                },
              },
              run_for_functions: pluginManifest.functions.map((f: any) => f.name),
            },
          ];

          // Auth handling
          const mcpAuth = inputs[QuestionNames.MCPForDAAuth];
          if (mcpAuth === "OAuthPluginVault") {
            const authType = inputs[QuestionNames.MCPForDAAuthType];
            if (!authType) {
              return err(
                new UserError(
                  Stage.addPlugin,
                  "MissingMCPAuthType",
                  getLocalizedString("core.MCPForDA.missingAuthType"),
                  getLocalizedString("core.MCPForDA.missingAuthType")
                )
              );
            }

            const registrationId = `MCP_DA_AUTH_ID_${actionId.toUpperCase()}`;
            const manifestOAuth = deriveMCPManifestOAuth(authType, registrationId);
            if (manifestOAuth) {
              pluginManifest.runtimes[0].auth = manifestOAuth;
            }

            // Resolve OAuth metadata and inject oauth/register into m365agents.yml
            try {
              const endpoints = await resolveMCPAuthEndpoints(authType, inputs);
              const ymlPath = pathUtils.getYmlFilePath(inputs.projectPath);
              if (ymlPath) {
                await injectMCPAuthActionToYml({
                  ymlPath,
                  authType,
                  authName: actionId,
                  registrationId,
                  mcpServerUrl,
                  endpoints,
                });
              }
            } catch (error: any) {
              mcpWarnings.push({
                type: "mcpAuthMetadataError",
                content: getLocalizedString(
                  "core.MCPForDA.mcpAuthMetadataMissingError",
                  error.message
                ),
              });
            }
          }
        }

        await fs.ensureFile(destinationPluginManifestPath);
        await fs.writeJSON(destinationPluginManifestPath, pluginManifest, { spaces: 4 });

        const addActionRes = await copilotGptManifestUtils.addAction(
          declarativeCopilotManifestPath,
          actionId,
          normalizePath(path.relative(appPackageFolder, destinationPluginManifestPath), true)
        );
        if (addActionRes.isErr()) {
          return err(addActionRes.error);
        }

        // Surface warnings for CLI
        if (mcpWarnings.length > 0) {
          for (const warning of mcpWarnings) {
            context.logProvider.warning(warning.content);
          }
        }
      }
    } else {
      const addPluginRes = await declarativeAgentHelperModule.addExistingPlugin(
        declarativeCopilotManifestPath,
        inputs[QuestionNames.PluginManifestFilePath].trim(),
        inputs[QuestionNames.PluginOpenApiSpecFilePath].trim(),
        actionId,
        context,
        Stage.addPlugin
      );

      if (addPluginRes.isErr()) {
        return err(addPluginRes.error);
      }
      destinationPluginManifestPath = addPluginRes.value.destinationPluginManifestPath;
      const warningMessage = outputScaffoldingWarningMessage(addPluginRes.value.warnings);
      context.logProvider.info(warningMessage);
    }

    if (inputs.platform === Platform.VSCode) {
      const successMessage = getLocalizedString("core.addPlugin.success.vsc", actionId);
      const viewPluginManifest = getLocalizedString("core.addPlugin.success.viewPluginManifest");
      void context.userInteraction
        .showMessage("info", successMessage, false, viewPluginManifest)
        .then((userRes) => {
          if (userRes.isOk() && userRes.value === viewPluginManifest) {
            context.telemetryReporter.sendTelemetryEvent(
              TelemetryEvent.ViewPluginManifestAfterAdded
            );
            void TOOLS?.ui?.openFile?.(destinationPluginManifestPath);
          }
        });
    } else {
      const successMessage = getLocalizedString(
        "core.addPlugin.success",
        actionId,
        destinationPluginManifestPath
      );
      void context.userInteraction.showMessage("info", successMessage, false);
    }

    return ok(undefined);
  }

  /**
   * Adds an MCP server entry to the project's `.vscode/mcp.json` and returns
   * a marker so the caller (vscode-extension) can open the file and surface
   * the same "start MCP server / Fetch Action" notification used by the
   * "DA with MCP" scaffolding flow.
   */
  private async addPluginFromMCP(
    inputs: Inputs,
    context: ReturnType<typeof createContext>
  ): Promise<Result<{ kind: "mcp"; mcpConfigPath: string }, FxError>> {
    const projectPath = inputs.projectPath as string;
    const mcpServerUrl = (inputs[QuestionNames.MCPForDAServerUrl] as string | undefined)?.trim();
    if (!mcpServerUrl) {
      return err(
        new UserError(
          Stage.addPlugin,
          "MissingMCPServerUrl",
          getDefaultString("core.MCPForDA.missingServerUrl"),
          getLocalizedString("core.MCPForDA.missingServerUrl")
        )
      );
    }

    // Derive a server entry name from the URL host using the same logic as the
    // "DA with MCP" scaffolding template variable `ServerName`.
    const serverName = deriveMCPServerNameFromUrl(mcpServerUrl);

    const mcpConfigDir = path.join(projectPath, ".vscode");
    const mcpConfigPath = path.join(mcpConfigDir, "mcp.json");

    let mcpConfig: { servers: Record<string, unknown> } = { servers: {} };
    if (await fs.pathExists(mcpConfigPath)) {
      try {
        const existing = (await fs.readJSON(mcpConfigPath)) as {
          servers?: Record<string, unknown>;
        };
        if (existing && typeof existing === "object") {
          mcpConfig = {
            ...existing,
            servers:
              existing.servers && typeof existing.servers === "object" ? existing.servers : {},
          };
        }
      } catch {
        // Existing file is unreadable/invalid JSON — overwrite with a fresh config.
        mcpConfig = { servers: {} };
      }
    }

    // Ensure unique server entry name to avoid overwriting an existing one.
    let uniqueName = serverName;
    let suffix = 1;
    while (Object.prototype.hasOwnProperty.call(mcpConfig.servers, uniqueName)) {
      uniqueName = `${serverName}${suffix++}`;
    }
    mcpConfig.servers[uniqueName] = {
      type: "http",
      url: mcpServerUrl,
    };

    await fs.ensureDir(mcpConfigDir);
    await fs.writeJSON(mcpConfigPath, mcpConfig, { spaces: 2 });

    context.logProvider.info(
      `MCP server "${uniqueName}" added to ${path.relative(projectPath, mcpConfigPath)}.`
    );

    return ok({ kind: "mcp", mcpConfigPath });
  }
}
