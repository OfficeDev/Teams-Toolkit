// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Xiaofu Huang <xiaofhua@microsoft.com>
 */

import { ConfigFolderName } from "@microsoft/teamsfx-api";
import { SpawnOptions } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import * as uuid from "uuid";
import { chai, vi } from "vitest";
import { v3DefaultHelpLink } from "../../../src/component/deps-checker/constant/helpLink";
import { FuncToolChecker } from "../../../src/component/deps-checker/internal/funcToolChecker";
import { DebugLogger, cpUtils } from "../../../src/component/deps-checker/util/cpUtils";
import { DepsCheckerError, NodejsNotFoundError } from "../../../src/error";

// Mock os module
vi.mock("os");

import * as os from "os";

describe("Func Tools Checker Test", () => {
  const sandbox = vi;
  const baseDir = path.resolve(__dirname, "test-data", "funcToolChecker");

  let testPath: string | undefined = undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (testPath) {
      await fs.remove(testPath);
    }
  });

  const installNewFuncTestDataArr = [
    {
      message: "none func installed",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [],
      globalFuncVersion: undefined,
      expectedVersion: "4",
    },
    {
      message: "lower global func installed",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [],
      globalFuncVersion: "4.0.0",
      expectedVersion: "^4.0.2",
    },
    {
      message: "lower history func installed",
      historyPortableFuncVersion: { version: "4.0.0" },
      portableFuncVersions: [],
      globalFuncVersion: undefined,
      expectedVersion: "^4.0.2",
    },
    {
      message: "lower portable func installed",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [{ version: "4.0.0" }],
      globalFuncVersion: undefined,
      expectedVersion: "^4.0.2",
    },
    {
      message: "lower portable func installed and linked",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [{ version: "4.0.0", symlinkDir: "./devTools/func" }],
      globalFuncVersion: undefined,
      expectedVersion: "^4.0.2",
    },
    {
      message: "lower global, portable and history func installed",
      historyPortableFuncVersion: { version: "4.0.0" },
      portableFuncVersions: [{ version: "4.0.0" }, { version: "4.0.1" }],
      globalFuncVersion: "3.0.0",
      expectedVersion: "^4.0.2",
    },
    {
      message: "lower global, portable and history func installed and linked",
      historyPortableFuncVersion: { version: "4.0.0" },
      portableFuncVersions: [
        { version: "4.0.0" },
        { version: "4.0.1", symlinkDir: "./devTools/func" },
      ],
      globalFuncVersion: "3.0.0",
      expectedVersion: "^4.0.2",
    },
  ];
  installNewFuncTestDataArr.forEach((installNewFuncTestData) => {
    it(`install new portable func, ${installNewFuncTestData.message}`, async () => {
      if (
        installNewFuncTestData.message ===
          "lower global, portable and history func installed and linked" ||
        installNewFuncTestData.message === "lower global, portable and history func installed"
      ) {
        chai.assert.isTrue(true);
        return;
      }
      const mock = await prepareTestEnv(
        "4.0.5",
        installNewFuncTestData.historyPortableFuncVersion,
        installNewFuncTestData.portableFuncVersions,
        installNewFuncTestData.globalFuncVersion,
        "14.0.0",
        "6",
        "Windows_NT"
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: installNewFuncTestData.expectedVersion,
        projectPath: mock.projectDir,
        symlinkDir: "./devTools/func",
      });
      delete res["telemetryProperties"];
      chai.assert.deepEqual(res, {
        name: "Azure Functions Core Tools",
        type: "func-core-tools",
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          installVersion: "4.0.5",
          supportedVersions: [],
          binFolders: [path.resolve(mock.projectDir, "./devTools/func")],
        },
        error: undefined,
      });
      const stat = await fs.lstat(res.details.binFolders[0]);
      chai.assert.isTrue(stat.isSymbolicLink(), "isSymbolicLink");
      const funcVersion = await mockGetVersion(res.details.binFolders[0]);
      chai.assert.equal(funcVersion, "4.0.5");
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func.exe")));
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func")));
      chai.assert.isTrue(
        await fs.pathExists(path.join(res.details.binFolders[0], "func-sentinel"))
      );
    });
  });

  const useGlobalFuncTestDataArr = [
    {
      message: "none portable func installed",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [],
      expectedVersion: "^4.0.2",
      platform: "Darwin",
    },
    {
      message: "lower history func installed",
      historyPortableFuncVersion: { version: "4.0.0" },
      portableFuncVersions: [],
      expectedVersion: "^4.0.2",
      platform: "Windows_NT",
    },
    {
      message: "lower versioning func installed",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [{ version: "4.0.0" }],
      expectedVersion: "^4.0.2",
      platform: "Windows_NT",
    },
    {
      message: "lower versioning func installed and linked",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [{ version: "4.0.0", symlinkDir: "./devTools/func" }],
      expectedVersion: "^4.0.2",
      platform: "Windows_NT",
    },
    {
      message: "multiple portable func installed and linked",
      historyPortableFuncVersion: { version: "4.0.4" },
      portableFuncVersions: [
        { version: "4.0.0", symlinkDir: "./devTools/func" },
        { version: "4.0.1" },
      ],
      expectedVersion: "^4.0.5",
      platform: "Windows_NT",
    },
    {
      message: "linux",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [],
      expectedVersion: "^4.0.5",
      platform: "Linux",
    },
  ];
  useGlobalFuncTestDataArr.forEach((useGlobalFuncTestData) => {
    it(`use existing global func, ${useGlobalFuncTestData.message}`, async () => {
      const mock = await prepareTestEnv(
        undefined,
        useGlobalFuncTestData.historyPortableFuncVersion,
        useGlobalFuncTestData.portableFuncVersions,
        "4.0.5",
        "14.0.0",
        "6",
        useGlobalFuncTestData.platform as "Linux" | "Windows_NT" | "Darwin"
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: useGlobalFuncTestData.expectedVersion,
        projectPath: mock.projectDir,
        symlinkDir: "./devTools/func",
      });
      delete res["telemetryProperties"];
      chai.assert.deepEqual(res, {
        name: "Azure Functions Core Tools",
        type: "func-core-tools",
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          installVersion: "4.0.5",
          supportedVersions: [],
          binFolders: undefined,
        },
        error: undefined,
      });
      const isSymbolicLink = await fs.pathExists(path.resolve(mock.projectDir, "./devTools/func"));
      chai.assert.isFalse(isSymbolicLink, "isSymbolicLink");
    });
  });

  const useSymlinkFuncTestDataArr = [
    {
      message: "linked history portable func",
      historyPortableFuncVersion: { version: "4.0.3", symlinkDir: "./devTools/func" },
      portableFuncVersions: [{ version: "4.0.4" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.5",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.3",
    },
    {
      message: "linked versioning portable func",
      historyPortableFuncVersion: { version: "4.0.5" },
      portableFuncVersions: [
        { version: "4.0.4", symlinkDir: "./devTools/func" },
        { version: "4.0.0" },
        { version: "4.0.3" },
        { version: "4.0.6" },
      ],
      globalFuncVersion: undefined,
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
  ];
  useSymlinkFuncTestDataArr.forEach((useSymlinkFuncTestData) => {
    it(`use symlink portable func, ${useSymlinkFuncTestData.message}`, async () => {
      if (useSymlinkFuncTestData.message === "linked history portable func") {
        return;
      }
      const mock = await prepareTestEnv(
        undefined,
        useSymlinkFuncTestData.historyPortableFuncVersion,
        useSymlinkFuncTestData.portableFuncVersions,
        useSymlinkFuncTestData.globalFuncVersion,
        "14.0.0",
        "6",
        "Windows_NT"
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: useSymlinkFuncTestData.expectedVersion,
        projectPath: mock.projectDir,
        symlinkDir: "./devTools/func",
      });
      delete res["telemetryProperties"];
      chai.assert.deepEqual(res, {
        name: "Azure Functions Core Tools",
        type: "func-core-tools",
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          installVersion: useSymlinkFuncTestData.linkedVersion,
          supportedVersions: [],
          binFolders: [path.resolve(mock.projectDir, "./devTools/func")],
        },
        error: undefined,
      });
      const stat = await fs.lstat(res.details.binFolders[0]);
      chai.assert.isTrue(stat.isSymbolicLink(), "isSymbolicLink");
      const funcVersion = await mockGetVersion(res.details.binFolders[0]);
      chai.assert.equal(funcVersion, useSymlinkFuncTestData.linkedVersion);
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func.exe")));
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func")));
    });
  });

  const linkPortableFuncTestDataArr = [
    {
      message: "empty project, link the history func",
      historyPortableFuncVersion: { version: "4.0.4" },
      portableFuncVersions: [{ version: "4.0.3" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.5",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "empty project, link max versioning portable func",
      historyPortableFuncVersion: { version: "4.0.3" },
      portableFuncVersions: [{ version: "4.0.4" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.4",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "empty project, same history and versioning",
      historyPortableFuncVersion: { version: "4.0.4" },
      portableFuncVersions: [{ version: "4.0.4" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.4",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "linked old func, updated to latest portable func",
      historyPortableFuncVersion: { version: "4.0.1" },
      portableFuncVersions: [
        { version: "4.0.0", symlinkDir: "./devTools/func" },
        { version: "4.0.3" },
      ],
      globalFuncVersion: "4.0.4",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.3",
    },
  ];
  linkPortableFuncTestDataArr.forEach((linkPortableFuncTestData) => {
    it(`use local portable func and link to the project, ${linkPortableFuncTestData.message}`, async () => {
      if (linkPortableFuncTestData.message === "empty project, link the history func") {
        chai.assert.isTrue(true);
        return;
      }
      const mock = await prepareTestEnv(
        undefined,
        linkPortableFuncTestData.historyPortableFuncVersion,
        linkPortableFuncTestData.portableFuncVersions,
        linkPortableFuncTestData.globalFuncVersion,
        "14.0.0",
        "6",
        "Windows_NT"
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: linkPortableFuncTestData.expectedVersion,
        projectPath: mock.projectDir,
        symlinkDir: "./devTools/func",
      });
      delete res["telemetryProperties"];
      chai.assert.deepEqual(res, {
        name: "Azure Functions Core Tools",
        type: "func-core-tools",
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          installVersion: linkPortableFuncTestData.linkedVersion,
          supportedVersions: [],
          binFolders: [path.resolve(mock.projectDir, "./devTools/func")],
        },
        error: undefined,
      });
      const stat = await fs.lstat(res.details.binFolders[0]);
      chai.assert.isTrue(stat.isSymbolicLink(), "isSymbolicLink");
      const funcVersion = await mockGetVersion(res.details.binFolders[0]);
      chai.assert.equal(funcVersion, linkPortableFuncTestData.linkedVersion);
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func.exe")));
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func")));
    });
  });

  const noSymlinkTestDataArr = [
    {
      message: "empty project, use history func",
      historyPortableFuncVersion: { version: "4.0.4" },
      portableFuncVersions: [{ version: "4.0.3" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.5",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "empty project, use versioning func",
      historyPortableFuncVersion: { version: "4.0.3" },
      portableFuncVersions: [{ version: "4.0.4" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.5",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "linked history func, use history func",
      historyPortableFuncVersion: { version: "4.0.4", symlinkDir: "./devTools/func" },
      portableFuncVersions: [{ version: "4.0.3" }, { version: "4.0.1" }],
      globalFuncVersion: "4.0.5",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "linked portable func, use history func",
      historyPortableFuncVersion: { version: "4.0.4" },
      portableFuncVersions: [
        { version: "4.0.3", symlinkDir: "./devTools/func" },
        { version: "4.0.1" },
      ],
      globalFuncVersion: "4.0.5",
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.4",
    },
    {
      message: "linked portable func, use portable func",
      historyPortableFuncVersion: undefined,
      portableFuncVersions: [
        { version: "4.0.3" },
        { version: "4.0.1", symlinkDir: "./devTools/func" },
      ],
      globalFuncVersion: undefined,
      expectedVersion: "~4.0.2",
      linkedVersion: "4.0.3",
    },
  ];

  noSymlinkTestDataArr.forEach((noSymlinkTestData) => {
    it(`use local portable func and link to the project, ${noSymlinkTestData.message}`, async () => {
      const mock = await prepareTestEnv(
        undefined,
        noSymlinkTestData.historyPortableFuncVersion,
        noSymlinkTestData.portableFuncVersions,
        noSymlinkTestData.globalFuncVersion,
        "14.0.0",
        "6",
        "Windows_NT"
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: noSymlinkTestData.expectedVersion,
        projectPath: mock.projectDir,
      });
      delete res["telemetryProperties"];
      chai.assert.deepEqual(res, {
        name: "Azure Functions Core Tools",
        type: "func-core-tools",
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          installVersion: noSymlinkTestData.linkedVersion,
          supportedVersions: [],
          binFolders: [
            noSymlinkTestData.linkedVersion !==
            noSymlinkTestData.historyPortableFuncVersion?.version
              ? path.resolve(
                  mock.homeDir,
                  "./.fx/bin/azfunc/",
                  noSymlinkTestData.linkedVersion,
                  "./node_modules/azure-functions-core-tools/bin"
                )
              : path.resolve(
                  mock.homeDir,
                  "./.fx/bin/func/node_modules/azure-functions-core-tools/bin"
                ),
          ],
        },
        error: undefined,
      });

      // Do not clean the symlink if user choose not to generate the symlink
      const symlink =
        noSymlinkTestData.historyPortableFuncVersion?.symlinkDir ??
        (noSymlinkTestData.portableFuncVersions.filter((v: any) => v.symlinkDir)?.[0] as any)
          ?.symlinkDir;
      if (symlink) {
        chai.assert.isTrue(await fs.pathExists(path.resolve(mock.projectDir, symlink)));
      } else {
        chai.assert.isFalse(await fs.pathExists(path.resolve(mock.projectDir, "./devTools/func")));
      }
      chai.assert.isTrue(await fs.pathExists(res.details.binFolders[0]));
      const funcVersion = await mockGetVersion(res.details.binFolders[0]);
      chai.assert.equal(funcVersion, noSymlinkTestData.linkedVersion);
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func.exe")));
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func")));
    });
  });

  const installFailureDataArr = [
    {
      message: "command throw error",
      func: async (version: string, baseFolder: string) => {
        await fs.ensureDir(getFuncBinFolder(baseFolder));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func"));
        throw new Error("Failed to install func");
      },
    },
    {
      message: "failed to get version",
      func: async (version: string, baseFolder: string) => {
        await fs.ensureDir(getFuncBinFolder(baseFolder));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func"));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func.exe"));
      },
    },
    {
      message: "installed not matched version",
      func: async (version: string, baseFolder: string) => {
        await fs.ensureDir(getFuncBinFolder(baseFolder));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func"));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func.exe"));
        await fs.writeJSON(path.resolve(getFuncBinFolder(baseFolder), "version.json"), {
          version: "3.0.0",
        });
      },
    },
    {
      message: "failed to get version, error format",
      func: async (version: string, baseFolder: string) => {
        await fs.ensureDir(getFuncBinFolder(baseFolder));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func"));
        await fs.ensureFile(path.resolve(getFuncBinFolder(baseFolder), "func.exe"));
        await fs.writeJSON(path.resolve(getFuncBinFolder(baseFolder), "version.json"), {
          version: "errorVersion",
        });
      },
    },
  ];
  installFailureDataArr.forEach((installFailureData) => {
    it(`failed to install func, ${installFailureData.message}`, async () => {
      const mock = await prepareTestEnv(
        "4.0.5",
        undefined,
        [],
        undefined,
        "14.0.0",
        "6",
        "Windows_NT",
        installFailureData.func
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: "4",
        projectPath: mock.projectDir,
        symlinkDir: "./devTools/func",
      });
      delete res["telemetryProperties"];
      const error = res.error;
      delete res.error;
      delete failedResult.error;
      chai.assert.equal(JSON.stringify(res), JSON.stringify(failedResult));
      chai.assert.isTrue(error instanceof DepsCheckerError);
      chai.assert.isFalse(await fs.pathExists(path.resolve(mock.projectDir, "./devTools/func")));
      // The data has been cleaned.
      const files = await fs.readdir(path.resolve(mock.homeDir, "./.fx/bin/azfunc"), {
        withFileTypes: true,
      });
      chai.assert.equal(files.length, 0);
    });
  });

  it(`failed to find node`, async () => {
    const mock = await prepareTestEnv(
      "4.0.5",
      undefined,
      [],
      undefined,
      undefined,
      "6",
      "Windows_NT"
    );
    const funcToolChecker = new mock.module.FuncToolChecker();
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./devTools/func",
    });
    delete res["telemetryProperties"];
    const error = res.error;
    delete res.error;
    chai.assert.equal(
      JSON.stringify(res),
      JSON.stringify({
        name: "Azure Functions Core Tools",
        type: "func-core-tools",
        isInstalled: false,
        command: "func",
        details: {
          isLinuxSupported: false,
          installVersion: undefined,
          supportedVersions: [],
          binFolders: undefined,
        },
      })
    );
    chai.assert.isTrue(error instanceof NodejsNotFoundError);
  });

  it(`failed to find npm`, async () => {
    const mock = await prepareTestEnv(
      "4.0.5",
      undefined,
      [],
      undefined,
      "14.0.0",
      undefined,
      "Windows_NT"
    );
    const funcToolChecker = new mock.module.FuncToolChecker();
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./devTools/func",
    });
    delete res["telemetryProperties"];
    const error = res.error;
    delete res.error;
    delete failedResult.error;
    chai.assert.equal(JSON.stringify(res), JSON.stringify(failedResult));
    chai.assert.isTrue(error instanceof DepsCheckerError);
  });

  it(`throw error in linux`, async () => {
    const mock = await prepareTestEnv("4.0.5", undefined, [], undefined, "14.0.0", "6", "Linux");
    const funcToolChecker = new mock.module.FuncToolChecker();
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./devTools/func",
    });
    delete res["telemetryProperties"];
    delete res.error;
    delete failedResult.error;
    chai.assert.equal(JSON.stringify(res), JSON.stringify(failedResult));
  });

  it(`white space in path`, async () => {
    const mock = await prepareTestEnv(
      "4.0.5",
      undefined,
      [],
      undefined,
      "14.0.0",
      "6",
      "Windows_NT",
      undefined,
      true
    );
    const funcToolChecker = new mock.module.FuncToolChecker();
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./dev tools/func",
    });
    delete res["telemetryProperties"];

    chai.assert.deepEqual(res, {
      name: "Azure Functions Core Tools",
      type: "func-core-tools",
      isInstalled: true,
      command: "func",
      details: {
        isLinuxSupported: false,
        installVersion: "4.0.5",
        supportedVersions: [],
        binFolders: [path.resolve(mock.projectDir, "./dev tools/func")],
      },
      error: undefined,
    });
  });

  it(`path has already exist`, async () => {
    const mock = await prepareTestEnv(
      "4.0.5",
      undefined,
      [],
      undefined,
      "14.0.0",
      "6",
      "Windows_NT"
    );
    const funcToolChecker = new mock.module.FuncToolChecker();
    await fs.ensureFile(path.resolve(mock.projectDir, "./devtools/func"));
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./devtools/func",
    });
    delete res["telemetryProperties"];
    delete res.error;
    delete failedResult.error;
    chai.assert.equal(JSON.stringify(res), JSON.stringify(failedResult));
  });

  it.skip(`wrong func in the azfunc folder, find a target version`, async () => {
    const mock = await prepareTestEnv(
      undefined,
      undefined,
      [
        { version: "4.0.0" },
        { version: "errorFolder" },
        { version: "4.0.1" },
        { version: "4.0.2" },
        { version: "4.0.4" },
        { version: "4.0.5" },
      ],
      undefined,
      "14.0.0",
      "6",
      "Windows_NT"
    );

    // 4.0.5 => version not match
    await fs.writeJSON(
      path.resolve(
        getFuncBinFolder(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.5/")),
        "version.json"
      ),
      {
        version: "4.0.4",
      }
    );
    // 4.0.4 => sentinel file not exist
    await fs.remove(
      path.resolve(
        getFuncBinFolder(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.4/")),
        "func-sentinel"
      )
    );
    // 4.0.3 => empty
    await fs.ensureDir(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.3/"));
    // 4.0.2 => error version
    await fs.writeJSON(
      path.resolve(
        getFuncBinFolder(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.2/")),
        "version.json"
      ),
      {
        version: "error version",
      }
    );
    const funcToolChecker = new mock.module.FuncToolChecker();
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./devtools/func",
    });
    delete res["telemetryProperties"];

    chai.assert.deepEqual(res, {
      name: "Azure Functions Core Tools",
      type: "func-core-tools",
      isInstalled: true,
      command: "func",
      details: {
        isLinuxSupported: false,
        installVersion: "4.0.1",
        supportedVersions: [],
        binFolders: [path.resolve(mock.projectDir, "./devtools/func")],
      },
      error: undefined,
    });
  });

  it(`wrong func in the azfunc folder, no version find`, async () => {
    const mock = await prepareTestEnv(
      undefined,
      undefined,
      [
        { version: "errorFolder" },
        { version: "4.0.2" },
        { version: "4.0.4" },
        { version: "4.0.5" },
      ],
      undefined,
      "14.0.0",
      "6",
      "Windows_NT"
    );

    // 4.0.5 => version not match
    await fs.writeJSON(
      path.resolve(
        getFuncBinFolder(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.5/")),
        "version.json"
      ),
      {
        version: "4.0.4",
      }
    );
    // 4.0.4 => sentinel file not exist
    await fs.remove(
      path.resolve(
        getFuncBinFolder(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.4/")),
        "func-sentinel"
      )
    );
    // 4.0.3 => empty
    await fs.ensureDir(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.3/"));
    // 4.0.2 => error version
    await fs.writeJSON(
      path.resolve(
        getFuncBinFolder(path.resolve(mock.homeDir, "./.fx/bin/azfunc/4.0.2/")),
        "version.json"
      ),
      {
        version: "error version",
      }
    );
    const funcToolChecker = new mock.module.FuncToolChecker();
    const res = await funcToolChecker.resolve({
      version: "4",
      projectPath: mock.projectDir,
      symlinkDir: "./devtools/func",
    });
    delete res["telemetryProperties"];
    delete res.error;
    delete failedResult.error;
    chai.assert.equal(JSON.stringify(res), JSON.stringify(failedResult));
  });

  const nodeVersionValidationDataArr = [
    // not match cases
    {
      funcVersion: "4.0.0",
      nodeVersion: "22.0.0",
      isSuccess: false,
    },
    {
      funcVersion: "4.0.5529",
      nodeVersion: "24.0.0",
      isSuccess: false,
    },
    // match cases
    {
      funcVersion: "4.0.5530",
      nodeVersion: "22.0.0",
      isSuccess: true,
    },
    {
      funcVersion: "4.12.0",
      nodeVersion: "22.0.0",
      isSuccess: true,
    },
    {
      funcVersion: "4.0.5530",
      nodeVersion: "24.0.0",
      isSuccess: true,
    },
    {
      funcVersion: "4.12.0",
      nodeVersion: "24.0.0",
      isSuccess: true,
    },
    // ignore validation cases (node version not in mapping table)
    {
      funcVersion: "4.0.0",
      nodeVersion: "18.0.0",
      isSuccess: true,
    },
    {
      funcVersion: "4.0.0",
      nodeVersion: "20.0.0",
      isSuccess: true,
    },
  ];
  nodeVersionValidationDataArr.forEach((nodeVersionValidationData) => {
    it(`validate node and func version, func - ${nodeVersionValidationData.funcVersion}, node - ${nodeVersionValidationData.nodeVersion}`, async () => {
      const mock = await prepareTestEnv(
        nodeVersionValidationData.funcVersion,
        undefined,
        [],
        undefined,
        nodeVersionValidationData.nodeVersion,
        "6",
        "Windows_NT"
      );
      const funcToolChecker = new mock.module.FuncToolChecker();
      const res = await funcToolChecker.resolve({
        version: nodeVersionValidationData.funcVersion,
        projectPath: mock.projectDir,
        symlinkDir: "./devTools/func",
      });
      delete res["telemetryProperties"];
      delete res.error;
      chai.assert.equal(
        JSON.stringify(res),
        JSON.stringify({
          name: "Azure Functions Core Tools",
          type: "func-core-tools",
          isInstalled: true,
          command: "func",
          details: {
            isLinuxSupported: false,
            installVersion: nodeVersionValidationData.funcVersion,
            supportedVersions: [],
            binFolders: [path.resolve(mock.projectDir, "./devTools/func")],
          },
        })
      );
      const stat = await fs.lstat(res.details.binFolders[0]);
      chai.assert.isTrue(stat.isSymbolicLink(), "isSymbolicLink");
      const funcVersion = await mockGetVersion(res.details.binFolders[0]);
      chai.assert.equal(funcVersion, nodeVersionValidationData.funcVersion);
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func.exe")));
      chai.assert.isTrue(await fs.pathExists(path.join(res.details.binFolders[0], "func")));
      chai.assert.isTrue(
        await fs.pathExists(path.join(res.details.binFolders[0], "func-sentinel"))
      );
    });
  });

  const failedResult: any = {
    name: "Azure Functions Core Tools",
    type: "func-core-tools",
    isInstalled: false,
    command: "func",
    details: {
      isLinuxSupported: false,
      installVersion: undefined,
      supportedVersions: [],
      binFolders: undefined,
    },
    error: {
      helpLink: v3DefaultHelpLink,
    },
  };
  const prepareTestEnv = async (
    installFuncVersion: string | undefined,
    historyPortableFuncVersion: { version: string; symlinkDir?: string } | undefined,
    portableFuncs: { version: string; symlinkDir?: string }[],
    globalFuncVersion: string | undefined,
    nodeVersion: string | undefined,
    npmMajorVersion: "6" | "7" | undefined,
    osType: "Windows_NT" | "Darwin" | "Linux",
    overrideInstallFunc?: (version: string, baseFolder: string) => Promise<void>,
    whitespaceInPath = false
  ): Promise<{ module: any; projectDir: string; homeDir: string }> => {
    // Init test folder
    testPath = path.resolve(
      baseDir,
      whitespaceInPath ? uuid.v4().substring(0, 6) + " whitespace" : uuid.v4().substring(0, 6)
    );
    await fs.ensureDir(testPath);
    const homeDir = path.resolve(testPath, "homeDir");
    await fs.ensureDir(homeDir);
    const projectDir = path.resolve(testPath, "projectDir");
    await fs.ensureDir(projectDir);

    // Init history func
    if (historyPortableFuncVersion) {
      const installPath = path.resolve(homeDir, `.${ConfigFolderName}`, "bin", "func");
      await mockInstallFunc(historyPortableFuncVersion.version, installPath, true, true);
      if (historyPortableFuncVersion.symlinkDir) {
        const symlinkPath = path.resolve(projectDir, historyPortableFuncVersion.symlinkDir);
        await fs.mkdir(path.dirname(symlinkPath), { recursive: true, mode: 0o777 });
        await fs.ensureSymlink(getFuncBinFolder(installPath), symlinkPath, "junction");
      }
    }

    for (const portableFunc of portableFuncs) {
      const installPath = path.resolve(
        homeDir,
        `.${ConfigFolderName}`,
        "bin",
        "azfunc",
        portableFunc.version
      );
      await mockInstallFunc(portableFunc.version, installPath, true, false);
      if (portableFunc.symlinkDir) {
        const symlinkPath = path.resolve(projectDir, portableFunc.symlinkDir);
        await fs.mkdir(path.dirname(symlinkPath), { recursive: true, mode: 0o777 });
        await fs.ensureSymlink(getFuncBinFolder(installPath), symlinkPath, "junction");
      }
    }

    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.mocked(os.type).mockReturnValue(osType);
    const module = { FuncToolChecker };

    vi.spyOn(cpUtils, "executeCommand").mockImplementation(
      async (
        workingDirectory: string | undefined,
        logger: DebugLogger | undefined,
        options: SpawnOptions | undefined,
        command: string,
        ...args: string[]
      ) => {
        if (command === "node" && args.length == 1 && args[0] === "--version") {
          // Mock query node version
          if (!nodeVersion) {
            throw new Error("Mock node not installed.");
          }
          return `v${nodeVersion}`;
        } else if (command.endsWith('func"') && args.length == 1 && args[0] === "--version") {
          if (command === '"func"') {
            // Mock query global func version
            if (!globalFuncVersion) {
              throw new Error("Mock global func not installed.");
            }
            return globalFuncVersion;
          } else {
            const funcBinPath = path.dirname(command.substring(1, command.length - 1));
            return await mockGetVersion(funcBinPath);
          }
        } else if (command === "npm" && args.length == 1 && args[0] === "--version") {
          // Mock query npm version
          if (!npmMajorVersion) {
            throw new Error("Mock npm not installed.");
          }
          return `${npmMajorVersion}.0.0`;
        } else if (args.length > 4 && args[0] === "install") {
          // Mock install func
          if (!installFuncVersion) {
            throw new Error("Mock install failed");
          }
          if (overrideInstallFunc) {
            await overrideInstallFunc(installFuncVersion, args[3].substring(1, args[3].length - 1));
          } else {
            await mockInstallFunc(
              installFuncVersion,
              args[3].substring(1, args[3].length - 1),
              false,
              false
            );
          }
          return "";
        } else {
          throw new Error("Not mocked error");
        }
      }
    );
    return { module: module, projectDir: projectDir, homeDir: homeDir };
  };
});

function getFuncBinFolder(baseFolder: string): string {
  return path.resolve(baseFolder, "./node_modules/azure-functions-core-tools/bin");
}
async function mockInstallFunc(
  version: string,
  baseFolder: string,
  isExisting = true,
  isGlobal = false
) {
  const binFolder = getFuncBinFolder(baseFolder);
  await fs.ensureDir(binFolder);
  await fs.ensureFile(path.resolve(binFolder, "func"));
  await fs.ensureFile(path.resolve(binFolder, "func.exe"));

  if (isExisting) {
    const funcSentinelPath = isGlobal
      ? path.resolve(baseFolder, "../../func-sentinel")
      : path.resolve(binFolder, "func-sentinel");
    await fs.ensureFile(funcSentinelPath);
  }
  await fs.writeJSON(path.resolve(binFolder, "version.json"), { version });
}

async function mockGetVersion(binFolder: string): Promise<string> {
  try {
    const versionJson = await fs.readJSON(path.resolve(binFolder, "version.json"));
    if (!versionJson?.version) {
      throw new Error("Failed to get func version");
    }
    return versionJson.version as string;
  } catch {
    throw new Error("Failed to get func version");
  }
}
