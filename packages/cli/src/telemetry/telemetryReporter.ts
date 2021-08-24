// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import * as os from "os";
import * as appInsights from "applicationinsights";
import { machineIdSync } from "node-machine-id";
import logger from "../commonlib/log";
import { UserSettings } from "../userSetttings";

export default class TelemetryReporter {
  private appInsightsClient: appInsights.TelemetryClient | undefined;
  private cliName: string;
  private cliVersion: string;
  private machineId: string;
  private userOptIn = true;
  private logging = true;
  private appRoot: string | undefined;

  constructor(cliName: string, cliVersion: string, key: string, appRoot: string | undefined) {
    this.cliName = cliName;
    this.cliVersion = cliVersion;
    this.machineId = machineIdSync();
    this.appRoot = appRoot;
    this.updateUserOptIn(key);
  }

  private updateUserOptIn(key: string): void {
    const result = UserSettings.getTelemetrySetting();
    if (result.isOk() && result.value === false) {
      this.userOptIn = false;
    } else {
      this.userOptIn = true;
    }

    if (this.userOptIn) {
      this.createAppInsightsClient(key);
    }
  }

  private createAppInsightsClient(key: string) {
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
      /(file:\/\/)?([a-zA-Z]:(\\\\|\\|\/)|(\\\\|\\|\/))?([\w-\._]+(\\\\|\\|\/))+[\w-\._]*/g;
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
    if (this.userOptIn && eventName && this.appInsightsClient) {
      const cleanProperties = this.cloneAndChange(properties, (key: string, prop: string) =>
        this.anonymizeFilePaths(prop)
      );

      this.appInsightsClient.trackEvent({
        name: `${this.cliName}/${eventName}`,
        properties: this.removePropertiesWithPossibleUserInfo(cleanProperties),
        measurements: measurements,
      });

      if (this.logging) {
        logger.debug(
          `Telemetry: ${this.cliName}/${eventName} ${JSON.stringify({
            properties,
            measurements,
          })}\n`
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number },
    _errorProps?: string[]
  ): void {
    if (this.userOptIn && eventName && this.appInsightsClient) {
      const cleanProperties = this.cloneAndChange(properties, (key: string, prop: string) => {
        return this.anonymizeFilePaths(prop);
      });

      this.appInsightsClient.trackEvent({
        name: `${this.cliName}/${eventName}`,
        properties: this.removePropertiesWithPossibleUserInfo(cleanProperties),
        measurements: measurements,
      });

      if (this.logging) {
        logger.debug(
          `Telemetry: ${this.cliName}/${eventName} ${JSON.stringify({
            properties,
            measurements,
          })}\n`
        );
      }
    }
  }

  public sendTelemetryException(
    error: Error,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    if (this.userOptIn && error && this.appInsightsClient) {
      const cleanProperties = this.cloneAndChange(properties, (_key: string, prop: string) =>
        this.anonymizeFilePaths(prop)
      );

      this.appInsightsClient.trackException({
        exception: error,
        properties: this.removePropertiesWithPossibleUserInfo(cleanProperties),
        measurements: measurements,
      });

      if (this.logging) {
        logger.debug(
          `Telemetry: ${this.cliName}/${error.name} ${error.message} ${JSON.stringify({
            properties,
            measurements,
          })}\n`
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
