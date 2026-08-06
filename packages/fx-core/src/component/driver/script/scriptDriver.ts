// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author huajiezhang <huajiezhang@microsoft.com>
 */
import { hooks } from "@feathersjs/hooks";
import { FxError, LogProvider, Result, err, ok } from "@microsoft/teamsfx-api";
import child_process from "child_process";
import fs from "fs-extra";
import iconv from "iconv-lite";
import { Service } from "typedi";
import { maskSecret } from "../../../common/stringUtils";
import { ScriptExecutionError, ScriptTimeoutError } from "../../../error/script";
import { TelemetryConstant } from "../../constant/commonConstant";
import { getSystemEncoding } from "../../utils/charsetUtils";
import { DotenvOutput } from "../../utils/envUtil";
import { pathUtils } from "../../utils/pathUtils";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";

const ACTION_NAME = "script";

const exec = (...args: Parameters<typeof child_process.exec>) => child_process.exec(...args);

interface ScriptDriverArgs {
  run: string;
  workingDirectory?: string;
  shell?: string;
  timeout?: number;
  redirectTo?: string;
}

/**
 * Get the default shell for the current platform:
 * - If `SHELL` environment variable is set, return its value. otherwise:
 * - On macOS, return `/bin/zsh` if it exists, otherwise return `/bin/bash`.
 * - On Windows, return the value of the `ComSpec` environment variable if it exists, otherwise return `cmd.exe`.
 * - On Linux, return `/bin/sh`.
 */
export async function defaultShell(): Promise<string | undefined> {
  if (process.env.SHELL) {
    return process.env.SHELL;
  }
  if (process.platform === "darwin") {
    if (await fs.pathExists("/bin/zsh")) return "/bin/zsh";
    else if (await fs.pathExists("/bin/bash")) return "/bin/bash";
    return undefined;
  }
  if (process.platform === "win32") {
    return process.env.ComSpec || "cmd.exe";
  }
  if (await fs.pathExists("/bin/sh")) {
    return "/bin/sh";
  }
  return undefined;
}

@Service(ACTION_NAME)
export class ScriptDriver implements StepDriver {
  async _run(
    typedArgs: ScriptDriverArgs,
    context: DriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    await context.progressBar?.next("Running script");
    const res = await executeCommand(
      typedArgs.run,
      context.projectPath,
      context.logProvider,
      context.ui,
      typedArgs.workingDirectory,
      undefined,
      typedArgs.shell,
      typedArgs.timeout,
      typedArgs.redirectTo
    );
    if (res.isErr()) return err(res.error);
    const outputs = res.value[1];
    const kvArray: [string, string][] = Object.keys(outputs).map((k) => [k, outputs[k]]);
    return ok(new Map(kvArray));
  }

  @hooks([addStartAndEndTelemetry(ACTION_NAME, TelemetryConstant.SCRIPT_COMPONENT)])
  async execute(args: unknown, ctx: DriverContext): Promise<ExecutionResult> {
    const typedArgs = args as ScriptDriverArgs;
    const res = await this._run(typedArgs, ctx);
    const summaries: string[] = res.isOk() ? [`Successfully executed command`] : [];
    return { result: res, summaries: summaries };
  }
}

export const scriptDriver = new ScriptDriver();

