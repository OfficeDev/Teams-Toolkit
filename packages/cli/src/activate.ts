// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, Result, Tools, err, ok } from "@microsoft/teamsfx-api";
import { FxCore, UnhandledError } from "@microsoft/teamsfx-core";
import AzureAccountManager from "./commonlib/azureLogin";
import { logger } from "./commonlib/logger";
import M365Login from "./commonlib/M365TokenProviderWrapper";
import { cliSource } from "./constants";
import { initializeExpService } from "./exp";
import CliTelemetry from "./telemetry/cliTelemetry";
import CLIUserInteraction from "./userInteraction";

export default async function activate(
  rootPath?: string,
  shouldIgnoreSubscriptionNotFoundError?: boolean
): Promise<Result<FxCore, FxError>> {
  if (rootPath) {
    try {
      AzureAccountManager.setRootPath(rootPath); //legacy code
      const subscriptionInfo = await AzureAccountManager.readSubscription();
      if (subscriptionInfo) {
        await AzureAccountManager.setSubscription(subscriptionInfo.subscriptionId);
      }
      CliTelemetry.reporter?.withRootFolder(rootPath);
    } catch (e) {
      if (!shouldIgnoreSubscriptionNotFoundError) {
        return err(new UnhandledError(e as Error, cliSource));
      }
    }
  }
  const core = getFxCore();
  return ok(core);
}
let fxCore: FxCore | undefined;
export function resetFxCore(): void {
  fxCore = undefined;
}
export function getFxCore(): FxCore {
  if (fxCore) return fxCore;
  const tools: Tools = {
    logProvider: logger,
    tokenProvider: {
      azureAccountProvider: AzureAccountManager,
      m365TokenProvider: M365Login,
    },
    telemetryReporter: CliTelemetry.reporter,
    ui: CLIUserInteraction,
    expServiceProvider: initializeExpService(),
  };
  fxCore = new FxCore(tools);
  return fxCore;
}
