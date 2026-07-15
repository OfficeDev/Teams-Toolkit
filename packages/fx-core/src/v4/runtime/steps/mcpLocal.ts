// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

/** Materialize local MCP stdio servers. See create-mcp-server scenario spec. */

const SOURCE = "Scaffold";

/** Engine step name `mcp-local/materialize-servers`. */
export const STEP_MATERIALIZE_LOCAL_SERVERS = "mcp-local/materialize-servers";

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

/** Read a `with` value as a string, or `undefined` if it is absent / non-string. */
function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

/** Read a `with` value as the multiSelect `string[]`, or `undefined`. */
function stringArrayParam(params: StepParams, key: string): string[] | undefined {
  const value = params[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One materialized stdio server entry. */
interface LocalServer {
  type: "stdio";
  command: string;
  args: string[];
}

/** Build one stdio server from its catalog record. */
function toLocalServer(id: string, entry: unknown): Result<LocalServer, FxError> {
  if (!isRecord(entry)) {
    return err(
      systemError("McpLocalCatalogEntry", `local server catalog has no entry for '${id}'`)
    );
  }
  const command = entry.command;
  if (typeof command !== "string") {
    return err(
      systemError("McpLocalCatalogCommand", `local server '${id}' has no string 'command'`)
    );
  }
  const rawArgs = entry.args;
  if (
    rawArgs !== undefined &&
    (!Array.isArray(rawArgs) || !rawArgs.every((a) => typeof a === "string"))
  ) {
    return err(
      systemError("McpLocalCatalogArgs", `local server '${id}' has a non-string-array 'args'`)
    );
  }
  return ok({ type: "stdio", command, args: rawArgs === undefined ? [] : rawArgs });
}

/** Registered step for writing `.vscode/mcp.json` in the local branch. */
export const mcpLocalMaterializeServers: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "target") === undefined) {
      return "missing string parameter 'target'";
    }
    if (stringArrayParam(resolved, "selected") === undefined) {
      return "missing string[] parameter 'selected'";
    }
    if (stringParam(resolved, "catalog") === undefined) {
      return "missing string parameter 'catalog'";
    }
    return undefined;
  },
  apply(resolved: StepParams, ctx: StepContext): Result<void, FxError> {
    const target = stringParam(resolved, "target");
    const selected = stringArrayParam(resolved, "selected");
    const catalogRaw = stringParam(resolved, "catalog");
    if (target === undefined || selected === undefined || catalogRaw === undefined) {
      return err(
        systemError("McpLocalParams", "resolved parameters are not all of the expected type")
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(catalogRaw);
    } catch (error) {
      return err(
        systemError(
          "McpLocalCatalogParse",
          `local server catalog is not valid JSON: ${errorMessage(error)}`
        )
      );
    }
    if (!isRecord(parsed)) {
      return err(systemError("McpLocalCatalogShape", "local server catalog is not a JSON object"));
    }
    const servers: Record<string, LocalServer> = {};
    for (const id of selected) {
      const built = toLocalServer(id, parsed[id]);
      if (built.isErr()) {
        return err(built.error);
      }
      servers[id] = built.value;
    }
    ctx.write(target, Buffer.from(JSON.stringify({ servers }, null, 2) + "\n", "utf8"));
    return ok(undefined);
  },
};
