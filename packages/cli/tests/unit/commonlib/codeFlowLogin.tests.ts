// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AccountInfo } from "@azure/msal-node";
import { CodeFlowLogin } from "../../../src/commonlib/codeFlowLogin";
import CliTelemetry from "../../../src/telemetry/cliTelemetry";
import { expect } from "../utils";
import { vi } from "vitest";

const expressMocks = vi.hoisted(() => ({
  app: {
    listen: vi.fn(() => ({
      address: vi.fn(() => ({ port: 12345 })),
      close: vi.fn(),
      on: vi.fn(),
    })),
    post: vi.fn(),
    use: vi.fn(),
  },
  urlencoded: vi.fn(() => vi.fn()),
}));

vi.mock("express", () => ({
  default: Object.assign(
    vi.fn(() => expressMocks.app),
    {
      urlencoded: expressMocks.urlencoded,
    }
  ),
}));

vi.mock("open", () => ({ default: vi.fn() }));

describe("CodeFlowLogin.loginWithBrowser", function () {
  const config = {
    auth: {
      clientId: "fake-client-id",
      authority: "https://login.microsoftonline.com/common",
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
    expressMocks.app.post.mockReset();
    expressMocks.app.use.mockReset();
  });

  it("should request form_post and acquire the token from the posted code", async () => {
    const codeFlowLogin = new CodeFlowLogin([], config, 0, "appStudio");
    const response = {
      writeHead: vi.fn(),
      end: vi.fn((_body, callback: () => void) => callback()),
    };
    let authorizationRequest: any;
    let tokenRequest: any;

    vi.spyOn(codeFlowLogin, "startServer").mockResolvedValue("listening");
    vi.spyOn(codeFlowLogin as any, "saveAccountIdToCache").mockResolvedValue(undefined);
    vi.spyOn(codeFlowLogin.pca, "getAuthCodeUrl").mockImplementation(async (request: any) => {
      authorizationRequest = request;
      const callback = expressMocks.app.post.mock.calls[0][1];
      void callback({ body: { code: "auth-code" } }, response);
      return "https://login.microsoftonline.com/authorize";
    });
    vi.spyOn(codeFlowLogin.pca, "acquireTokenByCode").mockImplementation(async (request: any) => {
      tokenRequest = request;
      return {
        account: {
          homeAccountId: "fake-id",
        },
        accessToken:
          "eyJ0eXAiOiJKV1QifQ." +
          Buffer.from(JSON.stringify({ oid: "fake-oid" })).toString("base64") +
          ".signature",
      } as any;
    });

    const accessToken = await codeFlowLogin.loginWithBrowser(["scope1"]);

    expect(accessToken).to.be.a("string");
    expect(authorizationRequest.responseMode).to.equal("form_post");
    expect(tokenRequest.code).to.equal("auth-code");
    expect(expressMocks.urlencoded).to.have.been.calledWith({ extended: false });
  });
});

