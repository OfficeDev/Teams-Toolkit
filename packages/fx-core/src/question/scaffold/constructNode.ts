// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IQTreeNode, OptionItem, Platform, SingleSelectQuestion } from "@microsoft/teamsfx-api";
import { FeatureFlag, FeatureFlags, featureFlagManager } from "../../common/featureFlags";
import { getLocalizedString } from "../../common/localizeUtils";
import {
  apiSpecNode,
  apiSpecWithSearchNode,
  azureOpenAINode,
  foundryNode,
  llmServiceNode,
} from "./commonNodes";
import { setTemplateName, setTemplateNameAndGC } from "./vsc/CapabilityOptions";
import { GCConnectionIdQuestion, GCNameQuestion } from "../create";
import { QuestionNames } from "../questionNames";

function isFeatureEnabled(flagName: string): boolean {
  const flag = (Object.values(FeatureFlags) as FeatureFlag[]).find((f) => f.name === flagName) ?? {
    name: flagName,
    defaultValue: "false",
  };
  return featureFlagManager.getBooleanValue(flag);
}

export function constructNode(
  jsonContent: string,
  platform: Platform = Platform.VSCode
): IQTreeNode {
  const jsonObject = JSON.parse(jsonContent);

  // Handle named node references (TypeScript-defined sub-trees)
  if (jsonObject.node) {
    return resolveNodeReference(jsonObject, platform);
  }

  // Handle "group" type (no options)
  if (jsonObject.data.type === "group") {
    const node: IQTreeNode = {
      data: { type: "group", name: jsonObject.data.name },
    };
    if (jsonObject.condition) node.condition = jsonObject.condition;
    if (jsonObject.children) {
      node.children = [];
      for (const child of jsonObject.children) {
        node.children.push(constructNode(JSON.stringify(child), platform));
      }
    }
    return node;
  }

  const data: SingleSelectQuestion = {
    type: "singleSelect",
    name: jsonObject.data.name,
    title: jsonObject.data.title ? getLocalizedString(jsonObject.data.title) : "",
    placeholder: jsonObject.data.placeholder
      ? getLocalizedString(jsonObject.data.placeholder)
      : undefined,
    skipSingleOption: jsonObject.data.skipSingleOption,
    forgetLastValue: jsonObject.data.forgetLastValue,
    staticOptions: [],
    onDidSelection:
      jsonObject.data.name === QuestionNames.WithPlugin ? setTemplateNameAndGC : setTemplateName,
  };

  if (jsonObject.data.options) {
    for (const option of jsonObject.data.options) {
      if (option.featureFlag && !isFeatureEnabled(option.featureFlag)) {
        continue;
      }
      const optionItem: OptionItem = {
        id: option.id as string,
        label:
          option.icon && platform === Platform.VSCode
            ? `${String(option.icon)} ${getLocalizedString(option.label as string)}`
            : getLocalizedString(option.label as string),
        detail: option.detail ? getLocalizedString(option.detail as string) : undefined,
        data: option.data as string,
      };
      if (option.groupName) {
        optionItem.groupName = getLocalizedString(option.groupName);
      }
      (data.staticOptions as OptionItem[]).push(optionItem);
    }
  }

  const node: IQTreeNode = { data };
  if (jsonObject.condition) {
    node.condition = jsonObject.condition;
  }
  if (jsonObject.children) {
    node.children = [];
    for (const child of jsonObject.children) {
      node.children.push(constructNode(JSON.stringify(child), platform));
    }
  }
  return node;
}

function resolveNodeReference(
  jsonObject: { node: string; condition?: Record<string, unknown> | undefined },
  platform: Platform
): IQTreeNode {
  let node: IQTreeNode;

  switch (jsonObject.node) {
    // Common shared nodes (from commonNodes.ts)
    case "llmServiceNode":
      return llmServiceNode(jsonObject.condition as any);
    case "apiSpecNode":
      return apiSpecNode(jsonObject.condition as any);
    case "apiSpecWithSearchNode": {
      const n = apiSpecWithSearchNode();
      if (jsonObject.condition) n.condition = jsonObject.condition;
      return n;
    }
    case "azureOpenAINode":
      return azureOpenAINode(jsonObject.condition as any);
    case "foundryNode":
      return foundryNode(jsonObject.condition as any);

    // TypeScript-defined complex nodes (lazy import to avoid circular dependency)
    case "mcpServerTypeNode": {
      const { MCPServerTypeNode } = require("./vsc/teamsProjectTypeNode");
      node = MCPServerTypeNode();
      break;
    }

    // Simple question nodes
    case "gcNameNode":
      node = { data: GCNameQuestion() };
      break;
    case "gcConnectionIdNode":
      node = { data: GCConnectionIdQuestion() };
      break;
    case "officeAddinFolderNode":
      node = {
        data: {
          type: "folder",
          name: QuestionNames.OfficeAddinFolder,
          title: getLocalizedString(
            "core.createProjectQuestion.DAMetaOS.capability.upgradeProject.projectFolder.title"
          ),
          placeholder: getLocalizedString(
            "core.createProjectQuestion.DAMetaOS.capability.upgradeProject.projectFolder.placeholder"
          ),
        },
      };
      break;
    case "officeAddinImportNode":
      node = {
        data: { type: "group", name: QuestionNames.OfficeAddinImport },
        children: [
          {
            data: {
              type: "folder",
              name: QuestionNames.OfficeAddinFolder,
              title: "Existing add-in project folder",
            },
          },
          {
            data: {
              type: "singleFile",
              name: QuestionNames.OfficeAddinManifest,
              title: "Select import project manifest file",
            },
          },
        ],
      };
      break;

    default:
      throw new Error(`Unknown node reference: ${jsonObject.node}`);
  }

  if (jsonObject.condition) {
    node.condition = jsonObject.condition;
  }
  return node;
}
