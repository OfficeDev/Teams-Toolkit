// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { exec, ExecOptions } from "child_process";
import * as fs from "fs-extra";
import {
  AzureAccountProvider,
  ConfigFolderName,
  ConfigMap,
  err,
  FxError,
  Json,
  ok,
  OptionItem,
  Result,
  returnSystemError,
  returnUserError,
  SubscriptionInfo,
  UserInteraction,
  AppPackageFolderName,
} from "@microsoft/teamsfx-api";
import { promisify } from "util";
import axios from "axios";
import AdmZip from "adm-zip";
import * as path from "path";
import * as uuid from "uuid";
import { glob } from "glob";
import { getResourceFolder } from "../folder";
import * as Handlebars from "handlebars";
import { ConstantString, FeatureFlagName } from "./constants";

Handlebars.registerHelper("contains", (value, array, options) => {
  array = array instanceof Array ? array : [array];
  return array.indexOf(value) > -1 ? options.fn(this) : "";
});
Handlebars.registerHelper("notContains", (value, array, options) => {
  array = array instanceof Array ? array : [array];
  return array.indexOf(value) == -1 ? options.fn(this) : "";
});

export const Executor = {
  async execCommandAsync(command: string, options?: ExecOptions) {
    const execAsync = promisify(exec);
    await execAsync(command, options);
  },
};

export async function npmInstall(path: string) {
  await Executor.execCommandAsync("npm install", {
    cwd: path,
  });
}

export async function ensureUniqueFolder(folderPath: string): Promise<string> {
  let folderId = 1;
  let testFolder = folderPath;

  let pathExists = await fs.pathExists(testFolder);
  while (pathExists) {
    testFolder = `${folderPath}${folderId}`;
    folderId++;

    pathExists = await fs.pathExists(testFolder);
  }

  return testFolder;
}

/**
 * Convert a `Map` to a Json recursively.
 * @param {Map} map to convert.
 * @returns {Json} converted Json.
 */
export function mapToJson(map: Map<any, any>): Json {
  const out: Json = {};
  for (const entry of map.entries()) {
    if (entry[1] instanceof Map) {
      out[entry[0]] = mapToJson(entry[1]);
    } else {
      out[entry[0]] = entry[1];
    }
  }
  return out;
}

/**
 * Convert an `Object` to a Map recursively
 * @param {Json} Json to convert.
 * @returns {Map} converted Json.
 */
export function objectToMap(o: Json): Map<any, any> {
  const m = new Map();
  for (const entry of Object.entries(o)) {
    if (entry[1] instanceof Array) {
      m.set(entry[0], entry[1]);
    } else if (entry[1] instanceof Object) {
      m.set(entry[0], objectToConfigMap(entry[1] as Json));
    } else {
      m.set(entry[0], entry[1]);
    }
  }
  return m;
}

/**
 * @param {Json} Json to convert.
 * @returns {Map} converted Json.
 */
export function objectToConfigMap(o?: Json): ConfigMap {
  const m = new ConfigMap();
  if (o) {
    for (const entry of Object.entries(o)) {
      {
        m.set(entry[0], entry[1]);
      }
    }
  }
  return m;
}

const SecretDataMatchers = [
  "solution.localDebugTeamsAppId",
  "solution.teamsAppTenantId",
  "fx-resource-aad-app-for-teams.clientSecret",
  "fx-resource-aad-app-for-teams.local_clientSecret",
  "fx-resource-aad-app-for-teams.local_clientId",
  "fx-resource-aad-app-for-teams.local_objectId",
  "fx-resource-aad-app-for-teams.local_oauth2PermissionScopeId",
  "fx-resource-aad-app-for-teams.local_tenantId",
  "fx-resource-aad-app-for-teams.local_applicationIdUris",
  "fx-resource-simple-auth.filePath",
  "fx-resource-simple-auth.environmentVariableParams",
  "fx-resource-local-debug.*",
  "fx-resource-bot.botPassword",
  "fx-resource-bot.localBotPassword",
  "fx-resource-bot.localBotId",
  "fx-resource-bot.localObjectId",
  "fx-resource-bot.local_redirectUri",
  "fx-resource-bot.bots",
  "fx-resource-bot.composeExtensions",
  "fx-resource-apim.apimClientAADClientSecret",
];

export const CryptoDataMatchers = new Set([
  "fx-resource-aad-app-for-teams.clientSecret",
  "fx-resource-aad-app-for-teams.local_clientSecret",
  "fx-resource-simple-auth.environmentVariableParams",
  "fx-resource-bot.botPassword",
  "fx-resource-bot.localBotPassword",
  "fx-resource-apim.apimClientAADClientSecret",
]);

/**
 * Only data related to secrets need encryption.
 * @param key - the key name of data in user data file
 * @returns whether it needs encryption
 */
export function dataNeedEncryption(key: string): boolean {
  return CryptoDataMatchers.has(key);
}

