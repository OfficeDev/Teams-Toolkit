// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ErrorType } from "@microsoft/m365-spec-parser";
import {
  ApiOperation,
  AppPackageFolderName,
  CLIPlatforms,
  DeclarativeAgentManifest,
  DefaultPluginManifestFileName,
  FolderQuestion,
  IQTreeNode,
  Inputs,
  ManifestTemplateFileName,
  MultiSelectQuestion,
  OptionItem,
  Platform,
  SingleFileOrInputQuestion,
  SingleFileQuestion,
  SingleSelectQuestion,
  Stage,
  TextInputQuestion,
  UserError,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as jsonschema from "jsonschema";
import * as os from "os";
import * as path from "path";
import { ConstantString, SpecParserSource } from "../common/constants";
import { Correlator } from "../common/correlator";
import { validateOpenAPISpec } from "../common/daSpecParser";
import { createContext as createContextInternal } from "../common/globalVars";
import { SearchOpenAPISpecResult, searchOpenAPISpec } from "../common/kiotaClient";
import { getLocalizedString } from "../common/localizeUtils";
import { sampleProvider } from "../common/samples";
import { convertToAlphanumericOnly, isValidHttpUrl } from "../common/stringUtils";
import {
  ApiSpecTelemetryPropertis,
  getQuestionValidationErrorEventName,
  sendTelemetryErrorEvent,
} from "../common/telemetry";
import { AppDefinition } from "../component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { StaticTab } from "../component/driver/teamsApp/interfaces/appdefinitions/staticTab";
import { manifestUtils } from "../component/driver/teamsApp/utils/ManifestUtils";
import { pluginManifestUtils } from "../component/driver/teamsApp/utils/PluginManifestUtils";
import {
  isBot,
  isBotBasedMessageExtension,
  needTabCode,
} from "../component/driver/teamsApp/utils/utils";
import { OneDriveSharePointItemType } from "../component/generator/constant";
import {
  getGraphConnectors,
  getODSPItemInfo,
  validateSourcePluginManifest,
} from "../component/generator/declarativeAgent/helper";
import { listOperations as listOperationsInternal } from "../component/generator/openApiSpec/helper";
import { DevEnvironmentSetupError } from "../component/generator/spfx/error";
import { Constants } from "../component/generator/spfx/utils/constants";
import { Utils } from "../component/generator/spfx/utils/utils";
import { TemplateNames } from "../component/generator/templates/templateNames";
import {
  ActionNotFoundError,
  CoreSource,
  DeclarativeAgentPathNotFoundError,
  EmptyOptionError,
  FileNotFoundError,
  FileNotSupportError,
  OriginalSpecNotFoundError,
  SpecNotFoundError,
  assembleError,
} from "../error";
import {
  ActionStartOptions,
  ApiAuthOptions,
  AppNamePattern,
  CustomCopilotAssistantOptions,
  CustomCopilotRagOptions,
  DeclarativeAgentApiSpecOptionId,
  GCSelectOptions,
  KnowledgeSearchTypeOptions,
  KnowledgeSourceOptions,
  MeArchitectureOptions,
  ProgrammingLanguage,
  QuestionNames,
  SPFxVersionOptionIds,
} from "./constants";
import {
  BotCapabilityOptions,
  DACapabilityOptions,
  MeCapabilityOptions,
  TabCapabilityOptions,
} from "./scaffold/vsc/CapabilityOptions";
import { ProjectTypeOptions } from "./scaffold/vsc/ProjectTypeOptions";
import { ensureInputs } from "./utils";

export const createContext = createContextInternal;
export const listOperations = listOperationsInternal;

export const createQuestionDeps = {
  createContext,
  listOperations,
};

export function getProjectTypeAndCapability(
  teamsApp: AppDefinition
): { projectType: string; templateId: string } | undefined {
  // bot
  if (isBot(teamsApp)) {
    return { projectType: "bot-type", templateId: BotCapabilityOptions.basicBot().id };
  }

  // bot based message extension
  if (isBotBasedMessageExtension(teamsApp)) {
    return { projectType: "me-type", templateId: MeCapabilityOptions.basicMe().id };
  }

  // tab only
  if (needTabCode(teamsApp)) {
    return { projectType: "tab-type", templateId: TabCapabilityOptions.nonSsoTab().id };
  }

  return undefined;
}

export function SPFxSolutionQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SPFxSolution,
    title: getLocalizedString("plugins.spfx.questions.spfxSolution.title"),
    cliDescription: "Create a new or import an existing SharePoint Framework solution.",
    cliShortName: "s",
    staticOptions: [
      {
        id: "new",
        label: getLocalizedString("plugins.spfx.questions.spfxSolution.createNew"),
        detail: getLocalizedString("plugins.spfx.questions.spfxSolution.createNew.detail"),
      },
      {
        id: "import",
        label: getLocalizedString("plugins.spfx.questions.spfxSolution.importExisting"),
        detail: getLocalizedString("plugins.spfx.questions.spfxSolution.importExisting.detail"),
      },
    ],
    default: "new",
  };
}
export function SPFxPackageSelectQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SPFxInstallPackage,
    title: getLocalizedString("plugins.spfx.questions.packageSelect.title"),
    cliDescription: "Install the latest version of SharePoint Framework.",
    staticOptions: [],
    placeholder: getLocalizedString("plugins.spfx.questions.packageSelect.placeholder"),
    dynamicOptions: async (inputs: Inputs): Promise<OptionItem[]> => {
      const versions = await Promise.all([
        Utils.findGloballyInstalledVersion(undefined, Constants.GeneratorPackageName, 0, false),
        Utils.findLatestVersion(undefined, Constants.GeneratorPackageName, 5),
        Utils.findGloballyInstalledVersion(undefined, Constants.YeomanPackageName, 0, false),
      ]);

      inputs.globalSpfxPackageVersion = versions[0];
      inputs.latestSpfxPackageVersion = versions[1];
      inputs.globalYeomanPackageVersion = versions[2];

      return [
        {
          id: SPFxVersionOptionIds.installLocally,

          label:
            versions[1] !== undefined
              ? getLocalizedString(
                  "plugins.spfx.questions.packageSelect.installLocally.withVersion.label",
                  "v" + versions[1]
                )
              : getLocalizedString(
                  "plugins.spfx.questions.packageSelect.installLocally.noVersion.label"
                ),
        },
        {
          id: SPFxVersionOptionIds.globalPackage,
          label:
            versions[0] !== undefined
              ? getLocalizedString(
                  "plugins.spfx.questions.packageSelect.useGlobalPackage.withVersion.label",
                  "v" + versions[0]
                )
              : getLocalizedString(
                  "plugins.spfx.questions.packageSelect.useGlobalPackage.noVersion.label"
                ),
          description: getLocalizedString(
            "plugins.spfx.questions.packageSelect.useGlobalPackage.detail",
            Constants.RecommendedLowestSpfxVersion
          ),
        },
      ];
    },
    default: SPFxVersionOptionIds.installLocally,
    validation: {
      validFunc: (input: string, previousInputs?: Inputs): Promise<string | undefined> => {
        if (input === SPFxVersionOptionIds.globalPackage) {
          const hasPackagesInstalled =
            !!previousInputs &&
            !!previousInputs.globalSpfxPackageVersion &&
            !!previousInputs.globalYeomanPackageVersion;
          if (!hasPackagesInstalled) {
            return Promise.reject(DevEnvironmentSetupError());
          }
        }
        return Promise.resolve(undefined);
      },
    },
    isBoolean: true,
  };
}

