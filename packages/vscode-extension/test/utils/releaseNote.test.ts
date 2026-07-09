import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
("use strict");
import * as vscode from "vscode";

import { ExtensionContext } from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { ReleaseNote } from "../../src/utils/releaseNote";
import * as versionUtil from "../../src/utils/versionUtil";

function gloablStateKeys(): readonly string[] {
  return ["PrereleaseState.Version"];
}
function globalStateGet(key: string): string {
  return "0.0.0";
}
function globalStateUpdate(key: string, value: any): any {}
const reporterSpy = {
  sendTelemetryEvent: vi.fn(),
};
const ShowWhatIsNewNotification = "show-what-is-new-notification";
describe("Release Note", () => {
  describe("stable version shows changelog", () => {
    let context: vscode.ExtensionContext;
    let telemetryStub: ReturnType<typeof vi.spyOn>;
    let openDocumentStub: ReturnType<typeof vi.spyOn>;
    const mockGlobalState: vscode.Memento = {
      keys: gloablStateKeys,
      get: globalStateGet,
      update: globalStateUpdate,
    };
    beforeEach(() => {
      context = {
        subscriptions: [],
        globalState: mockGlobalState,
      } as unknown as vscode.ExtensionContext;
      vi.spyOn(versionUtil, "getExtensionId").mockReturnValue("");
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        packageJSON: { version: "6.2.0" },
        id: "",
        extensionPath: "",
        isActive: true,
        exports: {},
        extensionKind: vscode.ExtensionKind.UI,
        extensionUri: vscode.Uri.parse("https://www.test.com"),
        activate(): Thenable<void> {
          return Promise.resolve();
        },
      });
      telemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      openDocumentStub = vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue();
      mockValue(globalVariables, "context", { extensionPath: "" });
    });
    it("show changelog notification when user has upgraded from previous version", async () => {
      const stateUpdateSpy = vi.spyOn(context.globalState, "update");
      vi.spyOn(context.globalState, "get").mockReturnValue("6.0.0");
      let title = "";
      vi.spyOn(vscode.window, "showInformationMessage").mockImplementation(
        (_message: string, option: any, ...items: vscode.MessageItem[]) => {
          title = option.title;
          return Promise.resolve(option);
        }
      );
      const instance = new ReleaseNote(context);
      await instance.show();
      assert(title === "Changelog");
      assert(stateUpdateSpy.callCount == 2);
      assert(openDocumentStub.calledOnce);
      assert(telemetryStub.calledWith("show-what-is-new-notification"));
    });
    it("should not show changelog if button is not clicked", async () => {
      const stateUpdateSpy = vi.spyOn(context.globalState, "update");
      vi.spyOn(context.globalState, "get").mockReturnValue("6.0.0");
      vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
      const instance = new ReleaseNote(context);
      await instance.show();
      assert(stateUpdateSpy.callCount == 2);
      assert(telemetryStub.calledOnce);
      assert(openDocumentStub.notCalled);
    });
    it("should not show changelog when version is not changed", async () => {
      const stateUpdateSpy = vi.spyOn(context.globalState, "update");
      vi.spyOn(context.globalState, "get").mockReturnValue("6.2.0");
      vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue();
      const instance = new ReleaseNote(context);
      await instance.show();
      assert(stateUpdateSpy.calledOnce);
      assert(telemetryStub.notCalled);
      assert(openDocumentStub.notCalled);
    });
    it("should show changelog when it's a fresh install", async () => {
      const stateUpdateSpy = vi.spyOn(context.globalState, "update");
      vi.spyOn(context.globalState, "get").mockReturnValue(undefined);
      const showInformationStub = vi
        .spyOn(vscode.window, "showInformationMessage")
        .mockResolvedValue();
      const instance = new ReleaseNote(context);
      await instance.show();
      assert(showInformationStub.calledOnce);
    });
  });

  describe("prerelease version shows prerelease note", () => {
    let context: ExtensionContext;
    const mockGlobalState: vscode.Memento = {
      keys: gloablStateKeys,
      get: globalStateGet,
      update: globalStateUpdate,
    };
    before(() => {
      mockValue(ExtTelemetry, "reporter", reporterSpy as any);
    });
    beforeEach(() => {
      vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue();
      vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
      context = {
        subscriptions: [],
        globalState: mockGlobalState,
      } as unknown as ExtensionContext;
    });
    it("success", async () => {
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        packageJSON: { version: "5.1.2023072000" },
        id: "",
        extensionPath: "",
        isActive: true,
        exports: {},
        extensionKind: vscode.ExtensionKind.UI,
        extensionUri: vscode.Uri.parse("https://www.test.com"),
        activate(): Thenable<void> {
          return Promise.resolve();
        },
      });
      vi.spyOn(context.globalState, "get").mockReturnValue("5.0.1");
      const instance = new ReleaseNote(context);
      const spyChecker = vi.spyOn(context.globalState, "update");
      await instance.show();
      assert(spyChecker.callCount == 1);
      expect(reporterSpy.sendTelemetryEvent.mock.calls[0][0]).toBe(ShowWhatIsNewNotification);
      spyChecker.restore();
    });
    it("returns prerelease version undefined", async () => {
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        packageJSON: { version: "5.1.2023072000" },
        id: "",
        extensionPath: "",
        isActive: true,
        exports: {},
        extensionKind: vscode.ExtensionKind.UI,
        extensionUri: vscode.Uri.parse("https://www.test.com"),
        activate(): Thenable<void> {
          return Promise.resolve();
        },
      });
      vi.spyOn(context.globalState, "get").mockReturnValue(undefined);
      const instance = new ReleaseNote(context);
      const spyChecker = vi.spyOn(context.globalState, "update");
      expect(reporterSpy.sendTelemetryEvent.mock.calls[0][0]).toBe(ShowWhatIsNewNotification);
      await instance.show();
      assert(spyChecker.callCount == 1);
      spyChecker.restore();
    });
    it("has same version", async () => {
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue({
        packageJSON: { version: "5.1.2023072000" },
        id: "",
        extensionPath: "",
        isActive: true,
        exports: {},
        extensionKind: vscode.ExtensionKind.UI,
        extensionUri: vscode.Uri.parse("https://www.test.com"),
        activate(): Thenable<void> {
          return Promise.resolve();
        },
      });
      vi.spyOn(context.globalState, "get").mockReturnValue("5.1.2023072000");
      const instance = new ReleaseNote(context);
      const spyChecker = vi.spyOn(context.globalState, "update");
      await instance.show();
      assert(spyChecker.callCount == 0);
      spyChecker.restore();
    });
    it("has undefined version", async () => {
      vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(undefined);
      vi.spyOn(context.globalState, "get").mockReturnValue("5.0.0");
      const instance = new ReleaseNote(context);
      const spyChecker = vi.spyOn(context.globalState, "update");
      await instance.show();
      assert(spyChecker.callCount == 0);
      spyChecker.restore();
    });
  });
});
