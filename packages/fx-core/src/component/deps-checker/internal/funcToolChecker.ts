// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Xiaofu Huang <xiaofhua@microsoft.com>
 */
import { ConfigFolderName, err, ok, Result, UserError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import semver from "semver";
import * as uuid from "uuid";
import { getDefaultString, getLocalizedString } from "../../../common/localizeUtils";
import { DepsCheckerError, InstallSoftwareError, NodejsNotFoundError } from "../../../error";
import { functionToolInstallationLink, v3DefaultHelpLink } from "../constant/helpLink";
import { Messages } from "../constant/message";
import { TelemetryProperties } from "../constant/telemetry";
import { DependencyStatus, DepsChecker, DepsType, FuncInstallOptions } from "../depsChecker";
import { DepsLogger } from "../depsLogger";
import { DepsTelemetry } from "../depsTelemetry";
import { cpUtils } from "../util/cpUtils";
import { createSymlink, rename, unlinkSymlink } from "../util/fileHelper";
import { isLinux, isWindows } from "../util/system";
import { NodeChecker } from "./nodeChecker";

type FuncVersion = {
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  versionStr: string;
};

const nodeFuncVersionRangeMapping: { [key: string]: string } = {
  "22": ">=4.0.5530",
  "24": ">=4.0.5530",
};

const funcPackageName = "azure-functions-core-tools";
const funcToolName = "Azure Functions Core Tools";

const timeout = 10 * 60 * 1000;

const homedir = () => os.homedir();

export class FuncToolChecker implements DepsChecker {
  private telemetryProperties: { [key: string]: string };
  constructor(logger?: DepsLogger, telemetry?: DepsTelemetry) {
    this.telemetryProperties = {};
  }

  public async getDepsInfo(
    funcVersion: FuncVersion | undefined,
    binFolder: string | undefined,
    error?: UserError
  ): Promise<DependencyStatus> {
    return Promise.resolve({
      name: funcToolName,
      type: DepsType.FuncCoreTools,
      isInstalled: !!funcVersion,
      command: "func",
      details: {
        isLinuxSupported: false,
        installVersion: funcVersion?.versionStr ?? undefined,
        supportedVersions: [], // TODO: removed this field
        binFolders: binFolder ? [binFolder] : undefined,
      },
      telemetryProperties: this.telemetryProperties,
      error: error,
    });
  }

  public async resolve(installOptions: FuncInstallOptions): Promise<DependencyStatus> {
    let installationInfo: DependencyStatus;
    try {
      const nodeVersion = await this.getNodeVersion();
      installationInfo = await this.getInstallationInfo(installOptions);
      if (!installationInfo.isInstalled) {
        const symlinkDir = installOptions.symlinkDir
          ? path.resolve(installOptions.projectPath, installOptions.symlinkDir)
          : undefined;
        installationInfo = await this.install(installOptions.version, symlinkDir);
      }

      if (
        !installationInfo.error &&
        installationInfo.isInstalled &&
        installationInfo.details.installVersion
      ) {
        const expectedFuncNodeError = this.checkExpectedFuncAndNode(
          installationInfo.details.installVersion,
          nodeVersion
        );
        if (expectedFuncNodeError) {
          installationInfo.error = expectedFuncNodeError;
        }
      }

      return installationInfo;
    } catch (error) {
      if (error instanceof UserError) {
        return await this.getDepsInfo(undefined, undefined, error);
      }
      return await this.getDepsInfo(
        undefined,
        undefined,
        new DepsCheckerError(error.message, v3DefaultHelpLink)
      );
    }
  }

  public async getInstallationInfo(installOptions: FuncInstallOptions): Promise<DependencyStatus> {
    const symlinkDir = installOptions.symlinkDir
      ? path.resolve(installOptions.projectPath, installOptions.symlinkDir)
      : undefined;

    if (symlinkDir) {
      const symlinkFuncRes = await this.checkFuncVersion(
        installOptions.version,
        symlinkDir,
        undefined
      );
      if (symlinkFuncRes.isOk()) {
        this.telemetryProperties[TelemetryProperties.SymlinkFuncVersion] =
          symlinkFuncRes.value.versionStr;
        return await this.getDepsInfo(symlinkFuncRes.value, symlinkDir);
      } else {
        this.telemetryProperties[TelemetryProperties.SymlinkFuncVersionError] =
          symlinkFuncRes.error.message;
        await unlinkSymlink(symlinkDir);
      }
    }

    const portableFunc = await this.checkPortableFuncVersion(installOptions.version);
    if (portableFunc) {
      this.telemetryProperties[TelemetryProperties.SelectedPortableFuncVersion] =
        portableFunc.funcVersion.versionStr;
      if (symlinkDir) {
        await createSymlink(portableFunc.binFolder, symlinkDir);
        return await this.getDepsInfo(portableFunc.funcVersion, symlinkDir);
      }
      return await this.getDepsInfo(portableFunc.funcVersion, portableFunc.binFolder);
    }

    const globalFuncRes = await this.checkFuncVersion(installOptions.version, undefined, undefined);
    if (globalFuncRes.isOk()) {
      this.telemetryProperties[TelemetryProperties.GlobalFuncVersion] =
        globalFuncRes.value.versionStr;
      return await this.getDepsInfo(globalFuncRes.value, undefined);
    } else {
      this.telemetryProperties[TelemetryProperties.GlobalFuncVersionError] =
        globalFuncRes.error.message;
      return await this.getDepsInfo(undefined, undefined);
    }
  }

  private async getNodeVersion(): Promise<string> {
    const nodeVersion = (await NodeChecker.getInstalledNodeVersion())?.majorVersion;
    if (!nodeVersion) {
      throw new NodejsNotFoundError();
    }
    return nodeVersion;
  }

  private checkExpectedFuncAndNode(
    funcVersion: string,
    nodeVersion: string
  ): DepsCheckerError | undefined {
    const funcVersionRange = nodeFuncVersionRangeMapping[nodeVersion];
    if (funcVersionRange && !semver.satisfies(funcVersion, funcVersionRange)) {
      return new DepsCheckerError(
        Messages.portableFuncNodeNotMatched(nodeVersion, funcVersion),
        v3DefaultHelpLink
      );
    }
    return undefined;
  }

  private async checkPortableFuncVersion(expectedFuncVersion: string): Promise<
    | {
        funcVersion: FuncVersion;
        binFolder: string;
      }
    | undefined
  > {
    try {
      const historyFuncBinFolder = FuncToolChecker.getPortableFuncBinFolder(undefined);
      const historyFuncRes = await this.checkFuncVersion(
        expectedFuncVersion,
        historyFuncBinFolder,
        FuncToolChecker.getHistorySentinelPath()
      );
      if (historyFuncRes.isOk()) {
        this.telemetryProperties[TelemetryProperties.HistoryFuncVersion] =
          historyFuncRes.value.versionStr;
      } else {
        this.telemetryProperties[TelemetryProperties.HistoryFuncVersionError] =
          historyFuncRes.error.message;
      }

      const versioningFuncStatus = await this.getVersioningPortableFunc(expectedFuncVersion);
      if (
        versioningFuncStatus &&
        (historyFuncRes.isErr() ||
          semver.gte(versioningFuncStatus.funcVersion.versionStr, historyFuncRes.value.versionStr))
      ) {
        return versioningFuncStatus;
      } else if (historyFuncRes.isOk()) {
        return { funcVersion: historyFuncRes.value, binFolder: historyFuncBinFolder };
      }
    } catch (error: any) {
      // do nothing
    }
    return undefined;
  }

  private async checkFuncVersion(
    expectedFuncVersion: string,
    binFolder: string | undefined,
    sentinelPath: string | undefined
  ): Promise<Result<FuncVersion, DepsCheckerError>> {
    try {
      const funcVersion = await this.queryFuncVersion(binFolder);
      // For portable func, avoid "func -v" and "func new" work well, but "func start" fail.
      const hasSentinel = sentinelPath ? await fs.pathExists(sentinelPath) : true;
      if (!hasSentinel) {
        return err(new DepsCheckerError(Messages.noSentinelFile(), v3DefaultHelpLink));
      }
      const funcVersionSupport = isFuncVersionSupport(funcVersion, expectedFuncVersion);
      if (!funcVersionSupport) {
        return err(
          new DepsCheckerError(
            Messages.funcVersionNotMatch(funcVersion.versionStr, expectedFuncVersion),
            v3DefaultHelpLink
          )
        );
      }
      return ok(funcVersion);
    } catch (error: any) {
      return err(new DepsCheckerError(error.message, v3DefaultHelpLink));
    }
  }

  private async getVersioningPortableFunc(expectedFuncVersion: string): Promise<
    | {
        funcVersion: FuncVersion;
        binFolder: string;
      }
    | undefined
  > {
    const files = await fs.readdir(FuncToolChecker.getDefaultInstallPath(), {
      withFileTypes: true,
    });
    const funcDictionaries = files
      .filter((f) => f.isDirectory() && semver.valid(f.name))
      .map((f) => f.name);
    this.telemetryProperties[TelemetryProperties.VersioningFuncVersions] =
      JSON.stringify(funcDictionaries);

    while (funcDictionaries.length > 0) {
      const matchedVersion = semver.maxSatisfying(funcDictionaries, expectedFuncVersion);
      if (!matchedVersion) {
        return undefined;
      }

      const binFolder = FuncToolChecker.getPortableFuncBinFolder(matchedVersion);
      const actualFuncRes = await this.checkFuncVersion(
        expectedFuncVersion,
        binFolder,
        FuncToolChecker.getVersioningSentinelPath(matchedVersion)
      );

      if (actualFuncRes.isOk() && actualFuncRes.value.versionStr === matchedVersion) {
        return {
          funcVersion: actualFuncRes.value,
          binFolder: binFolder,
        };
      }

      if (actualFuncRes.isErr()) {
        this.telemetryProperties[TelemetryProperties.VersioningFuncVersionError] =
          (this.telemetryProperties[TelemetryProperties.VersioningFuncVersionError] ?? "") +
          `[${matchedVersion}] ${actualFuncRes.error.message}`;
      }

      const matchedVersionIndex = funcDictionaries.indexOf(matchedVersion);
      if (matchedVersionIndex < 0) {
        return undefined;
      }
      funcDictionaries.splice(matchedVersionIndex, 1);
    }
    return undefined;
  }

  private async install(
    expectedFuncVersion: string,
    symlinkDir: string | undefined
  ): Promise<DependencyStatus> {
    if (isLinux()) {
      throw new InstallSoftwareError(funcToolName, functionToolInstallationLink);
    }
    if (!(await this.hasNPM())) {
      throw new DepsCheckerError(Messages.needInstallNpm(), functionToolInstallationLink);
    }

    const tmpVersion = `tmp-${uuid.v4().slice(0, 6)}`;
    await this.installFunc(tmpVersion, expectedFuncVersion);

    const funcVersionRes = await this.checkFuncVersion(
      expectedFuncVersion,
      FuncToolChecker.getPortableFuncBinFolder(tmpVersion),
      FuncToolChecker.getVersioningSentinelPath(tmpVersion)
    );
    if (funcVersionRes.isErr()) {
      await this.cleanup(tmpVersion);
      this.telemetryProperties[TelemetryProperties.InstallFuncError] = funcVersionRes.error.message;
      throw new DepsCheckerError(
        Messages.failToValidateFuncCoreTool(funcVersionRes.error.message),
        functionToolInstallationLink
      );
    }
    this.telemetryProperties[TelemetryProperties.InstalledFuncVersion] =
      funcVersionRes.value.versionStr;

    await rename(
      FuncToolChecker.getFuncInstallPath(tmpVersion),
      FuncToolChecker.getFuncInstallPath(funcVersionRes.value.versionStr)
    );

    const binFolder = FuncToolChecker.getPortableFuncBinFolder(funcVersionRes.value.versionStr);
    if (symlinkDir) {
      await createSymlink(binFolder, symlinkDir);
      return await this.getDepsInfo(funcVersionRes.value, symlinkDir);
    }
    return await this.getDepsInfo(funcVersionRes.value, binFolder);
  }

  protected static getDefaultInstallPath(): string {
    return path.join(homedir(), `.${ConfigFolderName}`, "bin", "azfunc");
  }

  private static getFuncInstallPath(versionStr: string | undefined): string {
    return versionStr
      ? path.join(this.getDefaultInstallPath(), versionStr)
      : path.join(homedir(), `.${ConfigFolderName}`, "bin", "func");
  }

  private static getVersioningSentinelPath(versionStr: string): string {
    return path.join(FuncToolChecker.getPortableFuncBinFolder(versionStr), "func-sentinel");
  }
  private static getHistorySentinelPath(): string {
    return path.join(homedir(), `.${ConfigFolderName}`, "func-sentinel");
  }

  private static getPortableFuncBinFolder(versionStr: string | undefined): string {
    return path.resolve(
      FuncToolChecker.getFuncInstallPath(versionStr),
      "node_modules",
      "azure-functions-core-tools",
      "bin"
    );
  }

  async queryFuncVersion(funcBinFolder: string | undefined): Promise<FuncVersion> {
    const execPath = funcBinFolder ? path.resolve(funcBinFolder, "func") : "func";
    const output = await cpUtils.executeCommand(
      undefined,
      undefined,
      // same as backend start, avoid powershell execution policy issue.
      { shell: isWindows() ? "cmd.exe" : true },
      `"${execPath}"`,
      "--version"
    );
    return mapToFuncToolsVersion(output);
  }

  private async hasNPM(): Promise<boolean> {
    try {
      await cpUtils.executeCommand(undefined, undefined, { shell: true }, "npm", "--version");
      return true;
    } catch (error) {
      return false;
    }
  }

  private async cleanup(tmpVersionStr: string): Promise<void> {
    try {
      await fs.remove(FuncToolChecker.getFuncInstallPath(tmpVersionStr));
    } catch {}
  }

  private async installFunc(tmpVersion: string, expectedFuncVersion: string): Promise<void> {
    try {
      const tmpFolder = FuncToolChecker.getFuncInstallPath(tmpVersion);
      await cpUtils.executeCommand(
        undefined,
        undefined,
        { timeout: timeout, shell: isWindows() ? "cmd.exe" : true },
        this.getExecCommand("npm"),
        "install",
        // not use -f, to avoid npm@6 bug: exit code = 0, even if install fail
        `"${funcPackageName}@${expectedFuncVersion}"`,
        "--prefix",
        `"${tmpFolder}"`,
        "--no-audit"
      );

      await fs.ensureFile(FuncToolChecker.getVersioningSentinelPath(tmpVersion));
    } catch (error: any) {
      await this.cleanup(tmpVersion);
      // ${funcPackageName}@${expectedFuncVersion} is incorrectly identified as an email format.
      this.telemetryProperties[TelemetryProperties.InstallFuncError] = (error.message as string)
        ?.split(`${funcPackageName}@${expectedFuncVersion}`)
        ?.join(`${funcPackageName}{at}${expectedFuncVersion}`);
      throw new DepsCheckerError(
        {
          default: getDefaultString("error.common.InstallSoftwareError", funcToolName),
          localized: getLocalizedString("error.common.InstallSoftwareError", funcToolName),
        },
        functionToolInstallationLink
      );
    }
  }

  private getExecCommand(command: string): string {
    return isWindows() ? `${command}.cmd` : command;
  }
}

function mapToFuncToolsVersion(output: string): FuncVersion {
  const regex = /(?<major_version>\d+)\.(?<minor_version>\d+)\.(?<patch_version>\d+)/gm;
  const match = regex.exec(output);
  if (!match) {
    throw new DepsCheckerError(Messages.invalidFuncVersion(output), v3DefaultHelpLink);
  }

  const majorVersion = Number.parseInt(match.groups?.major_version ?? "");
  const minorVersion = Number.parseInt(match.groups?.minor_version ?? "");
  const patchVersion = Number.parseInt(match.groups?.patch_version ?? "");

  if (
    !Number.isInteger(majorVersion) ||
    !Number.isInteger(minorVersion) ||
    !Number.isInteger(patchVersion)
  ) {
    throw new DepsCheckerError(Messages.invalidFuncVersion(output), v3DefaultHelpLink);
  }
  return {
    majorVersion: majorVersion,
    minorVersion: minorVersion,
    patchVersion: patchVersion,
    versionStr: `${majorVersion}.${minorVersion}.${patchVersion}`,
  };
}

function isFuncVersionSupport(
  actualFuncVersion: FuncVersion,
  expectedFuncVersion: string
): boolean {
  return semver.satisfies(actualFuncVersion.versionStr, expectedFuncVersion);
}
