// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Context as FxContext, Platform, signedIn } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import axios, { AxiosError, AxiosResponse } from "axios";
import * as fs from "fs-extra";
import { cloneDeep } from "lodash";
import Mustache from "mustache";
import path from "path";
import semver from "semver";
import { GraphClient } from "../../client/graphClient";
import { ListSensitivityLabelScope } from "../../common/constants";
import { getDefaultString } from "../../common/localizeUtils";
import * as requestUtils from "../../common/requestUtils";
import { SampleConfig, SampleUrlInfo, sampleProvider } from "../../common/samples";
import templateConfig from "../../common/templates-config.json";
import { InputValidationError } from "../../error";
import { ProgrammingLanguage } from "../../question/constants";
import { copilotGptManifestUtils } from "../driver/teamsApp/utils/CopilotGptManifestUtils";
import {
  defaultTimeoutInMs,
  defaultTryLimits,
  oldPlaceholderDelimiters,
  placeholderDelimiters,
  sampleConcurrencyLimits,
  sampleDefaultRetryLimits,
  templateFileExt,
} from "./constant";

const packageJson = require("../../../package.json");

export async function getTemplateUrl(
  programmingLanguage: string,
  getLatestVersion: () => Promise<string>,
  platform?: Platform
): Promise<string | undefined> {
  return platform === Platform.VS
    ? await getTemplateVSUrl(programmingLanguage)
    : await getTemplateVSCUrl(programmingLanguage, getLatestVersion);
}

// Return undefined to use local templates.
async function getTemplateVSCUrl(
  programmingLanguage: string,
  getLatestVersion: () => Promise<string>
): Promise<string | undefined> {
  const templateVersionEnv = process.env["TEMPLATE_VERSION"];
  if (templateVersionEnv === "local") {
    return;
  } else if (templateVersionEnv) {
    return getTemplateZipUrlByVersion(
      programmingLanguage,
      templateVersionEnv,
      templateConfig.tagPrefix
    );
  }

  // Honor the build-time template distribution flag: it is `true` on dev / PR /
  // prerelease builds and only `false` for a stable production release, so the
  // bundled in-tree template zips are used unless this is a real release.
  if (templateConfig.useLocalTemplate) {
    return;
  }

  const version: string = packageJson.version;
  if (version.includes("alpha")) {
    // daily build version
    return;
  } else if (version.includes("beta")) {
    // prerelease build version
  } else if (version.includes("rc")) {
    // rc version before stable / prerelease release
    return getTemplateZipUrlByVersion(programmingLanguage, "0.0.0-rc", templateConfig.tagPrefix);
  } else {
    // stable version
  }

  const latestVersion = await getLatestVersion();
  if (semver.gt(latestVersion, templateConfig.localVersion)) {
    // Upstream latest version is higher than the local version, return upstream templates url for downloading.
    return getTemplateZipUrlByVersion(programmingLanguage, latestVersion, templateConfig.tagPrefix);
  }
}

async function getTemplateVSUrl(name: string): Promise<string | undefined> {
  // If the template is a daily version, return undefined to use local template.
  if (templateConfig.useLocalTemplate) {
    return;
  }
  // Env override: explicit prerelease flag → use RC version.
  if (process.env.TEAMSFX_TEMPLATE_PRERELEASE === Platform.VS) {
    return getTemplateZipUrlByVersion(name, "0.0.0-rc", templateConfig.vstagPrefix);
  }
  // VS stable release ships with a beta fx-core (unlike VSC which ships stable).
  // A beta fx-core therefore indicates a pre-release test build → use RC templates.
  const version: string = packageJson.version;
  if (version.includes("beta")) {
    return getTemplateZipUrlByVersion(name, "0.0.0-rc", templateConfig.vstagPrefix);
  }
  // Stable fx-core means an actual VS stable release → look up the latest stable VS templates.
  const latestVsVersion = await getTemplateVSLatestVersion();
  return getTemplateZipUrlByVersion(name, latestVsVersion, templateConfig.vstagPrefix);
}

async function selectTemplateVersion(
  getTags: () => Promise<string[]>,
  tagPrefix: string = templateConfig.tagPrefix,
  versionPattern: string = templateConfig.version
): Promise<string | undefined> {
  const versionList = (await getTags()).map((tag: string) => tag.replace(tagPrefix, ""));
  const selectedVersion = semver.maxSatisfying(versionList, versionPattern);
  return selectedVersion ?? undefined;
}

