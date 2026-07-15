// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import { err, ok } from "neverthrow";
import { assert } from "vitest";
import { TempDirectoryPort, withTempDirectory } from "../../../src/v4/runtime/withTempDirectory";

function phaseError(phase: string, error: unknown): SystemError {
  return new SystemError({
    source: "Test",
    name: `TempDirectory${phase}`,
    message: error instanceof Error ? error.message : String(error),
  });
}

describe("withTempDirectory", () => {
  it("contains allocation failures in Result", async () => {
    const port: TempDirectoryPort = {
      create: async () => {
        throw new Error("allocation failed");
      },
      remove: async () => undefined,
    };

    const result = await withTempDirectory("prefix-", phaseError, async () => ok("unused"), port);

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TempDirectoryallocate");
  });

  it("preserves the primary operation error when cleanup also fails", async () => {
    const primary = new SystemError({ source: "Test", name: "Primary", message: "primary" });
    const port: TempDirectoryPort = {
      create: async () => "temp-root",
      remove: async () => {
        throw new Error("cleanup failed");
      },
    };

    const result = await withTempDirectory("prefix-", phaseError, async () => err(primary), port);

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr(), primary);
  });

  it("returns cleanup failures when the operation succeeded", async () => {
    const port: TempDirectoryPort = {
      create: async () => "temp-root",
      remove: async () => {
        throw new Error("cleanup failed");
      },
    };

    const result = await withTempDirectory("prefix-", phaseError, async () => ok("done"), port);

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TempDirectorycleanup");
  });
});
