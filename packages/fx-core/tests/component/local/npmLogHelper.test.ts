// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as path from "path";
import { cpUtils } from "../../../src/component/deps-checker/util/cpUtils";
import { getNpmInstallLogInfo } from "../../../src/component/local/npmLogHelper";
import { chai, vi } from "vitest";

describe("npmLogHelper", () => {
  describe("getNpmInstallLogInfo()", () => {
    const npmCachePath = path.resolve(__dirname, "data/npm-cache");
    const npmLogPath = path.resolve(npmCachePath, "_logs");
    const npmErrorLogRaw =
      "\
1 verbose cwd cwd-placeholder\n\
2 verbose node vnode-version-placeholder\n\
3 verbose npm  vnpm-version-placeholder\n\
4 error error1\n\
5 error error2\n\
6 error error3\n\
7 verbose exit [ 1234, true ]\n\
    ";

    beforeEach(() => {
      vi.restoreAllMocks();
      fs.ensureDirSync(npmLogPath);
      fs.emptyDirSync(npmLogPath);
    });

    it("happy path", async () => {
      await fs.writeFile(
        path.join(npmLogPath, "2021-12-02T20_21_12_020Z-debug.log"),
        npmErrorLogRaw
      );
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue(npmCachePath);

      const logInfo = await getNpmInstallLogInfo();

      chai.assert.isDefined(logInfo);
      chai.assert.equal(logInfo!.timestamp.getUTCFullYear(), 2021);
      chai.assert.equal(logInfo!.cwd, "cwd-placeholder");
      chai.assert.equal(logInfo!.nodeVersion, "vnode-version-placeholder");
      chai.assert.equal(logInfo!.npmVersion, "vnpm-version-placeholder");
      chai.assert.equal(logInfo!.exitCode, 1234);
      chai.assert.deepEqual(logInfo!.errorMessage, [
        "4 error error1",
        "5 error error2",
        "6 error error3",
      ]);
    });

    it("no log file", async () => {
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue(npmCachePath);

      const logInfo = await getNpmInstallLogInfo();

      chai.assert.isUndefined(logInfo);
    });

    it("invalid log file name", async () => {
      await fs.writeFile(path.join(npmLogPath, "invalid.invalid"), npmErrorLogRaw);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue(npmCachePath);

      const logInfo = await getNpmInstallLogInfo();

      chai.assert.isDefined(logInfo);
      chai.assert.isNaN(logInfo!.timestamp.getTime());
      chai.assert.equal(logInfo!.cwd, "cwd-placeholder");
      chai.assert.equal(logInfo!.nodeVersion, "vnode-version-placeholder");
      chai.assert.equal(logInfo!.npmVersion, "vnpm-version-placeholder");
      chai.assert.equal(logInfo!.exitCode, 1234);
      chai.assert.deepEqual(logInfo!.errorMessage, [
        "4 error error1",
        "5 error error2",
        "6 error error3",
      ]);
    });

    it("get latest log file", async () => {
      await fs.writeFile(
        path.join(npmLogPath, "2021-12-02T20_21_12_020Z-debug.log"),
        npmErrorLogRaw
      );
      await fs.writeFile(path.join(npmLogPath, "2099-12-31T23_59_59_000Z-debug.log"), "no error");
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue(npmCachePath);

      const logInfo = await getNpmInstallLogInfo();

      chai.assert.isDefined(logInfo);
      chai.assert.equal(logInfo!.timestamp.getUTCFullYear(), 2099);
      chai.assert.isUndefined(logInfo!.cwd);
      chai.assert.isUndefined(logInfo!.nodeVersion);
      chai.assert.isUndefined(logInfo!.npmVersion);
    });
  });
});
