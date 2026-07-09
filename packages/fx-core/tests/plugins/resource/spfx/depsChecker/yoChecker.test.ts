// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { LogLevel, LogProvider, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { chai, expect, vi } from "vitest";
import { createContext, setTools } from "../../../../../src/common/globalVars";
import { cpUtils } from "../../../../../src/component/deps-checker/util/cpUtils";
import { YoChecker } from "../../../../../src/component/generator/spfx/depsChecker/yoChecker";
import { telemetryHelper } from "../../../../../src/component/generator/spfx/utils/telemetry-helper";
import { Utils } from "../../../../../src/component/generator/spfx/utils/utils";
import { MockTools } from "../../../../core/utils";

class StubLogger implements LogProvider {
  msg = "";
  verbose(msg: string): void {
    this.log(LogLevel.Verbose, msg);
  }
  debug(msg: string): void {
    this.log(LogLevel.Debug, msg);
  }
  info(msg: string | Array<any>): void {
    this.log(LogLevel.Info, msg as string);
  }
  warning(msg: string): void {
    this.log(LogLevel.Warning, msg);
  }
  error(msg: string): void {
    this.log(LogLevel.Error, msg);
  }
  log(level: LogLevel, msg: string): void {
    this.msg = msg;
  }
  async logInFile(level: LogLevel, msg: string): Promise<void> {
    this.msg = msg;
  }
  getLogFilePath(): string {
    return "";
  }
}

