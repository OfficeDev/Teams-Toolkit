// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  PluginContext,
  ok,
  Func,
  ArchiveFolderName,
  ArchiveLogFileName,
  AppPackageFolderName,
} from "@microsoft/teamsfx-api";
import path from "path";

import { AzureStorageClient } from "./clients";
import {
  CreateStorageAccountError,
  EnableStaticWebsiteError,
  GetTemplateError,
  NoResourceGroupError,
  NoStorageError,
  StaticWebsiteDisabledError,
  UnzipTemplateError,
  runWithErrorCatchAndThrow,
  CheckStorageError,
  CheckResourceGroupError,
  InvalidStorageNameError,
  StorageAccountAlreadyTakenError,
  runWithErrorCatchAndWrap,
  RegisterResourceProviderError,
  UserTaskNotImplementedError,
  MigrateV1ProjectError,
} from "./resources/errors";
import {
  ArmOutput,
  AzureErrorCode,
  AzureInfo,
  Constants,
  DependentPluginInfo,
  EnvironmentVariables,
  FrontendOutputBicepSnippet,
  FrontendPathInfo,
  FrontendPluginInfo as PluginInfo,
  RegularExpr,
} from "./constants";
import { FrontendConfig } from "./configs";
import { FrontendDeployment } from "./ops/deploy";
import { Logger } from "./utils/logger";
import { Messages } from "./resources/messages";
import { FrontendScaffold as Scaffold } from "./ops/scaffold";
import { TeamsFxResult } from "./error-factory";
import {
  MigrateSteps,
  PreDeploySteps,
  ProgressHelper,
  ProvisionSteps,
  ScaffoldSteps,
} from "./utils/progress-helper";
import { TemplateInfo } from "./resources/templateInfo";
import { AzureClientFactory, AzureLib } from "./utils/azure-client";
import { getArmOutput } from "../utils4v2";
import { getTemplatesFolder, isArmSupportEnabled } from "../../..";
import { ScaffoldArmTemplateResult } from "../../../common/armInterface";
import * as fs from "fs-extra";
import { Bicep, ConstantString } from "../../../common/constants";
import { EnvironmentUtils } from "./utils/environment-utils";
import { copyFiles } from "../../../common";

export class FrontendPluginImpl {
  private setConfigIfNotExists(ctx: PluginContext, key: string, value: unknown): void {
    if (ctx.config.get(key)) {
      return;
    }
    ctx.config.set(key, value);
  }

  public async scaffold(ctx: PluginContext): Promise<TeamsFxResult> {
    Logger.info(Messages.StartScaffold(PluginInfo.DisplayName));
    const progressHandler = await ProgressHelper.startScaffoldProgressHandler(ctx);
    await progressHandler?.next(ScaffoldSteps.Scaffold);

    const templateInfo = new TemplateInfo(ctx);

    const zip = await runWithErrorCatchAndThrow(
      new GetTemplateError(),
      async () => await Scaffold.getTemplateZip(ctx, templateInfo)
    );
    await runWithErrorCatchAndThrow(
      new UnzipTemplateError(),
      async () =>
        await Scaffold.scaffoldFromZip(
          zip,
          path.join(ctx.root, FrontendPathInfo.WorkingDir),
          (filePath: string, data: Buffer) =>
            filePath.replace(RegularExpr.ReplaceTemplateExt, Constants.EmptyString),
          (filePath: string, data: Buffer) =>
            Scaffold.fulfill(filePath, data, templateInfo.variables)
        )
    );

    await ProgressHelper.endScaffoldProgress(true);
    Logger.info(Messages.EndScaffold(PluginInfo.DisplayName));
    return ok(undefined);
  }

  public async preProvision(ctx: PluginContext): Promise<TeamsFxResult> {
    Logger.info(Messages.StartPreProvision(PluginInfo.DisplayName));

    const config = await FrontendConfig.fromPluginContext(ctx);
    const azureStorageClient = new AzureStorageClient(config);

    const resourceGroupExists: boolean = await runWithErrorCatchAndThrow(
      new CheckResourceGroupError(),
      async () => await azureStorageClient.doesResourceGroupExists()
    );
    if (!resourceGroupExists) {
      throw new NoResourceGroupError();
    }

    Logger.info(Messages.EndPreProvision(PluginInfo.DisplayName));
    return ok(undefined);
  }