async function fetchTagList(url: string, tryLimits: number, timeoutInMs: number): Promise<string> {
  const res: AxiosResponse<string> = await requestUtils.sendRequestWithTimeout(
    async (cancelToken) => {
      return await axios.get(url, {
        cancelToken: cancelToken,
      });
    },
    timeoutInMs,
    tryLimits
  );
  return res.data;
}

export async function getTemplateLatestVersion(
  tryLimits = defaultTryLimits,
  timeoutInMs = defaultTimeoutInMs
): Promise<string> {
  const templateTagListURL = templateConfig.tagListURL;
  const selectedVersion = await selectTemplateVersion(async () =>
    (await fetchTagList(templateTagListURL, tryLimits, timeoutInMs)).replace(/\r/g, "").split("\n")
  );
  if (!selectedVersion) {
    throw new Error(`Failed to find valid template`);
  }
  return selectedVersion;
}

export async function getTemplateVSLatestVersion(
  tryLimits = defaultTryLimits,
  timeoutInMs = defaultTimeoutInMs
): Promise<string> {
  const selectedVersion = await selectTemplateVersion(
    async () =>
      (await fetchTagList(templateConfig.tagListURL, tryLimits, timeoutInMs))
        .replace(/\r/g, "")
        .split("\n"),
    templateConfig.vstagPrefix,
    templateConfig.vsVersionPattern
  );
  if (!selectedVersion) {
    throw new Error("Failed to find valid VS template version");
  }
  return selectedVersion;
}

export function getTemplateZipUrlByVersion(name: string, version: string, prefex: string): string {
  return `${templateConfig.templateDownloadBaseURL}/${prefex}${version}/${name}${templateConfig.templateExt}`;
}

export async function fetchZipFromUrl(
  url: string,
  tryLimits = defaultTryLimits,
  timeoutInMs = defaultTimeoutInMs
): Promise<AdmZip> {
  const res: AxiosResponse<any> = await requestUtils.sendRequestWithRetry(async () => {
    return await axios.get(url, {
      responseType: "arraybuffer",
      timeout: timeoutInMs,
    });
  }, tryLimits);

  const zip = new AdmZip(res.data);
  return zip;
}

/* The unzip used for scaffold which would drop the attr of the files and dirs. */
export async function unzip(
  zip: AdmZip,
  dstPath: string,
  nameReplaceFn?: (filePath: string, data: Buffer) => string,
  dataReplaceFn?: (filePath: string, data: Buffer) => Buffer | string,
  filterFn?: (filePath: string) => boolean
): Promise<string[]> {
  const output = [];
  let entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (filterFn) {
    entries = entries.filter((entry) => filterFn(entry.entryName));
  }

  for (const entry of entries) {
    const rawEntryData: Buffer = entry.getData();
    const entryName: string = nameReplaceFn
      ? nameReplaceFn(entry.entryName, rawEntryData)
      : entry.entryName;
    const entryData: string | Buffer = dataReplaceFn
      ? dataReplaceFn(entry.name, rawEntryData)
      : rawEntryData;
    const filePath: string = path.join(dstPath, entryName);
    const dirPath: string = path.dirname(filePath);
    await fs.ensureDir(dirPath);
    await fs.writeFile(filePath, entryData);
    output.push(entryName);
  }
  return output;
}

export function renderTemplateFileData(
  fileName: string,
  fileData: Buffer,
  variables?: { [key: string]: any }
): string | Buffer {
  //only mustache files with name ending with .tpl
  if (path.extname(fileName) === templateFileExt) {
    const token = escapeEmptyVariable(fileData.toString(), variables ?? {});
    const writer = new Mustache.Writer();
    const result = writer.renderTokens(token, new Mustache.Context(variables));
    // Be compatible with current stable templates, can be removed after new template released.
    // Disable HTML escaping to prevent URLs and other content from being encoded
    Mustache.escape = (value) => value;
    return Mustache.render(result, variables, {}, oldPlaceholderDelimiters);
  }
  // Return Buffer instead of string if the file is not a template. Because `toString()` may break binary resources, like png files.
  return fileData;
}

function escapeEmptyVariable(
  template: string,
  view: Record<string, any | undefined>,
  tags: [string, string] = placeholderDelimiters
): string[][] {
  const parsed = Mustache.parse(template, tags) as string[][];
  const tokens = cloneDeep(parsed); // Mustache cache the parsed result. Modify the result in place may cause unexpected issue.
  updateTokens(tokens, view, tags, 0);
  return tokens;
}

