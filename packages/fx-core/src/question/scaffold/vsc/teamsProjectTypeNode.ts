// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppPackageFolderName,
  DefaultPluginManifestFileName,
  Inputs,
  IQTreeNode,
  ManifestTemplateFileName,
  OptionItem,
  Platform,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import path from "path";
import { featureFlagManager, FeatureFlags } from "../../../common/featureFlags";
import { getLocalizedString } from "../../../common/localizeUtils";
import { fetchMCPTools, readMCPToolsFromFile } from "../../../component/utils/mcpToolFetcher";
import { ODRProvider, ODRServer } from "../../../component/utils/odrProvider";
import {
  SPFxFrameworkQuestion,
  SPFxImportFolderQuestion,
  SPFxPackageSelectQuestion,
  SPFxSolutionQuestion,
  SPFxWebpartNameQuestion,
} from "../../create";
import { QuestionNames } from "../../questionNames";
import { apiSpecNode } from "../commonNodes";
import {
  ActionStartOptions,
  ApiAuthOptions,
  BotCapabilityOptions,
  CustomCopilotRagOptions,
  MeArchitectureOptions,
  MeCapabilityOptions,
  NotificationBotOptions,
  setTemplateName,
  TabCapabilityOptions,
  TeamsAgentCapabilityOptions,
} from "./CapabilityOptions";
import { getRootProjectTypeNode } from "./rootNode";

export const teamsProjectTypeDeps = {
  pathExists: fs.pathExists,
  readJSON: fs.readJSON,
  fetchMCPTools,
  readMCPToolsFromFile,
};

/**
 * Extract the Teams Agents and Apps sub-tree from the combined wizardNode.json.
 * Used by TDP (Teams Developer Portal) flow.
 */
export function getTeamsProjectNode(): IQTreeNode {
  const root = getRootProjectTypeNode(Platform.VSCode);
  const teamsNode = root.children?.find(
    (c) => (c.condition as any)?.equals === "teams-agent-and-app-type"
  );
  return teamsNode ?? { data: { type: "group" } };
}

export class TeamsProjectTypeOptions {
  static tabOptionId = "tab-type";
  static botOptionId = "bot-type";
  static meOptionId = "me-type";

  static tab(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: TeamsProjectTypeOptions.tabOptionId,
      label: `${platform === Platform.VSCode ? "$(browser) " : ""}${getLocalizedString(
        "core.TabOption.label"
      )}`,
      detail: getLocalizedString("core.createProjectQuestion.projectType.tab.detail"),
    };
  }

  static bot(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: TeamsProjectTypeOptions.botOptionId,
      label: `${platform === Platform.VSCode ? "$(hubot) " : ""}${getLocalizedString(
        "core.createProjectQuestion.projectType.bot.label"
      )}`,
      detail: getLocalizedString("core.createProjectQuestion.projectType.bot.detail"),
    };
  }

  static me(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: TeamsProjectTypeOptions.meOptionId,
      label: `${platform === Platform.VSCode ? "$(symbol-keyword) " : ""}${getLocalizedString(
        "core.MessageExtensionOption.label"
      )}`,
      detail: getLocalizedString(
        "core.createProjectQuestion.projectType.messageExtension.copilotEnabled.detail"
      ),
    };
  }
}

export function customCopilotRagNode(): IQTreeNode {
  return {
    condition: { equals: TeamsAgentCapabilityOptions.customCopilotRag().id },
    data: {
      type: "singleSelect",
      name: QuestionNames.CustomCopilotRag,
      title: getLocalizedString("template.teams.rag.label"),
      placeholder: getLocalizedString("template.teams.rag.source.placeholder"),
      staticOptions: [
        CustomCopilotRagOptions.customize(),
        CustomCopilotRagOptions.azureAISearch(),
        CustomCopilotRagOptions.customApi(),
        // CustomCopilotRagOptions.microsoft365(),
      ],
      default: CustomCopilotRagOptions.customize().id,
      onDidSelection: setTemplateName,
    },
    children: [apiSpecNode({ equals: CustomCopilotRagOptions.customApi().id })],
  };
}

