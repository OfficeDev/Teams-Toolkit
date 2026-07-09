// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  IQTreeNode,
  Inputs,
  MultiSelectQuestion,
  OptionItem,
  SingleSelectQuestion,
} from "@microsoft/teamsfx-api";
import { teamsDevPortalClient } from "../client/teamsDevPortalClient";
import { AppStudioScopes } from "../common/constants";
import { TOOLS } from "../common/globalVars";
import { getLocalizedString } from "../common/localizeUtils";
import * as shareUtils from "../component/driver/share/utils";
import { CollaborationUtil } from "../core/collaborator";
import { QuestionNames } from "./constants";
import { inputUserEmailQuestion } from "./other";

export enum ShareOperationOption {
  ShareWithUsers = "share",
  RemoveShareAccessFromUsers = "unshare",
}

export enum ShareScopeOption {
  ShareAppWithTenantUsers = "tenant",
  ShareAppWithSpecificUsers = "users",
}

export const MAX_SHARE_EMAILS = 20;

export function shareNode(): IQTreeNode {
  return {
    data: shareOperationOptions(),
    children: [
      shareScopeOptions(),
      {
        condition: (inputs: Inputs) => {
          return (
            inputs[QuestionNames.ShareOperation] === ShareOperationOption.RemoveShareAccessFromUsers
          );
        },
        data: inputUserEmailQuestion(
          getLocalizedString("core.shareOptionQuestion.unshare.emails.title"),
          "Email address of specific users or groups separated by comma.",
          false
        ),
      },
    ],
  };
}

function shareOperationOptions(): SingleSelectQuestion {
  return {
    name: QuestionNames.ShareOperation,
    title: getLocalizedString("core.shareOptionQuestion.title"),
    type: "singleSelect",
    placeholder: getLocalizedString("core.shareOptionQuestion.placeholder"),
    staticOptions: [
      ShareOperationOptions.shareWithUsers(),
      ShareOperationOptions.removeShareAccessFromUsers(),
    ],
  };
}

function shareScopeOptions(): IQTreeNode {
  return {
    condition: { equals: ShareOperationOptions.shareWithUsers().id },
    data: {
      type: "singleSelect",
      name: QuestionNames.ShareScope,
      title: getLocalizedString("core.shareScopeQuestion.title"),
      placeholder: getLocalizedString("core.shareScopeQuestion.placeholder"),
      staticOptions: [ShareScopeOptions.shareWithTenant(), ShareScopeOptions.shareWithUsers()],
      default: ShareScopeOptions.shareWithUsers().id,
    },
    children: [
      {
        condition: (inputs: Inputs) => {
          return inputs[QuestionNames.ShareScope] === ShareScopeOption.ShareAppWithSpecificUsers;
        },
        data: inputUserEmailQuestion(
          getLocalizedString("core.shareScopeQuestion.emails.title"),
          "Email address of specific users or groups separated by comma.",
          false
        ),
      },
    ],
  };
}

export class ShareOperationOptions {
  static shareWithUsers(): OptionItem {
    return {
      id: ShareOperationOption.ShareWithUsers,
      label: getLocalizedString("core.shareOperationQuestion.option.shareWithUsers"),
    };
  }

  static removeShareAccessFromUsers(): OptionItem {
    return {
      id: ShareOperationOption.RemoveShareAccessFromUsers,
      label: getLocalizedString("core.shareOperationQuestion.option.removeShareAccessFromUsers"),
    };
  }
}

export class ShareScopeOptions {
  static shareWithTenant(): OptionItem {
    return {
      id: ShareScopeOption.ShareAppWithTenantUsers,
      label: getLocalizedString("core.shareScopeQuestion.option.shareWithTenant"),
    };
  }

  static shareWithUsers(): OptionItem {
    return {
      id: ShareScopeOption.ShareAppWithSpecificUsers,
      label: getLocalizedString("core.shareScopeQuestion.option.shareWithUsers"),
    };
  }
}

export function removeSharedAccessNode(): IQTreeNode {
  return {
    data: {
      type: "group",
    },
    children: [
      {
        data: selectUsersToRemoveSharedAccess(),
      },
    ],
  };
}

export function selectUsersToRemoveSharedAccess(): MultiSelectQuestion {
  return {
    name: QuestionNames.RemoveUsers,
    title: getLocalizedString("core.selectUsersToRemoveShareAccess.title"),
    type: "multiSelect",
    cliDescription: getLocalizedString("core.selectUsersToRemoveShareAccess.title"),
    staticOptions: [],
    dynamicOptions: async (inputs: Inputs) => {
      if (!inputs.projectPath) {
        throw new Error("Project path is not defined");
      }
      const tokenRes = await TOOLS.tokenProvider.m365TokenProvider.getAccessToken({
        scopes: AppStudioScopes(),
      });
      if (tokenRes.isErr()) {
        throw tokenRes.error;
      }
      const token = tokenRes.value;
      const configRes = await shareUtils.parseShareAppActionYamlConfig(inputs.projectPath);
      if (configRes.isErr()) {
        throw configRes.error;
      }
      const teamsAppId = configRes.value.teamsappId;
      const app = await teamsDevPortalClient.getApp(token, teamsAppId);
      if (!app.userList || app.userList.length === 0) {
        throw new Error("No owner found in the app");
      }

      const currentUserInfoRes = await CollaborationUtil.getCurrentUserInfo(
        TOOLS.tokenProvider.m365TokenProvider
      );
      if (currentUserInfoRes.isErr()) {
        throw currentUserInfoRes.error;
      }
      const operatorId = currentUserInfoRes.value.aadId;

      const options: OptionItem[] = [];
      for (const user of app.userList) {
        if (user.aadId === operatorId) {
          continue;
        }
        options.push({
          id: user.userPrincipalName,
          label: user.displayName,
          description: user.userPrincipalName,
        });
      }
      return options;
    },
    skipValidation: true,
  };
}
