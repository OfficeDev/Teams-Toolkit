// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppPackageFolderName,
  BuildFolderName,
  CLIPlatforms,
  ConfirmQuestion,
  DynamicPlatforms,
  FolderQuestion,
  IQTreeNode,
  Inputs,
  MultiFileQuestion,
  MultiSelectQuestion,
  Platform,
  PluginManifestSchema,
  SingleFileQuestion,
  SingleSelectQuestion,
  TextInputQuestion,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { GraphClient } from "../client/graphClient";
import { AppStudioScopes, ConstantString, ListSensitivityLabelScope } from "../common/constants";
import { FeatureFlags, featureFlagManager } from "../common/featureFlags";
import { TOOLS } from "../common/globalVars";
import { getLocalizedString } from "../common/localizeUtils";
import { Constants } from "../component/driver/add/utility/constants";
import { manifestUtils } from "../component/driver/teamsApp/utils/ManifestUtils";
import { envUtil } from "../component/utils/envUtil";
import { environmentNameManager } from "../core/environmentName";
import {
  ActionStartOptions,
  AddAuthActionAuthTypeOptions,
  GCSelectOptions,
  HubOptions,
  KnowledgeSearchTypeOptions,
  KnowledgeSourceOptions,
  QuestionNames,
  TeamsAppValidationOptions,
} from "./constants";
import {
  GCInputQuestion,
  GCItemQuestion,
  GCListQuestion,
  SPFxFrameworkQuestion,
  SPFxImportFolderQuestion,
  SPFxWebpartNameQuestion,
  addKnowledgeStartQuestion,
  apiOperationQuestion,
  apiPluginStartQuestion,
  apiSpecLocationQuestion,
  oneDriveSharePointItemConfirmQuestion,
  oneDriveSharePointItemQuestion,
  pluginManifestQuestion,
  searchTypeQuestion,
  selectApiOperationForRegenerateQuestion,
  selectExistingPluginManifestQuestion,
  selectOpenAPISpecFromPluginQuestion,
  webContentQuestion,
} from "./create";
import { UninstallInputs } from "./inputs";
import { inputOrSearchAPISpecNode } from "./scaffold/commonNodes";
import {
  MCPForDAAddAuthTypeStaticOptions,
  MCPForDAAuthCredentialNodes,
  validateMCPServerUrl,
} from "./scaffold/vsc/teamsProjectTypeNode";

function mcpForDAAddAuthCredentialNodes(): IQTreeNode[] {
  return MCPForDAAuthCredentialNodes().map((node) => {
    const authTypeCondition = node.condition;
    return {
      ...node,
      condition: (inputs: Inputs) =>
        featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT) &&
        !featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled) &&
        (authTypeCondition === undefined || authTypeCondition(inputs)),
    };
  });
}

export function convertAadToNewSchemaQuestionNode(): IQTreeNode {
  return {
    data: { type: "group" },
    children: [
      {
        condition: (inputs: Inputs) =>
          DynamicPlatforms.includes(inputs.platform) &&
          !inputs[QuestionNames.AadAppManifestFilePath],
        data: selectAadManifestQuestion(),
        children: [
          {
            condition: (inputs: Inputs) =>
              inputs.platform === Platform.VSCode && // confirm question only works for VSC
              inputs.projectPath !== undefined &&
              path.resolve(inputs[QuestionNames.AadAppManifestFilePath]) !==
                path.join(inputs.projectPath, "aad.manifest.json"),
            data: confirmManifestQuestion(false, false),
            cliOptionDisabled: "self",
            inputsDisabled: "self",
          },
        ],
      },
    ],
  };
}

export function deployAadManifestQuestionNode(): IQTreeNode {
  return {
    data: { type: "group" },
    children: [
      {
        condition: (inputs: Inputs) => DynamicPlatforms.includes(inputs.platform),
        data: selectAadManifestQuestion(),
        children: [
          {
            condition: (inputs: Inputs) =>
              inputs.platform === Platform.VSCode && // confirm question only works for VSC
              inputs.projectPath !== undefined &&
              path.resolve(inputs[QuestionNames.AadAppManifestFilePath]) !==
                path.join(inputs.projectPath, "aad.manifest.json"),
            data: confirmManifestQuestion(false, false),
            cliOptionDisabled: "self",
            inputsDisabled: "self",
          },
          {
            condition: isAadMainifestContainsPlaceholder,
            data: selectTargetEnvQuestion(QuestionNames.Env, false, false, ""),
          },
        ],
      },
    ],
  };
}

export function validateTeamsAppQuestionNode(): IQTreeNode {
  return {
    data: selectTeamsAppValidationMethodQuestion(),
    cliOptionDisabled: "self",
    inputsDisabled: "self",
    children: [
      {
        condition: { equals: TeamsAppValidationOptions.schema().id },
        data: selectTeamsAppManifestQuestion(),
      },
      {
        condition: { equals: TeamsAppValidationOptions.package().id },
        data: selectTeamsAppPackageQuestion(),
      },
      {
        condition: { equals: TeamsAppValidationOptions.testCases().id },
        data: selectTeamsAppPackageQuestion(),
      },
    ],
  };
}

export function selectTeamsAppManifestQuestionNode(): IQTreeNode {
  return {
    data: selectTeamsAppManifestQuestion(),
    children: [
      {
        condition: (inputs: Inputs) => confirmCondition(inputs, false),
        data: confirmManifestQuestion(true, false),
        cliOptionDisabled: "self",
        inputsDisabled: "self",
      },
    ],
  };
}

function confirmCondition(inputs: Inputs, isLocal: boolean): boolean {
  return (
    inputs.platform === Platform.VSCode && // confirm question only works for VSC
    inputs.projectPath &&
    inputs[
      isLocal ? QuestionNames.LocalTeamsAppManifestFilePath : QuestionNames.TeamsAppManifestFilePath
    ] &&
    path.resolve(
      inputs[
        isLocal
          ? QuestionNames.LocalTeamsAppManifestFilePath
          : QuestionNames.TeamsAppManifestFilePath
      ]
    ) !==
      path.join(
        inputs.projectPath,
        AppPackageFolderName,
        isLocal ? "manifest.local.json" : "manifest.json"
      )
  );
}

async function spfxFrameworkExist(inputs: Inputs): Promise<boolean> {
  if (inputs.platform === Platform.CLI_HELP) {
    return false;
  }

  const yorcPath = path.join(inputs[QuestionNames.SPFxFolder], Constants.YO_RC_FILE);
  if (!(await fs.pathExists(yorcPath))) {
    return false;
  }

  const yorcJson = (await fs.readJson(yorcPath)) as Record<string, any>;
  if (!yorcJson["@microsoft/generator-sharepoint"]) {
    return false;
  }

  return yorcJson["@microsoft/generator-sharepoint"]["template"];
}

