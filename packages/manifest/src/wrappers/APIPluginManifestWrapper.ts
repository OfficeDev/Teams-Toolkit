// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  APIPluginManifest,
  ApiPluginManifestConverter,
  AppManifestUtils,
  APIPluginManifestLatest,
} from "../generated-types";
import { BaseManifest } from "./BaseManifest";

// Use the latest manifest type for internal type aliases
// This ensures the wrapper always uses the most recent schema features
type LatestManifestType = APIPluginManifestLatest;
type RuntimeObject = NonNullable<LatestManifestType["runtimes"]>[number];
type FunctionObjectType = NonNullable<LatestManifestType["functions"]>[number];

// Re-export useful types derived from the latest manifest type
export type FunctionObject = FunctionObjectType;
export type RuntimeAuthenticationObject = RuntimeObject["auth"];

/**
 * Runtime type value derived from the latest manifest schema.
 * This type is auto-generated from the JSON schema and represents all valid runtime types.
 */
export type RuntimeTypeValue = RuntimeObject["type"];

/**
 * Runtime type enum for plugin runtimes.
 * These values match the auto-generated RuntimeType from the schema.
 * @see RuntimeTypeValue for the type definition
 */
export const RuntimeType: { readonly [K in RuntimeTypeValue]: K } = {
  OpenApi: "OpenApi",
  LocalPlugin: "LocalPlugin",
  RemoteMCPServer: "RemoteMCPServer",
} as const;

/**
 * OOP wrapper for API Plugin Manifest.
 *
 * Provides a fluent API for manipulating API plugin manifests with
 * type safety, state tracking, and convenient operations.
 *
 * @example
 * ```typescript
 * // Read existing manifest
 * const plugin = await APIPluginManifestWrapper.read("plugin.json");
 *
 * // Modify with fluent API
 * plugin
 *   .addFunction("getUser", "Get user information")
 *   .addOpenApiRuntime("openapi.yaml", "Bearer");
 *
 * // Save changes
 * await plugin.save();
 * ```
 */
export class APIPluginManifestWrapper extends BaseManifest<APIPluginManifest> {
  private constructor(data: APIPluginManifest, filePath?: string) {
    super(data, filePath);
  }

  // ============= Static Factory Methods =============

  /**
   * Reads a plugin manifest from a file.
   * @param filePath - Path to the manifest JSON file.
   * @returns A new APIPluginManifestWrapper instance.
   */
  static async read(filePath: string): Promise<APIPluginManifestWrapper> {
    const data = await AppManifestUtils.readApiPluginManifest(filePath);
    return new APIPluginManifestWrapper(data, filePath);
  }

  /**
   * Reads a plugin manifest from a file synchronously.
   * @param filePath - Path to the manifest JSON file.
   * @returns A new APIPluginManifestWrapper instance.
   */
  static readSync(filePath: string): APIPluginManifestWrapper {
    const json = BaseManifest.readJsonFileSync<APIPluginManifest>(filePath);
    const data = ApiPluginManifestConverter.jsonToManifest(JSON.stringify(json));
    return new APIPluginManifestWrapper(data, filePath);
  }

