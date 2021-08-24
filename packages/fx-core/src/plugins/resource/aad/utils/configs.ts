// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { PluginContext, ConfigValue, Platform, Stage } from "@microsoft/teamsfx-api";
import { Constants, Plugins, ConfigKeysOfOtherPlugin, ConfigKeys } from "../constants";
import {
  ConfigErrorMessages as Errors,
  GetConfigError,
  MissingPermissionsRequestProvider,
} from "../errors";
import { format, Formats } from "./format";
import { Utils } from "./common";
import { ResultFactory } from "../results";
import { v4 as uuidv4 } from "uuid";
import { isArmSupportEnabled, isMultiEnvEnabled } from "../../../../common";
import { getArmOutput } from "../../utils4v2";
import {
  LocalSettingsBotKeys,
  LocalSettingsFrontendKeys,
} from "../../../../common/localSettingsConstants";

export class ConfigUtils {
  public static getAadConfig(
    ctx: PluginContext,
    key: string,
    isLocalDebug = false
  ): string | undefined {
    if (isLocalDebug) {
      if (isMultiEnvEnabled()) {
        return ctx.localSettings?.auth?.get(key) as string;
      } else {
        return ctx.config?.get(Utils.addLocalDebugPrefix(true, key)) as string;
      }
    } else {
      return ctx.config?.get(key) as string;
    }
  }

  public static getLocalDebugConfigOfOtherPlugins(
    ctx: PluginContext,
    key: string
  ): string | undefined {
    const isMultiEnvEnable: boolean = isMultiEnvEnabled();
    switch (key) {
      case ConfigKeysOfOtherPlugin.localDebugTabDomain:
        return isMultiEnvEnable
          ? ctx.localSettings?.frontend?.get(LocalSettingsFrontendKeys.TabDomain)
          : ctx.configOfOtherPlugins.get(Plugins.localDebug)?.get(key);
      case ConfigKeysOfOtherPlugin.localDebugTabEndpoint:
        return isMultiEnvEnable
          ? ctx.localSettings?.frontend?.get(LocalSettingsFrontendKeys.TabEndpoint)
          : ctx.configOfOtherPlugins.get(Plugins.localDebug)?.get(key);
      case ConfigKeysOfOtherPlugin.localDebugBotEndpoint:
        return isMultiEnvEnable
          ? ctx.localSettings?.bot?.get(LocalSettingsBotKeys.BotEndpoint)
          : ctx.configOfOtherPlugins.get(Plugins.localDebug)?.get(key);
      case ConfigKeysOfOtherPlugin.teamsBotIdLocal:
        return isMultiEnvEnable
          ? ctx.localSettings?.bot?.get(LocalSettingsBotKeys.BotId)
          : ctx.configOfOtherPlugins.get(Plugins.teamsBot)?.get(key);
      default:
        return undefined;
    }
  }

  public static checkAndSaveConfig(
    ctx: PluginContext,
    key: string,
    value: ConfigValue,
    isLocalDebug = false
  ) {
    if (!value) {
      return;
    }

    if (isLocalDebug) {
      if (isMultiEnvEnabled()) {
        ctx.localSettings?.auth?.set(key, value);
      } else {
        ctx.config.set(Utils.addLocalDebugPrefix(true, key), value);
      }
    } else {
      ctx.config.set(key, value);
    }
  }

  public static async getPermissionRequest(ctx: PluginContext): Promise<string> {
    if (ctx.permissionRequestProvider === undefined) {
      throw ResultFactory.SystemError(
        MissingPermissionsRequestProvider.name,
        MissingPermissionsRequestProvider.message()
      );
    }

    const permissionRequestResult = await ctx.permissionRequestProvider.getPermissionRequest();
    if (permissionRequestResult.isOk()) {
      return permissionRequestResult.value;
    } else {
      throw permissionRequestResult.error;
    }
  }
}

export class ProvisionConfig {
  public displayName?: string;
  public permissionRequest?: string;
  public clientId?: string;
  public password?: string;
  public objectId?: string;
  public oauth2PermissionScopeId?: string;
  private isLocalDebug: boolean;

  constructor(isLocalDebug = false) {
    this.isLocalDebug = isLocalDebug;
    this.oauth2PermissionScopeId = uuidv4();
  }

  public async restoreConfigFromContext(ctx: PluginContext): Promise<void> {
    const displayName: string = ctx.projectSettings!.appName;
    if (displayName) {
      this.displayName = displayName.substr(0, Constants.aadAppMaxLength) as string;
    } else {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        GetConfigError.message(Errors.GetDisplayNameError)
      );
    }