export function SPFxFrameworkQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SPFxFramework,
    cliShortName: "k",
    cliDescription: "Framework.",
    title: getLocalizedString("plugins.spfx.questions.framework.title"),
    staticOptions: [
      { id: "react", label: "React" },
      { id: "minimal", label: "Minimal" },
      { id: "none", label: "None" },
    ],
    placeholder: "Select an option",
    default: "react",
  };
}

export function SPFxWebpartNameQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.SPFxWebpartName,
    cliShortName: "w",
    cliDescription: "Name for SharePoint Framework Web Part.",
    title: getLocalizedString("plugins.spfx.questions.webpartName"),
    default: Constants.DEFAULT_WEBPART_NAME,
    validation: {
      validFunc: async (input: string, previousInputs?: Inputs): Promise<string | undefined> => {
        const schema = {
          pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
        };
        const validateRes = jsonschema.validate(input, schema);
        if (validateRes.errors && validateRes.errors.length > 0) {
          return getLocalizedString(
            "plugins.spfx.questions.webpartName.error.notMatch",
            input,
            schema.pattern
          );
        }

        if (
          previousInputs &&
          ((previousInputs.stage === Stage.addWebpart &&
            previousInputs[QuestionNames.SPFxFolder]) ||
            (previousInputs?.stage === Stage.addFeature && previousInputs?.projectPath))
        ) {
          const webpartFolder = path.join(
            previousInputs[QuestionNames.SPFxFolder],
            "src",
            "webparts",
            input
          );
          if (await fs.pathExists(webpartFolder)) {
            return getLocalizedString(
              "plugins.spfx.questions.webpartName.error.duplicate",
              webpartFolder
            );
          }
        }
        return undefined;
      },
    },
  };
}

export function SPFxImportFolderQuestion(hasDefaultFunc = false): FolderQuestion {
  return {
    type: "folder",
    name: QuestionNames.SPFxFolder,
    title: getLocalizedString("core.spfxFolder.title"),
    cliDescription: "Directory or Path that contains the existing SharePoint Framework solution.",
    placeholder: getLocalizedString("core.spfxFolder.placeholder"),
    default: hasDefaultFunc
      ? (inputs: Inputs) => {
          if (inputs.projectPath) return path.join(inputs.projectPath, "src");
          return undefined;
        }
      : undefined,
  };
}

export function folderQuestion(): FolderQuestion {
  return {
    type: "folder",
    name: QuestionNames.Folder,
    cliShortName: "f",
    title: (inputs: Inputs) =>
      CLIPlatforms.includes(inputs.platform)
        ? "Directory where the project folder will be created in"
        : getLocalizedString("core.question.workspaceFolder.title"),
    cliDescription: "Directory where the project folder will be created in.",
    placeholder: getLocalizedString("core.question.workspaceFolder.placeholder"),
    default: (inputs: Inputs) =>
      CLIPlatforms.includes(inputs.platform)
        ? "./"
        : path.join(os.homedir(), ConstantString.RootFolder),
  };
}

export async function getSolutionName(spfxFolder: string): Promise<string | undefined> {
  const yoInfoPath = path.join(spfxFolder, Constants.YO_RC_FILE);
  if (await fs.pathExists(yoInfoPath)) {
    const yoInfo = await fs.readJson(yoInfoPath);
    if (yoInfo["@microsoft/generator-sharepoint"]) {
      return yoInfo["@microsoft/generator-sharepoint"][Constants.YO_RC_SOLUTION_NAME];
    } else {
      return undefined;
    }
  } else {
    throw new FileNotFoundError(Constants.PLUGIN_NAME, yoInfoPath, Constants.IMPORT_HELP_LINK);
  }
}
export function appNameQuestion(): TextInputQuestion {
  const question: TextInputQuestion = {
    type: "text",
    name: QuestionNames.AppName,
    cliShortName: "n",
    title: getLocalizedString("core.question.appName.title"),
    required: true,
    default: async (inputs: Inputs) => {
      let defaultName = undefined;
      if (inputs.teamsAppFromTdp?.appName) {
        defaultName = convertToAlphanumericOnly(inputs.teamsAppFromTdp?.appName);
      } else if (inputs[QuestionNames.SPFxSolution] == "import") {
        defaultName = await getSolutionName(inputs[QuestionNames.SPFxFolder]);
      }
      return defaultName;
    },
    validation: {
      validFunc: async (input: string, previousInputs?: Inputs): Promise<string | undefined> => {
        const schema = {
          pattern: AppNamePattern,
          maxLength: 30,
        };
        if (input.length === 25) {
          // show warning notification because it may exceed the Teams app name max length after appending suffix
          const context = createQuestionDeps.createContext();
          if (previousInputs?.platform === Platform.VSCode) {
            void context.userInteraction.showMessage(
              "warn",
              getLocalizedString("core.QuestionAppName.validation.lengthWarning"),
              false
            );
          } else {
            context.logProvider.warning(
              getLocalizedString("core.QuestionAppName.validation.lengthWarning")
            );
          }
        }
        const appName = input;
        const validateResult = jsonschema.validate(appName, schema);
        if (validateResult.errors && validateResult.errors.length > 0) {
          if (validateResult.errors[0].name === "pattern") {
            return getLocalizedString("core.QuestionAppName.validation.pattern");
          }
          if (validateResult.errors[0].name === "maxLength") {
            return getLocalizedString("core.QuestionAppName.validation.maxlength");
          }
        }
        if (previousInputs && previousInputs.folder) {
          const folder = previousInputs.folder as string;
          if (folder) {
            const projectPath = path.resolve(folder, appName);
            const exists = await fs.pathExists(projectPath);
            if (exists)
              return getLocalizedString("core.QuestionAppName.validation.pathExist", projectPath);
          }
        }
        return undefined;
      },
    },
    placeholder: getLocalizedString("core.question.appName.placeholder"),
  };
  return question;
}

function sampleSelectQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.Samples,
    cliName: "sample-name",
    cliDescription: "Specifies the app sample name.",
    cliChoiceListCommand: "teamsapp list samples",
    skipValidation: true,
    cliType: "argument",
    title: getLocalizedString("core.SampleSelect.title"),
    staticOptions: [
      "hello-world-tab-with-backend",
      "graph-toolkit-contact-exporter",
      "bot-sso",
      "todo-list-SPFx",
      "hello-world-in-meeting",
      "todo-list-with-Azure-backend-M365",
      "NPM-search-connector-M365",
      "bot-proactive-messaging-teamsfx",
      "adaptive-card-notification",
      "stocks-update-notification-bot",
      "query-org-user-with-message-extension-sso",
      "team-central-dashboard",
      "graph-connector-app",
      "graph-toolkit-one-productivity-hub",
      "todo-list-with-Azure-backend",
      "share-now",
      "hello-world-teams-tab-and-outlook-add-in",
      "outlook-add-in-set-signature",
      "developer-assist-dashboard",
      "live-share-dice-roller",
      "teams-chef-bot",
      "spfx-productivity-dashboard",
      "react-retail-dashboard",
      "sso-enabled-tab-via-apim-proxy",
      "large-scale-notification",
      "graph-connector-bot",
    ], //using a static list instead of dynamic list to avoid the delay of fetching sample list for CLL_HELP
    dynamicOptions: async () => {
      return (await sampleProvider.SampleCollection).samples.map((sample) => {
        return {
          id: sample.id,
          label: sample.title,
          description: `${sample.time} • ${sample.configuration}`,
          detail: sample.shortDescription,
        } as OptionItem;
      });
    },
    placeholder: getLocalizedString("core.SampleSelect.placeholder"),
    buttons: [
      {
        icon: "library",
        tooltip: getLocalizedString("core.SampleSelect.buttons.viewSamples"),
        command: "fx-extension.openSamples",
      },
    ],
  };
}

