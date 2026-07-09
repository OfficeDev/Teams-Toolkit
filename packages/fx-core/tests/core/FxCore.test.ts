// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  InputResult,
  Inputs,
  LogProvider,
  Ok,
  Platform,
  Result,
  Stage,
  SystemError,
  TeamsManifest,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import * as os from "os";
import * as path from "path";
import { Container } from "typedi";
import {
  FxCore,
  PackageService,
  getLocalizedString,
  getUuid,
  teamsDevPortalClient,
} from "../../src";
import { TOOLS, setTools } from "../../src/common/globalVars";
import { TeamsfxVersionState, projectTypeChecker } from "../../src/common/projectTypeChecker";
import * as CommonTools from "../../src/common/tools";
import { MetadataV3 } from "../../src/common/versionMetadata";
import {
  DriverDefinition,
  DriverInstance,
  ExecutionResult,
  ILifecycle,
  LifecycleName,
  Output,
  ProjectModel,
  UnresolvedPlaceholders,
} from "../../src/component/configManager/interface";
import { YamlParser } from "../../src/component/configManager/parser";
import { coordinator } from "../../src/component/coordinator";
import { UpdateAadAppDriver } from "../../src/component/driver/aad/update";
import { AddWebPartDriver } from "../../src/component/driver/add/addWebPart";
import { InstallAppToChannelDriver } from "../../src/component/driver/devChannel/installApp";
import { DriverContext } from "../../src/component/driver/interface/commonArgs";
import * as shareUtils from "../../src/component/driver/share/utils";
import { CreateAppPackageDriver } from "../../src/component/driver/teamsApp/createAppPackage";
import { copilotGptManifestUtils } from "../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import { ValidateManifestDriver } from "../../src/component/driver/teamsApp/validate";
import { ValidateAppPackageDriver } from "../../src/component/driver/teamsApp/validateAppPackage";
import { ValidateWithTestCasesDriver } from "../../src/component/driver/teamsApp/validateTestCases";
import { createDriverContext } from "../../src/component/driver/util/utils";
import "../../src/component/feature/sso";
import { LaunchHelper } from "../../src/component/m365/launchHelper";
import { envUtil } from "../../src/component/utils/envUtil";
import { metadataUtil } from "../../src/component/utils/metadataUtil";
import { pathUtils } from "../../src/component/utils/pathUtils";
import * as collaborator from "../../src/core/collaborator";
import { environmentManager } from "../../src/core/environment";
import { CoreHookContext } from "../../src/core/types";
import {
  FileNotFoundError,
  InputValidationError,
  MissingEnvironmentVariablesError,
  UserCancelError,
} from "../../src/error/common";
import { QuestionNames, ScratchOptions, UninstallInputs, questionNodes } from "../../src/question";
import { HubOptions } from "../../src/question/constants";
import { validationUtils } from "../../src/ui/validationUtils";
import { MockTools, randomAppName } from "./utils";
import { assert, chai, vi } from "vitest";

const tools = new MockTools();

