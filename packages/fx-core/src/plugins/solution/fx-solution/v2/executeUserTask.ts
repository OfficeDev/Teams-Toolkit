import {
  v2,
  Inputs,
  FxError,
  Result,
  ok,
  err,
  returnUserError,
  Func,
  returnSystemError,
  TelemetryReporter,
  AzureSolutionSettings,
  Void,
  Platform,
  UserInteraction,
  AppStudioTokenProvider,
  SolutionSettings,
} from "@microsoft/teamsfx-api";
import { getStrings, isArmSupportEnabled } from "../../../../common/tools";
import { getAzureSolutionSettings, reloadV2Plugins } from "./utils";
import {
  SolutionError,
  SolutionTelemetryComponentName,
  SolutionTelemetryEvent,
  SolutionTelemetryProperty,
  SolutionTelemetrySuccess,
} from "../constants";
import * as util from "util";
import {
  AzureResourceApim,
  AzureResourceFunction,
  AzureResourceSQL,
  AzureSolutionQuestionNames,
  BotOptionItem,
  HostTypeOptionAzure,
  MessageExtensionItem,
  TabOptionItem,
} from "../question";
import { cloneDeep } from "lodash";
import { sendErrorTelemetryThenReturnError } from "../utils/util";
import { getAllV2ResourcePluginMap, ResourcePluginsV2 } from "../ResourcePluginContainer";
import { Container } from "typedi";
import { scaffoldByPlugins } from "./scaffolding";
import { generateResourceTemplate } from "./generateResourceTemplate";

export async function executeUserTask(
  ctx: v2.Context,
  func: Func,
  inputs: Inputs,
  tokenProvider: AppStudioTokenProvider
): Promise<Result<unknown, FxError>> {
  const namespace = func.namespace;
  const method = func.method;
  const array = namespace.split("/");
  if (method === "addCapability") {
    return addCapability(ctx, inputs);
  }
  if (method === "addResource") {
    return addResource(ctx, inputs);
  }
  if (namespace.includes("solution")) {
    if (method === "registerTeamsAppAndAad") {
      // not implemented for now
      return err(
        returnSystemError(
          new Error("Not implemented"),
          "Solution",
          SolutionError.FeatureNotSupported
        )
      );
    } else if (method === "VSpublish") {
      // VSpublish means VS calling cli to do publish. It is different than normal cli work flow
      // It's teamsfx init followed by teamsfx  publish without running provision.
      // Using executeUserTask here could bypass the fx project check.
      if (inputs.platform !== "vs") {
        return err(
          returnSystemError(
            new Error(`VS publish is not supposed to run on platform ${inputs.platform}`),
            "Solution",
            SolutionError.UnsupportedPlatform
          )
        );
      }
      const appStudioPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AppStudioPlugin);
      if (appStudioPlugin.publishApplication) {
        return appStudioPlugin.publishApplication(ctx, inputs, {}, tokenProvider);
      }
    } else if (method === "validateManifest") {
      const appStudioPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AppStudioPlugin);
      if (appStudioPlugin.executeUserTask) {
        return appStudioPlugin.executeUserTask(ctx, func, inputs);
      }
    } else if (array.length == 2) {
      const pluginName = array[1];
      const pluginMap = getAllV2ResourcePluginMap();
      const plugin = pluginMap.get(pluginName);
      if (plugin && plugin.executeUserTask) {
        return plugin.executeUserTask(ctx, func, inputs);
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

export function canAddCapability(
  settings: AzureSolutionSettings,
  telemetryReporter: TelemetryReporter
): Result<Void, FxError> {
  if (!(settings.hostType === HostTypeOptionAzure.id)) {
    const e = returnUserError(
      new Error("Add capability is not supported for SPFx project"),
      "Solution",
      SolutionError.FailedToAddCapability
    );
    return err(
      sendErrorTelemetryThenReturnError(SolutionTelemetryEvent.AddCapability, e, telemetryReporter)
    );
  }
  return ok(Void);
}

export function canAddResource(
  settings: AzureSolutionSettings,
  telemetryReporter: TelemetryReporter
): Result<Void, FxError> {
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
      sendErrorTelemetryThenReturnError(SolutionTelemetryEvent.AddResource, e, telemetryReporter)
    );
  }
  return ok(Void);
}

export async function addCapability(
  ctx: v2.Context,
  inputs: Inputs
): Promise<
  Result<{ solutionSettings?: SolutionSettings; solutionConfig?: Record<string, unknown> }, FxError>
