// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";
import Reporter from "vscode-extension-telemetry";
import { TelemetryReporter } from "@microsoft/teamsfx-api";
import { getAllFeatureFlags, getPackageVersion, getProjectId } from "../utils/commonUtils";
import { TelemetryProperty } from "../telemetry/extTelemetryEvents";
import { Correlator } from "@microsoft/teamsfx-core";

/**
 *  VSCode telemetry reporter used by fx-core.
 *  Usage:
 *    let reporter = new VSCodeTelemetryReporter(key, extensionVersion, extensionId)
 *  Illustrate:
 *    key = <'the application insights key'>, 'aiKey' in package.json
 *    extensionVersion = '<extension version>', extension version will be reported as a property with each event
 *    extensionId = '<your extension unique name>', all events will be prefixed with this event name. eg: 'extensionId/eventname'
 */
export class VSCodeTelemetryReporter extends vscode.Disposable implements TelemetryReporter {
  private readonly reporter: Reporter;
  private readonly extVersion: string;

  private sharedProperties: { [key: string]: string } = {};

  constructor(key: string, extensionVersion: string, extensionId: string) {
    super(async () => await this.reporter.dispose());
    this.reporter = new Reporter(extensionId, extensionVersion, key, true);
    this.extVersion = getPackageVersion(extensionVersion);
  }

  addSharedProperty(name: string, value: string): void {
    this.sharedProperties[name] = value;
  }

  sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number },
    errorProps?: string[]
  ): void {
    if (!properties) {
      properties = { ...this.sharedProperties };
    } else {
      properties = { ...this.sharedProperties, ...properties };
    }

    const projectId = getProjectId();
    properties[TelemetryProperty.ProjectId] = projectId ? projectId : "";
    properties[TelemetryProperty.CorrelationId] = Correlator.getId();

    const featureFlags = getAllFeatureFlags();
    properties[TelemetryProperty.FeatureFlags] = featureFlags ? featureFlags.join(";") : "";
    this.reporter.sendTelemetryErrorEvent(eventName, properties, measurements, errorProps);
  }

  sendTelemetryEvent(
    eventName: string,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number }
  ): void {
    if (!properties) {
      properties = { ...this.sharedProperties };
    } else {
      properties = { ...this.sharedProperties, ...properties };
    }

    const projectId = getProjectId();
    properties[TelemetryProperty.ProjectId] = projectId ? projectId : "";
    properties[TelemetryProperty.CorrelationId] = Correlator.getId();

    const featureFlags = getAllFeatureFlags();
    properties[TelemetryProperty.FeatureFlags] = featureFlags ? featureFlags.join(";") : "";
    this.reporter.sendTelemetryEvent(eventName, properties, measurements);
  }

  sendTelemetryException(
    error: Error,
    properties?: { [p: string]: string },
    measurements?: { [p: string]: number }
  ): void {
    if (!properties) {
      properties = { ...this.sharedProperties };
    } else {
      properties = { ...this.sharedProperties, ...properties };
    }

    const projectId = getProjectId();
    properties[TelemetryProperty.ProjectId] = projectId ? projectId : "";
    properties[TelemetryProperty.CorrelationId] = Correlator.getId();

    const featureFlags = getAllFeatureFlags();
    properties[TelemetryProperty.FeatureFlags] = featureFlags ? featureFlags.join(";") : "";
    this.reporter.sendTelemetryException(error, properties, measurements);
  }
}
