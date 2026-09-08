// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  FxError,
  Result,
  SystemError,
  TeamsAppManifest,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import * as path from "path";
import { Service } from "typedi";
import { v4 } from "uuid";
import isUUID from "validator/lib/isUUID";
import {
  isUsingNewDeveloperPortalApis,
  teamsDevPortalClient,
} from "../../../client/teamsDevPortalClientProvider";
import { isSovereignHigh } from "../../../common/accountUtils";
import { AppStudioScopes } from "../../../common/constants";
import { getLocalizedString } from "../../../common/localizeUtils";
import { InvalidActionInputError } from "../../../error/common";
import { getTemplatesFolder } from "../../../folder";
import { AppDefinition } from "../../driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { loadStateFromEnv } from "../util/utils";
import { WrapDriverContext } from "../util/wrapUtil";
import {
  COLOR_TEMPLATE,
  Constants,
  DEFAULT_COLOR_PNG_FILENAME,
  DEFAULT_OUTLINE_PNG_FILENAME,
  OUTLINE_TEMPLATE,
} from "./constants";
import { AppStudioError } from "./errors";
import { CreateTeamsAppArgs } from "./interfaces/CreateTeamsAppArgs";
import { AppStudioResultFactory } from "./results";

const actionName = "teamsApp/create";

const defaultOutputNames = {
  teamsAppId: "TEAMS_APP_ID",
};

export const internalOutputNames = {
  teamsAppTenantId: "TEAMS_APP_TENANT_ID",
};

@Service(actionName)
export class CreateTeamsAppDriver implements StepDriver {
  description = getLocalizedString("driver.teamsApp.description.createDriver");
  readonly progressTitle = getLocalizedString(
    "driver.teamsApp.progressBar.createTeamsAppStepMessage"
  );

  public async execute(
    args: CreateTeamsAppArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.create(args, wrapContext, outputEnvVarNames);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  async create(
    args: CreateTeamsAppArgs,
    context: WrapDriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<Result<Map<string, string>, FxError>> {
    if (isSovereignHigh()) {
      context.logProvider.warning(
        getLocalizedString("driver.teamsApp.warning.createUnsupportedCloud", actionName)
      );
    }

    const result = this.validateArgs(args);
    if (result.isErr()) {
      return err(result.error);
    }

    if (!outputEnvVarNames) {
      outputEnvVarNames = new Map(Object.entries(defaultOutputNames));
    }
    // Merge internal defaults as a fallback: any env var name the author
    // configured in writeToEnvironmentFile (e.g. teamsAppTenantId) must take
    // precedence over the internal default.
    outputEnvVarNames = new Map([...Object.entries(internalOutputNames), ...outputEnvVarNames]);
    const state = loadStateFromEnv(outputEnvVarNames);

    if (isSovereignHigh()) {
      let teamsAppId = state.teamsAppId;

      if (teamsAppId && isUUID(teamsAppId)) {
        context.addSummary(
          getLocalizedString("driver.teamsApp.summary.createTeamsAppAlreadyExists", teamsAppId)
        );
      } else {
        teamsAppId = v4();
      }
      return ok(new Map([[outputEnvVarNames.get("teamsAppId") as string, teamsAppId]]));
    }

    let create = true;
    const appStudioTokenRes = await context.m365TokenProvider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    if (appStudioTokenRes.isErr()) {
      return err(appStudioTokenRes.error);
    }
    const appStudioToken = appStudioTokenRes.value;

    let createdAppDefinition: AppDefinition;
    const appId = state.teamsAppId;
    if (appId) {
      try {
        createdAppDefinition = await teamsDevPortalClient.getApp(appStudioToken, appId);
        create = false;
      } catch (e: any) {
        if (isUsingNewDeveloperPortalApis()) {
          if (e instanceof UserError || e instanceof SystemError) {
            return err(e);
          }
          return err(
            AppStudioResultFactory.SystemError(
              AppStudioError.TeamsAppCreateFailedError.name,
              AppStudioError.TeamsAppCreateFailedError.message(e),
              "https://aka.ms/teamsfx-actions/teamsapp-create"
            )
          );
        }
      }
    }

    if (create) {
      try {
        if (isUsingNewDeveloperPortalApis()) {
          createdAppDefinition = await teamsDevPortalClient.createApp(appStudioToken, args.name);
        } else {
          const manifest = new TeamsAppManifest();
          manifest.name.short = args.name;
          manifest.id = appId || v4();
          const zip = new AdmZip();
          zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 4)));
          const sourceTemplatesFolder = getTemplatesFolder();
          zip.addFile(
            DEFAULT_COLOR_PNG_FILENAME,
            await fs.readFile(path.join(sourceTemplatesFolder, COLOR_TEMPLATE))
          );
          zip.addFile(
            DEFAULT_OUTLINE_PNG_FILENAME,
            await fs.readFile(path.join(sourceTemplatesFolder, OUTLINE_TEMPLATE))
          );
          createdAppDefinition = await teamsDevPortalClient.importApp(
            appStudioToken,
            zip.toBuffer()
          );
        }
        const message = getLocalizedString(
          "plugins.appstudio.teamsAppCreatedNotice",
          createdAppDefinition.teamsAppId!
        );
        context.logProvider.verbose(message);
        context.addSummary(message);
        return ok(
          new Map([
            [outputEnvVarNames.get("teamsAppId") as string, createdAppDefinition.teamsAppId!],
            [outputEnvVarNames.get("teamsAppTenantId") as string, createdAppDefinition.tenantId!],
          ])
        );
      } catch (e: any) {
        if (e instanceof UserError || e instanceof SystemError) {
          if (e instanceof UserError && !e.helpLink) {
            e.helpLink = "https://aka.ms/teamsfx-actions/teamsapp-create";
          }
          return err(e);
        } else {
          const error = AppStudioResultFactory.SystemError(
            AppStudioError.TeamsAppCreateFailedError.name,
            AppStudioError.TeamsAppCreateFailedError.message(e),
            "https://aka.ms/teamsfx-actions/teamsapp-create"
          );
          return err(error);
        }
      }
    } else {
      context.addSummary(
        getLocalizedString("driver.teamsApp.summary.createTeamsAppAlreadyExists", appId)
      );
      context.logProvider.verbose(
        getLocalizedString("driver.teamsApp.summary.createTeamsAppAlreadyExists", appId)
      );
      return ok(
        new Map([
          [outputEnvVarNames.get("teamsAppId") as string, createdAppDefinition!.teamsAppId!],

          [outputEnvVarNames.get("teamsAppTenantId") as string, createdAppDefinition!.tenantId!],
        ])
      );
    }
  }

  private validateArgs(args: CreateTeamsAppArgs): Result<any, FxError> {
    const invalidParams: string[] = [];
    if (!args || !args.name) {
      invalidParams.push("name");
    }
    if (invalidParams.length > 0) {
      return err(
        new InvalidActionInputError(
          actionName,
          invalidParams,
          "https://aka.ms/teamsfx-actions/teamsapp-create"
        )
      );
    } else {
      return ok(undefined);
    }
  }
}
