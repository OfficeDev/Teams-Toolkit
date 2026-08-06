// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import stripBom from "strip-bom";
import {
  TeamsManifest,
  TeamsManifestConverter,
  AppManifestUtils,
  TeamsManifestLatest,
  AgentSkill,
} from "../generated-types";

// Use the latest manifest type for internal type aliases
// This ensures the wrapper always uses the most recent schema features
type LatestManifestType = TeamsManifestLatest;
type BotType = NonNullable<LatestManifestType["bots"]>[number];
type StaticTabType = NonNullable<LatestManifestType["staticTabs"]>[number];
type ConfigurableTabType = NonNullable<LatestManifestType["configurableTabs"]>[number];
type ComposeExtensionType = NonNullable<LatestManifestType["composeExtensions"]>[number];
type ConnectorType = NonNullable<LatestManifestType["connectors"]>[number];
type DeclarativeAgentRefType = NonNullable<
  NonNullable<LatestManifestType["copilotAgents"]>["declarativeAgents"]
>[number];
type CustomEngineAgentType = NonNullable<
  NonNullable<LatestManifestType["copilotAgents"]>["customEngineAgents"]
>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  return isRecord(value) && isRecord(value[key]) ? value[key] : undefined;
}

function manifestFilePaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const paths: string[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.file === "string") {
      paths.push(item.file);
    }
  }
  return paths;
}

function recordArray(value: unknown): Record<string, unknown>[] | undefined {
  return Array.isArray(value) && value.every(isRecord) ? value : undefined;
}

function uniqueRecordId(records: Record<string, unknown>[], baseId: string): string {
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? baseId : `${baseId}${suffix}`;
    if (!records.some((record) => record.id === candidate)) {
      return candidate;
    }
    suffix++;
  }
}

// Re-export useful types derived from the latest manifest type
export type Bot = BotType;
export type StaticTab = StaticTabType;
export type ConfigurableTab = ConfigurableTabType;
export type ComposeExtension = ComposeExtensionType;
export type Connector = ConnectorType;
export type DeclarativeAgentRef = DeclarativeAgentRefType;
export type CustomEngineAgent = CustomEngineAgentType;
export type Developer = LatestManifestType["developer"];
export type WebApplicationInfo = LatestManifestType["webApplicationInfo"];

/**
 * Default install scope values derived from the manifest schema.
 */
export type DefaultInstallScopeValue = NonNullable<LatestManifestType["defaultInstallScope"]>;

/**
 * Default install scope enum for Teams manifests.
 */
export const DefaultInstallScope: { readonly [K in DefaultInstallScopeValue]: K } = {
  personal: "personal",
  team: "team",
  groupChat: "groupChat",
  meetings: "meetings",
  copilot: "copilot",
} as const;

/**
 * Static tab scope values derived from the manifest schema.
 */
export type StaticTabScopeValue = NonNullable<StaticTabType["scopes"]>[number];

/**
 * Static tab scope enum for Teams manifests.
 */
export const StaticTabScope: { readonly [K in StaticTabScopeValue]: K } = {
  personal: "personal",
  team: "team",
  groupChat: "groupChat",
} as const;

/**
 * Configurable tab scope values derived from the manifest schema.
 */
export type ConfigurableTabScopeValue = NonNullable<ConfigurableTabType["scopes"]>[number];

/**
 * Configurable tab scope enum for Teams manifests.
 */
export const ConfigurableTabScope: { readonly [K in ConfigurableTabScopeValue]: K } = {
  team: "team",
  groupChat: "groupChat",
} as const;

/**
 * Compose extension type values derived from the manifest schema.
 */
export type ComposeExtensionTypeValue = NonNullable<ComposeExtensionType["composeExtensionType"]>;

/**
 * Compose extension type enum for Teams manifests.
 */
export const ComposeExtensionTypeEnum: {
  readonly [K in ComposeExtensionTypeValue]: K;
} = {
  botBased: "botBased",
  apiBased: "apiBased",
} as const;

