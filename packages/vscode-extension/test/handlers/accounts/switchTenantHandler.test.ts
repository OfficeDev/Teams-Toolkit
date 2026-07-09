import * as vscode from "vscode";
import { vi, assert } from "vitest";
import { mockValue } from "../../mocks/vitestMockUtils";

import { ExtTelemetry } from "../../../src/telemetry/extTelemetry";
import M365TokenInstance from "../../../src/commonlib/m365Login";
import azureAccountManager from "../../../src/commonlib/azureLogin";
import { err, ok, SystemError } from "@microsoft/teamsfx-api";
import { NetworkError, UserCancelError } from "@microsoft/teamsfx-core";
import {
  onSwitchM365Tenant,
  onSwitchAzureTenant,
} from "../../../src/handlers/accounts/switchTenantHandler";
import { TelemetryTriggerFrom } from "../../../src/telemetry/extTelemetryEvents";
import * as tool from "@microsoft/teamsfx-core/build/common/tools";
import * as vsc_ui from "../../../src/qm/vsc_ui";
import { LoginFailureError } from "../../../src/commonlib/codeFlowLogin";

describe("onSwitchM365Tenant", () => {
  let sendTelemetryEventStub: ReturnType<typeof vi.spyOn>;
  let sendTelemetryErrorEventStub: ReturnType<typeof vi.spyOn>;
  let selectOptionStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
  });

  it("Failed to retrieve access token", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
      err(new NetworkError("extension", ""))
    );

    await onSwitchM365Tenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.args[0][1] instanceof NetworkError);
  });

  it("Failed to select tenant in UI", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(ok("faked token"));
    vi.spyOn(M365TokenInstance, "switchTenant").mockResolvedValue(ok("faked token"));
    vi.spyOn(tool, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
        defaultDomain: "t815h.onmicrosoft.com",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
        defaultDomain: "Cisco561.onmicrosoft.com",
      },
    ]);
    selectOptionStub = vi
      .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
      .mockResolvedValue(err(new UserCancelError()));

    await onSwitchM365Tenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.args[0][1] instanceof UserCancelError);
  });

  it("Failed to switch tenant", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(ok("faked token"));
    vi.spyOn(M365TokenInstance, "switchTenant").mockResolvedValue(
      err(new NetworkError("extension", ""))
    );
    vi.spyOn(tool, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
        defaultDomain: "t815h.onmicrosoft.com",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
        defaultDomain: "Cisco561.onmicrosoft.com",
      },
    ]);
    selectOptionStub = vi
      .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
      .mockResolvedValue(ok({ type: "success" }));

    await onSwitchM365Tenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.args[0][1] instanceof NetworkError);
  });

  it("Succeed to switch tenant", async () => {
    vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(ok("faked token"));
    vi.spyOn(M365TokenInstance, "switchTenant").mockResolvedValue(ok("faked token"));
    vi.spyOn(tool, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
        defaultDomain: "t815h.onmicrosoft.com",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
        defaultDomain: "Cisco561.onmicrosoft.com",
      },
    ]);
    selectOptionStub = vi
      .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
      .mockResolvedValue(ok({ type: "success" }));

    await onSwitchM365Tenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledTwice);
    assert.isTrue(sendTelemetryErrorEventStub.notCalled);
    const items = await selectOptionStub.args[0][0].options();
    assert.deepEqual(items, [
      {
        id: "0022fd51-06f5-4557-8a34-69be98de6e20",
        label: "MSFT",
        description: "t815h.onmicrosoft.com",
      },
      {
        id: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        label: "Cisco",
        description: "Cisco561.onmicrosoft.com",
      },
    ]);
  });
});

describe("onSwitchAzureTenant", () => {
  let sendTelemetryEventStub: ReturnType<typeof vi.spyOn>;
  let sendTelemetryErrorEventStub: ReturnType<typeof vi.spyOn>;
  let selectOptionStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendTelemetryEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    sendTelemetryErrorEventStub = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    mockValue(vsc_ui, "VS_CODE_UI", new vsc_ui.VsCodeUI(<vscode.ExtensionContext>{}));
  });

  it("Failed to retrieve access token", async () => {
    vi.spyOn(azureAccountManager, "getIdentityCredentialAsync").mockResolvedValue({
      getToken: () => {
        return Promise.resolve(null);
      },
    });
    selectOptionStub = vi.spyOn(vsc_ui.VS_CODE_UI, "selectOption").mockResolvedValue(
      err({
        name: "switchTenantFailed",
        source: "extension",
        timestamp: new Date(),
        message: "failed",
      })
    );

    await onSwitchAzureTenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    try {
      await selectOptionStub.args[0][0].options();
    } catch (e) {
      assert.isTrue(e instanceof SystemError);
    }
  });

  it("User cancelled", async () => {
    vi.spyOn(azureAccountManager, "getIdentityCredentialAsync").mockResolvedValue({
      getToken: () => {
        return Promise.resolve(null);
      },
    });
    selectOptionStub = vi
      .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
      .mockResolvedValue(err(new UserCancelError()));

    await onSwitchAzureTenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
  });

  it("Failed to switch tenant", async () => {
    vi.spyOn(azureAccountManager, "getIdentityCredentialAsync").mockResolvedValue({
      getToken: () => {
        return Promise.resolve({ token: "faked token", expiresOnTimestamp: 0 });
      },
    });
    vi.spyOn(tool, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
        defaultDomain: "t815h.onmicrosoft.com",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
        defaultDomain: "Cisco561.onmicrosoft.com",
      },
    ]);
    selectOptionStub = vi
      .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
      .mockResolvedValue(ok({ type: "success" }));
    const switchTenantStub = vi
      .spyOn(azureAccountManager, "switchTenant")
      .mockResolvedValue(err(LoginFailureError()));

    await onSwitchAzureTenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledOnce);
    assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    assert.isTrue(selectOptionStub.calledOnce);
    assert.isTrue(switchTenantStub.calledOnce);
  });

  it("Succeed to switch tenant", async () => {
    vi.spyOn(azureAccountManager, "getIdentityCredentialAsync").mockResolvedValue({
      getToken: () => {
        return Promise.resolve({ token: "faked token", expiresOnTimestamp: 0 });
      },
    });
    vi.spyOn(tool, "listAllTenants").mockResolvedValue([
      {
        tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
        displayName: "MSFT",
        defaultDomain: "t815h.onmicrosoft.com",
      },
      {
        tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        displayName: "Cisco",
        defaultDomain: "Cisco561.onmicrosoft.com",
      },
    ]);
    selectOptionStub = vi
      .spyOn(vsc_ui.VS_CODE_UI, "selectOption")
      .mockResolvedValue(ok({ type: "success" }));
    const switchTenantStub = vi.spyOn(azureAccountManager, "switchTenant").mockResolvedValue(
      ok({
        getToken: () => {
          return Promise.resolve(null);
        },
      })
    );

    await onSwitchAzureTenant(TelemetryTriggerFrom.SideBar);

    assert.isTrue(sendTelemetryEventStub.calledTwice);
    assert.isTrue(sendTelemetryErrorEventStub.notCalled);
    assert.isTrue(selectOptionStub.calledOnce);
    assert.isTrue(switchTenantStub.calledOnce);
    const items = await selectOptionStub.args[0][0].options();
    assert.deepEqual(items, [
      {
        id: "0022fd51-06f5-4557-8a34-69be98de6e20",
        label: "MSFT",
        description: "t815h.onmicrosoft.com",
      },
      {
        id: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
        label: "Cisco",
        description: "Cisco561.onmicrosoft.com",
      },
    ]);
  });
});
