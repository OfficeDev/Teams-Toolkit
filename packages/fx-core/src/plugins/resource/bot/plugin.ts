// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  PluginContext,
  Result,
  Stage,
  QTreeNode,
  FxError,
  Func,
  ArchiveFolderName,
  ArchiveLogFileName,
  AppPackageFolderName,
  ok,
} from "@microsoft/teamsfx-api";

import { AADRegistration } from "./aadRegistration";
import * as factory from "./clientFactory";
import * as utils from "./utils/common";
import { createQuestions } from "./questions";
import { LanguageStrategy } from "./languageStrategy";
import { Messages } from "./resources/messages";
import { FxResult, FxBotPluginResultFactory as ResultFactory } from "./result";
import {
  ProgressBarConstants,
  DeployConfigs,
  FolderNames,
  QuestionNames,
  WebAppConstants,
  TemplateProjectsConstants,
  AuthEnvNames,
  AuthValues,
  MaxLengths,
  Links,
  IdentityConstants,
  AzureConstants,
  PathInfo,
  BotArmOutput,
  Alias,
} from "./constants";
import { WayToRegisterBot } from "./enums/wayToRegisterBot";
import { getZipDeployEndpoint } from "./utils/zipDeploy";

import * as appService from "@azure/arm-appservice";
import * as fs from "fs-extra";
import { CommonStrings, PluginBot, ConfigNames, PluginLocalDebug } from "./resources/strings";
import { DialogUtils } from "./utils/dialog";
import {
  CheckThrowSomethingMissing,
  MigrateV1ProjectError,
  PackDirExistenceError,
  PreconditionError,
  SomethingMissingError,
  UserInputsError,
  ExtractZipError,
} from "./errors";
import { TeamsBotConfig } from "./configs/teamsBotConfig";
import AdmZip from "adm-zip";
import { ProgressBarFactory } from "./progressBars";
import { PluginActRoles } from "./enums/pluginActRoles";
import { ResourceNameFactory } from "./utils/resourceNameFactory";
import { AppStudio } from "./appStudio/appStudio";
import { IBotRegistration } from "./appStudio/interfaces/IBotRegistration";
import { Logger } from "./logger";
import { DeployMgr } from "./deployMgr";
import { BotAuthCredential } from "./botAuthCredential";
import { AzureOperations } from "./azureOps";
import { TokenCredentialsBase } from "@azure/ms-rest-nodeauth";
import path from "path";
import { getTemplatesFolder } from "../../..";
import { ScaffoldArmTemplateResult } from "../../../common/armInterface";
import { Bicep, ConstantString } from "../../../common/constants";
import { copyFiles, generateBicepFiles, isArmSupportEnabled } from "../../../common";
import { AzureSolutionSettings } from "@microsoft/teamsfx-api";
import { getArmOutput } from "../utils4v2";

export class TeamsBotImpl {
  // Made config plubic, because expect the upper layer to fill inputs.
  public config: TeamsBotConfig = new TeamsBotConfig();
  private ctx?: PluginContext;

  public async getQuestions(
    stage: Stage,
    ctx: PluginContext
  ): Promise<Result<QTreeNode | undefined, FxError>> {
    switch (stage) {
      case Stage.create: {
        return ResultFactory.Success(createQuestions);
      }
    }

    return ResultFactory.Success(
      new QTreeNode({
        type: "group",
      })
    );
  }

  private async getAzureAccountCredenial(): Promise<TokenCredentialsBase> {
    const serviceClientCredentials =
      await this.ctx?.azureAccountProvider?.getAccountCredentialAsync();
    if (!serviceClientCredentials) {
      throw new PreconditionError(Messages.FailToGetAzureCreds, [Messages.TryLoginAzure]);
    }
    return serviceClientCredentials;
  }

  public async preScaffold(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.PreScaffoldingBot);

    const rawWay = this.ctx.answers![QuestionNames.WAY_TO_REGISTER_BOT];

    if (!rawWay) {
      throw new UserInputsError(QuestionNames.WAY_TO_REGISTER_BOT, rawWay as string);
    }

    const pickedWay: WayToRegisterBot = rawWay as WayToRegisterBot;

    let botRegistration = {
      botId: "",
      botPassword: "",
    };

    if (pickedWay === WayToRegisterBot.ReuseExisting) {
      botRegistration = await this.reuseExistingBotRegistration();

      this.config.scaffold.botId = botRegistration.botId;
      this.config.scaffold.botPassword = botRegistration.botPassword;
    }

