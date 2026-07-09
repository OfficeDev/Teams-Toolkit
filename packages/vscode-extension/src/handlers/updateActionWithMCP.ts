// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { err, FxError, Result, SingleSelectConfig, Stage, UserError } from "@microsoft/teamsfx-api";
import { ODRProvider, ODRTool, probeMCPServerAuth, QuestionNames } from "@microsoft/teamsfx-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as fs from "fs-extra";
import * as parser from "jsonc-parser";
import path from "path";
import * as vscode from "vscode";
import { ExtensionErrors } from "../error/error";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent } from "../telemetry/extTelemetryEvents";
import { getDefaultString, localize } from "../utils/localizeUtils";
import * as systemEnvUtils from "../utils/systemEnvUtils";
import { getTriggerFromProperty } from "../utils/telemetryUtils";
import * as sharedOpts from "./sharedOpts";

/**
 * Sanitize MCP server name to match VS Code's tool prefix generation logic.
 * Based on VS Code's McpPrefixGenerator class.
 * See: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/common/mcpService.ts#L231
 */
function sanitizeMCPName(name: string): string {
  // VS Code's logic: lowercase, replace non-alphanumeric (except _.-) with _, truncate to 13 chars
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .slice(0, 13);
}

/**
 * Extract local server identifier from serverConfig.
 * For ODR-based servers, matches against odr list output to get proper identifier.
 * For non-ODR servers, returns original serverName as fallback.
 */
async function extractLocalServerIdentifier(
  serverConfig: any,
  originalServerName: string
): Promise<string> {
  if (!ODRProvider.isODRServer(serverConfig)) {
    return originalServerName;
  }

  try {
    const odrServers = await ODRProvider.listServers();
    const configCommand = serverConfig.command;
    const configArgs = serverConfig.args || [];

    // Match by command and args to find the right ODR server
    const matchingServer = odrServers.find((odrServer) => {
      return (
        odrServer.command === configCommand &&
        JSON.stringify(odrServer.args) === JSON.stringify(configArgs)
      );
    });

    if (matchingServer?.identifier) {
      return matchingServer.identifier;
    }
  } catch (error) {}

  return originalServerName;
}

