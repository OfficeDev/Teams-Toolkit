// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok, SensitivityLabel, signedIn, SystemError } from "@microsoft/teamsfx-api";
import axios from "axios";
import { chai, vi } from "vitest";
import { GraphClient } from "../../src/client/graphClient";
import * as globalState from "../../src/common/globalState";
import { setTools } from "../../src/common/globalVars";
import { RetryHandler } from "../../src/common/retryHandler";
import { MockedM365Provider, MockTools } from "../core/utils";

describe("GraphAPIClient Test", () => {
  const sandbox = vi;
  const token = "fakeToken";

  beforeEach(() => {
    RetryHandler.RETRIES = 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    RetryHandler.RETRIES = 6;
  });

  describe("RetryHandler", () => {
    it("Happy path", async () => {
      const fn = vi.fn().mockResolvedValue("success");
      const result = await RetryHandler.Retry(fn);
      chai.expect(result).to.equal("success");
      chai.expect(fn.mock.calls.length === 1).to.be.true;
    });

    it("Retry on error and succeed", async () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      fn.mockRejectedValueOnce(new Error("Failed"));
      fn.mockResolvedValueOnce("success");

      // Set RETRIES to 2 for this test
      RetryHandler.RETRIES = 2;

      const retryPromise = RetryHandler.Retry(fn);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await retryPromise;
      chai.expect(result).to.equal("success");
      chai.expect(fn.mock.calls.length === 2).to.be.true;
    });

    it("Fail after all retries", async () => {
      const error = new Error("Failed");
      const fn = vi.fn().mockRejectedValue(error);

      try {
        await RetryHandler.Retry(fn);
        chai.assert.fail("Should have thrown error");
      } catch (e) {
        chai.expect(e).to.equal(error);
      }

      chai.expect(fn.mock.calls.length === 1).to.be.true;
    });
  });

  describe("listSensitivityLabels", () => {
    const tokenProvider = new MockedM365Provider();
    setTools(new MockTools());
    it("Happy path", async () => {
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(undefined);
      const response = {
        data: {
          value: [
            {
              id: "label1",
              displayName: "General",
              name: "General Label",
              description: "General Label Description",
            },
            {
              id: "label2",
              displayName: "Confidential",
              name: "Confidential Label",
              description: "Confidential Label Description",
            },
          ],
        },
      };

      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token);

      chai.expect(result.isOk()).to.be.true;
      if (result.isOk()) {
        chai.expect(result.value.length).to.equal(2);
        chai.expect(result.value[0].id).to.equal("label1");
        chai.expect(result.value[0].displayName).to.equal("General");
        chai.expect(result.value[1].id).to.equal("label2");
        chai.expect(result.value[1].displayName).to.equal("Confidential");
      }
    });

    it("Return error for empty response", async () => {
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(undefined);

      const response = {};
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token);

      chai.expect(result.isErr()).to.be.true;
      if (result.isErr()) {
        chai.expect(result.error.name).to.equal("listSensitivityLabelsError");
      }
    });

    it("Return error for empty data", async () => {
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(undefined);
      const response = { data: {} };
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token);

      chai.expect(result.isErr()).to.be.true;
      if (result.isErr()) {
        chai.expect(result.error.name).to.equal("listSensitivityLabelsError");
      }
    });

    it("API failure", async () => {
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(undefined);
      const error = new Error("API failed");
      vi.spyOn(fakeAxiosInstance, "get").mockRejectedValue(error);
      vi.spyOn(RetryHandler, "Retry").mockRejectedValue(error);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token);

      chai.expect(result.isErr()).to.be.true;
      if (result.isErr()) {
        chai.expect(result.error.name).to.equal("listSensitivityLabelsError");
        chai.expect(result.error.message).to.include("API failed");
      }
    });

    it("Should use cache when useCache is true and cache is valid", async () => {
      const accountUniqueName = `name-${Date.now()}`;
      const tenantId = `tenant-${Date.now()}`;
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          accountInfo: { unique_name: accountUniqueName, tid: tenantId },
          status: signedIn,
          token: "token",
        } as any)
      );
      const graphAPIClient = new GraphClient(tokenProvider);
      const labels = [
        {
          id: "label1",
          displayName: "General",
          name: "General Label",
          description: "General Label Description",
        },
      ];
      const cacheValue = {
        labels: labels,
        unixTimestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
      };
      const cacheKey = `listSensitivityLabelCacheKey:${tenantId}:${accountUniqueName}`;

      await globalState.globalStateUpdate(cacheKey, cacheValue);

      const retryStub = vi
        .spyOn(RetryHandler, "Retry")
        .mockResolvedValue({ data: { value: [{ id: "newLabel" }] } } as any);

      const result = await graphAPIClient.listSensitivityLabels(token, true);

      chai.expect(result.isOk()).to.be.true;
      if (result.isOk()) {
        chai.expect(result.value).to.deep.equal(labels);
      }
      chai.expect(retryStub.mock.calls.length > 0).to.be.false;
    });

    it("Should not use cache when cache is expired", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          accountInfo: { unique_name: "name", tid: "123" },
          status: signedIn,
          token: "token",
        } as any)
      );
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);

      const response = {
        data: {
          value: [
            {
              id: "newLabel",
              displayName: "New Label",
              name: "New Label",
              description: "New Label Description",
            },
          ],
        },
      };

      const oldCache = {
        labels: [{ id: "oldLabel" }],
        unixTimestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
      };

      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(oldCache);
      vi.spyOn(globalState, "globalStateUpdate").mockResolvedValue();
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token, true);

      chai.expect(result.isOk()).to.be.true;
      if (result.isOk()) {
        chai.expect(result.value).to.deep.equal(response.data.value);
      }
    });

    it("Should update cache after API call", async () => {
      const accountUniqueName = `name-${Date.now()}`;
      const tenantId = `tenant-${Date.now()}`;
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          accountInfo: { unique_name: accountUniqueName, tid: tenantId },
          status: signedIn,
          token: "token",
        } as any)
      );
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);

      const response = {
        data: {
          value: [
            {
              id: "label1",
              displayName: "General",
              name: "General Label",
              description: "General Label Description",
            },
          ],
        },
      };

      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token, false);
      const cacheKey = `listSensitivityLabelCacheKey:${tenantId}:${accountUniqueName}`;
      const updatedCache = await globalState.globalStateGet(cacheKey);

      chai.expect(result.isOk()).to.be.true;
      chai.expect(updatedCache).to.not.be.undefined;
      chai.expect(updatedCache.labels).to.deep.equal(response.data.value);
      chai.expect(updatedCache.unixTimestamp).to.be.closeTo(Date.now(), 1000);
    });

    it("Should not use cache when useCache is false", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          accountInfo: { unique_name: "name", tid: "123" },
          status: signedIn,
          token: "token",
        } as any)
      );
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);

      const response = {
        data: {
          value: [
            {
              id: "newLabel",
              displayName: "New Label",
              name: "New Label",
              description: "New Label Description",
            },
          ],
        },
      };

      const cache = {
        labels: [{ id: "oldLabel" }],
        unixTimestamp: Date.now(),
      };

      vi.spyOn(globalState, "globalStateGet").mockResolvedValue(cache);
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token, false);

      chai.expect(result.isOk()).to.be.true;
      if (result.isOk()) {
        chai.expect(result.value).to.deep.equal(response.data.value);
      }
    });

    it("Should handle response with undefined or missing label properties", async () => {
      const accountUniqueName = `name-${Date.now()}`;
      const tenantId = `tenant-${Date.now()}`;
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          accountInfo: { unique_name: accountUniqueName, tid: tenantId },
          status: signedIn,
          token: "token",
        } as any)
      );
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);

      const response = {
        data: {
          value: [
            {
              // No properties defined
            },
            {
              id: undefined,
              name: undefined,
              description: undefined,
              displayName: undefined,
            },
            {
              id: "label1",
              // Missing some properties
              displayName: "Test Label",
            },
            undefined,
          ],
        },
      };

      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response);
      vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response);

      const graphAPIClient = new GraphClient(tokenProvider);
      const result = await graphAPIClient.listSensitivityLabels(token, false);

      chai.expect(result.isOk()).to.be.true;
      if (result.isOk()) {
        chai.expect(result.value.length).to.equal(4);
        chai.expect(result.value[0].id).to.be.undefined;
        chai.expect(result.value[0].name).to.be.undefined;
        chai.expect(result.value[1].id).to.be.undefined;
        chai.expect(result.value[1].displayName).to.be.undefined;
        chai.expect(result.value[2].id).to.equal("label1");
        chai.expect(result.value[2].displayName).to.equal("Test Label");
        chai.expect(result.value[2].name).to.be.undefined;
      }
    });
  });

  describe("getGeneralSentivityLabel", () => {
    const tokenProvider = new MockedM365Provider();
    it("Happy path", async () => {
      const graphAPIClient = new GraphClient(tokenProvider);

      const labels: SensitivityLabel[] = [
        {
          id: "general-id",
          displayName: "General",
          name: "General Label",
          description: "General Label Description",
        },
        {
          id: "confidential-id",
          displayName: "Confidential",
          name: "Confidential Label",
          description: "Confidential Label Description",
        },
      ];

      vi.spyOn(graphAPIClient, "listSensitivityLabels").mockResolvedValue(ok(labels));

      const result = await graphAPIClient.getGeneralSentivityLabel(token);

      chai.expect(result.isOk()).to.be.true;
      if (result.isOk()) {
        chai.expect(result.value.id).to.equal("general-id");
      }
    });

    it("No General label found", async () => {
      const graphAPIClient = new GraphClient(tokenProvider);

      const labels: SensitivityLabel[] = [
        {
          id: "confidential-id",
          displayName: "Confidential",
          name: "Confidential Label",
          description: "Confidential Label Description",
        },
      ];

      vi.spyOn(graphAPIClient, "listSensitivityLabels").mockResolvedValue(ok(labels));

      const result = await graphAPIClient.getGeneralSentivityLabel(token);

      chai.expect(result.isErr()).to.be.true;
      if (result.isErr()) {
        chai.expect(result.error.name).to.equal("getGeneralSentivityLabelError");
      }
    });

    it("General label has no ID", async () => {
      const graphAPIClient = new GraphClient(tokenProvider);

      const labels: SensitivityLabel[] = [
        {
          displayName: "General",
          name: "General Label",
          description: "General Label Description",
        } as unknown as SensitivityLabel,
        {
          id: "confidential-id",
          displayName: "Confidential",
          name: "Confidential Label",
          description: "Confidential Label Description",
        },
      ];

      vi.spyOn(graphAPIClient, "listSensitivityLabels").mockResolvedValue(ok(labels));

      const result = await graphAPIClient.getGeneralSentivityLabel(token);

      chai.expect(result.isErr()).to.be.true;
      if (result.isErr()) {
        chai.expect(result.error.name).to.equal("getGeneralSentivityLabelError");
      }
    });

    it("listSensitivityLabels returns error", async () => {
      const graphAPIClient = new GraphClient(tokenProvider);

      const fakeError = {
        name: "listSensitivityLabelsError",
        message: "API failed",
        source: "GraphAPI",
      };

      vi.spyOn(graphAPIClient, "listSensitivityLabels").mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: fakeError,
        value: undefined,
      } as any);

      const result = await graphAPIClient.getGeneralSentivityLabel(token);

      chai.expect(result.isErr()).to.be.true;
      if (result.isErr()) {
        chai.expect(result.error).to.equal(fakeError);
      }
    });
  });

  describe("getUserInfoFromId", () => {
    const tokenProvider = new MockedM365Provider();
    const graphClient = new GraphClient(tokenProvider);
    const sandbox = vi;
    const fakeAxiosInstance = axios.create();

    beforeEach(() => {
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return user info when successful", async () => {
      const userId = "test-user-id";
      const mockUser = {
        id: userId,
        displayName: "Test User",
        userPrincipalName: "testuser@example.com",
      };
      const mockResponse = { data: mockUser };

      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(ok("fake-token"));
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

      const result = await graphClient.getUserInfoFromId(userId);

      chai.expect(result).to.deep.equal(mockUser);
    });

    it("should return undefined when response is empty", async () => {
      const userId = "test-user-id";
      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(ok("fake-token"));
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue({});

      const result = await graphClient.getUserInfoFromId(userId);

      chai.expect(result).to.be.undefined;
    });

    it("should throw error when token acquisition fails", async () => {
      const userId = "test-user-id";
      const error = new SystemError({
        name: "TokenError",
        message: "Token acquisition failed",
        source: "GraphClient",
      });
      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(err(error));

      try {
        await graphClient.getUserInfoFromId(userId);
        chai.assert.fail("Should have thrown error");
      } catch (e) {
        chai.expect(e).to.equal(error);
      }
    });
  });

  describe("getGroupInfo", () => {
    const tokenProvider = new MockedM365Provider();
    const graphClient = new GraphClient(tokenProvider);
    const sandbox = vi;
    const fakeAxiosInstance = axios.create();

    beforeEach(() => {
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return group info when successful", async () => {
      const email = "testgroup@example.com";
      const mockGroup = {
        id: "test-group-id",
        displayName: "Test Group",
        mail: email,
      };
      const mockResponse = {
        data: {
          value: [mockGroup],
        },
      };

      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(ok("fake-token"));
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

      const result = await graphClient.getGroupInfo(email);

      chai.expect(result).to.deep.equal(mockGroup);
    });

    it("should return group info with case-insensitive email matching", async () => {
      const email = "TestGroup@Example.com";
      const mockGroup = {
        id: "test-group-id",
        displayName: "Test Group",
        mail: "testgroup@example.com",
      };
      const mockResponse = {
        data: {
          value: [mockGroup],
        },
      };

      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(ok("fake-token"));
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

      const result = await graphClient.getGroupInfo(email);

      chai.expect(result).to.deep.equal(mockGroup);
    });

    it("should return undefined when no matching group found", async () => {
      const email = "testgroup@example.com";
      const mockResponse = {
        data: {
          value: [
            {
              id: "other-group",
              mail: "other@example.com",
            },
          ],
        },
      };

      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(ok("fake-token"));
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

      const result = await graphClient.getGroupInfo(email);

      chai.expect(result).to.be.undefined;
    });

    it("should return undefined when response is empty", async () => {
      const email = "testgroup@example.com";
      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(ok("fake-token"));
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue({});

      const result = await graphClient.getGroupInfo(email);

      chai.expect(result).to.be.undefined;
    });

    it("should throw error when token acquisition fails", async () => {
      const email = "testgroup@example.com";
      const error = new SystemError({
        name: "TokenError",
        message: "Token acquisition failed",
        source: "GraphClient",
      });
      vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(err(error));

      try {
        await graphClient.getGroupInfo(email);
        chai.assert.fail("Should have thrown error");
      } catch (e) {
        chai.expect(e).to.equal(error);
      }
    });
  });

  describe("getCurrentUserInfo", () => {
    const tokenProvider = new MockedM365Provider();
    const graphClient = new GraphClient(tokenProvider);

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("Should return empty strings when user is not logged in", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(undefined);

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });

    it("Should return empty strings when login status is error", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        err(new SystemError("source", "name", "Failed to get status"))
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });

    it("Should return empty strings when user is not signed in", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "SignedOut",
          token: "token",
        } as any)
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });

    it("Should return empty strings when token is not available", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: signedIn,
          token: undefined,
          accountInfo: {
            unique_name: "test@example.com",
            tid: "test-tenant-id",
          },
        } as any)
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });

    it("Should return empty strings when accountInfo values are not strings", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: signedIn,
          token: "token",
          accountInfo: {
            unique_name: 123,
            tid: true,
          },
        } as any)
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });

    it("Should return values when all required info is available", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: signedIn,
          token: "token",
          accountInfo: {
            unique_name: "test@example.com",
            tid: "test-tenant-id",
          },
        } as any)
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["test@example.com", "test-tenant-id"]);
    });

    it("Should return empty strings when accountInfo is missing", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: signedIn,
          token: "token",
        } as any)
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });

    it("Should handle undefined values in accountInfo", async () => {
      vi.spyOn(tokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: signedIn,
          token: "token",
          accountInfo: {
            unique_name: undefined,
            tid: undefined,
          },
        } as any)
      );

      const result = await graphClient.getCurrentUserInfo();

      chai.expect(result).to.deep.equal(["", ""]);
    });
  });
});