  public async provision(ctx: PluginContext): Promise<TeamsFxResult> {
    Logger.info(Messages.StartProvision(PluginInfo.DisplayName));
    const progressHandler = await ProgressHelper.startProvisionProgressHandler(ctx);

    const config = await FrontendConfig.fromPluginContext(ctx);
    const provider = AzureClientFactory.getResourceProviderClient(
      config.credentials,
      config.subscriptionId
    );
    const client = new AzureStorageClient(config);

    await progressHandler?.next(ProvisionSteps.RegisterResourceProvider);
    await runWithErrorCatchAndThrow(
      new RegisterResourceProviderError(),
      async () =>
        await AzureLib.ensureResourceProviders(provider, AzureInfo.RequiredResourceProviders)
    );

    await progressHandler?.next(ProvisionSteps.CreateStorage);
    const createStorageErrorWrapper = (innerError: any) => {
      if (innerError.code === AzureErrorCode.ReservedResourceName) {
        return new InvalidStorageNameError();
      }
      if (
        innerError.code === AzureErrorCode.StorageAccountAlreadyTaken ||
        innerError.code === AzureErrorCode.StorageAccountAlreadyExists
      ) {
        return new StorageAccountAlreadyTakenError();
      }
      return new CreateStorageAccountError(innerError.code);
    };
    config.endpoint = await runWithErrorCatchAndWrap(
      createStorageErrorWrapper,
      async () => await client.createStorageAccount()
    );

    await progressHandler?.next(ProvisionSteps.Configure);
    await runWithErrorCatchAndThrow(
      new EnableStaticWebsiteError(),
      async () => await client.enableStaticWebsite()
    );

    config.domain = new URL(config.endpoint).hostname;
    config.syncToPluginContext(ctx);

    await ProgressHelper.endProvisionProgress(true);
    Logger.info(Messages.EndProvision(PluginInfo.DisplayName));
    return ok(undefined);
  }

  public async postProvision(ctx: PluginContext): Promise<TeamsFxResult> {
    if (isArmSupportEnabled()) {
      await this.syncArmOutput(ctx);
    }

    return ok(undefined);
  }

  public async preDeploy(ctx: PluginContext): Promise<TeamsFxResult> {
    Logger.info(Messages.StartPreDeploy(PluginInfo.DisplayName));
    const progressHandler = await ProgressHelper.createPreDeployProgressHandler(ctx);

    await this.updateDotenv(ctx);

    const config = await FrontendConfig.fromPluginContext(ctx);
    const client = new AzureStorageClient(config);

    await progressHandler?.next(PreDeploySteps.CheckStorage);

    const resourceGroupExists: boolean = await runWithErrorCatchAndThrow(
      new CheckResourceGroupError(),
      async () => await client.doesResourceGroupExists()
    );
    if (!resourceGroupExists) {
      throw new NoResourceGroupError();
    }

    const storageExists: boolean = await runWithErrorCatchAndThrow(
      new CheckStorageError(),
      async () => await client.doesStorageAccountExists()
    );
    if (!storageExists) {
      throw new NoStorageError();
    }

    const storageAvailable: boolean | undefined = await runWithErrorCatchAndThrow(
      new CheckStorageError(),
      async () => await client.isStorageStaticWebsiteEnabled()
    );
    if (!storageAvailable) {
      throw new StaticWebsiteDisabledError();
    }

    ProgressHelper.endPreDeployProgress(true);
    Logger.info(Messages.EndPreDeploy(PluginInfo.DisplayName));
    return ok(undefined);
  }

  public async deploy(ctx: PluginContext): Promise<TeamsFxResult> {
    Logger.info(Messages.StartDeploy(PluginInfo.DisplayName));
    await ProgressHelper.startDeployProgressHandler(ctx);

    const config = await FrontendConfig.fromPluginContext(ctx);
    const client = new AzureStorageClient(config);

    const componentPath: string = path.join(ctx.root, FrontendPathInfo.WorkingDir);

    await FrontendDeployment.doFrontendBuild(componentPath);
    await FrontendDeployment.doFrontendDeployment(client, componentPath);

    await ProgressHelper.endDeployProgress(true);
    Logger.info(Messages.EndDeploy(PluginInfo.DisplayName));
    return ok(undefined);
  }

