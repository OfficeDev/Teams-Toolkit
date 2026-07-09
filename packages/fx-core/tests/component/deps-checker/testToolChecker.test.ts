// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import cp from "child_process";
import fs from "fs-extra";
import mockfs from "mock-fs";
import * as os from "os";
import * as path from "path";
import * as url from "url";
import { chai, vi } from "vitest";
import { TelemetryProperties } from "../../../src/component/deps-checker/constant/telemetry";
import { TestToolReleaseType } from "../../../src/component/deps-checker/depsChecker";
import {
  GitHubHelpers,
  TestToolChecker,
} from "../../../src/component/deps-checker/internal/testToolChecker";
import { cpUtils } from "../../../src/component/deps-checker/util/cpUtils";
import * as downloadHelper from "../../../src/component/deps-checker/util/downloadHelper";
import * as fileHelper from "../../../src/component/deps-checker/util/fileHelper";
import { NodejsNotFoundError } from "../../../src/error/depCheck";

function isAncesterDir(parent: string, dir: string) {
  const relative = path.relative(parent, dir);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pathSplit(p: string) {
  return p.split(/[\/\\]+/);
}

function trimQuotes(s: string) {
  return s.replace(/^"|'/g, "").replace(/"|'$/g, "");
}

function mockInstallInfoFile(projectPath: string) {
  return {
    [path.join(projectPath, "devTools", ".playground.installInfo.json")]: JSON.stringify({
      lastCheckTimestamp: new Date().getTime(),
    }),
  };
}

// input, undefined means failure by default
interface EnvironmentInfoNpm {
  nodeVersion?: string;
  npmVersion?: string;
  testToolVersionBeforeInstall?: string;
  testToolVersionAfterInstall?: string;
  installSuccess?: boolean;
  npmViewResult?: string;
}

// input, undefined means failure by default
interface EnvironmentInfoBinary {
  testToolVersionBeforeInstall?: string;
  testToolVersionAfterInstall?: string;
  installSuccess?: boolean;
}

// output
interface EnvironmentStatus {
  installed: boolean;
  npmInstallArgs?: string[];
  installedUrl?: string;
}

// mock environment for simpler cases.
// for complex cases, mock executeCommand directly
function mockEnvironmentNpm(info: EnvironmentInfoNpm): EnvironmentStatus {
  const status: EnvironmentStatus = {
    installed: false,
  };
  vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
  vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
  vi.spyOn(cpUtils, "executeCommand").mockImplementation(
    async (_cwd, _logger, _options, command, ...args) => {
      command = trimQuotes(command);
      args = args.map(trimQuotes);
      if (command === "node" && args.includes("--version")) {
        if (info.nodeVersion === undefined) {
          throw new Error("not found");
        } else {
          return info.nodeVersion;
        }
      } else if (command === "npm" && args.includes("--version")) {
        if (info.npmVersion === undefined) {
          throw new Error("not found");
        } else {
          return info.npmVersion;
        }
      } else if (
        (command.includes("agentsplayground") || command.includes("teamsapptester")) &&
        args.includes("--version")
      ) {
        if (status.installed) {
          if (info.testToolVersionAfterInstall === undefined) {
            throw new Error("not found");
          } else {
            return info.testToolVersionAfterInstall;
          }
        } else {
          if (info.testToolVersionBeforeInstall === undefined) {
            throw new Error("not found");
          } else {
            return info.testToolVersionBeforeInstall;
          }
        }
      } else if (command === "npm" && args.includes("install")) {
        if (info.installSuccess) {
          status.installed = true;
          status.npmInstallArgs = args;
          return "";
        } else {
          throw new Error("failed to npm install");
        }
      } else if (command === "npm" && args.includes("view")) {
        if (info.npmViewResult === undefined) {
          throw new Error("fail to npm view");
        }
        return info.npmViewResult;
      }
      throw new Error("Command not mocked");
    }
  );
  return status;
}

function mockEnvironmentBinary(info: EnvironmentInfoBinary): EnvironmentStatus {
  const status: EnvironmentStatus = {
    installed: false,
  };
  vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
  vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
  vi.spyOn(downloadHelper, "downloadToTempFile").mockImplementation(
    async (
      url: string,
      options: {
        timeout: number;
        headers?: { [key: string]: string };
      },
      callback: (filePath: string) => Promise<void>
    ) => {
      status.installedUrl = url;
      if (info.installSuccess) {
        status.installed = true;
      }
      await callback("tmpfilepath");
    }
  );
  vi.spyOn(downloadHelper, "unzip").mockImplementation(async () => {
    if (!info.installSuccess) {
      throw new Error("Mocked install failure");
    }
  });
  vi.spyOn(cpUtils, "executeCommand").mockImplementation(
    async (_cwd, _logger, _options, command, ...args) => {
      command = trimQuotes(command);
      args = args.map(trimQuotes);
      if (
        (command.includes("agentsplayground") || command.includes("teamsapptester")) &&
        args.includes("--version")
      ) {
        if (status.installed) {
          if (info.testToolVersionAfterInstall === undefined) {
            throw new Error("not found");
          } else {
            return info.testToolVersionAfterInstall;
          }
        } else {
          if (info.testToolVersionBeforeInstall === undefined) {
            throw new Error("not found");
          } else {
            return info.testToolVersionBeforeInstall;
          }
        }
      }
      throw new Error("Command not mocked");
    }
  );
  return status;
}

describe("Test Tool Checker Test (npm version)", () => {
  const projectPath = "projectPath";
  const homePortablesDir = path.join(os.homedir(), ".fx", "bin", "agentsPlayground");
  const releaseType = TestToolReleaseType.Npm;

  beforeEach(() => {});
  afterEach(async () => {
    vi.restoreAllMocks();
    mockfs.restore();
  });

  describe("Clean install", () => {
    it("Not installed", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      const writtenFiles: string[] = [];
      vi.spyOn(fs, "writeJson").mockImplementation((path) => {
        writtenFiles.push(path);
      });
      const envStatus = mockEnvironmentNpm({
        nodeVersion: "v22.22.3",
        npmVersion: "9.5.1",
        installSuccess: true,
        testToolVersionBeforeInstall: undefined,
        testToolVersionAfterInstall: "1.2.3",
      });

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(envStatus.installed).to.be.true;
      chai
        .expect(writtenFiles.map((f) => path.resolve(f)))
        .to.include(
          path.resolve(path.join(projectPath, "devTools", ".playground.installInfo.json"))
        );
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
  });

  describe("Already installed", () => {
    it("Already installed and symlink created", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      mockfs({
        ...mockInstallInfoFile(projectPath),
      });
      const envStatus = mockEnvironmentNpm({
        nodeVersion: "v22.22.3",
        npmVersion: "9.5.1",
        testToolVersionBeforeInstall: "1.2.3",
      });

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(envStatus.installed).to.be.false;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });

    it("Already installed in home", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      let npmInstalled = false;
      const homePortableDir = path.join(os.homedir(), ".fx", "bin", "agentsPlayground", "1.2.3");
      const homePortableExec = path.join(
        homePortableDir,
        "node_modules",
        ".bin",
        "agentsplayground"
      );
      mockfs({
        [homePortableExec]: "",
        ...mockInstallInfoFile(projectPath),
      });

      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          command = command.replace(/^"|'/g, "").replace(/"|'$/g, ""); // trim quotes
          if (args.includes("--version")) {
            if (command.includes(projectPath)) {
              throw new Error("not installed");
            } else if (isAncesterDir(homePortableDir, command)) {
              return "1.2.3";
            }
          } else if (args.includes("install")) {
            npmInstalled = true;
          }
          return "";
        }
      );

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(npmInstalled).to.be.false;
      chai.expect(status.details.binFolders).not.empty;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });

    it("Already installed in home multiple versions, should use more recent version", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      const homePortableDir123 = path.join(homePortablesDir, "1.2.3");
      const homePortableExec123 = path.join(
        homePortableDir123,
        "node_modules",
        ".bin",
        "teamsapptester"
      );
      const homePortableDir124 = path.join(homePortablesDir, "1.2.4");
      const homePortableExec124 = path.join(
        homePortableDir124,
        "node_modules",
        ".bin",
        "teamsapptester"
      );
      mockfs({
        [homePortableExec123]: "",
        [homePortableExec124]: "",
        ...mockInstallInfoFile(projectPath),
      });

      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          command = command.replace(/^"|'/g, "").replace(/"|'$/g, ""); // trim quotes
          if (args.includes("--version")) {
            if (command.includes(projectPath)) {
              throw new Error("not installed");
            } else if (isAncesterDir(homePortablesDir, command)) {
              const relPath = path.relative(homePortablesDir, command);
              const dirNames = pathSplit(relPath);
              const version = dirNames[0];
              return version;
            }
          } else if (args.includes("install")) {
            throw new Error("Should not install");
          }
          return "";
        }
      );

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(status.details.binFolders).not.empty;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });

    it("Already installed globally. Should not check for update", async () => {
      const checker = new TestToolChecker();
      const versionRange = "~1.2.3";
      const symlinkDir = "symlinkDir";

      const createSymlinkStub = vi.spyOn(fileHelper, "createSymlink");
      let checkedUpdate = false;
      mockfs({});
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          command = command.replace(/^"|'/g, "").replace(/"|'$/g, ""); // trim quotes
          if (args.includes("--version")) {
            if (command.includes(projectPath)) {
              throw new Error("not installed");
            } else if (isAncesterDir(homePortablesDir, command)) {
              const relPath = path.relative(homePortablesDir, command);
              const dirNames = pathSplit(relPath);
              const version = dirNames[0];
              return version;
            } else if (
              command.startsWith("teamsapptester") ||
              command.startsWith("agentsplayground")
            ) {
              // global check
              return "1.2.3";
            }
          } else if (args.includes("install")) {
            throw new Error("Should not install");
          } else if (args.includes("view")) {
            checkedUpdate = true;
          }
          return "";
        }
      );

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).to.be.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(createSymlinkStub.mock.calls.length === 0).to.be.true;
      chai.expect(checkedUpdate).to.be.false;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
  });

  describe("Installed but version not match", () => {
    it("Installed and symlink created but version not match", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      const envStatus = mockEnvironmentNpm({
        nodeVersion: "v22.22.3",
        npmVersion: "9.5.1",
        testToolVersionBeforeInstall: "1.2.2",
        testToolVersionAfterInstall: "1.2.3",
        installSuccess: true,
      });

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(envStatus.installed).to.be.true;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Already installed in home, but version not match", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.4";
      let npmInstalled = false;
      const homePortableDir123 = path.join(homePortablesDir, "1.2.3");
      const homePortableExec123 = path.join(
        homePortableDir123,
        "node_modules",
        ".bin",
        "teamsapptester"
      );
      const homePortableDir124 = path.join(homePortablesDir, "1.2.4");
      mockfs({
        [homePortableExec123]: "",
      });

      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          command = trimQuotes(command);
          if (args.includes("--version")) {
            if (command.includes(projectPath)) {
              if (npmInstalled) {
                return "1.2.4";
              }
              throw new Error("not installed");
            } else if (isAncesterDir(homePortablesDir, command)) {
              const relPath = path.relative(homePortablesDir, command);
              const dirNames = pathSplit(relPath);
              const version = dirNames[0];
              if (version.startsWith("tmp")) {
                return "1.2.4";
              }
              return version;
            }
          } else if (args.includes("install")) {
            npmInstalled = true;
          }
          return "";
        }
      );

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(npmInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
  });

  describe("Corner cases", () => {
    it("Failed to install", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            throw new Error("not installed");
          } else if (args.includes("install")) {
            throw new Error("install error");
          }
          return "";
        }
      );

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.false;
      chai.expect(status.details.binFolders).to.be.empty;
      chai.expect(status.error).instanceOf(NodejsNotFoundError);
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });

    it("Special characters in tgz path", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      const mockProjectPath = "./projectPath";
      mockfs({
        [path.join(mockProjectPath, "microsoft-teams-app-test-tool-1.2.3.tgz")]: "",
      });
      const envStatus = mockEnvironmentNpm({
        nodeVersion: "v22.22.3",
        npmVersion: "9.5.1",
        testToolVersionBeforeInstall: undefined,
        testToolVersionAfterInstall: "1.2.3",
        installSuccess: true,
      });

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(envStatus.npmInstallArgs).not.undefined;
      const fileArg = envStatus.npmInstallArgs?.filter((arg) =>
        arg.includes("microsoft-teams-app-test-tool")
      )?.[0];
      chai.expect(fileArg).not.empty;
      let parsed: url.URL | undefined;
      chai
        .expect(() => {
          parsed = new url.URL(fileArg!);
        })
        .not.throw();
      chai.expect(parsed).not.undefined;
      chai.expect(parsed?.protocol).equals("file:");
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });

    it("Install timeout", async () => {
      const clock = vi.useFakeTimers();
      const checker = new TestToolChecker();

      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
      const oldExecuteCommand = cpUtils.executeCommand;
      vi.spyOn(cp, "spawn").mockImplementation(() => {
        const events: { [key: string]: any } = {};
        // return a stub for ChildProcess
        return {
          kill: () => {
            events["error"]?.(new Error("timeout"));
            return true;
          },
          on: (event: string, cb: unknown) => {
            events[event] = cb;
          },
        } as any as cp.ChildProcess;
      });
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            throw new Error("not installed");
          } else if (args.includes("install")) {
            const promise = oldExecuteCommand(_cwd, _logger, _options, command, ...args);
            // tick the clock before execute command
            clock.tick(5 * 60 * 1000 + 10);
            return await promise;
          }
          return "";
        }
      );

      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });

      // Assert
      chai.expect(status.isInstalled).to.be.false;
      chai.expect(status.details.binFolders).to.be.empty;
      chai.expect(status.error).instanceOf(NodejsNotFoundError);
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
  });

  describe("Auto update", () => {
    it("Already installed, symlink created, needs to check update but no recent versions", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      let npmInstalled = false;
      let checkedUpdate = false;
      const homePortableDir = path.join(homePortablesDir, "1.2.3");
      const homePortableExec = path.join(homePortableDir, "node_modules", ".bin", "teamsapptester");
      mockfs({
        [path.join(projectPath, "devTools", ".playground.installInfo.json")]: "",
        [homePortableExec]: "",
      });
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            return "1.2.3";
          } else if (args.includes("install")) {
            npmInstalled = true;
          } else if (args.includes("view")) {
            checkedUpdate = true;
            return '["1.2.3"]';
          }
          return "";
        }
      );
      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });
      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(npmInstalled).to.be.false;
      chai.expect(checkedUpdate).to.be.true;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Already installed, symlink created, needs to check update but has more recent versions", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      let npmInstalled = false;
      let checkedUpdate = false;
      const homePortableDir = path.join(homePortablesDir, "1.2.3");
      const homePortableExec = path.join(homePortableDir, "node_modules", ".bin", "teamsapptester");
      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
      mockfs({
        [path.join(projectPath, "devTools", ".playground.installInfo.json")]: "",
        [homePortableExec]: "",
      });
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            if (checkedUpdate) {
              // after update
              return "1.2.4";
            } else {
              return "1.2.3";
            }
          } else if (args.includes("install")) {
            npmInstalled = true;
          } else if (args.includes("view")) {
            checkedUpdate = true;
            return '["1.2.4"]';
          }
          return "";
        }
      );
      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });
      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(status.details.installVersion).to.eq("1.2.4");
      chai.expect(npmInstalled).to.be.true;
      chai.expect(checkedUpdate).to.be.true;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Already installed, symlink created, needs to check update but has multiple recent versions, should use latest", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      let npmInstalled = false;
      let checkedUpdate = false;
      const homePortableDir = path.join(homePortablesDir, "1.2.3");
      const homePortableExec = path.join(homePortableDir, "node_modules", ".bin", "teamsapptester");
      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
      mockfs({
        [path.join(projectPath, "devTools", ".playground.installInfo.json")]: "",
        [homePortableExec]: "",
      });
      let installedVersion = "1.2.3";
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            if (command === "node") return "v22.22.3";
            if (command === "npm") return "9.7.0";
            return installedVersion;
          } else if (args.includes("install")) {
            installedVersion = "1.2.4";
            npmInstalled = true;
          } else if (args.includes("view")) {
            checkedUpdate = true;
            return '"1.2.3"';
          }
          return "";
        }
      );
      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });
      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(status.details.installVersion).to.eq("1.2.3");
      chai.expect(npmInstalled).to.be.false;
      chai.expect(checkedUpdate).to.be.true;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Already installed, symlink created, needs to check update but has multiple recent versions, should use latest", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      let npmInstalled = false;
      let checkedUpdate = false;
      const homePortableDir = path.join(homePortablesDir, "1.2.3");
      const homePortableExec = path.join(homePortableDir, "node_modules", ".bin", "teamsapptester");
      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      vi.spyOn(fileHelper, "createSymlink").mockResolvedValue(undefined);
      mockfs({
        [path.join(projectPath, "devTools", ".playground.installInfo.json")]: "",
        [homePortableExec]: "",
      });
      let installedVersion = "1.2.3";
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            if (command === "node") return "v22.22.3";
            if (command === "npm") return "9.7.0";
            return installedVersion;
          } else if (args.includes("install")) {
            installedVersion = "1.2.5";
            npmInstalled = true;
          } else if (args.includes("view")) {
            checkedUpdate = true;
            return '["1.2.4", "1.2.5"]';
          }
          return "";
        }
      );
      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });
      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(status.details.installVersion).to.eq("1.2.5");
      chai.expect(npmInstalled).to.be.true;
      chai.expect(checkedUpdate).to.be.true;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Already installed, symlink created, needs to check update but update failed", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "~1.2.3";
      let npmInstalled = false;
      let checkedUpdate = false;
      const homePortableDir = path.join(homePortablesDir, "1.2.3");
      const homePortableExec = path.join(homePortableDir, "node_modules", ".bin", "teamsapptester");
      vi.spyOn(fileHelper, "rename").mockResolvedValue(undefined);
      const linkTargets: string[] = [];
      vi.spyOn(fileHelper, "createSymlink").mockImplementation(async (target) => {
        linkTargets.push(target);
      });
      mockfs({
        [path.join(projectPath, "devTools", ".playground.installInfo.json")]: "",
        [homePortableExec]: "",
      });
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            if (command === "node") return "v22.22.3";
            if (command === "npm") return "9.5.1";
            if (checkedUpdate) {
              // after update
              throw new Error("Update failed");
            } else {
              return "1.2.3";
            }
          } else if (args.includes("install")) {
            npmInstalled = true;
          } else if (args.includes("view")) {
            // npm view package version
            checkedUpdate = true;
            return '["1.2.4"]';
          }
          return "";
        }
      );
      // Act
      const status = await checker.resolve({ releaseType, projectPath, symlinkDir, versionRange });
      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.details.installVersion).to.eq("1.2.3");
      chai.expect(status.error).to.be.undefined;
      chai.expect(npmInstalled).to.be.true;
      chai.expect(checkedUpdate).to.be.true;
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Already installed, symlink created, but skip update", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "1.2.3";
      let npmInstalled = false;
      let checkedUpdate = false;
      const homePortableDir = path.join(homePortablesDir, "1.2.3");
      const homePortableExec = path.join(homePortableDir, "node_modules", ".bin", "teamsapptester");
      mockfs({
        [path.join(projectPath, "devTools", ".playground.installInfo.json")]: "",
        [homePortableExec]: "",
      });
      vi.spyOn(cpUtils, "executeCommand").mockImplementation(
        async (_cwd, _logger, _options, command, ...args) => {
          if (args.includes("--version")) {
            return "1.2.3";
          } else if (args.includes("install")) {
            npmInstalled = true;
          } else if (args.includes("view")) {
            checkedUpdate = true;
            return '["1.2.3"]';
          }
          return "";
        }
      );
      // Act
      const status = await checker.resolve({
        releaseType,
        projectPath,
        symlinkDir,
        versionRange,
      });
      // Assert
      chai.expect(status.isInstalled).to.be.true;
      chai.expect(status.details.binFolders).not.empty;
      chai.expect(status.error).to.be.undefined;
      chai.expect(npmInstalled).to.be.false;
      chai.expect(checkedUpdate).to.be.true;
      chai.expect(status.details.installVersion).to.eq("1.2.3");
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
  });

  describe("Prerequisites", () => {
    it("Node not found", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "1.2.3";
      mockEnvironmentNpm({ nodeVersion: undefined, npmVersion: "9.5.1" });
      // Act
      const status = await checker.resolve({
        releaseType,
        projectPath,
        symlinkDir,
        versionRange,
      });
      // Assert
      chai.expect(status.isInstalled).to.be.false;
      chai.expect(status.details.binFolders).be.empty;
      chai.expect(status.error).not.undefined;
      chai.expect(status.error?.message).match(/node/i);
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
    it("Npm not found", async () => {
      const checker = new TestToolChecker();
      const symlinkDir = "symlinkDir";
      const versionRange = "1.2.3";
      mockfs({});
      mockEnvironmentNpm({ nodeVersion: "v22.22.3", npmVersion: undefined });
      // Act
      const status = await checker.resolve({
        releaseType,
        projectPath,
        symlinkDir,
        versionRange,
      });
      // Assert
      chai.expect(status.isInstalled).to.be.false;
      chai.expect(status.details.binFolders).be.empty;
      chai.expect(status.error).not.undefined;
      chai.expect(status.error?.message).match(/npm/i);
      chai
        .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
        .to.eq(TestToolReleaseType.Npm);
    });
  });
});

