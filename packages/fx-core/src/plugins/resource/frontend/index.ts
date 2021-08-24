// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { FrontendPluginImpl } from "./plugin";
import {
  Plugin,
  PluginContext,
  err,
  SystemError,
  UserError,
  AzureSolutionSettings,
  ok,
  Func,
} from "@microsoft/teamsfx-api";

import { ErrorFactory, TeamsFxResult } from "./error-factory";
import {
  ErrorType,
  FrontendPluginError,
  UnhandledErrorCode,
  UnhandledErrorMessage,
} from "./resources/errors";
import { Logger } from "./utils/logger";
import { ProgressHelper } from "./utils/progress-helper";
import { TelemetryEvent } from "./constants";
import { TelemetryHelper } from "./utils/telemetry-helper";
import { HostTypeOptionAzure, TabOptionItem } from "../../solution/fx-solution/question";
import { Service } from "typedi";
import { ResourcePlugins } from "../../solution/fx-solution/ResourcePluginContainer";
import { isArmSupportEnabled } from "../../..";
import { ArmResourcePlugin } from "../../../common/armInterface";
export * from "./v2";

@Service(ResourcePlugins.FrontendPlugin)
export class FrontendPlugin implements Plugin, ArmResourcePlugin {
  name = "fx-resource-frontend-hosting";
  displayName = "Tab Front-end";
  activate(solutionSettings: AzureSolutionSettings): boolean {
    const cap = solutionSettings.capabilities || [];
    return solutionSettings.hostType === HostTypeOptionAzure.id && cap.includes(TabOptionItem.id);
  }
  frontendPluginImpl = new FrontendPluginImpl();

  private static setContext(ctx: PluginContext): void {
    Logger.setLogger(ctx.logProvider);
    TelemetryHelper.setContext(ctx);
  }

  public async scaffold(ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(ctx, TelemetryEvent.Scaffold, () =>
      this.frontendPluginImpl.scaffold(ctx)
    );
  }

  public async preProvision(ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(ctx, TelemetryEvent.PreProvision, () =>
      this.frontendPluginImpl.preProvision(ctx)
    );
  }

  public async provision(ctx: PluginContext): Promise<TeamsFxResult> {
    if (isArmSupportEnabled()) {
      return ok(undefined);
    } else {
      FrontendPlugin.setContext(ctx);
      return this.runWithErrorHandling(ctx, TelemetryEvent.Provision, () =>
        this.frontendPluginImpl.provision(ctx)
      );
    }
  }

  public async postProvision(ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(ctx, TelemetryEvent.PostProvision, () =>
      this.frontendPluginImpl.postProvision(ctx)
    );
  }

  public async preDeploy(ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(ctx, TelemetryEvent.PreDeploy, () =>
      this.frontendPluginImpl.preDeploy(ctx)
    );
  }

  public async deploy(ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(ctx, TelemetryEvent.Deploy, () =>
      this.frontendPluginImpl.deploy(ctx)
    );
  }

  public async generateArmTemplates(ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(ctx, TelemetryEvent.GenerateArmTemplates, () =>
      this.frontendPluginImpl.generateArmTemplates(ctx)
    );
  }

  public async executeUserTask(func: Func, ctx: PluginContext): Promise<TeamsFxResult> {
    FrontendPlugin.setContext(ctx);
    return this.runWithErrorHandling(
      ctx,
      TelemetryEvent.ExecuteUserTask,
      () => this.frontendPluginImpl.executeUserTask(func, ctx),
      { method: func.method }
    );
  }

  private async runWithErrorHandling(
    ctx: PluginContext,
    stage: string,
    fn: () => Promise<TeamsFxResult>,
    properties: { [key: string]: string } = {}
  ): Promise<TeamsFxResult> {
    try {
      TelemetryHelper.sendStartEvent(stage, properties);
      const result = await fn();
      TelemetryHelper.sendSuccessEvent(stage, properties);
      return result;
    } catch (e) {
      await ProgressHelper.endAllHandlers(false);

      if (e instanceof FrontendPluginError) {
        const error =
          e.errorType === ErrorType.User
            ? ErrorFactory.UserError(e.code, e.getMessage(), undefined, undefined, e.helpLink)
            : ErrorFactory.SystemError(
                e.code,
                e.getMessage(),
                e.getInnerError(),
                e.getInnerError()?.stack
              );
        TelemetryHelper.sendErrorEvent(stage, error, properties);
        return err(error);
      }

      if (e instanceof UserError || e instanceof SystemError) {
        TelemetryHelper.sendErrorEvent(stage, e, properties);
        return err(e);
      }

      const error = ErrorFactory.SystemError(UnhandledErrorCode, UnhandledErrorMessage, e, e.stack);
      TelemetryHelper.sendErrorEvent(stage, error, properties);
      return err(error);
    }
  }
}

export default new FrontendPlugin();
