// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import {
  commands,
  Uri,
  window,
  workspace,
  ExtensionContext,
  env,
  debug,
  QuickPickItem,
} from "vscode";
import {
  Result,
  FxError,
  err,
  ok,
  Stage,
  Platform,
  Func,
  UserError,
  SystemError,
  returnSystemError,
  Inputs,
  VsCodeEnv,
  AppStudioTokenProvider,
  Void,
  Tools,
  AzureSolutionSettings,
} from "@microsoft/teamsfx-api";
import {
  isUserCancelError,
  FxCore,
  InvalidProjectError,
  isValidProject,
  globalStateUpdate,
  globalStateGet,
  Correlator,
  getAppDirectory,
} from "@microsoft/teamsfx-core";
import GraphManagerInstance from "./commonlib/graphLogin";
import AzureAccountManager from "./commonlib/azureLogin";
import AppStudioTokenInstance from "./commonlib/appStudioLogin";
import AppStudioCodeSpaceTokenInstance from "./commonlib/appStudioCodeSpaceLogin";
import VsCodeLogInstance from "./commonlib/log";
import { TreeViewCommand } from "./commandsTreeViewProvider";
import TreeViewManagerInstance from "./commandsTreeViewProvider";
import { ExtTelemetry } from "./telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTiggerFrom,
  TelemetrySuccess,
  AccountType,
  TelemetryUpdateAppReason,
} from "./telemetry/extTelemetryEvents";
import * as commonUtils from "./debug/commonUtils";
import { ExtensionErrors, ExtensionSource } from "./error";
import { WebviewPanel } from "./controls/webviewPanel";
import * as constants from "./debug/constants";
import { anonymizeFilePaths, isSPFxProject, syncFeatureFlags } from "./utils/commonUtils";
import * as fs from "fs-extra";
import * as vscode from "vscode";
import { DepsChecker } from "./debug/depsChecker/checker";
import { BackendExtensionsInstaller } from "./debug/depsChecker/backendExtensionsInstall";
import { DotnetChecker } from "./debug/depsChecker/dotnetChecker";
import { FuncToolChecker } from "./debug/depsChecker/funcToolChecker";
import * as util from "util";
import * as StringResources from "./resources/Strings.json";
import { vscodeAdapter } from "./debug/depsChecker/vscodeAdapter";
import { vscodeLogger } from "./debug/depsChecker/vscodeLogger";
import { vscodeTelemetry } from "./debug/depsChecker/vscodeTelemetry";
import { PanelType } from "./controls/PanelType";
import { signedIn, signedOut } from "./commonlib/common/constant";
import { AzureNodeChecker } from "./debug/depsChecker/azureNodeChecker";
import { SPFxNodeChecker } from "./debug/depsChecker/spfxNodeChecker";
import { terminateAllRunningTeamsfxTasks } from "./debug/teamsfxTaskHandler";
import { VS_CODE_UI } from "./extension";
import { registerAccountTreeHandler } from "./accountTree";
import { registerEnvTreeHandler } from "./envTree";
import { selectAndDebug } from "./debug/runIconHandler";
import * as path from "path";
import { exp } from "./exp/index";
import { TreatmentVariables } from "./exp/treatmentVariables";
import { StringContext } from "./utils/stringContext";

export let core: FxCore;
export let tools: Tools;
export function getWorkspacePath(): string | undefined {
  const workspacePath: string | undefined = workspace.workspaceFolders?.length
    ? workspace.workspaceFolders[0].uri.fsPath
    : undefined;
  return workspacePath;
}

