// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AzureSolutionSettings,
  FxError,
  LogProvider,
  PluginContext,
  Result,
} from "@microsoft/teamsfx-api";
import { AadResult, ResultFactory } from "./results";
import {
  CheckGrantPermissionConfig,
  ConfigUtils,
  PostProvisionConfig,
  ProvisionConfig,
  SetApplicationInContextConfig,
  UpdatePermissionConfig,
} from "./utils/configs";
import { TelemetryUtils } from "./utils/telemetry";
import { TokenAudience, TokenProvider } from "./utils/tokenProvider";
import { AadAppClient } from "./aadAppClient";
import {
  AppIdUriInvalidError,
  ParsePermissionError,
  UnknownPermissionName,
  UnknownPermissionRole,
  UnknownPermissionScope,
  GetSkipAppConfigError,
  InvalidSelectedPluginsError,
  GetConfigError,
  ConfigErrorMessages,
} from "./errors";
import { Envs } from "./interfaces/models";
import { DialogUtils } from "./utils/dialog";
import {
  ConfigKeys,
  ConfigKeysOfOtherPlugin,
  Constants,
  Messages,
  Plugins,
  ProgressDetail,
  ProgressTitle,
  Telemetry,
  TemplatePathInfo,
} from "./constants";
import { IPermission } from "./interfaces/IPermission";
import { RequiredResourceAccess, ResourceAccess } from "./interfaces/IAADDefinition";
import { validate as uuidValidate } from "uuid";
import { IPermissionList } from "./interfaces/IPermissionList";
import * as jsonPermissionList from "./permissions/permissions.json";
import { Utils } from "./utils/common";
import * as path from "path";
import * as fs from "fs-extra";
import { ScaffoldArmTemplateResult } from "../../../common/armInterface";
import { Bicep, ConstantString, ResourcePlugins } from "../../../common/constants";
import { getTemplatesFolder } from "../../..";
import { AadOwner } from "../../../common/permissionInterface";

export class AadAppForTeamsImpl {
  public async provision(ctx: PluginContext, isLocalDebug = false): Promise<AadResult> {
    TelemetryUtils.init(ctx);
    Utils.addLogAndTelemetryWithLocalDebug(
      ctx.logProvider,
      Messages.StartProvision,
      Messages.StartLocalDebug,
      isLocalDebug
    );

    const telemetryMessage = isLocalDebug
      ? Messages.EndLocalDebug.telemetry
      : Messages.EndProvision.telemetry;

    await TokenProvider.init(ctx);
    const skip: boolean = ctx.config.get(ConfigKeys.skip) as boolean;
    if (skip) {
      ctx.logProvider?.info(Messages.getLog(Messages.SkipProvision));

      if (
        ConfigUtils.getAadConfig(ctx, ConfigKeys.objectId, isLocalDebug) &&
        ConfigUtils.getAadConfig(ctx, ConfigKeys.clientId, isLocalDebug) &&
        ConfigUtils.getAadConfig(ctx, ConfigKeys.clientSecret, isLocalDebug) &&
        ConfigUtils.getAadConfig(ctx, ConfigKeys.oauth2PermissionScopeId, isLocalDebug)
      ) {
        const config: ProvisionConfig = new ProvisionConfig(isLocalDebug);
        config.oauth2PermissionScopeId = ConfigUtils.getAadConfig(
          ctx,
          ConfigKeys.oauth2PermissionScopeId,
          isLocalDebug
        ) as string;
        config.saveConfigIntoContext(ctx, TokenProvider.tenantId as string);
        Utils.addLogAndTelemetryWithLocalDebug(
          ctx.logProvider,
          Messages.EndProvision,
          Messages.EndLocalDebug,
          isLocalDebug,
          { [Telemetry.skip]: Telemetry.yes }
        );
        return ResultFactory.Success();
      } else {
        throw ResultFactory.UserError(
          GetSkipAppConfigError.name,
          GetSkipAppConfigError.message(),
          undefined,
          undefined,
          GetSkipAppConfigError.helpLink
        );
      }
    }

    DialogUtils.init(ctx.ui, ProgressTitle.Provision, ProgressTitle.ProvisionSteps);

    let config: ProvisionConfig = new ProvisionConfig(isLocalDebug);
    await config.restoreConfigFromContext(ctx);
    const permissions = AadAppForTeamsImpl.parsePermission(
      config.permissionRequest as string,
      ctx.logProvider
    );

    await DialogUtils.progress?.start(ProgressDetail.Starting);
    if (config.objectId) {
      await DialogUtils.progress?.next(ProgressDetail.GetAadApp);
      config = await AadAppClient.getAadApp(
        ctx,
        telemetryMessage,
        config.objectId,
        isLocalDebug,
        config.password
      );
      ctx.logProvider?.info(Messages.getLog(Messages.GetAadAppSuccess));
    } else {
      await DialogUtils.progress?.next(ProgressDetail.ProvisionAadApp);
      await AadAppClient.createAadApp(ctx, telemetryMessage, config);
      config.password = undefined;
      ctx.logProvider?.info(Messages.getLog(Messages.CreateAadAppSuccess));
    }

    if (!config.password) {
      await DialogUtils.progress?.next(ProgressDetail.CreateAadAppSecret);
      await AadAppClient.createAadAppSecret(ctx, telemetryMessage, config);
      ctx.logProvider?.info(Messages.getLog(Messages.CreateAadAppPasswordSuccess));
    }

    await DialogUtils.progress?.next(ProgressDetail.UpdatePermission);
    await AadAppClient.updateAadAppPermission(
      ctx,
      telemetryMessage,
      config.objectId as string,
      permissions
    );
    ctx.logProvider?.info(Messages.getLog(Messages.UpdatePermissionSuccess));

    await DialogUtils.progress?.end(true);
    config.saveConfigIntoContext(ctx, TokenProvider.tenantId as string);
    Utils.addLogAndTelemetryWithLocalDebug(
      ctx.logProvider,
      Messages.EndProvision,
      Messages.EndLocalDebug,
      isLocalDebug
    );
    return ResultFactory.Success();
  }

