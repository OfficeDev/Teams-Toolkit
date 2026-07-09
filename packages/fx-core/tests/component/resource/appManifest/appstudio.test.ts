// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppManifestUtils,
  Context,
  InputsWithProjectPath,
  Platform,
  TeamsAppManifest,
  TeamsManifest,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { RestoreFn } from "mocked-env";
import Container from "typedi";
import { chai, vi } from "vitest";
import { teamsDevPortalClient } from "../../../../src/client/teamsDevPortalClient";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { ExecutionResult } from "../../../../src/component/driver/interface/stepDriver";
import {
  checkIfAppInDifferentAcountSameTenant,
  getAppPackage,
  updateManifestV3,
  updateTeamsAppV3ForPublish,
} from "../../../../src/component/driver/teamsApp/appStudio";
import { ConfigureTeamsAppDriver } from "../../../../src/component/driver/teamsApp/configure";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { RetryHandler } from "../../../../src/component/driver/teamsApp/utils/utils";
import { envUtil } from "../../../../src/component/utils/envUtil";
import { QuestionNames } from "../../../../src/question";
import {
  MockLogProvider,
  MockTools,
  MockedAzureAccountProvider,
  MockedM365Provider,
  randomAppName,
} from "../../../core/utils";
import { getAzureProjectRoot } from "../../../plugins/resource/appstudio/helper";