describe("Yo checker", () => {
  beforeEach(() => {
    vi.spyOn(telemetryHelper, "sendSuccessEvent").mockImplementation(() => {
      console.log("success event");
      return;
    });
    vi.spyOn(telemetryHelper, "sendErrorEvent").mockImplementation(() => {
      console.log("error event");
      return;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("install", async () => {
    const yc = new YoChecker(new StubLogger());
    const cleanStub = vi
      .spyOn(YoChecker.prototype, "cleanup" as any)
      .mockImplementation(async () => {
        console.log("stub cleanup");
        return;
      });
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue();
    vi.spyOn(fs, "pathExists").mockImplementation(async () => {
      return true;
    });

    try {
      await yc.install("latest");
    } catch {
      expect(cleanStub).toHaveBeenCalledTimes(2);
    }
  });

  it("install throw error", async () => {
    const yc = new YoChecker(new StubLogger());
    const cleanStub = vi
      .spyOn(YoChecker.prototype, "cleanup" as any)
      .mockImplementation(async () => {
        console.log("stub cleanup");
        return;
      });
    vi.spyOn(cpUtils, "executeCommand").mockImplementation(() => {
      throw new Error("unknown");
    });
    vi.spyOn(fs, "pathExists").mockImplementation(async () => {
      return true;
    });

    try {
      await yc.install("latest");
    } catch (e) {
      chai.expect(e.name).equal("NpmInstallError");
    }
  });

  it("clean up failed when install", async () => {
    const yc = new YoChecker(new StubLogger());
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "emptyDir").mockImplementation(() => {
      throw "Failed to empty dir";
    });
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue();
    vi.spyOn(fs, "pathExists").mockImplementation(async () => {
      return true;
    });
    const logErrorSpy = vi.spyOn(StubLogger.prototype, "error");

    await yc.install("latest");

    expect(logErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("findGloballyInstalledVersion: returns version", async () => {
    const generatorChecker = new YoChecker(new StubLogger());
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("C:\\Roaming\\npm\n`-- yo@4.3.1\n\n");

    const res = await generatorChecker.findGloballyInstalledVersion(1);
    chai.expect(res).equal("4.3.1");
  });

  it("findGloballyInstalledVersion: regex error", async () => {
    const yoChecker = new YoChecker(new StubLogger());
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue(
      "C:\\Roaming\\npm\n`-- @microsoft/generator-sharepoint@1.16.1\n\n"
    );

    const res = await yoChecker.findGloballyInstalledVersion(1);
    chai.expect(res).equal(undefined);
  });

  it("findLatestVersion: returns version", async () => {
    const yoChecker = new YoChecker(new StubLogger());
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("4.3.1");

    const res = await yoChecker.findLatestVersion(1);
    chai.expect(res).equal("4.3.1");
  });

  it("findLatestVersion: regex error", async () => {
    const yoChecker = new YoChecker(new StubLogger());
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("empty");

    const res = await yoChecker.findLatestVersion(1);
    chai.expect(res).to.be.undefined;
  });

  it("findLatestVersion: exeute commmand error", async () => {
    const yoChecker = new YoChecker(new StubLogger());
    vi.spyOn(cpUtils, "executeCommand").mockImplementation(() => {
      throw "run command error";
    });

    const res = await yoChecker.findLatestVersion(1);
    chai.expect(res).to.be.undefined;
  });

  describe("isLatestInstalled", () => {
    it("is latest installed", async () => {
      const yc = new YoChecker(new StubLogger());
      vi.spyOn(fs, "pathExists").mockImplementation(async () => {
        console.log("stub pathExists");
        return true;
      });

      vi.spyOn(YoChecker.prototype, "queryVersion" as any).mockImplementation(async () => {
        console.log("stub queryversion");
        return "latest";
      });

      vi.spyOn(YoChecker.prototype, "findLatestVersion" as any).mockImplementation(async () => {
        console.log("stub findLatestVersion");
        return "latest";
      });

      const result = await yc.isLatestInstalled();
      chai.expect(result).is.true;
    });

    it("latest not installed", async () => {
      const yc = new YoChecker(new StubLogger());
      vi.spyOn(fs, "pathExists").mockImplementation(async () => {
        console.log("stub pathExists");
        return true;
      });

      vi.spyOn(YoChecker.prototype, "queryVersion" as any).mockImplementation(async () => {
        console.log("stub queryversion");
        return "lowerVersion";
      });

      vi.spyOn(YoChecker.prototype, "findLatestVersion" as any).mockImplementation(async () => {
        console.log("stub findLatestVersion");
        return "latest version";
      });

      const result = await yc.isLatestInstalled();
      chai.expect(result).is.false;
    });

    it("sentitel file missing", async () => {
      const yc = new YoChecker(new StubLogger());
      vi.spyOn(fs, "pathExists").mockImplementation(async () => {
        console.log("stub pathExists");
        return false;
      });

      vi.spyOn(YoChecker.prototype, "queryVersion" as any).mockImplementation(async () => {
        console.log("stub queryversion");
        return "lowerVersion";
      });

      vi.spyOn(YoChecker.prototype, "findLatestVersion" as any).mockImplementation(async () => {
        console.log("stub findLatestVersion");
        return "latest version";
      });

      const result = await yc.isLatestInstalled();
      chai.expect(result).is.false;
    });

    it("throw error", async () => {
      const yc = new YoChecker(new StubLogger());
      vi.spyOn(fs, "pathExists").mockImplementation(async () => {
        console.log("stub pathExists");
        return true;
      });

      vi.spyOn(YoChecker.prototype, "queryVersion" as any).mockImplementation(() => {
        throw "error";
      });
      vi.spyOn(Utils, "findLatestVersion").mockImplementation(() => {
        throw "error";
      });

      const result = await yc.isLatestInstalled();
      chai.expect(result).is.false;
    });
  });

  describe("ensureDependency", () => {
    setTools(new MockTools());
    it("install successfully", async () => {
      const yc = new YoChecker(new StubLogger());

      vi.spyOn(YoChecker.prototype, "install" as any).mockImplementation(async () => {
        console.log("installing");
      });

      const context = createContext();

      const result = await yc.ensureDependency(context, "latest");
      chai.expect(result.isOk()).to.be.true;
    });

    it("install error", async () => {
      const yc = new YoChecker(new StubLogger());
      vi.spyOn(YoChecker.prototype, "install" as any).mockImplementation(async () => {
        throw new UserError("source", "name", "msg", "msg");
      });

      const context = createContext();

      const result = await yc.ensureDependency(context, "latest");
      chai.expect(result.isErr()).to.be.true;
    });
  });
});
