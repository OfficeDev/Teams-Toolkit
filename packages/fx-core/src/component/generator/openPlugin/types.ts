// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export interface OpenPluginAuthorObject {
  name?: string;
  email?: string;
  url?: string;
}

export interface OpenPluginManifest {
  /**
   * Required by Agent Plugins 1.0.0; identifies the targeted spec version.
   * Optional here because pre-1.0.0 manifests omit it and are still imported.
   */
  $schema?: string;
  name: string;
  version?: string;
  description?: string;
  /** 1.0.0 permits only the object form; the string form is legacy. */
  author?: string | OpenPluginAuthorObject;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  /**
   * Agent Plugins 1.0.0 client-specific data, keyed by reverse-domain
   * namespace. The toolkit reads and writes `com.microsoft.agents-toolkit`.
   */
  extensions?: Record<string, unknown>;

  // ---- Pre-1.0.0 fields, tolerated on import only ----
  // Agent Plugins 1.0.0 closes the manifest schema and fixes component
  // locations: a manifest can no longer relocate components or declare them
  // inline. These are still parsed so older plugin directories keep importing,
  // but they are never emitted by `atk export`.
  /** @deprecated Not in Agent Plugins 1.0.0. */
  logo?: string;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  skills?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  commands?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  agents?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  hooks?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  mcpServers?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  lspServers?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  rules?: string | string[] | Record<string, unknown>;
  /** @deprecated Component relocation was removed in Agent Plugins 1.0.0. */
  outputStyles?: string | string[];
}

export interface ParsedAuthor {
  name?: string;
  email?: string;
  url?: string;
}

export interface OpenPluginMcpServerEntry {
  /** Required by mcp.schema.json: "stdio" | "streamable-http" | "sse". */
  type?: string;
  /** Required for the streamable-http and sse transports. */
  url?: string;
  /** Required for the stdio transport. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  headers?: Record<string, string>;
  description?: string;
  // Other fields tolerated but not used.
  [key: string]: unknown;
}

export interface OpenPluginMcpJson {
  mcpServers?: Record<string, OpenPluginMcpServerEntry>;
  // Tolerate the bare form where servers are at the root.
  [key: string]: unknown;
}

export type ParsedManifestKind =
  /** Agent Plugins 1.0.0: plugin.json in the plugin root. */
  | "agent-plugin"
  /** Pre-1.0.0 layouts, accepted on import only. */
  | "open-plugin"
  | "claude-plugin"
  | "cursor-plugin";

export interface ParsedOpenPlugin {
  pluginRoot: string;
  manifest: OpenPluginManifest;
  manifestPath: string;
  manifestKind: ParsedManifestKind;
  /** True when the directory used a pre-1.0.0 layout. */
  isLegacyLayout: boolean;
  mcpServers: Record<string, OpenPluginMcpServerEntry>;
  skills: string[];
  skillsRoot?: string;
  commands: string[];
  commandsRoot?: string;
  hasColorPng: boolean;
  hasOutlinePng: boolean;
  warnings: string[];
  /** Round-trip metadata produced by `atk export openplugin`, when present. */
  atkExtension?: AtkExtensionBlock;
}

export type AuthorizationType = "None" | "OAuthPluginVault" | "ApiKeyPluginVault";
export type DefaultAuthOption = "Auto" | AuthorizationType;

/**
 * Extension block embedded under `extensions["com.microsoft.agents-toolkit"]`
 * in plugin.json by `atk export agentplugin`. Carries every field that the
 * Agent Plugins spec cannot natively represent so that re-importing
 * reconstructs the original project losslessly. All fields are optional — the
 * importer treats missing keys the same way it treats a plugin.json without
 * this extension at all.
 *
 * Pre-1.0.0 exports wrote this block to a top-level
 * `x-microsoft-365-agents-toolkit` key, which the importer still reads.
 */
export interface AtkExtensionBlock {
  manifestVersion?: string;
  id?: string;
  packageName?: string;
  accentColor?: string;
  developer?: {
    name?: string;
    websiteUrl?: string;
    privacyUrl?: string;
    termsOfUseUrl?: string;
  };
  name?: { short?: string; full?: string };
  description?: { short?: string; full?: string };
  /**
   * Per-agentConnector overrides preserved verbatim: the keys are the
   * connector ids (matching the .mcp.json server name). Values store the
   * fields .mcp.json cannot carry: displayName, description, authorization.
   */
  agentConnectors?: Record<string, AtkAgentConnectorExt>;
}

export interface AtkAgentConnectorExt {
  displayName?: string;
  description?: string;
  authorization?: {
    type: AuthorizationType;
    referenceId?: string;
  };
}

export interface ImportInputs {
  path: string;
  output?: string;
  /** Optional when plugin.json carries an x-microsoft-365-agents-toolkit block. */
  privacyUrl?: string;
  /** Optional when plugin.json carries an x-microsoft-365-agents-toolkit block. */
  termsUrl?: string;
  websiteUrl?: string;
  appId?: string;
  defaultAuthType?: DefaultAuthOption;
  packageName?: string;
}

export interface ExportInputs {
  /** Path to the existing ATK project (folder that contains appPackage/manifest.json). */
  path: string;
  /** Destination plugin directory. Defaults to ./<plugin-name>-agentplugin. */
  output?: string;
  /**
   * @deprecated Ignored since Agent Plugins 1.0.0, which mandates plugin.json
   * in the plugin root. Accepted so existing scripts keep running; passing a
   * value emits a warning.
   */
  manifestKind?: "open-plugin" | "claude-plugin" | "cursor-plugin";
}

export interface CopyOp {
  src: string;
  destRelative: string;
}

export interface MappedManifest {
  manifest: Record<string, unknown>;
  copyOps: CopyOp[];
  warnings: string[];
}