    this.permissionRequest = await ConfigUtils.getPermissionRequest(ctx);

    const objectId: ConfigValue = ConfigUtils.getAadConfig(
      ctx,
      ConfigKeys.objectId,
      this.isLocalDebug
    );
    if (objectId) {
      this.objectId = objectId as string;
    }

    const clientSecret: ConfigValue = ConfigUtils.getAadConfig(
      ctx,
      ConfigKeys.clientSecret,
      this.isLocalDebug
    );
    if (clientSecret) {
      this.password = clientSecret as string;
    }
  }

  public saveConfigIntoContext(ctx: PluginContext, tenantId: string): void {
    const oauthAuthority = ProvisionConfig.getOauthAuthority(tenantId);

    ConfigUtils.checkAndSaveConfig(ctx, ConfigKeys.clientId, this.clientId, this.isLocalDebug);
    ConfigUtils.checkAndSaveConfig(ctx, ConfigKeys.clientSecret, this.password, this.isLocalDebug);
    ConfigUtils.checkAndSaveConfig(ctx, ConfigKeys.objectId, this.objectId, this.isLocalDebug);
    ConfigUtils.checkAndSaveConfig(
      ctx,
      ConfigKeys.oauth2PermissionScopeId,
      this.oauth2PermissionScopeId,
      this.isLocalDebug
    );
    ConfigUtils.checkAndSaveConfig(ctx, ConfigKeys.tenantId, tenantId, this.isLocalDebug);

    ConfigUtils.checkAndSaveConfig(
      ctx,
      ConfigKeys.oauthHost,
      Constants.oauthAuthorityPrefix,
      isMultiEnvEnabled() && this.isLocalDebug
    );
    ConfigUtils.checkAndSaveConfig(
      ctx,
      ConfigKeys.oauthAuthority,
      oauthAuthority,
      isMultiEnvEnabled() && this.isLocalDebug
    );
  }

  private static getOauthAuthority(tenantId: string): string {
    return `${Constants.oauthAuthorityPrefix}/${tenantId}`;
  }
}

export class SetApplicationInContextConfig {
  public frontendDomain?: string;
  public botId?: string;
  public clientId?: string;
  public applicationIdUri?: string;
  private isLocalDebug: boolean;

  constructor(isLocalDebug = false) {
    this.isLocalDebug = isLocalDebug;
  }

  public restoreConfigFromContext(ctx: PluginContext): void {
    let frontendDomain: ConfigValue;
    if (this.isLocalDebug) {
      frontendDomain = ConfigUtils.getLocalDebugConfigOfOtherPlugins(
        ctx,
        ConfigKeysOfOtherPlugin.localDebugTabDomain
      );
    } else {
      frontendDomain = ctx.config.get(ConfigKeys.domain);
      if (!frontendDomain) {
        if (isArmSupportEnabled()) {
          frontendDomain = getArmOutput(ctx, ConfigKeysOfOtherPlugin.frontendHostingDomainArm);
        } else {
          frontendDomain = ctx.configOfOtherPlugins
            .get(Plugins.frontendHosting)
            ?.get(ConfigKeysOfOtherPlugin.frontendHostingDomain);
        }
      }
    }

    if (frontendDomain) {
      this.frontendDomain = format(frontendDomain as string, Formats.Domain);
    }

    const botId: ConfigValue = this.isLocalDebug
      ? ConfigUtils.getLocalDebugConfigOfOtherPlugins(ctx, ConfigKeysOfOtherPlugin.teamsBotIdLocal)
      : ctx.configOfOtherPlugins.get(Plugins.teamsBot)?.get(ConfigKeysOfOtherPlugin.teamsBotId);
    if (botId) {
      this.botId = format(botId as string, Formats.UUID);
    }

    const clientId: ConfigValue = ConfigUtils.getAadConfig(
      ctx,
      ConfigKeys.clientId,
      this.isLocalDebug
    );
    if (clientId) {
      this.clientId = clientId as string;
    } else {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        GetConfigError.message(Errors.GetConfigError(ConfigKeys.clientId, Plugins.pluginName))
      );
    }
  }

  public saveConfigIntoContext(ctx: PluginContext): void {
    ConfigUtils.checkAndSaveConfig(
      ctx,
      ConfigKeys.applicationIdUri,
      this.applicationIdUri,
      this.isLocalDebug
    );
  }
}

export class PostProvisionConfig {
  public frontendEndpoint?: string;
  public botEndpoint?: string;
  public objectId?: string;
  public applicationIdUri?: string;
  private isLocalDebug: boolean;

  constructor(isLocalDebug = false) {
    this.isLocalDebug = isLocalDebug;
  }

