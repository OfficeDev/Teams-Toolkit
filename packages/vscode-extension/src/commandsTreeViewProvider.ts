// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as path from "path";
import { ext } from "./extensionVariables";
import { TreeItem, TreeCategory, Result, FxError, ok } from "@microsoft/teamsfx-api";
import * as StringResources from "./resources/Strings.json";
import { Correlator } from "@microsoft/teamsfx-core";

class TreeViewManager {
  private static instance: TreeViewManager;
  private treeviewMap: Map<string, any>;

  private constructor() {
    this.treeviewMap = new Map();
  }

  public static getInstance() {
    if (!TreeViewManager.instance) {
      TreeViewManager.instance = new TreeViewManager();
    }
    return TreeViewManager.instance;
  }

  public async registerTreeViews() {
    const disposables = [];

    const accountProvider = new CommandsTreeViewProvider([]);
    disposables.push(vscode.window.registerTreeDataProvider("teamsfx-accounts", accountProvider));

    const environmentProvider = new CommandsTreeViewProvider([]);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-environment", environmentProvider)
    );

    const developmentCommand = [
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.createProjectTitleNew,
        StringResources.vsc.commandsTreeViewProvider.createProjectDescription,
        "fx-extension.create",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "new-folder", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.samplesTitleNew,
        StringResources.vsc.commandsTreeViewProvider.samplesDescription,
        "fx-extension.openSamples",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.GettingStarted,
        undefined,
        { name: "library", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.addCapabilitiesTitleNew,
        StringResources.vsc.commandsTreeViewProvider.addCapabilitiesDescription,
        "fx-extension.addCapability",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "addCapability", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.addResourcesTitleNew,
        StringResources.vsc.commandsTreeViewProvider.addResourcesDescription,
        "fx-extension.update",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "addResources", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.manifestEditorTitleNew,
        StringResources.vsc.commandsTreeViewProvider.manifestEditorDescription,
        "fx-extension.openManifest",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "edit", custom: false }
      ),
    ];
    const developmentProvider = new CommandsTreeViewProvider(developmentCommand);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-development", developmentProvider)
    );

    const deployCommand = [
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.provisionTitleNew,
        StringResources.vsc.commandsTreeViewProvider.provisionDescription,
        "fx-extension.provision",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "type-hierarchy", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.validateManifestTitleNew,
        StringResources.vsc.commandsTreeViewProvider.validateManifestDescription,
        "fx-extension.validateManifest",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "checklist", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.buildPackageTitleNew,
        StringResources.vsc.commandsTreeViewProvider.buildPackageDescription,
        "fx-extension.build",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "package", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.deployTitle,
        StringResources.vsc.commandsTreeViewProvider.deployDescription,
        "fx-extension.deploy",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "cloud-upload", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.publishTitle,
        StringResources.vsc.commandsTreeViewProvider.publishDescription,
        "fx-extension.publish",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "publish", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.teamsDevPortalTitleNew,
        StringResources.vsc.commandsTreeViewProvider.teamsDevPortalDescription,
        "fx-extension.openAppManagement",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "developerPortal", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.cicdGuideTitle,
        StringResources.vsc.commandsTreeViewProvider.cicdGuideDescription,
        "fx-extension.cicdGuide",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "sync", custom: false }
      ),
    ];
    const deployProvider = new CommandsTreeViewProvider(deployCommand);
    disposables.push(vscode.window.registerTreeDataProvider("teamsfx-deployment", deployProvider));
    // const deployProvider = new CommandsWebviewProvider();
    // disposables.push(vscode.window.registerWebviewViewProvider("teamsfx-deployment", deployProvider));
    const helpCommand = [
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.quickStartTitle,
        StringResources.vsc.commandsTreeViewProvider.quickStartDescription,
        "fx-extension.openWelcome",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.GettingStarted,
        undefined,
        { name: "lightningBolt_16", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.documentationTitle,
        StringResources.vsc.commandsTreeViewProvider.documentationDescription,
        "fx-extension.openDocument",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.GettingStarted,
        undefined,
        { name: "book", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.reportIssuesTitleNew,
        StringResources.vsc.commandsTreeViewProvider.reportIssuesDescription,
        "fx-extension.openReportIssues",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.Feedback,
        undefined,
        { name: "github", custom: false }
      ),
    ];
    const helpProvider = new CommandsTreeViewProvider(helpCommand);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-help-and-feedback", helpProvider)
    );

    this.treeviewMap.set("teamsfx-accounts", accountProvider);
    this.treeviewMap.set("teamsfx-environment", environmentProvider);
    this.treeviewMap.set("teamsfx-development", developmentProvider);
    this.treeviewMap.set("teamsfx-deployment", deployProvider);
    this.treeviewMap.set("teamsfx-help-and-feedback", helpProvider);

    return disposables;
  }

  public async registerEmptyProjectTreeViews() {
    const disposables = [];

    const accountProvider = new CommandsTreeViewProvider([]);
    disposables.push(vscode.window.registerTreeDataProvider("teamsfx-accounts", accountProvider));

    const environmentProvider = new CommandsTreeViewProvider([]);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-environment", environmentProvider)
    );

    const developmentCommand = [
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.createProjectTitleNew,
        StringResources.vsc.commandsTreeViewProvider.createProjectDescription,
        "fx-extension.create",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "new-folder", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.samplesTitleNew,
        StringResources.vsc.commandsTreeViewProvider.samplesDescription,
        "fx-extension.openSamples",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.GettingStarted,
        undefined,
        { name: "library", custom: false }
      ),
    ];
    const developmentProvider = new CommandsTreeViewProvider(developmentCommand);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-development", developmentProvider)
    );

    const deployCommand = [
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.teamsDevPortalTitleNew,
        StringResources.vsc.commandsTreeViewProvider.teamsDevPortalDescription,
        "fx-extension.openAppManagement",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "developerPortal", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.cicdGuideTitle,
        StringResources.vsc.commandsTreeViewProvider.cicdGuideDescription,
        "fx-extension.cicdGuide",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        { name: "sync", custom: false }
      ),
    ];
    const deployProvider = new CommandsTreeViewProvider(deployCommand);
    disposables.push(vscode.window.registerTreeDataProvider("teamsfx-deployment", deployProvider));

    const helpCommand = [
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.quickStartTitle,
        StringResources.vsc.commandsTreeViewProvider.quickStartDescription,
        "fx-extension.openWelcome",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.GettingStarted,
        undefined,
        { name: "lightningBolt_16", custom: true }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.documentationTitle,
        StringResources.vsc.commandsTreeViewProvider.documentationDescription,
        "fx-extension.openDocument",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.GettingStarted,
        undefined,
        { name: "book", custom: false }
      ),
      new TreeViewCommand(
        StringResources.vsc.commandsTreeViewProvider.reportIssuesTitleNew,
        StringResources.vsc.commandsTreeViewProvider.reportIssuesDescription,
        "fx-extension.openReportIssues",
        vscode.TreeItemCollapsibleState.None,
        TreeCategory.Feedback,
        undefined,
        { name: "github", custom: false }
      ),
    ];
    const helpProvider = new CommandsTreeViewProvider(helpCommand);
    disposables.push(
      vscode.window.registerTreeDataProvider("teamsfx-help-and-feedback", helpProvider)
    );

    this.treeviewMap.set("teamsfx-accounts", accountProvider);
    this.treeviewMap.set("teamsfx-environment", environmentProvider);
    this.treeviewMap.set("teamsfx-development", developmentProvider);
    this.treeviewMap.set("teamsfx-deployment", deployProvider);
    this.treeviewMap.set("teamsfx-help-and-feedback", helpProvider);

    return disposables;
  }

  public getTreeView(viewName: string) {
    return this.treeviewMap.get(viewName);
  }

  public dispose() {
    this.treeviewMap.forEach((value) => {
      value.dispose();
    });
  }
}

class CommandsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor() {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptBasePathOnDisk = vscode.Uri.file(path.join(ext.context.extensionPath, "out/"));
    const scriptBaseUri = scriptBasePathOnDisk.with({ scheme: "vscode-resource" });
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptPathOnDisk = vscode.Uri.file(
      path.join(ext.context.extensionPath, "out/src", "tree.js")
    );
    const scriptUri = scriptPathOnDisk.with({ scheme: "vscode-resource" });
    // // Do the same for the stylesheet.
    // const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
    // const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
    // const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(
          ext.context.extensionPath,
          "node_modules",
          "@vscode/codicons",
          "dist",
          "codicon.css"
        )
      )
    );
    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <base href='${scriptBaseUri}' />
            <meta http-equiv="Content-Security-Policy" content="font-src ${webview.cspSource};">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ms-teams</title>
            <link href="${codiconsUri}" rel="stylesheet" />
          </head>
          <body style="padding: 0 0">
            <div id="root"></div>
            <script>
              const vscode = acquireVsCodeApi();
            </script>
            <script nonce="${nonce}"  type="module" src="${scriptUri}"></script>
          </body>
        </html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export default TreeViewManager.getInstance();

export class CommandsTreeViewProvider implements vscode.TreeDataProvider<TreeViewCommand> {
  public static readonly TreeViewFlag = "TreeView";
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeViewCommand | undefined | void
  > = new vscode.EventEmitter<TreeViewCommand | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeViewCommand | undefined | void> = this
    ._onDidChangeTreeData.event;

