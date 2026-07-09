// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, Result, err, ok } from "@microsoft/teamsfx-api";
import * as deepDiff from "deep-diff";
import fs from "fs-extra";
import * as path from "path";
import { Service } from "typedi";
import { getLocalizedString } from "../../../common/localizeUtils";
import { DotenvOutput, envUtil } from "../../utils/envUtil";
import { metadataUtil } from "../../utils/metadataUtil";
import { pathUtils } from "../../utils/pathUtils";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { WrapDriverContext } from "../util/wrapUtil";
import * as appStudio from "./appStudio";
import { AppStudioError } from "./errors";
import { SyncManifestArgs } from "./interfaces/SyncManifest";
import { AppStudioResultFactory } from "./results";
import { manifestUtils } from "./utils/ManifestUtils";

const actionName = "teamsApp/syncManifest";

@Service(actionName)
export class SyncManifestDriver implements StepDriver {
  description?: string | undefined;
  progressTitle?: string | undefined;
  public async execute(args: SyncManifestArgs, context: DriverContext): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.sync(args, wrapContext);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  public async sync(
    args: SyncManifestArgs,
    context: WrapDriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    if (!args.projectPath || !args.env) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.SyncManifestFailedError.name,
          AppStudioError.SyncManifestFailedError.message([
            getLocalizedString("error.appstudio.syncManifestInvalidInput"),
          ])
        )
      );
    }

    const res = await this.getTeamsAppIdAndManifestTemplatePath(args);
    if (res.isErr()) {
      return err(res.error);
    }

    const teamsAppId = res.value.get("teamsAppId")!;

    const manifestTemplatePath = res.value.get("manifestTemplatePath")!;

    const appPackageRes = await appStudio.getAppPackage(
      teamsAppId,
      context.m365TokenProvider,
      context.logProvider
    );
    if (appPackageRes.isErr()) {
      return err(appPackageRes.error);
    }
    const appPackage = appPackageRes.value;
    if (!appPackage.manifest) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.SyncManifestFailedError.name,
          AppStudioError.SyncManifestFailedError.message([
            getLocalizedString("error.appstudio.syncManifestNoManifest"),
          ])
        )
      );
    }
    const newManifest = JSON.parse(appPackage.manifest.toString("utf8"));
    // save the new manifest file.
    const timeStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const manifestFileName = `manifest.${args.env}.${teamsAppId}.json`;
    const dirPath = path.join(args.projectPath, "appPackage", "syncHistory", timeStamp);
    const filePath = path.join(dirPath, manifestFileName);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(newManifest, null, "\t"));
    context.logProvider.info(getLocalizedString("core.syncManifest.saveManifestSuccess", filePath));

    const currentManifestRes = await manifestUtils._readAppManifest(manifestTemplatePath);
    if (currentManifestRes.isErr()) {
      return err(currentManifestRes.error);
    }
    const currentManifest = currentManifestRes.value as any;
    const differences = deepDiff.diff(currentManifest, newManifest);
    // If there are add or delete differences, log warnings and return.
    // If there are edit differences, check if the different values are variable placeholders, like: ${{Teams_APP_ID}}.
    const diffVariablesMap = new Map<string, string>();
    for (const diff of differences ?? []) {
      if (diff.kind === "N") {
        context.logProvider.warning(
          getLocalizedString("core.syncManifest.addWarning", diff.path, diff.rhs)
        );
        return ok(new Map<string, string>());
      }
      if (diff.kind === "D") {
        context.logProvider.warning(
          getLocalizedString("core.syncManifest.deleteWarning", diff.path, diff.lhs)
        );
        return ok(new Map<string, string>());
      }
      if (diff.kind === "E") {
        const leftValue = diff.lhs;
        const rightValue = diff.rhs;
        const res = this.matchPlaceholders(leftValue, rightValue);
        if (res.isErr()) {
          context.logProvider.warning(res.error.message);
          return ok(new Map<string, string>());
        }
        for (const [key, value] of res.value) {
          if (diffVariablesMap.has(key)) {
            if (diffVariablesMap.get(key) !== value) {
              context.logProvider.warning(
                getLocalizedString(
                  "core.syncManifest.editKeyConflict",
                  key,
                  diffVariablesMap.get(key),
                  value
                )
              );
              return ok(new Map<string, string>());
            }
          } else {
            diffVariablesMap.set(key, value);
          }
        }
      }
    }
    if (diffVariablesMap.size === 0) {
      context.logProvider.info(getLocalizedString("core.syncManifest.noDiff"));
      return ok(new Map<string, string>());
    }
    const currentEnvRes = await envUtil.readEnv(args.projectPath, args.env);
    if (currentEnvRes.isErr()) {
      return err(currentEnvRes.error);
    }

    const envToUpdate: DotenvOutput = {};
    for (const [key, value] of diffVariablesMap) {
      if (currentEnvRes.value[key] != value) {
        envToUpdate[key] = value;
      }
    }
    if (Object.keys(envToUpdate).length > 0) {
      const res = await envUtil.writeEnv(args.projectPath, args.env, envToUpdate);
      if (res.isErr()) {
        return err(res.error);
      }
      context.logProvider.info(
        getLocalizedString("core.syncManifest.updateEnvSuccess", args.env, envToUpdate)
      );
    }
    context.logProvider.info(getLocalizedString("core.syncManifest.success", args.env));
    return ok(new Map<string, string>());
  }

  // Returns the teams app id and manifest template path.
  // Map key: "teamsAppId", "manifestTemplatePath".
  private async getTeamsAppIdAndManifestTemplatePath(
    args: SyncManifestArgs
  ): Promise<Result<Map<string, string>, FxError>> {
    const envRes = await envUtil.readEnv(args.projectPath, args.env);
    if (envRes.isErr()) {
      return err(envRes.error);
    }
    const teamsappYamlPath = pathUtils.getYmlFilePath(args.projectPath, args.env) as string;
    const yamlProjectModel = await metadataUtil.parse(teamsappYamlPath);
    if (yamlProjectModel.isErr()) {
      return err(yamlProjectModel.error);
    }
    const projectModel = yamlProjectModel.value;
    let teamsAppId = args.teamsAppId;
    if (!teamsAppId) {
      for (const action of projectModel.provision?.driverDefs ?? []) {
        if (action.uses === "teamsApp/create") {
          const teamsAppIdKeyName = action.writeToEnvironmentFile?.teamsAppId || "TEAMS_APP_ID";
          teamsAppId = envRes.value[teamsAppIdKeyName];
        }
      }
      if (!teamsAppId) {
        return err(
          AppStudioResultFactory.UserError(
            AppStudioError.SyncManifestFailedError.name,
            AppStudioError.SyncManifestFailedError.message([
              getLocalizedString("error.appstudio.syncManifestNoTeamsAppId"),
            ])
          )
        );
      }
    }
    let yamlManifestPath = "";
    for (const action of projectModel.provision?.driverDefs ?? []) {
      if (action.uses === "teamsApp/zipAppPackage") {
        const parameters = action.with as { [key: string]: string };
        yamlManifestPath = parameters["manifestPath"];
      }
    }
    const deafultManifestTemplatePath = path.join(args.projectPath, "appPackage", "manifest.json");
    let manifestTemplatePath = "";
    if (!yamlManifestPath) {
      manifestTemplatePath = deafultManifestTemplatePath;
    } else if (path.isAbsolute(yamlManifestPath)) {
      manifestTemplatePath = yamlManifestPath;
    } else {
      manifestTemplatePath = path.join(args.projectPath, yamlManifestPath);
    }
    return ok(
      new Map([
        ["teamsAppId", teamsAppId],
        ["manifestTemplatePath", manifestTemplatePath],
      ])
    );
  }

  // Check if the value matches the template with placeholders and return the placeholder map.
  private matchPlaceholders(template: string, value: string): Result<Map<string, string>, FxError> {
    const placeholderPattern = /\${{(.*?)}}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = placeholderPattern.exec(template)) !== null) {
      placeholders.push(match[1]);
    }
    if (placeholders.length === 0) {
      if (template === value) {
        return ok(new Map());
      } else {
        return err(
          AppStudioResultFactory.UserError(
            AppStudioError.SyncManifestFailedError.name,
            AppStudioError.SyncManifestFailedError.message([
              getLocalizedString("core.syncManifest.editNonVarPlaceholder", template, value),
            ])
          )
        );
      }
    }
    const regexPattern = template.replace(placeholderPattern, "(.*?)");
    const regex = new RegExp(`^${regexPattern}$`);
    const matchValues = value.match(regex);
    if (!matchValues) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.SyncManifestFailedError.name,
          AppStudioError.SyncManifestFailedError.message([
            getLocalizedString("core.syncManifest.editNotMatch", template, value),
          ])
        )
      );
    }
    const result = new Map<string, string>();
    for (let i = 0; i < placeholders.length; i++) {
      const key = placeholders[i];
      const matchValue = matchValues[i + 1];
      if (result.has(key)) {
        if (result.get(key) !== matchValue) {
          return err(
            AppStudioResultFactory.UserError(
              AppStudioError.SyncManifestFailedError.name,
              AppStudioError.SyncManifestFailedError.message([
                getLocalizedString(
                  "core.syncManifest.editKeyConflict",
                  key,
                  result.get(key),
                  matchValue
                ),
              ])
            )
          );
        }
      } else {
        result.set(key, matchValue);
      }
    }
    return ok(result);
  }
}
