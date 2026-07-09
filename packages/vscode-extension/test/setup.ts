// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
"use strict";

// Ensure tests run with English locale regardless of OS or Node.js navigator.language
if (!process.env.VSCODE_NLS_CONFIG) {
  process.env.VSCODE_NLS_CONFIG = JSON.stringify({ locale: "en" });
}

import * as child_process from "child_process";
import * as os from "os";
import * as vscode from "vscode";
import { ok } from "@microsoft/teamsfx-api";
import { afterAll, afterEach, assert, beforeAll, beforeEach, describe, expect, vi } from "vitest";
import { ExtTelemetry } from "../src/telemetry/extTelemetry";
import * as globalVariables from "../src/globalVariables";
import { installVitestMockCompat, restoreMockValues } from "./mocks/vitestMockUtils";
if (os.platform() === "win32") {
  const proc = child_process.spawn("C:\\Windows\\System32\\Reg.exe", ["/?"]);
  proc.on("error", () => {
    console.error("error during reg.exe");
  });
}

if ((Reflect as any).metadata === undefined) {
  require("reflect-metadata");
}

import { initialize } from "./mocks/vscode-mock";

initialize();
installVitestMockCompat();
const defaultExtensionContext = {
  extensionPath: process.cwd(),
  extensionUri: vscode.Uri.file(process.cwd()),
  logUri: vscode.Uri.file(process.cwd()),
  globalState: {
    get: () => undefined,
    update: async () => undefined,
  },
  ui: {
    showMessage: async () => ({ isOk: () => true }) as any,
  },
  tokenProvider: {
    m365TokenProvider: {} as vscode.AuthenticationProvider,
    azureAccountProvider: {} as vscode.AuthenticationProvider,
  },
} as unknown as vscode.ExtensionContext;
const createDefaultWebviewPanel = () => ({
  webview: {
    html: "",
    options: {},
    onDidReceiveMessage: () => ({ dispose: () => undefined }),
    postMessage: async () => true,
    asWebviewUri: (uri: vscode.Uri) => uri,
  },
  reveal: () => undefined,
  onDidDispose: () => ({ dispose: () => undefined }),
  onDidChangeViewState: () => ({ dispose: () => undefined }),
  dispose: () => undefined,
  title: "",
});
const setDefaultValue = <T extends object, K extends keyof T>(target: T, key: K, value: T[K]) => {
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });
};
const applyDefaultGlobals = (resetExtensionContext = false) => {
  setDefaultValue(globalVariables, "workspaceUri", vscode.Uri.file(process.cwd()));
  setDefaultValue(globalVariables, "tools", {
    tokenProvider: {
      m365TokenProvider: {
        getAccessToken: async () => ok("test-token"),
        getJsonObject: async () => ok({ upn: "test", tid: "" }),
      },
      azureAccountProvider: {
        getAccessToken: async () => ok("test-token"),
      },
    },
    ui: {
      showMessage: async () => ok(""),
    },
    getCommands: async () => [],
  } as never);
  if (resetExtensionContext || !globalVariables.context) {
    globalVariables.initializeGlobalVariables(defaultExtensionContext);
  }
  setDefaultValue(
    vscode.window,
    "createWebviewPanel",
    vi.fn(() => createDefaultWebviewPanel()) as never
  );
};
beforeAll(() => {
  applyDefaultGlobals(true);
});
beforeEach(() => {
  applyDefaultGlobals();
});

// Keep a single vscode module instance so Sinon stubs in tests and runtime code target the same object.
vi.mock("vscode", async () => {
  const mod = await import("./mocks/vscode-mock");
  return mod.mockedVSCode as any;
});

// Redirect globalState to a unique per-worker temp directory so parallel Vitest workers
// don't contend for the same proper-lockfile file lock (which causes 1-second retry delays).
import _setupOs from "os";
import _setupPath from "path";
const _workerStateDir = _setupPath.join(_setupOs.tmpdir(), `teamsfx-test-${process.pid}`);
process.env.USERPROFILE = _workerStateDir; // Windows: os.homedir() reads USERPROFILE
process.env.HOME = _workerStateDir; // Unix: os.homedir() reads HOME

// Some suites call ExtTelemetry APIs directly without creating a Reporter instance.
// Provide a safe default no-op reporter for test runtime.
ExtTelemetry.reporter = {
  addSharedProperty: () => {},
  sendTelemetryEvent: () => {},
  sendTelemetryErrorEvent: () => {},
  sendTelemetryException: () => {},
  dispose: async () => {},
} as any;

// Keep legacy aliases used by existing test files.
Object.assign(globalThis, {
  before: beforeAll,
  after: afterAll,
  context: describe,
  sandbox: {
    useFakeTimers: (time?: number) => {
      const clock = vi.useFakeTimers();
      if (typeof time === "number") {
        vi.setSystemTime(time);
      }
      return clock;
    },
    restore: () => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    },
    assert: {
      match: (actual: unknown, expected: unknown) => {
        if (typeof expected === "string" && typeof actual === "string") {
          assert.include(actual, expected);
          return;
        }
        if (expected && typeof expected === "object") {
          assert.deepInclude(actual as never, expected as never);
          return;
        }
        assert.equal(actual, expected);
      },
    },
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  restoreMockValues();
});
