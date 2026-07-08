// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, FxError, ok, Result } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { cloneDeep, merge } from "lodash";
import { settingsUtil } from "./settingsUtil";
import { LocalCrypto } from "../../core/crypto";
import { pathUtils } from "./pathUtils";
import { globalVars, TOOLS } from "../../common/globalVars";
import * as path from "path";
import { EOL } from "os";
import { TelemetryEvent } from "../../common/telemetry";
import { createHash } from "crypto";
import { FileNotFoundError } from "../../error/common";
import { internalOutputNames as UpdateTeamsAppOutputNames } from "../driver/teamsApp/configure";
import { environmentNameManager } from "../../core/environmentName";

export type DotenvOutput = {
  [k: string]: string;
};

interface EligibleKeySettings {
  [key: string]: boolean;
}

const EligibleKeys: EligibleKeySettings = {
  TEAMSFX_ENV: true,
  AZURE_SUBSCRIPTION_ID: false,
  BOT_ID: false,
  TEAMS_APP_ID: false,
  TAB_ENDPOINT: true,
  TEAMS_APP_TENANT_ID: false,
};

class EnvUtil {
  /**
   * read .env file and set to process.env (if loadToProcessEnv = true)
   * if silent = true, no error will return if .env file is not available, this function returns ok({ TEAMSFX_ENV: env })
   * if silent = false, this function will return error if .env file is not available.
   * @param projectPath
   * @param env
   * @param loadToProcessEnv
   * @param silent
   * @returns
   */
  async readEnv(
    projectPath: string,
    env: string,
    loadToProcessEnv = true,
    silent = true
  ): Promise<Result<DotenvOutput, FxError>> {
    // read
    const dotEnvFilePathRes = await pathUtils.getEnvFilePath(projectPath, env);
    if (dotEnvFilePathRes.isErr()) return err(dotEnvFilePathRes.error);
    const dotEnvFilePath = dotEnvFilePathRes.value;

    //global var
    globalVars.envFilePath = dotEnvFilePath;

    if (!dotEnvFilePath || !(await fs.pathExists(dotEnvFilePath))) {
      if (silent) {
        // .env file does not exist, just ignore
        if (loadToProcessEnv) {
          process.env.TEAMSFX_ENV = env;
        }
        return ok({ TEAMSFX_ENV: env });
      } else {
        return err(new FileNotFoundError("core", dotEnvFilePath || `.env.${env}`));
      }
    }

    // deserialize
    const parseResult = dotenvUtil.deserialize(
      await fs.readFile(dotEnvFilePath, { encoding: "utf8" })
    );

    // get .env.xxx.user path
    const dotEnvSecretFilePath = dotEnvFilePath + ".user";
    let parseResultSecret;
    if (await fs.pathExists(dotEnvSecretFilePath)) {
      // only need to decrypt the .env.xxx.user file
      parseResultSecret = dotenvUtil.deserialize(
        await fs.readFile(dotEnvSecretFilePath, { encoding: "utf8" })
      );
      // decrypt
      const settingsRes = await settingsUtil.readSettings(projectPath);
      if (settingsRes.isErr()) {
        return err(settingsRes.error);
      }
      const projectId = settingsRes.value.trackingId;
      const cryptoProvider = new LocalCrypto(projectId);
      for (const key of Object.keys(parseResultSecret.obj)) {
        if (key.startsWith("SECRET_")) {
          const raw = parseResultSecret.obj[key];
          if (raw.startsWith("crypto_")) {
            const decryptRes = cryptoProvider.decrypt(raw);
            if (decryptRes.isErr()) return err(decryptRes.error);
            parseResultSecret.obj[key] = decryptRes.value;
          }
        }
      }
    }

    // set process.env
    parseResult.obj.TEAMSFX_ENV = env;
    if (loadToProcessEnv) {
      // '.env.xxx' has higher priority than '.env.xxx.user'
      if (parseResultSecret) this.mergeEnv(parseResult.obj, parseResultSecret.obj);
      // 'process.env' has higher priority than '.env.xxx'
      this.mergeEnv(process.env, parseResult.obj);
    }

    const props: { [key: string]: string } = {};
    const prefix = "env.";
    for (const key of Object.keys(parseResult.obj)) {
      if (Object.keys(EligibleKeys).includes(key)) {
        const value = parseResult.obj[key];
        if (key === "TEAMSFX_ENV" && (value === "dev" || value === "local")) {
          props[prefix + key] = value;
        } else {
          props[prefix + key] = EligibleKeys[key]
            ? createHash("sha256").update(value).digest("hex")
            : value;
        }
      }
    }

    TOOLS.telemetryReporter?.sendTelemetryEvent(TelemetryEvent.MetaData, props);

    return ok(parseResult.obj);
  }

