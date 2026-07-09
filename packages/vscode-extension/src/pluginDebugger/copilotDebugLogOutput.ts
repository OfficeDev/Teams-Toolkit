// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { LogLevel } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";
import { ANSIColors } from "../debug/common/debugConstants";
import { defaultExtensionLogPath } from "../globalVariables";

interface Plugin {
  name: string;
  id: string;
  version: string;
}

interface FunctionDescriptor {
  plugin: Plugin;
  functionDisplayName: string;
}

interface FunctionExecution {
  function: FunctionDescriptor;
  executionStatus: {
    requestStatus: number;
    responseStatus: number;
    responseType: number;
  };
  parameters: Record<string, string>;
  requestUri: string;
  requestMethod: string;
  responseContent: string;
  responseContentType: string;
  errorMessage: string;
}

interface CapabilitiesDeveloperInfo {
  enabledCapabilities: EnabledCapability[];
  capabilityExecutions: CapabilityExecution[];
}

interface EnabledCapability {
  capabilityIcon: string;
  capabilityName: string;
  scopes: {
    [key: string]: object;
  };
}

interface CapabilityExecution {
  name: string;
  status: string;
  errorMessage?: string;
  additionalDebugInfo?: {
    [key: string]: object;
  };
}

interface AgentMetaData {
  agentId: string;
  conversationId: string;
  agentVersion: string;
  requestId: string;
}

interface PluginDeveloperInfo {
  enabledPlugins: Plugin[];
  matchedFunctionCandidates: FunctionDescriptor[];
  functionsSelectedForInvocation: FunctionDescriptor[];
  functionExecutions: FunctionExecution[];
}

/**
 * @Sample [2021-03-15T03:41:04.961Z] - 0 plugin enabled.
 */
export function logToDebugConsole(logLevel: LogLevel, message: string): void {
  try {
    const dateString = new Date().toJSON();
    const debugConsole = vscode.debug.activeDebugConsole;
    if (logLevel === LogLevel.Info) {
      debugConsole.appendLine(
        ANSIColors.WHITE + `[${dateString}] - ` + ANSIColors.BLUE + `${message}`
      );
    } else if (logLevel === LogLevel.Warning) {
      debugConsole.appendLine(
        ANSIColors.WHITE + `[${dateString}] - ` + ANSIColors.YELLOW + `${message}`
      );
    } else if (logLevel === LogLevel.Error) {
      debugConsole.appendLine(
        ANSIColors.WHITE + `[${dateString}] - ` + ANSIColors.RED + `${message}`
      );
    } else if (logLevel === LogLevel.Debug) {
      debugConsole.appendLine(
        ANSIColors.WHITE + `[${dateString}] - ` + ANSIColors.GREEN + `${message}`
      );
    } else {
      debugConsole.appendLine(ANSIColors.WHITE + `[${dateString}] - ${message}`);
    }
  } catch (e) {}
}

export function writeExecutionDetailsToFile(logFilePath: string, logString: string): void {
  const fs = require("fs");
  fs.appendFileSync(logFilePath, logString + "\n");
}

export class CopilotDebugLog {
  enabledPlugins?: Plugin[];
  matchedFunctionCandidates?: FunctionDescriptor[];
  functionsSelectedForInvocation?: FunctionDescriptor[];
  functionExecutions?: FunctionExecution[];
  capabilitiesDeveloperInfo?: CapabilitiesDeveloperInfo;
  pluginDeveloperInfo?: PluginDeveloperInfo;
  prompt?: string;
  agentMetaData?: AgentMetaData;

