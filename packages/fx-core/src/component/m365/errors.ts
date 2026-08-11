// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";

import { getDefaultString, getLocalizedString } from "../../common/localizeUtils";
import { M365HelpLink } from "./constants";

export class NotExtendedToM365Error extends UserError {
  constructor(source: string) {
    super({
      source: source,
      name: "NotExtendedToM365Error",
      message: getDefaultString("error.m365.NotExtendedToM365Error"),
      displayMessage: getLocalizedString("error.m365.NotExtendedToM365Error"),
      helpLink: M365HelpLink,
    });
  }
}

export interface PackageValidationFailureReason {
  errorCode: string;
  errorDetail: string;
}

export class PackageValidationFailedError extends UserError {
  constructor(source: string, failureReasons: PackageValidationFailureReason[]) {
    const reasons = failureReasons
      .map(({ errorCode, errorDetail }) => `${errorCode}: ${errorDetail}`)
      .join("\n");
    super({
      source,
      name: "PackageValidationFailed",
      message: getDefaultString("error.m365.packageService.validationFailed", reasons),
      displayMessage: getLocalizedString("error.m365.packageService.validationFailed", reasons),
      helpLink: M365HelpLink,
    });
  }
}