export function sperateSecretData(configJson: Json): Record<string, string> {
  const res: Record<string, string> = {};
  for (const matcher of SecretDataMatchers) {
    const splits = matcher.split(".");
    const resourceId = splits[0];
    const item = splits[1];
    const resourceConfig: any = configJson[resourceId];
    if (!resourceConfig) continue;
    if ("*" !== item) {
      const configValue = resourceConfig[item];
      if (configValue) {
        const keyName = `${resourceId}.${item}`;
        res[keyName] = configValue;
        resourceConfig[item] = `{{${keyName}}}`;
      }
    } else {
      for (const itemName of Object.keys(resourceConfig)) {
        const configValue = resourceConfig[itemName];
        if (configValue !== undefined) {
          const keyName = `${resourceId}.${itemName}`;
          res[keyName] = configValue;
          resourceConfig[itemName] = `{{${keyName}}}`;
        }
      }
    }
  }
  return res;
}

export function mergeSerectData(dict: Record<string, string>, configJson: Json): void {
  for (const matcher of SecretDataMatchers) {
    const splits = matcher.split(".");
    const resourceId = splits[0];
    const item = splits[1];
    const resourceConfig: any = configJson[resourceId];
    if (!resourceConfig) continue;
    if ("*" !== item) {
      const originalItemValue: string | undefined = resourceConfig[item] as string | undefined;
      if (
        originalItemValue &&
        originalItemValue.startsWith("{{") &&
        originalItemValue.endsWith("}}")
      ) {
        const keyName = `${resourceId}.${item}`;
        resourceConfig[item] = dict[keyName];
      }
    } else {
      for (const itemName of Object.keys(resourceConfig)) {
        const originalItemValue = resourceConfig[itemName];
        if (
          originalItemValue &&
          originalItemValue.startsWith("{{") &&
          originalItemValue.endsWith("}}")
        ) {
          const keyName = `${resourceId}.${itemName}`;
          resourceConfig[itemName] = dict[keyName];
        }
      }
    }
  }
}

export function serializeDict(dict: Record<string, string>): string {
  const array: string[] = [];
  for (const key of Object.keys(dict)) {
    const value = dict[key];
    array.push(`${key}=${value}`);
  }
  return array.join("\n");
}

export function deserializeDict(data: string): Record<string, string> {
  const lines = data.split("\n");
  const dict: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf("=");
    if (index > 0) {
      const key = line.substr(0, index);
      const value = line.substr(index + 1);
      dict[key] = value;
    }
  }
  return dict;
}

export async function fetchCodeZip(url: string) {
  let retries = 3;
  let result = undefined;
  while (retries > 0) {
    retries--;
    try {
      result = await axios.get(url, {
        responseType: "arraybuffer",
      });
      if (result.status === 200 || result.status === 201) {
        return result;
      }
    } catch (e) {
      await new Promise<void>((resolve: () => void): NodeJS.Timer => setTimeout(resolve, 10000));
    }
  }
  return result;
}

export async function saveFilesRecursively(
  zip: AdmZip,
  appFolder: string,
  dstPath: string
): Promise<void> {
  await Promise.all(
    zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && entry.entryName.includes(appFolder))
      .map(async (entry) => {
        const entryPath = entry.entryName.substring(entry.entryName.indexOf("/") + 1);
        const filePath = path.join(dstPath, entryPath);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, entry.getData());
      })
  );
}

export async function downloadSampleHook(sampleId: string, sampleAppPath: string) {
  // A temporary solution to avoid duplicate componentId
  if (sampleId === "todo-list-SPFx") {
    const originalId = "c314487b-f51c-474d-823e-a2c3ec82b1ff";
    const componentId = uuid.v4();
    glob.glob(`${sampleAppPath}/**/*.json`, { nodir: true, dot: true }, async (err, files) => {
      await Promise.all(
        files.map(async (file) => {
          let content = (await fs.readFile(file)).toString();
          const reg = new RegExp(originalId, "g");
          content = content.replace(reg, componentId);
          await fs.writeFile(file, content);
        })
      );
    });
  }
}

export const deepCopy = <T>(target: T): T => {
  if (target === null) {
    return target;
  }
  if (target instanceof Date) {
    return new Date(target.getTime()) as any;
  }
  if (target instanceof Array) {
    const cp = [] as any[];
    (target as any[]).forEach((v) => {
      cp.push(v);
    });
    return cp.map((n: any) => deepCopy<any>(n)) as any;
  }
  if (typeof target === "object" && target !== {}) {
    const cp = { ...(target as { [key: string]: any }) } as {
      [key: string]: any;
    };
    Object.keys(cp).forEach((k) => {
      cp[k] = deepCopy<any>(cp[k]);
    });
    return cp as T;
  }
  return target;
};

export function getStrings(): any {
  const filepath = path.resolve(getResourceFolder(), "strings.json");
  return fs.readJSONSync(filepath);
}

