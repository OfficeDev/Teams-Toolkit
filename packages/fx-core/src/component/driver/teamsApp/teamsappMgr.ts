// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  Colors,
  FxError,
  Result,
  TeamsAppInputs,
  TeamsManifestLatest,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import * as path from "path";
import { Container } from "typedi";
import * as util from "util";
import { AppStudioScopes } from "../../../common/constants";
import { getLocalizedString } from "../../../common/localizeUtils";
import { runForTypeSpecProject } from "../../../common/tools";
import { FileNotFoundError, MissingRequiredInputError } from "../../../error/common";
import { resolveString } from "../../configManager/lifecycle";
import { envUtil } from "../../utils/envUtil";
import { pathUtils } from "../../utils/pathUtils";
import { DriverContext } from "../interface/commonArgs";
import { createDriverContext } from "../util/utils";
import { ConfigureTeamsAppDriver, actionName as configureTeamsAppActionName } from "./configure";
import { Constants } from "./constants";
import {
  CreateAppPackageDriver,
  actionName as createAppPackageActionName,
} from "./createAppPackage";
import { ConfigureTeamsAppArgs } from "./interfaces/ConfigureTeamsAppArgs";
import { CreateAppPackageArgs } from "./interfaces/CreateAppPackageArgs";
import { PublishAppPackageArgs } from "./interfaces/PublishAppPackageArgs";
import { ValidateAppPackageArgs } from "./interfaces/ValidateAppPackageArgs";
import { ValidateManifestArgs } from "./interfaces/ValidateManifestArgs";
import { ValidateWithTestCasesArgs } from "./interfaces/ValidateWithTestCasesArgs";
import {
  actionName as PublishAppPackageActionName,
  PublishAppPackageDriver,
} from "./publishAppPackage";
import { manifestUtils } from "./utils/ManifestUtils";
import { ValidateManifestDriver } from "./validate";
import { ValidateAppPackageDriver } from "./validateAppPackage";
import { ValidateWithTestCasesDriver } from "./validateTestCases";

export const teamsAppMgrDeps = {
  runForTypeSpecProject,
};

class TeamsAppMgr {
  async ensureAppPackageFile(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    // if no package file input, then do package first
    if (!inputs["package-file"]) {
      const packageRes = await this.packageTeamsApp(inputs);
      if (packageRes.isErr()) {
        return err(packageRes.error);
      }
      inputs["package-file"] = packageRes.value.outputZipPath;
    }
    if (!(await fs.pathExists(inputs["package-file"]))) {
      return err(new FileNotFoundError("TeamsAppMgr", inputs["package-file"]));
    }
    return ok(undefined);
  }

  async readManifestFromZip(appPackagePath: string): Promise<Result<TeamsManifestLatest, FxError>> {
    const archivedFile = await fs.readFile(appPackagePath);
    const zipEntries = new AdmZip(archivedFile).getEntries();
    const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
    if (manifestFile) {
      const manifestContent = manifestFile.getData().toString();
      const manifest = JSON.parse(manifestContent) as TeamsManifestLatest;
      return ok(manifest);
    }
    return err(
      new FileNotFoundError("TeamsAppMgr", appPackagePath + ":" + Constants.MANIFEST_FILE)
    );
  }