  public async restoreConfigFromContext(ctx: PluginContext): Promise<void> {
    let frontendEndpoint: ConfigValue;
    if (this.isLocalDebug) {
      frontendEndpoint = ConfigUtils.getLocalDebugConfigOfOtherPlugins(
        ctx,
        ConfigKeysOfOtherPlugin.localDebugTabEndpoint
      );
    } else {
      frontendEndpoint = ctx.config.get(ConfigKeys.endpoint);
      if (!frontendEndpoint) {
        if (isArmSupportEnabled()) {
          frontendEndpoint = getArmOutput(ctx, ConfigKeysOfOtherPlugin.frontendHostingEndpointArm);
        } else {
          frontendEndpoint = ctx.configOfOtherPlugins
            .get(Plugins.frontendHosting)
            ?.get(ConfigKeysOfOtherPlugin.frontendHostingEndpoint);
        }
      }
    }

    if (frontendEndpoint) {
      this.frontendEndpoint = format(frontendEndpoint as string, Formats.Endpoint);
    }

    const botEndpoint: ConfigValue = this.isLocalDebug
      ? ConfigUtils.getLocalDebugConfigOfOtherPlugins(
          ctx,
          ConfigKeysOfOtherPlugin.localDebugBotEndpoint
        )
      : ctx.configOfOtherPlugins
          .get(Plugins.teamsBot)
          ?.get(ConfigKeysOfOtherPlugin.teamsBotEndpoint);
    if (botEndpoint) {
      this.botEndpoint = format(botEndpoint as string, Formats.Endpoint);
    }

    const objectId: ConfigValue = ConfigUtils.getAadConfig(
      ctx,
      ConfigKeys.objectId,
      this.isLocalDebug
    );
    if (objectId) {
      this.objectId = objectId as string;
    } else {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        GetConfigError.message(Errors.GetConfigError(ConfigKeys.objectId, Plugins.pluginName))
      );
    }

    const applicationIdUri: ConfigValue = ConfigUtils.getAadConfig(
      ctx,
      ConfigKeys.applicationIdUri,
      this.isLocalDebug
    );
    if (applicationIdUri) {
      this.applicationIdUri = applicationIdUri as string;
    } else {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        GetConfigError.message(
          Errors.GetConfigError(ConfigKeys.applicationIdUri, Plugins.pluginName)
        )
      );
    }
  }
}

export class UpdatePermissionConfig {
  public objectId?: string;
  public permissionRequest?: string;
  private isLocalDebug: boolean;

  constructor(isLocalDebug = false) {
    this.isLocalDebug = isLocalDebug;
  }

  public async restoreConfigFromContext(ctx: PluginContext): Promise<void> {
    const objectId: ConfigValue = ConfigUtils.getAadConfig(
      ctx,
      ConfigKeys.objectId,
      this.isLocalDebug
    );
    if (objectId) {
      this.objectId = objectId as string;
    } else {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        GetConfigError.message(Errors.GetConfigError(ConfigKeys.objectId, Plugins.pluginName))
      );
    }

    this.permissionRequest = await ConfigUtils.getPermissionRequest(ctx);
  }
}

export class CheckGrantPermissionConfig {
  public userInfo?: any;
  public objectId?: string;
  public isGrantPermission: boolean;

  constructor(isGrantPermission = false) {
    this.isGrantPermission = isGrantPermission;
  }

  public async restoreConfigFromContext(ctx: PluginContext): Promise<void> {
    const objectId: ConfigValue = ctx.config?.get(ConfigKeys.objectId);
    if (objectId) {
      this.objectId = objectId as string;
    } else {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        Utils.getPermissionErrorMessage(
          GetConfigError.message(Errors.GetConfigError(ConfigKeys.objectId, Plugins.pluginName)),
          this.isGrantPermission
        )
      );
    }

    const userInfo: ConfigValue = ctx.configOfOtherPlugins
      ?.get(Plugins.solution)
      ?.get(ConfigKeysOfOtherPlugin.solutionUserInfo);
    if (!userInfo) {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        Utils.getPermissionErrorMessage(
          Errors.GetConfigError(ConfigKeysOfOtherPlugin.solutionUserInfo, Plugins.solution),
          this.isGrantPermission,
          this.objectId
        )
      );
    }

    try {
      this.userInfo = JSON.parse(userInfo);
    } catch (error) {
      throw ResultFactory.SystemError(
        GetConfigError.name,
        Utils.getPermissionErrorMessage(
          GetConfigError.message(error.message),
          this.isGrantPermission,
          this.objectId
        )
      );
    }
  }
}