  constructor(logAsJson: string, prompt?: string) {
    let message: this;
    try {
      message = JSON.parse(logAsJson) as this;
      if (prompt) {
        this.prompt = prompt;
      }
    } catch (error) {
      throw new Error(`Error parsing logAsJson: ${(error as Error).message}`);
    }
    this.enabledPlugins = message.enabledPlugins ?? message.pluginDeveloperInfo?.enabledPlugins;
    this.matchedFunctionCandidates =
      message.matchedFunctionCandidates ?? message.pluginDeveloperInfo?.matchedFunctionCandidates;
    this.functionsSelectedForInvocation =
      message.functionsSelectedForInvocation ??
      message.pluginDeveloperInfo?.functionsSelectedForInvocation;
    this.functionExecutions =
      message.functionExecutions ?? message.pluginDeveloperInfo?.functionExecutions;
    this.capabilitiesDeveloperInfo = message.capabilitiesDeveloperInfo;
    this.pluginDeveloperInfo = message.pluginDeveloperInfo;
    this.agentMetaData = message.agentMetaData;

    if (this.functionExecutions) {
      this.functionExecutions.forEach((functionExecution) => {
        try {
          if (functionExecution.requestUri) {
            new URL(functionExecution.requestUri);
          }
        } catch (error) {
          throw new Error(
            `Error creating URL object for requestUri: ${functionExecution.requestUri}`
          );
        }
      });
    }
  }

  write(): void {
    const debugConsole = vscode.debug.activeDebugConsole;
    this.logExecutionDetailCounts(debugConsole);
    this.logAgentHeaderDetails(debugConsole);
    debugConsole.appendLine("");
    debugConsole.appendLine(ANSIColors.WHITE + "CAPABILITIES");
    if ((this.capabilitiesDeveloperInfo?.enabledCapabilities?.length ?? 0) > 0) {
      this.logCapabilities(debugConsole);
    } else {
      debugConsole.appendLine(
        `${ANSIColors.RED} (×) ${ANSIColors.WHITE}Enabled capabilities: None.`
      );
      debugConsole.appendLine(
        `   ${ANSIColors.RED} (×) Execution status: ${ANSIColors.WHITE}None.`
      );
    }

    if (this.enabledPlugins && this.enabledPlugins.length > 0) {
      debugConsole.appendLine("");
      debugConsole.appendLine(ANSIColors.WHITE + "ACTIONS");
      this.enabledPlugins.forEach((plugin) => {
        debugConsole.appendLine(
          `${ANSIColors.GREEN}(√) ${ANSIColors.WHITE}Enabled action: ${ANSIColors.MAGENTA}${plugin.name} ${ANSIColors.GRAY}• version ${plugin.version} • ${plugin.id}`
        );

        if (this.matchedFunctionCandidates && this.matchedFunctionCandidates.length > 0) {
          this.matchedFunctionCandidates.forEach((matchedFunction) => {
            if (matchedFunction.plugin.id === plugin.id) {
              debugConsole.appendLine(
                `${ANSIColors.GREEN}   (√) ${ANSIColors.WHITE}Matched functions: ${ANSIColors.MAGENTA}${matchedFunction.functionDisplayName}`
              );
              this.logFunctionExecutions(debugConsole, matchedFunction);
            }
          });
        }
      });
    } else {
      debugConsole.appendLine("");
      debugConsole.appendLine(ANSIColors.WHITE + "ACTIONS");
      logToDebugConsole(LogLevel.Info, `0 enabled action(s).`);
      debugConsole.appendLine(ANSIColors.WHITE + "Copilot agent developer info:");
      debugConsole.appendLine("");
      this.logNoPlugins(debugConsole);
    }
  }

  private logCapabilities(debugConsole: vscode.DebugConsole): void {
    const capabilities = this.capabilitiesDeveloperInfo?.enabledCapabilities;
    if (capabilities && capabilities.length == 0) {
      return;
    }

    const capabilityExecutions = this.capabilitiesDeveloperInfo?.capabilityExecutions;
    const capabilityNamesExecuted = capabilityExecutions?.map((execution) => execution.name);

    capabilities?.forEach((capability) => {
      if (capabilityNamesExecuted?.includes(capability.capabilityName)) {
        this.logCapabilitiesWithExecutions(debugConsole, capability);
      } else {
        debugConsole.appendLine(
          `${ANSIColors.GREEN}(√) ${ANSIColors.WHITE}Enabled capabilities: ${ANSIColors.MAGENTA}${capability.capabilityName}`
        );
        if (Object.keys(capability.scopes).length > 0) {
          Object.entries(capability.scopes).forEach(([key, value]) => {
            debugConsole.appendLine(`       ${ANSIColors.WHITE}${key} - ${JSON.stringify(value)}`);
          });
        }
      }
    });
  }

