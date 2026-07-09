// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import { setTools } from "../../../src/common/globalVars";
import { runWithRetry } from "../../../src/core/middleware/retry";
import { UserCancelError } from "../../../src/error/common";
import { MockTools } from "../utils";
import { assert } from "vitest";

describe("runWithRetry", () => {
  const tools = new MockTools();
  setTools(tools);
  it("no retry", async () => {
    let callNum = 0;
    await runWithRetry(
      async () => {
        ++callNum;
        return ok("");
      },
      (result, attempt) => false
    );
    assert.equal(callNum, 1);
  });

  it("no retry with error thrown", async () => {
    let callNum = 0;
    try {
      await runWithRetry(
        async () => {
          ++callNum;
          throw new UserCancelError();
        },
        (result, attempt) => false
      );
      assert.fail("should not reach here");
    } catch (e) {
      assert.isTrue(e instanceof UserCancelError);
    }
    assert.equal(callNum, 1);
  });

  it("retry once", async () => {
    let callNum = 0;
    await runWithRetry(
      async () => {
        ++callNum;
        return ok("");
      },
      (result, attempt) => {
        if (attempt === 1) return true;
        return false;
      }
    );
    assert.equal(callNum, 2);
  });

  it("retry until max", async () => {
    let callNum = 0;
    await runWithRetry(
      async () => {
        ++callNum;
        return ok("");
      },
      (result, attempt) => true
    );
    assert.equal(callNum, 3);
  });
});