// export function aiAgentNode(): IQTreeNode {
//   return {
//     condition: { equals: CustomCopilotCapabilityOptions.aiAgent().id },
//     data: {
//       type: "singleSelect",
//       name: QuestionNames.CustomCopilotAssistant,
//       title: getLocalizedString(
//         "core.createProjectQuestion.capability.customCopilotAssistant.title"
//       ),
//       placeholder: getLocalizedString(
//         "core.createProjectQuestion.capability.customCopilotAssistant.placeholder"
//       ),
//       staticOptions: [
//         CustomCopilotAssistantOptions.new(),
//         CustomCopilotAssistantOptions.assistantsApi(),
//       ],
//       default: CustomCopilotAssistantOptions.new().id,
//       onDidSelection: setTemplateName,
//     },
//   };
// }

export function notificationBotTriggerNode(platform: Platform = Platform.VSCode): IQTreeNode {
  return {
    condition: { equals: BotCapabilityOptions.notificationBotId },
    data: {
      name: QuestionNames.BotTrigger,
      title: getLocalizedString("plugins.bot.questionHostTypeTrigger.title"),
      type: "singleSelect",
      cliDescription: "Specifies the trigger for `Chat Notification Message` app template.",
      staticOptions: [
        platform === Platform.VS
          ? NotificationBotOptions.appServiceForVS()
          : NotificationBotOptions.appService(),
        NotificationBotOptions.functionsHttpAndTimerTrigger(),
        NotificationBotOptions.functionsHttpTrigger(),
        NotificationBotOptions.functionsTimerTrigger(),
      ],
      default:
        platform === Platform.VS
          ? NotificationBotOptions.appServiceForVS().id
          : NotificationBotOptions.appService().id,
      placeholder: getLocalizedString("plugins.bot.questionHostTypeTrigger.placeholder"),
      onDidSelection: setTemplateName,
    },
  };
}

export function botProjectTypeNode(): IQTreeNode {
  return {
    // project-type = Bot
    condition: { equals: TeamsProjectTypeOptions.botOptionId },
    data: {
      name: QuestionNames.Capabilities,
      title: getLocalizedString("core.createProjectQuestion.projectType.bot.title"),
      type: "singleSelect",
      staticOptions: [
        BotCapabilityOptions.basicBot(),
        BotCapabilityOptions.notificationBot(),
        BotCapabilityOptions.commandBot(),
        BotCapabilityOptions.workflowBot(),
      ],
      placeholder: getLocalizedString("template.createCapabilityQuestion.placeholder"),
      onDidSelection: setTemplateName,
    },
    children: [notificationBotTriggerNode()],
  };
}

export function tabProjectTypeNode(platform: Platform = Platform.VSCode): IQTreeNode {
  return {
    // project-type = Tab
    condition: { equals: TeamsProjectTypeOptions.tabOptionId },
    data: {
      name: QuestionNames.Capabilities,
      title: getLocalizedString("core.createProjectQuestion.projectType.tab.title"),
      type: "singleSelect",
      staticOptions: [
        TabCapabilityOptions.nonSsoTab(),
        TabCapabilityOptions.m365SsoLaunchPage(),
        TabCapabilityOptions.dashboardTab(),
        TabCapabilityOptions.SPFxTab(),
      ],
      placeholder: getLocalizedString("template.createCapabilityQuestion.placeholder"),
      onDidSelection: setTemplateName,
    },
    children: [
      {
        //SPFx sub-tree
        condition: { equals: TabCapabilityOptions.SPFxTab().id },
        data: SPFxSolutionQuestion(),
        children: [
          {
            data: { type: "group" },
            children: [
              { data: SPFxPackageSelectQuestion() },
              { data: SPFxFrameworkQuestion() },
              { data: SPFxWebpartNameQuestion() },
            ],
            condition: { equals: "new" },
          },
          {
            data: SPFxImportFolderQuestion(),
            condition: { equals: "import" },
          },
        ],
      },
    ],
  };
}

export function meProjectTypeNode(): IQTreeNode {
  return {
    // project-type = Messaging Extension
    condition: { equals: TeamsProjectTypeOptions.meOptionId },
    data: {
      name: QuestionNames.Capabilities,
      title: getLocalizedString("core.createProjectQuestion.projectType.messageExtension.title"),
      type: "singleSelect",
      staticOptions: [
        MeCapabilityOptions.m365SearchMe(),
        MeCapabilityOptions.collectFormMe(),
        MeCapabilityOptions.linkUnfurling(),
      ],
      placeholder: getLocalizedString("template.createCapabilityQuestion.placeholder"),
      onDidSelection: setTemplateName,
    },
    children: [m365SearchMeSubNode()],
  };
}