describe.skip("appStudio", () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = vi;
  describe("checkIfAppInDifferentAcountSameTenant", () => {
    const logger = new MockLogProvider();
    const teamsAppId = "teams";
    const m365TokenProvider = new MockedM365Provider();

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("get app successfully: returns false", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
      vi.spyOn(teamsDevPortalClient, "getApp").mockResolvedValue();

      const res = await checkIfAppInDifferentAcountSameTenant(
        teamsAppId,
        m365TokenProvider,
        logger
      );
      chai.assert.isTrue(res.isOk());

      if (res.isOk()) {
        chai.assert.isFalse(res.value);
      }
    });

    it("get token error: returns error", async () => {
      m365TokenProvider.getAccessToken = vi
        .fn()
        .mockReturnValue(err(new UserError("token", "token", "", "")));

      const res = await checkIfAppInDifferentAcountSameTenant(
        teamsAppId,
        m365TokenProvider,
        logger
      );
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "token");
      }
    });

    it("app in tenant but different account: returns true", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
      vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
        throw { message: "404" };
      });
      vi.spyOn(teamsDevPortalClient, "checkExistsInTenant").mockReturnValue(Promise.resolve(true));
      const res = await checkIfAppInDifferentAcountSameTenant(
        teamsAppId,
        m365TokenProvider,
        logger
      );
      chai.assert.isTrue(res.isOk());

      if (res.isOk()) {
        chai.assert.isTrue(res.value);
      }
    });

    it("get app error (not 404): returns false", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
      vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
        throw { message: "401" };
      });
      const res = await checkIfAppInDifferentAcountSameTenant(
        teamsAppId,
        m365TokenProvider,
        logger
      );
      chai.assert.isTrue(res.isOk());

      if (res.isOk()) {
        chai.assert.isFalse(res.value);
      }
    });
  });

  describe("getAppPackage", () => {
    const logger = new MockLogProvider();
    const teamsAppId = "teams";
    const m365TokenProvider = new MockedM365Provider();

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("get package successfully", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(""));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outline.png", Buffer.from(""));
      zip.addFile("zh-cn.json", Buffer.from(""));
      const archivedFile = zip.toBuffer();
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue({
        data: archivedFile,
      });

      const res = await getAppPackage(teamsAppId, m365TokenProvider, logger);
      chai.assert.isTrue(res.isOk());

      if (res.isOk()) {
        chai.assert.isTrue(res.value.manifest !== undefined);
        chai.assert.isTrue(res.value.icons !== undefined);
        chai.assert.isTrue(res.value.icons?.color !== undefined);
        chai.assert.isTrue(res.value.icons?.outline !== undefined);
        chai.assert.isTrue(res.value.languages !== undefined);
      }
    });

    it("get package successfully with unsupported file", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(""));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outline.png", Buffer.from(""));
      zip.addFile("idk.json", Buffer.from(""));
      const archivedFile = zip.toBuffer();
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue({
        data: archivedFile,
      });
      const loggerSpy = vi.spyOn(logger, "warning").mockResolvedValue();

      const res = await getAppPackage(teamsAppId, m365TokenProvider, logger);
      chai.assert.isTrue(res.isOk());

      if (res.isOk()) {
        chai.assert.isTrue(loggerSpy.mock.calls.length > 0);
        chai.assert.isUndefined(res.value.languages);
      }
    });

    it("get token error: returns error", async () => {
      m365TokenProvider.getAccessToken = vi
        .fn()
        .mockReturnValue(err(new UserError("token", "token", "", "")));

      const res = await getAppPackage(teamsAppId, m365TokenProvider, logger);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "token");
      }
    });

    it("get package failed due to api", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));

      vi.spyOn(RetryHandler, "Retry").mockImplementation(() => {
        throw new Error();
      });

      const res = await getAppPackage(teamsAppId, m365TokenProvider, logger);
      chai.assert.isTrue(res.isErr());
    });

    it("get package empty response", async () => {
      m365TokenProvider.getAccessToken = vi.fn().mockReturnValue(ok("token"));

      vi.spyOn(RetryHandler, "Retry").mockResolvedValue({});

      const res = await getAppPackage(teamsAppId, m365TokenProvider, logger);
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("updateTeamsAppV3ForPublish", () => {
    let mockedEnvRestore: RestoreFn | undefined;
    afterEach(() => {
      vi.restoreAllMocks();
      if (mockedEnvRestore) {
        mockedEnvRestore();
      }
    });
    it("not valid json", async () => {
      const ctx = createContext();
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(""));
      const info = zip.toBuffer();

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "ManifestValidationFailed");
      }
    });

    it("no manifest file", async () => {
      const ctx = createContext();
      const zip = new AdmZip();
      const info = zip.toBuffer();

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };
      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "FileNotFoundError");
      }
    });

    it("manifest without id", async () => {
      const ctx = createContext();
      const json = {
        $schema: "schema",
      };
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
      const info = zip.toBuffer();

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "ManifestValidationFailed");
      }
    });

    it("manifest invalid id", async () => {
      const ctx = createContext();
      const json = {
        id: "fe58d257",
      };
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
      const info = zip.toBuffer();

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        console.log(res.error);
        chai.assert.equal(res.error.name, "ManifestValidationFailed");
      }
    });

    it.skip("manifest no schema", async () => {
      const ctx = createContext();
      const json = {
        id: "fe58d257-4ce6-427e-a388-496c89633774",
      };
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
      const info = zip.toBuffer();

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "ManifestValidationFailed");
      }
    });

    it.skip("manifest validation failed", async () => {
      const ctx = createContext();

      const json = {
        $schema: "schema",
        id: "fe58d257-4ce6-427e-a388-496c89633774",
      };
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
      const info = zip.toBuffer();

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };

      const errors: string[] = ["error1"];
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue(errors);

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "ManifestValidationFailed");
        chai.assert.isTrue(res.error.message.includes("error1"));
      }
    });

    it("update teams app error", async () => {
      const ctx = createContext();
      const json = {
        $schema: "schema",
        id: "fe58d257-4ce6-427e-a388-496c89633774",
      };
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
      const info = zip.toBuffer();
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };
      const updateDriver = new ConfigureTeamsAppDriver();
      vi.spyOn(Container, "get").mockImplementation((name) => {
        if ((name as any) === "teamsApp/update") {
          return updateDriver;
        } else {
          throw new Error("not implemented");
        }
      });
      vi.spyOn(updateDriver, "execute").mockResolvedValue({
        result: err(new UserError("apiError", "apiError", "", "")),
        summaries: [],
      });

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "apiError");
      }
    });

    it("happy path", async () => {
      const ctx = createContext();
      const json = {
        $schema: "schema",
        id: "fe58d257-4ce6-427e-a388-496c89633774",
      };
      const zip = new AdmZip();
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
      const info = zip.toBuffer();
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const inputs: InputsWithProjectPath = {
        [QuestionNames.AppPackagePath]: info,
        platform: Platform.VSCode,
        projectPath: "projectPath",
      };
      const updateDriver = new ConfigureTeamsAppDriver();
      vi.spyOn(Container, "get").mockImplementation((name) => {
        if ((name as any) === "teamsApp/update") {
          return updateDriver;
        } else {
          throw new Error("not implemented");
        }
      });
      vi.spyOn(updateDriver, "execute").mockResolvedValue({
        result: ok(new Map([])),
        summaries: [],
      });

      const res = await updateTeamsAppV3ForPublish(ctx, inputs);
      chai.assert.isTrue(res.isOk());
    });
  });
});

describe("updateTeamsAppV3ForPublish - validateAgainstSchema", () => {
  const sandbox = vi;

  beforeEach(() => {
    setTools(new MockTools());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call AppManifestUtils.validateAgainstSchema and return error when validation fails", async () => {
    const ctx = createContext();
    const json = {
      $schema: "schema",
      id: "fe58d257-4ce6-427e-a388-496c89633774",
    };
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
    const info = zip.toBuffer();
    const errors: string[] = ["error1"];
    vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue(errors);

    const inputs: InputsWithProjectPath = {
      [QuestionNames.AppPackagePath]: info,
      platform: Platform.VSCode,
      projectPath: "projectPath",
    };

    const res = await updateTeamsAppV3ForPublish(ctx, inputs);
    chai.assert.isTrue(res.isErr());
    if (res.isErr()) {
      chai.assert.equal(res.error.name, "ManifestValidationFailed");
      chai.assert.isTrue(res.error.message.includes("error1"));
    }
  });

  it("should call AppManifestUtils.validateAgainstSchema and succeed when no errors", async () => {
    const ctx = createContext();
    const json = {
      $schema: "schema",
      id: "fe58d257-4ce6-427e-a388-496c89633774",
    };
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(json)));
    const info = zip.toBuffer();
    vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

    const inputs: InputsWithProjectPath = {
      [QuestionNames.AppPackagePath]: info,
      platform: Platform.VSCode,
      projectPath: "projectPath",
    };
    const updateDriver = new ConfigureTeamsAppDriver();
    vi.spyOn(Container, "get").mockImplementation((name) => {
      if ((name as any) === "teamsApp/update") {
        return updateDriver;
      } else {
        throw new Error("not implemented");
      }
    });
    vi.spyOn(updateDriver, "execute").mockResolvedValue({ result: ok(new Map([])), summaries: [] });

    const res = await updateTeamsAppV3ForPublish(ctx, inputs);
    chai.assert.isTrue(res.isOk());
  });
});

