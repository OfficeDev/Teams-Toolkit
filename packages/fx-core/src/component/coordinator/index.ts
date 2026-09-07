// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Colors,
  Context,
  CreateProjectResult,
  FxError,
  Inputs,
  InputsWithProjectPath,
  Platform,
  Result,
  SystemError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { DotenvParseOutput } from "dotenv";
import fs from "fs-extra";
import { glob } from "glob";
import * as jsonschema from "jsonschema";
import { camelCase, merge } from "lodash";
import { EOL } from "os";
import * as workerAgents from "../../core/workerAgents";
import * as path from "path";
import * as uuid from "uuid";
import * as xml2js from "xml2js";
import { AppStudioScopes, getResourceGroupInPortal } from "../../common/constants";
import { ErrorContextMW, globalVars } from "../../common/globalVars";
import { getLocalizedString } from "../../common/localizeUtils";
import { convertToAlphanumericOnly } from "../../common/stringUtils";
import { TelemetryEvent, TelemetryProperty } from "../../common/telemetry";
import { environmentNameManager } from "../../core/environmentName";
import { ResourceGroupConflictError, SelectSubscriptionError } from "../../error/azure";
import {
  InputValidationError,
  MissingEnvironmentVariablesError,
  MissingRequiredInputError,
  UserCancelError,
  assembleError,
} from "../../error/common";
import { LifeCycleUndefinedError } from "../../error/yml";
import { AppNamePattern, QuestionNames, ScratchOptions } from "../../question/constants";
import { ProjectTypeOptions } from "../../question/scaffold/vsc/ProjectTypeOptions";
import { TeamsProjectTypeOptions } from "../../question/scaffold/vsc/teamsProjectTypeNode";
import {
  ExecutionError,
  ExecutionOutput,
  ILifecycle,
  ProjectModel,
} from "../configManager/interface";
import { Lifecycle } from "../configManager/lifecycle";
import { CoordinatorSource } from "../constants";
import { deployUtils } from "../deployUtils";
import { DriverContext } from "../driver/interface/commonArgs";
import * as appStudio from "../driver/teamsApp/appStudio";
import { Constants } from "../driver/teamsApp/constants";
import { manifestUtils } from "../driver/teamsApp/utils/ManifestUtils";
import { getResolvedManifest } from "../driver/teamsApp/utils/utils";
import { Generator } from "../generator/generator";
import { Generators } from "../generator/generatorProvider";
import { ActionContext, ActionExecutionMW } from "../middleware/actionExecutionMW";
import { provisionUtils } from "../provisionUtils";
import { ResourceGroupInfo, resourceGroupHelper } from "../utils/ResourceGroupHelper";
import { envUtil } from "../utils/envUtil";
import { ManifestType } from "../utils/envFunctionUtils";
import { metadataUtil } from "../utils/metadataUtil";
import { pathUtils } from "../utils/pathUtils";
import { settingsUtil } from "../utils/settingsUtil";
import { SummaryReporter } from "./summary";

const M365Actions = [
  "botAadApp/create",
  "teamsApp/create",
  "teamsApp/update",
  "aadApp/create",
  "aadApp/update",
  "botFramework/create",
  "teamsApp/extendToM365",
];
const AzureActions = ["arm/deploy"];
const needTenantCheckActions = ["botAadApp/create", "aadApp/create", "botFramework/create"];

