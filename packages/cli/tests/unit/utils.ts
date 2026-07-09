// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, LogLevel } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { replaceTemplateString } from "../../src/colorize";
import LogProvider from "../../src/commonlib/log";
import CLITelemetry from "../../src/telemetry/cliTelemetry";
import { chai, vi } from "vitest";

export const expect = chai.expect;

export const TestFolder = path.join(os.homedir(), "test-folder");
fs.ensureDirSync(TestFolder);

export function deleteFolderIfExists(p: string) {
  if (fs.pathExistsSync(p)) {
    fs.removeSync(p);
  }
}

export function createFolderIfNotExist(folder: string) {
  if (!fs.pathExistsSync(folder)) {
    fs.mkdirSync(folder);
  }
}

export function createFileIfNotExist(p: string) {
  if (!fs.pathExistsSync(p)) {
    fs.createFileSync(p);
  }
}

export function getDirFiles(folder: string): string[] {
  if (!fs.pathExistsSync(folder)) {
    return [];
  }
  return fs.readdirSync(folder);
}

export function mockTelemetry(
  sandbox: any,
  events: string[],
  options: { [_: string]: string } = {}
) {
  vi.spyOn(CLITelemetry, "withRootFolder").mockReturnValue(CLITelemetry);
  vi.spyOn(CLITelemetry, "sendTelemetryEvent").mockImplementation(
    (eventName: string, opts?: { [_: string]: string }) => {
      events.push(eventName);
      Object.assign(options, opts || {});
    }
  );
  vi.spyOn(CLITelemetry, "sendTelemetryErrorEvent").mockImplementation(
    (eventName: string, error: FxError) => {
      events.push(eventName);
    }
  );
}

export function mockLogProvider(sandbox: any, messages: string[] = []) {
  vi.spyOn(LogProvider, "necessaryLog").mockImplementation((level: LogLevel, message: string) => {
    messages.push(message);
  });
  vi.spyOn(LogProvider, "outputInfo").mockImplementation((message: string, ...args: string[]) => {
    messages.push(replaceTemplateString(message, ...args));
  });
  vi.spyOn(LogProvider, "outputWarning").mockImplementation(
    (message: string, ...args: string[]) => {
      messages.push(replaceTemplateString(message, ...args));
    }
  );
  vi.spyOn(LogProvider, "outputError").mockImplementation((message: string, ...args: string[]) => {
    messages.push(replaceTemplateString(message, ...args));
  });
  vi.spyOn(LogProvider, "outputSuccess").mockImplementation(
    (message: string, ...args: string[]) => {
      messages.push(replaceTemplateString(message, ...args));
    }
  );
  vi.spyOn(LogProvider, "outputDetails").mockImplementation(
    (message: string, ...args: string[]) => {
      messages.push(replaceTemplateString(message, ...args));
    }
  );
}