  public async generateArmTemplates(ctx: PluginContext): Promise<TeamsFxResult> {
    Logger.info(Messages.StartGenerateArmTemplates(PluginInfo.DisplayName));

    const bicepTemplateDir = path.join(
      getTemplatesFolder(),
      FrontendPathInfo.BicepTemplateRelativeDir
    );

    const moduleFilePath = path.join(bicepTemplateDir, FrontendPathInfo.ModuleFileName);

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

    const result: ScaffoldArmTemplateResult = {
      Modules: {
        frontendHostingProvision: {
          Content: await fs.readFile(moduleFilePath, ConstantString.UTF8Encoding),
        },
      },
      Orchestration: {
        ParameterTemplate: {
          Content: await fs.readFile(
            inputParameterOrchestrationFilePath,
            ConstantString.UTF8Encoding
          ),
        },
        ModuleTemplate: {
          Content: await fs.readFile(moduleOrchestrationFilePath, ConstantString.UTF8Encoding),
          Outputs: {
            storageName: FrontendOutputBicepSnippet.StorageName,
            endpoint: FrontendOutputBicepSnippet.Endpoint,
            domain: FrontendOutputBicepSnippet.Domain,
          },
        },
        OutputTemplate: {
          Content: await fs.readFile(outputOrchestrationFilePath, ConstantString.UTF8Encoding),
        },
      },
    };

    return ok(result);
  }

  private async syncArmOutput(ctx: PluginContext) {
    const config = await FrontendConfig.fromPluginContext(ctx);
    config.endpoint = getArmOutput(ctx, ArmOutput.FrontendEndpoint) as string;
    config.domain = getArmOutput(ctx, ArmOutput.FrontendDomain) as string;
    config.syncToPluginContext(ctx);

    const client = new AzureStorageClient(config);
    await runWithErrorCatchAndThrow(
      new EnableStaticWebsiteError(),
      async () => await client.enableStaticWebsite()
    );
  }

  private async updateDotenv(ctx: PluginContext): Promise<void> {
    const envs: { [key: string]: string } = {};

    const functionPlugin = ctx.configOfOtherPlugins.get(DependentPluginInfo.FunctionPluginName);
    if (functionPlugin) {
      envs[EnvironmentVariables.FuncName] = ctx.projectSettings?.defaultFunctionName as string;
      envs[EnvironmentVariables.FuncEndpoint] = functionPlugin.get(
        DependentPluginInfo.FunctionEndpoint
      ) as string;
    }

    const authPlugin = ctx.configOfOtherPlugins.get(DependentPluginInfo.RuntimePluginName);
    if (authPlugin) {
      envs[EnvironmentVariables.RuntimeEndpoint] = authPlugin.get(
        DependentPluginInfo.RuntimeEndpoint
      ) as string;
      envs[EnvironmentVariables.StartLoginPage] = DependentPluginInfo.StartLoginPageURL;
    }

    const aadPlugin = ctx.configOfOtherPlugins.get(DependentPluginInfo.AADPluginName);
    if (aadPlugin) {
      envs[EnvironmentVariables.ClientID] = aadPlugin.get(DependentPluginInfo.ClientID) as string;
    }

    const envFilePath = path.join(
      ctx.root,
      FrontendPathInfo.WorkingDir,
      FrontendPathInfo.TabEnvironmentFilePath
    );
    await EnvironmentUtils.writeEnvironments(envFilePath, envs);
  }

  public async executeUserTask(func: Func, ctx: PluginContext): Promise<TeamsFxResult> {
    if (func.method === "migrateV1Project") {
      Logger.info(Messages.StartMigrateV1Project(PluginInfo.DisplayName));
      const progressHandler = await ProgressHelper.startMigrateProgressHandler(ctx);
      await progressHandler?.next(MigrateSteps.Migrate);

      const sourceFolder = path.join(ctx.root, ArchiveFolderName);
      const distFolder = path.join(ctx.root, FrontendPathInfo.WorkingDir);
      const excludeFiles = [
        { fileName: ArchiveFolderName, recursive: false },
        { fileName: ArchiveLogFileName, recursive: false },
        { fileName: AppPackageFolderName, recursive: false },
        { fileName: FrontendPathInfo.ReadmeFileName, recursive: false },
        { fileName: FrontendPathInfo.NodePackageFolderName, recursive: true },
      ];

      await runWithErrorCatchAndThrow(new MigrateV1ProjectError(), async () => {
        await copyFiles(sourceFolder, distFolder, excludeFiles);
      });

      await ProgressHelper.endMigrateProgress(true);
      Logger.info(Messages.EndMigrateV1Project(PluginInfo.DisplayName));
      return ok(undefined);
    }
    throw new UserTaskNotImplementedError(func.method);
  }
}
