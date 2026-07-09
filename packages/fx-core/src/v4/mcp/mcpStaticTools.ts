// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/** v4-local parser for static MCP tools JSON. */

export interface McpStaticTool {
  name: string;
  description: string;
  raw: Record<string, unknown>;
}

export type McpStaticToolsParseResult =
  | { ok: true; tools: McpStaticTool[] }
  | { ok: false; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseMcpStaticToolsJson(toolsJson: string): McpStaticToolsParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(toolsJson);
  } catch (error) {
    return {
      ok: false,
      code: "McpStaticToolsParse",
      message: `MCP tools JSON is not valid JSON: ${errorMessage(error)}`,
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      code: "McpStaticToolsShape",
      message: "MCP tools JSON must be an object with a 'tools' array.",
    };
  }
  const tools = parsed.tools;
  if (!Array.isArray(tools)) {
    return {
      ok: false,
      code: "McpStaticToolsArray",
      message: "MCP tools JSON must contain a 'tools' array.",
    };
  }

  const parsedTools: McpStaticTool[] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || typeof tool.name !== "string" || tool.name.length === 0) {
      return {
        ok: false,
        code: "McpStaticToolName",
        message: "Every MCP tool must be an object with a non-empty string 'name'.",
      };
    }
    const description = typeof tool.description === "string" ? tool.description : "";
    parsedTools.push({ name: tool.name, description, raw: tool });
  }
  return { ok: true, tools: parsedTools };
}

export function selectMcpStaticTools(
  tools: McpStaticTool[],
  selected: string[]
): McpStaticToolsParseResult {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const selectedTools: McpStaticTool[] = [];
  for (const name of selected) {
    const tool = byName.get(name);
    if (tool === undefined) {
      return {
        ok: false,
        code: "McpStaticToolMissing",
        message: `Selected MCP tool '${name}' does not exist in the tools JSON.`,
      };
    }
    selectedTools.push(tool);
  }
  return { ok: true, tools: selectedTools };
}
