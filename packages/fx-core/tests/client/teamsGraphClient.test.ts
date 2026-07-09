// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { AxiosInstance } from "axios";
import { TEAMS_GRAPH_API_NAMES, TeamsGraphClient } from "../../src/client/teamsGraphClient";
import { RetryHandler } from "../../src/common/retryHandler";
import { TeamsGraphAPIFailedSystemError } from "../../src/error/teamsGraph";
import { chai, vi } from "vitest";

describe("TeamsGraphClient", () => {
  const sandbox = vi;
  const token = "fake-token";
  const oauthId = "oauth-id";
  const apiKeyId = "api-key-id";
  const oauthPayload = { description: "oauth registration" } as any;
  const apiKeyPayload = { description: "api key registration" } as any;

  let client: TeamsGraphClient;
  let requester: AxiosInstance;

  beforeEach(() => {
    client = new TeamsGraphClient();
    requester = axios.create();

    vi.spyOn(client, "getEndpoint").mockReturnValue("https://fake-teams-graph");
    vi.spyOn(axios, "create").mockReturnValue(requester);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createRequesterWithToken should set auth and client source headers", () => {
    const instance = client.createRequesterWithToken(token);

    chai.expect(instance.defaults.headers.common["Authorization"]).to.equal(`Bearer ${token}`);
    chai.expect(instance.defaults.headers.common["Client-Source"]).to.equal("agentstoolkit");
  });

  it("wrapException should include request-id as correlation id and status in extra data", () => {
    const error: any = {
      name: "AxiosError",
      message: "request failed",
      response: {
        status: 400,
        headers: { "request-id": "req-correlation-id" },
        data: { code: "BadRequest" },
      },
    };

    const wrapped = client.wrapException(error, TEAMS_GRAPH_API_NAMES.GET_OAUTH);

    chai.expect(wrapped).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
    chai.expect(wrapped.message).to.include("correlationId: req-correlation-id");
    chai.expect(wrapped.message).to.include("Status code: 400");
    chai.expect(wrapped.message).to.include('data: {"code":"BadRequest"}');
  });

  it("wrapException should avoid duplicating status text for axios status code message", () => {
    const error: any = {
      name: "AxiosError",
      message: "Request failed with status code 401",
      response: {
        status: 401,
        headers: { "x-ms-request-id": "ms-correlation-id" },
        data: { error: "Unauthorized" },
      },
    };

    const wrapped = client.wrapException(error, TEAMS_GRAPH_API_NAMES.GET_API_KEY);

    chai.expect(wrapped.message).to.include("correlationId: ms-correlation-id");
    chai.expect(wrapped.message).to.not.include("Status code: 401");
    chai.expect(wrapped.message).to.include('data: {"error":"Unauthorized"}');
  });

  it("getOauthRegistrationById should return response data", async () => {
    const response = { data: { id: oauthId } };
    vi.spyOn(requester, "get").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.getOauthRegistrationById(token, oauthId);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("getOauthRegistrationById should wrap error", async () => {
    const error: any = {
      name: "AxiosError",
      message: "oauth get failed",
      response: { headers: { "x-correlation-id": "corr-1" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "get").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.getOauthRegistrationById(token, oauthId);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.GET_OAUTH}`);
      chai.expect(e.message).to.include("corr-1");
    }
  });

  it("createOauthRegistration should return response data", async () => {
    const response = { data: { id: oauthId } };
    vi.spyOn(requester, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.createOauthRegistration(token, oauthPayload);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("createOauthRegistration should wrap error", async () => {
    const error: any = {
      name: "AxiosError",
      message: "oauth create failed",
      response: { headers: { "x-correlation-id": "corr-2" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "post").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.createOauthRegistration(token, oauthPayload);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.CREATE_OAUTH}`);
      chai.expect(e.message).to.include("corr-2");
    }
  });

  it("updateOauthRegistration should return response data", async () => {
    const response = { data: { id: oauthId, description: "updated" } };
    vi.spyOn(requester, "patch").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.updateOauthRegistration(token, oauthPayload, oauthId);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("updateOauthRegistration should wrap error", async () => {
    const error: any = {
      name: "AxiosError",
      message: "oauth update failed",
      response: { headers: { "x-correlation-id": "corr-3" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "patch").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.updateOauthRegistration(token, oauthPayload, oauthId);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.UPDATE_OAUTH}`);
      chai.expect(e.message).to.include("corr-3");
    }
  });

  it("createDcrRegistration should return response data", async () => {
    const dcrPayload = { clientName: "dcr registration" } as any;
    const response = { data: { id: oauthId } };
    vi.spyOn(requester, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.createDcrRegistration(token, dcrPayload);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("createDcrRegistration should wrap error", async () => {
    const dcrPayload = { clientName: "dcr registration" } as any;
    const error: any = {
      name: "AxiosError",
      message: "dcr create failed",
      response: { headers: { "x-correlation-id": "corr-dcr" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "post").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.createDcrRegistration(token, dcrPayload);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.CREATE_DCR}`);
      chai.expect(e.message).to.include("corr-dcr");
    }
  });

  it("getApiKeyRegistrationById should return response data", async () => {
    const response = { data: { id: apiKeyId } };
    vi.spyOn(requester, "get").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.getApiKeyRegistrationById(token, apiKeyId);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("getApiKeyRegistrationById should wrap error", async () => {
    const error: any = {
      name: "AxiosError",
      message: "api key get failed",
      response: { headers: { "x-correlation-id": "corr-4" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "get").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.getApiKeyRegistrationById(token, apiKeyId);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.GET_API_KEY}`);
      chai.expect(e.message).to.include("corr-4");
    }
  });

  it("createApiKeyRegistration should return response data", async () => {
    const response = { data: { id: apiKeyId } };
    vi.spyOn(requester, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.createApiKeyRegistration(token, apiKeyPayload);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("createApiKeyRegistration should wrap error", async () => {
    const error: any = {
      name: "AxiosError",
      message: "api key create failed",
      response: { headers: { "x-correlation-id": "corr-5" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "post").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.createApiKeyRegistration(token, apiKeyPayload);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.CREATE_API_KEY}`);
      chai.expect(e.message).to.include("corr-5");
    }
  });

  it("updateApiKeyRegistration should return response data", async () => {
    const response = { data: { id: apiKeyId, description: "updated" } };
    vi.spyOn(requester, "patch").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await client.updateApiKeyRegistration(token, apiKeyPayload, apiKeyId);

    chai.expect(result).to.deep.equal(response.data);
  });

  it("updateApiKeyRegistration should wrap error", async () => {
    const error: any = {
      name: "AxiosError",
      message: "api key update failed",
      response: { headers: { "x-correlation-id": "corr-6" }, data: { reason: "failed" } },
    };
    vi.spyOn(requester, "patch").mockRejectedValue(error);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await client.updateApiKeyRegistration(token, apiKeyPayload, apiKeyId);
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(TeamsGraphAPIFailedSystemError);
      chai.expect(e.message).to.include(`api: ${TEAMS_GRAPH_API_NAMES.UPDATE_API_KEY}`);
      chai.expect(e.message).to.include("corr-6");
    }
  });
});
