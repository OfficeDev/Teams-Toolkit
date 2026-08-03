// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";
import { CONFIGURATION_PREFIX, ConfigurationKey } from "./constants";
import VsCodeLogInstance from "./commonlib/log";
import { LogLevel } from "@microsoft/teamsfx-api";
import { ExtTelemetry } from "./telemetry/extTelemetry";
import { TelemetryEvent } from "./telemetry/extTelemetryEvents";
import { FeatureFlags } from "@microsoft/teamsfx-core";

export class ConfigManager {
  registerConfigChangeCallback() {
    this.loadConfigs();
    vscode.workspace.onDidChangeConfiguration?.(this.changeConfigCallback.bind(this));
  }
  loadConfigs() {
    this.loadLogLevel();
    this.loadFeatureFlags();
    const vscConfigs: { [p: string]: string } = {};
    Object.values(ConfigurationKey).forEach((value) => {
      vscConfigs[value] = this.getConfiguration(value, "").toString();
    });
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Configuration, {
      ...vscConfigs,
    });
  }
  loadFeatureFlags() {
    process.env["TEAMSFX_BICEP_ENV_CHECKER_ENABLE"] = this.getConfiguration(
      ConfigurationKey.BicepEnvCheckerEnable,
      false
    ).toString();
    process.env[FeatureFlags.CEAEnabled.name] = this.getConfiguration(
      ConfigurationKey.EnableCEA,
      false
    ).toString();
    process.env[FeatureFlags.CFShortcutMetaOS.name] = this.getConfiguration(
      ConfigurationKey.EnableCFShortcutMetaOS,
      false
    ).toString();
    process.env[FeatureFlags.SovereignCloudEnvironment.name] = this.getConfiguration(
      ConfigurationKey.SovereignCloudEnvironment,
      ""
    ).toString();
  }
  loadLogLevel() {
    const logLevel = this.getConfiguration(ConfigurationKey.LogLevel, "Info") as string;
    if (logLevel === "Debug") {
      VsCodeLogInstance.logLevel = LogLevel.Debug;
    } else if (logLevel === "Verbose") {
      VsCodeLogInstance.logLevel = LogLevel.Verbose;
    } else {
      VsCodeLogInstance.logLevel = LogLevel.Info;
    }
  }
  getConfiguration(key: string, defaultValue: boolean | string): boolean | string {
    const configuration: vscode.WorkspaceConfiguration =
      vscode.workspace.getConfiguration(CONFIGURATION_PREFIX);
    return configuration.get<boolean | string>(key, defaultValue);
  }
  changeConfigCallback(event: vscode.ConfigurationChangeEvent) {
    if (event.affectsConfiguration(CONFIGURATION_PREFIX)) {
      this.loadConfigs();
    }
  }
}

export const configMgr = new ConfigManager();