class Coordinator {
  @hooks([
    ErrorContextMW({ component: "Coordinator" }),
    ActionExecutionMW({
      enableTelemetry: true,
      telemetryEventName: TelemetryEvent.CreateProject,
      telemetryComponentName: "coordinator",
      errorSource: CoordinatorSource,
    }),
  ])
  async create(
    context: Context,
    inputs: Inputs,
    actionContext?: ActionContext
  ): Promise<Result<CreateProjectResult, FxError>> {
    let folder = inputs["folder"] as string;
    if (!folder) {
      return err(new MissingRequiredInputError("folder"));
    }
    folder = path.resolve(folder);
    const scratch = inputs[QuestionNames.Scratch] as string;
    let projectPath = "";
    let warnings = undefined;
    if (scratch === ScratchOptions.no().id) {
      // create from sample
      const sampleId = inputs[QuestionNames.Samples] as string;
      if (!sampleId) {
        throw new MissingRequiredInputError(QuestionNames.Samples);
      }
      projectPath = path.join(folder, sampleId);
      let suffix = 1;
      while ((await fs.pathExists(projectPath)) && (await fs.readdir(projectPath)).length > 0) {
        projectPath = path.join(folder, `${sampleId}_${suffix++}`);
      }

      inputs.projectPath = projectPath;
      await fs.ensureDir(projectPath);

      const res = await Generator.generateSample(context, projectPath, sampleId);
      if (res.isErr()) return err(res.error);

      downloadSampleHook(sampleId, projectPath);
    } else if (!scratch || scratch === ScratchOptions.yes().id) {
      // create from new
      const appName = inputs[QuestionNames.AppName] as string;
      if (undefined === appName) return err(new MissingRequiredInputError(QuestionNames.AppName));
      const validateResult = jsonschema.validate(appName, {
        pattern: AppNamePattern,
      });
      if (validateResult.errors && validateResult.errors.length > 0) {
        return err(
          new InputValidationError(QuestionNames.AppName, validateResult.errors[0].message)
        );
      }
      projectPath = path.join(folder, appName);
      inputs.projectPath = projectPath;

      await fs.ensureDir(projectPath);

      // set isVS global var when creating project
      const language = inputs[QuestionNames.ProgrammingLanguage];
      globalVars.isVS = language === "csharp";
      const capability = inputs.capabilities as string;
      const projectType = inputs[QuestionNames.ProjectType];
      const teamsAppType = inputs[QuestionNames.TeamsAppType];
      delete inputs.folder;

      merge(actionContext?.telemetryProps, {
        [TelemetryProperty.Capabilities]: capability,
        [TelemetryProperty.IsFromTdp]: (!!inputs.teamsAppFromTdp).toString(),
      });
      if (
        projectType === ProjectTypeOptions.customEngineAgentOptionId ||
        (teamsAppType === TeamsProjectTypeOptions.botOptionId && inputs.platform === Platform.VS)
      ) {
        merge(actionContext?.telemetryProps, {
          [TelemetryProperty.CustomCopilotRAG]: inputs["custom-copilot-rag"] ?? "",
          [TelemetryProperty.CustomCopilotAgent]: inputs["custom-copilot-agent"] ?? "",
          [TelemetryProperty.LlmService]: inputs["llm-service"] ?? "",
          [TelemetryProperty.HasAzureOpenAIKey]: inputs["azure-openai-key"] ? "true" : "false",
          [TelemetryProperty.HasAzureOpenAIEndpoint]: inputs["azure-openai-endpoint"]
            ? "true"
            : "false",
          [TelemetryProperty.HasAzureOpenAIDeploymentName]: inputs["azure-openai-deployment-name"]
            ? "true"
            : "false",
          [TelemetryProperty.HasOpenAIKey]: inputs["openai-key"] ? "true" : "false",
        });
      }

      // refactored generator
      const generator = Generators.find((g) => g.activate(context, inputs));
      if (!generator) {
        return err(
          new SystemError(
            "coordinator",
            "NoActivatedGeneratorError",
            `No activated generator by inputs: ${JSON.stringify(inputs)}`
          )
        );
      }
      const res = await generator.run(context, inputs, projectPath);
      if (res.isErr()) return err(res.error);
      else {
        warnings = res.value.warnings;
      }
    }

    // generate unique projectId in teamsapp.yaml (optional)
    const ymlPath = pathUtils.getYmlFilePath(projectPath, "dev", true) as string;
    if (await fs.pathExists(ymlPath)) {
      const ensureRes = await this.ensureTrackingId(projectPath, inputs.projectId);
      if (ensureRes.isErr()) return err(ensureRes.error);
      inputs.projectId = ensureRes.value;
    }

    const trimRes = await manifestUtils.trimManifestShortName(projectPath);
    if (trimRes.isErr()) return err(trimRes.error);

    return ok({ projectPath: projectPath, warnings });
  }

  async ensureTeamsFxInCsproj(projectPath: string): Promise<Result<undefined, FxError>> {
    const list = await fs.readdir(projectPath);
    const csprojFiles = list.filter((fileName) => fileName.endsWith(".csproj"));
    if (csprojFiles.length === 0) return ok(undefined);
    const filePath = csprojFiles[0];
    const xmlStringOld = (await fs.readFile(filePath, { encoding: "utf8" })).toString();
    const jsonObj = await xml2js.parseStringPromise(xmlStringOld);
    let ItemGroup = jsonObj.Project.ItemGroup;
    if (!ItemGroup) {
      ItemGroup = [];
      jsonObj.Project.ItemGroup = ItemGroup;
    }
    const existItems = ItemGroup.filter((item: any) => {
      if (item.ProjectCapability && item.ProjectCapability[0])
        if (item.ProjectCapability[0]["$"]?.Include === "TeamsFx") return true;
      return false;
    });
    if (existItems.length === 0) {
      const toAdd = {
        ProjectCapability: [
          {
            $: {
              Include: "TeamsFx",
            },
          },
        ],
      };
      ItemGroup.push(toAdd);
      const builder = new xml2js.Builder();
      const xmlStringNew = builder.buildObject(jsonObj);
      await fs.writeFile(filePath, xmlStringNew, { encoding: "utf8" });
    }
    return ok(undefined);
  }

