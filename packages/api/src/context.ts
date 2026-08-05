// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { UserInteraction } from "./qm";
import { LogProvider, TelemetryReporter, TokenProvider } from "./utils";
import { ExpServiceProvider } from "./utils/exp";

export interface Context {
  userInteraction: UserInteraction;
  logProvider: LogProvider;
  telemetryReporter?: TelemetryReporter;
  expServiceProvider?: ExpServiceProvider;
  tokenProvider?: TokenProvider;
  projectPath?: string;
  templateVariables?: { [key: string]: string };
}
