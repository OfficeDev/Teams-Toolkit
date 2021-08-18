// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as path from "path";
import { cpUtils } from "./cpUtils";
import { DepsInfo, IDepsAdapter, IDepsChecker, IDepsLogger, IDepsTelemetry } from "./checker";
import { defaultHelpLink, DepsCheckerEvent, isWindows, Messages, TelemtryMessages } from "./common";
import { DepsCheckerError } from "./errors";
import * as os from "os";
import { ConfigFolderName } from "@microsoft/teamsfx-api";

export enum FuncVersion {
  v1 = "1",
  v2 = "2",
  v3 = "3",
}

const funcPackageName = "azure-functions-core-tools";
const funcToolName = "Azure Function Core Tool";

const installVersion = FuncVersion.v3;
const supportedVersions = [FuncVersion.v3];
const displayFuncName = `${funcToolName} (v${FuncVersion.v3})`;

const timeout = 5 * 60 * 1000;

export class FuncToolChecker implements IDepsChecker {
  private readonly _adapter: IDepsAdapter;
  private readonly _logger: IDepsLogger;
  private readonly _telemetry: IDepsTelemetry;

  constructor(adapter: IDepsAdapter, logger: IDepsLogger, telemetry: IDepsTelemetry) {
    this._adapter = adapter;
    this._logger = logger;
    this._telemetry = telemetry;
  }

  public getDepsInfo(): Promise<DepsInfo> {
    return Promise.resolve({
      name: funcToolName,
      isLinuxSupported: false,
      installVersion: installVersion,
      supportedVersions: supportedVersions,
      details: new Map<string, string>(),
    });
  }

  public async isEnabled(): Promise<boolean> {
    // only for function api
    const hasBackend = await this._adapter.hasTeamsfxBackend();
    const checkerEnabled = await this._adapter.funcToolCheckerEnabled();

    if (!checkerEnabled) {
      this._telemetry.sendEvent(DepsCheckerEvent.funcCheckSkipped);
    }

    return hasBackend && checkerEnabled;
  }

  public async isInstalled(): Promise<boolean> {
    const isGlobalFuncInstalled: boolean = await this.isGlobalFuncInstalled();
    const isPortableFuncInstalled: boolean = await this.isPortableFuncInstalled();

    if (isGlobalFuncInstalled) {
      this._telemetry.sendEvent(DepsCheckerEvent.funcAlreadyInstalled, {
        "global-func-version": `${await this.queryGlobalFuncVersion()}`,
      });
    }
    if (isPortableFuncInstalled) {
      // avoid missing this event after first installation 60 days
      this._telemetry.sendEvent(DepsCheckerEvent.funcInstallCompleted);
    }

    return isPortableFuncInstalled || isGlobalFuncInstalled;
  }

  public async isPortableFuncInstalled(): Promise<boolean> {
    let isVersionSupported = false,
      hasSentinel = false;
    try {
      const portableFuncVersion = await this.queryFuncVersion(
        FuncToolChecker.getPortableFuncExecPath()
      );
      isVersionSupported =
        portableFuncVersion !== null && supportedVersions.includes(portableFuncVersion);
      // to avoid "func -v" and "func new" work well, but "func start" fail.
      hasSentinel = await fs.pathExists(FuncToolChecker.getSentinelPath());
    } catch (error) {
      // do nothing
      return false;
    }
    return isVersionSupported && hasSentinel;
  }

  public async isGlobalFuncInstalled(): Promise<boolean> {
    const globalFuncVersion = await this.queryGlobalFuncVersion();
    return globalFuncVersion !== null && supportedVersions.includes(globalFuncVersion);
  }

  public async install(): Promise<void> {
    if (!(await this.hasNPM())) {
      this.handleNpmNotFound();
    }

    await this.cleanup();
    await this.installFunc();

    if (!(await this.validate())) {
      await this.handleInstallFuncFailed();
    }

    this._telemetry.sendEvent(DepsCheckerEvent.funcInstallCompleted);
    await this._logger.info(
      Messages.finishInstallFunctionCoreTool.replace("@NameVersion", displayFuncName)
    );
  }

  private async handleInstallFuncFailed(): Promise<void> {
    await this.cleanup();

    this._telemetry.sendSystemErrorEvent(
      DepsCheckerEvent.funcInstallError,
      TelemtryMessages.failedToInstallFunc,
      Messages.failToValidateFuncCoreTool.replace("@NameVersion", displayFuncName)
    );
    throw new DepsCheckerError(
      Messages.failToInstallFuncCoreTool.split("@NameVersion").join(displayFuncName),
      defaultHelpLink
    );
  }

  private async validate(): Promise<boolean> {
    let isVersionSupported = false;
    let hasSentinel = false;
    try {
      const portableFunc = await this.queryFuncVersion(FuncToolChecker.getPortableFuncExecPath());
      isVersionSupported = portableFunc !== null && supportedVersions.includes(portableFunc);
      // to avoid "func -v" and "func new" work well, but "func start" fail.
      hasSentinel = await fs.pathExists(FuncToolChecker.getSentinelPath());
    } catch (err) {
      this._telemetry.sendSystemErrorEvent(
        DepsCheckerEvent.funcValidationError,
        TelemtryMessages.failedToValidateFunc,
        err
      );
    }

    if (!isVersionSupported || !hasSentinel) {
      this._telemetry.sendEvent(DepsCheckerEvent.funcValidationError, {
        "func-v": String(isVersionSupported),
        sentinel: String(hasSentinel),
      });
    }
    return isVersionSupported && hasSentinel;
  }