export async function updateActionWithMCP(args?: any[]): Promise<Result<any, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.UpdateActionWithMCPStart,
    getTriggerFromProperty(args && args.length > 1 ? [args[1]] : undefined)
  );
  const inputs = systemEnvUtils.getSystemInputs();
  let mcpName = args && args.length > 0 ? args[0].serverName : undefined;
  let server = args && args.length > 0 ? args[0].serverConfig?.url : undefined;
  let command = args && args.length > 0 ? args[0].serverConfig?.command : undefined;
  let isLocalMCP = args && args.length > 0 && args[0].serverConfig?.type === "stdio";
  let serverConfig = args && args.length > 0 ? args[0].serverConfig : undefined;

  // Sanitize mcpName if it's provided as an argument
  if (mcpName) {
    mcpName = sanitizeMCPName(mcpName);
  }

  let localServerIdentifier = isLocalMCP
    ? await extractLocalServerIdentifier(serverConfig, args?.[0].serverName)
    : undefined;

  if (!mcpName && !server && !isLocalMCP) {
    const projectPath = inputs.projectPath;
    if (!projectPath) {
      return err(
        new UserError(
          "da-mcp",
          ExtensionErrors.MCPFileNotFound,
          getDefaultString("teamstoolkit.MCP.FileNotFound"),
          localize("teamstoolkit.MCP.FileNotFound")
        )
      );
    }
    const mcpFile = path.join(projectPath, ".vscode", "mcp.json");
    if (!fs.pathExistsSync(mcpFile)) {
      void vscode.window.showErrorMessage(localize("teamstoolkit.MCP.FileNotFound"));
      const error = new UserError(
        "da-mcp",
        ExtensionErrors.MCPFileNotFound,
        getDefaultString("teamstoolkit.MCP.FileNotFound"),
        localize("teamstoolkit.MCP.FileNotFound")
      );
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, error);
      return err(error);
    }
    // const mcpContent = await fs.readJSON(mcpFile);
    const mcpOriginalContent = fs.readFileSync(mcpFile, "utf-8");
    const mcpContent = parser.parse(mcpOriginalContent);
    if (!mcpContent || !mcpContent.servers) {
      void vscode.window.showErrorMessage(localize("teamstoolkit.MCP.ContentInvalid"));
      const error = new UserError(
        "da-mcp",
        ExtensionErrors.MCPContentInvalid,
        getDefaultString("teamstoolkit.MCP.ContentInvalid"),
        localize("teamstoolkit.MCP.ContentInvalid")
      );
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, error);
      return err(error);
    }

    // TODO: support multiple MCP servers
    const mcpNames = Object.keys(mcpContent.servers);
    if (mcpNames.length === 0) {
      void vscode.window.showErrorMessage(localize("teamstoolkit.MCP.ServerNotFound"));
      const error = new UserError(
        "da-mcp",
        ExtensionErrors.MCPServerNotFound,
        getDefaultString("teamstoolkit.MCP.ServerNotFound"),
        localize("teamstoolkit.MCP.ServerNotFound")
      );
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, error);
      return err(error);
    }
    if (mcpNames.length === 1) {
      mcpName = sanitizeMCPName(mcpNames[0]);
      serverConfig = mcpContent.servers[mcpNames[0]];
      server = serverConfig.url;
      command = serverConfig.command;
      isLocalMCP = serverConfig.type === "stdio";
      localServerIdentifier = await extractLocalServerIdentifier(serverConfig, mcpNames[0]);
    } else {
      const mcpNameSelection: SingleSelectConfig = {
        name: "mcpName",
        title: "Select MCP Server",
        options: mcpNames.map((name) => {
          const serverConfig = mcpContent.servers[name];
          let detail: string;
          if (serverConfig.type === "stdio") {
            const command = (serverConfig.command as string) || "";
            const args = serverConfig.args ? (serverConfig.args as string[]).join(" ") : "";
            detail = args ? `${command} ${args}` : command;
          } else {
            detail = (serverConfig.url as string) || "";
          }
          return {
            id: name,
            label: name,
            detail: detail,
          };
        }),
      };
      const result = await VS_CODE_UI.selectOption(mcpNameSelection);
      if (result.isErr()) {
        void vscode.window.showErrorMessage(
          result.error.message || localize("teamstoolkit.MCP.SelectServerFailed")
        );
        ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, result.error);
        return err(result.error);
      }
      const originalMcpName = result.value.result as string;
      mcpName = sanitizeMCPName(originalMcpName);
      serverConfig = mcpContent.servers[originalMcpName];
      server = serverConfig.url;
      command = serverConfig.command;
      isLocalMCP = serverConfig.type === "stdio";
      localServerIdentifier = await extractLocalServerIdentifier(serverConfig, originalMcpName);
    }
  }

  if (!mcpName || (!isLocalMCP && !server)) {
    void vscode.window.showErrorMessage(localize("teamstoolkit.MCP.NameOrServerUrlMissing"));
    const error = new UserError(
      "da-mcp",
      ExtensionErrors.MCPNameOrServerUrlMissing,
      getDefaultString("teamstoolkit.MCP.NameOrServerUrlMissing"),
      localize("teamstoolkit.MCP.NameOrServerUrlMissing")
    );
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, error);
    return err(error);
  }
  if (isLocalMCP && !command) {
    void vscode.window.showErrorMessage(localize("teamstoolkit.MCP.LocalMcpCommandMissing"));
    const error = new UserError(
      "da-mcp",
      ExtensionErrors.MCPLocalMcpCommandMissing,
      getDefaultString("teamstoolkit.MCP.LocalMcpCommandMissing"),
      localize("teamstoolkit.MCP.LocalMcpCommandMissing")
    );
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, error);
    return err(error);
  }

  inputs[QuestionNames.MCPForDAServerUrl] = server;
  inputs[QuestionNames.MCPForDAServerName] = mcpName;
  if (isLocalMCP) {
    inputs[QuestionNames.MCPLocalServerIdentifier] = localServerIdentifier;
  }

  let tools: Tool[];
  if (ODRProvider.isODRServer(serverConfig)) {
    const odrTools = await ODRProvider.getToolsForODRServer(
      serverConfig.command,
      serverConfig.args || []
    );
    tools = odrTools.map((tool: ODRTool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  } else {
    const selectedTools = vscode.lm.tools
      .filter((tool: vscode.LanguageModelToolInformation) =>
        tool.name.includes(`mcp_${mcpName as string}`)
      )
      .map((tool: vscode.LanguageModelToolInformation) => {
        const index = tool.name.indexOf(mcpName);
        const newName = tool.name.substring(index + (mcpName as string).length + 1);
        return {
          name: newName,
          description: tool.description,
          inputSchema: tool.inputSchema as any,
        };
      });
    try {
      // startMcpGateway is a proposed API (VS Code Insiders only)
      const mcpGateway = await vscode.lm.startMcpGateway();
      if (mcpGateway) {
        // New API: mcpGateway.servers (array of McpGatewayServer with label + address)
        // Old API: mcpGateway.address (single Uri)
        let gatewayAddress: string | undefined;
        if ("servers" in mcpGateway && Array.isArray(mcpGateway.servers)) {
          const matchingServer = (mcpGateway.servers as vscode.McpGatewayServer[]).find(
            (s) => sanitizeMCPName(s.label) === mcpName
          );
          gatewayAddress = matchingServer?.address?.toString();
        } else if ("address" in mcpGateway) {
          gatewayAddress = (mcpGateway as { address: vscode.Uri }).address.toString();
        }
        if (gatewayAddress) {
          const transport = new StreamableHTTPClientTransport(new URL(gatewayAddress));
          const client = new Client({ name: "atk", version: "1.0.0" });
          try {
            await client.connect(transport);
            const result = await client.listTools();
            // The gateway queries the running MCP server directly, so its tool list is
            // authoritative. Use it as-is instead of intersecting with vscode.lm.tools,
            // which is not reliably populated for MCP servers on all platforms (e.g. macOS)
            // and would otherwise collapse the result to an empty list. Deduplicate on
            // name+description in case a proxied server reports the same tool twice.
            const seen = new Set<string>();
            const gatewayTools = result.tools.filter((tool) => {
              const key = `${tool.name}\n${tool.description ?? ""}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
            tools = gatewayTools.length > 0 ? gatewayTools : selectedTools;
          } catch {
            tools = selectedTools;
          } finally {
            await client.close();
            mcpGateway.dispose();
          }
        } else {
          mcpGateway.dispose();
          tools = selectedTools;
        }
      } else {
        tools = selectedTools;
      }
    } catch {
      tools = selectedTools;
    }
  }

  if (tools.length === 0) {
    void vscode.window.showErrorMessage(localize("teamstoolkit.MCP.ToolsNotFound"));
    const error = new UserError(
      "da-mcp",
      ExtensionErrors.MCPToolsNotFound,
      getDefaultString("teamstoolkit.MCP.ToolsNotFound"),
      localize("teamstoolkit.MCP.ToolsNotFound")
    );
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, error);
    return err(error);
  }
  inputs[QuestionNames.MCPForDAAvailableTools] = tools;

  let auth: "OAuthPluginVault" | "NoneAuth" = "NoneAuth";
  let oauthMetadataUrl = undefined;

  if (!isLocalMCP && server) {
    // Probe with a POST `initialize` request. A plain GET is unreliable: spec-compliant
    // MCP servers (e.g. Figma) return 405 to GET and only emit the 401 + WWW-Authenticate
    // challenge on POST, so GET-based detection would miss their auth requirement.
    const authProbe = await probeMCPServerAuth(server);
    if (authProbe.requiresAuth) {
      auth = "OAuthPluginVault";
      oauthMetadataUrl = authProbe.authMetadataUrl;
    }
    if (auth === "OAuthPluginVault" && !oauthMetadataUrl) {
      const originalURL = new URL(server);
      const wellKnownURL = `${originalURL.protocol}//${originalURL.host}/.well-known/oauth-authorization-server`;
      try {
        const response = await axios.get(wellKnownURL);
        if (response.status === 200) {
          inputs[QuestionNames.MCPForDAAuthWellKnownUrl] = wellKnownURL;
        }
      } finally {
      }
    }
  }

  inputs[QuestionNames.MCPForDAAuth] = auth;
  inputs[QuestionNames.MCPForDAAuthMetadataUrl] = oauthMetadataUrl;
  const result = await sharedOpts.runCommand(Stage.updateActionWithMCP, inputs);
  if (result.isErr()) {
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.UpdateActionWithMCP, result.error, {
      "auth-type": auth,
      "tool-number": tools.length.toString(),
      "mcp-type": isLocalMCP ? "local" : "remote",
    });
  } else {
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.UpdateActionWithMCP, {
      "auth-type": auth,
      "tool-number": tools.length.toString(),
      "mcp-type": isLocalMCP ? "local" : "remote",
    });
  }
  return result;
}
