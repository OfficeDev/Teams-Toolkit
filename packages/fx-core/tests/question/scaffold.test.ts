// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  ConditionFunc,
  ConfigFolderName,
  Inputs,
  LocalFunc,
  OptionItem,
  Platform,
  SingleSelectQuestion,
  StringValidation,
} from "@microsoft/teamsfx-api";
import { featureFlagManager, FeatureFlagName, FeatureFlags } from "../../src/common/featureFlags";
import { getLocalizedString } from "../../src/common/localizeUtils";
import { AppDefinition } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { Bot } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/bot";
import { MessagingExtension } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/messagingExtension";
import { StaticTab } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/staticTab";
import { TemplateNames } from "../../src/component/generator/templates/templateNames";
import { ProgrammingLanguage, QuestionNames } from "../../src/question/constants";
import { foundryAgentIdQuestion, foundryEndpointQuestion } from "../../src/question/create";
import {
  apiSpecNode,
  apiSpecWithSearchNode,
  foundryNode,
} from "../../src/question/scaffold/commonNodes";
import { constructNode } from "../../src/question/scaffold/constructNode";
import { scaffoldQuestionForVS } from "../../src/question/scaffold/vs/createRootNode";
import {
  ActionStartOptions,
  BotCapabilityOptions,
  CustomCopilotRagOptions,
  MeArchitectureOptions,
  MeCapabilityOptions,
  NotificationBotOptions,
  TabCapabilityOptions,
  TeamsAgentCapabilityOptions,
} from "../../src/question/scaffold/vsc/CapabilityOptions";
import { ProjectTypeOptions } from "../../src/question/scaffold/vsc/ProjectTypeOptions";
import {
  createFromTdpNode,
  getTemplateName,
} from "../../src/question/scaffold/vsc/createFromTdpNode";
import {
  folderAndAppNameCondition,
  languageNode,
  scaffoldQuestionForVSCode,
} from "../../src/question/scaffold/vsc/createRootNode";
import { daProjectTypeNode } from "../../src/question/scaffold/vsc/daProjectTypeNode";
import * as templateHelper from "../../src/component/generator/templateHelper";
import {
  getRootProjectTypeNode,
  getTdpProjectTypeNode,
} from "../../src/question/scaffold/vsc/rootNode";

import { AppPackageFolderName } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import { assert, vi } from "vitest";
import {
  botProjectTypeNode,
  CreateNewPluginManifestSentinel,
  customCopilotRagNode,
  getTeamsProjectNode,
  m365SearchMeSubNode,
  MCPCliPreFetchToolsNode,
  MCPForDAServerUrlNode,
  MCPToolsFileNode,
  meProjectTypeNode,
  notificationBotTriggerNode,
  tabProjectTypeNode,
  teamsProjectTypeDeps,
  TeamsProjectTypeOptions,
  updateActionWithMCP,
  MCPForDAAuthTypeStaticOptions,
  MCPForDAAuthCredentialNodes,
  MCPServerTypeNode,
} from "../../src/question/scaffold/vsc/teamsProjectTypeNode";

describe("vsc", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("scaffoldQuestionForVSCode", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    assert.isFunction(scaffoldQuestionForVSCode);
  });
  it("scaffoldQuestionForVSCode", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    assert.isFunction(scaffoldQuestionForVSCode);
  });
  it("createFromTdpNode", () => {
    assert.isFunction(createFromTdpNode);
  });
});

describe("vs", () => {
  it("scaffoldQuestionForVS", () => {
    assert.isFunction(scaffoldQuestionForVS);
  });
});

describe("getTemplateName", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const validBot: Bot = {
    botId: "botId",
    isNotificationOnly: false,
    needsChannelSelector: false,
    personalCommands: [{ title: "title", description: "description" }],
    supportsFiles: false,
    supportsCalling: false,
    supportsVideo: false,
    teamCommands: [{ title: "title", description: "description" }],
    groupChatCommands: [{ title: "title", description: "description" }],
    scopes: ["scope"],
  };

  const validStaticTab: StaticTab = {
    objectId: "objId",
    entityId: "entityId",
    name: "tab",
    contentUrl: "https://url",
    websiteUrl: "https:/url",
    scopes: [],
    context: [],
  };

  const validMessagingExtension: MessagingExtension = {
    objectId: "objId",
    botId: "botId",
    canUpdateConfiguration: true,
    commands: [],
    messageHandlers: [],
  };

  it("return TabNonSso", () => {
    const appDefinition: AppDefinition = {
      teamsAppId: "id",
      staticTabs: [validStaticTab],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      teamsAppFromTdp: appDefinition,
    };

    const res = getTemplateName(inputs);
    assert.equal(res, TemplateNames.Tab);
  });

  it("return DefaultBotAndMessageExtension", () => {
    const appDefinition: AppDefinition = {
      teamsAppId: "id",
      bots: [validBot],
      messagingExtensions: [validMessagingExtension],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      teamsAppFromTdp: appDefinition,
    };

    const res = getTemplateName(inputs);
    assert.equal(res, TemplateNames.DefaultBot);
  });

  it("return MessageExtension", () => {
    const appDefinition: AppDefinition = {
      teamsAppId: "id",
      messagingExtensions: [validMessagingExtension],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      teamsAppFromTdp: appDefinition,
    };

    const res = getTemplateName(inputs);
    assert.equal(res, TemplateNames.DefaultMessageExtension);
  });

  it("return bot", () => {
    const appDefinition: AppDefinition = {
      teamsAppId: "id",
      bots: [validBot],
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      teamsAppFromTdp: appDefinition,
    };

    const res = getTemplateName(inputs);
    assert.equal(res, TemplateNames.DefaultBot);
  });

  it("return undefined", () => {
    const appDefinition: AppDefinition = {
      teamsAppId: "id",
    };

    const inputs: Inputs = {
      platform: Platform.VSCode,
      teamsAppFromTdp: appDefinition,
    };

    const res = getTemplateName(inputs);
    assert.isUndefined(res);
  });
});

describe("daProjectTypeNode", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("daProjectTypeNode basic structure", () => {
    const node = daProjectTypeNode();
    const conditionFunc = node?.condition as StringValidation;

    assert.equal(conditionFunc.equals, ProjectTypeOptions.copilotAgentOptionId);
    assert.isDefined(node.children);
  });

  it("should return apiSpecWithSearchNode when KiotaNPMIntegration is enabled", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      if (flag === FeatureFlags.KiotaNPMIntegration) {
        return true;
      }
      return false;
    });

    const node = daProjectTypeNode();
    const withPluginNode = node.children?.[0];
    assert.isDefined(withPluginNode);

    const actionTypeNode = withPluginNode?.children?.[0];
    assert.isDefined(actionTypeNode);

    const apiSpecChildNode = actionTypeNode?.children?.[1];

    assert.isDefined(apiSpecChildNode);

    const firstChild = apiSpecChildNode?.children?.[0];
    assert.isDefined(firstChild);

    const selectApiSpecQuestion = firstChild?.data;
    assert.isDefined(selectApiSpecQuestion);
    assert.equal(selectApiSpecQuestion?.name, QuestionNames.OpenAPISpecType);
  });

  it("should return apiSpecNode when KiotaNPMIntegration is disabled", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      if (flag === FeatureFlags.KiotaNPMIntegration) {
        return false;
      }
      return false;
    });

    const node = daProjectTypeNode();
    const withPluginNode = node.children?.[0];
    assert.isDefined(withPluginNode);

    const actionTypeNode = withPluginNode?.children?.[0];
    assert.isDefined(actionTypeNode);

    const apiSpecChildNode = actionTypeNode?.children?.[1];

    assert.isDefined(apiSpecChildNode);

    assert.isFunction(apiSpecChildNode?.condition);

    const testInputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
    };

    const conditionFunc = apiSpecChildNode?.condition as ConditionFunc;
    assert.isTrue(conditionFunc(testInputs));
  });

  it("should include MCP option", () => {
    const node = daProjectTypeNode();
    const withPluginNode = node.children?.[0];
    assert.isDefined(withPluginNode);

    const actionTypeNode = withPluginNode?.children?.[0];
    assert.isDefined(actionTypeNode);

    const actionTypeData = actionTypeNode?.data as SingleSelectQuestion;
    assert.isDefined(actionTypeData);
    assert.isDefined(actionTypeData.staticOptions);

    // Check that MCP option is included in staticOptions
    const staticOptions = actionTypeData.staticOptions;
    let mcpOption: string | OptionItem | undefined;

    if (Array.isArray(staticOptions) && staticOptions.length > 0) {
      if (typeof staticOptions[0] === "string") {
        mcpOption = (staticOptions as string[]).find(
          (option) => option === ActionStartOptions.mcp().id
        );
      } else {
        mcpOption = (staticOptions as OptionItem[]).find(
          (option) => option.id === ActionStartOptions.mcp().id
        );
      }
    }

    assert.isDefined(mcpOption);
    const mcpOptionId = typeof mcpOption === "string" ? mcpOption : mcpOption?.id;
    assert.equal(mcpOptionId, "mcp");
  });
});

