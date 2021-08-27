/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  ok,
  err,
  QTreeNode,
  ConfigMap,
  Stage,
  combine,
  returnSystemError,
  returnUserError,
  PluginContext,
  Plugin,
  Func,
  FxError,
  Result,
  Solution,
  SolutionConfig,
  SolutionContext,
  TeamsAppManifest,
  OptionItem,
  AppPackageFolderName,
  AzureSolutionSettings,
  Platform,
  Inputs,
  DynamicPlatforms,
  SubscriptionInfo,
  ProjectSettings,
  SolutionSettings,
} from "@microsoft/teamsfx-api";
import { checkSubscription, fillInCommonQuestions } from "./commonQuestions";
import { executeLifecycles, executeConcurrently, LifecyclesWithContext } from "./executor";
import { checkFileExist, getPluginContext, sendErrorTelemetryThenReturnError } from "./utils/util";
import * as fs from "fs-extra";
import {
  DEFAULT_PERMISSION_REQUEST,
  GLOBAL_CONFIG,
  SolutionError,
  LOCAL_DEBUG_AAD_ID,
  LOCAL_DEBUG_TEAMS_APP_ID,
  Void,
  SOLUTION_PROVISION_SUCCEEDED,
  LOCAL_APPLICATION_ID_URIS,
  LOCAL_CLIENT_SECRET,
  REMOTE_AAD_ID,
  REMOTE_APPLICATION_ID_URIS,
  REMOTE_CLIENT_SECRET,
  PROGRAMMING_LANGUAGE,
  REMOTE_TEAMS_APP_ID,
  CancelError,
  SolutionTelemetryProperty,
  SolutionTelemetryEvent,
  SolutionTelemetryComponentName,
  SolutionTelemetrySuccess,
  PluginNames,
  ARM_TEMPLATE_OUTPUT,
  USER_INFO,
  REMOTE_TENANT_ID,
} from "./constants";

import {
  AzureResourceFunction,
  AzureResourceSQL,
  AzureResourcesQuestion,
  AzureSolutionQuestionNames,
  BotOptionItem,
  DeployPluginSelectQuestion,
  HostTypeOptionAzure,
  HostTypeOptionSPFx,
  FrontendHostTypeQuestion,
  TabOptionItem,
  MessageExtensionItem,
  AzureResourceApim,
  createCapabilityQuestion,
  createAddAzureResourceQuestion,
  AskSubscriptionQuestion,
  addCapabilityQuestion,
  ProgrammingLanguageQuestion,
  createV1CapabilityQuestion,
} from "./question";
import Mustache from "mustache";
import path from "path";
import * as util from "util";
import {
  deepCopy,
  getStrings,
  isArmSupportEnabled,
  isMultiEnvEnabled,
  isUserCancelError,
} from "../../../common/tools";
import { getTemplatesFolder } from "../../..";
import {
  getActivatedResourcePlugins,
  getAllResourcePluginMap,
  getAllResourcePlugins,
  ResourcePlugins,
} from "./ResourcePluginContainer";
import { AadAppForTeamsPlugin, AppStudioPlugin, SpfxPlugin } from "../../resource";
import { ErrorHandlerMW } from "../../../core/middleware/errorHandler";
import { hooks } from "@feathersjs/hooks/lib";
import { Service, Container } from "typedi";
import { deployArmTemplates, generateArmTemplate } from "./arm";
import { LocalSettingsProvider } from "../../../common/localSettingsProvider";
import { PluginDisplayName } from "../../../common/constants";
import { LocalSettingsTeamsAppKeys } from "../../../common/localSettingsConstants";
import { scaffoldReadmeAndLocalSettings } from "./v2/scaffolding";
import { PermissionRequestFileProvider } from "../../../core/permissionRequest";
import { IUserList } from "../../resource/appstudio/interfaces/IAppDefinition";
import axios from "axios";
import {
  AadOwner,
  Collaborator,
  ResourcePermission,
  TeamsAppAdmin,
} from "../../../common/permissionInterface";

export type LoadedPlugin = Plugin;
export type PluginsWithContext = [LoadedPlugin, PluginContext];

type ParamForRegisterTeamsAppAndAad = {
  "app-name": string;
  environment: "local" | "remote";
  endpoint: string;
  "root-path": string;
};

// Maybe we need a state machine to track state transition.
export enum SolutionRunningState {
  Idle = "idle",
  ProvisionInProgress = "ProvisionInProgress",
  DeployInProgress = "DeployInProgress",
  PublishInProgress = "PublishInProgress",
}

@Service()
export class TeamsAppSolution implements Solution {
  SpfxPlugin: SpfxPlugin;
  AppStudioPlugin: AppStudioPlugin;
  BotPlugin: Plugin;
  AadPlugin: Plugin;
  FrontendPlugin: Plugin;
  FunctionPlugin: Plugin;
  SqlPlugin: Plugin;
  ApimPlugin: Plugin;
  LocalDebugPlugin: Plugin;

  name = "fx-solution-azure";

  runningState: SolutionRunningState;

  constructor() {
    this.SpfxPlugin = Container.get<SpfxPlugin>(ResourcePlugins.SpfxPlugin);
    this.AppStudioPlugin = Container.get<AppStudioPlugin>(ResourcePlugins.AppStudioPlugin);
    this.BotPlugin = Container.get<Plugin>(ResourcePlugins.BotPlugin);
    this.AadPlugin = Container.get<Plugin>(ResourcePlugins.AadPlugin);
    this.FrontendPlugin = Container.get<Plugin>(ResourcePlugins.FrontendPlugin);
    this.FunctionPlugin = Container.get<Plugin>(ResourcePlugins.FunctionPlugin);
    this.SqlPlugin = Container.get<Plugin>(ResourcePlugins.SqlPlugin);
    this.ApimPlugin = Container.get<Plugin>(ResourcePlugins.ApimPlugin);
    this.LocalDebugPlugin = Container.get<Plugin>(ResourcePlugins.LocalDebugPlugin);
    this.runningState = SolutionRunningState.Idle;
  }

  private getPluginAndContextArray(
    ctx: SolutionContext,
    selectedPlugins: LoadedPlugin[]
  ): PluginsWithContext[] {
    // let pluginContextConstructor = getPluginContextConstructor(ctx);
    return selectedPlugins.map((plugin) => [plugin, getPluginContext(ctx, plugin.name)]);
  }

  async init(ctx: SolutionContext): Promise<Result<any, FxError>> {
    return ok({});
  }

  assertSettingsNotEmpty<T>(settings: T | undefined, key: string): Result<T, FxError> {
    if (!settings) {
      return err(
        returnSystemError(new Error(`${key} is undefined`), "Solution", SolutionError.InternelError)
      );
    }
    return ok(settings);
  }

  fillInSolutionSettings(ctx: SolutionContext): Result<AzureSolutionSettings, FxError> {
    const assertList: [
      Result<Inputs, FxError>,
      Result<ProjectSettings, FxError>,
      Result<SolutionSettings, FxError>
    ] = [
      this.assertSettingsNotEmpty<Inputs>(ctx.answers, "answers"),
      this.assertSettingsNotEmpty<ProjectSettings>(ctx.projectSettings, "projectSettings"),
      this.assertSettingsNotEmpty<SolutionSettings>(
        ctx?.projectSettings?.solutionSettings,
        "solutionSettings"
      ),
    ];
    const assertRes = combine(assertList);
    if (assertRes.isErr()) {
      return err(assertRes.error);
    }
    const [answers, projectSettings, solutionSettingsSource] = assertRes.value;

    const capabilities = (answers[AzureSolutionQuestionNames.Capabilities] as string[]) || [];
    if (!capabilities || capabilities.length === 0) {
      return err(
        returnSystemError(
          new Error("capabilities is empty"),
          "Solution",
          SolutionError.InternelError
        )
      );
    }
    let hostType = answers[AzureSolutionQuestionNames.HostType] as string;
    if (capabilities.includes(BotOptionItem.id) || capabilities.includes(MessageExtensionItem.id))
      hostType = HostTypeOptionAzure.id;
    if (!hostType) {
      return err(
        returnSystemError(
          new Error("hostType is undefined"),
          "Solution",
          SolutionError.InternelError
        )
      );
    }
    let azureResources: string[] | undefined;
    if (hostType === HostTypeOptionAzure.id && capabilities.includes(TabOptionItem.id)) {
      azureResources = answers[AzureSolutionQuestionNames.AzureResources] as string[];
      if (azureResources) {
        if (
          (azureResources.includes(AzureResourceSQL.id) ||
            azureResources.includes(AzureResourceApim.id)) &&
          !azureResources.includes(AzureResourceFunction.id)
        ) {
          azureResources.push(AzureResourceFunction.id);
        }
      } else azureResources = [];
    }
    const solutionSettings: AzureSolutionSettings = {
      name: solutionSettingsSource.name,
      version: solutionSettingsSource.version,
      hostType: hostType,
      capabilities: capabilities,
      azureResources: azureResources || [],
      activeResourcePlugins: [],
    };
    projectSettings.solutionSettings = solutionSettings;
    return ok(solutionSettings);
  }

  async fillInV1SolutionSettings(
    ctx: SolutionContext
  ): Promise<Result<AzureSolutionSettings, FxError>> {
    const assertList: [
      Result<Inputs, FxError>,
      Result<ProjectSettings, FxError>,
      Result<SolutionSettings, FxError>
    ] = [
      this.assertSettingsNotEmpty<Inputs>(ctx.answers, "answers"),
      this.assertSettingsNotEmpty<ProjectSettings>(ctx.projectSettings, "projectSettings"),
      this.assertSettingsNotEmpty<SolutionSettings>(
        ctx?.projectSettings?.solutionSettings,
        "solutionSettings"
      ),
    ];
    const assertRes = combine(assertList);
    if (assertRes.isErr()) {
      return err(assertRes.error);
    }
    const [answers, projectSettings, solutionSettingsSource] = assertRes.value;

    const isTypescriptProject = await checkFileExist(path.join(ctx.root, "tsconfig.json"));
    projectSettings.programmingLanguage = isTypescriptProject ? "typescript" : "javascript";

    const capability = answers[AzureSolutionQuestionNames.V1Capability] as string;
    if (!capability) {
      return err(
        returnSystemError(
          new Error("capabilities is empty"),
          "Solution",
          SolutionError.InternelError
        )
      );
    }

    const solutionSettings: AzureSolutionSettings = {
      name: solutionSettingsSource.name,
      version: solutionSettingsSource.version,
      hostType: HostTypeOptionAzure.id,
      capabilities: [capability],
      azureResources: [],
      activeResourcePlugins: [],
      migrateFromV1: solutionSettingsSource?.migrateFromV1,
    };
    projectSettings.solutionSettings = solutionSettings;
    return ok(solutionSettings);
  }

