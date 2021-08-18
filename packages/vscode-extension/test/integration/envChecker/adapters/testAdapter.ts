import { IDepsAdapter } from "../../../../src/debug/depsChecker/checker";
import * as process from "process";
import * as path from "path";

export interface ICustomDotnetInstallScript {
  getScriptPath(): string;
}

// This class is for mocking dotnet-install output and error.
export class CustomOutputDotnetInstallScript implements ICustomDotnetInstallScript {
  private readonly _useCustomScript: boolean;
  private readonly _scriptExitCode: number;
  private readonly _scriptStdout: string;
  private readonly _scriptStderr: string;
  constructor(useCustomScript = false, scriptExitCode = 0, scriptStdout = "", scriptStderr = "") {
    this._useCustomScript = useCustomScript;
    this._scriptExitCode = scriptExitCode;
    this._scriptStdout = scriptStdout;
    this._scriptStderr = scriptStderr;
  }

  public getScriptPath(): string {
    if (this._useCustomScript) {
      process.env["ENV_CHECKER_CUSTOM_SCRIPT_STDOUT"] = this._scriptStdout;
      process.env["ENV_CHECKER_CUSTOM_SCRIPT_STDERR"] = this._scriptStderr;
      process.env["ENV_CHECKER_CUSTOM_SCRIPT_EXITCODE"] = this._scriptExitCode.toString();
      return path.resolve(__dirname, "../resource");
    } else {
      return path.resolve(__dirname, "../../../../src/debug/depsChecker/resource");
    }
  }
}

// This class is for mocking dotnet-install script path.
export class CustomPathDotnetInstallScript implements ICustomDotnetInstallScript {
  private readonly scriptPath: string;
  /**
   * @param scriptPath: the dir that contains the dotnet-install scripts.
   */
  constructor(scriptPath: string) {
    this.scriptPath = scriptPath;
  }

  public getScriptPath(): string {
    return this.scriptPath;
  }
}

export class TestAdapter implements IDepsAdapter {
  private readonly _hasTeamsfxBackend: boolean;
  private readonly _dotnetCheckerEnabled: boolean;
  private readonly _funcToolCheckerEnabled: boolean;
  private readonly _nodeCheckerEnabled: boolean;

  private readonly _clickCancel: boolean;

  private readonly _customScript: ICustomDotnetInstallScript;

  constructor(
    hasTeamsfxBackend: boolean,
    clickCancel = false,
    dotnetCheckerEnabled = true,
    funcToolCheckerEnabled = true,
    nodeCheckerEnabled = true,
    customScript: ICustomDotnetInstallScript = new CustomOutputDotnetInstallScript()
  ) {
    this._hasTeamsfxBackend = hasTeamsfxBackend;
    this._clickCancel = clickCancel;
    this._dotnetCheckerEnabled = dotnetCheckerEnabled;
    this._funcToolCheckerEnabled = funcToolCheckerEnabled;
    this._nodeCheckerEnabled = nodeCheckerEnabled;
    this._customScript = customScript;
  }

  displayContinueWithLearnMore(message: string, link: string): Promise<boolean> {
    if (this._clickCancel) {
      return Promise.resolve(false);
    } else {
      return Promise.resolve(true);
    }
  }

  displayLearnMore(message: string, link: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  async displayWarningMessage(
    message: string,
    buttonText: string,
    action: () => Promise<boolean>
  ): Promise<boolean> {
    if (this._clickCancel) {
      return false;
    } else {
      return await action();
    }
  }

  showOutputChannel() {
    // empty method
  }

  hasTeamsfxBackend(): Promise<boolean> {
    return Promise.resolve(this._hasTeamsfxBackend);
  }

  dotnetCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this._dotnetCheckerEnabled);
  }

  funcToolCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this._funcToolCheckerEnabled);
  }

  nodeCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this._nodeCheckerEnabled);
  }

  bicepCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async runWithProgressIndicator(callback: () => Promise<void>): Promise<void> {
    await callback();
  }

  getResourceDir(): string {
    // use the same resources under vscode-extension/src/debug/depsChecker/resource
    return this._customScript.getScriptPath();
  }
}