export function addWebPartQuestionNode(): IQTreeNode {
  return {
    data: SPFxImportFolderQuestion(true),
    children: [
      {
        data: SPFxWebpartNameQuestion(),
        children: [
          {
            data: SPFxFrameworkQuestion(),
            condition: async (inputs: Inputs) => {
              return !(await spfxFrameworkExist(inputs));
            },
          },
          {
            data: selectTeamsAppManifestQuestion(),
            children: [
              {
                condition: (inputs: Inputs) => confirmCondition(inputs, false),
                data: confirmManifestQuestion(true, false),
                cliOptionDisabled: "self",
                inputsDisabled: "self",
              },
              {
                data: selectLocalTeamsAppManifestQuestion(),
                children: [
                  {
                    condition: (inputs: Inputs) => confirmCondition(inputs, true),
                    data: confirmManifestQuestion(true, true),
                    cliOptionDisabled: "self",
                    inputsDisabled: "self",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function selectTeamsAppManifestQuestion(): SingleFileQuestion {
  return {
    name: QuestionNames.TeamsAppManifestFilePath,
    cliName: "manifest-file",
    cliShortName: "t",
    cliDescription: "Specifies the app manifest file path.",
    title: getLocalizedString("core.selectTeamsAppManifestQuestion.title"),
    type: "singleFile",
    default: (inputs: Inputs): string | undefined => {
      if (inputs.platform === Platform.CLI_HELP) {
        return "./appPackage/manifest.json";
      } else {
        if (!inputs.projectPath) return undefined;
        const manifestPath = path.join(inputs.projectPath, AppPackageFolderName, "manifest.json");
        if (fs.pathExistsSync(manifestPath)) {
          return manifestPath;
        } else {
          return undefined;
        }
      }
    },
  };
}

export function selectLocalTeamsAppManifestQuestion(): SingleFileQuestion {
  return {
    name: QuestionNames.LocalTeamsAppManifestFilePath,
    cliName: "local-manifest-file",
    cliShortName: "l",
    cliDescription:
      "Specifies the app manifest template file path for local environment, it can be either absolute path or relative path to project root folder.",
    title: getLocalizedString("core.selectLocalTeamsAppManifestQuestion.title"),
    type: "singleFile",
    default: (inputs: Inputs): string | undefined => {
      if (inputs.platform === Platform.CLI_HELP) {
        return "./appPackage/manifest.local.json";
      } else {
        if (!inputs.projectPath) return undefined;
        const manifestPath = path.join(
          inputs.projectPath,
          AppPackageFolderName,
          "manifest.local.json"
        );
        if (fs.pathExistsSync(manifestPath)) {
          return manifestPath;
        } else {
          return undefined;
        }
      }
    },
  };
}

export function confirmManifestQuestion(isTeamsApp = true, isLocal = false): SingleSelectQuestion {
  const map: Record<string, string> = {
    true_true: QuestionNames.ConfirmLocalManifest,
    true_false: QuestionNames.ConfirmManifest,
    false_true: QuestionNames.ConfirmAadManifest,
    false_false: QuestionNames.ConfirmAadManifest,
  };
  const name = map[`${isTeamsApp.toString()}_${isLocal.toString()}`];
  return {
    name: name,
    title: isTeamsApp
      ? getLocalizedString(
          isLocal
            ? "core.selectLocalTeamsAppManifestQuestion.title"
            : "core.selectTeamsAppManifestQuestion.title"
        )
      : getLocalizedString("core.selectAadAppManifestQuestion.title"),
    type: "singleSelect",
    staticOptions: [],
    skipSingleOption: false,
    placeholder: getLocalizedString("core.confirmManifestQuestion.placeholder"),
    dynamicOptions: (inputs: Inputs) => {
      return [
        {
          id: "manifest",
          label: `$(file) ${path.basename(
            isTeamsApp
              ? inputs[
                  isLocal
                    ? QuestionNames.LocalTeamsAppManifestFilePath
                    : QuestionNames.TeamsAppManifestFilePath
                ]
              : inputs[QuestionNames.AadAppManifestFilePath]
          )}`,
          description: path.dirname(
            isTeamsApp
              ? inputs[
                  isLocal
                    ? QuestionNames.LocalTeamsAppManifestFilePath
                    : QuestionNames.TeamsAppManifestFilePath
                ]
              : inputs[QuestionNames.AadAppManifestFilePath]
          ),
        },
      ];
    },
  };
}

function selectTeamsAppValidationMethodQuestion(): SingleSelectQuestion {
  const options = [
    TeamsAppValidationOptions.schema(),
    TeamsAppValidationOptions.package(),
    TeamsAppValidationOptions.testCases(),
  ];

  return {
    name: QuestionNames.ValidateMethod,
    title: getLocalizedString("core.selectValidateMethodQuestion.validate.selectTitle"),
    staticOptions: options,
    type: "singleSelect",
  };
}

export function copilotPluginAddAPIQuestionNode(): IQTreeNode {
  return {
    data: apiSpecLocationQuestion(false),
    children: [
      {
        data: apiOperationQuestion(false),
      },
    ],
  };
}

function selectTeamsAppPackageQuestion(): SingleFileQuestion {
  return {
    name: QuestionNames.TeamsAppPackageFilePath,
    title: getLocalizedString("core.selectTeamsAppPackageQuestion.title"),
    cliDescription:
      "Specifies the zipped app package path, it's a relative path to project root folder, defaults to '${folder}/appPackage/build/appPackage.${env}.zip'",
    cliName: "app-package-file",
    cliShortName: "p",
    type: "singleFile",
    default: (inputs: Inputs): string | undefined => {
      if (!inputs.projectPath) return undefined;
      const appPackagePath: string = path.join(
        inputs.projectPath,
        AppPackageFolderName,
        BuildFolderName,
        "appPackage.dev.zip"
      );
      if (fs.pathExistsSync(appPackagePath)) {
        return appPackagePath;
      } else {
        return undefined;
      }
    },
  };
}

export function selectTeamsAppPackageQuestionNode(): IQTreeNode {
  return {
    data: selectTeamsAppPackageQuestion(),
  };
}

function selectM365HostQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.M365Host,
    cliShortName: "m",
    cliDescription: "Preview the application in Teams, Outlook or the Microsoft 365 app.",
    title: getLocalizedString("core.M365HostQuestion.title"),
    default: HubOptions.teams().id,
    type: "singleSelect",
    staticOptions: HubOptions.all(),
    placeholder: getLocalizedString("core.M365HostQuestion.placeholder"),
  };
}

export function previewWithTeamsAppManifestQuestionNode(): IQTreeNode {
  return {
    data: { type: "group" },
    children: [
      {
        data: selectM365HostQuestion(),
      },
      selectTeamsAppManifestQuestionNode(),
    ],
  };
}

export function selectTargetEnvQuestion(
  questionName = QuestionNames.TargetEnvName,
  remoteOnly = true,
  throwErrorIfNoEnv = false,
  defaultValueIfNoEnv = environmentNameManager.getDefaultEnvName()
): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: questionName,
    title: getLocalizedString("core.QuestionSelectTargetEnvironment.title"),
    cliName: "env",
    cliDescription: "Specifies the environment name for the project.",
    staticOptions: [],
    dynamicOptions: async (inputs: Inputs) => {
      if (!inputs.projectPath) return [];
      const res = await envUtil.listEnv(inputs.projectPath, remoteOnly);
      if (res.isErr()) {
        if (throwErrorIfNoEnv) throw res.error;
        return [defaultValueIfNoEnv];
      }
      // "testtool" env is a pure local env and doesn't have manifest
      return res.value.filter(
        (env) =>
          env !== environmentNameManager.getTestToolEnvName() &&
          env !== environmentNameManager.getPlaygroundEnvName()
      );
    },
    skipSingleOption: true,
    forgetLastValue: true,
  };
}

async function getDefaultUserEmail() {
  if (!TOOLS?.tokenProvider.m365TokenProvider) return undefined;
  const jsonObjectRes = await TOOLS.tokenProvider.m365TokenProvider.getJsonObject({
    scopes: AppStudioScopes(),
  });
  if (jsonObjectRes.isErr()) {
    throw jsonObjectRes.error;
  }
  const jsonObject = jsonObjectRes.value;
  const currentUserEmail = (jsonObject as any).upn as string;
  let defaultUserEmail = "";
  if (currentUserEmail && currentUserEmail.indexOf("@") > 0) {
    defaultUserEmail = "[UserName]@" + currentUserEmail.split("@")[1];
  }
  return defaultUserEmail;
}

export function inputUserEmailQuestion(
  title: string,
  cliDescription: string,
  useDefaultUser: boolean
): TextInputQuestion {
  return {
    name: QuestionNames.UserEmail,
    type: "text",
    title: title,
    cliDescription: cliDescription,
    default: useDefaultUser ? getDefaultUserEmail : undefined,
    validation: {
      validFunc: async (input: string, previousInputs?: Inputs) => {
        if (!input || input.trim() === "") {
          return getLocalizedString("core.getUserEmailQuestion.validation1");
        }

        input = input.trim();
        if (useDefaultUser) {
          const defaultUserEmail = await getDefaultUserEmail();
          if (input === defaultUserEmail) {
            return getLocalizedString("core.getUserEmailQuestion.validation2");
          }
        }

        const re = /\S+@\S+\.\S+/;
        if (!re.test(input)) {
          return getLocalizedString("core.getUserEmailQuestion.validation3");
        }
        return undefined;
      },
    },
  };
}

export async function isAadMainifestContainsPlaceholder(inputs: Inputs): Promise<boolean> {
  const aadManifestPath = inputs?.[QuestionNames.AadAppManifestFilePath];
  const placeholderRegex = /\$\{\{ *[a-zA-Z0-9_.-]* *\}\}/g;
  const regexObj = new RegExp(placeholderRegex);
  try {
    if (!aadManifestPath || !(await fs.pathExists(aadManifestPath))) {
      return false;
    }
    const manifest = await fs.readFile(aadManifestPath, ConstantString.UTF8Encoding);
    if (regexObj.test(manifest)) {
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

export function selectAadManifestQuestion(): SingleFileQuestion {
  return {
    name: QuestionNames.AadAppManifestFilePath,
    cliName: "entra-app-manifest-file",
    cliShortName: "a",
    cliDescription:
      "Specifies the Microsoft Entra app manifest file path, can be either absolute path or relative path to project root folder.",
    title: getLocalizedString("core.selectAadAppManifestQuestion.title"),
    type: "singleFile",
    default: (inputs: Inputs): string | undefined => {
      if (inputs.platform === Platform.CLI_HELP) {
        return "./aad.manifest.json";
      } else {
        if (!inputs.projectPath) return undefined;
        const manifestPath: string = path.join(inputs.projectPath, "aad.manifest.json");
        if (fs.pathExistsSync(manifestPath)) {
          return manifestPath;
        } else {
          return undefined;
        }
      }
    },
  };
}

export async function newEnvNameValidation(
  input: string,
  inputs?: Inputs
): Promise<string | undefined> {
  const targetEnvName = input;
  const match = targetEnvName.match(environmentNameManager.envNameRegex);
  if (!match) {
    return getLocalizedString("core.getQuestionNewTargetEnvironmentName.validation1");
  }

  if (!environmentNameManager.isRemoteEnvironment(targetEnvName)) {
    return getLocalizedString(
      "core.getQuestionNewTargetEnvironmentName.validation3",
      targetEnvName
    );
  }
  if (!inputs?.projectPath) return "Project path is not defined";
  const envListRes = await envUtil.listEnv(inputs.projectPath, true);
  if (envListRes.isErr()) {
    return getLocalizedString("core.getQuestionNewTargetEnvironmentName.validation4");
  }

  inputs.existingEnvNames = envListRes.value; //cache existing env names

  const found =
    envListRes.value.find(
      (env) => env.localeCompare(targetEnvName, undefined, { sensitivity: "base" }) === 0
    ) !== undefined;
  if (found) {
    return getLocalizedString(
      "core.getQuestionNewTargetEnvironmentName.validation5",
      targetEnvName
    );
  } else {
    return undefined;
  }
}
export function newTargetEnvQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.NewTargetEnvName,
    cliName: "name",
    cliDescription: "Specifies the new environment name.",
    cliType: "argument",
    title: getLocalizedString("core.getQuestionNewTargetEnvironmentName.title"),
    validation: {
      validFunc: newEnvNameValidation,
    },
    placeholder: getLocalizedString("core.getQuestionNewTargetEnvironmentName.placeholder"),
  };
}
// export const lastUsedMark = " (last used)";
// let lastUsedEnv: string | undefined;
// export function reOrderEnvironments(environments: Array<string>): Array<string> {
//   if (!lastUsedEnv) {
//     return environments;
//   }

//   const index = environments.indexOf(lastUsedEnv);
//   if (index === -1) {
//     return environments;
//   }

//   return [lastUsedEnv + lastUsedMark]
//     .concat(environments.slice(0, index))
//     .concat(environments.slice(index + 1));
// }
export function selectSourceEnvQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.SourceEnvName,
    cliName: "env",
    title: getLocalizedString("core.QuestionSelectSourceEnvironment.title"),
    cliDescription: "Specifies an existing environment name to copy from.",
    staticOptions: [],
    dynamicOptions: async (inputs: Inputs) => {
      if (inputs.existingEnvNames) {
        const envList = inputs.existingEnvNames;
        return envList;
      } else if (inputs.projectPath) {
        const envListRes = await envUtil.listEnv(inputs.projectPath, true);
        if (envListRes.isErr()) {
          throw envListRes.error;
        }
        return envListRes.value;
      }
      return [];
    },
    skipSingleOption: true,
    forgetLastValue: true,
  };
}

export function createNewEnvQuestionNode(): IQTreeNode {
  return {
    data: newTargetEnvQuestion(),
    children: [
      {
        data: selectSourceEnvQuestion(),
      },
    ],
  };
}

export function regeneratePluginNode(): IQTreeNode {
  return {
    data: selectExistingPluginManifestQuestion(),
    children: [
      {
        data: selectOpenAPISpecFromPluginQuestion(),
      },
      {
        data: selectApiOperationForRegenerateQuestion(),
      },
    ],
  };
}

// add Plugin to a declarative Copilot project
export function addPluginQuestionNode(): IQTreeNode {
  return {
    data: apiPluginStartQuestion(true),
    children: [
      {
        ...inputOrSearchAPISpecNode(),
        condition: (inputs: Inputs) => {
          return (
            featureFlagManager.getBooleanValue(FeatureFlags.KiotaNPMIntegration) &&
            inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id
          );
        },
      },
      {
        data: apiSpecLocationQuestion(),
        condition: (inputs: Inputs) => {
          return (
            !featureFlagManager.getBooleanValue(FeatureFlags.KiotaNPMIntegration) &&
            inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id
          );
        },
      },
      {
        data: apiOperationQuestion(true, true),
        condition: (inputs: Inputs) => {
          return (
            !featureFlagManager.getBooleanValue(FeatureFlags.KiotaNPMIntegration) &&
            inputs[QuestionNames.ActionType] === ActionStartOptions.apiSpec().id
          );
        },
      },
      // MCP server URL input (when action type is "mcp").
      // Mirrors the "create DA with MCP" subtree under TEAMSFX_MCP_FOR_DA_DT:
      // CLI always collects auth-type + credential follow-ups; VS Code does the
      // same only when DT is on (inline flow). DT-off VS Code falls through to
      // the legacy `addPluginFromMCP` redirect (just writes `.vscode/mcp.json`)
      // and lets `updateActionWithMCP` collect auth via CodeLens later.
      {
        condition: (inputs: Inputs) => {
          return inputs[QuestionNames.ActionType] === ActionStartOptions.mcp().id;
        },
        data: {
          name: QuestionNames.MCPForDAServerUrl,
          title: getLocalizedString("core.createProjectQuestion.mcpForDa.ServerUrl.title"),
          type: "text",
          placeholder: getLocalizedString(
            "core.createProjectQuestion.mcpForDa.ServerUrl.placeholder"
          ),
          // Same rejection rule as the create flow — a URL that is not an MCP endpoint is
          // no more usable when added to an existing project than when creating a new one.
          additionalValidationOnAccept: {
            validFunc: async (value: string): Promise<string | undefined> => {
              if (!value) return undefined;
              return await validateMCPServerUrl(value);
            },
          },
        },
        children: [
          // MCP tools file input (CLI only — VS Code DT-on uses dynamic discovery)
          {
            condition: (inputs: Inputs) => inputs.platform === Platform.CLI,
            data: {
              name: QuestionNames.MCPToolsFilePath,
              title: getLocalizedString("core.MCPForDA.toolsFilePath.title"),
              type: "text",
              placeholder: getLocalizedString("core.MCPForDA.toolsFilePath.placeholder"),
            },
          },
          // Auth type selection: CLI always; VS Code only when DT is on.
          // Credential follow-ups (client id/secret/scopes) are only added under
          // DT-on, because the legacy CLI branch in `core.addPlugin` does not
          // consume them (`persistMCPAuthCredentialEnvVars` is only called from
          // the DT-on branch). Keeping them off under DT preserves the original
          // CLI DT-off prompt set.
          {
            condition: (inputs: Inputs) =>
              inputs.platform !== Platform.VSCode ||
              featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT),
            data: {
              type: "singleSelect",
              name: QuestionNames.MCPForDAAuthType,
              title: getLocalizedString("core.createProjectQuestion.mcpForDa.AuthType.title"),
              staticOptions: MCPForDAAddAuthTypeStaticOptions(),
              default: "oauth",
            },
            children: mcpForDAAddAuthCredentialNodes(),
          },
        ],
      },
      {
        data: selectTeamsAppManifestQuestion(),
        condition: (inputs: Inputs) => {
          // Manifest path is not asked for any MCP "add action" flow on VS Code:
          // - Legacy (DT off) defers the manifest edit to the "Fetch Action" command.
          // - Inline (DT on) infers the manifest path from `projectPath/appPackage/manifest.json`
          //   in `core.addPlugin`, matching the leaner `core.updateActionWithMCP` UX
          //   (no manifest picker, no confirmation modal).
          // CLI still asks/requires it via `--manifest-file`.
          return (
            inputs[QuestionNames.ActionType] !== ActionStartOptions.mcp().id ||
            inputs.platform === Platform.CLI
          );
        },
      },
    ],
  };
}

// add Knowledge to a declarative Copilot project
export function addKnowledgeQuestionNode(): IQTreeNode {
  return {
    data: addKnowledgeStartQuestion(true),
    children: [
      // Web Content
      {
        data: searchTypeQuestion(),
        condition: (inputs: Inputs) => {
          return inputs[QuestionNames.KnowledgeSource] === KnowledgeSourceOptions.webSearch().id;
        },
        children: [
          {
            data: webContentQuestion(),
            condition: (inputs: Inputs) => {
              return inputs[QuestionNames.SearchType] === KnowledgeSearchTypeOptions.url().id;
            },
          },
          {
            data: selectTeamsAppManifestQuestion(),
          },
        ],
      },
      // OneDrive SharePoint
      {
        data: searchTypeQuestion(),
        condition: (inputs: Inputs) => {
          return (
            inputs[QuestionNames.KnowledgeSource] === KnowledgeSourceOptions.oneDriveSharePoint().id
          );
        },
        children: [
          {
            data: oneDriveSharePointItemQuestion(),
            condition: (inputs: Inputs) => {
              return inputs[QuestionNames.SearchType] === KnowledgeSearchTypeOptions.url().id;
            },
          },
          {
            data: oneDriveSharePointItemConfirmQuestion(),
            condition: (inputs: Inputs) => {
              return inputs[QuestionNames.SearchType] === KnowledgeSearchTypeOptions.url().id;
            },
          },
          {
            data: selectTeamsAppManifestQuestion(),
          },
        ],
      },
      // Copilot connector
      {
        data: GCItemQuestion(),
        condition: {
          equals: KnowledgeSourceOptions.graphConnector().id,
        },
        children: [
          {
            data: GCListQuestion(),
            condition: {
              equals: GCSelectOptions.list().id,
            },
          },
          {
            data: GCInputQuestion(),
            condition: {
              equals: GCSelectOptions.input().id,
            },
          },
          {
            data: selectTeamsAppManifestQuestion(),
          },
        ],
      },
      // Embedded Knowledge
      {
        data: selectTeamsAppManifestQuestion(),
        condition: (inputs: Inputs) => {
          return (
            inputs[QuestionNames.KnowledgeSource] === KnowledgeSourceOptions.embeddedKnowledge().id
          );
        },
        children: [
          {
            data: addEmbeddedKnowledgeFilesQuestion(),
          },
        ],
      },
    ],
  };
}

export function addEmbeddedKnowledgeFilesQuestion(): MultiFileQuestion {
  return {
    name: QuestionNames.EmbeddedKnowledgeFiles,
    title: getLocalizedString("core.addEmbeddedKnowledgeFilesQuestion.title"),
    type: "multiFile",
    cliDescription: "Select your embedded knowledge files.",
    placeholder: getLocalizedString("core.addEmbeddedKnowledgeFilesQuestion.placeholder"),
  };
}

export function kiotaRegenerateQuestion(): IQTreeNode {
  return {
    data: selectTeamsAppManifestQuestion(),
  };
}

export function addAuthActionQuestion(): IQTreeNode {
  return {
    data: pluginManifestQuestion(),
    children: [
      {
        data: apiSpecFromPluginManifestQuestion(),
        condition: async (inputs: Inputs) => {
          const pluginManifestPath = inputs[QuestionNames.PluginManifestFilePath];
          if (!!!pluginManifestPath) {
            return false;
          }
          const pluginManifest = (await fs.readJson(
            pluginManifestPath as string
          )) as PluginManifestSchema;
          const specs = pluginManifest
            .runtimes!.filter((runtime) => runtime.type === "OpenApi")
            .map((runtime) => runtime.spec.url);
          const spesDedup = [...new Set(specs)];
          if (spesDedup.length === 1) {
            inputs[QuestionNames.ApiSpecLocation] = spesDedup[0];
            return false;
          }
          return true;
        },
      },
      {
        data: apiFromPluginManifestQuestion(),
        condition: async (inputs: Inputs) => {
          const pluginManifestPath = inputs[QuestionNames.PluginManifestFilePath];
          const apiSpecPath = inputs[QuestionNames.ApiSpecLocation];
          if (!!!pluginManifestPath || !!!apiSpecPath) {
            return false;
          }
          if (inputs[QuestionNames.ApiOperation] !== undefined) {
            return false;
          }
          const pluginManifest = (await fs.readJson(
            pluginManifestPath as string
          )) as PluginManifestSchema;
          const apis: string[] = [];
          pluginManifest
            .runtimes!.filter(
              (runtime) => runtime.type === "OpenApi" && runtime.spec.url === apiSpecPath
            )
            .forEach((runtime) => {
              apis.push(...(runtime.run_for_functions as string[]));
            });
          const apisDedup = [...new Set(apis)];
          if (apisDedup.length === 1) {
            inputs[QuestionNames.ApiOperation] = apisDedup;
            return false;
          }
          return true;
        },
      },
      {
        data: authNameQuestion(),
      },
      {
        data: addAuthActionAuthTypeQuestion(),
      },
      oauthParametersQuestion(),
      apiKeyParameterQuestion(),
      microsoftEntraParameterQuestion(),
    ],
  };
}

export function urlValidation(input: string, allowEmpty = false): string | undefined {
  if (input.trim() === "") {
    return allowEmpty ? undefined : getLocalizedString("core.addAuthAction.validation.url");
  }

  try {
    new URL(input);
  } catch (error) {
    return getLocalizedString("core.addAuthAction.validation.url");
  }

  return undefined;
}

export function addAuthActionAuthTypeQuestion(): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.ApiAuth,
    title: getLocalizedString("template.createProjectQuestion.apiMessageExtensionAuth.title"),
    placeholder: getLocalizedString(
      "template.createProjectQuestion.apiMessageExtensionAuth.placeholder"
    ),
    cliDescription: "The authentication type for the API.",
    staticOptions: AddAuthActionAuthTypeOptions.all(),
    default: AddAuthActionAuthTypeOptions.bearerToken().id,
  };
}

export function oauthParametersQuestion(): IQTreeNode {
  return {
    data: oauthAuthorizationUrlQuestion(),
    condition: (inputs: Inputs) => {
      return inputs[QuestionNames.ApiAuth] === AddAuthActionAuthTypeOptions.oauth().id;
    },
    children: [
      {
        data: oauthTokenUrlQuestion(),
      },
      {
        data: oauthRefreshUrlQuestion(),
      },
      {
        data: oauthScopeQuestion(),
      },
      {
        data: oauthPKCEQuestion(),
      },
    ],
  };
}

export function oauthAuthorizationUrlQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.OAuthAuthorizationUrl,
    title: getLocalizedString("core.addAuthActionQuestion.OAuthAuthorizationUrl.title"),
    type: "text",
    cliDescription: "Authorization Url for oauth.",
    validation: {
      validFunc: (input) => urlValidation(input, false),
    },
  };
}