export function m365SearchMeSubNode(): IQTreeNode {
  return {
    // Search ME sub-tree
    condition: { equals: MeCapabilityOptions.m365SearchMe().id },
    data: {
      name: QuestionNames.MeArchitectureType,
      title: getLocalizedString("core.createProjectQuestion.meArchitecture.title"),
      cliDescription: "The authentication type for the API.",
      type: "singleSelect",
      staticOptions: [
        MeArchitectureOptions.newApi(),
        MeArchitectureOptions.openApiSpec(),
        MeArchitectureOptions.botMe(),
      ],
      default: MeArchitectureOptions.newApi().id,
      placeholder: getLocalizedString(
        "template.createProjectQuestion.projectType.copilotExtension.placeholder"
      ),
      forgetLastValue: true,
      skipSingleOption: true,
      onDidSelection: setTemplateName,
    },
    children: [
      {
        condition: { equals: MeArchitectureOptions.newApi().id },
        data: {
          type: "singleSelect",
          name: QuestionNames.ApiAuth,
          title: getLocalizedString("template.createProjectQuestion.apiMessageExtensionAuth.title"),
          placeholder: getLocalizedString(
            "template.createProjectQuestion.apiMessageExtensionAuth.placeholder"
          ),
          staticOptions: [
            ApiAuthOptions.none(true),
            ApiAuthOptions.bearerToken(),
            ApiAuthOptions.microsoftEntra(true),
          ],
          default: ApiAuthOptions.none(true).id,
          onDidSelection: setTemplateName,
        },
      },
      apiSpecNode({ equals: MeArchitectureOptions.openApiSpec().id }),
    ],
  };
}

export function MCPServerTypeNode(): IQTreeNode {
  return {
    condition: { equals: ActionStartOptions.mcp().id },
    data: {
      name: QuestionNames.MCPServerType,
      title: getLocalizedString("core.createProjectQuestion.mcpServerType.title"),
      type: "singleSelect",
      staticOptions: [],
      dynamicOptions: async (inputs: Inputs) => {
        const servers = await ODRProvider.listServers();
        inputs["_McpOdrOutput"] = servers;

        const options = [
          {
            id: "remote",
            label: getLocalizedString("core.createProjectQuestion.mcpServerType.remote.label"),
            detail: getLocalizedString("core.createProjectQuestion.mcpServerType.remote.detail"),
          },
        ];

        if (servers.length > 0) {
          options.push({
            id: "local",
            label: getLocalizedString("core.createProjectQuestion.mcpServerType.local.label"),
            detail: getLocalizedString("core.createProjectQuestion.mcpServerType.local.detail"),
          });
        }

        return options;
      },
      default: "remote",
      placeholder: getLocalizedString("core.createProjectQuestion.mcpServerType.placeholder"),
      skipSingleOption: true,
    },
    children: [
      {
        condition: { equals: "remote" },
        data: MCPForDAServerUrlNode().data,
        children: [
          MCPToolsFileNode(),
          MCPCliPreFetchToolsNode(),
          {
            // VS Code: gated on TEAMSFX_MCP_FOR_DA_DT — shipped behavior (DT off)
            // defers auth-type pick to the post-create fetch-mcp-tools CodeLens
            // flow per SCN-DA-CREATE-WITH-MCP-SERVER. CLI keeps the inline pick.
            condition: (inputs: Inputs) =>
              inputs.platform !== Platform.VSCode ||
              featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT),
            data: {
              type: "singleSelect",
              name: QuestionNames.MCPForDAAuthType,
              title: getLocalizedString("core.createProjectQuestion.mcpForDa.AuthType.title"),
              staticOptions: MCPForDAAuthTypeStaticOptions(),
              default: "oauth",
            },
            children: MCPForDAAuthCredentialNodes(),
          },
        ],
      },
      MCPLocalServerSelectionNode(),
    ],
  };
}

/**
 * Question node for providing an MCP tools definition file.
 * Shown when:
 * - The MCP server requires auth (auto-detected), or
 * - The user wants to provide tools manually.
 * In CLI non-interactive mode, this is provided via --mcp-tools-file.
 */