/**
 * OOP wrapper for Teams App Manifest.
 *
 * Provides a fluent API for manipulating Teams app manifests with
 * type safety, state tracking, and convenient operations.
 *
 * Note: This class does not extend BaseManifest due to TeamsManifest union type
 * constraints, but provides the same interface and functionality.
 *
 * @example
 * ```typescript
 * // Read existing manifest
 * const manifest = await TeamsManifestWrapper.read("manifest.json");
 *
 * // Modify with fluent API
 * manifest
 *   .setName("My App", "My Full App Name")
 *   .setDescription("Short desc", "Full description")
 *   .addBot("bot-id", ["personal", "team"])
 *   .addStaticTab("home", "Home", "https://example.com/tab")
 *   .addDeclarativeAgent("agent1", "declarativeAgent.json");
 *
 * // Save changes
 * await manifest.save();
 * ```
 */
export class TeamsManifestWrapper {
  protected _data: TeamsManifest;
  protected _filePath?: string;
  protected _isDirty = false;

  private constructor(data: TeamsManifest, filePath?: string) {
    this._data = data;
    this._filePath = filePath;
  }

  // ============= Base Manifest Properties =============

  /**
   * Returns the raw manifest data.
   */
  get data(): Readonly<TeamsManifest> {
    return this._data;
  }

  /**
   * Returns the file path if the manifest was loaded from a file.
   */
  get filePath(): string | undefined {
    return this._filePath;
  }

  /**
   * Indicates whether the manifest has unsaved changes.
   */
  get isDirty(): boolean {
    return this._isDirty;
  }

  /**
   * Marks the manifest as having unsaved changes.
   */
  protected markDirty(): void {
    this._isDirty = true;
  }

  /**
   * Saves the manifest to the specified file path or the original file path.
   * @param filePath - Optional path to save to. If not provided, uses the original file path.
   * @throws Error if no file path is available.
   */
  async save(filePath?: string): Promise<void> {
    const targetPath = filePath ?? this._filePath;
    if (!targetPath) {
      throw new Error("No file path specified for saving.");
    }
    await fs.writeFile(targetPath, this.toJSON(), "utf-8");
    this._filePath = targetPath;
    this._isDirty = false;
  }

  // ============= Static Factory Methods =============

  /**
   * Reads a JSON file synchronously and returns the parsed object.
   * @param filePath - Path to the JSON file
   */
  private static readJsonFileSync<U>(filePath: string): U {
    const content = fs.readFileSync(filePath, "utf-8");
    // Strip BOM to handle UTF-8 BOM encoded files
    const cleanContent = stripBom(content);
    return JSON.parse(cleanContent) as U;
  }

  /**
   * Reads a Teams manifest from a file.
   * @param filePath - Path to the manifest JSON file.
   * @returns A new TeamsManifestWrapper instance.
   */
  static async read(filePath: string): Promise<TeamsManifestWrapper> {
    const data = await AppManifestUtils.readTeamsManifest(filePath);
    return new TeamsManifestWrapper(data, filePath);
  }

  /**
   * Reads a Teams manifest from a file synchronously.
   * @param filePath - Path to the manifest JSON file.
   * @returns A new TeamsManifestWrapper instance.
   */
  static readSync(filePath: string): TeamsManifestWrapper {
    const json = TeamsManifestWrapper.readJsonFileSync<TeamsManifest>(filePath);
    const data = TeamsManifestConverter.jsonToManifest(JSON.stringify(json));
    return new TeamsManifestWrapper(data, filePath);
  }

