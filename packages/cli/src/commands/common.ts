// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandOption } from "@microsoft/teamsfx-api";
import { featureFlagManager, FeatureFlags } from "@microsoft/teamsfx-core";
import { commands } from "../resource";

/**
 * Gates the values of the `mcp-da-auth-type` option by command and feature flags.
 * `bearer-token` belongs only to add-action, while `oauth-dynamic` is accepted only when both
 * `TEAMSFX_MCP_FOR_DA_DT` and `TEAMSFX_MCP_FOR_DA_DCR` are on.
 */
export function gateMCPDAAuthTypeChoices(
  options: CLICommandOption[],
  allowBearerToken: boolean
): CLICommandOption[] {
  const showDCR =
    featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT) &&
    featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADCR);
  for (const option of options) {
    if (option.name === "mcp-da-auth-type" && option.type === "string") {
      option.choices = [
        "oauth",
        ...(showDCR ? ["oauth-dynamic"] : []),
        "entra-sso",
        ...(allowBearerToken ? ["bearer-token"] : []),
        "none",
      ];
      break;
    }
  }
  return options;
}

const MCP_DA_CREDENTIAL_OPTION_NAMES = [
  "mcp-da-client-id",
  "mcp-da-client-secret",
  "mcp-da-scopes",
  "mcp-da-api-key",
];

function mcpDACredentialOptions(): CLICommandOption[] {
  return [
    {
      name: "mcp-da-client-id",
      type: "string",
      description:
        "OAuth client id for the MCP server (static OAuth), or the Entra application client id (Entra SSO).",
    },
    {
      name: "mcp-da-client-secret",
      type: "string",
      description: "OAuth client secret for the MCP server. Required for static OAuth.",
    },
    {
      name: "mcp-da-scopes",
      type: "string",
      description: "Space-separated OAuth scopes for the MCP server. Optional for static OAuth.",
    },
    {
      name: "mcp-da-api-key",
      type: "string",
      description: "API key sent as a bearer token to the MCP server.",
    },
  ];
}

/**
 * Runtime gate for the static-OAuth / Entra-SSO credential options of the MCP-for-DA add-action
 * flow (`mcp-da-client-id`, `mcp-da-client-secret`, `mcp-da-scopes`). The whole add-action MCP
 * branch in `core.addPlugin` lives behind `TEAMSFX_MCP_FOR_DA_DT`, so the credential flags are
 * only accepted when that flag is on. Idempotent: any previously-injected credential options are
 * dropped first so repeated calls (and flag flips) stay in sync. Returns a new array; the input
 * is not mutated.
 */
export function gateMCPDACredentialOptions(options: CLICommandOption[]): CLICommandOption[] {
  const result = options.filter((o) => !MCP_DA_CREDENTIAL_OPTION_NAMES.includes(o.name));
  if (featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT)) {
    result.push(...mcpDACredentialOptions());
  }
  return result;
}

export const ProjectFolderOption: CLICommandOption = {
  name: "folder",
  questionName: "projectPath",
  shortName: "f",
  description: "Project folder.",
  type: "string",
  required: true,
  default: "./",
};

export const ProjectFolderOptionWithoutValidation: CLICommandOption = {
  name: "folder",
  questionName: "projectPath",
  shortName: "f",
  description: "Project folder.",
  type: "string",
  required: true,
  default: "./",
  skipValidation: true,
};

export const TeamsAppManifestFileOption: CLICommandOption = {
  name: "manifest-file",
  type: "string",
  description: "Specifies the app manifest file path.",
  default: "./appPackage/manifest.json",
};
export const EntraAppManifestFileOption: CLICommandOption = {
  name: "manifest-file",
  questionName: "manifest-file-path",
  type: "string",
  description: "Specifies the Microsoft Entra app manifest file path.",
  default: "./aad.manifest.json",
};
export const TeamsAppPackageOption: CLICommandOption = {
  name: "package-file",
  type: "string",
  description: "Specifies the zipped app package file path.",
};
export const TeamsAppOuputPackageOption: CLICommandOption = {
  name: "output-package-file",
  type: "string",
  description: "Specifies the output zipped app package file path.",
  default: "./appPackage/build/appPackage.${env}.zip",
};
export const TeamsAppOutputFolderOption: CLICommandOption = {
  name: "output-folder",
  type: "string",
  description: "Specifies the output folder containing the manifest(s).",
  default: "./appPackage/build",
};
export const EnvOption: CLICommandOption = {
  name: "env",
  type: "string",
  description:
    "Specifies the environment name for the project scaffolded by Microsoft 365 Agents Toolkit.",
};
export const IgnoreLoadEnvOption: CLICommandOption = {
  name: "ignore-env-file",
  type: "boolean",
  description: "Whether to skip loading .env file when --env is not specified.",
};
export const EnvFileOption: CLICommandOption = {
  name: "env-file",
  type: "string",
  description:
    "Specifies the .env file that defines the variables to replace in the app manifest template file.",
};
export const IgnoreKeysOption: CLICommandOption = {
  name: "ignore-keys",
  type: "array",
  description: "Specifies the keys to ignore in the .env file.",
};

export const ListFormatOption: CLICommandOption = {
  name: "format",
  shortName: "f",
  description: commands["list.templates"].options.format,
  type: "string",
  choices: ["table", "json"],
  default: "table",
  required: true,
};

export const ShowDescriptionOption: CLICommandOption = {
  name: "description",
  shortName: "d",
  description: "Whether to show description in the result.",
  type: "boolean",
  default: false,
  required: true,
};

export const ConfigFilePathOption: CLICommandOption = {
  type: "string",
  name: "config-file-path",
  shortName: "c",
  description: "Specifies the path of the configuration yaml file.",
};

export const ValidateMethodOption: CLICommandOption = {
  type: "string",
  name: "validate-method",
  shortName: "m",
  choices: ["validation-rules", "test-cases"],
  description: "Specifies validation method",
};
