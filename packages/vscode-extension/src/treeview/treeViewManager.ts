// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";

import { TreeCategory } from "@microsoft/teamsfx-api";
import { featureFlagManager, FeatureFlags, manifestUtils } from "@microsoft/teamsfx-core";

import { isDeclarativeCopilotApp, isSPFxProject, workspaceUri } from "../globalVariables";
import * as commonUtils from "../utils/commonUtils";
import { localize } from "../utils/localizeUtils";
import accountTreeViewProviderInstance from "./account/accountTreeViewProvider";
import { CommandsTreeViewProvider } from "./commandsTreeViewProvider";
import envTreeProviderInstance from "./environmentTreeViewProvider";
import { CommandStatus, TreeViewCommand } from "./treeViewCommand";

class TreeViewManager {
  private static instance: TreeViewManager;
  private commandMap: Map<string, TreeViewCommand>;

  private treeviewMap: Map<string, any>;
  private treeViewProvidersToUpdate: Set<CommandsTreeViewProvider>;
  private runningCommand: TreeViewCommand | undefined;

  private constructor() {
    this.treeviewMap = new Map();
    this.commandMap = new Map<string, TreeViewCommand>();
    this.treeViewProvidersToUpdate = new Set<CommandsTreeViewProvider>();
  }

  public static getInstance() {
    if (!TreeViewManager.instance) {
      TreeViewManager.instance = new TreeViewManager();
    }
    return TreeViewManager.instance;
  }

  public registerTreeViews(context: vscode.ExtensionContext): void {
    const disposables: vscode.Disposable[] = [];

    this.registerAccount(disposables);
    this.registerEnvironment(disposables);
    this.registerDevelopment(disposables);
    this.registerLifecycle(disposables);
    this.registerUtility(disposables);
    this.registerHelper(disposables);

    context.subscriptions.push(...disposables);
  }

  public async updateTreeViewsByContent(removeProjectRelatedCommands = false): Promise<void> {
    let isTeamsApp = false;
    const manifestRes = await manifestUtils.readAppManifest(workspaceUri?.fsPath || "");
    if (manifestRes.isOk()) {
      isTeamsApp = manifestUtils.getCapabilities(manifestRes.value).length > 0;
    }

    const developmentTreeviewProvider = this.getTreeView(
      "teamsfx-development"
    ) as CommandsTreeViewProvider;
    const developmentCommands = developmentTreeviewProvider.getCommands();

    let developmentRefreshedCommands = this.getDevelopmentCommands();
    if (removeProjectRelatedCommands) {
      const commandsToKeep = [
        "fx-extension.create",
        "fx-extension.openSamples",
        "fx-extension.selectTutorials",
        "fx-extension.invokeChat",
      ];
      developmentRefreshedCommands = developmentRefreshedCommands.filter(
        (command) => command.commandId && commandsToKeep.includes(command.commandId)
      );
    }
    developmentCommands.splice(0);
    developmentCommands.push(...developmentRefreshedCommands);
    developmentTreeviewProvider.refresh();

    const utilityTreeviewProvider = this.getTreeView("teamsfx-utility") as CommandsTreeViewProvider;
    const utilityCommands = utilityTreeviewProvider.getCommands();
    utilityCommands.splice(0);
    utilityCommands.push(...this.getUtilityCommands());

    if (!isTeamsApp) {
      const validateCommandIndex = utilityCommands.findIndex(
        (command) => command.commandId === "fx-extension.publishInDeveloperPortal"
      );
      if (validateCommandIndex >= 0) {
        utilityCommands.splice(validateCommandIndex, 1);
      }
      utilityTreeviewProvider.refresh();
    }
    if (await commonUtils.hasAdaptiveCardInWorkspace()) {
      // after "Preview Your Teams App" command, the adaptive card will be shown
      const utilityTreeviewProvider = this.getTreeView(
        "teamsfx-development"
      ) as CommandsTreeViewProvider;
      const utilityCommands = utilityTreeviewProvider.getCommands();
      const validateCommandIndex = utilityCommands.findIndex(
        (command) => command.commandId === "fx-extension.localdebug"
      );
      if (validateCommandIndex >= 0) {
        utilityCommands.splice(
          validateCommandIndex + 1,
          0,
          new TreeViewCommand(
            localize("teamstoolkit.commandsTreeViewProvider.previewAdaptiveCard"),
            localize("teamstoolkit.commandsTreeViewProvider.previewACDescription"),
            "fx-extension.OpenAdaptiveCardExt",
            undefined,
            { name: "eye", custom: false }
          )
        );
      }
      utilityTreeviewProvider.refresh();
    }
  }

  public updateDevelopmentTreeView(): void {
    const developmentTreeviewProvider = this.getTreeView(
      "teamsfx-development"
    ) as CommandsTreeViewProvider;
    const developmentCommands = developmentTreeviewProvider.getCommands();
    developmentCommands.splice(0);
    developmentCommands.push(...this.getDevelopmentCommands());

    developmentTreeviewProvider.refresh();
  }

