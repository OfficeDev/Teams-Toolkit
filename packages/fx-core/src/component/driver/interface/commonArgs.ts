// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AzureAccountProvider,
  IProgressHandler,
  LogProvider,
  M365TokenProvider,
  Platform,
  TelemetryReporter,
  UserInteraction,
} from "@microsoft/teamsfx-api";

export interface DriverContext {
  azureAccountProvider: AzureAccountProvider;
  m365TokenProvider: M365TokenProvider;
  signal?: AbortSignal;
  ui: UserInteraction | undefined;
  progressBar: IProgressHandler | undefined;
  logProvider: LogProvider;
  telemetryReporter?: TelemetryReporter;
  projectPath: string;
  platform: Platform;
}

export type AzureResourceInfo = {
  subscriptionId: string;
  resourceGroupName: string;
  instanceId: string;
};
