// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WayToRegisterBot } from "./enums/wayToRegisterBot";
import { OptionItem, ConfigFolderName } from "@microsoft/teamsfx-api";
import { ProgrammingLanguage } from "./enums/programmingLanguage";
import path from "path";

export class RegularExprs {
  public static readonly CHARS_TO_BE_SKIPPED: RegExp = /[^a-zA-Z0-9]/g;
  public static readonly RESOURCE_SUFFIX: RegExp = /[0-9a-z]{1,16}/;
  // Refer to https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules
  // 1-40 Alphanumerics and hyphens.
  public static readonly APP_SERVICE_PLAN_NAME: RegExp = /^[a-zA-Z0-9\-]{1,40}$/;
  // 2-60 Contains alphanumerics and hyphens.Can't start or end with hyphen.
  public static readonly WEB_APP_SITE_NAME: RegExp = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,58}[a-zA-Z0-9]$/;
  // 2-64 Alphanumerics, underscores, periods, and hyphens. Start with alphanumeric.
  public static readonly BOT_CHANNEL_REG_NAME: RegExp = /^[a-zA-Z0-9][a-zA-Z0-9_\.\-]{1,63}$/;
}

export class WebAppConstants {
  public static readonly WEB_APP_SITE_DOMAIN: string = "azurewebsites.net";
  public static readonly APP_SERVICE_PLAN_DEFAULT_SKU_NAME = "F1";
}

export class AADRegistrationConstants {
  public static readonly GRAPH_REST_BASE_URL: string = "https://graph.microsoft.com/v1.0";
  public static readonly AZURE_AD_MULTIPLE_ORGS: string = "AzureADMultipleOrgs";
}

export class ScaffoldPlaceholders {
  public static readonly BOT_ID: string = "{BOT_ID}";
  public static readonly BOT_PASSWORD: string = "{BOT_PASSWORD}";
  public static readonly TEAMS_APP_ID: string = "{TEAMS_APP_ID}";
  public static readonly TEAMS_APP_SECRET: string = "{TEAMS_APP_SECRET}";
  public static readonly OAUTH_AUTHORITY: string = "{OAUTH_AUTHORITY}";
}

export class TemplateProjectsConstants {
  public static readonly GROUP_NAME_BOT: string = "bot";
  public static readonly GROUP_NAME_MSGEXT: string = "msgext";
  public static readonly GROUP_NAME_BOT_MSGEXT: string = "bot-msgext";
  public static readonly DEFAULT_SCENARIO_NAME: string = "default";
  public static readonly VERSION_RANGE: string = "0.0.*";
}

export class ProgressBarConstants {
  public static readonly SCAFFOLD_TITLE: string = "Scaffolding bot";
  public static readonly SCAFFOLD_STEP_START = "Scaffolding bot.";
  public static readonly SCAFFOLD_STEP_FETCH_ZIP = "Retrieving templates.";
  public static readonly SCAFFOLD_STEP_UNZIP = "Extracting templates target folder.";

  public static readonly SCAFFOLD_STEPS_NUM: number = 2;

  public static readonly PROVISION_TITLE: string = "Provisioning bot";
  public static readonly PROVISION_STEP_START = "Provisioning bot.";
  public static readonly PROVISION_STEP_BOT_REG = "Registering bot.";
  public static readonly PROVISION_STEP_WEB_APP = "Provisioning Azure Web App.";

  public static readonly PROVISION_STEPS_NUM: number = 2;

  public static readonly LOCAL_DEBUG_TITLE: string = "Local debugging";
  public static readonly LOCAL_DEBUG_STEP_START = "Provisioning bot for local debug.";
  public static readonly LOCAL_DEBUG_STEP_BOT_REG = "Registering bot.";

  public static readonly LOCAL_DEBUG_STEPS_NUM: number = 1;

  public static readonly DEPLOY_TITLE: string = "Deploying bot";
  public static readonly DEPLOY_STEP_START = "Deploying bot.";
  public static readonly DEPLOY_STEP_NPM_INSTALL = "Installing dependencies.";
  public static readonly DEPLOY_STEP_ZIP_FOLDER = "Creating application package.";
  public static readonly DEPLOY_STEP_ZIP_DEPLOY = "Uploading application package.";

  public static readonly DEPLOY_STEPS_NUM: number = 3;

  // for the use of migrating v1 project
  public static readonly MIGRATE_V1_PROJECT_TITLE = "Migrating Bot";
  public static readonly MIGRATE_V1_PROJECT_STEP_MIGRATE = "Migrating Bot project.";
  public static readonly MIGRATE_V1_PROJECT_STEPS_NUM: number = 1;
}

