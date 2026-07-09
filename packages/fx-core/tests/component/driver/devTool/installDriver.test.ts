// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { chai, expect, vi } from "vitest";
import { getLocalizedString } from "../../../../src/common/localizeUtils";
import { DepsType, TestToolReleaseType } from "../../../../src/component/deps-checker/depsChecker";
import { DotnetChecker } from "../../../../src/component/deps-checker/internal/dotnetChecker";
import { FuncToolChecker } from "../../../../src/component/deps-checker/internal/funcToolChecker";
import { TestToolChecker } from "../../../../src/component/deps-checker/internal/testToolChecker";
import {
  ToolsInstallDriver,
  ToolsInstallDriverImpl,
} from "../../../../src/component/driver/devTool/installDriver";
import { InstallToolArgs } from "../../../../src/component/driver/devTool/interfaces/InstallToolArgs";
import { nodejsInstaller } from "../../../../src/component/driver/devTool/nodeInstaller";
import { LocalCertificateManager } from "../../../../src/component/local/localCertificateManager";
import {
  CoreSource,
  DepsCheckerError,
  InstallNodeJSError,
  InvalidActionInputError,
} from "../../../../src/error";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

describe("Tools Install Driver test", () => {
  const sandbox = vi;
  const toolsInstallDriver = new ToolsInstallDriver();
  const mockedDriverContext: any = {
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "/path/to/project",
  };

  describe("Trust Cert test (run)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("TEST1", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: true,
        alreadyTrusted: false,
      });
      const res = await toolsInstallDriver.run({ devCert: { trust: true } }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Already trust local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: true,
        alreadyTrusted: true,
      });
      const res = await toolsInstallDriver.run({ devCert: { trust: true } }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Skip trust new local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: undefined,
        alreadyTrusted: undefined,
      });
      const res = await toolsInstallDriver.run({ devCert: { trust: false } }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value.entries());
      }
    });

    it("Failed to trust new local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: false,
        error: new UserError({
          error: new Error("test error"),
          source: CoreSource,
          name: "SetupCertificateError",
        }),
      });
      const res = await toolsInstallDriver.run({ devCert: { trust: true } }, mockedDriverContext);
      chai.assert.isTrue(res.isErr());
    });

    it("Invalid parameter", async () => {
      const res = await toolsInstallDriver.run(
        { devCert: { trust: "hello" } } as unknown as InstallToolArgs,
        mockedDriverContext
      );
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("Func installation test (run)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Install func", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["./devTools/func"],
        },
      });
      const res = await toolsInstallDriver.run(
        { func: { version: "4", symlinkDir: "./devTools/func" } },
        mockedDriverContext
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Install func without symlinkDir", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["~/.fx/bin/func/node_modules/azure-functions-core-tools/bin"],
        },
      });
      const res = await toolsInstallDriver.run({ func: { version: "4" } }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Failed to install func", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: false,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: undefined,
        },
        error: new DepsCheckerError(
          { default: "test message", localized: "test message" },
          "test link"
        ),
      });
      const res = await toolsInstallDriver.run(
        { func: { version: 4, symlinkDir: "./devTools/func" } },
        mockedDriverContext
      );
      chai.assert.isTrue(res.isErr());
    });

    it("Install func with warning", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["/devTools/func1"],
        },
        telemetryProperties: {
          "global-func-version": "3.0.0",
        },
        error: new DepsCheckerError(
          { default: "warning message", localized: "warning message" },
          "test link"
        ),
      });
      const res = await toolsInstallDriver.run(
        { func: { version: "4", symlinkDir: "./devTools/func1" } },
        mockedDriverContext
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    const invalidParams: any[] = [
      { version: "hello" },
      false,
      { hello: "hello" },
      { version: "#2", symlinkDir: "./devTools" },
      { version: "#2", symlinkDir: 123 },
      { symlinkDir: 123 },
    ];
    invalidParams.forEach((invalidParam: any) => {
      it(`Invalid parameter - ${JSON.stringify(invalidParam)}`, async () => {
        vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
          name: "Azure Functions Core Tools",
          type: DepsType.FuncCoreTools,
          isInstalled: true,
          command: "func",
          details: {
            isLinuxSupported: false,
            supportedVersions: [],
            installVersion: "4.0.0",
            binFolders: ["./devTools/func"],
          },
        });
        const res = await toolsInstallDriver.run(
          { func: invalidParam } as unknown as InstallToolArgs,
          mockedDriverContext
        );
        chai.assert.isTrue(res.isErr());
      });
    });
  });

  describe("Dotnet installation test (run)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Install dotnet", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: ["~/.fx/dotnet/dotnet.exe"],
        },
      });
      const res = await toolsInstallDriver.run({ dotnet: true }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Install dotnet: empty bin folders", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: [],
        },
      });
      const res = await toolsInstallDriver.run({ dotnet: true }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Install dotnet: undefined bin folders", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: undefined,
        },
      });
      const res = await toolsInstallDriver.run({ dotnet: true }, mockedDriverContext);
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
    });

    it("Failed to install dotnet", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: false,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: ["~/.fx/dotnet/dotnet.exe"],
        },
        error: new DepsCheckerError(
          { default: "test message", localized: "test message" },
          "test link"
        ),
      });
      const res = await toolsInstallDriver.run({ dotnet: true }, mockedDriverContext);
      chai.assert.isTrue(res.isErr());
    });

    it("Invalid parameter", async () => {
      const res = await toolsInstallDriver.run(
        { dotnet: { version: "hello" } } as unknown as InstallToolArgs,
        mockedDriverContext
      );
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("Test Tool installation test (run)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Install test tool", async () => {
      const resolveStub = vi.spyOn(TestToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Microsoft 365 Agents Playground",
        type: DepsType.TestTool,
        isInstalled: true,
        command: "teamsapptester",
        details: {
          isLinuxSupported: true,
          supportedVersions: [],
          installVersion: "0.1.0",
          binFolders: ["./devTools/testTool"],
        },
      });
      const ensureNodeStub = vi
        .spyOn(nodejsInstaller, "ensureNodeJS")
        .mockResolvedValue(ok({ status: "ignore" }));

      const res = await toolsInstallDriver.run(
        {
          testTool: { version: "~0.1.0", symlinkDir: "./devTools/testTool" },
          nodejs: { symlinkDir: "./devTools/nodejs" },
        },
        mockedDriverContext
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.isEmpty(res.value);
      }
      expect(resolveStub).toHaveBeenCalledWith({
        versionRange: "~0.1.0",
        symlinkDir: "./devTools/testTool",
        releaseType: TestToolReleaseType.Npm,
        projectPath: mockedDriverContext.projectPath,
      });
      chai.assert.isTrue(ensureNodeStub.mock.calls.length === 1);
    });

    // it("Install test tool failed without error", async () => {
    //   vi.spyOn(TestToolChecker.prototype, "resolve").mockResolvedValue({
    //     name: "Microsoft 365 Agents Playground",
    //     type: DepsType.TestTool,
    //     isInstalled: false,
    //     command: "teamsapptester",
    //     details: {
    //       isLinuxSupported: true,
    //       supportedVersions: [],
    //       installVersion: "0.1.0",
    //       binFolders: ["./devTools/testTool"],
    //     },
    //   });
    //   const res = await toolsInstallDriver.run(
    //     { testTool: { version: "~0.1.0", symlinkDir: "./devTools/testTool" } },
    //     mockedDriverContext
    //   );
    //   chai.assert.isTrue(res.isErr());
    // });
    // it("Install test tool failed with error", async () => {
    //   vi.spyOn(TestToolChecker.prototype, "resolve").mockResolvedValue({
    //     name: "Microsoft 365 Agents Playground",
    //     type: DepsType.TestTool,
    //     isInstalled: false,
    //     command: "teamsapptester",
    //     details: {
    //       isLinuxSupported: true,
    //       supportedVersions: [],
    //       installVersion: "0.1.0",
    //       binFolders: ["./devTools/testTool"],
    //     },
    //     error: new DepsCheckerError("failed", "help link"),
    //   });
    //   const res = await toolsInstallDriver.run(
    //     { testTool: { version: "~0.1.0", symlinkDir: "./devTools/testTool" } },
    //     mockedDriverContext
    //   );
    //   chai.assert.isTrue(res.isErr());
    // });
    const cases: { name: string; args: unknown; expected: boolean }[] = [
      {
        name: "happy path",
        args: { testTool: { version: "~1", symlinkDir: "./devTools/testTool" } },
        expected: true,
      },
      { name: "not an object", args: { testTool: 1 }, expected: false },
      { name: "version is not string", args: { testTool: { version: [] } }, expected: false },
      {
        name: "version is invalid semver",
        args: { testTool: { version: "a.b" } },
        expected: false,
      },
      {
        name: "invalid symlinkDir",
        args: { testTool: { version: "~1", symlinkDir: 1 } },
        expected: false,
      },
    ];
    for (const c of cases) {
      it("Install test tool args check " + c.name, async () => {
        vi.spyOn(TestToolChecker.prototype, "resolve").mockResolvedValue({
          name: "Microsoft 365 Agents Playground",
          type: DepsType.TestTool,
          isInstalled: true,
          command: "teamsapptester",
          details: {
            isLinuxSupported: true,
            supportedVersions: [],
            installVersion: "0.1.0",
            binFolders: ["./devTools/testTool"],
          },
        });
        const res = await toolsInstallDriver.run(c.args as InstallToolArgs, mockedDriverContext);
        chai.assert.equal(res.isOk(), c.expected);
      });
    }
  });

  describe("Trust Cert test (execute)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Create and trust new local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: true,
        alreadyTrusted: false,
      });
      const outputEnvVarNames = new Map([
        ["sslCertFile", "MY_SSL_CRT_FILE"],
        ["sslKeyFile", "MY_SSL_KEY_FILE"],
      ]);
      const res = await toolsInstallDriver.execute(
        { devCert: { trust: true } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.includeDeepMembers(Array.from(res.result.value.entries()), [
          ["MY_SSL_CRT_FILE", "testCertPath"],
          ["MY_SSL_KEY_FILE", "testKeyPath"],
        ]);
      }
    });

    it("Create and trust new local certificate: empty outputEnvVarNames", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: true,
        alreadyTrusted: false,
      });
      const outputEnvVarNames = new Map();
      const res = await toolsInstallDriver.execute(
        { devCert: { trust: true } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value);
      }
    });

    it("Already trust local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: true,
        alreadyTrusted: true,
      });
      const outputEnvVarNames = new Map([
        ["sslCertFile", "MY_SSL_CRT_FILE"],
        ["sslKeyFile", "MY_SSL_KEY_FILE"],
      ]);
      const res = await toolsInstallDriver.execute(
        { devCert: { trust: true } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.includeDeepMembers(Array.from(res.result.value.entries()), [
          ["MY_SSL_CRT_FILE", "testCertPath"],
          ["MY_SSL_KEY_FILE", "testKeyPath"],
        ]);
      }
    });

    it("Skip trust new local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: undefined,
        alreadyTrusted: undefined,
      });
      const outputEnvVarNames = new Map([
        ["sslCertFile", "MY_SSL_CRT_FILE"],
        ["sslKeyFile", "MY_SSL_KEY_FILE"],
      ]);
      const res = await toolsInstallDriver.execute(
        { devCert: { trust: false } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value.entries());
      }
    });

    it("Failed to trust new local certificate", async () => {
      vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
        certPath: "testCertPath",
        keyPath: "testKeyPath",
        isTrusted: false,
        error: new UserError({
          error: new Error("test error"),
          source: CoreSource,
          name: "SetupCertificateError",
        }),
      });
      const outputEnvVarNames = new Map([
        ["sslCertFile", "MY_SSL_CRT_FILE"],
        ["sslKeyFile", "MY_SSL_KEY_FILE"],
      ]);
      const res = await toolsInstallDriver.execute(
        { devCert: { trust: true } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isEmpty(res.summaries);
      chai.assert.isTrue(res.result.isErr());
    });

    it("Invalid parameter", async () => {
      const outputEnvVarNames = new Map([
        ["sslCertFile", "MY_SSL_CRT_FILE"],
        ["sslKeyFile", "MY_SSL_KEY_FILE"],
      ]);
      const res = await toolsInstallDriver.execute(
        { devCert: { trust: "hello" } } as unknown as InstallToolArgs,
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isEmpty(res.summaries);
      chai.assert.isTrue(res.result.isErr());
    });
  });

  describe("Func installation test (execute)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Install func", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["./devTools/func"],
        },
      });
      const outputEnvVarNames = new Map([["funcPath", "MY_FUNC_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { func: { version: "~4.0.0", symlinkDir: "./devTools/func" } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.includeDeepMembers(Array.from(res.result.value.entries()), [
          ["MY_FUNC_PATH", "./devTools/func"],
        ]);
      }
    });

    it("Install func without symlinkDir", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["~/.fx/bin/func/node_modules/azure-functions-core-tools/bin"],
        },
      });
      const outputEnvVarNames = new Map([["funcPath", "MY_FUNC_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { func: { version: 4 } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value.entries());
      }
    });

    it("Install func: empty outputEnvVarNames", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["./devTools/func"],
        },
      });
      const outputEnvVarNames = new Map();
      const res = await toolsInstallDriver.execute(
        { func: { version: "4", symlinkDir: "./devTools/func" } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value);
      }
    });

    it("Failed to install func", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: false,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: undefined,
        },
        error: new DepsCheckerError(
          { default: "test message", localized: "test message" },
          "test link"
        ),
      });
      const outputEnvVarNames = new Map([["funcPath", "MY_FUNC_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { func: { version: "4", symlinkDir: "./devTools/func" } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isEmpty(res.summaries);
      chai.assert.isTrue(res.result.isErr());
    });

    it("Install func with warning", async () => {
      vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
        name: "Azure Functions Core Tools",
        type: DepsType.FuncCoreTools,
        isInstalled: true,
        command: "func",
        details: {
          isLinuxSupported: false,
          supportedVersions: [],
          installVersion: "4.0.0",
          binFolders: ["./devTools/func"],
        },
        error: new DepsCheckerError(
          { default: "warning message", localized: "warning message" },
          "test link"
        ),
      });
      const outputEnvVarNames = new Map([["funcPath", "MY_FUNC_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { func: { version: "4", symlinkDir: "./devTools/func" } },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.includeDeepMembers(Array.from(res.result.value.entries()), [
          ["MY_FUNC_PATH", "./devTools/func"],
        ]);
      }
    });

    const invalidParams: any[] = [
      { version: "hello" },
      false,
      { hello: "hello" },
      { version: "#2", symlinkDir: "./devTools" },
      { version: "#2", symlinkDir: 123 },
      { symlinkDir: 123 },
    ];
    invalidParams.forEach((invalidParam: any) => {
      it(`Invalid parameter - ${JSON.stringify(invalidParam)}`, async () => {
        vi.spyOn(FuncToolChecker.prototype, "resolve").mockResolvedValue({
          name: "Azure Functions Core Tools",
          type: DepsType.FuncCoreTools,
          isInstalled: true,
          command: "func",
          details: {
            isLinuxSupported: false,
            supportedVersions: [],
            installVersion: "4.0.0",
            binFolders: ["./devTools/func"],
          },
        });
        const outputEnvVarNames = new Map([["funcPath", "MY_FUNC_PATH"]]);
        const res = await toolsInstallDriver.execute(
          { func: invalidParam } as unknown as InstallToolArgs,
          mockedDriverContext,
          outputEnvVarNames
        );
        chai.assert.isEmpty(res.summaries);
        chai.assert.isTrue(res.result.isErr());
      });
    });
  });

  describe("Dotnet installation test (execute)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Install dotnet", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: ["~/.fx/dotnet/dotnet.exe"],
        },
      });
      const outputEnvVarNames = new Map([["dotnetPath", "MY_DOTNET_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { dotnet: true },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.includeDeepMembers(Array.from(res.result.value.entries()), [
          ["MY_DOTNET_PATH", "~/.fx/dotnet"],
        ]);
      }
    });

    it("Install dotnet: empty outputEnvVarNames", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: ["~/.fx/dotnet/dotnet.exe"],
        },
      });
      const outputEnvVarNames = new Map();
      const res = await toolsInstallDriver.execute(
        { dotnet: true },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value);
      }
    });

    it("Install dotnet: empty bin folders", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: [],
        },
      });
      const outputEnvVarNames = new Map([["dotnetPath", "MY_DOTNET_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { dotnet: true },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.includeDeepMembers(Array.from(res.result.value.entries()), [
          ["MY_DOTNET_PATH", ""],
        ]);
      }
    });

    it("Install dotnet: undefined details", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: undefined as any,
      });
      const outputEnvVarNames = new Map([["dotnetPath", "MY_DOTNET_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { dotnet: true },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value);
      }
    });

    it("Install dotnet: undefined bin folders", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: true,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: undefined,
        },
      });
      const outputEnvVarNames = new Map([["dotnetPath", "MY_DOTNET_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { dotnet: true },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isNotEmpty(res.summaries);
      chai.assert.isTrue(res.result.isOk());
      if (res.result.isOk()) {
        chai.assert.isEmpty(res.result.value);
      }
    });

    it("Failed to install dotnet", async () => {
      vi.spyOn(DotnetChecker.prototype, "resolve").mockResolvedValue({
        name: ".NET Core SDK",
        type: DepsType.Dotnet,
        isInstalled: false,
        command: "~/.fx/dotnet/dotnet.exe",
        details: {
          isLinuxSupported: false,
          installVersion: "3.1",
          supportedVersions: ["3.1", "5.0", "6.0"],
          binFolders: ["~/.fx/dotnet/dotnet.exe"],
        },
        error: new DepsCheckerError(
          { default: "test message", localized: "test message" },
          "test link"
        ),
      });
      const outputEnvVarNames = new Map([["dotnetPath", "MY_DOTNET_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { dotnet: true },
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isEmpty(res.summaries);
      chai.assert.isTrue(res.result.isErr());
    });

    it("Invalid parameter", async () => {
      const outputEnvVarNames = new Map([["dotnetPath", "MY_DOTNET_PATH"]]);
      const res = await toolsInstallDriver.execute(
        { dotnet: { version: "hello" } } as unknown as InstallToolArgs,
        mockedDriverContext,
        outputEnvVarNames
      );
      chai.assert.isTrue(res.result.isErr());
      chai.assert.isEmpty(res.summaries);
      chai.assert.isTrue(res.result.isErr());
    });
  });

  describe("ToolsInstallDriverImpl.validateArgs", () => {
    const mockedDriverContext: any = {
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      projectPath: "/path/to/project",
    };
    const impl = new ToolsInstallDriverImpl(mockedDriverContext);
    it("Invalid parameter", async () => {
      try {
        impl.validateArgs({ nodejs: "" } as any);
        chai.assert.fail("should throw error");
      } catch (e: any) {
        chai.assert.isTrue(e instanceof InvalidActionInputError);
      }
    });
    it("Invalid parameter", async () => {
      try {
        impl.validateArgs({ nodejs: { symlinkDir: {} } } as any);
        chai.assert.fail("should throw error");
      } catch (e: any) {
        chai.assert.isTrue(e instanceof InvalidActionInputError);
      }
    });
    it("success", async () => {
      try {
        impl.validateArgs({ nodejs: { symlinkDir: "." } } as any);
      } catch (e: any) {
        chai.assert.fail("should not throw error");
      }
    });
    it("empty", async () => {
      try {
        impl.validateArgs({} as any);
      } catch (e: any) {
        chai.assert.fail("should not throw error");
      }
    });
  });

  describe("ToolsInstallDriverImpl.resolveNodeJS", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    const context: any = {
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      projectPath: "/path/to/project",
      addSummary: (summary: string) => {
        console.log(summary);
      },
    };
    const impl = new ToolsInstallDriverImpl(context);
    it("success to install in user folder", async () => {
      vi.spyOn(nodejsInstaller, "ensureNodeJS").mockResolvedValue(
        ok({ status: "installed", installPath: "/path/to/nodejs" })
      );
      vi.spyOn(fs, "lstat").mockRejectedValue({ code: "ENOENT" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(fs, "ensureSymlink").mockResolvedValue();
      const addSummary = vi.spyOn(context, "addSummary");
      await impl.resolveNodeJS("./devTool/nodejs");
      expect(addSummary).toHaveBeenCalledWith(
        getLocalizedString("action.devTool.nodeInstaller.Summary.installInPath", "/path/to/nodejs")
      );
    });
    it("already installed in system", async () => {
      vi.spyOn(nodejsInstaller, "ensureNodeJS").mockResolvedValue(ok({ status: "ignore" }));
      const addSummary = vi.spyOn(context, "addSummary");
      await impl.resolveNodeJS("./devTool/nodejs");
      expect(addSummary).toHaveBeenCalledWith(
        getLocalizedString("action.devTool.nodeInstaller.Summary.installInSystem")
      );
    });
    it("error", async () => {
      vi.spyOn(nodejsInstaller, "ensureNodeJS").mockResolvedValue(err(new InstallNodeJSError("")));
      const addSummary = vi.spyOn(context, "addSummary");
      try {
        await impl.resolveNodeJS("./devTool/nodejs");
        chai.assert.fail("should throw error");
      } catch (e: any) {
        chai.assert.isTrue(e instanceof InstallNodeJSError);
      }
      chai.assert.isTrue(addSummary.mock.calls.length === 0);
    });
    it("throw error");
  });
});
