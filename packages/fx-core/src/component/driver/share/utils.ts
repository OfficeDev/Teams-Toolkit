// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, FxError, ok, Result, TeamsAppManifest, UserError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import { getLocalizedString } from "../../../common/localizeUtils";
import { DriverDefinition } from "../../configManager/interface";
import { resolve } from "../../configManager/lifecycle";
import { envUtil } from "../../utils/envUtil";
import { metadataUtil } from "../../utils/metadataUtil";
import { pathUtils } from "../../utils/pathUtils";
import { actionName as agentPublishActionName } from "../copilotAgent/publish";
import { actionName as extendToM365ActionName } from "../m365/acquire";
import { Constants } from "../teamsApp/constants";

// Read m365agents.yaml and get the value of shared title id, and shared app id
export async function parseShareAppActionYamlConfig(
  projectPath: string,
  env = "dev"
): Promise<Result<{ teamsappId: string; titleId: string; appId: string }, FxError>> {
  const templatePath = pathUtils.getYmlFilePath(projectPath, env) as string;
  const maybeProjectModel = await metadataUtil.parse(templatePath);
  if (maybeProjectModel.isErr()) {
    return err(maybeProjectModel.error);
  }
  const version = semver.coerce(maybeProjectModel.value.version);
  if (version && semver.lt(version, "1.10.0")) {
    // it's not supported before v1.10.
    return err(
      new UserError("FxCore", "Share", getLocalizedString("error.share.yamlConfigNotSupported"))
    );
  }
  const projectModel = maybeProjectModel.value;
  if (
    (!projectModel.provision || !projectModel.provision.driverDefs) &&
    (!projectModel.deploy || !projectModel.deploy.driverDefs)
  ) {
    return err(
      new UserError("FxCore", "Share", getLocalizedString("error.share.yamlConfigNotFound"))
    );
  }
  const agentPublishAction =
    projectModel.provision?.driverDefs.find((d) => d.uses === agentPublishActionName) ||
    projectModel.provision?.driverDefs.find((d) => d.uses === extendToM365ActionName) ||
    projectModel.deploy?.driverDefs.find((d) => d.uses === extendToM365ActionName);
  if (!agentPublishAction) {
    return err(
      new UserError(
        "FxCore",
        "Share",
        getLocalizedString("error.share.shareActionConfigNotFound", agentPublishActionName)
      )
    );
  }

  // 1. get manifest id
  const appPackagePath = (agentPublishAction.with as any)?.appPackagePath;
  if (!appPackagePath) {
    return err(
      new UserError(
        "FxCore",
        "Share to Users",
        getLocalizedString("error.share.appPackageConfigNotFound")
      )
    );
  }

  const readEnvRes = await envUtil.readEnv(projectPath, env);
  if (readEnvRes.isErr()) {
    return err(readEnvRes.error);
  }
  const resolvedDriver = resolve(agentPublishAction, [], []) as DriverDefinition;
  const resolvedAppPackagePath = path.resolve(
    projectPath,
    (resolvedDriver.with as any).appPackagePath as string
  );
  if (!fs.existsSync(resolvedAppPackagePath)) {
    return err(
      new UserError(
        "FxCore",
        "Share",
        getLocalizedString("error.share.appPackageNotFound", resolvedAppPackagePath)
      )
    );
  }
  const zipEntries = new AdmZip(resolvedAppPackagePath).getEntries();
  const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
  if (!manifestFile) {
    return err(
      new UserError(
        "FxCore",
        "Share to Users",
        getLocalizedString("error.share.manifestFileNotFound")
      )
    );
  }
  const manifest = JSON.parse(manifestFile.getData().toString()) as TeamsAppManifest;
  const manifestId = manifest.id;
  if (!manifestId) {
    return err(
      new UserError(
        "FxCore",
        "Share to Users",
        getLocalizedString("error.share.manifestIdNotFound")
      )
    );
  }

  // 2. get shared title id and shared app id
  const sharedTitleIdEnvName = (agentPublishAction.writeToEnvironmentFile as any)?.titleId;
  const sharedAppIdEnvName = (agentPublishAction.writeToEnvironmentFile as any)?.appId;
  if (!sharedTitleIdEnvName || !sharedAppIdEnvName) {
    return err(
      new UserError("FxCore", "Share", getLocalizedString("error.share.sharedConfigNotFound"))
    );
  }
  // env file has already been loaded before calling this function.
  const sharedTitleId = process.env[sharedTitleIdEnvName];
  const sharedAppId = process.env[sharedAppIdEnvName];
  if (!sharedTitleId || !sharedAppId) {
    return err(
      new UserError(
        "FxCore",
        "Share",
        getLocalizedString("error.share.sharedIdNotFound", sharedTitleId, sharedAppId)
      )
    );
  }
  return ok({ teamsappId: manifestId, titleId: sharedTitleId, appId: sharedAppId });
}