describe("customEngineAgentProjectTypeNode", () => {
  const root = getRootProjectTypeNode(Platform.VSCode);

  it("customEngineAgentProjectTypeNode basic structure", () => {
    const node = root.children?.find(
      (c) =>
        (c.condition as StringValidation)?.equals === ProjectTypeOptions.customEngineAgentOptionId
    );
    assert.isDefined(node);
    const conditionFunc = node?.condition as StringValidation;
    assert.equal(conditionFunc.equals, ProjectTypeOptions.customEngineAgentOptionId);
    assert.isDefined(node!.children);
  });

  it("should extract CEA sub-tree from wizardNode with correct options", () => {
    const node = root.children?.find(
      (c) =>
        (c.condition as StringValidation)?.equals === ProjectTypeOptions.customEngineAgentOptionId
    );
    assert.isDefined(node);
    assert.isDefined(node!.data);
    const data = node!.data as SingleSelectQuestion;
    assert.isDefined(data.staticOptions);
    const options = data.staticOptions as OptionItem[];
    const optionIds = options.map((o) => o.id);
    assert.include(optionIds, "basic-custom-engine-agent");
    assert.include(optionIds, "weather-agent");
  });
});

describe("teamsProjectTypeNode", () => {
  it("should extract Teams sub-tree from wizardNode", () => {
    const node = getTeamsProjectNode();
    assert.isDefined(node);
    const condition = node.condition as StringValidation;
    assert.equal(condition.equals, "teams-agent-and-app-type");
  });
});

describe("MCPForDAAuthTypeStaticOptions", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides oauth-dynamic by default", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const options = MCPForDAAuthTypeStaticOptions();
    assert.lengthOf(options, 3);
    assert.sameMembers(
      options.map((o) => o.id),
      ["oauth", "entra-sso", "none"]
    );
  });

  it("surfaces oauth-dynamic when both DT and DCR flags are on", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.MCPForDADT || flag === FeatureFlags.MCPForDADCR;
    });
    const options = MCPForDAAuthTypeStaticOptions();
    assert.lengthOf(options, 4);
    assert.sameMembers(
      options.map((o) => o.id),
      ["oauth", "oauth-dynamic", "entra-sso", "none"]
    );
  });

  it("hides oauth-dynamic when only DT flag is on", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.MCPForDADT;
    });
    const options = MCPForDAAuthTypeStaticOptions();
    assert.lengthOf(options, 3);
  });
});

describe("MCPForDAAuthCredentialNodes", () => {
  const [clientIdNode, clientSecretNode, scopesNode] = MCPForDAAuthCredentialNodes();

  it("returns three credential nodes", () => {
    assert.equal((clientIdNode.data as any).name, QuestionNames.MCPForDAClientId);
    assert.equal((clientSecretNode.data as any).name, QuestionNames.MCPForDAClientSecret);
    assert.equal((scopesNode.data as any).name, QuestionNames.MCPForDAScopes);
  });

  it("client id node is shown for oauth and entra-sso only", () => {
    const cond = clientIdNode.condition as ConditionFunc;
    assert.isTrue(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "oauth" } as Inputs)
    );
    assert.isTrue(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "entra-sso" } as Inputs)
    );
    assert.isFalse(
      cond({
        platform: Platform.VSCode,
        [QuestionNames.MCPForDAAuthType]: "oauth-dynamic",
      } as Inputs)
    );
    assert.isFalse(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "none" } as Inputs)
    );
  });

  it("client id node title/placeholder differ between entra-sso and oauth", () => {
    const data = clientIdNode.data as any;
    const oauthInputs = {
      platform: Platform.VSCode,
      [QuestionNames.MCPForDAAuthType]: "oauth",
    } as Inputs;
    const entraInputs = {
      platform: Platform.VSCode,
      [QuestionNames.MCPForDAAuthType]: "entra-sso",
    } as Inputs;
    assert.isString(data.title(oauthInputs));
    assert.isString(data.title(entraInputs));
    assert.notEqual(data.title(oauthInputs), data.title(entraInputs));
    assert.isString(data.placeholder(oauthInputs));
    assert.notEqual(data.placeholder(oauthInputs), data.placeholder(entraInputs));
  });

  it("client id validation requires a value (oauth and entra-sso messages)", () => {
    const validFunc = (clientIdNode.data as any).validation.validFunc;
    assert.isString(
      validFunc("", {
        platform: Platform.VSCode,
        [QuestionNames.MCPForDAAuthType]: "oauth",
      } as Inputs)
    );
    const entraMsg = validFunc("  ", {
      platform: Platform.VSCode,
      [QuestionNames.MCPForDAAuthType]: "entra-sso",
    } as Inputs);
    assert.isString(entraMsg);
    assert.isUndefined(
      validFunc("client-id", {
        platform: Platform.VSCode,
        [QuestionNames.MCPForDAAuthType]: "oauth",
      } as Inputs)
    );
  });

  it("client secret node is shown only for oauth and requires a value", () => {
    const cond = clientSecretNode.condition as ConditionFunc;
    assert.isTrue(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "oauth" } as Inputs)
    );
    assert.isFalse(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "entra-sso" } as Inputs)
    );
    const validFunc = (clientSecretNode.data as any).validation.validFunc;
    assert.isString(validFunc(""));
    assert.isString(validFunc("   "));
    assert.isUndefined(validFunc("a-secret"));
    assert.isTrue((clientSecretNode.data as any).password);
  });

  it("scopes node is shown only for oauth and is optional", () => {
    const cond = scopesNode.condition as ConditionFunc;
    assert.isTrue(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "oauth" } as Inputs)
    );
    assert.isFalse(
      cond({ platform: Platform.VSCode, [QuestionNames.MCPForDAAuthType]: "entra-sso" } as Inputs)
    );
    assert.isFalse((scopesNode.data as any).required);
  });
});

describe("MCPServerTypeNode auth-type gating", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getAuthTypeCondition(): ConditionFunc {
    const node = MCPServerTypeNode();
    const remote = node.children?.[0];
    const authTypeNode = remote?.children?.[2];
    return authTypeNode?.condition as ConditionFunc;
  }

  it("always shows auth-type pick for CLI", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const cond = getAuthTypeCondition();
    assert.isTrue(cond({ platform: Platform.CLI } as Inputs));
  });

  it("hides auth-type pick for VS Code when DT flag is off", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const cond = getAuthTypeCondition();
    assert.isFalse(cond({ platform: Platform.VSCode } as Inputs));
  });

  it("shows auth-type pick for VS Code when DT flag is on", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.MCPForDADT;
    });
    const cond = getAuthTypeCondition();
    assert.isTrue(cond({ platform: Platform.VSCode } as Inputs));
  });
});

describe("m365ProjectTypeNode", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("apiSpecNode", () => {
    const node = apiSpecNode({ equals: "a" });
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    const condition = node.children?.[1].condition as ConditionFunc;
    const res = condition?.(inputs);
    assert.isTrue(res);
  });

  it("apiSpecWithSearchNode", () => {
    const node = apiSpecWithSearchNode();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.ActionType]: ActionStartOptions.apiSpecWithSearch().id,
      [QuestionNames.ActionManifestPath]: "test",
      [QuestionNames.SelectOpenApiSpec]: "test",
    };
    const condition = node.children?.[0].children?.[0]?.children?.[0].condition as ConditionFunc;
    const res = condition?.(inputs);
    assert.isFalse(res);

    const condition2 = node.children?.[0]?.children?.[2]?.children?.[1]?.condition as ConditionFunc;
    const res2 = condition2?.(inputs);
    assert.isTrue(res2);

    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      if (flag === FeatureFlags.KiotaNPMIntegration) {
        return true;
      }
      return false;
    });

    const condition3 = node.children?.[0]?.condition as ConditionFunc;
    const res3 = condition3?.(inputs);
    assert.isTrue(res3);
    assert.isTrue(inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id);
  });
});