  private commands: TreeViewCommand[] = [];
  private disposableMap: Map<string, vscode.Disposable> = new Map();

  public constructor(commands: TreeViewCommand[]) {
    this.commands.push(...commands);
  }

  findCommand(commandId: string): TreeViewCommand | undefined {
    const commandStack: TreeViewCommand[] = [];
    for (const command of this.commands) {
      commandStack.push(command);
    }
    while (commandStack.length > 0) {
      const curCommand = commandStack.shift();
      if (curCommand?.commandId === commandId) {
        return curCommand;
      }
      if (curCommand?.children) {
        for (const subCommand of curCommand?.children) {
          commandStack.push(subCommand);
        }
      }
    }
    return undefined;
  }

  async isRegistered(commandId: string): Promise<boolean> {
    const target = this.disposableMap.get(commandId);
    if (target !== undefined) {
      return true;
    }
    return false;
  }

  async refresh(items: TreeItem[]): Promise<Result<null, FxError>> {
    for (const treeItem of items) {
      const originalCommand = this.findCommand(treeItem.commandId);
      if (originalCommand !== undefined) {
        originalCommand.label = treeItem.label;
        if (treeItem.tooltip) {
          if (treeItem.tooltip.isMarkdown) {
            const markdown = new vscode.MarkdownString(treeItem.tooltip.value);
            originalCommand.tooltip = markdown;
          } else {
            originalCommand.tooltip = treeItem.tooltip.value;
          }
        }
        originalCommand.contextValue = treeItem.contextValue;
        if (treeItem.icon) {
          originalCommand.iconPath = {
            light: path.join(ext.context.extensionPath, "media", "light", `${treeItem.icon}.svg`),
            dark: path.join(ext.context.extensionPath, "media", "dark", `${treeItem.icon}.svg`),
          };
        }
      }
    }
    this._onDidChangeTreeData.fire();
    return Promise.resolve(ok(null));
  }

