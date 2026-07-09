import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import { manifestListener } from "../../src/manifestListener";
import { TeamsAppManifest } from "@microsoft/teamsfx-api";
import path from "path";
import TreeViewManagerInstance from "../../src/treeview/treeViewManager";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("registerManifestListener", () => {
  let clock: ReturnType<typeof vi.useFakeTimers>;

  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockReturnValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (clock) {
      clock.restore();
    }
  });
  it("successfully refresh item", async () => {
    clock = vi.useFakeTimers();
    let handler = async (event: any) => {};
    vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((listener: any) => {
      handler = listener;
      return new vscode.Disposable(() => {
        return;
      });
    });
    mockValue(globalVariables, "isDeclarativeCopilotApp", false);
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("."));
    vi.spyOn(globalVariables, "updateIsDeclarativeCopilotApp")
      .onFirstCall()
      .mockReturnValue(true)
      .onSecondCall()
      .mockReturnValue(false);
    vi.spyOn(TreeViewManagerInstance, "updateDevelopmentTreeView").mockReturnValue();

    const fakeDocument = {
      fileName: path.join(vscode.Uri.file(".").fsPath, "appPackage", "manifest.json"),
      getText: () => {
        return JSON.stringify(new TeamsAppManifest());
      },
    };

    manifestListener();
    let job = handler(fakeDocument);

    await clock.tickAsync(5000);
    let res = await job;
    assert.isTrue(res);

    job = handler(fakeDocument);
    await clock.tickAsync(5000);
    res = await job;
    assert.isFalse(res);
  });

  it("abort previous one", async () => {
    clock = vi.useFakeTimers();
    let handler = async (event: any) => {};
    vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((listener: any) => {
      handler = listener;
      return new vscode.Disposable(() => {
        return;
      });
    });
    mockValue(globalVariables, "isDeclarativeCopilotApp", false);
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("."));
    vi.spyOn(globalVariables, "updateIsDeclarativeCopilotApp")
      .onFirstCall()
      .mockReturnValue(true)
      .onSecondCall()
      .mockReturnValue(false);
    vi.spyOn(TreeViewManagerInstance, "updateDevelopmentTreeView").mockReturnValue();

    const fakeDocument = {
      fileName: path.join(vscode.Uri.file(".").fsPath, "appPackage", "manifest.json"),
      getText: () => {
        return JSON.stringify(new TeamsAppManifest());
      },
    };

    manifestListener();
    const job1 = handler(fakeDocument);
    await clock.tickAsync(1000);
    const job2 = handler(fakeDocument);

    await clock.tickAsync(5000);
    const res1 = await job1;
    const res2 = await job2;

    assert.isUndefined(res1);
    assert.isTrue(res2);
  });

  it("not run if invalid project", async () => {
    clock = vi.useFakeTimers();
    let handler = async (event: any) => {};
    vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(false);
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("."));
    vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((listener: any) => {
      handler = listener;
      return new vscode.Disposable(() => {
        return;
      });
    });

    const fakeDocument = {
      fileName: path.join(vscode.Uri.file(".").fsPath, "appPackage", "manifest.json"),
      getText: () => {
        return JSON.stringify(new TeamsAppManifest());
      },
    };

    manifestListener();
    const res = await handler(fakeDocument);

    assert.isUndefined(res);
  });

  it("not run if empty workspace", async () => {
    clock = vi.useFakeTimers();
    let handler = async (event: any) => {};
    mockValue(globalVariables, "workspaceUri", "");
    vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(false);
    vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((listener: any) => {
      handler = listener;
      return new vscode.Disposable(() => {
        return;
      });
    });

    const fakeDocument = {
      fileName: path.join(vscode.Uri.file(".").fsPath, "appPackage", "manifest.json"),
      getText: () => {
        return JSON.stringify(new TeamsAppManifest());
      },
    };

    manifestListener();
    const res = await handler(fakeDocument);

    assert.isUndefined(res);
  });

  it("not run if not default app manifest", async () => {
    clock = vi.useFakeTimers();
    let handler = async (event: any) => {};
    mockValue(globalVariables, "workspaceUri", ".");
    vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(false);
    vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((listener: any) => {
      handler = listener;
      return new vscode.Disposable(() => {
        return;
      });
    });

    const fakeDocument = {
      fileName: path.join(vscode.Uri.file(".").fsPath, "appPackage", "unknown.json"),
      getText: () => {
        return JSON.stringify(new TeamsAppManifest());
      },
    };

    manifestListener();
    const res = await handler(fakeDocument);

    assert.isUndefined(res);
  });
});