export async function activate(): Promise<Result<Void, FxError>> {
  const result: Result<Void, FxError> = ok(Void);
  try {
    syncFeatureFlags();

    if (isValidProject(getWorkspacePath())) {
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenTeamsApp, {});
    }

    const telemetry = ExtTelemetry.reporter;
    AzureAccountManager.setStatusChangeMap(
      "successfully-sign-in-azure",
      (status, token, accountInfo) => {
        if (status === signedIn) {
          window.showInformationMessage(StringResources.vsc.handlers.azureSignIn);
        } else if (status === signedOut) {
          window.showInformationMessage(StringResources.vsc.handlers.azureSignOut);
        }
        return Promise.resolve();
      },
      false
    );
    let appstudioLogin: AppStudioTokenProvider = AppStudioTokenInstance;
    const vscodeEnv = detectVsCodeEnv();
    if (vscodeEnv === VsCodeEnv.codespaceBrowser || vscodeEnv === VsCodeEnv.codespaceVsCode) {
      appstudioLogin = AppStudioCodeSpaceTokenInstance;
    }

    appstudioLogin.setStatusChangeMap(
      "successfully-sign-in-m365",
      (status, token, accountInfo) => {
        if (status === signedIn) {
          window.showInformationMessage(StringResources.vsc.handlers.m365SignIn);
        } else if (status === signedOut) {
          window.showInformationMessage(StringResources.vsc.handlers.m365SignOut);
        }
        return Promise.resolve();
      },
      false
    );
    tools = {
      logProvider: VsCodeLogInstance,
      tokenProvider: {
        azureAccountProvider: AzureAccountManager,
        graphTokenProvider: GraphManagerInstance,
        appStudioToken: appstudioLogin,
      },
      telemetryReporter: telemetry,
      treeProvider: TreeViewManagerInstance.getTreeView("teamsfx-accounts")!,
      ui: VS_CODE_UI,
    };
    core = new FxCore(tools);
    await registerAccountTreeHandler();
    await registerEnvTreeHandler();
    await openMarkdownHandler();
    await openSampleReadmeHandler();
  } catch (e) {
    const FxError: FxError = {
      name: e.name,
      source: ExtensionSource,
      message: e.message,
      stack: e.stack,
      timestamp: new Date(),
    };
    showError(FxError);
    return err(FxError);
  }
  return result;
}

export async function getAzureSolutionSettings(): Promise<AzureSolutionSettings | undefined> {
  const input = getSystemInputs();
  input.ignoreEnvInfo = true;
  const projectConfigRes = await core.getProjectConfig(input);

  if (projectConfigRes.isOk()) {
    if (projectConfigRes.value) {
      return projectConfigRes.value.settings?.solutionSettings as AzureSolutionSettings;
    }
  }
  // else {
  //   showError(projectConfigRes.error);
  // }
  return undefined;
}

export function getSystemInputs(): Inputs {
  const answers: Inputs = {
    projectPath: getWorkspacePath(),
    platform: Platform.VSCode,
    vscodeEnv: detectVsCodeEnv(),
    "function-dotnet-checker-enabled": vscodeAdapter.dotnetCheckerEnabled(),
  };
  return answers;
}

export async function createNewProjectHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CreateProjectStart, getTriggerFromProperty(args));
  return await runCommand(Stage.create);
}

export async function migrateV1ProjectHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.MigrateV1ProjectStart,
    getTriggerFromProperty(args)
  );
  return await runCommand(Stage.migrateV1);
}

export async function selectAndDebugHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.RunIconDebugStart);
  const result = await selectAndDebug();
  await processResult(TelemetryEvent.RunIconDebug, result);
  return result;
}

export async function addResourceHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddResourceStart, getTriggerFromProperty(args));
  const func: Func = {
    namespace: "fx-solution-azure",
    method: "addResource",
  };
  return await runUserTask(func, TelemetryEvent.AddResource);
}

export async function addCapabilityHandler(args: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddCapStart, getTriggerFromProperty(args));
  const func: Func = {
    namespace: "fx-solution-azure",
    method: "addCapability",
  };
  return await runUserTask(func, TelemetryEvent.AddCap);
}

export async function validateManifestHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.ValidateManifestStart,
    getTriggerFromProperty(args)
  );

  const func: Func = {
    namespace: "fx-solution-azure",
    method: "validateManifest",
  };
  return await runUserTask(func, TelemetryEvent.ValidateManifest);
}