export function MCPToolsFileNode(): IQTreeNode {
  return {
    data: {
      name: QuestionNames.MCPToolsFilePath,
      title: getLocalizedString("core.MCPForDA.toolsFilePath.title"),
      type: "text",
      placeholder: getLocalizedString("core.MCPForDA.toolsFilePath.placeholder"),
      additionalValidationOnAccept: {
        validFunc: async (value: string, inputs?: Inputs): Promise<string | undefined> => {
          if (!value) return undefined;
          const filePath = value;
          if (!(await teamsProjectTypeDeps.pathExists(filePath))) {
            return getLocalizedString("core.MCPForDA.toolsFileNotFound", filePath);
          }
          try {
            const tools = await teamsProjectTypeDeps.readMCPToolsFromFile(filePath);
            if (inputs) {
              inputs[QuestionNames.MCPForDAAvailableTools] = tools;
            }
          } catch (e: any) {
            return e.message;
          }
          return undefined;
        },
      },
    },
    // This node is only shown when:
    // 1. CLI platform (no VS Code MCP gateway), AND
    // 2. Either auth is required, or auto-fetch returned no tools
    condition: (inputs: Inputs) => {
      // In VS Code, tools are fetched by the extension handler, so skip this node
      if (inputs.platform === Platform.VSCode) return false;
      // Show if no available tools were populated by auto-fetch
      const tools = inputs[QuestionNames.MCPForDAAvailableTools];
      return !tools || (Array.isArray(tools) && tools.length === 0);
    },
  };
}

/**
 * Question node for CLI pre-fetch tool selection.
 * Attempts to auto-fetch tools from the MCP server URL, then presents them for selection.
 * For CLI platform only — VS Code has its own tool fetching via vscode.lm.tools.
 */
export function MCPCliPreFetchToolsNode(): IQTreeNode {
  return {
    condition: (inputs: Inputs) => {
      // Only show in CLI when tools are available (either fetched or loaded from file)
      if (inputs.platform === Platform.VSCode) return false;
      const tools = inputs[QuestionNames.MCPForDAAvailableTools];
      return tools && Array.isArray(tools) && tools.length > 0;
    },
    data: {
      type: "multiSelect",
      name: QuestionNames.MCPForDAPreFetchTools,
      title: getLocalizedString("core.createProjectQuestion.mcpForDa.PreFetchTools.title"),
      staticOptions: [],
      dynamicOptions: (inputs: Inputs): OptionItem[] => {
        const availableTools: any[] = inputs[QuestionNames.MCPForDAAvailableTools];
        return availableTools.map((tool: any) => ({
          id: tool.name,
          label: tool.name,
          detail: tool.description || "",
        }));
      },
      default: (inputs: Inputs) => {
        const availableTools: any[] = inputs[QuestionNames.MCPForDAAvailableTools] || [];
        return availableTools.map((tool: any) => tool.name);
      },
    },
  };
}

export function MCPLocalServerSelectionNode(): IQTreeNode {
  return {
    condition: { equals: "local" },
    data: {
      name: QuestionNames.MCPLocalServer,
      title: getLocalizedString("core.createProjectQuestion.mcpLocalServer.title"),
      type: "multiSelect",
      returnObject: true,
      staticOptions: [],
      placeholder: getLocalizedString("core.createProjectQuestion.mcpLocalServer.placeholder"),
      dynamicOptions: (inputs: Inputs) => {
        const servers = inputs["_McpOdrOutput"] as ODRServer[];

        return servers.map((server) => ({
          id: server.name,
          label: server.display_name,
          detail: `${server.description} (${server.tools.length} tools available)`,
          data: JSON.stringify({
            identifier: server.identifier,
            command: server.command,
            args: server.args,
          }),
        }));
      },
      validation: { minItems: 1 },
      validationHelp: getLocalizedString(
        "core.createProjectQuestion.mcpLocalServer.validationHelp"
      ),
    },
    children: [],
  };
}

/**
 * Shared static option list for the `mcp-da-auth-type` single-select question.
 * Kebab-case values so CLI flags (`--mcp-da-auth-type entra-sso` etc.) match the
 * scaffold inputs and the scenario doc.
 *
 * `oauth-dynamic` (Dynamic Client Registration) is gated behind both
 * `TEAMSFX_MCP_FOR_DA_DT` and `TEAMSFX_MCP_FOR_DA_DCR` because the DCR
 * provisioning flow currently piggybacks on the DT-mode env-file plumbing.
 */
