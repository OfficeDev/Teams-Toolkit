// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { AxiosInstance } from "axios";
import { v4 as uuid } from "uuid";
import { afterEach, beforeEach, chai, expect, vi } from "vitest";
import { TEAMS_GRAPH_API_NAMES } from "../../src/client/teamsGraphClient";
import { getResourceServiceEndpoint, ResourceServiceType } from "../../src/common/constants";
import { setTools } from "../../src/common/globalVars";
import { TelemetryEvent } from "../../src/common/telemetry";
import { WrappedAxiosClient } from "../../src/common/wrappedAxiosClient";
import {
  APP_STUDIO_API_NAMES,
  GRAPH_API_NAMES,
} from "../../src/component/driver/teamsApp/constants";
import { MOS3ApiDefinitions } from "../../src/component/m365/serviceConstant";
import { MockTools } from "../core/utils";

describe("Wrapped Axios Client Test", () => {
  const mockTools = new MockTools();
  beforeEach(() => {
    setTools(mockTools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create", async () => {
    const testAxiosInstance = {
      interceptors: {
        request: {
          use: vi.fn(),
        },
        response: {
          use: vi.fn(),
        },
      },
    } as any as AxiosInstance;
    vi.spyOn(axios, "create").mockReturnValue(testAxiosInstance);
    WrappedAxiosClient.create();
  });

  it("No telemetry reporter", async () => {
    setTools({} as any);

    const mockedRequest = {
      method: "POST",
      baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
      url: "/amer/api/appdefinitions/v2/import",
      params: {
        overwriteIfAppAlreadyExists: true,
      },
      status: 200,
      data: {},
    } as any;
    WrappedAxiosClient.onRequest(mockedRequest);

    const mockedResponse = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/manifest",
        params: {},
      },
      status: 200,
      data: {},
    } as any;
    WrappedAxiosClient.onResponse(mockedResponse);

    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/fakeId",
        data: "Invalid JSON",
      },
      response: {
        status: 404,
        headers: {
          "x-ms-correlation-id": uuid(),
        },
      },
    } as any;
    await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);
  });

  it("TOOLS not initialized", async () => {
    setTools(undefined as any);

    const mockedRequest = {
      method: "POST",
      baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
      url: "/amer/api/appdefinitions/v2/import",
      params: {
        overwriteIfAppAlreadyExists: true,
      },
      status: 200,
      data: {},
    } as any;
    WrappedAxiosClient.onRequest(mockedRequest);

    const mockedResponse = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/manifest",
        params: {},
      },
      status: 200,
      data: {},
    } as any;
    WrappedAxiosClient.onResponse(mockedResponse);

    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/fakeId",
      },
      response: {
        status: 404,
        headers: {
          "x-ms-correlation-id": uuid(),
        },
      },
    } as any;
    await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);
  });

  it("TDP API start telemetry", async () => {
    const mockedRequest = {
      method: "POST",
      baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
      url: "/amer/api/appdefinitions/v2/import",
      params: {
        overwriteIfAppAlreadyExists: true,
      },
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onRequest(mockedRequest);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Dependency API start telemetry", async () => {
    const mockedRequest = {
      method: "POST",
      baseURL: "https://example.com",
      url: "",
      params: {},
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onRequest(mockedRequest);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Teams Graph API start telemetry", async () => {
    const mockedRequest = {
      method: "POST",
      baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
      url: "/api/v1.0/apiSecretRegistrations",
      params: {},
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onRequest(mockedRequest);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    chai
      .expect(telemetryChecker.mock.calls[0][0])
      .to.equal(`${TelemetryEvent.TeamsGraphApi}-start`);
    chai
      .expect((telemetryChecker.mock.calls[0][1] as any).url)
      .to.equal(`<${TEAMS_GRAPH_API_NAMES.CREATE_API_KEY}-url>`);
  });

  it("TDP API success response", async () => {
    const mockedResponse = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/manifest",
        params: {},
      },
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onResponse(mockedResponse);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Dependency API success response", async () => {
    const mockedResponse = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: "https://example.com",
        url: "",
        params: {},
      },
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onResponse(mockedResponse);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Teams Graph API success response", async () => {
    const mockedResponse = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
        url: "/api/v1.0/oAuthConfigurations/fakeId",
        params: {},
      },
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onResponse(mockedResponse);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    chai.expect(telemetryChecker.mock.calls[0][0]).to.equal(TelemetryEvent.TeamsGraphApi);
    chai
      .expect((telemetryChecker.mock.calls[0][1] as any).url)
      .to.equal(`<${TEAMS_GRAPH_API_NAMES.GET_OAUTH}-url>`);
  });

  it("TDP API error response", async () => {
    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/fakeId",
      },
      response: {
        status: 404,
        headers: {
          "x-ms-correlation-id": uuid(),
        },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Dependency API error response", async () => {
    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: "https://example.com",
        url: "",
        data: '{"botId":"fakeId"}',
      },
      response: {
        status: 400,
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Teams Graph API error response logs fallback correlation id headers", async () => {
    const fallbackCorrelationId = uuid();
    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
        url: "/api/v1.0/oAuthConfigurations/fakeId",
      },
      response: {
        status: 404,
        headers: {
          "request-id": fallbackCorrelationId,
        },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    const props = telemetryChecker.mock.calls[0][1] as Record<string, string>;
    chai.expect(props["teams-graph-trace-id"]).to.equal(fallbackCorrelationId);
  });

  it("Teams Graph API error response prefers x-correlation-id over fallback headers", async () => {
    const xCorrelationId = uuid();
    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
        url: "/api/v1.0/oAuthConfigurations/fakeId",
      },
      response: {
        status: 404,
        headers: {
          "x-correlation-id": xCorrelationId,
          "request-id": uuid(),
          "x-ms-request-id": uuid(),
        },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    const props = telemetryChecker.mock.calls[0][1] as Record<string, string>;
    chai.expect(props["teams-graph-trace-id"]).to.equal(xCorrelationId);
  });

  it("Teams Graph API error response uses x-ms-request-id when request-id is absent", async () => {
    const msRequestId = uuid();
    const mockedError = {
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
        url: "/api/v1.0/apiSecretRegistrations/fakeId",
      },
      response: {
        status: 404,
        headers: {
          "x-ms-request-id": msRequestId,
        },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    const props = telemetryChecker.mock.calls[0][1] as Record<string, string>;
    chai.expect(props["teams-graph-trace-id"]).to.equal(msRequestId);
  });

  it("MOS API error response", async () => {
    const mockedError = {
      request: {
        method: "POST",
      },
      config: {
        baseURL: "https://titles.prod.mos.microsoft.com",
        url: "/dev/v1/users/packages",
      },
      response: {
        status: 400,
        data: {
          code: "BadRequest",
          message: "Invalid request",
        },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");
    await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("MOS API error response url not classified", async () => {
    const mockedError = {
      request: {
        method: "POST",
      },
      config: {
        baseURL: "https://titles.prod.mos.microsoft.com",
        url: "/abc/def",
      },
      response: {
        status: 400,
        data: {
          code: "BadRequest",
          message: "Invalid request",
        },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");
    await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  // Regression tests for AB#37640864: telemetry must never throw / mask the
  // real transport-level error. Triggered by retry + keepAlive in PR #15676.
  it("transport-level error with undefined request.method does not throw", async () => {
    const transportError = {
      message: "socket hang up",
      code: "ECONNRESET",
      request: {
        // method can be undefined for low-level socket errors
      },
      config: {
        baseURL: "https://titles.prod.mos.microsoft.com",
        url: "/dev/v1/users/packages",
      },
      // no `response` property -> transport failure
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(transportError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(transportError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("error with no request object does not throw", async () => {
    const transportError = {
      message: "TLS handshake failed",
      code: "EPROTO",
      config: {},
    } as any;

    let rejected: any;
    await WrappedAxiosClient.onRejected(transportError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(transportError);
  });

  it("MOS API error with non-object response.data does not throw", async () => {
    const mockedError = {
      message: "Bad Gateway",
      request: {
        method: "POST",
      },
      config: {
        baseURL: "https://titles.prod.mos.microsoft.com",
        url: "/dev/v1/users/packages",
      },
      response: {
        status: 502,
        // data is a string (e.g. HTML body from a gateway), not an object
        data: "<html>502 Bad Gateway</html>",
        headers: { traceresponse: "trace-123" },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("convertUrlToApiName handles undefined method", () => {
    const apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://example.com/foo",
      undefined as any
    );
    chai.expect(apiName).to.be.a("string");
  });

  it("convertMethodUrlToApiDefForMOS handles undefined method", () => {
    const result = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      undefined as any,
      "https://example.com/foo"
    );
    chai.expect(result).to.be.undefined;
  });

  it("TDP API error response without headers does not throw", async () => {
    const mockedError = {
      message: "Bad Request",
      request: {
        method: "GET",
      },
      config: {
        baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
        url: "/api/appdefinitions/fakeId",
      },
      response: {
        status: 400,
        // headers intentionally omitted
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("MOS API error with nested response.data.error is surfaced", async () => {
    const mockedError = {
      message: "Conflict",
      request: {
        method: "POST",
      },
      config: {
        baseURL: "https://titles.prod.mos.microsoft.com",
        url: "/dev/v1/users/packages",
      },
      response: {
        status: 409,
        data: {
          error: { code: "Conflict", message: "Already exists" },
        },
        headers: { traceresponse: "trace-xyz" },
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    const props = telemetryChecker.mock.calls[0][1] as any;
    chai.expect(props["err-message"]).to.contain("Conflict");
    chai.expect(props["err-message"]).to.contain("Already exists");
    chai.expect(props["err-message"]).to.contain("trace-xyz");
  });

  it("onRejected swallows internal telemetry errors and still rejects", async () => {
    const mockedError = {
      message: "boom",
      request: { method: "GET" },
      config: { baseURL: "https://example.com", url: "/x" },
    } as any;
    // Force the telemetry reporter itself to throw, exercising the outer catch.
    vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent").mockImplementation(() => {
      throw new Error("telemetry exploded");
    });

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
  });

  it("onRejected handles minimal error shape with no config / no message", async () => {
    // Bare-minimum error object: no config, no message, no response.
    // Exercises the "?? undefined" / "?? '...'" nullish fallback branches.
    const mockedError = {
      request: {
        host: "https://titles.prod.mos.microsoft.com",
        path: "/dev/v1/users/packages",
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("MOS API error with response.data.error missing fields uses fallback", async () => {
    const mockedError = {
      message: "Server Error",
      request: {
        method: "POST",
      },
      config: {
        baseURL: "https://titles.prod.mos.microsoft.com",
        url: "/dev/v1/users/packages",
      },
      response: {
        status: 500,
        // .error exists but has neither .code nor .message → exercises the
        // `(innerError.code as string) ?? ""` and `... ?? ""` fallbacks.
        data: { error: {} },
        // no `headers.traceresponse` → exercises tracingId "undefined" fallback
        headers: {},
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

    let rejected: any;
    await WrappedAxiosClient.onRejected(mockedError).catch((e) => (rejected = e));

    chai.expect(rejected).to.equal(mockedError);
    expect(telemetryChecker).toHaveBeenCalledOnce();
    const props = telemetryChecker.mock.calls[0][1] as any;
    chai.expect(props["err-message"]).to.contain("Server Error");
    chai.expect(props["err-message"]).to.contain("undefined"); // tracingId fallback
  });

  it("Create bot API start telemetry", async () => {
    const mockedRequest = {
      method: "POST",
      baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
      url: "/api/botframework",
      params: {},
      status: 200,
      data: {
        botId: "fakeId",
      },
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onRequest(mockedRequest);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Update bot API start telemetry", async () => {
    const mockedRequest = {
      method: "POST",
      baseURL: getResourceServiceEndpoint(ResourceServiceType.TDP),
      url: `/api/botframework/${uuid()}`,
      params: {},
      status: 200,
      data: {},
    } as any;
    const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

    WrappedAxiosClient.onRequest(mockedRequest);
    expect(telemetryChecker).toHaveBeenCalledOnce();
  });

  it("Convert API name", async () => {
    const fakeId = uuid();

    let apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        "/api/appdefinitions/partnerCenterAppPackageValidation",
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.VALIDATE_APP_PACKAGE);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/appdefinitions/${fakeId}/manifest`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_APP_PACKAGE);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/appdefinitions/${fakeId}/owner`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.UPDATE_OWNER);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/appdefinitions/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/appdefinitions/${fakeId}`,
      "DELETE"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.DELETE_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/publishing/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_PUBLISHED_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/publishing`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.PUBLISH_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/publishing/${fakeId}/appdefinitions`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.UPDATE_PUBLISHED_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      `https://graph.microsoft.com/beta/appCatalogs/teamsApps?$filter=externalId eq '${fakeId}'&$expand=appDefinitions`,
      "GET"
    );
    chai.assert.equal(apiName, GRAPH_API_NAMES.GET_PUBLISHED_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      `https://graph.microsoft.com/beta/appCatalogs/teamsApps/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, GRAPH_API_NAMES.GET_PUBLISHED_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      `https://graph.microsoft.com/beta/appCatalogs/teamsApps`,
      "POST"
    );
    chai.assert.equal(apiName, GRAPH_API_NAMES.PUBLISH_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      `https://graph.microsoft.com/beta/appCatalogs/teamsApps/${fakeId}/appDefinitions`,
      "POST"
    );
    chai.assert.equal(apiName, GRAPH_API_NAMES.UPDATE_PUBLISHED_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/usersettings/mtUserAppPolicy`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.CHECK_SIDELOADING_STATUS);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/apiSecretRegistrations/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_API_KEY);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/apiSecretRegistrations/${fakeId}`,
      "PATCH"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.UPDATE_API_KEY);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/v1.0/apiSecretRegistrations`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.CREATE_API_KEY);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/botframework/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_BOT);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/botframework/${fakeId}`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.UPDATE_BOT);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/botframework/${fakeId}`,
      "DELETE"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.DELETE_BOT);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/botframework`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.LIST_BOT);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/aadapp/v2`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.CREATE_AAD_APP);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/botframework`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.CREATE_BOT);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/appvalidations/appdefinition/validate`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.SUBMIT_APP_VALIDATION);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/appvalidations/appdefinitions/efe81961-44bc-49ae-99f8-1476caef994c`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_APP_VALIDATION_REQUESTS);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/appvalidations/2512d616-8aac-461f-8af0-23e9b09ec650`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_APP_VALIDATION_RESULT);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `/api/v1.0/oAuthConfigurations`,
      "POST"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.CREATE_OAUTH);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/oAuthConfigurations/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.GET_OAUTH);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/oAuthConfigurations/${fakeId}`,
      "PATCH"
    );
    chai.assert.equal(apiName, APP_STUDIO_API_NAMES.UPDATE_OAUTH);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) +
        `/api/v1.0/oAuthConfigurations/${fakeId}`,
      ""
    );
    chai.assert.notEqual(apiName, APP_STUDIO_API_NAMES.UPDATE_OAUTH);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TDP) + `unknown`,
      "GET"
    );
    chai.assert.equal(
      apiName,
      (getResourceServiceEndpoint(ResourceServiceType.TDP) + `unknown`).replace(/\//g, `-`)
    );

    apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://authsvc.teams.microsoft.com/v1.0/users/region",
      "POST"
    );
    chai.assert.equal(apiName, "get-region");

    apiName = WrappedAxiosClient.convertUrlToApiName("https://example.com", "GET");
    chai.assert.equal(apiName, "https:--example.com");

    apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://titles.prod.mos.microsoft.com/config/v1/environment",
      "GET"
    );
    chai.assert.equal(apiName, "mos_get_config_env");

    apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://titles.prod.mos.microsoft.com/abc",
      "GET"
    );
    chai.assert.equal(apiName, "mos_unclassified__abc");

    apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://titles.gccm.mos.microsoft.com/config/v1/environment",
      "GET"
    );
    chai.assert.equal(apiName, "mos_get_config_env");

    apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://titles.gcch.mos.svc.usgovcloud.microsoft/config/v1/environment",
      "GET"
    );
    chai.assert.equal(apiName, "mos_get_config_env");

    apiName = WrappedAxiosClient.convertUrlToApiName(
      "https://titles.dod.mos.svc.usgovcloud.microsoft/abc",
      "GET"
    );
    chai.assert.equal(apiName, "mos_unclassified__abc");

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TeamsGraph) + `/v1.0/apiSecretRegistrations`,
      "POST"
    );
    chai.assert.equal(apiName, TEAMS_GRAPH_API_NAMES.CREATE_API_KEY);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TeamsGraph) +
        `/v1.0/apiSecretRegistrations/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, TEAMS_GRAPH_API_NAMES.GET_API_KEY);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TeamsGraph) +
        `/v1.0/apiSecretRegistrations/${fakeId}`,
      "PATCH"
    );
    chai.assert.equal(apiName, TEAMS_GRAPH_API_NAMES.UPDATE_API_KEY);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TeamsGraph) + `/v1.0/oAuthConfigurations`,
      "POST"
    );
    chai.assert.equal(apiName, TEAMS_GRAPH_API_NAMES.CREATE_OAUTH);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TeamsGraph) +
        `/v1.0/oAuthConfigurations/${fakeId}`,
      "GET"
    );
    chai.assert.equal(apiName, TEAMS_GRAPH_API_NAMES.GET_OAUTH);

    apiName = WrappedAxiosClient.convertUrlToApiName(
      getResourceServiceEndpoint(ResourceServiceType.TeamsGraph) +
        `/v1.0/oAuthConfigurations/${fakeId}`,
      "PATCH"
    );
    chai.assert.equal(apiName, TEAMS_GRAPH_API_NAMES.UPDATE_OAUTH);
  });

  it("Convert API Definition for MOS API", async () => {
    const fakeId = uuid();

    let modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      "/config/v1/environment"
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetConfigEnv);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "POST",
      "/dev/v1/users/packages/addins"
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.PostPackageAddin);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      `/dev/v1/users/packages/status/${fakeId}`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetDevStatus);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "POST",
      "/builder/v1/users/packages?scope=Personal"
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.PostBuilderPackage);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      `/builder/v1/users/packages/status/${fakeId}`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetBuilderStatus);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS("POST", "/dev/v1/users/packages");
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.PostDevPackage);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "POST",
      "/dev/v1/users/packages/acquisitions"
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.PostDevPackageAcquisitions);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      `/marketplace/v1/users/titles/${fakeId}/sharingInfo`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetShareInfo);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "POST",
      "/catalog/v1/users/titles/launchInfo"
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.PostCatalogLaunchInfo);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "DELETE",
      `/catalog/v1/users/acquisitions/${fakeId}`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.DeleteCatalogAcquisitions);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      `/catalog/v1/users/titles/${fakeId}/launchInfo`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetLaunchInfoByTitle);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      "/catalog/v1/users/uitypes"
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetCatalogUITypes);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "PUT",
      `/builder/v1/users/titles/${fakeId}/owners?idType=TitleId`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.PutTitleOwners);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS(
      "GET",
      `/marketplace/v1/users/titles/${fakeId}/preview?idType=TitleId`
    );
    chai.assert.deepEqual(modApiDef, MOS3ApiDefinitions.GetMarketplaceTitlePreview);

    modApiDef = WrappedAxiosClient.convertMethodUrlToApiDefForMOS("GET", "/abcdef/v1/users/xxxxx");
    chai.assert.isUndefined(modApiDef);
  });

  // Regression tests for the bug where onResponse/onRejected used
  // response.request.host + path (which contains ":443" and no scheme in real
  // Node.js requests) instead of config.baseURL + config.url, causing
  // Teams Graph API and MOS API calls to be mis-classified as "dependency-api".
  describe("event name routing uses config.baseURL + config.url (not request.host:port)", () => {
    it("Teams Graph API success response is classified as teams-graph-api, not dependency-api", async () => {
      // Simulate what Node.js actually sets: host includes port, no scheme
      const mockedResponse = {
        request: {
          method: "GET",
          host: "teams.microsoft.com:443", // real-world format — would fail old regex
          path: "/api/platform/v1.0/oAuthConfigurations/fakeId",
        },
        config: {
          baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
          url: "/api/v1.0/oAuthConfigurations/fakeId",
          params: {},
        },
        status: 200,
        data: {},
      } as any;
      const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryEvent");

      WrappedAxiosClient.onResponse(mockedResponse);

      expect(telemetryChecker).toHaveBeenCalledOnce();
      chai.expect(telemetryChecker.mock.calls[0][0]).to.equal(TelemetryEvent.TeamsGraphApi);
    });

    it("Teams Graph API error response is classified as teams-graph-api, not dependency-api", async () => {
      const correlationId = uuid();
      const mockedError = {
        request: {
          method: "GET",
          host: "teams.microsoft.com:443", // real-world format — would fail old regex
          path: "/api/platform/v1.0/oAuthConfigurations/fakeId",
        },
        config: {
          baseURL: getResourceServiceEndpoint(ResourceServiceType.TeamsGraph),
          url: "/api/v1.0/oAuthConfigurations/fakeId",
        },
        response: {
          status: 404,
          headers: { "x-correlation-id": correlationId },
        },
      } as any;
      const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

      await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);

      expect(telemetryChecker).toHaveBeenCalledOnce();
      chai.expect(telemetryChecker.mock.calls[0][0]).to.equal(TelemetryEvent.TeamsGraphApi);
      const props = telemetryChecker.mock.calls[0][1] as Record<string, string>;
      chai.expect(props["teams-graph-trace-id"]).to.equal(correlationId);
    });

    it("MOS API error response is classified as mos-api, not dependency-api", async () => {
      const mockedError = {
        request: {
          method: "POST",
          host: "titles.prod.mos.microsoft.com:443", // real-world format
          path: "/dev/v1/users/packages",
        },
        config: {
          baseURL: "https://titles.prod.mos.microsoft.com",
          url: "/dev/v1/users/packages",
        },
        response: {
          status: 409,
          data: { error: { code: "Conflict", message: "Already exists" } },
          headers: { traceresponse: "trace-reg" },
        },
      } as any;
      const telemetryChecker = vi.spyOn(mockTools.telemetryReporter, "sendTelemetryErrorEvent");

      await WrappedAxiosClient.onRejected(mockedError).catch(() => undefined);

      expect(telemetryChecker).toHaveBeenCalledOnce();
      chai.expect(telemetryChecker.mock.calls[0][0]).to.equal(TelemetryEvent.MOSApi);
      const props = telemetryChecker.mock.calls[0][1] as any;
      chai.expect(props["err-message"]).to.contain("trace-reg");
    });
  });
});
