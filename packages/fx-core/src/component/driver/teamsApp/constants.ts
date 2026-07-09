// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Huajie Zhang <huajiezhang@microsoft.com>
 */
import { IBot, IComposeExtension, IConfigurableTab, IStaticTab } from "@microsoft/teamsfx-api";
import semver from "semver";
import { ComponentNames } from "../../migrate";

const AAD_STATE_KEY = ComponentNames.AadApp;
const TAB_STATE_KEY = ComponentNames.TeamsTab;
const BOT_STATE_KEY = ComponentNames.TeamsBot;

export const STATIC_TABS_TPL_V3: IStaticTab[] = [
  {
    entityId: "index",
    name: "Personal Tab",
    contentUrl: `{{{state.${TAB_STATE_KEY}.endpoint}}}{{{state.${TAB_STATE_KEY}.indexPath}}}/tab`,
    websiteUrl: `{{{state.${TAB_STATE_KEY}.endpoint}}}{{{state.${TAB_STATE_KEY}.indexPath}}}/tab`,
    scopes: ["personal"],
  },
  {
    entityId: "index",
    name: "Dashboard",
    contentUrl: `{{{state.${TAB_STATE_KEY}.endpoint}}}{{{state.${TAB_STATE_KEY}.indexPath}}}/tab`,
    websiteUrl: `{{{state.${TAB_STATE_KEY}.endpoint}}}{{{state.${TAB_STATE_KEY}.indexPath}}}/tab`,
    scopes: ["personal"],
  },
];

export const CONFIGURABLE_TABS_TPL_V3: IConfigurableTab[] = [
  {
    configurationUrl: `{{{state.${TAB_STATE_KEY}.endpoint}}}{{{state.${TAB_STATE_KEY}.indexPath}}}/config`,
    canUpdateConfiguration: true,
    scopes: ["team", "groupchat"],
  },
];

export const CONFIGURABLE_TABS_TPL_V4: IConfigurableTab[] = [
  {
    configurationUrl: `{{{state.${TAB_STATE_KEY}.endpoint}}}{{{state.${TAB_STATE_KEY}.indexPath}}}/config`,
    canUpdateConfiguration: true,
    scopes: ["team", "groupChat"],
  },
];

export function getConfigurableTabsTplBasedOnVersion(version: string): IConfigurableTab[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return CONFIGURABLE_TABS_TPL_V4;
  }
  return CONFIGURABLE_TABS_TPL_V3;
}

const BOT_ID_PLACEHOLDER = `{{state.${BOT_STATE_KEY}.botId}}`;

export const BOTS_TPL_FOR_COMMAND_AND_RESPONSE_V3: IBot[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
    scopes: ["personal", "team", "groupchat"],
    supportsFiles: false,
    isNotificationOnly: false,
    commandLists: [
      {
        scopes: ["personal", "team", "groupchat"],
        commands: [
          {
            title: "helloWorld",
            description: "A helloworld command to send a welcome message",
          },
        ],
      },
    ],
  },
];

export const BOTS_TPL_FOR_COMMAND_AND_RESPONSE_V4: IBot[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
    scopes: ["personal", "team", "groupChat"],
    supportsFiles: false,
    isNotificationOnly: false,
    commandLists: [
      {
        scopes: ["personal", "team", "groupChat"],
        commands: [
          {
            title: "helloWorld",
            description: "A helloworld command to send a welcome message",
          },
        ],
      },
    ],
  },
];

export function getBotsTplForCommandAndResponseBasedOnVersion(version: string): IBot[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return BOTS_TPL_FOR_COMMAND_AND_RESPONSE_V4;
  }
  return BOTS_TPL_FOR_COMMAND_AND_RESPONSE_V3;
}

export const BOTS_TPL_FOR_NOTIFICATION_V3: IBot[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
    scopes: ["personal", "team", "groupchat"],
    supportsFiles: false,
    isNotificationOnly: false,
  },
];