describe("CodeFlowLogin.loginWithBroker", function () {
  const sandbox = vi;

  // A minimal JWT-like token: header.payload.signature
  // payload = base64({"oid":"fake-oid","upn":"test@test.com"})
  const fakeAccessToken =
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9." +
    Buffer.from(JSON.stringify({ oid: "fake-oid", upn: "test@test.com" })).toString("base64") +
    ".fake-signature";

  const fakeResponse = {
    account: {
      homeAccountId: "fake-id",
      environment: "login.microsoftonline.com",
      tenantId: "fake-tenant",
      username: "test@test.com",
      localAccountId: "fake-local-id",
    },
    accessToken: fakeAccessToken,
  };

  const config = {
    auth: {
      clientId: "fake-client-id",
      authority: "https://login.microsoftonline.com/common",
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupLogin(accountName: string) {
    vi.spyOn(CliTelemetry, "sendTelemetryEvent");

    const codeFlowLogin = new CodeFlowLogin([], config, 0, accountName);
    let capturedRequest: any;
    vi.spyOn(codeFlowLogin.pca, "acquireTokenInteractive").mockImplementation(
      async (request: any) => {
        capturedRequest = request;
        return fakeResponse as any;
      }
    );
    (codeFlowLogin as any as any).mutex = {
      runExclusive: async (fn: any) => fn(),
    };

    return { codeFlowLogin, getCapturedRequest: () => capturedRequest };
  }

  it("should replace accountName placeholder with M365 in loopback template for m365 account", async () => {
    const { codeFlowLogin, getCapturedRequest } = setupLogin("appStudio");

    await codeFlowLogin.loginWithBroker(["scope1"]);
    const req = getCapturedRequest();

    expect(req.successTemplate).to.include("M365 - Sign In");
    expect(req.successTemplate).to.not.include("$" + "{accountName}");
    expect(req.errorTemplate).to.include("M365 - Sign In");
    expect(req.errorTemplate).to.not.include("$" + "{accountName}");
  });

  it("should replace accountName placeholder with Azure in loopback template for azure account", async () => {
    const { codeFlowLogin, getCapturedRequest } = setupLogin("azure");

    await codeFlowLogin.loginWithBroker(["scope1"]);
    const req = getCapturedRequest();

    expect(req.successTemplate).to.include("Azure - Sign In");
    expect(req.successTemplate).to.not.include("$" + "{accountName}");
    expect(req.errorTemplate).to.include("Azure - Sign In");
    expect(req.errorTemplate).to.not.include("$" + "{accountName}");
  });
});

describe("CodeFlowLogin.logout", function () {
  const sandbox = vi;

  const config = {
    auth: {
      clientId: "fake-client-id",
      authority: "https://login.microsoftonline.com/common",
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockAccount(homeAccountId: string): Pick<AccountInfo, "homeAccountId"> {
    return { homeAccountId };
  }

  it("should only sign out cached account when broker is available", async () => {
    const codeFlowLogin = new CodeFlowLogin([], config, 0, "appStudio");
    codeFlowLogin.isBrokerAvailable = true;

    const accountA = createMockAccount("account-a");
    const accountB = createMockAccount("account-b");

    vi.spyOn(codeFlowLogin as any, "loadAccountIdFromCache").mockResolvedValue("account-b");
    vi.spyOn(codeFlowLogin as any, "clearAccountCache").mockResolvedValue();
    vi.spyOn(codeFlowLogin as any, "saveAccountIdToCache").mockResolvedValue();
    vi.spyOn(codeFlowLogin as any, "saveTenantIdToCache").mockResolvedValue();
    vi.spyOn(codeFlowLogin.pca, "getAllAccounts").mockResolvedValue([
      accountA,
      accountB,
    ] as AccountInfo[]);
    const signOutStub = vi.spyOn(codeFlowLogin.pca, "signOut").mockResolvedValue();

    const result = await codeFlowLogin.logout();

    expect(result).to.equal(true);
    expect(signOutStub.mock.calls.length === 1).to.equal(true);
    expect(signOutStub.mock.calls[0][0].account.homeAccountId).to.equal(accountB.homeAccountId);
  });

  it("should sign out all accounts when broker is not available", async () => {
    const codeFlowLogin = new CodeFlowLogin([], config, 0, "appStudio");
    codeFlowLogin.isBrokerAvailable = false;

    const accountA = createMockAccount("account-a");
    const accountB = createMockAccount("account-b");

    vi.spyOn(codeFlowLogin as any, "clearAccountCache").mockResolvedValue();
    vi.spyOn(codeFlowLogin as any, "saveAccountIdToCache").mockResolvedValue();
    vi.spyOn(codeFlowLogin as any, "saveTenantIdToCache").mockResolvedValue();
    vi.spyOn(codeFlowLogin.pca, "getAllAccounts").mockResolvedValue([
      accountA,
      accountB,
    ] as AccountInfo[]);
    const signOutStub = vi.spyOn(codeFlowLogin.pca, "signOut").mockResolvedValue();

    const result = await codeFlowLogin.logout();

    expect(result).to.equal(true);
    expect(signOutStub.mock.calls.length).to.equal(2);
    expect(signOutStub.mock.calls[0][0].account.homeAccountId).to.equal(accountA.homeAccountId);
    expect(signOutStub.mock.calls[1][0].account.homeAccountId).to.equal(accountB.homeAccountId);
  });
});