export class QuestionNames {
  public static readonly PROGRAMMING_LANGUAGE = "programming-language";
  public static readonly WAY_TO_REGISTER_BOT = "way-to-register-bot";
  public static readonly GET_BOT_ID = "bot-id";
  public static readonly GET_BOT_PASSWORD = "bot-password";
  public static readonly CAPABILITIES = "capabilities";
}

export class LifecycleFuncNames {
  public static readonly PRE_SCAFFOLD = "pre-scaffold";
  public static readonly SCAFFOLD = "scaffold";
  public static readonly POST_SCAFFOLD = "post-scaffold";

  public static readonly PRE_PROVISION = "pre-provision";
  public static readonly PROVISION = "provision";
  public static readonly POST_PROVISION = "post-provision";

  public static readonly PRE_DEPLOY = "pre-deploy";
  public static readonly DEPLOY = "deploy";
  public static readonly POST_DEPLOY = "post-deploy";

  public static readonly LOCAL_DEBUG = "local-debug";
  public static readonly POST_LOCAL_DEBUG = "post-local-debug";

  public static readonly GENERATE_ARM_TEMPLATES = "generate-arm-templates";

  // extra
  public static readonly PROVISION_WEB_APP = "provisionWebApp";
  public static readonly UPDATE_MESSAGE_ENDPOINT_AZURE = "updateMessageEndpointOnAzure";
  public static readonly UPDATE_MESSAGE_ENDPOINT_APPSTUDIO = "updateMessageEndpointOnAppStudio";
  public static readonly REUSE_EXISTING_BOT_REG = "reuseExistingBotRegistration";
  public static readonly CREATE_NEW_BOT_REG_AZURE = "createNewBotRegistrationOnAzure";
  public static readonly CREATE_NEW_BOT_REG_APPSTUDIO = "createNewBotRegistrationOnAppStudio";
  public static readonly CHECK_AAD_APP = "checkAADApp";

  // for the use of migrating v1 project
  public static readonly MIGRATE_V1_PROJECT = "migrateV1Project";
}

export class Retry {
  public static readonly RETRY_TIMES = 10;
  public static readonly BACKOFF_TIME_MS = 5000;
}

export class ErrorNames {
  // System Exceptions
  public static readonly PRECONDITION_ERROR = "PreconditionError";
  public static readonly CLIENT_CREATION_ERROR = "ClientCreationError";
  public static readonly PROVISION_ERROR = "ProvisionError";
  public static readonly CONFIG_UPDATING_ERROR = "ConfigUpdatingError";
  public static readonly CONFIG_VALIDATION_ERROR = "ConfigValidationError";
  public static readonly LIST_PUBLISHING_CREDENTIALS_ERROR = "ListPublishingCredentialsError";
  public static readonly ZIP_DEPLOY_ERROR = "ZipDeployError";
  public static readonly MSG_ENDPOINT_UPDATING_ERROR = "MessageEndpointUpdatingError";
  public static readonly DOWNLOAD_ERROR = "DownloadError";
  public static readonly MANIFEST_FORMAT_ERROR = "TemplateManifestFormatError";
  public static readonly TEMPLATE_PROJECT_NOT_FOUND_ERROR = "TemplateProjectNotFoundError";
  public static readonly LANGUAGE_STRATEGY_NOT_FOUND_ERROR = "LanguageStrategyNotFoundError";
  public static readonly COMMAND_EXECUTION_ERROR = "CommandExecutionError";
  public static readonly CALL_APPSTUDIO_API_ERROR = "CallAppStudioAPIError";

  // User Exceptions
  public static readonly USER_INPUTS_ERROR = "UserInputsError";
  public static readonly PACK_DIR_EXISTENCE_ERROR = "PackDirectoryExistenceError";
  public static readonly MISSING_SUBSCRIPTION_REGISTRATION_ERROR =
    "MissingSubscriptionRegistrationError";
  public static readonly FREE_SERVER_FARMS_QUOTA_ERROR = "FreeServerFarmsQuotaError";
  public static readonly INVALID_BOT_DATA_ERROR = "InvalidBotDataError";
}

export class Links {
  public static readonly ISSUE_LINK = "https://github.com/OfficeDev/TeamsFx/issues/new";
  public static readonly HELP_LINK = "https://aka.ms/teamsfx-bot-help";
  public static readonly UPDATE_MESSAGE_ENDPOINT = `${Links.HELP_LINK}#how-to-reuse-existing-bot-registration-in-toolkit-v2`;
}

export class Alias {
  public static readonly TEAMS_BOT_PLUGIN = "BT";
  public static readonly TEAMS_FX = "Teamsfx";
}

export class QuestionOptions {
  public static readonly WAY_TO_REGISTER_BOT_OPTIONS: OptionItem[] = [
    {
      id: WayToRegisterBot.CreateNew,
      label: "Create a new bot registration",
    },
    {
      id: WayToRegisterBot.ReuseExisting,
      label: "Use an existing bot registration",
    },
  ];

