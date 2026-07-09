// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as util from "util";
import * as vscode from "vscode";
import * as globalVariables from "../globalVariables";
import * as localizeUtils from "./localizeUtils";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent, TelemetryProperty } from "../telemetry/extTelemetryEvents";
import { FxError } from "@microsoft/teamsfx-api";
import { fsAdapter, pathAdapter } from "../common/npmPackageDeps";

/**
 * Setup MCP Server by checking for required files and prompting user to create them if missing
 */
export async function setupMCPServer(): Promise<void> {
  const workspaceUri = globalVariables.workspaceUri;
  if (!workspaceUri) {
    return; // No workspace opened
  }
  const workspaceRoot = workspaceUri.fsPath;

  // Check which files are missing
  const copilotInstructionsPath = pathAdapter.join(
    workspaceRoot,
    ".github",
    "copilot-instructions.md"
  );
  const mcpConfigPath = pathAdapter.join(workspaceRoot, ".vscode", "mcp.json");
  const missingCopilotInstructions = !fsAdapter.existsSync(copilotInstructionsPath);
  const missingMcpConfig = checkMCPConfigNeedsUpdate();

  if (!missingCopilotInstructions && !missingMcpConfig) {
    return;
  }

  // Create message based on which files are missing or need updates
  const filesToModify: string[] = [];
  if (missingCopilotInstructions) {
    filesToModify.push(".github/copilot-instructions.md");
  }
  if (missingMcpConfig) {
    filesToModify.push(".vscode/mcp.json");
  }

  const fileList =
    filesToModify.length === 1
      ? filesToModify[0]
      : filesToModify.length === 2
        ? `${filesToModify[0]} and ${filesToModify[1]}`
        : filesToModify.join(", ");

  const message = util.format(
    localizeUtils.localize("teamstoolkit.mcpUtils.setupMcpServer.message"),
    fileList
  );

  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PromptMCPServer, {
    [TelemetryProperty.MissingCopilotInstructions]: String(missingCopilotInstructions),
    [TelemetryProperty.MissingMCPConfig]: String(missingMcpConfig),
  });
  await vscode.window
    .showInformationMessage(
      message,
      localizeUtils.localize("teamstoolkit.mcpUtils.setupMcpServer.confirm"),
      localizeUtils.localize("teamstoolkit.mcpUtils.setupMcpServer.skip")
    )
    .then((selection) => {
      if (selection !== localizeUtils.localize("teamstoolkit.mcpUtils.setupMcpServer.confirm")) {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PromptMCPServer, {
          [TelemetryProperty.UserSelection]: "skip",
        });
        return; // User chose to skip setup
      }

      try {
        if (missingCopilotInstructions) {
          createCopilotInstructionsFile(workspaceRoot, copilotInstructionsPath);
        }

        if (missingMcpConfig) {
          updateMCPConfigFile(workspaceRoot, mcpConfigPath);
        }
      } catch (error) {
        const errorMessage = util.format(
          localizeUtils.localize("teamstoolkit.mcpUtils.setupMcpServer.errorMessage"),
          (error as Error).toString()
        );
        void vscode.window.showErrorMessage(errorMessage);
        ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.PromptMCPServer, error as FxError, {
          [TelemetryProperty.UserSelection]: "confirm",
        });
        return; // Exit if there was an error creating files
      }

      const successMessage = localizeUtils.localize(
        "teamstoolkit.mcpUtils.setupMcpServer.successMessage"
      );
      void vscode.window.showInformationMessage(successMessage);
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PromptMCPServer, {
        [TelemetryProperty.UserSelection]: "confirm",
      });
    });
}

/**
 * Create .github/copilot-instructions.md file with default content
 */
function createCopilotInstructionsFile(
  workspaceRoot: string,
  copilotInstructionsPath: string
): void {
  const githubDir = pathAdapter.join(workspaceRoot, ".github");
  // Create .github directory if it doesn't exist
  if (!fsAdapter.existsSync(githubDir)) {
    fsAdapter.mkdirSync(githubDir, { recursive: true });
  }

  // Get default content from template
  const extensionPath = globalVariables.context?.extensionPath || "";
  const templatePath = pathAdapter.join(extensionPath, "media/mcp", "copilot-instructions.md");

  const defaultContent = fsAdapter.readFileSync(templatePath, "utf8");
  // Create copilot-instructions.md file with default content
  fsAdapter.writeFileSync(copilotInstructionsPath, defaultContent, "utf8");
}

/**
 * Create .vscode/mcp.json file with m365agentstoolkit mcp server configuration
 */
function updateMCPConfigFile(workspaceRoot: string, mcpConfigPath: string): void {
  if (!fsAdapter.existsSync(mcpConfigPath)) {
    const vscodeDir = pathAdapter.join(workspaceRoot, ".vscode");

    // Create .vscode directory if it doesn't exist
    if (!fsAdapter.existsSync(vscodeDir)) {
      fsAdapter.mkdirSync(vscodeDir, { recursive: true });
    }

    // Create mcp.json with m365agentstoolkit server configuration
    const mcpConfig = {
      servers: {
        m365agentstoolkit: {
          command: "npx",
          args: ["@microsoft/m365agentstoolkit-mcp@latest", "server", "start"],
        },
      },
    };

    fsAdapter.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), "utf8");
  } else {
    // If mcp.json already exists, check if it needs to be updated
    const configContent = fsAdapter.readFileSync(mcpConfigPath, "utf8");
    const config = JSON.parse(configContent);

    // Ensure servers object exists
    if (!config.servers || typeof config.servers !== "object") {
      config.servers = {};
    }

    // Add m365agentstoolkit server configuration
    config.servers["M365AgentsToolkit MCP Server"] = {
      command: "npx",
      args: ["@microsoft/m365agentstoolkit-mcp@latest", "server", "start"],
    };

    fsAdapter.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2), "utf8");
  }
}

/**
 * Check if MCP config file needs to be updated with proper m365agentstoolkit server configuration
 */
function checkMCPConfigNeedsUpdate(): boolean {
  try {
    const userServers = vscode.workspace.getConfiguration("mcp").get("servers");
    if (userServers && JSON.stringify(userServers).includes("@microsoft/m365agentstoolkit-mcp")) {
      return false; // User already has m365agentstoolkit server configured
    }

    return true;
  } catch (error) {
    return true; // If we can't parse it, assume it needs update
  }
}