export async function buildPackageHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.BuildStart, getTriggerFromProperty(args));

  const func: Func = {
    namespace: "fx-solution-azure",
    method: "buildPackage",
  };
  return await runUserTask(func, TelemetryEvent.Build);
}

export async function provisionHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ProvisionStart, getTriggerFromProperty(args));
  return await runCommand(Stage.provision);
}

export async function deployHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DeployStart, getTriggerFromProperty(args));
  return await runCommand(Stage.deploy);
}

export async function publishHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PublishStart, getTriggerFromProperty(args));
  return await runCommand(Stage.publish);
}

export async function cicdGuideHandler(args?: any[]): Promise<boolean> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CICDGuide, getTriggerFromProperty(args));
  return await env.openExternal(Uri.parse("https://aka.ms/teamsfx-cicd-guide"));
}

export async function runCommand(stage: Stage): Promise<Result<any, FxError>> {
  const eventName = ExtTelemetry.stageToEvent(stage);
  let result: Result<any, FxError> = ok(null);
  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }

    const inputs: Inputs = getSystemInputs();
    inputs.stage = stage;

    if (stage === Stage.create) {
      const tmpResult = await core.createProject(inputs);
      if (tmpResult.isErr()) {
        result = err(tmpResult.error);
      } else {
        const uri = Uri.file(tmpResult.value);
        await commands.executeCommand("vscode.openFolder", uri);
        result = ok(null);
      }
    } else if (stage === Stage.migrateV1) {
      const tmpResult = await core.migrateV1Project(inputs);
      if (tmpResult.isErr()) {
        result = err(tmpResult.error);
      } else {
        const uri = Uri.file(tmpResult.value);
        await commands.executeCommand("vscode.openFolder", uri);
        result = ok(null);
      }
    } else if (stage === Stage.provision) result = await core.provisionResources(inputs);
    else if (stage === Stage.deploy) result = await core.deployArtifacts(inputs);
    else if (stage === Stage.debug) result = await core.localDebug(inputs);
    else if (stage === Stage.publish) result = await core.publishApplication(inputs);
    else if (stage === Stage.createEnv) {
      result = await core.createEnv(inputs);
    } else {
      throw new SystemError(
        ExtensionErrors.UnsupportedOperation,
        util.format(StringResources.vsc.handlers.operationNotSupport, stage),
        ExtensionSource
      );
    }
  } catch (e) {
    result = wrapError(e);
  }
  await processResult(eventName, result);

  return result;
}

export function detectVsCodeEnv(): VsCodeEnv {
  // extensionKind returns ExtensionKind.UI when running locally, so use this to detect remote
  const extension = vscode.extensions.getExtension("TeamsDevApp.ms-teams-vscode-extension");

  if (extension?.extensionKind === vscode.ExtensionKind.Workspace) {
    // running remotely
    // Codespaces browser-based editor will return UIKind.Web for uiKind
    if (vscode.env.uiKind === vscode.UIKind.Web) {
      return VsCodeEnv.codespaceBrowser;
    } else if (vscode.env.remoteName === "codespaces") {
      return VsCodeEnv.codespaceVsCode;
    } else {
      return VsCodeEnv.remote;
    }
  } else {
    // running locally
    return VsCodeEnv.local;
  }
}

async function runUserTask(func: Func, eventName: string): Promise<Result<any, FxError>> {
  let result: Result<any, FxError> = ok(null);
  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }
    const answers: Inputs = getSystemInputs();
    result = await core.executeUserTask(func, answers);
  } catch (e) {
    result = wrapError(e);
  }

  await processResult(eventName, result);

  return result;
}

//TODO workaround
function isLoginFaiureError(error: FxError): boolean {
  return !!error.message && error.message.includes("Cannot get user login information");
}

async function processResult(eventName: string | undefined, result: Result<null, FxError>) {
  if (result.isErr()) {
    if (eventName) {
      ExtTelemetry.sendTelemetryErrorEvent(eventName, result.error);
    }
    const error = result.error;
    if (isUserCancelError(error)) {
      return;
    }
    if (isLoginFaiureError(error)) {
      window.showErrorMessage(StringResources.vsc.handlers.loginFailed);
      return;
    }
    showError(error);
  } else {
    if (eventName) {
      ExtTelemetry.sendTelemetryEvent(eventName, {
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      });
    }
  }
}