describe("ProjectTypeOptions", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("officeMetaOS - VSC", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const option = ProjectTypeOptions.officeAddin(Platform.VSCode);
    assert.equal(option.id, ProjectTypeOptions.officeMetaOSOptionId);
  });
  it("officeMetaOS - CLI", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const option = ProjectTypeOptions.officeAddin(Platform.CLI);
    assert.equal(option.id, ProjectTypeOptions.officeMetaOSOptionId);
  });
  it("blankApp - VSC", () => {
    const option = ProjectTypeOptions.blankApp(Platform.VSCode);
    assert.equal(option.id, ProjectTypeOptions.blankAppOptionId);
    assert.include(option.label, "$(file)");
    assert.isDefined(option.detail);
  });
  it("blankApp - CLI", () => {
    const option = ProjectTypeOptions.blankApp(Platform.CLI);
    assert.equal(option.id, ProjectTypeOptions.blankAppOptionId);
    assert.notInclude(option.label, "$(file)");
  });
  it("start with github copilot", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const option = ProjectTypeOptions.startWithGithubCopilot();
    assert.notEqual(option.description, undefined);
  });
  it("start with github copilot with preview", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const option = ProjectTypeOptions.startWithGithubCopilot();
    assert.isUndefined(option.description);
  });
});

describe("TeamsProjectTypeOptions", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("CLI label", () => {
    const tab = TeamsProjectTypeOptions.tab(Platform.CLI);
    assert.equal(tab.label, getLocalizedString("core.TabOption.label"));
    const bot = TeamsProjectTypeOptions.bot(Platform.CLI);
    assert.equal(bot.label, getLocalizedString("core.createProjectQuestion.projectType.bot.label"));
    const me = TeamsProjectTypeOptions.me(Platform.CLI);
    assert.equal(me.label, getLocalizedString("core.MessageExtensionOption.label"));
  });
  it("VSCode label includes icon prefixes", () => {
    const tab = TeamsProjectTypeOptions.tab(Platform.VSCode);
    assert.include(tab.label, "$(browser)");
    assert.equal(tab.id, TeamsProjectTypeOptions.tabOptionId);
    const bot = TeamsProjectTypeOptions.bot(Platform.VSCode);
    assert.include(bot.label, "$(hubot)");
    assert.equal(bot.id, TeamsProjectTypeOptions.botOptionId);
    const me = TeamsProjectTypeOptions.me(Platform.VSCode);
    assert.include(me.label, "$(symbol-keyword)");
    assert.equal(me.id, TeamsProjectTypeOptions.meOptionId);
  });
  it("default platform is VSCode and options have detail", () => {
    const tab = TeamsProjectTypeOptions.tab();
    assert.include(tab.label, "$(browser)");
    assert.isDefined(tab.detail);
    const bot = TeamsProjectTypeOptions.bot();
    assert.include(bot.label, "$(hubot)");
    assert.isDefined(bot.detail);
    const me = TeamsProjectTypeOptions.me();
    assert.include(me.label, "$(symbol-keyword)");
    assert.isDefined(me.detail);
  });
});

describe("customCopilotRagNode", () => {
  it("has correct condition, type and children", () => {
    const node = customCopilotRagNode();
    const condition = node.condition as { equals: string };
    assert.equal(condition.equals, TeamsAgentCapabilityOptions.customCopilotRag().id);
    const data = node.data as SingleSelectQuestion;
    assert.equal(data.name, QuestionNames.CustomCopilotRag);
    assert.equal(data.type, "singleSelect");
    assert.equal((data.staticOptions as OptionItem[]).length, 3);
    assert.equal(data.default, CustomCopilotRagOptions.customize().id);
  });
  it("children contains apiSpecNode for customApi condition", () => {
    const node = customCopilotRagNode();
    assert.equal(node.children?.length, 1);
    const child = node.children![0];
    const childCondition = child.condition as { equals: string };
    assert.equal(childCondition.equals, CustomCopilotRagOptions.customApi().id);
  });
  it("staticOptions include customize, azureAISearch, customApi", () => {
    const node = customCopilotRagNode();
    const data = node.data as SingleSelectQuestion;
    const ids = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.include(ids, CustomCopilotRagOptions.customize().id);
    assert.include(ids, CustomCopilotRagOptions.azureAISearch().id);
    assert.include(ids, CustomCopilotRagOptions.customApi().id);
  });
});

describe("notificationBotTriggerNode", () => {
  it("default (VSCode) uses appService option", () => {
    const node = notificationBotTriggerNode();
    const condition = node.condition as { equals: string };
    assert.equal(condition.equals, BotCapabilityOptions.notificationBotId);
    const data = node.data as SingleSelectQuestion;
    assert.equal(data.type, "singleSelect");
    const firstOption = (data.staticOptions as OptionItem[])[0];
    assert.equal(firstOption.id, NotificationBotOptions.appService().id);
    assert.equal(data.default, NotificationBotOptions.appService().id);
  });
  it("Platform.VS uses appServiceForVS option", () => {
    const node = notificationBotTriggerNode(Platform.VS);
    const data = node.data as SingleSelectQuestion;
    const firstOption = (data.staticOptions as OptionItem[])[0];
    assert.equal(firstOption.id, NotificationBotOptions.appServiceForVS().id);
    assert.equal(data.default, NotificationBotOptions.appServiceForVS().id);
  });
  it("has 4 options total", () => {
    const node = notificationBotTriggerNode();
    const data = node.data as SingleSelectQuestion;
    assert.equal((data.staticOptions as OptionItem[]).length, 4);
  });
});

describe("botProjectTypeNode", () => {
  it("has correct condition and 4 staticOptions with notification child", () => {
    const node = botProjectTypeNode();
    const condition = node.condition as { equals: string };
    assert.equal(condition.equals, TeamsProjectTypeOptions.botOptionId);
    const data = node.data as SingleSelectQuestion;
    assert.equal((data.staticOptions as OptionItem[]).length, 4);
    const optionIds = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.include(optionIds, BotCapabilityOptions.basicBot().id);
    assert.include(optionIds, BotCapabilityOptions.notificationBot().id);
    assert.include(optionIds, BotCapabilityOptions.commandBot().id);
    assert.include(optionIds, BotCapabilityOptions.workflowBot().id);
    assert.equal(node.children?.length, 1);
    const triggerChild = node.children![0];
    const triggerCond = triggerChild.condition as { equals: string };
    assert.equal(triggerCond.equals, BotCapabilityOptions.notificationBotId);
  });
});

describe("tabProjectTypeNode", () => {
  it("has correct condition and 4 staticOptions", () => {
    const node = tabProjectTypeNode();
    const condition = node.condition as { equals: string };
    assert.equal(condition.equals, TeamsProjectTypeOptions.tabOptionId);
    const data = node.data as SingleSelectQuestion;
    assert.equal((data.staticOptions as OptionItem[]).length, 4);
    assert.equal(data.name, QuestionNames.Capabilities);
  });
  it("has SPFx sub-tree child with SPFxTab condition", () => {
    const node = tabProjectTypeNode();
    assert.equal(node.children?.length, 1);
    const spfxChild = node.children![0];
    const cond = spfxChild.condition as { equals: string };
    assert.equal(cond.equals, TabCapabilityOptions.SPFxTab().id);
  });
  it("SPFx sub-tree contains new and import branches", () => {
    const node = tabProjectTypeNode();
    const spfxChild = node.children![0];
    assert.isDefined(spfxChild.children);
    const newBranch = spfxChild.children!.find(
      (c) => (c.condition as { equals?: string })?.equals === "new"
    );
    assert.isDefined(newBranch);
    const importBranch = spfxChild.children!.find(
      (c) => (c.condition as { equals?: string })?.equals === "import"
    );
    assert.isDefined(importBranch);
    // new branch should have 3 children (package, framework, webpart name)
    assert.equal(newBranch!.children?.length, 3);
  });
});

describe("meProjectTypeNode", () => {
  it("has correct condition, 3 staticOptions, and m365SearchMeSubNode child", () => {
    const node = meProjectTypeNode();
    const condition = node.condition as { equals: string };
    assert.equal(condition.equals, TeamsProjectTypeOptions.meOptionId);
    const data = node.data as SingleSelectQuestion;
    assert.equal((data.staticOptions as OptionItem[]).length, 3);
    assert.equal(node.children?.length, 1);
    const subNode = node.children![0];
    const subCond = subNode.condition as { equals: string };
    assert.equal(subCond.equals, MeCapabilityOptions.m365SearchMe().id);
  });
});

