// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandArgument, CLICommandOption } from "@microsoft/teamsfx-api";

export const ExportOpenPluginOptions: CLICommandOption[] = [
  {
    name: "path",
    type: "string",
    shortName: "p",
    description: "Path to the ATK project folder (containing appPackage/manifest.json) to export.",
    required: true,
  },
  {
    name: "output",
    type: "string",
    shortName: "o",
    description:
      "Destination Agent Plugin directory. Defaults to ./<plugin-name>-agentplugin in the current working directory.",
  },
  {
    name: "manifest-kind",
    type: "string",
    description:
      "Deprecated and ignored. Agent Plugins v1.0.0 requires plugin.json in the plugin root, so alternate manifest locations are no longer emitted.",
    default: "open-plugin",
    choices: ["open-plugin", "claude-plugin", "cursor-plugin"],
  },
];

export const ExportOpenPluginArguments: CLICommandArgument[] = [];
