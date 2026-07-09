// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as util from "util";
import * as vscode from "vscode";

import { FxError, Result, SystemError, UserError, err, ok } from "@microsoft/teamsfx-api";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import VsCodeLogInstance from "../commonlib/log";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
  TelemetryTriggerFrom,
} from "../telemetry/extTelemetryEvents";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import { showOutputChannelHandler } from "./showOutputChannel";
import { localize } from "../utils/localizeUtils";
import { GlobalKey, InstallCopilotChatLink } from "../constants";
import { isVSCodeInsiderVersion } from "../utils/versionUtil";
import { VS_CODE_UI } from "../qm/vsc_ui";

const githubCopilotChatExtensionId = "github.copilot-chat";
const teamsAgentLink = "https://aka.ms/install-m365agents";

enum errorNames {
  NoActiveTextEditor = "NoActiveTextEditor",
  openCopilotError = "openCopilotError",
}

enum failedPreCheckSteps {
  GitHubCopilotInstalled = "GitHubCopilotInstalled",
}

function githubCopilotInstalled(): boolean {
  const extension = vscode.extensions.getExtension(githubCopilotChatExtensionId);
  return !!extension;
}

function openOutputInEditor(): vscode.Uri | undefined {
  // Return the toolkit's on-disk log file URI so it can be attached to chat
  // as a referenced file. The Output channel mirrors every log line to this
  // file (see VsCodeLogProvider.log), so attaching it gives the agent the
  // same content without needing to open the Output panel as an editor.
  try {
    return vscode.Uri.file(VsCodeLogInstance.getLogFilePath());
  } catch {
    return undefined;
  }
}

export async function openGithubCopilotChat(args?: any[]): Promise<Result<null, FxError>> {
  const startEventName = TelemetryEvent.OpenGitHubCopilotChatStart;
  const eventName = TelemetryEvent.openGitHubCopilotChat;
  const triggerFrom = getTriggerFromProperty(args);
  const hasQuery = !!args && args.length >= 2 && !!args[1];
  const userQuery = hasQuery ? (args[1] as string) : "";
  const attachUris: vscode.Uri[] =
    !!args && args.length >= 3 && Array.isArray(args[2]) ? (args[2] as vscode.Uri[]) : [];

  // Always invoke the bundled "/microsoft-365-agents-toolkit" custom agent so that
  // Copilot has Microsoft 365 Agents Toolkit domain knowledge when answering.
  const slashCommand = "/microsoft-365-agents-toolkit";
  const query = userQuery ? `${slashCommand} ${userQuery}` : `${slashCommand} `;

  const telemtryProperties = {
    ...triggerFrom,
    [TelemetryProperty.HasQueryForCopilotChat]: hasQuery.toString(),
  };
  ExtTelemetry.sendTelemetryEvent(startEventName, triggerFrom);
  try {
    try {
      await vscode.commands.executeCommand("workbench.action.chat.toggleAgentMode", {
        mode: "agent",
      });
    } catch {}
    await vscode.commands.executeCommand("workbench.panel.chat.view.copilot.focus");
    const openOptions: { [key: string]: unknown } = {
      query,
      isPartialQuery: true,
      mode: "agent",
    };
    if (attachUris.length > 0) {
      openOptions.attachFiles = attachUris;
    }
    await vscode.commands.executeCommand("workbench.action.chat.open", openOptions);
    ExtTelemetry.sendTelemetryEvent(eventName, telemtryProperties);
    return ok(null);
  } catch (e) {
    const error = new SystemError(
      eventName,
      errorNames.openCopilotError,
      util.format(localize("teamstoolkit.handlers.chatTeamsAgentError", query)),
      util.format(localize("teamstoolkit.handlers.chatTeamsAgentError", query))
    );
    VsCodeLogInstance.error(error.message);
    ExtTelemetry.sendTelemetryErrorEvent(eventName, error, telemtryProperties);

    const assembledError = teamsfxCore.assembleError(e);
    if (assembledError.message) {
      VsCodeLogInstance.error(assembledError.message);
    }

    return err(error);
  }
}

