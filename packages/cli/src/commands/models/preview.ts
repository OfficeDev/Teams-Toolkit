// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  CLICommand,
  CLIContext,
  FxError,
  InputsWithProjectPath,
  Result,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import {
  HubTypes,
  PreviewTeamsAppInputs,
  PreviewTeamsAppOptions,
  TelemetryContext,
  environmentNameManager,
} from "@microsoft/teamsfx-core";
import * as constants from "../../cmds/preview/constants";
import { localTelemetryReporter } from "../../cmds/preview/localTelemetryReporter";
import PreviewEnv from "../../cmds/preview/previewEnv";
import { commands } from "../../resource";
import { TelemetryEvent, TelemetryProperty } from "../../telemetry/cliTelemetryEvents";
import { ProjectFolderOption } from "../common";

export const previewCommand: CLICommand = {
  name: "preview",
  description: commands.preview.description,
  options: [
    ...PreviewTeamsAppOptions.map((option) => {
      if (option.name === "manifest-file") {
        option.default = "./appPackage/manifest.json";
      }
      return option;
    }),
    {
      name: "run-command",
      type: "string",
      shortName: "c",
      description:
        "The command starts the service and works only in local environment. If undefined, it auto-detects the appropriate command from project type (npm run dev:teamsfx or dotnet run or func start), and if empty, it will skip starting the local service.",
    },
    {
      name: "running-pattern",
      shortName: "p",
      type: "string",
      description: `The ready signal indicates the service has launched and it works only in 'local' environment. If undefined, the command defaults to ("${constants.defaultRunningPattern.source}"), and if empty, the process start is used as the ready signal.`,
    },
    {
      name: "open-only",
      type: "boolean",
      shortName: "o",
      description:
        "Work for 'local' environment only. If true, directly open web client without launching local service.",
      default: false,
      required: true,
    },
    {
      name: "browser",
      type: "string",
      shortName: "b",
      description: "Select browser to open Microsoft Teams web client.",
      choices: [constants.Browser.chrome, constants.Browser.edge, constants.Browser.default],
      default: constants.Browser.default,
      required: true,
    },
    {
      name: "browser-arg",
      type: "array",
      shortName: "ba",
      description: `Argument to pass to the browser (e.g. --browser-args="--guest")`,
    },
    {
      name: "exec-path",
      type: "string",
      shortName: "ep",
      description:
        'The paths that will be added to the system environment variable PATH when the command is executed, defaults to "${folder}/devTools/func".',
      default: constants.defaultExecPath,
      required: true,
    },
    {
      name: "env",
      type: "string",
      description: "Specifies the environment name for the project.",
      required: true,
      default: "local",
    },
    {
      name: "desktop",
      type: "boolean",
      shortName: "d",
      description: "If true, open Teams desktop client instead of web client.",
      default: false,
      required: true,
    },
    ProjectFolderOption,
  ],
  telemetry: {
    event: TelemetryEvent.Preview,
  },
  examples: [
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} preview --env --local`,
      description: "Local Preview",
    },
    {
      command: `${process.env.TEAMSFX_CLI_BIN_NAME} preview --env --remote`,
      description: "Remote Preview",
    },
  ],
  defaultInteractiveOption: false,
  handler: async (ctx: CLIContext) => {
    const inputs = ctx.optionValues as PreviewTeamsAppInputs & InputsWithProjectPath;
    const workspaceFolder = inputs.projectPath as string;
    const env = inputs.env as string;
    const manifestFilePath = inputs["manifest-path"] as string;
    const command = inputs["run-command"] as string;
    const runningPattern = inputs["running-pattern"] as string;
    const openOnly = inputs["open-only"] as boolean;
    const m365Host = inputs["m365-host"] as HubTypes;
    const execPath: string = inputs["exec-path"] as string;
    const browser = inputs.browser as constants.Browser;
    const browserArguments = (inputs["browser-arg"] as string[]) ?? [];
    const desktop: boolean = inputs["desktop"] as boolean;
    ctx.telemetryProperties[TelemetryProperty.PreviewType] =
      environmentNameManager.isRemoteEnvironment(env.toLowerCase())
        ? `remote-${env}`
        : env.toLowerCase();
    ctx.telemetryProperties[TelemetryProperty.PreviewHub] = m365Host;
    ctx.telemetryProperties[TelemetryProperty.PreviewBrowser] = browser;
    const cmd = new PreviewEnv();
    const res = await localTelemetryReporter.runWithTelemetryGeneric(
      TelemetryEvent.Preview,
      async () =>
        cmd.doPreview(
          workspaceFolder,
          env,
          manifestFilePath,
          command,
          runningPattern,
          openOnly,
          m365Host,
          browser,
          browserArguments,
          execPath,
          desktop
        ),
      (result: Result<null, FxError>, c: TelemetryContext) => {
        // whether on success or failure, send this.telemetryProperties and this.telemetryMeasurements
        Object.assign(c.properties, ctx.telemetryProperties);
        Object.assign(c.measurements, []);
        return result.isErr() ? result.error : undefined;
      },
      ctx.telemetryProperties
    );
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(undefined);
  },
};
