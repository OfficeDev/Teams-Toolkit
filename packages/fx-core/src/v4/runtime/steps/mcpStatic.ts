// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { Result, err, ok } from "neverthrow";
import { MCPFetchResult, fetchMCPTools } from "../../../component/utils/mcpToolFetcher";
import { parseMcpStaticToolsJson, selectMcpStaticTools } from "../../mcp/mcpStaticTools";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

/** Materialize static MCP tools and plugin runtime metadata. */

const SOURCE = "Scaffold";

export const mcpStaticDeps = {
  fetchTools: (serverUrl: string): Promise<MCPFetchResult> => fetchMCPTools(serverUrl),
};

/** Engine step name `mcp-static/materialize-tools`. */
export const STEP_MATERIALIZE_STATIC_MCP_TOOLS = "mcp-static/materialize-tools";

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function isUnresolvedToken(value: string): boolean {
  return /^\{\{[A-Za-z_][A-Za-z0-9_.]*\}\}$/.test(value);
}

function optionalStringParam(params: StepParams, key: string): string | undefined {
  const value = stringParam(params, key);
  if (value === undefined || value === "" || isUnresolvedToken(value)) {
    return undefined;
  }
  return value;
}

function stringArrayParam(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function optionalStringArrayParam(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  if (
    value === undefined ||
    value === "" ||
    (typeof value === "string" && isUnresolvedToken(value))
  ) {
    return undefined;
  }
  return stringArrayParam(params, key);
}

function hasOptionalArrayParamValue(params: StepParams, key: string): boolean {
  const value = params[key];
  return !(
    value === undefined ||
    value === "" ||
    (typeof value === "string" && isUnresolvedToken(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mcpToolsJsonFromFetchResult(
  serverUrl: string,
  result: MCPFetchResult
): Result<string, FxError> {
  if (result.requiresAuth) {
    return err(
      new UserError({
        source: SOURCE,
        name: "McpAuthRequired",
        message: `The MCP server at ${serverUrl} requires authentication.`,
      })
    );
  }
  if (result.tools.length === 0) {
    return err(
      new UserError({
        source: SOURCE,
        name: "McpToolsNotFound",
        message: `No tools were discovered from the MCP server at ${serverUrl}.`,
      })
    );
  }
  return ok(JSON.stringify({ tools: result.tools }));
}

async function resolveToolsJson(
  resolved: StepParams,
  serverUrl: string
): Promise<Result<string, FxError>> {
  const toolsJson = optionalStringParam(resolved, "toolsJson")?.trim();
  if (toolsJson) {
    return ok(toolsJson);
  }

  const toolsFilePath = optionalStringParam(resolved, "toolsFilePath")?.trim();
  if (toolsFilePath) {
    try {
      return ok(fs.readFileSync(toolsFilePath, "utf8"));
    } catch {
      return err(
        new UserError({
          source: SOURCE,
          name: "McpToolsFileReadFailed",
          message: "Failed to read the MCP tools file.",
        })
      );
    }
  }

  try {
    return mcpToolsJsonFromFetchResult(serverUrl, await mcpStaticDeps.fetchTools(serverUrl));
  } catch (error) {
    if (error instanceof UserError || error instanceof SystemError) {
      return err(error);
    }
    return err(
      new UserError({
        source: SOURCE,
        name: "McpToolsFetchFailed",
        message: `Failed to fetch tools from the MCP server at ${serverUrl}.`,
      })
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readRequiredJson(
  ctx: StepContext,
  pluginPath: string
): Result<Record<string, unknown>, FxError> {
  const current = ctx.read(pluginPath);
  if (current === undefined) {
    return err(
      systemError(
        "McpStaticPluginMissing",
        `Cannot materialize static MCP tools because '${pluginPath}' was not produced by the render phase.`
      )
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(current.toString("utf8"));
  } catch (error) {
    return err(
      systemError(
        "McpStaticPluginParse",
        `Cannot parse '${pluginPath}' as JSON: ${errorMessage(error)}`
      )
    );
  }
  if (!isRecord(parsed)) {
    return err(systemError("McpStaticPluginShape", `'${pluginPath}' is not a JSON object`));
  }
  return ok(parsed);
}

function fileName(filePath: string): string {
  const segments = filePath.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? filePath;
}

/** Registered step for writing `mcp-tools-1.json` and static RemoteMCPServer metadata. */
export const mcpStaticMaterializeTools: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "pluginPath") === undefined) {
      return "missing string parameter 'pluginPath'";
    }
    if (stringParam(resolved, "toolsPath") === undefined) {
      return "missing string parameter 'toolsPath'";
    }
    if (stringParam(resolved, "mcpServerUrl") === undefined) {
      return "missing string parameter 'mcpServerUrl'";
    }
    if (
      hasOptionalArrayParamValue(resolved, "selected") &&
      stringArrayParam(resolved, "selected") === undefined
    ) {
      return "missing string[] parameter 'selected'";
    }
    return undefined;
  },
  async apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const pluginPath = stringParam(resolved, "pluginPath");
    const toolsPath = stringParam(resolved, "toolsPath");
    const mcpServerUrl = stringParam(resolved, "mcpServerUrl");
    const selected = optionalStringArrayParam(resolved, "selected");
    if (hasOptionalArrayParamValue(resolved, "selected") && selected === undefined) {
      return err(
        systemError("McpStaticParams", "resolved parameters are not all of the expected type")
      );
    }
    if (pluginPath === undefined || toolsPath === undefined || mcpServerUrl === undefined) {
      return err(
        systemError("McpStaticParams", "resolved parameters are not all of the expected type")
      );
    }

    const toolsJson = await resolveToolsJson(resolved, mcpServerUrl);
    if (toolsJson.isErr()) {
      return err(toolsJson.error);
    }

    const parsedTools = parseMcpStaticToolsJson(toolsJson.value);
    if (!parsedTools.ok) {
      return err(systemError(parsedTools.code, parsedTools.message));
    }
    const selectedTools = selectMcpStaticTools(
      parsedTools.tools,
      selected ?? parsedTools.tools.map((tool) => tool.name)
    );
    if (!selectedTools.ok) {
      return err(systemError(selectedTools.code, selectedTools.message));
    }

    const plugin = readRequiredJson(ctx, pluginPath);
    if (plugin.isErr()) {
      return err(plugin.error);
    }

    plugin.value.functions = selectedTools.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
    plugin.value.runtimes = [
      {
        type: "RemoteMCPServer",
        spec: {
          url: mcpServerUrl,
          mcp_tool_description: {
            file: fileName(toolsPath),
          },
        },
        run_for_functions: selectedTools.tools.map((tool) => tool.name),
      },
    ];

    ctx.write(pluginPath, Buffer.from(JSON.stringify(plugin.value, null, 4) + "\n", "utf8"));
    ctx.write(
      toolsPath,
      Buffer.from(
        JSON.stringify({ tools: selectedTools.tools.map((tool) => tool.raw) }, null, 4) + "\n",
        "utf8"
      )
    );
    return ok(undefined);
  },
};