  /**
   * Creates an APIPluginManifestWrapper from a JSON string.
   * @param json - JSON string representing the manifest.
   * @returns A new APIPluginManifestWrapper instance.
   */
  static fromJSON(json: string): APIPluginManifestWrapper {
    const data = ApiPluginManifestConverter.jsonToManifest(json);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("API plugin manifest JSON must contain an object.");
    }
    return new APIPluginManifestWrapper(data);
  }

  /**
   * Creates a new plugin manifest with required fields.
   * @param init - Initial manifest data with required fields.
   * @returns A new APIPluginManifestWrapper instance.
   */
  static create(init: {
    schemaVersion: APIPluginManifest["schema_version"];
    nameForHuman: string;
    descriptionForHuman: string;
    namespace?: string;
  }): APIPluginManifestWrapper {
    const data: APIPluginManifest = {
      schema_version: init.schemaVersion,
      name_for_human: init.nameForHuman,
      description_for_human: init.descriptionForHuman,
      namespace: init.namespace ?? init.nameForHuman.replace(/\s+/g, "_"),
    } as APIPluginManifest;
    return new APIPluginManifestWrapper(data);
  }

  // ============= Getters =============

  /**
   * Returns the schema version of the manifest.
   */
  get schemaVersion(): string {
    return this._data.schema_version;
  }

  /**
   * Returns the human-readable name.
   */
  get nameForHuman(): string {
    return this._data.name_for_human;
  }

  /**
   * Returns the human-readable description.
   */
  get descriptionForHuman(): string {
    return this._data.description_for_human;
  }

  /**
   * Returns the namespace (if available in the version).
   */
  get namespace(): string | undefined {
    return (this._data as LatestManifestType).namespace;
  }

  /**
   * Returns a readonly array of functions.
   */
  get functions(): readonly FunctionObjectType[] {
    return (this._data.functions as FunctionObjectType[] | undefined) ?? [];
  }

  /**
   * Returns a readonly array of runtimes.
   */
  get runtimes(): readonly RuntimeObject[] {
    return (this._data.runtimes as RuntimeObject[] | undefined) ?? [];
  }

  /** Returns conversation-starter text declared by the plugin. */
  getConversationStarterTexts(): string[] {
    return this._data.capabilities?.conversation_starters?.map((starter) => starter.text) ?? [];
  }

  // ============= Setters (Fluent API) =============

  /**
   * Sets the human-readable name.
   */
  setNameForHuman(name: string): this {
    this._data.name_for_human = name;
    this.markDirty();
    return this;
  }

  /**
   * Sets the human-readable description.
   */
  setDescriptionForHuman(description: string): this {
    this._data.description_for_human = description;
    this.markDirty();
    return this;
  }

  /**
   * Sets the model description.
   */
  setDescriptionForModel(description: string): this {
    this._data.description_for_model = description;
    this.markDirty();
    return this;
  }

  /**
   * Sets the namespace (for latest version).
   */
  setNamespace(namespace: string): this {
    (this._data as LatestManifestType).namespace = namespace;
    this.markDirty();
    return this;
  }

  // ============= Function Operations =============

  /**
   * Adds a function to the manifest.
   * @param name - The function name (must match operationId in OpenAPI).
   * @param description - Description for the model.
   */
  addFunction(name: string, description?: string): this {
    if (!this._data.functions) {
      this._data.functions = [];
    }
    const existing = this._data.functions.find((f) => f.name === name);
    if (!existing) {
      (this._data.functions as FunctionObjectType[]).push({
        name,
        description,
      } as FunctionObjectType);
      this.markDirty();
    }
    return this;
  }

  /**
   * Removes a function by name.
   * @param name - The name of the function to remove.
   */
  removeFunction(name: string): this {
    if (this._data.functions) {
      this._data.functions = this._data.functions.filter((f) => f.name !== name);
      this.markDirty();
    }
    return this;
  }

  /**
   * Checks if a function exists by name.
   */
  hasFunction(name: string): boolean {
    return this.functions.some((f) => f.name === name);
  }

  /**
   * Gets a function by name.
   */
  getFunction(name: string): FunctionObjectType | undefined {
    return this.functions.find((f) => f.name === name);
  }

  // ============= Runtime Operations =============

  /**
   * Adds a runtime configuration.
   * @param runtime - The runtime configuration object.
   */
  addRuntime(runtime: RuntimeObject): this {
    if (!this._data.runtimes) {
      this._data.runtimes = [];
    }
    (this._data.runtimes as RuntimeObject[]).push(runtime);
    this.markDirty();
    return this;
  }

  /**
   * Adds an OpenAPI runtime.
   * @param specUrl - URL or relative path to the OpenAPI spec.
   * @param authType - Authentication type.
   * @param runForFunctions - Optional array of function names or "*" for all.
   */
  addOpenApiRuntime(
    specUrl: string,
    authType: "None" | "OAuthPluginVault" | "ApiKeyPluginVault" = "None",
    runForFunctions?: string[]
  ): this {
    return this.addRuntime({
      type: RuntimeType.OpenApi,
      auth: { type: authType },
      spec: { url: specUrl },
      run_for_functions: runForFunctions ?? ["*"],
    } as RuntimeObject);
  }

  /**
   * Adds a LocalPlugin runtime.
   * @param localEndpoint - The local endpoint identifier.
   * @param runForFunctions - Optional array of function names.
   */
  addLocalPluginRuntime(localEndpoint: "Microsoft.Office.Addin", runForFunctions?: string[]): this {
    return this.addRuntime({
      type: RuntimeType.LocalPlugin,
      auth: { type: "None" },
      spec: { local_endpoint: localEndpoint },
      run_for_functions: runForFunctions ?? ["*"],
    } as RuntimeObject);
  }

  /**
   * Replaces the function and runtime lists with static tools for one Remote MCP server.
   */
  materializeRemoteMcpTools(
    functions: ReadonlyArray<{ name: string; description?: string }>,
    serverUrl: string,
    toolDescriptionFile: string
  ): this {
    const runtime: RuntimeObject = {
      type: RuntimeType.RemoteMCPServer,
      auth: { type: "None" },
      spec: {
        url: serverUrl,
        mcp_tool_description: { file: toolDescriptionFile },
      },
      run_for_functions: functions.map((item) => item.name),
    };
    this._data.functions = [];
    this._data.runtimes = [];
    for (const item of functions) {
      this.addFunction(item.name, item.description);
    }
    return this.addRuntime(runtime);
  }

  /**
   * Removes a runtime by spec URL.
   * @param specUrl - The spec URL of the runtime to remove.
   */
  removeRuntimeBySpecUrl(specUrl: string): this {
    if (this._data.runtimes) {
      const runtimes = this._data.runtimes as RuntimeObject[];
      this._data.runtimes = runtimes.filter(
        (rt: RuntimeObject) => !((rt as { spec?: { url?: string } }).spec?.url === specUrl)
      );
      this.markDirty();
    }
    return this;
  }

  // ============= Query Operations =============

  /**
   * Returns all API spec paths/URLs from runtimes.
   */
  getApiSpecPaths(): string[] {
    return this.runtimes
      .filter((rt) => rt.type === RuntimeType.OpenApi)
      .map((rt) => (rt as { spec?: { url?: string } }).spec?.url)
      .filter((url): url is string => typeof url === "string");
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
    return ApiPluginManifestConverter.manifestToJson(this._data);
  }

  /**
   * Creates a deep clone of this manifest.
   */
  clone(): APIPluginManifestWrapper {
    const clonedData = JSON.parse(this.toJSON()) as APIPluginManifest;
    return new APIPluginManifestWrapper(clonedData);
  }

  /**
   * Creates a deep clone with partial modifications applied.
   * Useful for creating a modified copy without mutating the original.
   * @param changes - Partial manifest data to merge into the clone. Allows additional properties for extensibility.
   * @returns A new APIPluginManifestWrapper with the changes applied.
   */
  cloneWith(
    changes: Partial<APIPluginManifest> & Record<string, unknown>
  ): APIPluginManifestWrapper {
    const clonedData = JSON.parse(this.toJSON()) as APIPluginManifest;
    Object.assign(clonedData, changes);
    const wrapper = new APIPluginManifestWrapper(clonedData);
    wrapper.markDirty();
    return wrapper;
  }

  /**
   * Returns a mutable reference to the manifest data for direct modification.
   * Use with caution - prefer using the fluent API methods when possible.
   * Changes made through this reference will be tracked as dirty.
   */
  get mutableData(): APIPluginManifest {
    this.markDirty();
    return this._data;
  }
}