export function oauthTokenUrlQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.OAuthTokenUrl,
    title: getLocalizedString("core.addAuthActionQuestion.OAuthTokenUrl.title"),
    type: "text",
    cliDescription: "Token Url for oauth.",
    validation: {
      validFunc: (input) => urlValidation(input, false),
    },
  };
}

export function oauthRefreshUrlQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.OAuthRefreshUrl,
    title: getLocalizedString("core.addAuthActionQuestion.OAuthRefreshUrl.title"),
    type: "text",
    cliDescription: "Refresh Url for oauth. Leave it emplt if not needed.",
    validation: {
      validFunc: (input) => urlValidation(input, true),
    },
  };
}

export function oauthScopeQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.OAuthScope,
    title: getLocalizedString("core.addAuthActionQuestion.OAuthScope.title"),
    type: "text",
    cliDescription: "Scope for oauth.",
    validation: {
      validFunc: (input: string): string | undefined => {
        const regExp =
          /([-a-zA-Z1-9./:_]+:\s*[-a-zA-Z1-9./:_]+)(\s*;\s*[-a-zA-Z1-9./:_]+:\s*[-a-zA-Z1-9./:_]+)*/g;
        if (!regExp.test(input)) {
          return getLocalizedString("core.oauthScopeQuestion.validation.scope");
        }
        return undefined;
      },
    },
  };
}

