import { err, ok } from "@microsoft/teamsfx-api";
import { vi } from "vitest";
import {
  MosServiceScope,
  AppStudioScopes,
  FeatureFlags,
  GraphScopes,
  PackageService,
  featureFlagManager,
} from "@microsoft/teamsfx-core";
import * as vscode from "vscode";
import VsCodeLogInstance from "../../../src/commonlib/log";
import M365TokenInstance from "../../../src/commonlib/m365Login";
import { checkCopilotAccessHandler } from "../../../src/handlers/accounts/checkCopilotAccess";

describe("check copilot access", () => {
  beforeEach(() => {
    vi.spyOn(PackageService, "GetSharedInstance").mockReturnValue(new PackageService("endpoint"));
  });

  it("check copilot access in walkthrough: not signed in && with access", async () => {
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .withArgs({ scopes: AppStudioScopes() })
      .mockResolvedValue(err({ error: "unknown" } as any));
    const m365GetAccessTokenStub = vi
      .spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(ok("stubedString"));
    const getCopilotStatusStub = vi
      .spyOn(PackageService.prototype, "getCopilotStatus")
      .mockResolvedValue(true);
    const showMessageStub = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue({
      title: "Sign in",
    } as vscode.MessageItem);
    const signInM365Stub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();
    const semLogStub = vi.spyOn(VsCodeLogInstance, "semLog").mockResolvedValue();

    await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(showMessageStub).toHaveBeenCalledTimes(1);
    expect(signInM365Stub).toHaveBeenCalledTimes(1);
    expect(m365GetAccessTokenStub).toHaveBeenCalledTimes(1);
    expect(getCopilotStatusStub).toHaveBeenCalledTimes(1);
    expect(semLogStub).toHaveBeenCalledTimes(1);
  });

  it("check copilot access in walkthrough: not signed in && no access", async () => {
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .withArgs({ scopes: AppStudioScopes() })
      .mockResolvedValue(err({ error: "unknown" } as any));
    const m365GetAccessTokenStub = vi
      .spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(ok("stubedString"));

    const getCopilotStatusStub = vi
      .spyOn(PackageService.prototype, "getCopilotStatus")
      .mockResolvedValue(false);

    const showMessageStub = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

    const semLogStub = vi.spyOn(VsCodeLogInstance, "semLog").mockResolvedValue();

    await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(showMessageStub).toHaveBeenCalledTimes(1);
    expect(signInM365Stub).toHaveBeenCalledTimes(1);
    expect(m365GetAccessTokenStub).toHaveBeenCalledTimes(1);
    expect(getCopilotStatusStub).toHaveBeenCalledTimes(1);
    expect(semLogStub).toHaveBeenCalledTimes(1);
  });

  it("check copilot access in walkthrough: not signed in && throw error", async () => {
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .withArgs({ scopes: AppStudioScopes() })
      .mockResolvedValue(err({ error: "unknown" } as any));
    vi.spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(ok("stubedString"));

    vi.spyOn(PackageService.prototype, "getCopilotStatus").mockResolvedValue(true);

    const showMessageStub = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = vi
      .spyOn(vscode.commands, "executeCommand")
      .mockRejectedValue(Error("error"));

    const result = await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(showMessageStub).toHaveBeenCalledTimes(1);
    expect(signInM365Stub).toHaveBeenCalledTimes(1);
    sandbox.assert.match(result.isErr() ? result.error.message : "", "error");
  });

  it("check copilot access in walkthrough: signed in && no access", async () => {
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .withArgs({ scopes: AppStudioScopes() })
      .mockResolvedValue(ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } }));
    const m365GetAccessTokenStub = vi
      .spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(ok("stubedString"));

    const getCopilotStatusStub = vi
      .spyOn(PackageService.prototype, "getCopilotStatus")
      .mockResolvedValue(false);

    const showMessageStub = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

    const semLogStub = vi.spyOn(VsCodeLogInstance, "semLog").mockResolvedValue();

    await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(showMessageStub).not.toHaveBeenCalled();
    expect(signInM365Stub).not.toHaveBeenCalled();
    expect(m365GetAccessTokenStub).toHaveBeenCalledTimes(1);
    expect(getCopilotStatusStub).toHaveBeenCalledTimes(1);
    expect(semLogStub).toHaveBeenCalledTimes(1);
  });

  it("check copilot access in walkthrough: signed in && with access", async () => {
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .withArgs({ scopes: AppStudioScopes() })
      .mockResolvedValue(ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } }));
    const m365GetAccessTokenStub = vi
      .spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(ok("stubedString"));

    const getCopilotStatusStub = vi
      .spyOn(PackageService.prototype, "getCopilotStatus")
      .mockResolvedValue(true);

    const showMessageStub = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue({
      title: "Sign in",
    } as vscode.MessageItem);

    const signInM365Stub = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue();

    const semLogStub = vi.spyOn(VsCodeLogInstance, "semLog").mockResolvedValue();

    await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(showMessageStub).not.toHaveBeenCalled();
    expect(signInM365Stub).not.toHaveBeenCalled();
    expect(m365GetAccessTokenStub).toHaveBeenCalledTimes(1);
    expect(getCopilotStatusStub).toHaveBeenCalledTimes(1);
    expect(semLogStub).toHaveBeenCalledTimes(1);
  });

  it("check copilot access in walkthrough: signed in && throw error", async () => {
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .withArgs({ scopes: AppStudioScopes() })
      .mockResolvedValue(ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } }));
    const m365GetAccessTokenStub = vi
      .spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(err({ error: "error" } as any));

    const result = await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(m365GetAccessTokenStub).toHaveBeenCalledTimes(1);
    sandbox.assert.match(result.isErr() ? result.error : {}, { error: "error" });
  });

  it("uses Graph scopes in sovereign high", async () => {
    vi.spyOn(featureFlagManager, "getStringValue").mockReturnValue("GCC H");
    const m365GetStatusStub = vi
      .spyOn(M365TokenInstance, "getStatus")
      .mockResolvedValue(ok({ status: "SignedIn", accountInfo: { upn: "test.email.com" } } as any));
    const m365GetAccessTokenStub = vi
      .spyOn(M365TokenInstance, "getAccessToken")
      .withArgs({ scopes: MosServiceScope() })
      .mockResolvedValue(ok("stubedString"));
    vi.spyOn(PackageService.prototype, "getCopilotStatus").mockResolvedValue(true);
    vi.spyOn(VsCodeLogInstance, "semLog").mockResolvedValue();

    const result = await checkCopilotAccessHandler();

    expect(m365GetStatusStub).toHaveBeenCalledTimes(1);
    expect(m365GetStatusStub).toHaveBeenCalledWith({ scopes: GraphScopes });
    expect(m365GetAccessTokenStub).toHaveBeenCalledTimes(1);
    sandbox.assert.match(result.isOk(), true);
  });
});