export function MCPForDAAuthTypeStaticOptions(): OptionItem[] {
  const showDCR =
    featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT) &&
    featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADCR);
  const options: OptionItem[] = [
    {
      id: "oauth",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuth"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuth.Detail"),
    },
  ];
  if (showDCR) {
    options.push({
      id: "oauth-dynamic",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuthDynamic"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuthDynamic.Detail"),
    });
  }
  options.push(
    {
      id: "entra-sso",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.EntraSSO"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.EntraSSO.Detail"),
    },
    {
      id: "none",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.None"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.None.Detail"),
    }
  );
  return options;
}

export function MCPForDAFetchAuthTypeStaticOptions(): OptionItem[] {
  const options: OptionItem[] = [];
  if (featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADCR)) {
    options.push({
      id: "oauth-dynamic",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuthDynamic"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuthDynamic.Detail"),
    });
  }
  options.push(
    {
      id: "oauth",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuth"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.OAuth.Detail"),
    },
    {
      id: "entra-sso",
      label: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.EntraSSO"),
      detail: getLocalizedString("core.createProjectQuestion.mcpForDa.Auth.EntraSSO.Detail"),
    }
  );
  return options;
}

/**
 * Follow-up question nodes shown after the user picks an `mcp-da-auth-type`
 * value. Unconditional per SCN-DA-CREATE-WITH-MCP-SERVER step 6a/6b: the
 * answers are always collected; the TEAMSFX_MCP_FOR_DA_DT flag only governs
 * how the answers reach `oauth/register` (env-file persistence + ${{...}}
 * refs when on; in-process bridge `process.env["oauth-client-id"]` etc. when
 * off).
 *
 * - `oauth` (static OAuth): client id (required) + client secret (required, password)
 *   + scopes (optional).
 * - `entra-sso`: only client id (required).
 * - `oauth-dynamic` / `none`: no follow-up questions.
 */
export function MCPForDAAuthCredentialNodes(): IQTreeNode[] {
  const clientIdNode: IQTreeNode = {
    condition: (inputs: Inputs) => {
      const authType = inputs[QuestionNames.MCPForDAAuthType];
      return authType === "oauth" || authType === "entra-sso";
    },
    data: {
      name: QuestionNames.MCPForDAClientId,
      type: "text",
      title: (inputs: Inputs) =>
        inputs[QuestionNames.MCPForDAAuthType] === "entra-sso"
          ? getLocalizedString("core.createProjectQuestion.mcpForDa.EntraClientId.title")
          : getLocalizedString("core.createProjectQuestion.mcpForDa.ClientId.title"),
      placeholder: (inputs: Inputs) =>
        inputs[QuestionNames.MCPForDAAuthType] === "entra-sso"
          ? getLocalizedString("core.createProjectQuestion.mcpForDa.EntraClientId.placeholder")
          : getLocalizedString("core.createProjectQuestion.mcpForDa.ClientId.placeholder"),
      validation: {
        validFunc: (value: string, inputs?: Inputs): string | undefined => {
          if (!value || value.trim().length === 0) {
            return inputs?.[QuestionNames.MCPForDAAuthType] === "entra-sso"
              ? getLocalizedString("core.createProjectQuestion.mcpForDa.EntraClientId.required")
              : getLocalizedString("core.createProjectQuestion.mcpForDa.ClientId.required");
          }
          return undefined;
        },
      },
    },
  };
  const clientSecretNode: IQTreeNode = {
    condition: (inputs: Inputs) => inputs[QuestionNames.MCPForDAAuthType] === "oauth",
    data: {
      name: QuestionNames.MCPForDAClientSecret,
      type: "text",
      password: true,
      title: getLocalizedString("core.createProjectQuestion.mcpForDa.ClientSecret.title"),
      placeholder: getLocalizedString(
        "core.createProjectQuestion.mcpForDa.ClientSecret.placeholder"
      ),
      validation: {
        validFunc: (value: string): string | undefined => {
          if (!value || value.trim().length === 0) {
            return getLocalizedString("core.createProjectQuestion.mcpForDa.ClientSecret.required");
          }
          return undefined;
        },
      },
    },
  };
  const scopesNode: IQTreeNode = {
    condition: (inputs: Inputs) => inputs[QuestionNames.MCPForDAAuthType] === "oauth",
    data: {
      name: QuestionNames.MCPForDAScopes,
      type: "text",
      title: getLocalizedString("core.createProjectQuestion.mcpForDa.Scopes.title"),
      placeholder: getLocalizedString("core.createProjectQuestion.mcpForDa.Scopes.placeholder"),
      required: false,
    },
  };
  return [clientIdNode, clientSecretNode, scopesNode];
}

