// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  CreateProjectResult,
  err,
  FxError,
  Inputs,
  ok,
  Result,
  Stage,
} from "@microsoft/teamsfx-api";
import {
  ActionStartOptions,
  AppStudioScopes,
  assembleError,
  AuthSvcScopes,
  featureFlagManager,
  FeatureFlags,
  isSovereignHigh,
  isUserCancelError,
  isValidOfficeAddInProject,
  QuestionNames,
  teamsDevPortalClient,
} from "@microsoft/teamsfx-core";
import * as vscode from "vscode";
import M365TokenInstance from "../commonlib/m365Login";
import { tools } from "../globalVariables";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTriggerFrom,
} from "../telemetry/extTelemetryEvents";
import envTreeProviderInstance from "../treeview/environmentTreeViewProvider";
import { localize } from "../utils/localizeUtils";
import { getSystemInputs } from "../utils/systemEnvUtils";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import { openFolder, openOfficeDevFolder } from "../utils/workspaceUtils";
import { invokeTeamsAgent } from "./copilotChatHandlers";
import { runCommand } from "./sharedOpts";

export async function createNewProjectHandler(...args: any[]): Promise<Result<any, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CreateProjectStart, getTriggerFromProperty(args));
  let inputs: Inputs | undefined;
  let stage = Stage.create;
  if (args?.length === 1) {
    if (!!args[0].teamsAppFromTdp) {
      inputs = getSystemInputs();
      inputs.teamsAppFromTdp = args[0].teamsAppFromTdp;
      stage = Stage.createTdp;
    }
  } else if (args?.length === 2 && args[0] !== TelemetryTriggerFrom.TreeView) {
    // from copilot chat or createDeclarativeAgentWithApiSpec
    inputs = { ...getSystemInputs(), ...args[1] };
  }
  const result = await runCommand(stage, inputs);
  if (result.isErr()) {
    return err(result.error);
  }

  const res = result.value as CreateProjectResult;

  if (res.shouldInvokeTeamsAgent) {
    await invokeTeamsAgent([TelemetryTriggerFrom.CreateAppQuestionFlow]);
    return result;
  }
  const projectPathUri = vscode.Uri.file(res.projectPath);
  const isOfficeAddin = isValidOfficeAddInProject(projectPathUri.fsPath);
  // If it is triggered in @office /create for code gen, then do no open the temp folder.
  if (isOfficeAddin && inputs?.agent === "office") {
    return result;
  }
  // show local debug button by default
  if (isOfficeAddin) {
    await openOfficeDevFolder(projectPathUri, true, res.warnings, args);
  } else {
    await openFolder(projectPathUri, true, res.warnings, args);
  }
  return result;
}

export async function provisionHandler(...args: unknown[]): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ProvisionStart, getTriggerFromProperty(args));
  const result = await runCommand(Stage.provision);
  if (result.isErr() && isUserCancelError(result.error)) {
    return result;
  } else {
    // refresh env tree except provision cancelled
    await envTreeProviderInstance.reloadEnvironments();
    return result;
  }
}

export async function deployHandler(...args: unknown[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DeployStart, getTriggerFromProperty(args));
  return await runCommand(Stage.deploy);
}

export async function publishHandler(...args: unknown[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PublishStart, getTriggerFromProperty(args));
  return await runCommand(Stage.publish);
}

export async function shareHandler(...args: unknown[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShareStart, getTriggerFromProperty(args));
  return await runCommand(Stage.share);
}

export async function shareRemoveHandler(...args: unknown[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShareRemoveStart, getTriggerFromProperty(args));
  return await runCommand(Stage.shareRemove);
}

export async function addWebpartHandler(...args: unknown[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddWebpartStart, getTriggerFromProperty(args));
  return await runCommand(Stage.addWebpart);
}

export async function regeneratePluginHandler(...args: unknown[]) {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.RegenerateActionStart,
    getTriggerFromProperty(args)
  );
  const result = await runCommand(Stage.RegeneratePlugin);
  if (result.isErr()) {
    return err(result.error);
  }
  return result;
}

export async function addPluginHandler(...args: unknown[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddPluginStart, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.KiotaNPMIntegrationEnabled]: featureFlagManager
      .getBooleanValue(FeatureFlags.KiotaNPMIntegration)
      .toString(),
  });
  const result = await runCommand(Stage.addPlugin);
  if (result.isErr()) {
    return err(result.error);
  }
  // For the MCP "Add Action" flow, addPlugin only writes the URL to
  // .vscode/mcp.json. Reuse the same UX as the "DA with MCP" scaffolding
  // flow: open mcp.json and show the "start MCP server / Fetch Action"
  // notification so the user can populate tools afterwards.
  if (result.value && (result.value as { kind?: string }).kind === "mcp") {
    const { openWorkspaceMCPConfigHandler } = await import("./readmeHandlers");
    await openWorkspaceMCPConfigHandler(TelemetryTriggerFrom.Auto);
  }
  return result;
}

export async function addKnowledgeHandler(...args: unknown[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddKnowledgeStart, getTriggerFromProperty(args));
  const result = await runCommand(Stage.addKnowledge);
  if (result.isErr()) {
    return err(result.error);
  }
  return result;
}

export async function addSkillHandler(...args: unknown[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddSkillStart, getTriggerFromProperty(args));
  const result = await runCommand(Stage.addSkill);
  if (result.isErr()) {
    return err(result.error);
  }
  return result;
}

