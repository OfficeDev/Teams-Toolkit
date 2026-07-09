import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as vscode from "vscode";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { openOneDriveSharePointUrlHandler } from "../../src/handlers/openOneDriveSharePointUrlHandler";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTriggerFrom,
} from "../../src/telemetry/extTelemetryEvents";

describe("openOneDriveSharePointUrlHandler", () => {
  beforeEach(() => {
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
  });

  it("should not open URL when no active editor", async () => {
    // Stub window.activeTextEditor to return null
    mockValue(vscode.window, "activeTextEditor", undefined);
    const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");
    const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

    await openOneDriveSharePointUrlHandler(["https://example.com"]);

    // Verify telemetry was sent
    assert.isTrue(
      sendTelemetryStub.calledOnceWith(TelemetryEvent.OpenOneDriveSharePointUrlStart, {
        [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Other,
      })
    );
    // Verify URL was not opened
    assert.isTrue(openUrlStub.notCalled);
  });

  it("should open URL when active editor exists", async () => {
    // Mock active editor
    mockValue(vscode.window, "activeTextEditor", {} as vscode.TextEditor);
    const testUrl = "https://example.com";
    const openUrlStub = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl");
    const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

    await openOneDriveSharePointUrlHandler([testUrl]);

    // Verify telemetry was sent
    assert.isTrue(
      sendTelemetryStub.calledOnceWith(TelemetryEvent.OpenOneDriveSharePointUrlStart, {
        [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.Other,
      })
    );
    // Verify URL was opened with correct parameter
    assert.isTrue(openUrlStub.calledOnceWith(testUrl));
  });
});