export function isUserCancelError(error: Error): boolean {
  const errorName = "name" in error ? (error as any)["name"] : "";
  return (
    errorName === "User Cancel" ||
    errorName === getStrings().solution.CancelProvision ||
    errorName === "UserCancel"
  );
}

export async function askSubscription(
  azureAccountProvider: AzureAccountProvider,
  ui: UserInteraction,
  activeSubscriptionId?: string
): Promise<Result<SubscriptionInfo, FxError>> {
  const subscriptions: SubscriptionInfo[] = await azureAccountProvider.listSubscriptions();

  if (subscriptions.length === 0) {
    return err(
      returnUserError(new Error("Failed to find a subscription."), "Core", "NoSubscriptionFound")
    );
  }
  let resultSub = subscriptions.find((sub) => sub.subscriptionId === activeSubscriptionId);
  if (activeSubscriptionId === undefined || resultSub === undefined) {
    let selectedSub: SubscriptionInfo | undefined = undefined;
    if (subscriptions.length === 1) {
      selectedSub = subscriptions[0];
    } else {
      const options: OptionItem[] = subscriptions.map((sub) => {
        return {
          id: sub.subscriptionId,
          label: sub.subscriptionName,
          data: sub.tenantId,
        } as OptionItem;
      });
      const askRes = await ui.selectOption({
        name: "subscription",
        title: "Select a subscription",
        options: options,
        returnObject: true,
      });
      if (askRes.isErr()) return err(askRes.error);
      const subItem = askRes.value.result as OptionItem;
      selectedSub = {
        subscriptionId: subItem.id,
        subscriptionName: subItem.label,
        tenantId: subItem.data as string,
      };
    }
    if (selectedSub === undefined) {
      return err(
        returnSystemError(new Error("Subscription not found"), "Core", "NoSubscriptionFound")
      );
    }
    resultSub = selectedSub;
  }
  return ok(resultSub);
}

// Determine whether feature flag is enabled based on environment variable setting
export function isFeatureFlagEnabled(featureFlagName: string, defaultValue = false): boolean {
  const flag = process.env[featureFlagName];
  if (flag === undefined) {
    return defaultValue; // allows consumer to set a default value when environment variable not set
  } else {
    return flag === "1" || flag.toLowerCase() === "true"; // can enable feature flag by set environment variable value to "1" or "true"
  }
}

export function isMultiEnvEnabled(): boolean {
  return isFeatureFlagEnabled(FeatureFlagName.MultiEnv, false);
}

export function isArmSupportEnabled(): boolean {
  return isFeatureFlagEnabled("TEAMSFX_ARM_SUPPORT", false);
}

export async function generateBicepFiles(
  templateFilePath: string,
  context: any
): Promise<Result<string, FxError>> {
  try {
    const templateString = await fs.readFile(templateFilePath, ConstantString.UTF8Encoding);
    const updatedBicepFile = compileHandlebarsTemplateString(templateString, context);
    return ok(updatedBicepFile);
  } catch (error) {
    return err(
      returnSystemError(
        new Error(`Failed to generate bicep file ${templateFilePath}. Reason: ${error.message}`),
        "Core",
        "BicepGenerationError"
      )
    );
  }
}

export function compileHandlebarsTemplateString(templateString: string, context: any): string {
  const template = Handlebars.compile(templateString);
  return template(context);
}

export async function getAppDirectory(projectRoot: string): Promise<string> {
  const REMOTE_MANIFEST = "manifest.source.json";
  const appDirNewLoc = `${projectRoot}/${AppPackageFolderName}`;
  const appDirOldLoc = `${projectRoot}/.${ConfigFolderName}`;

  if (await fs.pathExists(`${appDirNewLoc}/${REMOTE_MANIFEST}`)) {
    return appDirNewLoc;
  } else {
    return appDirOldLoc;
  }
}

/**
 * Get app studio endpoint for prod/int environment, mainly for ux e2e test
 */
export function getAppStudioEndpoint(): string {
  if (process.env.APP_STUDIO_ENV && process.env.APP_STUDIO_ENV === "int") {
    return "https://dev-int.teams.microsoft.com";
  } else {
    return "https://dev.teams.microsoft.com";
  }
}

export async function copyFiles(
  srcPath: string,
  distPath: string,
  excludeFileList: { fileName: string; recursive: boolean }[] = []
): Promise<void> {
  await fs.ensureDir(distPath);

  const excludeFileNames = excludeFileList.map((file) => file.fileName);
  const recursiveExcludeFileNames = excludeFileList
    .filter((file) => file.recursive)
    .map((file) => file.fileName);

  const fileNames = await fs.readdir(srcPath);
  for (const fileName of fileNames) {
    if (excludeFileNames.includes(fileName)) {
      continue;
    }
    await fs.copy(path.join(srcPath, fileName), path.join(distPath, fileName), {
      overwrite: false,
      errorOnExist: true,
      filter: (src: string, dest: string): boolean =>
        !recursiveExcludeFileNames.includes(path.basename(src)),
    });
  }
}
