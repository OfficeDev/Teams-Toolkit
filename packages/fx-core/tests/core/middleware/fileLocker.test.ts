import * as fs from "fs-extra";
import path from "path";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("proper-lockfile");
vi.mock("../../../src/common/utils");

import * as properLock from "proper-lockfile";
import * as commonUtils from "../../../src/common/utils";
import { withFileLock } from "../../../src/core/middleware/fileLocker";

describe("withFileLock", () => {
  const testFilePath = path.join(__dirname, "test.lock");

  beforeEach(async () => {
    await fs.ensureFile(testFilePath);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(testFilePath);
    vi.restoreAllMocks();
  });

  it("should execute the callback when lock is acquired", async () => {
    const releaseStub = vi.fn().mockResolvedValue(undefined);
    (properLock.lock as any).mockResolvedValue(releaseStub);
    const callback = vi.fn().mockResolvedValue("success");

    const result = await withFileLock(testFilePath, callback);

    expect(callback).toHaveBeenCalled();
    assert.strictEqual(result, "success");
  });

  it("should throw an error if the file does not exist", async () => {
    await fs.remove(testFilePath);

    try {
      await withFileLock(testFilePath, async () => "should not reach here");
      assert.fail("Expected error was not thrown");
    } catch (error) {
      assert.strictEqual((error as Error).message, `File not found: ${testFilePath}`);
    }

    await fs.ensureFile(testFilePath);
  });

  it("should retry acquiring the lock if it is already locked", async () => {
    const callback = vi.fn().mockResolvedValue("success");
    const releaseStub = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;

    (properLock.lock as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw { code: "ELOCKED" };
      }
      return releaseStub;
    });
    (commonUtils.waitSeconds as any).mockResolvedValue(undefined);

    const result = await withFileLock(testFilePath, callback);

    expect(callback).toHaveBeenCalled();
    assert.strictEqual(result, "success");
    assert.strictEqual(callCount, 2);
  });

  it("should throw an error if lock cannot be acquired after retries", async () => {
    (properLock.lock as any).mockRejectedValue({ code: "ELOCKED" });
    (commonUtils.waitSeconds as any).mockResolvedValue(undefined);

    try {
      await withFileLock(testFilePath, async () => "should not reach here");
      assert.fail("Expected error was not thrown");
    } catch (error) {
      assert.strictEqual(
        (error as Error).message,
        `Failed to acquire lock on ${testFilePath} after 10 seconds.`
      );
    }
  });

  it("should throw an error if lock fails for a reason other than ELOCKED", async () => {
    (properLock.lock as any).mockRejectedValue(new Error("Some other error"));

    try {
      await withFileLock(testFilePath, async () => "should not reach here");
      assert.fail("Expected error was not thrown");
    } catch (error) {
      assert.strictEqual((error as Error).message, "Some other error");
    }
  });

  it("should release the lock after the callback is executed", async () => {
    const releaseStub = vi.fn().mockResolvedValue(undefined);
    (properLock.lock as any).mockResolvedValue(releaseStub);

    const callback = vi.fn().mockResolvedValue("success");

    const result = await withFileLock(testFilePath, callback);

    expect(callback).toHaveBeenCalled();
    assert.strictEqual(result, "success");
    expect(releaseStub).toHaveBeenCalled();
  });
});