const defaultTabLocalHostUrl = "https://localhost:53000/index.html#/tab";
const tabContentUrlOptionItem = (tab: StaticTab): OptionItem => {
  return {
    id: tab.name,
    label: tab.name,
    detail: getLocalizedString(
      "core.updateContentUrlOption.description",
      tab.contentUrl,
      defaultTabLocalHostUrl
    ),
  };
};
const tabWebsiteUrlOptionItem = (tab: StaticTab): OptionItem => {
  return {
    id: tab.name,
    label: tab.name,
    detail: getLocalizedString(
      "core.updateWebsiteUrlOption.description",
      tab.websiteUrl,
      defaultTabLocalHostUrl
    ),
  };
};
export function getTabWebsiteOptions(inputs: Inputs): OptionItem[] {
  const appDefinition = inputs.teamsAppFromTdp as AppDefinition;
  if (appDefinition?.staticTabs) {
    const tabsWithWebsiteUrls = appDefinition.staticTabs.filter((o) => !!o.websiteUrl);
    if (tabsWithWebsiteUrls.length > 0) {
      return tabsWithWebsiteUrls.map((o) => tabWebsiteUrlOptionItem(o));
    }
  }
  return [];
}

export function selectTabWebsiteUrlQuestion(): MultiSelectQuestion {
  return {
    type: "multiSelect",
    name: QuestionNames.ReplaceWebsiteUrl,
    title: getLocalizedString("core.updateWebsiteUrlQuestion.title"),
    staticOptions: [],
    dynamicOptions: getTabWebsiteOptions,
    default: "all",
    placeholder: getLocalizedString("core.updateUrlQuestion.placeholder"),
    forgetLastValue: true,
  };
}

function getTabContentUrlOptions(inputs: Inputs): OptionItem[] {
  const appDefinition = inputs.teamsAppFromTdp as AppDefinition;
  if (appDefinition?.staticTabs) {
    const tabsWithContentUrls = appDefinition.staticTabs.filter((o) => !!o.contentUrl);
    if (tabsWithContentUrls.length > 0) {
      return tabsWithContentUrls.map((o) => tabContentUrlOptionItem(o));
    }
  }
  return [];
}

export const selectTabsContentUrlQuestion = (): MultiSelectQuestion => {
  return {
    type: "multiSelect",
    name: QuestionNames.ReplaceContentUrl,
    title: getLocalizedString("core.updateContentUrlQuestion.title"),
    staticOptions: [],
    dynamicOptions: getTabContentUrlOptions,
    default: "all",
    placeholder: getLocalizedString("core.updateUrlQuestion.placeholder"),
    forgetLastValue: true,
  };
};
const answerToRepaceBotId = "bot";
const answerToReplaceMessageExtensionBotId = "messageExtension";
const botOptionItem = (isMessageExtension: boolean, botId: string): OptionItem => {
  return {
    id: isMessageExtension ? answerToReplaceMessageExtensionBotId : answerToRepaceBotId,
    label: isMessageExtension
      ? getLocalizedString("core.updateBotIdForMessageExtension.label")
      : getLocalizedString("core.updateBotIdForBot.label"),
    detail: isMessageExtension
      ? getLocalizedString("core.updateBotIdForMessageExtension.description", botId)
      : getLocalizedString("core.updateBotIdForBot.description", botId),
  };
};

function getBotIdAndMeId(appDefinition: AppDefinition) {
  const bots = appDefinition.bots;
  const messageExtensions = appDefinition.messagingExtensions;
  // can add only one bot. If existing, the length is 1.
  const botId = !!bots && bots.length > 0 ? bots[0].botId : undefined;
  // can add only one message extension. If existing, the length is 1.
  const messageExtensionId =
    !!messageExtensions && messageExtensions.length > 0 ? messageExtensions[0].botId : undefined;
  return [botId, messageExtensionId];
}

function getBotOptions(inputs: Inputs): OptionItem[] {
  const appDefinition = inputs.teamsAppFromTdp as AppDefinition;
  if (!appDefinition) return [];
  const [botId, messageExtensionId] = getBotIdAndMeId(appDefinition);
  const options: OptionItem[] = [];
  if (botId) {
    options.push(botOptionItem(false, botId));
  }
  if (messageExtensionId) {
    options.push(botOptionItem(true, messageExtensionId));
  }
  return options;
}

export function selectBotIdsQuestion(): MultiSelectQuestion {
  return {
    type: "multiSelect",
    name: QuestionNames.ReplaceBotIds,
    title: getLocalizedString("core.updateBotIdsQuestion.title"),
    staticOptions: [],
    dynamicOptions: getBotOptions,
    default: "all",
    placeholder: getLocalizedString("core.updateBotIdsQuestion.placeholder"),
    forgetLastValue: true,
  };
}

export function apiSpecTypeSelectQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.OpenAPISpecType,
    title: "OpenAPI Spec Document",
    cliDescription: "The type of the API spec.",
    staticOptions: [
      {
        id: "enter-url",
        label: getLocalizedString(
          "core.createProjectQuestion.capability.selectOpenAPISpecFromUrl.label"
        ),
      },
      {
        id: "open-file",
        label: getLocalizedString(
          "core.createProjectQuestion.capability.selectOpenAPISpecFromFile.label"
        ),
      },
      {
        id: "search-api",
        label: getLocalizedString(
          "core.createProjectQuestion.capability.selectOpenAPISpecFromSearch.label"
        ),
      },
    ],
    onDidSelection(itemOrId, inputs) {
      inputs[QuestionNames.ActionType] = ActionStartOptions.apiSpec().id;
    },
  };
}

export function searchOpenAPISpecQueryQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.SearchOpenAPISpecQuery,
    title: getLocalizedString(
      "core.createProjectQuestion.capability.searchOpenAPISpecQueryQuestion.label"
    ),
    default: "",
    placeholder: getLocalizedString(
      "core.createProjectQuestion.capability.searchOpenAPISpecQueryQuestion.placeholder"
    ),
    additionalValidationOnAccept: {
      validFunc: async (input: string, inputs?: Inputs): Promise<string | undefined> => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }
        const searchResult = await searchOpenAPISpec(input);

        if (searchResult.length > 0) {
          inputs["searchResult"] = searchResult;
        } else {
          return "No search result found";
        }
      },
    },
    validation: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!input || input.trim().length === 0) {
          return "Please enter a search query.";
        }
        return undefined;
      },
    },
  };
}