export function MCPForDAServerUrlNode(): IQTreeNode {
  return {
    condition: { equals: ActionStartOptions.mcp().id },
    data: {
      name: QuestionNames.MCPForDAServerUrl,
      title: getLocalizedString("core.createProjectQuestion.mcpForDa.ServerUrl.title"),
      type: "text",
      placeholder: getLocalizedString("core.createProjectQuestion.mcpForDa.ServerUrl.placeholder"),
      additionalValidationOnAccept: {
        validFunc: async (value: string, inputs?: Inputs): Promise<string | undefined> => {
          if (!value || !inputs) return undefined;
          // For CLI: attempt to auto-fetch tools from the server
          if (inputs.platform !== Platform.VSCode) {
            try {
              const result = await teamsProjectTypeDeps.fetchMCPTools(value);
              if (result.requiresAuth) {
                inputs["_mcpAuthRequired"] = true;
                inputs[QuestionNames.MCPForDAAvailableTools] = [];
                if (result.authMetadataUrl) {
                  inputs[QuestionNames.MCPForDAAuthMetadataUrl] = result.authMetadataUrl;
                }
                inputs[QuestionNames.MCPForDAAuth] = "OAuthPluginVault";
              } else if (result.tools.length > 0) {
                inputs[QuestionNames.MCPForDAAvailableTools] = result.tools;
                inputs[QuestionNames.MCPForDATool] = "pre-fetch";
                inputs[QuestionNames.MCPForDAAuth] = "NoneAuth";
              } else {
                inputs[QuestionNames.MCPForDAAvailableTools] = [];
                inputs[QuestionNames.MCPForDAAuth] = "NoneAuth";
              }
            } catch {
              inputs[QuestionNames.MCPForDAAvailableTools] = [];
              inputs[QuestionNames.MCPForDAAuth] = "NoneAuth";
            }
          }
          return undefined;
        },
      },
    },
  };
}

export const CreateNewPluginManifestSentinel = "__createNewPluginManifest__";