describe("Teams app publish APIs", () => {
  const sandbox = vi;
  const tokenProvider = new MockedM365Provider();
  const graphClient = new GraphClient(tokenProvider);
  const fakeAxiosInstance = axios.create();

  beforeEach(() => {
    vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getStagedApp should return latest app definition", async () => {
    const response = {
      data: {
        value: [
          {
            id: "catalog-app-id",
            displayName: "App Name",
            appDefinitions: [
              {
                publishingState: "submitted",
                lastModifiedDateTime: "2026-04-08T10:00:00.000Z",
              },
              {
                publishingState: "published",
                lastModifiedDateTime: "2026-04-08T11:00:00.000Z",
              },
            ],
          },
        ],
      },
    };
    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response as any);

    const result = await graphClient.getStagedApp("token", "external-id");

    chai.expect(result?.teamsAppId).to.equal("catalog-app-id");
    chai.expect(result?.displayName).to.equal("App Name");
    chai.expect(result?.publishingState).to.equal("published");
  });

  it("getStagedApp should return undefined when app is not found", async () => {
    const response = { data: { value: [] } };
    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockResolvedValue(response as any);

    const result = await graphClient.getStagedApp("token", "external-id");

    chai.expect(result).to.be.undefined;
  });

  it("getStagedApp should return undefined when app definitions are empty", async () => {
    const response = {
      data: {
        value: [{ id: "catalog-app-id", displayName: "App Name", appDefinitions: [] }],
      },
    };
    const getStub = vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await graphClient.getStagedApp("token", "external-id");

    chai.expect(result).to.be.undefined;
    chai.expect(getStub.mock.calls.length === 1).to.be.true;
  });

  it("getStagedApp should return undefined when request throws", async () => {
    vi.spyOn(fakeAxiosInstance, "get").mockRejectedValue(new Error("network error"));
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await graphClient.getStagedApp("token", "external-id");

    chai.expect(result).to.be.undefined;
  });

  it("publishTeamsApp should return published app id", async () => {
    const response = { data: { id: "catalog-app-id" } };
    const postStub = vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));

    chai.expect(result).to.equal("catalog-app-id");
    chai.expect(postStub.mock.calls.length === 1).to.be.true;
    chai.expect(postStub.mock.calls[0][0]).to.contain("/appCatalogs/teamsApps?requiresReview=true");
  });

  it("publishTeamsApp should fallback to staged app id when response id is empty", async () => {
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({ data: {} } as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue({
      teamsAppId: "catalog-app-id",
      displayName: "App Name",
      publishingState: "published" as any,
      lastModifiedDateTime: null,
    });

    const result = await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));

    chai.expect(result).to.equal("catalog-app-id");
  });

  it("publishTeamsApp should throw when response id is empty and staged app is missing", async () => {
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({ data: {} } as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue(undefined);

    try {
      await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(Error);
      chai.expect(e.message).to.include("publishTeamsApp");
      chai.expect(e.message).to.include("empty response");
    }
  });

  it("publishTeamsApp should fallback to staged app on BadGateway in response body", async () => {
    const response = { data: { error: { code: "BadGateway" } } };
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue({
      teamsAppId: "catalog-app-id",
      displayName: "App Name",
      publishingState: "published" as any,
      lastModifiedDateTime: null,
    });

    const result = await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));

    chai.expect(result).to.equal("catalog-app-id");
  });

  it("publishTeamsApp should call update when response body contains AppDefinitionAlreadyExists", async () => {
    const response = {
      data: { error: { code: "Conflict", innerError: { code: "AppDefinitionAlreadyExists" } } },
    };
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());
    vi.spyOn(graphClient, "publishTeamsAppUpdate").mockResolvedValue("updated-id");

    const result = await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));

    chai.expect(result).to.equal("updated-id");
  });

  it("publishTeamsApp should call update on conflict", async () => {
    vi.spyOn(fakeAxiosInstance, "post").mockRejectedValue({ response: { status: 409 } });
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());
    vi.spyOn(graphClient, "publishTeamsAppUpdate").mockResolvedValue("updated-id");

    const result = await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));

    chai.expect(result).to.equal("updated-id");
  });

  it("publishTeamsApp should throw graph API error when response contains unexpected error", async () => {
    const response = { data: { error: { code: "Forbidden", message: "forbidden" } } };
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue(response as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await graphClient.publishTeamsApp("token", "external-id", Buffer.from("zip"));
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(Error);
      chai.expect(e.message).to.include("publishTeamsApp");
      chai.expect(e.message).to.include("forbidden");
    }
  });

  it("publishTeamsAppUpdate should post to appDefinitions with staged teamsAppId", async () => {
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue({
      teamsAppId: "catalog-app-id",
      displayName: "App Name",
      publishingState: "published" as any,
      lastModifiedDateTime: null,
    });
    const postStub = vi
      .spyOn(fakeAxiosInstance, "post")
      .mockResolvedValue({ data: { teamsAppId: "catalog-app-id" } } as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await graphClient.publishTeamsAppUpdate(
      "token",
      "external-id",
      Buffer.from("zip")
    );

    chai.expect(result).to.equal("catalog-app-id");
    chai.expect(postStub.mock.calls.length === 1).to.be.true;
    chai
      .expect(postStub.mock.calls[0][0])
      .to.contain("/appCatalogs/teamsApps/catalog-app-id/appDefinitions?requiresReview=true");
  });

  it("publishTeamsAppUpdate should return id when teamsAppId is missing", async () => {
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue({
      teamsAppId: "catalog-app-id",
      displayName: "App Name",
      publishingState: "published" as any,
      lastModifiedDateTime: null,
    });
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({ data: { id: "definition-id" } } as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await graphClient.publishTeamsAppUpdate(
      "token",
      "external-id",
      Buffer.from("zip")
    );

    chai.expect(result).to.equal("definition-id");
  });

  it("publishTeamsAppUpdate should fallback to staged teamsAppId when response ids are missing", async () => {
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue({
      teamsAppId: "catalog-app-id",
      displayName: "App Name",
      publishingState: "published" as any,
      lastModifiedDateTime: null,
    });
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({ data: {} } as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    const result = await graphClient.publishTeamsAppUpdate(
      "token",
      "external-id",
      Buffer.from("zip")
    );

    chai.expect(result).to.equal("catalog-app-id");
  });

  it("publishTeamsAppUpdate should throw graph API error when staged app does not exist", async () => {
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue(undefined);

    try {
      await graphClient.publishTeamsAppUpdate("token", "external-id", Buffer.from("zip"));
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(Error);
      chai.expect(e.message).to.include("publishTeamsAppUpdate");
      chai.expect(e.message).to.include("Published app does not exist");
    }
  });

  it("publishTeamsAppUpdate should throw graph API error when response has error", async () => {
    vi.spyOn(graphClient, "getStagedApp").mockResolvedValue({
      teamsAppId: "catalog-app-id",
      displayName: "App Name",
      publishingState: "published" as any,
      lastModifiedDateTime: null,
    });
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({
      data: { error: { message: "invalid package" } },
    } as any);
    vi.spyOn(RetryHandler, "Retry").mockImplementation(async (fn: any) => await fn());

    try {
      await graphClient.publishTeamsAppUpdate("token", "external-id", Buffer.from("zip"));
      chai.assert.fail("Should throw");
    } catch (e: any) {
      chai.expect(e).to.be.instanceOf(Error);
      chai.expect(e.message).to.include("publishTeamsAppUpdate");
      chai.expect(e.message).to.include("invalid package");
    }
  });
});

describe("Sandbox related APIs", () => {
  const tokenProvider = new MockedM365Provider();
  const graphClient = new GraphClient(tokenProvider);
  const sandbox = vi;
  const fakeAxiosInstance = axios.create();

  beforeEach(() => {
    vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GetJoinedSandboxedTeamsAsync should return joined sandboxed teams", async () => {
    const mockResponse = {
      data: {
        value: [
          { id: "team1", displayName: "Team 1", description: "Description 1" },
          { id: "team2", displayName: "Team 2", description: "Description 2" },
        ],
      },
    };
    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

    const result = await graphClient.GetJoinedSandboxedTeamsAsync();
    chai.expect(result).equal(mockResponse.data.value);
  });

  it("GetChannelDeeplinkAsync should return channel deeplink", async () => {
    const teamId = "fake-team-id";
    const channelId = "fake-channel-id";
    const mockResponse = {
      data: {
        webUrl: "https://teams.microsoft.com/l/channel/fake-channel",
      },
    };
    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

    const result = await graphClient.GetChannelDeeplinkAsync(teamId, channelId);
    chai.expect(result).to.equal("https://teams.microsoft.com/l/channel/fake-channel");
  });

  it("InstallAppToChannelAsync should install app successfully", async () => {
    const teamId = "fake-team-id";
    const channelId = "fake-channel-id";
    const file = Buffer.from("fake-file-content");
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({ status: 200 });

    let error: any = undefined;
    try {
      await graphClient.InstallAppToChannelAsync(teamId, channelId, file);
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.be.undefined;
  });

  it("CreateTeamAndChannelAsync should create team and channel successfully", async () => {
    vi.useFakeTimers();
    const teamName = "Test Team";
    const description = "Test Description";
    const defaultChannelName = "General";
    const locationHeader =
      "/teams('dbd8de4f-5d47-48da-87f1-594bed003375')/operations('3a6fdce1-c261-48bc-89de-1cfef658c0d5')";
    const teamId = "dbd8de4f-5d47-48da-87f1-594bed003375";

    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue({
      headers: { location: locationHeader },
    });

    const statusStub = vi.spyOn(fakeAxiosInstance, "get");
    statusStub.mockResolvedValueOnce({ data: { status: "inProgress" } });
    statusStub.mockResolvedValueOnce({ data: { status: "succeeded" } });

    const channelsResponse = {
      data: {
        value: [{ id: "fake-channel-id", displayName: defaultChannelName }],
      },
    };
    statusStub.mockResolvedValueOnce(channelsResponse);

    const createPromise = graphClient.CreateTeamAndChannelAsync(
      teamName,
      description,
      defaultChannelName
    );
    await vi.advanceTimersByTimeAsync(5000);
    const result = await createPromise;

    chai.expect(result).to.deep.equal({
      teamId: teamId,
      channelId: "fake-channel-id",
    });
  });

  it("CreateChannelAsync should create a channel successfully", async () => {
    const teamId = "fake-team-id";
    const channelName = "Test Channel";
    const description = "Test Channel Description";

    const mockResponse = {
      data: {
        id: "fake-channel-id",
        webUrl: "https://teams.microsoft.com/l/channel/fake-channel-id",
      },
    };
    vi.spyOn(fakeAxiosInstance, "post").mockResolvedValue(mockResponse);

    const result = await graphClient.CreateChannelAsync(teamId, channelName, description);

    chai.expect(result).to.deep.equal({
      id: "fake-channel-id",
      webUrl: "https://teams.microsoft.com/l/channel/fake-channel-id",
    });
  });

  it("GetChannelsInTeamAsync should return channels in a team", async () => {
    const teamId = "fake-team-id";
    const mockResponse = {
      data: {
        value: [
          { id: "channel1", webUrl: "https://teams.microsoft.com/l/channel/channel1" },
          { id: "channel2", webUrl: "https://teams.microsoft.com/l/channel/channel2" },
        ],
      },
    };
    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

    const result = await graphClient.GetChannelsInTeamAsync(teamId);

    chai.expect(result).to.deep.equal(mockResponse.data.value);
  });

  it("GetTeamsAppSettingsAsync should return teams app settings", async () => {
    const mockResponse = {
      data: {
        sandboxingConfiguration: {
          sensitivityLabelUsedToIdentifySandboxedContainers: "0fcfd0ff-1cda-407e-bc2b-a350307bd1d5",
        },
      },
    };
    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

    const result = await graphClient.GetTeamsAppSettingsAsync();

    chai.expect(result).to.deep.equal(mockResponse.data);
  });

  it("GetAppInstallationForTeam should return installed apps successfully", async () => {
    const teamId = "fake-team-id";
    const mockResponse = {
      data: {
        value: [
          {
            id: "installation-id-1",
            teamsApp: {
              externalId: "app-external-id-1",
              displayName: "App 1",
            },
          },
          {
            id: "installation-id-2",
            teamsApp: {
              externalId: "app-external-id-2",
              displayName: "App 2",
            },
          },
        ],
      },
    };

    vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue(mockResponse);

    const result = await graphClient.GetAppInstallationForTeam(teamId);

    chai.expect(result).to.deep.equal(mockResponse.data.value);
  });

  it("DeleteInstalledApp should delete app installation successfully", async () => {
    const teamId = "fake-team-id";
    const installationId = "fake-installation-id";

    vi.spyOn(fakeAxiosInstance, "delete").mockResolvedValue({ status: 204 });

    let error: any = undefined;
    try {
      await graphClient.DeleteInstalledApp(teamId, installationId);
    } catch (e) {
      error = e;
    }

    chai.expect(error).to.be.undefined;
  });
});

describe("Sandbox related APIs - failed token", () => {
  const tokenProvider = new MockedM365Provider();
  const graphClient = new GraphClient(tokenProvider);
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(tokenProvider, "getAccessToken").mockResolvedValue(
      err(new SystemError("GraphClient", "TokenError", "Failed to get access token"))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GetJoinedSandboxedTeamsAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.GetJoinedSandboxedTeamsAsync();
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
    chai.expect(error.message).to.equal("Failed to get access token");
  });

  it("GetChannelDeeplinkAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.GetChannelDeeplinkAsync("fake-team-id", "fake-channel-id");
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("InstallAppToChannelAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.InstallAppToChannelAsync(
        "fake-team-id",
        "fake-channel-id",
        Buffer.from("fake-content")
      );
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("CreateTeamAndChannelAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.CreateTeamAndChannelAsync("Test Team", "Test Description", "General");
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("CreateChannelAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.CreateChannelAsync("fake-team-id", "Test Channel", "Test Description");
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("GetTeamsAppSettingsAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.GetTeamsAppSettingsAsync();
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("GetChannelsInTeamAsync failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.GetChannelsInTeamAsync("fake-team-id");
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("GetAppInstallationForTeam failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.GetAppInstallationForTeam("fake-team-id");
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });

  it("DeleteInstalledApp failed to get access token", async () => {
    let error: any = undefined;
    try {
      await graphClient.DeleteInstalledApp("fake-team-id", "installation-id");
    } catch (e) {
      error = e;
    }
    chai.expect(error).to.not.be.undefined;
    chai.expect(error.name).to.equal("TokenError");
  });
});