  async ensureTrackingId(
    projectPath: string,
    trackingId: string | undefined = undefined
  ): Promise<Result<string, FxError>> {
    // generate unique trackingId in settings.json
    const settingsRes = await settingsUtil.readSettings(projectPath, false);
    if (settingsRes.isErr()) return err(settingsRes.error);
    const settings = settingsRes.value;
    if (settings.trackingId && !trackingId) return ok(settings.trackingId); // do nothing
    settings.trackingId = trackingId || uuid.v4();
    await settingsUtil.writeSettings(projectPath, settings);
    return ok(settings.trackingId);
  }

  @hooks([ErrorContextMW({ component: "Coordinator" })])
  async preProvisionForVS(
    ctx: DriverContext,
    inputs: InputsWithProjectPath
  ): Promise<
    Result<
      {
        needAzureLogin: boolean;
        needM365Login: boolean;
        resolvedAzureSubscriptionId?: string;
        resolvedAzureResourceGroupName?: string;
      },
      FxError
    >
  > {
    const res: {
      needAzureLogin: boolean;
      needM365Login: boolean;
      resolvedAzureSubscriptionId?: string;
      resolvedAzureResourceGroupName?: string;
    } = {
      needAzureLogin: false,
      needM365Login: false,
    };

    // 1. parse yml to cycles
    const templatePath =
      inputs["workflowFilePath"] || pathUtils.getYmlFilePath(ctx.projectPath, inputs.env);
    const maybeProjectModel = await metadataUtil.parse(templatePath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value;
    const cycles: ILifecycle[] = [
      projectModel.registerApp,
      projectModel.provision,
      projectModel.configureApp,
    ].filter((c) => c !== undefined);

    // 2. check each cycle
    for (const cycle of cycles) {
      const unresolvedPlaceholders = cycle.resolvePlaceholders();
      let firstArmDriver;
      for (const driver of cycle.driverDefs) {
        if (AzureActions.includes(driver.uses)) {
          res.needAzureLogin = true;
          if (!firstArmDriver) {
            firstArmDriver = driver;
          }
        }
        if (M365Actions.includes(driver.uses)) {
          res.needM365Login = true;
        }
      }
      if (firstArmDriver) {
        const withObj = firstArmDriver.with as any;
        res.resolvedAzureSubscriptionId = unresolvedPlaceholders.includes("AZURE_SUBSCRIPTION_ID")
          ? undefined
          : withObj["subscriptionId"];
        res.resolvedAzureResourceGroupName = unresolvedPlaceholders.includes(
          "AZURE_RESOURCE_GROUP_NAME"
        )
          ? undefined
          : withObj["resourceGroupName"];
      }
    }
    return ok(res);
  }

  @hooks([ErrorContextMW({ component: "Coordinator" })])
  async preCheckYmlAndEnvForVS(
    ctx: DriverContext,
    inputs: InputsWithProjectPath
  ): Promise<Result<undefined, FxError>> {
    const templatePath =
      inputs["workflowFilePath"] || pathUtils.getYmlFilePath(ctx.projectPath, inputs.env);
    const maybeProjectModel = await metadataUtil.parse(templatePath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value;
    const cycles: ILifecycle[] = [projectModel.provision].filter((c) => c !== undefined);

    let unresolvedPlaceholders: string[] = [];
    // 2. check each cycle
    for (const cycle of cycles) {
      unresolvedPlaceholders = unresolvedPlaceholders.concat(cycle.resolvePlaceholders());
    }
    if (unresolvedPlaceholders.length > 0) {
      return err(
        new MissingEnvironmentVariablesError("coordinator", unresolvedPlaceholders.join(","))
      );
    }

    for (const action of projectModel.provision?.driverDefs ?? []) {
      if (action.uses === "teamsApp/create") {
        const teamsAppIdKeyName = action.writeToEnvironmentFile?.teamsAppId || "TEAMS_APP_ID";
        if (!process.env[teamsAppIdKeyName]) {
          return err(new MissingEnvironmentVariablesError("coordinator", teamsAppIdKeyName));
        }
        break;
      }
    }
    return ok(undefined);
  }

  @hooks([ErrorContextMW({ component: "Coordinator" })])
  async provision(
    ctx: DriverContext,
    inputs: InputsWithProjectPath
  ): Promise<Result<DotenvParseOutput, FxError>> {
    const output: DotenvParseOutput = {};
    if (process.env.APP_NAME_SUFFIX === undefined && process.env.TEAMSFX_ENV) {
      process.env.APP_NAME_SUFFIX = process.env.TEAMSFX_ENV;
      output.APP_NAME_SUFFIX = process.env.TEAMSFX_ENV;
    }
    const folderName = path.parse(ctx.projectPath).name;

    // 1. parse yml
    const templatePath =
      inputs["workflowFilePath"] || pathUtils.getYmlFilePath(ctx.projectPath, inputs.env);
    const maybeProjectModel = await metadataUtil.parse(templatePath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value;

    const workerValidationResult = await workerAgents.validateWorkerAgentGraph({
      projectPath: ctx.projectPath,
      allowMissingRoot: true,
      validateOnlyIfWorkerAgentsConfigured: true,
      signal: ctx.signal,
      resolveAgentFile: async (authoredFile, manifestPath) =>
        getResolvedManifest(authoredFile, manifestPath, ManifestType.TeamsManifest, ctx),
    });
    if (workerValidationResult.isErr()) {
      return err(workerValidationResult.error);
    }
    const workerError = workerAgents.workerValidationError(workerValidationResult.value);
    if (workerError) {
      return err(workerError);
    }

    const cycles = [
      // projectModel.registerApp,
      projectModel.provision,
      // projectModel.configureApp,
    ].filter((c) => c !== undefined) as Lifecycle[];

    if (cycles.length === 0) {
      return err(new LifeCycleUndefinedError("provision"));
    }

    // 2. M365 sign in and tenant check if needed.
    let containsM365 = false;
    let containsAzure = false;
    let containsUpdateAad = false;
    const tenantSwitchCheckActions: string[] = [];
    cycles.forEach((cycle) => {
      cycle.driverDefs?.forEach((def) => {
        if (M365Actions.includes(def.uses)) {
          containsM365 = true;
        } else if (AzureActions.includes(def.uses)) {
          containsAzure = true;
        }
        if (def.uses === "aadApp/update") {
          containsUpdateAad = true;
        }

        if (needTenantCheckActions.includes(def.uses)) {
          tenantSwitchCheckActions.push(def.uses);
        }
      });
    });

    let m365tenantInfo = undefined;
    if (containsM365) {
      const tenantInfoInTokenRes = await provisionUtils.getM365TenantId(ctx.m365TokenProvider);
      if (tenantInfoInTokenRes.isErr()) {
        return err(tenantInfoInTokenRes.error);
      }
      m365tenantInfo = tenantInfoInTokenRes.value;

      const checkM365TenatRes = provisionUtils.ensureM365TenantMatchesV3(
        tenantSwitchCheckActions,
        m365tenantInfo.tenantIdInToken
      );
      if (checkM365TenatRes.isErr()) {
        const msg = getLocalizedString("core.provision.switchAccount");
        const continueItem = getLocalizedString("core.provision.switchAccount.continue");
        const userCofirmRes = await ctx.ui?.showMessage("warn", msg, true, continueItem);
        if (userCofirmRes?.isOk() && userCofirmRes.value === continueItem) {
          await ctx.m365TokenProvider.signout();

          const tenantInfoInTokenRes1 = await provisionUtils.getM365TenantId(ctx.m365TokenProvider);
          if (tenantInfoInTokenRes1.isErr()) {
            return err(tenantInfoInTokenRes1.error);
          }
          m365tenantInfo = tenantInfoInTokenRes1.value;

          const checkM365TenatRes1 = provisionUtils.ensureM365TenantMatchesV3(
            tenantSwitchCheckActions,
            m365tenantInfo.tenantIdInToken
          );

          if (checkM365TenatRes1.isErr()) {
            return err(checkM365TenatRes1.error);
          }
        } else {
          return err(new UserCancelError("coordinator"));
        }
      }
    }

    // We will update targetResourceGroupInfo if creating resource group is needed and create the resource group later after confirming with the user
    let targetResourceGroupInfo: ResourceGroupInfo = {
      createNewResourceGroup: false,
      name: "",
      location: "",
    };

    let resolvedSubscriptionId: string | undefined;
    let resolvedResourceGroupName: string | undefined;
    let azureSubInfo = undefined;
    if (containsAzure) {
      //ensure RESOURCE_SUFFIX
      if (!process.env.RESOURCE_SUFFIX) {
        const suffix = process.env.RESOURCE_SUFFIX || uuid.v4().slice(0, 6);
        process.env.RESOURCE_SUFFIX = suffix;
        output.RESOURCE_SUFFIX = suffix;
      }
      // check whether placeholders are resolved
      let subscriptionUnresolved = false;
      let resourceGroupUnresolved = false;
      for (const cycle of cycles) {
        const unresolvedPlaceHolders = cycle.resolvePlaceholders();
        if (unresolvedPlaceHolders.includes("AZURE_SUBSCRIPTION_ID")) subscriptionUnresolved = true;
        else {
          cycle.driverDefs?.forEach((driver) => {
            const withObj = driver.with as any;
            if (withObj && withObj.subscriptionId && resolvedSubscriptionId === undefined)
              resolvedSubscriptionId = withObj.subscriptionId;
          });
        }
        if (unresolvedPlaceHolders.includes("AZURE_RESOURCE_GROUP_NAME"))
          resourceGroupUnresolved = true;
        else {
          cycle.driverDefs?.forEach((driver) => {
            const withObj = driver.with as any;
            if (withObj && withObj.resourceGroupName && resolvedResourceGroupName === undefined)
              resolvedResourceGroupName = withObj.resourceGroupName;
          });
        }
      }

      // ensure subscription, pop up UI to select if necessary
      if (subscriptionUnresolved) {
        if (inputs["targetSubscriptionId"]) {
          process.env.AZURE_SUBSCRIPTION_ID = inputs["targetSubscriptionId"];
          output.AZURE_SUBSCRIPTION_ID = inputs["targetSubscriptionId"];
        } else {
          const ensureRes = await provisionUtils.ensureSubscription(
            ctx.azureAccountProvider,
            undefined
          );
          if (ensureRes.isErr()) return err(ensureRes.error);
          const subInfo = ensureRes.value;
          if (subInfo && subInfo.subscriptionId) {
            process.env.AZURE_SUBSCRIPTION_ID = subInfo.subscriptionId;
            output.AZURE_SUBSCRIPTION_ID = subInfo.subscriptionId;
          }
        }
        resolvedSubscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
      }
      // ensure resource group
      if (resourceGroupUnresolved) {
        const inputRG = inputs["targetResourceGroupName"];
        const inputLocation = inputs["targetResourceLocationName"];
        if (inputRG && inputLocation) {
          // targetResourceGroupName is from VS inputs, which means create resource group if not exists
          targetResourceGroupInfo.name = inputRG;
          targetResourceGroupInfo.location = inputLocation;
          targetResourceGroupInfo.createNewResourceGroup = true; // create resource group if not exists
        } else {
          const defaultRg = `rg-${convertToAlphanumericOnly(folderName)}${
            process.env.RESOURCE_SUFFIX
          }-${inputs.env as string}`;
          const ensureRes = await provisionUtils.ensureResourceGroup(
            inputs,
            ctx.azureAccountProvider,
            resolvedSubscriptionId!,
            undefined,
            defaultRg
          );
          if (ensureRes.isErr()) return err(ensureRes.error);
          targetResourceGroupInfo = ensureRes.value;
          if (!targetResourceGroupInfo.createNewResourceGroup) {
            process.env.AZURE_RESOURCE_GROUP_NAME = targetResourceGroupInfo.name;
            output.AZURE_RESOURCE_GROUP_NAME = targetResourceGroupInfo.name;
          }
        }
        resolvedResourceGroupName = targetResourceGroupInfo.name;
      }

      // consent user
      await ctx.azureAccountProvider.getIdentityCredentialAsync(true); // make sure login if ensureSubScription() is not called.
      try {
        await ctx.azureAccountProvider.setSubscription(resolvedSubscriptionId!); //make sure sub is correctly set if ensureSubscription() is not called.
      } catch (e) {
        return err(assembleError(e));
      }
      azureSubInfo = await ctx.azureAccountProvider.getSelectedSubscription(false);
      if (!azureSubInfo) {
        return err(new SelectSubscriptionError());
      }
      const consentRes = await provisionUtils.askForProvisionConsentV3(
        ctx,
        m365tenantInfo,
        azureSubInfo,
        inputs.env
      );
      if (consentRes.isErr()) return err(consentRes.error);

      // create resource group if necessary
      if (targetResourceGroupInfo.createNewResourceGroup) {
        const createRgRes = await resourceGroupHelper.createNewResourceGroup(
          targetResourceGroupInfo.name,
          ctx.azureAccountProvider,
          resolvedSubscriptionId!,
          targetResourceGroupInfo.location
        );
        if (createRgRes.isErr()) {
          const error = createRgRes.error;
          if (!(error instanceof ResourceGroupConflictError)) {
            return err(error);
          }
        }
        process.env.AZURE_RESOURCE_GROUP_NAME = targetResourceGroupInfo.name;
        output.AZURE_RESOURCE_GROUP_NAME = targetResourceGroupInfo.name;
      }
    }

    // execute
    const summaryReporter = new SummaryReporter(cycles, ctx.logProvider);
    const steps = cycles.reduce((acc, cur) => acc + cur.driverDefs.length, 0);
    let hasError = false;
    try {
      ctx.progressBar = ctx.ui?.createProgressBar(
        getLocalizedString("core.progress.provision"),
        steps
      );
      await ctx.progressBar?.start();
      const maybeDescription = summaryReporter.getLifecycleDescriptions();
      if (maybeDescription.isErr()) {
        hasError = true;
        return err(maybeDescription.error);
      }
      ctx.logProvider.info(`Executing provision ${EOL}${EOL}${maybeDescription.value}${EOL}`);
      for (const [index, cycle] of cycles.entries()) {
        const execRes = await cycle.execute(ctx);
        summaryReporter.updateLifecycleState(index, execRes);
        const result = this.convertExecuteResult(execRes.result, templatePath);
        merge(output, result[0]);
        if (result[1]) {
          hasError = true;
          inputs.envVars = output;
          return err(result[1]);
        }
      }
    } finally {
      const summary = summaryReporter.getLifecycleSummary(inputs.createdEnvFile);
      ctx.logProvider.info(`Execution summary:${EOL}${EOL}${summary}${EOL}`);
      await ctx.progressBar?.end(!hasError);
    }

    // show provisioned resources
    const msg = getLocalizedString("core.common.LifecycleComplete.provision", steps, steps);
    if (azureSubInfo) {
      const url = getResourceGroupInPortal(
        azureSubInfo.subscriptionId,
        azureSubInfo.tenantId,
        resolvedResourceGroupName
      );
      if (url && ctx.platform !== Platform.CLI) {
        const title = getLocalizedString("core.provision.viewResources");
        ctx.ui?.showMessage("info", msg, false, title).then((result: any) => {
          const userSelected = result.isOk() ? result.value : undefined;
          if (userSelected === title) {
            ctx.ui?.openUrl(url);
          }
        });
        showAadResourceLink(ctx, containsUpdateAad, projectModel, process.env.AAD_APP_CLIENT_ID);
      } else {
        if (url && ctx.platform === Platform.CLI) {
          ctx.ui?.showMessage(
            "info",
            [
              {
                content: `${msg} View the provisioned resources from `,
                color: Colors.BRIGHT_GREEN,
              },
              {
                content: url,
                color: Colors.BRIGHT_CYAN,
              },
            ],
            false
          );
        } else {
          ctx.ui?.showMessage("info", msg, false);
        }
      }
    } else {
      if (ctx.platform === Platform.VS) {
        void ctx.logProvider.info(
          getLocalizedString("core.common.LifecycleComplete.prepareTeamsApp")
        );
      } else {
        void ctx.ui!.showMessage("info", msg, false);
      }
    }
    if (ctx.platform !== Platform.CLI) {
      ctx.logProvider.info(msg);
    }
    return ok(output);
  }

  convertExecuteResult(
    execRes: Result<ExecutionOutput, ExecutionError>,
    templatePath: string
  ): [DotenvParseOutput, FxError | undefined] {
    const output: DotenvParseOutput = {};
    let error = undefined;
    if (execRes.isErr()) {
      const execError = execRes.error;
      if (execError.kind === "Failure") {
        error = execError.error;
      } else {
        const partialOutput = execError.env;
        const newOutput = envUtil.map2object(partialOutput);
        merge(output, newOutput);
        const reason = execError.reason;
        if (reason.kind === "DriverError") {
          error = reason.error;
        } else if (reason.kind === "UnresolvedPlaceholders") {
          const placeholders = reason.unresolvedPlaceHolders?.join(",") || "";
          error = new MissingEnvironmentVariablesError(
            camelCase(reason.failedDriver.uses),
            placeholders,
            templatePath
          );
        }
      }
    } else {
      const newOutput = envUtil.map2object(execRes.value);
      merge(output, newOutput);
    }
    return [output, error];
  }

  @hooks([ErrorContextMW({ component: "Coordinator" })])
  async deploy(
    ctx: DriverContext,
    inputs: InputsWithProjectPath
  ): Promise<Result<DotenvParseOutput, FxError>> {
    const output: DotenvParseOutput = {};
    const templatePath =
      inputs["workflowFilePath"] || pathUtils.getYmlFilePath(ctx.projectPath, inputs.env);
    const maybeProjectModel = await metadataUtil.parse(templatePath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value;
    if (projectModel.deploy) {
      if (
        inputs.env !== environmentNameManager.getLocalEnvName() &&
        inputs.env !== environmentNameManager.getTestToolEnvName() &&
        inputs.env !== environmentNameManager.getPlaygroundEnvName() &&
        inputs.env !== environmentNameManager.getSandboxEnvName()
      ) {
        const consent = await deployUtils.askForDeployConsentV3(ctx);
        if (consent.isErr()) {
          return err(consent.error);
        }
      }
      const summaryReporter = new SummaryReporter([projectModel.deploy], ctx.logProvider);
      let hasError = false;
      try {
        const steps = projectModel.deploy.driverDefs.length;
        if (inputs.platform !== Platform.CLI) {
          ctx.progressBar = ctx.ui?.createProgressBar(
            getLocalizedString("core.progress.deploy"),
            steps
          );
          await ctx.progressBar?.start();
        }
        const maybeDescription = summaryReporter.getLifecycleDescriptions();
        if (maybeDescription.isErr()) {
          return err(maybeDescription.error);
        }
        ctx.logProvider.info(`Executing deploy ${EOL}${EOL}${maybeDescription.value}${EOL}`);
        const execRes = await projectModel.deploy.execute(ctx);
        summaryReporter.updateLifecycleState(0, execRes);
        const result = this.convertExecuteResult(execRes.result, templatePath);
        merge(output, result[0]);
        if (result[1]) {
          hasError = true;
          inputs.envVars = output;
          return err(result[1]);
        }

        // show message box after deploy
        const botTroubleShootMsg = getBotTroubleShootMessage(false);
        const msg =
          getLocalizedString("core.common.LifecycleComplete.deploy", steps, steps) +
          botTroubleShootMsg.textForLogging;
        if (ctx.platform !== Platform.VS) {
          ctx.ui?.showMessage("info", msg, false);
        }
      } finally {
        const summary = summaryReporter.getLifecycleSummary();
        ctx.logProvider.info(`Execution summary:${EOL}${EOL}${summary}${EOL}`);
        if (inputs.platform !== Platform.CLI) {
          await ctx.progressBar?.end(!hasError);
        }
      }
    } else {
      return err(new LifeCycleUndefinedError("deploy"));
    }
    return ok(output);
  }

  @hooks([ErrorContextMW({ component: "Coordinator" })])
  async publish(
    ctx: DriverContext,
    inputs: InputsWithProjectPath
  ): Promise<Result<DotenvParseOutput, FxError>> {
    const output: DotenvParseOutput = {};
    const templatePath = pathUtils.getYmlFilePath(ctx.projectPath, inputs.env) as string;
    const maybeProjectModel = await metadataUtil.parse(templatePath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value;
    let hasError = false;
    if (projectModel.publish) {
      const summaryReporter = new SummaryReporter([projectModel.publish], ctx.logProvider);
      try {
        const steps = projectModel.publish.driverDefs.length;
        ctx.progressBar = ctx.ui?.createProgressBar(
          getLocalizedString("core.progress.publish"),
          steps
        );
        await ctx.progressBar?.start();
        const maybeDescription = summaryReporter.getLifecycleDescriptions();
        if (maybeDescription.isErr()) {
          hasError = true;
          return err(maybeDescription.error);
        }
        ctx.logProvider.info(`Executing publish ${EOL}${EOL}${maybeDescription.value}${EOL}`);

        const execRes = await projectModel.publish.execute(ctx);
        const result = this.convertExecuteResult(execRes.result, templatePath);
        merge(output, result[0]);
        summaryReporter.updateLifecycleState(0, execRes);
        if (result[1]) {
          hasError = true;
          inputs.envVars = output;
          return err(result[1]);
        } else {
          const msg = getLocalizedString("core.common.LifecycleComplete.publish", steps, steps);
          const adminPortal = getLocalizedString("plugins.appstudio.adminPortal");
          const isCopilotAgentPublish = projectModel.publish.driverDefs.some(
            (def) => def.uses === "copilotAgent/publish"
          );
          const portalUrl = isCopilotAgentPublish
            ? Constants.MICROSOFT_ADMIN_CENTER
            : Constants.TEAMS_ADMIN_PORTAL;
          if (ctx.platform !== Platform.CLI) {
            ctx.ui?.showMessage("info", msg, false, adminPortal).then((value) => {
              if (value.isOk() && value.value === adminPortal) {
                void ctx.ui!.openUrl(portalUrl);
              }
            });
          } else {
            ctx.ui?.showMessage("info", msg, false);
          }
        }
      } finally {
        const summary = summaryReporter.getLifecycleSummary();
        ctx.logProvider.info(`Execution summary:${EOL}${EOL}${summary}${EOL}`);
        await ctx.progressBar?.end(!hasError);
      }
    } else {
      return err(new LifeCycleUndefinedError("publish"));
    }
    return ok(output);
  }

  // @hooks([ErrorContextMW({ component: "Coordinator" })])
  // async share(
  //   ctx: DriverContext,
  //   inputs: InputsWithProjectPath
  // ): Promise<Result<DotenvParseOutput, FxError>> {
  //   const output: DotenvParseOutput = {};
  //   const templatePath = pathUtils.getYmlFilePath(ctx.projectPath, inputs.env) as string;
  //   const maybeProjectModel = await metadataUtil.parse(templatePath);
  //   if (maybeProjectModel.isErr()) {
  //     return err(maybeProjectModel.error);
  //   }
  //   const projectModel = maybeProjectModel.value;
  //   let hasError = false;
  //   if (projectModel.share) {
  //     const summaryReporter = new SummaryReporter([projectModel.share], ctx.logProvider);
  //     try {
  //       const steps = projectModel.share.driverDefs.length;
  //       ctx.progressBar = ctx.ui?.createProgressBar(
  //         getLocalizedString("core.progress.share"),
  //         steps
  //       );
  //       await ctx.progressBar?.start();
  //       const maybeDescription = summaryReporter.getLifecycleDescriptions();
  //       if (maybeDescription.isErr()) {
  //         hasError = true;
  //         return err(maybeDescription.error);
  //       }
  //       ctx.logProvider.info(`Executing share ${EOL}${EOL}${maybeDescription.value}${EOL}`);

  //       const execRes = await projectModel.share.execute(ctx);
  //       const result = this.convertExecuteResult(execRes.result, templatePath);
  //       merge(output, result[0]);
  //       summaryReporter.updateLifecycleState(0, execRes);
  //       if (result[1]) {
  //         hasError = true;
  //         inputs.envVars = output;
  //         return err(result[1]);
  //       } else {
  //         const msg = getLocalizedString("core.common.LifecycleComplete.share", steps, steps);
  //         ctx.ui?.showMessage("info", msg, false);
  //       }
  //     } finally {
  //       const summary = summaryReporter.getLifecycleSummary();
  //       ctx.logProvider.info(`Execution summary:${EOL}${EOL}${summary}${EOL}`);
  //       await ctx.progressBar?.end(!hasError);
  //     }
  //   } else {
  //     return err(new LifeCycleUndefinedError("share"));
  //   }
  //   return ok(output);
  // }

  @hooks([ErrorContextMW({ component: "Coordinator" })])
  async publishInDeveloperPortal(
    ctx: Context,
    inputs: InputsWithProjectPath
  ): Promise<Result<undefined, FxError>> {
    // update teams app
    if (!ctx.tokenProvider) {
      return err(new InputValidationError("tokenProvider", "undefined"));
    }
    if (!inputs[QuestionNames.AppPackagePath]) {
      return err(new InputValidationError("appPackagePath", "undefined"));
    }
    const updateRes = await appStudio.updateTeamsAppV3ForPublish(ctx, inputs);

    if (updateRes.isErr()) {
      return err(updateRes.error);
    }
    let loginHint = "";
    const accountRes = await ctx.tokenProvider.m365TokenProvider.getJsonObject({
      scopes: AppStudioScopes(),
    });
    if (accountRes.isOk()) {
      loginHint = accountRes.value.unique_name as string;
    }
    await ctx.userInteraction.openUrl(
      `https://dev.teams.cloud.microsoft/apps/${
        updateRes.value as string
      }/distributions/app-catalog?login_hint=${loginHint}&referrer=teamstoolkit_${
        inputs.platform
      }&client-preference=classic`
    );
    return ok(undefined);
  }
}

export const coordinator = new Coordinator();

export function showAadResourceLink(
  ctx: DriverContext,
  isAadUpdateAction: boolean,
  projectModel: ProjectModel,
  clientId?: string
): void {
  const gcPermission = "ExternalConnection.ReadWrite.OwnedBy";
  if (
    isAadUpdateAction &&
    clientId &&
    projectModel.aadPermission?.graphPermission.roles.includes(gcPermission)
  ) {
    const aadUrl = `https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${clientId}/isMSAApp~/false`;
    const aadMsg =
      "You need to grant tenant-wide admin consent to the application in Entra ID. Click the button to provide consent.";
    const aadTitle = "View provisioned Entra ID";
    ctx.ui?.showMessage("info", aadMsg, false, aadTitle).then((result: any) => {
      const userSelected = result.isOk() ? result.value : undefined;
      if (userSelected === aadTitle) {
        openUrl(ctx, aadUrl);
      }
    });
    ctx.logProvider.info(
      `You need to grant tenant-wide admin consent to the application in Entra ID. Use the link to provide the consent. ${aadUrl}`
    );
  }
  return;
}

export function openUrl(ctx: DriverContext, url: string): void {
  ctx.ui?.openUrl(url);
}

interface BotTroubleShootMessage {
  troubleShootLink: string;
  textForLogging: string;
  textForMsgBox: string;
  textForActionButton: string;
}

function getBotTroubleShootMessage(isBot: boolean): BotTroubleShootMessage {
  const botTroubleShootLink =
    "https://aka.ms/teamsfx-bot-help#how-can-i-troubleshoot-issues-when-teams-bot-isnt-responding-on-azure";
  const botTroubleShootDesc = getLocalizedString("core.deploy.botTroubleShoot");
  const botTroubleShootLearnMore = getLocalizedString("core.deploy.botTroubleShoot.learnMore");
  const botTroubleShootMsg = `${botTroubleShootDesc} ${botTroubleShootLearnMore}: ${botTroubleShootLink}.`;

  return {
    troubleShootLink: botTroubleShootLink,
    textForLogging: isBot ? botTroubleShootMsg : "",
    textForMsgBox: botTroubleShootDesc,
    textForActionButton: botTroubleShootLearnMore,
  } as BotTroubleShootMessage;
}

function downloadSampleHook(sampleId: string, sampleAppPath: string): void {
  // A temporary solution to aundefined duplicate componentId
  if (sampleId === "todo-list-SPFx") {
    const originalId = "c314487b-f51c-474d-823e-a2c3ec82b1ff";
    const componentId = uuid.v4();
    void glob(`${sampleAppPath}/**/*.json`, { nodir: true, dot: true }).then((files) =>
      Promise.all(
        files.map(async (file) => {
          let content = (await fs.readFile(file)).toString();
          const reg = new RegExp(originalId, "g");
          content = content.replace(reg, componentId);
          await fs.writeFile(file, content);
        })
      )
    );
  }
}