function wrapError(e: Error): Result<null, FxError> {
  if (
    e instanceof UserError ||
    e instanceof SystemError ||
    (e.constructor &&
      e.constructor.name &&
      (e.constructor.name === "SystemError" || e.constructor.name === "UserError"))
  ) {
    return err(e as FxError);
  }
  return err(returnSystemError(e, ExtensionSource, ExtensionErrors.UnknwonError));
}

function checkCoreNotEmpty(): Result<null, SystemError> {
  if (!core) {
    return err(
      returnSystemError(
        new Error(StringResources.vsc.handlers.coreNotReady),
        ExtensionSource,
        ExtensionErrors.UnsupportedOperation
      )
    );
  }
  return ok(null);
}

/**
 * check & install required dependencies during local debug when selected hosting type is Azure.
 */
export async function validateDependenciesHandler(): Promise<void> {
  const nodeChecker = new AzureNodeChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const dotnetChecker = new DotnetChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const funcChecker = new FuncToolChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const depsChecker = new DepsChecker(vscodeLogger, vscodeAdapter, [
    nodeChecker,
    dotnetChecker,
    funcChecker,
  ]);
  await validateDependenciesCore(depsChecker);
}

/**
 * check & install required dependencies during local debug when selected hosting type is SPFx.
 */
export async function validateSpfxDependenciesHandler(): Promise<void> {
  const nodeChecker = new SPFxNodeChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const depsChecker = new DepsChecker(vscodeLogger, vscodeAdapter, [nodeChecker]);
  await validateDependenciesCore(depsChecker);
}

async function validateDependenciesCore(depsChecker: DepsChecker): Promise<void> {
  const shouldContinue = await depsChecker.resolve();
  if (!shouldContinue) {
    await debug.stopDebugging();
    // TODO: better mechanism to stop the tasks and debug session.
    throw new Error("debug stopped.");
  }
}

/**
 * install functions binding before launch local debug
 */
export async function backendExtensionsInstallHandler(): Promise<void> {
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const workspaceFolder = workspace.workspaceFolders[0];
    const backendRoot = await commonUtils.getProjectRoot(
      workspaceFolder.uri.fsPath,
      constants.backendFolderName
    );

    if (backendRoot) {
      const dotnetChecker = new DotnetChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
      const backendExtensionsInstaller = new BackendExtensionsInstaller(
        dotnetChecker,
        vscodeLogger
      );

      try {
        await backendExtensionsInstaller.install(backendRoot);
      } catch (error) {
        await DepsChecker.handleErrorWithDisplay(error, vscodeAdapter);
        throw error;
      }
    }
  }
}

/**
 * call localDebug on core
 */
export async function preDebugCheckHandler(): Promise<void> {
  try {
    const localAppId = commonUtils.getLocalTeamsAppId() as string;
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DebugPreCheck, {
      [TelemetryProperty.DebugAppId]: localAppId,
    });
  } catch {
    // ignore telemetry error
  }

  let result: Result<any, FxError> = ok(null);
  result = await runCommand(Stage.debug);
  if (result.isErr()) {
    try {
      const localAppId = commonUtils.getLocalTeamsAppId() as string;
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.DebugPreCheck, result.error, {
        [TelemetryProperty.DebugAppId]: localAppId,
      });
    } finally {
      // ignore telemetry error
      terminateAllRunningTeamsfxTasks();
      throw result.error;
    }
  }

  const portsInUse = await commonUtils.getPortsInUse();
  if (portsInUse.length > 0) {
    let message: string;
    if (portsInUse.length > 1) {
      message = util.format(
        StringResources.vsc.localDebug.portsAlreadyInUse,
        portsInUse.join(", ")
      );
    } else {
      message = util.format(StringResources.vsc.localDebug.portAlreadyInUse, portsInUse[0]);
    }
    const error = new UserError(ExtensionErrors.PortAlreadyInUse, message, ExtensionSource);
    try {
      const localAppId = commonUtils.getLocalTeamsAppId() as string;
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.DebugPreCheck, error, {
        [TelemetryProperty.DebugAppId]: localAppId,
      });
    } finally {
      // ignore telemetry error
      window.showErrorMessage(message);
      terminateAllRunningTeamsfxTasks();
      throw error;
    }
  }
}

