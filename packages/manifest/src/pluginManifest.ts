// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { APIPluginManifestLatest } from "./generated-types";

// Internal helpers to derive version-stable function types from the latest generated manifest.
type PluginFunctionType = NonNullable<APIPluginManifestLatest["functions"]>[number];
type PluginFunctionCapabilities = NonNullable<PluginFunctionType["capabilities"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 * Import `APIPluginManifest` or version-specific types like `APIPluginManifestV2D4` from the generated-types module.
 */

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type Instruction = string | string[];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type Example = string | string[];

/**
 * @deprecated Use `APIPluginManifest` or version-specific types from `./generated-types` instead.
 */
export interface PluginManifestSchema {
  schema_version: string;
  name_for_human: string;
  namespace?: string;
  description_for_model?: string;
  description_for_human: string;
  logo_url?: string;
  contact_email?: string;
  legal_info_url?: string;
  privacy_policy_url?: string;
  functions?: FunctionObject[];
  runtimes?: (RuntimeObjectLocalplugin | RuntimeObjectOpenapi)[];
  capabilities?: {
    conversation_starters?: ConversationStarter[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type FunctionObject = PluginFunctionType;

/**x
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type FunctionParameters = NonNullable<PluginFunctionType["parameters"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type FunctionReturnType = NonNullable<PluginFunctionType["returns"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type FunctionStateConfig = NonNullable<
  NonNullable<PluginFunctionType["states"]>["reasoning"]
>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ConfirmationObject = NonNullable<PluginFunctionCapabilities["confirmation"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ResponseSemanticsObject = NonNullable<PluginFunctionCapabilities["response_semantics"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface RuntimeObjectLocalplugin {
  type: "LocalPlugin";
  run_for_functions?: string[];
  spec: LocalPluginRuntime;
  [k: string]: unknown;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface LocalPluginRuntime {
  local_endpoint: string;
  [k: string]: unknown;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface RuntimeObjectOpenapi {
  type: "OpenApi";
  auth?: AuthObject;
  run_for_functions?: string[];
  spec: OpenApiRuntime;
  [k: string]: unknown;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface AuthObject {
  type: "None" | "OAuthPluginVault" | "ApiKeyPluginVault";
  reference_id?: string;
  [k: string]: unknown;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface OpenApiRuntime {
  url: string;
  [k: string]: unknown;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ConversationStarter = NonNullable<
  NonNullable<APIPluginManifestLatest["capabilities"]>["conversation_starters"]
>[number];