export async function installGithubCopilotChatExtension(
  args?: any[]
): Promise<Result<null, FxError>> {
  const startEventName = TelemetryEvent.InstallCopilotChatStart;
  const eventName = TelemetryEvent.InstallCopilotChat;

  const isExtensionInstalled = githubCopilotInstalled();
  if (isExtensionInstalled) {
    void vscode.window.showInformationMessage(
      localize("teamstoolkit.handlers.installCopilotChatExtensionAlreadyInstalled")
    );
    return ok(null);
  }
  const telemetryProperties = getTriggerFromProperty(args);
  ExtTelemetry.sendTelemetryEvent(startEventName, telemetryProperties);
  try {
    await vscode.commands.executeCommand(
      "workbench.extensions.installExtension",
      githubCopilotChatExtensionId,
      {
        installPreReleaseVersion: isVSCodeInsiderVersion(), // VSCode insider need to install Github Copilot Chat of pre-release version
        enable: true,
      }
    );

    ExtTelemetry.sendTelemetryEvent(eventName, {
      ...telemetryProperties,
      [TelemetryProperty.Success]: TelemetrySuccess.Yes,
    });

    return ok(null);
  } catch (e) {
    const error = new SystemError(
      eventName,
      "InstallCopilotError",
      util.format(localize("teamstoolkit.handlers.installCopilotError", InstallCopilotChatLink)),
      util.format(localize("teamstoolkit.handlers.installCopilotError", InstallCopilotChatLink))
    );
    VsCodeLogInstance.error(error.message);
    ExtTelemetry.sendTelemetryErrorEvent(eventName, error, telemetryProperties);

    const assembledError = teamsfxCore.assembleError(e);
    if (assembledError.message) {
      VsCodeLogInstance.error(assembledError.message);
    }

    return err(error);
  }
}

export async function openInstallTeamsAgent(args?: any[]) {
  const startEventName = TelemetryEvent.OpenInstallTeamsAgentStart;
  const eventName = TelemetryEvent.OpenInstallTeamsAgent;

  const telemetryProperties = getTriggerFromProperty(args);
  ExtTelemetry.sendTelemetryEvent(startEventName, telemetryProperties);
  const openUrlRes = await VS_CODE_UI.openUrl(teamsAgentLink);
  if (openUrlRes.isOk()) {
    ExtTelemetry.sendTelemetryEvent(eventName, telemetryProperties);
  } else {
    ExtTelemetry.sendTelemetryErrorEvent(eventName, openUrlRes.error, telemetryProperties);
    VsCodeLogInstance.error(openUrlRes.error.message);
  }
}

export async function markTeamsAgentInstallationDone(args?: any[]) {
  const startEventName = TelemetryEvent.MarkTeamsAgentInstallationDoneStart;
  const eventName = TelemetryEvent.MarkTeamsAgentInstallationDone;

  ExtTelemetry.sendTelemetryEvent(startEventName);

  try {
    await teamsfxCore.globalStateUpdate(GlobalKey.TeamsAgentInstalled, true);
    ExtTelemetry.sendTelemetryEvent(eventName);
  } catch (e) {
    ExtTelemetry.sendTelemetryErrorEvent(eventName, teamsfxCore.assembleError(e));
  }
}

export async function openTeamsAgentWalkthrough(args?: any[]) {
  const triggerFromProperty = getTriggerFromProperty(args);
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenTeamsAgentWalkthrough, triggerFromProperty);
  await vscode.commands.executeCommand("workbench.action.openWalkthrough", {
    category: "TeamsDevApp.ms-teams-vscode-extension#teamsAgentGetStarted",
  });
}

/**
 * Invoke @m365agents
 * @param query query
 * @param triggerFromProperty trigger-from property
 * @param skipPreCheck skip pre-check or not. Default value is false.
 * @returns A boolean value indicates whether the query is sent or not. If not, it means the walkthrough is opened instead.
 */
async function invoke(
  query: string,
  triggerFromProperty: { [key: string]: TelemetryTriggerFrom },
  skipPreCheck = false,
  attachUris: vscode.Uri[] = []
): Promise<Result<boolean, FxError>> {
  if (skipPreCheck) {
    const res = await openGithubCopilotChat([
      triggerFromProperty[TelemetryProperty.TriggerFrom],
      query,
      attachUris,
    ]);
    if (res.isErr()) {
      return err(res.error);
    } else {
      return ok(true);
    }
  }

  const hasGitHubCopilotInstalled = githubCopilotInstalled();
  const failedSteps: failedPreCheckSteps[] = [];
  if (!hasGitHubCopilotInstalled) {
    failedSteps.push(failedPreCheckSteps.GitHubCopilotInstalled);
  }

  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.TeamsAgentPreCheckResult, {
    [TelemetryProperty.TeamsAgentPreCheckFailure]: failedSteps.join(","),
    [TelemetryProperty.TeamsAgentPreCheckResultSuccess]:
      failedSteps.length === 0 ? "true" : "false",
    ...triggerFromProperty,
  });

  if (failedSteps.length === 0) {
    const res = await openGithubCopilotChat([
      triggerFromProperty[TelemetryProperty.TriggerFrom],
      query,
      attachUris,
    ]);
    if (res.isErr()) {
      return err(res.error);
    } else {
      return ok(true);
    }
  } else {
    const message = `Cannot open GitHub Copilot Chat: GitHub Copilot Chat extension (${githubCopilotChatExtensionId}) is not installed.`;
    const error = new UserError(
      TelemetryEvent.InvokeTeamsAgent,
      "TeamsAgentPreCheckFailed",
      message,
      message
    );
    VsCodeLogInstance.error(message);
    void vscode.window.showErrorMessage(message);
    return err(error);
  }
}