  public static readonly PROGRAMMING_LANGUAGE_OPTIONS: OptionItem[] = Object.values(
    ProgrammingLanguage
  ).map((value) => {
    return {
      id: value,
      label: value,
    };
  });
}

export class AuthEnvNames {
  public static readonly BOT_ID = "BOT_ID";
  public static readonly BOT_PASSWORD = "BOT_PASSWORD";
  public static readonly M365_CLIENT_ID = "M365_CLIENT_ID";
  public static readonly M365_CLIENT_SECRET = "M365_CLIENT_SECRET";
  public static readonly M365_TENANT_ID = "M365_TENANT_ID";
  public static readonly M365_AUTHORITY_HOST = "M365_AUTHORITY_HOST";
  public static readonly INITIATE_LOGIN_ENDPOINT = "INITIATE_LOGIN_ENDPOINT";
  public static readonly M365_APPLICATION_ID_URI = "M365_APPLICATION_ID_URI";
  public static readonly SQL_ENDPOINT = "SQL_ENDPOINT";
  public static readonly SQL_DATABASE_NAME = "SQL_DATABASE_NAME";
  public static readonly SQL_USER_NAME = "SQL_USER_NAME";
  public static readonly SQL_PASSWORD = "SQL_PASSWORD";
  public static readonly IDENTITY_ID = "IDENTITY_ID";
  public static readonly API_ENDPOINT = "API_ENDPOINT";
}

export class AuthValues {
  public static readonly M365_AUTHORITY_HOST = "https://login.microsoftonline.com";
}

export class DeployConfigs {
  public static readonly UN_PACK_DIRS = ["node_modules", "package-lock.json"];
  public static readonly DEPLOYMENT_FOLDER = ".deployment";
  public static readonly DEPLOYMENT_CONFIG_FILE = "bot.json";
  public static readonly WALK_SKIP_PATHS = [
    "node_modules",
    `.${ConfigFolderName}`,
    DeployConfigs.DEPLOYMENT_FOLDER,
    ".vscode",
  ];
}

export class ConfigKeys {
  public static readonly SITE_NAME = "siteName";
  public static readonly SITE_ENDPOINT = "siteEndpoint";
  public static readonly APP_SERVICE_PLAN = "appServicePlan";
  public static readonly BOT_CHANNEL_REG_NAME = "botChannelRegName";
}

export class FolderNames {
  public static readonly NODE_MODULES = "node_modules";
  public static readonly KEYTAR = "keytar";
}

export class TypeNames {
  public static readonly NUMBER = "number";
}

export class DownloadConstants {
  public static readonly DEFAULT_TIMEOUT_MS = 1000 * 20;
  public static readonly TEMPLATES_TIMEOUT_MS = 1000 * 20;
}

export class MaxLengths {
  // get/verified on azure portal.
  public static readonly BOT_CHANNEL_REG_NAME = 42;
  public static readonly WEB_APP_SITE_NAME = 60;
  public static readonly APP_SERVICE_PLAN_NAME = 40;
  public static readonly AAD_DISPLAY_NAME = 120;
}

export class ErrorMessagesForChecking {
  public static readonly FreeServerFarmsQuotaErrorFromAzure =
    "The maximum number of Free ServerFarms allowed in a Subscription is 10";
}

export class IdentityConstants {
  public static readonly IDENTITY_TYPE_USER_ASSIGNED = "UserAssigned";
}

export class TelemetryKeys {
  public static readonly Component = "component";
  public static readonly Success = "success";
  public static readonly ErrorType = "error-type";
  public static readonly ErrorMessage = "error-message";
  public static readonly ErrorCode = "error-code";
  public static readonly AppId = "appid";
}

export class TelemetryValues {
  public static readonly Success = "yes";
  public static readonly Fail = "no";
  public static readonly UserError = "user";
  public static readonly SystemError = "system";
}

export class AzureConstants {
  public static readonly requiredResourceProviders = ["Microsoft.Web", "Microsoft.BotService"];
}

export class PathInfo {
  public static readonly BicepTemplateRelativeDir = path.join(
    "plugins",
    "resource",
    "bot",
    "bicep"
  );
  public static readonly provisionModuleTemplateFileName = "botProvision.template.bicep";
  public static readonly configurationModuleTemplateFileName = "botConfiguration.template.bicep";
}

export class BotArmOutput {
  static readonly WebAppSKU = "bot_webAppSKU";
  static readonly ServiceSKU = "bot_serviceSKU";
  static readonly WebAppName = "bot_webAppName";
  static readonly Domain = "bot_domain";
  static readonly AppServicePlanName = "bot_appServicePlanName";
  static readonly BotServiceName = "bot_serviceName";
  static readonly WebAppEndpoint = "bot_webAppEndpoint";
  static readonly InitiateLoginEndpoint = "bot_initiateLoginEndpoint";
}
