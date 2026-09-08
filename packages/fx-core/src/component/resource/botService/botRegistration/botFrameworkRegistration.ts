// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Qianhao Dong <qidon@microsoft.com>
 */
import { FxError, LogProvider, M365TokenProvider, Result, err, ok } from "@microsoft/teamsfx-api";
import { teamsDevPortalClient } from "../../../../client/teamsDevPortalClientProvider";
import { AppStudioScopes } from "../../../../common/constants";
import { IBotRegistration } from "../appStudio/interfaces/IBotRegistration";
import { Utils } from "./utils";

export async function createOrUpdateBotRegistration(
  m365TokenProvider: M365TokenProvider,
  botRegistration: IBotRegistration,
  logger?: LogProvider
): Promise<Result<boolean, FxError>> {
  // 1. Get bot registration from remote.
  // 2. If Not Found, Then create a new bot registration.
  // 3. Else:
  //      3.1 Merge bot registration (remote + passed-in, respect passed-in).
  //      3.2 Update bot registration.
  const appStudioTokenRes = await m365TokenProvider.getAccessToken({
    scopes: AppStudioScopes(),
  });
  if (appStudioTokenRes.isErr()) {
    return err(appStudioTokenRes.error);
  }
  const appStudioToken = appStudioTokenRes.value;
  logger?.debug(`Input bot registration: ${JSON.stringify(botRegistration)}`);
  const remoteBotRegistration = await teamsDevPortalClient.getBotRegistration(
    appStudioToken,
    botRegistration.botId!
  );
  if (!remoteBotRegistration) {
    // Not Found case.
    logger?.verbose("Bot registration not found, create a new one.");
    await teamsDevPortalClient.createBotRegistration(appStudioToken, botRegistration, false);
  } else {
    // Update bot registration.
    logger?.verbose("Bot registration found, update it.");
    logger?.debug(`Existing bot registration: ${JSON.stringify(remoteBotRegistration)}`);
    const mergedBotRegistration = Utils.mergeIBotRegistration(
      botRegistration,
      remoteBotRegistration
    );
    logger?.debug(`Merged bot registration: ${JSON.stringify(mergedBotRegistration)}`);
    await teamsDevPortalClient.updateBotRegistration(appStudioToken, mergedBotRegistration);
  }
  return ok(remoteBotRegistration !== undefined);
}
