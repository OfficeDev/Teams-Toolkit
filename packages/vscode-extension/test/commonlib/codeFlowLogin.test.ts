// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

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

vi.mock("../../src/commonlib/cacheAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/commonlib/cacheAccess")>()),
  saveAccountId: vi.fn(),
}));

import { CodeFlowLogin } from "../../src/commonlib/codeFlowLogin";

describe("CodeFlowLogin.loginWithBrowser", () => {
  afterEach(() => {
    expressMocks.app.post.mockReset();
    expressMocks.app.use.mockReset();
  });

  it("requests form_post and acquires the token from the posted code", async () => {
    const codeFlowLogin = new CodeFlowLogin(
      [],
      {
        auth: {
          clientId: "fake-client-id",
          authority: "https://login.microsoftonline.com/common",
        },
      },
      0,
      "appStudio"
    );
    let authorizationRequest: any;
    let tokenRequest: any;

    vi.spyOn(codeFlowLogin, "startServer").mockResolvedValue("listening");
    vi.spyOn(codeFlowLogin.pca, "getAuthCodeUrl").mockImplementation(async (request: any) => {
      authorizationRequest = request;
      const callback = expressMocks.app.post.mock.calls[0][1];
      void callback(
        { body: { code: "auth-code" } },
        {
          end: vi.fn(),
          sendStatus: vi.fn(),
          writeHead: vi.fn(),
        }
      );
      return "https://login.microsoftonline.com/authorize";
    });
    vi.spyOn(codeFlowLogin.pca, "acquireTokenByCode").mockImplementation(async (request: any) => {
      tokenRequest = request;
      return {
        account: { homeAccountId: "fake-id" },
        accessToken:
          "eyJ0eXAiOiJKV1QifQ." +
          Buffer.from(JSON.stringify({ oid: "fake-oid" })).toString("base64") +
          ".signature",
      } as any;
    });

    const accessToken = await codeFlowLogin.loginWithBrowser(["scope1"]);

    expect(accessToken).toBeTypeOf("string");
    expect(authorizationRequest.responseMode).toBe("form_post");
    expect(tokenRequest.code).toBe("auth-code");
    expect(expressMocks.urlencoded).toHaveBeenCalledWith({ extended: false });
  });
});
