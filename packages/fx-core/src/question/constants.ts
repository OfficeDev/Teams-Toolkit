// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs, OptionItem } from "@microsoft/teamsfx-api";
import { getLocalizedString } from "../common/localizeUtils";
export { QuestionNames } from "./questionNames";

export const AppNamePattern =
  '^(?=(.*[\\da-zA-Z]){2})[a-zA-Z][^"<>:\\?/*&|\u0000-\u001F]*[^"\\s.<>:\\?/*&|\u0000-\u001F]$';

export enum CliQuestionName {
  Capability = "capability",
}

export const MAX_EMAIL_NUMBER = 20;

export enum ProgrammingLanguage {
  JS = "javascript",
  TS = "typescript",
  CSharp = "csharp",
  PY = "python",
  Common = "common",
  None = "none",
}

export const DeclarativeAgentApiSpecOptionId = "api-spec";
export const capabilitiesHavePythonOption = [
  "custom-copilot-basic",
  "custom-copilot-rag-azureAISearch",
  "custom-copilot-rag-customize",
  "custom-copilot-agent-new",
  "custom-copilot-agent-assistants-api",
  "custom-copilot-rag-customApi",
];

export class ScratchOptions {
  static yes(): OptionItem {
    return {
      id: "yes",
      label: getLocalizedString("core.ScratchOptionYes.label"),
      detail: getLocalizedString("core.ScratchOptionYes.detail"),
    };
  }
  static no(): OptionItem {
    return {
      id: "no",
      label: getLocalizedString("core.ScratchOptionNo.label"),
      detail: getLocalizedString("core.ScratchOptionNo.detail"),
    };
  }
  static all(): OptionItem[] {
    return [ScratchOptions.yes(), ScratchOptions.no()];
  }
}

export class ApiAuthOptions {
  static none(): OptionItem {
    return {
      id: "none",
      label: "None",
    };
  }
  static apiKey(): OptionItem {
    return {
      id: "api-key",
      label: "API Key",
    };
  }

  static bearerToken(): OptionItem {
    return {
      id: "bearer-token",
      label: "API Key (Bearer Token Auth)",
    };
  }

  static microsoftEntra(): OptionItem {
    return {
      id: "microsoft-entra",
      label: "Microsoft Entra",
    };
  }

  static oauth(): OptionItem {
    return {
      id: "oauth",
      label: "OAuth",
    };
  }

  static all(): OptionItem[] {
    return [
      ApiAuthOptions.none(),
      ApiAuthOptions.apiKey(),
      ApiAuthOptions.bearerToken(),
      ApiAuthOptions.microsoftEntra(),
      ApiAuthOptions.oauth(),
    ];
  }
}

export class AddAuthActionAuthTypeOptions {
  static apiKey(): OptionItem {
    return {
      id: "api-key",
      label: "API Key",
    };
  }

  static bearerToken(): OptionItem {
    return {
      id: "bearer-token",
      label: "API Key (Bearer Token Auth)",
    };
  }

  static oauth(): OptionItem {
    return {
      id: "oauth",
      label: "OAuth",
    };
  }

  static microsoftEntra(): OptionItem {
    return {
      id: "microsoft-entra",
      label: "Microsoft Entra",
    };
  }

  static all(): OptionItem[] {
    return [
      AddAuthActionAuthTypeOptions.bearerToken(),
      AddAuthActionAuthTypeOptions.apiKey(),
      AddAuthActionAuthTypeOptions.oauth(),
      AddAuthActionAuthTypeOptions.microsoftEntra(),
    ];
  }
}

export class MeArchitectureOptions {
  static botMe(): OptionItem {
    return {
      id: "bot",
      label: getLocalizedString("core.createProjectQuestion.capability.botMessageExtension.label"),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.botMessageExtension.detail"
      ),
      description: getLocalizedString(
        "core.createProjectQuestion.option.description.worksInOutlook"
      ),
    };
  }

  static newApi(): OptionItem {
    return {
      id: "new-api",
      label: getLocalizedString(
        "template.createProjectQuestion.capability.copilotPluginNewApiOption.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.messageExtensionNewApiOption.detail"
      ),
    };
  }

  static apiSpec(): OptionItem {
    return {
      id: "api-spec",
      label: getLocalizedString(
        "template.createProjectQuestion.capability.copilotPluginApiSpecOption.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.messageExtensionApiSpecOption.detail"
      ),
    };
  }

  static all(): OptionItem[] {
    return [
      MeArchitectureOptions.newApi(),
      MeArchitectureOptions.apiSpec(),
      MeArchitectureOptions.botMe(),
    ];
  }

  static staticAll(): OptionItem[] {
    return [
      MeArchitectureOptions.newApi(),
      MeArchitectureOptions.apiSpec(),
      MeArchitectureOptions.botMe(),
    ];
  }
}

