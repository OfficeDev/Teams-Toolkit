// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";

import { LogProvider, Platform, Warning } from "@microsoft/teamsfx-api";

import { SampleUrlInfo } from "../../common/samples";
import { getTemplatesFolder } from "../../folder";
import { MissKeyError, SampleNotFoundError, TemplateNotFoundError } from "./error";
import * as generatorUtils from "./utils";

export const generatorActionDeps = {
  getTemplateUrl: generatorUtils.getTemplateUrl,
  getTemplateLatestVersion: generatorUtils.getTemplateLatestVersion,
  fetchZipFromUrl: generatorUtils.fetchZipFromUrl,
  unzip: generatorUtils.unzip,
  getSampleInfoFromName: generatorUtils.getSampleInfoFromName,
  downloadDirectory: generatorUtils.downloadDirectory,
};

export interface GeneratorContext {
  name: string;
  language?: string;
  platform?: Platform;
  destination: string;
  logProvider: LogProvider;
  tryLimits?: number;
  timeoutInMs?: number;
  sampleInfo?: SampleUrlInfo;
  fallback?: boolean;
  outputs?: string[];
  /** Warnings raised while generating, for the caller to put on `CreateProjectResult`. */
  warnings?: Warning[];

  filterFn?: (name: string) => boolean;
  fileNameReplaceFn?: (name: string, data: Buffer) => string;
  fileDataReplaceFn?: (name: string, data: Buffer) => Buffer | string;

  onActionStart?: (action: GeneratorAction, context: GeneratorContext) => Promise<void>;
  onActionEnd?: (action: GeneratorAction, context: GeneratorContext) => Promise<void>;
  onActionError: (
    action: GeneratorAction,
    context: GeneratorContext,
    error: Error
  ) => Promise<void>;
}

export interface GeneratorAction {
  name: string;
  run: (context: GeneratorContext) => Promise<void>;
}

export enum GeneratorActionName {
  ScaffoldRemoteTemplate = "ScaffoldRemoteTemplate",
  ScaffoldLocalTemplate = "ScaffoldLocalTemplate",
  FetchSampleInfo = "FetchSampleInfo",
  DownloadDirectory = "DownloadDirectory",
}

export const ScaffoldRemoteTemplateAction: GeneratorAction = {
  name: GeneratorActionName.ScaffoldRemoteTemplate,
  run: async (context: GeneratorContext) => {
    if (!context.language) {
      throw new MissKeyError("language");
    }

    const templateUrl = await generatorActionDeps.getTemplateUrl(
      context.language,
      generatorActionDeps.getTemplateLatestVersion,
      context.platform
    );
    if (!templateUrl) {
      return;
    }

    const zip = await generatorActionDeps.fetchZipFromUrl(
      templateUrl,
      context.tryLimits,
      context.timeoutInMs
    );
    context.outputs = await generatorActionDeps.unzip(
      zip,
      context.destination,
      context.fileNameReplaceFn,
      context.fileDataReplaceFn,
      context.filterFn
    );
  },
};

export const ScaffoldLocalTemplateAction: GeneratorAction = {
  name: GeneratorActionName.ScaffoldLocalTemplate,
  run: async (context: GeneratorContext) => {
    if (!context.language) {
      throw new MissKeyError("language");
    }

    if (context.outputs?.length) {
      return;
    }
    context.logProvider.debug(`Fetching zip from local: ${JSON.stringify(context)}`);
    const fallbackPath = path.join(getTemplatesFolder(), "fallback");
    const fileName = `${context.language}.zip`;
    const zipPath: string = path.join(fallbackPath, fileName);

    const data: Buffer = await fs.readFile(zipPath);
    const zip = new AdmZip(data);
    context.outputs = await generatorActionDeps.unzip(
      zip,
      context.destination,
      context.fileNameReplaceFn,
      context.fileDataReplaceFn,
      context.filterFn
    );

    if (!context.outputs?.length) {
      throw new TemplateNotFoundError(context.name);
    }
  },
};

export const fetchSampleInfoAction: GeneratorAction = {
  name: GeneratorActionName.FetchSampleInfo,
  run: async (context: GeneratorContext) => {
    const sample = await generatorActionDeps.getSampleInfoFromName(context.name);
    context.sampleInfo = sample.downloadUrlInfo;
  },
};

export const downloadDirectoryAction: GeneratorAction = {
  name: GeneratorActionName.DownloadDirectory,
  run: async (context: GeneratorContext) => {
    context.logProvider.debug(`Downloading sample by directory: ${JSON.stringify(context)}`);
    if (!context.sampleInfo) {
      throw new MissKeyError("sampleInfo");
    }

    context.outputs = await generatorActionDeps.downloadDirectory(
      context.sampleInfo,
      context.destination
    );
    if (!context.outputs?.length) {
      throw new SampleNotFoundError(context.name);
    }
  },
};

export const TemplateActionSeq: GeneratorAction[] = [
  ScaffoldRemoteTemplateAction,
  ScaffoldLocalTemplateAction,
];

export const SampleActionSeq: GeneratorAction[] = [fetchSampleInfoAction, downloadDirectoryAction];
