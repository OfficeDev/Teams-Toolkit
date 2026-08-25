// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import { featureFlagManager, FeatureFlags } from "@microsoft/teamsfx-core";
import * as appInsights from "applicationinsights";
import * as log4js from "log4js";
import { machineIdSync } from "node-machine-id";
import * as os from "os";
import * as path from "path";
import logger from "../commonlib/log";

export default class TelemetryReporter {
  private appInsightsClient: appInsights.TelemetryClient | undefined;
  private cliName: string;
  private cliVersion: string;
  private machineId: string;
  private logging = true;
  private debug = false;
  private appRoot: string | undefined;
  private log4jsLogger: log4js.Logger | undefined;

  constructor(cliName: string, cliVersion: string, key: string, appRoot: string | undefined) {
    this.cliName = cliName;
    this.cliVersion = cliVersion;
    this.machineId = machineIdSync();
    this.appRoot = appRoot;
    this.createAppInsightsClient(key);
    this.debug = featureFlagManager.getBooleanValue(FeatureFlags.TelemetryTest);
    this.initializeLog4js();
  }

  private initializeLog4js(): void {
    if (this.debug) {
      try {
        const logsDir = path.join(os.homedir(), ".fx", "logs");
        log4js.configure({
          appenders: {
            telemetry: {
              type: "file",
              filename: path.join(logsDir, "cli-telemetry.log"),
              maxLogSize: 10485760, // 10MB
              backups: 5,
              compress: true,
              layout: {
                type: "pattern",
                pattern: "%d{ISO8601} [%p] %m",
              },
            },
          },
          categories: {
            default: {
              appenders: ["telemetry"],
              level: "info",
            },
          },
        });
        this.log4jsLogger = log4js.getLogger("telemetry");
      } catch (error) {
        // Silently fail if log4js initialization fails
        void logger.debug(
          `Failed to initialize log4js: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private createAppInsightsClient(key: string) {
    // The SDK's internal logging writes straight to the console (console.warn -> stderr) by
    // default, including when the telemetry endpoint itself is unreachable. Telemetry transport
    // failures are never actionable for CLI users and must not be mistaken for command output,
    // so keep an undeliverable telemetry beacon silent.
    appInsights.Configuration.setInternalLogging(false, false);
    if (appInsights.defaultClient) {
      this.appInsightsClient = new appInsights.TelemetryClient(key);
      this.appInsightsClient.channel.setUseDiskRetryCaching(true);
    } else {
      appInsights
        .setup(key)
        .setAutoCollectRequests(false)
        .setAutoCollectPerformance(false)
        .setAutoCollectExceptions(false)
        .setAutoCollectDependencies(false)
        .setAutoDependencyCorrelation(false)
        .setAutoCollectConsole(false)
        .setUseDiskRetryCaching(true)
        .start();
      this.appInsightsClient = appInsights.defaultClient;
    }

    this.appInsightsClient.commonProperties = this.getCommonProperties();
  }

  private getCommonProperties(): { [key: string]: string } {
    const commonProperties = Object.create(null);
    commonProperties["common.os"] = os.platform();
    commonProperties["common.platformversion"] = (os.release() || "").replace(
      /^(\d+)(\.\d+)?(\.\d+)?(.*)/,
      "$1$2$3"
    );
    commonProperties["common.cliversion"] = this.cliVersion;
    commonProperties["common.machineid"] = this.machineId;

    return commonProperties;
  }

  private cloneAndChange(
    obj?: { [key: string]: string },
    change?: (key: string, val: string) => string
  ): { [key: string]: string } | undefined {
    if (obj === null || typeof obj !== "object") return obj;
    if (typeof change !== "function") return obj;

    const ret: { [key: string]: string } = {};
    for (const key in obj) {
      ret[key] = change(key, obj[key]);
    }

    return ret;
  }

  private anonymizeFilePaths(stack?: string): string {
    if (stack === undefined || stack === null) {
      return "";
    }

    const cleanupPatterns =
      this.appRoot === undefined
        ? []
        : [new RegExp(this.appRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")];

    let updatedStack = stack;

    const cleanUpIndexes: [number, number][] = [];
    for (const regexp of cleanupPatterns) {
      while (true) {
        const result = regexp.exec(stack);
        if (!result) {
          break;
        }
        cleanUpIndexes.push([result.index, regexp.lastIndex]);
      }
    }

    const nodeModulesRegex = /^[\\\/]?(node_modules|node_modules\.asar)[\\\/]/;
    const fileRegex =
      /(file:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w-\._]{1,300}(\\\\|\\|\/)){1,100}[\w-\._]{0,300}/g;

    let lastIndex = 0;
    updatedStack = "";

    while (true) {
      const result = fileRegex.exec(stack);
      if (!result) {
        break;
      }
      // Anoynimize user file paths that do not need to be retained or cleaned up.
      if (
        !nodeModulesRegex.test(result[0]) &&
        cleanUpIndexes.every(([x, y]) => result.index < x || result.index >= y)
      ) {
        updatedStack += stack.substring(lastIndex, result.index) + "<REDACTED: user-file-path>";
        lastIndex = fileRegex.lastIndex;
      }
    }
    if (lastIndex < stack.length) {
      updatedStack += stack.substr(lastIndex);
    }

    // sanitize with configured cleanup patterns
    for (const regexp of cleanupPatterns) {
      updatedStack = updatedStack.replace(regexp, "");
    }

    return updatedStack;
  }

  private removePropertiesWithPossibleUserInfo(
    properties: { [key: string]: string } | undefined
  ): { [key: string]: string } | undefined {
    if (typeof properties !== "object") {
      return;
    }
    const cleanedObject = Object.create(null);
    // Loop through key and values of the properties object
    for (const key of Object.keys(properties)) {
      const value = properties[key];
      // If for some reason it is undefined we skip it (this shouldn't be possible);
      if (!value) {
        continue;
      }

      // Regex which matches @*.site
      const emailRegex = /@[a-zA-Z0-9-.]+/;

      // Check for common user data in the telemetry events
      if (value.indexOf("token=") !== -1) {
        cleanedObject[key] = "<REDACTED: token>";
      } else if (value.indexOf("ssword=") !== -1) {
        cleanedObject[key] = "<REDACTED: password>";
      } else if (emailRegex.test(value)) {
        cleanedObject[key] = "<REDACTED: email>";
      } else {
        cleanedObject[key] = value;
      }
    }
    return cleanedObject;
  }

  public setAppRoot(appRoot: string): void {
    this.appRoot = appRoot;
  }

  public sendTelemetryEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    if (eventName && this.appInsightsClient) {
      const cleanProperties = this.cloneAndChange(properties, (key: string, prop: string) =>
        this.anonymizeFilePaths(prop)
      );

      this.appInsightsClient.trackEvent({
        name: `${this.cliName}/${eventName}`,
        properties: this.removePropertiesWithPossibleUserInfo(cleanProperties),
        measurements: measurements,
      });

      if (this.logging) {
        void logger.debug(
          `Telemetry: ${this.cliName}/${eventName} ${JSON.stringify({
            properties,
            measurements,
          })}\n`
        );
      }

      // Log to local file when debug is true
      if (this.debug && this.log4jsLogger) {
        this.log4jsLogger.info(
          `Event: ${this.cliName}/${eventName} | ${JSON.stringify({
            properties,
            measurements,
          })}`
        );
      }
    }
  }

  public sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number },
    _errorProps?: string[]
  ): void {
    if (eventName && this.appInsightsClient) {
      const cleanProperties = this.cloneAndChange(properties, (key: string, prop: string) => {
        return this.anonymizeFilePaths(prop);
      });

      this.appInsightsClient.trackEvent({
        name: `${this.cliName}/${eventName}`,
        properties: this.removePropertiesWithPossibleUserInfo(cleanProperties),
        measurements: measurements,
      });

      if (this.logging) {
        void logger.debug(
          `Telemetry: ${this.cliName}/${eventName} ${JSON.stringify({
            properties,
            measurements,
          })}\n`
        );
      }

      // Log to local file when debug is true
      if (this.debug && this.log4jsLogger) {
        this.log4jsLogger.info(
          `ErrorEvent: ${this.cliName}/${eventName} | ${JSON.stringify({
            properties,
            measurements,
          })}`
        );
      }
    }
  }

  public sendTelemetryException(
    error: Error,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    if (error && this.appInsightsClient) {
      const cleanProperties = this.cloneAndChange(properties, (_key: string, prop: string) =>
        this.anonymizeFilePaths(prop)
      );

      this.appInsightsClient.trackException({
        exception: error,
        properties: this.removePropertiesWithPossibleUserInfo(cleanProperties),
        measurements: measurements,
      });

      if (this.logging) {
        void logger.debug(
          `Telemetry: ${this.cliName}/${error.name} ${error.message} ${JSON.stringify({
            properties,
            measurements,
          })}\n`
        );
      }

      // Log to local file when debug is true
      if (this.debug && this.log4jsLogger) {
        this.log4jsLogger.error(
          `Exception: ${this.cliName}/${error.name} ${error.message} | ${JSON.stringify({
            properties,
            measurements,
            stack: error.stack,
          })}`
        );
      }
    }
  }

  public flush(): Promise<void[]> {
    const flushEventsToAI = new Promise<void>((resolve) => {
      if (this.appInsightsClient) {
        this.appInsightsClient.flush({
          callback: () => {
            resolve(void 0);
          },
        });
      } else {
        resolve(void 0);
      }
    });

    return Promise.all([flushEventsToAI]);
  }
}