  /**
   * Creates a TeamsManifestWrapper from a JSON string.
   * @param json - JSON string representing the manifest.
   * @returns A new TeamsManifestWrapper instance.
   */
  static fromJSON(json: string): TeamsManifestWrapper {
    const data = TeamsManifestConverter.jsonToManifest(json);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Teams manifest JSON must contain an object.");
    }
    return new TeamsManifestWrapper(data);
  }

  /**
   * Creates a new Teams manifest with required fields.
   * @param init - Initial manifest data with required fields.
   * @returns A new TeamsManifestWrapper instance.
   */
  static create(init: {
    manifestVersion: TeamsManifest["manifestVersion"];
    id: string;
    version: string;
    name: { short: string; full?: string };
    description: { short: string; full: string };
    developer: {
      name: string;
      websiteUrl: string;
      privacyUrl: string;
      termsOfUseUrl: string;
      mpnId?: string;
    };
    accentColor?: string;
  }): TeamsManifestWrapper {
    const data: TeamsManifest = {
      $schema: `https://developer.microsoft.com/en-us/json-schemas/teams/v${init.manifestVersion}/MicrosoftTeams.schema.json`,
      manifestVersion: init.manifestVersion,
      id: init.id,
      version: init.version,
      name: init.name,
      description: init.description,
      developer: init.developer,
      icons: { color: "color.png", outline: "outline.png" },
      accentColor: init.accentColor ?? "#FFFFFF",
    } as TeamsManifest;
    return new TeamsManifestWrapper(data);
  }

  // ============= Getters =============

  /**
   * Returns the manifest version.
   */
  get manifestVersion(): string {
    return this._data.manifestVersion;
  }

  /**
   * Returns the app ID.
   */
  get id(): string {
    return this._data.id;
  }

  /**
   * Returns the app version.
   */
  get version(): string {
    return this._data.version;
  }

  /**
   * Returns the app name.
   */
  get name(): { short: string; full?: string } {
    return this._data.name;
  }

  /**
   * Returns the app description.
   */
  get description(): { short: string; full: string } {
    return this._data.description;
  }

  /**
   * Returns the developer information.
   */
  get developer(): Developer {
    return this._data.developer;
  }

  /**
   * Returns the icons configuration.
   */
  get icons(): { color: string; outline: string } {
    return this._data.icons;
  }

  /**
   * Returns a readonly array of bots.
   */
  get bots(): readonly BotType[] {
    return (this._data.bots as BotType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of static tabs.
   */
  get staticTabs(): readonly StaticTabType[] {
    return (this._data.staticTabs as StaticTabType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of configurable tabs.
   */
  get configurableTabs(): readonly ConfigurableTabType[] {
    return (this._data.configurableTabs as ConfigurableTabType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of compose extensions (message extensions).
   */
  get composeExtensions(): readonly ComposeExtensionType[] {
    return (this._data.composeExtensions as ComposeExtensionType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of connectors.
   */
  get connectors(): readonly ConnectorType[] {
    return (this._data.connectors as ConnectorType[] | undefined) ?? [];
  }

  /**
   * Returns the valid domains.
   */
  get validDomains(): readonly string[] {
    return this._data.validDomains ?? [];
  }

  /**
   * Returns the web application info for SSO.
   */
  get webApplicationInfo(): WebApplicationInfo | undefined {
    return (this._data as LatestManifestType).webApplicationInfo;
  }

  /**
   * Returns the copilot agents configuration.
   */
  get copilotAgents(): LatestManifestType["copilotAgents"] | undefined {
    return (this._data as LatestManifestType).copilotAgents;
  }

  /**
   * Returns a readonly array of declarative agents.
   */
  get declarativeAgents(): readonly DeclarativeAgentRefType[] {
    return (this._data as LatestManifestType).copilotAgents?.declarativeAgents ?? [];
  }

  /**
   * Returns a readonly array of custom engine agents.
   */
  get customEngineAgents(): readonly CustomEngineAgentType[] {
    return (this._data as LatestManifestType).copilotAgents?.customEngineAgents ?? [];
  }

  // ============= Setters (Fluent API) =============

  /**
   * Sets the app ID.
   */
  setId(id: string): this {
    this._data.id = id;
    this.markDirty();
    return this;
  }

  /**
   * Sets the app version.
   */
  setVersion(version: string): this {
    this._data.version = version;
    this.markDirty();
    return this;
  }

  /**
   * Sets the app name.
   */
  setName(short: string, full?: string): this {
    this._data.name = { short, full };
    this.markDirty();
    return this;
  }

  /**
   * Sets the app description.
   */
  setDescription(short: string, full: string): this {
    this._data.description = { short, full };
    this.markDirty();
    return this;
  }

  /**
   * Sets the developer information.
   */
  setDeveloper(developer: Developer): this {
    this._data.developer = developer;
    this.markDirty();
    return this;
  }

  /**
   * Sets the icons.
   */
  setIcons(color: string, outline: string): this {
    this._data.icons = { color, outline };
    this.markDirty();
    return this;
  }

  /**
   * Sets the accent color.
   */
  setAccentColor(color: string): this {
    this._data.accentColor = color;
    this.markDirty();
    return this;
  }

  /**
   * Sets the default install scope.
   */
  setDefaultInstallScope(scope: DefaultInstallScopeValue): this {
    (this._data as LatestManifestType).defaultInstallScope = scope;
    this.markDirty();
    return this;
  }

  // ============= Valid Domains Operations =============

  /**
   * Adds a valid domain.
   * @param domain - The domain to add.
   */
  addValidDomain(domain: string): this {
    if (!this._data.validDomains) {
      this._data.validDomains = [];
    }
    if (!this._data.validDomains.includes(domain)) {
      this._data.validDomains.push(domain);
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a valid domain.
   * @param domain - The domain to remove.
   */
  removeValidDomain(domain: string): this {
    if (this._data.validDomains) {
      this._data.validDomains = this._data.validDomains.filter((d) => d !== domain);
      this.markDirty();
    }
    return this;
  }

  // ============= Bot Operations =============

  /**
   * Adds a bot to the manifest.
   * @param botId - The Microsoft App ID for the bot.
   * @param scopes - The scopes for the bot.
   * @param options - Additional bot configuration options.
   */
  addBot(
    botId: string,
    scopes: BotType["scopes"],
    options?: Partial<Omit<BotType, "botId" | "scopes">>
  ): this {
    if (!this._data.bots) {
      this._data.bots = [];
    }
    const existing = (this._data.bots as BotType[]).find((b) => b.botId === botId);
    if (!existing) {
      (this._data.bots as BotType[]).push({
        botId,
        scopes,
        ...options,
      } as BotType);
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a bot by ID.
   * @param botId - The bot ID to remove.
   */
  removeBot(botId: string): this {
    if (this._data.bots) {
      this._data.bots = (this._data.bots as BotType[]).filter((b) => b.botId !== botId);
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if a bot exists by ID.
   */
  hasBot(botId: string): boolean {
    return this.bots.some((b) => b.botId === botId);
  }

  /**
   * Gets a bot by ID.
   */
  getBot(botId: string): BotType | undefined {
    return this.bots.find((b) => b.botId === botId);
  }

  /**
   * Replaces the command suggestions for the first bot in the manifest.
   * @param commands - Suggested command titles and descriptions.
   * @param includeCopilotScope - Whether the command list also applies to Copilot.
   */
  setFirstBotCommandSuggestions(
    commands: Array<{ title: string; description: string }>,
    includeCopilotScope: boolean
  ): this {
    const bot = this.bots[0];
    if (!bot) {
      throw new Error("Cannot set bot command suggestions because the manifest has no bot.");
    }
    const scopes: NonNullable<BotType["commandLists"]>[number]["scopes"] = ["personal"];
    if (includeCopilotScope) {
      scopes.push("copilot");
    }
    bot.commandLists = [{ scopes, commands }];
    this.markDirty();
    return this;
  }

  // ============= Static Tab Operations =============

  /**
   * Adds a static tab to the manifest.
   * @param entityId - Unique identifier for the tab entity.
   * @param name - Display name of the tab.
   * @param contentUrl - URL for the tab content.
   * @param scopes - The scopes for the tab.
   */
  addStaticTab(
    entityId: string,
    name: string,
    contentUrl: string,
    scopes: StaticTabType["scopes"] = ["personal"]
  ): this {
    if (!this._data.staticTabs) {
      this._data.staticTabs = [];
    }
    const existing = (this._data.staticTabs as StaticTabType[]).find(
      (t) => t.entityId === entityId
    );
    if (!existing) {
      (this._data.staticTabs as StaticTabType[]).push({
        entityId,
        name,
        contentUrl,
        scopes,
      } as StaticTabType);
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a static tab by entity ID.
   * @param entityId - The entity ID of the tab to remove.
   */
  removeStaticTab(entityId: string): this {
    if (this._data.staticTabs) {
      this._data.staticTabs = (this._data.staticTabs as StaticTabType[]).filter(
        (t) => t.entityId !== entityId
      );
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if a static tab exists by entity ID.
   */
  hasStaticTab(entityId: string): boolean {
    return this.staticTabs.some((t) => t.entityId === entityId);
  }

  /**
   * Gets a static tab by entity ID.
   */
  getStaticTab(entityId: string): StaticTabType | undefined {
    return this.staticTabs.find((t) => t.entityId === entityId);
  }

  // ============= Configurable Tab Operations =============

  /**
   * Adds a configurable tab to the manifest.
   * @param configurationUrl - URL for the tab configuration.
   * @param scopes - The scopes for the tab.
   */
  addConfigurableTab(
    configurationUrl: string,
    scopes: ConfigurableTabType["scopes"] = ["team", "groupChat"]
  ): this {
    if (!this._data.configurableTabs) {
      this._data.configurableTabs = [];
    }
    (this._data.configurableTabs as ConfigurableTabType[]).push({
      configurationUrl,
      scopes,
    } as ConfigurableTabType);
    this.markDirty();
    return this;
  }

  /**
   * Removes a configurable tab by configuration URL.
   * @param configurationUrl - The configuration URL of the tab to remove.
   */
  removeConfigurableTab(configurationUrl: string): this {
    if (this._data.configurableTabs) {
      this._data.configurableTabs = (this._data.configurableTabs as ConfigurableTabType[]).filter(
        (t) => t.configurationUrl !== configurationUrl
      );
      this.markDirty();
    }
    return this;
  }

  // ============= Compose Extension (Message Extension) Operations =============

  /**
   * Adds a compose extension to the manifest.
   * @param extension - The compose extension configuration.
   */
  addComposeExtension(extension: ComposeExtensionType): this {
    if (!this._data.composeExtensions) {
      this._data.composeExtensions = [];
    }
    (this._data.composeExtensions as ComposeExtensionType[]).push(extension);
    this.markDirty();
    return this;
  }

  /**
   * Adds a bot-based compose extension.
   * @param botId - The bot ID for the message extension.
   * @param commands - The commands for the message extension.
   */
  addBotBasedComposeExtension(
    botId: string,
    commands: ComposeExtensionType["commands"] = []
  ): this {
    return this.addComposeExtension({
      botId,
      composeExtensionType: "botBased",
      commands,
    } as ComposeExtensionType);
  }

  /**
   * Adds an API-based compose extension.
   * @param apiSpecificationFile - Path to the API specification file.
   * @param commands - The commands for the message extension.
   */
  addApiBasedComposeExtension(
    apiSpecificationFile: string,
    commands: ComposeExtensionType["commands"] = []
  ): this {
    return this.addComposeExtension({
      composeExtensionType: "apiBased",
      apiSpecificationFile,
      commands,
    } as ComposeExtensionType);
  }

  /**
   * Removes a compose extension by bot ID.
   * @param botId - The bot ID of the compose extension to remove.
   */
  removeComposeExtensionByBotId(botId: string): this {
    if (this._data.composeExtensions) {
      this._data.composeExtensions = (
        this._data.composeExtensions as ComposeExtensionType[]
      ).filter((ce) => ce.botId !== botId);
      this.markDirty();
    }
    return this;
  }

  // ============= Web Application Info (SSO) Operations =============

  /**
   * Sets the web application info for SSO.
   * @param id - The AAD application ID.
   * @param resource - Optional resource URL for acquiring auth token.
   */
  setWebApplicationInfo(id: string, resource?: string): this {
    (this._data as LatestManifestType).webApplicationInfo = { id, resource };
    this.markDirty();
    return this;
  }

  /**
   * Removes the web application info.
   */
  removeWebApplicationInfo(): this {
    delete (this._data as LatestManifestType).webApplicationInfo;
    this.markDirty();
    return this;
  }

  // ============= Copilot Agents Operations =============

  /**
   * Adds a declarative agent reference.
   * @param id - Unique identifier for the agent.
   * @param file - Relative path to the agent manifest file.
   */
  addDeclarativeAgent(id: string, file: string): this {
    const data = this._data as LatestManifestType;
    if (!data.copilotAgents) {
      data.copilotAgents = {};
    }
    if (!data.copilotAgents.declarativeAgents) {
      data.copilotAgents.declarativeAgents = [];
    }
    const existing = data.copilotAgents.declarativeAgents.find((a) => a.id === id);
    if (!existing) {
      data.copilotAgents.declarativeAgents.push({ id, file });
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a declarative agent by ID.
   * @param id - The ID of the agent to remove.
   */
  removeDeclarativeAgent(id: string): this {
    const data = this._data as LatestManifestType;
    if (data.copilotAgents?.declarativeAgents) {
      data.copilotAgents.declarativeAgents = data.copilotAgents.declarativeAgents.filter(
        (a) => a.id !== id
      );
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if a declarative agent exists by ID.
   */
  hasDeclarativeAgent(id: string): boolean {
    return this.declarativeAgents.some((a) => a.id === id);
  }

  /**
   * Gets a declarative agent by ID.
   */
  getDeclarativeAgent(id: string): DeclarativeAgentRefType | undefined {
    return this.declarativeAgents.find((a) => a.id === id);
  }

  /**
   * Adds a custom engine agent.
   * @param id - The bot ID for the custom engine agent.
   */
  addCustomEngineAgent(id: string): this {
    const data = this._data as LatestManifestType;
    if (!data.copilotAgents) {
      data.copilotAgents = {};
    }
    if (!data.copilotAgents.customEngineAgents) {
      data.copilotAgents.customEngineAgents = [];
    }
    const existing = data.copilotAgents.customEngineAgents.find((a) => a.id === id);
    if (!existing) {
      data.copilotAgents.customEngineAgents.push({ id, type: "bot" });
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a custom engine agent by ID.
   * @param id - The ID of the agent to remove.
   */
  removeCustomEngineAgent(id: string): this {
    const data = this._data as LatestManifestType;
    if (data.copilotAgents?.customEngineAgents) {
      data.copilotAgents.customEngineAgents = data.copilotAgents.customEngineAgents.filter(
        (a) => a.id !== id
      );
      this.markDirty();
    }
    return this;
  }

  // ============= Query Operations =============

  /**
   * Returns all bot IDs from the manifest.
   */
  getBotIds(): string[] {
    return this.bots.map((b) => b.botId);
  }

  /**
   * Returns all static tab entity IDs.
   */
  getStaticTabEntityIds(): string[] {
    return this.staticTabs.map((t) => t.entityId);
  }

  /**
   * Returns all declarative agent file paths.
   */
  getDeclarativeAgentPaths(): string[] {
    const copilotExtensions = nestedRecord(this._data, "copilotExtensions");
    const copilotAgents = nestedRecord(this._data, "copilotAgents");
    return [
      ...manifestFilePaths(copilotExtensions?.declarativeCopilots),
      ...manifestFilePaths(copilotAgents?.declarativeAgents),
      ...manifestFilePaths(isRecord(this._data) ? this._data.declarativeAgents : undefined),
    ];
  }

  /**
   * Checks if the manifest has any Copilot agent configuration.
   */
  hasCopilotAgents(): boolean {
    return this.declarativeAgents.length > 0 || this.customEngineAgents.length > 0;
  }

  /**
   * Adds actions to the extension runtime whose code script contains `scriptFileName`.
   * Returned IDs are collision-safe against the runtime's existing actions.
   */
  addExtensionRuntimeActions(
    scriptFileName: string,
    actions: ReadonlyArray<{ baseId: string; type: string }>
  ): string[] | undefined {
    const extensions = recordArray(isRecord(this._data) ? this._data.extensions : undefined);
    if (extensions === undefined) {
      return undefined;
    }
    for (const extension of extensions) {
      const runtimes = recordArray(extension.runtimes);
      if (runtimes === undefined) {
        continue;
      }
      for (const runtime of runtimes) {
        const script = nestedRecord(runtime, "code")?.script;
        if (typeof script !== "string" || !script.includes(scriptFileName)) {
          continue;
        }
        const runtimeActions = recordArray(runtime.actions) ?? [];
        const ids: string[] = [];
        for (const action of actions) {
          const id = uniqueRecordId(runtimeActions, action.baseId);
          runtimeActions.push({ id, type: action.type });
          ids.push(id);
        }
        runtime.actions = runtimeActions;
        this.markDirty();
        return ids;
      }
    }
    return undefined;
  }

  /** Returns whether the manifest contains a structurally valid extension array. */
  hasExtensions(): boolean {
    return recordArray(isRecord(this._data) ? this._data.extensions : undefined) !== undefined;
  }

  // ============= Validation =============

  /**
   * Validates the manifest against its JSON schema.
   * @returns Array of validation error messages, empty if valid.
   */
  async validate(): Promise<string[]> {
    return AppManifestUtils.validateAgainstSchema(this._data);
  }

  // ============= Serialization =============

  /**
   * Converts the manifest to a formatted JSON string.
   */
  toJSON(): string {
    return TeamsManifestConverter.manifestToJson(this._data);
  }

  /**
   * Creates a deep clone of this manifest.
   */
  clone(): TeamsManifestWrapper {
    const clonedData = JSON.parse(this.toJSON()) as TeamsManifest;
    return new TeamsManifestWrapper(clonedData);
  }

  /**
   * Creates a deep clone with partial modifications applied.
   * Useful for creating a modified copy without mutating the original.
   * @param changes - Partial manifest data to merge into the clone.
   * @returns A new TeamsManifestWrapper with the changes applied.
   */
  cloneWith(changes: Partial<TeamsManifest> & Record<string, unknown>): TeamsManifestWrapper {
    const clonedData = JSON.parse(this.toJSON()) as TeamsManifest;
    Object.assign(clonedData, changes);
    const wrapper = new TeamsManifestWrapper(clonedData);
    wrapper.markDirty();
    return wrapper;
  }

  /**
   * Returns a mutable reference to the manifest data for direct modification.
   * Use with caution - prefer using the fluent API methods when possible.
   * Changes made through this reference will be tracked as dirty.
   */
  get mutableData(): TeamsManifest {
    this.markDirty();
    return this._data;
  }

  // ── Agent Skills ──────────────────────────────────────────────────

  private static readonly MAX_AGENT_SKILLS = 20;

  /**
   * Returns the list of agent skills declared in the manifest.
   */
  get skills(): readonly AgentSkill[] {
    const data = this._data as unknown as Record<string, unknown>;
    return (data.agentSkills as AgentSkill[] | undefined) ?? [];
  }

  /**
   * Adds an agent skill to the Teams manifest.
   * Maximum 20 skills are allowed. Duplicate folder paths are ignored.
   * @param folder - Path to the skill directory within the app package.
   */
  addSkill(folder: string): this {
    const data = this._data as unknown as Record<string, unknown>;
    if (!data.agentSkills) {
      data.agentSkills = [];
    }

    const skills = data.agentSkills as AgentSkill[];
    if (skills.length >= TeamsManifestWrapper.MAX_AGENT_SKILLS) {
      console.warn(
        `Maximum ${TeamsManifestWrapper.MAX_AGENT_SKILLS} agent skills allowed. Ignoring addition.`
      );
      return this;
    }

    if (!skills.some((s) => s.folder === folder)) {
      skills.push({ folder });
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes an agent skill by folder path.
   * @param folder - The folder path of the skill to remove.
   */
  removeSkill(folder: string): this {
    const data = this._data as unknown as Record<string, unknown>;
    const skills = data.agentSkills as AgentSkill[] | undefined;
    if (skills) {
      data.agentSkills = skills.filter((s) => s.folder !== folder);
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if an agent skill exists by folder path.
   */
  hasSkill(folder: string): boolean {
    return this.skills.some((s) => s.folder === folder);
  }

  /**
   * Returns all skill folder paths.
   */
  getSkillFolders(): string[] {
    return this.skills.map((s) => s.folder);
  }
}
