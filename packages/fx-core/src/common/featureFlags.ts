// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Determine whether feature flag is enabled based on environment variable setting
export function isFeatureFlagEnabled(featureFlagName: string, defaultValue = false): boolean {
  const flag = process.env[featureFlagName];
  if (flag === undefined) {
    return defaultValue; // allows consumer to set a default value when environment variable not set
  } else {
    return flag === "1" || flag.toLowerCase() === "true"; // can enable feature flag by set environment variable value to "1" or "true"
  }
}
export class FeatureFlagName {
  static readonly CLIDotNet = "TEAMSFX_CLI_DOTNET";
  static readonly SampleConfigBranch = "TEAMSFX_SAMPLE_CONFIG_BRANCH";
  static readonly ChatParticipantUIEntries = "TEAMSFX_CHAT_PARTICIPANT_ENTRIES";
  static readonly HideGitHubCopilotPreviewTag = "TEAMSFX_HIDE_GITHUB_COPILOT_PREVIEW_TAG";
  static readonly SMEOAuth = "SME_OAUTH";
  static readonly ShowDiagnostics = "TEAMSFX_SHOW_DIAGNOSTICS";
  static readonly TelemetryTest = "TEAMSFX_TELEMETRY_TEST";
  static readonly DevTunnelTest = "TEAMSFX_DEV_TUNNEL_TEST";
  static readonly SyncManifest = "TEAMSFX_SYNC_MANIFEST";
  static readonly KiotaNPMIntegration = "TEAMSFX_KIOTA_NPM_INTEGRATION";
  static readonly CEAEnabled = "TEAMSFX_CEA_ENABLED";
  static readonly SandBoxedTeam = "TEAMSFX_SANDBOXED_TEAM";
  static readonly SensitivityLabelEnabled = "TEAMSFX_SENSITIVITY_LABEL";
  static readonly DAMetaOS = "TEAMSFX_DA_METAOS";
  static readonly CFShortcutMetaOS = "TEAMSFX_CF_SHORTCUT_METAOS";
  static readonly OpenPluginImportExport = "TEAMSFX_OPENPLUGIN_IMPORT_EXPORT";
  static readonly AgentSkillsManifest = "TEAMSFX_AGENT_SKILLS";
  static readonly BrokerAuth = "TEAMSFX_BROKER_AUTH";
  // Dynamic Tool Discovery for MCP-backed Declarative Agents: drops static MCP tool fetching at
  // scaffold time, absorbs the fetch-mcp-tools CodeLens flow into the create/add-action flows,
  // and persists OAuth credentials into env files instead of the in-process bridge.
  // See docs/01-product/scenarios/da/draft/.
  static readonly MCPForDADT = "TEAMSFX_MCP_FOR_DA_DT";
  // Surface the "OAuth (with dynamic registration)" auth-type option in the
  // DA-with-MCP scaffold picker. Requires MCPForDADT to also be enabled.
  static readonly MCPForDADCR = "TEAMSFX_MCP_FOR_DA_DCR";
  // Add config files to existing project to make it toolkit compatible
  static readonly GenerateConfigFiles = "TEAMSFX_GENERATE_CONFIG_FILES";

  // Permanent feature flag for sovereign cloud environment setting
  static readonly SovereignCloudEnvironment = "TEAMSFX_SOVEREIGN_CLOUD_ENVIRONMENT";

  // Global switch for the v4 architecture (currently routes scaffold template
  // resolution through the v4 distribution channel).
  static readonly V4Enabled = "TEAMSFX_V4_ENABLED";
}

export interface FeatureFlag {
  name: string;
  defaultValue: string;
  description?: string;
}