describe("Core basic APIs", () => {
  const appName = randomAppName();
  beforeEach(() => {
    setTools(tools);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("install app to channel - success", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "test-project",
      env: "dev",
    };
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAM_ID: "mock-team-app-id",
        CHANNEL_ID: "mock-channel-id",
      })
    );
    vi.spyOn(InstallAppToChannelDriver.prototype, "install").mockResolvedValue(ok(new Map()));
    const res = await core.installAppToChannel(inputs);
    assert.isTrue(res.isOk());
  });

  it("install app to channel - missing env", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "test-project",
    };

    const result = await core.installAppToChannel(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "MissingRequiredFileError");
    }
  });

  it("install app to channel - file not found", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "test-project",
      env: "dev",
    };
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAM_ID: "mock-team-app-id",
        CHANNEL_ID: "mock-channel-id",
      })
    );
    vi.spyOn(InstallAppToChannelDriver.prototype, "install").mockResolvedValue(
      err(new FileNotFoundError("source", "test-file"))
    );

    const result = await core.installAppToChannel(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "FileNotFoundError");
    }
  });

  it("deploy aad manifest happy path with param", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    // vi.spyOn(UpdateAadAppDriver.prototype, "run").mockResolvedValue(new Ok(new Map()));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: path.join(os.tmpdir(), appName, "aad.manifest.json"),
      [QuestionNames.TargetEnvName]: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };

    const runSpy = vi.spyOn(UpdateAadAppDriver.prototype, "execute");
    await core.deployAadManifest(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
    assert.isNotNull(runSpy.mock.calls[0][0]);
    assert.strictEqual(
      runSpy.mock.calls[0][0].manifestPath,
      path.join(os.tmpdir(), appName, "aad.manifest.json")
    );
    runSpy; // vi.restoreAllMocks() called in afterEach
  });

  it("add web part to SPFx", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      "spfx-folder": ".\\src",
      "manifest-path": path.join(appPath, "appPackage\\manifest.json"),
      "local-manifest-path": path.join(appPath, "appPackage\\manifest.local.json"),
      "spfx-webpart-name": "helloworld",
      "spfx-install-latest-package": "true",
      "spfx-load-package-version": "loaded",
      stage: Stage.addWebpart,
      projectPath: appPath,
    };

    const runSpy = vi.spyOn(AddWebPartDriver.prototype, "run");
    await core.addWebpart(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
    runSpy; // vi.restoreAllMocks() called in afterEach
  });

  it("add web part to SPFx - CLI help", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI_HELP,
      [QuestionNames.Folder]: os.tmpdir(),
      "spfx-folder": ".\\src",
      "manifest-path": path.join(appPath, "appPackage\\manifest.json"),
      "local-manifest-path": path.join(appPath, "appPackage\\manifest.local.json"),
      "spfx-webpart-name": "helloworld",
      "spfx-install-latest-package": "true",
      "spfx-load-package-version": "loaded",
      stage: Stage.addWebpart,
      projectPath: appPath,
    };

    const runSpy = vi.spyOn(AddWebPartDriver.prototype, "run");
    await core.addWebpart(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
    runSpy; // vi.restoreAllMocks() called in afterEach
  });

  it("add web part to SPFx with empty .yo-rc.json", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      "spfx-folder": ".\\src",
      "manifest-path": path.join(appPath, "appPackage\\manifest.json"),
      "local-manifest-path": path.join(appPath, "appPackage\\manifest.local.json"),
      "spfx-webpart-name": "helloworld",
      "spfx-install-latest-package": "true",
      "spfx-load-package-version": "loaded",
      stage: Stage.addWebpart,
      projectPath: appPath,
    };
    vi.spyOn(fs, "pathExists").mockImplementation(async (directory: string) => {
      if (directory.includes(path.join("webparts", "helloworld"))) {
        return false;
      }
      return true;
    });
    vi.spyOn(fs, "readJson").mockResolvedValue({});
    const runSpy = vi.spyOn(AddWebPartDriver.prototype, "run");
    await core.addWebpart(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
    runSpy; // vi.restoreAllMocks() called in afterEach
  });

  it("add web part to SPFx with framework", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      "spfx-folder": ".\\src",
      "manifest-path": path.join(appPath, "appPackage\\manifest.json"),
      "local-manifest-path": path.join(appPath, "appPackage\\manifest.local.json"),
      "spfx-webpart-name": "helloworld",
      "spfx-install-latest-package": "true",
      "spfx-load-package-version": "loaded",
      stage: Stage.addWebpart,
      projectPath: appPath,
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (directory: string) => {
      if (directory.includes(path.join("webparts", "helloworld"))) {
        return false;
      }
      return true;
    });
    vi.spyOn(fs, "readJson").mockResolvedValue({
      "@microsoft/generator-sharepoint": {
        template: "react",
      },
    });
    const runSpy = vi.spyOn(AddWebPartDriver.prototype, "run");
    await core.addWebpart(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
    runSpy; // vi.restoreAllMocks() called in afterEach
  });

  it("deploy aad manifest happy path", async () => {
    const promtionOnVSC =
      'Your Microsoft Entra app has been deployed successfully. To view that, click "More info"';

    const core = new FxCore(tools);
    const showMessage = vi.spyOn(tools.ui, "showMessage")<
      ["info" | "warn" | "error", string, boolean, ...string[]],
      Promise<Result<string | undefined, FxError>>
    >;
    const openUrl = vi.spyOn(tools.ui, "openUrl");
    const appName = await mockV3Project();
    vi.spyOn(UpdateAadAppDriver.prototype, "execute").mockResolvedValue({
      result: new Ok(new Map()),
      summaries: [],
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: path.join(os.tmpdir(), appName, "aad.manifest.json"),
      env: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const res = await core.deployAadManifest(inputs);
    assert.isTrue(await fs.pathExists(path.join(os.tmpdir(), appName, "build")));
    await deleteTestProject(appName);
    assert.isTrue(res.isOk());
    assert.isTrue(showMessage.mock.calls.length > 0);
    assert.equal(showMessage.mock.calls[0][0], "info");
    assert.equal(showMessage.mock.calls[0][1], promtionOnVSC);
    assert.isFalse(showMessage.mock.calls[0][2]);
    assert.equal(showMessage.mock.calls[0][3], "More info");
    assert.isFalse(openUrl.mock.calls.length > 0);
  });
  it("deploy aad manifest happy path with click more info", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("More info"));
    vi.spyOn(tools.ui, "openUrl").mockResolvedValue(ok(true));
    const appName = await mockV3Project();
    vi.spyOn(UpdateAadAppDriver.prototype, "execute").mockResolvedValue({
      result: new Ok(new Map()),
      summaries: [],
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: path.join(os.tmpdir(), appName, "aad.manifest.json"),
      env: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const res = await core.deployAadManifest(inputs);
    assert.isTrue(res.isOk());
    if (res.isErr()) console.error(res.error);
    assert.isTrue(await fs.pathExists(path.join(os.tmpdir(), appName, "build")));
    await deleteTestProject(appName);
  });

  it("deploy aad manifest happy path without click learn more", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(err(new UserError("test", "test", "test")));
    vi.spyOn(tools.ui, "openUrl").mockResolvedValue(ok(true));
    const appName = await mockV3Project();
    vi.spyOn(UpdateAadAppDriver.prototype, "execute").mockResolvedValue({
      result: new Ok(new Map()),
      summaries: [],
    });
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: path.join(os.tmpdir(), appName, "aad.manifest.json"),
      env: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const res = await core.deployAadManifest(inputs);
    assert.isTrue(res.isOk());
    if (res.isErr()) console.error(res.error);
    assert.isTrue(await fs.pathExists(path.join(os.tmpdir(), appName, "build")));
    await deleteTestProject(appName);
  });
  it("deploy aad manifest happy path on cli", async () => {
    const core = new FxCore(tools);
    const showMessage = vi.spyOn(tools.ui, "showMessage")<
      ["info" | "warn" | "error", string, boolean, ...string[]],
      Promise<Result<string | undefined, FxError>>
    >;
    const appName = await mockV3Project();
    vi.spyOn(UpdateAadAppDriver.prototype, "execute").mockResolvedValue({
      result: new Ok(new Map()),
      summaries: [],
    });
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: path.join(os.tmpdir(), appName, "aad.manifest.json"),
      env: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const res = await core.deployAadManifest(inputs);
    await deleteTestProject(appName);
    assert.isTrue(showMessage.mock.calls.length === 1);
    assert.equal(showMessage.mock.calls[0][0], "info");
    assert.equal(
      showMessage.mock.calls[0][1],
      "Your Microsoft Entra app has been updated successfully."
    );
    assert.isFalse(showMessage.mock.calls[0][2]);
    assert.isTrue(res.isOk());
  });

  it("deploy aad manifest return err", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appManifestPath = path.join(os.tmpdir(), appName, "aad.manifest.json");
    vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(ok(["dev", "local"]));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: appManifestPath,
      env: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    vi.spyOn(UpdateAadAppDriver.prototype, "execute").mockImplementation(() => {
      throw new UserError("error name", "fake_error", "fake_err_msg");
    });
    const errMsg = `AAD manifest doesn't exist in ${appManifestPath}, please use the CLI to specify an AAD manifest to deploy.`;
    const res = await core.deployAadManifest(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.strictEqual(res.error.message, "fake_err_msg");
    }
  });

  it("deploy aad manifest with missing env err", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appManifestPath = path.join(os.tmpdir(), appName, "aad.manifest.json");
    vi.spyOn(environmentManager, "listAllEnvConfigs").mockResolvedValue(ok([""]));
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: appManifestPath,
      env: undefined,
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    vi.spyOn(UpdateAadAppDriver.prototype, "execute").mockResolvedValue({
      result: err(
        new MissingEnvironmentVariablesError(
          "aadApp/update",
          "AAD_APP_OBJECT_ID",
          "fake path",
          "https://fake-help-link"
        )
      ),
      summaries: [],
    });
    const res = await core.deployAadManifest(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      // Cannot assert the full message because the mocked code can't get correct env file path
      assert.include(
        res.error.message,
        "Missing environment variables 'AAD_APP_OBJECT_ID' for file: fake path. Please edit the .env file"
      );

      assert.include(
        res.error.message,
        "For new projects, run local debugging or provision a remote environment to set these variables."
      );
    }
  });

  it("deploy aad manifest not exist", async () => {
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const appManifestPath = path.join(os.tmpdir(), appName, "aad.manifest.json");
    await fs.remove(appManifestPath);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.AppName]: appName,
      [QuestionNames.Scratch]: ScratchOptions.yes().id,
      [QuestionNames.ProgrammingLanguage]: "javascript",
      [QuestionNames.Capabilities]: ["Tab", "TabSSO"],
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.AadAppManifestFilePath]: path.join(os.tmpdir(), appName, "aad.manifest.json"),
      env: "dev",
      stage: Stage.deployAad,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const res = await core.deployAadManifest(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof FileNotFoundError);
    }
    await deleteTestProject(appName);
  });

  it("permission v3", async () => {
    let res;
    const core = new FxCore(tools);
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      ignoreLockByUT: true,
    };
    vi.spyOn(questionNodes, "grantPermission").mockReturnValue({ data: { type: "group" } });
    vi.spyOn(questionNodes, "listCollaborator").mockReturnValue({ data: { type: "group" } });
    vi.spyOn(collaborator, "listCollaborator").mockResolvedValue(ok(undefined as any));
    vi.spyOn(collaborator, "checkPermission").mockResolvedValue(ok(undefined as any));
    vi.spyOn(collaborator, "grantPermission").mockResolvedValue(ok(undefined as any));

    res = await core.listCollaborator(inputs);
    assert.isTrue(res.isOk());
    res = await core.checkPermission(inputs);
    assert.isTrue(res.isOk());
    res = await core.grantPermission(inputs);
    assert.isTrue(res.isOk());
  });

  it("buildAadManifest method should exist", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failure that when local template not released to GitHub
      NODE_ENV: "development", // workaround test failure that when local template not released to GitHub
      AAD_APP_OBJECT_ID: getUuid(),
      AAD_APP_CLIENT_ID: getUuid(),
      TAB_DOMAIN: "fake",
      TAB_ENDPOINT: "fake",
    });

    const originFunc = envUtil.readEnv;
    try {
      envUtil.readEnv = async () => {
        return ok({
          AAD_APP_OBJECT_ID: getUuid(),
          AAD_APP_CLIENT_ID: getUuid(),
          TAB_DOMAIN: "fake",
          TAB_ENDPOINT: "fake",
        });
      };
      const core = new FxCore(tools);
      const appName = await mockV3Project();
      const projectPath = path.join(os.tmpdir(), appName);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath,
        env: "dev",
        AAD_MANIFEST_FILE: path.join(projectPath, "aad.manifest.json"),
      };
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({ id: getUuid() }) as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue(undefined as any);
      const result = await core.buildAadManifest(inputs);
      assert.isTrue(result.isOk());
    } finally {
      envUtil.readEnv = originFunc;
      restore();
    }
  });

  it("convertAadToNewSchema method should work fine", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failure that when local template not released to GitHub
      NODE_ENV: "development", // workaround test failure that when local template not released to GitHub
    });

    try {
      const core = new FxCore(tools);
      const appName = await mockV3Project();
      const projectPath = path.join(os.tmpdir(), appName);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: projectPath,
        [QuestionNames.AadAppManifestFilePath]: `${projectPath}/aad.manifest.json`,
      };

      vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("Continue"));
      const result = await core.convertAadToNewSchema(inputs);
      assert.isTrue(result.isOk());
    } finally {
      restore();
    }
  });

  it("convertAadToNewSchema should throw file not exist error if aad.manifest.json does not exist", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failure that when local template not released to GitHub
      NODE_ENV: "development", // workaround test failure that when local template not released to GitHub
    });

    try {
      const core = new FxCore(tools);
      const appName = await mockV3Project();
      const projectPath = path.join(os.tmpdir(), appName);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: projectPath,
        [QuestionNames.AadAppManifestFilePath]: `/not-exist-path/aad.manifest.json`,
      };

      const result = await core.convertAadToNewSchema(inputs);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.isTrue(result.error instanceof FileNotFoundError);
      }
    } finally {
      restore();
    }
  });

  it("convertAadToNewSchema throw user cancel error if not confirmed", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failure that when local template not released to GitHub
      NODE_ENV: "development", // workaround test failure that when local template not released to GitHub
    });

    try {
      const core = new FxCore(tools);
      const appName = await mockV3Project();
      const projectPath = path.join(os.tmpdir(), appName);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: projectPath,
        [QuestionNames.AadAppManifestFilePath]: `${projectPath}/aad.manifest.json`,
      };

      const result = await core.convertAadToNewSchema(inputs);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.isTrue(result.error instanceof UserCancelError);
      }
    } finally {
      restore();
    }
  });

  it("convertAadToNewSchema throw user cancel error if user canceled", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failure that when local template not released to GitHub
      NODE_ENV: "development", // workaround test failure that when local template not released to GitHub
    });

    try {
      const core = new FxCore(tools);
      const appName = await mockV3Project();
      const projectPath = path.join(os.tmpdir(), appName);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: projectPath,
        [QuestionNames.AadAppManifestFilePath]: `${projectPath}/aad.manifest.json`,
      };

      vi.spyOn(tools.ui, "showMessage").mockImplementation(async (level, message) => {
        if (level === "warn") {
          return err(new UserCancelError("test"));
        } else {
          return ok("Continue");
        }
      });

      const result = await core.convertAadToNewSchema(inputs);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.isTrue(result.error instanceof UserCancelError);
      }
    } finally {
      restore();
    }
  });

  it("convertAadToNewSchema show message when manifest is in new schema", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failure that when local template not released to GitHub
      NODE_ENV: "development", // workaround test failure that when local template not released to GitHub
    });

    try {
      const core = new FxCore(tools);
      const appName = await mockV3Project();
      const projectPath = path.join(os.tmpdir(), appName);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: projectPath,
        [QuestionNames.AadAppManifestFilePath]: `${projectPath}/aad.manifest.json`,
      };

      vi.spyOn(fs, "readJson").mockResolvedValue({ displayName: "displayName" });
      const showMessageStub = vi.spyOn(tools.ui, "showMessage");

      const result = await core.convertAadToNewSchema(inputs);
      chai.expect(showMessageStub.mock.calls).lengthOf(1);
      assert.isTrue(result.isOk());
    } finally {
      restore();
    }
  });

  it("addSso method should exist", async () => {
    const restore = mockedEnv({
      TEAMSFX_DEBUG_TEMPLATE: "true", // workaround test failures when template changed but not release to GitHub alpha template
      NODE_ENV: "development", // workaround test failures when template changed but not release to GitHub alpha template
    });
    try {
      const appName = randomAppName();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.AppName]: appName,
        projectPath: path.join(os.tmpdir(), appName, "samples-v3"),
        ignoreLockByUT: true,
      };
      const ssoAddStub = vi.fn().mockResolvedValue(ok(undefined));
      vi.spyOn(Container, "get").mockReturnValue({ add: ssoAddStub } as any);

      const implement = new FxCore(tools);

      const mockFunc = {
        namespace: "mock namespace",
        method: "addSso",
      };

      const result = await implement.executeUserTask(mockFunc, inputs);
      assert.isTrue(result.isOk());
      assert.isTrue(ssoAddStub.mock.calls.length === 1);
    } finally {
      restore();
    }
  });
  it("set sensitivity label - happy path", async () => {
    const inputs: Inputs = {
      [QuestionNames.SensitivityLabel]: "Public",
      [QuestionNames.DeclarativeAgentManifestPath]:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/resources/declarativeAgent.json",
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    vi.spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as any)
    );
    vi.spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile").mockResolvedValue(
      ok(undefined)
    );
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(
      ok(getLocalizedString("core.setSensitivityLabel.continue"))
    );
    const core = new FxCore(tools);
    const result = await core.setSensitivityLabel(inputs);
    assert.isTrue(result.isOk());
  });

  it("set sensitivity label - declarative agent manifest does not exist", async () => {
    const inputs: Inputs = {
      [QuestionNames.SensitivityLabel]: "Public",
      [QuestionNames.DeclarativeAgentManifestPath]: "fake path",
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    vi.spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as any)
    );
    vi.spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile").mockResolvedValue(
      ok(undefined)
    );
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(
      ok(getLocalizedString("core.setSensitivityLabel.continue"))
    );
    const core = new FxCore(tools);
    const res = await core.setSensitivityLabel(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(
        res.error.message.includes("declarativeAgentManifestPath is undefined or does not exist")
      );
    }
  });

  it("set sensitivity label - read manifest error", async () => {
    const inputs: Inputs = {
      [QuestionNames.SensitivityLabel]: "Public",
      [QuestionNames.DeclarativeAgentManifestPath]:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/resources/declarativeAgent.json",
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    vi.spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile").mockResolvedValue(
      err(new UserError("mockedSource", "mockedError", "mockedMessage"))
    );
    vi.spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile").mockResolvedValue(
      ok(undefined)
    );
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(
      ok(getLocalizedString("core.setSensitivityLabel.continue"))
    );
    const core = new FxCore(tools);
    const result = await core.setSensitivityLabel(inputs);
    assert.isTrue(result.isErr());
  });

  it("set sensitivity label - write error", async () => {
    const inputs: Inputs = {
      [QuestionNames.SensitivityLabel]: "Public",
      [QuestionNames.DeclarativeAgentManifestPath]:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/resources/declarativeAgent.json",
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    vi.spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as any)
    );
    vi.spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile").mockResolvedValue(
      err(new UserError("mockedSource", "mockedError", "mockedMessage"))
    );
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(
      ok(getLocalizedString("core.setSensitivityLabel.continue"))
    );
    const core = new FxCore(tools);
    const result = await core.setSensitivityLabel(inputs);
    assert.isTrue(result.isErr());
  });

  it("set sensitivity label - user cancel error", async () => {
    const inputs: Inputs = {
      [QuestionNames.SensitivityLabel]: "Public",
      [QuestionNames.DeclarativeAgentManifestPath]:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/resources/declarativeAgent.json",
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    vi.spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as any)
    );
    vi.spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile").mockResolvedValue(
      ok(undefined)
    );
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(err(new UserCancelError("mockedSource")));
    const core = new FxCore(tools);
    const result = await core.setSensitivityLabel(inputs);
    assert.isTrue(result.isErr());
  });

  it("set sensitivity label - user cancel", async () => {
    const inputs: Inputs = {
      [QuestionNames.SensitivityLabel]: "Public",
      [QuestionNames.DeclarativeAgentManifestPath]:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/resources/declarativeAgent.json",
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };
    vi.spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as any)
    );
    vi.spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile").mockResolvedValue(
      ok(undefined)
    );
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(ok("cancel"));
    const core = new FxCore(tools);
    const result = await core.setSensitivityLabel(inputs);
    assert.isTrue(result.isErr());
  });

  it("uninstall with empty input", async () => {
    const core = new FxCore(tools);
    const inputs: UninstallInputs = {
      platform: Platform.CLI,
    };
    const res = await core.uninstall(inputs);
    assert.isTrue(res.isErr());
  });
  it("remove shared access happy path", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId2",
        displayName: "mockDisplayName2",
        userPrincipalName: "mockUserPrincipalName2",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: "user1@example.com,user2@example.com",
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isOk());
  });
  it("remove shared access - invalid email", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId2",
        displayName: "mockDisplayName2",
        userPrincipalName: "mockUserPrincipalName2",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("emails"));
    }

    const inputs2: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: [],
    };
    const result2 = await core.removeSharedAccess(inputs2);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("emails"));
    }
  });
  it("remove shared access - parse error", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      err(new UserError("mockedSource", "mockedError", "mockedMessage"))
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId2",
        displayName: "mockDisplayName2",
        userPrincipalName: "mockUserPrincipalName2",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );

    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: ["user1@example.com", "user2@example.com"],
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("mockedMessage"));
    }
  });
  it("remove shared access - token error", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId2",
        displayName: "mockDisplayName2",
        userPrincipalName: "mockUserPrincipalName2",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(new SystemError("mockedSource", "mockedError", "mockedMessage"))
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: ["user1@example.com", "user2@example.com"],
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("mockedMessage"));
    }
  });
  it("remove shared access - getCurrentUserInfo", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      err(new UserError("mockedSource", "mockedError", "mockedMessage"))
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: ["user1@example.com", "user2@example.com"],
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("mockedMessage"));
    }
  });
  it("remove shared access - get use info error", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue(undefined);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId2",
        displayName: "mockDisplayName2",
        userPrincipalName: "mockUserPrincipalName2",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: ["user1@example.com", "user2@example.com"],
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("Invalid user"));
    }
  });
  it("remove shared access - remove current user", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId1",
        displayName: "mockDisplayName1",
        userPrincipalName: "mockUserPrincipalName1",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(ok(undefined));
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: ["user1@example.com", "user2@example.com"],
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(
        result.error.message.includes(
          getLocalizedString("core.share.removeAccess.operator", "user1@example.com")
        )
      );
    }
  });
  it("remove shared access - mos grant permission error", async () => {
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValue(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );
    vi.spyOn(collaborator.CollaborationUtil, "getUserInfo").mockResolvedValue({
      aadId: "mockAadId1",
      displayName: "mockDisplayName1",
      userPrincipalName: "mockUserPrincipalName1",
    } as any);
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "mockAadId2",
        displayName: "mockDisplayName2",
        userPrincipalName: "mockUserPrincipalName2",
      } as any)
    );
    vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "removePermission").mockResolvedValue(
      err(new UserError("mockedSource", "mockedError", "mockedMessage"))
    );
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok({
        value: "token",
      } as any)
    );
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
      ignoreLockByUT: true,
      nonInteractive: true,
      [QuestionNames.RemoveUsers]: ["user1@example.com", "user2@example.com"],
    };
    const core = new FxCore(tools);
    const result = await core.removeSharedAccess(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.message.includes("mockedMessage"));
    }
  });
  it("uninstall with invalid mode", async () => {
    const core = new FxCore(tools);
    const inputs = {
      platform: Platform.CLI,
      mode: "invalid",
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
  });
  it("uninstall by manifest ID - success", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockResolvedValue(true);
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue();
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    if (res.isErr()) {
      // Debug only for flaky CI/local mismatch in uninstall-by-env tests.
      console.log("uninstall by env - success error", res.error.name, res.error.message);
    }
    assert.isTrue(res.isOk());
  });
  it("uninstall by manifest ID - missing manifest ID", async () => {
    const core = new FxCore(tools);
    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs);
    assert.isTrue(res.isErr());
  });
  it("uninstall by manifest ID - empty options", async () => {
    const core = new FxCore(tools);
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    if (res.isErr()) {
      // Debug only for flaky CI/local mismatch in uninstall-by-env tests.
      console.log("uninstall by env - empty env key name error", res.error.name, res.error.message);
    }
    assert.isTrue(res.isOk());
  });
  it("uninstall by manifest ID - failed to get token", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(new SystemError("mockedSource", "mockedError", "mockedMessage"))
    );
    const inputs1 = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["m365-app"],
      nonInteractive: true,
    };
    const res1 = await core.uninstall(inputs1 as UninstallInputs);
    assert.isTrue(res1.isErr());

    const inputs2 = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["app-registration"],
      nonInteractive: true,
    };
    const res2 = await core.uninstall(inputs2 as UninstallInputs);
    assert.isTrue(res2.isErr());

    const inputs3 = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["bot-framework-registration"],
      nonInteractive: true,
    };
    const res3 = await core.uninstall(inputs3 as UninstallInputs);
    assert.isTrue(res3.isErr());
  });
  it("uninstall by manifest ID - failed to get title ID", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockImplementation(() => {
      throw "error";
    });
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
  });
  it("uninstall by manifest ID - failed to get bot ID", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue(undefined);
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["bot-framework-registration"],
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
  });
  it("uninstall by manifest ID - M365 App user cancel", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(tools.ui, "confirm").mockResolvedValue(ok({ result: false } as InputResult<boolean>));
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockImplementation(() => {
      throw "error";
    });
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["m365-app"],
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserCancelError);
    }
  });
  it("uninstall by manifest ID - TDP user cancel", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(tools.ui, "confirm").mockResolvedValue(ok({ result: false } as InputResult<boolean>));
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockImplementation(() => {
      throw "error";
    });
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["app-registration"],
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserCancelError);
    }
  });
  it("uninstall by manifest ID - Bot user cancel", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(tools.ui, "confirm").mockResolvedValue(ok({ result: false } as InputResult<boolean>));
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockImplementation(() => {
      throw "error";
    });
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeManifestId,
      [QuestionNames.ManifestId]: "valid-manifest-id",
      [QuestionNames.UninstallOptions]: ["bot-framework-registration"],
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserCancelError);
    }
  });
  it("uninstall by env - success", async () => {
    const restore = mockedEnv({
      TEAMS_APP_ID: "123",
      M365_TITLE_ID: "456",
      BOT_ID: "789",
    });
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockResolvedValue(true);
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue();
    const appName = await mockCliUninstallProject();
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
      ignoreLockByUT: true,
      nonInteractive: true,
    };

    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isOk(), "uninstall-by-env-success: result should be ok");

    const envRes = await envUtil.readEnv(path.join(os.tmpdir(), appName), "dev", false);
    assert.isTrue(envRes.isOk(), "uninstall-by-env-success: env read should be ok");
    restore();
    await deleteTestProject(appName);
  });
  it("uninstall by env - missing env", async () => {
    const core = new FxCore(tools);
    const appName = await mockCliUninstallProject();

    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      nonInteractive: true,
    };

    const res = await core.uninstall(inputs);
    assert.isTrue(res.isErr());
    await deleteTestProject(appName);
  });
  it("uninstall by env - empty options", async () => {
    const core = new FxCore(tools);
    const appName = await mockCliUninstallProject();

    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      nonInteractive: true,
      env: "dev",
    };

    const res = await core.uninstall(inputs);
    assert.isTrue(res.isOk());
    await deleteTestProject(appName);
  });
  it("uninstall by env - invalid yaml", async () => {
    const core = new FxCore(tools);
    const appName = await mockCliUninstallProject();
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(err(new SystemError("", "", "")));
    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      nonInteractive: true,
      env: "dev",
    };
    const res = await core.uninstall(inputs);
    assert.isTrue(res.isErr());
    await deleteTestProject(appName);
  });
  it("uninstall by env - empty provision actions", async () => {
    const core = new FxCore(tools);
    const appName = await mockCliUninstallProject();
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok({} as ProjectModel));
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(new SystemError("mockedSource", "mockedError", "mockedMessage"))
    );
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      nonInteractive: true,
      env: "dev",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isOk());
    await deleteTestProject(appName);
  });
  it("uninstall by env - empty env key name", async () => {
    const restore = mockedEnv({
      TEAMS_APP_ID: "123",
      M365_TITLE_ID: "456",
      BOT_ID: "789",
    });
    const core = new FxCore(tools);
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {
          name: "provision",
          driverDefs: [
            {
              uses: "teamsApp/create",
            },
            {
              uses: "botFramework/create",
            },
            {
              uses: "teamsApp/extendToM365",
            },
          ],
        },
      } as ProjectModel)
    );
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockResolvedValue(true);
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue();
    const appName = await mockCliUninstallProject();
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
      ignoreLockByUT: true,
      nonInteractive: true,
    };

    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isOk(), "uninstall-by-env-empty-key: result should be ok");

    const envRes = await envUtil.readEnv(path.join(os.tmpdir(), appName), "dev", false);
    assert.isTrue(envRes.isOk(), "uninstall-by-env-empty-key: env read should be ok");
    restore();
    await deleteTestProject(appName);
  });
  it("uninstall by env - failed to get token", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(new SystemError("mockedSource", "mockedError", "mockedMessage"))
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockResolvedValue(true);
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue();
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue();
    const appName = await mockCliUninstallProject();
    const inputs1 = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: ["m365-app"],
      nonInteractive: true,
    };

    const res1 = await core.uninstall(inputs1 as UninstallInputs);
    assert.isTrue(res1.isErr());

    const inputs2 = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: ["app-registration"],
      nonInteractive: true,
    };

    const res2 = await core.uninstall(inputs2 as UninstallInputs);
    assert.isTrue(res2.isErr());

    const inputs3 = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: ["bot-framework-registration"],
      nonInteractive: true,
    };

    const res3 = await core.uninstall(inputs3 as UninstallInputs);
    assert.isTrue(res3.isErr());
  });
  it("uninstall by title ID - success", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue();
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeTitleId,
      [QuestionNames.TitleId]: "mocked-title-id",
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isOk());
  });
  it("uninstall by title ID - missing title ID", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue();
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeTitleId,
      nonInteractive: true,
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
  });
  it("uninstall by title ID - failed", async () => {
    const core = new FxCore(tools);
    vi.spyOn(core, "uninstallM365App").mockResolvedValue(err(new SystemError("", "", "")));
    const inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeTitleId,
      nonInteractive: true,
      [QuestionNames.TitleId]: "mocked-title-id",
    };
    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isErr());
  });
  it("uninstall M365 App - invalid input", async () => {
    const core = new FxCore(tools);
    const res = await core.uninstallM365App(undefined, undefined);
    assert.isTrue(res.isErr());
  });
  it("uninstall Bot Framework Registration - invalid input", async () => {
    const core = new FxCore(tools);
    const res = await core.uninstallBotFrameworRegistration(undefined, undefined);
    assert.isTrue(res.isErr());
  });
  it("reset env var - happy path", async () => {
    const core = new FxCore(tools);
    const ctx: CoreHookContext = { arguments: [], envVars: { testKey: "oldValue" } };
    core.resetEnvVar("testKey", ctx);
    chai.expect(ctx.envVars).to.deep.equal({ testKey: "" });
  });
  it("reset env var - undefine ctx", async () => {
    const core = new FxCore(tools);
    const ctx: CoreHookContext | undefined = undefined;
    core.resetEnvVar("testKey", ctx);
    assert.isUndefined(ctx);
  });
  it("reset env var - initialize envVars if it is undefined", async () => {
    const core = new FxCore(tools);
    const ctx: CoreHookContext = { arguments: [], envVars: undefined };
    core.resetEnvVar("testKey", ctx, false);
    chai.expect(ctx.envVars).to.deep.equal({ testKey: "" });
  });
  it("reset env var - skipIfNotExist is true", async () => {
    const core = new FxCore(tools);
    const ctx: CoreHookContext = { arguments: [], envVars: { existingKey: "value" } };
    core.resetEnvVar("testKey", ctx);
    chai.expect(ctx.envVars).to.deep.equal({ existingKey: "value" });
  });
  it("reset env var - skipIfNotExist is false", async () => {
    const core = new FxCore(tools);
    const ctx: CoreHookContext = { arguments: [], envVars: { existingKey: "value" } };
    core.resetEnvVar("testKey", ctx, false);
    chai.expect(ctx.envVars).to.deep.equal({ existingKey: "value", testKey: "" });
  });
  it("provisionResources", async () => {
    const core = new FxCore(tools);
    vi.spyOn(core, "provisionResourcesOnce").mockResolvedValue(ok(undefined));
    const res = await core.provisionResources({} as any);
    assert.isTrue(res.isOk() && res.value === undefined);
  });
});

