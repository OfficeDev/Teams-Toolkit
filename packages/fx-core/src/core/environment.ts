// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  ConfigFolderName,
  CryptoProvider,
  err,
  FxError,
  ok,
  Result,
  Void,
} from "@microsoft/teamsfx-api";
import path from "path";
import fs from "fs-extra";
import {
  deserializeDict,
  dataNeedEncryption,
  mergeSerectData,
  PathNotExistError,
  serializeDict,
  sperateSecretData,
  WriteFileError,
  mapToJson,
  objectToMap,
} from "..";

export interface EnvInfo {
  envName: string;
  data: Map<string, any>;
}

export interface EnvFiles {
  envProfile: string;
  userDataFile: string;
}

class EnvironmentManager {
  public readonly defaultEnvName = "default";
  private readonly envNameRegex = /env\.(?<envName>[\w\d-_]+)\.json/i;

  public async loadEnvProfile(
    projectPath: string,
    envName?: string,
    cryptoProvider?: CryptoProvider
  ): Promise<Result<EnvInfo, FxError>> {
    if (!(await fs.pathExists(projectPath))) {
      return err(PathNotExistError(projectPath));
    }

    envName = envName ?? this.defaultEnvName;
    const envFiles = this.getEnvFilesPath(envName, projectPath);
    const userDataResult = await this.loadUserData(envFiles.userDataFile, cryptoProvider);
    if (userDataResult.isErr()) {
      return err(userDataResult.error);
    }
    const userData = userDataResult.value;

    if (!(await fs.pathExists(envFiles.envProfile))) {
      return ok({ envName, data: new Map<string, any>() });
    }

    const envData = await fs.readJson(envFiles.envProfile);

    mergeSerectData(userData, envData);
    const data = objectToMap(envData);

    return ok({ envName, data });
  }

  public async writeEnvProfile(
    envData: Map<string, any>,
    projectPath: string,
    envName?: string,
    cryptoProvider?: CryptoProvider
  ): Promise<Result<Void, FxError>> {
    if (!(await fs.pathExists(projectPath))) {
      return err(PathNotExistError(projectPath));
    }

    const configFolder = this.getConfigFolder(projectPath);
    if (!(await fs.pathExists(configFolder))) {
      await fs.ensureDir(configFolder);
    }

    envName = envName ?? this.defaultEnvName;
    const envFiles = this.getEnvFilesPath(envName, projectPath);

    const data = mapToJson(envData);
    const secrets = sperateSecretData(data);
    if (cryptoProvider) {
      this.encrypt(secrets, cryptoProvider);
    }

    try {
      await fs.writeFile(envFiles.envProfile, JSON.stringify(data, null, 4));
      await fs.writeFile(envFiles.userDataFile, serializeDict(secrets));
    } catch (error) {
      return err(WriteFileError(error));
    }

    return ok(Void);
  }

  public async listEnvProfiles(projectPath: string): Promise<Result<Array<string>, FxError>> {
    if (!(await fs.pathExists(projectPath))) {
      return err(PathNotExistError(projectPath));
    }

    const configFolder = this.getConfigFolder(projectPath);
    if (!(await fs.pathExists(configFolder))) {
      return ok([]);
    }

    const configFiles = await fs.readdir(configFolder);
    const envNames = configFiles
      .map((file) => this.getEnvNameFromPath(file))
      .filter((name): name is string => name !== null);

    return ok(envNames);
  }

  public getEnvFilesPath(envName: string, projectPath: string): EnvFiles {
    const basePath = this.getConfigFolder(projectPath);
    const envProfile = path.resolve(basePath, `env.${envName}.json`);
    const userDataFile = path.resolve(basePath, `${envName}.userdata`);

    return { envProfile, userDataFile };
  }

  private getEnvNameFromPath(filePath: string): string | null {
    const match = this.envNameRegex.exec(filePath);
    if (match != null && match.groups != null) {
      return match.groups.envName;
    }

    return null;
  }

  private getConfigFolder(projectPath: string): string {
    return path.resolve(projectPath, `.${ConfigFolderName}`);
  }

  private async loadUserData(
    userDataPath: string,
    cryptoProvider?: CryptoProvider
  ): Promise<Result<Record<string, string>, FxError>> {
    if (!(await fs.pathExists(userDataPath))) {
      return ok({});
    }

    const content = await fs.readFile(userDataPath, "UTF-8");
    const secrets = deserializeDict(content);
    if (!cryptoProvider) {
      return ok(secrets);
    }

    return this.decrypt(secrets, cryptoProvider);
  }

  private encrypt(
    secrets: Record<string, string>,
    cryptoProvider: CryptoProvider
  ): Result<Record<string, string>, FxError> {
    for (const secretKey of Object.keys(secrets)) {
      if (!dataNeedEncryption(secretKey)) {
        continue;
      }
      const encryptedSecret = cryptoProvider.encrypt(secrets[secretKey]);
      // always success
      if (encryptedSecret.isOk()) {
        secrets[secretKey] = encryptedSecret.value;
      }
    }

    return ok(secrets);
  }

  private decrypt(
    secrets: Record<string, string>,
    cryptoProvider: CryptoProvider
  ): Result<Record<string, string>, FxError> {
    for (const secretKey of Object.keys(secrets)) {
      if (!dataNeedEncryption(secretKey)) {
        continue;
      }

      const secretValue = secrets[secretKey];
      const plaintext = cryptoProvider.decrypt(secretValue);
      if (plaintext.isErr()) {
        return err(plaintext.error);
      }

      secrets[secretKey] = plaintext.value;
    }

    return ok(secrets);
  }
}

export const environmentManager = new EnvironmentManager();
