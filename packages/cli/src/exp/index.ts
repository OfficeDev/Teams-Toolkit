// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { machineIdSync } from "node-machine-id";
import * as os from "os";
import * as path from "path";
import {
  ExperimentationService,
  IExperimentationFilterProvider,
  IExperimentationService,
  IExperimentationTelemetry,
  IKeyValueStorage,
} from "tas-client";
import CliTelemetry from "../telemetry/cliTelemetry";
import { getVersion } from "../utils";

// The Azure ExP (Treatment Assignment Service) endpoint for the "vscode/ab" cluster.
// This is the same cluster the VS Code extension uses, so the CLI can consume the
// same experiments as long as their audience filters are not restricted to values
// only the extension sends (see CliFilterProvider below).
const endpoint = "https://default.exp-tas.com/vscode/ab";
const telemetryEventName = "query-expfeature";
const assignmentContextTelemetryPropertyName = "abexp.assignmentcontext";
const storageKey = "ATK.CLI.ABExp.FeatureData";

// The VS Code extension's experiments are registered under this extension name
// filter. Sending the same value lets the CLI share those experiments.
const extensionName = "ms-teams-vscode-extension";

// A CLI process is short-lived, so disable background polling to avoid keeping a
// lingering timer alive; the service still performs its initial fetch.
const refetchInterval = 0;

/**
 * Supplies the ExP filter headers. The assignment unit is `X-MSEdge-ClientId`,
 * which mirrors the `clientid` unit used by the experiments. The header names match
 * the ones the VS Code TAS client sends so the same experiments resolve here.
 */
class CliFilterProvider implements IExperimentationFilterProvider {
  constructor(
    private readonly version: string,
    private readonly clientId: string
  ) {}

  getFilters(): Map<string, string> {
    const filters = new Map<string, string>();
    filters.set("X-MSEdge-Market", "");
    filters.set("X-FD-Corpnet", "");
    filters.set("X-VSCode-AppVersion", this.version);
    filters.set("X-VSCode-Build", "atk-cli");
    filters.set("X-MSEdge-ClientId", this.clientId);
    filters.set("X-VSCode-ExtensionName", extensionName);
    filters.set("X-VSCode-ExtensionVersion", this.version);
    filters.set("X-VSCode-TargetPopulation", "public");
    filters.set("X-VSCode-Language", "en");
    return filters;
  }
}

/**
 * Disk-backed cache for assignments under `~/.fx/exp/`. Replaces the VS Code
 * `Memento` storage the extension relies on.
 */
class FileKeyValueStorage implements IKeyValueStorage {
  private readonly filePath: string;

  constructor(fileName: string) {
    this.filePath = path.join(os.homedir(), `.${ConfigFolderName}`, "exp", fileName);
  }

  async getValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const data: Record<string, T> = await fs.readJson(this.filePath);
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        return data[key];
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  setValue<T>(key: string, value: T): void {
    void this.writeValue(key, value);
  }

  private async writeValue<T>(key: string, value: T): Promise<void> {
    let data: Record<string, unknown> = {};
    try {
      data = await fs.readJson(this.filePath);
    } catch {
      data = {};
    }
    data[key] = value;
    await fs.ensureDir(path.dirname(this.filePath));
    await fs.writeJson(this.filePath, data);
  }
}

/**
 * Bridges ExP telemetry to the CLI telemetry reporter.
 */
class CliExperimentationTelemetry implements IExperimentationTelemetry {
  setSharedProperty(name: string, value: string): void {
    CliTelemetry.reporter?.addSharedProperty(name, value);
  }

  postEvent(eventName: string, props: Map<string, string>): void {
    const properties: { [key: string]: string } = {};
    props.forEach((value, key) => {
      properties[key] = value;
    });
    CliTelemetry.sendTelemetryEvent(eventName, properties);
  }
}

let expService: IExperimentationService | undefined;

/**
 * Returns the CLI experimentation service, or `undefined` if it could not be
 * initialized. The returned instance satisfies the `ExpServiceProvider` seam
 * (`getTreatmentVariableAsync`) consumed by the engine.
 */
export function getExpService(): IExperimentationService | undefined {
  return expService;
}

/**
 * Lazily constructs the experimentation service. Safe to call multiple times; the
 * service is created once per process. Network/init failures are swallowed so the
 * CLI keeps working (treatment lookups then resolve to `undefined`).
 */
export function initializeExpService(): IExperimentationService | undefined {
  if (expService) {
    return expService;
  }
  try {
    const version = getVersion();
    const clientId = machineIdSync();
    const service = new ExperimentationService({
      telemetry: new CliExperimentationTelemetry(),
      filterProviders: [new CliFilterProvider(version, clientId)],
      telemetryEventName,
      assignmentContextTelemetryPropertyName,
      endpoint,
      storageKey,
      keyValueStorage: new FileKeyValueStorage("assignments.json"),
      refetchInterval,
    });
    // Do not let an init failure (offline / CI) surface as an unhandled rejection.
    service.initializePromise.catch(() => {
      /* ignore */
    });
    expService = service;
    return expService;
  } catch {
    return undefined;
  }
}
