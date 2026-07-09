// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IQTreeNode, Platform } from "@microsoft/teamsfx-api";
import { grantPermissionQuestionNode, listCollaboratorQuestionNode } from "./collaborator";
import { createSampleProjectQuestionNode } from "./create";
import {
  addAuthActionQuestion,
  addKnowledgeQuestionNode,
  addPluginQuestionNode,
  addSkillQuestionNode,
  addWebPartQuestionNode,
  apiSpecApiKeyQuestion,
  convertAadToNewSchemaQuestionNode,
  copilotPluginAddAPIQuestionNode,
  createNewEnvQuestionNode,
  deployAadManifestQuestionNode,
  kiotaRegenerateQuestion,
  oauthQuestion,
  previewWithTeamsAppManifestQuestionNode,
  regeneratePluginNode,
  selectTeamsAppManifestQuestionNode,
  setSensitivityLabelNode,
  syncManifestQuestionNode,
  uninstallQuestionNode,
  validateTeamsAppQuestionNode,
} from "./other";
import { scaffoldQuestionForVS } from "./scaffold/vs/createRootNode";
import { createFromTdpNode } from "./scaffold/vsc/createFromTdpNode";
import { scaffoldQuestionForVSCode } from "./scaffold/vsc/createRootNode";
import { updateActionWithMCP } from "./scaffold/vsc/teamsProjectTypeNode";
import { removeSharedAccessNode, shareNode } from "./share";
export * from "./constants";
export * from "./create";
export * from "./inputs";
export * from "./options";

export class QuestionNodes {
  createProject(platform: Platform): IQTreeNode {
    if (platform === Platform.VS) return scaffoldQuestionForVS();
    return scaffoldQuestionForVSCode(platform);
  }
  createFromTdp(platform: Platform): IQTreeNode {
    return createFromTdpNode(platform);
  }
  createSampleProject(): IQTreeNode {
    return createSampleProjectQuestionNode();
  }
  addWebpart(): IQTreeNode {
    return addWebPartQuestionNode();
  }
  selectTeamsAppManifest(): IQTreeNode {
    return selectTeamsAppManifestQuestionNode();
  }
  validateTeamsApp(): IQTreeNode {
    return validateTeamsAppQuestionNode();
  }
  previewWithTeamsAppManifest(): IQTreeNode {
    return previewWithTeamsAppManifestQuestionNode();
  }
  listCollaborator(): IQTreeNode {
    return listCollaboratorQuestionNode();
  }
  grantPermission(): IQTreeNode {
    return grantPermissionQuestionNode();
  }
  deployAadManifest(): IQTreeNode {
    return deployAadManifestQuestionNode();
  }
  convertAadToNewSchema(): IQTreeNode {
    return convertAadToNewSchemaQuestionNode();
  }
  createNewEnv(): IQTreeNode {
    return createNewEnvQuestionNode();
  }
  copilotPluginAddAPI(): IQTreeNode {
    return copilotPluginAddAPIQuestionNode();
  }
  apiKey(): IQTreeNode {
    return apiSpecApiKeyQuestion();
  }
  oauth(): IQTreeNode {
    return oauthQuestion();
  }
  addPlugin(): IQTreeNode {
    return addPluginQuestionNode();
  }
  regeneratePlugin(): IQTreeNode {
    return regeneratePluginNode();
  }
  uninstall(): IQTreeNode {
    return uninstallQuestionNode();
  }
  syncManifest(): IQTreeNode {
    return syncManifestQuestionNode();
  }
  kiotaRegenerate(): IQTreeNode {
    return kiotaRegenerateQuestion();
  }
  addAuthAction(): IQTreeNode {
    return addAuthActionQuestion();
  }
  addKnowledge(): IQTreeNode {
    return addKnowledgeQuestionNode();
  }
  addSkill(): IQTreeNode {
    return addSkillQuestionNode();
  }
  setSensitivityLabel(): IQTreeNode {
    return setSensitivityLabelNode();
  }
  share(): IQTreeNode {
    return shareNode();
  }
  removeSharedAccess(): IQTreeNode {
    return removeSharedAccessNode();
  }
  updateActionWithMCP(): IQTreeNode {
    return updateActionWithMCP();
  }
}

export const questionNodes = new QuestionNodes();