  /**
   * create
   */
  async create(ctx: SolutionContext): Promise<Result<any, FxError>> {
    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.CreateStart, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
    });

    // ensure that global namespace is present
    if (!ctx.envInfo.profile.has(GLOBAL_CONFIG)) {
      ctx.envInfo.profile.set(GLOBAL_CONFIG, new ConfigMap());
    }

    // Only non-SPFx project will ask this question.
    const lang = ctx.answers![AzureSolutionQuestionNames.ProgrammingLanguage] as string;
    if (lang) {
      ctx.projectSettings!.programmingLanguage = lang;
    }

    const settingsRes = this.fillInSolutionSettings(ctx);
    if (settingsRes.isErr()) {
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.Create,
          settingsRes.error,
          ctx.telemetryReporter
        )
      );
    }

    const solutionSettings = settingsRes.value;

    //Reload plugins according to user answers
    await this.reloadPlugins(solutionSettings);

    if (this.isAzureProject(ctx)) {
      await fs.writeJSON(`${ctx.root}/permissions.json`, DEFAULT_PERMISSION_REQUEST, { spaces: 4 });
      ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.Create, {
        [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
        [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
        [SolutionTelemetryProperty.Resources]: solutionSettings.azureResources.join(";"),
        [SolutionTelemetryProperty.Capabilities]: solutionSettings.capabilities.join(";"),
      });
    }
    return ok(Void);
  }

  // Migrate
  async migrate(ctx: SolutionContext): Promise<Result<any, FxError>> {
    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.MigrateStart, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
    });

    // ensure that global namespace is present
    if (!ctx.envInfo.profile.has(GLOBAL_CONFIG)) {
      ctx.envInfo.profile.set(GLOBAL_CONFIG, new ConfigMap());
    }

    const settingsRes = await this.fillInV1SolutionSettings(ctx);
    if (settingsRes.isErr()) {
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.Migrate,
          settingsRes.error,
          ctx.telemetryReporter
        )
      );
    }

    const solutionSettings = settingsRes.value;
    const selectedPlugins = await this.reloadPlugins(solutionSettings);

    const results: Result<any, FxError>[] = await Promise.all<Result<any, FxError>>(
      selectedPlugins.map<Promise<Result<any, FxError>>>((migratePlugin) => {
        return this.executeUserTask(
          {
            namespace: `${PluginNames.SOLUTION}/${migratePlugin.name}`,
            method: "migrateV1Project",
            params: {},
          },
          ctx
        );
      })
    );

    const errorResult = results.find((result) => {
      return result.isErr();
    });

    if (errorResult) {
      return errorResult;
    }

    const capabilities = (ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
      .capabilities;
    const azureResources = (ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
      .azureResources;
    await scaffoldReadmeAndLocalSettings(capabilities, azureResources, ctx.root);

    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.Migrate, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
      [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
    });

    ctx.ui?.showMessage("info", `Success: ${getStrings().solution.MigrateSuccessNotice}`, false);
    return ok(Void);
  }

  reloadPlugins(solutionSettings: AzureSolutionSettings): Plugin[] {
    const res = getActivatedResourcePlugins(solutionSettings);
    solutionSettings.activeResourcePlugins = res.map((p) => p.name);
    return res;
  }

  private spfxSelected(ctx: SolutionContext): boolean {
    // Generally, if SPFx is selected, there should be no other plugins. But we don't check this invariant here.
    const spfxExists = this.getAzureSolutionSettings(ctx).activeResourcePlugins.some(
      (pluginName) => pluginName === this.SpfxPlugin.name
    );
    return spfxExists === undefined ? false : spfxExists;
  }

  private isAzureProject(ctx?: SolutionContext): boolean {
    if (!ctx) return true;
    const settings = this.getAzureSolutionSettings(ctx);
    return HostTypeOptionAzure.id === settings.hostType;
  }

  async update(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
    if (v1Blocked.isErr()) {
      return v1Blocked;
    }
    return await this.executeAddResource(ctx);
  }

  private getSelectedPlugins(ctx: SolutionContext): Result<Plugin[], FxError> {
    const settings = this.getAzureSolutionSettings(ctx);
    const plugins = getActivatedResourcePlugins(settings);
    settings.activeResourcePlugins = plugins.map((p) => p.name);
    return ok(plugins);
  }

  /**
   * scaffold
   */
  @hooks([ErrorHandlerMW])
  async scaffold(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const maybeSelectedPlugins = this.getSelectedPlugins(ctx);
    if (maybeSelectedPlugins.isErr()) {
      return maybeSelectedPlugins;
    }
    const selectedPlugins = maybeSelectedPlugins.value;
    const result = await this.doScaffold(ctx, selectedPlugins, true);
    if (result.isOk()) {
      ctx.ui?.showMessage("info", `Success: ${getStrings().solution.ScaffoldSuccessNotice}`, false);
    }
    return result;
  }

  async doScaffold(
    ctx: SolutionContext,
    selectedPlugins: LoadedPlugin[],
    generateResourceTemplate: boolean
  ): Promise<Result<any, FxError>> {
    const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(
      ctx,
      selectedPlugins
    );
    const preScaffoldWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.preScaffold?.bind(plugin), context, plugin.name];
    });
    const scaffoldWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.scaffold?.bind(plugin), context, plugin.name];
    });
    const postScaffoldWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.postScaffold?.bind(plugin), context, plugin.name];
    });

    const res = await executeLifecycles(preScaffoldWithCtx, scaffoldWithCtx, postScaffoldWithCtx);

    if (res.isOk()) {
      const capabilities = (ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
        .capabilities;
      const azureResources = (ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
        .azureResources;
      await scaffoldReadmeAndLocalSettings(capabilities, azureResources, ctx.root);
    }

    if (isArmSupportEnabled() && generateResourceTemplate) {
      return await generateArmTemplate(ctx);
    } else {
      return res;
    }
  }

  private async ensurePermissionRequest(ctx: SolutionContext): Promise<Result<undefined, FxError>> {
    if (ctx?.projectSettings?.solutionSettings?.migrateFromV1) {
      return ok(undefined);
    }

    if (!this.isAzureProject(ctx)) {
      return err(
        returnUserError(
          new Error("Cannot update permission for SPFx project"),
          "Solution",
          SolutionError.CannotUpdatePermissionForSPFx
        )
      );
    }

    if (ctx.permissionRequestProvider === undefined) {
      ctx.permissionRequestProvider = new PermissionRequestFileProvider(ctx.root);
    }

    const result = await ctx.permissionRequestProvider.checkPermissionRequest();
    if (result.isErr()) {
      return result;
    }

    return ok(undefined);
  }

  /**
   * Checks whether solution's state is idle
   */
  private checkWhetherSolutionIsIdle(): Result<Void, FxError> {
    switch (this.runningState) {
      case SolutionRunningState.Idle:
        return ok(Void);
      case SolutionRunningState.ProvisionInProgress:
        return err(
          returnUserError(
            new Error("Provision in progress. Please wait for its completion."),
            "Solution",
            SolutionError.ProvisionInProgress
          )
        );
      case SolutionRunningState.DeployInProgress:
        return err(
          returnUserError(
            new Error("Deployment in progress. Please wait for its completion."),
            "Solution",
            SolutionError.DeploymentInProgress
          )
        );
      case SolutionRunningState.PublishInProgress:
        return err(
          returnUserError(
            new Error("Publish in progress. Please wait for its completion."),
            "Solution",
            SolutionError.PublishInProgress
          )
        );
    }
  }

  private checkWetherProvisionSucceeded(solutionConfig: SolutionConfig): boolean {
    return !!solutionConfig.get(GLOBAL_CONFIG)?.getBoolean(SOLUTION_PROVISION_SUCCEEDED);
  }

  private blockV1Project(solutionSettings: SolutionSettings | undefined): Result<any, FxError> {
    if (solutionSettings?.migrateFromV1) {
      return err(
        returnUserError(
          new Error("Command is not supported in Teams Toolkit V1 Project"),
          "Solution",
          SolutionError.V1ProjectNotSupported
        )
      );
    }
    return ok(null);
  }

  /**
   * Provision resources. It can only run in a non-SPFx project when solution's running state is Idle.
   * Solution's provisionSucceeded config value will be set to true if provision succeeds, to false otherwise.
   *
   */
  @hooks([ErrorHandlerMW])
  async provision(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
    if (v1Blocked.isErr()) {
      return v1Blocked;
    }

    const canProvision = this.checkWhetherSolutionIsIdle();
    if (canProvision.isErr()) {
      return canProvision;
    }

    try {
      // Just to trigger M365 login before the concurrent execution of provision.
      // Because concurrent exectution of provision may getAccessToken() concurrently, which
      // causes 2 M365 logins before the token caching in common lib takes effect.
      await ctx.appStudioToken?.getAccessToken();

      this.runningState = SolutionRunningState.ProvisionInProgress;
      if (this.isAzureProject(ctx)) {
        const result = await this.ensurePermissionRequest(ctx);
        if (result.isErr()) {
          return result;
        }
      }

      const provisionResult = await this.doProvision(ctx);
      if (provisionResult.isOk()) {
        const msg = util.format(
          `Success: ${getStrings().solution.ProvisionSuccessNotice}`,
          ctx.projectSettings?.appName
        );
        ctx.logProvider?.info(msg);
        ctx.ui?.showMessage("info", msg, false);
        ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, true);
      } else {
        if (!isUserCancelError(provisionResult.error)) {
          const msg = util.format(
            getStrings().solution.ProvisionFailNotice,
            ctx.projectSettings?.appName
          );
          ctx.logProvider?.error(msg);
          ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, false);
        }
      }
      return provisionResult;
    } finally {
      this.runningState = SolutionRunningState.Idle;
    }
  }

  /**
   * provision
   */
  async doProvision(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const maybeSelectedPlugins = this.getSelectedPlugins(ctx);
    if (maybeSelectedPlugins.isErr()) {
      return maybeSelectedPlugins;
    }
    const selectedPlugins = maybeSelectedPlugins.value;

    if (this.isAzureProject(ctx)) {
      //1. ask common questions for azure resources.
      const appName = ctx.projectSettings!.appName;
      const res = await fillInCommonQuestions(
        ctx,
        appName,
        ctx.envInfo.profile,
        ctx.azureAccountProvider,
        await ctx.appStudioToken?.getJsonObject()
      );
      if (res.isErr()) {
        return res;
      }
      const azureToken = await ctx.azureAccountProvider?.getAccountCredentialAsync();

      // Only Azure project requires this confirm dialog
      const username = (azureToken as any).username ? (azureToken as any).username : "";
      const subscriptionInfo = await ctx.azureAccountProvider?.getSelectedSubscription();

      const subscriptionId = subscriptionInfo?.subscriptionId;
      const subscriptionName = subscriptionInfo?.subscriptionName;
      const msg = util.format(
        getStrings().solution.ProvisionConfirmNotice,
        username,
        subscriptionName ? subscriptionName : subscriptionId
      );
      const confirmRes = await ctx.ui?.showMessage(
        "warn",
        msg,
        true,
        "Provision",
        "Pricing calculator"
      );
      const confirm = confirmRes?.isOk() ? confirmRes.value : undefined;

      if (confirm !== "Provision") {
        if (confirm === "Pricing calculator") {
          ctx.ui?.openUrl("https://azure.microsoft.com/en-us/pricing/calculator/");
        }
        return err(
          returnUserError(
            new Error(getStrings().solution.CancelProvision),
            "Solution",
            getStrings().solution.CancelProvision
          )
        );
      }
    }

    const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(
      ctx,
      selectedPlugins
    );
    const preProvisionWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.preProvision?.bind(plugin), context, plugin.name];
    });
    const provisionWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.provision?.bind(plugin), context, plugin.name];
    });
    const postProvisionWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(
      ([plugin, context]) => {
        return [plugin?.postProvision?.bind(plugin), context, plugin.name];
      }
    );

    return executeLifecycles(
      preProvisionWithCtx,
      provisionWithCtx,
      postProvisionWithCtx,
      async () => {
        ctx.logProvider?.info(
          util.format(getStrings().solution.ProvisionStartNotice, PluginDisplayName.Solution)
        );
        return ok(undefined);
      },
      async (provisionResults?: Result<any, FxError>[]) => {
        if (provisionWithCtx.length === provisionResults?.length) {
          provisionWithCtx.map(function (plugin, index) {
            if (plugin[2] === PluginNames.APPST) {
              const teamsAppResult = provisionResults[index];
              if (teamsAppResult.isOk()) {
                ctx.envInfo.profile
                  .get(GLOBAL_CONFIG)
                  ?.set(REMOTE_TEAMS_APP_ID, teamsAppResult.value);
              }
            }
          });
        }

        if (provisionResults) {
          for (const result of provisionResults) {
            if (result.isErr()) {
              return result;
            }
          }
        }

        ctx.logProvider?.info(
          util.format(getStrings().solution.ProvisionFinishNotice, PluginDisplayName.Solution)
        );

        if (isArmSupportEnabled()) {
          const armDeploymentResult = await deployArmTemplates(ctx);
          if (armDeploymentResult.isErr()) {
            return armDeploymentResult;
          }
        }

        const aadPlugin = this.AadPlugin as AadAppForTeamsPlugin;
        if (selectedPlugins.some((plugin) => plugin.name === aadPlugin.name)) {
          return await aadPlugin.executeUserTask(
            {
              namespace: `${PluginNames.SOLUTION}/${PluginNames.AAD}`,
              method: "setApplicationInContext",
              params: { isLocal: false },
            },
            getPluginContext(ctx, aadPlugin.name)
          );
        }
        return ok(undefined);
      },
      async () => {
        ctx.envInfo.profile.get(GLOBAL_CONFIG)?.delete(ARM_TEMPLATE_OUTPUT);
        ctx.logProvider?.info(
          util.format(getStrings().solution.ConfigurationFinishNotice, PluginDisplayName.Solution)
        );
        return ok(undefined);
      }
    );
  }

  @hooks([ErrorHandlerMW])
  async deploy(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
    if (v1Blocked.isErr()) {
      return v1Blocked;
    }

    const isAzureProject = this.isAzureProject(ctx);
    const provisioned = this.checkWetherProvisionSucceeded(ctx.envInfo.profile);
    if (isAzureProject && !provisioned) {
      return err(
        returnUserError(
          new Error(
            util.format(getStrings().solution.NotProvisionedNotice, ctx.projectSettings?.appName)
          ),
          "Solution",
          SolutionError.CannotDeployBeforeProvision
        )
      );
    }
    try {
      if (this.isAzureProject(ctx)) {
        // Just to trigger M365 login before the concurrent execution of deploy.
        // Because concurrent exectution of deploy may getAccessToken() concurrently, which
        // causes 2 M365 logins before the token caching in common lib takes effect.
        await ctx.appStudioToken?.getAccessToken();
      }

      this.runningState = SolutionRunningState.DeployInProgress;
      const result = await this.doDeploy(ctx);
      if (result.isOk()) {
        if (this.isAzureProject(ctx)) {
          const msg = util.format(
            `Success: ${getStrings().solution.DeploySuccessNotice}`,
            ctx.projectSettings?.appName
          );
          ctx.logProvider?.info(msg);
          ctx.ui?.showMessage("info", msg, false);
        }
      } else {
        const msg = util.format(
          getStrings().solution.DeployFailNotice,
          ctx.projectSettings?.appName
        );
        ctx.logProvider?.info(msg);
      }

      return result;
    } finally {
      this.runningState = SolutionRunningState.Idle;
    }
  }

  /**
   * deploy
   */
  private async doDeploy(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const res = this.getSelectedPlugins(ctx);
    if (res.isErr()) {
      return res;
    }
    const optionsToDeploy = ctx.answers![
      AzureSolutionQuestionNames.PluginSelectionDeploy
    ] as string[];
    if (optionsToDeploy === undefined || optionsToDeploy.length === 0) {
      return err(
        returnUserError(
          new Error(`No plugin selected`),
          "Solution",
          SolutionError.NoResourcePluginSelected
        )
      );
    }

    const pluginMap = getAllResourcePluginMap();
    const pluginsToDeploy: LoadedPlugin[] = [];
    for (const optionId of optionsToDeploy) {
      const filtered = pluginMap.get(optionId);
      if (filtered && res.value.find((p) => p.name === filtered.name)) {
        pluginsToDeploy.push(filtered);
      }
    }
    ctx.logProvider?.info(
      util.format(
        getStrings().solution.SelectedPluginsToDeployNotice,
        PluginDisplayName.Solution,
        JSON.stringify(pluginsToDeploy.map((p) => p.name))
      )
    );
    if (this.isAzureProject(ctx)) {
      //make sure sub is selected
      await ctx.azureAccountProvider?.getSelectedSubscription(true);
    }
    const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(
      ctx,
      pluginsToDeploy
    );
    const preDeployWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.preDeploy?.bind(plugin), context, plugin.name];
    });
    const deployWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.deploy?.bind(plugin), context, plugin.name];
    });
    const postDeployWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.postDeploy?.bind(plugin), context, plugin.name];
    });

    ctx.logProvider?.info(
      util.format(getStrings().solution.DeployStartNotice, PluginDisplayName.Solution)
    );

    return executeLifecycles(preDeployWithCtx, deployWithCtx, postDeployWithCtx);
  }
  @hooks([ErrorHandlerMW])
  async publish(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
    if (v1Blocked.isErr()) {
      return v1Blocked;
    }

    const checkRes = this.checkWhetherSolutionIsIdle();
    if (checkRes.isErr()) return err(checkRes.error);
    const isAzureProject = this.isAzureProject(ctx);
    const provisioned = this.checkWetherProvisionSucceeded(ctx.envInfo.profile);
    if (!provisioned) {
      return err(
        returnUserError(
          new Error(
            util.format(getStrings().solution.NotProvisionedNotice, ctx.projectSettings?.appName)
          ),
          "Solution",
          SolutionError.CannotPublishBeforeProvision
        )
      );
    }

    try {
      this.runningState = SolutionRunningState.PublishInProgress;

      const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(ctx, [
        this.AppStudioPlugin,
      ]);
      const publishWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
        return [plugin?.publish?.bind(plugin), context, plugin.name];
      });

      ctx.logProvider?.info(
        util.format(getStrings().solution.PublishStartNotice, PluginDisplayName.Solution)
      );

      const results = await executeConcurrently("", publishWithCtx);

      for (const result of results) {
        if (result.isErr()) {
          const msg = util.format(
            getStrings().solution.PublishFailNotice,
            ctx.projectSettings?.appName
          );
          ctx.logProvider?.info(msg);
          return result;
        }
      }
      return ok(undefined);
    } finally {
      this.runningState = SolutionRunningState.Idle;
    }
  }

  async getTabScaffoldQuestions(
    ctx: SolutionContext,
    addAzureResource: boolean
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const tabNode = new QTreeNode({ type: "group" });

    //Frontend plugin
    const fehostPlugin: Plugin = this.FrontendPlugin;
    if (fehostPlugin.getQuestions) {
      const pluginCtx = getPluginContext(ctx, fehostPlugin.name);
      const res = await fehostPlugin.getQuestions(Stage.create, pluginCtx);
      if (res.isErr()) return res;
      if (res.value) {
        const frontendNode = res.value as QTreeNode;
        if (frontendNode.data) tabNode.addChild(frontendNode);
      }
    }

    if (addAzureResource) {
      const azureResourceNode = new QTreeNode(AzureResourcesQuestion);
      tabNode.addChild(azureResourceNode);
      const functionPlugin: Plugin = this.FunctionPlugin;
      //Azure Function
      if (functionPlugin.getQuestions) {
        const pluginCtx = getPluginContext(ctx, functionPlugin.name);
        const res = await functionPlugin.getQuestions(Stage.create, pluginCtx);
        if (res.isErr()) return res;
        if (res.value) {
          const azure_function = res.value as QTreeNode;
          azure_function.condition = { minItems: 1 };
          if (azure_function.data) azureResourceNode.addChild(azure_function);
        }
      }
      const sqlPlugin: Plugin = this.SqlPlugin;
      //Azure SQL
      if (sqlPlugin.getQuestions) {
        const pluginCtx = getPluginContext(ctx, sqlPlugin.name);
        const res = await sqlPlugin.getQuestions(Stage.create, pluginCtx);
        if (res.isErr()) return res;
        if (res.value) {
          const azure_sql = res.value as QTreeNode;
          azure_sql.condition = { contains: AzureResourceSQL.id };
          if (azure_sql.data) azureResourceNode.addChild(azure_sql);
        }
      }
    }
    return ok(tabNode);
  }

  /**
   * collect solution level question
   * @param ctx
   */
  async getQuestions(
    stage: Stage,
    ctx: SolutionContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const isDynamicQuestion = DynamicPlatforms.includes(ctx.answers!.platform!);
    const node = new QTreeNode({ type: "group" });
    if (stage !== Stage.create && isDynamicQuestion) {
      const checkRes = this.checkWhetherSolutionIsIdle();
      if (checkRes.isErr()) return err(checkRes.error);
    }

    if (stage === Stage.create) {
      // 1. capabilities
      const capQuestion = createCapabilityQuestion();
      const capNode = new QTreeNode(capQuestion);
      node.addChild(capNode);

      // 1.1 hostType
      const hostTypeNode = new QTreeNode(FrontendHostTypeQuestion);
      hostTypeNode.condition = { contains: TabOptionItem.id };
      capNode.addChild(hostTypeNode);

      // 1.1.1 SPFX Tab
      const spfxPlugin: Plugin = new SpfxPlugin();
      if (spfxPlugin.getQuestions) {
        const pluginCtx = getPluginContext(ctx, spfxPlugin.name);
        const res = await spfxPlugin.getQuestions(Stage.create, pluginCtx);
        if (res.isErr()) return res;
        if (res.value) {
          const spfxNode = res.value as QTreeNode;
          spfxNode.condition = { equals: HostTypeOptionSPFx.id };
          if (spfxNode.data) hostTypeNode.addChild(spfxNode);
        }
      }

      // 1.1.2 Azure Tab
      const tabRes = await this.getTabScaffoldQuestions(ctx, true);
      if (tabRes.isErr()) return tabRes;
      if (tabRes.value) {
        const tabNode = tabRes.value;
        tabNode.condition = { equals: HostTypeOptionAzure.id };
        hostTypeNode.addChild(tabNode);
      }

      // 1.2 Bot
      const botPlugin: Plugin = this.BotPlugin;
      if (botPlugin.getQuestions) {
        const pluginCtx = getPluginContext(ctx, botPlugin.name);
        const res = await botPlugin.getQuestions(stage, pluginCtx);
        if (res.isErr()) return res;
        if (res.value) {
          const botGroup = res.value as QTreeNode;
          botGroup.condition = { containsAny: [BotOptionItem.id, MessageExtensionItem.id] };
          capNode.addChild(botGroup);
        }
      }

      // 1.3 Language
      const programmingLanguage = new QTreeNode(ProgrammingLanguageQuestion);
      programmingLanguage.condition = { minItems: 1 };
      capNode.addChild(programmingLanguage);
    } else if (stage == Stage.migrateV1) {
      const capQuestion = createV1CapabilityQuestion();
      const capNode = new QTreeNode(capQuestion);
      node.addChild(capNode);
    } else if (stage === Stage.provision) {
      if (isDynamicQuestion) {
        const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
        if (v1Blocked.isErr()) {
          return v1Blocked;
        }
        const provisioned = this.checkWetherProvisionSucceeded(ctx.envInfo.profile);
        if (provisioned) return ok(undefined);
      }
      let pluginsToProvision: LoadedPlugin[];
      if (isDynamicQuestion) {
        const res = this.getSelectedPlugins(ctx);
        if (res.isErr()) {
          return err(res.error);
        }
        pluginsToProvision = res.value;
      } else {
        pluginsToProvision = getAllResourcePlugins();
      }
      if (!isDynamicQuestion) {
        node.addChild(new QTreeNode(AskSubscriptionQuestion));
      }
      for (const plugin of pluginsToProvision) {
        if (plugin.getQuestions) {
          const pluginCtx = getPluginContext(ctx, plugin.name);
          const getQuestionRes = await plugin.getQuestions(stage, pluginCtx);
          if (getQuestionRes.isErr()) return getQuestionRes;
          if (getQuestionRes.value) {
            const subnode = getQuestionRes.value as QTreeNode;
            node.addChild(subnode);
          }
        }
      }
    } else if (stage === Stage.deploy) {
      if (isDynamicQuestion) {
        const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
        if (v1Blocked.isErr()) {
          return v1Blocked;
        }

        const isAzureProject = this.isAzureProject(ctx);
        const provisioned = this.checkWetherProvisionSucceeded(ctx.envInfo.profile);
        if (isAzureProject && !provisioned) {
          return err(
            returnUserError(
              new Error(getStrings().solution.FailedToDeployBeforeProvision),
              "Solution",
              SolutionError.CannotDeployBeforeProvision
            )
          );
        }
      }
      let pluginsToDeploy: LoadedPlugin[];
      if (isDynamicQuestion) {
        const res = this.getSelectedPlugins(ctx);
        if (res.isErr()) {
          return err(
            returnUserError(
              new Error("No resource to deploy"),
              "Solution",
              SolutionError.NoResourceToDeploy
            )
          );
        }
        pluginsToDeploy = res.value.filter((plugin) => !!plugin.deploy);
      } else {
        const allPlugins = getAllResourcePlugins();
        pluginsToDeploy = allPlugins.filter((plugin) => !!plugin.deploy);
      }

      if (pluginsToDeploy.length === 0) {
        return err(
          returnUserError(
            new Error("No resource to deploy"),
            "Solution",
            SolutionError.NoResourceToDeploy
          )
        );
      }
      const pluginPrefix = "fx-resource-";
      const options: OptionItem[] = pluginsToDeploy.map((plugin) => {
        const item: OptionItem = {
          id: plugin.name,
          label: plugin.displayName,
          cliName: plugin.name.replace(pluginPrefix, ""),
        };
        return item;
      });

      const selectQuestion = DeployPluginSelectQuestion;
      selectQuestion.staticOptions = options;
      selectQuestion.default = options.map((i) => i.id);
      const pluginSelection = new QTreeNode(selectQuestion);
      node.addChild(pluginSelection);

      for (const plugin of pluginsToDeploy) {
        if (plugin.getQuestions) {
          const pluginCtx = getPluginContext(ctx, plugin.name);
          const getQuestionRes = await plugin.getQuestions(stage, pluginCtx);
          if (getQuestionRes.isErr()) return getQuestionRes;
          if (getQuestionRes.value) {
            const subnode = getQuestionRes.value as QTreeNode;
            subnode.condition = { contains: plugin.name };
            if (subnode.data) pluginSelection.addChild(subnode);
          }
        }
      }
    } else if (stage === Stage.publish) {
      if (isDynamicQuestion) {
        const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
        if (v1Blocked.isErr()) {
          return v1Blocked;
        }
        const isAzureProject = this.isAzureProject(ctx);
        const provisioned = this.checkWetherProvisionSucceeded(ctx.envInfo.profile);
        if (isAzureProject && !provisioned) {
          return err(
            returnUserError(
              new Error(getStrings().solution.FailedToPublishBeforeProvision),
              "Solution",
              SolutionError.CannotPublishBeforeProvision
            )
          );
        }
        if (!provisioned && this.spfxSelected(ctx)) {
          if (ctx.answers?.platform === Platform.VSCode) {
            ctx.ui?.showMessage(
              "error",
              getStrings().solution.SPFxAskProvisionBeforePublish,
              false
            );
            throw CancelError;
          } else {
            return err(
              returnUserError(
                new Error(getStrings().solution.SPFxAskProvisionBeforePublish),
                "Solution",
                SolutionError.CannotPublishBeforeProvision
              )
            );
          }
        }
      }
      const pluginsToPublish = [this.AppStudioPlugin];
      for (const plugin of pluginsToPublish) {
        const pluginCtx = getPluginContext(ctx, plugin.name);
        if (plugin.getQuestions) {
          const getQuestionRes = await plugin.getQuestions(stage, pluginCtx);
          if (getQuestionRes.isErr()) return getQuestionRes;
          if (getQuestionRes.value) {
            const subnode = getQuestionRes.value as QTreeNode;
            node.addChild(subnode);
          }
        }
      }
    }
    return ok(node);
  }

  async localDebug(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const result = await this.ensurePermissionRequest(ctx);
    if (result.isErr()) {
      return result;
    }

    return await this.doLocalDebug(ctx);
  }

  async doLocalDebug(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const maybeSelectedPlugins = this.getSelectedPlugins(ctx);

    if (maybeSelectedPlugins.isErr()) {
      return maybeSelectedPlugins;
    }

    const selectedPlugins = maybeSelectedPlugins.value;

    // Just to trigger M365 login before the concurrent execution of localDebug.
    // Because concurrent exectution of localDebug may getAccessToken() concurrently, which
    // causes 2 M365 logins before the token caching in common lib takes effect.
    await ctx.appStudioToken?.getAccessToken();

    const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(
      ctx,
      selectedPlugins
    );
    const localDebugWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(([plugin, context]) => {
      return [plugin?.localDebug?.bind(plugin), context, plugin.name];
    });
    const postLocalDebugWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(
      ([plugin, context]) => {
        return [plugin?.postLocalDebug?.bind(plugin), context, plugin.name];
      }
    );

    const localDebugResults = await executeConcurrently("", localDebugWithCtx);
    for (const localDebugResult of localDebugResults) {
      if (localDebugResult.isErr()) {
        return localDebugResult;
      }
    }

    const aadPlugin = this.AadPlugin as AadAppForTeamsPlugin;
    if (selectedPlugins.some((plugin) => plugin.name === aadPlugin.name)) {
      const result = await aadPlugin.executeUserTask(
        {
          namespace: `${PluginNames.SOLUTION}/${PluginNames.AAD}`,
          method: "setApplicationInContext",
          params: { isLocal: true },
        },
        getPluginContext(ctx, aadPlugin.name)
      );
      if (result.isErr()) {
        return result;
      }
    }

    // set local debug Teams app tenant id in context.
    const result = this.loadTeamsAppTenantId(ctx, true, await ctx.appStudioToken?.getJsonObject());
    if (result.isErr()) {
      return result;
    }

    const postLocalDebugResults = await executeConcurrently("post", postLocalDebugWithCtx);

    const combinedPostLocalDebugResults = combine(postLocalDebugResults);
    if (combinedPostLocalDebugResults.isErr()) {
      return combinedPostLocalDebugResults;
    }

    // set local debug Teams app id in context.
    if (postLocalDebugWithCtx.length === combinedPostLocalDebugResults.value.length) {
      postLocalDebugWithCtx.map(function (plugin, index) {
        if (plugin[2] === PluginNames.APPST) {
          if (isMultiEnvEnabled()) {
            ctx.localSettings?.teamsApp.set(
              LocalSettingsTeamsAppKeys.TeamsAppId,
              combinedPostLocalDebugResults.value[index]
            );
          } else {
            ctx.envInfo.profile
              .get(GLOBAL_CONFIG)
              ?.set(LOCAL_DEBUG_TEAMS_APP_ID, combinedPostLocalDebugResults.value[index]);
          }
        }
      });
    }

    return ok(Void);
  }

  @hooks([ErrorHandlerMW])
  async grantPermission(ctx: SolutionContext): Promise<Result<any, FxError>> {
    try {
      const result = await this.checkAndGetCurrentUserInfo(ctx);
      if (result.isErr()) {
        return result;
      }

      const email = ctx.answers!["email"] as string;
      const userInfo = await this.getUserInfo(ctx, email);

      if (!userInfo) {
        return err(
          returnUserError(
            new Error(
              "Cannot find user in current tenant, please check whether your email address is correct"
            ),
            "Solution",
            SolutionError.CannotFindUserInCurrentTenant
          )
        );
      }

      ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set(USER_INFO, JSON.stringify(userInfo));

      const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(ctx, [
        this.AadPlugin,
        this.AppStudioPlugin,
      ]);

      const grantPermissionWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(
        ([plugin, context]) => {
          return [plugin?.grantPermission?.bind(plugin), context, plugin.name];
        }
      );

      if (ctx.answers?.platform === Platform.CLI) {
        const aadAppTenantId = ctx.envInfo.profile?.get(PluginNames.AAD)?.get(REMOTE_TENANT_ID);

        // Todo, when multi-environment is ready, we will update to current environment
        ctx.ui?.showMessage("info", `Starting permission grant for environment: default`, false);
        ctx.ui?.showMessage("info", `Tenant ID: ${aadAppTenantId}`, false);
      }

      const results = await executeConcurrently("", grantPermissionWithCtx);
      const permissions: ResourcePermission[] = [];
      const errors: any = [];
      for (const result of results) {
        if (result.isErr()) {
          errors.push(result);
          continue;
        }

        if (result && result.value) {
          for (const res of result.value) {
            permissions.push(res as ResourcePermission);
          }
        }
      }

      let errorMsg = "";
      if (errors.length > 0) {
        errorMsg += `Failed to grant permission for the below resources to user: ${email}.\n Resource details: \n`;
        for (const fxError of errors) {
          errorMsg += fxError.error.message + "\n";
        }
      }

      if (ctx.answers?.platform === Platform.CLI) {
        for (const permission of permissions) {
          ctx.ui?.showMessage(
            "info",
            `${permission.roles?.join(" ")} permission has been granted to ${
              permission.name
            }, ID: ${permission.resourceId}`,
            false
          );
        }

        ctx.ui?.showMessage(
          "info",
          `Skip grant permission for Azure resources. You may want to handle that via Azure portal. `,
          false
        );

        if (errorMsg) {
          for (const fxError of errors) {
            ctx.ui?.showMessage("error", errorMsg, false);
          }
        }
      }

      if (errorMsg) {
        return err(
          returnUserError(new Error(errorMsg), "Solution", SolutionError.FailedToGrantPermission)
        );
      }

      return ok(permissions);
    } finally {
      ctx.envInfo.profile.get(GLOBAL_CONFIG)?.delete(USER_INFO);
      this.runningState = SolutionRunningState.Idle;
    }
  }

  @hooks([ErrorHandlerMW])
  async checkPermission(ctx: SolutionContext): Promise<Result<any, FxError>> {
    try {
      const result = await this.checkAndGetCurrentUserInfo(ctx);
      if (result.isErr()) {
        return result;
      }

      const userInfo = result.value as IUserList;

      ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set(USER_INFO, JSON.stringify(userInfo));

      const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(ctx, [
        this.AadPlugin,
        this.AppStudioPlugin,
      ]);

      const checkPermissionWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(
        ([plugin, context]) => {
          return [plugin?.checkPermission?.bind(plugin), context, plugin.name];
        }
      );

      if (ctx.answers?.platform === Platform.CLI) {
        const aadAppTenantId = ctx.envInfo.profile?.get(PluginNames.AAD)?.get(REMOTE_TENANT_ID);

        ctx.ui?.showMessage("info", `Account used to check: ${userInfo.userPrincipalName}`, false);
        // Todo, when multi-environment is ready, we will update to current environment
        ctx.ui?.showMessage("info", `Starting permission check for environment: default`, false);
        ctx.ui?.showMessage("info", `Tenant ID: ${aadAppTenantId}`, false);
      }

      const results = await executeConcurrently("", checkPermissionWithCtx);

      const permissions: ResourcePermission[] = [];
      const errors: any = [];

      for (const result of results) {
        if (result.isErr()) {
          errors.push(result);
          continue;
        }
        if (result && result.value) {
          for (const res of result.value) {
            permissions.push(res as ResourcePermission);
          }
        }
      }

      let errorMsg = "";
      if (errors.length > 0) {
        errorMsg += `Failed to check permission for the below resources.\n Resource details: \n`;
        for (const fxError of errors) {
          errorMsg += fxError.error.message + "\n";
        }
      }

      if (ctx.answers?.platform === Platform.CLI) {
        for (const permission of permissions) {
          ctx.ui?.showMessage(
            "info",
            `Resource ID: ${permission.resourceId}, Resource Name: ${permission.name}, Permission: ${permission.roles}`,
            false
          );
        }
      }

      if (errorMsg) {
        return err(
          returnUserError(new Error(errorMsg), "Solution", SolutionError.FailedToCheckPermission)
        );
      }

      return ok(permissions);
    } finally {
      ctx.envInfo.profile.get(GLOBAL_CONFIG)?.delete(USER_INFO);
      this.runningState = SolutionRunningState.Idle;
    }
  }

  @hooks([ErrorHandlerMW])
  async listCollaborator(ctx: SolutionContext): Promise<Result<Collaborator[], FxError>> {
    try {
      const result = await this.checkAndGetCurrentUserInfo(ctx);
      if (result.isErr()) {
        return result;
      }
      const userInfo = result.value as IUserList;

      const pluginsWithCtx: PluginsWithContext[] = this.getPluginAndContextArray(ctx, [
        this.AppStudioPlugin,
        this.AadPlugin,
      ]);

      const listCollaboratorWithCtx: LifecyclesWithContext[] = pluginsWithCtx.map(
        ([plugin, context]) => {
          return [plugin?.listCollaborator?.bind(plugin), context, plugin.name];
        }
      );

      if (ctx.answers?.platform === Platform.CLI) {
        const aadAppTenantId = ctx.envInfo.profile?.get(PluginNames.AAD)?.get(REMOTE_TENANT_ID);
        ctx.ui?.showMessage("info", `Account used to check: ${userInfo.userPrincipalName}`, false);

        // Todo, when multi-environment is ready, we will update to current environment
        ctx.ui?.showMessage(
          "info",
          `Starting list all collaborators for environment: default`,
          false
        );
        ctx.ui?.showMessage("info", `Tenant ID: ${aadAppTenantId}`, false);
      }

      const results = await executeConcurrently("", listCollaboratorWithCtx);

      const errors: any = [];

      for (const result of results) {
        if (result.isErr()) {
          errors.push(result);
        }
      }

      let errorMsg = "";
      if (errors.length > 0) {
        errorMsg += `Failed to list collaborator for the project.\n Error details: \n`;
        for (const fxError of errors) {
          errorMsg += fxError.error.message + "\n";
        }
      }

      if (errorMsg) {
        return err(
          returnUserError(new Error(errorMsg), "Solution", SolutionError.FailedToListCollaborator)
        );
      }

      const teamsAppOwners: TeamsAppAdmin[] = results[0].isErr() ? [] : results[0].value;
      const aadOwners: AadOwner[] = results[1].isErr() ? [] : results[1].value;
      const collaborators: Collaborator[] = [];

      for (const teamsAppOwner of teamsAppOwners) {
        const aadOwner = aadOwners.find(
          (owner) => owner.userObjectId === teamsAppOwner.userObjectId
        );

        collaborators.push({
          userPrincipalName: teamsAppOwner.userPrincipalName,
          userObjectId: teamsAppOwner.userObjectId,
          isAadOwner: aadOwner ? true : false,
          aadResourceId: aadOwner ? aadOwner.resourceId : undefined,
          teamsAppResourceId: teamsAppOwner.resourceId,
        });
      }

      if (ctx.answers?.platform === Platform.CLI) {
        for (const collaborator of collaborators) {
          ctx.ui?.showMessage("info", `Account: ${collaborator.userPrincipalName}`, false);

          ctx.ui?.showMessage(
            "info",
            `Resource ID: ${collaborator.teamsAppResourceId}, Resource Name: Teams App, Permission: Administrator`,
            false
          );

          if (collaborator.aadResourceId) {
            ctx.ui?.showMessage(
              "info",
              `Resource ID: ${collaborator.aadResourceId}, Resource Name: AAD App, Permission: Owner`,
              false
            );
          }
        }
      }

      return ok(collaborators);
    } finally {
      this.runningState = SolutionRunningState.Idle;
    }
  }

  private async checkAndGetCurrentUserInfo(ctx: SolutionContext): Promise<Result<any, FxError>> {
    const canProcess = this.checkWhetherSolutionIsIdle();
    if (canProcess.isErr()) {
      return canProcess;
    }

    const provisioned = this.checkWetherProvisionSucceeded(ctx.envInfo.profile);
    if (!provisioned) {
      return err(
        returnUserError(
          new Error(
            "Failed to process because the resources have not been provisioned yet. Make sure you do the provision first."
          ),
          "Solution",
          SolutionError.CannotProcessBeforeProvision
        )
      );
    }

    const user = await this.getUserInfo(ctx);

    if (!user) {
      return err(
        returnSystemError(
          new Error("Failed to retrieve current user info from graph token"),
          "Solution",
          SolutionError.FailedToRetrieveUserInfo
        )
      );
    }

    const aadAppTenantId = ctx.envInfo.profile?.get(PluginNames.AAD)?.get(REMOTE_TENANT_ID);
    if (!aadAppTenantId || user.tenantId != (aadAppTenantId as string)) {
      return err(
        returnUserError(
          new Error(
            "Tenant id of your account and the provisioned Azure AD app does not match. Please check whether you logined with wrong account."
          ),
          "Solution",
          SolutionError.M365AccountNotMatch
        )
      );
    }

    return ok(user);
  }

  private parseTeamsAppTenantId(appStudioToken?: object): Result<string, FxError> {
    if (appStudioToken === undefined) {
      return err(
        returnSystemError(
          new Error("Graph token json is undefined"),
          "Solution",
          SolutionError.NoAppStudioToken
        )
      );
    }

    const teamsAppTenantId = (appStudioToken as any).tid;
    if (
      teamsAppTenantId === undefined ||
      !(typeof teamsAppTenantId === "string") ||
      teamsAppTenantId.length === 0
    ) {
      return err(
        returnSystemError(
          new Error("Cannot find teams app tenant id"),
          "Solution",
          SolutionError.NoTeamsAppTenantId
        )
      );
    }
    return ok(teamsAppTenantId);
  }

  private loadTeamsAppTenantId(
    ctx: SolutionContext,
    isLocalDebug: boolean,
    appStudioToken?: object
  ): Result<SolutionContext, FxError> {
    return this.parseTeamsAppTenantId(appStudioToken).andThen((teamsAppTenantId) => {
      if (isLocalDebug && isMultiEnvEnabled()) {
        ctx.localSettings?.teamsApp.set(LocalSettingsTeamsAppKeys.TenantId, teamsAppTenantId);
      } else {
        ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set("teamsAppTenantId", teamsAppTenantId);
      }

      return ok(ctx);
    });
  }

  getAzureSolutionSettings(ctx: SolutionContext): AzureSolutionSettings {
    return ctx.projectSettings?.solutionSettings as AzureSolutionSettings;
  }

  async getQuestionsForAddResource(
    func: Func,
    ctx: SolutionContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
    if (v1Blocked.isErr()) {
      return v1Blocked;
    }

    const isDynamicQuestion = DynamicPlatforms.includes(ctx.answers!.platform!);
    const settings = this.getAzureSolutionSettings(ctx);

    if (
      isDynamicQuestion &&
      !(
        settings.hostType === HostTypeOptionAzure.id &&
        settings.capabilities &&
        settings.capabilities.includes(TabOptionItem.id)
      )
    ) {
      return err(
        returnUserError(
          new Error("Add resource is only supported for Tab app hosted in Azure."),
          "Solution",
          SolutionError.AddResourceNotSupport
        )
      );
    }

    const selectedPlugins = settings.activeResourcePlugins || [];

    if (!selectedPlugins) {
      return err(
        returnUserError(
          new Error("selectedPlugins is empty"),
          "Solution",
          SolutionError.InternelError
        )
      );
    }
    const functionPlugin: Plugin = this.FunctionPlugin;
    const sqlPlugin: Plugin = this.SqlPlugin;
    const apimPlugin: Plugin = this.ApimPlugin;
    const alreadyHaveFunction = selectedPlugins.includes(functionPlugin.name);
    const alreadyHaveSQL = selectedPlugins.includes(sqlPlugin.name);
    const alreadyHaveAPIM = selectedPlugins.includes(apimPlugin.name);

    const addQuestion = createAddAzureResourceQuestion(
      alreadyHaveFunction,
      alreadyHaveSQL,
      alreadyHaveAPIM
    );

    const addAzureResourceNode = new QTreeNode(addQuestion);

    // there two cases to add function re-scaffold: 1. select add function   2. select add sql and function is not selected when creating
    if (functionPlugin.getQuestionsForUserTask) {
      const pluginCtx = getPluginContext(ctx, functionPlugin.name);
      const res = await functionPlugin.getQuestionsForUserTask(func, pluginCtx);
      if (res.isErr()) return res;
      if (res.value) {
        const azure_function = res.value as QTreeNode;
        if (alreadyHaveFunction) {
          // if already has function, the question will appear depends on whether user select function, otherwise, the question will always show
          azure_function.condition = { contains: AzureResourceFunction.id };
        } else {
          // if not function activated, select any option will trigger function question
          azure_function.condition = { minItems: 1 };
        }
        if (azure_function.data) addAzureResourceNode.addChild(azure_function);
      }
    }

    //Azure SQL
    if (sqlPlugin.getQuestionsForUserTask && !alreadyHaveSQL) {
      const pluginCtx = getPluginContext(ctx, sqlPlugin.name);
      const res = await sqlPlugin.getQuestionsForUserTask(func, pluginCtx);
      if (res.isErr()) return res;
      if (res.value) {
        const azure_sql = res.value as QTreeNode;
        azure_sql.condition = { contains: AzureResourceSQL.id };
        if (azure_sql.data) addAzureResourceNode.addChild(azure_sql);
      }
    }

    //APIM
    if (apimPlugin.getQuestionsForUserTask && (!alreadyHaveAPIM || !isDynamicQuestion)) {
      const pluginCtx = getPluginContext(ctx, apimPlugin.name);
      const res = await apimPlugin.getQuestionsForUserTask(func, pluginCtx);
      if (res.isErr()) return res;
      if (res.value) {
        const groupNode = new QTreeNode({ type: "group" });
        groupNode.condition = { contains: AzureResourceApim.id };
        addAzureResourceNode.addChild(groupNode);
        const apim = res.value as QTreeNode;
        if (apim.data) {
          const funcNode = new QTreeNode(AskSubscriptionQuestion);
          AskSubscriptionQuestion.func = async (
            inputs: Inputs
          ): Promise<Result<SubscriptionInfo, FxError>> => {
            const res = await checkSubscription(ctx);
            if (res.isOk()) {
              const sub = res.value;
              inputs.subscriptionId = sub.subscriptionId;
              inputs.tenantId = sub.tenantId;
            }
            return res;
          };
          groupNode.addChild(funcNode);
          groupNode.addChild(apim);
        }
      }
    }
    return ok(addAzureResourceNode);
  }

  async getQuestionsForAddCapability(
    ctx: SolutionContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const v1Blocked = this.blockV1Project(ctx.projectSettings?.solutionSettings);
    if (v1Blocked.isErr()) {
      return v1Blocked;
    }

    const isDynamicQuestion = DynamicPlatforms.includes(ctx.answers!.platform!);
    const settings = this.getAzureSolutionSettings(ctx);

    if (!(settings.hostType === HostTypeOptionAzure.id) && isDynamicQuestion) {
      return err(
        returnUserError(
          new Error("Add capability is not supported for SPFx project"),
          "Solution",
          SolutionError.AddResourceNotSupport
        )
      );
    }

    const capabilities = settings.capabilities || [];

    const alreadyHaveTab = capabilities.includes(TabOptionItem.id);

    const alreadyHaveBotOrMe =
      capabilities.includes(BotOptionItem.id) || capabilities.includes(MessageExtensionItem.id);

    if (alreadyHaveBotOrMe && alreadyHaveTab) {
      const cannotAddCapWarnMsg =
        "Your App already has both Tab and Bot/Me, can not Add Capability.";
      ctx.ui?.showMessage("error", cannotAddCapWarnMsg, false);
      return ok(undefined);
    }

    const addCapQuestion = addCapabilityQuestion(alreadyHaveTab, alreadyHaveBotOrMe);

    const addCapNode = new QTreeNode(addCapQuestion);

    //Tab sub tree
    if (!alreadyHaveTab || !isDynamicQuestion) {
      const tabRes = await this.getTabScaffoldQuestions(ctx, false);
      if (tabRes.isErr()) return tabRes;
      if (tabRes.value) {
        const tabNode = tabRes.value;
        tabNode.condition = { contains: TabOptionItem.id };
        addCapNode.addChild(tabNode);
      }
    }

    //Bot sub tree
    const botPlugin: Plugin = this.BotPlugin;
    if ((!alreadyHaveBotOrMe || !isDynamicQuestion) && botPlugin.getQuestions) {
      const pluginCtx = getPluginContext(ctx, botPlugin.name);
      const res = await botPlugin.getQuestions(Stage.create, pluginCtx);
      if (res.isErr()) return res;
      if (res.value) {
        const child = res.value as QTreeNode;
        child.condition = { containsAny: [BotOptionItem.id, MessageExtensionItem.id] };
        if (child.data) addCapNode.addChild(child);
      }
    }

    return ok(addCapNode);
  }

  /**
   * user questions for customized task
   */
  async getQuestionsForUserTask(
    func: Func,
    ctx: SolutionContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    const isDynamicQuestion = DynamicPlatforms.includes(ctx.answers!.platform!);
    const namespace = func.namespace;
    const array = namespace.split("/");
    if (func.method === "addCapability") {
      return await this.getQuestionsForAddCapability(ctx);
    }
    if (func.method === "addResource") {
      return await this.getQuestionsForAddResource(func, ctx);
    }
    if (array.length == 2) {
      const pluginName = array[1];
      const pluginMap = getAllResourcePluginMap();
      const plugin = pluginMap.get(pluginName);
      if (plugin) {
        if (plugin.getQuestionsForUserTask) {
          const pctx = getPluginContext(ctx, plugin.name);
          return await plugin.getQuestionsForUserTask(func, pctx);
        } else {
          return ok(undefined);
        }
      }
    }
    return ok(undefined);
  }

  async executeAddResource(ctx: SolutionContext): Promise<Result<any, FxError>> {
    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddResourceStart, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
    });

    if (!ctx.answers) {
      return err(
        returnUserError(new Error(`answer is empty!`), "Solution", SolutionError.InternelError)
      );
    }
    const settings = this.getAzureSolutionSettings(ctx);
    const originalSettings = deepCopy(settings);
    if (
      !(
        settings.hostType === HostTypeOptionAzure.id &&
        settings.capabilities &&
        settings.capabilities.includes(TabOptionItem.id)
      )
    ) {
      const e = returnUserError(
        new Error("Add resource is only supported for Tab app hosted in Azure."),
        "Solution",
        SolutionError.AddResourceNotSupport
      );

      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.AddResource,
          e,
          ctx.telemetryReporter
        )
      );
    }
    const selectedPlugins = settings.activeResourcePlugins;
    const functionPlugin: Plugin = this.FunctionPlugin;
    const sqlPlugin: Plugin = this.SqlPlugin;
    const apimPlugin: Plugin = this.ApimPlugin;
    const alreadyHaveFunction = selectedPlugins?.includes(functionPlugin.name);
    const alreadyHaveSql = selectedPlugins?.includes(sqlPlugin.name);
    const alreadyHaveApim = selectedPlugins?.includes(apimPlugin.name);

    const addResourcesAnswer = ctx.answers[AzureSolutionQuestionNames.AddResources] as string[];

    if (!addResourcesAnswer) {
      return err(
        returnUserError(
          new Error(`answer of ${AzureSolutionQuestionNames.AddResources} is empty!`),
          "Solution",
          SolutionError.InvalidInput
        )
      );
    }

    const addSQL = addResourcesAnswer.includes(AzureResourceSQL.id);
    const addFunc = addResourcesAnswer.includes(AzureResourceFunction.id);
    const addApim = addResourcesAnswer.includes(AzureResourceApim.id);

    if ((alreadyHaveSql && addSQL) || (alreadyHaveApim && addApim)) {
      const e = returnUserError(
        new Error("SQL/APIM is already added."),
        "Solution",
        SolutionError.AddResourceNotSupport
      );
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.AddResource,
          e,
          ctx.telemetryReporter
        )
      );
    }

    let addNewResoruceToProvision = false;
    const notifications: string[] = [];
    const pluginsToScaffold: LoadedPlugin[] = [this.LocalDebugPlugin];
    const azureResource = Array.from(settings.azureResources || []);
    if (addFunc || ((addSQL || addApim) && !alreadyHaveFunction)) {
      pluginsToScaffold.push(functionPlugin);
      if (!azureResource.includes(AzureResourceFunction.id)) {
        azureResource.push(AzureResourceFunction.id);
        addNewResoruceToProvision = true;
      }
      notifications.push(AzureResourceFunction.label);
    }
    if (addSQL && !alreadyHaveSql) {
      pluginsToScaffold.push(sqlPlugin);
      azureResource.push(AzureResourceSQL.id);
      notifications.push(AzureResourceSQL.label);
      addNewResoruceToProvision = true;
    }
    if (addApim && !alreadyHaveApim) {
      pluginsToScaffold.push(apimPlugin);
      azureResource.push(AzureResourceApim.id);
      notifications.push(AzureResourceApim.label);
      addNewResoruceToProvision = true;
    }

    if (notifications.length > 0) {
      if (isArmSupportEnabled() && addNewResoruceToProvision) {
        const confirmed = await this.confirmRegenerateArmTemplate(ctx);
        if (!confirmed) {
          return ok(Void);
        }
      }
      settings.azureResources = azureResource;
      await this.reloadPlugins(settings);
      ctx.logProvider?.info(`start scaffolding ${notifications.join(",")}.....`);
      const scaffoldRes = await this.doScaffold(ctx, pluginsToScaffold, addNewResoruceToProvision);
      if (scaffoldRes.isErr()) {
        ctx.logProvider?.info(`failed to scaffold ${notifications.join(",")}!`);
        ctx.projectSettings!.solutionSettings = originalSettings;
        return err(
          sendErrorTelemetryThenReturnError(
            SolutionTelemetryEvent.AddResource,
            scaffoldRes.error,
            ctx.telemetryReporter
          )
        );
      }
      ctx.logProvider?.info(`finish scaffolding ${notifications.join(",")}!`);
      if (addNewResoruceToProvision)
        ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, false); //if selected plugin changed, we need to re-do provision
      ctx.ui?.showMessage(
        "info",
        util.format(
          ctx.answers.platform === Platform.CLI
            ? getStrings().solution.AddResourceNoticeForCli
            : getStrings().solution.AddResourceNotice,
          notifications.join(",")
        ),
        false
      );
    }

    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddResource, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
      [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
      [SolutionTelemetryProperty.Resources]: addResourcesAnswer.join(";"),
    });
    return ok(Void);
  }

  async executeAddCapability(func: Func, ctx: SolutionContext): Promise<Result<any, FxError>> {
    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddCapabilityStart, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
    });
    if (!ctx.answers) {
      return err(
        returnUserError(new Error(`answer is empty!`), "Solution", SolutionError.InternelError)
      );
    }
    const settings = this.getAzureSolutionSettings(ctx);
    const originalSettings = deepCopy(settings);
    if (!(settings.hostType === HostTypeOptionAzure.id)) {
      const e = returnUserError(
        new Error("Add capability is not supported for SPFx project"),
        "Solution",
        SolutionError.FailedToAddCapability
      );
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.AddCapability,
          e,
          ctx.telemetryReporter
        )
      );
    }

    const capabilitiesAnswer = ctx.answers[AzureSolutionQuestionNames.Capabilities] as string[];
    if (!capabilitiesAnswer || capabilitiesAnswer.length === 0) {
      ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddCapability, {
        [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
        [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
        [SolutionTelemetryProperty.Capabilities]: [].join(";"),
      });
      return ok(Void);
    }

    if (
      (settings.capabilities?.includes(BotOptionItem.id) ||
        settings.capabilities?.includes(MessageExtensionItem.id)) &&
      (capabilitiesAnswer.includes(BotOptionItem.id) ||
        capabilitiesAnswer.includes(MessageExtensionItem.id))
    ) {
      const e = returnUserError(
        new Error("Application already contains a Bot and/or Messaging Extension"),
        "Solution",
        SolutionError.FailedToAddCapability
      );
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.AddCapability,
          e,
          ctx.telemetryReporter
        )
      );
    }
    let change = false;
    const notifications: string[] = [];
    const pluginsToScaffold: LoadedPlugin[] = [this.LocalDebugPlugin, this.AppStudioPlugin];
    const capabilities = Array.from(settings.capabilities);
    for (const cap of capabilitiesAnswer!) {
      if (!capabilities.includes(cap)) {
        capabilities.push(cap);
        change = true;
        if (cap === TabOptionItem.id) {
          notifications.push("Azure Tab Frontend");
          pluginsToScaffold.push(this.FrontendPlugin);
        } else if (
          (cap === BotOptionItem.id || cap === MessageExtensionItem.id) &&
          !pluginsToScaffold.includes(this.BotPlugin)
        ) {
          notifications.push("Bot/MessageExtension");
          pluginsToScaffold.push(this.BotPlugin);
        }
      }
    }

    if (change) {
      if (isArmSupportEnabled()) {
        const confirmed = await this.confirmRegenerateArmTemplate(ctx);
        if (!confirmed) {
          return ok(Void);
        }
      }
      settings.capabilities = capabilities;
      await this.reloadPlugins(settings);
      ctx.logProvider?.info(`start scaffolding ${notifications.join(",")}.....`);
      const scaffoldRes = await this.doScaffold(ctx, pluginsToScaffold, true);
      if (scaffoldRes.isErr()) {
        ctx.logProvider?.info(`failed to scaffold ${notifications.join(",")}!`);
        ctx.projectSettings!.solutionSettings = originalSettings;
        return err(
          sendErrorTelemetryThenReturnError(
            SolutionTelemetryEvent.AddCapability,
            scaffoldRes.error,
            ctx.telemetryReporter
          )
        );
      }
      ctx.logProvider?.info(`finish scaffolding ${notifications.join(",")}!`);
      ctx.envInfo.profile.get(GLOBAL_CONFIG)?.set(SOLUTION_PROVISION_SUCCEEDED, false);
      const msg = util.format(
        ctx.answers.platform === Platform.CLI
          ? getStrings().solution.AddCapabilityNoticeForCli
          : getStrings().solution.AddCapabilityNotice,
        notifications.join(",")
      );
      ctx.ui?.showMessage("info", msg, false);

      ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddCapability, {
        [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
        [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
        [SolutionTelemetryProperty.Capabilities]: capabilitiesAnswer.join(";"),
      });
      return ok({});
    }
    const cannotAddCapWarnMsg = "Add nothing";
    ctx.ui?.showMessage("warn", cannotAddCapWarnMsg, false);
    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddCapability, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
      [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
      [SolutionTelemetryProperty.Capabilities]: [].join(";"),
    });
    return ok({});
  }
  /**
   * execute user task
   */
  @hooks([ErrorHandlerMW])
  async executeUserTask(func: Func, ctx: SolutionContext): Promise<Result<any, FxError>> {
    if (!ctx.answers)
      return err(
        returnUserError(new Error(`answer is empty!`), "Solution", SolutionError.InternelError)
      );
    const namespace = func.namespace;
    const method = func.method;
    const array = namespace.split("/");
    if (method === "addCapability") {
      return this.executeAddCapability(func, ctx!);
    }
    if (method === "addResource") {
      return this.executeAddResource(ctx);
    }
    if (namespace.includes("solution")) {
      if (method === "registerTeamsAppAndAad") {
        const maybeParams = this.extractParamForRegisterTeamsAppAndAad(ctx.answers);
        if (maybeParams.isErr()) {
          return maybeParams;
        }
        return this.registerTeamsAppAndAad(ctx, maybeParams.value);
      } else if (method === "VSpublish") {
        // VSpublish means VS calling cli to do publish. It is different than normal cli work flow
        // It's teamsfx init followed by teamsfx  publish without running provision.
        // Using executeUserTask here could bypass the fx project check.
        if (ctx.answers?.platform !== "vs") {
          return err(
            returnSystemError(
              new Error(`VS publish is not supposed to run on platform ${ctx.answers?.platform}`),
              "Solution",
              SolutionError.UnsupportedPlatform
            )
          );
        }
        const appStudioPlugin = this.AppStudioPlugin as AppStudioPlugin;
        const pluginCtx = getPluginContext(ctx, appStudioPlugin.name);
        return appStudioPlugin.publish(pluginCtx);
      } else if (method === "validateManifest") {
        const appStudioPlugin = this.AppStudioPlugin as AppStudioPlugin;
        const pluginCtx = getPluginContext(ctx, appStudioPlugin.name);
        return await appStudioPlugin.executeUserTask(func, pluginCtx);
      } else if (method === "buildPackage") {
        const appStudioPlugin = this.AppStudioPlugin as AppStudioPlugin;
        const pluginCtx = getPluginContext(ctx, appStudioPlugin.name);
        return await appStudioPlugin.executeUserTask(func, pluginCtx);
      } else if (array.length == 2) {
        const pluginName = array[1];
        const pluginMap = getAllResourcePluginMap();
        const plugin = pluginMap.get(pluginName);
        if (plugin && plugin.executeUserTask) {
          const pctx = getPluginContext(ctx, plugin.name);
          return plugin.executeUserTask(func, pctx);
        }
      }
    }

    return err(
      returnUserError(
        new Error(`executeUserTaskRouteFailed:${JSON.stringify(func)}`),
        "Solution",
        `executeUserTaskRouteFailed`
      )
    );
  }

  private extractParamForRegisterTeamsAppAndAad(
    answers?: Inputs
  ): Result<ParamForRegisterTeamsAppAndAad, FxError> {
    if (answers == undefined) {
      return err(
        returnSystemError(
          new Error("Input is undefined"),
          "Solution",
          SolutionError.FailedToGetParamForRegisterTeamsAppAndAad
        )
      );
    }

    const param: ParamForRegisterTeamsAppAndAad = {
      "app-name": "",
      endpoint: "",
      environment: "local",
      "root-path": "",
    };
    for (const key of Object.keys(param)) {
      const value = answers[key];
      if (value == undefined) {
        return err(
          returnSystemError(
            new Error(`${key} not found`),
            "Solution",
            SolutionError.FailedToGetParamForRegisterTeamsAppAndAad
          )
        );
      }
      (param as any)[key] = value;
    }

    return ok(param);
  }

  private prepareConfigForRegisterTeamsAppAndAad(
    config: SolutionConfig,
    params: ParamForRegisterTeamsAppAndAad
  ): string {
    const endpoint = params.endpoint;
    const domain = new URL(endpoint).hostname;

    if (config.get(GLOBAL_CONFIG) == undefined) {
      config.set(GLOBAL_CONFIG, new ConfigMap());
    }

    const aadPlugin = this.AadPlugin;
    if (config.get(aadPlugin.name) == undefined) {
      config.set(aadPlugin.name, new ConfigMap());
    }
    config.get(aadPlugin.name)!.set("domain", domain);
    config.get(aadPlugin.name)!.set("endpoint", endpoint);
    return domain;
  }

  private extractConfigForRegisterTeamsAppAndAad(
    config: SolutionConfig,
    isLocal: boolean
  ): Result<{ aadId: string; applicationIdUri: string; clientSecret: string }, FxError> {
    const aadPlugin = this.AadPlugin;
    const aadId = config.get(aadPlugin.name)?.get(isLocal ? LOCAL_DEBUG_AAD_ID : REMOTE_AAD_ID);
    if (aadId === undefined || typeof aadId !== "string") {
      return err(
        returnSystemError(
          new Error(`config ${LOCAL_DEBUG_AAD_ID} is missing`),
          "Solution",
          SolutionError.RegisterTeamsAppAndAadError
        )
      );
    }
    const applicationIdUri = config
      .get(aadPlugin.name)
      ?.get(isLocal ? LOCAL_APPLICATION_ID_URIS : REMOTE_APPLICATION_ID_URIS);
    if (applicationIdUri === undefined || typeof applicationIdUri !== "string") {
      return err(
        returnSystemError(
          new Error(`config ${LOCAL_APPLICATION_ID_URIS} is missing`),
          "Solution",
          SolutionError.RegisterTeamsAppAndAadError
        )
      );
    }
    const clientSecret = config
      .get(aadPlugin.name)
      ?.get(isLocal ? LOCAL_CLIENT_SECRET : REMOTE_CLIENT_SECRET);
    if (clientSecret === undefined || typeof clientSecret !== "string") {
      return err(
        returnSystemError(
          new Error(`config ${LOCAL_CLIENT_SECRET} is missing`),
          "Solution",
          SolutionError.RegisterTeamsAppAndAadError
        )
      );
    }
    return ok({
      aadId,
      applicationIdUri,
      clientSecret,
    });
  }

  /**
   * This function is only called by cli: teamsfx init. The context may be different from that of vsc: no .${ConfigFolderName} folder, no permissions.json
   * In order to reuse aad plugin, we need to pretend we are still in vsc context. Currently, we don't support icons, because icons are not included in the
   * current contract.
   */
  private async registerTeamsAppAndAad(
    ctx: SolutionContext,
    params: ParamForRegisterTeamsAppAndAad
  ): Promise<
    Result<
      {
        teamsAppId: string;
        clientId: string;
        clientSecret: string;
        tenantId: string;
        applicationIdUri: string;
      },
      FxError
    >
  > {
    const rootPath = params["root-path"];
    const isLocal: boolean = params.environment === "local";
    const mockedManifest = new TeamsAppManifest();
    mockedManifest.name.short = params["app-name"];
    const domain = this.prepareConfigForRegisterTeamsAppAndAad(ctx.envInfo.profile, params);
    const aadPlugin = this.AadPlugin as AadAppForTeamsPlugin;
    const aadPluginCtx = getPluginContext(ctx, aadPlugin.name);

    if (ctx.permissionRequestProvider === undefined) {
      ctx.permissionRequestProvider = {
        async checkPermissionRequest(): Promise<Result<undefined, FxError>> {
          return ok(undefined);
        },
        async getPermissionRequest(): Promise<Result<string, FxError>> {
          return ok(JSON.stringify(DEFAULT_PERMISSION_REQUEST));
        },
      };
    }

    const provisionResult = isLocal
      ? await aadPlugin.localDebug(aadPluginCtx)
      : await aadPlugin.provision(aadPluginCtx);
    if (provisionResult.isErr()) {
      return provisionResult;
    }
    await aadPlugin.executeUserTask(
      {
        namespace: `${PluginNames.SOLUTION}/${PluginNames.AAD}`,
        method: "setApplicationInContext",
        params: { isLocal: isLocal },
      },
      aadPluginCtx
    );
    const postProvisionResult = isLocal
      ? await aadPlugin.postLocalDebug(aadPluginCtx)
      : await aadPlugin.postProvision(aadPluginCtx);
    if (postProvisionResult.isErr()) {
      return postProvisionResult;
    }

    const configResult = this.extractConfigForRegisterTeamsAppAndAad(ctx.envInfo.profile, isLocal);
    if (configResult.isErr()) {
      return err(configResult.error);
    }

    const manifestPath: string = path.join(
      rootPath,
      "manifest",
      isLocal ? "local" : "remote",
      "manifest.json"
    );
    const appSettingsJSONPath = path.join(
      rootPath,
      isLocal ? "appsettings.Development.json" : "appsettings.json"
    );

    const manifestTpl = (await fs.readFile(manifestPath)).toString();
    const manifestStr: string = Mustache.render(manifestTpl, {
      "client-id": configResult.value.aadId,
      "app-name": params["app-name"],
      endpoint: params.endpoint,
      domain: domain,
      "application-id-uri": configResult.value.applicationIdUri,
    });
    const manifest: TeamsAppManifest = JSON.parse(manifestStr);
    await fs.writeFile(manifestPath, manifestStr);
    const appStudioPlugin: AppStudioPlugin = this.AppStudioPlugin as any;
    const func: Func = {
      namespace: `${PluginNames.SOLUTION}/${PluginNames.APPST}`,
      method: "getAppDefinitionAndUpdate",
      params: {
        type: "remote",
        manifest: manifest,
      },
    };
    const maybeTeamsAppId = await appStudioPlugin.executeUserTask(
      func,
      getPluginContext(ctx, this.AppStudioPlugin.name)
    );
    if (maybeTeamsAppId.isErr()) {
      return err(maybeTeamsAppId.error);
    }
    const teamsAppId = maybeTeamsAppId.value;

    const appSettingsJSONTpl = (await fs.readFile(appSettingsJSONPath)).toString();
    const maybeTenantId = this.parseTeamsAppTenantId(await ctx.appStudioToken?.getJsonObject());
    if (maybeTenantId.isErr()) {
      return err(maybeTenantId.error);
    }
    const appSettingsJSON = Mustache.render(appSettingsJSONTpl, {
      "client-id": configResult.value.aadId,
      "client-secret": configResult.value.clientSecret,
      "application-id-uri": configResult.value.applicationIdUri,
      endpoint: params.endpoint,
      "tenant-id": maybeTenantId.value,
    });
    await fs.writeFile(appSettingsJSONPath, appSettingsJSON);

    if (isLocal) {
      const launchSettingsJSONPath: string = path.join(
        rootPath,
        "Properties",
        "launchSettings.json"
      );
      const launchSettingsJSONTpl = (await fs.readFile(launchSettingsJSONPath)).toString();
      const launchSettingsJSON = Mustache.render(launchSettingsJSONTpl, {
        "teams-app-id": teamsAppId,
      });
      await fs.writeFile(launchSettingsJSONPath, launchSettingsJSON);
    }

    return ok({
      teamsAppId: teamsAppId,
      clientId: configResult.value.aadId,
      clientSecret: configResult.value.clientSecret,
      tenantId: maybeTenantId.value,
      applicationIdUri: configResult.value.applicationIdUri,
    });
  }

  private async getUserInfo(ctx: SolutionContext, email?: string): Promise<IUserList | undefined> {
    const currentUser = await ctx.graphTokenProvider?.getJsonObject();

    if (!currentUser) {
      return undefined;
    }

    const tenantId = currentUser["tid"] as string;
    let aadId = currentUser["oid"] as string;
    let userPrincipalName = currentUser["unique_name"] as string;
    let displayName = currentUser["name"] as string;
    const isAdministrator = true;

    if (email) {
      const graphToken = await ctx.graphTokenProvider?.getAccessToken();
      const instance = axios.create({
        baseURL: "https://graph.microsoft.com/v1.0",
      });
      instance.defaults.headers.common["Authorization"] = `Bearer ${graphToken}`;
      const res = await instance.get(`/users?$filter=startsWith(mail,'${email}')`);
      if (!res || !res.data || !res.data.value) {
        return undefined;
      }

      const collaborator = res.data.value.find((user: any) => user.userPrincipalName === email);

      if (!collaborator) {
        return undefined;
      }

      aadId = collaborator.id;
      userPrincipalName = collaborator.userPrincipalName;
      displayName = collaborator.displayName;
    }

    return {
      tenantId,
      aadId,
      userPrincipalName,
      displayName,
      isAdministrator,
    };
  }

  private async confirmRegenerateArmTemplate(ctx: SolutionContext): Promise<boolean> {
    const msg: string = util.format(getStrings().solution.RegenerateArmTemplateConfirmNotice);
    const okItem = "Ok";
    const confirmRes = await ctx.ui?.showMessage("warn", msg, true, okItem);

    const confirm = confirmRes?.isOk() ? confirmRes.value : undefined;

    return confirm === okItem;
  }
}
