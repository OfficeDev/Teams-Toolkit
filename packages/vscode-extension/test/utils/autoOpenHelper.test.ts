import { ok, TeamsAppManifest } from "@microsoft/teamsfx-api";
import * as globalState from "@microsoft/teamsfx-core";
import {
  featureFlagManager,
  FeatureFlags,
  manifestUtils,
  pluginManifestUtils,
} from "@microsoft/teamsfx-core";
import * as apiSpec from "@microsoft/teamsfx-core/build/component/generator/openApiSpec/helper";
import fs from "fs-extra";
import { assert, vi } from "vitest";
import * as vscode from "vscode";
import VscodeLogInstance from "../../src/commonlib/log";
import * as runIconHandlers from "../../src/debug/runIconHandler";
import * as globalVariables from "../../src/globalVariables";
import * as readmeHandlers from "../../src/handlers/readmeHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as appDefinitionUtils from "../../src/utils/appDefinitionUtils";
import {
  showLocalDebugMessage,
  ShowScaffoldingWarningSummary,
} from "../../src/utils/autoOpenHelper";
import { mockValue } from "../mocks/vitestMockUtils";

describe("autoOpenHelper", () => {
  let inMemoryGlobalState: Map<string, any>;

  beforeEach(async () => {
    inMemoryGlobalState = new Map<string, any>();
    vi.spyOn(globalState, "globalStateGet").mockImplementation(
      async (key: string, defaultValue?: any) => {
        return inMemoryGlobalState.has(key) ? inMemoryGlobalState.get(key) : defaultValue;
      }
    );
    vi.spyOn(globalState, "globalStateUpdate").mockImplementation(
      async (key: string, value: any) => {
        inMemoryGlobalState.set(key, value);
      }
    );
    vi.spyOn(appDefinitionUtils, "getAppName").mockResolvedValue("test-app");

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
  });

  it("showLocalDebugMessage() - has local env", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(true);
    const runLocalDebug = vi.spyOn(runIconHandlers, "selectAndDebug").mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: (options as any).title,
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();
    await Promise.resolve();

    assert.isTrue(showMessageStub.called);
  });

  it("showLocalDebugMessage() - local env and non windows", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "linux");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(true);
    const runLocalDebug = vi.spyOn(runIconHandlers, "selectAndDebug").mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: "Not Debug",
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.calledOnce);
    assert.isFalse(runLocalDebug.called);
  });

  it("showLocalDebugMessage() - has local env for DA project", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(true);
    const runLocalDebug = vi.spyOn(runIconHandlers, "selectAndDebug").mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    mockValue(globalVariables, "isDeclarativeCopilotApp", true);
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: (options as any).title,
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();
    await Promise.resolve();

    assert.isTrue(showMessageStub.calledOnce);
  });

  it("showLocalDebugMessage() - has local env for DA project on Linux", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "linux");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(true);
    const runLocalDebug = vi.spyOn(runIconHandlers, "selectAndDebug").mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    mockValue(globalVariables, "isDeclarativeCopilotApp", true);
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: "Not Preview",
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.calledOnce);
    assert.isFalse(runLocalDebug.called);
  });

  it("showLocalDebugMessage() - has local env and not click debug", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(true);
    const runLocalDebug = vi.spyOn(runIconHandlers, "selectAndDebug").mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve(undefined);
        }
      );

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.calledOnce);
    assert.isFalse(runLocalDebug.called);
  });

  it("showLocalDebugMessage() - no local env", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(false);

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: "Provision",
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.called);
    assert.isTrue(executeCommandStub.called);
  });

  it("showLocalDebugMessage() - no local env and non windows", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "linux");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(false);

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: "Not provision",
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.called);
    assert.isTrue(executeCommandStub.notCalled);
  });

  it("showLocalDebugMessage() - no local env and not click provision", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists").onFirstCall().mockResolvedValue(false);

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve(undefined);
        }
      );
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.called);
    assert.isFalse(executeCommandStub.called);
  });

  it("showLocalDebugMessage() - DA with MCP (DT flag on) shows scenario notification", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    // No local env (.local.yml / keyGen absent) so the else branch runs;
    // the .vscode/mcp.json marker exists -> DT scenario notification.
    vi.spyOn(fs, "pathExists").mockImplementation(async (p: string | Buffer | URL) =>
      String(p).includes("mcp.json")
    );
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
      (flag) => flag === FeatureFlags.MCPForDADT
    );

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockResolvedValue(undefined);
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.calledOnce);
    assert.isFalse(executeCommandStub.called);
  });

  it("showLocalDebugMessage() - generate an API key manually (TS - windows)", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists")
      .onFirstCall()
      .mockResolvedValue(true)
      .onSecondCall()
      .mockResolvedValue(true)
      .onThirdCall()
      .mockResolvedValue(false);
    const openReadMeHandlerStub = vi
      .spyOn(readmeHandlers, "openReadMeHandler")
      .mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: (options as any).title,
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();
    await Promise.resolve();

    assert.isTrue(showMessageStub.called);
  });

  it("showLocalDebugMessage() - generate an API key manually (TS - windows) not clicked", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists")
      .onFirstCall()
      .mockResolvedValue(true)
      .onSecondCall()
      .mockResolvedValue(true)
      .onThirdCall()
      .mockResolvedValue(false);
    const openReadMeHandlerStub = vi
      .spyOn(readmeHandlers, "openReadMeHandler")
      .mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: "Not Open README",
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.called);
    assert.isFalse(openReadMeHandlerStub.called);
  });

  it("showLocalDebugMessage() - generate an API key manually (TS - windows - non selection)", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists")
      .onFirstCall()
      .mockResolvedValue(true)
      .onSecondCall()
      .mockResolvedValue(true)
      .onThirdCall()
      .mockResolvedValue(false);
    const openReadMeHandlerStub = vi
      .spyOn(readmeHandlers, "openReadMeHandler")
      .mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve(undefined);
        }
      );

    await showLocalDebugMessage();

    assert.isTrue(showMessageStub.called);
    assert.isFalse(openReadMeHandlerStub.called);
  });

  it("showLocalDebugMessage() - generate an API key manually (JS - windows)", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "win32");
    vi.spyOn(fs, "pathExists")
      .onFirstCall()
      .mockResolvedValue(true)
      .onSecondCall()
      .mockResolvedValue(false)
      .onThirdCall()
      .mockResolvedValue(true);
    const openReadMeHandlerStub = vi
      .spyOn(readmeHandlers, "openReadMeHandler")
      .mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: (options as any).title,
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();
    await Promise.resolve();

    assert.isTrue(showMessageStub.called);
  });

  it("showLocalDebugMessage() - generate an API key manually (JS - non windows)", async () => {
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    mockValue(process, "platform", "linux");
    vi.spyOn(fs, "pathExists")
      .onFirstCall()
      .mockResolvedValue(true)
      .onSecondCall()
      .mockResolvedValue(false)
      .onThirdCall()
      .mockResolvedValue(true);
    const openReadMeHandlerStub = vi
      .spyOn(readmeHandlers, "openReadMeHandler")
      .mockResolvedValue(ok(null));

    await globalState.globalStateUpdate("ShowLocalDebugMessage", true);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockImplementation(
        (title: string, options: vscode.MessageOptions, ...items: vscode.MessageItem[]) => {
          return Promise.resolve({
            title: (options as any).title,
            run: (options as any).run,
          } as vscode.MessageItem);
        }
      );

    await showLocalDebugMessage();
    await Promise.resolve();

    assert.isTrue(showMessageStub.called);
  });

  it("ShowScaffoldingWarningSummary() - copilot agents", async () => {
    const workspacePath = "/path/to/workspace";

    const manifest: TeamsAppManifest = {
      manifestVersion: "version",
      id: "mock-app-id",
      name: { short: "short-name" },
      description: { short: "", full: "" },
      version: "version",
      icons: { outline: "outline.png", color: "color.png" },
      accentColor: "#ffffff",
      developer: {
        privacyUrl: "",
        websiteUrl: "",
        termsOfUseUrl: "",
        name: "",
      },
      staticTabs: [
        {
          name: "name0",
          entityId: "index0",
          scopes: ["personal"],
          contentUrl: "localhost/content",
          websiteUrl: "localhost/website",
        },
      ],
      copilotAgents: {
        plugins: [
          {
            id: "plugin-id",
            file: "copilot-plugin-file",
          },
        ],
      },
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(pluginManifestUtils, "getApiSpecFilePathFromTeamsManifest").mockResolvedValue(
      ok(["/path/to/api/spec"])
    );
    vi.spyOn(apiSpec, "generateScaffoldingSummary").mockResolvedValue("fake summary");
    vi.spyOn(VscodeLogInstance, "info").mockImplementation((message: string) => {
      if (message !== "fake summary") {
        throw new Error(`Unexpected message: ${message}`);
      }
    });
    const fakeOutputChannel = {
      show: vi.fn().mockResolvedValue(),
    };
    mockValue(VscodeLogInstance, "outputChannel", fakeOutputChannel);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockResolvedValue();
    // Call the function
    await ShowScaffoldingWarningSummary(workspacePath, "");
  });

  it("ShowScaffoldingWarningSummary() - copilot extensions", async () => {
    const workspacePath = "/path/to/workspace";

    const manifest: TeamsAppManifest = {
      manifestVersion: "version",
      id: "mock-app-id",
      name: { short: "short-name" },
      description: { short: "", full: "" },
      version: "version",
      icons: { outline: "outline.png", color: "color.png" },
      accentColor: "#ffffff",
      developer: {
        privacyUrl: "",
        websiteUrl: "",
        termsOfUseUrl: "",
        name: "",
      },
      staticTabs: [
        {
          name: "name0",
          entityId: "index0",
          scopes: ["personal"],
          contentUrl: "localhost/content",
          websiteUrl: "localhost/website",
        },
      ],
      copilotExtensions: {
        plugins: [
          {
            id: "plugin-id",
            file: "copilot-plugin-file",
          },
        ],
      },
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(pluginManifestUtils, "getApiSpecFilePathFromTeamsManifest").mockResolvedValue(
      ok(["/path/to/api/spec"])
    );
    vi.spyOn(apiSpec, "generateScaffoldingSummary").mockResolvedValue("fake summary");
    vi.spyOn(VscodeLogInstance, "info").mockImplementation((message: string) => {
      if (message !== "fake summary") {
        throw new Error(`Unexpected message: ${message}`);
      }
    });
    const fakeOutputChannel = {
      show: vi.fn().mockResolvedValue(),
    };
    mockValue(VscodeLogInstance, "outputChannel", fakeOutputChannel);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockResolvedValue();
    // Call the function
    await ShowScaffoldingWarningSummary(workspacePath, "");
  });

  it("ShowScaffoldingWarningSummary() - declarative agent", async () => {
    const workspacePath = "/path/to/workspace";

    const manifest: TeamsAppManifest = {
      manifestVersion: "version",
      id: "mock-app-id",
      name: { short: "short-name" },
      description: { short: "", full: "" },
      version: "version",
      icons: { outline: "outline.png", color: "color.png" },
      accentColor: "#ffffff",
      developer: {
        privacyUrl: "",
        websiteUrl: "",
        termsOfUseUrl: "",
        name: "",
      },
      staticTabs: [
        {
          name: "name0",
          entityId: "index0",
          scopes: ["personal"],
          contentUrl: "localhost/content",
          websiteUrl: "localhost/website",
        },
      ],
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(pluginManifestUtils, "getApiSpecFilePathFromTeamsManifest").mockResolvedValue(
      ok(["/path/to/api/spec"])
    );
    vi.spyOn(apiSpec, "generateScaffoldingSummary").mockResolvedValue("fake summary");
    vi.spyOn(VscodeLogInstance, "info").mockImplementation((message: string) => {
      if (message !== "fake summary") {
        throw new Error(`Unexpected message: ${message}`);
      }
    });
    const fakeOutputChannel = {
      show: vi.fn().mockResolvedValue(),
    };
    mockValue(VscodeLogInstance, "outputChannel", fakeOutputChannel);
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockResolvedValue();
    // Call the function
    await ShowScaffoldingWarningSummary(workspacePath, "");
  });
});