  async add(items: TreeItem[]): Promise<Result<null, FxError>> {
    for (const treeItem of items) {
      if (this.disposableMap.get(treeItem.commandId) !== undefined) {
        continue;
      }

      const disposable = vscode.commands.registerCommand(treeItem.commandId, (...args) =>
        Correlator.run(treeItem.callback!, args)
      );
      this.disposableMap.set(treeItem.commandId, disposable);

      let tooltip: string | vscode.MarkdownString = treeItem.label;
      if (treeItem.tooltip) {
        if (treeItem.tooltip.isMarkdown) {
          const markdown = new vscode.MarkdownString(treeItem.tooltip.value);
          tooltip = markdown;
        } else {
          tooltip = treeItem.tooltip.value;
        }
      }

      const command = new TreeViewCommand(
        treeItem.label,
        tooltip,
        treeItem.commandId,
        treeItem.subTreeItems && treeItem.subTreeItems.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : undefined,
        typeof treeItem.parent === "number" ? (treeItem.parent as TreeCategory) : undefined,
        [],
        treeItem.icon
          ? {
              name: treeItem.icon,
              custom: treeItem.isCustom === undefined ? true : treeItem.isCustom,
            }
          : undefined,
        treeItem.contextValue,
        treeItem.description
      );

      let parentCmd = undefined;
      if (typeof treeItem.parent === "number") {
        this.commands.push(command);
      } else {
        parentCmd = this.findCommand(treeItem.parent! as string);

        if (parentCmd) {
          parentCmd.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
          parentCmd.children?.push(command);
        }
      }

      if (parentCmd || typeof treeItem.parent === "number") {
        if (treeItem.subTreeItems) {
          for (const subTreeItem of treeItem.subTreeItems) {
            const registered = await this.isRegistered(subTreeItem.commandId);
            if (!registered && subTreeItem.callback !== undefined) {
              const disposable = vscode.commands.registerCommand(
                subTreeItem.commandId,
                subTreeItem.callback
              );
              this.disposableMap.set(subTreeItem.commandId, disposable);
            }
            const subCommand = new TreeViewCommand(
              subTreeItem.label,
              subTreeItem.label,
              subTreeItem.commandId,
              subTreeItem.subTreeItems && subTreeItem.subTreeItems.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : undefined
            );

            if (command.children === undefined) {
              command.children = [];
            }
            command.children?.push(subCommand);
          }
        }
      }
    }
    this._onDidChangeTreeData.fire();
    return Promise.resolve(ok(null));
  }

  remove(items: TreeItem[]): Promise<Result<null, FxError>> {
    for (const treeItem of items) {
      let parentCmd = undefined;
      if (typeof treeItem.parent === "number") {
        parentCmd = this.commands.find((rootCommand) => rootCommand.category === treeItem.parent);
      } else {
        parentCmd = this.findCommand(treeItem.parent! as string);
      }

      if (parentCmd && parentCmd.children) {
        for (let i = 0; i < parentCmd.children?.length; i++) {
          if (parentCmd.children[i].commandId === treeItem.commandId) {
            if (parentCmd.children.length === 1)
              parentCmd.collapsibleState = vscode.TreeItemCollapsibleState.None;

            const removeCmd = parentCmd.children.splice(i--, 1);
            const disposable = this.disposableMap.get(removeCmd[0].commandId!);
            disposable?.dispose();
            this.disposableMap.delete(removeCmd[0].commandId!);

            if (removeCmd[0].children) {
              for (const child of removeCmd[0].children) {
                const subDisposable = this.disposableMap.get(child.commandId!);
                subDisposable?.dispose();
                this.disposableMap.delete(child.commandId!);
              }
            }
          }
        }
      }
    }
    this._onDidChangeTreeData.fire();
    return Promise.resolve(ok(null));
  }

  getTreeItem(element: TreeViewCommand): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeViewCommand): Thenable<TreeViewCommand[]> {
    if (element && element.children) {
      return Promise.resolve(element.children);
    } else {
      return Promise.resolve(this.commands);
    }
  }

  dispose() {
    this.disposableMap.forEach((value) => {
      value.dispose();
    });
  }
}

export class TreeViewCommand extends vscode.TreeItem {
  constructor(
    public label: string,
    public tooltip: string | vscode.MarkdownString,
    public commandId?: string,
    public collapsibleState?: vscode.TreeItemCollapsibleState,
    public category?: TreeCategory,
    public children?: TreeViewCommand[],
    public image?: { name: string; custom: boolean },
    public contextValue?: string,
    public description?: string
  ) {
    super(label, collapsibleState ? collapsibleState : vscode.TreeItemCollapsibleState.None);
    this.description = description === undefined ? "" : description;
    this.contextValue = contextValue;

    if (image !== undefined) {
      if (!image.custom) {
        this.iconPath = new vscode.ThemeIcon(this.image!.name);
      } else {
        this.iconPath = {
          light: path.join(ext.context.extensionPath, "media", "light", `${this.image?.name}.svg`),
          dark: path.join(ext.context.extensionPath, "media", "dark", `${this.image?.name}.svg`),
        };
      }
    }

    if (commandId) {
      this.command = {
        title: label,
        command: commandId,
        arguments: [[CommandsTreeViewProvider.TreeViewFlag]],
      };
    }
  }
}