function updateTokens(
  tokens: string[][],
  view: Record<string, any | undefined>,
  tags: [string, string],
  accShift: number
): number {
  const shift = tags[0].length + tags[1].length;
  // token: [Type, Value, Start, End]
  for (const token of tokens) {
    token[2] += accShift;
    const value = token[1];
    if (token[0] === "name" && (view[value] === undefined || view[value] === null)) {
      token[0] = "text";
      token[1] = tags[0] + value + tags[1];
      accShift += shift;
    } else if (token[0] === "#" || token[0] === "^") {
      token[2] += accShift;
      token[3] += accShift;

      let rootView = view;
      if (Array.isArray(view[token[1]])) {
        rootView = { ...view, ...view[token[1]][0] };
      } else if (typeof view[token[1]] === "object") {
        rootView = { ...view, ...view[token[1]] };
      }

      accShift += updateTokens(token[4] as any, rootView, tags, accShift);

      token[5] += accShift;
    }
  }
  return accShift;
}

export function renderTemplateFileName(
  fileName: string,
  fileData: Buffer,
  variables?: { [key: string]: any }
): string {
  // Disable HTML escaping to prevent special characters from being encoded
  Mustache.escape = (value) => value;
  return Mustache.render(fileName, variables, {}, placeholderDelimiters).replace(
    templateFileExt,
    ""
  );
}

export async function getSampleInfoFromName(sampleName: string): Promise<SampleConfig> {
  const sample = (await sampleProvider.SampleCollection).samples.find(
    (sample) => sample.id.toLowerCase() === sampleName.toLowerCase()
  );
  if (!sample) {
    throw new InputValidationError(`sample '${sampleName}'`, "not found");
  }
  return sample;
}

export function zipFolder(folderPath: string): AdmZip {
  const zip = new AdmZip();
  zip.addLocalFolder(folderPath);
  return zip;
}

export async function downloadDirectory(
  sampleInfo: SampleUrlInfo,
  dstPath: string,
  concurrencyLimits = sampleConcurrencyLimits,
  retryLimits = sampleDefaultRetryLimits
): Promise<string[]> {
  const { samplePaths, fileUrlPrefix } = await getSampleFileInfo(sampleInfo, retryLimits);
  await downloadSampleFiles(
    sampleInfo,
    fileUrlPrefix,
    samplePaths,
    dstPath,
    sampleInfo.dir,
    retryLimits,
    concurrencyLimits
  );
  return samplePaths;
}

type SampleFileInfo = {
  tree: {
    path: string;
    type: string;
  }[];
  sha: string;
};

export async function getSampleFileInfo(urlInfo: SampleUrlInfo, retryLimits: number): Promise<any> {
  const fileInfoUrl = `https://api.github.com/repos/${urlInfo.owner}/${urlInfo.repository}/git/trees/${urlInfo.ref}?recursive=1`;
  const fileInfo = (
    await requestUtils.sendRequestWithRetry(async () => {
      return await axios.get(fileInfoUrl);
    }, retryLimits)
  ).data as SampleFileInfo;

  const samplePaths = fileInfo?.tree
    ?.filter((node) => node.path.startsWith(`${urlInfo.dir}/`) && node.type !== "tree")
    .map((node) => node.path);
  const fileUrlPrefix = `https://raw.githubusercontent.com/${urlInfo.owner}/${urlInfo.repository}/${fileInfo?.sha}/`;
  return { samplePaths, fileUrlPrefix };
}

async function downloadSampleFiles(
  sampleInfo: SampleUrlInfo,
  fileUrlPrefix: string,
  samplePaths: string[],
  dstPath: string,
  relativePath: string,
  retryLimits: number,
  concurrencyLimits: number
): Promise<void> {
  const downloadCallback = async (samplePath: string) => {
    const lfsRegex = /^.*oid sha256:[0-9a-f]+\nsize \d+/gm;
    const file = (await requestUtils.sendRequestWithRetry(async () => {
      const content = await axios.get(fileUrlPrefix + samplePath, { responseType: "arraybuffer" });
      if (lfsRegex.test(content.data.toString())) {
        return await axios.get(
          `https://media.githubusercontent.com/media/${sampleInfo.owner}/${sampleInfo.repository}/${sampleInfo.ref}/${samplePath}`,
          {
            responseType: "arraybuffer",
          }
        );
      } else {
        return content;
      }
    }, retryLimits)) as unknown as any;
    const filePath = path.join(dstPath, path.relative(`${relativePath}/`, samplePath));
    await fs.ensureFile(filePath);
    await fs.writeFile(filePath, Buffer.from(file.data));
  };
  await runWithLimitedConcurrency(samplePaths, downloadCallback, concurrencyLimits);
}