  public getTreeView(viewName: string): unknown {
    return this.treeviewMap.get(viewName);
  }

  public setRunningCommand(
    commandName: string,
    blockedCommands: string[],
    blockingTooltip?: string
  ) {
    const command = this.commandMap.get(commandName);
    if (!command) {
      return;
    }
    this.runningCommand = command;
    command.setStatus(CommandStatus.Running);
    for (const blockedCmd of blockedCommands) {
      const blockedCommand = this.commandMap.get(blockedCmd);
      if (blockedCommand) {
        blockedCommand.setStatus(CommandStatus.Blocked, blockingTooltip);
      }
    }
    for (const provider of this.treeViewProvidersToUpdate.values()) {
      provider.refresh();
    }
  }

  public restoreRunningCommand(blockedCommands: string[]) {
    if (!this.runningCommand) {
      return;
    }
    this.runningCommand.setStatus(CommandStatus.Ready);
    for (const blockedCmd of blockedCommands) {
      const blockedCommand = this.commandMap.get(blockedCmd);
      if (blockedCommand) {
        blockedCommand.setStatus(CommandStatus.Ready);
      }
    }
    for (const provider of this.treeViewProvidersToUpdate.values()) {
      provider.refresh();
    }
  }

  public dispose() {
    this.treeviewMap.forEach((value) => {
      (value as vscode.Disposable).dispose();
    });
  }

