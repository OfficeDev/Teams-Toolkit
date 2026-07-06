// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { TeamsManifestLatest } from "./generated-types";

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 * Import `TeamsManifest` or version-specific types like `TeamsManifestV1D21` from the generated-types module.
 */

// Internal helpers to derive nested types from the latest generated manifest.
type BotType = NonNullable<TeamsManifestLatest["bots"]>[number];
type ComposeExtensionItemType = NonNullable<TeamsManifestLatest["composeExtensions"]>[number];
type ComposeExtensionCommandType = NonNullable<ComposeExtensionItemType["commands"]>[number];
type ComposeExtensionAuthorizationType = NonNullable<ComposeExtensionItemType["authorization"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IDeveloper = TeamsManifestLatest["developer"];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IName = TeamsManifestLatest["name"];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IIcons = TeamsManifestLatest["icons"];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IConfigurableTab = NonNullable<TeamsManifestLatest["configurableTabs"]>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IStaticTab = NonNullable<TeamsManifestLatest["staticTabs"]>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ICommand = ICommandList["commands"][number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ICommandList = NonNullable<BotType["commandLists"]>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IBot = BotType;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IConnector = NonNullable<TeamsManifestLatest["connectors"]>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IWebApplicationInfo = NonNullable<TeamsManifestLatest["webApplicationInfo"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type BotOrMeScopes = BotType["scopes"];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IComposeExtension = ComposeExtensionItemType;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IComposeExtensionMessageHandler = NonNullable<
  ComposeExtensionItemType["messageHandlers"]
>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IMessagingExtensionCommand = ComposeExtensionCommandType;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IAuthorization = ComposeExtensionAuthorizationType;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IMicrosoftEntraConfiguration = NonNullable<
  ComposeExtensionAuthorizationType["microsoftEntraConfiguration"]
>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IParameter = NonNullable<ComposeExtensionCommandType["parameters"]>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ITaskInfo = NonNullable<ComposeExtensionCommandType["taskInfo"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IActivityType = NonNullable<
  NonNullable<TeamsManifestLatest["activities"]>["activityTypes"]
>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ILocalizationInfo = NonNullable<TeamsManifestLatest["localizationInfo"]>;

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type ITogetherModeScene = NonNullable<
  NonNullable<TeamsManifestLatest["meetingExtensionDefinition"]>["scenes"]
>[number];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type IDeclarativeCopilot = NonNullable<
  NonNullable<TeamsManifestLatest["copilotAgents"]>["declarativeAgents"]
>[number];

// export type AppManifest = Record<string, any>;

/**
 * @deprecated Use `TeamsManifest` or version-specific types like `TeamsManifestV1D21` from `./generated-types` instead.
 * This class-based manifest definition is outdated. The generated types provide accurate schemas for each manifest version.
 */
export type TeamsAppManifest = TeamsManifestLatest;