(os.platform() === "win32" ? describe : describe.skip)(
  "Test Tool Checker Test (binary version)",
  () => {
    const projectPath = "projectPath";
    const homePortablesDir = path.join(os.homedir(), ".fx", "bin", "agentsPlaygroundBinary");
    const releaseType = TestToolReleaseType.Binary;

    beforeEach(() => {
      vi.spyOn(fs, "ensureDir").mockResolvedValue(undefined);
      vi.spyOn(fs, "writeJson").mockResolvedValue(undefined);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      mockfs.restore();
    });

    describe("Clean install", () => {
      it("Not installed", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.3";
        vi.spyOn(checker as any, "getInstallationInfo").mockResolvedValue({
          name: "Microsoft 365 Agents Playground",
          type: "test-tool",
          isInstalled: false,
          command: "agentsplayground.cmd",
          details: {
            isLinuxSupported: true,
            supportedVersions: [],
            binFolders: [],
            installVersion: versionRange,
          },
          telemetryProperties: {
            [TelemetryProperties.InstallTestToolReleaseType]: TestToolReleaseType.Binary,
          },
          error: undefined,
        });
        const installStub = vi.spyOn(checker as any, "install").mockResolvedValue({
          name: "Microsoft 365 Agents Playground",
          type: "test-tool",
          isInstalled: true,
          command: "agentsplayground.cmd",
          details: {
            isLinuxSupported: true,
            supportedVersions: [],
            binFolders: ["bin"],
            installVersion: "1.2.3",
          },
          telemetryProperties: {
            [TelemetryProperties.InstallTestToolReleaseType]: TestToolReleaseType.Binary,
          },
          error: undefined,
          installType: "portable",
        });

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(installStub.mock.calls.length === 1).to.be.true;
        chai.expect(status.isInstalled).to.be.true;
        chai.expect(status.details.binFolders).not.empty;
        chai.expect(status.error).to.be.undefined;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
      });
    });

    describe("Already installed", () => {
      it("Already installed in home", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.3";
        mockfs({
          [path.join(homePortablesDir, "1.2.3", "agentsplayground.exe")]: "",
        });
        vi.spyOn(GitHubHelpers, "listGitHubReleases").mockResolvedValue([
          { version: "1.2.3", url: "https://example.com" },
        ]);
        mockEnvironmentBinary({
          testToolVersionBeforeInstall: "1.2.3",
          testToolVersionAfterInstall: "1.2.3",
        });

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(status.isInstalled).to.be.true;
        chai.expect(status.details.binFolders).not.empty;
        chai.expect(status.error).to.be.undefined;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
      });

      it("Already installed in home multiple versions, should use more recent version", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.3";
        mockfs({
          [path.join(homePortablesDir, "1.2.3", "agentsplayground.exe")]: "",
          [path.join(homePortablesDir, "1.2.4", "agentsplayground.exe")]: "",
        });
        vi.spyOn(GitHubHelpers, "listGitHubReleases").mockResolvedValue([
          { version: "1.2.4", url: "https://example.com" },
        ]);
        mockEnvironmentBinary({
          testToolVersionBeforeInstall: "1.2.4",
          testToolVersionAfterInstall: "1.2.4",
        });

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(status.isInstalled).to.be.true;
        chai.expect(status.details.binFolders).not.empty;
        chai.expect(status.error).to.be.undefined;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
      });

      it("Already installed globally. Should not check for update", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.3";

        const listGitHubReleasesStub = vi.spyOn(GitHubHelpers, "listGitHubReleases");

        mockfs({});
        vi.spyOn(cpUtils, "executeCommand").mockImplementation(
          async (_cwd, _logger, _options, command, ...args) => {
            command = command.replace(/^"|'/g, "").replace(/"|'$/g, ""); // trim quotes
            if (args.includes("--version")) {
              if (command.startsWith("teamsapptester")) {
                // global check
                return "1.2.3";
              } else {
                throw new Error("not installed");
              }
            }
            return "";
          }
        );

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(status.isInstalled).to.be.true;
        chai.expect(status.details.binFolders).to.be.empty;
        chai.expect(status.details.installVersion).to.eq("1.2.3");
        chai.expect(status.error).to.be.undefined;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
        chai.expect(listGitHubReleasesStub.mock.calls.length === 0).true;
      });
    });

    describe("Auto update", () => {
      it("Already installed old version, one new version", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.4";
        vi.spyOn(checker as any, "findLatestInstalledPortableVersion").mockResolvedValue("1.2.3");
        vi.spyOn(checker as any, "readInstallInfoFile").mockResolvedValue(undefined);
        vi.spyOn(GitHubHelpers, "listGitHubReleases").mockResolvedValue([
          { version: "1.2.4", url: "https://example.com" },
        ]);
        mockEnvironmentBinary({
          installSuccess: true,
          testToolVersionBeforeInstall: "1.2.3",
          testToolVersionAfterInstall: "1.2.4",
        });

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(status.isInstalled).to.be.true;
        chai.expect(status.details.binFolders).not.empty;
        chai.expect(status.error).to.be.undefined;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
      });
      it("Already installed old version, multiple new versions", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.4";
        vi.spyOn(checker as any, "findLatestInstalledPortableVersion").mockResolvedValue("1.2.3");
        vi.spyOn(checker as any, "readInstallInfoFile").mockResolvedValue(undefined);
        vi.spyOn(GitHubHelpers, "listGitHubReleases").mockResolvedValue([
          { version: "1.2.4", url: "https://example.com/1.2.4" },
          { version: "1.2.5", url: "https://example.com/1.2.5" },
        ]);
        mockEnvironmentBinary({
          installSuccess: true,
          testToolVersionBeforeInstall: "1.2.3",
          testToolVersionAfterInstall: "1.2.5",
        });

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(status.isInstalled).to.be.true;
        chai.expect(status.details.binFolders).not.empty;
        chai.expect(status.error).to.be.undefined;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
      });
    });

    describe("Corner cases", () => {
      it("Failed to install", async () => {
        const checker = new TestToolChecker();
        const versionRange = "~1.2.3";
        mockfs({});
        vi.spyOn(GitHubHelpers, "listGitHubReleases").mockResolvedValue([
          { version: "1.2.3", url: "https://example.com" },
        ]);
        mockEnvironmentBinary({
          installSuccess: false,
        });

        // Act
        const status = await checker.resolve({ releaseType, projectPath, versionRange });

        // Assert
        chai.expect(status.isInstalled).to.be.false;
        chai.expect(status.error).not.empty;
        chai
          .expect(status.telemetryProperties?.[TelemetryProperties.InstallTestToolReleaseType])
          .to.eq(TestToolReleaseType.Binary);
      });
    });
  }
);

