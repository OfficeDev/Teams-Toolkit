import { FxError, Result, ok } from "@microsoft/teamsfx-api";
import * as globalState from "@microsoft/teamsfx-core";
import * as mockfs from "mock-fs";
import * as vscode from "vscode";
import { OfficeDevTerminal, TriggerCmdType } from "../../src/debug/taskTerminal/officeDevTerminal";
import * as globalVariables from "../../src/globalVariables";
import * as officeDevHandlers from "../../src/handlers/officeDevHandlers";
import { generateManifestGUID, stopOfficeAddInDebug } from "../../src/handlers/officeDevHandlers";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { openOfficeDevFolder } from "../../src/utils/workspaceUtils";
import * as autoOpenHelper from "../../src/utils/autoOpenHelper";
import * as readmeHandlers from "../../src/handlers/readmeHandlers";
import * as telemetryUtils from "../../src/utils/telemetryUtils";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("officeDevHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockfs.restore();
  });

  async function testOpenUrlHandler(
    openLinkFunc: (args?: any[]) => Promise<Result<boolean, FxError>>,
    urlPath: string
  ) {
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
    const openUrl = vi.spyOn(vsc_ui.VS_CODE_UI, "openUrl").mockResolvedValue(ok(true));
    const res = await openLinkFunc(undefined);
    assert.isTrue(openUrl.calledOnce);
    assert.isTrue(res.isOk());
    assert.equal(openUrl.args[0][0], urlPath);
  }

  it("openOfficePartnerCenterHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openOfficePartnerCenterHandler,
      "https://aka.ms/WXPAddinPublish"
    );
  });

  it("openGetStartedLinkHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openGetStartedLinkHandler,
      "https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins"
    );
  });

  it("openOfficeDevDeployHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openOfficeDevDeployHandler,
      "https://aka.ms/WXPAddinDeploy"
    );
  });

  it("publishToAppSourceHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.publishToAppSourceHandler,
      "https://learn.microsoft.com/partner-center/marketplace/submit-to-appsource-via-partner-center"
    );
  });

  it("openDebugLinkHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openDebugLinkHandler,
      "https://learn.microsoft.com/office/dev/add-ins/testing/debug-add-ins-overview"
    );
  });

  it("openDocumentHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openDocumentHandler,
      "https://learn.microsoft.com/office/dev/add-ins/"
    );
  });

  it("openDevelopmentLinkHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openDevelopmentLinkHandler,
      "https://learn.microsoft.com/office/dev/add-ins/develop/develop-overview"
    );
  });

  it("openLifecycleLinkHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openLifecycleLinkHandler,
      "https://learn.microsoft.com/office/dev/add-ins/overview/core-concepts-office-add-ins"
    );
  });

  it("openHelpFeedbackLinkHandler", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openHelpFeedbackLinkHandler,
      "https://learn.microsoft.com/answers/tags/9/m365"
    );
  });

  it("openReportIssues", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openReportIssues,
      "https://github.com/OfficeDev/office-js/issues"
    );
  });

  it("openScriptLabLink", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openScriptLabLink,
      "https://learn.microsoft.com/office/dev/add-ins/overview/explore-with-script-lab"
    );
  });

  it("openPromptLibraryLink", async () => {
    testOpenUrlHandler(
      officeDevHandlers.openPromptLibraryLink,
      "https://aka.ms/OfficeAddinsPromptLibrary"
    );
  });
});

describe("autoOpenOfficeDevProjectHandler", () => {
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

    await globalState.globalStateUpdate("fx-extension.openWalkThrough", false);
    await globalState.globalStateUpdate("fx-extension.openReadMe", "");
    await globalState.globalStateUpdate("fx-extension.openSampleReadMe", false);
    await globalState.globalStateUpdate("CreateWarnings", "");
  });

  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(autoOpenHelper, "ShowScaffoldingWarningSummary").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockfs.restore();
  });

  it("opens walk through", async () => {
    await globalState.globalStateUpdate("fx-extension.openWalkThrough", true);

    await officeDevHandlers.autoOpenOfficeDevProjectHandler();

    const isOpenWalkThrough = (await globalState.globalStateGet(
      "fx-extension.openWalkThrough",
      true
    )) as boolean;
    assert.isFalse(isOpenWalkThrough);
  });

  it("opens README", async () => {
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    vi.spyOn(readmeHandlers, "openReadMeHandler").mockResolvedValue();
    const readmePath = vscode.Uri.file("test").fsPath;
    await globalState.globalStateUpdate("fx-extension.openReadMe", readmePath);

    await officeDevHandlers.autoOpenOfficeDevProjectHandler();

    const currentReadMe = (await globalState.globalStateGet(
      "fx-extension.openReadMe",
      ""
    )) as string;
    assert.equal(currentReadMe, "");
  });

  it("opens sample README", async () => {
    mockValue(globalVariables, "workspaceUri", vscode.Uri.file("test"));
    vi.spyOn(globalVariables, "isTeamsFxProject").mockResolvedValue(false);
    vi.spyOn(globalVariables, "isOfficeAddInProject").mockResolvedValue(false);
    const showMessageStub = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockResolvedValue(undefined);
    mockValue(vscode.workspace, "workspaceFolders", [{ uri: vscode.Uri.file("test") }]);
    vi.spyOn(vscode.workspace, "openTextDocument");
    vi.spyOn(vscode.commands, "executeCommand");
    vi.spyOn(autoOpenHelper, "showLocalDebugMessage").mockResolvedValue();
    const openSampleReadmeHandlerStub = vi
      .spyOn(readmeHandlers, "openSampleReadmeHandler")
      .mockResolvedValue();
    await globalState.globalStateUpdate("fx-extension.openSampleReadMe", true);

    await officeDevHandlers.autoOpenOfficeDevProjectHandler();

    assert.isTrue(openSampleReadmeHandlerStub.calledOnce);
  });

  it("openOfficeDevFolder", async () => {
    await globalState.globalStateUpdate("ShowLocalDebugMessage", false);
    await globalState.globalStateUpdate("fx-extension.openReadMe", "");
    await globalState.globalStateUpdate("fx-extension.openWalkThrough", true);
    const folderPath = vscode.Uri.file("/test");
    const executeCommandStub = vi.spyOn(vscode.commands, "executeCommand");
    vi.spyOn(telemetryUtils, "isTriggerFromWalkThrough").mockReturnValue(false);

    await openOfficeDevFolder(folderPath, true, [{ type: "warnning", content: "test" }]);

    const openWalkThrough = await globalState.globalStateGet("fx-extension.openWalkThrough", true);
    const openReadMe = await globalState.globalStateGet("fx-extension.openReadMe", "");
    const showLocalDebugMessage = await globalState.globalStateGet("ShowLocalDebugMessage", false);
    assert.equal(openWalkThrough, false);
    assert.equal(openReadMe, folderPath.fsPath);
    assert.equal(showLocalDebugMessage, true);
    assert(executeCommandStub.calledWithExactly("vscode.openFolder", folderPath, true));
  });
});