export enum HostType {
  AppService = "app-service",
  Functions = "azure-functions",
}

export const NotificationTriggers = {
  HTTP: "http",
  TIMER: "timer",
} as const;

export type NotificationTrigger = (typeof NotificationTriggers)[keyof typeof NotificationTriggers];

export interface HostTypeTriggerOptionItem extends OptionItem {
  hostType: HostType;
  triggers?: NotificationTrigger[];
}

export class NotificationTriggerOptions {
  static appService(): HostTypeTriggerOptionItem {
    return {
      id: "http-express",
      hostType: HostType.AppService,
      label: getLocalizedString("plugins.bot.triggers.http-express.label"),
      description: getLocalizedString("plugins.bot.triggers.http-express.description"),
      detail: getLocalizedString("plugins.bot.triggers.http-express.detail"),
    };
  }
  static appServiceForVS(): HostTypeTriggerOptionItem {
    return {
      id: "http-webapi",
      hostType: HostType.AppService,
      label: getLocalizedString("plugins.bot.triggers.http-webapi.label"),
      description: getLocalizedString("plugins.bot.triggers.http-webapi.description"),
      detail: getLocalizedString("plugins.bot.triggers.http-webapi.detail"),
    };
  }
  // NOTE: id must be the sample as cliName to prevent parsing error for CLI default value.
  static functionsTimerTrigger(): HostTypeTriggerOptionItem {
    return {
      id: "timer-functions",
      hostType: HostType.Functions,
      triggers: [NotificationTriggers.TIMER],
      label: getLocalizedString("plugins.bot.triggers.timer-functions.label"),
      description: getLocalizedString("plugins.bot.triggers.timer-functions.description"),
      detail: getLocalizedString("plugins.bot.triggers.timer-functions.detail"),
    };
  }

  static functionsHttpAndTimerTrigger(): HostTypeTriggerOptionItem {
    return {
      id: "http-and-timer-functions",
      hostType: HostType.Functions,
      triggers: [NotificationTriggers.HTTP, NotificationTriggers.TIMER],
      label: getLocalizedString("plugins.bot.triggers.http-and-timer-functions.label"),
      description: getLocalizedString("plugins.bot.triggers.http-and-timer-functions.description"),
      detail: getLocalizedString("plugins.bot.triggers.http-and-timer-functions.detail"),
    };
  }

  static functionsHttpTrigger(): HostTypeTriggerOptionItem {
    return {
      id: "http-functions",
      hostType: HostType.Functions,
      triggers: [NotificationTriggers.HTTP],
      label: getLocalizedString("plugins.bot.triggers.http-functions.label"),
      description: getLocalizedString("plugins.bot.triggers.http-functions.description"),
      detail: getLocalizedString("plugins.bot.triggers.http-functions.detail"),
    };
  }

  static functionsTriggers(): HostTypeTriggerOptionItem[] {
    return [
      NotificationTriggerOptions.functionsHttpAndTimerTrigger(),
      NotificationTriggerOptions.functionsHttpTrigger(),
      NotificationTriggerOptions.functionsTimerTrigger(),
    ];
  }

  static all(): HostTypeTriggerOptionItem[] {
    return [
      NotificationTriggerOptions.appService(),
      NotificationTriggerOptions.appServiceForVS(),
      NotificationTriggerOptions.functionsHttpAndTimerTrigger(),
      NotificationTriggerOptions.functionsHttpTrigger(),
      NotificationTriggerOptions.functionsTimerTrigger(),
    ];
  }
}

export enum SPFxVersionOptionIds {
  installLocally = "true",
  globalPackage = "false",
}

export class CustomCopilotRagOptions {
  static customize(): OptionItem {
    return {
      id: "custom-copilot-rag-customize",
      label: getLocalizedString("template.teams.rag.source.customize.label"),
      detail: getLocalizedString("template.teams.rag.source.customize.detail"),
    };
  }

  static azureAISearch(): OptionItem {
    return {
      id: "custom-copilot-rag-azureAISearch",
      label: getLocalizedString("template.teams.rag.source.azureAISearch.label"),
      detail: getLocalizedString("template.teams.rag.source.azureAISearch.detail"),
    };
  }

  static customApi(): OptionItem {
    return {
      id: "custom-copilot-rag-customApi",
      label: getLocalizedString("template.teams.rag.source.customApi.label"),
      detail: getLocalizedString("template.teams.rag.source.customApi.detail"),
      description: getLocalizedString("core.createProjectQuestion.option.description.preview"),
    };
  }