export async function executeCommand(
  command: string,
  projectPath: string,
  logProvider: LogProvider,
  ui: DriverContext["ui"],
  workingDirectory?: string,
  env?: NodeJS.ProcessEnv,
  shell?: string,
  timeout?: number,
  redirectTo?: string
): Promise<Result<[string, DotenvOutput], FxError>> {
  const workingDir = pathUtils.resolveFilePath(projectPath, workingDirectory);
  env = env || {};
  if (ui?.runCommand) {
    const res = await ui.runCommand({
      cmd: command,
      workingDirectory: workingDir,
      timeout: timeout,
      shell: shell,
      env: { ...process.env, ...env } as { [k: string]: string },
    });
    if (res.isErr()) {
      return err(convertScriptErrorToFxError(res.error, command));
    }
    const outputString = res.value;
    const outputObject = parseSetOutputCommand(outputString);
    if (Object.keys(outputObject).length > 0)
      logProvider.verbose(
        `script output env variables: ${maskSecret(JSON.stringify(outputObject), {
          replace: "***",
        })}`
      );
    return ok([outputString, outputObject]);
  }

  let systemEncoding = await getSystemEncoding(command);
  if (command.startsWith("dotnet ")) {
    systemEncoding = "utf-8";
  }
  const dshell = await defaultShell();
  return new Promise((resolve) => {
    const finalShell = shell || dshell;
    const finalCmd = command;
    let appendFile: string | undefined = undefined;
    if (redirectTo) {
      appendFile = pathUtils.resolveFilePath(projectPath, redirectTo);
    }
    logProvider.verbose(
      `Start to run command: "${maskSecret(finalCmd, {
        replace: "***",
      })}" with args: ${JSON.stringify({
        shell: finalShell,
        cwd: workingDir,
        encoding: systemEncoding,
        env: { ...process.env, ...env },
        timeout: timeout,
      })}.`
    );
    const allOutputStrings: string[] = [];
    const stderrStrings: string[] = [];
    process.env.VSLANG = undefined; // Workaroud to disable VS environment variable to void charset encoding issue for non-English characters
    const cp = exec(
      finalCmd,
      {
        shell: finalShell,
        cwd: workingDir,
        encoding: null,
        env: { ...process.env, ...env },
        timeout: timeout,
      },
      (error) => {
        if (error) {
          error.message = stderrStrings.join("").trim() || error.message;
          resolve(err(convertScriptErrorToFxError(error, finalCmd)));
        } else {
          // handle '::set-output' or '::set-teamsfx-env' pattern
          const outputString = allOutputStrings.join("");
          const outputObject = parseSetOutputCommand(outputString);
          if (Object.keys(outputObject).length > 0)
            logProvider.verbose(
              `script output env variables: ${maskSecret(JSON.stringify(outputObject), {
                replace: "***",
              })}`
            );
          resolve(ok([outputString, outputObject]));
        }
      }
    );
    const dataHandler = (data: string) => {
      allOutputStrings.push(data);
      if (appendFile) {
        fs.appendFileSync(appendFile, data);
      }
    };
    cp.stdout?.on("data", (data: Buffer) => {
      const str = bufferToString(data, systemEncoding);
      logProvider.info(` [script stdout] ${maskSecret(str, { replace: "***" })}`);
      dataHandler(str);
    });
    const handler = getStderrHandler(logProvider, systemEncoding, stderrStrings, dataHandler);
    cp.stderr?.on("data", handler);
  });
}

export function getStderrHandler(
  logProvider: LogProvider,
  systemEncoding: string,
  stderrStrings: string[],
  dataHandler: (data: string) => void
): (data: Buffer) => void {
  return (data: Buffer) => {
    const str = bufferToString(data, systemEncoding);
    logProvider.warning(` [script stderr] ${maskSecret(str, { replace: "***" })}`);
    dataHandler(str);
    stderrStrings.push(str);
  };
}

export function bufferToString(data: Buffer, systemEncoding: string): string {
  const str =
    systemEncoding === "utf8" || systemEncoding === "utf-8"
      ? data.toString()
      : iconv.decode(data, systemEncoding);
  return str;
}

export function convertScriptErrorToFxError(
  error: child_process.ExecException,
  run: string
): ScriptTimeoutError | ScriptExecutionError {
  if (error.killed) {
    return new ScriptTimeoutError(error, run);
  } else {
    return new ScriptExecutionError(error, run);
  }
}

export function parseSetOutputCommand(stdout: string): DotenvOutput {
  const regex = /::(set-teamsfx-env|set-output)\s+(\w+)=((["'])(.*?)\4|[^"'\s]+)/g;
  const output: DotenvOutput = {};
  let match;
  while ((match = regex.exec(stdout))) {
    const key = match[2];
    const value = match[5] !== undefined ? match[5] : match[3];
    output[key] = value;
  }
  return output;
}
