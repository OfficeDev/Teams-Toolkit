// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  LoginStatus,
  M365TokenProvider,
  Result,
  SystemError,
  TokenRequest,
  err,
  ok,
  signedIn,
  signedOut,
} from "@microsoft/teamsfx-api";
import { GraphClient } from "../../../src/client/graphClient";
import { ListSensitivityLabelScope } from "../../../src/common/constants";
import { createGeneralSensitivityLabelService } from "../../../src/v4/runtime/generalSensitivityLabel";
import { afterEach, assert, vi } from "vitest";

function makeTokenProvider(status: Result<LoginStatus, FxError>): {
  provider: M365TokenProvider;
  requests: TokenRequest[];
} {
  const requests: TokenRequest[] = [];
  const provider: M365TokenProvider = {
    getAccessToken: async () => ok(""),
    getJsonObject: async () => ok({}),
    getStatus: async (request) => {
      requests.push(request);
      return status;
    },
    signout: async () => true,
    switchTenant: async () => ok(""),
    setStatusChangeMap: async () => ok(true),
    removeStatusChangeMap: async () => ok(true),
  };
  return { provider, requests };
}

describe("General sensitivity-label runtime service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks existing login state without opening a sign-in dialog", async () => {
    const { provider, requests } = makeTokenProvider(ok({ status: signedOut }));
    const graph = vi.spyOn(GraphClient.prototype, "getGeneralSentivityLabel");

    const id = await createGeneralSensitivityLabelService(provider).resolveId();

    assert.isUndefined(id);
    assert.deepStrictEqual(requests, [{ scopes: [ListSensitivityLabelScope], showDialog: false }]);
    assert.strictEqual(graph.mock.calls.length, 0);
  });

  it("returns the General label id for an already signed-in user", async () => {
    const { provider } = makeTokenProvider(ok({ status: signedIn, token: "test-token" }));
    vi.spyOn(GraphClient.prototype, "getGeneralSentivityLabel").mockResolvedValue(
      ok({ id: "general-label-id" })
    );

    const id = await createGeneralSensitivityLabelService(provider).resolveId();

    assert.strictEqual(id, "general-label-id");
  });

  it("returns undefined when login status or Graph lookup fails", async () => {
    const loginError = new SystemError({
      source: "test",
      name: "LoginFailed",
      message: "login failed",
    });
    const graphError = new SystemError({
      source: "test",
      name: "GraphFailed",
      message: "graph failed",
    });
    const loginFailure = makeTokenProvider(err(loginError));
    assert.isUndefined(
      await createGeneralSensitivityLabelService(loginFailure.provider).resolveId()
    );

    const graphFailure = makeTokenProvider(ok({ status: signedIn, token: "test-token" }));
    vi.spyOn(GraphClient.prototype, "getGeneralSentivityLabel").mockResolvedValue(err(graphError));
    assert.isUndefined(
      await createGeneralSensitivityLabelService(graphFailure.provider).resolveId()
    );
  });

  it("returns undefined when the authentication provider throws", async () => {
    const { provider } = makeTokenProvider(ok({ status: signedOut }));
    vi.spyOn(provider, "getStatus").mockRejectedValue(new Error("authentication unavailable"));

    const id = await createGeneralSensitivityLabelService(provider).resolveId();

    assert.isUndefined(id);
  });
});