  async checkAndTryToLoadEnv(inputs: TeamsAppInputs): Promise<Result<string | undefined, FxError>> {
    //check placeholders in manifest file, if there are unresolved placeholders in manifest file, try to load env file
    const manifestFile = inputs["manifest-file"] as string;
    const manifestString = await fs.readFile(manifestFile, { encoding: "utf-8" });
    const unresolved: string[] = [];
    const resovled: string[] = [];
    resolveString(manifestString, resovled, unresolved);
    let env: string | undefined = undefined;
    if (unresolved.length > 0) {
      if (!inputs["env-file"]) {
        const envRes = await envUtil.listEnv(inputs.projectPath);
        if (envRes.isErr()) {
          return err(envRes.error);
        }
        const envs = envRes.value;
        const envFolderPathRes = await pathUtils.getEnvFolderPath(inputs.projectPath);
        if (envFolderPathRes.isErr()) {
          return err(envFolderPathRes.error);
        }
        const envFolder = envFolderPathRes.value;
        if (!envFolder) return ok(env);
        if (inputs.env) {
          // env provided
          if (envs.includes(inputs.env)) {
            //env provided and found
            inputs["env-file"] = path.join(envFolder, `.env.${inputs.env}`);
            env = inputs.env;
          } else {
            // env provided but not found
            return err(
              new FileNotFoundError("TeamsAppMgr", path.join(envFolder, `.env.${inputs.env}`))
            );
          }
        } else {
          //env not provided
          if (envs.length > 1) {
            //need provide
            return err(new MissingRequiredInputError("env", "TeamsAppMgr"));
          } else if (envs.length === 1) {
            // no need provide
            env = envs[0];
            inputs["env-file"] = path.join(envFolder, `.env.${env}`);
          } else {
            // no env file found
          }
        }
      }
      if (inputs["env-file"]) {
        const res = await envUtil.loadEnvFile(inputs["env-file"]);
        if (res.isErr()) {
          return err(res.error);
        }
      }
    }
    env = env || inputs.env;
    process.env.TEAMSFX_ENV = env;
    return ok(env);
  }

  async packageTeamsApp(inputs: TeamsAppInputs): Promise<Result<CreateAppPackageArgs, FxError>> {
    if (!inputs["manifest-file"]) {
      const defaultManifestPath = manifestUtils.getTeamsAppManifestPath(inputs.projectPath);
      if (!(await fs.pathExists(defaultManifestPath))) {
        return err(new MissingRequiredInputError("package-file/manifest-file", "TeamsAppMgr"));
      }
      inputs["manifest-file"] = defaultManifestPath;
    } else {
      if (!(await fs.pathExists(inputs["manifest-file"]))) {
        return err(new FileNotFoundError("TeamsAppMgr", inputs["manifest-file"]));
      }
    }

    const loadEnvRes = await this.checkAndTryToLoadEnv(inputs);
    if (loadEnvRes.isErr()) return err(loadEnvRes.error);
    const env = loadEnvRes.value;

    // reach here means manifes-file is provided and exists
    inputs["output-package-file"] =
      inputs["output-package-file"] ||
      path.join(
        inputs.projectPath,
        "appPackage",
        "build",
        env ? `appPackage.${env}.zip` : "appPackage.zip"
      );
    inputs["output-folder"] =
      inputs["output-folder"] || path.join(inputs.projectPath, "appPackage", "build");

    const packageArgs: CreateAppPackageArgs = {
      manifestPath: inputs["manifest-file"],
      outputZipPath: inputs["output-package-file"],
      outputFolder: inputs["output-folder"],
    };
    const buildDriver: CreateAppPackageDriver = Container.get(createAppPackageActionName);
    const driverContext: DriverContext = createDriverContext(inputs);

    // For TSP projects
    await teamsAppMgrDeps.runForTypeSpecProject(inputs.projectPath, driverContext);
    const res = (await buildDriver.execute(packageArgs, driverContext)).result;
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(packageArgs);
  }

  /**
   * entry of validate teams app
   */
  async validateTeamsApp(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    const context: DriverContext = createDriverContext(inputs);
    if (!inputs["manifest-file"] && !inputs["package-file"]) {
      // neither manifest-file nor package-file provided, use default manifest file
      const defaultManifestPath = manifestUtils.getTeamsAppManifestPath(inputs.projectPath);
      if (!(await fs.pathExists(defaultManifestPath))) {
        return err(new MissingRequiredInputError("package-file/manifest-file", "TeamsAppMgr"));
      }
      inputs["manifest-file"] = defaultManifestPath;
    }
    if (inputs["manifest-file"]) {
      const loadEnvRes = await this.checkAndTryToLoadEnv(inputs);
      if (loadEnvRes.isErr()) return err(loadEnvRes.error);
      const teamsAppManifestFilePath = inputs["manifest-file"];
      const args: ValidateManifestArgs = {
        manifestPath: teamsAppManifestFilePath,
        showMessage: inputs?.showMessage != undefined ? inputs.showMessage : true,
      };
      const driver: ValidateManifestDriver = Container.get("teamsApp/validateManifest");
      const result = (await driver.execute(args, context)).result;
      if (result.isErr()) {
        return err(result.error);
      }
    } else if (inputs["package-file"]) {
      const teamsAppPackageFilePath = inputs["package-file"];
      if (inputs["validate-method"] == "test-cases") {
        const args: ValidateWithTestCasesArgs = {
          appPackagePath: teamsAppPackageFilePath,
          showProgressBar: false,
          showMessage: true,
        };
        const driver: ValidateWithTestCasesDriver = Container.get("teamsApp/validateWithTestCases");
        const result = (await driver.execute(args, context)).result;
        if (result.isErr()) {
          return err(result.error);
        }
      } else {
        const args: ValidateAppPackageArgs = {
          appPackagePath: teamsAppPackageFilePath,
          showMessage: true,
        };
        const driver: ValidateAppPackageDriver = Container.get("teamsApp/validateAppPackage");
        const result = (await driver.execute(args, context)).result;
        if (result.isErr()) {
          return err(result.error);
        }
      }
    }
    return ok(undefined);
  }

