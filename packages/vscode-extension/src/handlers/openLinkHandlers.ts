// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  err,
  FxError,
  ok,
  Result,
  signedIn,
  SubscriptionInfo,
  UserError,
  Void,
} from "@microsoft/teamsfx-api";
import { AppStudioScopes, getHashedEnv } from "@microsoft/teamsfx-core";
import * as vscode from "vscode";
import * as util from "util";
import M365TokenInstance from "../commonlib/m365Login";
import {
  AzurePortalUrl,
  DeveloperPortalHomeLink,
  PublishAppLearnMoreLink,
  ResourceInfo,
} from "../constants";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTriggerFrom,
} from "../telemetry/extTelemetryEvents";
import { TreeViewCommand } from "../treeview/treeViewCommand";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import { ExtensionSource, ExtensionErrors } from "../error/error";
import * as envTreeUtils from "../utils/envTreeUtils";
import * as localizeUtils from "../utils/localizeUtils";
import { commands, Uri } from "vscode";

export async function openEnvLinkHandler(args: any[]): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.DocumentationName]: "environment",
  });
  return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-treeview-environment");
}

export async function openDevelopmentLinkHandler(args: any[]): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.DocumentationName]: "development",
  });
  return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-treeview-development");
}

export async function openLifecycleLinkHandler(args: any[]): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.DocumentationName]: "lifecycle",
  });
  return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-provision");
}

export async function openHelpFeedbackLinkHandler(args: any[]): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.DocumentationName]: "help&feedback",
  });
  return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-treeview-helpnfeedback");
}

export async function openDocumentLinkHandler(args?: any[]): Promise<Result<boolean, FxError>> {
  if (!args || args.length < 1) {
    // should never happen
    return Promise.resolve(ok(false));
  }
  const node = args[0] as TreeViewCommand;
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.TreeView,
    [TelemetryProperty.DocumentationName]: node.contextValue!,
  });
  switch (node.contextValue) {
    case "signinM365": {
      return VS_CODE_UI.openUrl(
        "https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/tools-prerequisites?from=teamstoolkit#microsoft-365-developer-program"
      );
    }
    case "signinAzure": {
      return VS_CODE_UI.openUrl("https://portal.azure.com/");
    }
    case "fx-extension.create":
    case "fx-extension.openSamples": {
      return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-create-project");
    }
    case "fx-extension.provision": {
      return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-provision-cloud-resource");
    }
    case "fx-extension.validateManifest": {
      return VS_CODE_UI.openUrl("https://aka.ms/teams-store-validation");
    }
    case "fx-extension.deploy": {
      return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-deploy");
    }
    case "fx-extension.publish": {
      return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-publish");
    }
    case "fx-extension.publishInDeveloperPortal": {
      return VS_CODE_UI.openUrl(PublishAppLearnMoreLink);
    }
  }
  return Promise.resolve(ok(false));
}

export async function openM365AccountHandler() {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenM365Portal);
  return VS_CODE_UI.openUrl("https://admin.microsoft.com/Adminportal/");
}

export async function openAzureAccountHandler() {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenAzurePortal);
  return VS_CODE_UI.openUrl("https://portal.azure.com/");
}

export async function openAppManagement(...args: unknown[]): Promise<Result<boolean, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ManageTeamsApp, getTriggerFromProperty(args));
  const accountRes = await M365TokenInstance.getStatus({ scopes: AppStudioScopes() });

  if (accountRes.isOk() && accountRes.value.status === signedIn) {
    const loginHint = accountRes.value.accountInfo?.upn as string;
    return VS_CODE_UI.openUrl(`${DeveloperPortalHomeLink}?login_hint=${loginHint}`);
  } else {
    return VS_CODE_UI.openUrl(DeveloperPortalHomeLink);
  }
}

export async function openBotManagement(args?: any[]): Promise<Result<boolean, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ManageTeamsBot, getTriggerFromProperty(args));
  return VS_CODE_UI.openUrl("https://dev.teams.microsoft.com/bots");
}

export async function openAccountLinkHandler(args: any[]): Promise<Result<boolean, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.DocumentationName]: "account",
  });
  return VS_CODE_UI.openUrl("https://aka.ms/teamsfx-treeview-account");
}

export async function openReportIssues(...args: unknown[]): Promise<Result<boolean, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ReportIssues, getTriggerFromProperty(args));
  return VS_CODE_UI.openUrl("https://github.com/OfficeDev/TeamsFx/issues");
}