describe("m365SearchMeSubNode", () => {
  it("has correct condition, type, and 3 staticOptions", () => {
    const node = m365SearchMeSubNode();
    const condition = node.condition as { equals: string };
    assert.equal(condition.equals, MeCapabilityOptions.m365SearchMe().id);
    const data = node.data as SingleSelectQuestion;
    assert.equal(data.type, "singleSelect");
    assert.equal((data.staticOptions as OptionItem[]).length, 3);
  });
  it("has 2 children: newApi auth child and openApiSpec child", () => {
    const node = m365SearchMeSubNode();
    assert.equal(node.children?.length, 2);
    const authChild = node.children![0];
    const authCond = authChild.condition as { equals: string };
    assert.equal(authCond.equals, MeArchitectureOptions.newApi().id);
    const apiSpecChild = node.children![1];
    const specCond = apiSpecChild.condition as { equals: string };
    assert.equal(specCond.equals, MeArchitectureOptions.openApiSpec().id);
  });
  it("newApi child is singleSelect with 3 auth options", () => {
    const node = m365SearchMeSubNode();
    const authChild = node.children![0];
    const data = authChild.data as SingleSelectQuestion;
    assert.equal(data.type, "singleSelect");
    assert.equal(data.name, QuestionNames.ApiAuth);
    assert.equal((data.staticOptions as OptionItem[]).length, 3);
  });
});

describe("MCPToolsFileNode", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("condition returns false for Platform.VSCode", () => {
    const node = MCPToolsFileNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = { platform: Platform.VSCode };
    assert.isFalse(condition(inputs));
  });
  it("condition returns true for CLI when no tools", () => {
    const node = MCPToolsFileNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    assert.isTrue(condition(inputs));
  });
  it("condition returns true for CLI when tools is empty array", () => {
    const node = MCPToolsFileNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = { platform: Platform.CLI, [QuestionNames.MCPForDAAvailableTools]: [] };
    assert.isTrue(condition(inputs));
  });
  it("condition returns false for CLI when tools are present", () => {
    const node = MCPToolsFileNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "t1" }],
    };
    assert.isFalse(condition(inputs));
  });
  it("validFunc returns undefined for empty value", async () => {
    const node = MCPToolsFileNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const result = await validFunc("", { platform: Platform.CLI });
    assert.isUndefined(result);
  });
  it("validFunc returns error string when file not found", async () => {
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(false);
    const node = MCPToolsFileNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const result = await validFunc("/nonexistent/tools.json", { platform: Platform.CLI });
    assert.isString(result);
    assert.isTrue((result as string).length > 0);
  });
  it("validFunc populates inputs and returns undefined on success", async () => {
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    const mockTools = [{ name: "tool1", description: "desc", inputSchema: {} }];
    vi.spyOn(teamsProjectTypeDeps, "readMCPToolsFromFile").mockResolvedValue(mockTools as any);
    const node = MCPToolsFileNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    const result = await validFunc("/some/tools.json", inputs);
    assert.isUndefined(result);
    assert.deepEqual(inputs[QuestionNames.MCPForDAAvailableTools], mockTools);
  });
  it("validFunc returns error message when readMCPToolsFromFile throws", async () => {
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readMCPToolsFromFile").mockRejectedValue(
      new Error("bad json format")
    );
    const node = MCPToolsFileNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const result = await validFunc("/bad/tools.json", { platform: Platform.CLI });
    assert.equal(result, "bad json format");
  });
});

describe("MCPCliPreFetchToolsNode", () => {
  it("condition returns false for Platform.VSCode", () => {
    const node = MCPCliPreFetchToolsNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = { platform: Platform.VSCode };
    assert.isFalse(condition(inputs));
  });
  it("condition returns false for CLI when tools is empty", () => {
    const node = MCPCliPreFetchToolsNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = { platform: Platform.CLI, [QuestionNames.MCPForDAAvailableTools]: [] };
    assert.isFalse(condition(inputs));
  });
  it("condition returns true for CLI when tools are non-empty", () => {
    const node = MCPCliPreFetchToolsNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "t1" }],
    };
    assert.isTrue(condition(inputs));
  });
  it("dynamicOptions maps available tools to OptionItems", () => {
    const node = MCPCliPreFetchToolsNode();
    const data = node.data as any;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAvailableTools]: [
        { name: "tool1", description: "desc1" },
        { name: "tool2", description: "" },
      ],
    };
    const options = data.dynamicOptions(inputs) as OptionItem[];
    assert.equal(options.length, 2);
    assert.equal(options[0].id, "tool1");
    assert.equal(options[0].label, "tool1");
    assert.equal(options[0].detail, "desc1");
    assert.equal(options[1].id, "tool2");
  });
  it("default function returns all tool names", () => {
    const node = MCPCliPreFetchToolsNode();
    const data = node.data as any;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "toolA" }, { name: "toolB" }],
    };
    const defaultVal = data.default(inputs) as string[];
    assert.deepEqual(defaultVal, ["toolA", "toolB"]);
  });
});

describe("MCPForDAServerUrlNode", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validFunc returns undefined for empty value", async () => {
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const result = await validFunc("", { platform: Platform.CLI });
    assert.isUndefined(result);
  });
  it("validFunc returns undefined when inputs is undefined", async () => {
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const result = await validFunc("https://example.com", undefined);
    assert.isUndefined(result);
  });
  it("validFunc returns undefined without calling fetchMCPTools on VSCode", async () => {
    const fetchStub = vi.spyOn(teamsProjectTypeDeps, "fetchMCPTools");
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.VSCode };
    const result = await validFunc("https://example.com", inputs);
    assert.isUndefined(result);
    assert.isTrue(fetchStub.mock.calls.length === 0);
  });
  it("validFunc sets auth inputs when requiresAuth=true and no authMetadataUrl", async () => {
    vi.spyOn(teamsProjectTypeDeps, "fetchMCPTools").mockResolvedValue({
      requiresAuth: true,
      tools: [],
    });
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    const result = await validFunc("https://secure.example.com", inputs);
    assert.isUndefined(result);
    assert.isTrue(inputs["_mcpAuthRequired"] as boolean);
    assert.deepEqual(inputs[QuestionNames.MCPForDAAvailableTools], []);
    assert.equal(inputs[QuestionNames.MCPForDAAuth], "OAuthPluginVault");
    assert.isUndefined(inputs[QuestionNames.MCPForDAAuthMetadataUrl]);
  });
  it("validFunc sets authMetadataUrl when requiresAuth=true and authMetadataUrl present", async () => {
    vi.spyOn(teamsProjectTypeDeps, "fetchMCPTools").mockResolvedValue({
      requiresAuth: true,
      tools: [],
      authMetadataUrl: "https://auth.example.com/.well-known/oauth",
    });
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    await validFunc("https://secure.example.com", inputs);
    assert.equal(
      inputs[QuestionNames.MCPForDAAuthMetadataUrl],
      "https://auth.example.com/.well-known/oauth"
    );
    assert.equal(inputs[QuestionNames.MCPForDAAuth], "OAuthPluginVault");
  });
  it("validFunc sets tools, tool mode, and NoneAuth when tools are returned", async () => {
    const mockTools = [{ name: "t1" }, { name: "t2" }];
    vi.spyOn(teamsProjectTypeDeps, "fetchMCPTools").mockResolvedValue({
      requiresAuth: false,
      tools: mockTools as any,
    });
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    await validFunc("https://example.com/mcp", inputs);
    assert.deepEqual(inputs[QuestionNames.MCPForDAAvailableTools], mockTools);
    assert.equal(inputs[QuestionNames.MCPForDATool], "pre-fetch");
    assert.equal(inputs[QuestionNames.MCPForDAAuth], "NoneAuth");
  });
  it("validFunc sets empty tools and NoneAuth when no tools and no auth", async () => {
    vi.spyOn(teamsProjectTypeDeps, "fetchMCPTools").mockResolvedValue({
      requiresAuth: false,
      tools: [],
    });
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    await validFunc("https://example.com/mcp", inputs);
    assert.deepEqual(inputs[QuestionNames.MCPForDAAvailableTools], []);
    assert.equal(inputs[QuestionNames.MCPForDAAuth], "NoneAuth");
  });
  it("validFunc sets empty tools and NoneAuth when fetchMCPTools throws", async () => {
    vi.spyOn(teamsProjectTypeDeps, "fetchMCPTools").mockRejectedValue(new Error("network error"));
    const node = MCPForDAServerUrlNode();
    const data = node.data as any;
    const validFunc = data.additionalValidationOnAccept.validFunc;
    const inputs: Inputs = { platform: Platform.CLI };
    await validFunc("https://example.com/mcp", inputs);
    assert.deepEqual(inputs[QuestionNames.MCPForDAAvailableTools], []);
    assert.equal(inputs[QuestionNames.MCPForDAAuth], "NoneAuth");
  });
});