describe("apply yaml template", async () => {
  const tools = new MockTools();
  beforeEach(() => {
    setTools(tools);
  });
  describe("when run with missing input", async () => {
    it("should return error when projectPath is undefined", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: undefined,
      };
      const res = await core.apply(inputs, "", "provision");
      assert.isTrue(res.isErr() && res.error instanceof InputValidationError);
    });

    it("should return error when env is undefined", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: undefined,
      };
      const res = await core.apply(inputs, "", "provision");
      assert.isTrue(res.isErr() && res.error instanceof InputValidationError);
    });
  });

  describe("when readEnv returns error", async () => {
    const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

    before(() => {
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(err(mockedError));
    });

    after(() => {
      vi.restoreAllMocks();
    });

    it("should return error too", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      const res = await core.apply(inputs, "./", "provision");
      assert.isTrue(res.isErr() && res.error.name === "mockedError");
    });
  });

  describe("when YamlParser returns error", async () => {
    const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

    before(() => {
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(YamlParser.prototype, "parse").mockResolvedValue(err(mockedError));
    });

    after(() => {
      vi.restoreAllMocks();
    });

    it("should return error too", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      const res = await core.apply(inputs, "./", "provision");
      assert.isTrue(res.isErr() && res.error.name === "mockedError");
    });
  });

  describe("when running against an empty yaml file", async () => {
    before(() => {
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(YamlParser.prototype, "parse").mockResolvedValue(ok({ version: "1.0.0" }));
    });

    after(() => {
      vi.restoreAllMocks();
    });

    it("should return ok", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      const res = await core.apply(inputs, "./", "provision");
      assert.isTrue(res.isOk());
    });
  });

  describe("when lifecycle returns error", async () => {
    const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

    class MockedProvision implements ILifecycle {
      name: LifecycleName = "provision";
      driverDefs: DriverDefinition[] = [];
      public async run(ctx: DriverContext): Promise<Result<Output, FxError>> {
        return err(mockedError);
      }

      public resolvePlaceholders(): UnresolvedPlaceholders {
        return [];
      }

      public async execute(ctx: DriverContext): Promise<ExecutionResult> {
        return {
          result: err({
            kind: "Failure",
            error: mockedError,
          }),
          summaries: [],
        };
      }

      public resolveDriverInstances(log: LogProvider): Result<DriverInstance[], FxError> {
        return ok([]);
      }
    }

    before(() => {
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(YamlParser.prototype, "parse").mockResolvedValue(
        ok({
          version: "1.0.0",
          provision: new MockedProvision(),
        })
      );
    });

    after(() => {
      vi.restoreAllMocks();
    });

    it("should return error", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      const res = await core.apply(inputs, "./", "provision");
      assert.isTrue(res.isErr() && res.error.name === "mockedError");
    });
  });
  describe("runLifecycle", async () => {
    const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");
    class MockedProvision implements ILifecycle {
      name: LifecycleName = "provision";
      driverDefs: DriverDefinition[] = [];
      public async run(ctx: DriverContext): Promise<Result<Output, FxError>> {
        return err(mockedError);
      }

      public resolvePlaceholders(): UnresolvedPlaceholders {
        return [];
      }

      public async execute(ctx: DriverContext): Promise<ExecutionResult> {
        return {
          result: ok(new Map()),
          summaries: [],
        };
      }

      public resolveDriverInstances(log: LogProvider): Result<DriverInstance[], FxError> {
        return ok([]);
      }
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      const context = createDriverContext(inputs);
      const lifecycle = new MockedProvision();
      const res = await core.runLifecycle(lifecycle, context, "dev");
      assert.isTrue(res.isOk());
    });

    it("partial success", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      const lifecycle = new MockedProvision();
      vi.spyOn(lifecycle, "execute").mockResolvedValue({
        result: err({
          kind: "PartialSuccess",
          env: new Map(),
          reason: {
            kind: "UnresolvedPlaceholders",
            failedDriver: { uses: "t", with: {} },
            unresolvedPlaceHolders: ["TEST_VAR"],
          },
        }),
        summaries: [],
      });
      const context = createDriverContext(inputs);
      const res = await core.runLifecycle(lifecycle, context, "dev");
      assert.isTrue(res.isOk());
    });

    it("DriverError", async () => {
      const core = new FxCore(tools);
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        env: "dev",
      };
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      const lifecycle = new MockedProvision();
      vi.spyOn(lifecycle, "execute").mockResolvedValue({
        result: err({
          kind: "PartialSuccess",
          env: new Map(),
          reason: {
            kind: "DriverError",
            failedDriver: { uses: "t", with: {} },
            error: mockedError,
          },
        }),
        summaries: [],
      });
      const context = createDriverContext(inputs);
      const res = await core.runLifecycle(lifecycle, context, "dev");
      assert.isTrue(res.isErr());
    });
  });
});

