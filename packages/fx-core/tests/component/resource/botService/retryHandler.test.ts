// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { chai, vi } from "vitest";
import { Retry } from "../../../../src/component/resource/botService/constants";
import { RetryHandler } from "../../../../src/component/resource/botService/retryHandler";
import { Messages } from "./messages";

describe("Test retry handler", () => {
  const maxTry = 3;
  const originalBackoff = Retry.BACKOFF_TIME_MS;
  const originalRetryTimes = Retry.RETRY_TIMES;
  beforeEach(() => {
    (Retry as any).BACKOFF_TIME_MS = 0;
    (Retry as any).RETRY_TIMES = maxTry;
  });
  afterEach(() => {
    (Retry as any).BACKOFF_TIME_MS = originalBackoff;
    (Retry as any).RETRY_TIMES = originalRetryTimes;
    vi.restoreAllMocks();
  });
  it("fn resolve", async () => {
    const res = await RetryHandler.Retry(async () => true);
    chai.assert.isTrue(res);
  });

  it("fn reject and retry", async () => {
    const errorMessage = "fn rejects";
    let count = 0;
    try {
      await RetryHandler.Retry(async () => {
        ++count;
        throw new Error(errorMessage);
      });
    } catch (e) {
      chai.assert.equal(e.message, errorMessage);
      chai.assert.equal(count, maxTry);
      return;
    }
    chai.assert.fail(Messages.ShouldNotReachHere);
  });
});
