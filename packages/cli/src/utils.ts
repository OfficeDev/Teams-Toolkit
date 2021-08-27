// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import fs from "fs-extra";
import path from "path";
import { Options } from "yargs";
import chalk from "chalk";
import * as uuid from "uuid";
import * as dotenv from "dotenv";
import {
  OptionItem,
  Question,
  err,
  ok,
  Result,
  FxError,
  ConfigFolderName,
  getSingleOption,
  SingleSelectQuestion,
  MultiSelectQuestion,
  QTreeNode,
  Inputs,
  Platform,
  Colors,
} from "@microsoft/teamsfx-api";

import { ConfigNotFoundError, InvalidEnvFile, ReadFileError } from "./error";
import AzureAccountManager from "./commonlib/azureLogin";
import { FeatureFlags } from "./constants";

type Json = { [_: string]: any };

export function getChoicesFromQTNodeQuestion(data: Question): string[] | undefined {
  const option = "staticOptions" in data ? data.staticOptions : undefined;
  if (option && option instanceof Array && option.length > 0) {
    if (typeof option[0] === "string") {
      return option as string[];
    } else {
      return (option as OptionItem[]).map((op) => op.cliName || toLocaleLowerCase(op.id));
    }
  } else {
    return undefined;
  }
}

export function getSingleOptionString(
  q: SingleSelectQuestion | MultiSelectQuestion
): string | string[] {
  const singleOption = getSingleOption(q);
  if (q.returnObject) {
    if (q.type === "singleSelect") {
      return typeof singleOption === "string" ? singleOption : singleOption.id;
    } else {
      return [singleOption[0].id];
    }
  } else {
    return singleOption;
  }
}

export function toYargsOptions(data: Question): Options {
  const choices = getChoicesFromQTNodeQuestion(data);

  let defaultValue;
  if (data.default && data.default instanceof Array && data.default.length > 0) {
    defaultValue = data.default.map((item) => item.toLocaleLowerCase());
  } else if (data.default && typeof data.default === "string") {
    defaultValue = data.default.toLocaleLowerCase();
  } else {
    defaultValue = undefined;
  }
  if (defaultValue === undefined) {
    return {
      array: data.type === "multiSelect",
      description: data.title || "",
      choices: choices,
      hidden: !!(data as any).hide,
      global: false,
      type: "string",
      coerce: choices ? toLocaleLowerCase : undefined,
    };
  }
  return {
    array: data.type === "multiSelect",
    description: data.title || "",
    default: defaultValue,
    choices: choices,
    hidden: !!(data as any).hide,
    global: false,
    type: "string",
    coerce: choices ? toLocaleLowerCase : undefined,
  };
}

export function toLocaleLowerCase(arg: any): any {
  if (typeof arg === "string") {
    return arg.toLocaleLowerCase();
  } else if (arg instanceof Array) {
    return arg.map((s: string) => s.toLocaleLowerCase());
  } else return arg;
}