async function mockV3Project(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  // await fs.move(path.join(__dirname, "../sampleV3"), path.join(os.tmpdir(), appName));
  await fs.copy(path.join(__dirname, "../samples/sampleV3/"), path.join(projectPath));
  return appName;
}

async function mockCliUninstallProject(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  await fs.copy(path.join(__dirname, "../samples/uninstall/"), path.join(projectPath));
  return appName;
}

async function deleteTestProject(appName: string) {
  await fs.remove(path.join(os.tmpdir(), appName));
}

describe("createEnvCopyV3", async () => {
  const tools = new MockTools();
  const sourceEnvContent = [
    "# this is a comment",
    "TEAMSFX_ENV=dev",
    "APP_NAME_SUFFIX=dev",
    "AGENT_SCOPE=personal",
    "",
    "_KEY1=value1",
    "KEY2=value2",
    "SECRET_KEY3=xxxx",
  ];
  const sourceEnvStr = sourceEnvContent.join(os.EOL);

  const writeStreamContent: string[] = [];
  // fs.WriteStream's full interface is too hard to mock. We only use write() and end() so we just mock them here.
  class MockedWriteStream {
    write(chunk: any, callback?: ((error: Error | null | undefined) => void) | undefined): boolean {
      writeStreamContent.push(chunk);
      return true;
    }
    end(): boolean {
      return true;
    }
  }

  beforeEach(() => {
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(sourceEnvStr, "utf8"));
    vi.spyOn(fs, "createWriteStream").mockReturnValue(new MockedWriteStream());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create new .env file with desired content", async () => {
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("./env/.env.dev"));
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const core = new FxCore(tools);
    const res = await core.createEnvCopyV3("newEnv", "dev", "./");
    assert(res.isOk());
    assert(
      writeStreamContent[0] === `${sourceEnvContent[0]}${os.EOL}`,
      "comments should be copied"
    );
    assert(
      writeStreamContent[1] === `TEAMSFX_ENV=newEnv${os.EOL}`,
      "TEAMSFX_ENV's value should be new env name"
    );
    assert(
      writeStreamContent[2] === `APP_NAME_SUFFIX=newEnv${os.EOL}`,
      "APP_NAME_SUFFIX's value should be new env name"
    );
    assert(
      writeStreamContent[3] === `AGENT_SCOPE=personal${os.EOL}`,
      "AGENT_SCOPE's value should be personal"
    );
    assert(writeStreamContent[4] === `${os.EOL}`, "empty line should be coped");
    assert(
      writeStreamContent[5] === `_KEY1=${os.EOL}`,
      "key starts with _ should be copied with empty value"
    );
    assert(
      writeStreamContent[6] === `KEY2=${os.EOL}`,
      "key not starts with _ should be copied with empty value"
    );
    assert(
      writeStreamContent[7] === `SECRET_KEY3=${os.EOL}`,
      "key not starts with SECRET_ should be copied with empty value"
    );
  });

  it("should failed case 1", async () => {
    vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValueOnce(err(new UserError({})));
    const core = new FxCore(tools);
    const res = await core.createEnvCopyV3("newEnv", "dev", "./");
    assert(res.isErr());
  });

  it("should failed case 2", async () => {
    vi.spyOn(pathUtils, "getEnvFilePath")
      .mockResolvedValueOnce(ok("./env"))
      .mockResolvedValueOnce(err(new UserError({})));
    const core = new FxCore(tools);
    const res = await core.createEnvCopyV3("newEnv", "dev", "./");
    assert(res.isErr());
  });
});