export function oauthPKCEQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.OauthPKCE,
    title: getLocalizedString("core.addAuthActionQuestion.OauthPKCE.title"),
    type: "singleSelect",
    staticOptions: [
      {
        id: "true",
        label: getLocalizedString("core.addAuthActionQuestion.OauthPKCE.true"),
      },
      {
        id: "false",
        label: getLocalizedString("core.addAuthActionQuestion.OauthPKCE.false"),
      },
    ],
    default: "false",
  };
}

export function apiKeyParameterQuestion(): IQTreeNode {
  return {
    data: apiKeyInQuestion(),
    condition: (inputs: Inputs) => {
      return inputs[QuestionNames.ApiAuth] === AddAuthActionAuthTypeOptions.apiKey().id;
    },
    children: [
      {
        data: apiKeyNameQuestion(),
      },
    ],
  };
}

export function apiKeyInQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.ApiKeyIn,
    title: getLocalizedString("core.addAuthActionQuestion.ApiKeyIn.title"),
    type: "singleSelect",
    staticOptions: [
      {
        id: "header",
        label: getLocalizedString("core.addAuthActionQuestion.ApiKeyIn.header"),
      },
      {
        id: "query",
        label: getLocalizedString("core.addAuthActionQuestion.ApiKeyIn.query"),
      },
    ],
    default: "header",
  };
}