> {
  ctx.telemetryReporter.sendTelemetryEvent(SolutionTelemetryEvent.AddCapabilityStart, {
    [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
  });

  const settings: AzureSolutionSettings = getAzureSolutionSettings(ctx);
  const originalSettings = cloneDeep(settings);
  const canProceed = canAddCapability(settings, ctx.telemetryReporter);
  if (canProceed.isErr()) {
    return err(canProceed.error);
  }

  const capabilitiesAnswer = inputs[AzureSolutionQuestionNames.Capabilities] as string[];
  if (!capabilitiesAnswer || capabilitiesAnswer.length === 0) {
    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddCapability, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
      [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
      [SolutionTelemetryProperty.Capabilities]: [].join(";"),
    });
    return ok({});
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
  const localDebugPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.LocalDebugPlugin);
  const appStudioPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AppStudioPlugin);
  const frontendPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.FrontendPlugin);
  const botPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.BotPlugin);
  const pluginsToScaffold: v2.ResourcePlugin[] = [localDebugPlugin, appStudioPlugin];
  const capabilities = Array.from(settings.capabilities);
  for (const cap of capabilitiesAnswer) {
    if (!capabilities.includes(cap)) {
      capabilities.push(cap);
      change = true;
      if (cap === TabOptionItem.id) {
        notifications.push("Azure Tab Frontend");
        pluginsToScaffold.push(frontendPlugin);
      } else if (
        (cap === BotOptionItem.id || cap === MessageExtensionItem.id) &&
        !pluginsToScaffold.includes(botPlugin)
      ) {
        notifications.push("Bot/MessageExtension");
        pluginsToScaffold.push(botPlugin);
      }
    }
  }

  if (change) {
    if (isArmSupportEnabled()) {
      const confirmed = await confirmRegenerateArmTemplate(ctx.userInteraction);
      if (!confirmed) {
        return ok({});
      }
    }
    settings.capabilities = capabilities;
    reloadV2Plugins(settings);
    ctx.logProvider?.info(`start scaffolding ${notifications.join(",")}.....`);
    const scaffoldRes = await scaffoldCodeAndResourceTemplate(ctx, inputs, pluginsToScaffold, true);
    if (scaffoldRes.isErr()) {
      ctx.logProvider?.info(`failed to scaffold ${notifications.join(",")}!`);
      ctx.projectSetting.solutionSettings = originalSettings;
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.AddCapability,
          scaffoldRes.error,
          ctx.telemetryReporter
        )
      );
    }
    ctx.logProvider?.info(`finish scaffolding ${notifications.join(",")}!`);
    const msg = util.format(
      inputs.platform === Platform.CLI
        ? getStrings().solution.AddCapabilityNoticeForCli
        : getStrings().solution.AddCapabilityNotice,
      notifications.join(",")
    );
    ctx.userInteraction.showMessage("info", msg, false);

    ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddCapability, {
      [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
      [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
      [SolutionTelemetryProperty.Capabilities]: capabilitiesAnswer.join(";"),
    });
    return ok({ solutionSettings: settings, solutionConfig: { provisionSucceeded: false } });
  }
  const cannotAddCapWarnMsg = "Add nothing";
  ctx.userInteraction.showMessage("warn", cannotAddCapWarnMsg, false);
  ctx.telemetryReporter.sendTelemetryEvent(SolutionTelemetryEvent.AddCapability, {
    [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
    [SolutionTelemetryProperty.Success]: SolutionTelemetrySuccess.Yes,
    [SolutionTelemetryProperty.Capabilities]: [].join(";"),
  });
  return ok({});
}

export async function confirmRegenerateArmTemplate(ui?: UserInteraction): Promise<boolean> {
  const msg: string = util.format(getStrings().solution.RegenerateArmTemplateConfirmNotice);
  const okItem = "Ok";
  const confirmRes = await ui?.showMessage("warn", msg, true, okItem);

  const confirm = confirmRes?.isOk() ? confirmRes.value : undefined;

  return confirm === okItem;
}

async function scaffoldCodeAndResourceTemplate(
  ctx: v2.Context,
  inputs: Inputs,
  plugins: v2.ResourcePlugin[],
  generateTemplate: boolean
): Promise<Result<unknown, FxError>> {
  const result = await scaffoldByPlugins(ctx, inputs, plugins);
  if (result.isErr()) {
    return result;
  }
  if (!generateTemplate || !isArmSupportEnabled()) {
    return result;
  }
  return generateResourceTemplate(ctx, inputs);
}

export async function addResource(
  ctx: v2.Context,
  inputs: Inputs
): Promise<Result<unknown, FxError>> {
  ctx.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddResourceStart, {
    [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
  });

  const settings: AzureSolutionSettings = getAzureSolutionSettings(ctx);
  const canProceed = canAddResource(settings, ctx.telemetryReporter);
  if (canProceed.isErr()) {
    return canProceed;
  }

  const selectedPlugins = settings.activeResourcePlugins;
  const functionPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.FunctionPlugin);
  const sqlPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.SqlPlugin);
  const apimPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.ApimPlugin);
  const alreadyHaveFunction = selectedPlugins?.includes(functionPlugin.name);
  const alreadyHaveSql = selectedPlugins?.includes(sqlPlugin.name);
  const alreadyHaveApim = selectedPlugins?.includes(apimPlugin.name);
  const localDebugPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.LocalDebugPlugin);

  const addResourcesAnswer = inputs[AzureSolutionQuestionNames.AddResources] as string[];

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
  const pluginsToScaffold: v2.ResourcePlugin[] = [localDebugPlugin];
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
      const confirmed = await confirmRegenerateArmTemplate(ctx.userInteraction);
      if (!confirmed) {
        return ok(Void);
      }
    }
    settings.azureResources = azureResource;
    reloadV2Plugins(settings);
    ctx.logProvider?.info(`start scaffolding ${notifications.join(",")}.....`);
    const scaffoldRes = await scaffoldCodeAndResourceTemplate(
      ctx,
      inputs,
      pluginsToScaffold,
      addNewResoruceToProvision
    );
    if (scaffoldRes.isErr()) {
      ctx.logProvider?.info(`failed to scaffold ${notifications.join(",")}!`);
      return err(
        sendErrorTelemetryThenReturnError(
          SolutionTelemetryEvent.AddResource,
          scaffoldRes.error,
          ctx.telemetryReporter
        )
      );
    }
    ctx.logProvider?.info(`finish scaffolding ${notifications.join(",")}!`);
    ctx.userInteraction.showMessage(
      "info",
      util.format(
        inputs.platform === Platform.CLI
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
  return ok(
    addNewResoruceToProvision
      ? { solutionSettings: settings, solutionConfig: { provisionSucceeded: false } }
      : Void
  );
}

export function extractParamForRegisterTeamsAppAndAad(
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

export type ParamForRegisterTeamsAppAndAad = {
  "app-name": string;
  environment: "local" | "remote";
  endpoint: string;
  "root-path": string;
};