  static microsoft365(): OptionItem {
    return {
      id: "custom-copilot-rag-microsoft365",
      label: getLocalizedString(
        "core.createProjectQuestion.capability.customCopilotRagMicrosoft365Option.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.customCopilotRagMicrosoft365Option.detail"
      ),
    };
  }

  static all(): OptionItem[] {
    return [
      CustomCopilotRagOptions.customize(),
      CustomCopilotRagOptions.azureAISearch(),
      CustomCopilotRagOptions.customApi(),
      CustomCopilotRagOptions.microsoft365(),
    ];
  }
}

export class CustomCopilotAssistantOptions {
  static new(): OptionItem {
    return {
      id: "custom-copilot-agent-new",
      label: getLocalizedString(
        "core.createProjectQuestion.capability.customCopilotAssistantNewOption.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.customCopilotAssistantNewOption.detail"
      ),
    };
  }

  static assistantsApi(): OptionItem {
    return {
      id: "custom-copilot-agent-assistants-api",
      label: getLocalizedString(
        "core.createProjectQuestion.capability.customCopilotAssistantAssistantsApiOption.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.customCopilotAssistantAssistantsApiOption.detail"
      ),
      description: getLocalizedString("core.createProjectQuestion.option.description.preview"),
    };
  }

  static all(): OptionItem[] {
    return [CustomCopilotAssistantOptions.new(), CustomCopilotAssistantOptions.assistantsApi()];
  }
}

export const recommendedLocations = [
  "South Africa North",
  "Australia East",
  "Central India",
  "East Asia",
  "Japan East",
  "Korea Central",
  "Southeast Asia",
  "Canada Central",
  "France Central",
  "Germany West Central",
  "Italy North",
  "North Europe",
  "Norway East",
  "Poland Central",
  "Sweden Central",
  "Switzerland North",
  "UK South",
  "West Europe",
  "Israel Central",
  "Qatar Central",
  "UAE North",
  "Brazil South",
  "Central US",
  "East US",
  "East US 2",
  "South Central US",
  "West US 2",
  "West US 3",
];

export class TeamsAppValidationOptions {
  static schema(): OptionItem {
    return {
      id: "validateAgainstSchema",
      label: getLocalizedString("core.selectValidateMethodQuestion.validate.schemaOption"),
    };
  }
  static package(): OptionItem {
    return {
      id: "validateAgainstPackage",
      label: getLocalizedString("core.selectValidateMethodQuestion.validate.appPackageOption"),
      detail: getLocalizedString(
        "core.selectValidateMethodQuestion.validate.appPackageOptionDescription"
      ),
    };
  }
  static testCases(): OptionItem {
    return {
      id: "validateWithTestCases",
      label: getLocalizedString("core.selectValidateMethodQuestion.validate.testCasesOption"),
      detail: getLocalizedString(
        "core.selectValidateMethodQuestion.validate.testCasesOptionDescription"
      ),
    };
  }
}

export enum HubTypes {
  teams = "teams",
  outlook = "outlook",
  office = "office",
}

export class HubOptions {
  static teams(): OptionItem {
    return {
      id: "teams",
      label: "Teams",
    };
  }
  static outlook(): OptionItem {
    return {
      id: "outlook",
      label: "Outlook",
    };
  }
  static office(): OptionItem {
    return {
      id: "office",
      label: "the Microsoft 365 app",
    };
  }
  static all(): OptionItem[] {
    return [this.teams(), this.outlook(), this.office()];
  }
}

export class ActionStartOptions {
  static newApi(): OptionItem {
    return {
      id: "new-api",
      label: getLocalizedString(
        "template.createProjectQuestion.capability.copilotPluginNewApiOption.label"
      ),
      detail: getLocalizedString(
        "template.createProjectQuestion.capability.copilotPluginNewApiOption.detail"
      ),
    };
  }

  static apiSpec(): OptionItem {
    return {
      id: "api-spec",
      label: getLocalizedString(
        "template.createProjectQuestion.capability.copilotPluginApiSpecOption.label"
      ),
      detail: getLocalizedString(
        "template.createProjectQuestion.capability.copilotPluginApiSpecOption.detail"
      ),
    };
  }

  static existingPlugin(): OptionItem {
    return {
      id: "existing-plugin",
      label: getLocalizedString("core.createProjectQuestion.apiPlugin.importPlugin.label"),
      detail: getLocalizedString("core.createProjectQuestion.apiPlugin.importPlugin.detail"),
    };
  }