describe("GitHubHelpers", () => {
  beforeEach(() => {});
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list github releases happy path", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const releases = [
        {
          tag_name: "microsoft-365-agents-playground@1.0.0",
          assets: [
            { name: `agentsplayground-${os.platform()}-${os.arch()}`, url: "https://example0.com" },
          ],
        },
        {
          tag_name: "microsoft-365-agents-playground@1.0.1",
          assets: [
            { name: `agentsplayground-${os.platform()}-${os.arch()}`, url: "https://example1.com" },
          ],
        },
      ];
      return { json: async () => releases, status: 200 } as any;
    });
    const releases = await GitHubHelpers.listGitHubReleases();
    chai.expect(releases).to.deep.eq([
      { version: "1.0.0", url: "https://example0.com" },
      { version: "1.0.1", url: "https://example1.com" },
    ]);
  });

  it("ignores github releases not related to test tool", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const releases = [
        {
          tag_name: "templates@1.0.0",
          assets: [
            { name: `agentsplayground-${os.platform()}-${os.arch()}`, url: "https://example0.com" },
          ],
        },
        {
          tag_name: "templates@1.0.1",
          assets: [
            { name: `agentsplayground-${os.platform()}-${os.arch()}`, url: "https://example1.com" },
          ],
        },
      ];
      return { json: async () => releases, status: 200 } as any;
    });
    const releases = await GitHubHelpers.listGitHubReleases();
    chai.expect(releases).to.deep.eq([]);
  });
  it("ignores releases that doesn't have assets", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const releases = [
        {
          tag_name: "microsoft-365-agents-playground@1.0.0",
          assets: [],
        },
      ];
      return { json: async () => releases, status: 200 } as any;
    });
    const releases = await GitHubHelpers.listGitHubReleases();
    chai.expect(releases).to.deep.eq([]);
  });
});
