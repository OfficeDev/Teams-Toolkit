// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Plugin,
  PluginContext,
  SystemError,
  UserError,
  err,
  Func,
  ok,
  newSystemError,
} from "@microsoft/teamsfx-api";
import { AadAppForTeamsImpl } from "./plugin";
import { AadResult, ResultFactory } from "./results";
import { UnhandledError } from "./errors";
import { TelemetryUtils } from "./utils/telemetry";
import { DialogUtils } from "./utils/dialog";
import { Messages, Plugins, Telemetry } from "./constants";
import { AzureSolutionSettings } from "@microsoft/teamsfx-api";
import { HostTypeOptionAzure } from "../../solution/fx-solution/question";
import { Service } from "typedi";
import { ResourcePlugins } from "../../solution/fx-solution/ResourcePluginContainer";
import { Links } from "../bot/constants";
import { ArmResourcePlugin } from "../../../common/armInterface";

@Service(ResourcePlugins.AadPlugin)
export class AadAppForTeamsPlugin implements Plugin, ArmResourcePlugin {
  name = "fx-resource-aad-app-for-teams";
  displayName = "AAD";
  activate(solutionSettings: AzureSolutionSettings): boolean {
    if (solutionSettings?.migrateFromV1) {
      return false;
    }
    return solutionSettings.hostType === HostTypeOptionAzure.id;
  }

  public pluginImpl: AadAppForTeamsImpl = new AadAppForTeamsImpl();

  public async provision(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.provision(ctx),
      ctx,
      Messages.EndProvision.telemetry
    );
  }

  public async localDebug(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.provision(ctx, true),
      ctx,
      Messages.EndLocalDebug.telemetry
    );
  }

  public setApplicationInContext(ctx: PluginContext, isLocalDebug = false): AadResult {
    return this.runWithExceptionCatching(
      () => this.pluginImpl.setApplicationInContext(ctx, isLocalDebug),
      ctx
    );
  }

  public async postProvision(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.postProvision(ctx),
      ctx,
      Messages.EndPostProvision.telemetry
    );
  }

  public async postLocalDebug(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.postProvision(ctx, true),
      ctx,
      Messages.EndPostLocalDebug.telemetry
    );
  }

  public async generateArmTemplates(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.generateArmTemplates(ctx),
      ctx,
      Messages.EndGenerateArmTemplates.telemetry
    );
  }

  public async executeUserTask(func: Func, ctx: PluginContext): Promise<AadResult> {
    if (func.method == "setApplicationInContext") {
      const isLocal: boolean =
        func.params && func.params.isLocal !== undefined ? (func.params.isLocal as boolean) : false;
      return Promise.resolve(this.setApplicationInContext(ctx, isLocal));
    }
    return err(
      newSystemError(
        Plugins.pluginNameShort,
        "FunctionRouterError",
        `Failed to route function call:${JSON.stringify(func)}`,
        Links.ISSUE_LINK
      )
    );
  }

  public async checkPermission(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.checkPermission(ctx),
      ctx,
      Messages.EndCheckPermission.telemetry
    );
  }

  public async grantPermission(ctx: PluginContext): Promise<AadResult> {
    return await this.runWithExceptionCatchingAsync(
      () => this.pluginImpl.grantPermission(ctx),
      ctx,
      Messages.EndCheckPermission.telemetry
    );
  }

  private async runWithExceptionCatchingAsync(
    fn: () => Promise<AadResult>,
    ctx: PluginContext,
    stage: string
  ): Promise<AadResult> {
    try {
      return await fn();
    } catch (e) {
      return this.returnError(e, ctx, stage);
    }
  }

  private runWithExceptionCatching(fn: () => AadResult, ctx: PluginContext): AadResult {
    try {
      return fn();
    } catch (e) {
      return this.returnError(e, ctx, "");
    }
  }

  private returnError(e: any, ctx: PluginContext, stage: string): AadResult {
    if (e instanceof SystemError || e instanceof UserError) {
      let errorMessage = e.message;
      // For errors contains innerError, e.g. failures when calling Graph API
      if (e.innerError) {
        errorMessage += ` Detailed error: ${e.innerError.message}.`;
        if (e.innerError.response?.data?.errorMessage) {
          // For errors return from App Studio API
          errorMessage += ` Reason: ${e.innerError.response?.data?.errorMessage}`;
        } else if (e.innerError.response?.data?.error?.message) {
          // For errors return from Graph API
          errorMessage += ` Reason: ${e.innerError.response?.data?.error?.message}`;
        }
        e.message = errorMessage;
      }
      ctx.logProvider?.error(errorMessage);
      TelemetryUtils.init(ctx);
      TelemetryUtils.sendErrorEvent(
        stage,
        e.name,
        e instanceof UserError ? Telemetry.userError : Telemetry.systemError,
        errorMessage
      );
      DialogUtils.progress?.end(false);
      return err(e);
    } else {
      if (!(e instanceof Error)) {
        e = new Error(e.toString());
      }

      ctx.logProvider?.error(e.message);
      TelemetryUtils.init(ctx);
      TelemetryUtils.sendErrorEvent(
        stage,
        UnhandledError.name,
        Telemetry.systemError,
        UnhandledError.message() + " " + e.message
      );
      return err(
        ResultFactory.SystemError(
          UnhandledError.name,
          UnhandledError.message(),
          e,
          undefined,
          undefined
        )
      );
    }
  }
}

export default new AadAppForTeamsPlugin();
