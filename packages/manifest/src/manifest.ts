// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 * Import `TeamsManifest` or version-specific types like `TeamsManifestV1D21` from the generated-types module.
 */

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IDeveloper {
  /**
   * The display name for the developer.
   */
  name: string;
  /**
   * The Microsoft Partner Network ID that identifies the partner organization building the app. This field is not required, and should only be used if you are already part of the Microsoft Partner Network. More info at https://aka.ms/partner
   */
  mpnId?: string;
  /**
   * The url to the page that provides support information for the app.
   */
  websiteUrl: string;
  /**
   * The url to the page that provides privacy information for the app.
   */
  privacyUrl: string;
  /**
   * The url to the page that provides the terms of use for the app.
   */
  termsOfUseUrl: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IName {
  short: string;
  /**
   * The full name of the app, used if the full app name exceeds 30 characters.
   */
  full?: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IIcons {
  color: string;
  outline: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IConfigurableTab {
  objectId?: string;

  /**
   * The url to use when configuring the tab.
   */
  configurationUrl: string;
  /**
   * A value indicating whether an instance of the tab's configuration can be updated by the user after creation.
   */
  canUpdateConfiguration?: boolean;
  /**
   * Specifies whether the tab offers an experience in the context of a channel in a team, in a 1:1 or group chat, or in an experience scoped to an individual user alone. These options are non-exclusive. Currently, configurable tabs are only supported in the teams and groupchats scopes.
   */
  scopes: ("team" | "groupchat" | "groupChat")[];
  /**
   * The set of contextItem scopes that a tab belong to
   */
  context?: (
    | "personalTab"
    | "channelTab"
    | "privateChatTab"
    | "meetingChatTab"
    | "meetingDetailsTab"
    | "meetingSidePanel"
    | "meetingStage"
    | "callingSidePanel"
  )[];
  /**
   * The set of meetingSurfaceItem scopes that a tab belong to
   */
  meetingSurfaces?: ("sidePanel" | "stage")[];
  /**
   * A relative file path to a tab preview image for use in SharePoint. Size 1024x768.
   */
  sharePointPreviewImage?: string;
  /**
   * Defines how your tab will be made available in SharePoint.
   */
  supportedSharePointHosts?: ("sharePointFullPage" | "sharePointWebPart")[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IStaticTab {
  objectId?: string;
  /**
   * A unique identifier for the entity which the tab displays.
   */
  entityId: string;
  /**
   * The display name of the tab.
   */
  name?: string;
  /**
   * The url which points to the entity UI to be displayed in the Teams canvas.
   */
  contentUrl?: string;
  /**
   * The url to point at if a user opts to view in a browser.
   */
  websiteUrl?: string;
  /**
   * The url to direct a user's search queries.
   */
  searchUrl?: string;
  /**
   * Specifies whether the tab offers an experience in the context of a channel in a team, or an experience scoped to an individual user alone. These options are non-exclusive. Currently static tabs are only supported in the 'personal' scope.
   */
  scopes: ("team" | "personal")[];
  /**
   * The set of contextItem scopes that a tab belong to
   */
  context?: ("personalTab" | "channelTab")[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface ICommand {
  title: string;
  description: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface ICommandList {
  scopes: BotOrMeScopes;
  commands: ICommand[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IBot {
  /**
   * The Microsoft App ID specified for the bot in the Bot Framework portal (https://dev.botframework.com/bots)
   */
  botId: string;
  /**
   * This value describes whether or not the bot utilizes a user hint to add the bot to a specific channel.
   */
  needsChannelSelector?: boolean;
  /**
   * A value indicating whether or not the bot is a one-way notification only bot, as opposed to a conversational bot.
   */
  isNotificationOnly?: boolean;
  /**
   * A value indicating whether the bot supports uploading/downloading of files.
   */
  supportsFiles?: boolean;
  /**
   * A value indicating whether the bot supports audio calling.
   */
  supportsCalling?: boolean;
  /**
   * A value indicating whether the bot supports video calling.
   */
  supportsVideo?: boolean;
  /**
   * Specifies whether the bot offers an experience in the context of a channel in a team, in a 1:1 or group chat, or in an experience scoped to an individual user alone. These options are non-exclusive.
   */
  scopes: BotOrMeScopes;
  /**
   * The list of commands that the bot supplies, including their usage, description, and the scope for which the commands are valid. A separate command list should be used for each scope.
   */
  commandLists?: ICommandList[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IConnector {
  /**
   * A unique identifier for the connector which matches its ID in the Connectors Developer Portal.
   */
  connectorId: string;
  /**
   * The url to use for configuring the connector using the inline configuration experience.
   */
  configurationUrl?: string;
  /**
   * Specifies whether the connector offers an experience in the context of a channel in a team, or an experience scoped to an individual user alone. Currently, only the team scope is supported.
   */
  scopes: "team"[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IWebApplicationInfo {
  /**
   * AAD application id of the app. This id must be a GUID.
   */
  id: string;
  /**
   * Resource url of app for acquiring auth token for SSO.
   */
  resource?: string;
  applicationPermissions?: string[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export type BotOrMeScopes = ("team" | "personal" | "groupchat" | "groupChat" | "copilot")[];

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IComposeExtension {
  objectId?: string;

  /**
   * The Microsoft App ID specified for the bot powering the compose extension in the Bot Framework portal (https://dev.botframework.com/bots)
   * It's not required for apiBased type
   */
  botId?: string;
  /**
   * A value indicating whether the configuration of a compose extension can be updated by the user.
   */
  canUpdateConfiguration?: boolean;

  scopes?: BotOrMeScopes;

  commands: IMessagingExtensionCommand[];
  /**
   * A list of handlers that allow apps to be invoked when certain conditions are met
   */
  messageHandlers?: IComposeExtensionMessageHandler[];

  /**
   * To support SME, denotes what powers the compose extension
   */
  composeExtensionType?: "apiBased" | "botBased";
  /**
   * To support SME, it's the relative path to api spec file in the manifest
   */
  apiSpecificationFile?: string;

  /**
   * Authorization information.
   */
  authorization?: IAuthorization;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IComposeExtensionMessageHandler {
  /**
   * Type of the message handler
   */
  type: "link";
  value: {
    /**
     * A list of domains that the link message handler can register for, and when they are matched the app will be invoked
     */
    domains?: string[];

    [k: string]: unknown;
  };
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IMessagingExtensionCommand {
  /**
   * Id of the command.
   */
  id: string;
  /**
   * Type of the command
   */
  type?: "query" | "action";
  /**
   * Context where the command would apply
   */
  context?: ("compose" | "commandBox" | "message")[];
  /**
   * Title of the command.
   */
  title: string;
  /**
   * Description of the command.
   */
  description?: string;
  /**
   * A boolean value that indicates if the command should be run once initially with no parameter.
   */
  initialRun?: boolean;
  /**
   * A boolean value that indicates if it should fetch task module dynamically
   */
  fetchTask?: boolean;

  parameters?: IParameter[];

  taskInfo?: ITaskInfo;
  /**
   * To support SME
   */
  apiResponseRenderingTemplateFile?: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IAuthorization {
  /**
   * The type of authorization to use.
   */
  authType?: "none" | "apiSecretServiceAuth" | "microsoftEntra";
  /**
   * Capturing details needed to do microsoftEntra auth flow. It will be only present when auth type is microsoftEntra.
   */
  microsoftEntraConfiguration?: IMicrosoftEntraConfiguration;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IMicrosoftEntraConfiguration {
  /**
   * Boolean indicating whether single sign on is configured for the app.
   */
  supportsSingleSignOn?: boolean;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IParameter {
  /**
   * Name of the parameter.
   */
  name: string;
  /**
   * Type of the parameter
   */
  inputType?: "text" | "textarea" | "number" | "date" | "time" | "toggle" | "choiceset";
  /**
   * Indicates whether this parameter is required or not. By default, it is not.
   */
  isRequired?: boolean;
  /**
   * Title of the parameter.
   */
  title: string;
  /**
   * Description of the parameter.
   */
  description?: string;
  /**
   * Initial value for the parameter
   */
  value?: string;
  /**
   * The choice options for the parameter
   */
  choices?: {
    /**
     * Title of the choice
     */
    title: string;
    /**
     * Value of the choice
     */
    value: string;
  }[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface ITaskInfo {
  /**
   * Initial dialog title
   */
  title?: string;
  /**
   * Dialog width - either a number in pixels or default layout such as 'large', 'medium', or 'small'
   */
  width?: string;
  /**
   * Dialog height - either a number in pixels or default layout such as 'large', 'medium', or 'small'
   */
  height?: string;
  /**
   * Initial webview URL
   */
  url?: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IActivityType {
  type: string;
  description: string;
  templateText: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface ILocalizationInfo {
  /**
   * The language tag of the strings in this top level manifest file.
   */
  defaultLanguageTag: string;
  defaultLanguageFile?: string;
  additionalLanguages?: {
    languageTag: string;
    /**
     * A relative file path to a the .json file containing the translated strings.
     */
    file: string;
  }[];
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IAppPermission {
  name: string;
  type: "Application" | "Delegated";
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface ITogetherModeScene {
  id: string;
  name: string;
  file: string;
  preview: string;
  maxAudience: number;
  seatsReservedForOrganizersOrPresenters: number;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IPlugin {
  file: string;
  id: string;
}

/**
 * @deprecated Use auto-generated types from `./generated-types` instead.
 */
export interface IDeclarativeCopilot {
  file: string;
  id: string;
}

// export type AppManifest = Record<string, any>;

/**
 * @deprecated Use `TeamsManifest` or version-specific types like `TeamsManifestV1D21` from `./generated-types` instead.
 * This class-based manifest definition is outdated. The generated types provide accurate schemas for each manifest version.
 */
export class TeamsAppManifest {
  $schema?: string =
    "https://developer.microsoft.com/en-us/json-schemas/teams/v1.15/MicrosoftTeams.schema.json";
  /**
   * The version of the schema this manifest is using.
   */
  manifestVersion = "1.15";
  /**
   * The version of the app. Changes to your manifest should cause a version change. This version string must follow the semver standard (http://semver.org).
   */
  version = "1.0.0";
  /**
   * A unique identifier for this app. This id must be a GUID.
   */
  id = "{{AppId}}";
  /**
   * A unique identifier for this app in reverse domain notation. E.g: com.example.myapp
   */
  packageName?: string = "com.microsoft.teams.extension";

  localizationInfo?: ILocalizationInfo;

  developer: IDeveloper = {
    name: "Teams App, Inc.",
    mpnId: "",
    websiteUrl: "https://localhost:3000",
    privacyUrl: "https://localhost:3000/privacy",
    termsOfUseUrl: "https://localhost:3000/termsofuse",
  };

  name: IName = {
    short: "{{AppName}}",
    full: "This field is not used",
  };

  description: IName = {
    short: "Short description for {{AppName}}.",
    full: "Full description of {{AppName}}.",
  };

  icons: IIcons = { outline: "outline.png", color: "color.png" };
  /**
   * A color to use in conjunction with the icon. The value must be a valid HTML color code starting with '#', for example `#4464ee`.
   */
  accentColor = "#FFFFFF";
  /**
   * These are tabs users can optionally add to their channels and 1:1 or group chats and require extra configuration before they are added. Configurable tabs are not supported in the personal scope. Currently only one configurable tab per app is supported.
   */
  configurableTabs?: IConfigurableTab[];
  /**
   * A set of tabs that may be 'pinned' by default, without the user adding them manually. Static tabs declared in personal scope are always pinned to the app's personal experience. Static tabs do not currently support the 'teams' scope.
   */
  staticTabs?: IStaticTab[];
  /**
   * The set of bots for this app. Currently only one bot per app is supported.
   */
  bots?: IBot[];
  /**
   * The set of Office365 connectors for this app. Currently only one connector per app is supported.
   */
  connectors?: IConnector[];
  /**
   * Subscription offer associated with this app.
   */
  subscriptionOffer?: {
    /**
     * A unique identifier for the Commercial Marketplace Software as a Service Offer.
     */
    offerId: string;
  };
  /**
   * Specify the app's Graph connector configuration. If this is present then webApplicationInfo.id must also be specified.
   */
  graphConnector?: {
    notificationUrl: string;
  };
  /**
   * The set of compose extensions for this app. Currently only one compose extension per app is supported.
   */
  composeExtensions?: IComposeExtension[];
  /**
   * Specifies the permissions the app requests from users.
   */
  permissions?: ("identity" | "messageTeamMembers")[] = ["identity", "messageTeamMembers"];
  /**
   * Specify the native features on a user's device that your app may request access to.
   */
  devicePermissions?: ("geolocation" | "media" | "notifications" | "midi" | "openExternal")[];
  /**
   * A list of valid domains from which the tabs expect to load any content. Domain listings can include wildcards, for example `*.example.com`. If your tab configuration or content UI needs to navigate to any other domain besides the one use for tab configuration, that domain must be specified here.
   */
  validDomains?: string[] = ["localhost:3000"];
  /**
   * Specify your AAD App ID and Graph information to help users seamlessly sign into your AAD app.
   */
  webApplicationInfo?: IWebApplicationInfo;
  /**
   * A value indicating whether or not show loading indicator when app/tab is loading
   */
  showLoadingIndicator?: boolean;
  /**
   * A property in the app manifest that declares support for all channel features,
   * categorized by tiers.
   */
  supportsChannelFeatures?: "tier1";
  /**
   * A value indicating whether a personal app is rendered without a tab header-bar
   */
  isFullScreen?: boolean;

  activities?: {
    /**
     * Specify the types of activites that your app can post to a users activity feed
     */
    activityTypes?: IActivityType[];
  };
  /**
   * A list of tenant configured properties for an app
   */
  configurableProperties?: (
    | "name"
    | "shortDescription"
    | "longDescription"
    | "smallImageUrl"
    | "largeImageUrl"
    | "accentColor"
    | "developerUrl"
    | "privacyUrl"
    | "termsOfUseUrl"
  )[];
  /**
   * A value indicating whether an app is blocked by default until admin allows it
   */
  defaultBlockUntilAdminAction?: boolean;
  /**
   * The install scope defined for this app by default. This will be the option displayed on the button when a user tries to add the app
   */
  defaultInstallScope?: "personal" | "team" | "groupchat" | "groupChat" | "meetings";
  /**
   * When a group install scope is selected, this will define the default capability when the user installs the app
   */
  defaultGroupCapability?: {
    team: "tab" | "bot" | "connector";
    groupchat: "tab" | "bot" | "connector";
    meetings: "tab" | "bot" | "connector";
  };
  /**
   * Specify meeting extension definition
   */
  meetingExtensionDefinition?: {
    /**
     * Meeting supported scenes.
     */
    scenes?: ITogetherModeScene[];
    /**
     * Meeting supported A/V filters.
     */
    filters?: {
      id: string;
      name: string;
      thumbnail: string;
    }[];
    videoAppContentUrl?: string;
  };
  /**
   * The url to the page that provides additional app information for the admins
   */
  publisherDocsUrl?: string;
  /**
   * Specify and consolidates authorization related information for the App.
   */
  authorization?: {
    permissions?: {
      resourceSpecific?: IAppPermission[];
    };
  };

  copilotAgents?: {
    /**
     * Pointer to plugins.
     */
    plugins?: IPlugin[];
    /**
     * Pointer to declarative Copilot.
     */
    declarativeAgents?: IDeclarativeCopilot[];
  };

  agentSkills?: {
    folder: string;
  }[];
}