describe("updateActionWithMCP", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has type singleFile and correct name", () => {
    const node = updateActionWithMCP();
    const data = node.data as any;
    assert.equal(data.type, "singleFile");
    assert.equal(data.name, QuestionNames.PluginManifestFilePath);
  });
  it("defaultFolder normalizes projectPath", () => {
    const node = updateActionWithMCP();
    const data = node.data as any;
    const inputs: Inputs = { platform: Platform.CLI, projectPath: "/my/project" };
    const folder = data.defaultFolder(inputs);
    assert.include(folder, "my");
    assert.include(folder, "project");
  });
  it("child[1] dynamicOptions maps MCPForDAAvailableTools to OptionItems", () => {
    const node = updateActionWithMCP();
    const child1 = node.children![1];
    const data = child1.data as any;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAvailableTools]: [
        { name: "toolA", description: "desc A" },
        { name: "toolB", description: "" },
      ],
    };
    const options = data.dynamicOptions(inputs) as OptionItem[];
    assert.equal(options.length, 2);
    assert.equal(options[0].id, "toolA");
    assert.equal(options[0].label, "toolA");
    assert.equal(options[0].detail, "desc A");
    assert.equal(options[1].id, "toolB");
    assert.equal(options[1].detail, "");
  });
  it("child[1] async default reads manifest and filters by serverUrl", async () => {
    const mockManifest = {
      runtimes: [
        {
          type: "RemoteMCPServer",
          spec: { url: "https://example.com/mcp" },
          run_for_functions: ["f1", "f2"],
        },
        {
          type: "RemoteMCPServer",
          spec: { url: "https://other.com/mcp" },
          run_for_functions: ["f3"],
        },
      ],
    };
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockResolvedValue(mockManifest);
    const node = updateActionWithMCP();
    const child1 = node.children![1];
    const data = child1.data as any;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.PluginManifestFilePath]: "/my/plugin.json",
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPForDAAvailableTools]: [],
    };
    const result = await data.default(inputs);
    assert.deepEqual(result, ["f1", "f2"]);
  });
  it("child[1] async default returns empty array when no manifest path", async () => {
    const node = updateActionWithMCP();
    const child1 = node.children![1];
    const data = child1.data as any;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAvailableTools]: [],
    };
    const result = await data.default(inputs);
    assert.deepEqual(result, []);
  });
  it("child[2] condition returns true when MCPForDAAuth is not NoneAuth", () => {
    const node = updateActionWithMCP();
    const child2 = node.children![2];
    const condition = child2.condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
    };
    assert.isTrue(condition(inputs));
  });
  it("child[2] condition returns false when MCPForDAAuth is NoneAuth", () => {
    const node = updateActionWithMCP();
    const child2 = node.children![2];
    const condition = child2.condition as ConditionFunc;
    const inputs: Inputs = { platform: Platform.CLI, [QuestionNames.MCPForDAAuth]: "NoneAuth" };
    assert.isFalse(condition(inputs));
  });
  it("child[2] (auth type) has no credential follow-up questions", () => {
    const node = updateActionWithMCP();
    const child2 = node.children![2];
    assert.equal((child2.data as any).name, QuestionNames.MCPForDAAuthType);
    assert.deepEqual(child2.children ?? [], []);
  });
});

describe("languageNode", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("csharp", () => {
    const node = languageNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.VS,
      [QuestionNames.TemplateName]: TemplateNames.SsoTabSSR,
    };
    const res = condition(inputs);
    assert.isTrue(res);
    const question = node.data as SingleSelectQuestion;
    const options = question.dynamicOptions?.(inputs);
    assert.deepEqual(options, [{ id: ProgrammingLanguage.CSharp, label: "C#" }]);
    const defaultFunc = question.default as LocalFunc<string | undefined>;
    const defaultOptionId = defaultFunc ? defaultFunc(inputs) : undefined;
    assert.equal(defaultOptionId, ProgrammingLanguage.CSharp);
  });
  it("common", () => {
    const node = languageNode();
    const condition = node.condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentBasic,
    };
    const res = condition(inputs);
    assert.isTrue(res);
    const options = (node.data as SingleSelectQuestion).dynamicOptions?.(inputs);
    assert.deepEqual(options, [{ id: ProgrammingLanguage.Common, label: "None" }]);
  });
});

describe("folderAndAppNameCondition", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("ApiPluginManifestPath", () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.ActionManifestPath]: "test",
    };
    const res = folderAndAppNameCondition(inputs);
    assert.isTrue(res);
  });
});

describe("ActionStartOptions", () => {
  it("mcp() should return correct OptionItem", () => {
    const mcpOption = ActionStartOptions.mcp();

    assert.equal(mcpOption.id, "mcp");
    assert.equal(
      mcpOption.label,
      getLocalizedString("template.createProjectQuestion.mcpForDa.label")
    );
    assert.equal(
      mcpOption.detail,
      getLocalizedString("template.createProjectQuestion.mcpForDa.detail")
    );
    assert.equal(mcpOption.data, TemplateNames.DeclarativeAgentWithActionFromMCP);
  });
});

describe("constructNode", () => {
  it("should return foundryNode when node is foundryNode", () => {
    const json = JSON.stringify({
      node: "foundryNode",
      condition: { enum: ["foundry-proxy-agent"] },
    });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.isDefined(node.data);
    assert.deepEqual(node.condition, { enum: ["foundry-proxy-agent"] });
  });

  it("should return llmServiceNode when node is llmServiceNode", () => {
    const json = JSON.stringify({
      node: "llmServiceNode",
      condition: { enum: ["some-cap"] },
    });
    const node = constructNode(json);
    assert.isDefined(node);
  });

  it("should return apiSpecNode when node is apiSpecNode", () => {
    const json = JSON.stringify({
      node: "apiSpecNode",
      condition: { equals: "api-spec" },
    });
    const node = constructNode(json);
    assert.isDefined(node);
  });

  it("should return azureOpenAINode when node is azureOpenAINode", () => {
    const json = JSON.stringify({
      node: "azureOpenAINode",
      condition: { equals: "llm-service-azure-openai" },
    });
    const node = constructNode(json);
    assert.isDefined(node);
  });

  it("should build a generic node with options, children, and condition", () => {
    const json = JSON.stringify({
      data: {
        type: "singleSelect",
        name: "test-question",
        title: "core.createProjectQuestion.llmService.title",
        placeholder: "core.createProjectQuestion.llmService.placeholder",
        options: [
          {
            id: "opt1",
            label: "core.createProjectQuestion.llmServiceAzureOpenAIOption.label",
            detail: "core.createProjectQuestion.llmServiceAzureOpenAIOption.detail",
            data: "SomeTemplate",
          },
        ],
      },
      children: [],
      condition: { enum: ["parent-id"] },
    });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.deepEqual(node.condition, { enum: ["parent-id"] });
    assert.equal((node.data as any).name, "test-question");
  });

  it("should build a generic node without condition", () => {
    const json = JSON.stringify({
      data: {
        type: "singleSelect",
        name: "no-condition-question",
        title: "core.createProjectQuestion.llmService.title",
        placeholder: "core.createProjectQuestion.llmService.placeholder",
        options: [],
      },
      children: [],
    });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.isUndefined(node.condition);
  });

  it("should recursively build child nodes", () => {
    const json = JSON.stringify({
      data: {
        type: "singleSelect",
        name: "parent-question",
        title: "core.createProjectQuestion.llmService.title",
        placeholder: "core.createProjectQuestion.llmService.placeholder",
        options: [],
      },
      children: [
        {
          node: "foundryNode",
          condition: { enum: ["foundry-proxy-agent"] },
        },
      ],
    });
    const node = constructNode(json);
    assert.isDefined(node.children);
    assert.lengthOf(node.children!, 1);
  });
});

describe("foundryNode", () => {
  it("should return a node with foundryEndpointQuestion as data", () => {
    const node = foundryNode();
    assert.isDefined(node);
    assert.isDefined(node.data);
    assert.equal((node.data as any).name, QuestionNames.FoundryEndpoint);
    assert.isUndefined(node.condition);
  });

  it("should accept a condition and apply it to the node", () => {
    const condition = { enum: ["foundry-proxy-agent"] };
    const node = foundryNode(condition);
    assert.deepEqual(node.condition, condition);
  });

  it("child condition should be true when FoundryEndpoint has a value", () => {
    const node = foundryNode();
    const childCondition = node.children?.[0].condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.FoundryEndpoint]: "https://my-foundry.azure.com",
    };
    assert.isTrue(childCondition(inputs));
  });

  it("child condition should be false when FoundryEndpoint is empty string", () => {
    const node = foundryNode();
    const childCondition = node.children?.[0].condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.FoundryEndpoint]: "",
    };
    assert.isFalse(childCondition(inputs));
  });

  it("child condition should be false when FoundryEndpoint is undefined", () => {
    const node = foundryNode();
    const childCondition = node.children?.[0].condition as ConditionFunc;
    const inputs: Inputs = {
      platform: Platform.VSCode,
    };
    assert.isFalse(childCondition(inputs));
  });

  it("child node should have foundryAgentIdQuestion as data", () => {
    const node = foundryNode();
    const childData = node.children?.[0].data;
    assert.isDefined(childData);
    assert.equal((childData as any).name, QuestionNames.FoundryAgentId);
  });
});