export function apiKeyNameQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.ApiKeyName,
    title: getLocalizedString("core.addAuthActionQuestion.ApiKeyName.title"),
    type: "text",
    cliDescription: "Name of the API key.",
  };
}

export function microsoftEntraParameterQuestion(): IQTreeNode {
  return {
    data: oauthScopeQuestion(),
    condition: (inputs: Inputs) => {
      return inputs[QuestionNames.ApiAuth] === AddAuthActionAuthTypeOptions.microsoftEntra().id;
    },
  };
}

export function apiSpecFromPluginManifestQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.ApiSpecLocation,
    title: getLocalizedString("core.addAuthActionQuestion.ApiSpecLocation.title"),
    placeholder: getLocalizedString("core.addAuthActionQuestion.ApiSpecLocation.placeholder"),
    type: "singleSelect",
    staticOptions: [],
    cliDescription: "OpenAPI specification to add Auth configuration.",
    dynamicOptions: async (inputs: Inputs) => {
      const pluginManifestPath = inputs[QuestionNames.PluginManifestFilePath];
      const pluginManifest = (await fs.readJson(pluginManifestPath)) as PluginManifestSchema;
      const specs = pluginManifest
        .runtimes!.filter((runtime) => runtime.type === "OpenApi")
        .map((runtime) => runtime.spec.url);
      return [...new Set(specs)];
    },
  };
}