  public setApplicationInContext(ctx: PluginContext, isLocalDebug = false): AadResult {
    const config: SetApplicationInContextConfig = new SetApplicationInContextConfig(isLocalDebug);
    config.restoreConfigFromContext(ctx);

    if (!config.frontendDomain && !config.botId) {
      throw ResultFactory.UserError(AppIdUriInvalidError.name, AppIdUriInvalidError.message());
    }

    let applicationIdUri = "api://";
    applicationIdUri += config.frontendDomain ? `${config.frontendDomain}/` : "";
    applicationIdUri += config.botId ? "botid-" + config.botId : config.clientId;
    config.applicationIdUri = applicationIdUri;

    ctx.logProvider?.info(Messages.getLog(Messages.SetAppIdUriSuccess));
    config.saveConfigIntoContext(ctx);
    return ResultFactory.Success();
  }

  public async postProvision(ctx: PluginContext, isLocalDebug = false): Promise<AadResult> {
    TelemetryUtils.init(ctx);
    Utils.addLogAndTelemetryWithLocalDebug(
      ctx.logProvider,
      Messages.StartPostProvision,
      Messages.StartPostLocalDebug,
      isLocalDebug
    );

    const skip: boolean = ctx.config.get(ConfigKeys.skip) as boolean;
    if (skip) {
      ctx.logProvider?.info(Messages.SkipProvision);
      Utils.addLogAndTelemetryWithLocalDebug(
        ctx.logProvider,
        Messages.EndPostProvision,
        Messages.EndPostLocalDebug,
        isLocalDebug
      );
      return ResultFactory.Success();
    }

    DialogUtils.init(ctx.ui, ProgressTitle.PostProvision, ProgressTitle.PostProvisionSteps);

    await TokenProvider.init(ctx);
    const config: PostProvisionConfig = new PostProvisionConfig(isLocalDebug);
    config.restoreConfigFromContext(ctx);

    await DialogUtils.progress?.start(ProgressDetail.Starting);
    await DialogUtils.progress?.next(ProgressDetail.UpdateRedirectUri);

    const redirectUris: string[] = AadAppForTeamsImpl.getRedirectUris(
      config.frontendEndpoint,
      config.botEndpoint
    );
    await AadAppClient.updateAadAppRedirectUri(
      ctx,
      isLocalDebug ? Messages.EndPostLocalDebug.telemetry : Messages.EndPostProvision.telemetry,
      config.objectId as string,
      redirectUris
    );
    ctx.logProvider?.info(Messages.getLog(Messages.UpdateRedirectUriSuccess));

    await DialogUtils.progress?.next(ProgressDetail.UpdateAppIdUri);
    await AadAppClient.updateAadAppIdUri(
      ctx,
      isLocalDebug ? Messages.EndPostLocalDebug.telemetry : Messages.EndPostProvision.telemetry,
      config.objectId as string,
      config.applicationIdUri as string
    );
    ctx.logProvider?.info(Messages.getLog(Messages.UpdateAppIdUriSuccess));

    await DialogUtils.progress?.end(true);
    Utils.addLogAndTelemetryWithLocalDebug(
      ctx.logProvider,
      Messages.EndPostProvision,
      Messages.EndPostLocalDebug,
      isLocalDebug
    );
    return ResultFactory.Success();
  }