describe("App-manifest Component - v3", () => {
  const sandbox = vi;
  const tools = new MockTools();
  const appName = randomAppName();
  const inputs: InputsWithProjectPath = {
    projectPath: getAzureProjectRoot(),
    platform: Platform.VSCode,
    "app-name": appName,
    appPackagePath: "fakePath",
  };
  const cliInputs = {
    projectPath: getAzureProjectRoot(),
    platform: Platform.CLI,
    "app-name": appName,
    appPackagePath: "fakePath",
  };
  const mockDriverRes: ExecutionResult = { result: ok(new Map()), summaries: [] };
  let context: Context;
  setTools(tools);

  beforeEach(() => {
    context = createContext();
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("fakeToken")
    );
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({
        unique_name: "fakename",
      })
    );

    context.logProvider = new MockLogProvider();
    context.tokenProvider = {
      m365TokenProvider: new MockedM365Provider(),
      azureAccountProvider: new MockedAzureAccountProvider(),
    };
    vi.spyOn(Container, "get").mockImplementation((token: any) => {
      if (String(token).includes("teamsApp/zipAppPackage")) {
        return new CreateAppPackageDriver();
      }
      if (String(token).includes("teamsApp/update")) {
        return new ConfigureTeamsAppDriver();
      }
      return undefined as any;
    });
    vi.spyOn(envUtil, "readEnv").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updateManifestV3 - preview only", async function () {
    const manifest = new TeamsAppManifest();
    manifest.id = "";
    manifest.icons.color = "resources/color.png";
    manifest.icons.outline = "resources/outline.png";
    const updatedManifest = { ...manifest };
    updatedManifest.version = "2.0.0";
    vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(
      ok(manifest as unknown as TeamsManifest)
    );
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(updatedManifest);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(JSON.stringify(manifest)));
    vi.spyOn(context.userInteraction, "showMessage").mockResolvedValue(ok("Preview only"));
    vi.spyOn(ConfigureTeamsAppDriver.prototype, "execute").mockResolvedValue(mockDriverRes);
    vi.spyOn(CreateAppPackageDriver.prototype, "execute").mockResolvedValue(mockDriverRes);

    await updateManifestV3(context, cliInputs);
  });

  it("updateManifestV3 - happy path", async function () {
    const manifest = new TeamsAppManifest();
    manifest.id = "";
    manifest.icons.color = "resources/color.png";
    manifest.icons.outline = "resources/outline.png";
    vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(
      ok(manifest as unknown as TeamsManifest)
    );
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(manifest);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(JSON.stringify(manifest)));
    vi.spyOn(context.userInteraction, "showMessage").mockResolvedValue(
      ok("View in Developer Portal")
    );
    vi.spyOn(ConfigureTeamsAppDriver.prototype, "execute").mockResolvedValue();

    await updateManifestV3(context, inputs);
  });

  it("updateManifestV3 - rebuild", async function () {
    const manifest = new TeamsAppManifest();
    manifest.id = "";
    manifest.icons.color = "resources/color.png";
    manifest.icons.outline = "resources/outline.png";
    const updatedManifest = { ...manifest };
    updatedManifest.version = "2.0.0";
    vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(
      ok(manifest as unknown as TeamsManifest)
    );
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "readJSON").mockResolvedValue(updatedManifest);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(JSON.stringify(manifest)));
    vi.spyOn(context.userInteraction, "showMessage").mockResolvedValue(ok("Preview and update"));
    vi.spyOn(ConfigureTeamsAppDriver.prototype, "execute").mockResolvedValue(mockDriverRes);
    vi.spyOn(CreateAppPackageDriver.prototype, "execute").mockResolvedValue(mockDriverRes);

    await updateManifestV3(context, inputs);
  });

  it("updateManifestV3 - getManifestV3 Error", async () => {
    vi.spyOn(manifestUtils, "getTeamsAppManifestPath").mockResolvedValue("");
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(err(new UserError({})));
    const ctx = createContext();
    const inputs: InputsWithProjectPath = {
      platform: Platform.VSCode,
      projectPath: "projectPath",
    };
    const res = await updateManifestV3(ctx, inputs);
    chai.assert.isTrue(res.isErr());
  });
});
