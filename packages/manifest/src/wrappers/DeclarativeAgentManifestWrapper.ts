// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  DeclarativeAgentManifest,
  DeclarativeAgentManifestConverter,
  AppManifestUtils,
  DeclarativeAgentManifestLatest,
  AgentSkillElement,
} from "../generated-types";
import { BaseManifest } from "./BaseManifest";

// Use the latest manifest type for internal type aliases
// This ensures the wrapper always uses the most recent schema features
type LatestManifestType = DeclarativeAgentManifestLatest;
type ActionElementType = NonNullable<LatestManifestType["actions"]>[number];
type CapabilityElementType = NonNullable<LatestManifestType["capabilities"]>[number];
type ConversationStarterElementType = NonNullable<
  LatestManifestType["conversation_starters"]
>[number];
type WorkerAgentElementType = NonNullable<LatestManifestType["worker_agents"]>[number];

/**
 * Maximum number of agent skills allowed.
 */
const MAX_AGENT_SKILLS = 10;

// Re-export common types for convenience (derived from latest manifest type)
export type ActionElement = ActionElementType;
export type ConversationStarterElement = ConversationStarterElementType;
export type WorkerAgentElement = WorkerAgentElementType;
export type SensitivityLabel = LatestManifestType["sensitivity_label"];
export type BehaviorOverrides = LatestManifestType["behavior_overrides"];
export type { AgentSkillElement };

/**
 * Capability name type derived from the latest manifest schema.
 * This type is auto-generated from the JSON schema and represents all valid capability names.
 */
export type CapabilityNameValue = CapabilityElementType["name"];

/**
 * Capability names supported by Declarative Agents.
 * These values match the auto-generated Name type from the schema.
 * @see CapabilityNameValue for the type definition
 */
export const CapabilityName: { readonly [K in CapabilityNameValue]: K } = {
  WebSearch: "WebSearch",
  GraphicArt: "GraphicArt",
  CodeInterpreter: "CodeInterpreter",
  OneDriveAndSharePoint: "OneDriveAndSharePoint",
  GraphConnectors: "GraphConnectors",
  EmbeddedKnowledge: "EmbeddedKnowledge",
  TeamsMessages: "TeamsMessages",
  Dataverse: "Dataverse",
  Email: "Email",
  EmailActions: "EmailActions",
  People: "People",
  Meetings: "Meetings",
  MeetingActions: "MeetingActions",
  ScenarioModels: "ScenarioModels",
} as const;

/**
 * OOP wrapper for Declarative Agent Manifest.
 *
 * Provides a fluent API for manipulating declarative agent manifests with
 * type safety, state tracking, and convenient operations.
 *
 * @example
 * ```typescript
 * // Read existing manifest
 * const agent = await DeclarativeAgentManifestWrapper.read("agent.json");
 *
 * // Modify with fluent API
 * agent
 *   .setInstructions("You are a helpful assistant...")
 *   .addAction("action1", "plugin.json")
 *   .addWebSearchCapability([{ url: "https://docs.microsoft.com" }])
 *   .addConversationStarter("How can I help you today?");
 *
 * // Save changes
 * await agent.save();
 * ```
 */
export class DeclarativeAgentManifestWrapper extends BaseManifest<DeclarativeAgentManifest> {
  private constructor(data: DeclarativeAgentManifest, filePath?: string) {
    super(data, filePath);
  }

  // ============= Static Factory Methods =============

  /**
   * Reads a declarative agent manifest from a file.
   * @param filePath - Path to the manifest JSON file.
   * @returns A new DeclarativeAgentManifestWrapper instance.
   */
  static async read(filePath: string): Promise<DeclarativeAgentManifestWrapper> {
    const data = await AppManifestUtils.readDeclarativeAgentManifest(filePath);
    return new DeclarativeAgentManifestWrapper(data, filePath);
  }

  /**
   * Reads a declarative agent manifest from a file synchronously.
   * @param filePath - Path to the manifest JSON file.
   * @returns A new DeclarativeAgentManifestWrapper instance.
   */
  static readSync(filePath: string): DeclarativeAgentManifestWrapper {
    const json = BaseManifest.readJsonFileSync<DeclarativeAgentManifest>(filePath);
    const data = DeclarativeAgentManifestConverter.jsonToManifest(JSON.stringify(json));
    return new DeclarativeAgentManifestWrapper(data, filePath);
  }

  /**
   * Creates a DeclarativeAgentManifestWrapper from a JSON string.
   * @param json - JSON string representing the manifest.
   * @returns A new DeclarativeAgentManifestWrapper instance.
   */
  static fromJSON(json: string): DeclarativeAgentManifestWrapper {
    const data = DeclarativeAgentManifestConverter.jsonToManifest(json);
    return new DeclarativeAgentManifestWrapper(data);
  }

