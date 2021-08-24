// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";
import { FrontendPathInfo as PathInfo } from "../constants";

export class Messages {
  // Progress bar messages
  static readonly ScaffoldProgressTitle = "Scaffolding Tab";
  static readonly ProvisionProgressTitle = "Provisioning Tab";
  static readonly PreDeployProgressTitle = "Building Tab";
  static readonly DeployProgressTitle = "Deploying Tab";
  static readonly MigrateProgressTitle = "Migrating Tab";

  static readonly ProgressStart = "Preparing.";
  static readonly ProgressScaffold = "Scaffolding Tab frontend project.";
  static readonly ProgressRegisterRP = "Registering required resource provider.";
  static readonly ProgressCreateStorage = "Creating Azure Storage account.";
  static readonly ProgressConfigure = "Configuring.";
  static readonly ProgressNPMInstall = `Running "npm install" for Tab frontend project.`;
  static readonly ProgressBuild = "Building Tab frontend project.";
  static readonly ProgressCheckStorage = "Checking Azure Storage account availability.";
  static readonly ProgressGetSrcAndDest = "Retrieving deployment source and destination.";
  static readonly ProgressClear = "Cleaning up Azure Storage account.";
  static readonly ProgressUpload = "Uploading Tab frontend to Azure Storage account.";
  static readonly ProgressMigrate = "Migrating Tab frontend project.";

  // Logging messages
  static readonly StartScaffold = (name: string) => `Scaffolding '${name}'.`;
  static readonly EndScaffold = (name: string) => `Successfully scaffolded '${name}'.`;
  static readonly StartPreProvision = (name: string) => `Pre-provisioning '${name}'.`;
  static readonly EndPreProvision = (name: string) => `Successfully pre-provisioned '${name}'.`;
  static readonly StartProvision = (name: string) => `Provisioning '${name}'.`;
  static readonly EndProvision = (name: string) => `Successfully provisioned '${name}'.`;
  static readonly StartPreDeploy = (name: string) => `Pre-deploying '${name}'.`;
  static readonly EndPreDeploy = (name: string) => `Pre-deployed '${name}'.`;
  static readonly StartDeploy = (name: string) => `Deploying '${name}'.`;
  static readonly EndDeploy = (name: string) => `Successfully deployed '${name}'.`;
  static readonly StartGenerateArmTemplates = (name: string) =>
    `Generating ARM templates '${name}'.`;
  static readonly EndGenerateArmTemplates = (name: string) =>
    `Successfully generated ARM templates '${name}'.`;
  static readonly StartMigrateV1Project = (name: string) => `Migrating '${name}'.`;
  static readonly EndMigrateV1Project = (name: string) => `Successfully migrated '${name}'.`;

  static readonly SkipBuild =
    "Skip building Tab frontend project because no change was detected since last build.";
  static readonly SkipDeploy = `Skip deployment of Tab frontend project because no change was detected. To fully redeploy Tab frontend project, please remove '${path.join(
    PathInfo.WorkingDir,
    PathInfo.TabDeploymentFolderName
  )}' folder and rerun the command.`;

  static readonly StartCheckResourceGroupExistence = (name: string) =>
    `Checking resource group '${name}'.`;
  static readonly StartCheckStaticWebsiteEnabled = (name: string) =>
    `Checking if static website feature is enabled in Azure Storage account '${name}'.`;
  static readonly StartCreateStorageAccount = (name: string, resourceGroupName: string) =>
    `Creating Azure Storage account '${name}' in resource group '${resourceGroupName}'.`;
  static readonly StartEnableStaticWebsite = (name: string) =>
    `Enabling static website feature for Azure Storage account '${name}'.`;
  static readonly SkipEnableStaticWebsite = (name: string) =>
    `Static website feature is already enabled for Azure Storage account ${name}.`;
  static readonly StartSyncLocalToStorage = (localPath: string, storageName: string) =>
    `Uploading local path '${localPath}' to Azure Storage account '${storageName}'.`;
  static readonly StartDeleteAllBlobs = (storageName: string, containerName: string) =>
    `Deleting all existing blobs in container '${containerName}' for Azure Storage account '${storageName}'.`;
  static readonly StartUploadFiles = (sourceFolder: string, storageName: string) =>
    `Uploading files in '${sourceFolder}' to Azure Storage account '${storageName}'.`;

  static readonly FailedFetchManifest = (url: string) =>
    `Failed to retrieve manifest from '${url}'. Retrying...`;
  static readonly FailedFetchZip = (url: string) =>
    `Failed to retrieve zip package from '${url}'. Retrying...`;
  static readonly FailedFetchTemplate =
    "Failed to retrieve latest template from GitHub. Using local template instead.";

  static readonly FailedOperationWithErrorCode = (doOperation: string, errorCode?: string) =>
    `Failed to '${doOperation}' with error code '${errorCode}'.`;
  static readonly GetEmptyStorageEndpoint =
    "Failed to retrieve endpoint for Azure Storage account.";
  static readonly GetEmptySasToken = "Failed to retrieve SAS token for Azure Storage account.";
}
