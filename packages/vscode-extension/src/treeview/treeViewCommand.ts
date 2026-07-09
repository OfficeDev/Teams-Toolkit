// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";

import { TreeCategory } from "@microsoft/teamsfx-api";

import { TelemetryTriggerFrom } from "../telemetry/extTelemetryEvents";
import * as localizeUtils from "../utils/localizeUtils";

export enum CommandStatus {
  Ready,
  Running,
  Blocked,
}

const labelPrefix = "teamstoolkit.commandsTreeViewProvider.";

export class TreeViewCommand extends vscode.TreeItem {
  public children?: TreeViewCommand[];

  constructor(
    private readyLabel: string,
    private readyTooltip: string | vscode.MarkdownString,
    public commandId?: string,
    public runningLabelKey?: string,
    public image?: { name: string; custom: boolean },
    public category?: TreeCategory
  ) {
    super(readyLabel, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this.readyTooltip;
    this.setImagetoIcon();

    if (commandId) {
      this.command = {
        title: readyLabel,
        command: commandId,
        arguments: [TelemetryTriggerFrom.TreeView, this],
      };
      this.contextValue = commandId;
    }
  }

  public setStatus(status: CommandStatus, blockedTooltip?: string) {
    switch (status) {
      case CommandStatus.Running:
        this.iconPath = new vscode.ThemeIcon("loading~spin");
        if (this.runningLabelKey) {
          const label = localizeUtils.localize(`${labelPrefix}${this.runningLabelKey}.running`);
          if (label) {
            this.label = label;
          }
        }
        break;
      case CommandStatus.Blocked:
        if (blockedTooltip) {
          this.tooltip = blockedTooltip;
        }
        break;
      case CommandStatus.Ready:
      default:
        this.setImagetoIcon();
        this.label = this.readyLabel;
        this.tooltip = this.readyTooltip;
        break;
    }
  }

  public getBlockingTooltip(): string | undefined {
    if (this.runningLabelKey) {
      const tooltip = localizeUtils.localize(`${labelPrefix}${this.runningLabelKey}.blockTooltip`);
      return tooltip;
    }
  }

  public toJSON(): unknown {
    return {
      label: this.label,
      tooltip: this.tooltip?.toString(),
      command: {
        id: this.commandId,
        title: this.readyLabel,
      },
      status: {
        isRunning: this.runningLabelKey !== undefined,
        category: this.category,
      },
    };
  }

  private setImagetoIcon() {
    if (this.image !== undefined) {
      if (!this.image.custom) {
        this.iconPath = new vscode.ThemeIcon(
          this.image.name,
          new vscode.ThemeColor("icon.foreground")
        );
      } else {
        // Use font instead of SVG images.
        // this.iconPath = {
        //   light: path.join(
        //     globalVariables.context.extensionPath,
        //     "media",
        //     "treeview",
        //     "command",
        //     `${this.image.name}-light.svg`
        //   ),
        //   dark: path.join(
        //     globalVariables.context.extensionPath,
        //     "media",
        //     "treeview",
        //     "command",
        //     `${this.image.name}-dark.svg`
        //   ),
        // };
      }
    }
  }
}
