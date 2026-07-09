// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Sorted templates that maps to question tree
// @author Ning Tang
export enum TemplateNames {
  // declarative agent
  DeclarativeAgentBasic = "copilot-gpt-basic", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithActionFromScratch = "api-plugin-from-scratch", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithActionFromScratchBearer = "api-plugin-from-scratch-bearer", // handled by DeclarativeAgentGenerator (The DeclarativeAgentWithActionFromScratchBearer template is currently actually ApiPluginFromScratchAPIKey)
  DeclarativeAgentWithActionFromScratchOAuth = "api-plugin-from-scratch-oauth", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithActionFromExistingApiSpec = "api-plugin-from-existing-api", // handled by DeclarativeAgentWithExistingApiSpecGenerator
  DeclarativeAgentWithExistingAction = "api-plugin-existing-api", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithTypeSpec = "declarative-agent-typespec", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithGraphConnector = "declarative-agent-with-graph-connector", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithActionFromMCP = "declarative-agent-with-action-from-mcp", // handled by DeclarativeAgentGenerator
  DeclarativeAgentWithSkill = "declarative-agent-with-skill", // handled by DeclarativeAgentGenerator

  // custom engine agent
  BasicCustomEngineAgent = "basic-custom-engine-agent",
  WeatherAgent = "weather-agent",
  TravelAgent = "travel-agent",

  // agent for Teams
  CustomCopilotBasic = "custom-copilot-basic",
  CustomCopilotRagCustomize = "custom-copilot-rag-customize",
  CustomCopilotRagAzureAISearch = "custom-copilot-rag-azure-ai-search",
  CustomCopilotRagCustomApi = "custom-copilot-rag-custom-api", // handled by CustomEngineAgentWithExistingApiSpecGenerator
  CustomCopilotRagMicrosoft365 = "custom-copilot-rag-microsoft365",
  CustomCopilotAssistantNew = "custom-copilot-assistant-new",
  CustomCopilotAssistantAssistantsApi = "custom-copilot-assistant-assistants-api",
  TeamsCollaboratorAgent = "teams-collaborator-agent",

  // Copilot connector
  GraphConnector = "graph-connector", // vsc only

  // tab
  Tab = "non-sso-tab",
  SsoTabNaa = "sso-tab-naa",
  DashboardTab = "dashboard-tab",
  TabSSR = "non-sso-tab-ssr", // handled by SsrTabGenerator
  SsoTabSSR = "sso-tab-ssr", // handled by SsrTabGenerator
  TabSPFx = "spfx-tab", // handled by SPFxGeneratorNew

  // bot
  DefaultBot = "default-bot",
  NotificationExpress = "notification-express", // vsc only
  NotificationWebApi = "notification-webapi", // vs only
  NotificationHttpTrigger = "notification-http-trigger",
  NotificationTimerTrigger = "notification-timer-trigger",
  NotificationHttpTimerTrigger = "notification-http-timer-trigger",
  CommandAndResponse = "command-and-response",
  Workflow = "workflow",

  // messaging extension
  MessageExtensionWithNewApiFromScratch = "copilot-plugin-from-scratch",
  MessageExtensionWithNewApiFromScratchUsingApiKey = "copilot-plugin-from-scratch-api-key",
  MessageExtensionWithNewApiFromScratchUsingOAuth = "api-message-extension-sso",
  MessageExtensionWithExistingApiSpec = "copilot-plugin-existing-api", // handled by MessageExtensionWithExistingApiSpecGenerator
  MessageExtensionM365 = "m365-message-extension",
  MessageExtensionAction = "message-extension-action",
  LinkUnfurling = "link-unfurling",
  DefaultMessageExtension = "default-message-extension",

  // WXP
  OutlookTaskpane = "office-addin-outlook-taskpane", // handled by OfficeAddinGeneratorNew
  WXPTaskpane = "office-addin-wxpo-taskpane", // handled by OfficeAddinGeneratorNew
  ExcelCFShortcut = "office-addin-excel-cfshortcut", // handled by OfficeAddinGeneratorNew
  OfficeAddinCommon = "office-addin-config", // handled by OfficeAddinGeneratorNew

  // VS only
  Empty = "empty",
  MessageExtensionSearch = "message-extension-search",

  FoundryAgent = "foundry-agent-to-m365",
  FoundryProxyAgent = "foundry-proxy-agent",

  // blank
  BlankApp = "blank-app",

  // openplugin import — baseline files scaffolded by 'atk import openplugin'
  OpenPluginImport = "open-plugin-import",
}

export enum TemplateAlias {
  // declarative agent
  DeclarativeAgentBasic = "declarative-agent",
  DeclarativeAgentWithActionFromScratch = "declarative-agent-action",
  DeclarativeAgentWithActionFromScratchBearer = "declarative-agent-action-bearer",
  DeclarativeAgentWithActionFromScratchOAuth = "declarative-agent-action-oauth",
  DeclarativeAgentWithActionFromExistingApiSpec = "declarative-agent-action-from-existing-api",
  DeclarativeAgentWithExistingAction = "declarative-agent-existing-action",
  DeclarativeAgentWithSkill = "declarative-agent-skill",

  // agent for Teams
  CustomCopilotBasic = "teams-agent",
  CustomCopilotRagCustomize = "teams-agent-rag-customize",
  CustomCopilotRagAzureAISearch = "teams-agent-rag-azure-ai-search",
  CustomCopilotRagCustomApi = "teams-agent-rag-custom-api",

  // Copilot connector
  GraphConnector = "copilot-connector",

  // tab
  Tab = "tab",
  TabSSR = "tab-ssr", // handled by SsrTabGenerator
  SsoTabSSR = "sso-tab-ssr", // handled by SsrTabGenerator

  // bot
  DefaultBot = "bot",

  // messaging extension
  DefaultMessageExtension = "message-extension",

  // blank
  BlankApp = "blank",
}
