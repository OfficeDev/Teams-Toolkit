// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  SystemError,
  SystemErrorOptions,
  UserError,
  UserErrorOptions,
} from "@microsoft/teamsfx-api";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import { ErrorCategory } from "./types";
import { Constants } from "../component/driver/teamsApp/constants";
import { matchDnsError } from "./common";

export class DeveloperPortalAPIFailedSystemError extends SystemError {
  constructor(
    e: any,
    correlationId: string,
    apiName: string,
    extraData: string,
    displayMessage?: string
  ) {
    if (!displayMessage) {
      displayMessage = matchDnsError(e.message);
    }
    const errorOptions: SystemErrorOptions = {
      source: Constants.PLUGIN_NAME,
      error: e,
      message: getDefaultString(
        // github issue workflow uses this template for matching. Please send a heads-up to the owner of workflows if you want to change it.
        "error.appstudio.apiFailed.telemetry",
        e.name,
        e.message,
        apiName,
        correlationId,
        extraData
      ),
      displayMessage: displayMessage || getLocalizedString("error.appstudio.apiFailed"),
      categories: [ErrorCategory.Unhandled, apiName],
    };
    super(errorOptions);
  }
}

export class DeveloperPortalAPIFailedUserError extends UserError {
  constructor(
    e: any,
    correlationId: string,
    apiName: string,
    extraData: string,
    displayMessage?: string,
    helpLink?: string
  ) {
    const errorOptions: UserErrorOptions = {
      source: Constants.PLUGIN_NAME,
      error: e,
      message: getDefaultString(
        // github issue workflow uses this template for matching. Please send a heads-up to the owner of workflows if you want to change it.
        "error.appstudio.apiFailed.telemetry",
        e.name,
        e.message,
        apiName,
        correlationId,
        extraData
      ),
      displayMessage: displayMessage || getLocalizedString("error.appstudio.apiFailed"),
      categories: [ErrorCategory.Unhandled, apiName],
      helpLink: helpLink,
    };
    super(errorOptions);
  }
}

export class CheckSideloadingPermissionFailedError extends SystemError {
  constructor(e: any, correlationId: string, apiName: string, extraData: string) {
    const errorOptions: SystemErrorOptions = {
      source: "M365Account",
      error: e,
      message: getDefaultString(
        "error.appstudio.apiFailed.telemetry",
        e.name,
        e.message,
        apiName,
        correlationId,
        extraData
      ),
      categories: [ErrorCategory.External],
    };
    super(errorOptions);
  }
}

export class InvalidFileOutsideOfTheDirectotryError extends UserError {
  constructor(fileReference: string, resolvedPath: string, manifestDirectory: string) {
    const errorOptions: UserErrorOptions = {
      source: Constants.PLUGIN_NAME,
      message: getDefaultString("error.teamsApp.createAppPackage.invalidFile"),
      displayMessage: getLocalizedString(
        "error.teamsApp.createAppPackage.invalidFile.local",
        fileReference,
        resolvedPath,
        manifestDirectory
      ),
      categories: [ErrorCategory.External],
    };
    super(errorOptions);
  }
}

export class AppPackageSizeExceededError extends UserError {
  constructor(actualSizeInBytes: number, maxSizeInBytes: number) {
    const actualMB = (actualSizeInBytes / (1024 * 1024)).toFixed(2);
    const maxMB = (maxSizeInBytes / (1024 * 1024)).toFixed(2);
    const errorOptions: UserErrorOptions = {
      source: Constants.PLUGIN_NAME,
      message: getDefaultString(
        "error.teamsApp.createAppPackage.packageSizeExceeded",
        actualMB,
        maxMB
      ),
      displayMessage: getLocalizedString(
        "error.teamsApp.createAppPackage.packageSizeExceeded",
        actualMB,
        maxMB
      ),
      categories: [ErrorCategory.External],
    };
    super(errorOptions);
  }
}

export class AppPackageFileSystemError extends SystemError {
  constructor(error: unknown, filePath: string) {
    const innerError = error instanceof Error ? error : new Error();
    const errorCode =
      "code" in innerError && typeof innerError.code === "string" ? innerError.code : "UNKNOWN";
    const sanitizedInnerError = Object.assign(new Error(errorCode), { code: errorCode });
    const errorOptions: SystemErrorOptions = {
      source: Constants.PLUGIN_NAME,
      error: sanitizedInnerError,
      message: getDefaultString(
        "error.teamsApp.createAppPackage.fileSystemError.telemetry",
        errorCode
      ),
      displayMessage: getLocalizedString(
        "error.teamsApp.createAppPackage.fileSystemError.display",
        filePath,
        errorCode
      ),
      categories: [ErrorCategory.Internal],
    };
    super(errorOptions);
  }
}

export class AppIdNotExist extends UserError {
  constructor(appId: string, source?: string) {
    super({
      source: source || "core",
      name: AppIdNotExist.name,
      message: getDefaultString("error.core.appIdNotExist", appId),
      displayMessage: getLocalizedString("error.core.appIdNotExist", appId),
    });
  }
}