describe("OfficeDevTerminal", () => {
  let getInstanceStub: any, showStub: any, sendTextStub: any;

  beforeEach(() => {
    getInstanceStub = vi.spyOn(OfficeDevTerminal, "getInstance");
    showStub = vi.fn();
    sendTextStub = vi.fn();
    getInstanceStub.mockReturnValue({ show: showStub, sendText: sendTextStub });
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
  });

  afterEach(() => {
    getInstanceStub.restore();
    vi.restoreAllMocks();
  });

  it("should validate Office AddIn Manifest", async () => {
    const result = await officeDevHandlers.validateOfficeAddInManifest();
    expect(result.isOk()).to.be.true;
    expect(showStub).toHaveBeenCalledTimes(1);
    expect(sendTextStub).toHaveBeenCalledWith(TriggerCmdType.triggerValidate); // replace triggerValidate with actual value
  });

  it("should install Office AddIn Dependencies", async () => {
    const result = await officeDevHandlers.installOfficeAddInDependencies();
    expect(result.isOk()).to.be.true;
    expect(showStub).toHaveBeenCalledTimes(1);
    expect(sendTextStub).toHaveBeenCalledWith(TriggerCmdType.triggerInstall); // replace triggerInstall with actual value
  });
});

class TerminalStub implements vscode.Terminal {
  shellIntegration: vscode.TerminalShellIntegration | undefined;
  name!: string;
  processId!: Thenable<number | undefined>;
  creationOptions!: Readonly<vscode.TerminalOptions | vscode.ExtensionTerminalOptions>;
  exitStatus: vscode.TerminalExitStatus | undefined;
  state!: vscode.TerminalState;
  hide(): void {
    throw new Error("Method not implemented.");
  }
  dispose(): void {
    throw new Error("Method not implemented.");
  }
  // Implement all methods from the Terminal interface
  // ...

  sendText(text: string, addNewLine?: boolean): void {
    // This is a stubbed method
  }

  show(preserveFocus?: boolean): void {
    // This is a stubbed method
  }
}

describe("stopOfficeAddInDebug", () => {
  let getInstanceStub: ReturnType<typeof vi.spyOn>;
  let showStub: ReturnType<typeof vi.spyOn>;
  let sendTextStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
  });

  it("should call getInstance, show and sendText", async () => {
    const terminalStub = new TerminalStub();
    getInstanceStub = vi.spyOn(OfficeDevTerminal, "getInstance").mockReturnValue(terminalStub);
    showStub = vi.spyOn(terminalStub, "show");
    sendTextStub = vi.spyOn(terminalStub, "sendText");
    await stopOfficeAddInDebug();

    expect(getInstanceStub).toHaveBeenCalledTimes(1);
    expect(showStub).toHaveBeenCalledTimes(1);
    expect(sendTextStub).toHaveBeenCalledTimes(1);
  });
});

describe("generateManifestGUID", () => {
  let getInstanceStub: ReturnType<typeof vi.spyOn>;
  let showStub: ReturnType<typeof vi.spyOn>;
  let sendTextStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
  });

  it("should call getInstance, show and sendText with correct arguments", async () => {
    const terminalStub = new TerminalStub();
    getInstanceStub = vi.spyOn(OfficeDevTerminal, "getInstance").mockReturnValue(terminalStub);
    showStub = vi.spyOn(terminalStub, "show");
    sendTextStub = vi.spyOn(terminalStub, "sendText");

    await generateManifestGUID();

    expect(getInstanceStub).toHaveBeenCalledTimes(1);
    expect(showStub).toHaveBeenCalledTimes(1);
    expect(sendTextStub).toHaveBeenCalledTimes(1);
    expect(sendTextStub).toHaveBeenCalledWith(TriggerCmdType.triggerGenerateGUID);
  });
});
