// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, TeamsAppManifest, err, ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { TOOLS, setTools } from "../../../../src/common/globalVars";
import { ConfigureTeamsAppDriver } from "../../../../src/component/driver/teamsApp/configure";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { PublishAppPackageDriver } from "../../../../src/component/driver/teamsApp/publishAppPackage";
import {
  teamsAppMgrDeps,
  teamsappMgr,
} from "../../../../src/component/driver/teamsApp/teamsappMgr";
import { ValidateManifestDriver } from "../../../../src/component/driver/teamsApp/validate";
import { ValidateAppPackageDriver } from "../../../../src/component/driver/teamsApp/validateAppPackage";
import { envUtil } from "../../../../src/component/utils/envUtil";
import { pathUtils } from "../../../../src/component/utils/pathUtils";
import {
  FileNotFoundError,
  MissingRequiredInputError,
  UserCancelError,
} from "../../../../src/error";
import { MockTools } from "../../../core/utils";
import { chai, vi } from "vitest";

describe("TeamsAppMgr", async () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe("ensureAppPackageFile", async () => {
    it("sucess", async () => {
      vi.spyOn(teamsappMgr, "packageTeamsApp").mockResolvedValue(
        ok({ manifestPath: "", outputJsonPath: "", outputZipPath: "" })
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      const result = await teamsappMgr.ensureAppPackageFile({
        projectPath: "",
        platform: Platform.CLI,
      });
      chai.assert(result.isOk());
    });
    it("file not found", async () => {
      vi.spyOn(teamsappMgr, "packageTeamsApp").mockResolvedValue(
        ok({ manifestPath: "", outputJsonPath: "", outputZipPath: "" })
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await teamsappMgr.ensureAppPackageFile({
        projectPath: "",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr() && result.error instanceof FileNotFoundError);
    });
    it("packageTeamsApp returns error", async () => {
      vi.spyOn(teamsappMgr, "packageTeamsApp").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.ensureAppPackageFile({
        projectPath: "",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr() && result.error instanceof UserCancelError);
    });
  });

  describe("readManifestFromZip", async () => {
    it("sucess", async () => {
      const result = await teamsappMgr.readManifestFromZip(
        "./tests/component/driver/teamsApp/success.zip"
      );
      chai.assert(result.isOk());
    });
    it("fail", async () => {
      const result = await teamsappMgr.readManifestFromZip(
        "./tests/component/driver/teamsApp/fail.zip"
      );
      chai.assert(result.isErr());
    });
  });

  describe("checkAndTryToLoadEnv", async () => {
    it("no need to resolve", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("abc" as any);
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isOk() && result.value === undefined);
    });

    it("with env-file", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "loadEnvFile").mockResolvedValue(ok({}));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
        "env-file": "xxx",
      });
      chai.assert(result.isOk() && result.value === undefined);
    });

    it("with env-file but load fail", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "loadEnvFile").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
        "env-file": "xxx",
      });
      chai.assert(result.isErr() && result.error instanceof UserCancelError);
    });

    it("no env-file and list default envs fail", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr() && result.error instanceof UserCancelError);
    });

    it("no env-file and get default env folder fail", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr() && result.error instanceof UserCancelError);
    });

    it("no env-file and get default env folder returns undefined", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok(undefined));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isOk() && result.value === undefined);
    });

    it("has env input, success load target env file", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("abc"));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
        env: "dev",
      });
      chai.assert(result.isOk() && result.value === "dev");
    });

    it("has env input, but not target env file not found", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("abc"));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
        env: "dev2",
      });
      chai.assert(result.isErr() && result.error instanceof FileNotFoundError);
    });

    it("no env input, more than one env available", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "dev2"]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("abc"));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr() && result.error instanceof MissingRequiredInputError);
    });

    it("no env input, only one env available, just use it", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("abc"));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isOk() && result.value === "dev");
    });

    it("no env input, no env file found in default location, do nothing", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("${{APP_NAME}}" as any);
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok([]));
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("abc"));
      const result = await teamsappMgr.checkAndTryToLoadEnv({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isOk() && result.value === undefined);
    });
  });

  describe("packageTeamsApp", async () => {
    const tools = new MockTools();
    setTools(tools);
    it("no manifest file input, default does not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await teamsappMgr.packageTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });
    it("has manifest file input, but not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await teamsappMgr.packageTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr());
    });
    it("has manifest file and exists, checkAndTryToLoadEnv fail", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsappMgr, "checkAndTryToLoadEnv").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.packageTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr());
    });
    it("driver fail", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsappMgr, "checkAndTryToLoadEnv").mockResolvedValue(ok("dev"));
      vi.spyOn(teamsAppMgrDeps, "runForTypeSpecProject").mockResolvedValue();
      vi.spyOn(CreateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.packageTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr());
    });
    it("driver success", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsappMgr, "checkAndTryToLoadEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(teamsAppMgrDeps, "runForTypeSpecProject").mockResolvedValue();
      vi.spyOn(CreateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      const result = await teamsappMgr.packageTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isOk());
    });
  });

  describe("validateTeamsApp", async () => {
    const tools = new MockTools();
    setTools(tools);
    it("no manifest file and package file input, default does not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await teamsappMgr.validateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });
    it("input manifest file, load env fail", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsappMgr, "checkAndTryToLoadEnv").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.validateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr());
    });
    it("input manifest file, run driver fail", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsappMgr, "checkAndTryToLoadEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(ValidateManifestDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.validateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isErr());
    });
    it("input manifest file, run driver success", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(teamsappMgr, "checkAndTryToLoadEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(ValidateManifestDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      const result = await teamsappMgr.validateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "manifest-file": "xxx",
      });
      chai.assert(result.isOk());
    });
    it("input package file, run driver success", async () => {
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      const result = await teamsappMgr.validateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "package-file": "xxx",
      });
      chai.assert(result.isOk());
    });
    it("input package file, run driver fail", async () => {
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.validateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
        "package-file": "xxx",
      });
      chai.assert(result.isErr());
    });
  });

  describe("updateTeamsApp", async () => {
    const tools = new MockTools();
    setTools(tools);
    it("ensureAppPackageFile fail", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.updateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });

    it("ValidateAppPackageDriver fail", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.updateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });

    it("ConfigureTeamsAppDriver fail", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      vi.spyOn(ConfigureTeamsAppDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.updateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });

    it("readManifestFromZip fail", async () => {
      vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({ scope: [] })
      );
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(teamsappMgr, "readManifestFromZip").mockResolvedValue(err(new UserCancelError()));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      vi.spyOn(ConfigureTeamsAppDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      const result = await teamsappMgr.updateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });

    it("success", async () => {
      vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({ scope: [] })
      );
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(teamsappMgr, "readManifestFromZip").mockResolvedValue(ok(new TeamsAppManifest()));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      vi.spyOn(ConfigureTeamsAppDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      const result = await teamsappMgr.updateTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isOk());
    });
  });

  describe("publishTeamsApp", async () => {
    const tools = new MockTools();
    setTools(tools);
    it("ensureAppPackageFile fail", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(err(new UserCancelError()));
      const result = await teamsappMgr.publishTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });

    it("ValidateAppPackageDriver fail", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.publishTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });

    it("PublishAppPackageDriver fail", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      vi.spyOn(PublishAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserCancelError()),
        summaries: [],
      });
      const result = await teamsappMgr.publishTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isErr());
    });
    it("success", async () => {
      vi.spyOn(teamsappMgr, "ensureAppPackageFile").mockResolvedValue(ok(undefined));
      vi.spyOn(teamsappMgr, "readManifestFromZip").mockResolvedValue(ok(new TeamsAppManifest()));
      vi.spyOn(ValidateAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      vi.spyOn(PublishAppPackageDriver.prototype, "execute").mockResolvedValue({
        result: ok(new Map()),
        summaries: [],
      });
      const result = await teamsappMgr.publishTeamsApp({
        projectPath: "xxx",
        platform: Platform.CLI,
      });
      chai.assert(result.isOk());
    });
  });
});
