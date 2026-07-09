// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { SystemError, err } from "@microsoft/teamsfx-api";
import axios, { AxiosInstance, isAxiosError } from "axios";
import MockAdapter from "axios-mock-adapter";
import axiosRetry from "axios-retry";
import { expect, vi } from "vitest";
import { AadAppClient } from "../../../../src/client/aadAppClient";
import {
  DeleteOrUpdatePermissionFailedError,
  HostNameNotOnVerifiedDomainError,
} from "../../../../src/component/driver/aad/error/aadManifestError";
import { ClientSecretNotAllowedError } from "../../../../src/component/driver/aad/error/clientSecretNotAllowedError";
import { CredentialInvalidLifetimeError } from "../../../../src/component/driver/aad/error/credentialInvalidLifetimeError";
import { SignInAudienceNotAllowedError } from "../../../../src/component/driver/aad/error/signInAudienceNotAllowedError";
import { AADManifest } from "../../../../src/component/driver/aad/interface/AADManifest";
import { SignInAudience } from "../../../../src/component/driver/aad/interface/signInAudience";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider } from "../../../plugins/solution/util";

describe("AadAppClient", async () => {
  const expectedObjectId = "00000000-0000-0000-0000-000000000000";
  const expectedDisplayName = "Microsoft Entra app name";
  const expectedSecretText = "fake secret";
  const mockedNetworkError = {
    message: "network error",
    code: "ECONNRESET",
  };

  describe("constructor", async () => {
    it("should success", async () => {
      const initializeAadAppClient = function () {
        new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
      };

      expect(initializeAadAppClient).to.not.throw();
    });
  });

  // uses create Microsoft Entra app function to test the default retry logic
  describe("internal http client", async () => {
    let aadAppClient: AadAppClient;

    beforeEach(() => {
      mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should throw error if cannot get token", async () => {
      const expectedError = new SystemError(
        "MockedTokenProvider",
        "GetTokenFailed",
        "Get token failed"
      );
      const mockedM365TokenProvider = new MockedM365Provider();
      const mockedLogProvider = new MockedLogProvider();
      vi.spyOn(mockedM365TokenProvider, "getAccessToken").mockResolvedValue(err(expectedError));
      const aadAppClient = new AadAppClient(mockedM365TokenProvider, mockedLogProvider);

      await expect(aadAppClient.createAadApp(expectedDisplayName)).rejects.toThrow(
        "Get token failed"
      );
    });

    // it("should retry when request failed with network error", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post("/applications")
    //     .replyWithError(mockedNetworkError);
    //   nock("https://graph.microsoft.com/v1.0").post("/applications").reply(201, {
    //     displayName: expectedDisplayName,
    //   });

    //   const result = await aadAppClient.createAadApp(expectedDisplayName);

    //   expect(result.displayName).equals(expectedDisplayName);
    // });

    // it("should retry when request failed with 5xx error", async () => {
    //   nock("https://graph.microsoft.com/v1.0").post("/applications").reply(500);
    //   nock("https://graph.microsoft.com/v1.0").post("/applications").reply(201, {
    //     displayName: expectedDisplayName,
    //   });

    //   const result = await aadAppClient.createAadApp(expectedDisplayName);

    //   expect(result.displayName).equals(expectedDisplayName);
    // });

    // it("should not retry when request failed with 4xx error", async () => {
    //   nock("https://graph.microsoft.com/v1.0").post("/applications").reply(400);
    //   nock("https://graph.microsoft.com/v1.0").post("/applications").reply(201, {
    //     displayName: expectedDisplayName,
    //   });
    // });
  });

  describe("createAadApp", async () => {
    let aadAppClient: AadAppClient;
    let axiosInstance: AxiosInstance;
    beforeEach(() => {
      axiosInstance = mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return app instance when request success", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply(201, {
        id: expectedObjectId,
        displayName: expectedDisplayName,
      });

      const createAadAppResult = await aadAppClient.createAadApp(expectedDisplayName);

      expect(createAadAppResult.displayName).to.equal(expectedDisplayName);
      expect(createAadAppResult.id).to.equal(expectedObjectId);
    });

    it("should throw error when request fail", async () => {
      const expectedError = {
        error: {
          code: "Request_BadRequest",
          message: "Invalid value specified for property 'displayName' of resource 'Application'.",
        },
      };
      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply(400, expectedError);

      const error: any = await aadAppClient.createAadApp("").catch((e) => e);
      expect(String(error.message)).to.contain("Request failed with status code 400");
      expect(error.response.data).to.deep.equal(expectedError);
    });

    it("should use input signInAudience", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply((config) => {
        const data = JSON.parse(config.data);
        return [
          201,
          {
            id: expectedObjectId,
            displayName: expectedDisplayName,
            signInAudience: data.signInAudience,
          },
        ];
      });

      const createAadAppResult = await aadAppClient.createAadApp(
        expectedDisplayName,
        SignInAudience.AzureADMultipleOrgs
      );

      expect(createAadAppResult.displayName).to.equal(expectedDisplayName);
      expect(createAadAppResult.id).to.equal(expectedObjectId);
      expect(createAadAppResult.signInAudience).to.equal("AzureADMultipleOrgs");
    });

    it("should use input serviceManagementReference", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply((config) => {
        const data = JSON.parse(config.data);
        expect(data.serviceManagementReference).to.equal("00000000-0000-0000-0000-000000000000");
        return [
          201,
          {
            id: expectedObjectId,
            displayName: data.displayName,
            signInAudience: data.signInAudience,
          },
        ];
      });

      const createAadAppResult = await aadAppClient.createAadApp(
        expectedDisplayName,
        SignInAudience.AzureADMultipleOrgs,
        "00000000-0000-0000-0000-000000000000"
      );

      expect(createAadAppResult.displayName).to.equal(expectedDisplayName);
      expect(createAadAppResult.id).to.equal(expectedObjectId);
      expect(createAadAppResult.signInAudience).to.equal("AzureADMultipleOrgs");
    });

    it("should send debug log when sending request and receiving response", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply(201, {
        id: expectedObjectId,
        displayName: expectedDisplayName,
      });
      const debugLogs: string[] = [];

      vi.spyOn(MockedLogProvider.prototype, "debug").mockImplementation((log: string) => {
        debugLogs.push(log);
      });

      const createAadResult = await aadAppClient.createAadApp(
        expectedDisplayName,
        SignInAudience.AzureADMultipleOrgs
      );
      expect(debugLogs.length).to.equal(2);
      expect(debugLogs[0].includes("Sending API request")).to.be.true;
      expect(debugLogs[1].includes("Received API response")).to.be.true;
    });

    it("should throw SignInAudienceNotAllowedError with proper help link for Microsoft user", async () => {
      const expectedError = {
        error: {
          code: "SignInAudienceNotAllowedAsPerAppPolicy",
          message:
            "The tenant admin has disabled creation of apps with multi-tenant sign-in audience",
        },
      };

      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply(400, expectedError);

      const err: any = await aadAppClient
        .createAadApp("test", SignInAudience.AzureADMultipleOrgs, undefined, true)
        .catch((e) => e);
      expect(err instanceof SignInAudienceNotAllowedError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("SignInAudienceNotAllowed");
      expect(err.message).equals(
        "Your tenant doesn't allow creating a Microsoft Entra app with specified signInAudience value. Error: The tenant admin has disabled creation of apps with multi-tenant sign-in audience."
      );
      expect(err.helpLink).equals("https://aka.ms/teams-toolkit-sni-guide");
    });

    it("should throw SignInAudienceNotAllowedError with default help link for non-Microsoft user", async () => {
      const expectedError = {
        error: {
          code: "SignInAudienceNotAllowedAsPerAppPolicy",
          message:
            "The tenant admin has disabled creation of apps with multi-tenant sign-in audience",
        },
      };

      const mock = new MockAdapter(axiosInstance);
      mock.onPost(`https://graph.microsoft.com/v1.0/applications`).reply(400, expectedError);

      const err: any = await aadAppClient
        .createAadApp("test", SignInAudience.AzureADMultipleOrgs, undefined, false)
        .catch((e) => e);
      expect(err instanceof SignInAudienceNotAllowedError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("SignInAudienceNotAllowed");
      expect(err.message).equals(
        "Your tenant doesn't allow creating a Microsoft Entra app with specified signInAudience value. Error: The tenant admin has disabled creation of apps with multi-tenant sign-in audience."
      );
      expect(err.helpLink).equals("https://aka.ms/teamsfx-actions/aadapp-create");
    });
  });

  describe("deleteAadApp", async () => {
    let aadAppClient: AadAppClient;
    let axiosInstance: AxiosInstance;
    beforeEach(() => {
      axiosInstance = mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock.onDelete(`https://graph.microsoft.com/v1.0/applications/test-id`).reply(200);
      await aadAppClient.deleteAadApp("test-id");
    });
  });

  describe("generateClientSecret", async () => {
    let aadAppClient: AadAppClient;
    let axiosInstance: AxiosInstance;

    beforeEach(() => {
      axiosInstance = mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return secret when request success", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply(200, {
          secretText: expectedSecretText,
        });

      const result = await aadAppClient.generateClientSecret(expectedObjectId);

      expect(result).to.equal(expectedSecretText);
    });

    it("should set secret lifetime and description based on user input", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply((config) => {
          const data = JSON.parse(config.data);
          expect(data.passwordCredential.endDateTime).to.not.be.undefined;
          expect(data.passwordCredential.startDateTime).to.not.be.undefined;
          expect(data.passwordCredential.displayName).to.equal("test description");

          const endDateTime = new Date(data.passwordCredential.endDateTime);
          const startDateTime = new Date(data.passwordCredential.startDateTime);
          const now = new Date();

          expect(startDateTime.getTime()).to.be.closeTo(now.getTime(), 1000); // Allow a 1 second difference

          expect(endDateTime.getTime() - startDateTime.getTime()).to.equal(
            90 * 24 * 60 * 60 * 1000
          );
          return [200, { secretText: expectedSecretText }];
        });

      await aadAppClient.generateClientSecret(expectedObjectId, 90, "test description");
    });

    it("should throw error when request fail", async () => {
      const expectedError = {
        error: {
          code: "Request_ResourceNotFound",
          message: `Resource '${expectedObjectId}' does not exist or one of its queried reference-property objects are not present.",`,
        },
      };

      // do not use nock to avoid retry
      vi.spyOn(axiosInstance, "post").mockRejectedValue({
        message: "Request failed with status code 404",
        response: {
          status: 400,
          data: expectedError,
        },
      });

      const error: any = await aadAppClient.generateClientSecret(expectedObjectId).catch((e) => e);
      expect(String(error.message)).to.contain("Request failed with status code 404");
      expect(error.response.data).to.deep.equal(expectedError);
    });

    it("should throw error when CredentialInvalidLifetimeAsPerAppPolicy error happens", async () => {
      const expectedError = {
        error: {
          code: "CredentialInvalidLifetimeAsPerAppPolicy",
        },
      };

      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply(400, expectedError);

      const err: any = await aadAppClient.generateClientSecret(expectedObjectId).catch((e) => e);
      expect(err instanceof CredentialInvalidLifetimeError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("CredentialInvalidLifetime");
      expect(err.message).equals(
        "The client secret lifetime is too long for your tenant. Use a shorter value with the clientSecretExpireDays parameter."
      );
      expect(err.helpLink).equals("https://aka.ms/teamsfx-actions/aadapp-create");
    });

    it("should throw error when CredentialTypeNotAllowedAsPerAppPolicy error happens", async () => {
      const expectedError = {
        error: {
          code: "CredentialTypeNotAllowedAsPerAppPolicy",
        },
      };

      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply(400, expectedError);

      const err: any = await aadAppClient.generateClientSecret(expectedObjectId).catch((e) => e);
      expect(err instanceof ClientSecretNotAllowedError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("ClientSecretNotAllowed");
      expect(err.message).equals(
        "Your tenant doesn't allow creating a client secret for Microsoft Entra app. Create and configure the app manually."
      );
      expect(err.helpLink).equals("https://aka.ms/teamsfx-actions/aadapp-create");
    });

    it("should throw ClientSecretNotAllowedError with proper help link when Microsoft user and CredentialTypeNotAllowedAsPerAppPolicy error happens", async () => {
      const expectedError = {
        error: {
          code: "CredentialTypeNotAllowedAsPerAppPolicy",
        },
      };

      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply(400, expectedError);

      const err: any = await aadAppClient
        .generateClientSecret(expectedObjectId, undefined, undefined, true)
        .catch((e) => e);
      expect(err instanceof ClientSecretNotAllowedError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("ClientSecretNotAllowed");
      expect(err.message).equals(
        "Your tenant doesn't allow creating a client secret for Microsoft Entra app. Create and configure the app manually."
      );
      expect(err.helpLink).equals("https://aka.ms/teams-toolkit-sni-guide");
    });

    it("should throw ClientSecretNotAllowedError with default help link when non-Microsoft user and CredentialTypeNotAllowedAsPerAppPolicy error happens", async () => {
      const expectedError = {
        error: {
          code: "CredentialTypeNotAllowedAsPerAppPolicy",
        },
      };

      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply(400, expectedError);

      const err: any = await aadAppClient
        .generateClientSecret(expectedObjectId, undefined, undefined, false)
        .catch((e) => e);
      expect(err instanceof ClientSecretNotAllowedError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("ClientSecretNotAllowed");
      expect(err.message).equals(
        "Your tenant doesn't allow creating a client secret for Microsoft Entra app. Create and configure the app manually."
      );
      expect(err.helpLink).equals("https://aka.ms/teamsfx-actions/aadapp-create");
    });

    it("should send debug log when sending request and receiving response", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/addPassword`)
        .reply(200, {
          secretText: expectedSecretText,
        });
      const debugLogs: string[] = [];

      vi.spyOn(MockedLogProvider.prototype, "debug").mockImplementation((log: string) => {
        debugLogs.push(log);
      });

      const createSecretResult = await aadAppClient.generateClientSecret(expectedObjectId);
      expect(debugLogs.length).to.equal(2);
      expect(debugLogs[0].includes("Sending API request")).to.be.true;
      expect(debugLogs[1].includes("Received API response")).to.be.true;
    });

    // generateClientSecret has different retry policy, need to test again
    // it("should retry when request failed with network error", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/addPassword`)
    //     .replyWithError(mockedNetworkError);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/addPassword`)
    //     .reply(200, {
    //       secretText: expectedSecretText,
    //     });

    //   const result = await aadAppClient.generateClientSecret(expectedObjectId);

    //   expect(result).equals(expectedSecretText);
    // });

    // generateClientSecret has different retry policy, need to test again
    // it("should retry when request failed with 5xx error", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/addPassword`)
    //     .reply(500);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/addPassword`)
    //     .reply(200, {
    //       secretText: expectedSecretText,
    //     });

    //   const result = await aadAppClient.generateClientSecret(expectedObjectId);

    //   expect(result).equals(expectedSecretText);
    // });

    // generateClientSecret has different retry policy, need to test again
    // it("should retry when request failed with 4xx error", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/addPassword`)
    //     .reply(404);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/addPassword`)
    //     .reply(200, {
    //       secretText: expectedSecretText,
    //     });

    //   const result = await aadAppClient.generateClientSecret(expectedObjectId);

    //   expect(result).equals(expectedSecretText);
    // });
  });

  describe("updateAadApp", async () => {
    let aadAppClient: AadAppClient;
    let axiosInstance: AxiosInstance;
    const mockedManifest: AADManifest = {
      id: expectedObjectId,
      name: "test",
      addIns: [],
      appRoles: [],
      identifierUris: [],
      informationalUrls: {},
      keyCredentials: [],
      knownClientApplications: [],
      oauth2AllowIdTokenImplicitFlow: false,
      oauth2AllowImplicitFlow: false,
      oauth2Permissions: [],
      preAuthorizedApplications: [],
      replyUrlsWithType: [],
      requiredResourceAccess: [],
      signInAudience: "",
      tags: [],
    };

    beforeEach(() => {
      axiosInstance = mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should success when request success", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPatch(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}`)
        .reply(204, "success");
      await aadAppClient.updateAadApp(mockedManifest);
    });

    it("should throw error when request failed with CannotDeleteOrUpdateEnabledEntitlement", async () => {
      const expectedError = {
        error: {
          code: "CannotDeleteOrUpdateEnabledEntitlement",
        },
      };

      vi.spyOn(axiosInstance, "patch").mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 400,
          data: expectedError,
        },
      });
      const err: any = await aadAppClient.updateAadApp(mockedManifest).catch((e) => e);
      expect(err instanceof DeleteOrUpdatePermissionFailedError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("DeleteOrUpdatePermissionFailed");
      expect(err.message).equals(
        "Unable to update or delete an enabled permission. It may be because the ACCESS_AS_USER_PERMISSION_ID environment variable is changed for selected environment. Make sure your permission id(s) match the actual Microsoft Entra application and try again.\n"
      );
    });

    it("should throw error when request failed with HostNameNotOnVerifiedDomain", async () => {
      const expectedError = {
        error: {
          code: "HostNameNotOnVerifiedDomain",
          message: "Mocked error message",
        },
      };

      vi.spyOn(axiosInstance, "patch").mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 400,
          data: expectedError,
        },
      });
      const err: any = await aadAppClient.updateAadApp(mockedManifest).catch((e) => e);
      expect(err instanceof HostNameNotOnVerifiedDomainError).to.be.true;
      expect(err.source).equals("AadAppClient");
      expect(err.name).equals("HostNameNotOnVerifiedDomain");
      expect(err.message).equals(
        "Unable to set identifierUri because the value is not on verified domain: Mocked error message"
      );
      expect(err.helpLink).equals("https://aka.ms/teamsfx-multi-tenant");
    });

    it("should throw error when request failed with no error property", async () => {
      const expectedError = {};

      vi.spyOn(axiosInstance, "patch").mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 400,
          data: expectedError,
        },
      });
      const err: any = await aadAppClient.updateAadApp(mockedManifest).catch((e) => e);
      expect(isAxiosError(err)).to.be.true;
    });

    it("should throw error when request fail", async () => {
      const expectedError = {
        error: {
          code: "Request_BadRequest",
          message: `Invalid value specified for property 'signInAudience' of resource 'Application'`,
        },
      };
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPatch(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}`)
        .reply(400, expectedError);

      const error: any = await aadAppClient.updateAadApp(mockedManifest).catch((e) => e);
      expect(String(error.message)).to.contain("Request failed with status code 400");
      expect(error.response.data).to.deep.equal(expectedError);
    });

    it("should send debug log when sending request and receiving response", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPatch(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}`)
        .reply(204, "success");
      const debugLogs: string[] = [];

      vi.spyOn(MockedLogProvider.prototype, "debug").mockImplementation((log: string) => {
        debugLogs.push(log);
      });

      const updateAadResult = await aadAppClient.updateAadApp(mockedManifest);
      expect(debugLogs.length).to.equal(2);
      expect(debugLogs[0].includes("Sending API request")).to.be.true;
      expect(debugLogs[1].includes("Received API response")).to.be.true;
    });

    // it("should retry when get 404 response", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .patch(`/applications/${expectedObjectId}`)
    //     .reply(404);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .patch(`/applications/${expectedObjectId}`)
    //     .reply(204);

    //   await expect(aadAppClient.updateAadApp(mockedManifest)).not.eventually.be.rejected;
    // });

    // it("should retry when get 400 response", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .patch(`/applications/${expectedObjectId}`)
    //     .reply(400);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .patch(`/applications/${expectedObjectId}`)
    //     .reply(204);

    //   await expect(aadAppClient.updateAadApp(mockedManifest)).not.eventually.be.rejected;
    // });
  });

  describe("getOwners", async () => {
    let aadAppClient: AadAppClient;
    let axiosInstance: AxiosInstance;

    beforeEach(() => {
      axiosInstance = mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return user info when request success", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onGet(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/owners`)
        .reply(200, {
          value: [
            {
              id: "id",
              displayName: "displayName",
              mail: "mail",
            },
          ],
        });
      const result = await aadAppClient.getOwners(expectedObjectId);

      expect(result).to.be.not.undefined;
      expect(result!.length).to.equal(1);
      expect(result![0].userObjectId).to.equal("id");
    });

    it("should throw error when request fail", async () => {
      const expectedError = {
        error: {
          code: "Request_ResourceNotFound",
          message: `Resource '${expectedObjectId}' does not exist or one of its queried reference-property objects are not present.",`,
        },
      };

      // do not use nock to avoid retry
      vi.spyOn(axiosInstance, "get").mockRejectedValue({
        message: "Request failed with status code 404",
        response: {
          status: 400,
          data: expectedError,
        },
      });

      const error: any = await aadAppClient.getOwners(expectedObjectId).catch((e) => e);
      expect(String(error.message)).to.contain("Request failed with status code 404");
      expect(error.response.data).to.deep.equal(expectedError);
    });

    it("should send debug log when sending request and receiving response", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onGet(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/owners`)
        .reply(200, {
          value: [
            {
              id: "id",
              displayName: "displayName",
              mail: "mail",
            },
          ],
        });
      const debugLogs: string[] = [];

      vi.spyOn(MockedLogProvider.prototype, "debug").mockImplementation((log: string) => {
        debugLogs.push(log);
      });

      const getOwnerResult = await aadAppClient.getOwners(expectedObjectId);
      expect(debugLogs.length).to.equal(2);
      expect(debugLogs[0].includes("Sending API request")).to.be.true;
      expect(debugLogs[1].includes("Received API response")).to.be.true;
    });

    // it("should retry when get 404 response", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .get(`/applications/${expectedObjectId}/owners`)
    //     .reply(404);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .get(`/applications/${expectedObjectId}/owners`)
    //     .reply(200, {
    //       value: [
    //         {
    //           id: "id",
    //           displayName: "displayName",
    //           mail: "mail",
    //         },
    //       ],
    //     });

    //   await expect(aadAppClient.getOwners(expectedObjectId)).not.eventually.be.rejected;
    // });
  });

  describe("addOwners", async () => {
    let aadAppClient: AadAppClient;
    let axiosInstance: AxiosInstance;
    const mockedUserObjectId = "userObjectId";

    beforeEach(() => {
      axiosInstance = mockAxiosCreate();
      doNotWaitBetweenEachRetry();
      aadAppClient = new AadAppClient(new MockedM365Provider(), new MockedLogProvider());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return user info when request success", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/owners/$ref`)
        .reply(200);

      await aadAppClient.addOwner(expectedObjectId, mockedUserObjectId);
    });

    it("should throw error when request fail", async () => {
      const expectedError = {
        error: {
          code: "Request_ResourceNotFound",
          message: `Resource '${expectedObjectId}' does not exist or one of its queried reference-property objects are not present.",`,
        },
      };

      // do not use nock to avoid retry
      vi.spyOn(axiosInstance, "post").mockRejectedValue({
        message: "Request failed with status code 404",
        response: {
          status: 400,
          data: expectedError,
        },
      });

      const error: any = await aadAppClient
        .addOwner(expectedObjectId, mockedUserObjectId)
        .catch((e) => e);
      expect(String(error.message)).to.contain("Request failed with status code 404");
      expect(error.response.data).to.deep.equal(expectedError);
    });

    it("should send debug log when sending request and receiving response", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/owners/$ref`)
        .reply(200);
      const debugLogs: string[] = [];

      vi.spyOn(MockedLogProvider.prototype, "debug").mockImplementation((log: string) => {
        debugLogs.push(log);
      });

      const addOwnerResult = await aadAppClient.addOwner(expectedObjectId, mockedUserObjectId);
      expect(debugLogs.length).to.equal(2);
      expect(debugLogs[0].includes("Sending API request")).to.be.true;
      expect(debugLogs[1].includes("Received API response")).to.be.true;
    });

    it("should not send debug log when log provider is undefined", async () => {
      const mock = new MockAdapter(axiosInstance);
      mock
        .onPost(`https://graph.microsoft.com/v1.0/applications/${expectedObjectId}/owners/$ref`)
        .reply(200);
      const debugLogs: string[] = [];

      const mockAadAppClient = new AadAppClient(new MockedM365Provider(), undefined);
      const addOwnerResult = await aadAppClient.addOwner(expectedObjectId, mockedUserObjectId);
      expect(debugLogs.length).to.equal(0);
    });

    // it("should retry when get 404 response", async () => {
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`applications/${expectedObjectId}/owners/$ref`)
    //     .reply(404);
    //   nock("https://graph.microsoft.com/v1.0")
    //     .post(`/applications/${expectedObjectId}/owners/$ref`)
    //     .reply(200);

    //   await expect(aadAppClient.addOwner(expectedObjectId, mockedUserObjectId)).to.eventually.be.not
    //     .rejected;
    // });
  });
});

function mockAxiosCreate() {
  const fakeAxiosInstance = axios.create({
    baseURL: "https://graph.microsoft.com/v1.0",
  });
  vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
  return fakeAxiosInstance;
}

function doNotWaitBetweenEachRetry() {
  vi.spyOn(axiosRetry, "exponentialDelay").mockReturnValue(0); // always delay 0 ms
}