  /**
   * Creates a new declarative agent manifest with required fields.
   * @param init - Initial manifest data with required fields.
   * @returns A new DeclarativeAgentManifestWrapper instance.
   */
  static create(init: {
    version: DeclarativeAgentManifest["version"];
    name: string;
    description: string;
    instructions?: string;
  }): DeclarativeAgentManifestWrapper {
    const data: DeclarativeAgentManifest = {
      $schema: `https://developer.microsoft.com/json-schemas/copilot/declarative-agent/${init.version}/schema.json`,
      ...init,
    } as DeclarativeAgentManifest;
    return new DeclarativeAgentManifestWrapper(data);
  }

  // ============= Getters =============

  /**
   * Returns the version of the manifest.
   */
  get version(): string {
    return this._data.version;
  }

  /**
   * Returns the name of the agent.
   */
  get name(): string {
    return this._data.name;
  }

  /**
   * Returns the description of the agent.
   */
  get description(): string {
    return this._data.description;
  }

  /**
   * Returns the instructions for the agent.
   */
  get instructions(): string | undefined {
    return this._data.instructions;
  }

  /**
   * Returns a readonly array of actions.
   */
  get actions(): readonly ActionElementType[] {
    return (this._data.actions as ActionElementType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of capabilities.
   */
  get capabilities(): readonly CapabilityElementType[] {
    return (this._data.capabilities as CapabilityElementType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of conversation starters.
   */
  get conversationStarters(): readonly ConversationStarterElementType[] {
    return (this._data.conversation_starters as ConversationStarterElementType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of worker agents.
   */
  get workerAgents(): readonly WorkerAgentElementType[] {
    return (this._data as LatestManifestType).worker_agents ?? [];
  }

  // ============= Setters (Fluent API) =============

  /**
   * Sets the name of the agent.
   */
  setName(name: string): this {
    this._data.name = name;
    this.markDirty();
    return this;
  }

  /**
   * Sets the description of the agent.
   */
  setDescription(description: string): this {
    this._data.description = description;
    this.markDirty();
    return this;
  }

  /**
   * Sets the instructions for the agent.
   */
  setInstructions(instructions: string): this {
    this._data.instructions = instructions;
    this.markDirty();
    return this;
  }

  // ============= Action Operations =============

  /**
   * Adds an action (API plugin) to the agent.
   * @param id - Unique identifier for the action.
   * @param file - Relative path to the plugin manifest file.
   */
  addAction(id: string, file: string): this {
    if (!this._data.actions) {
      this._data.actions = [];
    }
    (this._data.actions as ActionElementType[]).push({ id, file } as ActionElementType);
    this.markDirty();
    return this;
  }

  /**
   * Removes an action by ID.
   * @param id - The ID of the action to remove.
   */
  removeAction(id: string): this {
    if (this._data.actions) {
      this._data.actions = this._data.actions.filter((a: ActionElementType) => a.id !== id);
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if an action exists by ID.
   */
  hasAction(id: string): boolean {
    return this.actions.some((a) => a.id === id);
  }

  /**
   * Gets an action by ID.
   */
  getAction(id: string): ActionElementType | undefined {
    return this.actions.find((a) => a.id === id);
  }

  /**
   * Returns all action plugin file paths.
   */
  getActionPluginPaths(): string[] {
    return this.actions.map((a) => a.file);
  }

  // ============= Capability Operations =============

  /**
   * Adds or updates a capability.
   * If a capability with the same name exists, it will be replaced.
   * @param capability - The capability to add or update.
   */
  addCapability(capability: CapabilityElementType): this {
    if (!this._data.capabilities) {
      this._data.capabilities = [];
    }

    const capabilities = this._data.capabilities as CapabilityElementType[];
    const existingIndex = capabilities.findIndex((c) => c.name === capability.name);
    if (existingIndex >= 0) {
      capabilities[existingIndex] = capability;
    } else {
      capabilities.push(capability);
    }
    this.markDirty();
    return this;
  }

  /**
   * Removes a capability by name.
   * @param name - The name of the capability to remove.
   */
  removeCapability(name: CapabilityNameValue | string): this {
    if (this._data.capabilities) {
      this._data.capabilities = (this._data.capabilities as CapabilityElementType[]).filter(
        (c: CapabilityElementType) => c.name !== name
      );
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if a capability exists by name.
   */
  hasCapability(name: CapabilityNameValue | string): boolean {
    return this.capabilities.some((c) => c.name === name);
  }

  /**
   * Gets a capability by name.
   */
  getCapability<T extends CapabilityElementType = CapabilityElementType>(
    name: CapabilityNameValue | string
  ): T | undefined {
    return this.capabilities.find((c) => c.name === name) as T | undefined;
  }

  // ============= Convenience Capability Methods =============

  /**
   * Adds or updates the WebSearch capability.
   * @param sites - Optional array of site URLs to constrain search.
   */
  addWebSearchCapability(sites?: Array<{ url: string }>): this {
    return this.addCapability({
      name: CapabilityName.WebSearch,
      sites,
    } as CapabilityElementType);
  }

  /**
   * Adds or updates the OneDriveAndSharePoint capability.
   * @param options - Configuration for SharePoint/OneDrive sources.
   */
  addOneDriveSharePointCapability(options?: {
    items_by_url?: Array<{ url: string }>;
    items_by_sharepoint_ids?: Array<{
      site_id?: string;
      web_id?: string;
      list_id?: string;
      unique_id?: string;
    }>;
  }): this {
    return this.addCapability({
      name: CapabilityName.OneDriveAndSharePoint,
      ...options,
    } as CapabilityElementType);
  }

  /**
   * Adds or updates the GraphConnectors capability.
   * @param connectionIds - Array of Graph connector connection IDs.
   */
  addGraphConnectorsCapability(connectionIds: string[]): this {
    const connections = connectionIds.map((id) => ({ connection_id: id }));
    return this.addCapability({
      name: CapabilityName.GraphConnectors,
      connections,
    } as CapabilityElementType);
  }

  /**
   * Adds or updates the EmbeddedKnowledge capability.
   * @param files - Array of embedded knowledge files.
   */
  addEmbeddedKnowledgeCapability(files: Array<{ file: string }>): this {
    return this.addCapability({
      name: CapabilityName.EmbeddedKnowledge,
      files,
    } as CapabilityElementType);
  }

  /**
   * Adds or updates the CodeInterpreter capability.
   */
  addCodeInterpreterCapability(): this {
    return this.addCapability({
      name: CapabilityName.CodeInterpreter,
    } as CapabilityElementType);
  }

  /**
   * Adds or updates the GraphicArt capability.
   */
  addGraphicArtCapability(): this {
    return this.addCapability({
      name: CapabilityName.GraphicArt,
    } as CapabilityElementType);
  }

  // ============= Conversation Starter Operations =============

  /**
   * Adds a conversation starter.
   * Maximum 12 starters are allowed.
   * @param text - The text of the conversation starter.
   * @param title - Optional title for the starter.
   */
  addConversationStarter(text: string, title?: string): this {
    if (!this._data.conversation_starters) {
      this._data.conversation_starters = [];
    }

    const starters = this._data.conversation_starters as ConversationStarterElementType[];
    if (starters.length >= 12) {
      console.warn("Maximum 12 conversation starters allowed. Ignoring addition.");
      return this;
    }

    // Avoid duplicates
    if (!starters.some((s) => s.text === text)) {
      starters.push({ text, title } as ConversationStarterElementType);
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a conversation starter by text.
   */
  removeConversationStarter(text: string): this {
    if (this._data.conversation_starters) {
      this._data.conversation_starters = (
        this._data.conversation_starters as ConversationStarterElementType[]
      ).filter((s: ConversationStarterElementType) => s.text !== text);
      this.markDirty();
    }
    return this;
  }

  /**
   * Clears all conversation starters.
   */
  clearConversationStarters(): this {
    this._data.conversation_starters = [];
    this.markDirty();
    return this;
  }

  // ============= Worker Agent Operations =============

  /**
   * Adds a worker agent.
   * @param id - The ID of the worker agent.
   */
  addWorkerAgent(id: string): this {
    const data = this._data as LatestManifestType;
    if (!data.worker_agents) {
      data.worker_agents = [];
    }
    if (!data.worker_agents.some((w) => w.id === id)) {
      data.worker_agents.push({ id } as WorkerAgentElementType);
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a worker agent by ID.
   */
  removeWorkerAgent(id: string): this {
    const data = this._data as LatestManifestType;
    if (data.worker_agents) {
      data.worker_agents = data.worker_agents.filter((w) => w.id !== id);
      this.markDirty();
    }
    return this;
  }

  // ============= Agent Skill Operations =============

  /**
   * Returns a readonly array of agent skills.
   */
  get skills(): readonly AgentSkillElement[] {
    const data = this._data as Record<string, unknown>;
    return (data.agent_skills as AgentSkillElement[] | undefined) ?? [];
  }

  /**
   * Adds an agent skill to the declarative agent.
   * Maximum 10 skills are allowed. Duplicate folder paths are ignored.
   * @param folder - Relative path to the skill directory.
   */
  addSkill(folder: string): this {
    const data = this._data as Record<string, unknown>;
    if (!data.agent_skills) {
      data.agent_skills = [];
    }

    const skills = data.agent_skills as AgentSkillElement[];
    if (skills.length >= MAX_AGENT_SKILLS) {
      console.warn(`Maximum ${MAX_AGENT_SKILLS} agent skills allowed. Ignoring addition.`);
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
    const data = this._data as Record<string, unknown>;
    const skills = data.agent_skills as AgentSkillElement[] | undefined;
    if (skills) {
      data.agent_skills = skills.filter((s) => s.folder !== folder);
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
   * Gets an agent skill by folder path.
   */
  getSkill(folder: string): AgentSkillElement | undefined {
    return this.skills.find((s) => s.folder === folder);
  }

  /**
   * Returns all skill folder paths.
   */
  getSkillFolders(): string[] {
    return this.skills.map((s) => s.folder);
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
    return DeclarativeAgentManifestConverter.manifestToJson(this._data);
  }

  /**
   * Creates a deep clone of this manifest.
   */
  clone(): DeclarativeAgentManifestWrapper {
    const clonedData = JSON.parse(this.toJSON()) as DeclarativeAgentManifest;
    return new DeclarativeAgentManifestWrapper(clonedData);
  }
}