describe("foundryEndpointQuestion and foundryAgentIdQuestion", () => {
  it("foundryEndpointQuestion should have correct name", () => {
    const question = foundryEndpointQuestion();
    assert.equal(question.name, QuestionNames.FoundryEndpoint);
    assert.equal(question.type, "text");
    assert.isDefined(question.title);
    assert.isDefined(question.placeholder);
  });

  it("foundryAgentIdQuestion should have correct name", () => {
    const question = foundryAgentIdQuestion();
    assert.equal(question.name, QuestionNames.FoundryAgentId);
    assert.equal(question.type, "text");
    assert.isDefined(question.title);
    assert.isDefined(question.placeholder);
  });
});

describe("rootNode", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use cached JSON path when not using local template and cached file exists", () => {
    // Test the actual function — it loads from bundled in dev mode
    const node = getRootProjectTypeNode();
    assert.isDefined(node);
    assert.isDefined(node.data);
    const data = node.data as SingleSelectQuestion;
    assert.equal(data.name, "project-type");
    assert.equal(data.type, "singleSelect");
    // Root should have project type options
    assert.isTrue((data.staticOptions as OptionItem[]).length >= 5);
  });

  it("should use templates folder when using local template", () => {
    // In dev mode (alpha version), useLocalTemplate returns true → uses bundled
    const node = getRootProjectTypeNode(Platform.VSCode);
    assert.isDefined(node);
    // Should have children (sub-tree nodes for each project type)
    assert.isDefined(node.children);
    assert.isTrue(node.children!.length >= 5);
  });

  it("should use templates folder when cached file does not exist", () => {
    // Verify the node has correct structure regardless of source
    const node = getRootProjectTypeNode();
    assert.isDefined(node);
    const data = node.data as SingleSelectQuestion;
    // Check that options include known project types
    const optionIds = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.include(optionIds, "copilot-agent-type");
    assert.include(optionIds, "custom-engine-agent-type");
    assert.include(optionIds, "teams-agent-and-app-type");
    assert.include(optionIds, "office-meta-os-type");
    assert.include(optionIds, "graph-connector-type");
  });

  it("should pass platform parameter to constructNode", () => {
    // Verify that getRootProjectTypeNode returns a valid node for different platforms
    const nodeVSC = getRootProjectTypeNode(Platform.VSCode);
    assert.isDefined(nodeVSC);
    assert.isDefined(nodeVSC.data);

    const nodeCLI = getRootProjectTypeNode(Platform.CLI);
    assert.isDefined(nodeCLI);
    assert.isDefined(nodeCLI.data);
  });

  it("should load bundled UI node when v4 channel forces bundled metadata even if cache exists", () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    vi.spyOn(fs, "pathExistsSync").mockImplementation((p: fs.PathLike) => {
      const value = String(p);
      // Simulate v4 channel with no downloaded v4 cache marker.
      if (value.endsWith("template-version-v4.txt")) {
        return false;
      }
      return true;
    });
    const readFileSyncStub = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue(JSON.stringify({ data: { type: "group", name: "root" } }));

    getRootProjectTypeNode(Platform.VSCode);

    const readPath = readFileSyncStub.mock.calls[0][0] as string;
    assert.notInclude(readPath, `.fx`);
  });

  it("ignores a downloaded ~/.fx/ui cache and loads bundled when v4 is enabled (regression: action question asked twice)", () => {
    // Regression for the v4 double-ask. Once a v4 download lands, the marker
    // template-version-v4.txt exists and the old logic read ~/.fx/ui/wizardNode.json.
    // A cache that drifts from this fx-core (its action node no longer named
    // QuestionNames.ActionType) defeats the front-door pre-fill, so the "add an
    // action" question is asked a second time. The v4 channel must always pin the
    // UI tree to the bundled artifact, even when every cached path exists.
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const readFileSyncStub = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue(JSON.stringify({ data: { type: "group", name: "root" } }));

    getRootProjectTypeNode(Platform.VSCode);

    const readPath = String(readFileSyncStub.mock.calls[0][0]);
    assert.notInclude(readPath, `.${String(ConfigFolderName)}`);
    assert.include(readPath, path.join("ui", "wizardNode.json"));
  });

  it("uses the ~/.fx/ui cache on the v3 channel when the cached file exists", () => {
    // Guards that the fix does not change v3 behavior: with v4 disabled and a
    // published (non-local) template version, the downloaded cache is still used.
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const readFileSyncStub = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue(JSON.stringify({ data: { type: "group", name: "root" } }));

    getRootProjectTypeNode(Platform.VSCode);

    const readPath = String(readFileSyncStub.mock.calls[0][0]);
    assert.include(readPath, path.join(`.${String(ConfigFolderName)}`, "ui", "wizardNode.json"));
  });
});

