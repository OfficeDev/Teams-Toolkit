// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @owner fanhu <fanhu@microsoft.com>
 */

import { BuildArgs } from "../interface/buildAndDeployArgs";
import { asFactory, asOptional, asString, checkMissingArgs } from "../../utils/common";
import { err, ok, IProgressHandler, LogProvider } from "@microsoft/teamsfx-api";
import { DriverContext } from "../interface/commonArgs";
import * as path from "path";
import { ExecutionResult } from "../interface/stepDriver";
import { getLocalizedString } from "../../../common/localizeUtils";
import { ProgressMessages } from "../../messages";
import { executeCommand } from "./scriptDriver";

export abstract class BaseBuildDriver {
  args: BuildArgs;
  workingDirectory: string;
  execPath?: string;
  protected context: DriverContext;
  protected logProvider: LogProvider;
  protected progressBar?: IProgressHandler;
  static readonly emptyMap = new Map<string, string>();
  abstract buildPrefix: string;

  constructor(args: unknown, context: DriverContext, helpLink?: string) {
    this.args = BaseBuildDriver.toBuildArgs(args, helpLink);
    this.args.workingDirectory = this.args.workingDirectory ?? "./";
    // if working dir is not absolute path, then join the path with project path
    this.workingDirectory = path.isAbsolute(this.args.workingDirectory)
      ? this.args.workingDirectory
      : path.join(context.projectPath, this.args.workingDirectory);
    this.logProvider = context.logProvider;
    this.context = context;
    this.progressBar = context.progressBar;
    this.execPath = this.args.execPath;
  }

  protected static asBuildArgs = asFactory<BuildArgs>({
    workingDirectory: asOptional(asString),
    args: asString,
    execPath: asOptional(asString),
  });

  protected static toBuildArgs(args: unknown, helpLink?: string): BuildArgs {
    return BaseBuildDriver.asBuildArgs(args, helpLink);
  }

  async run(): Promise<ExecutionResult> {
    const command = this.getCommand();
    // add path to env if execPath is set
    let env: NodeJS.ProcessEnv | undefined = undefined;
    if (this.execPath) {
      env = { PATH: `${this.execPath}${path.delimiter}${process.env.PATH}` };
    }
    await this.progressBar?.next(ProgressMessages.runCommand(command, this.workingDirectory));
    const res = await executeCommand(
      command,
      this.context.projectPath,
      this.logProvider,
      this.context.ui,
      this.workingDirectory,
      env
    );
    if (res.isErr()) {
      return {
        result: err(res.error),
        summaries: [],
      };
    }
    return {
      result: ok(BaseBuildDriver.emptyMap),
      summaries: [
        getLocalizedString("driver.script.runCommandSummary", command, this.workingDirectory),
      ],
    };
  }

  getCommand(): string {
    const commandSuffix = checkMissingArgs("BuildCommand", this.args.args).trim();
    return `${this.buildPrefix} ${commandSuffix}`;
  }
}
