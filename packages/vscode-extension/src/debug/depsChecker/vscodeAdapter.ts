import * as path from "path";
import { window, workspace, WorkspaceConfiguration, MessageItem, commands, Uri } from "vscode";
import { DepsCheckerEvent, Messages } from "./common";
import { IDepsAdapter, IDepsTelemetry } from "./checker";
import { hasTeamsfxBackend } from "../commonUtils";
import { vscodeLogger as logger } from "./vscodeLogger";
import { vscodeTelemetry } from "./vscodeTelemetry";

export class VSCodeAdapter implements IDepsAdapter {
  private readonly configurationPrefix = "fx-extension";
  private readonly downloadIndicatorInterval = 1000; // same as vscode-dotnet-runtime
  private readonly validateDotnetSdkKey = "validateDotnetSdk";
  private readonly validateFuncCoreToolsKey = "validateFuncCoreTools";
  private readonly validateBicepKey = "validateBicep";

  private readonly validateNodeVersionKey = "validateNode";
  private readonly _telemetry: IDepsTelemetry;

  constructor(telemetry: IDepsTelemetry) {
    this._telemetry = telemetry;
  }

  public hasTeamsfxBackend(): Promise<boolean> {
    return hasTeamsfxBackend();
  }

  public dotnetCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this.checkerEnabled(this.validateDotnetSdkKey));
  }

  public funcToolCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this.checkerEnabled(this.validateFuncCoreToolsKey));
  }

  public nodeCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this.checkerEnabled(this.validateNodeVersionKey));
  }

  public bicepCheckerEnabled(): Promise<boolean> {
    return Promise.resolve(this.checkerEnabled(this.validateBicepKey));
  }

  public async runWithProgressIndicator(callback: () => Promise<void>): Promise<void> {
    const timer = setInterval(
      () => logger.outputChannel.append("."),
      this.downloadIndicatorInterval
    );
    try {
      await callback();
    } finally {
      clearTimeout(timer);
      logger.outputChannel.appendLine("");
    }
  }

  public async displayContinueWithLearnMore(message: string, link: string): Promise<boolean> {
    const learnMoreButton: MessageItem = { title: Messages.learnMoreButtonText };
    const continueButton: MessageItem = { title: Messages.continueButtonText };
    const input = await window.showWarningMessage(
      message,
      { modal: true },
      learnMoreButton,
      continueButton
    );

    if (input === continueButton) {
      this._telemetry.sendEvent(DepsCheckerEvent.clickContinue);
      return true;
    } else if (input == learnMoreButton) {
      this._telemetry.sendEvent(DepsCheckerEvent.clickLearnMore);
      await VSCodeAdapter.openUrl(link);
      return await this.displayContinueWithLearnMore(message, link);
    }

    this._telemetry.sendEvent(DepsCheckerEvent.clickCancel);
    return false;
  }

  public async displayLearnMore(message: string, link: string): Promise<boolean> {
    return await this.displayWarningMessage(message, Messages.learnMoreButtonText, async () => {
      await VSCodeAdapter.openUrl(link);
      return await this.displayLearnMore(message, link);
    });
  }

  public async displayWarningMessage(
    message: string,
    buttonText: string,
    action: () => Promise<boolean>
  ): Promise<boolean> {
    const button: MessageItem = { title: buttonText };
    const input = await window.showWarningMessage(message, { modal: true }, button);
    if (input === button) {
      this._telemetry.sendEvent(DepsCheckerEvent.clickLearnMore);
      return await action();
    }

    // click cancel button
    this._telemetry.sendEvent(DepsCheckerEvent.clickCancel);
    return false;
  }

  public showOutputChannel(): void {
    logger.outputChannel.show(false);
  }

  public getResourceDir(): string {
    return path.resolve(__dirname, "resource");
  }

  private checkerEnabled(key: string): boolean {
    const configuration: WorkspaceConfiguration = workspace.getConfiguration(
      this.configurationPrefix
    );
    return configuration.get<boolean>(key, false);
  }

  private static async openUrl(url: string): Promise<void> {
    await commands.executeCommand("vscode.open", Uri.parse(url));
  }
}

export const vscodeAdapter = new VSCodeAdapter(vscodeTelemetry);