export function selectOpenApiSpecQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SelectOpenApiSpec,
    title: getLocalizedString(
      "core.createProjectQuestion.capability.selectOpenAPISpecQuestion.label"
    ),
    staticOptions: [],
    dynamicOptions: (inputs: Inputs): OptionItem[] => {
      const searchResult = inputs["searchResult"] as SearchOpenAPISpecResult[];
      if (searchResult.length > 0) {
        const options: OptionItem[] = [];
        for (const api of searchResult) {
          options.push({
            id: api.url,
            label: api.key,
            detail: api.description,
          });
        }
        return options;
      }
      return [];
    },
  };
}

const maximumLengthOfDetailsErrorMessageInInputBox = 90;

export function apiSpecLocationQuestion(includeExistingAPIs = true): SingleFileOrInputQuestion {
  const correlationId = Correlator.getId(); // This is a workaround for VSCode which will lose correlation id when user accepts the value.
  const validationOnAccept = async (
    input: string,
    inputs?: Inputs
  ): Promise<string | undefined> => {
    try {
      if (!inputs) {
        throw new Error("inputs is undefined"); // should never happen
      }
      const context = createQuestionDeps.createContext();
      const res = await createQuestionDeps.listOperations(
        context,
        input.trim(),
        inputs,
        includeExistingAPIs,
        false,
        inputs.platform === Platform.VSCode ? correlationId : undefined
      );
      if (res.isOk()) {
        inputs.supportedApisFromApiSpec = res.value;
      } else {
        const errors = res.error;
        if (inputs.platform === Platform.CLI) {
          return errors.map((e) => e.content).join("\n");
        }
        if (
          errors.length === 1 &&
          errors[0].content.length <= maximumLengthOfDetailsErrorMessageInInputBox
        ) {
          return errors[0].content;
        } else {
          return getLocalizedString(
            "core.createProjectQuestion.apiSpec.multipleValidationErrors.vscode.message"
          );
        }
      }
    } catch (e) {
      const error = assembleError(e);
      throw error;
    }
  };
  return {
    type: "singleFileOrText",
    name: QuestionNames.ApiSpecLocation,
    cliShortName: "a",
    cliDescription: "OpenAPI description document location.",
    title: getLocalizedString("core.createProjectQuestion.apiSpec.title"),
    forgetLastValue: true,
    inputBoxConfig: {
      type: "innerText",
      title: getLocalizedString("core.createProjectQuestion.apiSpec.title"),
      placeholder: getLocalizedString("core.createProjectQuestion.apiSpec.placeholder"),
      name: "input-api-spec-url",
      step: 2, // Add "back" button
      validation: {
        validFunc: (input: string, inputs?: Inputs): Promise<string | undefined> => {
          const result = isValidHttpUrl(input.trim())
            ? undefined
            : inputs?.platform === Platform.CLI
              ? "Please enter a valid HTTP URL to access your OpenAPI description document or enter a file path of your local OpenAPI description document."
              : getLocalizedString("core.createProjectQuestion.invalidUrl.message");
          return Promise.resolve(result);
        },
      },
    },
    inputOptionItem: {
      id: "input",
      label: `$(cloud) ` + getLocalizedString("core.createProjectQuestion.apiSpecInputUrl.label"),
    },
    filters: {
      files: ["json", "yml", "yaml"],
    },
    validation: {
      validFunc: async (input: string, inputs?: Inputs): Promise<string | undefined> => {
        if (!isValidHttpUrl(input.trim()) && !(await fs.pathExists(input.trim()))) {
          return "Please enter a valid HTTP URL without authentication to access your OpenAPI description document or enter a file path of your local OpenAPI description document.";
        }

        return await validationOnAccept(input, inputs);
      },
    },
  };
}

/**
 * URL-only question for entering an OpenAPI spec URL.
 * Used when the user selects "Enter OpenAPI Document URL" from the flattened spec type selector.
 */
export function apiSpecUrlQuestion(): TextInputQuestion {
  const correlationId = Correlator.getId();
  return {
    type: "text",
    name: QuestionNames.ApiSpecLocation,
    cliShortName: "a",
    cliDescription: "OpenAPI description document URL.",
    title: getLocalizedString("core.createProjectQuestion.apiSpec.title"),
    placeholder: getLocalizedString("core.createProjectQuestion.apiSpec.placeholder"),
    forgetLastValue: true,
    validation: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        return isValidHttpUrl(input.trim())
          ? undefined
          : inputs?.platform === Platform.CLI
            ? "Please enter a valid HTTP URL to access your OpenAPI description document."
            : getLocalizedString("core.createProjectQuestion.invalidUrl.message");
      },
    },
    additionalValidationOnAccept: {
      validFunc: async (input: string, inputs?: Inputs): Promise<string | undefined> => {
        if (!inputs) {
          throw new Error("inputs is undefined");
        }
        const context = createQuestionDeps.createContext();
        const res = await createQuestionDeps.listOperations(
          context,
          input.trim(),
          inputs,
          true,
          false,
          inputs.platform === Platform.VSCode ? correlationId : undefined
        );
        if (res.isOk()) {
          inputs.supportedApisFromApiSpec = res.value;
        } else {
          const errors = res.error;
          if (inputs.platform === Platform.CLI) {
            return errors.map((e) => e.content).join("\n");
          }
          if (
            errors.length === 1 &&
            errors[0].content.length <= maximumLengthOfDetailsErrorMessageInInputBox
          ) {
            return errors[0].content;
          } else {
            return getLocalizedString(
              "core.createProjectQuestion.apiSpec.multipleValidationErrors.vscode.message"
            );
          }
        }
      },
    },
  };
}

/**
 * File-only question for browsing a local OpenAPI spec file.
 * Used when the user selects "Open file" from the flattened spec type selector.
 */
export function apiSpecFileQuestion(): SingleFileQuestion {
  const correlationId = Correlator.getId();
  return {
    type: "singleFile",
    name: QuestionNames.ApiSpecLocation,
    cliDescription: "OpenAPI description document file path.",
    title: getLocalizedString("core.createProjectQuestion.apiSpec.title"),
    filters: {
      "OpenAPI Description Document": ["json", "yml", "yaml"],
    },
    validation: {
      validFunc: async (input: string, inputs?: Inputs): Promise<string | undefined> => {
        if (!inputs) {
          throw new Error("inputs is undefined");
        }
        if (!(await fs.pathExists(input.trim()))) {
          return "File not found. Please select a valid OpenAPI description document file.";
        }
        const context = createQuestionDeps.createContext();
        const res = await createQuestionDeps.listOperations(
          context,
          input.trim(),
          inputs,
          true,
          false,
          inputs.platform === Platform.VSCode ? correlationId : undefined
        );
        if (res.isOk()) {
          inputs.supportedApisFromApiSpec = res.value;
        } else {
          const errors = res.error;
          if (inputs.platform === Platform.CLI) {
            return errors.map((e) => e.content).join("\n");
          }
          if (
            errors.length === 1 &&
            errors[0].content.length <= maximumLengthOfDetailsErrorMessageInInputBox
          ) {
            return errors[0].content;
          } else {
            return getLocalizedString(
              "core.createProjectQuestion.apiSpec.multipleValidationErrors.vscode.message"
            );
          }
        }
      },
    },
  };
}