describe("publishInDeveloperPortal", () => {
  const tools = new MockTools();
  before(() => {
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("success", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      env: "local",
      projectPath: "project-path",
      platform: Platform.VSCode,
      [QuestionNames.AppPackagePath]: "path",
      ignoreLockByUT: true,
    };
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(coordinator, "publishInDeveloperPortal").mockResolvedValue(ok(undefined));
    const res = await core.publishInDeveloperPortal(inputs);

    if (res.isErr()) {
      console.log(res.error);
    }
    assert.isTrue(res.isOk());
  });
});

describe("Teams app APIs", async () => {
  const tools = new MockTools();
  const core = new FxCore(tools);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validate app package", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppPackageFilePath]: ".\\build\\appPackage\\appPackage.dev.zip",
      [QuestionNames.ValidateMethod]: "validateAgainstAppPackage",
      projectPath: path.join(os.tmpdir(), appName),
    };

    const runSpy = vi.spyOn(ValidateAppPackageDriver.prototype, "execute");
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    await core.validateApplication(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
  });

  it("validate manifest", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: ".\\appPackage\\manifest.json",
      [QuestionNames.ValidateMethod]: "validateAgainstSchema",
      projectPath: path.join(os.tmpdir(), appName),
    };

    const runSpy = vi.spyOn(ValidateManifestDriver.prototype, "execute");
    await core.validateApplication(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
  });

  it("validate with test cases", async () => {
    const appName = await mockV3Project();

    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppPackageFilePath]: ".\\build\\appPackage\\appPackage.dev.zip",
      [QuestionNames.ValidateMethod]: "validateWithTestCases",
      projectPath: path.join(os.tmpdir(), appName),
    };

    const runSpy = vi.spyOn(ValidateWithTestCasesDriver.prototype, "execute");
    await core.validateApplication(inputs);
    chai.expect(runSpy.mock.calls).lengthOf(1);
  });

  it("create app package", async () => {
    setTools(tools);
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: ".\\appPackage\\manifest.json",
      projectPath: path.join(os.tmpdir(), appName),
      [QuestionNames.OutputZipPathParamName]: ".\\build\\appPackage\\appPackage.dev.zip",
    };

    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.spyOn(CommonTools, "runForTypeSpecProject").mockResolvedValue();
    const runStub = vi
      .spyOn(CreateAppPackageDriver.prototype, "execute")
      .mockResolvedValue({ result: ok(new Map()), summaries: [] });
    const showMessageStub = vi.spyOn(tools.ui, "showMessage");
    await core.createAppPackage(inputs);
    chai.expect(runStub.mock.calls).lengthOf(1);
    chai.expect(showMessageStub.mock.calls).lengthOf(1);
  });

  it("publish application", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      projectPath: path.join(os.tmpdir(), appName),
    };

    vi.spyOn(coordinator, "publish").mockResolvedValue(
      err(new SystemError("mockedSource", "mockedError", "mockedMessage"))
    );
    await core.publishApplication(inputs);
  });
});