  public async updatePermission(ctx: PluginContext): Promise<AadResult> {
    TelemetryUtils.init(ctx);
    Utils.addLogAndTelemetry(ctx.logProvider, Messages.StartUpdatePermission);
    const skip: boolean = ctx.config.get(ConfigKeys.skip) as boolean;
    if (skip) {
      ctx.logProvider?.info(Messages.SkipProvision);
      Utils.addLogAndTelemetry(ctx.logProvider, Messages.EndUpdatePermission);
      return ResultFactory.Success();
    }

    DialogUtils.init(ctx.ui, ProgressTitle.UpdatePermission, ProgressTitle.UpdatePermissionSteps);

    const configs = await AadAppForTeamsImpl.getUpdatePermissionConfigs(ctx);
    if (!configs) {
      return ResultFactory.Success();
    }

    await TokenProvider.init(ctx);

    const permissions = AadAppForTeamsImpl.parsePermission(
      configs[0].permissionRequest as string,
      ctx.logProvider
    );

    await DialogUtils.progress?.start(ProgressDetail.Starting);
    await DialogUtils.progress?.next(ProgressDetail.UpdatePermission);
    for (const config of configs) {
      await AadAppClient.updateAadAppPermission(
        ctx,
        Messages.EndUpdatePermission.telemetry,
        config.objectId as string,
        permissions
      );
    }
    ctx.logProvider?.info(Messages.getLog(Messages.UpdatePermissionSuccess));

    await DialogUtils.progress?.end(true);
    DialogUtils.show(Messages.UpdatePermissionSuccessMessage);
    return ResultFactory.Success();
  }