  private registerAccount(disposables: vscode.Disposable[]) {
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-accounts", accountTreeViewProviderInstance)
    );
    this.treeviewMap.set("teamsfx-accounts", accountTreeViewProviderInstance);
  }

  private registerEnvironment(disposables: vscode.Disposable[]) {
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-environment", envTreeProviderInstance)
    );
    this.treeviewMap.set("teamsfx-environment", envTreeProviderInstance);
  }

  private getDevelopmentCommands(): TreeViewCommand[] {
    const getHelpFromCopilotTitle = localize(
      "teamstoolkit.commandsTreeViewProvider.getCopilotHelpTitle"
    );
    const getHelpFromCopilotCommand = "fx-extension.invokeChat";
    const isKiotaNPMIntegrationEnabled = featureFlagManager.getBooleanValue(
      FeatureFlags.KiotaNPMIntegration
    );

    const treeviewCommands = [
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.createProjectTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.createProjectDescription"),
        "fx-extension.create",
        "createProject",
        { name: "new-folder", custom: false }
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.samplesTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.samplesDescription"),
        "fx-extension.openSamples",
        undefined,
        { name: "library", custom: false },
        TreeCategory.GettingStarted
      ),
      ...(isSPFxProject
        ? [
            new TreeViewCommand(
              localize("teamstoolkit.commandsTreeViewProvider.addWebpartTitle"),
              localize("teamstoolkit.commmands.addWebpart.description"),
              "fx-extension.addWebpart",
              "addWebpart",
              { name: "teamsfx-add-feature", custom: false }
            ),
          ]
        : []),
      ...(isDeclarativeCopilotApp
        ? [
            new TreeViewCommand(
              localize("teamstoolkit.commandsTreeViewProvider.addPluginTitle"),
              localize("teamstoolkit.commandsTreeViewProvider.addPluginDescription"),
              "fx-extension.addPlugin",
              "addPlugin",
              { name: "teamsfx-add-feature", custom: false }
            ),
          ]
        : []),
      ...(isDeclarativeCopilotApp && isKiotaNPMIntegrationEnabled
        ? [
            new TreeViewCommand(
              localize("teamstoolkit.commandsTreeViewProvider.regenerateActionTitle"),
              localize("teamstoolkit.commandsTreeViewProvider.regenerateActionDescription"),
              "fx-extension.regeneratePlugin",
              "regeneratePlugin",
              { name: "teamsfx-regenerate-feature", custom: false }
            ),
          ]
        : []),
      ...(isDeclarativeCopilotApp &&
      featureFlagManager.getBooleanValue(FeatureFlags.AgentSkillsManifest)
        ? [
            new TreeViewCommand(
              localize("teamstoolkit.commandsTreeViewProvider.addSkillTitle"),
              localize("teamstoolkit.commandsTreeViewProvider.addSkillDescription"),
              "fx-extension.addSkill",
              "addSkill",
              { name: "lightbulb", custom: false }
            ),
          ]
        : []),
      ...(isDeclarativeCopilotApp
        ? [
            new TreeViewCommand(
              localize("teamstoolkit.commandsTreeViewProvider.addKnowledgeTitle"),
              localize("teamstoolkit.commandsTreeViewProvider.addKnowledgeDescription"),
              "fx-extension.addKnowledge",
              "addKnowledge",
              { name: "diff-added", custom: false }
            ),
          ]
        : []),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.guideTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.guideDescription"),
        "fx-extension.selectTutorials",
        undefined,
        { name: "notebook", custom: false },
        TreeCategory.GettingStarted
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.previewTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.previewDescription"),
        "fx-extension.localdebug",
        undefined,
        { name: "debug-alt", custom: false }
      ),
      ...(featureFlagManager.getBooleanValue(FeatureFlags.ChatParticipantUIEntries)
        ? [
            new TreeViewCommand(
              getHelpFromCopilotTitle,
              localize("teamstoolkit.commandsTreeViewProvider.getCopilotHelpDescription"),
              getHelpFromCopilotCommand,
              undefined,
              { name: "comment-discussion", custom: false }
            ),
          ]
        : []),
    ];

    return treeviewCommands;
  }

  private getUtilityCommands(): TreeViewCommand[] {
    const utilityCommands = [
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.buildPackageTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.buildPackageDescription"),
        "fx-extension.build",
        "buildPackage",
        { name: "package", custom: false }
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.validateApplicationTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.validateApplicationDescription"),
        "fx-extension.validateManifest",
        undefined,
        { name: "beaker", custom: false }
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.publishInDevPortalTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.publishInDevPortalDescription"),
        "fx-extension.publishInDeveloperPortal",
        "publish",
        { name: "teamsfx-developer-portal", custom: false }
      ),
    ];

    return utilityCommands;
  }

  private registerDevelopment(disposables: vscode.Disposable[]) {
    const developmentCommands = this.getDevelopmentCommands();

    const developmentProvider = new CommandsTreeViewProvider(developmentCommands);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-development", developmentProvider)
    );
    this.storeCommandsIntoMap(developmentCommands);
    this.treeviewMap.set("teamsfx-development", developmentProvider);
    this.treeViewProvidersToUpdate.add(developmentProvider);
  }

  private registerLifecycle(disposables: vscode.Disposable[]) {
    const deployCommand = [
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.provisionTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.provisionDescription"),
        "fx-extension.provision",
        "provision",
        { name: "type-hierarchy", custom: false }
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.deployTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.deployDescription"),
        "fx-extension.deploy",
        "deploy",
        { name: "cloud-upload", custom: false }
      ),
      ...(isDeclarativeCopilotApp
        ? [
            new TreeViewCommand(
              localize("teamstoolkit.commandsTreeViewProvider.shareTitle"),
              localize("teamstoolkit.commandsTreeViewProvider.shareDescription"),
              "fx-extension.share",
              "share",
              { name: "share", custom: false }
            ),
          ]
        : []),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.publishTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.publishDescription"),
        "fx-extension.publish",
        "publish",
        { name: "export", custom: false }
      ),
    ];

    const deployProvider = new CommandsTreeViewProvider(deployCommand);
    disposables.push(vscode.window.registerTreeDataProvider("teamsfx-lifecycle", deployProvider));
    this.storeCommandsIntoMap(deployCommand);
    this.treeviewMap.set("teamsfx-lifecycle", deployProvider);
    this.treeViewProvidersToUpdate.add(deployProvider);
  }

  private registerUtility(disposables: vscode.Disposable[]) {
    const utilityCommands = this.getUtilityCommands();

    const utilityProvider = new CommandsTreeViewProvider(utilityCommands);
    disposables.push(vscode.window.registerTreeDataProvider("teamsfx-utility", utilityProvider));
    this.storeCommandsIntoMap(utilityCommands);
    this.treeviewMap.set("teamsfx-utility", utilityProvider);
    this.treeViewProvidersToUpdate.add(utilityProvider);
  }

  private registerHelper(disposables: vscode.Disposable[]) {
    const helpCommand = [
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.documentationTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.documentationDescription"),
        "fx-extension.openDocument",
        undefined,
        { name: "book", custom: false },
        TreeCategory.GettingStarted
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.getStartedTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.getStarted"),
        "fx-extension.openWelcome",
        undefined,
        { name: "symbol-event", custom: false },
        TreeCategory.GettingStarted
      ),
      new TreeViewCommand(
        localize("teamstoolkit.commandsTreeViewProvider.reportIssuesTitle"),
        localize("teamstoolkit.commandsTreeViewProvider.reportIssuesDescription"),
        "fx-extension.openReportIssues",
        undefined,
        { name: "github", custom: false },
        TreeCategory.Feedback
      ),
    ];
    const helpProvider = new CommandsTreeViewProvider(helpCommand);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-help-and-feedback", helpProvider)
    );
    this.storeCommandsIntoMap(helpCommand);
    this.treeviewMap.set("teamsfx-help-and-feedback", helpProvider);
  }

  private storeCommandsIntoMap(commands: TreeViewCommand[]) {
    for (const command of commands) {
      if (command.commandId) {
        this.commandMap.set(command.commandId, command);
      }
    }
  }
}

export default TreeViewManager.getInstance();