export function flattenNodes(node: QTreeNode): QTreeNode[] {
  const nodeCopy = Object.assign({}, node);
  const children = (nodeCopy.children || []).concat([]);
  nodeCopy.children = undefined;
  return [nodeCopy].concat(...children.map((nd) => flattenNodes(nd)));
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getActiveEnv(): string {
  return "default";
}

export function getConfigPath(projectFolder: string, fileName: string): string {
  return path.resolve(projectFolder, `.${ConfigFolderName}`, fileName);
}

export function getEnvFilePath(projectFolder: string) {
  return getConfigPath(projectFolder, `env.${getActiveEnv()}.json`);
}

export function getSettingsFilePath(projectFolder: string) {
  return getConfigPath(projectFolder, "settings.json");
}

export async function readEnvJsonFile(projectFolder: string): Promise<Result<Json, FxError>> {
  const filePath = getEnvFilePath(projectFolder);
  if (!fs.existsSync(filePath)) {
    return err(ConfigNotFoundError(filePath));
  }
  try {
    const config = await fs.readJson(filePath);
    return ok(config);
  } catch (e) {
    return err(ReadFileError(e));
  }
}

export function readEnvJsonFileSync(projectFolder: string): Result<Json, FxError> {
  const filePath = getEnvFilePath(projectFolder);
  if (!fs.existsSync(filePath)) {
    return err(ConfigNotFoundError(filePath));
  }
  try {
    const config = fs.readJsonSync(filePath);
    return ok(config);
  } catch (e) {
    return err(ReadFileError(e));
  }
}

export function readSettingsFileSync(projectFolder: string): Result<Json, FxError> {
  const filePath = getSettingsFilePath(projectFolder);
  if (!fs.existsSync(filePath)) {
    return err(ConfigNotFoundError(filePath));
  }

  try {
    const settings = fs.readJsonSync(filePath);
    return ok(settings);
  } catch (e) {
    return err(ReadFileError(e));
  }
}

export async function readProjectSecrets(
  projectFolder: string
): Promise<Result<dotenv.DotenvParseOutput, FxError>> {
  const secretFile = getConfigPath(projectFolder, `${getActiveEnv()}.userdata`);
  if (!fs.existsSync(secretFile)) {
    return err(ConfigNotFoundError(secretFile));
  }
  try {
    const secretData = await fs.readFile(secretFile);
    return ok(dotenv.parse(secretData));
  } catch (e) {
    return err(ReadFileError(e));
  }
}

export function writeSecretToFile(secrets: dotenv.DotenvParseOutput, rootFolder: string): void {
  const secretFile = `${rootFolder}/.${ConfigFolderName}/${getActiveEnv()}.userdata`;
  const array: string[] = [];
  for (const secretKey of Object.keys(secrets)) {
    const secretValue = secrets[secretKey];
    array.push(`${secretKey}=${secretValue}`);
  }
  fs.writeFileSync(secretFile, array.join("\n"));
}

export async function getSolutionPropertyFromEnvFile(
  projectFolder: string,
  propertyName: string
): Promise<Result<any, FxError>> {
  const result = await readEnvJsonFile(projectFolder);
  if (result.isErr()) {
    return err(result.error);
  }
  const env = result.value;
  if ("solution" in env) {
    return ok(env.solution[propertyName]);
  } else {
    return err(
      InvalidEnvFile(
        `The property \`solution\` does not exist in the project's env file.`,
        getEnvFilePath(projectFolder)
      )
    );
  }
}

export async function setSubscriptionId(
  subscriptionId?: string,
  rootFolder = "./"
): Promise<Result<null, FxError>> {
  if (subscriptionId) {
    const result = await readEnvJsonFile(rootFolder);
    if (result.isErr()) {
      return err(result.error);
    }

    AzureAccountManager.setRootPath(rootFolder);
    if (subscriptionId) {
      await AzureAccountManager.setSubscription(subscriptionId);
    }
  }
  return ok(null);
}

export function isWorkspaceSupported(workspace: string): boolean {
  const p = workspace;

  const checklist: string[] = [
    p,
    `${p}/package.json`,
    `${p}/.${ConfigFolderName}`,
    `${p}/.${ConfigFolderName}/settings.json`,
    `${getEnvFilePath(p)}`,
  ];

  for (const fp of checklist) {
    if (!fs.existsSync(path.resolve(fp))) {
      return false;
    }
  }
  return true;
}

export function getTeamsAppId(rootfolder: string | undefined): any {
  if (!rootfolder) {
    return undefined;
  }

  if (isWorkspaceSupported(rootfolder)) {
    const result = readEnvJsonFileSync(rootfolder);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value.solution.remoteTeamsAppId;
  }

  return undefined;
}

export function getLocalTeamsAppId(rootfolder: string | undefined): any {
  if (!rootfolder) {
    return undefined;
  }

  if (isWorkspaceSupported(rootfolder)) {
    const result = readEnvJsonFileSync(rootfolder);
    if (result.isErr()) {
      throw result.error;
    }

    // get final setting value from env.xxx.json and xxx.userdata
    // Note: this is a workaround and need to be updated after multi-env
    try {
      const settingValue = result.value.solution.localDebugTeamsAppId as string;
      if (settingValue && settingValue.startsWith("{{") && settingValue.endsWith("}}")) {
        // setting in env.xxx.json is place holder and need to get actual value from xxx.userdata
        const placeHolder = settingValue.replace("{{", "").replace("}}", "");
        const userdataPath = getConfigPath(rootfolder, `${getActiveEnv()}.userdata`);
        if (fs.existsSync(userdataPath)) {
          const userdata = fs.readFileSync(userdataPath, "utf8");
          const userEnv = dotenv.parse(userdata);
          return userEnv[placeHolder];
        } else {
          // in collaboration scenario, userdata may not exist
          return undefined;
        }
      }

      return settingValue;
    } catch {
      // in case structure changes
      return undefined;
    }
  }

  return undefined;
}

export function getProjectId(rootfolder: string | undefined): any {
  if (!rootfolder) {
    return undefined;
  }

  if (isWorkspaceSupported(rootfolder)) {
    const result = readSettingsFileSync(rootfolder);
    if (result.isErr()) {
      throw result.error;
    }

    return result.value.projectId;
  }

  return undefined;
}

export function getSystemInputs(projectPath?: string, env?: string, previewType?: string): Inputs {
  const systemInputs: Inputs = {
    platform: Platform.CLI,
    projectPath: projectPath,
    correlationId: uuid.v4(),
    env: env,
    previewType: previewType,
  };
  return systemInputs;
}

export function argsToInputs(
  params: { [_: string]: Options },
  args: { [argName: string]: string | string[] }
): Inputs {
  const inputs = getSystemInputs();
  for (const name in params) {
    if (name.endsWith("folder") && args[name]) {
      inputs[name] = path.resolve(args[name] as string);
    } else {
      inputs[name] = args[name];
    }
  }
  const rootFolder = path.resolve((inputs["folder"] as string) || "./");
  delete inputs["folder"];
  inputs.projectPath = rootFolder;
  return inputs;
}

export function getColorizedString(message: Array<{ content: string; color: Colors }>): string {
  // Color support is automatically detected by chalk
  const colorizedMessage = message
    .map((item) => {
      switch (item.color) {
        case Colors.BRIGHT_WHITE:
          return chalk.whiteBright(item.content);
        case Colors.WHITE:
          return chalk.white(item.content);
        case Colors.BRIGHT_MAGENTA:
          return chalk.magentaBright(item.content);
        case Colors.BRIGHT_GREEN:
          return chalk.greenBright(item.content);
        case Colors.BRIGHT_RED:
          return chalk.redBright(item.content);
        case Colors.BRIGHT_YELLOW:
          return chalk.yellowBright(item.content);
        case Colors.BRIGHT_CYAN:
          return chalk.cyanBright.underline(item.content);
        default:
          return item.content;
      }
    })
    .join("");
  return colorizedMessage + (process.stdout.isTTY ? "\u00A0\u001B[K" : "");
}

/**
 * Shows in `teamsfx -v`.
 * @returns the version of teamsfx-cli.
 */
export function getVersion(): string {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkgContent = fs.readJsonSync(pkgPath);
  return pkgContent.version;
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

export function isRemoteCollaborationEnabled(): boolean {
  return isFeatureFlagEnabled(FeatureFlags.RemoteCollaboration, false);
}

export function getAllFeatureFlags(): string[] | undefined {
  const result = Object.values(FeatureFlags)
    .filter((featureFlag) => {
      return isFeatureFlagEnabled(featureFlag);
    })
    .map((featureFlag) => {
      return featureFlag;
    });

  return result;
}