  private logCapabilitiesWithExecutions(
    debugConsole: vscode.DebugConsole,
    capability: EnabledCapability
  ): void {
    debugConsole.appendLine(
      `${ANSIColors.GREEN}(√) ${ANSIColors.WHITE}Enabled capabilities: ${ANSIColors.MAGENTA}${capability.capabilityName}`
    );
    const capabilitiesOfThisTpe = this.capabilitiesDeveloperInfo?.capabilityExecutions?.filter(
      (execution) => execution.name === capability.capabilityName
    );

    const capabilitiesContainAdditionalInfo = capabilitiesOfThisTpe?.some(
      (execution) => execution.additionalDebugInfo
    );

    const logFileName = `Copilot-debug-${new Date().toISOString().replace(/-|:|\.\d+Z$/g, "")}.txt`;
    const logFilePath = `${defaultExtensionLogPath}/${logFileName}`;

    if (capabilitiesContainAdditionalInfo) {
      capabilitiesOfThisTpe?.forEach((execution, index) => {
        const logFileName = `Copilot-debug-${new Date()
          .toISOString()
          .replace(/-|:|\.\d+Z$/g, "")}-${index}.txt`;
        const logFilePath = `${defaultExtensionLogPath}/${logFileName}`;
        writeExecutionDetailsToFile(logFilePath, JSON.stringify(execution, null, 2));
        debugConsole.appendLine(
          `       ${ANSIColors.WHITE} ${execution.name} ${index} ${
            ANSIColors.WHITE
          }• ${CopilotDebugLog.getExecutionStatusColor(
            execution.status
          )} Execution status ${CopilotDebugLog.getExecutionStatusText(execution.status)} ${
            ANSIColors.WHITE
          }refer to ${ANSIColors.BLUE}${logFilePath}${ANSIColors.WHITE} for all details.` // Replace execution.name with actual name
        );
      });
    } else {
      const finalExecution = capabilitiesOfThisTpe?.[capabilitiesOfThisTpe.length - 1];
      writeExecutionDetailsToFile(logFilePath, JSON.stringify(finalExecution, null, 2));
      debugConsole.appendLine(
        ` ${ANSIColors.WHITE}• ${CopilotDebugLog.getExecutionStatusColor(
          finalExecution?.status ?? ""
        )} Execution status: ${CopilotDebugLog.getExecutionStatusText(
          finalExecution?.status ?? ""
        )}${ANSIColors.WHITE}, refer to ${ANSIColors.BLUE}${logFilePath}${
          ANSIColors.WHITE
        } for all details.`
      );
    }
  }

  private static getExecutionStatusColor(executionStatus: string): ANSIColors {
    if (executionStatus === "1") {
      return ANSIColors.GREEN;
    } else {
      return ANSIColors.RED;
    }
  }

  private static getExecutionStatusText(executionStatus: string): string {
    if (executionStatus === "1") {
      return "Success";
    }
    return "Failed";
  }

  private logAgentHeaderDetails(debugConsole: vscode.DebugConsole): void {
    debugConsole.appendLine(ANSIColors.WHITE + "Execution summary");
    debugConsole.appendLine("");
    debugConsole.appendLine(`${ANSIColors.WHITE}User's input prompt: ${this.prompt ?? ""}`); // pull from search query - action/capability execution
    debugConsole.appendLine(
      `${ANSIColors.WHITE}Agent ID (${this.agentMetaData?.agentId ?? ""}). Conversation ID (${
        this.agentMetaData?.conversationId ?? ""
      }). Request ID (${this.agentMetaData?.requestId ?? ""})`
    );
  }