export class FeatureFlags {
  // Testing feature flags - not for production use
  static readonly CLIDotNet = { name: FeatureFlagName.CLIDotNet, defaultValue: "false" };
  static readonly ChatParticipantUIEntries = {
    name: FeatureFlagName.ChatParticipantUIEntries,
    defaultValue: "false",
  };
  static readonly HideGitHubCopilotPreviewTag = {
    name: FeatureFlagName.HideGitHubCopilotPreviewTag,
    defaultValue: "false",
  };
  static readonly SMEOAuth = { name: FeatureFlagName.SMEOAuth, defaultValue: "false" };
  static readonly ShowDiagnostics = {
    name: FeatureFlagName.ShowDiagnostics,
    defaultValue: "false",
  };
  static readonly TelemetryTest = {
    name: FeatureFlagName.TelemetryTest,
    defaultValue: "false",
  };
  static readonly DevTunnelTest = {
    name: FeatureFlagName.DevTunnelTest,
    defaultValue: "false",
  };
  static readonly SyncManifest = {
    name: FeatureFlagName.SyncManifest,
    defaultValue: "false",
  };

  static readonly KiotaNPMIntegration = {
    name: FeatureFlagName.KiotaNPMIntegration,
    defaultValue: "true",
  };
  static readonly CEAEnabled = {
    name: FeatureFlagName.CEAEnabled,
    defaultValue: "false",
  };
  static readonly SandBoxedTeam = {
    name: FeatureFlagName.SandBoxedTeam,
    defaultValue: "false",
  };
  static readonly SensitivityLabelEnabled = {
    name: FeatureFlagName.SensitivityLabelEnabled,
    defaultValue: "false",
  };
  static readonly DAMetaOS = {
    name: FeatureFlagName.DAMetaOS,
    defaultValue: "false",
  };
  static readonly CFShortcutMetaOS = {
    name: FeatureFlagName.CFShortcutMetaOS,
    defaultValue: "false",
  };
  static readonly OpenPluginImportExport = {
    name: FeatureFlagName.OpenPluginImportExport,
    defaultValue: "true",
  };
  static readonly AgentSkillsManifest = {
    name: FeatureFlagName.AgentSkillsManifest,
    defaultValue: "false",
  };
  static readonly BrokerAuth = {
    name: FeatureFlagName.BrokerAuth,
    defaultValue: "false",
  };
  static readonly V4Enabled = {
    name: FeatureFlagName.V4Enabled,
    defaultValue: "true",
  };
  static readonly MCPForDADT = {
    name: FeatureFlagName.MCPForDADT,
    defaultValue: "false",
  };
  static readonly MCPForDADCR = {
    name: FeatureFlagName.MCPForDADCR,
    defaultValue: "true",
  };
  static readonly GenerateConfigFiles = {
    name: FeatureFlagName.GenerateConfigFiles,
    defaultValue: "false",
  };
  static readonly SovereignCloudEnvironment = {
    name: FeatureFlagName.SovereignCloudEnvironment,
    defaultValue: "",
  };
}

export class FeatureFlagManager {
  getBooleanValue(featureFlag: FeatureFlag): boolean {
    return isFeatureFlagEnabled(
      featureFlag.name,
      featureFlag.defaultValue === "true" || featureFlag.defaultValue === "1"
    );
  }
  getBooleanValueByName(featureFlagName: string, defaultValue = false): boolean {
    const featureFlag = this.list().find((flag) => flag.name === featureFlagName);
    return this.getBooleanValue(
      featureFlag ?? { name: featureFlagName, defaultValue: defaultValue ? "true" : "false" }
    );
  }
  setBooleanValue(featureFlag: FeatureFlag, value: boolean): void {
    process.env[featureFlag.name] = value ? "true" : "false";
  }
  getStringValue(featureFlag: FeatureFlag): string {
    return process.env[featureFlag.name] || featureFlag.defaultValue;
  }
  list(): FeatureFlag[] {
    return Object.values(FeatureFlags);
  }
  listEnabled(): string[] {
    return this.list()
      .filter((f) => isFeatureFlagEnabled(f.name))
      .map((f) => f.name);
  }
}

export const featureFlagManager = new FeatureFlagManager();

export function readBooleanFeatureFlag(featureFlagName: string, defaultValue = false): boolean {
  return featureFlagManager.getBooleanValueByName(featureFlagName, defaultValue);
}
