// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import type { APIPluginManifestLatest } from "@microsoft/app-manifest";

// Kept in lock-step with the latest generated API plugin manifest schema: the type
// annotation forces a compile error if the generated `*Latest` schema_version changes.
// Uses a type-only import so no runtime code (and its `fs` dependency) is pulled into
// the browser bundle.
const PLUGIN_MANIFEST_VERSION: APIPluginManifestLatest["schema_version"] = "v2.4";

export class ConstantString {
  static readonly CancelledMessage = "Operation is cancelled.";
  static readonly NoServerInformation =
    "No server information is found in the OpenAPI description document.";
  static readonly RemoteRefNotSupported = "Remote reference is not supported: %s.";
  static readonly MissingOperationId = "Missing operationIds: %s.";
  static readonly NoSupportedApi =
    "No supported API is found in the OpenAPI description document: only GET and POST methods are supported, additionally, there can be at most one required parameter, and no auth is allowed.";

  static readonly AdditionalPropertiesNotSupported =
    "'additionalProperties' is not supported, and will be ignored.";
  static readonly SchemaNotSupported =
    "'oneOf', 'allOf', 'anyOf', and 'not' schema are not supported: %s.";
  static readonly UnknownSchema = "Unknown schema: %s.";

  static readonly UrlProtocolNotSupported =
    "Server url is not correct: protocol %s is not supported, you should use https protocol instead.";
  static readonly RelativeServerUrlNotSupported =
    "Server url is not correct: relative server url is not supported.";
  static readonly ResolveServerUrlFailed =
    "Unable to resolve the server URL: please make sure that the environment variable %s is defined.";
  static readonly OperationOnlyContainsOptionalParam =
    "Operation %s contains multiple optional parameters. The first optional parameter is used for this command.";
  static readonly ConvertSwaggerToOpenAPI =
    "The Swagger 2.0 file has been converted to OpenAPI 3.0.";

  static readonly OpenAPI31ConvertTo30 = "OpenAPI 3.1 document has been converted to OpenAPI 3.0.";

  static readonly SwaggerNotSupported =
    "Swagger 2.0 is not supported. Please convert to OpenAPI 3.0 manually before proceeding.";

  static readonly SpecVersionNotSupported =
    "Unsupported OpenAPI version %s. Please use version 3.0.x.";

  static readonly MultipleAuthNotSupported =
    "Multiple authentication methods are unsupported. Ensure all selected APIs use identical authentication.";

  static readonly OperationIdContainsSpecialCharacters =
    "Operation id '%s' in OpenAPI description document contained special characters and was renamed to '%s'.";

  static readonly AuthTypeIsNotSupported =
    "Unsupported authorization type in API '%s'. No authorization will be used.";

  static readonly UnsupportedSchema = "Unsupported schema in %s %s: %s";
  static readonly FuncDescriptionTooLong =
    "The description of the function '%s' is too long. The current length is %s characters, while the maximum allowed length is %s characters.";

  static readonly GenerateJsonDataFailed = "Failed to generate JSON data for api: %s due to %s.";

  static readonly WrappedCardVersion = "1.0";
  static readonly WrappedCardSchema =
    "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.ResponseRenderingTemplate.schema.json";
  static readonly WrappedCardResponseLayout = "list";

  static readonly GetMethod = "get";
  static readonly PostMethod = "post";
  static readonly AdaptiveCardVersion = "1.5";
  static readonly AdaptiveCardSchema = "https://adaptivecards.io/schemas/adaptive-card.json";
  static readonly AdaptiveCardType = "AdaptiveCard";
  static readonly TextBlockType = "TextBlock";
  static readonly ImageType = "Image";
  static readonly ContainerType = "Container";
  static readonly RegistrationIdPostfix = "REGISTRATION_ID";
  static readonly ResponseCodeFor20X = [
    "200",
    "201",
    "202",
    "203",
    "204",
    "205",
    "206",
    "207",
    "208",
    "226",
    "2XX",
    "default",
  ];
  static readonly AllOperationMethods = [
    "get",
    "post",
    "put",
    "delete",
    "patch",
    "head",
    "options",
    "trace",
  ];

  // TODO: update after investigating the usage of these constants.
  static readonly WellknownResultNames = [
    "result",
    "data",
    "items",
    "root",
    "matches",
    "queries",
    "list",
    "output",
  ];
  static readonly WellknownTitleName = ["title", "name", "summary", "caption", "subject", "label"];
  static readonly WellknownSubtitleName = [
    "subtitle",
    "id",
    "uid",
    "description",
    "desc",
    "detail",
  ];
  static readonly WellknownImageName = [
    "image",
    "icon",
    "avatar",
    "picture",
    "photo",
    "logo",
    "pic",
    "thumbnail",
    "img",
  ];

  static readonly ShortDescriptionMaxLens = 80;
  static readonly FullDescriptionMaxLens = 4000;
  static readonly CommandDescriptionMaxLens = 128;
  static readonly ParameterDescriptionMaxLens = 128;
  static readonly ConversationStarterMaxLens = 50;
  static readonly CommandTitleMaxLens = 32;
  static readonly ParameterTitleMaxLens = 32;
  static readonly SMERequiredParamsMaxNum = 5;
  static readonly FunctionDescriptionMaxLens = 100;
  static readonly DefaultPluginId = "plugin_1";
  static readonly PluginManifestVersion = PLUGIN_MANIFEST_VERSION;
  static readonly PluginManifestSchema = `https://developer.microsoft.com/json-schemas/copilot/plugin/${PLUGIN_MANIFEST_VERSION}/schema.json`;
}