describe("previewWithManifest", () => {
  const tools = new MockTools();
  const core = new FxCore(tools);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getManifestV3 error", async () => {
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(err({ foo: "bar" } as any));
    const appName = await mockV3Project();
    const inputs: Inputs = {
      [QuestionNames.M365Host]: HubOptions.teams().id,
      [QuestionNames.TeamsAppManifestFilePath]: path.join(
        os.tmpdir(),
        appName,
        "appPackage",
        "manifest.template.json"
      ),
      env: "dev",
      platform: Platform.VSCode,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const result = await core.previewWithManifest(inputs);
    assert.isTrue(result.isErr());
    assert.deepEqual((result as any).error, { foo: "bar" });
  });

  it("getLaunchUrl error", async () => {
    const appName = await mockV3Project();
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok({} as TeamsManifest));
    vi.spyOn(LaunchHelper.prototype, "getLaunchUrl").mockResolvedValue(err({ foo: "bar" } as any));
    const inputs: Inputs = {
      [QuestionNames.M365Host]: HubOptions.teams().id,
      [QuestionNames.TeamsAppManifestFilePath]: path.join(
        os.tmpdir(),
        appName,
        "appPackage",
        "manifest.template.json"
      ),
      env: "dev",
      platform: Platform.VSCode,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const result = await core.previewWithManifest(inputs);
    assert.isTrue(result.isErr());
    assert.deepEqual((result as any).error, { foo: "bar" });
  });

  it("happy path", async () => {
    const appName = await mockV3Project();
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok({} as TeamsManifest));
    vi.spyOn(LaunchHelper.prototype, "getLaunchUrl").mockResolvedValue(ok("test-url"));
    const inputs: Inputs = {
      [QuestionNames.M365Host]: HubOptions.teams().id,
      [QuestionNames.TeamsAppManifestFilePath]: path.join(
        os.tmpdir(),
        appName,
        "appPackage",
        "manifest.template.json"
      ),
      env: "dev",
      platform: Platform.VSCode,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const result = await core.previewWithManifest(inputs);
    assert.isTrue(result.isOk());
    assert.deepEqual((result as any).value, "test-url");
  });
});

