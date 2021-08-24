// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IProgressHandler, PluginContext } from "@microsoft/teamsfx-api";
import { Messages } from "../resources/messages";

export const ScaffoldSteps = {
  Scaffold: Messages.ProgressScaffold,
};

export const ProvisionSteps = {
  RegisterResourceProvider: Messages.ProgressRegisterRP,
  CreateStorage: Messages.ProgressCreateStorage,
  Configure: Messages.ProgressConfigure,
};

export const PreDeploySteps = {
  CheckStorage: Messages.ProgressCheckStorage,
};

export const DeploySteps = {
  NPMInstall: Messages.ProgressNPMInstall,
  Build: Messages.ProgressBuild,
  getSrcAndDest: Messages.ProgressGetSrcAndDest,
  Clear: Messages.ProgressClear,
  Upload: Messages.ProgressUpload,
};

export const MigrateSteps = {
  Migrate: Messages.ProgressMigrate,
};

export class ProgressHelper {
  static scaffoldProgress: IProgressHandler | undefined;
  static provisionProgress: IProgressHandler | undefined;
  static preDeployProgress: IProgressHandler | undefined;
  static deployProgress: IProgressHandler | undefined;
  static migrateProgress: IProgressHandler | undefined;

  static async startScaffoldProgressHandler(
    ctx: PluginContext
  ): Promise<IProgressHandler | undefined> {
    await this.scaffoldProgress?.end(true);

    this.scaffoldProgress = ctx.ui?.createProgressBar(
      Messages.ScaffoldProgressTitle,
      Object.entries(ScaffoldSteps).length
    );
    await this.scaffoldProgress?.start(Messages.ProgressStart);
    return this.scaffoldProgress;
  }

  static async startProvisionProgressHandler(
    ctx: PluginContext
  ): Promise<IProgressHandler | undefined> {
    await this.provisionProgress?.end(true);

    this.provisionProgress = ctx.ui?.createProgressBar(
      Messages.ProvisionProgressTitle,
      Object.entries(ProvisionSteps).length
    );
    await this.provisionProgress?.start(Messages.ProgressStart);
    return this.provisionProgress;
  }

  static async createPreDeployProgressHandler(
    ctx: PluginContext
  ): Promise<IProgressHandler | undefined> {
    await this.preDeployProgress?.end(true);

    this.preDeployProgress = ctx.ui?.createProgressBar(
      Messages.PreDeployProgressTitle,
      Object.entries(PreDeploySteps).length
    );
    await this.preDeployProgress?.start(Messages.ProgressStart);
    return this.preDeployProgress;
  }

  static async startDeployProgressHandler(
    ctx: PluginContext
  ): Promise<IProgressHandler | undefined> {
    await this.deployProgress?.end(true);

    this.deployProgress = ctx.ui?.createProgressBar(
      Messages.DeployProgressTitle,
      Object.entries(DeploySteps).length
    );
    await this.deployProgress?.start(Messages.ProgressStart);
    return this.deployProgress;
  }

  static async startMigrateProgressHandler(
    ctx: PluginContext
  ): Promise<IProgressHandler | undefined> {
    await this.migrateProgress?.end(true);

    this.migrateProgress = ctx.ui?.createProgressBar(
      Messages.MigrateProgressTitle,
      Object.entries(MigrateSteps).length
    );
    await this.migrateProgress?.start(Messages.ProgressStart);
    return this.migrateProgress;
  }

  static async endAllHandlers(success: boolean): Promise<void> {
    await this.endScaffoldProgress(success);
    await this.endProvisionProgress(success);
    await this.endPreDeployProgress(success);
    await this.endDeployProgress(success);
    await this.endMigrateProgress(success);
  }

  static async endScaffoldProgress(success: boolean): Promise<void> {
    await this.scaffoldProgress?.end(success);
    this.scaffoldProgress = undefined;
  }

  static async endProvisionProgress(success: boolean): Promise<void> {
    await this.provisionProgress?.end(success);
    this.provisionProgress = undefined;
  }

  static async endPreDeployProgress(success: boolean): Promise<void> {
    await this.preDeployProgress?.end(success);
    this.preDeployProgress = undefined;
  }

  static async endDeployProgress(success: boolean): Promise<void> {
    await this.deployProgress?.end(success);
    this.deployProgress = undefined;
  }

  static async endMigrateProgress(success: boolean): Promise<void> {
    await this.migrateProgress?.end(success);
    this.migrateProgress = undefined;
  }
}
