// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandArgument, CLICommandOption } from "@microsoft/teamsfx-api";

export const ImportOpenPluginOptions: CLICommandOption[] = [
  {
    name: "path",
    type: "string",
    shortName: "p",
    description:
      "Open Plugin directory containing .plugin/plugin.json, .claude-plugin/plugin.json, or .cursor-plugin/plugin.json.",
    required: true,
  },
  {
    name: "output",
    type: "string",
    shortName: "o",
    description: "Destination project folder. Defaults to ./<plugin-name>.",
  },
  {
    name: "privacy-url",
    type: "string",
    description:
      "developer.privacyUrl for the generated manifest. Required unless the source plugin.json carries an x-microsoft-365-agents-toolkit extension block from a previous 'atk export openplugin'.",
  },
  {
    name: "terms-url",
    type: "string",
    description:
      "developer.termsOfUseUrl for the generated manifest. Required unless the source plugin.json carries an x-microsoft-365-agents-toolkit extension block from a previous 'atk export openplugin'.",
  },
  {
    name: "website-url",
    type: "string",
    description:
      "developer.websiteUrl. Falls back to plugin.json 'homepage' then 'author.url' when omitted.",
  },
  {
    name: "app-id",
    type: "string",
    description: "Override the deterministic UUIDv5 generated for the manifest 'id' field.",
  },
  {
    name: "default-auth-type",
    type: "string",
    description:
      "Default auth type for MCP connectors discovered in .mcp.json. 'Auto' probes remote HTTPS MCP endpoints and OAuth metadata, warns on inferred choices, and requires an explicit type when auth is unresolved.",
    default: "Auto",
    choices: ["Auto", "None", "OAuthPluginVault", "ApiKeyPluginVault"],
  },
  {
    name: "package-name",
    type: "string",
    description:
      "Full reverse-DNS packageName (e.g. com.example.my-plugin). Omitted from the manifest when not provided.",
  },
];

export const ImportOpenPluginArguments: CLICommandArgument[] = [];
