// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import mockfs from "mock-fs";
import path from "path";
import { LocalEnvManager } from "../../../src/component/local/localEnvManager";
import { chai } from "vitest";

describe("localEnvManager", () => {
  describe("getTestToolLogInfo", () => {
    afterEach(() => {
      mockfs.restore();
    });
    const projectPath = "mock project path";
    it("should return only error message", async () => {
      const manager = new LocalEnvManager();
      mockfs({
        [path.join(projectPath, "devTools", "teamsapptesttool.log")]:
          "error errorLog1\nwarn warnLog\ninfo infoLog\nerror errorLog2\n",
      });
      const result = await manager.getTestToolLogInfo(projectPath);
      chai.expect(result).to.eq("error errorLog1\nerror errorLog2");
    });
    it("should not contain callstack", async () => {
      const manager = new LocalEnvManager();
      mockfs({
        [path.join(projectPath, "devTools", "teamsapptesttool.log")]:
          "error Some Error happened\ncall stack Func1\nFunc2\nFunc3\n",
      });
      const result = await manager.getTestToolLogInfo(projectPath);
      chai.expect(result).to.eq("error Some Error happened");
    });
    it("should not throw error if failed", async () => {
      const manager = new LocalEnvManager();
      const result = await manager.getTestToolLogInfo(projectPath);
      chai.expect(result).to.be.undefined;
    });
  });
});