export async function openDocumentHandler(args: any[]): Promise<boolean> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://aka.ms/teamsfx-build-first-app"));
}

export async function openWelcomeHandler(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.QuickStart, getTriggerFromProperty(args));
  WebviewPanel.createOrShow(PanelType.QuickStart);
}

function getTriggerFromProperty(args?: any[]) {
  if (!args) {
    return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.CommandPalette };
  }

  switch (args.toString()) {
    case TelemetryTiggerFrom.TreeView:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.TreeView };
    case TelemetryTiggerFrom.Webview:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Webview };
    default:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Other };
  }
}

async function openMarkdownHandler() {
  const afterScaffold = globalStateGet("openReadme", false);
  if (afterScaffold && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    await globalStateUpdate("openReadme", false);
    const workspaceFolder = workspace.workspaceFolders[0];
    const workspacePath: string = workspaceFolder.uri.fsPath;
    let targetFolder: string | undefined;
    if (await isSPFxProject(workspacePath)) {
      targetFolder = `${workspacePath}/SPFx`;
    } else {
      const tabFolder = await commonUtils.getProjectRoot(
        workspacePath,
        constants.frontendFolderName
      );
      const botFolder = await commonUtils.getProjectRoot(workspacePath, constants.botFolderName);
      if (tabFolder && botFolder) {
        targetFolder = workspacePath;
      } else if (tabFolder) {
        targetFolder = tabFolder;
      } else {
        targetFolder = botFolder;
      }
    }
    const uri = Uri.file(`${targetFolder}/README.md`);
    workspace.openTextDocument(uri).then(() => {
      const PreviewMarkdownCommand = "markdown.showPreview";
      commands.executeCommand(PreviewMarkdownCommand, uri);
    });
  }
}

async function openSampleReadmeHandler() {
  const afterScaffold = globalStateGet("openSampleReadme", false);
  if (afterScaffold && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    globalStateUpdate("openSampleReadme", false);
    const workspaceFolder = workspace.workspaceFolders[0];
    const workspacePath: string = workspaceFolder.uri.fsPath;
    const uri = Uri.file(`${workspacePath}/README.md`);
    workspace.openTextDocument(uri).then(() => {
      const PreviewMarkdownCommand = "markdown.showPreview";
      commands.executeCommand(PreviewMarkdownCommand, uri);
    });
  }
}

export async function openSamplesHandler(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Samples, getTriggerFromProperty(args));
  WebviewPanel.createOrShow(PanelType.SampleGallery);
}

export async function openAppManagement(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ManageTeamsApp, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://dev.teams.microsoft.com/home"));
}

export async function openBotManagement(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ManageTeamsBot, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://dev.teams.microsoft.com/bots"));
}

export async function openReportIssues(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ReportIssues, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://github.com/OfficeDev/TeamsFx/issues"));
}

