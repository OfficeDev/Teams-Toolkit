import { err, ok, SystemError, UserError } from "@microsoft/teamsfx-api";
import { manifestUtils, pluginManifestUtils } from "@microsoft/teamsfx-core";
import * as globalState from "@microsoft/teamsfx-core";
import * as pluginGeneratorHelper from "@microsoft/teamsfx-core/build/component/generator/openApiSpec/helper";
import path from "path";
import * as vscode from "vscode";
import { vi, assert } from "vitest";
import VsCodeLogInstance from "../../src/commonlib/log";
import { GlobalKey } from "../../src/constants";
import * as globalVariables from "../../src/globalVariables";
import { autoOpenProjectHandler } from "../../src/handlers/autoOpenProjectHandler";
import * as readmeHandlers from "../../src/handlers/readmeHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as autoOpenHelper from "../../src/utils/autoOpenHelper";
import * as projectStatusUtils from "../../src/utils/projectStatusUtils";

describe("autoOpenProjectHandler", () => {
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

    vi.spyOn(autoOpenHelper, "showLocalDebugMessage").mockResolvedValue();
    vi.spyOn(autoOpenHelper, "ShowScaffoldingWarningSummary").mockResolvedValue();
    vi.spyOn(readmeHandlers, "openReadMeHandler").mockResolvedValue();
    vi.spyOn(readmeHandlers, "openWorkspaceMCPConfigHandler").mockResolvedValue();
    vi.spyOn(readmeHandlers, "openSampleReadmeHandler").mockResolvedValue();
    vi.spyOn(projectStatusUtils, "updateProjectStatus").mockResolvedValue();

    await globalState.globalStateUpdate(GlobalKey.OpenWalkThrough, false);
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, "");
    await globalState.globalStateUpdate(GlobalKey.OpenSampleReadMe, false);
    await globalState.globalStateUpdate(GlobalKey.CreateWarnings, "");
    await globalState.globalStateUpdate(GlobalKey.AutoInstallDependency, false);
    await globalState.globalStateUpdate(GlobalKey.ShowLocalDebugMessage, false);
  });

  it("opens walk through", async () => {
    await globalState.globalStateUpdate(GlobalKey.OpenWalkThrough, true);
    const sendTelemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    const executeCommandFunc = vi.spyOn(vscode.commands, "executeCommand");

    await autoOpenProjectHandler();

    assert.equal(sendTelemetryStub.mock.calls.length, 0);
    assert.equal(executeCommandFunc.mock.calls.length, 0);
  });

  it("opens walk through if workspace Uri exists", async () => {
    await globalState.globalStateUpdate(GlobalKey.OpenWalkThrough, true);
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.parse("test"));

    await autoOpenProjectHandler();

    const isOpenWalkThrough = (await globalState.globalStateGet(
      GlobalKey.OpenWalkThrough,
      true
    )) as boolean;
    assert.isFalse(isOpenWalkThrough);
  });

  it("opens README", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);

    await autoOpenProjectHandler();

    const openReadMe = (await globalState.globalStateGet(GlobalKey.OpenReadMe, "")) as string;
    assert.equal(openReadMe, "");
  });

  it("opens sample README", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenSampleReadMe, true);
    await autoOpenProjectHandler();

    const openSampleReadMe = (await globalState.globalStateGet(
      GlobalKey.OpenSampleReadMe,
      true
    )) as boolean;
    assert.isFalse(openSampleReadMe);
  });

  it("opens README and show APIE ME warnings successfully", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);
    await globalState.globalStateUpdate(
      GlobalKey.CreateWarnings,
      JSON.stringify([{ type: "type", content: "content" }])
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        name: { short: "short", full: "full" },
        description: { short: "short", full: "" },
        composeExtensions: [{ apiSpecificationFile: "test.json", commands: [{ id: "command1" }] }],
      } as any)
    );
    const parseRes = {
      id: "",
      version: "",
      capabilities: [""],
      manifestVersion: "",
      isApiME: true,
      isSPFx: false,
      isApiMeAAD: false,
    };
    vi.spyOn(manifestUtils, "parseCommonProperties").mockReturnValue(parseRes as any);
    VsCodeLogInstance.outputChannel = {
      show: () => {},
      info: () => {},
    } as unknown as vscode.OutputChannel;
    vi.spyOn(pluginGeneratorHelper, "generateScaffoldingSummary").mockResolvedValue(
      "warning message"
    );

    await autoOpenProjectHandler();

    const openReadMe = (await globalState.globalStateGet(GlobalKey.OpenReadMe, "")) as string;
    assert.equal(openReadMe, "");
  });

  it("opens README and show warnings", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);
    await globalState.globalStateUpdate(
      GlobalKey.CreateWarnings,
      JSON.stringify([{ type: "type", content: "content" }])
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        name: { short: "short", full: "full" },
        description: { short: "short", full: "" },
        composeExtensions: [{ commands: [{ id: "command1" }] }],
      } as any)
    );
    const parseRes = {
      id: "",
      version: "",
      capabilities: [""],
      manifestVersion: "",
      isApiME: true,
      isSPFx: false,
      isApiMeAAD: false,
    };
    vi.spyOn(manifestUtils, "parseCommonProperties").mockReturnValue(parseRes as any);
    VsCodeLogInstance.outputChannel = {
      show: () => {},
      info: () => {},
    } as unknown as vscode.OutputChannel;
    const generateWarningStub = vi
      .spyOn(pluginGeneratorHelper, "generateScaffoldingSummary")
      .mockResolvedValue("warning message");

    await autoOpenProjectHandler();

    assert.equal(generateWarningStub.mock.calls.length, 0);
  });

  it("opens README and show copilot plugin warnings successfully", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);
    await globalState.globalStateUpdate(
      GlobalKey.CreateWarnings,
      JSON.stringify([{ type: "type", content: "content" }])
    );
    vi.spyOn(path, "relative").mockReturnValue("test");

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        name: { short: "short", full: "full" },
        description: { short: "short", full: "" },
        copilotExtensions: { plugins: [{ file: "ai-plugin.json", id: "plugin1" }] },
      } as any)
    );
    const parseRes = {
      id: "",
      version: "",
      capabilities: ["plugin"],
      manifestVersion: "",
      isApiME: false,
      isSPFx: false,
      isApiMeAAD: false,
    };
    vi.spyOn(manifestUtils, "parseCommonProperties").mockReturnValue(parseRes as any);
    vi.spyOn(pluginManifestUtils, "getApiSpecFilePathFromTeamsManifest").mockResolvedValue(
      ok(["test"])
    );
    VsCodeLogInstance.outputChannel = {
      show: () => {},
      info: () => {},
    } as unknown as vscode.OutputChannel;
    vi.spyOn(pluginGeneratorHelper, "generateScaffoldingSummary").mockResolvedValue(
      "warning message"
    );

    await autoOpenProjectHandler();
  });
  it("skip show warnings if parsing error", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);
    await globalState.globalStateUpdate(GlobalKey.CreateWarnings, "string");
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

    await autoOpenProjectHandler();
  });

  it("skip show warnings if cannot get manifest", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);
    await globalState.globalStateUpdate(GlobalKey.CreateWarnings, "string");
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      err(new UserError("source", "name", "", ""))
    );

    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

    await autoOpenProjectHandler();
  });

  it("skip show warnings if get plugin api spec error", async () => {
    vi.spyOn(globalVariables, "workspaceUri", "get").mockReturnValue(vscode.Uri.file("test"));
    await globalState.globalStateUpdate(GlobalKey.OpenReadMe, vscode.Uri.file("test").fsPath);
    await globalState.globalStateUpdate(
      GlobalKey.CreateWarnings,
      JSON.stringify([{ type: "type", content: "content" }])
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        name: { short: "short", full: "full" },
        description: { short: "short", full: "" },
        copilotExtensions: { plugins: [{ file: "ai-plugin.json", id: "plugin1" }] },
      } as any)
    );
    const parseRes = {
      id: "",
      version: "",
      capabilities: ["plugin"],
      manifestVersion: "",
      isApiME: false,
      isSPFx: false,
      isApiBasedMe: true,
      isApiMeAAD: false,
    };
    vi.spyOn(manifestUtils, "parseCommonProperties").mockReturnValue(parseRes as any);
    const getApiSpecStub = vi
      .spyOn(pluginManifestUtils, "getApiSpecFilePathFromTeamsManifest")
      .mockResolvedValue(err(new SystemError("test", "test", "", "")));
    VsCodeLogInstance.outputChannel = {
      show: () => {},
      info: () => {},
    } as unknown as vscode.OutputChannel;
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

    await autoOpenProjectHandler();
    assert.isDefined(getApiSpecStub);
  });

  it("auto install dependency", async () => {
    await globalState.globalStateUpdate(GlobalKey.AutoInstallDependency, true);
    const autoInstallDependencyHandlerStub = vi
      .spyOn(autoOpenHelper, "autoInstallDependencyHandler")
      .mockResolvedValue();
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

    await autoOpenProjectHandler();

    const autoInstallDependency = (await globalState.globalStateGet(
      GlobalKey.AutoInstallDependency,
      true
    )) as boolean;
    assert.isFalse(autoInstallDependency);
    assert.equal(autoInstallDependencyHandlerStub.mock.calls.length, 1);
  });
});