export const BOTS_TPL_FOR_NOTIFICATION_V4: IBot[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
    scopes: ["personal", "team", "groupChat"],
    supportsFiles: false,
    isNotificationOnly: false,
  },
];

export function getBotsTplForNotificationBasedOnVersion(version: string): IBot[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return BOTS_TPL_FOR_NOTIFICATION_V4;
  }
  return BOTS_TPL_FOR_NOTIFICATION_V3;
}

export const BOTS_TPL_V3: IBot[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
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

export const BOTS_TPL_V4: IBot[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
    scopes: ["personal", "team", "groupChat"],
    supportsFiles: false,
    isNotificationOnly: false,
    commandLists: [
      {
        scopes: ["personal", "team", "groupChat"],
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

export function getBotsTplBasedOnVersion(version: string): IBot[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return BOTS_TPL_V4;
  }
  return BOTS_TPL_V3;
}

export const COMPOSE_EXTENSIONS_TPL_M365_V3: IComposeExtension[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
    commands: [
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
  },
];
export const COMPOSE_EXTENSIONS_TPL_V3: IComposeExtension[] = [
  {
    botId: BOT_ID_PLACEHOLDER,
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

export const WEB_APPLICATION_INFO_V3 = {
  id: `{{state.${AAD_STATE_KEY}.clientId}}`,
  resource: `{{{state.${AAD_STATE_KEY}.applicationIdUris}}}`,
};

export class Constants {
  public static readonly MANIFEST_FILE = "manifest.json";
  public static readonly PLUGIN_NAME = "AppStudioPlugin";
  public static readonly BUILD_OR_PUBLISH_QUESTION = "build-or-publish";
  public static readonly INCLUDE_APP_MANIFEST = "include-app-manifest";
  public static readonly DEVELOPER_PORTAL_APP_PACKAGE_URL =
    "https://dev.teams.microsoft.com/apps/%s/app-package-editor?login_hint=%s";
  public static readonly PUBLISH_GUIDE = "https://aka.ms/teamsfx-publish";
  public static readonly TEAMS_ADMIN_PORTAL = "https://aka.ms/teamsfx-mtac";
  public static readonly MICROSOFT_ADMIN_CENTER = "https://aka.ms/atk-mac";
  public static readonly TEAMS_MANAGE_APP_DOC = "https://aka.ms/teamsfx-mtac-doc";
  public static readonly TEAMS_APP_ID = "teamsAppId";
  public static readonly TEAMS_APP_UPDATED_AT = "teamsAppUpdatedAt";
  public static readonly TEAMS_APP_ID_ENV = "TEAMS_APP_ID";

  public static readonly PERMISSIONS = {
    name: "Teams App",
    noPermission: "No permission",
    admin: "Administrator",
    operative: "Operative",
    type: "M365",
  };

  // HTTP headers are case insensitive. Axios lowercases all headers.
  public static readonly CORRELATION_ID = "x-correlation-id";
}

export class ErrorMessages {
  static readonly GetConfigError = (configName: string, plugin: string) =>
    `Failed to get configuration value "${configName}" for ${plugin}.`;
  static readonly GrantPermissionFailed = "Response is empty or user is not added.";
  static readonly TeamsAppNotFound = (teamsAppId: string) =>
    `Cannot find app with id: ${teamsAppId}. Maybe your current M365 account doesn't not have permission, or the app has already been deleted.`;
}

export class APP_STUDIO_API_NAMES {
  public static readonly CREATE_APP = "create-app";
  public static readonly CREATE_AAD_APP = "create-aad-app";
  public static readonly GET_APP = "get-app";
  public static readonly LIST_APPS = "list-app";
  public static readonly DELETE_APP = "delete-app";
  public static readonly PUBLISH_APP = "publish-app";
  public static readonly GET_PUBLISHED_APP = "get-published-app";
  public static readonly UPDATE_PUBLISHED_APP = "update-published-app";
  public static readonly UPDATE_OWNER = "update-owner";
  public static readonly EXISTS_IN_TENANTS = "exists-in-tenant";
  public static readonly GET_APP_PACKAGE = "get-app-package";
  public static readonly VALIDATE_APP_PACKAGE = "validate-app-package";
  public static readonly CREATE_BOT = "create-bot";
  public static readonly GET_BOT = "get-bot";
  public static readonly LIST_BOT = "list-bot";
  public static readonly DELETE_BOT = "delete-bot";
  public static readonly UPDATE_BOT = "update-bot";
  public static readonly CREATE_API_KEY = "create-api-secret-registration";
  public static readonly UPDATE_API_KEY = "update-api-secret-registration";
  public static readonly GET_API_KEY = "get-api-secret-registration";
  public static readonly SUBMIT_APP_VALIDATION = "submit-app-validation";
  public static readonly GET_APP_VALIDATION_RESULT = "get-app-validation-result";
  public static readonly GET_APP_VALIDATION_REQUESTS = "get-app-validation-requests";
  public static readonly GET_OAUTH = "get-oauth";
  public static readonly CREATE_OAUTH = "create-oauth";
  public static readonly UPDATE_OAUTH = "update-oauth";
  public static readonly CHECK_SIDELOADING_STATUS = "check-sideloading-status";
}

export class GRAPH_API_NAMES {
  public static readonly PUBLISH_APP = "graph-publish-app";
  public static readonly GET_PUBLISHED_APP = "graph-get-published-app";
  public static readonly UPDATE_PUBLISHED_APP = "graph-update-published-app";
}

/**
 * Config keys that are useful for generating remote app manifest
 */
export const MANIFEST_TEMPLATE_CONSOLIDATE = "manifest.template.json";
export const COLOR_TEMPLATE = "plugins/resource/appstudio/defaultIcon.png";
export const OUTLINE_TEMPLATE = "plugins/resource/appstudio/defaultOutline.png";
export const DEFAULT_COLOR_PNG_FILENAME = "color.png";
export const DEFAULT_OUTLINE_PNG_FILENAME = "outline.png";

// Default values for the developer fields in manifest.
export const DEFAULT_DEVELOPER = {
  name: "Teams App, Inc.",
  websiteUrl: "https://www.example.com",
  privacyUrl: "https://www.example.com/termofuse",
  termsOfUseUrl: "https://www.example.com/privacy",
};

// Default values for the description fields in manifest.
export const DEFAULT_DESCRIPTION = {
  short: "Short description",
  full: "Full description",
};

export const BOTS_TPL_EXISTING_APP: IBot[] = [
  {
    botId: "{{config.manifest.botId}}",
    scopes: ["personal", "team", "groupchat"],
    supportsFiles: false,
    isNotificationOnly: false,
    commandLists: [
      {
        scopes: ["personal", "team", "groupchat"],
        commands: [],
      },
    ],
  },
];

export const BOTS_TPL_EXISTING_APP_V2: IBot[] = [
  {
    botId: "{{config.manifest.botId}}",
    scopes: ["personal", "team", "groupChat"],
    supportsFiles: false,
    isNotificationOnly: false,
    commandLists: [
      {
        scopes: ["personal", "team", "groupChat"],
        commands: [],
      },
    ],
  },
];

export function getBotsTplExistingAppBasedOnVersion(version: string): IBot[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return BOTS_TPL_EXISTING_APP_V2;
  }
  return BOTS_TPL_EXISTING_APP;
}

export const COMPOSE_EXTENSIONS_TPL_EXISTING_APP: IComposeExtension[] = [
  {
    botId: "{{config.manifest.botId}}",
    commands: [],
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

export const CONFIGURABLE_TABS_TPL_EXISTING_APP: IConfigurableTab[] = [
  {
    configurationUrl: "{{config.manifest.tabConfigurationUrl}}",
    canUpdateConfiguration: true,
    scopes: ["team", "groupchat"],
  },
];

export const CONFIGURABLE_TABS_TPL_EXISTING_APP_V2: IConfigurableTab[] = [
  {
    configurationUrl: "{{config.manifest.tabConfigurationUrl}}",
    canUpdateConfiguration: true,
    scopes: ["team", "groupChat"],
  },
];

export function getConfigurableTabsTplExistingAppBasedOnVersion(
  version: string
): IConfigurableTab[] {
  const manifestVersion = semver.coerce(version);
  if (version === "devPreview" || (manifestVersion && semver.gte(manifestVersion, "1.17.0"))) {
    return CONFIGURABLE_TABS_TPL_EXISTING_APP_V2;
  }
  return CONFIGURABLE_TABS_TPL_EXISTING_APP;
}

export const STATIC_TABS_TPL_EXISTING_APP: IStaticTab[] = [
  {
    entityId: "index",
    name: "Personal Tab",
    contentUrl: "{{config.manifest.tabContentUrl}}",
    websiteUrl: "{{config.manifest.tabWebsiteUrl}}",
    scopes: ["personal"],
  },
];

export const TEAMS_APP_SHORT_NAME_MAX_LENGTH = 30;
export const STATIC_TABS_MAX_ITEMS = 16;
// Check validation result interval
export const CEHCK_VALIDATION_RESULTS_INTERVAL_SECONDS = 60;

/**
 * Language codes.
 */
export const supportedLanguageCodes = [
  "ar-sa",
  "cs-cz",
  "da-dk",
  "de-at",
  "de-ch",
  "de-de",
  "de-li",
  "de-lu",
  "en-029",
  "en-au",
  "en-bz",
  "en-ca",
  "en-gb",
  "en-ie",
  "en-in",
  "en-jm",
  "en-my",
  "en-nz",
  "en-ph",
  "en-sg",
  "en-tt",
  "en-us",
  "en-za",
  "en-zw",
  "es-ar",
  "es-bo",
  "es-cl",
  "es-co",
  "es-cr",
  "es-do",
  "es-ec",
  "es-es",
  "es-gt",
  "es-hn",
  "es-mx",
  "es-ni",
  "es-pa",
  "es-pe",
  "es-pr",
  "es-py",
  "es-sv",
  "es-us",
  "es-uy",
  "es-ve",
  "fi-fi",
  "fr-be",
  "he-il",
  "hi-in",
  "fr-ca",
  "fr-ch",
  "fr-fr",
  "fr-lu",
  "fr-mc",
  "it-ch",
  "it-it",
  "ja-jp",
  "ko-kr",
  "nb-no",
  "nn-no",
  "nl-be",
  "nl-nl",
  "fil-ph",
  "pl-pl",
  "sk-sk",
  "hu-hu",
  "el-gr",
  "uk-ua",
  "pseudo",
  "fl-ip",
  "pt-br",
  "pt-pt",
  "ru-ru",
  "sv-fi",
  "sv-se",
  "tr-tr",
  "zh-cn",
  "zh-sg",
  "zh-hk",
  "zh-mo",
  "zh-tw",
  "th-th",
  "id-id",
  "ro-ro",
  "vi-vn",
  "lt-lt",
  "sl-si",
  "ca-es",
  "hr-hr",
  "et-ee",
  "bg-bg",
  "cy-gb",
  "is-is",
  "sr-latn-rs",
  "lv-lv",
  "ar",
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "hi",
  "it",
  "ja",
  "ko",
  "nb",
  "nn",
  "nl",
  "fil",
  "pl",
  "sk",
  "hu",
  "el",
  "uk",
  "pseudo",
  "fl",
  "pt",
  "ru",
  "sv",
  "tr",
  "zh",
  "th",
  "id",
  "ro",
  "vi",
  "lt",
  "sl",
  "ca",
  "hr",
  "et",
  "bg",
  "cy",
  "is",
  "sr",
  "lv",
];

export const GeneralValidationErrorId = "693c7aa7-4d76-40ec-8282-06410f5d1f76";

export const EmbeddedKnowledgeLocalDirectoryName = "EmbeddedKnowledge";
