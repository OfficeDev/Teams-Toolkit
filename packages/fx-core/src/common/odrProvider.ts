// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as childProcess from "child_process";
import { promisify } from "util";

export const odrProviderDeps = {
  getPlatform: (): string => process.platform,
  exec: childProcess.exec,
  logError: (...args: unknown[]): void => console.error(...args),
};

export const logError = (...args: unknown[]): void => odrProviderDeps.logError(...args);

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
  inputSchema: ODRToolSchema;
  outputSchema?: ODRToolSchema;
  _meta?: unknown;
}

export interface ODRToolSchema {
  type: "object";
  properties?: Record<string, ODRToolParameterSchema>;
  required?: string[];
  [key: string]: unknown;
}

export interface ODRToolParameterSchema {
  type?: string;
  enum?: unknown[];
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordProperty(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return isRecord(property) ? property : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === "string" ? property : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parameterSchema(value: unknown): ODRToolParameterSchema {
  if (!isRecord(value)) {
    return {};
  }
  return {
    ...value,
    type: typeof value.type === "string" ? value.type : undefined,
    enum: Array.isArray(value.enum) ? value.enum : undefined,
  };
}

function schemaProperties(value: unknown): Record<string, ODRToolParameterSchema> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, schema]) => [name, parameterSchema(schema)])
  );
}

function toolSchema(value: unknown): ODRToolSchema {
  if (!isRecord(value)) {
    return { type: "object" };
  }
  return {
    ...value,
    type: "object",
    properties: schemaProperties(value.properties),
    required: Array.isArray(value.required) ? stringArray(value.required) : undefined,
  };
}

function parseTool(value: unknown): ODRTool | undefined {
  const name = stringProperty(value, "name");
  if (!name || !isRecord(value)) {
    return undefined;
  }
  return {
    name,
    description: stringProperty(value, "description") ?? "",
    inputSchema: toolSchema(value.inputSchema),
    outputSchema: isRecord(value.outputSchema) ? toolSchema(value.outputSchema) : undefined,
  };
}

function parseServer(value: unknown): ODRServer | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const publisherMeta = recordProperty(
    recordProperty(value, "_meta"),
    "io.modelcontextprotocol.registry/publisher-provided"
  );
  const windowsMeta = recordProperty(publisherMeta, "com.microsoft.windows");
  const manifest = recordProperty(windowsMeta, "manifest");
  const manifestMeta = recordProperty(manifest, "_meta");
  const manifestWindowsMeta = recordProperty(manifestMeta, "com.microsoft.windows");
  const packageFamily = stringProperty(manifestWindowsMeta, "package_family_name");
  const server = recordProperty(manifest, "server");
  const mcpConfig = recordProperty(server, "mcp_config");
  if (!packageFamily || !mcpConfig) {
    return undefined;
  }

  const staticResponses = recordProperty(manifestWindowsMeta, "static_responses");
  const toolsResponse = recordProperty(staticResponses, "tools/list");
  const rawTools = toolsResponse?.tools;
  const tools = Array.isArray(rawTools)
    ? rawTools.map(parseTool).filter((tool): tool is ODRTool => tool !== undefined)
    : [];
  const packages = Array.isArray(value.packages) ? value.packages : [];
  const name = stringProperty(value, "name") ?? "";

  return {
    name,
    packageFamily,
    display_name: stringProperty(manifest, "display_name") ?? name,
    description: stringProperty(value, "description") ?? "",
    version: stringProperty(value, "version") ?? "1.0.0",
    identifier: stringProperty(packages[0], "identifier") ?? "",
    command: stringProperty(mcpConfig, "command") ?? "",
    args: stringArray(mcpConfig.args),
    tools,
  };
}

export class ODRProvider {
  static isODRServer(serverConfig: unknown): boolean {
    const type = stringProperty(serverConfig, "type");
    const command = stringProperty(serverConfig, "command");
    if (type !== "stdio" || !command) {
      return false;
    }
    const configCommand = command.toLowerCase();
    return configCommand === "odr" || configCommand.endsWith("odr.exe");
  }

  static parseODRListOutput(jsonOutput: unknown): ODRServer[] {
    if (!isRecord(jsonOutput) || !Array.isArray(jsonOutput.servers)) {
      return [];
    }
    return jsonOutput.servers
      .map(parseServer)
      .filter((server): server is ODRServer => server !== undefined);
  }

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
      return ODRProvider.parseODRListOutput(JSON.parse(stdout));
    } catch (error) {
      odrProviderDeps.logError("Error executing odr list:", error);
      return [];
    }
  }

  static async getToolsForODRServer(command: string, args: string[] = []): Promise<ODRTool[]> {
    const odrServers = await ODRProvider.listServers();
    const matchingServer = odrServers.find(
      (odrServer) =>
        odrServer.command === command && JSON.stringify(odrServer.args) === JSON.stringify(args)
    );
    return matchingServer?.tools ?? [];
  }
}