export function apiFromPluginManifestQuestion(): MultiSelectQuestion {
  return {
    name: QuestionNames.ApiOperation,
    title: getLocalizedString("core.addAuthActionQuestion.ApiOperation.title"),
    type: "multiSelect",
    staticOptions: [],
    placeholder: getLocalizedString("core.addAuthActionQuestion.ApiOperation.placeholder"),
    cliDescription: "API to add Auth configuration.",
    dynamicOptions: async (inputs: Inputs) => {
      const pluginManifestPath = inputs[QuestionNames.PluginManifestFilePath];
      const apiSpecPath = inputs[QuestionNames.ApiSpecLocation];
      const pluginManifest = (await fs.readJson(pluginManifestPath)) as PluginManifestSchema;
      const apis: string[] = [];
      pluginManifest
        .runtimes!.filter(
          (runtime) => runtime.type === "OpenApi" && runtime.spec.url === apiSpecPath
        )
        .forEach((runtime) => {
          apis.push(...(runtime.run_for_functions as string[]));
        });
      return [...new Set(apis)];
    },
  };
}

export function authNameQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.AuthName,
    title: getLocalizedString("core.addAuthActionQuestion.authName.title"),
    type: "text",
    cliDescription: "Name of Auth Configuration.",
    validation: {
      validFunc: (input: string): string | undefined => {
        if (!input || input.trim() === "") {
          return getLocalizedString("core.authNameQuestion.validation.empty");
        }

        return undefined;
      },
    },
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }
        inputs[QuestionNames.ActionType] = ActionStartOptions.newApi().id;
        return;
      },
    },
  };
}

export function apiSpecApiKeyConfirmQestion(): ConfirmQuestion {
  return {
    name: QuestionNames.ApiSpecApiKeyConfirm,
    title: getLocalizedString("core.createProjectQuestion.ApiKeyConfirm"),
    type: "confirm",
    default: true,
  };
}

export function apiSpecApiKeyQuestion(): IQTreeNode {
  return {
    data: {
      type: "text",
      name: QuestionNames.ApiSpecApiKey,
      cliShortName: "k",
      password: true,
      title: getLocalizedString("core.createProjectQuestion.ApiKey"),
      cliDescription: "Api key for OpenAPI spec.",
      forgetLastValue: true,
      validation: {
        validFunc: (input: string): string | undefined => {
          if (input.length < 10 || input.length > 512) {
            return getLocalizedString("core.createProjectQuestion.invalidApiKey.message");
          }

          return undefined;
        },
      },
      additionalValidationOnAccept: {
        validFunc: (input: string, inputs?: Inputs): string | undefined => {
          if (!inputs) {
            throw new Error("inputs is undefined"); // should never happen
          }

          process.env[QuestionNames.ApiSpecApiKey] = input;
          return;
        },
      },
    },
    condition: (inputs: Inputs) => {
      return (
        inputs.outputEnvVarNames &&
        !process.env[inputs.outputEnvVarNames.get("registrationId")] &&
        !inputs.primaryClientSecret &&
        !inputs.secondaryClientSecret
      );
    },
    children: [
      {
        data: apiSpecApiKeyConfirmQestion(),
      },
    ],
  };
}

export function oauthQuestion(): IQTreeNode {
  return {
    data: { type: "group" },
    condition: (inputs: Inputs) => {
      return (
        inputs.outputEnvVarNames && !process.env[inputs.outputEnvVarNames.get("configurationId")]
      );
    },
    children: [
      {
        data: oauthClientIdQuestion(),
        condition: (inputs: Inputs) => {
          return !inputs.clientId && inputs.identityProvider !== "MicrosoftEntra";
        },
      },
      {
        data: entraClientIdQuestion(),
        condition: (inputs: Inputs) => {
          return !inputs.clientId && inputs.identityProvider === "MicrosoftEntra";
        },
      },
      {
        data: oauthClientSecretQuestion(),
        condition: (inputs: Inputs) => {
          return (
            !inputs.isPKCEEnabled &&
            !inputs.clientSecret &&
            (!inputs.identityProvider || inputs.identityProvider === "Custom")
          );
        },
      },
      {
        data: oauthScopeCustomQuestion(),
        condition: (inputs: Inputs) => {
          return inputs.identityProvider === "Custom" && !inputs.scope;
        },
      },
      {
        data: oauthConfirmQestion(),
        condition: (inputs: Inputs) => {
          return (
            !inputs.isPKCEEnabled &&
            (!inputs.clientSecret || !inputs.clientId) &&
            (!inputs.identityProvider || inputs.identityProvider === "Custom")
          );
        },
      },
    ],
  };
}

export function uninstallQuestionNode(): IQTreeNode {
  return {
    data: {
      type: "group",
    },
    children: [
      {
        data: uninstallModeQuestion(),
        condition: () => {
          return true;
        },
        children: [
          {
            data: {
              type: "text",
              name: QuestionNames.ManifestId,
              title: getLocalizedString("core.uninstallQuestion.manifestId"),
            },
            condition: (input: UninstallInputs) => {
              return input[QuestionNames.UninstallMode] === QuestionNames.UninstallModeManifestId;
            },
          },
          {
            data: {
              type: "text",
              name: QuestionNames.Env,
              title: getLocalizedString("core.uninstallQuestion.env"),
            },
            condition: (input: UninstallInputs) => {
              return input[QuestionNames.UninstallMode] === QuestionNames.UninstallModeEnv;
            },
            children: [
              {
                data: uninstallProjectPathQuestion(),
                condition: () => {
                  return true;
                },
              },
            ],
          },
          {
            data: uninstallOptionQuestion(),
            condition: (input: UninstallInputs) => {
              return (
                input[QuestionNames.UninstallMode] === QuestionNames.UninstallModeManifestId ||
                input[QuestionNames.UninstallMode] === QuestionNames.UninstallModeEnv
              );
            },
          },
          {
            data: {
              type: "text",
              name: QuestionNames.TitleId,
              title: getLocalizedString("core.uninstallQuestion.titleId"),
            },
            condition: (input: UninstallInputs) => {
              return input[QuestionNames.UninstallMode] === QuestionNames.UninstallModeTitleId;
            },
          },
        ],
      },
    ],
  };
}

function uninstallModeQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.UninstallMode,
    title: getLocalizedString("core.uninstallQuestion.chooseMode"),
    type: "singleSelect",
    staticOptions: [
      {
        id: QuestionNames.UninstallModeManifestId,
        label: getLocalizedString("core.uninstallQuestion.manifestIdMode"),
        detail: getLocalizedString("core.uninstallQuestion.manifestIdMode.detail"),
      },
      {
        id: QuestionNames.UninstallModeEnv,
        label: getLocalizedString("core.uninstallQuestion.envMode"),
        detail: getLocalizedString("core.uninstallQuestion.envMode.detail"),
      },
      {
        id: QuestionNames.UninstallModeTitleId,
        label: getLocalizedString("core.uninstallQuestion.titleIdMode"),
        detail: getLocalizedString("core.uninstallQuestion.titleIdMode.detail"),
      },
    ],
    default: QuestionNames.UninstallModeManifestId,
  };
}

function uninstallOptionQuestion(): MultiSelectQuestion {
  return {
    name: QuestionNames.UninstallOptions,
    title: getLocalizedString("core.uninstallQuestion.chooseOption"),
    type: "multiSelect",
    staticOptions: [
      {
        id: QuestionNames.UninstallOptionM365,
        label: getLocalizedString("core.uninstallQuestion.m365Option"),
      },
      {
        id: QuestionNames.UninstallOptionTDP,
        label: getLocalizedString("core.uninstallQuestion.tdpOption"),
      },
      {
        id: QuestionNames.UninstallOptionBot,
        label: getLocalizedString("core.uninstallQuestion.botOption"),
      },
    ],
  };
}
function uninstallProjectPathQuestion(): FolderQuestion {
  return {
    type: "folder",
    name: QuestionNames.ProjectPath,
    title: getLocalizedString("core.uninstallQuestion.projectPath"),
    cliDescription: "Project Path for uninstall",
    placeholder: "./",
    default: "./",
  };
}

function entraClientIdQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.OauthClientId,
    cliShortName: "i",
    title: getLocalizedString("core.createProjectQuestion.EntraSSOClientId"),
    placeholder: getLocalizedString("core.createProjectQuestion.EntraSSOClientId.placeholder"),
    cliDescription: "Microsoft Entra SSO client id for OpenAPI spec.",
    forgetLastValue: true,
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }

        process.env[QuestionNames.OauthClientId] = input;
        return;
      },
    },
  };
}

function oauthClientIdQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.OauthClientId,
    cliShortName: "i",
    title: getLocalizedString("core.createProjectQuestion.OauthClientId"),
    placeholder: getLocalizedString("core.createProjectQuestion.OauthClientId.placeholder"),
    cliDescription: "Oauth client id for OpenAPI spec.",
    forgetLastValue: true,
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }

        process.env[QuestionNames.OauthClientId] = input;
        return;
      },
    },
  };
}

function oauthConfirmQestion(): ConfirmQuestion {
  return {
    name: QuestionNames.OauthConfirm,
    title: getLocalizedString("core.createProjectQuestion.OauthClientSecretConfirm"),
    type: "confirm",
    default: true,
  };
}

function oauthClientSecretQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.OauthClientSecret,
    cliShortName: "c",
    password: true,
    title: getLocalizedString("core.createProjectQuestion.OauthClientSecret"),
    placeholder: getLocalizedString("core.createProjectQuestion.OauthClientSecret.placeholder"),
    cliDescription: "Oauth client secret for OpenAPI spec.",
    forgetLastValue: true,
    validation: {
      validFunc: (input: string): string | undefined => {
        if (input.length < 10 || input.length > 512) {
          return getLocalizedString("core.createProjectQuestion.invalidApiKey.message");
        }

        return undefined;
      },
    },
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }

        process.env[QuestionNames.OauthClientSecret] = input;
        return;
      },
    },
  };
}

export function oauthScopeCustomQuestion(): TextInputQuestion {
  return {
    name: QuestionNames.OAuthScope,
    title: getLocalizedString("core.createProjectQuestion.OauthScope"),
    placeholder: getLocalizedString("core.createProjectQuestion.OauthScope.placeholder"),
    type: "text",
    cliDescription: "Scope for oauth.",
    validation: {
      validFunc: (input: string): string | undefined => {
        const regExp =
          /^$|^[a-zA-Z0-9._/-]+(:[a-zA-Z0-9._/-]+)?(\s*,\s*[a-zA-Z0-9._/-]+(:[a-zA-Z0-9._/-]+)?)*$/g;
        if (!regExp.test(input)) {
          return getLocalizedString("core.createProjectQuestion.OauthScope.validation");
        }
        return undefined;
      },
    },
    additionalValidationOnAccept: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        if (!inputs) {
          throw new Error("inputs is undefined"); // should never happen
        }

        process.env[QuestionNames.OAuthScope] = input;
        return;
      },
    },
  };
}

export function syncManifestQuestionNode(): IQTreeNode {
  return {
    data: {
      type: "group",
    },
    children: [
      {
        data: {
          type: "folder",
          name: QuestionNames.ProjectPath,
          title: getLocalizedString("core.syncManifest.projectPath"),
          cliDescription: "Project Path",
          placeholder: "./",
          default: (inputs: Inputs) =>
            CLIPlatforms.includes(inputs.platform)
              ? "./"
              : path.join(os.homedir(), ConstantString.RootFolder),
        },
      },
      {
        data: {
          type: "text",
          name: QuestionNames.Env,
          title: getLocalizedString("core.syncManifest.env"),
          cliDescription: "Target Microsoft 365 Agents Toolkit Environment",
        },
      },
      {
        data: {
          type: "text",
          name: QuestionNames.TeamsAppId,
          title: getLocalizedString("core.syncManifest.teamsAppId"),
          cliDescription: "App ID (optional)",
        },
      },
    ],
  };
}

export function setSensitivityLabelNode(): IQTreeNode {
  return {
    data: {
      type: "group",
    },
    children: [
      {
        data: selectDeclarativeAgentManifestQuestion(),
      },
      {
        data: SelectSensitivityLabelQuestion(),
      },
    ],
  };
}