describe("getProjectId", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("happy path", async () => {
    const core = new FxCore(tools);
    vi.spyOn(core, "getProjectMetadata").mockResolvedValue(
      ok({
        projectId: "12345",
        version: "1.1.1",
      })
    );
    const res = await core.getProjectId(".");
    assert.isTrue(res.isOk() && res.value === "12345");
  });
  it("return empty value", async () => {
    const core = new FxCore(tools);
    vi.spyOn(core, "getProjectMetadata").mockResolvedValue(ok({}));
    const res = await core.getProjectId(".");
    assert.isTrue(res.isOk() && res.value === "");
  });
});
describe("getProjectMetadata", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("happy path", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("version: 1.1.1\nprojectId: 12345" as any);
    const core = new FxCore(tools);
    const res = await core.getProjectMetadata(".");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, {
        projectId: "12345",
        version: "1.1.1",
      });
    }
  });
  it("yml not exist", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockResolvedValue(false);
    const core = new FxCore(tools);
    const res = await core.getProjectMetadata(".");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, {});
    }
  });
  it("throw error", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    vi.spyOn(fs, "pathExistsSync").mockImplementation(() => {
      throw new Error("mocked error");
    });
    const core = new FxCore(tools);
    const res = await core.getProjectMetadata(".");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, {});
    }
  });
});
describe("getTeamsAppName", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("happy path", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    const mockProjectModel: any = {
      projectId: "12345",
      provision: {
        name: "provision",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: {
              name: "testappname-${{TEAMSFX_ENV}}",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
        ],
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    const core = new FxCore(tools);
    const res = await core.getTeamsAppName(".");
    assert.isTrue(res.isOk() && res.value === "testappname-");
  });
  it("happy path", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    const mockProjectModel: any = {
      projectId: "12345",
      provision: {
        name: "provision",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: {
              name: "testappname${{APP_NAME_SUFFIX}}",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
        ],
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    const core = new FxCore(tools);
    const res = await core.getTeamsAppName(".");
    assert.isTrue(res.isOk() && res.value === "testappname");
  });
  it("return empty value", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    const mockProjectModel: any = {};
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    const core = new FxCore(tools);
    const res = await core.getTeamsAppName(".");
    assert.isTrue(res.isOk() && res.value === "");
  });
  it("parse yml error", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(err(new UserError({})));
    const core = new FxCore(tools);
    const res = await core.getTeamsAppName(".");
    assert.isTrue(res.isErr());
  });
});