export function apiAuthQuestion(excludeNone = false): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.ApiAuth,
    title: getLocalizedString("template.createProjectQuestion.apiMessageExtensionAuth.title"),
    placeholder: getLocalizedString(
      "template.createProjectQuestion.apiMessageExtensionAuth.placeholder"
    ),
    cliDescription: "The authentication type for the API.",
    staticOptions: ApiAuthOptions.all(),
    dynamicOptions: (inputs: Inputs) => {
      const options: OptionItem[] = excludeNone ? [] : [ApiAuthOptions.none()];
      if (inputs[QuestionNames.MeArchitectureType] === MeArchitectureOptions.newApi().id) {
        options.push(ApiAuthOptions.bearerToken(), ApiAuthOptions.microsoftEntra());
      } else if (inputs[QuestionNames.ActionType] === ActionStartOptions.newApi().id) {
        options.push(ApiAuthOptions.apiKey());
        options.push(ApiAuthOptions.microsoftEntra());
        options.push(ApiAuthOptions.oauth());
      }
      return options;
    },
    default: ApiAuthOptions.none().id,
  };
}

export function apiOperationQuestion(
  includeExistingAPIs = true,
  isAddPlugin = false
): MultiSelectQuestion {
  // export for unit test
  let placeholder = "";

  const isPlugin = (inputs?: Inputs): boolean => {
    return (
      isAddPlugin ||
      (!!inputs && inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id)
    );
  };

  return {
    type: "multiSelect",
    name: QuestionNames.ApiOperation,
    title: (inputs: Inputs) => {
      return isPlugin(inputs)
        ? getLocalizedString("core.createProjectQuestion.apiSpec.copilotOperation.title")
        : getLocalizedString("core.createProjectQuestion.apiSpec.operation.title");
    },
    cliDescription: isAddPlugin
      ? "Select operation(s) Copilot can interact with."
      : "Select operation(s) Teams can interact with.",
    cliShortName: "o",
    placeholder: (inputs: Inputs) => {
      const isPlugin = inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id;
      if (!includeExistingAPIs) {
        placeholder = getLocalizedString(
          "core.createProjectQuestion.apiSpec.operation.placeholder.skipExisting"
        );
      } else if (isPlugin) {
        placeholder = getLocalizedString(
          "core.createProjectQuestion.apiSpec.operation.plugin.placeholder"
        );
      } else {
        placeholder = getLocalizedString(
          "core.createProjectQuestion.apiSpec.operation.apikey.placeholder"
        );
      }

      return placeholder;
    },
    forgetLastValue: true,
    staticOptions: [],
    validation: {
      validFunc: (input: string[], inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }
        if (
          input.length < 1 ||
          (input.length > 10 &&
            inputs[QuestionNames.CustomCopilotRag] !== CustomCopilotRagOptions.customApi().id &&
            inputs[QuestionNames.ProjectType] !== ProjectTypeOptions.copilotAgentOptionId &&
            inputs[QuestionNames.ActionType] !== ActionStartOptions.apiSpec().id)
        ) {
          return getLocalizedString(
            "core.createProjectQuestion.apiSpec.operation.invalidMessage",
            input.length,
            10
          );
        }
        const operations: ApiOperation[] = inputs.supportedApisFromApiSpec as ApiOperation[];

        const authNames: Set<string> = new Set();
        const serverUrls: Set<string> = new Set();
        for (const inputItem of input) {
          const operation = operations.find((op) => op.id === inputItem);
          if (operation) {
            if (operation.data.authName) {
              authNames.add(operation.data.authName);
              serverUrls.add(operation.data.serverUrl);
            }
          }
        }

        if (serverUrls.size > 1) {
          return getLocalizedString(
            "core.createProjectQuestion.apiSpec.operation.multipleServer",
            Array.from(serverUrls).join(", ")
          );
        }

        const seenAuthNames = new Set<string>();
        const uniqueAuthApis = operations.filter((api) => {
          if (
            !!api.data.authName &&
            input.includes(api.id) &&
            !seenAuthNames.has(api.data.authName)
          ) {
            seenAuthNames.add(api.data.authName);
            return true;
          }
          return false;
        });
        inputs.apiAuthData = uniqueAuthApis.map((authApi) => authApi.data);
      },
    },
    dynamicOptions: async (inputs: Inputs) => {
      if (inputs[QuestionNames.SelectOpenApiSpec]) {
        const specUrl = inputs[QuestionNames.SelectOpenApiSpec] as string;
        inputs[QuestionNames.ApiSpecLocation] = specUrl;
        const context = createQuestionDeps.createContext();

        // TODO: will use kiota npm package for this api
        const res = await createQuestionDeps.listOperations(context, specUrl, inputs, true, false);
        if (res.isOk()) {
          inputs.supportedApisFromApiSpec = res.value;
        } else {
          throw res.error;
        }
      }

      if (!inputs.supportedApisFromApiSpec) {
        throw new EmptyOptionError(QuestionNames.ApiOperation, "question");
      }

      const operations = inputs.supportedApisFromApiSpec as ApiOperation[];

      return operations;
    },
  };
}

function customCopilotRagQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.CustomCopilotRag,
    title: getLocalizedString("core.createProjectQuestion.capability.customCopilotRag.title"),
    placeholder: getLocalizedString("template.teams.rag.source.placeholder"),
    staticOptions: CustomCopilotRagOptions.all(),
    dynamicOptions: () => CustomCopilotRagOptions.all(),
    default: CustomCopilotRagOptions.customize().id,
  };
}

function customCopilotAssistantQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.CustomCopilotAssistant,
    title: getLocalizedString("core.createProjectQuestion.capability.customCopilotAssistant.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.capability.customCopilotAssistant.placeholder"
    ),
    staticOptions: CustomCopilotAssistantOptions.all(),
    dynamicOptions: () => CustomCopilotAssistantOptions.all(),
    default: CustomCopilotAssistantOptions.new().id,
  };
}

function llmServiceQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.LLMService,
    title: getLocalizedString("core.createProjectQuestion.llmService.title"),
    placeholder: getLocalizedString("core.createProjectQuestion.llmService.placeholder"),
    staticOptions: [
      {
        id: "llm-service-azure-openai",
        cliName: "azure-openai",
        label: getLocalizedString("core.createProjectQuestion.llmServiceAzureOpenAIOption.label"),
        detail: getLocalizedString("core.createProjectQuestion.llmServiceAzureOpenAIOption.detail"),
      },
      {
        id: "llm-service-openai",
        label: getLocalizedString("core.createProjectQuestion.llmServiceOpenAIOption.label"),
        detail: getLocalizedString("core.createProjectQuestion.llmServiceOpenAIOption.detail"),
      },
    ],
    dynamicOptions: (inputs: Inputs) => {
      const options: OptionItem[] = [];
      options.push(
        {
          id: "llm-service-azure-openai",
          label: getLocalizedString("core.createProjectQuestion.llmServiceAzureOpenAIOption.label"),
          detail: getLocalizedString(
            "core.createProjectQuestion.llmServiceAzureOpenAIOption.detail"
          ),
        },
        {
          id: "llm-service-openai",
          label: getLocalizedString("core.createProjectQuestion.llmServiceOpenAIOption.label"),
          detail: getLocalizedString("core.createProjectQuestion.llmServiceOpenAIOption.detail"),
        }
      );
      return options;
    },
    skipSingleOption: true,
    default: "llm-service-azure-openai",
  };
}