    this.config.scaffold.wayToRegisterBot = pickedWay;

    this.config.saveConfigIntoContext(context);

    return ResultFactory.Success();
  }

  public async scaffold(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.ScaffoldingBot);

    const handler = await ProgressBarFactory.newProgressBar(
      ProgressBarConstants.SCAFFOLD_TITLE,
      ProgressBarConstants.SCAFFOLD_STEPS_NUM,
      this.ctx
    );
    await handler?.start(ProgressBarConstants.SCAFFOLD_STEP_START);

    // 1. Copy the corresponding template project into target directory.
    // Get group name.
    let group_name = TemplateProjectsConstants.GROUP_NAME_BOT;
    if (!this.config.actRoles || this.config.actRoles.length === 0) {
      throw new SomethingMissingError("act roles");
    }

    const hasBot = this.config.actRoles.includes(PluginActRoles.Bot);
    const hasMsgExt = this.config.actRoles.includes(PluginActRoles.MessageExtension);
    if (hasBot && hasMsgExt) {
      group_name = TemplateProjectsConstants.GROUP_NAME_BOT_MSGEXT;
    } else if (hasBot) {
      group_name = TemplateProjectsConstants.GROUP_NAME_BOT;
    } else {
      group_name = TemplateProjectsConstants.GROUP_NAME_MSGEXT;
    }

    await handler?.next(ProgressBarConstants.SCAFFOLD_STEP_FETCH_ZIP);
    const zipContent: AdmZip = await LanguageStrategy.getTemplateProjectZip(
      this.config.scaffold.programmingLanguage!,
      group_name
    );

    await handler?.next(ProgressBarConstants.SCAFFOLD_STEP_UNZIP);
    try {
      zipContent.extractAllTo(this.config.scaffold.workingDir!, true);
    } catch (err) {
      throw new ExtractZipError(this.config.scaffold.workingDir!, err);
    }

    this.config.saveConfigIntoContext(context);
    Logger.info(Messages.SuccessfullyScaffoldedBot);

    return ResultFactory.Success();
  }

  public async preProvision(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.PreProvisioningBot);

    // Preconditions checking.
    CheckThrowSomethingMissing(
      ConfigNames.PROGRAMMING_LANGUAGE,
      this.config.scaffold.programmingLanguage
    );

    if (!isArmSupportEnabled()) {
      // CheckThrowSomethingMissing(ConfigNames.GRAPH_TOKEN, this.config.scaffold.graphToken);
      CheckThrowSomethingMissing(ConfigNames.SUBSCRIPTION_ID, this.config.provision.subscriptionId);
      CheckThrowSomethingMissing(ConfigNames.RESOURCE_GROUP, this.config.provision.resourceGroup);
      CheckThrowSomethingMissing(ConfigNames.LOCATION, this.config.provision.location);
      CheckThrowSomethingMissing(ConfigNames.SKU_NAME, this.config.provision.skuName);
      CheckThrowSomethingMissing(CommonStrings.SHORT_APP_NAME, this.ctx.projectSettings?.appName);

      if (!this.config.provision.siteName) {
        this.config.provision.siteName = ResourceNameFactory.createCommonName(
          this.config.resourceNameSuffix,
          this.ctx.projectSettings?.appName,
          MaxLengths.WEB_APP_SITE_NAME
        );
        Logger.debug(`Site name generated to use is ${this.config.provision.siteName}.`);
      }
    }

    this.config.saveConfigIntoContext(context);

    return ResultFactory.Success();
  }

  public async provision(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.ProvisioningBot);

    // Create and register progress bar for cleanup.
    const handler = await ProgressBarFactory.newProgressBar(
      ProgressBarConstants.PROVISION_TITLE,
      ProgressBarConstants.PROVISION_STEPS_NUM,
      this.ctx
    );
    await handler?.start(ProgressBarConstants.PROVISION_STEP_START);

    // 0. Check Resource Provider
    const azureCredential = await this.getAzureAccountCredenial();
    const rpClient = factory.createResourceProviderClient(
      azureCredential,
      this.config.provision.subscriptionId!
    );
    await factory.ensureResourceProvider(rpClient, AzureConstants.requiredResourceProviders);

    // 1. Do bot registration.
    if (this.config.scaffold.wayToRegisterBot === WayToRegisterBot.CreateNew) {
      await handler?.next(ProgressBarConstants.PROVISION_STEP_BOT_REG);
      const botAuthCreds = await this.createOrGetBotAppRegistration();

      if (!isArmSupportEnabled()) {
        await this.provisionBotServiceOnAzure(botAuthCreds);
      }
    }

    if (!isArmSupportEnabled()) {
      await handler?.next(ProgressBarConstants.PROVISION_STEP_WEB_APP);
      // 2. Provision azure web app for hosting bot project.
      await this.provisionWebApp();

      this.config.saveConfigIntoContext(context);
      Logger.info(Messages.SuccessfullyProvisionedBot);
    }

    return ResultFactory.Success();
  }

  public async generateArmTemplates(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.GeneratingArmTemplatesBot);

    const bicepTemplateDir = path.join(getTemplatesFolder(), PathInfo.BicepTemplateRelativeDir);

    const selectedPlugins = (this.ctx.projectSettings?.solutionSettings as AzureSolutionSettings)
      .activeResourcePlugins;
    const handleBarsContext = {
      Plugins: selectedPlugins,
    };

    const provisionModuleTemplateFilePath = path.join(
      bicepTemplateDir,
      PathInfo.provisionModuleTemplateFileName
    );
    const provisionModuleContentResult = await generateBicepFiles(
      provisionModuleTemplateFilePath,
      handleBarsContext
    );
    if (provisionModuleContentResult.isErr()) {
      throw provisionModuleContentResult.error;
    }
    const configurationModuleTemplateFilePath = path.join(
      bicepTemplateDir,
      PathInfo.configurationModuleTemplateFileName
    );
    const configurationModuleContentResult = await generateBicepFiles(
      configurationModuleTemplateFilePath,
      handleBarsContext
    );
    if (configurationModuleContentResult.isErr()) {
      throw configurationModuleContentResult.error;
    }

    const inputParameterOrchestrationFilePath = path.join(
      bicepTemplateDir,
      Bicep.ParameterOrchestrationFileName
    );
    const moduleOrchestrationFilePath = path.join(
      bicepTemplateDir,
      Bicep.ModuleOrchestrationFileName
    );
    const outputOrchestrationFilePath = path.join(
      bicepTemplateDir,
      Bicep.OutputOrchestrationFileName
    );
    const parameterFilePath = path.join(bicepTemplateDir, Bicep.ParameterFileName);

    const result: ScaffoldArmTemplateResult = {
      Modules: {
        botProvision: {
          Content: provisionModuleContentResult.value,
        },
        botConfiguration: {
          Content: configurationModuleContentResult.value,
        },
      },
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
        ModuleTemplate: {
          Content: await fs.readFile(moduleOrchestrationFilePath, ConstantString.UTF8Encoding),
        },
        OutputTemplate: {
          Content: await fs.readFile(outputOrchestrationFilePath, ConstantString.UTF8Encoding),
        },
      },
    };

    Logger.info(Messages.SuccessfullyGenerateArmTemplatesBot);
    return ResultFactory.Success(result);
  }

  private async provisionWebApp() {
    CheckThrowSomethingMissing(CommonStrings.SHORT_APP_NAME, this.ctx?.projectSettings?.appName);

    const serviceClientCredentials = await this.getAzureAccountCredenial();

    // Suppose we get creds and subs from context.
    const webSiteMgmtClient = factory.createWebSiteMgmtClient(
      serviceClientCredentials,
      this.config.provision.subscriptionId!
    );

    // 1. Provsion app service plan.
    const appServicePlanName =
      this.config.provision.appServicePlan ??
      ResourceNameFactory.createCommonName(
        this.config.resourceNameSuffix,
        this.ctx?.projectSettings?.appName,
        MaxLengths.APP_SERVICE_PLAN_NAME
      );
    Logger.info(Messages.ProvisioningAzureAppServicePlan);
    await AzureOperations.CreateOrUpdateAppServicePlan(
      webSiteMgmtClient,
      this.config.provision.resourceGroup!,
      appServicePlanName,
      utils.generateAppServicePlanConfig(
        this.config.provision.location!,
        this.config.provision.skuName!
      )
    );
    Logger.info(Messages.SuccessfullyProvisionedAzureAppServicePlan);

    // 2. Provision web app.
    const siteEnvelope: appService.WebSiteManagementModels.Site = LanguageStrategy.getSiteEnvelope(
      this.config.scaffold.programmingLanguage!,
      appServicePlanName,
      this.config.provision.location!
    );

    Logger.info(Messages.ProvisioningAzureWebApp);
    const webappResponse = await AzureOperations.CreateOrUpdateAzureWebApp(
      webSiteMgmtClient,
      this.config.provision.resourceGroup!,
      this.config.provision.siteName!,
      siteEnvelope
    );
    Logger.info(Messages.SuccessfullyProvisionedAzureWebApp);

    if (!this.config.provision.siteEndpoint) {
      this.config.provision.siteEndpoint = `${CommonStrings.HTTPS_PREFIX}${webappResponse.defaultHostName}`;
    }

    if (!this.config.provision.appServicePlan) {
      this.config.provision.appServicePlan = appServicePlanName;
    }

    // Update config for manifest.json
    this.ctx!.config.set(
      PluginBot.VALID_DOMAIN,
      `${this.config.provision.siteName}.${WebAppConstants.WEB_APP_SITE_DOMAIN}`
    );
  }

  public async postProvision(context: PluginContext): Promise<FxResult> {
    Logger.info(Messages.PostProvisioningStart);

    this.ctx = context;
    await this.config.restoreConfigFromContext(context);

    if (isArmSupportEnabled()) {
      this.config.provision.validDomain = getArmOutput(context, BotArmOutput.Domain) as string;
      this.config.provision.appServicePlan = getArmOutput(
        context,
        BotArmOutput.AppServicePlanName
      ) as string;
      this.config.provision.botChannelRegName = getArmOutput(
        context,
        BotArmOutput.BotServiceName
      ) as string;
      this.config.provision.siteEndpoint = getArmOutput(
        context,
        BotArmOutput.WebAppEndpoint
      ) as string;
      this.config.provision.skuName = getArmOutput(context, BotArmOutput.WebAppSKU) as string;
      this.config.provision.siteName = getArmOutput(context, BotArmOutput.WebAppName) as string;
    } else {
      // 1. Get required config items from other plugins.
      // 2. Update bot hosting env"s app settings.
      const botId = this.config.scaffold.botId;
      const botPassword = this.config.scaffold.botPassword;
      const teamsAppClientId = this.config.teamsAppClientId;
      const teamsAppClientSecret = this.config.teamsAppClientSecret;
      const teamsAppTenant = this.config.teamsAppTenant;
      const applicationIdUris = this.config.applicationIdUris;
      const siteEndpoint = this.config.provision.siteEndpoint;

      CheckThrowSomethingMissing(ConfigNames.BOT_ID, botId);
      CheckThrowSomethingMissing(ConfigNames.BOT_PASSWORD, botPassword);
      CheckThrowSomethingMissing(ConfigNames.AUTH_CLIENT_ID, teamsAppClientId);
      CheckThrowSomethingMissing(ConfigNames.AUTH_CLIENT_SECRET, teamsAppClientSecret);
      CheckThrowSomethingMissing(ConfigNames.AUTH_TENANT, teamsAppTenant);
      CheckThrowSomethingMissing(ConfigNames.AUTH_APPLICATION_ID_URIS, applicationIdUris);
      CheckThrowSomethingMissing(ConfigNames.SITE_ENDPOINT, siteEndpoint);

      const serviceClientCredentials = await this.getAzureAccountCredenial();

      const webSiteMgmtClient = factory.createWebSiteMgmtClient(
        serviceClientCredentials,
        this.config.provision.subscriptionId!
      );

      const appSettings = [
        { name: AuthEnvNames.BOT_ID, value: botId },
        { name: AuthEnvNames.BOT_PASSWORD, value: botPassword },
        { name: AuthEnvNames.M365_CLIENT_ID, value: teamsAppClientId },
        { name: AuthEnvNames.M365_CLIENT_SECRET, value: teamsAppClientSecret },
        { name: AuthEnvNames.M365_TENANT_ID, value: teamsAppTenant },
        { name: AuthEnvNames.M365_AUTHORITY_HOST, value: AuthValues.M365_AUTHORITY_HOST },
        {
          name: AuthEnvNames.INITIATE_LOGIN_ENDPOINT,
          value: `${this.config.provision.siteEndpoint}${CommonStrings.AUTH_LOGIN_URI_SUFFIX}`,
        },
        { name: AuthEnvNames.M365_APPLICATION_ID_URI, value: applicationIdUris },
      ];

      if (this.config.provision.sqlEndpoint) {
        appSettings.push({
          name: AuthEnvNames.SQL_ENDPOINT,
          value: this.config.provision.sqlEndpoint,
        });
      }
      if (this.config.provision.sqlDatabaseName) {
        appSettings.push({
          name: AuthEnvNames.SQL_DATABASE_NAME,
          value: this.config.provision.sqlDatabaseName,
        });
      }
      if (this.config.provision.sqlUserName) {
        appSettings.push({
          name: AuthEnvNames.SQL_USER_NAME,
          value: this.config.provision.sqlUserName,
        });
      }
      if (this.config.provision.sqlPassword) {
        appSettings.push({
          name: AuthEnvNames.SQL_PASSWORD,
          value: this.config.provision.sqlPassword,
        });
      }
      if (this.config.provision.identityId) {
        appSettings.push({
          name: AuthEnvNames.IDENTITY_ID,
          value: this.config.provision.identityId,
        });
      }
      if (this.config.provision.functionEndpoint) {
        appSettings.push({
          name: AuthEnvNames.API_ENDPOINT,
          value: this.config.provision.functionEndpoint,
        });
      }

      const siteEnvelope: appService.WebSiteManagementModels.Site =
        LanguageStrategy.getSiteEnvelope(
          this.config.scaffold.programmingLanguage!,
          this.config.provision.appServicePlan!,
          this.config.provision.location!,
          appSettings
        );

      if (this.config.provision.identityName) {
        siteEnvelope.identity = {
          type: IdentityConstants.IDENTITY_TYPE_USER_ASSIGNED,
          userAssignedIdentities: {
            [this.config.provision.identityName]: {},
          },
        };
      }

      Logger.info(Messages.UpdatingAzureWebAppSettings);
      await AzureOperations.CreateOrUpdateAzureWebApp(
        webSiteMgmtClient,
        this.config.provision.resourceGroup!,
        this.config.provision.siteName!,
        siteEnvelope,
        true
      );
      Logger.info(Messages.SuccessfullyUpdatedAzureWebAppSettings);

      // 3. Update message endpoint for bot registration.
      switch (this.config.scaffold.wayToRegisterBot) {
        case WayToRegisterBot.CreateNew: {
          await this.updateMessageEndpointOnAzure(
            `${this.config.provision.siteEndpoint}${CommonStrings.MESSAGE_ENDPOINT_SUFFIX}`
          );
          break;
        }
        case WayToRegisterBot.ReuseExisting: {
          // Remind end developers to update message endpoint manually.
          await DialogUtils.showAndHelp(
            context,
            Messages.RemindUsersToUpdateMessageEndpoint(
              `${this.config.provision.siteEndpoint}${CommonStrings.MESSAGE_ENDPOINT_SUFFIX}`
            ),
            Links.UPDATE_MESSAGE_ENDPOINT
          );
          Logger.info(
            Messages.RemindUsersToUpdateMessageEndpoint(
              `${this.config.provision.siteEndpoint}${CommonStrings.MESSAGE_ENDPOINT_SUFFIX}`
            )
          );
          break;
        }
      }
    }

    this.config.saveConfigIntoContext(context);

    return ResultFactory.Success();
  }

  public async preDeploy(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.PreDeployingBot);

    // Preconditions checking.
    const packDir = this.config.scaffold.workingDir!;

    const packDirExisted = await fs.pathExists(packDir);
    if (!packDirExisted) {
      throw new PackDirExistenceError();
    }

    CheckThrowSomethingMissing(ConfigNames.SITE_ENDPOINT, this.config.provision.siteEndpoint);
    CheckThrowSomethingMissing(
      ConfigNames.PROGRAMMING_LANGUAGE,
      this.config.scaffold.programmingLanguage
    );
    CheckThrowSomethingMissing(ConfigNames.SUBSCRIPTION_ID, this.config.provision.subscriptionId);
    CheckThrowSomethingMissing(ConfigNames.RESOURCE_GROUP, this.config.provision.resourceGroup);

    this.config.saveConfigIntoContext(context);

    return ResultFactory.Success();
  }

  public async deploy(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);
    Logger.info(Messages.DeployingBot);

    if (!this.config.scaffold.workingDir) {
      throw new PreconditionError(Messages.WorkingDirIsMissing, []);
    }

    const deployTimeCandidate = Date.now();
    const deployMgr = new DeployMgr(this.config.scaffold.workingDir);
    await deployMgr.init();
    const needsRedeploy = await deployMgr.needsToRedeploy();
    if (!needsRedeploy) {
      Logger.debug(Messages.SkipDeployNoUpdates);
      return ResultFactory.Success();
    }

    const handler = await ProgressBarFactory.newProgressBar(
      ProgressBarConstants.DEPLOY_TITLE,
      ProgressBarConstants.DEPLOY_STEPS_NUM,
      this.ctx
    );

    await handler?.start(ProgressBarConstants.DEPLOY_STEP_START);

    const packDir = this.config.scaffold.workingDir;

    await handler?.next(ProgressBarConstants.DEPLOY_STEP_NPM_INSTALL);

    await LanguageStrategy.localBuild(
      this.config.scaffold.programmingLanguage!,
      packDir,
      this.config.deploy.unPackFlag === "true" ? true : false
    );

    await handler?.next(ProgressBarConstants.DEPLOY_STEP_ZIP_FOLDER);
    const zipBuffer = utils.zipAFolder(packDir, DeployConfigs.UN_PACK_DIRS, [
      `${FolderNames.NODE_MODULES}/${FolderNames.KEYTAR}`,
    ]);

    // 2.2 Retrieve publishing credentials.
    let publishingUserName = "";
    let publishingPassword: string | undefined = undefined;

    const serviceClientCredentials = await this.getAzureAccountCredenial();
    const webSiteMgmtClient = new appService.WebSiteManagementClient(
      serviceClientCredentials,
      this.config.provision.subscriptionId!
    );
    const listResponse = await AzureOperations.ListPublishingCredentials(
      webSiteMgmtClient,
      this.config.provision.resourceGroup!,
      this.config.provision.siteName!
    );

    publishingUserName = listResponse.publishingUserName;
    publishingPassword = listResponse.publishingPassword;

    const encryptedCreds: string = utils.toBase64(`${publishingUserName}:${publishingPassword}`);

    const config = {
      headers: {
        Authorization: `Basic ${encryptedCreds}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    };

    const zipDeployEndpoint: string = getZipDeployEndpoint(this.config.provision.siteName!);
    await handler?.next(ProgressBarConstants.DEPLOY_STEP_ZIP_DEPLOY);
    await AzureOperations.ZipDeployPackage(zipDeployEndpoint, zipBuffer, config);

    await deployMgr.updateLastDeployTime(deployTimeCandidate);

    this.config.saveConfigIntoContext(context);
    Logger.info(Messages.SuccessfullyDeployedBot);

    return ResultFactory.Success();
  }

  public async localDebug(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);

    const handler = await ProgressBarFactory.newProgressBar(
      ProgressBarConstants.LOCAL_DEBUG_TITLE,
      ProgressBarConstants.LOCAL_DEBUG_STEPS_NUM,
      this.ctx
    );

    await handler?.start(ProgressBarConstants.LOCAL_DEBUG_STEP_START);

    await handler?.next(ProgressBarConstants.LOCAL_DEBUG_STEP_BOT_REG);
    await this.createNewBotRegistrationOnAppStudio();

    this.config.saveConfigIntoContext(context);

    return ResultFactory.Success();
  }

  public async postLocalDebug(context: PluginContext): Promise<FxResult> {
    this.ctx = context;
    await this.config.restoreConfigFromContext(context);

    CheckThrowSomethingMissing(ConfigNames.LOCAL_ENDPOINT, this.config.localDebug.localEndpoint);

    await this.updateMessageEndpointOnAppStudio(
      `${this.config.localDebug.localEndpoint}${CommonStrings.MESSAGE_ENDPOINT_SUFFIX}`
    );

    this.config.saveConfigIntoContext(context);

    return ResultFactory.Success();
  }

  public async migrateV1Project(ctx: PluginContext): Promise<FxResult> {
    try {
      Logger.info(Messages.StartMigrateV1Project(Alias.TEAMS_BOT_PLUGIN));
      const handler = await ProgressBarFactory.newProgressBar(
        ProgressBarConstants.MIGRATE_V1_PROJECT_TITLE,
        ProgressBarConstants.MIGRATE_V1_PROJECT_STEPS_NUM,
        ctx
      );
      await handler?.start();
      await handler?.next(ProgressBarConstants.MIGRATE_V1_PROJECT_STEP_MIGRATE);

      const sourceFolder = path.join(ctx.root, ArchiveFolderName);
      const distFolder = path.join(ctx.root, CommonStrings.BOT_WORKING_DIR_NAME);
      const excludeFiles = [
        { fileName: ArchiveFolderName, recursive: false },
        { fileName: ArchiveLogFileName, recursive: false },
        { fileName: AppPackageFolderName, recursive: false },
        { fileName: CommonStrings.README_FILE_NAME, recursive: false },
        { fileName: CommonStrings.NODE_PACKAGE_FOLDER_NAME, recursive: true },
      ];

      await copyFiles(sourceFolder, distFolder, excludeFiles);

      await handler?.end(true);
      Logger.info(Messages.EndMigrateV1Project(Alias.TEAMS_BOT_PLUGIN));
    } catch (err) {
      throw new MigrateV1ProjectError(err);
    }
    return ResultFactory.Success();
  }

  private async updateMessageEndpointOnAppStudio(endpoint: string) {
    const appStudioToken = await this.ctx?.appStudioToken?.getAccessToken();
    CheckThrowSomethingMissing(ConfigNames.APPSTUDIO_TOKEN, appStudioToken);
    CheckThrowSomethingMissing(ConfigNames.LOCAL_BOT_ID, this.config.localDebug.localBotId);

    const botReg: IBotRegistration = {
      botId: this.config.localDebug.localBotId,
      name: this.ctx!.projectSettings?.appName + PluginLocalDebug.LOCAL_DEBUG_SUFFIX,
      description: "",
      iconUrl: "",
      messagingEndpoint: endpoint,
      callingEndpoint: "",
    };

    await AppStudio.updateMessageEndpoint(appStudioToken!, botReg.botId!, botReg);
  }

  private async updateMessageEndpointOnAzure(endpoint: string) {
    const serviceClientCredentials = await this.getAzureAccountCredenial();

    const botClient = factory.createAzureBotServiceClient(
      serviceClientCredentials,
      this.config.provision.subscriptionId!
    );

    if (!this.config.provision.botChannelRegName) {
      throw new SomethingMissingError(CommonStrings.BOT_CHANNEL_REGISTRATION);
    }
    const botChannelRegistrationName = this.config.provision.botChannelRegName;
    Logger.info(Messages.UpdatingBotMessageEndpoint);
    await AzureOperations.UpdateBotChannelRegistration(
      botClient,
      this.config.provision.resourceGroup!,
      botChannelRegistrationName,
      this.config.scaffold.botId!,
      endpoint,
      this.ctx?.projectSettings?.appName
    );
    Logger.info(Messages.SuccessfullyUpdatedBotMessageEndpoint);
  }

  private async reuseExistingBotRegistration() {
    const rawBotId = this.ctx!.answers![QuestionNames.GET_BOT_ID];
    if (!rawBotId) {
      throw new UserInputsError(QuestionNames.GET_BOT_ID, rawBotId as string);
    }
    const botId = rawBotId as string;

    const rawBotPassword = this.ctx!.answers![QuestionNames.GET_BOT_PASSWORD];
    if (!rawBotPassword) {
      throw new UserInputsError(QuestionNames.GET_BOT_PASSWORD, rawBotPassword as string);
    }
    const botPassword = rawBotPassword as string;

    return {
      botId: botId,
      botPassword: botPassword,
    };
  }

  private async createNewBotRegistrationOnAppStudio() {
    const appStudioToken = await this.ctx?.appStudioToken?.getAccessToken();
    CheckThrowSomethingMissing(ConfigNames.APPSTUDIO_TOKEN, appStudioToken);
    CheckThrowSomethingMissing(CommonStrings.SHORT_APP_NAME, this.ctx?.projectSettings?.appName);

    if (
      this.config.localDebug.botRegistrationCreated() &&
      (await AppStudio.isAADAppExisting(appStudioToken!, this.config.localDebug.localObjectId!))
    ) {
      Logger.debug("Local bot has already been registered, just return.");
      return;
    }

    // 1. Create a new AAD App Registraion with client secret.
    const aadDisplayName = ResourceNameFactory.createCommonName(
      this.config.resourceNameSuffix,
      this.ctx?.projectSettings?.appName,
      MaxLengths.AAD_DISPLAY_NAME
    );

    Logger.info(Messages.ProvisioningBotRegistration);
    const botAuthCreds = await AADRegistration.registerAADAppAndGetSecretByAppStudio(
      appStudioToken!,
      aadDisplayName
    );
    Logger.info(Messages.SuccessfullyProvisionedBotRegistration);

    // 2. Register bot by app studio.
    const botReg: IBotRegistration = {
      botId: botAuthCreds.clientId,
      name: this.ctx!.projectSettings?.appName + PluginLocalDebug.LOCAL_DEBUG_SUFFIX,
      description: "",
      iconUrl: "",
      messagingEndpoint: "",
      callingEndpoint: "",
    };

    Logger.info(Messages.ProvisioningBotRegistration);
    await AppStudio.createBotRegistration(appStudioToken!, botReg);
    Logger.info(Messages.SuccessfullyProvisionedBotRegistration);

    if (!this.config.localDebug.localBotId) {
      this.config.localDebug.localBotId = botAuthCreds.clientId;
    }

    if (!this.config.localDebug.localBotPassword) {
      this.config.localDebug.localBotPassword = botAuthCreds.clientSecret;
    }

    if (!this.config.localDebug.localObjectId) {
      this.config.localDebug.localObjectId = botAuthCreds.objectId;
    }
  }

  private async createOrGetBotAppRegistration(): Promise<BotAuthCredential> {
    const appStudioToken = await this.ctx?.appStudioToken?.getAccessToken();
    CheckThrowSomethingMissing(ConfigNames.APPSTUDIO_TOKEN, appStudioToken);
    CheckThrowSomethingMissing(CommonStrings.SHORT_APP_NAME, this.ctx?.projectSettings?.appName);

    let botAuthCreds = new BotAuthCredential();

    if (!this.config.scaffold.botRegistrationCreated()) {
      const aadDisplayName = ResourceNameFactory.createCommonName(
        this.config.resourceNameSuffix,
        this.ctx?.projectSettings?.appName,
        MaxLengths.AAD_DISPLAY_NAME
      );
      botAuthCreds = await AADRegistration.registerAADAppAndGetSecretByAppStudio(
        appStudioToken!,
        aadDisplayName
      );

      if (!this.config.scaffold.botId) {
        this.config.scaffold.botId = botAuthCreds.clientId;
      }
      if (!this.config.scaffold.botPassword) {
        this.config.scaffold.botPassword = botAuthCreds.clientSecret;
      }
      if (!this.config.scaffold.objectId) {
        this.config.scaffold.objectId = botAuthCreds.objectId;
      }
      this.config.saveConfigIntoContext(this.ctx!); // Checkpoint for aad app provision.
      Logger.info(Messages.SuccessfullyCreatedBotAadApp);
    } else {
      botAuthCreds.clientId = this.config.scaffold.botId;
      botAuthCreds.clientSecret = this.config.scaffold.botPassword;
      botAuthCreds.objectId = this.config.scaffold.objectId;
      Logger.info(Messages.SuccessfullyGetExistingBotAadAppCredential);
    }

    return botAuthCreds;
  }

  private async provisionBotServiceOnAzure(botAuthCreds: BotAuthCredential) {
    const serviceClientCredentials = await this.getAzureAccountCredenial();

    // Provision a bot channel registration resource on azure.
    const botClient = factory.createAzureBotServiceClient(
      serviceClientCredentials,
      this.config.provision.subscriptionId!
    );

    const botChannelRegistrationName = this.config.provision.botChannelRegName
      ? this.config.provision.botChannelRegName
      : ResourceNameFactory.createCommonName(
          this.config.resourceNameSuffix,
          this.ctx?.projectSettings?.appName,
          MaxLengths.BOT_CHANNEL_REG_NAME
        );

    Logger.info(Messages.ProvisioningAzureBotChannelRegistration);
    await AzureOperations.CreateBotChannelRegistration(
      botClient,
      this.config.provision.resourceGroup!,
      botChannelRegistrationName,
      botAuthCreds.clientId!,
      this.ctx?.projectSettings?.appName
    );
    Logger.info(Messages.SuccessfullyProvisionedAzureBotChannelRegistration);

    // Add Teams Client as a channel to the resource above.
    Logger.info(Messages.ProvisioningMsTeamsChannel);
    await AzureOperations.LinkTeamsChannel(
      botClient,
      this.config.provision.resourceGroup!,
      botChannelRegistrationName
    );
    Logger.info(Messages.SuccessfullyProvisionedMsTeamsChannel);

    if (!this.config.provision.botChannelRegName) {
      this.config.provision.botChannelRegName = botChannelRegistrationName;
    }
  }
}
