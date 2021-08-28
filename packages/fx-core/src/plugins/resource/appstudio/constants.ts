// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IBot, IComposeExtension, IConfigurableTab, IStaticTab } from "@microsoft/teamsfx-api";
export class Constants {
  public static readonly MANIFEST_FILE = "manifest.json";
  public static readonly PLUGIN_NAME = "AppStudioPlugin";
  public static readonly PUBLISH_PATH_QUESTION = "manifest-folder";
  public static readonly BUILD_OR_PUBLISH_QUESTION = "build-or-publish";
  public static readonly REMOTE_TEAMS_APP_ID = "teams-app-id";
  public static readonly READ_MORE = "Read more";
  public static readonly PUBLISH_GUIDE = "https://aka.ms/teamsfx-publish";

  public static readonly PERMISSIONS = {
    name: "Teams App",
    noPermission: "No permission",
    admin: "Administrator",
    operative: "Operative",
    type: "M365",
  };
}

export class ErrorMessages {
  static readonly GetConfigError = (configName: string, plugin: string) =>
    `Failed to get configuration value "${configName}" for ${plugin}.`;
  static readonly ParseUserInfoError = "Failed to parse userInfo.";
}

/**
 * Config keys that are useful for generating remote teams app manifest
 */
export const REMOTE_MANIFEST = "manifest.source.json";
export const MANIFEST_TEMPLATE = "manifest.template.json";
export const FRONTEND_ENDPOINT = "endpoint";
export const FRONTEND_DOMAIN = "domain";
export const FRONTEND_ENDPOINT_ARM = "frontendHosting_endpoint";
export const FRONTEND_DOMAIN_ARM = "frontendHosting_domain";
export const BOT_ID = "botId";
export const LOCAL_BOT_ID = "localBotId";
export const V1_MANIFEST = "manifest.json";

/**
 * Config Keys that are useful for remote collaboration
 */
export const SOLUTION = "solution";
export const SOLUTION_USERINFO = "userinfo";

export const TEAMS_APP_MANIFEST_TEMPLATE = `{
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.9/MicrosoftTeams.schema.json",
  "manifestVersion": "1.9",
  "version": "{version}",
  "id": "{appid}",
  "packageName": "com.microsoft.teams.extension",
  "developer": {
      "name": "Teams App, Inc.",
      "websiteUrl": "{baseUrl}",
      "privacyUrl": "{baseUrl}/index.html#/privacy",
      "termsOfUseUrl": "{baseUrl}/index.html#/termsofuse"
  },
  "icons": {
      "color": "color.png",
      "outline": "outline.png"
  },
  "name": {
      "short": "{appName}",
      "full": "This field is not used"
  },
  "description": {
      "short": "Short description of {appName}.",
      "full": "Full description of {appName}."
  },
  "accentColor": "#FFFFFF",
  "bots": [],
  "composeExtensions": [],
  "configurableTabs": [],
  "staticTabs": [],
  "permissions": [
      "identity",
      "messageTeamMembers"
  ],
  "validDomains": [],
  "webApplicationInfo": {
      "id": "{appClientId}",
      "resource": "{webApplicationInfoResource}"
  }
}`;

export const TEAMS_APP_MANIFEST_TEMPLATE_FOR_MULTI_ENV = `{
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.9/MicrosoftTeams.schema.json",
  "manifestVersion": "1.9",
  "version": "{version}",
  "id": "{appid}",
  "packageName": "com.microsoft.teams.extension",
  "developer": {
      "name": "Teams App, Inc.",
      "websiteUrl": "{baseUrl}",
      "privacyUrl": "{baseUrl}/index.html#/privacy",
      "termsOfUseUrl": "{baseUrl}/index.html#/termsofuse"
  },
  "icons": {
      "color": "resources/color.png",
      "outline": "resources/outline.png"
  },
  "name": {
      "short": "{appName}",
      "full": "This field is not used"
  },
  "description": {
      "short": "Short description of {appName}.",
      "full": "Full description of {appName}."
  },
  "accentColor": "#FFFFFF",
  "bots": [],
  "composeExtensions": [],
  "configurableTabs": [],
  "staticTabs": [],
  "permissions": [
      "identity",
      "messageTeamMembers"
  ],
  "validDomains": [],
  "webApplicationInfo": {
      "id": "{appClientId}",
      "resource": "{webApplicationInfoResource}"
  }
}`;

export const COMPOSE_EXTENSIONS_TPL: IComposeExtension[] = [
  {
    botId: "{botId}",
    commands: [
      {
        id: "createCard",
        context: ["compose"],
        description: "Command to run action to create a Card from Compose Box",
        title: "Create Card",
        type: "action",
        parameters: [
          {
            name: "title",
            title: "Card title",
            description: "Title for the card",
            inputType: "text",
          },
          {
            name: "subTitle",
            title: "Subtitle",
            description: "Subtitle for the card",
            inputType: "text",
          },
          {
            name: "text",
            title: "Text",
            description: "Text for the card",
            inputType: "textarea",
          },
        ],
      },
      {
        id: "shareMessage",
        context: ["message"],
        description: "Test command to run action on message context (message sharing)",
        title: "Share Message",
        type: "action",
        parameters: [
          {
            name: "includeImage",
            title: "Include Image",
            description: "Include image in Hero Card",
            inputType: "toggle",
          },
        ],
      },
      {
        id: "searchQuery",
        context: ["compose", "commandBox"],
        description: "Test command to run query",
        title: "Search",
        type: "query",
        parameters: [
          {
            name: "searchQuery",
            title: "Search Query",
            description: "Your search query",
            inputType: "text",
          },
        ],
      },
    ],
    messageHandlers: [
      {
        type: "link",
        value: {
          domains: ["*.botframework.com"],
        },
      },
    ],
  },
];
export const BOTS_TPL: IBot[] = [
  {
    botId: "{botId}",
    scopes: ["personal", "team", "groupchat"],
    supportsFiles: false,
    isNotificationOnly: false,
    commandLists: [
      {
        scopes: ["personal", "team", "groupchat"],
        commands: [
          {
            title: "welcome",
            description: "Resend welcome card of this Bot",
          },
          {
            title: "learn",
            description: "Learn about Adaptive Card and Bot Command",
          },
        ],
      },
    ],
  },
];
export const CONFIGURABLE_TABS_TPL: IConfigurableTab[] = [
  {
    configurationUrl: "{baseUrl}/index.html#/config",
    canUpdateConfiguration: true,
    scopes: ["team", "groupchat"],
  },
];

export const STATIC_TABS_TPL: IStaticTab[] = [
  {
    entityId: "index",
    name: "Personal Tab",
    contentUrl: "{baseUrl}/index.html#/tab",
    websiteUrl: "{baseUrl}/index.html#/tab",
    scopes: ["personal"],
  },
];

// Default values for the developer fields in manifest.
export const DEFAULT_DEVELOPER_WEBSITE_URL = "https://www.example.com";
export const DEFAULT_DEVELOPER_TERM_OF_USE_URL = "https://www.example.com/termofuse";
export const DEFAULT_DEVELOPER_PRIVACY_URL = "https://www.example.com/privacy";

export const TEAMS_APP_SHORT_NAME_MAX_LENGTH = 30;

export const BOT_PLUGIN_NAME = "fx-resource-bot";