export function selectDeclarativeAgentManifestQuestion(): SingleFileQuestion {
  return {
    name: QuestionNames.DeclarativeAgentManifestPath,
    cliName: "declarative-agent-manifest-file",
    cliShortName: "d",
    cliDescription:
      "Specify the path for the Declarative Agent manifest. It can be either absolute path or relative path to the project root folder, with default at './appPackage/declarativeAgent.json'",
    title: getLocalizedString("core.selectDeclarativeAgentManifestQuestion.title"),
    type: "singleFile",
    default: async (inputs: Inputs): Promise<string | undefined> => {
      if (inputs.platform === Platform.CLI_HELP) {
        return "./appPackage/declarativeAgent.json";
      } else {
        if (!inputs.projectPath) {
          return Promise.resolve(undefined);
        }
        const manifestPath = path.join(inputs.projectPath, AppPackageFolderName, "manifest.json");
        if (!fs.pathExistsSync(manifestPath)) {
          return Promise.resolve(undefined);
        }
        const manifestRes = await manifestUtils._readAppManifest(manifestPath);
        if (manifestRes.isErr()) {
          return Promise.resolve(undefined);
        }
        const manifest = manifestRes.value;
        const declarativeAgentPath = manifest?.copilotAgents?.declarativeAgents?.[0]?.file;
        if (!declarativeAgentPath) {
          return Promise.resolve(undefined);
        }
        const declarativeAgentAbsolutePath = path.join(
          inputs.projectPath,
          AppPackageFolderName,
          declarativeAgentPath
        );
        if (!fs.pathExistsSync(declarativeAgentAbsolutePath)) {
          return Promise.resolve(undefined);
        }
        return declarativeAgentAbsolutePath;
      }
    },
  };
}

// add Skill to a declarative agent project
export function addSkillQuestionNode(): IQTreeNode {
  return {
    data: { type: "group" },
    children: [
      {
        data: skillSourceTypeQuestion(),
        condition: (inputs: Inputs) =>
          !inputs[QuestionNames.SkillFrom] && inputs.platform !== Platform.CLI,
      },
      {
        data: skillFromZipFileQuestion(),
        condition: (inputs: Inputs) =>
          !inputs[QuestionNames.SkillFrom] && inputs[QuestionNames.SkillSourceType] === "existing",
      },
      {
        data: skillNameQuestion(),
        condition: (inputs: Inputs) =>
          !inputs[QuestionNames.SkillFrom] && inputs[QuestionNames.SkillSourceType] !== "existing",
      },
      {
        data: skillDescriptionQuestion(),
        condition: (inputs: Inputs) =>
          !inputs[QuestionNames.SkillFrom] && inputs[QuestionNames.SkillSourceType] !== "existing",
      },
      {
        data: exposeToCopilotQuestion(),
      },
      {
        data: selectTeamsAppManifestQuestion(),
      },
    ],
  };
}

function skillNameQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.SkillName,
    title: getLocalizedString("core.addSkillQuestion.name.title"),
    placeholder: getLocalizedString("core.addSkillQuestion.name.placeholder"),
    validation: {
      validFunc: (input: string, inputs?: Inputs): string | undefined => {
        const pattern = /^[a-zA-Z][a-zA-Z0-9-]*$/;
        if (!pattern.test(input)) {
          return getLocalizedString("core.addSkillQuestion.name.validation");
        }
        // Check for duplicate skill name
        if (inputs?.projectPath) {
          const manifestPath =
            inputs[QuestionNames.ManifestPath] ||
            path.join(inputs.projectPath, AppPackageFolderName, "manifest.json");
          const appPackageFolder = path.dirname(manifestPath);
          const skillDir = path.join(appPackageFolder, "skills", input);
          if (fs.pathExistsSync(skillDir)) {
            return getLocalizedString("core.addSkillQuestion.name.duplicate", input);
          }
        }
        return undefined;
      },
    },
  };
}

function skillDescriptionQuestion(): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.SkillDescription,
    title: getLocalizedString("core.addSkillQuestion.description.title"),
    placeholder: getLocalizedString("core.addSkillQuestion.description.placeholder"),
  };
}

function skillSourceTypeQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.SkillSourceType,
    title: getLocalizedString("core.addSkillQuestion.sourceType.title"),
    type: "singleSelect",
    staticOptions: [
      {
        id: "new",
        label: getLocalizedString("core.addSkillQuestion.sourceType.new"),
        detail: getLocalizedString("core.addSkillQuestion.sourceType.newDetail"),
      },
      {
        id: "existing",
        label: getLocalizedString("core.addSkillQuestion.sourceType.existing"),
        detail: getLocalizedString("core.addSkillQuestion.sourceType.existingDetail"),
      },
    ],
    default: "new",
  };
}

function skillFromZipFileQuestion(): SingleFileQuestion {
  return {
    name: QuestionNames.SkillFromZipFile,
    title: getLocalizedString("core.addSkillQuestion.zipFile.title"),
    placeholder: getLocalizedString("core.addSkillQuestion.zipFile.placeholder"),
    type: "singleFile",
    filters: {
      "Zip files": ["zip"],
    },
  };
}

function exposeToCopilotQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.ExposeToCopilot,
    cliName: "expose-to-copilot",
    title: getLocalizedString("core.addSkillQuestion.exposeToCopilot.title"),
    type: "singleSelect",
    staticOptions: [
      {
        id: "yes",
        label: getLocalizedString("core.addSkillQuestion.exposeToCopilot.yes"),
        detail: getLocalizedString("core.addSkillQuestion.exposeToCopilot.yesDetail"),
      },
      {
        id: "no",
        label: getLocalizedString("core.addSkillQuestion.exposeToCopilot.no"),
        detail: getLocalizedString("core.addSkillQuestion.exposeToCopilot.noDetail"),
      },
    ],
    default: "no",
  };
}

export function SelectSensitivityLabelQuestion(): SingleSelectQuestion {
  return {
    name: QuestionNames.SensitivityLabel,
    cliName: "sensitivity-label",
    cliShortName: "s",
    cliDescription: "Specify the sensitivity label to be set.",
    title: getLocalizedString("core.selectSensitivityLabelQuestion.title"),
    type: "singleSelect",
    // Different tenant may have different sensitivity labels, so the options are always dynamic
    staticOptions: [],
    dynamicOptions: async (inputs: Inputs) => {
      const tokenRes = await TOOLS.tokenProvider.m365TokenProvider.getAccessToken({
        scopes: [ListSensitivityLabelScope],
      });
      if (tokenRes.isErr()) {
        throw tokenRes.error;
      }
      const graphClient = new GraphClient(TOOLS.tokenProvider.m365TokenProvider);
      const res = await graphClient.listSensitivityLabels(tokenRes.value);
      if (res.isErr()) {
        throw res.error;
      }
      const options = [];
      for (const label of res.value) {
        options.push({
          id: label.id ?? "",
          label: label.displayName ?? "",
          description: label.description ?? "",
        });
      }
      return options;
    },
    skipValidation: true,
  };
}