  static mcp(): OptionItem {
    return {
      id: "mcp",
      label: getLocalizedString("template.createProjectQuestion.mcpForDa.label"),
      detail: getLocalizedString("template.createProjectQuestion.mcpForDa.detail"),
    };
  }

  static staticAll(doesProjectExists?: boolean): OptionItem[] {
    return doesProjectExists
      ? [ActionStartOptions.apiSpec(), ActionStartOptions.mcp()]
      : [ActionStartOptions.newApi(), ActionStartOptions.apiSpec()];
  }

  static all(inputs: Inputs, doesProjectExists?: boolean): OptionItem[] {
    if (doesProjectExists) {
      return [ActionStartOptions.apiSpec(), ActionStartOptions.mcp()];
    } else {
      // use constant string to avoid cycle dependency
      return [ActionStartOptions.newApi(), ActionStartOptions.apiSpec()];
    }
  }
}

export class GCSelectOptions {
  static list(): OptionItem {
    return {
      id: "listConnections",
      label: getLocalizedString("core.GCSelectOptions.listOption.title"),
      detail: getLocalizedString("core.GCSelectOptions.listOption.description"),
    };
  }
  static input(): OptionItem {
    return {
      id: "inputConnectionId",
      label: getLocalizedString("core.GCSelectOptions.inputOption.title"),
      detail: getLocalizedString("core.GCSelectOptions.inputOption.description"),
      data: "https://aka.ms/teamsfx-graph-connector-id",
      buttons: [
        {
          iconPath: "file-symlink-file",
          tooltip: getLocalizedString("core.option.tutorial"),
          command: "fx-extension.openTutorial",
        },
      ],
    };
  }
}

export class KnowledgeSourceOptions {
  static webSearch(): OptionItem {
    return {
      id: "web-search",
      label: getLocalizedString("core.createProjectQuestion.capability.knowledgeWebSearch.label"),
      detail: getLocalizedString("core.createProjectQuestion.capability.knowledgeWebSearch.detail"),
    };
  }

  static oneDriveSharePoint(): OptionItem {
    return {
      id: "oneDrive-sharePoint",
      label: getLocalizedString(
        "core.createProjectQuestion.capability.knowledgeOneDriveSharePoint.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.knowledgeOneDriveSharePoint.detail"
      ),
    };
  }

  static graphConnector(): OptionItem {
    return {
      id: "graph-connector",
      label: getLocalizedString(
        "core.createProjectQuestion.capability.knowledgeGraphConnector.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.knowledgeGraphConnector.detail"
      ),
    };
  }

  static embeddedKnowledge(): OptionItem {
    return {
      id: "embedded-knowledge",
      label: getLocalizedString(
        "core.createProjectQuestion.capability.knowledgeEmbeddedKnowledge.label"
      ),
      detail: getLocalizedString(
        "core.createProjectQuestion.capability.knowledgeEmbeddedKnowledge.detail"
      ),
    };
  }

  static all(): OptionItem[] {
    const items: OptionItem[] = [
      KnowledgeSourceOptions.webSearch(),
      KnowledgeSourceOptions.oneDriveSharePoint(),
      KnowledgeSourceOptions.graphConnector(),
      KnowledgeSourceOptions.embeddedKnowledge(),
    ];
    return items;
  }

  static allWithFeatureFlags(): OptionItem[] {
    const items: OptionItem[] = [
      KnowledgeSourceOptions.webSearch(),
      KnowledgeSourceOptions.oneDriveSharePoint(),
      KnowledgeSourceOptions.graphConnector(),
      KnowledgeSourceOptions.embeddedKnowledge(),
    ];
    return items;
  }
}

export class KnowledgeSearchTypeOptions {
  static url(): OptionItem {
    return {
      id: "url",
      label: getLocalizedString("core.addKnowledgeQuestion.searchType.url"),
    };
  }
  static allWeb(): OptionItem {
    return {
      id: "all-web",
      label: getLocalizedString("core.addKnowledgeQuestion.searchType.web"),
    };
  }
  static allOneDriveSharepoint(): OptionItem {
    return {
      id: "all-oneDrive-sharePoint",
      label: getLocalizedString("core.addKnowledgeQuestion.searchType.oneDriveSharepoint"),
    };
  }
  static all(): OptionItem[] {
    const items: OptionItem[] = [
      KnowledgeSearchTypeOptions.url(),
      KnowledgeSearchTypeOptions.allWeb(),
      KnowledgeSearchTypeOptions.allOneDriveSharepoint(),
    ];
    return items;
  }
}