  async loadEnvFile(dotEnvFilePath: string): Promise<Result<DotenvOutput, FxError>> {
    const parseResult = dotenvUtil.deserialize(
      await fs.readFile(dotEnvFilePath, { encoding: "utf8" })
    );
    this.mergeEnv(process.env, parseResult.obj);
    globalVars.envFilePath = dotEnvFilePath;
    return ok(parseResult.obj);
  }

  mergeEnv(
    envWithHigherPriority: NodeJS.ProcessEnv | DotenvOutput,
    envWithLowerPriority: DotenvOutput
  ) {
    for (const key of Object.keys(envWithLowerPriority)) {
      if (!envWithHigherPriority[key]) {
        envWithHigherPriority[key] = envWithLowerPriority[key];
      }
    }
  }

  /**
   * write env variables into .env file,
   * if .env file does not exist, this function will create a default one
   * if .env fila path is not available, the default path is `./env/.env.{env}`
   * @param projectPath
   * @param env
   * @param envs
   * @returns
   */
  async writeEnv(
    projectPath: string,
    env: string,
    envs: DotenvOutput
  ): Promise<Result<undefined, FxError>> {
    envs.TEAMSFX_ENV = env;
    //encrypt
    const settingsRes = await settingsUtil.readSettings(projectPath);
    if (settingsRes.isErr()) {
      return err(settingsRes.error);
    }
    const projectId = settingsRes.value.trackingId;
    const cryptoProvider = new LocalCrypto(projectId);
    const noneSecretEnv: DotenvOutput = {};
    const secretEnv: DotenvOutput = {};
    for (const key of Object.keys(envs)) {
      let value = envs[key];
      if (value && key.startsWith("SECRET_")) {
        const res = cryptoProvider.encrypt(value);
        if (res.isErr()) return err(res.error);
        value = res.value;
        // envs[key] = value;
        secretEnv[key] = value;
      } else if (key === UpdateTeamsAppOutputNames.teamsAppUpdateTime) {
        // Corner case: Avoid TEAMS_APP_UPDATE_TIME to be committed and cause merge conflict
        // Bug: 21970450
        secretEnv[key] = value;
      } else {
        noneSecretEnv[key] = value;
      }
    }

    //replace existing, if env file not exist, create a default one
    const dotEnvFilePathRes = await pathUtils.getEnvFilePath(projectPath, env);
    if (dotEnvFilePathRes.isErr()) return err(dotEnvFilePathRes.error);
    const dotEnvFilePath =
      dotEnvFilePathRes.value || path.resolve(projectPath, "env", `.env.${env ? env : "dev"}`);
    const envFileExists = await fs.pathExists(dotEnvFilePath);
    const dotEnvSecretFilePath = dotEnvFilePath + ".user";
    const envSecretFileExists = await fs.pathExists(dotEnvSecretFilePath);
    const parsedDotenv = envFileExists
      ? dotenvUtil.deserialize(await fs.readFile(dotEnvFilePath))
      : { obj: {} };
    const parsedDotenvSecret = envSecretFileExists
      ? dotenvUtil.deserialize(await fs.readFile(dotEnvSecretFilePath))
      : { obj: {} };
    merge(parsedDotenv.obj, noneSecretEnv);
    merge(parsedDotenvSecret.obj, secretEnv);

    //serialize
    const content = dotenvUtil.serialize(parsedDotenv);
    const contentSecret = dotenvUtil.serialize(parsedDotenvSecret);

    //persist
    await fs.ensureFile(dotEnvFilePath);
    await fs.writeFile(dotEnvFilePath, content, { encoding: "utf8" });
    if (Object.keys(parsedDotenvSecret.obj).length > 0) {
      await fs.ensureFile(dotEnvSecretFilePath);
      await fs.writeFile(dotEnvSecretFilePath, contentSecret, { encoding: "utf8" });
    }
    if (!envFileExists) {
      TOOLS.logProvider.info("  Created environment file at " + dotEnvFilePath + EOL + EOL);
    }
    if (!envSecretFileExists && Object.keys(parsedDotenvSecret.obj).length > 0) {
      TOOLS.logProvider.info(
        "  Created environment file (secret) at " + dotEnvSecretFilePath + EOL + EOL
      );
    }
    return ok(undefined);
  }
  async listEnv(projectPath: string, remoteOnly = false): Promise<Result<string[], FxError>> {
    const folderRes = await pathUtils.getEnvFolderPath(projectPath);
    if (folderRes.isErr()) return err(folderRes.error);
    const envFolderPath = folderRes.value;
    if (!envFolderPath) return ok([]);
    const list = await fs.readdir(envFolderPath);
    let envs = list
      .map((fileName) => this.extractEnvNameFromFileName(fileName))
      .filter((env) => env !== undefined);
    if (remoteOnly) {
      envs = envs.filter((env) => environmentNameManager.isRemoteEnvironment(env));
    }
    return ok(envs);
  }
  object2map(obj: DotenvOutput): Map<string, string> {
    const map = new Map<string, string>();
    for (const key of Object.keys(obj)) {
      map.set(key, obj[key]);
    }
    return map;
  }
  map2object(map: Map<string, string>): DotenvOutput {
    const obj: DotenvOutput = {};
    for (const key of map.keys()) {
      obj[key] = map.get(key) || "";
    }
    return obj;
  }

