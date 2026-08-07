// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireTokenByUsernamePassword: vi.fn(),
  setRegionEndpointByToken: vi.fn(),
}));

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: vi.fn(function PublicClientApplication() {
    return {
      acquireTokenByUsernamePassword: mocks.acquireTokenByUsernamePassword,
    };
  }),
}));

vi.mock("@microsoft/teamsfx-core", () => ({
  AppStudioScopes: () => ["app-studio-read", "app-studio-write"],
  AuthSvcScopes: () => ["authsvc-scope"],
  teamsDevPortalClient: {
    setRegionEndpointByToken: mocks.setRegionEndpointByToken,
  },
}));

import { M365ProviderUserPassword } from "../../../src/commonlib/m365LoginUserPassword";

describe("M365ProviderUserPassword", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initializes the Teams Developer Portal region when separate scope arrays have equal values", async () => {
    mocks.acquireTokenByUsernamePassword
      .mockResolvedValueOnce({ accessToken: "app-studio-token" })
      .mockResolvedValueOnce({ accessToken: "authsvc-token" });

    const provider = M365ProviderUserPassword.getInstance();
    const result = await provider.getAccessToken({
      scopes: ["app-studio-write", "app-studio-read"],
    });

    expect(result.isOk()).toBe(true);
    expect(mocks.acquireTokenByUsernamePassword).toHaveBeenCalledTimes(2);
    expect(mocks.acquireTokenByUsernamePassword).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scopes: ["authsvc-scope"] })
    );
    expect(mocks.setRegionEndpointByToken).toHaveBeenCalledWith("authsvc-token");
  });

  it("does not initialize the Teams Developer Portal region for non-AppStudio scopes", async () => {
    mocks.acquireTokenByUsernamePassword.mockResolvedValueOnce({ accessToken: "graph-token" });

    const provider = M365ProviderUserPassword.getInstance();
    const result = await provider.getAccessToken({ scopes: ["graph-scope"] });

    expect(result.isOk()).toBe(true);
    expect(mocks.acquireTokenByUsernamePassword).toHaveBeenCalledTimes(1);
    expect(mocks.setRegionEndpointByToken).not.toHaveBeenCalled();
  });
});