export function openAIKeyQuestion(): TextInputQuestion {
  return {
    type: "text",
    password: true,
    name: QuestionNames.OpenAIKey,
    title: getLocalizedString("core.createProjectQuestion.llmService.openAIKey.title"),
    placeholder: getLocalizedString("core.createProjectQuestion.llmService.openAIKey.placeholder"),
  };
}

export function azureOpenAIKeyQuestion(): TextInputQuestion {
  return {
    type: "text",
    password: true,
    name: QuestionNames.AzureOpenAIKey,
    title: getLocalizedString("core.createProjectQuestion.llmService.azureOpenAIKey.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIKey.placeholder"
    ),
  };
}

export function azureOpenAIEndpointQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.AzureOpenAIEndpoint,
    title: getLocalizedString("core.createProjectQuestion.llmService.azureOpenAIEndpoint.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIEndpoint.placeholder"
    ),
  };
}

export function azureOpenAIDeploymentNameQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.AzureOpenAIDeploymentName,
    title: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIDeploymentName.title"
    ),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIDeploymentName.placeholder"
    ),
  };
}

export function openAIAssistantIdQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.OpenAIAssistantID,
    title: getLocalizedString("core.createProjectQuestion.llmService.openAIAssistantID.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.llmService.openAIAssistantID.placeholder"
    ),
  };
}

export function azureOpenAIAssistantIdQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.AzureOpenAIAssistantId,
    title: getLocalizedString("core.createProjectQuestion.llmService.azureOpenAIAssistantID.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIAssistantID.placeholder"
    ),
  };
}

export function azureOpenAIEmbeddingDeploymentNameQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.AzureOpenAIEmbeddingDeploymentName,
    title: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIEmbeddingDeploymentName.title"
    ),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.llmService.azureOpenAIEmbeddingDeploymentName.placeholder"
    ),
  };
}

export function foundryEndpointQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.FoundryEndpoint,
    title: getLocalizedString("core.createProjectQuestion.foundry.endpoint.title"),
    placeholder: getLocalizedString("core.createProjectQuestion.foundry.endpoint.placeholder"),
  };
}

export function foundryAgentIdQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.FoundryAgentId,
    title: getLocalizedString("core.createProjectQuestion.foundry.agentId.title"),
    placeholder: getLocalizedString("core.createProjectQuestion.foundry.agentId.placeholder"),
  };
}

export function apiPluginStartQuestion(doesProjectExists?: boolean): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.ActionType,
    title: (inputs: Inputs) => {
      return inputs[QuestionNames.Capabilities] === DACapabilityOptions.declarativeAgent().id ||
        doesProjectExists
        ? getLocalizedString("core.createProjectQuestion.addApiPlugin.title")
        : getLocalizedString("template.createProjectQuestion.createApiPlugin.title");
    },
    placeholder: (inputs: Inputs) => {
      return inputs[QuestionNames.Capabilities] === DACapabilityOptions.declarativeAgent().id ||
        doesProjectExists
        ? getLocalizedString("template.createProjectQuestion.addApiPlugin.placeholder")
        : getLocalizedString(
            "template.createProjectQuestion.projectType.copilotExtension.placeholder"
          );
    },
    cliDescription: "Action type.",
    staticOptions: ActionStartOptions.staticAll(doesProjectExists),
    dynamicOptions: (inputs: Inputs) => {
      return ActionStartOptions.all(inputs, doesProjectExists);
    },
    default: ActionStartOptions.newApi().id,
  };
}

export function selectExistingPluginManifestQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SelectPluginManifest,
    title: getLocalizedString("core.regenerateQuestion.selectPluginManifestTitle"),
    cliDescription: "Select plugin manifest file.",
    staticOptions: [],
    onDidSelection: (item: string | OptionItem, inputs: Inputs) => {
      inputs[QuestionNames.SelectPluginId] = (item as OptionItem).data as string;
    },
    dynamicOptions: async (inputs: Inputs) => {
      if (!inputs.projectPath) {
        throw new Error("projectPath is undefined");
      }
      const options: OptionItem[] = [];
      const manifestPath = path.join(
        inputs.projectPath,
        AppPackageFolderName,
        ManifestTemplateFileName
      );

      inputs[QuestionNames.ManifestPath] = manifestPath;
      const manifestRes = await manifestUtils._readAppManifest(manifestPath);
      if (manifestRes.isErr()) {
        throw manifestRes.error;
      }
      const manifest = manifestRes.value;
      const declarativeAgentPathRelativePath =
        manifest?.copilotAgents?.declarativeAgents?.[0]?.file;
      if (!declarativeAgentPathRelativePath) {
        throw new DeclarativeAgentPathNotFoundError(manifestPath);
      }
      const declarativeAgentPath = path.join(
        inputs.projectPath,
        AppPackageFolderName,
        declarativeAgentPathRelativePath
      );
      const declarativeAgentJson = (await fs.readJSON(
        declarativeAgentPath
      )) as DeclarativeAgentManifest;

      const actions = declarativeAgentJson.actions;
      if (!actions || actions.length === 0) {
        throw new ActionNotFoundError(declarativeAgentPath);
      }
      for (const action of actions) {
        const actionName = action.file;
        options.push({
          id: path.join(inputs.projectPath, AppPackageFolderName, actionName),
          label: path.basename(actionName),
          data: action.id,
        });
      }

      return options;
    },
  };
}

export function selectOpenAPISpecFromPluginQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SelectOpenAPISpecFromPlugin,
    title: getLocalizedString("core.regenerateQuestion.selectOpenAPISpecFromPluginTitle"),
    cliDescription: "Select OpenAPI description document file.",
    staticOptions: [],
    onDidSelection: (itemOrId: string | OptionItem, inputs: Inputs) => {
      inputs[QuestionNames.ActionType] = DeclarativeAgentApiSpecOptionId;
    },
    dynamicOptions: async (inputs: Inputs): Promise<OptionItem[]> => {
      const pluginPath = inputs[QuestionNames.SelectPluginManifest] as string;

      const options: OptionItem[] = [];

      const pluginManifest = await fs.readJSON(inputs[QuestionNames.SelectPluginManifest]);

      const specUrlMap = new Map<string, string[] | undefined>();
      pluginManifest.runtimes?.forEach((runtime: any) => {
        if (runtime.spec) {
          const specPath = runtime.spec.url;
          const functions = runtime.run_for_functions;
          if (specUrlMap.has(specPath)) {
            const existingValue = specUrlMap.get(specPath);
            if (existingValue) {
              existingValue.push(...(functions ?? []));
            }
          } else {
            specUrlMap.set(specPath, functions ?? []);
          }
        }
      });

      specUrlMap.forEach((value, key) => {
        const specAbsolutePath = path.join(path.dirname(pluginPath), key);
        options.push({
          id: specAbsolutePath,
          label: key,
        });
      });

      if (options.length === 0) {
        throw new SpecNotFoundError(pluginPath);
      }

      return options;
    },
  };
}

