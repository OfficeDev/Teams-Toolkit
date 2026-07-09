// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { CLICommand, InputsWithProjectPath, err } from "@microsoft/teamsfx-api";
import { CreateEnvArguments, CreateEnvInputs, CreateEnvOptions } from "@microsoft/teamsfx-core";
import * as settingHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import * as activate from "../../activate";
import { WorkspaceNotSupported } from "../../cmds/preview/errors";
import { commands } from "../../resource";
import { TelemetryEvent } from "../../telemetry/cliTelemetryEvents";
import { ProjectFolderOption } from "../common";

export const envAddCommand: CLICommand = {
  name: "add",
  description: commands["env.add"].description,
  options: [...CreateEnvOptions, ProjectFolderOption],
  arguments: CreateEnvArguments,
  telemetry: {
    event: TelemetryEvent.CreateNewEnvironment,
  },
  defaultInteractiveOption: false,
  handler: async (ctx) => {
    const inputs = ctx.optionValues as CreateEnvInputs & InputsWithProjectPath;
    if (!settingHelper.isValidProjectV3(inputs.projectPath ?? "")) {
      return err(WorkspaceNotSupported(inputs.projectPath));
    }
    const core = activate.getFxCore();
    const result = await core.createEnv(inputs);
    return result;
  },
};
