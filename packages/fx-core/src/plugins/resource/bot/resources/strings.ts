// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
export class CommonStrings {
  public static readonly BOT_WORKING_DIR_NAME = "bot";
  public static readonly DEFAULT_FILE_ENCODING = "utf-8";

  // for the use of migrating v1 project
  public static readonly README_FILE_NAME = "README.md";
  public static readonly NODE_PACKAGE_FOLDER_NAME = "node_modules";

  public static readonly APP_SERVICE_PLAN = "App Service plan";
  public static readonly AZURE_WEB_APP = "Azure Web App";
  public static readonly BOT_CHANNEL_REGISTRATION = "Azure Bot Service channel registration";
  public static readonly MS_TEAMS_CHANNEL = "Teams channel";
  public static readonly AAD_APP = "AAD app";
  public static readonly AAD_CLIENT_SECRET = "AAD client secret";
  public static readonly APPSTUDIO_BOT_REGISTRATION = "App Studio bot registration";
  public static readonly APPSTUDIO_MSG_ENDPOINT = "App Studio message endpoint";
  public static readonly CONFIG_ITEM = "config item";
  public static readonly SHORT_APP_NAME = "short app name";
  public static readonly AUTH_REDIRECT_URI_SUFFIX = "/public";
  public static readonly AUTH_LOGIN_URI_SUFFIX = "/auth-start.html";
  public static readonly HTTPS_PREFIX = "https://";
  public static readonly MESSAGE_ENDPOINT_SUFFIX = "/api/messages";
}

export class PluginAAD {
  public static readonly PLUGIN_NAME = "fx-resource-aad-app-for-teams";
  public static readonly CLIENT_ID = "clientId";
  public static readonly CLIENT_SECRET = "clientSecret";
  public static readonly APPLICATION_ID_URIS = "applicationIdUris";
}

export class PluginLocalDebug {
  public static readonly PLUGIN_NAME = "fx-resource-local-debug";
  public static readonly LOCAL_BOT_ENDPOINT = "localBotEndpoint";
  public static readonly LOCAL_DEBUG_SUFFIX = "-local-debug";
}

export class PluginSolution {
  public static readonly PLUGIN_NAME = "solution";
  public static readonly RESOURCE_GROUP_NAME = "resourceGroupName";
  public static readonly LOCATION = "location";
  public static readonly M365_TENANT_ID = "teamsAppTenantId";
  public static readonly RESOURCE_NAME_SUFFIX = "resourceNameSuffix";
  public static readonly REMOTE_TEAMS_APPID = "remoteTeamsAppId";
}

export class PluginSql {
  public static readonly PLUGIN_NAME = "fx-resource-azure-sql";
  public static readonly SQL_ENDPOINT = "sqlEndpoint";
  public static readonly SQL_DATABASE_NAME = "databaseName";
  public static readonly SQL_USERNAME = "sqlUsername";
  public static readonly SQL_PASSWORD = "sqlPassword";
}

export class PluginIdentity {
  public static readonly PLUGIN_NAME = "fx-resource-identity";
  public static readonly IDENTITY_ID = "identityId";
  public static readonly IDENTITY_NAME = "identityName";
}

export class PluginFunction {
  public static readonly PLUGIN_NAME = "fx-resource-function";
  public static readonly ENDPOINT = "functionEndpoint";
}

export class PluginBot {
  public static readonly PLUGIN_NAME = "fx-resource-bot";
  public static readonly BOT_ID = "botId";
  public static readonly BOT_PASSWORD = "botPassword";
  public static readonly OBJECT_ID = "objectId";
  public static readonly LOCAL_BOT_ID = "localBotId";
  public static readonly LOCAL_BOT_PASSWORD = "localBotPassword";
  public static readonly LOCAL_OBJECT_ID = "localObjectId";
  public static readonly PROGRAMMING_LANGUAGE = "programmingLanguage";
  public static readonly WAY_TO_REGISTER_BOT = "wayToRegisterBot";
  public static readonly SCAFFOLDED = "scaffolded";
  public static readonly APP_SERVICE_PLAN = "appServicePlan";
  public static readonly SITE_NAME = "siteName";
  public static readonly SKU_NAME = "skuName";
  public static readonly SITE_ENDPOINT = "siteEndpoint";
  public static readonly VALID_DOMAIN = "validDomain";
  public static readonly PROVISIONED = "provisioned";
  public static readonly WEB_APPLICATION_INFO_ID = "webApplicationInfo.id";
  public static readonly WEB_APPLICATION_INFO_RESOURCE = "webApplicationInfo.resource";
  public static readonly BOTS_SECTION = "bots";
  public static readonly BOT_CHANNEL_REGISTRATION = "botChannelReg";
  public static readonly UNPACK_FLAG = "unPackFlag";
  public static readonly MESSAGE_EXTENSION_SECTION = "composeExtensions";
  public static readonly LOCAL_REDIRECT_URI = "local_redirectUri";
}

export class TelemetryStrings {
  public static readonly COMPONENT_NAME = "fx-resource-bot";
}

export class ConfigNames {
  public static readonly PROGRAMMING_LANGUAGE = "programming language";
  public static readonly GRAPH_TOKEN = "graph token";
  public static readonly SUBSCRIPTION_ID = "subscription id";
  public static readonly SERVICE_CLIENT_CREDENTIALS = "service client credentials";
  public static readonly LOCATION = "location";
  public static readonly SKU_NAME = "sku name";
  public static readonly RESOURCE_GROUP = "resource group";
  public static readonly LOCAL_ENDPOINT = "local endpoint";

  public static readonly AUTH_CLIENT_ID = "auth client id";
  public static readonly AUTH_CLIENT_SECRET = "auth client secret";
  public static readonly AUTH_TENANT = "auth tenant";
  public static readonly AUTH_APPLICATION_ID_URIS = "auth application id uris";
  public static readonly SITE_ENDPOINT = "site endpoint";

  public static readonly BOT_ID = "bot id";
  public static readonly BOT_PASSWORD = "bot password";
  public static readonly LOCAL_BOT_ID = "local bot id";
  public static readonly LOCAL_BOT_PASSWORD = "local bot password";

  public static readonly APPSTUDIO_TOKEN = "app studio token";

  public static readonly AZURE_WEB_APP_AUTH_CONFIGS = "azure web app's auth configs";
  public static readonly MESSAGE_ENDPOINT = "message endpoint";
}

export class Commands {
  public static readonly NPM_INSTALL = "npm install";
  public static readonly NPM_BUILD = "npm run build";
}

export class ClientNames {
  public static readonly WEB_SITE_MGMT_CLIENT = "webSiteMgmtClient";
  public static readonly BOT_SERVICE_CLIENT = "botServiceClient";
}