export async function openManifestHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.OpenManifestEditorStart,
    getTriggerFromProperty(args)
  );
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const workspaceFolder = workspace.workspaceFolders[0];
    const projectRoot = await commonUtils.getProjectRoot(workspaceFolder.uri.fsPath, "");
    const appDirectory = await getAppDirectory(projectRoot!);
    if (!(await fs.pathExists(appDirectory))) {
      const invalidProjectError: FxError = InvalidProjectError();
      showError(invalidProjectError);
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, invalidProjectError);
      return err(invalidProjectError);
    }
    const manifestFile = `${appDirectory}/${constants.manifestFileName}`;
    if (fs.existsSync(manifestFile)) {
      workspace.openTextDocument(manifestFile).then((document) => {
        window.showTextDocument(document);
      });
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenManifestEditor, {
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
      });
      return ok(null);
    } else {
      const FxError: FxError = {
        name: "FileNotFound",
        source: ExtensionSource,
        message: util.format(StringResources.vsc.handlers.fileNotFound, manifestFile),
        timestamp: new Date(),
      };
      showError(FxError);
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, FxError);
      return err(FxError);
    }
  } else {
    const FxError: FxError = {
      name: "NoWorkspace",
      source: ExtensionSource,
      message: StringResources.vsc.handlers.noOpenWorkspace,
      timestamp: new Date(),
    };
    showError(FxError);
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, FxError);
    return err(FxError);
  }
}

export async function createNewEnvironment(args?: any[]): Promise<Result<Void, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.CreateNewEnvironmentStart,
    getTriggerFromProperty(args)
  );
  const result = await runCommand(Stage.createEnv);
  if (!result.isErr()) {
    registerEnvTreeHandler();
  }
  return result;
}

export async function viewEnvironment(args?: any[]): Promise<Result<Void, FxError>> {
  // todo add view logic
  return ok(Void);
}

export async function activateEnvironment(args?: any[]): Promise<Result<Void, FxError>> {
  // todo add acitvate logic
  return ok(Void);
}

export async function openM365AccountHandler() {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenM365Portal);
  return env.openExternal(Uri.parse("https://admin.microsoft.com/Adminportal/"));
}

export async function openAzureAccountHandler() {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenAzurePortal);
  return env.openExternal(Uri.parse("https://portal.azure.com/"));
}

export function saveTextDocumentHandler(document: vscode.TextDocumentWillSaveEvent) {
  if (!isValidProject(getWorkspacePath())) {
    return;
  }

  let reason: TelemetryUpdateAppReason | undefined = undefined;
  switch (document.reason) {
    case vscode.TextDocumentSaveReason.Manual:
      reason = TelemetryUpdateAppReason.Manual;
      break;
    case vscode.TextDocumentSaveReason.AfterDelay:
      reason = TelemetryUpdateAppReason.AfterDelay;
      break;
    case vscode.TextDocumentSaveReason.FocusOut:
      reason = TelemetryUpdateAppReason.FocusOut;
      break;
  }

  let curDirectory = path.dirname(document.document.fileName);
  while (curDirectory) {
    if (isValidProject(curDirectory)) {
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.UpdateTeamsApp, {
        [TelemetryProperty.UpdateTeamsAppReason]: reason,
      });
      return;
    }

    if (curDirectory === path.join(curDirectory, "..")) {
      break;
    }
    curDirectory = path.join(curDirectory, "..");
  }
}

export async function cmdHdlLoadTreeView(context: ExtensionContext) {
  if (
    (await exp
      .getExpService()
      .getTreatmentVariableAsync(
        TreatmentVariables.VSCodeConfig,
        TreatmentVariables.DynamicTreeView,
        true
      )) &&
    !isValidProject(getWorkspacePath())
  ) {
    const disposables = await TreeViewManagerInstance.registerEmptyProjectTreeViews();
    context.subscriptions.push(...disposables);
  } else {
    const disposables = await TreeViewManagerInstance.registerTreeViews();
    context.subscriptions.push(...disposables);
  }

  // Register SignOut tree view command
  commands.registerCommand("fx-extension.signOut", async (node: TreeViewCommand) => {
    try {
      switch (node.contextValue) {
        case "signedinM365": {
          Correlator.run(() => {
            signOutM365(true);
          });
          break;
        }
        case "signedinAzure": {
          Correlator.run(() => {
            signOutAzure(true);
          });
          break;
        }
      }
    } catch (e) {
      showError(e);
    }
  });

  commands.registerCommand("fx-extension.signInGuideline", async (node: TreeViewCommand) => {
    // TODO: update the link when documentation is ready
    switch (node.contextValue) {
      case "signinM365": {
        await env.openExternal(Uri.parse("https://www.office.com/"));
        break;
      }
      case "signinAzure": {
        await env.openExternal(Uri.parse("https://portal.azure.com/"));
        break;
      }
    }
  });
}

