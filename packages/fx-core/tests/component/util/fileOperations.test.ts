// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import fs from "fs-extra";
import ignore from "ignore";
import * as os from "os";
import * as path from "path";
import * as uuid from "uuid";
import { chai, vi } from "vitest";
import { CacheFileInUse, DeployEmptyFolderError, ZipFileError } from "../../../src";
import { fileOperationDeps, zipFolderAsync } from "../../../src/component/utils/fileOperation";

describe("Test", () => {
  const sandbox = vi;
  const tmp = `${os.tmpdir()}/${uuid.v4()}`;
  const tmpFile = `${tmp}/test.txt`;

  class EError extends Error {
    code: string;
    constructor(error: Error) {
      super(error.message);
      this.code = error.message;
    }
  }

  before(async () => {
    await fs.mkdirs(tmp);
    await fs.writeFile(tmpFile, "test");
  });

  after(async () => {
    await fs.remove(tmpFile);
    await fs.rmdir(tmp);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw error when EBUSY", async () => {
    const err = new EError(new Error("EBUSY"));
    vi.spyOn(fileOperationDeps, "existsSync").mockReturnValue(true as any);
    vi.spyOn(fileOperationDeps, "remove").mockRejectedValue(err);
    await zipFolderAsync(tmp, tmpFile, ignore()).catch((e) => {
      chai.expect(e instanceof CacheFileInUse).to.equal(true);
    });
  });

  it("should throw error when Other error", async () => {
    vi.spyOn(fileOperationDeps, "existsSync").mockReturnValue(true as any);
    vi.spyOn(fileOperationDeps, "remove").mockRejectedValue(new Error("Other"));
    await zipFolderAsync(tmp, tmpFile, ignore()).catch((e) => {
      chai.expect(e.message).to.equal("Other");
    });
  });

  it("should throw error when folder is empty", async () => {
    const empty = `${os.tmpdir()}/empty`;
    await fs.mkdirs(empty);
    await zipFolderAsync(empty, `./${uuid.v4()}`, ignore()).catch((e) => {
      chai.expect(e instanceof DeployEmptyFolderError).to.equal(true);
    });
    await fs.rmdir(empty);
  });

  it("write to zip throws ERR_OUT_OF_RANGE", async () => {
    const err = new EError(new Error("ERR_OUT_OF_RANGE"));
    vi.spyOn(fileOperationDeps, "writeZip").mockRejectedValue(err);
    await zipFolderAsync(tmp, path.join(tmp, "tmp.zip"), ignore()).catch((e: Error) => {
      chai.expect(e instanceof ZipFileError).to.equal(true);
    });
  });

  it("write zip callback error (non-ERR_OUT_OF_RANGE) should not throw ZipFileError", async () => {
    vi.spyOn(fileOperationDeps, "writeZip").mockRejectedValue(new Error("zip-failed"));
    const readStreamStub = vi
      .spyOn(fileOperationDeps, "createReadStream")
      .mockReturnValue({} as any);

    const res = await zipFolderAsync(tmp, path.join(tmp, "tmp.zip"), ignore());
    chai.expect(res).to.equal(readStreamStub.mock.results[0].value);
  });
});
