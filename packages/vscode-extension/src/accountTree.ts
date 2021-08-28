// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  err,
  FxError,
  ok,
  Result,
  SubscriptionInfo,
  TreeCategory,
  TreeItem,
  Void,
} from "@microsoft/teamsfx-api";
import AzureAccountManager from "./commonlib/azureLogin";
import { core, getSystemInputs, tools, getAzureSolutionSettings } from "./handlers";
import { askSubscription } from "@microsoft/teamsfx-core";
import { VS_CODE_UI } from "./extension";
import {
  AccountType,
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTiggerFrom,
} from "./telemetry/extTelemetryEvents";
import * as util from "util";
import * as StringResources from "./resources/Strings.json";
import { StringContext } from "./utils/stringContext";

export async function getSubscriptionId(): Promise<string | undefined> {
  const subscriptionInfo = await AzureAccountManager.getSelectedSubscription();
  if (subscriptionInfo) {
    return subscriptionInfo.subscriptionId;
  }
  // else {
  //   showError(projectConfigRes.error);
  // }
  return undefined;
}

export async function isValid(): Promise<boolean> {
  const input = getSystemInputs();
  input.ignoreEnvInfo = true;
  const projectConfigRes = await core.getProjectConfig(input);

  let supported = false;
  if (projectConfigRes.isOk()) {
    if (projectConfigRes.value) {
      supported = true;
    }
  }
  // else {
  //   showError(projectConfigRes.error);
  // }
  return supported;
}

