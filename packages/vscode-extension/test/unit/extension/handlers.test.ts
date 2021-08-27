import * as chai from "chai";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as handlers from "../../../src/handlers";
import {
  Inputs,
  Platform,
  Stage,
  VsCodeEnv,
  ok,
  err,
  UserError,
  Void,
} from "@microsoft/teamsfx-api";
import AppStudioTokenInstance from "../../../src/commonlib/appStudioLogin";
import { ExtTelemetry } from "../../../src/telemetry/extTelemetry";
import { WebviewPanel } from "../../../src/controls/webviewPanel";
import { PanelType } from "../../../src/controls/PanelType";
import { AzureAccountManager } from "../../../src/commonlib/azureLogin";
import { MockCore } from "./mocks/mockCore";
import * as extension from "../../../src/extension";
import * as accountTree from "../../../src/accountTree";
import TreeViewManagerInstance from "../../../src/commandsTreeViewProvider";

suite("handlers", () => {
  test("getWorkspacePath()", () => {
    chai.expect(handlers.getWorkspacePath()).equals(undefined);
  });

  suite("activate()", function () {
    const sandbox = sinon.createSandbox();

    this.beforeAll(() => {
      sandbox.stub(accountTree, "registerAccountTreeHandler");
      sandbox.stub(AzureAccountManager.prototype, "setStatusChangeMap");
      sandbox.stub(AppStudioTokenInstance, "setStatusChangeMap");
      sandbox.stub(vscode.extensions, "getExtension").returns(undefined);
      sandbox.stub(TreeViewManagerInstance, "getTreeView").returns(undefined);
    });

    this.afterAll(() => {
      sandbox.restore();
    });

    test("No globalState error", async () => {
      const result = await handlers.activate();
      chai.assert.deepEqual(result.isOk() ? result.value : result.error.name, {});
    });
  });

  test("getSystemInputs()", () => {
    const input: Inputs = handlers.getSystemInputs();

    chai.expect(input.platform).equals(Platform.VSCode);
  });

  suite("command handlers", () => {
    test("createNewProjectHandler()", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const createProject = sinon.spy(handlers.core, "createProject");
      sinon.stub(vscode.commands, "executeCommand");

      await handlers.createNewProjectHandler();

      sinon.assert.calledOnce(createProject);
      sinon.restore();
    });

    test("provisionHandler()", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const provisionResources = sinon.spy(handlers.core, "provisionResources");

      await handlers.provisionHandler();

      sinon.assert.calledOnce(provisionResources);
      sinon.restore();
    });

    test("deployHandler()", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const deployArtifacts = sinon.spy(handlers.core, "deployArtifacts");

      await handlers.deployHandler();

      sinon.assert.calledOnce(deployArtifacts);
      sinon.restore();
    });

    test("publishHandler()", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const publishApplication = sinon.spy(handlers.core, "publishApplication");

      await handlers.publishHandler();

      sinon.assert.calledOnce(publishApplication);
      sinon.restore();
    });
  });

  suite("runCommand()", () => {
    test("create", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const createProject = sinon.spy(handlers.core, "createProject");
      sinon.stub(vscode.commands, "executeCommand");

      await handlers.runCommand(Stage.create);

      sinon.restore();
      sinon.assert.calledOnce(createProject);
    });

    test("provisionResources", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      const provisionResources = sinon.spy(handlers.core, "provisionResources");

      await handlers.runCommand(Stage.provision);

      sinon.restore();
      sinon.assert.calledOnce(provisionResources);
    });

    test("deployArtifacts", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      const deployArtifacts = sinon.spy(handlers.core, "deployArtifacts");

      await handlers.runCommand(Stage.deploy);

      sinon.restore();
      sinon.assert.calledOnce(deployArtifacts);
    });

    test("localDebug", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      const localDebug = sinon.spy(handlers.core, "localDebug");

      await handlers.runCommand(Stage.debug);

      sinon.restore();
      sinon.assert.calledOnce(localDebug);
    });

    test("publishApplication", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      const publishApplication = sinon.spy(handlers.core, "publishApplication");

      await handlers.runCommand(Stage.publish);

      sinon.restore();
      sinon.assert.calledOnce(publishApplication);
    });

    test("createEnv", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const createEnv = sinon.spy(handlers.core, "createEnv");
      sinon.stub(vscode.commands, "executeCommand");

      await handlers.runCommand(Stage.createEnv);

      sinon.restore();
      sinon.assert.calledOnce(createEnv);
    });

    test("viewEnv", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");

      await handlers.viewEnvironment("test");

      sinon.restore();
    });
  });

  suite("detectVsCodeEnv()", () => {
    test("locally run", () => {
      const expectedResult = {
        extensionKind: vscode.ExtensionKind.UI,
        id: "",
        extensionUri: vscode.Uri.file(""),
        extensionPath: "",
        isActive: true,
        packageJSON: {},
        exports: undefined,
        activate: sinon.spy(),
      };
      const getExtension = sinon
        .stub(vscode.extensions, "getExtension")
        .callsFake((name: string) => {
          return expectedResult;
        });

      chai.expect(handlers.detectVsCodeEnv()).equals(VsCodeEnv.local);
      getExtension.restore();
    });

    test("Remotely run", () => {
      const expectedResult = {
        extensionKind: vscode.ExtensionKind.Workspace,
        id: "",
        extensionUri: vscode.Uri.file(""),
        extensionPath: "",
        isActive: true,
        packageJSON: {},
        exports: undefined,
        activate: sinon.spy(),
      };
      const getExtension = sinon
        .stub(vscode.extensions, "getExtension")
        .callsFake((name: string) => {
          return expectedResult;
        });

      chai
        .expect(handlers.detectVsCodeEnv())
        .oneOf([VsCodeEnv.remote, VsCodeEnv.codespaceVsCode, VsCodeEnv.codespaceBrowser]);
      getExtension.restore();
    });
  });

  test("openWelcomeHandler", async () => {
    const createOrShow = sinon.stub(WebviewPanel, "createOrShow");
    const sendTelemetryEvent = sinon.stub(ExtTelemetry, "sendTelemetryEvent");

    await handlers.openWelcomeHandler();

    sinon.assert.calledOnceWithExactly(createOrShow, PanelType.QuickStart);
    createOrShow.restore();
    sendTelemetryEvent.restore();
  });

  test("openSamplesHandler", async () => {
    const createOrShow = sinon.stub(WebviewPanel, "createOrShow");
    const sendTelemetryEvent = sinon.stub(ExtTelemetry, "sendTelemetryEvent");

    await handlers.openSamplesHandler();

    sinon.assert.calledOnceWithExactly(createOrShow, PanelType.SampleGallery);
    createOrShow.restore();
    sendTelemetryEvent.restore();
  });

  test("signOutM365", async () => {
    const signOut = sinon.stub(AppStudioTokenInstance, "signout");
    const sendTelemetryEvent = sinon.stub(ExtTelemetry, "sendTelemetryEvent");

    await handlers.signOutM365(false);

    sinon.assert.calledOnce(signOut);
    signOut.restore();
    sendTelemetryEvent.restore();
  });

  test("signOutAzure", async () => {
    Object.setPrototypeOf(AzureAccountManager, sinon.stub());
    const signOut = sinon.stub(AzureAccountManager.getInstance(), "signout");
    const sendTelemetryEvent = sinon.stub(ExtTelemetry, "sendTelemetryEvent");

    await handlers.signOutAzure(false);

    sinon.assert.calledOnce(signOut);
    signOut.restore();
    sendTelemetryEvent.restore();
  });

  suite("decryptSecret", () => {
    test("successfully update secret", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      const sendTelemetryEvent = sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      const sendTelemetryErrorEvent = sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const decrypt = sinon.spy(handlers.core, "decrypt");
      const encrypt = sinon.spy(handlers.core, "encrypt");
      sinon.stub(vscode.commands, "executeCommand");
      const editBuilder = sinon.spy();
      sinon.stub(vscode.window, "activeTextEditor").value({
        edit: function (callback: (eb: any) => void) {
          callback({
            replace: editBuilder,
          });
        },
      });
      sinon.stub(extension, "VS_CODE_UI").value({
        inputText: () => Promise.resolve(ok({ type: "success", result: "inputValue" })),
      });
      const range = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));

      await handlers.decryptSecret("test", range);

      sinon.assert.calledOnce(decrypt);
      sinon.assert.calledOnce(encrypt);
      sinon.assert.calledOnce(editBuilder);
      sinon.assert.calledTwice(sendTelemetryEvent);
      sinon.assert.notCalled(sendTelemetryErrorEvent);
      sinon.restore();
    });

    test("failed to update due to corrupted secret", async () => {
      sinon.stub(handlers, "core").value(new MockCore());
      const sendTelemetryEvent = sinon.stub(ExtTelemetry, "sendTelemetryEvent");
      const sendTelemetryErrorEvent = sinon.stub(ExtTelemetry, "sendTelemetryErrorEvent");
      const decrypt = sinon.stub(handlers.core, "decrypt");
      decrypt.returns(Promise.resolve(err(new UserError("fake error", "", ""))));
      const encrypt = sinon.spy(handlers.core, "encrypt");
      sinon.stub(vscode.commands, "executeCommand");
      const editBuilder = sinon.spy();
      sinon.stub(vscode.window, "activeTextEditor").value({
        edit: function (callback: (eb: any) => void) {
          callback({
            replace: editBuilder,
          });
        },
      });
      const showMessage = sinon.stub(vscode.window, "showErrorMessage");
      const range = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));

      await handlers.decryptSecret("test", range);

      sinon.assert.calledOnce(decrypt);
      sinon.assert.notCalled(encrypt);
      sinon.assert.notCalled(editBuilder);
      sinon.assert.calledOnce(showMessage);
      sinon.assert.calledOnce(sendTelemetryEvent);
      sinon.assert.calledOnce(sendTelemetryErrorEvent);
      sinon.restore();
    });
  });
});