describe("getProjectInfo", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("happy path", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    const mockProjectModel: any = {
      projectId: "mock-project-id",
      provision: {
        name: "provision",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: {
              name: "testappname-${{TEAMSFX_ENV}}",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
        ],
      },
    };
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAMS_APP_ID: "mock-team-app-id",
        TEAMS_APP_TENANT_ID: "mock-tenant-id",
      })
    );
    const core = new FxCore(tools);
    const res = await core.getProjectInfo(".", "dev");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value, {
        projectId: "mock-project-id",
        teamsAppId: "mock-team-app-id",
        m365TenantId: "mock-tenant-id",
        teamsAppName: "testappname",
      });
    }
  });
  it("parse yml error", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(err(new UserError({})));
    const core = new FxCore(tools);
    const res = await core.getProjectInfo(".", "dev");
    assert.isTrue(res.isErr());
  });
  it("read env error", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok({} as any));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(err(new UserError({})));
    const core = new FxCore(tools);
    const res = await core.getProjectInfo(".", "dev");
    assert.isTrue(res.isErr());
  });
});

describe("checkProjectType", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("happy 1", async () => {
    vi.spyOn(projectTypeChecker, "checkProjectType").mockResolvedValue({
      isTeamsFx: false,
      lauguages: [],
      hasTeamsManifest: false,
      dependsOnTeamsJs: false,
    });
    const core = new FxCore(tools);
    const res = await core.checkProjectType("");
    assert.isTrue(res.isOk());
  });

  it("happy 2", async () => {
    vi.spyOn(projectTypeChecker, "checkProjectType").mockResolvedValue({
      isTeamsFx: true,
      teamsfxConfigType: MetadataV3.configFile,
      teamsfxConfigVersion: "1.0.0",
      teamsfxVersionState: TeamsfxVersionState.Compatible,
      teamsfxProjectId: "xxxx-xxxx-xxxx",
      lauguages: [],
      hasTeamsManifest: true,
      manifestCapabilities: ["bot"],
      manifestAppId: "xxx",
      manifestVersion: "1.17",
      dependsOnTeamsJs: true,
    });
    const core = new FxCore(tools);
    const res = await core.checkProjectType("");
    assert.isTrue(res.isOk());
  });
});

describe("isEnvFile", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("file patten not match", async () => {
    const core = new FxCore(tools);
    const res = await core.isEnvFile(".", ".abc.dev");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isFalse(res.value);
    }
  });
  it("getEnvFolderPath return error", async () => {
    vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(err(new UserError({})));
    const core = new FxCore(tools);
    const res = await core.isEnvFile(".", ".env.dev");
    assert.isTrue(res.isErr());
  });
  it("getEnvFolderPath return undefined", async () => {
    vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok(undefined));
    const core = new FxCore(tools);
    const res = await core.isEnvFile(".", ".env.dev");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isFalse(res.value);
    }
  });
  it("folder not match", async () => {
    vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("/tmp"));
    const core = new FxCore(tools);
    const res = await core.isEnvFile("/tmp", "/tmp1/.env.dev");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isFalse(res.value);
    }
  });
  it("match", async () => {
    vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("/tmp"));
    const core = new FxCore(tools);
    const res = await core.isEnvFile("/tmp", "/tmp/.env.dev");
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isTrue(res.value);
    }
  });
});
// copilotPlugin cases are migrated to tests/core/FxCore.plugin.test.ts

// addPlugin cases are migrated to tests/core/FxCore.plugin.test.ts

// regeneratePlugin cases are migrated to tests/core/FxCore.plugin.test.ts

// addAuthAction cases are migrated to tests/core/FxCore.plugin.test.ts

// addKnowledge cases are migrated to tests/core/FxCore.knowledge.test.ts

// fetchOnlineTemplateMetadata cases are migrated to tests/core/FxCore.templateMetadata.test.ts

// fetchOnlineTemplateMetadataForVS cases are migrated to tests/core/FxCore.templateMetadata.test.ts