describe("constructNode", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should construct a singleSelect node from JSON", () => {
    const json = JSON.stringify({
      data: {
        title: "core.createProjectQuestion.title",
        name: "project-type",
        type: "singleSelect",
        options: [
          {
            id: "test-option",
            label: "core.createProjectQuestion.projectType.declarativeAgent.label",
            detail: "core.createProjectQuestion.projectType.declarativeAgent.detail",
          },
        ],
      },
    });

    const node = constructNode(json);
    assert.isDefined(node);
    assert.isDefined(node.data);
    const data = node.data as SingleSelectQuestion;
    assert.equal(data.type, "singleSelect");
    assert.equal(data.name, "project-type");
    assert.isDefined(data.staticOptions);
    assert.equal((data.staticOptions as OptionItem[]).length, 1);
    assert.equal((data.staticOptions as OptionItem[])[0].id, "test-option");
  });

  it("should handle icon prefix for VSCode platform", () => {
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          {
            id: "opt1",
            label: "core.createProjectQuestion.projectType.declarativeAgent.label",
            icon: "$(teamsfx-agent)",
          },
        ],
      },
    });

    const node = constructNode(json, Platform.VSCode);
    const data = node.data as SingleSelectQuestion;
    const option = (data.staticOptions as OptionItem[])[0];
    assert.isTrue(option.label.startsWith("$(teamsfx-agent) "));
  });

  it("should not add icon prefix for CLI platform", () => {
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          {
            id: "opt1",
            label: "core.createProjectQuestion.projectType.declarativeAgent.label",
            icon: "$(teamsfx-agent)",
          },
        ],
      },
    });

    const node = constructNode(json, Platform.CLI);
    const data = node.data as SingleSelectQuestion;
    const option = (data.staticOptions as OptionItem[])[0];
    assert.isFalse(option.label.startsWith("$(teamsfx-agent) "));
  });

  it("should handle groupName in options", () => {
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          {
            id: "opt1",
            label: "core.createProjectQuestion.projectType.declarativeAgent.label",
            groupName: "core.createProjectQuestion.projectType.createGroup.aiAgent",
          },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const option = (data.staticOptions as OptionItem[])[0];
    assert.isDefined(option.groupName);
  });

  it("should filter out feature-flagged options when flag is disabled", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);

    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          { id: "always-visible", label: "Always" },
          { id: "flagged", label: "Flagged", featureFlag: "DAMetaOS" },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options.length, 1);
    assert.equal(options[0].id, "always-visible");
  });

  it("should include feature-flagged options when flag is enabled", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);

    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          { id: "always-visible", label: "Always" },
          { id: "flagged", label: "Flagged", featureFlag: "DAMetaOS" },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options.length, 2);
  });

  it("should include a true-default feature-flagged option when env var is unset", () => {
    delete process.env[FeatureFlagName.OpenPluginImportExport];
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          { id: "always-visible", label: "Always" },
          { id: "flagged", label: "Flagged", featureFlag: FeatureFlagName.OpenPluginImportExport },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options.length, 2);
    assert.isTrue(options.some((o) => o.id === "flagged"));
  });

  it("should exclude a false-default feature-flagged option when env var is unset", () => {
    delete process.env[FeatureFlagName.AgentSkillsManifest];
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          { id: "always-visible", label: "Always" },
          { id: "flagged", label: "Flagged", featureFlag: FeatureFlagName.AgentSkillsManifest },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options.length, 1);
    assert.equal(options[0].id, "always-visible");
  });

  it("should let an explicit env override win for a true-default flag", () => {
    process.env[FeatureFlagName.OpenPluginImportExport] = "false";
    try {
      const json = JSON.stringify({
        data: {
          title: "test.title",
          name: "test",
          type: "singleSelect",
          options: [
            { id: "always-visible", label: "Always" },
            {
              id: "flagged",
              label: "Flagged",
              featureFlag: FeatureFlagName.OpenPluginImportExport,
            },
          ],
        },
      });

      const node = constructNode(json);
      const data = node.data as SingleSelectQuestion;
      const options = data.staticOptions as OptionItem[];
      assert.equal(options.length, 1);
      assert.equal(options[0].id, "always-visible");
    } finally {
      delete process.env[FeatureFlagName.OpenPluginImportExport];
    }
  });

  it("should let an explicit env override win for a false-default flag", () => {
    process.env[FeatureFlagName.AgentSkillsManifest] = "true";
    try {
      const json = JSON.stringify({
        data: {
          title: "test.title",
          name: "test",
          type: "singleSelect",
          options: [
            { id: "always-visible", label: "Always" },
            { id: "flagged", label: "Flagged", featureFlag: FeatureFlagName.AgentSkillsManifest },
          ],
        },
      });

      const node = constructNode(json);
      const data = node.data as SingleSelectQuestion;
      const options = data.staticOptions as OptionItem[];
      assert.equal(options.length, 2);
      assert.isTrue(options.some((o) => o.id === "flagged"));
    } finally {
      delete process.env[FeatureFlagName.AgentSkillsManifest];
    }
  });

  it("should exclude an unknown feature flag when env var is unset", () => {
    delete process.env["TEAMSFX_UNKNOWN_FLAG"];
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          { id: "always-visible", label: "Always" },
          { id: "flagged", label: "Flagged", featureFlag: "TEAMSFX_UNKNOWN_FLAG" },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options.length, 1);
    assert.equal(options[0].id, "always-visible");
  });

  it("should handle group type nodes", () => {
    const json = JSON.stringify({
      data: { type: "group", name: "test-group" },
      children: [],
    });

    const node = constructNode(json);
    assert.isDefined(node);
    assert.equal(node.data?.type, "group");
  });

  it("should handle condition on nodes", () => {
    const json = JSON.stringify({
      condition: { equals: "some-value" },
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [],
      },
    });

    const node = constructNode(json);
    const condition = node.condition as StringValidation;
    assert.equal(condition.equals, "some-value");
  });

  it("should recursively construct children", () => {
    const json = JSON.stringify({
      data: {
        title: "parent.title",
        name: "parent",
        type: "singleSelect",
        options: [{ id: "child-trigger", label: "Child" }],
      },
      children: [
        {
          condition: { equals: "child-trigger" },
          data: {
            title: "child.title",
            name: "child",
            type: "singleSelect",
            options: [{ id: "sub-item", label: "Sub" }],
          },
        },
      ],
    });

    const node = constructNode(json);
    assert.isDefined(node.children);
    assert.equal(node.children!.length, 1);
    const childCondition = node.children![0].condition as StringValidation;
    assert.equal(childCondition.equals, "child-trigger");
  });

  it("should handle skipSingleOption property", () => {
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        skipSingleOption: true,
        options: [{ id: "only", label: "Only Option" }],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    assert.isTrue(data.skipSingleOption);
  });

  it("should resolve known node references", () => {
    const json = JSON.stringify({
      node: "llmServiceNode",
    });

    const node = constructNode(json);
    assert.isDefined(node);
  });

  it("should throw for unknown node references", () => {
    const json = JSON.stringify({
      node: "nonExistentNode",
    });

    expect(() => constructNode(json)).toThrow(/Unknown node reference: nonExistentNode/);
  });

  it("should set data property on options", () => {
    const json = JSON.stringify({
      data: {
        title: "test.title",
        name: "test",
        type: "singleSelect",
        options: [
          { id: "opt1", label: "Option 1", data: "template-name-1" },
          { id: "opt2", label: "Option 2" },
        ],
      },
    });

    const node = constructNode(json);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options[0].data, "template-name-1");
    assert.isUndefined(options[1].data);
  });
});

describe("constructNode - additional coverage", () => {
  it("should resolve apiSpecWithSearchNode reference", () => {
    const json = JSON.stringify({ node: "apiSpecWithSearchNode" });
    const node = constructNode(json);
    assert.isDefined(node);
  });

  it("should resolve apiSpecWithSearchNode with condition", () => {
    const json = JSON.stringify({
      node: "apiSpecWithSearchNode",
      condition: { equals: "some-value" },
    });
    const node = constructNode(json);
    assert.isDefined(node);
    const condition = node.condition as StringValidation;
    assert.equal(condition.equals, "some-value");
  });

  it("should resolve foundryNode reference", () => {
    const json = JSON.stringify({ node: "foundryNode" });
    const node = constructNode(json);
    assert.isDefined(node);
  });

  it("should resolve gcNameNode reference", () => {
    const json = JSON.stringify({ node: "gcNameNode" });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.isDefined(node.data);
  });

  it("should resolve gcConnectionIdNode reference", () => {
    const json = JSON.stringify({ node: "gcConnectionIdNode" });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.isDefined(node.data);
  });

  it("should resolve officeAddinFolderNode reference", () => {
    const json = JSON.stringify({ node: "officeAddinFolderNode" });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.equal(node.data?.type, "folder");
  });

  it("should resolve officeAddinImportNode reference", () => {
    const json = JSON.stringify({ node: "officeAddinImportNode" });
    const node = constructNode(json);
    assert.isDefined(node);
    assert.equal(node.data?.type, "group");
    assert.isDefined(node.children);
    assert.equal(node.children!.length, 2);
  });
});

describe("rootNode - cache vs bundled", () => {
  it("should load and return valid tree with all project types", () => {
    const node = getRootProjectTypeNode(Platform.VSCode);
    assert.isDefined(node);
    assert.isDefined(node.data);
    const data = node.data as SingleSelectQuestion;
    const optionIds = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.include(optionIds, "copilot-agent-type");
    assert.include(optionIds, "custom-engine-agent-type");
    assert.include(optionIds, "graph-connector-type");
    assert.include(optionIds, "teams-agent-and-app-type");
    assert.include(optionIds, "office-meta-os-type");
    assert.isDefined(node.children);
    assert.isTrue(node.children!.length >= 5);
  });

  it("should work for CLI platform without icons", () => {
    const node = getRootProjectTypeNode(Platform.CLI);
    assert.isDefined(node);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    for (const opt of options) {
      assert.isFalse(
        opt.label.startsWith("$("),
        "Option " + opt.id + " should not have icon on CLI"
      );
    }
  });
});

describe("wizard sub-tree extraction", () => {
  it("CEA sub-tree should have correct options", () => {
    const root = getRootProjectTypeNode(Platform.VSCode);
    const node = root.children?.find(
      (c) => (c.condition as StringValidation)?.equals === "custom-engine-agent-type"
    );
    assert.isDefined(node);
    const data = node!.data as SingleSelectQuestion;
    const optionIds = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.include(optionIds, "basic-custom-engine-agent");
    assert.include(optionIds, "weather-agent");
  });

  it("Teams sub-tree should have correct condition", () => {
    const node = getTeamsProjectNode();
    assert.isDefined(node);
    const condition = node.condition as StringValidation;
    assert.equal(condition.equals, "teams-agent-and-app-type");
    assert.isDefined(node.data);
  });

  it("CEA sub-tree should have children", () => {
    const root = getRootProjectTypeNode(Platform.VSCode);
    const node = root.children?.find(
      (c) => (c.condition as StringValidation)?.equals === "custom-engine-agent-type"
    );
    assert.isDefined(node!.children);
    assert.isTrue(node!.children!.length > 0);
  });

  it("Teams sub-tree should have children", () => {
    const node = getTeamsProjectNode();
    assert.isDefined(node.children);
    assert.isTrue(node.children!.length > 0);
  });
});

