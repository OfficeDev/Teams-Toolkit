import * as vscode from "vscode";
import { NetworkError, UserCancelError } from "@microsoft/teamsfx-core";
import { FeatureFlags, GraphScopes, featureFlagManager } from "@microsoft/teamsfx-core";
import { AzureAccountManager } from "../../../src/commonlib/azureLogin";
import { vi, assert } from "vitest";
import {
  signinAzureCallback,
  signinM365Callback,
} from "../../../src/handlers/accounts/signinAccountHandlers";
import { ExtTelemetry } from "../../../src/telemetry/extTelemetry";
import { setTools, tools } from "../../../src/globalVariables";
import { err, ok } from "@microsoft/teamsfx-api";
import { MockTools } from "../../mocks/mockTools";

describe("SigninAccountHandlers", () => {
  describe("signinAzureCallback", () => {
    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    });

    it("Happy path", async () => {
      vi.spyOn(AzureAccountManager.prototype, "getAccountInfo").mockReturnValue(undefined);
      const getIdentityCredentialStub = vi.spyOn(
        AzureAccountManager.prototype,
        "getIdentityCredentialAsync"
      );

      await signinAzureCallback({}, { status: 0 });

      assert.isTrue(getIdentityCredentialStub.calledOnce);
    });

    it("signinAzureCallback with error", async () => {
      vi.spyOn(AzureAccountManager.prototype, "getAccountInfo").mockReturnValue({});
      vi.spyOn(AzureAccountManager.prototype, "getIdentityCredentialAsync").throws(new Error());

      const res = await signinAzureCallback({}, { status: 0 });

      assert.isTrue(res.isErr());
    });

    it("signinAzureCallback with cancel error", async () => {
      vi.spyOn(AzureAccountManager.prototype, "getAccountInfo").mockReturnValue({});
      vi.spyOn(AzureAccountManager.prototype, "getIdentityCredentialAsync").throws(
        new UserCancelError("")
      );

      const res = await signinAzureCallback({}, { status: 0 });

      assert.isTrue(res.isOk());
    });

    it("Signed in status", async () => {
      vi.spyOn(AzureAccountManager.prototype, "getAccountInfo").mockReturnValue(undefined);
      const getIdentityCredentialStub = vi.spyOn(
        AzureAccountManager.prototype,
        "getIdentityCredentialAsync"
      );

      await signinAzureCallback({}, { status: 2 });

      assert.isTrue(getIdentityCredentialStub.notCalled);
    });
  });

  describe("signinM365Callback", () => {
    setTools(new MockTools());

    beforeEach(() => {
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    });

    it("Happy path - valid upn", async () => {
      const setSignedInStub = vi.fn();
      const getJsonObjectStub = vi
        .spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject")
        .mockReturnValue(Promise.resolve(ok({ upn: "test" })));

      await signinM365Callback(
        {},
        {
          status: 0,
          setSignedIn: (...args: any[]) => {
            setSignedInStub(args);
          },
        }
      );

      assert.isTrue(getJsonObjectStub.calledOnce);
      assert.isTrue(setSignedInStub.calledOnceWith(["test", ""]));
    });

    it("Happy path - valid tid", async () => {
      const setSignedInStub = vi.fn();
      const getJsonObjectStub = vi
        .spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject")
        .mockReturnValue(Promise.resolve(ok({ tid: "test" })));

      await signinM365Callback(
        {},
        {
          status: 0,
          setSignedIn: (...args: any[]) => {
            setSignedInStub(args);
          },
        }
      );

      assert.isTrue(getJsonObjectStub.calledOnce);
      assert.isTrue(setSignedInStub.calledOnceWith(["", "test"]));
    });

    it("Happy path - valid upn & tid", async () => {
      const setSignedInStub = vi.fn();
      const getJsonObjectStub = vi
        .spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject")
        .mockReturnValue(Promise.resolve(ok({ upn: "test upn", tid: "test tid" })));

      await signinM365Callback(
        {},
        {
          status: 0,
          setSignedIn: (...args: any[]) => {
            setSignedInStub(args);
          },
        }
      );

      assert.isTrue(getJsonObjectStub.calledOnce);
      assert.isTrue(setSignedInStub.calledOnceWith(["test upn", "test tid"]));
    });

    it("invalid token result", async () => {
      const setSignedInStub = vi.fn();
      const getJsonObjectStub = vi
        .spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject")
        .mockReturnValue(
          Promise.resolve(err(new NetworkError("source", "Failed to retrieve token")))
        );

      await signinM365Callback(
        {},
        {
          status: 0,
          setSignedIn: (args: any) => {
            setSignedInStub(args);
          },
        }
      );

      assert.isTrue(getJsonObjectStub.calledOnce);
      assert.isTrue(setSignedInStub.notCalled);
    });

    it("Signed in", async () => {
      const setSignedInStub = vi.fn();
      const getJsonObjectStub = vi
        .spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject")
        .mockReturnValue(Promise.resolve(ok({ upn: "test" })));

      await signinM365Callback(
        {},
        {
          status: 2,
          setSignedIn: (args: any) => {
            setSignedInStub(args);
          },
        }
      );

      assert.isTrue(getJsonObjectStub.notCalled);
      assert.isTrue(setSignedInStub.notCalled);
    });

    it("uses Graph scopes in sovereign high", async () => {
      vi.spyOn(featureFlagManager, "getStringValue").mockReturnValue("GCC H");
      const getJsonObjectStub = vi
        .spyOn(tools.tokenProvider.m365TokenProvider, "getJsonObject")
        .mockReturnValue(Promise.resolve(ok({ upn: "test" })));

      await signinM365Callback({}, { status: 0, setSignedIn: () => {} });

      assert.isTrue(
        getJsonObjectStub.calledOnceWithExactly({
          scopes: GraphScopes,
          showDialog: true,
        })
      );
    });
  });
});