export function updateActionWithMCP(): IQTreeNode {
  return {
    data: {
      type: "singleFile",
      name: QuestionNames.PluginManifestFilePath,
      title: getLocalizedString("core.createProjectQuestion.mcpForDa.File.title"),
      defaultFolder: (inputs: Inputs) =>
        path.normalize(path.join(inputs.projectPath as string, AppPackageFolderName)),
      filters: { files: ["json"] },
      possibleFiles: async (inputs: Inputs) => {
        const projectPath = inputs.projectPath as string;
        const items: { id: string; label: string; description?: string }[] = [];

        // List every action plugin file referenced by the declarative agent
        // manifest so the user can update an existing one.
        try {
          const teamsManifestPath = path.join(
            projectPath,
            AppPackageFolderName,
            ManifestTemplateFileName
          );
          if (await teamsProjectTypeDeps.pathExists(teamsManifestPath)) {
            const teamsManifest = await teamsProjectTypeDeps.readJSON(teamsManifestPath);
            const declarativeAgentRelativePath: string | undefined =
              teamsManifest?.copilotAgents?.declarativeAgents?.[0]?.file;
            if (declarativeAgentRelativePath) {
              const declarativeAgentPath = path.join(
                projectPath,
                AppPackageFolderName,
                declarativeAgentRelativePath
              );
              if (await teamsProjectTypeDeps.pathExists(declarativeAgentPath)) {
                const da = await teamsProjectTypeDeps.readJSON(declarativeAgentPath);
                const actions: { id?: string; file?: string }[] = da?.actions ?? [];
                const seen = new Set<string>();
                for (const action of actions) {
                  if (!action?.file) continue;
                  const absPath = path.normalize(
                    path.join(path.dirname(declarativeAgentPath), action.file)
                  );
                  if (seen.has(absPath)) continue;
                  seen.add(absPath);
                  items.push({
                    id: absPath,
                    label: `$(file) ${path.basename(absPath)}`,
                    description: path.dirname(absPath),
                  });
                }
              }
            }
          }
        } catch {
          // best-effort — fall through to just the create-new option
        }

        items.push({
          id: CreateNewPluginManifestSentinel,
          label: `$(new-file) ${getLocalizedString(
            "core.createProjectQuestion.mcpForDa.File.createNew.label"
          )}`,
        });
        return items;
      },
    },
    children: [
      {
        condition: (inputs: Inputs) =>
          inputs[QuestionNames.PluginManifestFilePath] === CreateNewPluginManifestSentinel,
        data: {
          type: "text",
          name: QuestionNames.NewPluginManifestFileName,
          title: getLocalizedString("core.createProjectQuestion.mcpForDa.File.createNew.title"),
          placeholder: DefaultPluginManifestFileName,
          default: DefaultPluginManifestFileName,
          validation: {
            validFunc: async (input: string, inputs?: Inputs) => {
              const trimmed = input.trim();
              if (!trimmed) {
                return getLocalizedString(
                  "core.createProjectQuestion.mcpForDa.File.createNew.validation.empty"
                );
              }
              if (!trimmed.toLowerCase().endsWith(".json")) {
                return getLocalizedString(
                  "core.createProjectQuestion.mcpForDa.File.createNew.validation.extension"
                );
              }
              if (path.isAbsolute(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) {
                return getLocalizedString(
                  "core.createProjectQuestion.mcpForDa.File.createNew.validation.relative"
                );
              }
              const projectPath = inputs?.projectPath;
              if (projectPath) {
                const target = path.join(projectPath, AppPackageFolderName, trimmed);
                if (await teamsProjectTypeDeps.pathExists(target)) {
                  return getLocalizedString(
                    "core.createProjectQuestion.mcpForDa.File.createNew.validation.exists",
                    trimmed
                  );
                }
              }
              return undefined;
            },
          },
        },
      },
      {
        data: {
          type: "multiSelect",
          name: QuestionNames.MCPForDAPreFetchTools,
          title: getLocalizedString("core.createProjectQuestion.mcpForDa.PreFetchTools.title"),
          staticOptions: [],
          dynamicOptions: (inputs: Inputs): OptionItem[] => {
            const availableTools: any[] = inputs[QuestionNames.MCPForDAAvailableTools];
            const tools = availableTools.map((tool: any) => {
              return {
                id: tool.name,
                label: tool.name,
                detail: tool.description || "",
              };
            });
            return tools;
          },
          default: async (inputs: Inputs) => {
            const pluginManifestFilePath = inputs[QuestionNames.PluginManifestFilePath];
            // Skip when the user chose "Create a new ai-plugin.json" (the value
            // is a sentinel id, not a real path) or when the file doesn't exist
            // yet. The plugin manifest will be created later in addPluginFromMCP /
            // updateActionWithMCP, so there are no pre-selected tools to default.
            if (
              !pluginManifestFilePath ||
              pluginManifestFilePath === CreateNewPluginManifestSentinel ||
              !(await teamsProjectTypeDeps.pathExists(pluginManifestFilePath as string))
            ) {
              return [];
            }
            const pluginManifest = await teamsProjectTypeDeps.readJSON(pluginManifestFilePath);
            const serverUrl = inputs[QuestionNames.MCPForDAServerUrl];
            const result: string[] = [];
            (pluginManifest.runtimes as any[])
              .filter(
                (runtime: any) =>
                  runtime.type === "RemoteMCPServer" && runtime.spec.url === serverUrl
              )
              .forEach((runtime: any) => {
                result.push(...runtime["run_for_functions"]);
              });
            return result;
          },
        },
      },
      {
        condition: (inputs: Inputs) => {
          return inputs[QuestionNames.MCPForDAAuth] !== "NoneAuth";
        },
        data: {
          type: "singleSelect",
          name: QuestionNames.MCPForDAAuthType,
          title: getLocalizedString("core.createProjectQuestion.mcpForDa.AuthType.title"),
          staticOptions: MCPForDAFetchAuthTypeStaticOptions(),
          default: featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADCR)
            ? "oauth-dynamic"
            : "oauth",
        },
        children: [],
      },
    ],
  };
}
