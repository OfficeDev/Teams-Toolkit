// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { CLICommand, err, ok } from "@microsoft/teamsfx-api";
import { ExportOpenPluginInputs, ExportOpenPluginOptions } from "@microsoft/teamsfx-core";
import { getFxCore } from "../../activate";
import { logger } from "../../commonlib/logger";
import { commands } from "../../resource";
import { TelemetryEvent } from "../../telemetry/cliTelemetryEvents";

export const exportOpenPluginCommand: CLICommand = {
  // The spec was renamed from "Open Plugin" to "Agent Plugins" (open-plugins.com
  // now redirects to agent-plugins.org). `agentplugin` is the preferred spelling;
  // `openplugin` stays as the command name so existing scripts keep working.
  name: "openplugin",
  aliases: ["agentplugin"],
  description: commands["export.openplugin"].description,
  options: [...ExportOpenPluginOptions],
  telemetry: {
    event: TelemetryEvent.ExportOpenPlugin,
  },
  defaultInteractiveOption: false,
  handler: async (ctx) => {
    const inputs = ctx.optionValues as ExportOpenPluginInputs;
    const core = getFxCore();
    const res = await core.exportOpenPlugin(inputs);
    if (res.isErr()) {
      return err(res.error);
    }
    logger.info(`Agent Plugin written to: ${res.value.outputPath}`);
    for (const warning of res.value.warnings ?? []) {
      logger.warning(warning.content);
    }
    return ok(undefined);
  },
};