export async function runWithLimitedConcurrency<T>(
  items: T[],
  callback: (arg: T) => any,
  concurrencyLimit: number
): Promise<void> {
  const queue: any[] = [];
  for (const item of items) {
    // fire the async function, add its promise to the queue, and remove
    // it from queue when complete
    const p = callback(item)
      .then((res: any) => {
        queue.splice(queue.indexOf(p), 1);
        return res;
      })
      .catch((err: any) => {
        throw err;
      });
    queue.push(p);
    // if max concurrent, wait for one to finish
    if (queue.length >= concurrencyLimit) {
      await Promise.race(queue);
    }
  }
  // wait for the rest of the calls to finish
  await Promise.all(queue);
}

export function convertToLangKey(programmingLanguage: string): string {
  switch (programmingLanguage) {
    case ProgrammingLanguage.JS: {
      return "js";
    }
    case ProgrammingLanguage.TS: {
      return "ts";
    }
    case ProgrammingLanguage.CSharp: {
      return "csharp";
    }
    case ProgrammingLanguage.PY: {
      return "python";
    }
    case ProgrammingLanguage.None: {
      return "common";
    }
  }
  return programmingLanguage;
}

export function convertToUrl(sampleInfo: SampleUrlInfo): string {
  return `https://github.com/${sampleInfo.owner}/${sampleInfo.repository}/tree/${sampleInfo.ref}/${sampleInfo.dir}`;
}

export function simplifyAxiosError(error: AxiosError): Error {
  const simplifiedError = {
    message: error.message,
    name: error.name,
    config: error.config,
    code: error.code,
    stack: error.stack,
    status: error.response?.status,
    statusText: error.response?.statusText,
    headers: error.response?.headers,
    data: error.response?.data,
  };
  return simplifiedError;
}

export function isApiLimitError(error: Error): boolean {
  //https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api?apiVersion=2022-11-28#exceeding-the-rate-limit
  return (
    axios.isAxiosError(error) &&
    error.response?.status !== undefined &&
    [403, 429].includes(error.response.status) &&
    error.response?.headers?.["x-ratelimit-remaining"] === "0"
  );
}

export async function setGeneralSensitivityLabel(
  context: FxContext,
  declarativeAgentManifestPath: string
): Promise<void> {
  try {
    const loginStatusRes = await context.tokenProvider?.m365TokenProvider?.getStatus({
      scopes: [ListSensitivityLabelScope],
    });
    if (!loginStatusRes || loginStatusRes.isErr()) {
      context.logProvider?.info(
        getDefaultString("error.listSensitivityLabel.tokenFailed", loginStatusRes?.error.message)
      );
      return;
    }
    if (loginStatusRes.value.status != signedIn) {
      context.logProvider?.info(getDefaultString("core.listSensitivityLabel.notLogin"));
      return;
    }
    if (loginStatusRes.value.token == undefined) {
      context.logProvider?.info(getDefaultString("error.listSensitivityLabel.tokenUndefined"));
      return;
    }
    const graphClient = new GraphClient(context.tokenProvider!.m365TokenProvider as any);
    const result = await graphClient.getGeneralSentivityLabel(loginStatusRes.value.token);
    if (result.isErr()) {
      throw result.error;
    }
    const generalLabel = result.value;

    const declarativeAgentManifestRes =
      await copilotGptManifestUtils.readDeclarativeAgentManifestFile(declarativeAgentManifestPath);
    if (declarativeAgentManifestRes.isErr()) {
      context.logProvider?.info(
        getDefaultString(
          "error.readDeclarativeAgentManifest.failed",
          declarativeAgentManifestRes.error
        )
      );
      return;
    }
    const declarativeAgentManifest = declarativeAgentManifestRes.value;
    declarativeAgentManifest.sensitivity_label = {
      id: generalLabel.id,
    };
    const writeRes = await copilotGptManifestUtils.writeDeclarativeAgentManifestFile(
      declarativeAgentManifest,
      declarativeAgentManifestPath
    );
    if (writeRes.isErr()) {
      context.logProvider?.info(
        getDefaultString("error.writeDeclarativeAgentManifest.failed", writeRes.error)
      );
      return;
    }
  } catch (error) {
    context.logProvider?.info(
      getDefaultString("error.setGeneralSensitivityLabel.failed", error.message)
    );
  }
}