export function cmdHdlDisposeTreeView() {
  TreeViewManagerInstance.dispose();
}

export async function showError(e: UserError | SystemError) {
  if (e.stack) {
    VsCodeLogInstance.error(`code:${e.source}.${e.name}, message: ${e.message}, stack: ${e.stack}`);
  } else {
    VsCodeLogInstance.error(`code:${e.source}.${e.name}, message: ${e.message}`);
  }

  const errorCode = `${e.source}.${e.name}`;
  if (isUserCancelError(e)) {
    return;
  } else if ("helpLink" in e && e.helpLink && typeof e.helpLink != "undefined") {
    const help = {
      title: StringResources.vsc.handlers.getHelp,
      run: async (): Promise<void> => {
        commands.executeCommand("vscode.open", Uri.parse(`${e.helpLink}#${e.source}${e.name}`));
      },
    };

    const button = await window.showErrorMessage(`[${errorCode}]: ${e.message}`, help);
    if (button) await button.run();
  } else if (e instanceof SystemError) {
    const sysError = e as SystemError;
    const path = "https://github.com/OfficeDev/TeamsFx/issues/new?";
    const param = `title=bug+report: ${errorCode}&body=${anonymizeFilePaths(
      e.message
    )}\n\nstack:\n${anonymizeFilePaths(e.stack)}\n\n${
      sysError.userData ? anonymizeFilePaths(sysError.userData) : ""
    }`;
    const issue = {
      title: StringResources.vsc.handlers.reportIssue,
      run: async (): Promise<void> => {
        commands.executeCommand("vscode.open", Uri.parse(`${path}${param}`));
      },
    };

    const button = await window.showErrorMessage(`[${errorCode}]: ${e.message}`, issue);
    if (button) await button.run();
  } else {
    await window.showErrorMessage(`[${errorCode}]: ${e.message}`);
  }
}

export async function cmpAccountsHandler() {
  const signInAzureOption: VscQuickPickItem = {
    id: "signInAzure",
    label: StringResources.vsc.handlers.signInAzure,
    function: () => signInAzure(),
  };

  const signOutAzureOption: VscQuickPickItem = {
    id: "signOutAzure",
    label: StringResources.vsc.handlers.signOutOfAzure,
    function: async () =>
      Correlator.run(() => {
        signOutAzure(false);
      }),
  };

  const signInM365Option: VscQuickPickItem = {
    id: "signinM365",
    label: StringResources.vsc.handlers.signIn365,
    function: () => signInM365(),
  };

  const signOutM365Option: VscQuickPickItem = {
    id: "signOutM365",
    label: StringResources.vsc.handlers.signOutOfM365,
    function: async () =>
      Correlator.run(() => {
        signOutM365(false);
      }),
  };

  //TODO: hide subscription list until core or api expose the get subscription list API
  // let selectSubscriptionOption: VscQuickPickItem = {
  //   id: "selectSubscription",
  //   label: "Specify an Azure Subscription",
  //   function: () => selectSubscription(),
  //   detail: "4 subscriptions discovered"
  // };

  const quickPick = window.createQuickPick();

  const quickItemOptionArray: VscQuickPickItem[] = [];

  const m365Account = await AppStudioTokenInstance.getStatus();
  if (m365Account.status === "SignedIn") {
    const accountInfo = m365Account.accountInfo;
    const email = (accountInfo as any).upn ? (accountInfo as any).upn : undefined;
    if (email !== undefined) {
      signOutM365Option.label = signOutM365Option.label.concat(email);
    }
    quickItemOptionArray.push(signOutM365Option);
  } else {
    quickItemOptionArray.push(signInM365Option);
  }

  const solutionSettings = await getAzureSolutionSettings();
  if (solutionSettings && "Azure" === solutionSettings.hostType) {
    const azureAccount = await AzureAccountManager.getStatus();
    if (azureAccount.status === "SignedIn") {
      const accountInfo = azureAccount.accountInfo;
      const email = (accountInfo as any).upn ? (accountInfo as any).upn : undefined;
      if (email !== undefined) {
        signOutAzureOption.label = signOutAzureOption.label.concat(email);
      }
      quickItemOptionArray.push(signOutAzureOption);
      //quickItemOptionArray.push(selectSubscriptionOption);
    } else {
      quickItemOptionArray.push(signInAzureOption);
    }
  }

  quickPick.items = quickItemOptionArray;
  quickPick.onDidChangeSelection((selection) => {
    if (selection[0]) {
      (selection[0] as VscQuickPickItem).function().catch(console.error);
    }
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

export async function decryptSecret(cipher: string, selection: vscode.Range): Promise<void> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.EditSecretStart, {
    [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Other,
  });
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const inputs = getSystemInputs();
  const result = await core.decrypt(cipher, inputs);
  if (result.isOk()) {
    const editedSecret = await VS_CODE_UI.inputText({
      name: "Secret Editor",
      title: StringResources.vsc.handlers.editSecretTitle,
      default: result.value,
    });
    if (editedSecret.isOk() && editedSecret.value.result) {
      const newCiphertext = await core.encrypt(editedSecret.value.result, inputs);
      if (newCiphertext.isOk()) {
        editor.edit((editBuilder) => {
          editBuilder.replace(selection, newCiphertext.value);
        });
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.EditSecret, {
          [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        });
      } else {
        ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.EditSecret, newCiphertext.error);
      }
    }
  } else {
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.EditSecret, result.error);
    window.showErrorMessage(StringResources.vsc.handlers.decryptFailed);
  }
}