export async function registerAccountTreeHandler(): Promise<Result<Void, FxError>> {
  let getSelectSubItem: undefined | ((token: any) => Promise<[TreeItem, boolean]>) = undefined;
  getSelectSubItem = async (token: any): Promise<[TreeItem, boolean]> => {
    let selectSubLabel = "";
    const subscriptions: SubscriptionInfo[] | undefined =
      await tools.tokenProvider.azureAccountProvider.listSubscriptions();
    if (subscriptions) {
      const activeSubscriptionId = await getSubscriptionId();
      const activeSubscription = subscriptions.find(
        (subscription) => subscription.subscriptionId === activeSubscriptionId
      );
      let icon = "";
      let contextValue = "selectSubscription";
      if (activeSubscriptionId === undefined || activeSubscription === undefined) {
        selectSubLabel = util.format(
          StringResources.vsc.accountTree.totalSubscriptions,
          subscriptions.length
        );
        icon = "subscriptions";

        if (subscriptions.length === 0) {
          contextValue = "emptySubscription";
        }

        if (subscriptions.length === 1) {
          await setSubscription(subscriptions[0]);
          selectSubLabel = subscriptions[0].subscriptionName;
          icon = "subscriptionSelected";
        }
      } else {
        selectSubLabel = activeSubscription.subscriptionName;
        icon = "subscriptionSelected";
      }
      const valid = await isValid();
      return [
        {
          commandId: "fx-extension.selectSubscription",
          label: selectSubLabel,
          callback: () => {
            return Promise.resolve(ok(null));
          },
          parent: "fx-extension.signinAzure",
          contextValue: valid ? contextValue : "invalidFxProject",
          icon: icon,
        },
        !(activeSubscriptionId === undefined || activeSubscription === undefined) ||
          subscriptions.length === 1,
      ];
    } else {
      return [
        {
          commandId: "fx-extension.selectSubscription",
          label: selectSubLabel,
          callback: () => {
            return Promise.resolve(ok(null));
          },
          parent: "fx-extension.signinAzure",
          contextValue: "invalidFxProject",
          icon: "subscriptions",
        },
        false,
      ];
    }
  };

  const selectSubscriptionCallback = async (args?: any[]): Promise<Result<null, FxError>> => {
    tools.telemetryReporter?.sendTelemetryEvent(TelemetryEvent.SelectSubscription, {
      [TelemetryProperty.TriggerFrom]: args
        ? TelemetryTiggerFrom.TreeView
        : TelemetryTiggerFrom.Other,
    });
    const askSubRes = await askSubscription(
      tools.tokenProvider.azureAccountProvider,
      VS_CODE_UI,
      undefined
    );
    if (askSubRes.isErr()) return err(askSubRes.error);
    await setSubscription(askSubRes.value);
    return ok(null);
  };

  const signinM365Callback = async (args?: any[]): Promise<Result<null, FxError>> => {
    tools.telemetryReporter?.sendTelemetryEvent(TelemetryEvent.LoginClick, {
      [TelemetryProperty.TriggerFrom]:
        args && args.length > 0 ? TelemetryTiggerFrom.TreeView : TelemetryTiggerFrom.CommandPalette,
      [TelemetryProperty.AccountType]: AccountType.M365,
    });

    const token = await tools.tokenProvider.appStudioToken.getJsonObject(true);
    if (token !== undefined) {
      tools.treeProvider?.refresh([
        {
          commandId: "fx-extension.signinM365",
          label: (token as any).upn ? (token as any).upn : "",
          callback: signinM365Callback,
          parent: TreeCategory.Account,
          contextValue: "signedinM365",
          icon: "M365",
        },
      ]);
    }

    return ok(null);
  };

  const signinAzureCallback = async (args?: any[]): Promise<Result<null, FxError>> => {
    if (AzureAccountManager.getAccountInfo() === undefined) {
      tools.telemetryReporter?.sendTelemetryEvent(TelemetryEvent.LoginClick, {
        [TelemetryProperty.TriggerFrom]:
          args && args.length > 0
            ? TelemetryTiggerFrom.TreeView
            : TelemetryTiggerFrom.CommandPalette,
        [TelemetryProperty.AccountType]: AccountType.Azure,
      });
    }
    const showDialog = args && args[1] !== undefined ? args[1] : true;
    const token = await AzureAccountManager.getAccountCredentialAsync(showDialog);
    if (token !== undefined) {
      tools.treeProvider?.refresh([
        {
          commandId: "fx-extension.signinAzure",

          label: (token as any).username ? (token as any).username : "",
          callback: signinAzureCallback,
          parent: TreeCategory.Account,
          contextValue: "signedinAzure",
        },
      ]);

      const subItem = await getSelectSubItem!(token);
      tools.treeProvider?.add([subItem[0]]);

      if (!subItem[1]) {
        const solutionSettings = await getAzureSolutionSettings();
        if (solutionSettings && "Azure" === solutionSettings.hostType) {
          await selectSubscriptionCallback();
        }
      }
    }

    return ok(null);
  };

  tools.tokenProvider.appStudioToken?.setStatusChangeMap(
    "tree-view",
    async (
      status: string,
      token?: string | undefined,
      accountInfo?: Record<string, unknown> | undefined
    ) => {
      if (status === "SignedIn") {
        const token = await tools.tokenProvider.appStudioToken.getJsonObject(true);
        if (token !== undefined) {
          tools.treeProvider?.refresh([
            {
              commandId: "fx-extension.signinM365",
              label: (token as any).upn ? (token as any).upn : "",
              callback: signinM365Callback,
              parent: TreeCategory.Account,
              contextValue: "signedinM365",
              icon: "M365",
            },
          ]);
        }
      } else if (status === "SigningIn") {
        tools.treeProvider?.refresh([
          {
            commandId: "fx-extension.signinM365",
            label: StringResources.vsc.accountTree.signingInM365,
            callback: signinM365Callback,
            parent: TreeCategory.Account,
            icon: "spinner",
          },
        ]);
      } else if (status === "SignedOut") {
        tools.treeProvider?.refresh([
          {
            commandId: "fx-extension.signinM365",
            label: StringResources.vsc.handlers.signIn365,
            callback: signinM365Callback,
            parent: TreeCategory.Account,
            icon: "M365",
            contextValue: "signinM365",
          },
        ]);
      }
      return Promise.resolve();
    }
  );
  tools.tokenProvider.azureAccountProvider?.setStatusChangeMap(
    "tree-view",
    async (
      status: string,
      token?: string | undefined,
      accountInfo?: Record<string, unknown> | undefined
    ) => {
      if (status === "SignedIn") {
        const token = await tools.tokenProvider.azureAccountProvider.getAccountCredentialAsync();
        if (token !== undefined) {
          tools.treeProvider?.refresh([
            {
              commandId: "fx-extension.signinAzure",
              label: (token as any).username ? (token as any).username : "",
              callback: signinAzureCallback,
              parent: TreeCategory.Account,
              contextValue: "signedinAzure",
              icon: "azure",
            },
          ]);
          const subItem = await getSelectSubItem!(token);
          tools.treeProvider?.add([subItem[0]]);
        }
      } else if (status === "SigningIn") {
        tools.treeProvider?.refresh([
          {
            commandId: "fx-extension.signinAzure",
            label: StringResources.vsc.accountTree.signingInAzure,
            callback: signinAzureCallback,
            parent: TreeCategory.Account,
            icon: "spinner",
          },
        ]);
      } else if (status === "SignedOut") {
        tools.treeProvider?.refresh([
          {
            commandId: "fx-extension.signinAzure",
            label: StringContext.getSignInAzureContext(),
            callback: signinAzureCallback,
            parent: TreeCategory.Account,
            icon: "azure",
            contextValue: "signinAzure",
          },
        ]);
        tools.treeProvider?.remove([
          {
            commandId: "fx-extension.selectSubscription",
            label: "",
            parent: "fx-extension.signinAzure",
          },
        ]);
      }

      return Promise.resolve();
    }
  );

  const signinM365TreeItem: TreeItem = {
    commandId: "fx-extension.signinM365",
    label: StringResources.vsc.handlers.signIn365,
    callback: signinM365Callback,
    parent: TreeCategory.Account,
    contextValue: "signinM365",
    icon: "M365",
    tooltip: {
      isMarkdown: true,
      value: StringResources.vsc.accountTree.m365AccountTooltip,
    },
  };

  const signinAzureTreeItem: TreeItem = {
    commandId: "fx-extension.signinAzure",
    label: StringContext.getSignInAzureContext(),
    callback: async (args?: any[]) => {
      return signinAzureCallback(args);
    },
    parent: TreeCategory.Account,
    contextValue: "signinAzure",
    subTreeItems: [],
    icon: "azure",
    tooltip: {
      isMarkdown: true,
      value: StringResources.vsc.accountTree.azureAccountTooltip,
    },
  };

  const specifySubscriptionTreeItem: TreeItem = {
    commandId: "fx-extension.specifySubscription",
    label: StringResources.vsc.accountTree.specifySubscription,
    callback: selectSubscriptionCallback,
    parent: undefined,
  };

  const solutionSettings = await getAzureSolutionSettings();
  if (solutionSettings && "SPFx" === solutionSettings.hostType) {
    tools.treeProvider!.add([signinM365TreeItem]);
  } else {
    tools.treeProvider!.add([signinM365TreeItem, signinAzureTreeItem, specifySubscriptionTreeItem]);
  }

  return ok(Void);
}

async function setSubscription(subscription: SubscriptionInfo | undefined) {
  if (subscription) {
    const inputs = getSystemInputs();
    inputs.tenantId = subscription.tenantId;
    inputs.subscriptionId = subscription.subscriptionId;
    await tools.tokenProvider.azureAccountProvider.setSubscription(subscription.subscriptionId);
    tools.treeProvider?.refresh([
      {
        commandId: "fx-extension.selectSubscription",
        label: subscription.subscriptionName,
        callback: () => {
          return Promise.resolve(ok(null));
        },
        parent: "fx-extension.signinAzure",
        contextValue: "selectSubscription",
        icon: "subscriptionSelected",
        tooltip: {
          isMarkdown: false,
          value: subscription.subscriptionName,
        },
      },
    ]);
  }
}