  extractEnvNameFromFileName(inputFileName: string): string | undefined {
    const regex = /^\.env\.([\w\d-_]+)$/;
    const matches = inputFileName.match(regex);
    const envName = matches && matches[1];
    return envName || undefined;
  }

  async resetEnv(projectPath: string, env: string, ignoreKeys: string[]): Promise<void> {
    const envFilePathRes = await pathUtils.getEnvFilePath(projectPath, env);
    if (envFilePathRes.isErr()) return;
    const envFilePath = envFilePathRes.value;
    if (!envFilePath) return;
    await this.resetEnvFile(envFilePath, ignoreKeys);
    const dotEnvSecretFilePath = envFilePath + ".user";
    if (await fs.pathExists(dotEnvSecretFilePath)) {
      await this.resetEnvFile(dotEnvSecretFilePath, ignoreKeys);
    }
  }

  async resetEnvFile(envFilePath: string, ignoreKeys: string[]): Promise<void> {
    const parseResult = dotenvUtil.deserialize(
      await fs.readFile(envFilePath, { encoding: "utf8" })
    );
    for (const key of Object.keys(parseResult.obj)) {
      if (!ignoreKeys.includes(key)) {
        parseResult.obj[key] = "";
      }
    }
    await fs.writeFile(envFilePath, dotenvUtil.serialize(parseResult), { encoding: "utf8" });
  }
}

export const envUtil = new EnvUtil();

const NEW_LINE_SPLITTER = /\r?\n/;
type DotenvParsedLine =
  string | { key: string; value: string; comment?: string; quote?: '"' | "'" };
interface DotenvParseResult {
  lines?: DotenvParsedLine[];
  obj: DotenvOutput;
}

class DotenvUtil {
  deserialize(src: string | Buffer): DotenvParseResult {
    const lines: DotenvParsedLine[] = [];
    const obj: DotenvOutput = {};
    const stringLines = src.toString().replace(/\r\n?/gm, "\n").split(NEW_LINE_SPLITTER);
    for (const line of stringLines) {
      const match =
        /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm.exec(
          line
        );
      if (match) {
        let inlineComment;
        //key
        const key = match[1];
        //value
        let value = match[2] || "";
        //comment
        const valueIndex = match[0].indexOf(value);
        if (valueIndex >= 0) {
          const remaining = match[0].substring(valueIndex + value.length).trim();
          if (remaining.startsWith("#")) {
            inlineComment = remaining;
          }
        }
        //trim
        value = value.trim();
        //quote
        const firstChar = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
        //de-escape
        if (firstChar === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        //output
        obj[key] = value;
        const parsedLine: DotenvParsedLine = { key: key, value: value };
        if (inlineComment) parsedLine.comment = inlineComment;
        if (firstChar === '"' || firstChar === "'") parsedLine.quote = firstChar;
        lines.push(parsedLine);
      } else {
        lines.push(line);
      }
    }
    return { lines: lines, obj: obj };
  }
  serialize(parsed: DotenvParseResult): string {
    const array: string[] = [];
    const obj = cloneDeep(parsed.obj);
    //append lines
    if (parsed.lines) {
      parsed.lines.forEach((line) => {
        if (typeof line === "string") {
          // keep comment line or empty line
          array.push(line);
        } else {
          if (obj[line.key] !== undefined) {
            // use kv in obj
            line.value = obj[line.key];
            delete obj[line.key];
          }
          if (line.value.includes("#") && !line.quote) {
            // if value contains '#', need add quote
            line.quote = '"';
          }
          let value = line.value;
          if (line.quote) {
            value = `${line.quote}${value}${line.quote}`;
          }
          array.push(`${line.key}=${value}${line.comment ? " " + line.comment : ""}`);
        }
      });
    }
    //append additional kvs in object
    for (const key of Object.keys(obj)) {
      let value = parsed.obj[key];
      if (value.includes("#")) value = `"${value}"`; // if value contains '#', need add quote
      array.push(`${key}=${value}`);
    }
    return array.join("\n").trim();
  }
}

export const dotenvUtil = new DotenvUtil();
