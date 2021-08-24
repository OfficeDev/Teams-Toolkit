// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  ConfigFolderName,
  FxError,
  ok,
  err,
  Platform,
  Plugin,
  PluginContext,
  QTreeNode,
  Result,
  Stage,
  TeamsAppManifest,
  SystemError,
  UserError,
  Colors,
  AzureSolutionSettings,
  Func,
  newSystemError,
  Void,
} from "@microsoft/teamsfx-api";
import { AppStudioPluginImpl } from "./plugin";
import { Constants } from "./constants";
import { IAppDefinition } from "./interfaces/IAppDefinition";
import { AppStudioError } from "./errors";
import { AppStudioResultFactory } from "./results";
import { manuallySubmitOption, autoPublishOption } from "./questions";
import { TelemetryUtils, TelemetryEventName, TelemetryPropertyKey } from "./utils/telemetry";
import { Service } from "typedi";
import { ResourcePlugins } from "../../solution/fx-solution/ResourcePluginContainer";
import { FunctionRouterError } from "../../../core";
import { Links } from "../bot/constants";
@Service(ResourcePlugins.AppStudioPlugin)
export class AppStudioPlugin implements Plugin {
  name = "fx-resource-appstudio";
  displayName = "App Studio";
  activate(solutionSettings: AzureSolutionSettings): boolean {
    return true;
  }
  private appStudioPluginImpl = new AppStudioPluginImpl();

  async getQuestions(
    stage: Stage,
    ctx: PluginContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const appStudioQuestions = new QTreeNode({
      type: "group",
    });

    if (stage === Stage.publish) {
      if (ctx.answers?.platform === Platform.VS) {
        const appPath = new QTreeNode({
          type: "folder",
          name: Constants.PUBLISH_PATH_QUESTION,
          title: "Please select the folder contains manifest.json and icons",
          default: `${ctx.root}/.${ConfigFolderName}`,
        });
        appStudioQuestions.addChild(appPath);

        const remoteTeamsAppId = new QTreeNode({
          type: "text",
          name: Constants.REMOTE_TEAMS_APP_ID,
          title: "Please input the teams app id in App Studio",
        });
        appStudioQuestions.addChild(remoteTeamsAppId);
      } else if (ctx.answers?.platform === Platform.VSCode) {
        const buildOrPublish = new QTreeNode({
          name: Constants.BUILD_OR_PUBLISH_QUESTION,
          type: "singleSelect",
          staticOptions: [manuallySubmitOption, autoPublishOption],
          title: "Teams Toolkit: Publish to Teams",
          default: autoPublishOption.id,
        });
        appStudioQuestions.addChild(buildOrPublish);
      }
    }

    return ok(appStudioQuestions);
  }

  /**
   * Create or update teams app
   * For cli: "teamsfx init" only
   * @returns {string} - Remote teams app id
   */
  public async getAppDefinitionAndUpdate(
    ctx: PluginContext,
    type: "localDebug" | "remote",
    manifest: TeamsAppManifest
  ): Promise<Result<string, FxError>> {
    return await this.appStudioPluginImpl.getAppDefinitionAndUpdate(ctx, type, manifest);
  }

