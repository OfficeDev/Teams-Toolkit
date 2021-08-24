// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { PluginContext, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Constants } from "./../constants";
import { GLOBAL_CONFIG, REMOTE_TEAMS_APP_ID } from "../../../solution/fx-solution/constants";

export enum TelemetryPropertyKey {
  component = "component",
  errorType = "error-type",
  errorCode = "error-code",
  errorMessage = "error-message",
  validationResult = "validation-result",
  updateExistingApp = "update",
  success = "success",
  appId = "appid",
}

enum TelemetryPropertyValue {
  UserError = "user",
  SystemError = "system",
  success = "yes",
  failure = "no",
}

export enum TelemetryEventName {
  scaffold = "scaffold",
  validateManifest = "validate-manifest",
  buildTeamsPackage = "build",
  publish = "publish",
  migrateV1Project = "migrate-v1-project",
  provision = "provision",
  checkPermission = "check-permission",
  grantPermission = "grant-permission",
}

export class TelemetryUtils {
  static ctx: PluginContext;

  public static init(ctx: PluginContext) {
    TelemetryUtils.ctx = ctx;
  }

  public static sendStartEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ) {
    if (!properties) {
      properties = {};
    }
    properties[TelemetryPropertyKey.component] = Constants.PLUGIN_NAME;
    const teamsAppId = this.ctx.configOfOtherPlugins
      .get(GLOBAL_CONFIG)
      ?.get(REMOTE_TEAMS_APP_ID) as string;
    if (teamsAppId) {
      properties[TelemetryPropertyKey.appId] = teamsAppId;
    }
    TelemetryUtils.ctx.telemetryReporter?.sendTelemetryErrorEvent(
      `${eventName}-start`,
      properties,
      measurements
    );
  }

  public static sendSuccessEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ) {
    if (!properties) {
      properties = {};
    }
    properties[TelemetryPropertyKey.component] = Constants.PLUGIN_NAME;
    properties[TelemetryPropertyKey.success] = TelemetryPropertyValue.success;
    const teamsAppId = this.ctx.configOfOtherPlugins
      .get(GLOBAL_CONFIG)
      ?.get(REMOTE_TEAMS_APP_ID) as string;
    if (teamsAppId) {
      properties[TelemetryPropertyKey.appId] = teamsAppId;
    }
    TelemetryUtils.ctx.telemetryReporter?.sendTelemetryEvent(eventName, properties, measurements);
  }

  public static sendErrorEvent(
    eventName: string,
    error: SystemError | UserError,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ) {
    if (!properties) {
      properties = {};
    }
    properties[TelemetryPropertyKey.component] = Constants.PLUGIN_NAME;
    if (error instanceof SystemError) {
      properties[TelemetryPropertyKey.errorType] = TelemetryPropertyValue.SystemError;
    } else if (error instanceof UserError) {
      properties[TelemetryPropertyKey.errorType] = TelemetryPropertyValue.UserError;
    }
    properties[TelemetryPropertyKey.errorCode] = `${error.source}.${error.name}`;
    properties[TelemetryPropertyKey.errorMessage] = error.message;
    properties[TelemetryPropertyKey.success] = TelemetryPropertyValue.failure;

    const teamsAppId = this.ctx.configOfOtherPlugins
      .get(GLOBAL_CONFIG)
      ?.get(REMOTE_TEAMS_APP_ID) as string;
    if (teamsAppId) {
      properties[TelemetryPropertyKey.appId] = teamsAppId;
    }
    TelemetryUtils.ctx.telemetryReporter?.sendTelemetryErrorEvent(
      eventName,
      properties,
      measurements
    );
  }
}
