// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { CLICommand } from "@microsoft/teamsfx-api";
import { AddPluginInputs, AddPluginOptions } from "@microsoft/teamsfx-core";
import { getFxCore } from "../../activate";
import { commands } from "../../resource";
import { TelemetryEvent } from "../../telemetry/cliTelemetryEvents";
import {
  gateMCPDAAuthTypeChoices,
  gateMCPDACredentialOptions,
  ProjectFolderOption,
} from "../common";

export const addPluginCommand: CLICommand = {
  name: "action",
  description: commands["add.action"].description,
  options: [
    ...gateMCPDACredentialOptions(gateMCPDAAuthTypeChoices(AddPluginOptions, true)),
    ProjectFolderOption,
  ],
  telemetry: {
    event: TelemetryEvent.AddCopilotPlugin,
  },
  handler: async (ctx) => {
    const inputs = ctx.optionValues as AddPluginInputs;
    const core = getFxCore();
    const res = await core.addPlugin(inputs);
    return res;
  },
};