  public async generateArmTemplates(ctx: PluginContext): Promise<AadResult> {
    TelemetryUtils.init(ctx);
    Utils.addLogAndTelemetry(ctx.logProvider, Messages.StartGenerateArmTemplates);

    const selectedPlugins = (ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
      .activeResourcePlugins;
    if (
      !selectedPlugins.includes(ResourcePlugins.FrontendHosting) &&
      !selectedPlugins.includes(ResourcePlugins.Bot)
    ) {
      throw ResultFactory.UserError(
        InvalidSelectedPluginsError.name,
        InvalidSelectedPluginsError.message(
          `${ResourcePlugins.FrontendHosting} plugin and(or) ${ResourcePlugins.Bot} plugin must be selected.`
        )
      );
    }
    const bicepTemplateDir = path.join(
      getTemplatesFolder(),
      TemplatePathInfo.BicepTemplateRelativeDir
    );
    const inputParameterOrchestrationFilePath = path.join(
      bicepTemplateDir,
      Bicep.ParameterOrchestrationFileName
    );
    const variablesOrchestrationFilePath = path.join(
      bicepTemplateDir,
      Bicep.VariablesOrchestrationFileName
    );
    const parameterFilePath = path.join(bicepTemplateDir, Bicep.ParameterFileName);

    const result: ScaffoldArmTemplateResult = {
      Orchestration: {
        ParameterTemplate: {
          Content: await fs.readFile(
            inputParameterOrchestrationFilePath,
            ConstantString.UTF8Encoding
          ),
          ParameterJson: JSON.parse(
            await fs.readFile(parameterFilePath, ConstantString.UTF8Encoding)
          ),
        },
        VariableTemplate: {
          Content: await fs.readFile(variablesOrchestrationFilePath, ConstantString.UTF8Encoding),
        },
      },
    };

    Utils.addLogAndTelemetry(ctx.logProvider, Messages.EndGenerateArmTemplates);
    return ResultFactory.Success(result);
  }

  public async checkPermission(ctx: PluginContext): Promise<AadResult> {
    TelemetryUtils.init(ctx);
    Utils.addLogAndTelemetry(ctx.logProvider, Messages.StartCheckPermission);

    await TokenProvider.init(ctx, TokenAudience.Graph);
    const config = new CheckGrantPermissionConfig();
    await config.restoreConfigFromContext(ctx);

    const userObjectId = config?.userInfo["aadId"];
    const isAadOwner = await AadAppClient.checkPermission(
      ctx,
      Messages.EndCheckPermission.telemetry,
      config.objectId!,
      userObjectId
    );

    const result = [
      {
        name: Constants.permissions.name,
        type: Constants.permissions.type,
        roles: isAadOwner ? [Constants.permissions.owner] : [Constants.permissions.noPermission],
        resourceId: config.objectId!,
      },
    ];
    Utils.addLogAndTelemetry(ctx.logProvider, Messages.EndCheckPermission);
    return ResultFactory.Success(result);
  }

  public async listCollaborator(ctx: PluginContext): Promise<Result<AadOwner[], FxError>> {
    return ResultFactory.Success([]);
  }  
  
  public async grantPermission(ctx: PluginContext): Promise<AadResult> {
    TelemetryUtils.init(ctx);
    Utils.addLogAndTelemetry(ctx.logProvider, Messages.StartGrantPermission);

    await TokenProvider.init(ctx, TokenAudience.Graph);
    const config = new CheckGrantPermissionConfig(true);
    await config.restoreConfigFromContext(ctx);

    const userObjectId = config?.userInfo["aadId"];
    await AadAppClient.grantPermission(
      ctx,
      Messages.EndCheckPermission.telemetry,
      config.objectId!,
      userObjectId
    );

    const result = [
      {
        name: Constants.permissions.name,
        type: Constants.permissions.type,
        roles: Constants.permissions.owner,
        resourceId: config.objectId!,
      },
    ];
    Utils.addLogAndTelemetry(ctx.logProvider, Messages.EndGrantPermission);
    return ResultFactory.Success(result);
  }

  private static getRedirectUris(
    frontendEndpoint: string | undefined,
    botEndpoint: string | undefined
  ) {
    const redirectUris: string[] = [];
    if (frontendEndpoint) {
      redirectUris.push(`${frontendEndpoint}/auth-end.html`);
    }

    if (botEndpoint) {
      redirectUris.push(`${botEndpoint}/auth-end.html`);
    }

    return redirectUris;
  }

  private static async getUpdatePermissionConfigs(
    ctx: PluginContext
  ): Promise<UpdatePermissionConfig[] | undefined> {
    let azureAad = false;
    let localAad = false;
    if (ctx.config.get(ConfigKeys.objectId)) {
      azureAad = true;
    }
    if (ctx.config.get(Utils.addLocalDebugPrefix(true, ConfigKeys.objectId))) {
      localAad = true;
    }

    if (azureAad && localAad) {
      const ans = ctx.answers![Constants.AskForEnvName];
      if (!ans) {
        ctx.logProvider?.info(Messages.UserCancelled);
        return undefined;
      }
      if (ans === Envs.Azure) {
        localAad = false;
      } else if (ans === Envs.LocalDebug) {
        azureAad = false;
      }
    }

    if (!azureAad && !localAad) {
      await DialogUtils.show(Messages.NoSelection, "info");
      return undefined;
    }

    const configs: UpdatePermissionConfig[] = [];
    if (azureAad) {
      const config: UpdatePermissionConfig = new UpdatePermissionConfig();
      await config.restoreConfigFromContext(ctx);
      configs.push(config);
    }

    if (localAad) {
      const config: UpdatePermissionConfig = new UpdatePermissionConfig(true);
      await config.restoreConfigFromContext(ctx);
      configs.push(config);
    }

    return configs;
  }

  private static parsePermission(
    permissionRequest: string,
    logProvider?: LogProvider
  ): RequiredResourceAccess[] {
    let permissionRequestParsed: IPermission[];
    try {
      permissionRequestParsed = <IPermission[]>JSON.parse(permissionRequest as string);
    } catch (error) {
      throw ResultFactory.UserError(
        ParsePermissionError.name,
        ParsePermissionError.message(),
        error,
        undefined,
        ParsePermissionError.helpLink
      );
    }

    const permissions = AadAppForTeamsImpl.generateRequiredResourceAccess(permissionRequestParsed);
    if (!permissions) {
      throw ResultFactory.UserError(
        ParsePermissionError.name,
        ParsePermissionError.message(),
        undefined,
        undefined,
        ParsePermissionError.helpLink
      );
    }

    logProvider?.info(Messages.getLog(Messages.ParsePermissionSuccess));
    return permissions;
  }

  private static generateRequiredResourceAccess(
    permissions?: IPermission[]
  ): RequiredResourceAccess[] | undefined {
    if (!permissions) {
      return undefined;
    }

    const map = AadAppForTeamsImpl.getPermissionMap();

    const requiredResourceAccessList: RequiredResourceAccess[] = [];

    permissions.forEach((permission) => {
      const requiredResourceAccess: RequiredResourceAccess = {};
      const resourceIdOrName = permission.resource;
      let resourceId = resourceIdOrName;
      if (!uuidValidate(resourceIdOrName)) {
        const res = map[resourceIdOrName];
        if (!res) {
          throw ResultFactory.UserError(
            UnknownPermissionName.name,
            UnknownPermissionName.message(resourceIdOrName),
            undefined,
            undefined,
            UnknownPermissionName.helpLink
          );
        }

        const id = res.id;
        if (!id) {
          throw ResultFactory.UserError(
            UnknownPermissionName.name,
            UnknownPermissionName.message(resourceIdOrName),
            undefined,
            undefined,
            UnknownPermissionName.helpLink
          );
        }
        resourceId = id;
      }

      requiredResourceAccess.resourceAppId = resourceId;
      requiredResourceAccess.resourceAccess = [];

      if (!permission.delegated) {
        permission.delegated = [];
      }

      if (!permission.application) {
        permission.application = [];
      }

      permission.delegated = permission.delegated?.concat(permission.scopes);
      permission.delegated = permission.delegated?.filter(
        (scopeName, i) => i === permission.delegated?.indexOf(scopeName)
      );

      permission.application = permission.application?.concat(permission.roles);
      permission.application = permission.application?.filter(
        (roleName, i) => i === permission.application?.indexOf(roleName)
      );

      permission.application?.forEach((roleName) => {
        if (!roleName) {
          return;
        }

        const resourceAccess: ResourceAccess = {
          id: roleName,
          type: "Role",
        };

        if (!uuidValidate(roleName)) {
          const roleId = map[resourceId].roles[roleName];
          if (!roleId) {
            throw ResultFactory.UserError(
              UnknownPermissionRole.name,
              UnknownPermissionRole.message(roleName, permission.resource),
              undefined,
              undefined,
              UnknownPermissionRole.helpLink
            );
          }
          resourceAccess.id = roleId;
        }

        requiredResourceAccess.resourceAccess!.push(resourceAccess);
      });

      permission.delegated?.forEach((scopeName) => {
        if (!scopeName) {
          return;
        }

        const resourceAccess: ResourceAccess = {
          id: scopeName,
          type: "Scope",
        };

        if (!uuidValidate(scopeName)) {
          const scopeId = map[resourceId].scopes[scopeName];
          if (!scopeId) {
            throw ResultFactory.UserError(
              UnknownPermissionScope.name,
              UnknownPermissionScope.message(scopeName, permission.resource),
              undefined,
              undefined,
              UnknownPermissionScope.helpLink
            );
          }
          resourceAccess.id = map[resourceId].scopes[scopeName];
        }

        requiredResourceAccess.resourceAccess!.push(resourceAccess);
      });

      requiredResourceAccessList.push(requiredResourceAccess);
    });

    return requiredResourceAccessList;
  }

  private static getPermissionMap(): any {
    const permissionList = jsonPermissionList as IPermissionList;
    const map: any = {};
    permissionList.value.forEach((permission) => {
      const resourceId = permission.appId;
      map[resourceId] = {};
      map[resourceId].scopes = {};
      map[resourceId].roles = {};

      map[permission.displayName] = {};
      map[permission.displayName].id = resourceId;

      permission.oauth2PermissionScopes.forEach((scope) => {
        map[resourceId].scopes[scope.value] = scope.id;
      });

      permission.appRoles.forEach((appRole) => {
        map[resourceId].roles[appRole.value] = appRole.id;
      });
    });

    return map;
  }
}