  /**
   * Create teams app
   * @returns {string} - Remote teams app id
   */
  public async provision(ctx: PluginContext): Promise<Result<string, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.provision);
    const remoteTeamsAppId = await this.appStudioPluginImpl.provision(ctx);
    if (remoteTeamsAppId.isErr()) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.provision, remoteTeamsAppId.error);
      return remoteTeamsAppId;
    } else {
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.provision);
      return ok(remoteTeamsAppId.value);
    }
  }

  /**
   * Update teams app
   * @returns {string} - Remote teams app id
   */
  public async postProvision(ctx: PluginContext): Promise<Result<string, FxError>> {
    const remoteTeamsAppId = await this.appStudioPluginImpl.postProvision(ctx);
    return ok(remoteTeamsAppId);
  }

  /**
   * Validate manifest string against schema
   * @param {string} manifestString - the string of manifest.json file
   * @returns {string[]} an array of errors
   */
  public async validateManifest(ctx: PluginContext): Promise<Result<string[], FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.validateManifest);
    const validationpluginResult = await this.appStudioPluginImpl.validateManifest(ctx);
    if (validationpluginResult.isErr()) {
      return err(validationpluginResult.error);
    }
    const validationResult = validationpluginResult.value;
    if (validationResult.length > 0) {
      const errMessage = AppStudioError.ValidationFailedError.message(validationResult);
      ctx.logProvider?.error("Manifest Validation failed!");
      ctx.ui?.showMessage("error", errMessage, false);
      const properties: { [key: string]: string } = {};
      properties[TelemetryPropertyKey.validationResult] = validationResult.join("\n");
      const validationFailed = AppStudioResultFactory.UserError(
        AppStudioError.ValidationFailedError.name,
        errMessage
      );
      TelemetryUtils.sendErrorEvent(
        TelemetryEventName.validateManifest,
        validationFailed,
        properties
      );
      return err(validationFailed);
    }
    const validationSuccess = "Manifest Validation succeed!";
    ctx.ui?.showMessage("info", validationSuccess, false);
    TelemetryUtils.sendSuccessEvent(TelemetryEventName.validateManifest);
    return validationpluginResult;
  }

  public async scaffold(ctx: PluginContext): Promise<Result<any, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.scaffold);
    try {
      const scaffoldResult = await this.appStudioPluginImpl.scaffold(ctx);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.scaffold);
      return ok(scaffoldResult);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.scaffold, error);
      return err(
        AppStudioResultFactory.SystemError(
          AppStudioError.ScaffoldFailedError.name,
          AppStudioError.ScaffoldFailedError.message(error)
        )
      );
    }
  }

  /**
   * Build Teams Package
   * @param {string} appDirectory - The directory contains manifest.source.json and two images
   * @returns {string} - Path of built appPackage.zip
   */
  public async buildTeamsPackage(ctx: PluginContext): Promise<Result<string, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.buildTeamsPackage);
    try {
      const appPackagePath = await this.appStudioPluginImpl.buildTeamsAppPackage(ctx);
      const builtSuccess = [
        { content: "(√)Done: ", color: Colors.BRIGHT_GREEN },
        { content: "Teams Package ", color: Colors.BRIGHT_WHITE },
        { content: appPackagePath, color: Colors.BRIGHT_MAGENTA },
        { content: " built successfully!", color: Colors.BRIGHT_WHITE },
      ];
      ctx.ui?.showMessage("info", builtSuccess, false);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.buildTeamsPackage);
      return ok(appPackagePath);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.buildTeamsPackage, error);
      return err(
        AppStudioResultFactory.SystemError(
          AppStudioError.TeamsPackageBuildError.name,
          AppStudioError.TeamsPackageBuildError.message(error)
        )
      );
    }
  }

  /**
   * Migrate V1 project
   */
  public async migrateV1Project(ctx: PluginContext): Promise<Result<Void, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.migrateV1Project);

    try {
      await this.appStudioPluginImpl.migrateV1Project(ctx);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.migrateV1Project);
      return ok(Void);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.migrateV1Project, error);
      return err(
        AppStudioResultFactory.SystemError(
          AppStudioError.MigrateV1ProjectFailedError.name,
          AppStudioError.MigrateV1ProjectFailedError.message(error)
        )
      );
    }
  }

  /**
   * Publish the app to Teams App Catalog
   * @param {PluginContext} ctx
   * @returns {string[]} - Teams App ID in Teams app catalog
   */
  public async publish(ctx: PluginContext): Promise<Result<string | undefined, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.publish);
    if (ctx.answers?.platform === Platform.VSCode) {
      const answer = ctx.answers![Constants.BUILD_OR_PUBLISH_QUESTION] as string;
      if (answer === manuallySubmitOption.id) {
        //const appDirectory = `${ctx.root}/.${ConfigFolderName}`;
        try {
          const appPackagePath = await this.appStudioPluginImpl.buildTeamsAppPackage(ctx);
          const msg = `Successfully created ${
            ctx.projectSettings!.appName
          } app package file at ${appPackagePath}. Send this to your administrator for approval.`;
          ctx.ui?.showMessage("info", msg, false, "OK", Constants.READ_MORE).then((value) => {
            if (value.isOk() && value.value === Constants.READ_MORE) {
              ctx.ui?.openUrl(Constants.PUBLISH_GUIDE);
            }
          });
          TelemetryUtils.sendSuccessEvent(TelemetryEventName.publish);
          return ok(appPackagePath);
        } catch (error) {
          TelemetryUtils.sendErrorEvent(TelemetryEventName.publish, error);
          return err(
            AppStudioResultFactory.SystemError(
              AppStudioError.TeamsPackageBuildError.name,
              AppStudioError.TeamsPackageBuildError.message(error)
            )
          );
        }
      }
    }

    try {
      const result = await this.appStudioPluginImpl.publish(ctx);
      ctx.logProvider?.info(`Publish success!`);
      ctx.ui?.showMessage(
        "info",
        `Success: ${result.name} successfully published to the admin portal. Once approved, your app will be available for your organization.`,
        false
      );
      const properties: { [key: string]: string } = {};
      properties[TelemetryPropertyKey.updateExistingApp] = String(result.update);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.publish);
      return ok(result.id);
    } catch (error) {
      if (error instanceof SystemError || error instanceof UserError) {
        if (error.name === AppStudioError.TeamsAppPublishCancelError.name) {
          TelemetryUtils.sendSuccessEvent(TelemetryEventName.publish);
          return ok(undefined);
        }
        const innerError = error.innerError ? `innerError: ${error.innerError}` : "";
        error.message = `${error.message} ${innerError}`;
        TelemetryUtils.sendErrorEvent(TelemetryEventName.publish, error);
        return err(error);
      } else {
        const publishFailed = new SystemError(
          AppStudioError.TeamsAppPublishFailedError.name,
          error.message,
          Constants.PLUGIN_NAME,
          undefined,
          undefined,
          error
        );
        TelemetryUtils.sendErrorEvent(TelemetryEventName.publish, publishFailed);
        return err(publishFailed);
      }
    }
  }

  public async postLocalDebug(ctx: PluginContext): Promise<Result<string, FxError>> {
    const localTeamsAppId = await this.appStudioPluginImpl.postLocalDebug(ctx);
    return ok(localTeamsAppId);
  }

  public async checkPermission(ctx: PluginContext): Promise<Result<any, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.checkPermission);

    try {
      const checkPermissionResult = await this.appStudioPluginImpl.checkPermission(ctx);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.checkPermission);
      return ok(checkPermissionResult);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.checkPermission, error);
      return err(
        error.name && error.name >= 400 && error.name < 500
          ? AppStudioResultFactory.UserError(
              AppStudioError.CheckPermissionFailedError.name,
              AppStudioError.CheckPermissionFailedError.message(error)
            )
          : AppStudioResultFactory.SystemError(
              AppStudioError.CheckPermissionFailedError.name,
              AppStudioError.CheckPermissionFailedError.message(error)
            )
      );
    }
  }

  public async grantPermission(ctx: PluginContext): Promise<Result<any, FxError>> {
    TelemetryUtils.init(ctx);
    TelemetryUtils.sendStartEvent(TelemetryEventName.grantPermission);

    try {
      const grantPermissionResult = await this.appStudioPluginImpl.grantPermission(ctx);
      TelemetryUtils.sendSuccessEvent(TelemetryEventName.grantPermission);
      return ok(grantPermissionResult);
    } catch (error) {
      TelemetryUtils.sendErrorEvent(TelemetryEventName.grantPermission, error);
      return err(
        AppStudioResultFactory.SystemError(
          AppStudioError.GrantPermissionFailedError.name,
          error.message
        )
      );
    }
  }

  async executeUserTask(func: Func, ctx: PluginContext): Promise<Result<any, FxError>> {
    if (func.method === "validateManifest") {
      return await this.validateManifest(ctx);
    } else if (func.method === "buildPackage") {
      return await this.buildTeamsPackage(ctx);
    } else if (func.method === "getAppDefinitionAndUpdate") {
      if (func.params && func.params.type && func.params.manifest) {
        return await this.getAppDefinitionAndUpdate(
          ctx,
          func.params.type as "localDebug" | "remote",
          func.params.manifest as TeamsAppManifest
        );
      }
      return err(
        newSystemError(
          Constants.PLUGIN_NAME,
          "InvalidParam",
          `Invalid param:${JSON.stringify(func)}`,
          Links.ISSUE_LINK
        )
      );
    } else if (func.method === "migrateV1Project") {
      return await this.migrateV1Project(ctx);
    }
    return err(
      newSystemError(
        Constants.PLUGIN_NAME,
        "FunctionRouterError",
        `Failed to route function call:${JSON.stringify(func)}`,
        Links.ISSUE_LINK
      )
    );
  }
}

export default new AppStudioPlugin();
