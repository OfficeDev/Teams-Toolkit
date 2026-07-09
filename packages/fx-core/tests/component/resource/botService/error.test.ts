// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author zhijie <zhihuan@microsoft.com>
 */
import { getDefaultString } from "../../../../src/common/localizeUtils";
import { ErrorNames } from "../../../../src/component/resource/botService/constants";
import {
  BotFrameworkForbiddenResultError,
  BotFrameworkNotAllowedToAcquireTokenError,
  ConfigUpdatingError,
} from "../../../../src/component/resource/botService/errors";
import { Messages } from "../../../../src/component/resource/botService/messages";
import { assert } from "vitest";

describe("wrap error", () => {
  it("Increase UT - BotFrameworkNotAllowedToAcquireTokenError", () => {
    const e = new BotFrameworkNotAllowedToAcquireTokenError();
    assert.isTrue(e.name === ErrorNames.ACQUIRE_BOT_FRAMEWORK_TOKEN_ERROR);
  });

  it("Increase UT - BotFrameworkForbiddenResultError", () => {
    const axiosError = new Error("Forbidden");
    const e = new BotFrameworkForbiddenResultError(axiosError);
    assert.isTrue(e.name === ErrorNames.FORBIDDEN_RESULT_BOT_FRAMEWORK_ERROR);
  });

  it("Increase UT - ConfigUpdatingError", () => {
    const e = new ConfigUpdatingError("anything");
    assert.isTrue(e.name === ErrorNames.CONFIG_UPDATING_ERROR);
  });

  it("Increase UT - genMessage & genDisplayMessage", () => {
    const e = new BotFrameworkNotAllowedToAcquireTokenError();
    assert.isTrue(e.name === ErrorNames.ACQUIRE_BOT_FRAMEWORK_TOKEN_ERROR);

    let expectedMsg = `${Messages.NotAllowedToAcquireBotFrameworkToken()[0]} `;
    expectedMsg += getDefaultString(
      "plugins.bot.ErrorSuggestions",
      [Messages.CheckOutputLogAndTryToFix].join(" ")
    );
    assert.isTrue(e.genMessage() === expectedMsg);

    let expectedDisplayMsg = `${Messages.NotAllowedToAcquireBotFrameworkToken()[1]} `;
    expectedDisplayMsg += getDefaultString(
      "plugins.bot.ErrorSuggestions",
      [Messages.CheckOutputLogAndTryToFix].join(" ")
    );
    assert.isTrue(e.genDisplayMessage() === expectedDisplayMsg);
  });
});