/**
 * Invokes GitHub Copilot Chat for creating new app or development questions.
 * @param args args
 * @returns Result
 */
export async function invokeTeamsAgent(args?: any[]): Promise<Result<boolean, FxError>> {
  const eventName = TelemetryEvent.InvokeTeamsAgent;
  const triggerFromProperty = getTriggerFromProperty(args);
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.InvokeTeamsAgentStart, triggerFromProperty);

  let query = "";
  let shouldSkipPreCheck = false;
  switch (triggerFromProperty[TelemetryProperty.TriggerFrom]) {
    case TelemetryTriggerFrom.TeamsAgentWalkthroughExplore:
    case TelemetryTriggerFrom.TeamsAgentWalkthroughCreate:
    case TelemetryTriggerFrom.TeamsAgentWalkthroughTroubleshoot:
    case TelemetryTriggerFrom.WalkThrough:
      shouldSkipPreCheck = true;
      query = "";
      break;
    default:
      query = "";
  }

  const res = await invoke(query, triggerFromProperty, shouldSkipPreCheck);

  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(eventName, res.error, triggerFromProperty);
  } else {
    ExtTelemetry.sendTelemetryEvent(eventName, {
      [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      ...triggerFromProperty,
      [TelemetryProperty.CopilotChatQuerySent]: res.value.toString(),
    });
  }
  return res;
}

/**
 * Invokes teams agent for troubleshooting based on selected text.
 * @param args
 * @returns Result
 */
export async function troubleshootSelectedText(args?: any[]): Promise<Result<boolean, FxError>> {
  const eventName = TelemetryEvent.TroubleshootSelectedText;
  const triggerFromProperty = getTriggerFromProperty([TelemetryTriggerFrom.EditorContextMenu]);
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.TroubleshootSelectedTextStart,
    triggerFromProperty
  );

  const editor = vscode.window.activeTextEditor;
  let selectedText = "";
  if (editor) {
    const selection = editor.selection;
    selectedText = editor.document.getText(selection);
  } else {
    return err(
      new UserError(
        eventName,
        errorNames.NoActiveTextEditor,
        localize("teamstoolkit.handlers.teamsAgentTroubleshoot.noActiveEditor")
      )
    );
  }

  const query = `@m365agents I'm encountering an issue in Microsoft 365 Agents Toolkit.
\`\`\`
{
  Error context: ${selectedText}
}
\`\`\`
Can you help me diagnose the issue and suggest possible solutions?
`;
  const res = await invoke(query, triggerFromProperty);

  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(eventName, res.error, triggerFromProperty);
  } else {
    ExtTelemetry.sendTelemetryEvent(eventName, {
      [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      ...triggerFromProperty,
      [TelemetryProperty.CopilotChatQuerySent]: res.value.toString(),
    });
  }
  return res;
}

/**
 * Invokes teams agent for troubleshooting current error.
 * @param args
 * @returns Result
 */
export async function troubleshootError(args?: any[]): Promise<Result<boolean, FxError>> {
  const eventName = TelemetryEvent.TroubleshootErrorFromNotification;
  if (!args || args.length !== 2) {
    // should never happen
    return ok(false);
  }

  const currentError = args[1] as FxError;
  const errorCode = `${currentError.source}.${currentError.name}`;
  const triggerFromProperty = getTriggerFromProperty(args);
  const telemtryProperties = {
    ...triggerFromProperty,
    [TelemetryProperty.ErrorCode]: errorCode,
  };
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.TroubleshootErrorFromNotificationStart,
    telemtryProperties
  );

  // Open the output panel as an editor and attach its URI as a chat reference
  // instead of pasting error context as a query.
  const outputUri = openOutputInEditor();
  const attachUris = outputUri ? [outputUri] : [];
  const res = await invoke("fix", triggerFromProperty, false, attachUris);

  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(eventName, res.error, telemtryProperties);
  } else {
    ExtTelemetry.sendTelemetryEvent(eventName, {
      [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      ...telemtryProperties,
      [TelemetryProperty.CopilotChatQuerySent]: res.value.toString(),
    });
  }
  return res;
}