describe("getTdpProjectTypeNode", () => {
  it("should load tdpNode.json and return valid tree", () => {
    const node = getTdpProjectTypeNode(Platform.VSCode);
    assert.isDefined(node);
    assert.isDefined(node.data);
    const data = node.data as SingleSelectQuestion;
    assert.equal(data.name, "project-type");
  });

  it("should contain only TDP-supported project types (DA, CEA, Teams)", () => {
    const node = getTdpProjectTypeNode(Platform.VSCode);
    const data = node.data as SingleSelectQuestion;
    const optionIds = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.equal(optionIds.length, 3);
    assert.include(optionIds, "copilot-agent-type");
    assert.include(optionIds, "custom-engine-agent-type");
    assert.include(optionIds, "teams-agent-and-app-type");
  });

  it("should NOT contain Graph Connector or Office Add-in", () => {
    const node = getTdpProjectTypeNode(Platform.VSCode);
    const data = node.data as SingleSelectQuestion;
    const optionIds = (data.staticOptions as OptionItem[]).map((o) => o.id);
    assert.notInclude(optionIds, "graph-connector-type");
    assert.notInclude(optionIds, "office-meta-os-type");
  });

  it("should have inlined children for each project type", () => {
    const node = getTdpProjectTypeNode(Platform.VSCode);
    assert.isDefined(node.children);
    assert.equal(node.children!.length, 3);
    const childConditions = node.children!.map((c) => (c.condition as StringValidation)?.equals);
    assert.include(childConditions, "copilot-agent-type");
    assert.include(childConditions, "custom-engine-agent-type");
    assert.include(childConditions, "teams-agent-and-app-type");
  });

  it("should work for CLI platform", () => {
    const node = getTdpProjectTypeNode(Platform.CLI);
    assert.isDefined(node);
    const data = node.data as SingleSelectQuestion;
    const options = data.staticOptions as OptionItem[];
    assert.equal(options.length, 3);
    for (const opt of options) {
      assert.isFalse(opt.label.startsWith("$("), "CLI should not have icons");
    }
  });
});

describe("updateActionWithMCP question node", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("possibleFiles always appends the create-new sentinel item", async () => {
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(false);
    const node = updateActionWithMCP();
    const data = node.data as any;
    const inputs: Inputs = { platform: Platform.VSCode, projectPath: "/proj" };
    const items: { id: string; label: string }[] = await data.possibleFiles(inputs);
    assert.isAtLeast(items.length, 1);
    const sentinel = items.find((i) => i.id === CreateNewPluginManifestSentinel);
    assert.isDefined(sentinel);
    assert.include(sentinel!.label, "$(new-file)");
  });

  it("possibleFiles enumerates declarative agent actions and de-duplicates", async () => {
    const teamsManifest = {
      copilotAgents: { declarativeAgents: [{ file: "declarativeAgent.json" }] },
    };
    const da = {
      actions: [
        { id: "a1", file: "ai-plugin-1.json" },
        { id: "a2", file: "ai-plugin-2.json" },
        { id: "a3", file: "ai-plugin-1.json" },
        { id: "a4" },
      ],
    };
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockImplementation((p: string) => {
      if (p.endsWith("manifest.json")) return Promise.resolve(teamsManifest);
      return Promise.resolve(da);
    });

    const node = updateActionWithMCP();
    const data = node.data as any;
    const inputs: Inputs = { platform: Platform.VSCode, projectPath: "/proj" };
    const items: { id: string; label: string }[] = await data.possibleFiles(inputs);
    const fileIds = items.filter((i) => i.id !== CreateNewPluginManifestSentinel);
    assert.equal(fileIds.length, 2, "duplicates should be removed");
    assert.equal(items[items.length - 1].id, CreateNewPluginManifestSentinel);
    for (const item of fileIds) {
      assert.include(item.label, "$(file)");
    }
  });

  it("possibleFiles returns just the sentinel when manifest read throws", async () => {
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockRejectedValue(new Error("boom"));
    const node = updateActionWithMCP();
    const data = node.data as any;
    const inputs: Inputs = { platform: Platform.VSCode, projectPath: "/proj" };
    const items = await data.possibleFiles(inputs);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, CreateNewPluginManifestSentinel);
  });

  it("possibleFiles returns just the sentinel when no declarative agent referenced", async () => {
    vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
    vi.spyOn(teamsProjectTypeDeps, "readJSON").mockResolvedValue({});
    const node = updateActionWithMCP();
    const data = node.data as any;
    const inputs: Inputs = { platform: Platform.VSCode, projectPath: "/proj" };
    const items = await data.possibleFiles(inputs);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, CreateNewPluginManifestSentinel);
  });

  it("defaultFolder resolves to projectPath/appPackage", () => {
    const node = updateActionWithMCP();
    const data = node.data as any;
    const folder = data.defaultFolder({
      platform: Platform.VSCode,
      projectPath: "/proj",
    } as Inputs);
    assert.include(folder, AppPackageFolderName);
    assert.include(folder, "proj");
  });

  describe("NewPluginManifestFileName child question", () => {
    const getChild = () => {
      const node = updateActionWithMCP();
      const child = node.children!.find(
        (c) => (c.data as any).name === QuestionNames.NewPluginManifestFileName
      );
      return child!;
    };

    it("condition matches only the create-new sentinel", () => {
      const child = getChild();
      const cond = child.condition as ConditionFunc;
      assert.isTrue(
        cond({
          platform: Platform.VSCode,
          [QuestionNames.PluginManifestFilePath]: CreateNewPluginManifestSentinel,
        } as Inputs)
      );
      assert.isFalse(
        cond({
          platform: Platform.VSCode,
          [QuestionNames.PluginManifestFilePath]: "/some/file.json",
        } as Inputs)
      );
    });

    it("validation rejects empty input", async () => {
      const child = getChild();
      const validFunc = (child.data as any).validation.validFunc;
      const result = await validFunc("   ", { platform: Platform.VSCode });
      assert.isString(result);
    });

    it("validation rejects non-.json input", async () => {
      const child = getChild();
      const validFunc = (child.data as any).validation.validFunc;
      const result = await validFunc("foo.txt", { platform: Platform.VSCode });
      assert.isString(result);
    });

    it("validation rejects names with path separators", async () => {
      const child = getChild();
      const validFunc = (child.data as any).validation.validFunc;
      const result = await validFunc("dir/foo.json", { platform: Platform.VSCode });
      assert.isString(result);
      const result2 = await validFunc("dir\\foo.json", { platform: Platform.VSCode });
      assert.isString(result2);
    });

    it("validation rejects when target file already exists", async () => {
      vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
      const child = getChild();
      const validFunc = (child.data as any).validation.validFunc;
      const result = await validFunc("ai-plugin.json", {
        platform: Platform.VSCode,
        projectPath: "/proj",
      });
      assert.isString(result);
      assert.include(result as string, "ai-plugin.json");
    });

    it("validation passes for a fresh valid file name", async () => {
      vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(false);
      const child = getChild();
      const validFunc = (child.data as any).validation.validFunc;
      const result = await validFunc("new-plugin.json", {
        platform: Platform.VSCode,
        projectPath: "/proj",
      });
      assert.isUndefined(result);
    });

    it("validation passes when no projectPath provided", async () => {
      const child = getChild();
      const validFunc = (child.data as any).validation.validFunc;
      const result = await validFunc("new-plugin.json", { platform: Platform.VSCode });
      assert.isUndefined(result);
    });
  });

  describe("MCPForDAPreFetchTools default", () => {
    const getPreFetch = () => {
      const node = updateActionWithMCP();
      const child = node.children!.find(
        (c) => (c.data as any).name === QuestionNames.MCPForDAPreFetchTools
      );
      return child!.data as any;
    };

    it("returns [] when path is the create-new sentinel", async () => {
      const data = getPreFetch();
      const result = await data.default({
        platform: Platform.VSCode,
        [QuestionNames.PluginManifestFilePath]: CreateNewPluginManifestSentinel,
      } as Inputs);
      assert.deepEqual(result, []);
    });

    it("returns [] when path is missing", async () => {
      const data = getPreFetch();
      const result = await data.default({ platform: Platform.VSCode } as Inputs);
      assert.deepEqual(result, []);
    });

    it("returns [] when path does not exist on disk", async () => {
      vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(false);
      const data = getPreFetch();
      const result = await data.default({
        platform: Platform.VSCode,
        [QuestionNames.PluginManifestFilePath]: "/nope/ai-plugin.json",
      } as Inputs);
      assert.deepEqual(result, []);
    });

    it("returns matching runtime tool ids when manifest exists", async () => {
      vi.spyOn(teamsProjectTypeDeps, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsProjectTypeDeps, "readJSON").mockResolvedValue({
        runtimes: [
          {
            type: "RemoteMCPServer",
            spec: { url: "https://example.com/mcp" },
            run_for_functions: ["t1", "t2"],
          },
          {
            type: "RemoteMCPServer",
            spec: { url: "https://other.com/mcp" },
            run_for_functions: ["other"],
          },
        ],
      });
      const data = getPreFetch();
      const result = await data.default({
        platform: Platform.VSCode,
        [QuestionNames.PluginManifestFilePath]: "/proj/appPackage/ai-plugin.json",
        [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      } as Inputs);
      assert.deepEqual(result, ["t1", "t2"]);
    });
  });
});
