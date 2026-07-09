// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as childProcess from "child_process";
import { promisify } from "util";

export const odrProviderDeps = {
  getPlatform: (): string => process.platform,
  exec: childProcess.exec,
  logError: (...args: any[]): void => console.error(...args),
};

export const logError = (...args: any[]): void => odrProviderDeps.logError(...args);

export interface ODRServer {
  name: string;
  display_name: string;
  description: string;
  version: string;
  identifier: string;
  tools: ODRTool[];
  packageFamily: string;
  command: string;
  args: string[];
}

export interface ODRTool {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  _meta?: any;
}

export class ODRProvider {
  /**
   * Check if a server configuration is ODR-based.
   * @param serverConfig The server configuration object
   * @returns True if the server is ODR-based, false otherwise
   */
  static isODRServer(serverConfig: any): boolean {
    if (serverConfig?.type !== "stdio" || !serverConfig.command) {
      return false;
    }
    const configCommand = serverConfig.command.toLowerCase();
    return configCommand === "odr" || configCommand.endsWith("odr.exe");
  }

  /**
   * Parse the output of 'odr list' command
   * @param jsonOutput The JSON output from 'odr list' command
   * @returns Array of parsed ODR servers with their tools
   */
  static parseODRListOutput(jsonOutput: any): ODRServer[] {
    const servers: ODRServer[] = [];

    if (!jsonOutput || !jsonOutput.servers || !Array.isArray(jsonOutput.servers)) {
      return servers;
    }

    for (const server of jsonOutput.servers) {
      const manifest =
        server._meta?.["io.modelcontextprotocol.registry/publisher-provided"]?.[
          "com.microsoft.windows"
        ]?.manifest;
      const staticResponses = manifest?._meta?.["com.microsoft.windows"]?.static_responses;
      const toolsList = staticResponses?.["tools/list"]?.tools || [];
      const packageFamily = manifest?._meta?.["com.microsoft.windows"]?.package_family_name;
      const mcpConfig = manifest?.server?.mcp_config;

      if (packageFamily && mcpConfig) {
        servers.push({
          name: server.name,
          packageFamily: packageFamily,
          display_name: manifest?.display_name || server.name,
          description: server.description || "",
          version: server.version || "1.0.0",
          identifier: server.packages?.[0]?.identifier || "",
          command: mcpConfig.command || "",
          args: mcpConfig.args || [],
          tools: toolsList.map((tool: any) => ({
            name: tool.name,
            description: tool.description || "",
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
          })),
        });
      }
    }

    return servers;
  }

  /**
   * List all available local MCP servers from Windows ODR.
   * This is used during project creation to show available servers to the user.
   * @returns Array of ODR servers. Returns empty array if:
   *   - Not on Windows platform
   *   - ODR command is not available (not installed)
   *   - ODR command fails or returns invalid output
   */
  static async listServers(): Promise<ODRServer[]> {
    if (odrProviderDeps.getPlatform() !== "win32") {
      return [];
    }

    const execAsync = promisify(odrProviderDeps.exec);
    try {
      const { stdout } = await execAsync("odr list");

      if (!stdout) {
        return [];
      }

      const jsonOutput = JSON.parse(stdout);
      return ODRProvider.parseODRListOutput(jsonOutput);
    } catch (error) {
      odrProviderDeps.logError("Error executing odr list:", error);
      return [];
    }
  }

  /**
   * Get tools for a specific ODR server by matching command and arguments.
   * @param command The command of the ODR server (e.g., "odr")
   * @param args The arguments array for the ODR server
   * @returns Array of tools from the matching ODR server, or empty array if no match found
   */
  static async getToolsForODRServer(command: string, args: string[] = []): Promise<ODRTool[]> {
    const odrServers = await ODRProvider.listServers();

    const matchingServer = odrServers.find((odrServer) => {
      return (
        odrServer.command === command && JSON.stringify(odrServer.args) === JSON.stringify(args)
      );
    });

    return matchingServer?.tools || [];
  }
}
