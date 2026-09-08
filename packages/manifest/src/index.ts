// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { JSONSchemaType } from "ajv";
import Ajv from "ajv-draft-04";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import fs from "fs-extra";
import fetch from "./fetchHelper";
import { ManifestCommonProperties } from "./ManifestCommonProperties";
import { DeclarativeCopilotManifestSchema } from "./declarativeCopilotManifest";
import {
  AppManifestUtils,
  DevPreviewSchema,
  TeamsManifest,
  TeamsManifestConverter,
} from "./generated-types";
import { TeamsAppManifest } from "./manifest";
import { PluginManifestSchema } from "./pluginManifest";
import { SchemaFetchError } from "./SchemaFetchError";

export * from "./declarativeCopilotManifest";
export * from "./SchemaFetchError";
export * from "./generated-types";
export * from "./manifest";
export * from "./manifestTemplate";
export * from "./pluginManifest";
export * from "./wrappers";

export type TeamsAppManifestJSONSchema = JSONSchemaType<TeamsAppManifest>;
export type DevPreviewManifestJSONSchema = JSONSchemaType<DevPreviewSchema>;

/**
 * @deprecated
 */
export type Manifest = TeamsAppManifest | DevPreviewSchema;

export type ManifestProperties = ManifestCommonProperties;

export class ManifestUtil {
  /**
   * Loads the manifest from the given path with basic type check.
   *
   * @deprecated use `AppManifestUtils.read()` instead
   * @param path - The path to the manifest file.
   * @throws Will propagate any error thrown by the fs-extra#readJson or type check failure.
   *
   * @returns The Manifest Object.
   */
  static async loadFromPath(path: string): Promise<TeamsManifest> {
    const jsonString = await fs.readFile(path, "utf8");
    const manifest = TeamsManifestConverter.jsonToManifest(jsonString);
    return manifest;
  }

  /**
   * Loads the manifest from the given path with validation
   *
   * @deprecated use `AppManifestUtils.readAndValidate()` instead
   * @param path - The path to the manifest file.
   * @throws Will propagate any error thrown by the fs-extra#readJson or type check failure.
   *
   * @returns The Manifest Object and schema validation results
   */
  static async loadAndValidateFromPath(path: string): Promise<[TeamsManifest, string[]]> {
    const manifest = await this.loadFromPath(path);
    const validateRes = await AppManifestUtils.validateAgainstSchema(manifest);
    return [manifest, validateRes];
  }

  /**
   * Writes the manifest object to the given path.
   *
   * @deprecated use `AppManifestUtils.writeTeamsManifest()` instead
   * @param path - Where to write
   * @param manifest - Manifest object to be saved
   * @throws Will propagate any error thrown by the fs-extra#writeJson.
   *
   */
  static async writeToPath<T extends Manifest = TeamsAppManifest>(
    path: string,
    manifest: T
  ): Promise<void> {
    return fs.writeJson(path, manifest, { spaces: 4 });
  }

  /**
   * Validate manifest against json schema.
   * @deprecated use `AppManifestUtils.validateAgainstSchema(manifest, schema)` instead
   * @param manifest - Manifest object to be validated
   * @param schema - teams-app-manifest schema
   * @returns An empty array if it passes validation, or an array of error string otherwise.
   */
  static validateManifestAgainstSchema<
    T extends Manifest | DeclarativeCopilotManifestSchema | PluginManifestSchema | TeamsManifest =
      TeamsAppManifest,
  >(manifest: T, schema: JSONSchemaType<T>): Promise<string[]> {
    let validate;
    if (schema.$schema?.includes("2020-12")) {
      const ajv = new Ajv2020({
        //formats: { uri: true, email: true },
        allErrors: true,
        strictTypes: false,
      });
      addFormats(ajv, ["uri", "email", "regex"]);
      validate = ajv.compile(schema);
    } else {
      const ajv = new Ajv({
        allErrors: true,
        strictTypes: false,
      });
      addFormats(ajv, ["uri", "email", "regex"]);
      validate = ajv.compile(schema);
    }

    const valid = validate(manifest);
    if (!valid && validate.errors) {
      return Promise.resolve(
        validate.errors?.map(
          (error) =>
            `${error.instancePath} ${error.message || ""}. Details: ${
              error.params ? JSON.stringify(error.params) : ""
            }`
        )
      );
    } else {
      return Promise.resolve([]);
    }
  }

  /**
   * @deprecated
   * @param manifest
   * @returns
   */
  static async fetchSchema<
    T extends Manifest | DeclarativeCopilotManifestSchema | PluginManifestSchema | TeamsManifest =
      TeamsAppManifest,
  >(manifest: T): Promise<JSONSchemaType<T>> {
    const schemaUrl = ((manifest as any).$schema || (manifest as any).schema) as string;
    if (!schemaUrl) {
      throw new Error("Manifest does not have a $schema property or schema url is not provided.");
    }
    let result: JSONSchemaType<T>;
    try {
      const res = await fetch(schemaUrl);
      // workaround for invalid regex expression https://github.com/OfficeDev/microsoft-teams-app-schema/issues/190
      const text = await res.text();
      const cleanedText = text.replace(/\\a/g, "\\x07");
      result = JSON.parse(cleanedText) as JSONSchemaType<T>;
    } catch (e: unknown) {
      throw new SchemaFetchError(schemaUrl, e);
    }
    return result;
  }

  /**
   * Validate manifest against {@link TeamsAppManifest#$schema}.
   *
   * @deprecated use `AppManifestUtils.validateAgainstSchema(manifest: T)` instead
   * @param manifest - Manifest object to be validated
   * @throws Will throw if {@link TeamsAppManifest#$schema} is undefined, not valid
   *         or there is any network failure when getting the schema.
   *
   * @returns An empty array if schema validation passes, or an array of error string otherwise.
   */
  static async validateManifest<
    T extends Manifest | DeclarativeCopilotManifestSchema | PluginManifestSchema | TeamsManifest =
      TeamsAppManifest,
  >(manifest: T): Promise<string[]> {
    const schema = await this.fetchSchema(manifest);
    return ManifestUtil.validateManifestAgainstSchema(manifest, schema);
  }
}
