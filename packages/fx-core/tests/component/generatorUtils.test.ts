// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author huajiezhang@microsoft.com
 */

import fse from "fs-extra";
import os from "os";
import path from "path";
import { chai, vi } from "vitest";
import {
  HelperMethods,
  helperMethodsDeps,
} from "../../src/component/generator/officeAddin/helperMethods";

describe("Generator related Utils", function () {
  describe("fetchAndUnzip", async () => {
    const sandbox = vi;
    class ZipEntry {
      isDirectory: boolean;
      entryName: string;
      getData() {
        return this.isDirectory ? (undefined as any) : Buffer.from("content");
      }
      constructor(isDir: boolean, entryName: string) {
        this.isDirectory = isDir;
        this.entryName = entryName;
      }
    }

    class MockAdmZip {
      getEntries() {
        return [
          new ZipEntry(true, "dir/"),
          new ZipEntry(true, "dir/subdir/"),
          new ZipEntry(false, "dir/subdir/file"),
        ];
      }
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path", async () => {
      vi.spyOn(helperMethodsDeps, "fetchZipFromUrl").mockResolvedValue(new MockAdmZip() as any);
      const tempDir = await fse.mkdtemp(path.join(os.tmpdir(), "gen-utils-"));
      const res = await HelperMethods.fetchAndUnzip("test", "url", tempDir);
      chai.assert.isTrue(res.isOk());
      const writtenFilePath = path.join(tempDir, "subdir", "file");
      chai.assert.isTrue(await fse.pathExists(writtenFilePath));
      await fse.remove(tempDir);
    });

    it("fail case: fetch zip throw error", async () => {
      vi.spyOn(helperMethodsDeps, "fetchZipFromUrl").mockRejectedValue(new Error());
      const res = await HelperMethods.fetchAndUnzip("test", "url", "dest");
      chai.assert.isTrue(res.isErr());
    });

    it("fail case: fetch zip returns undefined", async () => {
      vi.spyOn(helperMethodsDeps, "fetchZipFromUrl").mockResolvedValue(undefined);
      const res = await HelperMethods.fetchAndUnzip("test", "url", "dest");
      chai.assert.isTrue(res.isErr());
    });

    it("fail case: ensureDir throws error", async () => {
      vi.spyOn(helperMethodsDeps, "fetchZipFromUrl").mockResolvedValue(new MockAdmZip() as any);
      vi.spyOn(fse, "ensureDir").mockRejectedValue(new Error());
      const res = await HelperMethods.fetchAndUnzip("test", "url", "dest");
      chai.assert.isTrue(res.isErr());
    });
  });
});