  private logExecutionDetailCounts(debugConsole: vscode.DebugConsole): void {
    const enabledCapabilitiesCount =
      this.capabilitiesDeveloperInfo?.enabledCapabilities?.length ?? 0;
    const enabledPluginsCount = this.enabledPlugins?.length ?? 0;
    const matchedFunctionCandidatesCount = this.matchedFunctionCandidates?.length ?? 0;
    const functionsSelectedForInvocationCount = this.functionsSelectedForInvocation?.length ?? 0;
    const failedActionExecutionsCount =
      this.functionExecutions?.filter(
        (execution) => (execution?.executionStatus?.responseStatus ?? 0) >= 400
      )?.length ?? 0;
    const successfulActionExecutionsCount =
      (this.functionExecutions?.length ?? 0) - failedActionExecutionsCount;

    debugConsole.appendLine(
      `${ANSIColors.GREEN}${enabledCapabilitiesCount} enabled capabilities, ${enabledPluginsCount} enabled actions, ${failedActionExecutionsCount} failed function executions, ${successfulActionExecutionsCount} successful function executions, ${matchedFunctionCandidatesCount} matched function candidates, ${functionsSelectedForInvocationCount} functions selected for invocation.`
    );
  }

  private logNoPlugins(debugConsole: vscode.DebugConsole): void {
    debugConsole.appendLine(`${ANSIColors.RED}(×) Error: ${ANSIColors.WHITE}Enabled plugin: None`);
  }

  private logFunctionExecutions(
    debugConsole: vscode.DebugConsole,
    matchedFunction: FunctionDescriptor
  ): void {
    if (this.functionsSelectedForInvocation && this.functionsSelectedForInvocation.length > 0) {
      this.functionsSelectedForInvocation.forEach((selectedFunction) => {
        if (selectedFunction.functionDisplayName === matchedFunction.functionDisplayName) {
          debugConsole.appendLine(
            `${ANSIColors.GREEN}      (√) ${ANSIColors.WHITE}Selected functions for execution: ${ANSIColors.MAGENTA}${selectedFunction.functionDisplayName}`
          );
          this.logExecutionDetails(debugConsole, matchedFunction);
        }
      });
    }
  }

  private logExecutionDetails(
    debugConsole: vscode.DebugConsole,
    matchedFunction: FunctionDescriptor
  ): void {
    // E.g "Copilot-debug-20250113T070957.txt"
    const logFileName = `Copilot-debug-${new Date().toISOString().replace(/-|:|\.\d+Z$/g, "")}.txt`;
    const logFilePath = `${defaultExtensionLogPath}/${logFileName}`;
    if (this.functionExecutions && this.functionExecutions.length > 0) {
      writeExecutionDetailsToFile(logFilePath, JSON.stringify(this.functionExecutions, null, 2));
      this.functionExecutions.forEach((functionExecution) => {
        if (
          functionExecution.function.functionDisplayName === matchedFunction.functionDisplayName
        ) {
          debugConsole.appendLine(
            `${ANSIColors.GREEN}         (√) ${ANSIColors.WHITE}Function execution details: ${ANSIColors.GREEN}Status ${functionExecution.executionStatus.responseStatus}, ${ANSIColors.WHITE}refer to ${ANSIColors.BLUE}${logFilePath}${ANSIColors.WHITE} for all details.`
          );
          if (functionExecution.errorMessage) {
            debugConsole.appendLine(
              `${ANSIColors.RED}            (×) Error: ${ANSIColors.WHITE}${functionExecution.errorMessage}`
            );
          }
        }
      });
    }
  }

  static prettyPrintJson(jsonText: string): string {
    return JSON.stringify(JSON.parse(jsonText), null, 2);
  }
}