  /**
   * entry of update teams app
   */
  async updateTeamsApp(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    // 1. zip package if necessary
    const packageRes = await this.ensureAppPackageFile(inputs);
    if (packageRes.isErr()) {
      return err(packageRes.error);
    }

    const appPackageFile = inputs["package-file"] as string;

    const driverContext: DriverContext = createDriverContext(inputs);

    // 2. validate against app package
    const args: ValidateAppPackageArgs = {
      appPackagePath: appPackageFile,
      showMessage: true,
    };
    const driver: ValidateAppPackageDriver = Container.get("teamsApp/validateAppPackage");
    const validateRes = (await driver.execute(args, driverContext)).result;
    if (validateRes.isErr()) {
      return err(validateRes.error);
    }

    // 3. update app package
    const updateTeamsAppArgs: ConfigureTeamsAppArgs = {
      appPackagePath: appPackageFile,
    };

    const configureDriver: ConfigureTeamsAppDriver = Container.get(configureTeamsAppActionName);
    const updateRes = (await configureDriver.execute(updateTeamsAppArgs, driverContext)).result;
    if (updateRes.isErr()) {
      return err(updateRes.error);
    }

    // 4. show result
    let loginHint = "";
    const accountRes = await driverContext.m365TokenProvider.getJsonObject({
      scopes: AppStudioScopes(),
    });
    if (accountRes.isOk()) {
      loginHint = accountRes.value.unique_name as string;
    }
    const manifestRes = await this.readManifestFromZip(appPackageFile);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }
    const manifest = manifestRes.value;
    const teamsAppId = manifest.id;
    const url = util.format(Constants.DEVELOPER_PORTAL_APP_PACKAGE_URL, teamsAppId, loginHint);
    const message = [
      {
        content: getLocalizedString("plugins.appstudio.teamsAppUpdatedCLINotice"),
        color: Colors.BRIGHT_GREEN,
      },
      { content: url, color: Colors.BRIGHT_CYAN },
    ];
    void driverContext.ui?.showMessage("info", message, false);
    return ok(undefined);
  }

  async publishTeamsApp(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    // 1. zip package if necessary
    const packageRes = await this.ensureAppPackageFile(inputs);
    if (packageRes.isErr()) {
      return err(packageRes.error);
    }

    const appPackageFile = inputs["package-file"] as string;

    const driverContext: DriverContext = createDriverContext(inputs);

    // 2. validate against app package
    const args: ValidateAppPackageArgs = {
      appPackagePath: appPackageFile,
      showMessage: true,
    };
    const driver: ValidateAppPackageDriver = Container.get("teamsApp/validateAppPackage");
    const validateRes = (await driver.execute(args, driverContext)).result;
    if (validateRes.isErr()) {
      return err(validateRes.error);
    }

    // 3. publish app package
    const publishArgs: PublishAppPackageArgs = {
      appPackagePath: appPackageFile,
    };

    const publishDriver: PublishAppPackageDriver = Container.get(PublishAppPackageActionName);
    const updateRes = (await publishDriver.execute(publishArgs, driverContext)).result;
    if (updateRes.isErr()) {
      return err(updateRes.error);
    }
    void driverContext.ui?.showMessage(
      "info",
      `publish successfully, Go to admin portal: ${Constants.TEAMS_ADMIN_PORTAL}`,
      false
    );
    return ok(undefined);
  }
}

export const teamsappMgr = new TeamsAppMgr();
