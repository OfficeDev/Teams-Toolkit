// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import properLock from "proper-lockfile";
import { assert, vi } from "vitest";
import { globalStateGet, globalStateUpdate } from "../../src/common/globalState";

describe("Global State Get/Update", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns stored value if key has been updated before", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({ test: false });
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(properLock, "lock").mockResolvedValue({} as any);
    vi.spyOn(properLock, "unlock").mockResolvedValue();

    const data = await globalStateGet("test", true);
    assert.strictEqual(data, false);
  });

  it("returns default value if key hasn't been updated before", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({});
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(properLock, "lock").mockResolvedValue({} as any);
    vi.spyOn(properLock, "unlock").mockResolvedValue();

    const data = await globalStateGet("test", true);
    assert.strictEqual(data, true);
  });

  it("stores value if globalStateUpdate is called", async () => {
    vi.spyOn(fs, "readJSONSync").mockReturnValue({});
    vi.spyOn(fs, "readJSON").mockResolvedValue({});
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
    vi.spyOn(fs, "mkdirpSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    let data: any;
    vi.spyOn(fs, "writeJson").mockImplementation(async (_file: unknown, object: unknown) => {
      data = object;
    });
    vi.spyOn(fs, "writeJsonSync").mockImplementation((_file: unknown, object: unknown) => {
      data = object;
    });
    vi.spyOn(properLock, "lock").mockResolvedValue({} as any);
    vi.spyOn(properLock, "unlock").mockResolvedValue();

    await globalStateUpdate("test", true);
    assert.deepEqual(data, { test: true });
  });
});