export async function signOutAzure(isFromTreeView: boolean) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SignOutStart, {
    [TelemetryProperty.TriggerFrom]: isFromTreeView
      ? TelemetryTiggerFrom.TreeView
      : TelemetryTiggerFrom.CommandPalette,
    [TelemetryProperty.AccountType]: AccountType.Azure,
  });
  const result = await AzureAccountManager.signout();
  if (result) {
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.refresh([
      {
        commandId: "fx-extension.signinAzure",
        label: StringContext.getSignInAzureContext(),
        contextValue: "signinAzure",
      },
    ]);
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.remove([
      {
        commandId: "fx-extension.selectSubscription",
        label: "",
        parent: "fx-extension.signinAzure",
      },
    ]);
  }
}

export async function signOutM365(isFromTreeView: boolean) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SignOutStart, {
    [TelemetryProperty.TriggerFrom]: isFromTreeView
      ? TelemetryTiggerFrom.TreeView
      : TelemetryTiggerFrom.CommandPalette,
    [TelemetryProperty.AccountType]: AccountType.M365,
  });
  let appstudioLogin: AppStudioTokenProvider = AppStudioTokenInstance;
  const vscodeEnv = detectVsCodeEnv();
  if (vscodeEnv === VsCodeEnv.codespaceBrowser || vscodeEnv === VsCodeEnv.codespaceVsCode) {
    appstudioLogin = AppStudioCodeSpaceTokenInstance;
  }
  const result = await appstudioLogin.signout();
  if (result) {
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.refresh([
      {
        commandId: "fx-extension.signinM365",
        label: StringResources.vsc.handlers.signIn365,
        contextValue: "signinM365",
      },
    ]);
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.remove([
      {
        commandId: "fx-extension.checkSideloading",
        label: "",
        parent: "fx-extension.signinM365",
      },
    ]);
  }
}

export async function signInAzure() {
  vscode.commands.executeCommand("fx-extension.signinAzure");
}

export async function signInM365() {
  vscode.commands.executeCommand("fx-extension.signinM365");
}

export async function selectSubscription() {
  vscode.commands.executeCommand("fx-extension.specifySubscription");
}

export interface VscQuickPickItem extends QuickPickItem {
  /**
   * Current id of the option item.
   */
  id: string;

  function: () => Promise<void>;
}
