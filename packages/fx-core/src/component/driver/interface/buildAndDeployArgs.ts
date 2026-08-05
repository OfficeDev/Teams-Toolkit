// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AzureAccountProvider,
  IProgressHandler,
  LogProvider,
  TelemetryReporter,
} from "@microsoft/teamsfx-api";

export type DeployArgs = {
  workingDirectory?: string;
  artifactFolder: string;
  ignoreFile?: string;
  resourceId: string;
  dryRun?: boolean;
  outputZipFile?: string;
};

export type DeployStepArgs = {
  ignoreFile?: string;
};

export type BuildArgs = {
  args: string;
  workingDirectory?: string;
  execPath?: string;
};

export type DeployContext = {
  azureAccountProvider: AzureAccountProvider;
  progressBar: IProgressHandler | undefined;
  logProvider: LogProvider;
  telemetryReporter?: TelemetryReporter;
};

export type AzureUploadConfig = {
  headers: {
    "Content-Type"?: string;
    "Cache-Control"?: string;
    Authorization: string;
  };
  maxContentLength: number;
  maxBodyLength: number;
  timeout: number;
};

type AxiosOnlyStatusResult = {
  status?: number;
};

type AxiosHeaderWithLocation = {
  headers: {
    location: string;
  };
};

export type DeployResult = {
  id?: string;
  status?: number;
  message?: string;
  received_time?: string;
  start_time?: string;
  end_time?: string;
  last_success_end_time?: string;
  complete?: boolean;
  active?: boolean;
  is_readonly?: boolean;
  site_name?: string;
};

export type AxiosZipDeployResult = AxiosHeaderWithLocation & AxiosOnlyStatusResult;

export type AxiosDeployQueryResult = AxiosOnlyStatusResult & { data?: DeployResult };