  private handleNpmNotFound() {
    this._telemetry.sendEvent(DepsCheckerEvent.npmNotFound);
    throw new DepsCheckerError(
      Messages.needInstallFuncCoreTool.replace("@NameVersion", displayFuncName),
      defaultHelpLink
    );
  }

  private static getDefaultInstallPath(): string {
    return path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "func");
  }

  private static getSentinelPath(): string {
    return path.join(os.homedir(), `.${ConfigFolderName}`, "func-sentinel");
  }

  private static getPortableFuncExecPath(): string {
    return path.join(
      FuncToolChecker.getDefaultInstallPath(),
      "node_modules",
      "azure-functions-core-tools",
      "lib",
      "main.js"
    );
  }

  public async getFuncCommand(): Promise<string> {
    if (await this.isPortableFuncInstalled()) {
      return `node "${FuncToolChecker.getPortableFuncExecPath()}"`;
    }
    if (await this.isGlobalFuncInstalled()) {
      return "func";
    }
    return "npx azure-functions-core-tools@3";
  }

  private async queryFuncVersion(path: string): Promise<FuncVersion | null> {
    const output = await cpUtils.executeCommand(
      undefined,
      this._logger,
      { shell: true },
      "node",
      `"${path}"`,
      "--version"
    );
    return mapToFuncToolsVersion(output);
  }

  private async queryGlobalFuncVersion(): Promise<FuncVersion | null> {
    try {
      const output = await cpUtils.executeCommand(
        undefined,
        this._logger,
        // same as backend start, avoid powershell execution policy issue.
        { shell: isWindows() ? "cmd.exe" : true },
        "func",
        "--version"
      );
      return mapToFuncToolsVersion(output);
    } catch (error) {
      return null;
    }
  }

  private async hasNPM(): Promise<boolean> {
    try {
      const npmVersion = await cpUtils.executeCommand(
        undefined,
        this._logger,
        { shell: true },
        "npm",
        "--version"
      );
      this._telemetry.sendEvent(DepsCheckerEvent.npmAlreadyInstalled, {
        "npm-version": npmVersion,
      });

      return true;
    } catch (error) {
      this._telemetry.sendEvent(DepsCheckerEvent.npmNotFound);
      return false;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await fs.emptyDir(FuncToolChecker.getDefaultInstallPath());
      await fs.remove(FuncToolChecker.getSentinelPath());
    } catch (err) {
      await this._logger.debug(
        `Failed to clean up path: ${FuncToolChecker.getDefaultInstallPath()}, error: ${err}`
      );
    }
  }

  private async installFunc(): Promise<void> {
    await this._telemetry.sendEventWithDuration(
      DepsCheckerEvent.funcInstallScriptCompleted,
      async () => {
        await this._adapter.runWithProgressIndicator(
          async () => await this.doInstallPortableFunc(FuncVersion.v3)
        );
      }
    );
  }

  private async doInstallPortableFunc(version: FuncVersion): Promise<void> {
    await this._logger.info(
      Messages.startInstallFunctionCoreTool.replace("@NameVersion", displayFuncName)
    );

    try {
      await cpUtils.executeCommand(
        undefined,
        this._logger,
        { timeout: timeout, shell: false },
        this.getExecCommand("npm"),
        "install",
        // not use -f, to avoid npm@6 bug: exit code = 0, even if install fail
        `${funcPackageName}@${version}`,
        "--prefix",
        `${FuncToolChecker.getDefaultInstallPath()}`
      );

      await fs.ensureFile(FuncToolChecker.getSentinelPath());

      if (isWindows()) {
        // delete func.ps1 if exists to workaround the powershell execution policy issue:
        // https://github.com/npm/cli/issues/470
        const funcPSScript = await this.getFuncPSScriptPath();
        if (await fs.pathExists(funcPSScript)) {
          await this._logger.debug(`deleting func.ps1 from ${funcPSScript}`);
          await fs.remove(funcPSScript);
        }
      }
    } catch (error) {
      this._telemetry.sendSystemErrorEvent(
        DepsCheckerEvent.funcInstallScriptError,
        TelemtryMessages.failedToInstallFunc,
        error
      );
    }
  }

  private getExecCommand(command: string): string {
    return isWindows() ? `${command}.cmd` : command;
  }

  private async getFuncPSScriptPath(): Promise<string> {
    try {
      const output = await cpUtils.executeCommand(
        undefined,
        this._logger,
        {
          shell: "cmd.exe",
        },
        "where",
        "func"
      );

      const funcPath = output.split(/\r?\n/)[0];
      const funcFolder = path.dirname(funcPath);

      return path.join(funcFolder, "func.ps1");
    } catch {
      // ignore error and regard func.ps1 as not found.
      return "";
    }
  }
}

export function mapToFuncToolsVersion(output: string): FuncVersion | null {
  const regex = /(?<major_version>\d+)\.(?<minor_version>\d+)\.(?<patch_version>\d+)/gm;
  const match = regex.exec(output);
  if (!match) {
    return null;
  }

  switch (match.groups?.major_version) {
    case FuncVersion.v1:
      return FuncVersion.v1;
    case FuncVersion.v2:
      return FuncVersion.v2;
    case FuncVersion.v3:
      return FuncVersion.v3;
    default:
      return null;
  }
}