export function selectApiOperationForRegenerateQuestion(): MultiSelectQuestion {
  return {
    type: "multiSelect",
    name: QuestionNames.ApiOperation,
    title: getLocalizedString("core.regenerateQuestion.selectApiOperationForRegenerateTitle"),
    cliDescription: "Select operation(s) Copilot can interact with.",
    cliShortName: "o",
    placeholder: getLocalizedString(
      "core.createProjectQuestion.apiSpec.operation.plugin.placeholder"
    ),
    forgetLastValue: true,
    staticOptions: [],
    validation: {
      validFunc: (input: string[], inputs?: Inputs): string | undefined => {
        const operations: ApiOperation[] = inputs!.supportedApisFromApiSpec as ApiOperation[];

        const serverUrls: Set<string> = new Set();
        for (const inputItem of input) {
          const operation = operations.find((op) => op.id === inputItem);
          if (operation) {
            serverUrls.add(operation.data.serverUrl);
          }
        }

        if (serverUrls.size > 1) {
          return getLocalizedString(
            "core.createProjectQuestion.apiSpec.operation.multipleServer",
            Array.from(serverUrls).join(", ")
          );
        }
      },
    },
    dynamicOptions: async (inputs: Inputs) => {
      const specUrl = (inputs[QuestionNames.SelectOpenAPISpecFromPlugin] as string) + ".original";

      if (!(await fs.pathExists(specUrl))) {
        throw new OriginalSpecNotFoundError(specUrl);
      }

      inputs[QuestionNames.ApiSpecLocation] = specUrl;
      const context = createQuestionDeps.createContext();

      const res = await createQuestionDeps.listOperations(context, specUrl, inputs, true, false);
      if (res.isOk()) {
        inputs.supportedApisFromApiSpec = res.value;
      } else {
        throw res.error;
      }

      if (!inputs.supportedApisFromApiSpec || inputs.supportedApisFromApiSpec.length === 0) {
        throw new EmptyOptionError(QuestionNames.ApiOperation, "question");
      }

      const operations = inputs.supportedApisFromApiSpec as ApiOperation[];

      return operations;
    },
  };
}

export function pluginManifestQuestion(): SingleFileQuestion {
  const correlationId = Correlator.getId();
  return {
    type: "singleFile",
    name: QuestionNames.PluginManifestFilePath,
    title: getLocalizedString("core.createProjectQuestion.addExistingPlugin.pluginManifest.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.addExistingPlugin.pluginManifest.placeholder"
    ),
    cliDescription: "Plugin manifest path.",
    filters: {
      files: ["json"],
    },
    defaultFolder: (inputs: Inputs) =>
      CLIPlatforms.includes(inputs.platform) ? "./" : os.homedir(),
    default: (inputs: Inputs) => {
      if (!inputs.projectPath) {
        return undefined;
      }

      const ttkPluginFilePath = path.join(
        inputs.projectPath,
        AppPackageFolderName,
        DefaultPluginManifestFileName
      );

      if (fs.existsSync(ttkPluginFilePath)) {
        return ttkPluginFilePath;
      }
      return undefined;
    },
    validation: {
      validFunc: async (input: string) => {
        const manifestRes = await pluginManifestUtils.readPluginManifestFile(input.trim());
        if (manifestRes.isErr()) {
          sendTelemetryErrorEvent(
            CoreSource,
            getQuestionValidationErrorEventName(QuestionNames.PluginManifestFilePath),
            manifestRes.error,
            {
              "correlation-id": correlationId,
            }
          );
          return (manifestRes.error as UserError).displayMessage;
        } else {
          const manifest = manifestRes.value;

          const checkRes = validateSourcePluginManifest(
            manifest,
            QuestionNames.PluginManifestFilePath
          );
          if (checkRes.isErr()) {
            sendTelemetryErrorEvent(
              CoreSource,
              getQuestionValidationErrorEventName(QuestionNames.PluginManifestFilePath),
              checkRes.error,
              {
                "correlation-id": correlationId,
              }
            );
            return checkRes.error.displayMessage;
          }
        }
      },
    },
  };
}

export function pluginApiSpecQuestion(): SingleFileQuestion {
  const correlationId = Correlator.getId();
  return {
    type: "singleFile",
    name: QuestionNames.PluginOpenApiSpecFilePath,
    title: getLocalizedString("core.createProjectQuestion.addExistingPlugin.apiSpec.title"),
    placeholder: getLocalizedString(
      "core.createProjectQuestion.addExistingPlugin.openApiSpec.placeholder"
    ),
    cliDescription: "OpenAPI description document used for your API plugin.",
    filters: {
      files: ["json", "yml", "yaml"],
    },
    defaultFolder: (inputs: Inputs) =>
      CLIPlatforms.includes(inputs.platform)
        ? "./"
        : path.dirname(inputs[QuestionNames.PluginManifestFilePath] as string),
    validation: {
      validFunc: async (input: string, inputs?: Inputs) => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }
        const filePath = input.trim();

        const ext = path.extname(filePath).toLowerCase();
        if (![".json", ".yml", ".yaml"].includes(ext)) {
          const error = new FileNotSupportError(CoreSource, ["json", "yml", "yaml"].join(", "));
          sendTelemetryErrorEvent(
            CoreSource,
            getQuestionValidationErrorEventName(QuestionNames.PluginOpenApiSpecFilePath),
            error,
            {
              "correlation-id": correlationId,
            }
          );
          return error.displayMessage;
        }

        const validationRes = await validateOpenAPISpec(filePath);
        const invalidSpecError = validationRes.errors.find(
          (o) => o.type === ErrorType.SpecNotValid
        );

        if (invalidSpecError) {
          const error = new UserError(
            SpecParserSource,
            ApiSpecTelemetryPropertis.InvalidApiSpec,
            invalidSpecError.content,
            invalidSpecError.content
          );
          sendTelemetryErrorEvent(
            CoreSource,
            getQuestionValidationErrorEventName(QuestionNames.PluginOpenApiSpecFilePath),
            error,
            {
              "correlation-id": correlationId,
              [ApiSpecTelemetryPropertis.SpecNotValidDetails]: invalidSpecError.content,
            }
          );
        }

        return invalidSpecError?.content;
      },
    },
  };
}

export function addKnowledgeStartQuestion(doesProjectExists?: boolean): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.KnowledgeSource,
    title: getLocalizedString("core.createProjectQuestion.addKnowledge.title"),
    placeholder: getLocalizedString("core.createProjectQuestion.addKnowledge.placeholder"),
    cliDescription: "Knowledge source.",
    staticOptions: KnowledgeSourceOptions.all(),
    default: KnowledgeSourceOptions.webSearch().id,
    required: true,
    dynamicOptions: (inputs: Inputs) => {
      return KnowledgeSourceOptions.allWithFeatureFlags();
    },
  };
}

export function oneDriveSharePointItemQuestion(): TextInputQuestion {
  const validationOnAccept = async (
    input: string,
    inputs?: Inputs
  ): Promise<string | undefined> => {
    try {
      if (!inputs) {
        throw new Error("inputs is undefined"); // should never happen
      }
      const context = createQuestionDeps.createContext();
      const res = await getODSPItemInfo(context, input.trim());
      if (res.isOk()) {
        inputs.oneDriveSharePointItem = res.value;
      } else {
        return res.error.displayMessage;
      }
    } catch (e) {
      const error = assembleError(e);
      throw error;
    }
  };
  return {
    type: "text",
    name: QuestionNames.OneDriveSharePointURL,
    title: getLocalizedString("core.createProjectQuestion.oneDriveSharePointItem.title"),
    forgetLastValue: true,
    additionalValidationOnAccept: {
      validFunc: async (input: string, inputs?: Inputs): Promise<string | undefined> => {
        if (!isValidHttpUrl(input.trim())) {
          return "Please input a valid URL";
        }
        return await validationOnAccept(input.trim(), inputs);
      },
    },
    placeholder: getLocalizedString(
      "core.createProjectQuestion.oneDriveSharePointItem.placeholder"
    ),
  };
}

export function oneDriveSharePointItemConfirmQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.OneDriveSharePointContent,
    title: getLocalizedString("core.createProjectQuestion.oneDriveSharePointItem.title"),
    type: "singleSelect",
    staticOptions: [],
    dynamicOptions: (inputs: Inputs) => {
      const icon =
        inputs.oneDriveSharePointItem[0].itemType === OneDriveSharePointItemType.Folder
          ? "$(folder)"
          : "$(file)";
      return [
        {
          id: inputs.oneDriveSharePointItem[0].id,
          label: `${icon} ${(inputs.oneDriveSharePointItem as { name: string }[])[0].name}`,
        },
      ];
    },
    placeholder: getLocalizedString("core.createProjectQuestion.oneDriveSharePointItem.confirm"),
    forgetLastValue: true,
  };
}

export function GCItemQuestion(): SingleSelectQuestion {
  const options = [GCSelectOptions.list(), GCSelectOptions.input()];

  return {
    name: QuestionNames.GCContent,
    title: getLocalizedString("core.GCSelectQuestion.title"),
    staticOptions: options,
    type: "singleSelect",
  };
}

export function GCListQuestion(): MultiSelectQuestion {
  return {
    type: "multiSelect",
    name: QuestionNames.GCList,
    title: getLocalizedString("core.GCListQuestion.title"),
    staticOptions: [],
    dynamicOptions: getGraphConnectors,
    default: [],
    placeholder: getLocalizedString("core.GCListQuestion.placeholder"),
    forgetLastValue: true,
    validation: {
      validFunc: async (input: string[], inputs?: Inputs): Promise<string | undefined> => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }
        if (
          inputs[QuestionNames.KnowledgeSource] == KnowledgeSourceOptions.graphConnector().id &&
          inputs[QuestionNames.GCContent] == GCSelectOptions.list().id &&
          input.length < 1
        ) {
          return Promise.resolve(
            getLocalizedString("core.GCListQuestion.invalidMessage", input.length)
          );
        }
      },
    },
  };
}

export function GCInputQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.GCInput,
    title: getLocalizedString("core.GCInputQuestion.title"),
    cliDescription: "a connection ID for Copilot connector",
    forgetLastValue: true,
    validation: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!input || input.trim().length === 0) {
          return "Please enter a connection ID for Copilot connector.";
        }
      },
    },
  };
}

export function webContentQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.WebContent,
    title: getLocalizedString("core.addKnowledgeQuestion.webContent.title"),
    placeholder: getLocalizedString("core.addKnowledgeQuestion.webContent.placeholder"),
    type: "text",
    cliDescription: "An absolute URL to a site to be searched for content.",
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }
        if (!isValidHttpUrl(input.trim())) {
          return getLocalizedString("core.addKnowledgeQuestion.invalidWebContent.message");
        } else {
          inputs.webSearchUrl = input;
        }
        return;
      },
    },
  };
}

export function searchTypeQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.SearchType,
    title: getLocalizedString("core.addKnowledgeQuestion.searchType.title"),
    staticOptions: KnowledgeSearchTypeOptions.all(),
    type: "singleSelect",
    required: true,
    default: KnowledgeSearchTypeOptions.url().id,
    dynamicOptions: (inputs: Inputs) => {
      const options = [KnowledgeSearchTypeOptions.url()];
      if (inputs[QuestionNames.KnowledgeSource] === KnowledgeSourceOptions.webSearch().id) {
        options.push(KnowledgeSearchTypeOptions.allWeb());
      } else if (
        inputs[QuestionNames.KnowledgeSource] === KnowledgeSourceOptions.oneDriveSharePoint().id
      ) {
        options.push(KnowledgeSearchTypeOptions.allOneDriveSharepoint());
      }
      return options;
    },
  };
}

export function GCNameQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.GCName,
    title: getLocalizedString("core.GCNameQuestion.title"),
    placeholder: getLocalizedString("core.GCNameQuestion.placeholder"),
    cliDescription: "a name for Copilot connector",
    forgetLastValue: true,
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        inputs = ensureInputs(inputs);

        inputs[QuestionNames.ProgrammingLanguage] = ProgrammingLanguage.TS;

        // Set template name and app name for Copilot connector Template
        if (inputs[QuestionNames.ProjectType] !== ProjectTypeOptions.copilotAgentOptionId) {
          inputs[QuestionNames.TemplateName] = TemplateNames.GraphConnector;
          inputs[QuestionNames.AppName] = input;
        }
        return;
      },
    },
    validation: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!input || input.trim().length === 0) {
          return "Please enter a Copilot connector name.";
        }
        inputs = ensureInputs(inputs);

        if (inputs[QuestionNames.ProjectType] !== ProjectTypeOptions.copilotAgentOptionId) {
          // Copilot connector Template will use the name as app name, which has a minimum length of 2.
          if (input.trim().length < 2) {
            return "Please enter a Copilot connector name with minimum two characters.";
          }
        }
        return undefined;
      },
    },
  };
}

export function GCConnectionIdQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.GCConnectionId,
    title: getLocalizedString("core.GCConnectionIdQuestion.title"),
    placeholder: getLocalizedString("core.GCConnectionIdQuestion.placeholder"),
    cliDescription: "a connection id for Copilot connector",
    forgetLastValue: true,
    validation: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        // Developer-provided unique ID
        // Must be between 3 and 32 characters in length
        // Must only contain alphanumeric characters
        // Cannot begin with Microsoft or some disallowed id values
        // https://learn.microsoft.com/en-us/graph/api/resources/externalconnectors-externalconnection?view=graph-rest-1.0#properties
        if (!input || input.trim().length < 3) {
          return getLocalizedString("core.GCConnectionIdQuestion.validation.minlength");
        }
        if (input.trim().length > 32) {
          return getLocalizedString("core.GCConnectionIdQuestion.validation.maxlength");
        }
        if (!/^[a-zA-Z0-9]+$/.test(input)) {
          return getLocalizedString("core.GCConnectionIdQuestion.validation.pattern");
        }
        const disallowedConnectorIds = [
          "Microsoft",
          "None",
          "Directory",
          "Exchange",
          "ExchangeArchive",
          "LinkedIn",
          "Mailbox",
          "OneDriveBusiness",
          "SharePoint",
          "Teams",
          "Yammer",
          "Connectors",
          "TaskFabric",
          "PowerBI",
          "Assistant",
          "TopicEngine",
          "MSFT_All_Connectors",
        ];
        // Check if the input starts with any of the beginner strings and find the first match
        const matchedBeginner = disallowedConnectorIds.find((item) =>
          input.toLowerCase().startsWith(item.toLocaleLowerCase())
        );
        if (matchedBeginner) {
          return getLocalizedString(
            "core.GCConnectionIdQuestion.validation.specialBeginner",
            matchedBeginner
          );
        }

        return undefined;
      },
    },
  };
}

export function createSampleProjectQuestionNode(): IQTreeNode {
  return {
    data: sampleSelectQuestion(), // for create sample command, sample name is argument
    children: [
      {
        data: folderQuestion(),
      },
    ],
  };
}