/**
 * scaffold based on app id from Developer Portal
 */
export async function scaffoldFromDeveloperPortalHandler(
  ...args: any[]
): Promise<Result<null, FxError>> {
  if (!args || args.length < 1) {
    // should never happen
    return ok(null);
  }

  const appId = args[0];
  const properties: { [p: string]: string } = {
    teamsAppId: appId,
  };

  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.HandleUrlFromDeveloperProtalStart, properties);
  const loginHint = args.length < 2 ? undefined : args[1];
  const progressBar = VS_CODE_UI.createProgressBar(
    localize("teamstoolkit.devPortalIntegration.checkM365Account.progressTitle"),
    1
  );

  await progressBar.start();
  let token = undefined;
  try {
    const tokenRes = await M365TokenInstance.signInWhenInitiatedFromTdp(
      { scopes: AppStudioScopes() },
      loginHint
    );
    if (tokenRes.isErr()) {
      if ((tokenRes.error as any).displayMessage) {
        void vscode.window.showErrorMessage((tokenRes.error as any).displayMessage);
      } else {
        void vscode.window.showErrorMessage(
          localize("teamstoolkit.devPortalIntegration.generalError.message")
        );
      }
      ExtTelemetry.sendTelemetryErrorEvent(
        TelemetryEvent.HandleUrlFromDeveloperProtal,
        tokenRes.error,
        properties
      );
      await progressBar.end(false);
      return err(tokenRes.error);
    }
    token = tokenRes.value;

    if (!isSovereignHigh()) {
      // set region
      const AuthSvcTokenRes = await M365TokenInstance.getAccessToken({
        scopes: AuthSvcScopes(),
      });
      if (AuthSvcTokenRes.isOk()) {
        await teamsDevPortalClient.setRegionEndpointByToken(AuthSvcTokenRes.value);
      }
    }

    await progressBar.end(true);
  } catch (e) {
    void vscode.window.showErrorMessage(
      localize("teamstoolkit.devPortalIntegration.generalError.message")
    );
    await progressBar.end(false);
    const error = assembleError(e);
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.HandleUrlFromDeveloperProtal,
      error,
      properties
    );
    return err(error);
  }

  let appDefinition;
  try {
    appDefinition = await teamsDevPortalClient.getApp(token, appId);
  } catch (error: any) {
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.HandleUrlFromDeveloperProtal,
      error,
      properties
    );
    void vscode.window.showErrorMessage(
      localize("teamstoolkit.devPortalIntegration.getTeamsAppError.message")
    );
    return err(error);
  }

  const res = await createNewProjectHandler({ teamsAppFromTdp: appDefinition });

  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.HandleUrlFromDeveloperProtal,
      res.error,
      properties
    );
    return err(res.error);
  }

  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.HandleUrlFromDeveloperProtal, properties);
  return ok(null);
}

export async function copilotPluginAddAPIHandler(args: any[]) {
  // Telemetries are handled in runCommand()
  const inputs = getSystemInputs();
  if (args && args.length > 0) {
    const filePath = args[0].fsPath as string;
    const isFromApiPlugin: boolean = args[0].isFromApiPlugin ?? false;
    if (!isFromApiPlugin) {
      // Codelens for API ME. Trigger from manifest.json
      inputs[QuestionNames.ManifestPath] = filePath;
    } else {
      inputs[QuestionNames.ActionType] = ActionStartOptions.apiSpec().id;
      inputs[QuestionNames.DestinationApiSpecFilePath] = filePath;
      inputs[QuestionNames.ManifestPath] = args[0].manifestPath;
    }
  }
  const result = await runCommand(Stage.copilotPluginAddAPI, inputs);
  return result;
}

export async function setSensitivityLabelHandler(args: any[]) {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.SetSensitivityLabelStart,
    getTriggerFromProperty(args)
  );
  const inputs = getSystemInputs();
  inputs[QuestionNames.DeclarativeAgentManifestPath] = args?.[0]?.declarativeAgentManifestPath;
  inputs[QuestionNames.SensitivityLabel] = args?.[0]?.sensitivityLabel;
  const result = await runCommand(Stage.setSensitivityLabel, inputs);
  if (result.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.SetSensitivityLabel,
      result.error,
      getTriggerFromProperty(args)
    );
    return;
  }
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SetSensitivityLabel, getTriggerFromProperty(args));
  return;
}

export async function m365PreAuthHandler(args: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.m365PreAuthStart, getTriggerFromProperty(args));
  const res = await tools.tokenProvider?.m365TokenProvider?.getAccessToken({
    scopes: args[0].scopes,
  });
  if (res.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.m365PreAuth,
      res.error,
      getTriggerFromProperty(args)
    );
    return;
  }
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.m365PreAuth, getTriggerFromProperty(args));
  return;
}

export async function addAuthActionHandler(...args: unknown[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddAuthActionStart, getTriggerFromProperty(args));
  const inputs = getSystemInputs();
  const result = await runCommand(Stage.addAuthAction, inputs);
  void vscode.window
    .showInformationMessage(
      localize("teamstoolkit.handeler.addAuthConfig.notification"),
      localize("teamstoolkit.handeler.addAuthConfig.notification.provision")
    )
    .then((selection) => {
      if (selection === "Provision") {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ProvisionFromAddAuthConfig);
        void runCommand(Stage.provision);
      }
    });
  return result;
}