export async function openDocumentHandler(...args: unknown[]): Promise<Result<boolean, FxError>> {
  let documentName = "general";
  if (args && args.length >= 2 && typeof args[1] === "string") {
    documentName = args[1];
  }
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.DocumentationName]: documentName,
  });
  let url = "https://aka.ms/teamsfx-build-first-app";
  if (documentName === "learnmore") {
    url = "https://aka.ms/teams-toolkit-5.0-upgrade";
  } else if (documentName === "build-apps") {
    url = "https://aka.ms/teamstoolkit-build-app";
  } else if (documentName === "build-agents") {
    url = "https://aka.ms/teamstoolkit-build-agent";
  }
  return VS_CODE_UI.openUrl(url);
}

export async function openExternalHandler(args?: any[]) {
  if (args && args.length > 0) {
    const url = (args[0] as { url: string }).url;
    return VS_CODE_UI.openUrl(url);
  }
  return ok(false);
}

function getSubscriptionUrl(subscriptionInfo: SubscriptionInfo): string {
  const subscriptionId = subscriptionInfo.subscriptionId;
  const tenantId = subscriptionInfo.tenantId;

  return `${AzurePortalUrl}/#@${tenantId}/resource/subscriptions/${subscriptionId}`;
}

export async function openSubscriptionInPortal(env: string): Promise<Result<Void, FxError>> {
  const telemetryProperties: { [p: string]: string } = {};
  telemetryProperties[TelemetryProperty.Env] = getHashedEnv(env);

  const subscriptionInfo = await envTreeUtils.getSubscriptionInfoFromEnv(env);
  if (subscriptionInfo) {
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenSubscriptionInPortal, telemetryProperties);

    const url = getSubscriptionUrl(subscriptionInfo);
    await vscode.env.openExternal(vscode.Uri.parse(url));

    return ok(Void);
  } else {
    const resourceInfoNotFoundError = new UserError(
      ExtensionSource,
      ExtensionErrors.EnvResourceInfoNotFoundError,
      util.format(
        localizeUtils.localize("teamstoolkit.handlers.resourceInfoNotFound"),
        ResourceInfo.Subscription,
        env
      )
    );
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.OpenSubscriptionInPortal,
      resourceInfoNotFoundError,
      telemetryProperties
    );

    return err(resourceInfoNotFoundError);
  }
}

export async function openResourceGroupInPortal(env: string): Promise<Result<Void, FxError>> {
  const telemetryProperties: { [p: string]: string } = {};
  telemetryProperties[TelemetryProperty.Env] = getHashedEnv(env);

  const subscriptionInfo = await envTreeUtils.getSubscriptionInfoFromEnv(env);
  const resourceGroupName = await envTreeUtils.getResourceGroupNameFromEnv(env);

  if (subscriptionInfo && resourceGroupName) {
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenResourceGroupInPortal, telemetryProperties);

    const url = `${getSubscriptionUrl(subscriptionInfo)}/resourceGroups/${resourceGroupName}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));

    return ok(Void);
  } else {
    let errorMessage = "";
    if (subscriptionInfo) {
      errorMessage = util.format(
        localizeUtils.localize("teamstoolkit.handlers.resourceInfoNotFound"),
        ResourceInfo.ResourceGroup,
        env
      );
    } else if (resourceGroupName) {
      errorMessage = util.format(
        localizeUtils.localize("teamstoolkit.handlers.resourceInfoNotFound"),
        ResourceInfo.Subscription,
        env
      );
    } else {
      errorMessage = util.format(
        localizeUtils.localize("teamstoolkit.handlers.resourceInfoNotFound"),
        `${ResourceInfo.Subscription} and ${ResourceInfo.ResourceGroup}`,
        env
      );
    }

    const resourceInfoNotFoundError = new UserError(
      ExtensionSource,
      ExtensionErrors.EnvResourceInfoNotFoundError,
      errorMessage
    );
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.OpenSubscriptionInPortal,
      resourceInfoNotFoundError,
      telemetryProperties
    );

    return err(resourceInfoNotFoundError);
  }
}

export async function findGitHubSimilarIssue(args?: any[]): Promise<Result<Void, FxError>> {
  if (args && args.length > 0) {
    const errorCode = args[0] as string;
    const similarIssueLink = Uri.parse(
      `https://github.com/OfficeDev/TeamsFx/issues?q=is:issue+in:title+${errorCode}`
    );

    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.FindSimilarIssues);
    await commands.executeCommand("vscode.open", similarIssueLink);
    return ok(Void);
  }
  return ok(Void);
}
